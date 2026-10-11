// Complete title and online-hub layout/navigation, with real rendered application.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {enterTitle} from './enter-title.mjs';
const out='tmp/qa/v2-title';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),report=[];
try {
 for(const language of ['es','en'])for(const [width,height] of [[1366,768],[1024,640],[1440,1000],[390,844],[667,375],[1280,480]]) {
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(language=>{localStorage.setItem('stf-settings',JSON.stringify({language,reducedMotion:true}));Object.defineProperty(navigator,'getGamepads',{value:()=>[]});},language);
  await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:5193');await enterTitle(page);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.arcade-menu button').count(),3);
  for(const screen of ['title','online-hub']) {
   if(screen==='online-hub')await page.getByTestId('mode-online-hub').click();
   const bounds=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,targets:[...document.querySelectorAll('button')].filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return{text:el.textContent?.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom};})}));
   assert(bounds.scrollWidth<=width+1&&bounds.scrollHeight<=height+1,`${language} ${screen} ${width}x${height} page overflow ${JSON.stringify(bounds)}`);
   assert(bounds.targets.every(r=>r.left>=-1&&r.right<=width+1&&r.top>=-1&&r.bottom<=height+1),`${screen} unreachable controls ${JSON.stringify(bounds)}`);
   await page.mouse.move(width/2,height/2);await page.mouse.wheel(0,650);assert.equal(await page.evaluate(()=>scrollY),0);
   await page.screenshot({path:`${out}/${language}-${width}-${height}-${screen}.png`});report.push({language,width,height,screen,targets:bounds.targets.length,noPageScroll:true});
  }
  await page.keyboard.press('Escape');await expect(page.getByTestId('mode-online-hub')).toBeFocused();
  assert.deepEqual(errors,[]);await page.close();
 }
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(`${report.length} ES/EN title/hub layouts: three primary options, every visible control within viewport, wheel causes no page scroll, Back restores Online focus.`);
}finally{await browser.close();}
