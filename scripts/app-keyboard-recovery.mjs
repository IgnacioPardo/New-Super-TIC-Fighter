// Complete application flows. Missing/injected gamepads are not physical hardware evidence.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox,webkit,expect} from '@playwright/test';
import {enterTitle} from './enter-title.mjs';
const base=process.env.STF_APP_URL??'http://127.0.0.1:5193',out='tmp/qa/keyboard-recovery',report=[];
await mkdir(out,{recursive:true});
for(const engine of (process.env.STF_BROWSERS??'chromium').split(',')) {
 const browser=await ({chromium,firefox,webkit}[engine]).launch();
 try {for(const language of ['es','en']) {
  const page=await browser.newPage({viewport:{width:1024,height:640}}),errors=[],es=language==='es';
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({language})=>{
   Object.defineProperty(navigator,'getGamepads',{value:()=>[]});
   if(!localStorage.getItem('stf-match')) {
   localStorage.setItem('stf-settings',JSON.stringify({language,reducedMotion:true,keyboardBindings:[{right:'KeyE'}]}));
   localStorage.setItem('stf-match',JSON.stringify({ruleset:'classic',bestOf:1,players:[
    {id:'p1',name:'Saved fighter',discipline:'networks',appearance:{hair:3,shirt:2,pants:1},team:0,kind:'human',device:'gamepad:1'},
    {id:'p2',name:'CPU 2',discipline:'design',appearance:{hair:1,shirt:1,pants:1},team:1,kind:'bot',difficulty:'dummy',device:'bot'},
    {id:'p3',name:'Keyboard friend',discipline:'code',appearance:{hair:2,shirt:3,pants:2},team:1,kind:'human',device:'keyboard:2'},
   ]}));
   }
   const Native=window.Worker;window.Worker=class extends Native {constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data?.snapshot)window.__snapshot=e.data.snapshot;});}postMessage(message,...rest){if(message.type==='inputs')window.__inputs=message.inputs;super.postMessage(message,...rest);}};
  },{language});
  await page.goto(base);await enterTitle(page);await page.getByTestId('mode-local').click();
  const card=page.locator('[data-seat-id="p1"]'),fallback=card.getByRole('button',{name:es?'Usar teclado 1 →':'Use keyboard 1 →',exact:true});
  await expect(fallback).toBeVisible();await expect(page.locator('.fight-button')).toBeDisabled();
  const visible=await fallback.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&el.contains(hit);});assert(visible,'Keyboard recovery is visible and not covered at 1024×640');
  await page.screenshot({path:`${out}/${engine}-${language}-disconnected.png`});
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('stf-match')).players);
  await fallback.focus();await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('data-owner','keyboard:0');await expect(card.locator('.seat-reclaim')).toHaveCount(0);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('stf-match')));
  assert.deepEqual(saved.players.map(p=>p.device),['keyboard:0','bot','keyboard:2']);
  assert.deepEqual(saved.players,before.map(player=>player.id==='p1'?{...player,device:'keyboard:0'}:player));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('stf-settings')).keyboardBindings[0].right),'KeyE');
  for(const ready of await page.locator('.ready-button').all())await ready.click();
  await expect(page.locator('.fight-button')).toBeEnabled();await page.locator('.fight-button').click();
  await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
  const x=await page.evaluate(()=>window.__snapshot.fighters.find(p=>p.id==='p1').x);
  await page.keyboard.down('e');await page.waitForFunction(()=>window.__inputs?.find(i=>i.seatId==='p1')?.right);await page.waitForTimeout(250);
  assert((await page.evaluate(()=>window.__snapshot.fighters.find(p=>p.id==='p1').x))>x+20,'Custom keyboard binding moves the actual fighter');
  assert.equal(await page.evaluate(()=>window.__inputs.find(i=>i.seatId==='p3').right),false,'Another keyboard seat is not taken over');
  await page.keyboard.up('e');await page.reload();await enterTitle(page);await page.getByTestId('mode-local').click();
  await expect(card).toHaveAttribute('data-owner','keyboard:0');await expect(page.locator('.seat-reclaim')).toHaveCount(0);
  assert.deepEqual(errors,[]);await page.close();report.push({engine,language,savedDisconnectedSeat:true,keyboardConfirmed:true,customBindingMovesFighter:true,otherSeatPreserved:true,assignmentSurvivesReload:true,pageErrors:0});
 }
 // Multiple missing controllers must reserve distinct free layouts as each player switches.
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'getGamepads',{value:()=>[]});localStorage.setItem('stf-settings',JSON.stringify({language:'en',reducedMotion:true}));
  localStorage.setItem('stf-match',JSON.stringify({players:['gamepad:0','gamepad:1','keyboard:0','keyboard:1'].map((device,i)=>({id:`p${i+1}`,name:`Seat ${i+1}`,discipline:'networks',appearance:{hair:i,shirt:i,pants:i},team:i%2,kind:'human',device}))}));
 });
 await page.goto(base);await enterTitle(page);await page.getByTestId('mode-local').click();
 await page.locator('[data-seat-id="p1"]').getByRole('button',{name:'Use keyboard 3 →',exact:true}).click();
 await page.locator('[data-seat-id="p2"]').getByRole('button',{name:'Use keyboard 4 →',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('stf-match')).players.map(p=>p.device)),['keyboard:2','keyboard:3','keyboard:0','keyboard:1']);
 await expect(page.locator('.seat-reclaim')).toHaveCount(0);await page.close();
 console.log(`${engine}: ES/EN missing-controller recovery, keyboard confirmation, actual custom-bound fighter movement, saved preferences and four distinct keyboard seats passed.`);
 }finally{await browser.close();}
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
