import { enterTitle } from './enter-title.mjs';
// Real complete-app regression: UI setup -> native worker result -> title -> settings/guide.
// No simulation adapter, fabricated snapshot, or direct simulation command.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
await mkdir('tmp/qa/v2-results',{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 Object.defineProperty(navigator, 'getGamepads', { value: () => [] });
 const NativeWorker=window.Worker;
 window.Worker=class extends NativeWorker {
  constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='snapshot')window.__resultSnapshot=event.data.snapshot;});}
 };
});
try {
 await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:4173');
 await enterTitle(page);
 await page.getByTestId('mode-local').click();
 await page.locator('.match-summary').click();await page.getByRole('tab',{name:'Partida',exact:true}).click();
 const lives=page.getByRole('button',{name:/^Vidas:/});await lives.focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Escape');
 for(const button of await page.locator('.ready-button:not(:disabled)').all())await button.click();
 await page.locator('.fight-button').click();
 await page.waitForFunction(()=>window.__resultSnapshot?.phase==='playing',null,{timeout:15000});
 await page.keyboard.down('d');
 await page.waitForFunction(()=>window.__resultSnapshot?.phase==='finished',null,{timeout:15000});
 await page.keyboard.up('d');
 await page.locator('.results-screen').waitFor();
 assert.equal(await page.evaluate(()=>window.__resultSnapshot.result.reason),'last-standing');
 for(const language of ['es','en']) {
  if(language==='en')await page.getByRole('button',{name:'Idioma',exact:true}).click();
  for(const [width,height] of [[1366,768],[1024,640],[1440,1000],[390,844]]) {
   await page.setViewportSize({width,height});
   for(const name of language==='es'?['Podio','Marcador']:['Podium','Scoreboard']) {
    await page.getByRole('tab',{name,exact:true}).click();
    const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,clipped:[...document.querySelectorAll('button,.result-fighters h2,.result-scoreboard strong')].filter(e=>e.getClientRects().length).map(e=>({text:e.textContent,rect:e.getBoundingClientRect()})).filter(({rect:r})=>r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1).map(e=>e.text)}));
    assert(layout.width<=width+1&&layout.height<=height+1,`${language} ${name} ${width}x${height} overflows: ${JSON.stringify(layout)}`);assert.deepEqual(layout.clipped,[]);
    await page.screenshot({path:`tmp/qa/v2-results/${language}-${width}-${name}.png`});
   }
  }
 }
 await page.setViewportSize({width:1440,height:1100});

 await page.locator('.brand-button').click();
 await page.getByTestId('mode-settings').click();
 await page.locator('.settings-home').waitFor();
 await page.waitForTimeout(600);
 assert.equal(await page.locator('.settings-home').count(),1);
 assert.equal(await page.locator('.results-screen').count(),0);
 await page.locator('.back-button').click();
 await page.getByTestId('mode-guide').click();
 await page.waitForTimeout(600);
 assert.equal(await page.locator('.app.screen-guide').count(),1);
 assert.equal(await page.locator('.results-screen').count(),0);
 assert.deepEqual(errors,[]);
 console.log('Real worker last-standing result -> brand/title -> Settings and Guide remain open; no browser errors.');
} finally {await browser.close();}
