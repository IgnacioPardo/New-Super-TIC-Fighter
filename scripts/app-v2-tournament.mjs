// Full four-browser tournament: UI registration, readiness, deliberate forfeits,
// authoritative advancement and completed bracket. No fabricated match results.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import { enterTitle, chooseMode } from './enter-title.mjs';
const base=process.env.STF_APP_URL??'http://127.0.0.1:5193';
const browser=await chromium.launch({headless:true}),pages=[],errors=[];
let id;
await mkdir('tmp/qa',{recursive:true});
try{
 for(let index=0;index<4;index++){
  const page=await browser.newPage({viewport:{width:1366,height:768}});pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(index=>{
   Object.defineProperty(navigator,'getGamepads',{value:()=>[]});localStorage.setItem('stf-settings',JSON.stringify({language:'en',reducedMotion:true}));
   localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',players:[{id:'p1',name:`QA Entrant ${index+1}`,discipline:'code',kind:'human',team:0,device:'keyboard:0',appearance:{hair:index,shirt:index,pants:index}},{id:'p2',name:'CPU',discipline:'hardware',kind:'bot',difficulty:'normal',team:1,device:'bot',appearance:{hair:0,shirt:0,pants:0}}]}));
   const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(m.state?.party)window.__lobby=m.state;if(m.state?.authority==='server')window.__match=m.state;if(m.snapshot)window.__snapshot=m.snapshot;});}};
  },index);
  await page.goto(base);await enterTitle(page);await chooseMode(page,'tournaments');await page.waitForFunction(()=>window.__lobby?.party.players.length===1);
  if(index===0){
   await page.getByRole('textbox',{name:'Competition name',exact:true}).fill('QA browser tournament');
   const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/tournaments'&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Create competition',exact:true}).click();id=(await(await response).json()).id;assert.ok(id);
  }else{
   await page.getByRole('textbox',{name:'Competition code',exact:true}).fill(id);await page.getByRole('button',{name:'Open invite',exact:true}).click();
  }
  await page.getByRole('button',{name:'Enter player',exact:true}).click();await expect(page.locator('.competition-home')).toContainText(`QA Entrant ${index+1}`);
 }
 await expect(pages[0].getByRole('button',{name:'Start competition',exact:true})).toBeEnabled();await pages[0].getByRole('button',{name:'Start competition',exact:true}).click();
 const played=new Set();
 for(let safety=0;safety<20;safety++){
  const state=await fetch(`${base}/api/tournaments/${id}`).then(r=>r.json());if(state.phase==='finished')break;
  const game=state.games.find(g=>g.phase==='running'&&!played.has(g.matchId));if(!game){await pages[0].waitForTimeout(500);continue;}
  const match=await fetch(`${base}/api/matches/${game.matchId}`).then(r=>r.json());
  const participants=[];for(const page of pages){const peer=await page.evaluate(()=>window.__lobby.peerId);if(match.peers.some(p=>p.peerId===peer))participants.push(page);}
  assert.equal(participants.length,2);
  for(const page of participants){if(await page.locator('.results-screen').count())await page.getByRole('button',{name:/^NEXT BOUT/}).click();await page.locator('.screen-room').waitFor({timeout:20000});await page.locator('.ready-button:not(:disabled)').click();}
  for(const page of participants)await page.waitForFunction(mid=>window.__snapshot?.matchId===mid&&window.__snapshot.phase==='playing',game.matchId,{timeout:20000});
  const loser=participants[0];await loser.locator('.match-topbar button').click();await loser.getByRole('dialog').getByRole('button',{name:'BACK TO LOBBY',exact:true}).click();played.add(game.matchId);
  await loser.waitForTimeout(400);
 }
 const final=await fetch(`${base}/api/tournaments/${id}`).then(r=>r.json());assert.equal(final.phase,'finished');assert.equal(final.championIds.length,1);assert.equal(played.size,6);assert.equal(final.games.length,3);assert.deepEqual(errors,[]);
 await pages[0].goto(`${base}/?tournament=${id}`);if(await pages[0].locator('.intro-screen').count())await pages[0].keyboard.press('Enter');await expect(pages[0].locator('.competition-home')).toContainText('Champions');await pages[0].screenshot({path:'tmp/qa/v2-tournament-complete.png',fullPage:true});
 console.log('Four complete browsers entered through UI; six deliberate-forfeit authoritative BO3 bouts produced a persisted three-game bracket and champion. Zero browser errors.');
}catch(error){for(let i=0;i<pages.length;i++){console.log(`Browser ${i}: ${(await pages[i].locator('body').innerText()).slice(-1800)}`);await pages[i].screenshot({path:`tmp/qa/v2-tournament-failure-${i}.png`,fullPage:true});}throw error;}finally{await browser.close();}
