// Full application online lifecycle through visible UI, real workers and room WebSockets.
// Run with the app preview on :4173 and Wrangler on :8787. Browser navigation
// closes the real room WebSocket; no game state or simulation output is fabricated.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { enterTitle, chooseMode } from './enter-title.mjs';

const base = process.env.STF_APP_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const sessions = [];
const errors = [];
await mkdir('tmp/qa', { recursive: true });

async function openSession(label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  await page.addInitScript(() => {
    window.__stfObserved = { rooms: [], controls: [], snapshots: 0, sockets: 0, lastInputSequence: 0 };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [] }); // Isolate keyboard flows from attached physical devices.
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        window.__stfObserved.sockets++;
        this.addEventListener('message', event => {
          const snapshot = event.data?.type === 'snapshot' ? event.data.snapshot : event.data;
          if (snapshot?.matchId && Array.isArray(snapshot.fighters)) {
            window.__stfSnapshot = snapshot;
            window.__stfObserved.snapshots++;
          }
        });
      }
    };
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      send(data) {
        if (typeof data === 'string') {
          try { const packet = JSON.parse(data); if (packet.type === 'input') window.__stfObserved.lastInputSequence = packet.sequence; } catch { /* only room JSON is observed */ }
        }
        return super.send(data);
      }
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          if (typeof event.data !== 'string') return;
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'room' || message.type === 'welcome') {
              window.__stfRoom = message.state;
              window.__stfObserved.rooms.push({ type: message.type, phase: message.state.phase, matchId: message.state.matchId, hostPeerId: message.state.hostPeerId, players: message.state.players.length, routes: message.state.routes });
              window.__stfObserved.rooms = window.__stfObserved.rooms.slice(-150);
            } else if (['start', 'pause', 'resume', 'result', 'forfeit', 'error'].includes(message.type)) {
              window.__stfObserved.controls.push(message);
              window.__stfObserved.controls = window.__stfObserved.controls.slice(-100);
            }
          } catch { /* non-JSON messages are outside the room protocol */ }
        });
      }
    };
  });
  sessions.push({ label, context, page });
  return sessions.at(-1);
}

async function onlineEntry(session, name, code) {
  const { page } = session;
  await page.goto(code ? `${base}/?room=${code}` : base);
  await openOnline(page);
  await page.getByPlaceholder('Jugador', { exact: true }).fill(name);
  if (code) await page.getByRole('button', { name: /ENTRAR/ }).click();
  else await page.getByRole('button', { name: /CREAR SALA/ }).click();
  await page.locator('.room-code strong').waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => !!window.__stfRoom?.peerId, null, { timeout: 15_000 });
  return page.locator('.room-code strong').innerText();
}

async function openOnline(page) {
  await enterTitle(page);
  await chooseMode(page, 'online');
}

async function openFighterOptions(card) {
  await card.locator('.fighter-edit').click();
  await card.getByRole('tab', { name: 'Jugador / Control' }).click();
}

async function waitRoster(page, count, predicate = () => true) {
  await page.waitForFunction(({ count }) => window.__stfRoom?.players.length === count, { count }, { timeout: 12_000 });
  await page.locator('.fighter-card').first().waitFor();
  const room = await page.evaluate(() => window.__stfRoom);
  assert(predicate(room), `Unexpected roster: ${JSON.stringify(room.players)}`);
  return room;
}

