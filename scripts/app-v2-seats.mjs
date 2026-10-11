// Whole browser flows with injected devices. These are not physical-controller evidence.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium,firefox,webkit,expect } from '@playwright/test';
import { enterTitle } from './enter-title.mjs';
const base=process.env.STF_APP_URL??'http://127.0.0.1:5174';
await mkdir('tmp/qa',{recursive:true});
for(const engine of (process.env.STF_BROWSERS??'chromium,firefox,webkit').split(',')) {
 const browser=await ({chromium,firefox,webkit}[engine]).launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  const pads=Array.from({length:4},(_,index)=>({id:`Injected standard controller ${index}`,index,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))}));
  window.__pads=pads;Object.defineProperty(navigator,'getGamepads',{value:()=>window.__pads});
  localStorage.setItem('stf-settings',JSON.stringify({language:'en',reducedMotion:true}));
  localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',players:Array.from({length:4},(_,index)=>({id:`p${index+1}`,name:`Seat ${index+1}`,discipline:['networks','design','code','hardware'][index],appearance:{hair:index,shirt:index,pants:index},team:index%2,kind:'human',device:`gamepad:${index}`}))}));
 });
 const pads=async(indices,button,duration=120)=>{await page.evaluate(({indices,button})=>indices.forEach(index=>window.__pads[index].buttons[button].pressed=true),{indices,button});await page.waitForTimeout(duration);await page.evaluate(({indices,button})=>indices.forEach(index=>window.__pads[index].buttons[button].pressed=false),{indices,button});await page.waitForTimeout(220);};
 const card=id=>page.locator(`[data-seat-id="p${id}"]`);
 try {
  await page.goto(base);await enterTitle(page);await page.getByTestId('mode-local').click();
  await pads([0,1,2,3],0);await expect(page.locator('.inline-fighter-editor')).toHaveCount(4);
  await pads([0,1,2,3],13);await pads([0,1,2,3],15);
  for(let id=1;id<=4;id++) await expect(card(id).locator('.choice-main').first()).toContainText(['Design','Programming','Hardware','Artificial Intelligence'][id-1]);
  // Holding an input through a transition must not move the newly opened menu.
  await pads([0],1);await expect(card(1).locator('.inline-fighter-editor')).toHaveCount(0);await pads([0],0);await expect(card(1).locator('.inline-fighter-editor')).toHaveCount(1);
  // A native keyboard text field owns its input while other seats keep editing.
  await card(3).getByRole('tab',{name:'Player / Controller'}).click();const name=card(3).getByRole('textbox',{name:'Name P3'});await name.fill('Zoë / 日本語');await name.focus();
  await pads([1],13);await pads([1],15);await expect(name).toBeFocused();await expect(name).toHaveValue('Zoë / 日本語');
  await page.keyboard.press('Escape');await expect(name).not.toBeFocused();await expect(card(3).locator('.inline-fighter-editor')).toHaveCount(1);
  // Only coordinator can open rules; other pad input is contained by that dialog.
  await page.locator('.match-summary').click();await expect(page.getByRole('dialog')).toHaveCount(1);
  const arena=page.getByRole('button',{name:/^Arena:/});const before=await arena.textContent();await pads([1],15);assert.equal(await arena.textContent(),before);
  await pads([1],1);await expect(page.getByRole('dialog')).toHaveCount(1);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  // Controller return is explicit and keeps its seat/appearance/name.
  await page.evaluate(()=>window.__pads[1].connected=false);await expect(card(2).locator('.seat-reclaim')).toBeVisible();
  await page.evaluate(()=>window.__pads[1].connected=true);await page.waitForTimeout(300);await expect(card(2).locator('.seat-reclaim')).toBeVisible();await pads([1],0);await expect(card(2).locator('.seat-reclaim')).toHaveCount(0);
  // Settings -> Guide -> Back restores each level, rather than looping on Guide.
  await page.getByRole('button',{name:'SETTINGS',exact:true}).click();await page.locator('.app-footer button').click();await expect(page.locator('.screen-guide')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.screen-settings')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.screen-setup')).toBeVisible();
  await expect(page.locator('.inline-fighter-editor')).toHaveCount(4);await expect(name).toHaveValue('Zoë / 日本語');
  await pads([2],9);await expect(page.locator('.screen-setup')).toBeVisible();
  for(const seat of await page.locator('.fighter-card').all()) await seat.locator('.ready-button').click();await expect(page.locator('.fight-button')).toBeEnabled();
  await page.screenshot({path:`tmp/qa/${engine}-v2-independent-seats.png`,fullPage:true});
  for(const viewport of [{width:1024,height:640},{width:390,height:844}]) {await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  assert.deepEqual(errors,[]);console.log(`${engine}: four simultaneous seat cursors, independent appearance edits, keyboard coexistence, coordinator dialog containment, explicit reconnect, navigation stack and responsive flow passed (injected controllers).`);
 } catch(error) {await page.screenshot({path:`tmp/qa/${engine}-v2-seat-failure.png`,fullPage:true});console.log((await page.locator('body').innerText()).slice(-3500));throw error;} finally {await browser.close();}
}
