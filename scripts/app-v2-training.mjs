// Actual worker Training commands and viewport checks; controller data is injected.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {enterTitle} from './enter-title.mjs';
await mkdir('tmp/qa',{recursive:true});
const browser=await chromium.launch({headless:true});
const visible=async(locator)=>{await expect(locator).toBeVisible();const box=await locator.boundingBox(),viewport=locator.page().viewportSize();assert.ok(box&&box.y>=0&&box.x>=0&&box.y+box.height<=viewport.height&&box.x+box.width<=viewport.width,'Control must actually fit inside the viewport');assert.equal(await locator.evaluate(element=>{const clip=element.closest('.training-content');if(!clip)return true;const box=element.getBoundingClientRect(),parent=clip.getBoundingClientRect();return box.top>=parent.top&&box.bottom<=parent.bottom;}),true,'Control must not be clipped inside the Training pane');};
try{
 for(const language of ['es','en']){
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(language=>{
   const pad={id:'Injected standard Training controller',index:0,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};window.__pad=pad;
   Object.defineProperty(navigator,'getGamepads',{value:()=>[window.__pad]});
   localStorage.setItem('stf-settings',JSON.stringify({language,reducedMotion:true}));
   localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded'}));
   const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='snapshot')window.__snapshot=event.data.snapshot;});}};
  },language);
  const es=language==='es',tools=es?'Herramientas de entrenamiento':'Training tools',setDamage=es?'Fijar daño':'Set damage',targetLabel=es?'Objetivo':'Target',apply=es?'Aplicar daño':'Apply damage';
  const pad=async(button)=>{await page.evaluate(button=>window.__pad.buttons[button].pressed=true,button);await page.waitForTimeout(130);await page.evaluate(button=>window.__pad.buttons[button].pressed=false,button);await page.waitForTimeout(180);};
  await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:5196');await enterTitle(page);await page.getByTestId('mode-solo').click();await page.getByRole('button',{name:es?/LAB Entrenamiento/:/LAB Training/}).click();await page.locator('.fight-button').click();await page.waitForFunction(()=>window.__snapshot?.phase==='playing'&&window.__snapshot.config.practice);
  const toggle=page.getByRole('button',{name:tools,exact:true});await visible(toggle);assert.equal(await page.locator('.training-toolbar:visible').count(),0);await toggle.click();
  const overlay=page.locator('.training-overlay');await visible(overlay);await visible(overlay.locator('.training-toolbar'));await visible(overlay.locator('.training-history'));
  const dummyId=await page.evaluate(()=>window.__snapshot.config.players.find(seat=>seat.kind==='bot').id);
  for(const value of [0,25,50,75])await overlay.getByRole('button',{name:`${setDamage}: ${value}%`,exact:true}).click();await overlay.getByRole('button',{name:apply,exact:true}).click();
  await page.waitForFunction(id=>window.__snapshot.fighters.find(fighter=>fighter.id===id).damage===100,dummyId);await expect(overlay.locator('.training-target-status')).toContainText('100%');
  await overlay.getByRole('button',{name:es?'Grabar dummy':'Record dummy',exact:true}).click();await page.evaluate(()=>window.__pad.axes[0]=.9);await page.waitForTimeout(400);await page.evaluate(()=>window.__pad.axes[0]=0);await overlay.getByRole('button',{name:es?'Detener grabación':'Stop recording',exact:true}).click();await page.waitForFunction(()=>window.__snapshot.training.dummyRecording.some(input=>input.right));await expect(overlay.locator('.training-history')).toContainText(es?'Derecha':'Right');
  await page.screenshot({path:`tmp/qa/v2-training-${language}-live.png`});
  for(const viewport of [{width:1024,height:640},{width:390,height:844}]){await page.setViewportSize(viewport);await visible(overlay);await visible(overlay.getByRole('button',{name:apply,exact:true}));await visible(overlay.locator('.training-history'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`tmp/qa/v2-training-${language}-${viewport.width}.png`});}
  await overlay.getByRole('button',{name:es?'Daño a cero':'Reset damage',exact:true}).click();await page.waitForFunction(()=>window.__snapshot.fighters.every(fighter=>fighter.damage===0));
  await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','false');await visible(toggle);await page.setViewportSize({width:1366,height:768});
  // Start opens the real pause dialog. D-pad visits target, damage and Apply in order.
  await pad(9);await page.waitForFunction(()=>window.__snapshot.phase==='paused');const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:es?'CONTINUAR':'CONTINUE',exact:false})).toBeFocused();await pad(13);await expect(dialog.getByRole('button',{name:new RegExp(`^${targetLabel}:`)})).toBeFocused();await pad(15);
  const humanId=await page.evaluate(()=>window.__snapshot.config.players.find(seat=>seat.kind==='human').id);
  await expect(dialog.getByRole('button',{name:new RegExp(`^${targetLabel}: P1`)})).toBeFocused();await pad(13);await expect(dialog.getByRole('button',{name:`${setDamage}: 0%`,exact:true})).toBeFocused();for(let index=0;index<4;index++)await pad(15);await expect(dialog.getByRole('button',{name:`${setDamage}: 100%`,exact:true})).toBeFocused();await pad(13);await expect(dialog.getByRole('button',{name:apply,exact:true})).toBeFocused();await visible(dialog.getByRole('button',{name:apply,exact:true}));await pad(0);
  await page.waitForFunction(id=>window.__snapshot.fighters.find(fighter=>fighter.id===id).damage===100,humanId);assert.equal(await page.evaluate(()=>window.__snapshot.phase),'paused');assert.equal(await page.evaluate(id=>window.__snapshot.fighters.find(fighter=>fighter.id===id).damage,dummyId),0);
  for(let index=0;index<7;index++)await pad(13);const frame=dialog.getByRole('button',{name:es?'Avanzar un cuadro':'Advance one frame',exact:true});await expect(frame).toBeFocused();await visible(frame);const tick=await page.evaluate(()=>window.__snapshot.tick);await pad(0);await page.waitForFunction(tick=>window.__snapshot.tick>tick,tick);assert.equal(await page.evaluate(()=>window.__snapshot.phase),'paused');
  await page.screenshot({path:`tmp/qa/v2-training-${language}-paused-controller.png`});assert.deepEqual(errors,[]);console.log(`${language}: visible/collapsible live Training toolbar/history, actual dummy damage100, recording,1024/390layouts and injected-controller paused target/damage100 passed.`);await page.close();
 }
}finally{await browser.close();}
