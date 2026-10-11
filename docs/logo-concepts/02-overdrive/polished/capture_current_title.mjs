// Preview only: replace the logo in an isolated browser DOM. No app files change.
import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {enterTitle} from '../../../../scripts/enter-title.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url));
const source=await readFile(dir+'overdrive-primary.svg','utf8');
const src='data:image/svg+xml;base64,'+Buffer.from(source).toString('base64');
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:810},deviceScaleFactor:1});
  await page.addInitScript(()=>localStorage.setItem('stf-settings',JSON.stringify({reducedMotion:true})));
  await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:5173');
  await enterTitle(page);
  await page.locator('.hero-logo img').waitFor();
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all([...document.images].map(im=>im.decode().catch(()=>{})));
  });
  const boxes=()=>page.evaluate(()=>Object.fromEntries(['.title-screen','.title-poster','.title-menu-area','.title-cast','.title-tagline'].map(sel=>{
    const {x,y,width,height}=document.querySelector(sel).getBoundingClientRect();
    return[sel,{x,y,width,height}];
  })));
  const before=await boxes();
  await page.evaluate(async url=>{
    const wrap=document.querySelector('.hero-logo');
    const img=wrap.querySelector('img');
    const height=img.offsetHeight;
    img.style.height=height+'px';
    img.style.width='100%';
    img.style.objectFit='contain';
    img.src=url;
    img.alt='New Super TIC Fighter';
    // These belong to the old logo treatment, not to the screen layout.
    wrap.style.transform='none';
    wrap.style.filter='none';
    const stamp=wrap.querySelector('.new-stamp');
    if(stamp)stamp.style.visibility='hidden';
    await img.decode();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  },src);
  const after=await boxes();
  for(const selector of Object.keys(before))for(const dim of ['x','y','width','height']){
    if(Math.abs(before[selector][dim]-after[selector][dim])>.6)throw new Error(`Layout moved: ${selector} ${dim}: ${before[selector][dim]} -> ${after[selector][dim]}`);
  }
  await page.screenshot({path:dir+'use-cases-current-title.png'});
  await writeFile(dir+'title-placement-verification.json',JSON.stringify({viewport:{width:1440,height:810},method:'Isolated browser DOM logo replacement; no source edits',before,after},null,2));
  console.log('Captured existing title layout. Poster, menu, fighters, tagline and screen bounds unchanged.');
} finally {await browser.close()}
