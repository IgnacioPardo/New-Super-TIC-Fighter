import { enterTitle } from './enter-title.mjs';
// Real complete-app regression: UI setup -> native worker result -> title -> settings/guide.
// No simulation adapter, fabricated snapshot, or direct simulation command.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 Object.defineProperty(navigator, 'getGamepads', { value: () => [] });
 const NativeWorker=window.Worker;
 window.Worker=class extends NativeWorker {
  constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='snapshot')window.__resultSnapshot=event.data.snapshot;});}
 };
});
try {
 await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:4173');
 await enterTitle(page);
 await page.getByTestId('mode-local').click();
 await page.locator('.rule-pair select').first().selectOption('1');
 for(const button of await page.locator('.ready-button:not(:disabled)').all())await button.click();
 await page.locator('.fight-button').click();
 await page.waitForFunction(()=>window.__resultSnapshot?.phase==='playing',null,{timeout:15000});
 await page.keyboard.down('d');
 await page.waitForFunction(()=>window.__resultSnapshot?.phase==='finished',null,{timeout:15000});
 await page.keyboard.up('d');
 await page.locator('.results-screen').waitFor();
 assert.equal(await page.evaluate(()=>window.__resultSnapshot.result.reason),'last-standing');
 await page.locator('.brand-button').click();
 await page.getByTestId('mode-settings').click();
 await page.locator('.settings-panel').waitFor();
 await page.waitForTimeout(600);
 assert.equal(await page.locator('.settings-panel').count(),1);
 assert.equal(await page.locator('.results-screen').count(),0);
 await page.locator('.back-button').click();
 await page.getByTestId('mode-guide').click();
 await page.waitForTimeout(600);
 assert.equal(await page.locator('.app.screen-guide').count(),1);
 assert.equal(await page.locator('.results-screen').count(),0);
 assert.deepEqual(errors,[]);
 console.log('Real worker last-standing result -> brand/title -> Settings and Guide remain open; no browser errors.');
} finally {await browser.close();}
