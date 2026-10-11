// Full applications and real local-service results; no fabricated snapshots.
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {enterTitle,chooseMode} from './enter-title.mjs';
const browser=await chromium.launch(),pages=[],errors=[];
try{
for(let i=0;i<8;i++){
 const page=await browser.newPage({viewport:{width:1366,height:768}});pages.push(page);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(i=>{
  localStorage.setItem('stf-settings',JSON.stringify({language:'en',reducedMotion:true}));
  localStorage.setItem('stf-match',JSON.stringify({players:[{id:'p1',name:`Royale Browser ${i+1}`,discipline:'code',kind:'human',team:0,device:'keyboard:0',appearance:{hair:0,shirt:0,pants:0}}]}));
  const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data==='pong')return;const m=JSON.parse(e.data);if(m.type==='snapshot'||m.type==='result')window.__snapshot=m.snapshot;if(m.state?.party)window.__lobby=m.state;});}};
 },i);
 await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:5193');await enterTitle(page);await chooseMode(page,'public');await page.waitForFunction(()=>window.__lobby?.party.players.length===1);
 await page.getByRole('button',{name:'Playlist −',exact:true}).click();await page.waitForFunction(()=>window.__lobby.party.preference.pool==='royale');
 await page.getByRole('button',{name:'Find a match',exact:true}).click();
}
for(const page of pages){await page.locator('.screen-room').waitFor();await page.locator('.ready-button:not(:disabled)').click();}
for(const page of pages)await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
for(const page of pages.slice(0,7)){await page.locator('.match-topbar button').click();await page.getByRole('dialog').getByRole('button',{name:'BACK TO LOBBY',exact:true}).click();}
const last=pages[7];await expect(last.locator('.results-screen')).toBeVisible();await last.getByRole('tab',{name:'Scoreboard',exact:true}).click();
const names=new Set(),placements=[];for(let i=0;i<2;i++){for(const name of await last.locator('.result-scoreboard strong').allTextContents())names.add(name);placements.push(...await last.locator('.result-scoreboard b').allTextContents());if(i===0)await last.getByRole('button',{name:'Next page · Scoreboard',exact:true}).click();}
assert.equal(names.size,8);assert.deepEqual(placements,['#1','#2','#3','#4','#5','#6','#7','#8']);
for(const viewport of [{width:1366,height:768},{width:1024,height:640},{width:390,height:844}]){
 await last.setViewportSize(viewport);await last.mouse.wheel(0,600);await last.waitForTimeout(120);
 const size=await last.evaluate(()=>({height:innerHeight,scroll:document.documentElement.scrollHeight,y:scrollY,buttons:[...document.querySelectorAll('.results-screen button')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().bottom)}));assert.equal(size.y,0);assert.ok(size.scroll<=size.height);assert.ok(size.buttons.every(y=>y<=size.height));
 await last.screenshot({path:`tmp/qa/royale-results-${viewport.width}.png`});
}
assert.deepEqual(errors,[]);const report={scenario:'eight complete public Royale clients, seven deliberate UI forfeits, authoritative winner and both score pages',players:[...names],placements,viewports:['1366x768','1024x640','390x844'],errors};await writeFile('tmp/qa/royale-result-pages.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
