// Two complete browsers and the real match service. Delay genuine prediction
// callbacks across the authoritative result to exercise main-thread backlog.
import assert from 'node:assert/strict';
import {chromium, expect} from '@playwright/test';
import {enterTitle, chooseMode} from './enter-title.mjs';
const browser=await chromium.launch({headless:true});
const pages=[],errors=[];
try {
 for(let i=0;i<2;i++) {
  const page=await browser.newPage({viewport:{width:1366,height:768}});pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   localStorage.setItem('stf-settings',JSON.stringify({language:'en',reducedMotion:true}));
   localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',players:[{id:'p1',name:'Terminal race',discipline:'code',kind:'human',team:0,device:'keyboard:0',appearance:{hair:0,shirt:0,pants:0}},{id:'p2',name:'CPU',discipline:'hardware',kind:'bot',difficulty:'normal',team:1,device:'bot',appearance:{hair:1,shirt:1,pants:1}}]}));
   const NativeWorker=window.Worker, NativeSocket=window.WebSocket;
   window.__heldPredictions=[];window.__releasedPredictions=0;
   window.Worker=class extends NativeWorker {
    set onmessage(handler) {super.onmessage=event=>{
     if(window.__holdPredictions&&event.data?.phase==='playing')window.__heldPredictions.push(()=>handler.call(this,event));
     else handler.call(this,event);
    };}
   };
   window.WebSocket=class extends NativeSocket {constructor(...args){super(...args);this.addEventListener('message',event=>{
    if(event.data==='pong')return;const message=JSON.parse(event.data);
    if(message.type==='snapshot')window.__serverSnapshot=message.snapshot;
    if(message.type==='result')window.__serverResult=message;
   });}
   set onmessage(handler){super.onmessage=event=>{
    handler?.call(this,event);if(event.data==='pong')return;const message=JSON.parse(event.data);
    if(message.type==='match'&&message.state?.phase==='finished'){
     const pending=window.__heldPredictions.splice(0);window.__releasedPredictions+=pending.length;for(const deliver of pending)deliver();
    }
   };}};
  });
  await page.goto(process.env.STF_APP_URL??'http://127.0.0.1:5193');await enterTitle(page);await chooseMode(page,'public');
  await expect(page.getByRole('button',{name:'Find a match',exact:true})).toBeEnabled();
 }
 for(const page of pages)await page.getByRole('button',{name:'Find a match',exact:true}).click();
 for(const page of pages){await page.locator('.screen-room').waitFor();await page.locator('.ready-button:not(:disabled)').click();}
 for(const page of pages)await page.waitForFunction(()=>window.__serverSnapshot?.phase==='playing');
 const [a,b]=pages;
 await b.evaluate(()=>window.__holdPredictions=true);
 await b.waitForFunction(()=>window.__heldPredictions.length>=4);
 await a.locator('.match-topbar button').click();
 await a.getByRole('dialog').getByRole('button',{name:'BACK TO LOBBY',exact:true}).click();
 await b.waitForFunction(()=>window.__serverResult&&window.__releasedPredictions>0);
 await expect(b.locator('.results-screen')).toBeVisible();
 await b.waitForTimeout(350);
 await expect(b.locator('.results-screen')).toBeVisible();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({scenario:'authoritative result survives delayed genuine worker callbacks',delayedCallbacks:await b.evaluate(()=>window.__releasedPredictions),serverResult:await b.evaluate(()=>window.__serverResult.result.reason),errors}));
} finally {await browser.close();}