async function addHumanHost(host, count) {
  const { page } = host;
  await page.locator('.add-fighter').click();
  await waitRoster(page, count, room => room.players.at(-1).kind === 'bot');
  const card = page.locator('.fighter-card').last();
  await openFighterOptions(card);
  await page.getByRole('button', { name: 'Jugador: Bot', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(({ count }) => window.__stfRoom?.players.length === count && window.__stfRoom.players.at(-1).kind === 'human', { count }, { timeout: 12_000 });
}

async function ready(session, name) {
  for (const button of await session.page.locator('.ready-button:not(:disabled):not(.confirmed)').all()) await button.click();
  const localHumans = await session.page.evaluate(() => window.__stfRoom.players.filter(player => player.kind === 'human' && player.peerId === window.__stfRoom.peerId).length);
  await session.page.waitForFunction(() => window.__stfRoom?.readiness[window.__stfRoom.peerId]?.ready, null, { timeout: 20_000 });
  await session.page.waitForFunction(count => document.querySelectorAll('.ready-button.confirmed:not(:disabled)').length === count, localHumans, { timeout: 20_000 });
  assert.equal(await session.page.locator('.ready-button.confirmed:not(:disabled)').count(), localHumans, `${name}: every owned human must explicitly ready`);
}

async function startAndWait(host, others, expectedSeats) {
  await host.page.locator('.fight-button:not(:disabled)').waitFor({ timeout: 20_000 });
  await host.page.locator('.fight-button').click();
  for (const session of [host, ...others]) {
    await session.page.waitForFunction(expected => window.__stfSnapshot?.phase === 'playing' && window.__stfSnapshot.config.players.length === expected, expectedSeats, { timeout: 20_000 });
    assert.equal(await session.page.evaluate(() => window.__stfObserved.snapshots > 0), true);
  }
  const matchIds = await Promise.all([host, ...others].map(session => session.page.evaluate(() => window.__stfSnapshot.matchId)));
  assert.equal(new Set(matchIds).size, 1, 'Every browser must render the same live round');
  return matchIds[0];
}

async function scenarioTwoPlusTwo() {
  const host = await openSession('2+2 host');
  const guest = await openSession('2+2 guest');
  const code = await onlineEntry(host, 'Host A');
  assert.equal(await onlineEntry(guest, 'Guest A', code), code);
  await waitRoster(host.page, 2);
  await addHumanHost(host, 3);
  await guest.page.locator('.add-fighter').click();
  const room = await waitRoster(host.page, 4, state => state.players.filter(player => player.peerId === state.hostPeerId).length === 2);
  await waitRoster(guest.page, 4);
  assert.equal(room.players.filter(player => player.kind === 'human').length, 4);
  assert.equal(room.players.filter(player => player.peerId !== room.hostPeerId).length, 2);

  await host.page.locator('.match-summary').click();
  await host.page.getByRole('button', { name: /^Modo:/ }).click();
  await host.page.keyboard.press('Escape');
  await host.page.waitForFunction(() => window.__stfRoom?.config.mode === 'teams');
  const guestCard = guest.page.locator('.fighter-card').filter({ hasText: 'Guest A' });
  await openFighterOptions(guestCard);
  await guest.page.getByRole('button', { name: /^Equipo:/ }).click();
  await guest.page.keyboard.press('Escape');
  await host.page.waitForFunction(() => window.__stfRoom?.players.filter(player => player.team === 0).length === 2);
  const teams = await host.page.evaluate(() => window.__stfRoom.players.map(player => player.team));
  assert.deepEqual(teams.sort(), [0, 0, 1, 1]);
  await guest.page.locator('.room-quality input[type="checkbox"]').check();
  await guest.page.waitForFunction(() => window.__stfRoom?.routes[window.__stfRoom.peerId] === 'relay', null, { timeout: 10_000 });
  await ready(host, 'Host A');
  await ready(guest, 'Guest A');
  await startAndWait(host, [guest], 4);

  const guestSeat = await guest.page.evaluate(() => window.__stfRoom.players.find(player => player.name === 'Guest A').id);
  const before = await host.page.evaluate(id => window.__stfSnapshot.fighters.find(fighter => fighter.id === id).x, guestSeat);
  await guest.page.keyboard.down('d');
  await guest.page.waitForTimeout(500);
  await guest.page.keyboard.up('d');
  await host.page.waitForTimeout(150);
  const after = await host.page.evaluate(id => window.__stfSnapshot.fighters.find(fighter => fighter.id === id).x, guestSeat);
  assert(after > before + 30, `Forced-relay guest input did not move its fighter: ${before} -> ${after}`);
  await guest.page.waitForTimeout(3000); // build a real pre-reconnect input sequence
  const outboundBeforeRefresh = await guest.page.evaluate(() => window.__stfObserved.lastInputSequence);

  assert(await guest.page.evaluate(() => window.__stfObserved.sockets > 0), 'The page must open a real room WebSocket');
  const guestPeerId = await guest.page.evaluate(() => window.__stfRoom.peerId);
  await guest.page.goto('about:blank'); // closes the real socket but preserves this tab's reconnect credentials
  await host.page.waitForFunction(() => window.__stfSnapshot?.phase === 'paused', null, { timeout: 10_000 });
  await host.page.waitForFunction(peerId => window.__stfRoom?.peers.find(peer => peer.peerId === peerId)?.connected === false, guestPeerId, { timeout: 10_000 });
  await guest.page.goto(`${base}/?room=${code}`);
  await openOnline(guest.page);
  await guest.page.getByPlaceholder('Jugador', { exact: true }).fill('Guest A');
  await guest.page.getByRole('button', { name: /ENTRAR/ }).click();
  await guest.page.waitForFunction(peerId => window.__stfRoom?.peerId === peerId && window.__stfRoom?.phase === 'paused', guestPeerId, { timeout: 15_000 });
  assert.equal(await guest.page.evaluate(() => window.__stfRoom.peerId), guestPeerId, 'Reconnect must reclaim the same guest peer');
  await guest.page.waitForFunction(() => window.__stfRoom?.peers.find(peer => peer.peerId === window.__stfRoom.peerId)?.connected, null, { timeout: 15_000 });
  await host.page.waitForFunction(peerId => window.__stfRoom?.peers.find(peer => peer.peerId === peerId)?.connected, guestPeerId, { timeout: 15_000 });
  await guest.page.locator('.pause-panel').waitFor({ timeout: 10_000 });
  const resumeRequestedAt = Date.now();
  await host.page.getByRole('button', { name: /CONTINUAR/ }).click();
  await Promise.all([host, guest].map(session => session.page.waitForFunction(() => window.__stfSnapshot?.phase === 'playing', null, { timeout: 10_000 })));
  const resumeLatency = Date.now() - resumeRequestedAt;
  if (process.env.STF_REVIEW_RESUME) console.log(`Online resume reached both browsers in ${resumeLatency}ms after host click.`);
  const resumedX = await host.page.evaluate(id => window.__stfSnapshot.fighters.find(fighter => fighter.id === id).x, guestSeat);
  const acknowledgedBefore = await host.page.evaluate(id => window.__stfSnapshot.acknowledgedInputs?.find(input => input.seatId === id)?.tick ?? -1, guestSeat);
  await guest.page.keyboard.down('a');
  await guest.page.waitForTimeout(1200);
  await guest.page.keyboard.up('a');
  await host.page.waitForTimeout(150);
  const reclaimedX = await host.page.evaluate(id => window.__stfSnapshot.fighters.find(fighter => fighter.id === id).x, guestSeat);
  const acknowledgedAfter = await host.page.evaluate(id => window.__stfSnapshot.acknowledgedInputs?.find(input => input.seatId === id)?.tick ?? -1, guestSeat);
  if (process.env.STF_REVIEW_RESUME) console.log(`Reconnect input: pre-refresh WS sequence ${outboundBeforeRefresh}, authority ack ${acknowledgedBefore} -> ${acknowledgedAfter}, x ${resumedX} -> ${reclaimedX}`);
  assert(acknowledgedAfter > acknowledgedBefore, `Host did not consume post-reconnect guest input (ack ${acknowledgedBefore} -> ${acknowledgedAfter}, x ${resumedX} -> ${reclaimedX})`);
  console.log(`2+2 teams ${code}: four humans, forced relay movement, actual guest WebSocket fault, reconnect and resume passed.`);
}

async function scenarioTwoPlusOnePlusOne() {
  const host = await openSession('2+1+1 host');
  const guest1 = await openSession('2+1+1 guest 1');
  const guest2 = await openSession('2+1+1 guest 2');
  const code = await onlineEntry(host, 'Host B');
  await waitRoster(host.page, 1);
  await addHumanHost(host, 2);
  await onlineEntry(guest1, 'Guest B1', code);
  await onlineEntry(guest2, 'Guest B2', code);
  const room = await waitRoster(host.page, 4);
  assert.equal(room.players.filter(player => player.kind === 'human').length, 4, 'All four 2+1+1 seats must be human');
  assert.deepEqual(Object.values(Object.groupBy(room.players, player => player.peerId)).map(players => players.length).sort(), [1, 1, 2]);
  await Promise.all([ready(host, 'Host B'), ready(guest1, 'Guest B1'), ready(guest2, 'Guest B2')]);
  await startAndWait(host, [guest1, guest2], 4);

  await host.page.close(); // real host tab loss, including its authority Worker and transport
  for (const guest of [guest1, guest2]) {
    await guest.page.waitForFunction(() => window.__stfObserved.controls.some(message => message.type === 'result' && message.result?.reason === 'interrupted'), null, { timeout: 23_000 });
    await guest.page.waitForFunction(() => window.__stfRoom?.phase === 'lobby', null, { timeout: 23_000 });
    assert.equal(await guest.page.locator('.results-screen').filter({ hasText: /VICTORIA|VICTORY/ }).count(), 0, 'Host loss must never show a winner');
    if (await guest.page.locator('.results-screen').isVisible()) await guest.page.getByRole('button', { name: /VOLVER A LA SALA/ }).click();
    await guest.page.locator('.room-code strong').waitFor({ timeout: 8_000 });
    assert.equal(await guest.page.locator('.room-code strong').innerText(), code, 'Remaining guests must stay in the promoted lobby');
  }
  const newHost = await guest1.page.evaluate(() => window.__stfRoom.hostPeerId);
  assert.equal(newHost, await guest1.page.evaluate(() => window.__stfRoom.peerId), 'First remaining guest should host the new lobby');
  console.log(`2+1+1 ${code}: four human seats across three browsers, host tab loss, interrupted result and new lobby passed.`);
}

async function scenarioSurvival() {
 const host=await openSession('survival host'),guest=await openSession('survival guest');
 const code=await onlineEntry(host,'Coop A');await onlineEntry(guest,'Coop B',code);await waitRoster(host.page,2);
 await host.page.locator('.match-summary').click();await host.page.getByRole('button',{name:/^Objetivo:/}).focus();
 await host.page.keyboard.press('ArrowRight');await host.page.keyboard.press('ArrowRight');await host.page.keyboard.press('ArrowRight');
 assert.equal(await host.page.getByRole('button',{name:'Objetivo: Supervivencia',exact:true}).count(),1,'Rapid shared objective edits preserve the latest draft');await host.page.keyboard.press('Escape');
 await host.page.waitForFunction(()=>window.__stfRoom?.config.gameMode==='survival'&&window.__stfRoom.players.length===4);
 const roster=await host.page.evaluate(()=>window.__stfRoom.players);assert.equal(roster.filter(p=>p.kind==='human'&&p.team===0).length,2);assert.equal(roster.filter(p=>p.kind==='bot'&&p.team===1).length,2);
 await ready(host,'Coop A');await ready(guest,'Coop B');await startAndWait(host,[guest],4);
 for(const session of [host,guest]) {assert.equal(await session.page.evaluate(()=>window.__stfSnapshot.config.gameMode),'survival');assert.ok(await session.page.evaluate(()=>window.__stfSnapshot.objective.wave>=1));}
 console.log(`Private Survival ${code}: two browsers cooperated on team A, bot opponents filled four active seats, and the actual wave started.`);
}

async function scenarioBots() {
  const host = await openSession('bot host');
  const guest = await openSession('bot guest');
  const code = await onlineEntry(host, 'Host C');
  await onlineEntry(guest, 'Guest C', code);
  await waitRoster(host.page, 2);
  await host.page.locator('.add-fighter').click();
  await waitRoster(host.page, 3, room => room.players.filter(player => player.kind === 'bot').length === 1);
  await host.page.locator('.add-fighter').click();
  const room = await waitRoster(host.page, 4, state => state.players.filter(player => player.kind === 'bot').length === 2);
  assert.equal(room.players.filter(player => player.kind === 'bot').length, 2);
  await ready(host, 'Host C');
  await ready(guest, 'Guest C');
  await startAndWait(host, [guest], 4);
  assert.equal(await host.page.evaluate(() => window.__stfSnapshot.config.players.filter(player => player.kind === 'bot').length), 2);
  if (process.env.STF_REQUIRE_DIRECT) {
    await guest.page.waitForFunction(() => window.__stfRoom?.phase === 'playing' && window.__stfRoom.routes[window.__stfRoom.peerId] === 'direct', null, { timeout: 12_000 });
  }
  const route = await guest.page.evaluate(() => ({
    kind: window.__stfRoom.routes[window.__stfRoom.peerId],
    pingMs: window.__stfRoom.peers.find(peer => peer.peerId === window.__stfRoom.peerId)?.pingMs,
  }));
  console.log(`Bot room ${code}: two human browsers plus two bot seats entered a live Worker round; guest route ${route.kind}${route.pingMs === undefined ? '' : `, room ping ${route.pingMs} ms`}.`);
}

async function scenarioHostRefresh() {
  const host = await openSession('refresh host');
  const guest = await openSession('refresh guest');
  const code = await onlineEntry(host, 'Host R');
  await onlineEntry(guest, 'Guest R', code);
  await waitRoster(host.page, 2);
  await ready(host, 'Host R');
  await ready(guest, 'Guest R');
  await startAndWait(host, [guest], 2);
  const hostPeerId = await host.page.evaluate(() => window.__stfRoom.peerId);
  await host.page.goto('about:blank');
  await guest.page.waitForFunction(() => window.__stfRoom?.phase === 'paused', null, { timeout: 10_000 });
  await host.page.goto(`${base}/?room=${code}`);
  await openOnline(host.page);
  await host.page.getByPlaceholder('Jugador', { exact: true }).fill('Host R');
  await host.page.getByRole('button', { name: /ENTRAR/ }).click();
  await host.page.waitForFunction(peerId => window.__stfRoom?.peerId === peerId && window.__stfObserved.controls.some(message => message.type === 'result' && message.result?.reason === 'interrupted'), hostPeerId, { timeout: 10_000 });
  await guest.page.waitForFunction(() => window.__stfObserved.controls.some(message => message.type === 'result' && message.result?.reason === 'interrupted'), null, { timeout: 10_000 });
  await host.page.waitForFunction(() => window.__stfRoom?.phase === 'lobby', null, { timeout: 8_000 });
  assert.equal(await host.page.locator('.room-code strong').innerText(), code);
  // The interrupted result and fresh lobby can arrive in one render batch.
  // Both visible routes must recover the same room, without requiring a transient result screen.
  const returnToLobby = guest.page.getByRole('button', { name: /VOLVER A LA SALA/ });
  const guestRoomCode = guest.page.locator('.room-code strong');
  await returnToLobby.or(guestRoomCode).first().waitFor({ state: 'visible', timeout: 8_000 });
  if (await returnToLobby.isVisible()) await returnToLobby.click();
  await guestRoomCode.waitFor({ state: 'visible', timeout: 8_000 });
  assert.equal(await guestRoomCode.innerText(), code);
  console.log(`Host refresh ${code}: interrupted no-winner round returned to a playable lobby.`);
}

async function scenarioGuestFinishedLobby() {
  const host = await openSession('finished host');
  const guest = await openSession('finished guest');
  const code = await onlineEntry(host, 'Host F');
  await onlineEntry(guest, 'Guest F', code);
  await waitRoster(host.page, 2);
  await host.page.locator('.match-summary').click();
  await host.page.getByRole('button', { name: /^Vidas:/ }).focus();
  await host.page.keyboard.press('ArrowLeft');
  await host.page.keyboard.press('ArrowLeft');
  assert.equal(await host.page.getByRole('button', { name: 'Vidas: 1', exact: true }).count(), 1, 'Rapid arrow presses update the online editor before a room round trip');
  await host.page.keyboard.press('Escape');
  await host.page.waitForFunction(() => window.__stfRoom?.config.lives === 1);
  await ready(host, 'Host F');
  await ready(guest, 'Guest F');
  await startAndWait(host, [guest], 2);
  await guest.page.keyboard.down('d');
  await guest.page.waitForFunction(() => window.__stfRoom?.phase === 'finished', null, { timeout: 15_000 });
  await guest.page.keyboard.up('d');
  await guest.page.locator('.results-screen').waitFor({ timeout: 10_000 });
  const guestPeerId = await guest.page.evaluate(() => window.__stfRoom.peerId);
  assert.equal(await guest.page.getByRole('button', { name: /ESPERANDO AL ANFITRIÓN|WAITING FOR HOST/ }).isDisabled(), true, 'Guest should wait for host rematch before returning to setup');
  await host.page.locator('.results-screen').waitFor({ timeout: 10_000 });
  const hostFinal = await host.page.evaluate(() => window.__stfSnapshot);
  const guestResult = await guest.page.evaluate(() => window.__stfObserved.controls.findLast(message => message.type === 'result'));
  assert.equal(hostFinal.phase, 'finished');
  assert.equal(guestResult.snapshot?.phase, 'finished', 'Reliable result control must carry the final authoritative snapshot');
  assert.deepEqual(guestResult.result, hostFinal.result, 'Both browsers must receive the same winners');
  const outcome = fighters => fighters.map(({ id, lives, damage }) => ({ id, lives, damage }));
  assert.deepEqual(outcome(guestResult.snapshot.fighters), outcome(hostFinal.fighters), 'Guest must receive exact final fighter stocks and damage');
  assert.equal(await guest.page.locator('.result-scoreboard').innerText(), await host.page.locator('.result-scoreboard').innerText(), 'Both result screens must show identical stocks and damage');
  await guest.page.goto('about:blank');
  await guest.page.goto(`${base}/?room=${code}`);
  await openOnline(guest.page);
  await guest.page.getByPlaceholder('Jugador', { exact: true }).fill('Guest F');
  await guest.page.getByRole('button', { name: /ENTRAR/ }).click();
  await guest.page.waitForFunction(peerId => window.__stfRoom?.peerId === peerId && window.__stfObserved.controls.some(message => message.type === 'result' && message.snapshot?.phase === 'finished'), guestPeerId, { timeout: 10_000 });
  await guest.page.locator('.results-screen').waitFor({ timeout: 10_000 });
  assert.equal(await guest.page.locator('.result-scoreboard').innerText(), await host.page.locator('.result-scoreboard').innerText(), 'Refresh during results must restore the exact final scoreboard');
  await host.page.locator('.results-actions .primary-button').click();
  await guest.page.waitForFunction(() => window.__stfRoom?.phase === 'lobby', null, { timeout: 10_000 });
  if (await guest.page.locator('.results-screen').isVisible()) await guest.page.getByRole('button', { name: /VOLVER A LA SALA/ }).click();
  await guest.page.locator('.room-code strong').waitFor({ timeout: 8_000 });
  assert.equal(await guest.page.locator('.room-code strong').innerText(), code, 'Guest returning from results should remain in the same room');
  assert.equal(await guest.page.evaluate(() => window.__stfRoom.peerId), guestPeerId, 'Guest must retain its own seats through rematch');
  await guest.page.locator('.back-button').click();
  await guest.page.getByTestId('mode-local').click();
  await guest.page.locator('.fighter-card .ready-button').first().click();
  await guest.page.locator('.fighter-card .ready-button').last().click();
  await guest.page.locator('.fight-button:not(:disabled)').click();
  await guest.page.waitForFunction(previous => window.__stfSnapshot?.phase === 'playing' && window.__stfSnapshot.matchId !== previous, hostFinal.matchId, { timeout: 20_000 });
  const localBefore = await guest.page.evaluate(() => window.__stfSnapshot.fighters[0].x);
  await guest.page.keyboard.down('d');
  await guest.page.waitForTimeout(500);
  await guest.page.keyboard.up('d');
  const localAfter = await guest.page.evaluate(() => window.__stfSnapshot.fighters[0].x);
  assert(localAfter > localBefore + 30, `Local controls must work after leaving online: ${localBefore} -> ${localAfter}`);
  console.log(`Guest finish ${code}: exact result survived refresh, rematch kept the room, and local mode stayed playable.`);
}

try {
  const scenarios = {
    '2+2': scenarioTwoPlusTwo,
    '2+1+1': scenarioTwoPlusOnePlusOne,
    bots: scenarioBots,
    survival: scenarioSurvival,
    'host-refresh': scenarioHostRefresh,
    'guest-finished-lobby': scenarioGuestFinishedLobby,
  };
  const selected = process.env.STF_LIFECYCLE_SCENARIO;
  assert(!selected || selected in scenarios, `Unknown scenario: ${selected}`);
  for (const [name, run] of Object.entries(scenarios)) {
    if (!selected || selected === name) {
      const first = sessions.length;
      await run();
      await Promise.all(sessions.splice(first).map(session => session.context.close()));
    }
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Full application online lifecycle passed without page errors.');
} catch (error) {
  for (const session of sessions) {
    if (session.page.isClosed()) continue;
    const detail = await session.page.evaluate(() => ({
      room: window.__stfRoom && { code: window.__stfRoom.code, phase: window.__stfRoom.phase, peerId: window.__stfRoom.peerId, hostPeerId: window.__stfRoom.hostPeerId, peers: window.__stfRoom.peers, routes: window.__stfRoom.routes },
      snapshot: window.__stfSnapshot && { phase: window.__stfSnapshot.phase, tick: window.__stfSnapshot.tick, matchId: window.__stfSnapshot.matchId, result: window.__stfSnapshot.result },
      observed: window.__stfObserved && { sockets: window.__stfObserved.sockets, snapshots: window.__stfObserved.snapshots, rooms: window.__stfObserved.rooms.slice(-5), controls: window.__stfObserved.controls.slice(-5) },
    })).catch(() => null);
    console.log(`${session.label}:`, JSON.stringify(detail));
    console.log(`${session.label} body:`, (await session.page.locator('body').innerText().catch(() => '')).slice(-2500));
    await session.page.screenshot({ path: `tmp/qa/lifecycle-${session.label.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`, fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
