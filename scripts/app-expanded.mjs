// Complete application input/rendering exercise. Saved match selections are
// seeded before startup; combat uses real UI readiness, workers and key inputs.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {enterTitle} from './enter-title.mjs';
const base=process.env.STF_APP_URL??'http://127.0.0.1:5173';
const out=process.env.STF_QA_OUTPUT??'tmp/qa/expanded';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const report=[];
const arenas=['classic','lab','pc','embedded','virtual','arcade'];
const kits=['networks','design','code','hardware','ai','robotics','iot','vr','games','printing'];
try{
 for(const kit of kits.filter(kit=>!process.env.STF_KITS||process.env.STF_KITS.split(',').includes(kit))){
  const index=kits.indexOf(kit);
  const arena=arenas[index%arenas.length];const context=await browser.newContext({viewport:{width:1366,height:768}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({kit,arena})=>{
   localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',gameMode:'stock',bestOf:1,arena,mode:'ffa',items:true,hazards:true,lives:3,timeLimit:300,friendlyFire:false,practice:false,players:[{id:'p1',name:kit,discipline:kit,appearance:{hair:0,shirt:0,pants:0,cosmetic:'neon'},team:0,kind:'human',device:'keyboard:0'},{id:'p2',name:'Dummy Operator',discipline:'robotics',appearance:{hair:1,shirt:1,pants:1},team:1,kind:'human',device:'keyboard:1'}]}));
   Object.defineProperty(navigator,'getGamepads',{value:()=>[]});const W=window.Worker;window.Worker=class extends W{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data?.snapshot){window.__stfSnapshot=e.data.snapshot;window.__stfSeenEvents??={};for(const event of e.data.snapshot.events)window.__stfSeenEvents[event.id]=event;}});}};
  },{kit,arena});
  try{
   await page.goto(base);await enterTitle(page);await page.getByTestId('mode-local').click();
   const ready=page.locator('.fighter-card').getByRole('button',{name:'Listo',exact:true});while(await ready.count())await ready.first().click();
   await page.locator('.fight-button:not(:disabled)').click();await page.waitForFunction(()=>window.__stfSnapshot?.phase==='playing',null,{timeout:15000});
   assert.equal(await page.evaluate(()=>window.__stfSnapshot.config.ruleset),'expanded');
   const hold=async(key,ms=90)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};
   await hold('x');await page.waitForTimeout(420);await page.screenshot({path:`${out}/${kit}-${arena}-signature.png`});
   await page.waitForTimeout(1100);await hold('v');await page.waitForTimeout(420);await page.screenshot({path:`${out}/${kit}-${arena}-combo.png`});
   await page.waitForTimeout(1300);await hold('w');await page.waitForTimeout(150);await hold('z',60);await page.screenshot({path:`${out}/${kit}-aerial.png`});
   const state=await page.evaluate(()=>window.__stfSnapshot);assert.ok(state.fighters.every(f=>Number.isFinite(f.x)&&Number.isFinite(f.y)));assert.equal(errors.length,0,errors.join('\n'));
   report.push({kit,arena,tick:state.tick,errors,deployables:state.deployables.map(d=>d.kind),actions:await page.evaluate(()=>[...new Set(Object.values(window.__stfSeenEvents).filter(e=>e.seatId==='p1').map(e=>e.action).filter(Boolean))])});
  }catch(error){await page.screenshot({path:`${out}/${kit}-failure.png`});console.log((await page.locator('body').innerText()).slice(-3000));throw error;}finally{await context.close();}
 }
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
