// Real worker/browser controllers; the four standard gamepads are injected hardware data.
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {enterTitle,chooseMode} from './enter-title.mjs';
const base=process.env.STF_APP_URL??'http://127.0.0.1:8791',browser=await chromium.launch();await mkdir('tmp/qa/v2-layout',{recursive:true});
try{
 for(const language of ['es','en']){
 const es=language==='es',page=await browser.newPage({viewport:{width:1024,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(language=>{
  window.__pads=Array.from({length:4},(_,i)=>({id:`Injected seat controller ${i}`,index:i,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))}));Object.defineProperty(navigator,'getGamepads',{value:()=>window.__pads});
  localStorage.setItem('stf-settings',JSON.stringify({language,reducedMotion:true}));
  localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',gameMode:'royale',bestOf:1,lives:1,arena:'arcade',players:Array.from({length:8},(_,i)=>({id:`p${i+1}`,name:`${i%2===0?'Local':'Opponent'} ${i+1}`,discipline:['networks','design','code','hardware','ai','robotics','iot','vr'][i],appearance:{hair:i%4,shirt:i%4,pants:i%4},team:i%2,kind:i%2===0?'human':'bot',difficulty:'easy',device:i%2===0?`gamepad:${i/2}`:'bot'}))}));
  const Native=window.Worker;window.Worker=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data?.snapshot)window.__snapshot=e.data.snapshot;});}};
 },language);
 const pad=async(index,button)=>{await page.evaluate(({index,button})=>window.__pads[index].buttons[button].pressed=true,{index,button});await page.waitForTimeout(110);await page.evaluate(({index,button})=>window.__pads[index].buttons[button].pressed=false,{index,button});await page.waitForTimeout(170);};
 const card=id=>page.locator(`[data-seat-id="${id}"]`);
 await page.goto(base);await enterTitle(page);await chooseMode(page,'local');
 for(const id of ['p1','p3','p5','p7'])await expect(card(id)).toBeVisible();for(const id of ['p2','p4','p6','p8'])await expect(card(id)).toBeHidden();
 for(let i=0;i<4;i++)await pad(i,0);for(const id of ['p1','p3','p5','p7'])await expect(card(id)).toHaveClass(/is-editing/);
 await card('p1').getByRole('tab',{name:es?'Jugador':'Player',exact:true}).click();const name=card('p1').getByRole('textbox');await name.fill('Couch keyboard');await expect(name).toBeFocused();
 for(let i=1;i<4;i++){await pad(i,13);await pad(i,15);await expect(name).toBeFocused();}
 assert.equal(await name.inputValue(),'Couch keyboard');
 for(const id of ['p3','p5','p7']){const next=card(id).locator('.inline-fighter-editor .content-pager.compact button:last-child');await next.click();await expect(card(id).getByRole('button',{name:new RegExp(es?'^Pantalón:':'^Trousers:')})).toBeVisible();}
 // Every control must be within its card; a row under Ready is a real failure.
 await page.screenshot({path:`tmp/qa/v2-layout/${language}-four-local-editors-1024.png`});
 const covered=await page.evaluate(()=>[...document.querySelectorAll('.fighter-summary:not([hidden]) button,.fighter-summary:not([hidden]) input')].filter(e=>e.getClientRects().length).flatMap(e=>{const r=e.getBoundingClientRect(),c=e.closest('.fighter-summary').getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.bottom-4);return r.bottom>c.bottom||r.top<c.top||hit&&!e.contains(hit)?[e.getAttribute('aria-label')??e.textContent.trim()]:[];}));assert.deepEqual(covered,[]);
 await page.screenshot({path:`tmp/qa/v2-layout/${language}-four-local-editors-1024.png`});
 await page.setViewportSize({width:390,height:844});await pad(3,13);await expect(card('p7')).toBeVisible();await expect(card('p1')).toBeHidden();await expect(card('p1')).toHaveClass(/is-editing/);await expect(card('p1').locator('input')).toHaveValue('Couch keyboard');await page.screenshot({path:`tmp/qa/v2-layout/${language}-owned-controller-page-390.png`});
 await page.setViewportSize({width:1366,height:768});await page.waitForTimeout(150);await page.locator('.content-pager button').first().click();for(const id of ['p1','p3','p5','p7']){await card(id).locator('.fighter-edit').click();await card(id).locator('.ready-button').click();}
 await page.locator('.fight-button').click();await page.waitForFunction(()=>window.__snapshot?.phase==='playing'&&window.__snapshot.fighters.length===8);
 await expect(page.locator('.royale-local-roster .hud-fighter')).toHaveCount(4);await expect(page.locator('.hud-opponent')).toHaveCount(4);const hud=await page.locator('.royale-hud').boundingBox();assert.ok(hud.height<=180);await page.screenshot({path:`tmp/qa/v2-layout/${language}-four-local-royale-hud.png`});assert.deepEqual(errors,[]);await page.close();console.log(`${language}: four simultaneous local editors, preserved native keyboard focus, all appearance options, controller-owned narrow paging and real eight-fighter/four-local Royale HUD passed.`);
 }
}finally{await browser.close();}
