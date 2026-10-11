import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const dir=fileURLToPath(new URL('.', import.meta.url));
const svg=await readFile(dir+'overdrive-polished.svg','utf8');
const mono=await readFile(dir+'overdrive-polished-mono.svg','utf8');
const original=await readFile(dir+'../overdrive.svg','utf8');
const browser=await chromium.launch({headless:true});
try {
  for(const [suffix,bg,scale,transparent] of [
    ['preview','#10121b',1,false],
    ['light-preview','#eef2f6',1,false],
    ['@2x','transparent',2,true],
  ]) {
    const page=await browser.newPage({viewport:{width:1440,height:860},deviceScaleFactor:scale});
    await page.setContent(`<style>html,body{margin:0;background:${bg}}svg{display:block}</style>${svg}`);
    const filename=suffix==='@2x'?'overdrive-polished@2x.png':`overdrive-polished-${suffix}.png`;
    await page.screenshot({path:dir+filename,omitBackground:transparent});
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
  await page.setContent(`<style>
    *{box-sizing:border-box}html,body{margin:0;background:#080e19;font-family:Arial,sans-serif}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:24px}
    .cell{height:492px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#10121b;color:#aab8cb;position:relative}
    .light{background:#eef2f6;color:#43556d}.label{position:absolute;left:24px;top:20px;font-size:13px;letter-spacing:1px}
    svg{width:100%;height:auto;display:block}.small svg{width:320px}
    .small{gap:18px}
  </style><div class="grid">
    <div class="cell"><div class="label">DARK BACKGROUND</div>${svg}</div>
    <div class="cell light"><div class="label">LIGHT BACKGROUND</div>${svg}</div>
    <div class="cell"><div class="label">ONE COLOUR</div>${mono}</div>
    <div class="cell small"><div class="label">320 PX CANVAS / DARK & LIGHT</div>${svg}<div style="background:#eef2f6">${svg}</div></div>
  </div>`);
  await page.screenshot({path:dir+'appearance-check.png'});
  await page.setViewportSize({width:1600,height:640});
  await page.setContent(`<style>html,body{margin:0;background:#10121b;font-family:Arial,sans-serif;color:#aab8cb}.grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#283348}.cell{background:#10121b;padding:36px 0 20px}p{margin:0 32px;font-size:14px;letter-spacing:2px}svg{width:100%;height:auto}</style><div class="grid"><div class="cell"><p>02 / ORIGINAL</p>${original}</div><div class="cell"><p>02 / POLISHED</p>${svg}</div></div>`);
  await page.screenshot({path:dir+'before-after.png'});
  for(const key of ['primary','compact','horizontal','flat','mono-light','mono-dark','mark','mark-mono']) {
    const source=await readFile(dir+`overdrive-${key}.svg`,'utf8');
    const [,view]=source.match(/viewBox="([^"]+)"/);
    const [, ,width,height]=view.split(' ').map(Number);
    const outputWidth=key.startsWith('mark')?1024:key==='horizontal'?1600:2400;
    const outputHeight=Math.ceil(outputWidth*height/width);
    await page.setViewportSize({width:outputWidth,height:outputHeight});
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${outputWidth}px;height:${outputHeight}px}</style>${source}`);
    await page.screenshot({path:dir+`overdrive-${key}.png`,omitBackground:true});
  }
  for(const size of [16,24,32,48,64,128,180,192,512,1024]) {
    const source=await readFile(dir+(size<=24?'overdrive-icon-micro.svg':'overdrive-icon.svg'),'utf8');
    await page.setViewportSize({width:size,height:size});
    await page.setContent(`<style>html,body{margin:0;background:${size===180?'#101827':'transparent'}}svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
    await page.screenshot({path:dir+`overdrive-icon-${size}.png`,omitBackground:size!==180});
  }
  const maskable=await readFile(dir+'overdrive-icon-maskable.svg','utf8');
  await page.setViewportSize({width:512,height:512});
  await page.setContent(`<style>html,body{margin:0;background:#101827}svg{display:block;width:512px;height:512px}</style>${maskable}`);
  await page.screenshot({path:dir+'overdrive-icon-maskable-512.png'});
} finally {
  await browser.close();
}
console.log('Rendered polished Overdrive and appearance comparisons.');
