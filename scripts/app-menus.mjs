// Whole application configuration flows. Virtual pads exercise navigation, not hardware compatibility.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,firefox,webkit,expect} from '@playwright/test';
import { enterTitle, chooseMode } from './enter-title.mjs';
const base=process.env.STF_APP_URL??'http://127.0.0.1:5173';
await mkdir('tmp/qa',{recursive:true});
for(const engine of (process.env.STF_BROWSERS??'chromium,firefox,webkit').split(',')){
 const browser=await ({chromium,firefox,webkit}[engine]).launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 const errors=[],music=new Set();
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(/\.(mp3|wma)(\?|$)/i.test(request.url()))music.add(request.url());});
 await page.addInitScript(()=>{
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='snapshot')window.__snapshot=event.data.snapshot;});}};
  window.__pad={id:'Menu QA virtual standard gamepad',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
  Object.defineProperty(navigator,'getGamepads',{value:()=>[window.__pad]});
 });
 const key=code=>page.keyboard.press(code);
 const pad=async(button,duration=65)=>{await page.evaluate(index=>window.__pad.buttons[index].pressed=true,button);await page.waitForTimeout(duration);await page.evaluate(index=>window.__pad.buttons[index].pressed=false,button);await page.waitForTimeout(50);};
 const choice=label=>page.getByRole('button',{name:new RegExp(`^${label}:`)});
 const close=async()=>{await key('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);};
 try{
  await page.goto(base);await enterTitle(page);await page.getByTestId('mode-settings').click();
  await expect(page.locator('.settings-category').first()).toBeFocused();
  await key('Enter');await expect(page.getByRole('slider',{name:'Música'})).toBeFocused();
  await key('ArrowRight');await expect(page.getByRole('slider',{name:'Música'})).toHaveValue('0.5');
  await key('Home');await key('ArrowDown');await expect(page.getByRole('slider',{name:'Efectos'})).toBeFocused();await key('Home');
  await key('ArrowDown');await expect(choice('Banda sonora')).toBeFocused();await key('ArrowRight');await expect(choice('Banda sonora')).toContainText('Original');
  await close();await expect(page.locator('.settings-category').first()).toBeFocused();
  await key('ArrowDown');await key('Enter');await expect(choice('Idioma')).toBeFocused();await key('ArrowRight');
  await expect(choice('Language')).toContainText('English');await key('ArrowDown');await key('ArrowRight');await expect(choice('Camera')).toContainText('Fixed');
  await key('ArrowDown');await key('ArrowRight');await expect(choice('Reduce motion')).toContainText('On');
  await key('Tab');await expect(page.getByRole('dialog').getByRole('button',{name:'Done'})).toBeFocused();
  await key('Shift+Tab');await expect(choice('Reduce motion')).toBeFocused();
  await close();await key('ArrowDown');await key('Enter');await key('ArrowDown');
  await expect(page.locator('.binding-button').first()).toBeFocused();await key('Enter');await key('d');
  await expect(page.getByRole('status')).toContainText('already used');await key('f');await expect(page.locator('.binding-button').first().locator('kbd')).toHaveText('F');
  await key('Enter');await pad(1);await expect(page.getByRole('dialog')).toHaveCount(1);await expect(page.locator('.capturing')).toHaveCount(0);
  await page.getByRole('button',{name:'Reset keys'}).click();await expect(page.locator('.binding-button').first().locator('kbd')).toHaveText('A');
  await close();await key('ArrowDown');await key('Enter');await expect(choice('Jump')).toBeFocused();
  await page.evaluate(()=>{window.__pad.buttons[15].pressed=true;window.__pad.buttons[13].pressed=true;});await page.waitForTimeout(90);await page.evaluate(()=>{window.__pad.buttons[15].pressed=false;window.__pad.buttons[13].pressed=false;});await page.waitForTimeout(50);
  await expect(choice('Jump')).toBeFocused();await expect(choice('Jump')).toContainText('B / ○');await expect(choice('Special')).toContainText('A / ✕');
  await pad(13);await expect(choice('Punch')).toBeFocused();await pad(1);await expect(page.getByRole('dialog')).toHaveCount(0);
  await pad(0);await expect(choice('Jump')).toBeFocused(); // Menu A remains confirm after combat remapping.
  await pad(14);await expect(choice('Jump')).toContainText('A / ✕');
  await pad(13,750);assert.match(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')), /^(Guard|Dodge \/ dash|PAUSED):/, 'Held D-pad repeats through rows with an initial delay');
  await pad(1);await page.reload();await enterTitle(page);await page.getByTestId('mode-settings').click();await key('Enter');
  await expect(page.getByRole('slider',{name:'Music'})).toHaveValue('0');await expect(page.getByRole('slider',{name:'Effects'})).toHaveValue('0');await expect(choice('Soundtrack')).toContainText('Original');
  await close();await key('ArrowDown');await key('Enter');await expect(choice('Camera')).toContainText('Fixed');await expect(choice('Reduce motion')).toContainText('On');await key('ArrowLeft'); // English -> Spanish
  await close();await page.locator('.back-button').click();await page.getByTestId('mode-local').click();
  await expect(page.locator('.fighter-edit').first()).toBeFocused();await key('Enter');await page.getByRole('tab',{name:'Aspecto'}).focus();
  await key('ArrowDown');await key('ArrowRight');await expect(choice('Disciplina')).toContainText('Diseño');
  await key('ArrowDown');await key('ArrowRight');await expect(choice('Pelo')).toContainText('2 / 4');await key('ArrowDown');await key('ArrowRight');await key('ArrowDown');await key('ArrowRight');
  await key('ArrowDown');await expect(choice('Pantalón')).toBeFocused(); // No wrap to an unrelated control.
  await page.getByRole('tab',{name:'Jugador / Control'}).focus();await key('Enter');await key('ArrowDown');
  await expect(page.getByRole('textbox',{name:'Nombre P1'})).toBeFocused();await page.getByRole('textbox',{name:'Nombre P1'}).fill('Arrow pilot');await key('ArrowDown');await expect(choice('Jugador')).toBeFocused();
  await close();await expect(page.locator('.fighter-edit').first()).toBeFocused();await expect(page.locator('.fighter-card').first()).toContainText('Arrow pilot');
  await key('ArrowDown');await expect(page.locator('.ready-button').first()).toBeFocused();await key('Enter');
  await key('ArrowRight');await expect(page.locator('.ready-button').nth(1)).toBeFocused();await key('Enter');await expect(page.locator('.fight-button')).toBeEnabled();
  await page.locator('.match-summary').click();await expect(choice('Reglamento')).toBeFocused();await key('ArrowDown');await expect(choice('Escenario')).toBeFocused();await key('ArrowRight');await choice('Modo').focus();await key('ArrowRight');await expect(choice('Modo')).toContainText('Equipos');
  await close();await expect(page.locator('.fight-button')).toBeDisabled();await page.locator('.add-fighter').click();await page.locator('.add-fighter').click();
  for(const card of await page.locator('.fighter-card').all())await card.locator('.ready-button').click();
  await expect(page.locator('.fight-button')).toBeEnabled();
  await page.screenshot({path:`tmp/qa/${engine}-config-roster.png`,fullPage:true});
  await page.locator('.fighter-edit').last().click();await page.getByRole('tab',{name:'Jugador / Control'}).click();await choice('Control').focus();await key('ArrowRight');await key('ArrowRight');await key('ArrowRight');
  await close();await expect(page.locator('.fight-button')).toBeDisabled();await expect(page.getByRole('status')).toContainText('Falta confirmar');
  await page.locator('.fighter-edit').last().click();await page.getByRole('tab',{name:'Jugador / Control'}).click();await choice('Jugador').click();await close();
  for(const ready of await page.locator('.ready-button:not(:disabled)').all())await ready.click();
  await expect(page.locator('.fight-button')).toBeEnabled();await page.locator('.fight-button').click();await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
  assert.equal(await page.evaluate(()=>window.__snapshot.config.players.length),4);assert.equal(await page.evaluate(()=>window.__snapshot.config.mode),'teams');
  await key('Escape');await page.locator('.pause-panel').getByRole('button',{name:'AJUSTES',exact:true}).click();await page.locator('.settings-category').first().click();await close();await page.locator('.back-button').click();await page.locator('.pause-panel').getByRole('button',{name:/CONTINUAR/}).click();await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
  await key('Escape');await page.locator('.pause-panel .text-button').click();await page.locator('.back-button').click();await chooseMode(page,'online');
  const nickname=page.getByPlaceholder('Jugador',{exact:true});await nickname.fill('Menu QA');await nickname.focus();await pad(13);await expect(nickname).not.toBeFocused();
  await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'room_service_unavailable'})}));
  await page.getByRole('button',{name:/CREAR SALA/}).click();await page.locator('.inline-error').waitFor();await page.locator('.back-button').click();await chooseMode(page,'practice');
  await page.locator('.fight-button').click();await page.waitForFunction(()=>window.__snapshot?.phase==='playing');assert.equal(await page.locator('canvas').count(),1);assert.equal(await page.locator('.global-error').count(),0);
  assert(music.size<=4,`Music loads on demand (${music.size} tracks)`);assert.deepEqual(errors,[]);
  console.log(`${engine}: arrow-only settings, persistence, capture/conflicts, virtual-pad remapping/repeat, modal focus/Tab, four-player team configuration, readiness, pause/settings/resume, and offline practice passed.`);
 }catch(error){console.log((await page.locator('body').innerText()).slice(-3500));await page.screenshot({path:`tmp/qa/${engine}-menu-failure.png`,fullPage:true});throw error;}
 finally{await browser.close();}
}
