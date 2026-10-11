// Real application Royale camera playthrough; saved selections, no seeded combat.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { enterTitle } from './enter-title.mjs';
const base = process.env.STF_APP_URL ?? 'http://127.0.0.1:5173';
const output = process.env.STF_QA_OUTPUT ?? 'tmp/qa/royale-camera';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('pageerror', (error) => errors.push(error.message));
const kits = ['code', 'robotics', 'iot', 'vr', 'games', 'printing', 'networks', 'ai'];
try {
  await page.addInitScript((kits) => {
    localStorage.setItem(
      'stf-match',
      JSON.stringify({
        ruleset: 'expanded',
        gameMode: 'royale',
        bestOf: 1,
        arena: 'arcade',
        mode: 'ffa',
        items: false,
        hazards: true,
        lives: 1,
        timeLimit: 240,
        friendlyFire: false,
        practice: false,
        players: kits.map((discipline, index) => ({
          id: `p${index + 1}`,
          name: index ? `Opponent ${index + 1}` : 'Local fighter',
          discipline,
          appearance: { hair: index % 6, shirt: index % 6, pants: index % 6 },
          team: index % 2,
          kind: index ? 'bot' : 'human',
          difficulty: 'hard',
          device: index ? 'bot' : 'keyboard:0',
        })),
      }),
    );
    Object.defineProperty(navigator, 'getGamepads', { value: () => [] });
    const Worker = window.Worker;
    window.Worker = class extends Worker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (event) => {
          if (event.data?.snapshot) window.__stfSnapshot = event.data.snapshot;
        });
      }
    };
  }, kits);
  await page.goto(base);
  await enterTitle(page);
  await page.getByTestId('mode-local').click();
  const ready = page.locator('.fighter-card').getByRole('button', { name: 'Listo', exact: true });
  while (await ready.count()) await ready.first().click();
  await page.locator('.fight-button:not(:disabled)').click();
  await page.waitForFunction(() => window.__stfSnapshot?.phase === 'playing', null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__stfSnapshot.fighters.length), 8);
  await page.screenshot({ path: `${output}/eight-fighters-start.png` });
  await page.keyboard.down('d');
  await page.waitForTimeout(350);
  await page.keyboard.up('d');
  await page.keyboard.down('w');
  await page.waitForTimeout(70);
  await page.keyboard.up('w');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${output}/eight-fighters-camera.png` });
  const snapshot = await page.evaluate(() => window.__stfSnapshot);
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(snapshot.fighters.every((f) => Number.isFinite(f.x) && Number.isFinite(f.y)));
  const report = {
    environment: 'compiled application, real worker and Playwright keyboard input',
    mode: snapshot.config.gameMode,
    tick: snapshot.tick,
    fighters: snapshot.fighters.map(({ id, x, y, eliminated }) => ({
      id,
      x,
      y,
      eliminated,
    })),
    errors,
  };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
