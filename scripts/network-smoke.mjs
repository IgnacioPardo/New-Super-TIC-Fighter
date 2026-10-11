// Full local Worker + Durable Object + WebSocket exercise. Run while Wrangler dev is serving :8787.
import assert from 'node:assert/strict';

const base = process.env.STF_SERVER_URL ?? 'http://127.0.0.1:8787';
const {protocolVersion,contentVersion}=await(await fetch(`${base}/api/health`)).json();
const sockets = [];

function seat(id, peerId, team) {
  return { id, peerId, name: id, discipline: 'code', appearance: { hair: 0, shirt: 0, pants: 0 }, team, kind: 'human', device: 'keyboard:0' };
}

function watch(ws) {
  const queue = [];
  const waiters = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const at = waiters.findIndex(waiter => waiter.predicate(message));
    if (at >= 0) waiters.splice(at, 1)[0].resolve(message);
    else queue.push(message);
  });
  return {
    next(predicate, timeoutMs = 3000) {
      const at = queue.findIndex(predicate);
      if (at >= 0) return Promise.resolve(queue.splice(at, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve: value => { clearTimeout(timer); resolve(value); } };
        const timer = setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error('Timed out waiting for room message')); }, timeoutMs);
        waiters.push(waiter);
      });
    },
  };
}

