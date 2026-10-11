import { enterTitle, chooseMode } from './enter-title.mjs';
// Whole-app device and rendering exercise. Injected pads are not physical-hardware certification.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('tmp/qa',{recursive:true});
import {chromium} from '@playwright/test';
const base=process.env.STF_APP_URL??'http://127.0.0.1:4173';
const engines=['standard','mac-hid'];
for(const name of engines){
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(layout=>{
  const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='snapshot')window.__snapshot=event.data.snapshot;});}};
  window.__pads=[{id:'DualSense Wireless Controller (054c-0ce6)',index:0,connected:true,mapping:layout==='standard'?'standard':'',timestamp:0,axes:layout==='standard'?[0,0,0,0]:[0,0,0,-1,-1,0,0,0,0,9/7],buttons:Array.from({length:layout==='standard'?17:14},()=>({pressed:false,touched:false,value:0}))}];
  Object.defineProperty(navigator,'getGamepads',{value:()=>{if(window.__blocked)throw new DOMException('Blocked','SecurityError');return window.__pads;}});
 },name);
 try{
  await page.goto(base);
  await enterTitle(page);
  await chooseMode(page,'practice');
  await page.locator('.fighter-edit').first().click();
  await page.getByRole('tab',{name:'Controles'}).click();
  assert.match(await page.getByRole('button',{name:/^Control:/}).innerText(),/DualSense/,'Connected controller is assigned automatically');
  await page.keyboard.press('Escape');
  await page.locator('.fight-button').click();await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
  assert.equal(await page.locator('canvas').count(),1,'One live game canvas');
  await page.screenshot({path:`tmp/qa/${name}-classic.png`,fullPage:true});
  const before=await page.evaluate(()=>window.__snapshot.fighters[0].x);
  await page.evaluate(()=>window.__pads[0].axes[0]=.8);await page.waitForTimeout(400);await page.evaluate(()=>window.__pads[0].axes[0]=0);
  const after=await page.evaluate(()=>window.__snapshot.fighters[0].x);assert(after>before+40,'Gamepad stick moves the actual fighter');
  await page.evaluate(()=>window.__pads[0].buttons[9].pressed=true);await page.waitForFunction(()=>window.__snapshot?.phase==='paused');await page.evaluate(()=>window.__pads[0].buttons[9].pressed=false);
  const elapsed=await page.evaluate(()=>window.__snapshot.elapsed);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.__snapshot.elapsed),elapsed,'Pause freezes match time');
  await page.evaluate(()=>{window.__savedPad=window.__pads[0];window.__pads[0]=null;});await page.getByText('Mando desconectado',{exact:true}).waitFor();
  await page.evaluate(()=>{window.__pads[0]={...window.__savedPad,id:'A different controller'};});await page.waitForTimeout(800);await page.getByRole('button',{name:/CONTINUAR/}).click();
  assert.equal(await page.evaluate(()=>window.__snapshot.phase),'paused','A different pad cannot silently steal an assigned seat');
  await page.evaluate(()=>window.__pads[0]=window.__savedPad);await page.waitForTimeout(800);await page.getByRole('button',{name:/CONTINUAR/}).click();await page.waitForFunction(()=>window.__snapshot.phase==='playing');
  assert.deepEqual(errors,[]);console.log(`${name}: live canvas, virtual gamepad movement, pause and same-device reclaim passed.`);
 }catch(error){console.log(name,(await page.locator('body').innerText()).slice(-2000));await page.screenshot({path:`tmp/qa/${name}-device-failure.png`,fullPage:true});throw error;}finally{await browser.close();}
}
