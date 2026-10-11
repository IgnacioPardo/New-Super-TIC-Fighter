// A real workerd process is killed and restarted against its durable storage.
// Inputs and the process outage are synthetic; this is not a production eviction.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const port=Number(process.env.STF_RECOVERY_PORT??8794),base=`http://127.0.0.1:${port}`,persist=await mkdtemp(join(tmpdir(),'stf-recovery-')),sockets=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let service,logs='';
async function start(){
 service=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--port',String(port),'--persist-to',persist],{detached:true,stdio:['ignore','pipe','pipe']});
 for(const stream of [service.stdout,service.stderr])stream.on('data',chunk=>{logs=(logs+chunk.toString()).slice(-6000)});
 for(let attempt=0;attempt<160;attempt++){if(service.exitCode!==null)throw new Error('Recovery service exited');try{const r=await fetch(`${base}/api/health`);if(r.ok)return await r.json()}catch{}await sleep(100)}
 throw new Error('Recovery service did not start');
}
async function stop(){if(!service)return;const child=service;service=undefined;const exited=new Promise(resolve=>child.once('exit',resolve));try{process.kill(-child.pid,'SIGKILL')}catch{}await exited;await sleep(200);}
function watch(ws){const queue=[],waiters=[];ws.addEventListener('message',({data})=>{if(data==='pong')return;const message=JSON.parse(data),i=waiters.findIndex(w=>w.p(message));if(i>=0)waiters.splice(i,1)[0].resolve(message);else queue.push(message)});return(p,ms=8000)=>{const i=queue.findIndex(p);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const waiter={p,resolve:m=>{clearTimeout(timer);resolve(m)}};const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);reject(new Error('Recovery message timeout '+p.toString()))},ms);waiters.push(waiter)})};}
async function connect(ticket,versions){const ws=new WebSocket(`${base.replace('http','ws')}/api/matches/${ticket.matchId}/ws`),next=watch(ws);sockets.push(ws);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});ws.send(JSON.stringify({type:'hello',...versions,peerId:ticket.peerId,token:ticket.token}));const heartbeat=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping',nonce:Date.now()}))},2000);ws.addEventListener('close',()=>clearInterval(heartbeat),{once:true});return{ws,next,welcome:await next(m=>m.type==='welcome')};}
const send=(c,m)=>c.ws.send(JSON.stringify(m)),state=async id=>(await(await fetch(`${base}/api/matches/${id}`)).json());
try{
 const versions=await start();
 const config={ruleset:'expanded',gameMode:'stock',mode:'ffa',arena:'virtual',lives:3,timeLimit:300,friendlyFire:false,practice:false,seed:456,players:['robotics','iot'].map((discipline,i)=>({id:`seat${i}`,peerId:`peer${i}`,name:`Recovery ${i}`,discipline,appearance:{hair:0,shirt:0,pants:0},team:i,kind:'human',device:'keyboard:0'}))};
 const r=await fetch(`${base}/api/feasibility`,{method:'POST',headers:{'X-Feasibility-Key':process.env.STF_FEASIBILITY_KEY??'local-measurement-only','Content-Type':'application/json'},body:JSON.stringify(config)}),admission=await r.json();assert.equal(r.status,201,JSON.stringify(admission));
 const first=[];for(const ticket of admission.tickets)first.push(await connect(ticket,versions));for(let i=0;i<first.length;i++)for(const seatId of admission.tickets[i].seatIds)send(first[i],{type:'ready',seatId,ready:true,assetsReady:true});
 await first[0].next(m=>m.type==='snapshot'&&m.snapshot.phase==='playing');
 for(let i=0;i<first.length;i++){const snapshot=(await state(admission.matchId)).snapshot;send(first[i],{type:'input',sequence:100+i,frames:[{seatId:admission.tickets[i].seatIds[0],tick:snapshot.tick+1,left:false,right:true,down:false,jump:true,punch:false,special:true,guard:false,combo:false,dodge:false}]})}
 await sleep(5500);const before=await state(admission.matchId);assert.ok(before.snapshot.runtime);assert.ok(before.metrics.checkpointCount>=2);assert.ok(before.metrics.inputPackets>=2);
 await stop();const restartAt=performance.now();const restoredVersions=await start(),restartMs=performance.now()-restartAt,after=await state(admission.matchId);assert.equal(after.phase,'running');assert.ok(after.snapshot.runtime);assert.equal(after.interrupted,undefined);assert.ok(after.snapshot.tick<=before.snapshot.tick+60);assert.ok(after.snapshot.tick>=before.snapshot.tick-360);
 const resumed=[];for(const ticket of admission.tickets)resumed.push(await connect(ticket,restoredVersions));
 for(let i=0;i<resumed.length;i++){const ack=resumed[i].welcome.inputSequence;assert.ok(ack>=100+i,'Restored server must return the input sequence');const snapshot=resumed[i].welcome.state.snapshot,tick=Math.max(snapshot.tick,...(snapshot.acknowledgedInputs??[]).map(f=>f.tick))+1;send(resumed[i],{type:'input',sequence:ack+1,frames:[{seatId:admission.tickets[i].seatIds[0],tick,left:true,right:false,down:false,jump:false,punch:true,special:false,guard:false,combo:false,dodge:false}]});await resumed[i].next(m=>m.type==='snapshot'&&m.snapshot.acknowledgedInputs?.some(f=>f.seatId===admission.tickets[i].seatIds[0]&&f.tick===tick))}
 const reconnected=await state(admission.matchId);assert.ok(reconnected.metrics.inputPackets>after.metrics.inputPackets);assert.ok(reconnected.snapshot.tick>after.snapshot.tick);
 resumed[0].ws.close();const disconnectAt=performance.now(),disconnectedTick=reconnected.snapshot.tick;
 await sleep(1000);const continuing=await state(admission.matchId);assert.equal(continuing.phase,'running');assert.ok(continuing.snapshot.tick>disconnectedTick+40,'Remaining players must continue during reconnect');
 const result=await resumed[1].next(m=>m.type==='result',18000);assert.equal(result.result.reason,'last-standing');assert.equal(result.result.winners[0],admission.tickets[1].seatIds[0]);assert.ok(performance.now()-disconnectAt>=14000);
 const finished=await state(admission.matchId);assert.ok(finished.peers.find(p=>p.peerId===admission.tickets[0].peerId).forfeited);assert.equal(finished.resultId,result.resultId);assert.deepEqual(finished.result,result.result);
 console.log(JSON.stringify({environment:'local workerd, real process kill/restart, synthetic inputs and outage',matchId:admission.matchId,restartMs,checkpointRollbackTicks:before.snapshot.tick-after.snapshot.tick,passed:['Expanded full runtime checkpoint restored','restart continues authoritative simulation','refresh adopts server input sequence','new input acknowledged after restart','disconnect leaves others running','15-second disconnect forfeits','stable server result identity']},null,2));
}catch(error){console.error(error);process.exitCode=1;}finally{for(const ws of sockets)ws.close();await stop();await rm(persist,{recursive:true,force:true});}
