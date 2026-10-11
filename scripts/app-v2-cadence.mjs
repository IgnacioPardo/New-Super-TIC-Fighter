// Whole rendered application cadence; uses real workers and keyboard events.
// Headless Chromium/SwiftShader is not the owner's Arc/native GPU.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {enterTitle} from './enter-title.mjs';
const out=process.env.STF_QA_OUTPUT??'tmp/qa/v2-cadence';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 localStorage.setItem('stf-settings',JSON.stringify({language:'en',reducedMotion:true}));
 localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',gameMode:'royale',arena:'arcade',bestOf:1,lives:1,timeLimit:240,players:['networks','design','code','hardware','ai','robotics','iot','printing'].map((discipline,index)=>({id:`p${index+1}`,name:`Cadence ${index+1}`,discipline,kind:index?'bot':'human',difficulty:'hard',team:index%2,device:index?'bot':'keyboard:0',appearance:{hair:index%4,shirt:index%4,pants:index%4}}))}));
 Object.defineProperty(navigator,'getGamepads',{value:()=>[]});
 window.__samples={frames:[],snapshots:[],inputResponses:[]};
 window.__sampling=false;
 const Native=window.Worker;window.Worker=class extends Native{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type!=='snapshot')return;window.__snapshot=event.data.snapshot;if(window.__sampling)window.__samples.snapshots.push({at:performance.now(),tick:window.__snapshot.tick,elapsed:window.__snapshot.elapsed,phase:window.__snapshot.phase,hidden:document.hidden});if(window.__awaitJump&&window.__snapshot.fighters[0]?.action==='jump'){window.__samples.inputResponses.push(performance.now()-window.__awaitJump);window.__awaitJump=0;}});}};
 const frame=time=>{if(window.__sampling)window.__samples.frames.push(time);requestAnimationFrame(frame);};requestAnimationFrame(frame);
 addEventListener('keydown',event=>{if(event.code==='KeyW'&&window.__sampling)window.__awaitJump=performance.now();});
});
const percentile=(samples,p)=>[...samples].sort((a,b)=>a-b)[Math.min(samples.length-1,Math.floor(samples.length*p))]??null;
const summarize=samples=>({count:samples.length,p50:percentile(samples,.5),p95:percentile(samples,.95),p99:percentile(samples,.99),max:samples.length?Math.max(...samples):null});
try{
 await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:5193');await enterTitle(page);await page.getByTestId('mode-local').click();
 for(const button of await page.locator('.ready-button:not(:disabled)').all())await button.click();await page.locator('.fight-button').click();await page.waitForFunction(()=>window.__snapshot?.phase==='playing');
 await page.evaluate(()=>window.__sampling=true);
 for(let second=0;second<25;second++){if(second%3===0)await page.keyboard.press('w');if(second%4===0)await page.keyboard.press('x');await page.waitForTimeout(1000);}
 const sample=await page.evaluate(()=>{window.__sampling=false;const canvas=document.querySelector('canvas'),gl=canvas?.getContext('webgl2')??canvas?.getContext('webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return{...window.__samples,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',fighters:window.__snapshot.fighters.length,phase:window.__snapshot.phase};});
 const delta=values=>values.slice(1).map((value,index)=>value-values[index]);const first=sample.snapshots[0],last=sample.snapshots.at(-1);
 const report={environment:'isolated Playwright Chromium, 1366×768, eight Expanded fighters on Arcade Circuit, real local worker and synthetic keyboard input',renderer:sample.renderer,seconds:(last.at-first.at)/1000,simulationHz:(last.tick-first.tick)*1000/(last.at-first.at),rAFMilliseconds:summarize(delta(sample.frames)),snapshotMilliseconds:summarize(delta(sample.snapshots.map(item=>item.at))),inputToWorkerJumpMilliseconds:summarize(sample.inputResponses),hiddenSnapshots:sample.snapshots.filter(item=>item.hidden).length,fighters:sample.fighters,finalPhase:sample.phase,errors};
 assert.deepEqual(errors,[]);assert.equal(sample.fighters,8);assert.equal(report.hiddenSnapshots,0);
 await page.screenshot({path:`${out}/royale-cadence.png`});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
