// Actual local worker gameplay through the complete UI; no snapshot or results are fabricated.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {enterTitle} from './enter-title.mjs';
await mkdir('tmp/qa',{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 Object.defineProperty(navigator,'getGamepads',{value:()=>[]});
 localStorage.setItem('stf-settings',JSON.stringify({language:'en',reducedMotion:true}));
 localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',bestOf:3,lives:1}));
 const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='snapshot') window.__snapshot=event.data.snapshot;});}};
});
try {
 await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:5174');await enterTitle(page);await page.getByTestId('mode-solo').click();
 await page.getByRole('button',{name:/12 Challenges/}).click();await page.getByRole('button',{name:/01 Second wind/}).click();
 for(const ready of await page.locator('.ready-button:not(:disabled)').all()) await ready.click();await page.locator('.fight-button').click();await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
 for(let attempt=0;attempt<3;attempt++) {
  await page.waitForFunction(()=>window.__snapshot?.fighters.find(f=>f.id==='p1')?.grounded);
  await page.keyboard.down('w');await page.waitForTimeout(180);await page.keyboard.up('w');await page.waitForTimeout(130);
  await page.keyboard.down('w');await page.waitForTimeout(180);await page.keyboard.up('w');
  await page.waitForFunction(()=>window.__snapshot?.fighters.find(f=>f.id==='p1')?.grounded,{},{timeout:5000});await page.waitForTimeout(150);
 }
 await expect(page.getByRole('dialog')).toContainText('Cleared!');assert.equal(await page.locator('.results-screen').count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('stf-progress:guest')).completedChallenges.includes('challenge-1')),true);
 await page.screenshot({path:'tmp/qa/v2-challenge-1-cleared.png',fullPage:true});await page.getByRole('button',{name:'Back to modes',exact:true}).click();
 await page.getByRole('button',{name:/LAB Training/}).click();await page.locator('.fight-button').click();await page.waitForFunction(()=>window.__snapshot?.phase==='playing'&&window.__snapshot.config.practice===true);
 await page.getByRole('button',{name:'Record dummy',exact:true}).click();await page.waitForFunction(()=>window.__snapshot.training.recording);await page.keyboard.down('d');await page.waitForTimeout(400);await page.keyboard.up('d');await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.waitForFunction(()=>!window.__snapshot.training.recording&&window.__snapshot.training.dummyRecording.length>10);
 await page.getByRole('button',{name:'Play dummy',exact:true}).click();await page.waitForFunction(()=>window.__snapshot.training.playback);await page.locator('.match-topbar button').click();await page.waitForFunction(()=>window.__snapshot.phase==='paused');
 const tick=await page.evaluate(()=>window.__snapshot.tick);await page.getByRole('dialog').getByRole('button',{name:'Advance one frame',exact:true}).click();await page.waitForFunction(before=>window.__snapshot.tick>before,tick);assert.equal(await page.evaluate(()=>window.__snapshot.phase),'paused');
 await page.getByRole('dialog').getByRole('button',{name:'Reset damage',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'BACK TO LOBBY',exact:true}).click();
 await page.locator('.brand-button').click();await page.getByTestId('mode-local').click();
 for(const ready of await page.locator('.ready-button:not(:disabled)').all()) await ready.click();await page.locator('.fight-button').click();
 for(let bout=0;bout<2;bout++) {
  await page.waitForFunction(()=>window.__snapshot?.phase==='playing');const matchId=await page.evaluate(()=>window.__snapshot.matchId);
  await page.keyboard.down('d');await page.waitForFunction(()=>window.__snapshot?.phase==='finished',null,{timeout:15000});await page.keyboard.up('d');await page.locator('.results-screen').waitFor();
  if(bout===0) {await expect(page.locator('.set-score')).toContainText('Bout 2 / 3');await page.getByRole('button',{name:/^NEXT BOUT/}).click();await page.waitForFunction(id=>window.__snapshot?.matchId!==id,matchId);}
 }
 await expect(page.locator('.set-score')).toContainText('Set complete');await expect(page.locator('.set-score b').nth(1)).toHaveText('2');
 await page.screenshot({path:'tmp/qa/v2-best-of-set.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Actual worker challenge-1 three double-jumps/landings, persistent progress, training record/playback/frame/reset, and two-bout majority best-of-three passed.');
} catch(error) {console.log((await page.locator('body').innerText()).slice(-3000));await page.screenshot({path:'tmp/qa/v2-solo-failure.png',fullPage:true});throw error;} finally {await browser.close();}
