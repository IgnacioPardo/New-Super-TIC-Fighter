// Complete UI against running workerd services, two independent browser clients.
// Observes actual server messages; no game state/results are fabricated.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {enterTitle} from './enter-title.mjs';
const browser=await chromium.launch({headless:true}),pages=[],errors=[];
await mkdir('tmp/qa',{recursive:true});
async function open(index) {
 const page=await browser.newPage({viewport:{width:1366,height:768}});pages.push(page);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(index=>{
  Object.defineProperty(navigator,'getGamepads',{value:()=>[]});
  localStorage.setItem('stf-settings',JSON.stringify({language:'en',reducedMotion:true}));
  localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',players:[{id:'p1',name:`Browser ${index}`,discipline:'code',kind:'human',team:0,device:'keyboard:0',appearance:{hair:0,shirt:0,pants:0}},{id:'p2',name:'CPU',discipline:'hardware',kind:'bot',difficulty:'normal',team:1,device:'bot',appearance:{hair:1,shirt:1,pants:1}}]}));
  const NativeWebSocket=window.WebSocket;window.WebSocket=class extends NativeWebSocket {constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data==='pong')return;const m=JSON.parse(event.data);if(m.type==='lobby')window.__lobby=m.state;if(m.type==='welcome'&&m.state?.party)window.__lobby=m.state;if(m.type==='match'||m.type==='welcome'&&m.state?.authority==='server')window.__match=m.state;if(m.type==='snapshot'||m.type==='result')window.__snapshot=m.snapshot;});}};
 },index);
 await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:5174');await enterTitle(page);await page.getByTestId('mode-public').click();await page.waitForFunction(()=>window.__lobby?.party.players.length===1);return page;
}
try {
 const a=await open(1),b=await open(2);
 await a.getByRole('button',{name:'Fighters and controls',exact:true}).click();await a.locator('.fighter-edit').first().click();await a.getByRole('tab',{name:'Player / Controller',exact:true}).click();await a.getByRole('textbox',{name:'Name P1',exact:true}).fill('Zoë Online');assert.equal(await a.locator('.fight-button').count(),0);await a.locator('.page-heading .back-button').click();await a.waitForFunction(()=>window.__lobby.party.players[0].name==='Zoë Online');
 await a.getByRole('button',{name:'Find a match',exact:true}).click();await b.getByRole('button',{name:'Find a match',exact:true}).click();
 for(const page of pages) {await page.waitForFunction(()=>window.__match?.phase==='waiting');await page.locator('.screen-room').waitFor();assert.equal(await page.locator('.ready-button:not(:disabled)').count(),1);assert.equal(await page.locator('.fight-button').isDisabled(),true);await page.locator('.ready-button:not(:disabled)').click();}
 for(const page of pages)await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
 const initial=await a.evaluate(()=>window.__snapshot.fighters.find(f=>f.id===window.__match.config.players.find(p=>p.peerId===window.__lobby.peerId).id).x);
 await a.keyboard.down('d');await a.waitForTimeout(600);await a.keyboard.up('d');await a.waitForTimeout(200);assert.notEqual(await a.evaluate(()=>window.__snapshot.fighters.find(f=>f.id===window.__match.config.players.find(p=>p.peerId===window.__lobby.peerId).id).x),initial);
 await a.locator('.match-topbar button').click();await expect(a.getByRole('dialog')).toContainText('The match continues for everyone else');const tick=await b.evaluate(()=>window.__snapshot.tick);await b.waitForFunction(before=>window.__snapshot.tick>before+45,tick);assert.equal(await b.evaluate(()=>window.__snapshot.phase),'playing');
 await a.getByRole('dialog').getByRole('button',{name:/^SETTINGS$/}).click();await a.locator('footer button').click();await a.locator('.page-heading .back-button').click();await a.locator('.page-heading .back-button').click();await expect(a.getByRole('dialog')).toBeVisible();await a.getByRole('dialog').getByRole('button',{name:/^CONTINUE/}).click();await expect(a.getByRole('dialog')).toHaveCount(0);
 await a.screenshot({path:'tmp/qa/v2-public-server-match.png',fullPage:true});await a.locator('.match-topbar button').click();await a.getByRole('dialog').getByRole('button',{name:'BACK TO LOBBY',exact:true}).click();await a.locator('.screen-public').waitFor();await b.locator('.results-screen').waitFor();assert.equal(await b.evaluate(()=>window.__snapshot.result.winners.includes(window.__match.config.players.find(p=>p.peerId===window.__lobby.peerId).id)),true);assert.equal(await b.locator('.set-score').count(),0);
 await a.locator('.page-heading .back-button').click();await a.getByTestId('mode-tournaments').click();await expect(a.locator('.feature-home')).toContainText('Elimination');await a.screenshot({path:'tmp/qa/v2-tournament-entry.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Actual server UI duel admission, serialized named fighter edits, per-seat ready, server movement, local-only pause/settings/guide/resume, forfeit result and tournament entry passed. Two independent Chromium browsers, keyboard inputs; no physical/network certification.');
} catch(error) {for(let i=0;i<pages.length;i++){console.log(`Browser ${i}:\n${(await pages[i].locator('body').innerText()).slice(-1800)}`);await pages[i].screenshot({path:`tmp/qa/v2-public-failure-${i}.png`,fullPage:true});}throw error;} finally {await browser.close();}
