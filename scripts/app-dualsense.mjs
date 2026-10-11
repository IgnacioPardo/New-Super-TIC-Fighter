// Whole-app device and rendering exercise. Injected pads are not physical-hardware certification.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('tmp/qa',{recursive:true});
import {chromium} from '@playwright/test';
const base=process.env.STF_APP_URL??'http://127.0.0.1:5173';
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
  // Exercise the public input adapter in the live browser after a menu remap.
  // Whole-app movement, pause and reconnect checks below use the actual runtime.
  const adapter = await page.evaluate(async layout => {
   const {InputManager} = await import('/src/input.ts');
   const {DEFAULT_SETTINGS} = await import('/src/shared/defaults.ts');
   const manager = new InputManager({...DEFAULT_SETTINGS,gamepadBindings:{jump:3,special:2,pause:8}});
   const commands=[]; manager.subscribeMenu((command,source)=>commands.push([command,source]));
   const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
   const press = async index => {window.__pads[0].buttons[index].pressed=true;await wait(60);window.__pads[0].buttons[index].pressed=false;await wait(60);};
   await press(layout==='standard'?0:1); await press(layout==='standard'?1:2); await press(9);
   window.__pads[0].axes[0]=.8;window.__pads[0].axes[1]=.7;await wait(520);
   window.__pads[0].axes[0]=0;window.__pads[0].axes[1]=0;await wait(60);
   const status=manager.getControllerStatus();
   manager.setPlayers([{id:'qa',kind:'human',device:'gamepad:0'}]);manager.setSettings({...DEFAULT_SETTINGS,gamepadBindings:{}});manager.setMode('game');
   window.__pads[0].buttons[layout==='standard'?0:1].pressed=true;await wait(60);
   const gameplay=manager.poll(1)[0];
   const originalFocus=document.hasFocus.bind(document);document.hasFocus=()=>false;
   const unfocused=manager.poll(2)[0];await wait(60);document.hasFocus=()=>true;
   const recovered=manager.poll(3)[0];document.hasFocus=originalFocus;
   window.__pads[0].buttons[layout==='standard'?0:1].pressed=false;await wait(60);
   window.__blocked=true;const blocked=manager.getControllerStatus().blocked;
   manager.setPlayers([{id:'qa',kind:'human',device:'keyboard:0'}]);window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
   const keyboard=manager.poll(4)[0];window.__blocked=false;
   manager.destroy();return {commands,status,gameplay,unfocused,recovered,blocked,keyboard};

  },name);
  assert.deepEqual(adapter.commands.slice(0,3),[['confirm','gamepad'],['back','gamepad'],['pause','gamepad']],'Menu buttons remain fixed after combat remapping');
  assert(adapter.commands.filter(([command])=>command==='right').length>=2,'Held dominant stick direction repeats');
  assert(!adapter.commands.some(([command])=>command==='down'),'Diagonal stick emits one dominant direction');
  assert.equal(adapter.status.controllers[0].label,'DualSense');assert.equal(adapter.status.controllers[0].lastInput,'right');
  assert(adapter.gameplay.jump && !adapter.unfocused.jump && adapter.recovered.jump,'Partial bindings and recovered focus produce gameplay input safely');
  assert(adapter.blocked && adapter.keyboard.jump,'Blocked Gamepad API leaves keyboard input working');
  await page.reload();
  await page.getByTestId('mode-practice').or(page.getByRole('button',{name:/03.*PRÁCTICA/})).click();
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
