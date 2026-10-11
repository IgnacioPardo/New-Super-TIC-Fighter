// Actual rendered app + authoritative services. Network conditions are injected
// at the browser/application boundary; they are not physical WAN/hardware tests.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { enterTitle, chooseMode } from './enter-title.mjs';
const app=process.env.STF_APP_URL??'http://127.0.0.1:5193',server=process.env.STF_SERVER_URL??'http://127.0.0.1:8787',output=process.env.STF_BROWSER_REPORT??'tmp/qa/public-browser-perturbation.json';
const headless=process.env.STF_BROWSER_HEADLESS!=='false';
const browser=await chromium.launch({headless,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']}),pages=[],errors=[];
const count=Number(process.env.STF_BROWSER_COUNT??8);assert.ok(count===2||count===8,'This exercise supports duel2 or Royale8');
await mkdir('tmp/qa',{recursive:true});
async function open(index){
 const context=await browser.newContext({viewport:{width:1024,height:640}}),page=await context.newPage();pages.push(page);page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(index=>{
  localStorage.setItem('stf-settings',JSON.stringify({language:'en',reducedMotion:true}));
  localStorage.setItem('stf-match',JSON.stringify({ruleset:'expanded',players:[{id:'p1',name:`QA Browser ${index}`,discipline:['networks','ai','robotics','iot','vr','games','printing','hardware'][index],kind:'human',team:0,device:'keyboard:0',appearance:{hair:0,shirt:index%4,pants:0}},{id:'p2',name:'CPU',discipline:'code',kind:'bot',difficulty:'normal',team:1,device:'bot',appearance:{hair:0,shirt:0,pants:0}}]}));
  window.__net={mode:'none',sockets:[],outCount:0,inCount:0,droppedInputs:0,droppedSnapshots:0,delayedInputs:0,delayedSnapshots:0,authorityMessages:0,actionPackets:0,errors:[],welcomes:0,history:[]};
  const NativeWS=window.WebSocket,replays=new WeakSet();
  window.WebSocket=class extends NativeWS{
   constructor(...args){super(...args);window.__net.sockets.push(this);const surface=this.url.includes('/api/matches/')?'match':this.url.includes('/api/lobby/')?'lobby':'other';for(const kind of ['open','close','error'])this.addEventListener(kind,event=>{window.__net.history.push({surface,kind,at:performance.now(),code:event.code});window.__net.history=window.__net.history.slice(-60)});this.addEventListener('message',event=>{
    if(event.data==='pong')return;let m;try{m=JSON.parse(event.data)}catch{return}
    if(!replays.has(event)&&m.type==='snapshot'){
     window.__wireSnapshot=m.snapshot;
     if(window.__net.mode==='jitter'){const count=++window.__net.inCount;if(count%7===0){window.__net.droppedSnapshots++;event.stopImmediatePropagation();return}const delay=[20,150,60,220][count%4];window.__net.delayedSnapshots++;event.stopImmediatePropagation();setTimeout(()=>{if(this.readyState!==NativeWS.OPEN)return;const replay=new MessageEvent('message',{data:event.data});replays.add(replay);this.dispatchEvent(replay)},delay);return}
    }
    if(m.type==='welcome'&&m.state?.authority==='server')window.__net.welcomes++;
    if(m.type==='welcome')window.__net.history.push({surface,kind:'welcome',phase:m.state?.phase,at:performance.now()});
    if(m.type==='lobby'||m.type==='welcome'&&m.state?.party)window.__lobby=m.state;
    if(m.type==='match'&&m.state||m.type==='welcome'&&m.state?.authority==='server')window.__match=m.state;
    if(m.type==='snapshot'||m.type==='result')window.__snapshot=m.snapshot;
    if(m.type==='error')window.__net.errors.push(m.code);
   },true)}
   send(data){let m;try{m=JSON.parse(data)}catch{return super.send(data)}if(m.type==='input'&&m.frames.some(frame=>frame.left||frame.right||frame.jump||frame.punch||frame.special||frame.dodge))window.__net.actionPackets++;if(m.type==='input'&&window.__net.mode==='jitter'){const count=++window.__net.outCount;if(count%5===0){window.__net.droppedInputs++;return}const delay=[0,80,170,30][count%4];window.__net.delayedInputs++;setTimeout(()=>{if(this.readyState===NativeWS.OPEN)NativeWS.prototype.send.call(this,data)},delay);return}return super.send(data)}
  };
  const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{postMessage(message,...rest){if(message.type==='authority')window.__net.authorityMessages++;return super.postMessage(message,...rest)}};
 },index);
 await page.goto(app);await enterTitle(page);await chooseMode(page,'public');await page.waitForFunction(()=>window.__lobby?.party.players.length===1);
 if(count===8){for(let i=0;i<3;i++)await page.getByRole('button',{name:/^Playlist:/}).click();await page.waitForFunction(()=>window.__lobby.party.preference.pool==='royale')}return page;
}
const getState=async id=>(await(await fetch(`${server}/api/matches/${id}`)).json()),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let matchId,report;
try{
 assert.equal((await(await fetch(`${server}/api/lobby`)).json()).capacity.activeMatches,0,'Use an idle service pool');
 for(let i=0;i<count;i++)await open(i);
 for(const page of pages)await page.getByRole('button',{name:'Find a match',exact:true}).click();
 for(const page of pages){await page.waitForFunction(()=>window.__match?.phase==='waiting');await page.locator('.ready-button:not(:disabled)').click()}
 await Promise.all(pages.map(page=>page.waitForFunction(()=>window.__snapshot?.phase==='playing',null,{timeout:20000})));
 matchId=await pages[0].evaluate(()=>window.__match.matchId);assert.equal(new Set(await Promise.all(pages.map(page=>page.evaluate(()=>window.__match.matchId)))).size,1);
 for(const page of pages){await page.locator('.game-canvas-wrap canvas').waitFor();assert.equal(await page.evaluate(()=>window.__snapshot.fighters.length),count)}
 const baseline=await Promise.all(pages.map(page=>page.evaluate(()=>window.__net.authorityMessages)));await pause(2000);
 const authorityDeltas=await Promise.all(pages.map((page,i)=>page.evaluate(before=>window.__net.authorityMessages-before,baseline[i])));
 assert.ok(authorityDeltas.every(count=>count>=10),`Predicted frames must not suppress authoritative reconciliation: ${authorityDeltas}`);
 const a=pages[0],observer=pages[1];await a.bringToFront();if(await a.locator('.pause-panel').isVisible())await a.locator('.pause-panel .primary-button').click();
 await a.evaluate(()=>{window.__net.mode='jitter'});const jitterStart=(await getState(matchId)).snapshot.tick,authorityBefore=await a.evaluate(()=>window.__net.authorityMessages);
 await a.keyboard.down('d');await pause(900);await a.keyboard.up('d');await a.keyboard.press('z');await pause(4100);await a.evaluate(()=>{window.__net.mode='none'});await pause(400);
 const jitterState=await getState(matchId),injections=await a.evaluate(()=>({droppedInputs:window.__net.droppedInputs,droppedSnapshots:window.__net.droppedSnapshots,delayedInputs:window.__net.delayedInputs,delayedSnapshots:window.__net.delayedSnapshots,authorities:window.__net.authorityMessages}));assert.ok(injections.droppedInputs>0&&injections.droppedSnapshots>0);assert.ok(injections.authorities>authorityBefore+10);assert.ok(jitterState.snapshot.tick>jitterStart+240);assert.equal(jitterState.phase,'running');
 const beforeOffline=await getState(matchId),welcomes=await a.evaluate(()=>window.__net.welcomes);await a.context().setOffline(true);await a.evaluate(()=>{for(const ws of window.__net.sockets)if(ws.url.includes('/api/matches/')||ws.url.includes('/api/lobby/'))ws.close()});
 await pause(3000);const whileOffline=await getState(matchId);assert.equal(whileOffline.phase,'running');assert.ok(whileOffline.snapshot.tick>beforeOffline.snapshot.tick+120);await a.context().setOffline(false);
 await a.waitForFunction(before=>window.__net.welcomes>before,welcomes,{timeout:10000,polling:100});await a.waitForFunction(()=>window.__snapshot.phase==='playing');assert.equal(await a.evaluate(()=>window.__match.matchId),matchId);
 let backgroundTab,backgroundWindow;const backgroundCDP=await a.context().newCDPSession(a);if(headless){backgroundTab=await a.context().newPage();await backgroundTab.goto('about:blank');await backgroundTab.bringToFront()}else{backgroundWindow=await backgroundCDP.send('Browser.getWindowForTarget');await backgroundCDP.send('Browser.setWindowBounds',{windowId:backgroundWindow.windowId,bounds:{windowState:'minimized'}})}const visibility=await a.evaluate(()=>document.visibilityState),beforeBackground=await getState(matchId);let whileBackground;try{await pause(2000);whileBackground=await getState(matchId);assert.ok(whileBackground.snapshot.tick>beforeBackground.snapshot.tick+90)}finally{if(backgroundTab)await backgroundTab.close();if(backgroundWindow)await backgroundCDP.send('Browser.setWindowBounds',{windowId:backgroundWindow.windowId,bounds:{windowState:'normal'}})}await a.bringToFront();
 const beforeFreeze=await getState(matchId),cdp=await a.context().newCDPSession(a);let whileFrozen;try{await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await pause(5000);whileFrozen=await getState(matchId);assert.equal(whileFrozen.phase,'running');assert.ok(whileFrozen.snapshot.tick>beforeFreeze.snapshot.tick+240)}finally{await cdp.send('Page.setWebLifecycleState',{state:'active'})}await a.waitForFunction(tick=>window.__snapshot.tick>tick,whileFrozen.snapshot.tick,{timeout:10000});
 await a.bringToFront();if(await a.locator('.pause-panel').isVisible())await a.locator('.pause-panel .primary-button').click();const actionPackets=await a.evaluate(()=>window.__net.actionPackets);await a.keyboard.down('a');await pause(350);await a.keyboard.up('a');assert.ok(await a.evaluate(before=>window.__net.actionPackets>before,actionPackets),'Controls must generate action packets after suspension');const observerTick=await observer.evaluate(()=>window.__snapshot.tick);await observer.waitForFunction(tick=>window.__snapshot.tick>tick+30,observerTick);
 const finalState=await getState(matchId);const snapshots=await Promise.all(pages.map(page=>page.evaluate(()=>({matchId:window.__match.matchId,tick:window.__snapshot.tick,fighters:window.__snapshot.fighters.length,canvas:!!document.querySelector('.game-canvas-wrap canvas'),peerId:window.__lobby.peerId,errors:window.__net.errors}))));assert.equal(new Set(snapshots.map(s=>s.peerId)).size,count);assert.ok(snapshots.every(s=>s.canvas&&s.fighters===count));assert.deepEqual(errors,[]);assert.ok(snapshots.every(s=>s.errors.length===0),JSON.stringify(snapshots.map(s=>s.errors)));
 for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:`tmp/qa/public-royale-browser-${i}.png`});
 const welcomesBeforeLeave=await a.evaluate(()=>window.__net.welcomes);await a.getByRole('button',{name:/PAUSED/}).click();await a.locator('.pause-panel').getByRole('button',{name:'BACK TO LOBBY',exact:true}).click();await a.getByRole('button',{name:'Find a match',exact:true}).waitFor();await a.context().setOffline(true);await pause(300);await a.context().setOffline(false);await pause(2500);assert.equal(await a.evaluate(()=>window.__net.welcomes),welcomesBeforeLeave,'Explicit leave must not reconnect match');assert.equal(await a.evaluate(()=>window.__net.sockets.filter(ws=>ws.url.includes('/api/matches/')&&ws.readyState===WebSocket.OPEN).length),0);
 report={environment:`${headless?'headless':'visible'} Chromium, ${count} isolated browser contexts, actual rendered React/Phaser app and workerd authority`,app,server,matchId,recordedAt:new Date().toISOString(),ruleset:finalState.config.ruleset,disciplines:finalState.config.players.map(player=>player.discipline),baselineAuthorityMessagesOverTwoSeconds:authorityDeltas,jitter:injections,offline:{durationMs:3000,serverTickDelta:whileOffline.snapshot.tick-beforeOffline.snapshot.tick,reconnected:true},background:{durationMs:2000,method:headless?'second browser page':'minimized browser window',visibility,requestedWindowState:backgroundWindow?'minimized':undefined,serverTickDelta:whileBackground.snapshot.tick-beforeBackground.snapshot.tick},pageFreeze:{durationMs:5000,serverTickDelta:whileFrozen.snapshot.tick-beforeFreeze.snapshot.tick,resumed:true},clients:snapshots,passed:[`${count} rendered independent ${count===8?'Royale':'duel'} browsers`,'authority reconciliation under prediction','injected input and snapshot jitter/drop','offline requests and socket reconnect within 15 seconds','server advances during offline and page suspension','rendering/control resumes after page freeze','explicit leave followed by offline/online does not reopen match'],limitations:['Delay/drop occurs at application packet boundary, not physical WAN packet loss','Offline and socket closure are injected','Page freeze is Chromium lifecycle suspension, not OS sleep','All browsers share one Mac and Internet connection','Background timer/renderer throttling disabled for independent multiplayer fixture','This Mac Chromium automation retains visible document state even when browser window is minimized','Keyboard events are automated, no physical gamepads']};await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error);for(let i=0;i<pages.length;i++)console.log(JSON.stringify({browser:i,state:await pages[i].evaluate(()=>({url:location.href,match:window.__match?.phase,tick:window.__snapshot?.tick,authority:window.__net?.authorityMessages,errors:window.__net?.errors,welcomes:window.__net?.welcomes,history:window.__net?.history,body:document.body.innerText.slice(-500)})).catch(()=>null)}));process.exitCode=1;}finally{
 for(const page of pages){await page.context().setOffline(false).catch(()=>{});await page.evaluate(()=>{for(const ws of window.__net?.sockets??[])if(ws.url.includes('/api/matches/')&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'forfeit'}))}).catch(()=>{})}await browser.close();
}
