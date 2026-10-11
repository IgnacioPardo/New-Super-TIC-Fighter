// Complete browser application exercise: menus -> room -> live workers -> rematch.
// No simulation functions are called directly and no game state is fabricated.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('tmp/qa',{recursive:true});
import {chromium} from '@playwright/test';
import { enterTitle, chooseMode } from './enter-title.mjs';
const base=process.env.STF_APP_URL??'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true});
const contexts=await Promise.all([browser.newContext({viewport:{width:1440,height:1000}}),browser.newContext({viewport:{width:1440,height:1000}})]);
const pages=await Promise.all(contexts.map(context=>context.newPage()));
const errors=[];
for(const page of pages){
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    Object.defineProperty(navigator, 'getGamepads', { value: () => [] }); // Isolate keyboard flows from attached physical devices.
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{const snapshot=event.data?.type==='snapshot'?event.data.snapshot:event.data;if(snapshot?.matchId&&Array.isArray(snapshot.fighters)){window.__stfSnapshot=snapshot;}});}};
  });
}
const [host,guest]=pages;
try{
  await host.goto(base);await enterTitle(host);await chooseMode(host,'online');await host.getByPlaceholder('Jugador',{exact:true}).fill('Host');await host.getByRole('button',{name:/CREAR SALA/}).click();
  await host.locator('.room-code strong').waitFor();const code=await host.locator('.room-code strong').innerText();console.log('Room created',code);
  await guest.goto(`${base}/?room=${code}`);await enterTitle(guest);await chooseMode(guest,'online');await guest.getByPlaceholder('Jugador',{exact:true}).fill('Guest');await guest.getByRole('button',{name:/ENTRAR/}).click();
  await guest.locator('.room-code strong').waitFor();await host.locator('.fighter-card').nth(1).waitFor();
  await host.locator('.fighter-card').filter({hasText:'Host'}).getByRole('button',{name:'Listo',exact:true}).click();
  await guest.locator('.fighter-card').filter({hasText:'Guest'}).getByRole('button',{name:'Listo',exact:true}).click();
  await host.locator('.fight-button:not(:disabled)').waitFor({timeout:12000});await host.locator('.fight-button').click();
  await Promise.all(pages.map(page=>page.waitForFunction(()=>window.__stfSnapshot?.phase==='playing',null,{timeout:15000})));
  console.log('Both complete applications entered playing');
  await host.screenshot({path:'tmp/qa/online-playing.png',fullPage:true});
  const guestId=await guest.evaluate(()=>window.__stfSnapshot.config.players.find(p=>p.name==='Guest').id);
  const before=await host.evaluate(id=>window.__stfSnapshot.fighters.find(p=>p.id===id).x,guestId);
  await guest.keyboard.down('d');await guest.waitForTimeout(450);await guest.keyboard.up('d');await host.waitForTimeout(150);
  const after=await host.evaluate(id=>window.__stfSnapshot.fighters.find(p=>p.id===id).x,guestId);assert(after>before+40,'Guest movement must reach host authority');
  await guest.keyboard.press('Escape');await host.waitForFunction(()=>window.__stfSnapshot?.phase==='paused');console.log('Shared pause',await host.locator('.pause-panel').innerText());
  await host.screenshot({path:'tmp/qa/online-match.png',fullPage:true});
  await host.getByRole('button',{name:/CONTINUAR/}).click();
  await Promise.all(pages.map(page=>page.waitForFunction(()=>window.__stfSnapshot?.phase==='playing',null,{timeout:7000})));
  await guest.keyboard.press('Escape');
  await host.waitForFunction(()=>window.__stfSnapshot?.phase==='paused');
  console.log('Repeated pause after resume passed');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Integrated browser room, ready gating, authoritative guest movement, and shared pause passed.');
}catch(error){for(let i=0;i<pages.length;i++){console.log('PAGE',i,(await pages[i].locator('body').innerText()).slice(-4000));await pages[i].screenshot({path:`tmp/qa/app-failure-${i}.png`,fullPage:true});}throw error;}
finally{await browser.close();}
