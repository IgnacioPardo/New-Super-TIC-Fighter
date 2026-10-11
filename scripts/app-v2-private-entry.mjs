import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {enterTitle,chooseMode} from './enter-title.mjs';
await mkdir('tmp/qa/v2-private-entry',{recursive:true});
const browser=await chromium.launch();
try {
 for(const language of ['es','en'])for(const [width,height] of [[1366,768],[1024,640],[1440,1000],[390,844]]) {
  const page=await browser.newPage({viewport:{width,height}});await page.addInitScript(language=>{localStorage.setItem('stf-settings',JSON.stringify({language,reducedMotion:true}));},language);
  await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:5193');await enterTitle(page);await chooseMode(page,'online');
  for(const name of language==='es'?['CREAR SALA','ENTRAR']:['CREATE ROOM','JOIN']) {
   await page.getByRole('tab',{name,exact:true}).click();
   const g=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,clipped:[...document.querySelectorAll('button,input,.online-form small,.online-explain')].filter(e=>e.getClientRects().length).map(e=>({text:e.textContent,rect:e.getBoundingClientRect()})).filter(({rect:r})=>r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1).map(e=>e.text)}));assert(g.width<=width+1&&g.height<=height+1,JSON.stringify(g));assert.deepEqual(g.clipped,[]);
   await page.screenshot({path:`tmp/qa/v2-private-entry/${language}-${width}-${name}.png`});
  }
  await page.locator('.code-input').fill('ABCD234567');await page.getByRole('tab',{name:language==='es'?'CREAR SALA':'CREATE ROOM',exact:true}).click();await page.getByRole('tab',{name:language==='es'?'ENTRAR':'JOIN',exact:true}).click();await expect(page.locator('.code-input')).toHaveValue('ABCD234567');
  await page.locator('.back-button').click();await expect(page.getByTestId('mode-online')).toBeFocused();await page.close();
 }
 console.log('16 ES/EN private Create/Join views fit desktop/narrow sizes; code draft preserved across tabs and Back restores Private Room focus.');
}finally{await browser.close();}
