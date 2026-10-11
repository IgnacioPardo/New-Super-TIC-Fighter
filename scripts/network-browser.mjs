// Chromium transport exercise against the full local Worker.
import assert from 'node:assert/strict';
import { readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const base = process.env.STF_SERVER_URL ?? 'http://127.0.0.1:8787';
const esbuildDir = (await readdir('node_modules/.pnpm')).find(name => name.startsWith('esbuild@'));
if (!esbuildDir) throw new Error('The Vite toolchain does not contain esbuild.');
const { build } = await import(pathToFileURL(resolve('node_modules/.pnpm', esbuildDir, 'node_modules/esbuild/lib/main.js')).href);
let browser;
let hostPage;
let guestPage;

try {
  await mkdir('dist', { recursive: true });
  await build({ entryPoints: ['src/network/RoomClient.ts'], bundle: true, format: 'esm', platform: 'browser', outfile: 'dist/network-client.js' });
  await writeFile('dist/network-test.html', '<!doctype html><title>Network browser flow</title>');
  browser = await chromium.launch({ headless: true });
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  hostPage = await hostContext.newPage();
  guestPage = await guestContext.newPage();
  await Promise.all([hostPage.goto(`${base}/network-test.html`), guestPage.goto(`${base}/network-test.html`)]);
  const created = await hostPage.evaluate(async () => {
    const { RoomClient } = await import('/network-client.js');
    window.events = [];
    window.client = new RoomClient({ onRoomState: state => window.events.push({ type: 'room', state }), onInput: (from, frames) => window.events.push({ type: 'input', from, frames }), onPause: reason => window.events.push({ type: 'pause', reason }), onResume: resumeAt => window.events.push({ type: 'resume', resumeAt }), onStatus: status => window.events.push({ type: 'status', status }), onError: (code, message) => window.events.push({ type: 'error', code, message }) });
    return window.client.create();
  });
  const joined = await guestPage.evaluate(async code => {
    const { RoomClient } = await import('/network-client.js');
    window.events = [];
    window.client = new RoomClient({ onRoomState: state => window.events.push({ type: 'room', state }), onSnapshot: snapshot => window.events.push({ type: 'snapshot', snapshot }), onPause: reason => window.events.push({ type: 'pause', reason }), onResume: resumeAt => window.events.push({ type: 'resume', resumeAt }), onStatus: status => window.events.push({ type: 'status', status }) });
    return window.client.join(code);
  }, created.code);

  await guestPage.waitForFunction(() => window.events.some(event => event.type === 'status' && event.status.route === 'direct'), { timeout: 10_000 });
  const hostSeats = [{ id: 'host1', name: 'Host', peerId: created.peerId, discipline: 'code', appearance: { hair: 0, shirt: 0, pants: 0 }, team: 0, kind: 'human', device: 'keyboard:0' }];
  const guestSeats = [{ id: 'guest1', name: 'Guest', peerId: joined.peerId, discipline: 'hardware', appearance: { hair: 0, shirt: 1, pants: 0 }, team: 1, kind: 'human', device: 'keyboard:0' }];
  await hostPage.evaluate(seats => window.client.setSeats(seats), hostSeats);
  await guestPage.evaluate(seats => window.client.setSeats(seats), guestSeats);
  await hostPage.waitForFunction(() => window.client.state.players.length === 2);
  await hostPage.evaluate(players => window.client.setConfig({ ...window.client.state.config, players, timeLimit: 240 }), [...hostSeats, ...guestSeats]);
  await hostPage.waitForFunction(() => window.client.state.config.timeLimit === 240);
  await Promise.all([hostPage.evaluate(() => window.client.setReady(true)), guestPage.evaluate(() => window.client.setReady(true))]);
  await hostPage.waitForFunction(() => window.client.state.readiness[window.client.state.peers.find(peer => !peer.isHost).peerId]?.ready);
  await hostPage.evaluate(() => window.client.start());
  await hostPage.waitForFunction(() => !!window.client.state.matchId);
  await guestPage.waitForFunction(() => !!window.client.state.matchId);
  const matchId = await hostPage.evaluate(() => window.client.state.matchId);

  await guestPage.evaluate(() => window.client.sendInputs([{ tick: 1, seatId: 'guest1', left: true, right: false, down: false, jump: false, punch: false, special: false, guard: false, combo: false }]));
  await hostPage.waitForFunction(() => window.events.some(event => event.type === 'input'));
  await hostPage.evaluate(() => {
    const snapshot = { matchId: window.client.state.matchId, tick: 1, elapsed: 0, phase: 'playing', countdown: 0, config: window.client.state.config, fighters: [], effects: [], events: [] };
    window.client.sendSnapshot(snapshot);
  });
  await guestPage.waitForFunction(() => window.events.some(event => event.type === 'snapshot'));
  assert.equal(await guestPage.evaluate(() => window.events.find(event => event.type === 'snapshot').snapshot.tick), 1);

  // Keep the direct data channels alive while one browser loses only its room WebSocket.
  await guestPage.evaluate(() => {
    window.savedOpenSocket = window.client.openSocket.bind(window.client);
    window.client.openSocket = () => {};
    const socket = window.client.socket;
    socket.close();
    socket.onclose(new CloseEvent('close'));
    clearTimeout(window.client.reconnectTimer);
  });
  await guestPage.waitForFunction(() => !window.client.socket);
  await guestPage.evaluate(() => window.client.pause('Guest requested pause'));
  await hostPage.waitForFunction(() => window.events.some(event => event.type === 'pause'));
  await guestPage.waitForFunction(() => window.events.some(event => event.type === 'pause'));
  await hostPage.evaluate(() => window.client.resume());
  await guestPage.waitForFunction(() => window.events.some(event => event.type === 'resume'), null, { timeout: 5000 }).catch(async error => {
    console.log('Host resume state:', await hostPage.evaluate(() => ({ phase: window.client.state.phase, peer: window.client.state.peers.find(peer => peer.peerId !== window.client.peerId), recent: window.events.slice(-5) })));
    console.log('Guest resume state:', await guestPage.evaluate(() => ({ phase: window.client.state.phase, link: window.client.links.get(window.client.state.hostPeerId)?.route, recent: window.events.slice(-5) })));
    throw error;
  });
  await guestPage.evaluate(code => window.savedOpenSocket(code), created.code);
  await guestPage.waitForFunction(() => window.client.socket?.readyState === WebSocket.OPEN && window.client.state.phase === 'playing');

  await guestPage.evaluate(() => window.client.setForcedRelay(true));
  await guestPage.waitForFunction(() => window.client.state.routes[window.client.peerId] === 'relay');
  await hostPage.evaluate(() => {
    const snapshot = { matchId: window.client.state.matchId, tick: 2, elapsed: 1 / 60, phase: 'playing', countdown: 0, config: window.client.state.config, fighters: [], effects: [], events: [] };
    window.client.sendSnapshot(snapshot);
  });
  await guestPage.waitForFunction(() => window.events.some(event => event.type === 'snapshot' && event.snapshot.tick === 2));
  console.log(`Browser room ${created.code}: direct WebRTC input/snapshot, simulated client signaling loss controls, and forced-relay recovery passed (${matchId}).`);
} finally {
  try {
    await Promise.all([hostPage ? hostPage.evaluate(() => window.client?.close()).catch(() => {}) : undefined, guestPage ? guestPage.evaluate(() => window.client?.close()).catch(() => {}) : undefined]);
    await browser?.close();
  } finally {
    await Promise.all([rm('dist/network-client.js', { force: true }), rm('dist/network-test.html', { force: true })]);
  }
}
