import { enterTitle } from './enter-title.mjs';
// Complete menu-to-match exercise with real Web Audio, workers and injected controller input.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1366,height:768}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 window.__pad={id:'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0,touched:false}))};
 Object.defineProperty(navigator,'getGamepads',{value:()=>[window.__pad]});
 const NativeWorker=window.Worker;
 window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='snapshot')window.__snapshot=event.data.snapshot;});}};
 window.__audioStarts=0;
 const start=AudioBufferSourceNode.prototype.start;
 AudioBufferSourceNode.prototype.start=function(...args){window.__audioStarts++;return start.apply(this,args);};
});
const press=async button=>{await page.evaluate(button=>{window.__pad.buttons[button]={pressed:true,value:1,touched:true};},button);await page.waitForTimeout(90);await page.evaluate(button=>{window.__pad.buttons[button]={pressed:false,value:0,touched:false};},button);await page.waitForTimeout(90);};
try{
 await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:4173');
 await enterTitle(page);
 await page.getByTestId('mode-local').focus();
 await page.locator('.hero-logo').click(); // Mouse modality must not make controller focus invisible.
 await page.getByTestId('mode-local').focus();
 await press(13);
 await expect(page.getByTestId('mode-online')).toBeFocused();
 assert.equal(await page.locator('.app').getAttribute('data-input'),'gamepad');
 assert.equal(await page.getByTestId('mode-online').locator('.menu-pointer').evaluate(el=>getComputedStyle(el).visibility),'visible');
 await press(13);
 await expect(page.getByTestId('mode-practice')).toBeFocused();
 await press(0);
 await page.locator('.fighter-device select').waitFor();
 assert.equal(await page.locator('.fighter-device select').first().inputValue(),'gamepad:0','Connected controller automatically owns the first practice fighter');
 await page.locator('.fight-button').focus();await press(0);
 await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
 const before=await page.evaluate(()=>window.__snapshot.fighters[0].x);
 await page.evaluate(()=>window.__pad.axes[0]=1);await page.waitForTimeout(250);await page.evaluate(()=>window.__pad.axes[0]=0);
 const after=await page.evaluate(()=>window.__snapshot.fighters[0].x);
 assert(after>before+30,'The assigned DualSense must move the real fighter');
 await press(9);await page.locator('.pause-panel').waitFor();
 await page.locator('.pause-panel .secondary-button').filter({hasText:'AJUSTES'}).focus();await press(0);
 await expect(page.locator('.controller-status')).toContainText('DualSense');
 await page.locator('.volume-field input').nth(1).focus();
 const volume=Number(await page.locator('.volume-field input').nth(1).inputValue());
 await press(14);
 assert(Number(await page.locator('.volume-field input').nth(1).inputValue())<volume,'Controller changes native range controls');
 await page.locator('.settings-panel select').focus();await press(15);
 assert.equal(await page.locator('.settings-panel select').inputValue(),'original','Controller changes native select controls');
 await press(1);await page.locator('.pause-panel').waitFor();
 await expect(page.locator('.pause-panel .primary-button')).toBeFocused();
 await press(0);await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
 assert((await page.evaluate(()=>window.__audioStarts))>5,'Actual interface/combat sources played through Web Audio');
 assert.deepEqual(errors,[]);
 console.log('DualSense menu focus, confirm/back, automatic fighter assignment, real movement/pause/resume, native settings and audible UI sources passed. Injected input does not certify physical hardware.');
}finally{await browser.close();}
