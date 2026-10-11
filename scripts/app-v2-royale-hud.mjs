// Actual eight-fighter worker matches; saved setup preferences select the roster.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {enterTitle} from './enter-title.mjs';
await mkdir('tmp/qa',{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 for(const language of ['es','en'])for(const localCount of [1,4]) {
  const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({count,language})=>{
   Object.defineProperty(navigator,'getGamepads',{value:()=>[]});
   localStorage.setItem('stf-settings',JSON.stringify({language,reducedMotion:true}));
   localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',gameMode:'royale',bestOf:1,lives:1,timeLimit:180,players:Array.from({length:8},(_,index)=>({id:`p${index+1}`,name:index<count?`Local ${index+1}`:`Opponent ${index+1}`,discipline:['networks','design','code','hardware','ai','robotics','iot','vr'][index],appearance:{hair:index%4,shirt:index%4,pants:index%4},team:index%2,kind:index<count?'human':'bot',difficulty:'easy',device:index<count?`keyboard:${index}`:'bot'}))}));
   const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='snapshot')window.__snapshot=event.data.snapshot;});}};
  },{count:localCount,language});
  await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:5174');await enterTitle(page);await page.getByTestId('mode-local').click();
  for(const ready of await page.locator('.ready-button:not(:disabled)').all())await ready.click();await page.locator('.fight-button').click();
  await page.waitForFunction(()=>window.__snapshot?.phase==='playing'&&window.__snapshot.config.players.length===8);
  await expect(page.locator('.royale-local-roster .hud-fighter')).toHaveCount(localCount);await expect(page.locator('.royale-opponent-roster .hud-opponent')).toHaveCount(8-localCount);
  assert.equal(await page.locator('.hud-opponent .hud-resources').count(),0);
  const desktop=await page.locator('.royale-hud').boundingBox();assert.ok(desktop.height<=180,`Desktop HUD ${desktop.height}px exceeds 180px reserved area`);
  const innerOverflow=await page.locator('.royale-hud').evaluate(element=>[...element.querySelectorAll('.hud-details')].some(details=>details.scrollWidth>details.clientWidth));assert.equal(innerOverflow,false);
  await page.screenshot({path:`tmp/qa/v2-royale-${language}-${localCount}-local-desktop.png`});
  if(localCount===4) {
   await page.setViewportSize({width:1024,height:640});
   assert.ok((await page.locator('.royale-hud').boundingBox()).height<=180);
   assert.equal(await page.locator('.hud-resources').first().evaluate(element=>getComputedStyle(element).fontSize),'11px');
   assert.equal(await page.locator('.royale-local-roster').evaluate(element=>[...element.querySelectorAll('.hud-resources')].some(resources=>resources.getBoundingClientRect().bottom>resources.closest('.hud-fighter').getBoundingClientRect().bottom)),false);
   await page.screenshot({path:`tmp/qa/v2-royale-${language}-4-local-1024.png`});
  }
  if(localCount===1) {
   await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await expect(page.locator('.hud-opponent')).toHaveCount(7);await page.screenshot({path:`tmp/qa/v2-royale-${language}-1-local-mobile.png`});
  }
  assert.deepEqual(errors,[]);console.log(`${language}: actual eight-fighter Royale with ${localCount} local humans: ${desktop.height}px detailed local HUD and compact opponent roster passed.`);await context.close();
 }
} finally {await browser.close();}
