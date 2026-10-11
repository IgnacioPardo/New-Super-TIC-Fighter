// Whole-app device and rendering exercise. Injected pads are not physical-hardware certification.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('tmp/qa',{recursive:true});
import {chromium,firefox,webkit} from '@playwright/test';
const base=process.env.STF_APP_URL??'http://127.0.0.1:5173';
const engines=process.env.STF_BROWSERS?.split(',')??['chromium','firefox','webkit'];
for(const name of engines){
 const browser=await ({chromium,firefox,webkit}[name]).launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='snapshot')window.__snapshot=event.data.snapshot;});}};
  window.__pads=[{id:'QA Xbox-compatible virtual pad',index:0,connected:true,mapping:'standard',timestamp:0,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))}];
  Object.defineProperty(navigator,'getGamepads',{value:()=>window.__pads});
 });
 try{
  await page.goto(base);await page.getByTestId('mode-practice').or(page.getByRole('button',{name:/03.*PRÁCTICA/})).click();
  const card=page.locator('.fighter-card').first();
  const details=card.locator('details.fighter-options');if(await details.count())await details.locator('summary').click();
  await card.locator('select').filter({has:page.locator('option[value="gamepad:0"]')}).selectOption('gamepad:0');
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
