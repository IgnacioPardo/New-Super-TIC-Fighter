// Full local Worker + D1 + compiled browser application account exercise.
// Bootstrap identity/session and linked recovery provider are disposable fixtures.
// Passkey enrollment and later login execute real WebAuthn with virtual hardware.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { chromium, expect } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(resolve(tmpdir(), 'stf-account-qa-'));
const port = process.env.STF_ACCOUNT_PORT ? Number(process.env.STF_ACCOUNT_PORT) : await new Promise((done, fail) => {
  const socket = createServer();
  socket.once('error', fail);
  socket.listen(0, '127.0.0.1', () => { const free = socket.address().port; socket.close(() => done(free)); });
});
const origin = `http://localhost:${port}`;
const output = resolve(root, process.env.STF_QA_OUTPUT ?? 'tmp/qa/accounts');
const secret = randomBytes(32).toString('base64url');
const token = randomBytes(24).toString('base64url');
const userId = 'local-qa-account';
const configPath = resolve(temp, 'wrangler.json');
const envPath = resolve(temp, 'empty.env');
const persist = resolve(temp, 'state');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const report = {
  environment: 'isolated local workerd, disposable D1, compiled application, Playwright Chromium',
  identity: 'seeded local identity, session and Google recovery-provider row; no OAuth exchange',
  hardware: 'CDP virtual CTAP2 authenticator with resident credentials and user verification',
  passed: [], pageErrors: [],
};
let worker;
let browser;
let page;
let workerFailed = false;
const sqlString = value => `'${String(value).replaceAll("'", "''")}'`;
function run(args) {
  return new Promise((done, fail) => {
    const proc = spawn(process.execPath, [wrangler, ...args, '--config', configPath, '--env-file', envPath], {
      cwd: temp, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Never echo service output, fixture secrets, SQL sessions, or raw auth data.
    let diagnostics = '';
    proc.stdout.on('data', chunk => { diagnostics += chunk; });
    proc.stderr.on('data', chunk => { diagnostics += chunk; });
    proc.on('error', fail);
    proc.on('exit', code => code === 0 ? done(diagnostics) : fail(Error(`Local Wrangler operation ${args[0]} failed (${code})`)));
  });
}
async function profile() {
  const response = await page.request.get(`${origin}/api/profile`);
  assert.equal(response.status(), 200);
  return response.json();
}
async function postProfile(body, headers = {}) {
  return page.request.post(`${origin}/api/profile`, { headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, data: body });
}
async function waitProfile(check) {
  await expect.poll(async () => check(await profile()), { timeout: 10_000 }).toBe(true);
}
const guest = { version: 1, completedChallenges: ['challenge-2'], arcadeClears: 1, survivalBest: 4, matches: 10, wins: 4 };
const initial = { version: 1, completedChallenges: ['challenge-1'], arcadeClears: 0, survivalBest: 2, matches: 7, wins: 2 };
const couch = { version: 1, completedChallenges: ['challenge-12'], arcadeClears: 3, survivalBest: 9, matches: 99, wins: 80 };
try {
  await mkdir(output, { recursive: true });
  const config = JSON.parse((await readFile(resolve(root, 'wrangler.jsonc'), 'utf8')).replace(/^\s*\/\/.*$/gm, ''));
  config.name = 'stf-disposable-account-qa';
  config.main = resolve(root, 'server/worker.ts');
  config.assets.directory = resolve(root, 'dist');
  config.d1_databases = [{ binding: 'DB', database_name: 'stf-disposable-account-qa', database_id: '00000000-0000-0000-0000-000000000001' }];
  config.vars = { AUTH_SECRET: secret, AUTH_ORIGIN: origin };
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(envPath, '');
  const now = Date.now();
  const migration = await readFile(resolve(root, 'server/migrations/0001_profiles.sql'), 'utf8');
  const fixture = `${migration}\n
    INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (${sqlString(userId)},'Disposable QA','local-qa@example.invalid',1,${now},${now});
    INSERT INTO session (id,token,expires_at,user_id,created_at,updated_at) VALUES ('local-qa-session',${sqlString(token)},${now + 3600000},${sqlString(userId)},${now},${now});
    INSERT INTO account (id,account_id,provider_id,user_id,created_at,updated_at) VALUES ('local-qa-recovery','local-qa-provider','google',${sqlString(userId)},${now},${now});
    INSERT INTO profile (user_id,handle,cosmetic,local_progress,updated_at) VALUES (${sqlString(userId)},'Account Pilot','original',${sqlString(JSON.stringify(initial))},${now});
  `;
  await writeFile(resolve(temp, 'fixture.sql'), fixture);
  await run(['d1', 'execute', 'DB', '--local', '--persist-to', persist, '--file', resolve(temp, 'fixture.sql'), '--yes']);
  worker = spawn(process.execPath, [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0', '--persist-to', persist, '--config', configPath, '--env-file', envPath, '--log-level', 'error'], {
    cwd: temp, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: 'ignore', detached: true,
  });
  worker.on('exit', () => { workerFailed = true; });
  for (let tries = 0; ; tries++) {
    if (workerFailed || tries > 80) throw Error('Isolated account service did not start');
    try {
      if ((await fetch(`${origin}/api/health`)).ok && (await (await fetch(`${origin}/api/auth-config`)).json()).enabled) break;
    } catch { /* startup */ }
    await new Promise(done => setTimeout(done, 250));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.addInitScript(({ guest, couch }) => {
    if (!localStorage.getItem('account-qa-initialized')) {
      localStorage.setItem('account-qa-initialized', 'true');
      localStorage.setItem('stf-progress:guest', JSON.stringify(guest));
      localStorage.setItem('stf-progress:couch:p2', JSON.stringify(couch));
      localStorage.setItem('stf-name', 'Guest Pilot');
      localStorage.setItem('stf-settings', JSON.stringify({ language: 'en', reducedMotion: true }));
    }
  }, { guest, couch });
  await page.goto(`${origin}/?screen=profile`);
  await expect(page.getByRole('heading', { name: 'Local profile', exact: true })).toBeVisible();
  const authConfig = await (await page.request.get(`${origin}/api/auth-config`)).json();
  assert.deepEqual(authConfig, { enabled: true, google: false, github: false, passkey: true });
  assert.equal((await page.request.get(`${origin}/api/profile`)).status(), 401);
  assert.equal((await page.request.get(`${origin}/api/auth/passkey/generate-register-options`)).status(), 401);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Public name' }).fill('Guest Renamed');
  await page.getByRole('button', { name: 'Copper', exact: false }).click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('stf-name'))).toBe('Guest Renamed');
  report.passed.push('guest profile save and cosmetic selection without authentication', 'unauthenticated profile returns 401; unconfigured OAuth buttons remain disabled');

  const signed = encodeURIComponent(`${token}.${createHmac('sha256', secret).update(token).digest('base64')}`);
  await context.addCookies([{ name: 'better-auth.session_token', value: signed, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Account Pilot', exact: true })).toBeVisible();
  assert.deepEqual((await profile()).local, initial);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('stf-active-profile'))).toBe(userId);
  await page.getByRole('button', { name: 'Import guest progress' }).click();
  await waitProfile(p => p.local.completedChallenges.length === 2 && p.local.arcadeClears === 1 && p.local.survivalBest === 4);
  const imported = await profile();
  assert.deepEqual(imported.local, { ...guest, completedChallenges: ['challenge-1', 'challenge-2'] });
  await page.getByRole('button', { name: 'Import guest progress' }).click();
  await expect(page.getByRole('button', { name: 'Import guest progress' })).toBeEnabled();
  assert.deepEqual((await profile()).local, imported.local);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('stf-progress:guest'))), guest);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('stf-progress:couch:p2'))), couch);
  await page.getByRole('textbox', { name: 'Public name' }).fill('Passkey Pilot');
  await page.getByRole('button', { name: 'Copper', exact: false }).click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await waitProfile(p => p.handle === 'Passkey Pilot' && p.cosmetic === 'copper');
  report.passed.push('explicit guest-to-account union/max merge is idempotent and retains guest/couch stores', 'signed-in public name and unlocked cosmetic persist to D1');

  const earned = { ...imported.local, completedChallenges: ['challenge-1', 'challenge-2', 'challenge-3'], survivalBest: 5 };
  await page.evaluate(({ userId, earned }) => localStorage.setItem(`stf-progress:${userId}`, JSON.stringify(earned)), { userId, earned });
  await page.reload();
  await waitProfile(p => p.local.completedChallenges.length === 3 && p.local.survivalBest === 5);
  await expect(page.getByRole('button', { name: 'Neon', exact: false })).toBeEnabled();
  await page.getByRole('button', { name: 'Neon', exact: false }).click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await waitProfile(p => p.cosmetic === 'neon');
  report.passed.push('new device-local account progress synchronizes on profile refresh and unlocks/saves newly earned Neon at 600 XP');

  const denied = [];
  for (const [body, headers, status] of [
    [{ cosmetic: 'prism' }, {}, 400],
    [{ handle: 'bad-origin' }, { Origin: 'https://untrusted.invalid' }, 403],
    ['bad-json', { 'Content-Type': 'text/plain' }, 415],
    ['{broken', {}, 400],
    [{ handle: 'too-large', extra: 'x'.repeat(9000) }, {}, 413],
  ]) {
    const response = await postProfile(body, headers);
    assert.equal(response.status(), status);
    denied.push(status);
  }
  const forged = await postProfile({ verified: { matches: 900, wins: 900, xp: 999999 } });
  assert.equal(forged.status(), 200);
  assert.deepEqual((await forged.json()).verified, { matches: 0, wins: 0, xp: 0 });
  report.passed.push('server rejects locked cosmetic, foreign Origin, non-JSON, malformed and oversized writes', 'client cannot forge verified matches, wins or XP');
  report.rejectedStatuses = denied;

  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  await expect(page.getByRole('button', { name: 'Add passkey' })).toBeEnabled();
  await page.getByRole('button', { name: 'Add passkey' }).click();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(1, { timeout: 15000 });
  const credentials = (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
  assert.equal(credentials.length, 1);
  assert.equal(credentials[0].rpId, 'localhost');
  const initialCounter = credentials[0].signCount;
  await page.screenshot({ path: resolve(output, 'passkey-enrolled.png'), fullPage: true });
  report.passed.push('virtual WebAuthn enrollment persists a discoverable localhost credential and lists it in profile');

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Local profile', exact: true })).toBeVisible();
  assert.equal((await page.request.get(`${origin}/api/profile`)).status(), 401);
  assert.equal((await fetch(`${origin}/api/profile`, { headers: { Cookie: `better-auth.session_token=${signed}` } })).status, 401);
  assert.equal(await page.evaluate(() => localStorage.getItem('stf-active-profile')), null);
  await page.evaluate(id => localStorage.removeItem(`stf-progress:${id}`), userId);
  // No cookie injection after this point: the WebAuthn response must authenticate.
  await page.getByRole('button', { name: 'Sign in with passkey', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Passkey Pilot', exact: true })).toBeVisible({ timeout: 15000 });
  assert.equal((await profile()).cosmetic, 'neon');
  assert.deepEqual((await profile()).local, earned);
  const signedInCredentials = (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
  assert.ok(signedInCredentials[0].signCount > initialCounter);
  assert.equal(await page.evaluate(() => localStorage.getItem('stf-active-profile')), userId);
  await page.screenshot({ path: resolve(output, 'passkey-authenticated.png'), fullPage: true });
  report.passed.push('logout invalidates session; fresh virtual passkey assertion creates authenticated session and restores profile without account cache');
  report.authenticatorCounter = { before: initialCounter, after: signedInCredentials[0].signCount };

  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  const keys = await page.request.get(`${origin}/api/auth/passkey/list-user-passkeys`);
  assert.equal(keys.status(), 200);
  assert.deepEqual(await keys.json(), []);
  assert.deepEqual((await profile()).verified, { matches: 0, wins: 0, xp: 0 });
  assert.equal(report.pageErrors.length, 0, report.pageErrors.join('\n'));
  report.passed.push('passkey removal persists while linked recovery identity remains; local imports never increment verified stats', 'zero browser page errors');
  report.profile = { handle: (await profile()).handle, cosmetic: (await profile()).cosmetic, local: (await profile()).local, verified: (await profile()).verified };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (worker && !workerFailed) { try { process.kill(-worker.pid, 'SIGTERM'); } catch { worker.kill('SIGTERM'); } }
  if (worker && !workerFailed) await new Promise(done => { worker.once('exit', done); setTimeout(done, 3000); });
  await rm(temp, { recursive: true, force: true });
}
