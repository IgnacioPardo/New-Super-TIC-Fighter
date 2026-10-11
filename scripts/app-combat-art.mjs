// Full application pickup rendering. Deterministic match seeds, real worker spawns,
// real keyboard collection; no fabricated gameplay snapshots or unit tests.
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {enterTitle} from './enter-title.mjs';
const base=process.env.STF_APP_URL??'http://127.0.0.1:5193';
const output=process.env.STF_QA_OUTPUT??'tmp/qa/combat-art/pickups';
await mkdir(output,{recursive:true});
const browser=await chromium.launch(),report=[];
try {
 for(const [kind,seed] of Object.entries({usb:1,fan:8,firewall:24,battery:34,overclock:48})) {
  if(process.env.STF_ITEM_KINDS&&!process.env.STF_ITEM_KINDS.split(',').includes(kind))continue;
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[],failed=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().includes('/assets/expanded/')&&!response.ok())failed.push(response.url());});
  await page.addInitScript(seed=>{
   // The application chooses its match seed from Date.now; restore the clock
   // immediately after the worker receives the actual match configuration.
   const now=Date.now;Date.now=()=>seed;
   localStorage.setItem('stf-settings',JSON.stringify({language:'es',reducedMotion:true}));
   localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',items:true,hazards:false,arena:'classic',bestOf:1,players:[0,1].map(i=>({id:`p${i+1}`,name:`Fighter ${i+1}`,discipline:'iot',appearance:{hair:i,shirt:i,pants:i},team:i,kind:'human',device:`keyboard:${i}`}))}));
   Object.defineProperty(navigator,'getGamepads',{value:()=>[]});
   window.__worldText=[];
   const text=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(value,...args){window.__worldText.push(String(value));return text.call(this,value,...args);};
   const Native=window.Worker;window.Worker=class extends Native{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.snapshot){window.__snapshot=event.data.snapshot;Date.now=now;}});}};
  },seed);
  await page.goto(base);await enterTitle(page);await page.getByTestId('mode-local').click();
  for(const ready of await page.locator('.ready-button:not(:disabled)').all())await ready.click();
  await page.locator('.fight-button').click();
  await page.waitForFunction(kind=>window.__snapshot?.items?.some(item=>item.kind===kind&&item.ttl>0),kind,{timeout:25000});
  assert.equal(await page.evaluate(()=>window.__snapshot.config.seed),seed);
  await page.waitForTimeout(120);
  await page.screenshot({path:`${output}/${kind}-arena.png`});
  if(kind==='firewall') {
   await page.keyboard.down('a');await page.waitForFunction(()=>window.__snapshot.fighters[0].x<280,null,{polling:20});await page.keyboard.up('a');
   await page.waitForFunction(()=>window.__snapshot.fighters[0].grounded&&window.__snapshot.fighters[0].y>=590);
   await page.keyboard.down('d');await page.waitForFunction(()=>window.__snapshot.fighters[0].buffs?.firewall>0);await page.keyboard.up('d');
   const icon=page.locator('.hud-buff-icon');await expect(icon).toHaveCount(1);await expect(icon).toHaveAttribute('aria-label',/^Firewall/);
   assert.equal(await icon.innerText(),'');assert.ok(await icon.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0));
   const width=await icon.locator('i').evaluate(el=>el.getBoundingClientRect().width);await page.waitForTimeout(500);
   assert.ok(await icon.locator('i').evaluate(el=>el.getBoundingClientRect().width)<width);
   await page.screenshot({path:`${output}/firewall-collected-hud.png`});
  }
  const unwanted=await page.evaluate(()=>window.__worldText.filter(text=>/^(USB|FAN|VENTILADOR|CORTAFUEGOS|FIREWALL|BATER[IÍ]A|BATTERY|OVERCLOCK|DRON|DRONE|ARDUINO|ESP32|RASPBERRY|SEÑUELO|DECOY|SALTO|BOUNCE|ECO|ECHO|3D)(\s|$)/i.test(text)));
  assert.deepEqual(unwanted,[]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  report.push({kind,seed,realWorkerSpawn:true,unwantedWorldLabels:unwanted,keyboardPickupAndIconTimer:kind==='firewall',errors,failedAssets:failed});
  await page.close();console.log(`${kind}: real pickup art, no floating object text${kind==='firewall'?', keyboard collection and HUD icon timer':''}`);
 }
 await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
}finally{await browser.close();}