async function connect(code, credentials) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/rooms/${code}/ws`);
  sockets.push(ws);
  const stream = watch(ws);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.send(JSON.stringify({ type: 'hello', protocolVersion, contentVersion, ...credentials }));
  return { ws, stream, welcome: await stream.next(message => message.type === 'welcome') };
}

function send(connection, message) { connection.ws.send(JSON.stringify(message)); }
function next(connection, type, predicate = () => true, timeoutMs = 3000) { return connection.stream.next(message => message.type === type && predicate(message), timeoutMs).catch(() => { throw new Error(`Timed out waiting for ${type}`); }); }

try {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.protocolVersion, protocolVersion);
  const forbidden = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { Origin: 'https://not-this-game.example' } });
  assert.equal(forbidden.status, 403);

  const createdResponse = await fetch(`${base}/api/rooms`, { method: 'POST' });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.code, /^[A-Z2-9]{10}$/);
  const host = await connect(created.code, { hostToken: created.hostToken });
  const guest = await connect(created.code, {});
  assert.equal(host.welcome.peerId, host.welcome.state.hostPeerId);
  assert.notEqual(host.welcome.reconnectToken, created.hostToken);

  const hostSeats = [seat('h1', host.welcome.peerId, 0), seat('h2', host.welcome.peerId, 0)];
  const guestSeats = [seat('g1', guest.welcome.peerId, 1), seat('g2', guest.welcome.peerId, 1)];
  send(host, { type: 'seats', players: hostSeats });
  await next(host, 'room', message => message.state.players.length === 2);
  send(guest, { type: 'seats', players: guestSeats });
  await next(host, 'room', message => message.state.players.length === 4);
  send(host, { type: 'config', config: { mode: 'teams', arena: 'classic', lives: 3, timeLimit: 180, friendlyFire: false, practice: false, seed: 42, players: [...hostSeats, ...guestSeats] } });
  await next(host, 'room', message => message.state.config.mode === 'teams');
  send(host, { type: 'ready', ready: true, assetsReady: true });
  send(guest, { type: 'ready', ready: true, assetsReady: true });
  send(guest, { type: 'route', route: 'relay' });
  await next(host, 'room', message => message.state.readiness[guest.welcome.peerId]?.ready && message.state.routes[guest.welcome.peerId] === 'relay');
  send(host, { type: 'start' });
  const started = await next(host, 'start');
  await next(guest, 'start');
  assert.ok(started.matchId);

  const frame = { tick: 1, seatId: 'g1', left: true, right: false, down: false, jump: false, punch: false, special: false, guard: false, combo: false };
  send(guest, { type: 'input', matchId: started.matchId, sequence: 1, frames: [frame] });
  assert.equal((await next(host, 'input')).frames[0].seatId, 'g1');
  send(guest, { type: 'input', matchId: started.matchId, sequence: 2, frames: [{ ...frame, seatId: 'h1' }] });
  assert.equal((await next(guest, 'error', message => message.code === 'invalid_input')).code, 'invalid_input');
  send(guest, { type: 'snapshot', matchId: started.matchId, sequence: 1, snapshot: { matchId: started.matchId, tick: 1 }, acknowledgements: {}, targets: [host.welcome.peerId] });
  assert.equal((await next(guest, 'error', message => message.code === 'invalid_snapshot')).code, 'invalid_snapshot');
  const snapshot = { matchId: started.matchId, tick: 1, elapsed: 0, phase: 'playing', countdown: 0, config: started.config, fighters: [], effects: [], events: [] };
  send(host, { type: 'snapshot', matchId: started.matchId, sequence: 1, snapshot, acknowledgements: { [guest.welcome.peerId]: 1 }, targets: [guest.welcome.peerId] });
  assert.equal((await next(guest, 'snapshot')).snapshot.tick, 1);

  host.ws.close();
  await next(guest, 'pause');
  const recovered = await connect(created.code, { peerId: host.welcome.peerId, reconnectToken: host.welcome.reconnectToken });
  assert.equal(recovered.welcome.peerId, host.welcome.peerId);
  send(recovered, { type: 'resume' });
  const resumed = await next(guest, 'resume');
  assert.ok(resumed.resumeAt > Date.now());
  send(recovered, { type: 'result', result: { winners: ['g1', 'g2'], winningTeam: 1, reason: 'last-standing' } });
  assert.equal((await next(guest, 'result')).result.winningTeam, 1);
  send(recovered, { type: 'rematch' });
  const lobby = await next(guest, 'room', message => message.state.phase === 'lobby');
  assert.equal(lobby.state.readiness[guest.welcome.peerId].ready, false);
  send(recovered, { type: 'ready', ready: true, assetsReady: true });
  send(guest, { type: 'ready', ready: true, assetsReady: true });
  await next(recovered, 'room', message => message.state.readiness[guest.welcome.peerId]?.ready && message.state.readiness[host.welcome.peerId]?.ready);
  send(recovered, { type: 'start' });
  await next(guest, 'start');
  recovered.ws.close();
  await next(guest, 'pause');
  const interrupted = await next(guest, 'result', message => message.result.reason === 'interrupted', 20_000);
  assert.deepEqual(interrupted.result.winners, []);
  const migrated = await next(guest, 'room', message => message.state.phase === 'lobby' && message.state.hostPeerId === guest.welcome.peerId);
  assert.equal(migrated.state.hostPeerId, guest.welcome.peerId);

  // Simulate a signaling-only outage after both peers have reported a direct route.
  // Actual ICE and data channels are exercised separately by network-browser.mjs.
  const directCreated = await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json();
  const directHost = await connect(directCreated.code, { hostToken: directCreated.hostToken });
  const directGuest = await connect(directCreated.code, {});
  send(directHost, { type: 'seats', players: [seat('directHost', directHost.welcome.peerId, 0)] });
  send(directGuest, { type: 'seats', players: [seat('directGuest', directGuest.welcome.peerId, 1)] });
  await next(directHost, 'room', message => message.state.players.length === 2);
  send(directHost, { type: 'route', route: 'direct' });
  send(directGuest, { type: 'route', route: 'direct' });
  send(directHost, { type: 'ready', ready: true, assetsReady: true });
  send(directGuest, { type: 'ready', ready: true, assetsReady: true });
  await next(directHost, 'room', message => message.state.readiness[directHost.welcome.peerId]?.ready && message.state.readiness[directGuest.welcome.peerId]?.ready && message.state.routes[directGuest.welcome.peerId] === 'direct');
  send(directHost, { type: 'start' });
  const directRound = await next(directHost, 'start');
  directHost.ws.close();
  directGuest.ws.close();
  await new Promise(resolve => setTimeout(resolve, 16_000));
  const directRecovered = await connect(directCreated.code, { peerId: directHost.welcome.peerId, reconnectToken: directHost.welcome.reconnectToken });
  assert.equal(directRecovered.welcome.state.matchId, directRound.matchId);
  assert.equal(directRecovered.welcome.state.phase, 'playing');
  console.log(`Rooms ${created.code}/${directCreated.code}: relay authority, reconnect, rematch, host loss migration, and simulated direct-route signaling outage passed.`);
} finally {
  for (const ws of sockets) ws.close();
}
