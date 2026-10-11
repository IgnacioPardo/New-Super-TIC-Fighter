// Real full services; independent WebSockets and inputs are synthetic.
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
const base=process.env.STF_SERVER_URL??'http://127.0.0.1:8793',versions=await(await fetch(`${base}/api/health`)).json(),sockets=[],timers=[];
function watch(ws){const queue=[],waiters=[];ws.addEventListener('message',({data})=>{const m=JSON.parse(data),i=waiters.findIndex(w=>w.p(m));if(i>=0)waiters.splice(i,1)[0].resolve(m);else queue.push(m)});return(p,ms=5000)=>{const i=queue.findIndex(p);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={p,resolve:m=>{clearTimeout(timer);resolve(m)}};const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('Service message timeout '+p.toString()))},ms);waiters.push(w)})};}
async function connect(path,hello){const ws=new WebSocket(`${base.replace(/^http/,'ws')}${path}`),next=watch(ws);sockets.push(ws);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});ws.send(JSON.stringify({type:'hello',...versions,...hello}));if(path.includes('/api/matches/')){const heartbeat=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping',nonce:Date.now()}))},2000);ws.addEventListener('close',()=>clearInterval(heartbeat),{once:true})}return{ws,next,welcome:await next(m=>m.type==='welcome')};}
const send=(c,m)=>c.ws.send(JSON.stringify(m)),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),capacity=async()=>(await(await fetch(`${base}/api/lobby`)).json()).capacity;
const seat=(id,discipline='code')=>({id,name:id,discipline,appearance:{hair:0,shirt:0,pants:0},team:0,kind:'human',device:'keyboard:0'});
const lobby=async(players)=>{const c=await connect('/api/lobby/ws',{});send(c,{type:'seats',players});await c.next(m=>m.type==='lobby'&&m.state.party.players.length===players.length);return c;};
const prefer=(c,pool,ruleset='expanded')=>send(c,{type:'preference',preference:{pool,ruleset}});
const ready=async(c)=>{const m=await connect(`/api/matches/${c.ticket.matchId}/ws`,c.ticket);m.ticket=c.ticket;for(const id of c.ticket.seatIds)send(m,{type:'ready',seatId:id,ready:true,assetsReady:true});return m;};
try{
 assert.equal((await capacity()).activeMatches,0,'Use clean local service state for this capacity exercise');
 // Public teams retain each two-local-human party (2+2), no bot substitution.
 const teamA=await lobby([seat('a1'),seat('a2')]),teamB=await lobby([seat('b1'),seat('b2')]);prefer(teamA,'teams');prefer(teamB,'teams');send(teamA,{type:'queue',queued:true});send(teamB,{type:'queue',queued:true});
 teamA.ticket=(await teamA.next(m=>m.type==='match')).ticket;teamB.ticket=(await teamB.next(m=>m.type==='match')).ticket;assert.equal(teamA.ticket.matchId,teamB.ticket.matchId);assert.equal(teamA.ticket.config.players.length,4);assert.equal(teamA.ticket.config.players.filter(p=>p.team===0).length,2);assert.ok(teamA.ticket.config.players.every(p=>p.kind==='human'));
 const ma=await ready(teamA),mb=await ready(teamB);await ma.next(m=>m.type==='match'&&m.state.phase==='running');send(ma,{type:'forfeit'});const tr=await mb.next(m=>m.type==='result');assert.equal(tr.result.winners.length,2);ma.ws.close();mb.ws.close();teamA.ws.close();teamB.ws.close();await sleep(150);
 const tooLarge=await lobby([seat('l1'),seat('l2'),seat('l3')]);prefer(tooLarge,'teams');send(tooLarge,{type:'queue',queued:true});assert.equal((await tooLarge.next(m=>m.type==='error')).code,'party_not_compatible');tooLarge.ws.close();
 // Eight independent browsers, server-run Royale with complete Expanded state.
 const royale=[],disciplines=['networks','ai','robotics','iot','vr','games','printing','hardware'];
 for(let i=0;i<8;i++){const c=await lobby([seat(`royale${i}`,disciplines[i])]);royale.push(c);prefer(c,'royale');send(c,{type:'queue',queued:true});}
 for(const c of royale)c.ticket=(await c.next(m=>m.type==='match')).ticket;
 assert.equal(new Set(royale.map(c=>c.ticket.matchId)).size,1);const active=[];
 for(const c of royale)active.push(await ready(c));await active[0].next(m=>m.type==='snapshot'&&m.snapshot.phase==='playing',8000);
 for(const c of active){let seq=0,tick=181;timers.push(setInterval(()=>{tick+=3;send(c,{type:'input',sequence:++seq,frames:c.ticket.seatIds.map(seatId=>({seatId,tick,left:false,right:false,down:false,jump:seq%24===0,punch:seq%10===0,special:seq%17===0,guard:false,combo:false,dodge:seq%30===0}))})},50));}
 await sleep(6000);const rs=await(await fetch(`${base}/api/matches/${royale[0].ticket.matchId}`)).json();assert.equal(rs.snapshot.fighters.length,8);assert.equal(rs.config.gameMode,'royale');assert.equal(rs.config.lives,1);assert.ok(rs.snapshot.runtime);assert.ok(rs.metrics.ticks>=500);assert.equal(rs.config.players.filter(p=>p.kind==='bot').length,0);
 for(let i=0;i<7;i++){send(active[i],{type:'forfeit'});await sleep(30);}const rr=await active[7].next(m=>m.type==='result');assert.equal(rr.result.placements[active[7].ticket.seatIds[0]],1);assert.equal(rr.result.placements[active[0].ticket.seatIds[0]],8);
 for(const timer of timers)clearInterval(timer);for(const c of [...active,...royale])c.ws.close();await sleep(200);
 // Four simultaneous reservations; fifth duel remains queued until a release.
 const queued=[];for(let i=0;i<10;i++){const c=await lobby([seat(`cap${i}`)]);prefer(c,'duel','classic');send(c,{type:'queue',queued:true});queued.push(c);}
 for(let i=0;i<8;i++)queued[i].ticket=(await queued[i].next(m=>m.type==='match')).ticket;
 const full=await capacity();assert.equal(full.activeMatches,4);assert.equal(full.reason,'matches');assert.equal(full.queuedParties,2);assert.ok(full.reservedPlayerMinutes>0);assert.ok(full.usedPlayerMinutes+full.reservedPlayerMinutes<=1200);
 const held=[];for(let i=0;i<8;i++)held.push(await ready(queued[i]));await held[0].next(m=>m.type==='match'&&m.state.phase==='running');send(held[0],{type:'forfeit'});await held[1].next(m=>m.type==='result');
 const admitted=(await queued[8].next(m=>m.type==='match')).ticket;assert.ok(admitted.matchId);const admittedOther=(await queued[9].next(m=>m.type==='match')).ticket;assert.equal(admittedOther.matchId,admitted.matchId);const waiting=await connect(`/api/matches/${admitted.matchId}/ws`,admitted);send(waiting,{type:'forfeit'});await waiting.next(m=>m.type==='result');waiting.ws.close();
 for(const c of [...held,...queued])c.ws.close();await sleep(100);
 // Connection cap is applied before WebSocket admission; unauthenticated idle
 // sockets cannot exceed the same 64-seat presence limit.
 const pool=[];for(let i=0;i<64;i++)pool.push(await connect('/api/lobby/ws',{}));assert.equal((await capacity()).connections,64);
 const overflow=await new Promise((resolve,reject)=>{const request=(base.startsWith('https')?https:http).request(`${base}/api/lobby/ws`,{headers:{Upgrade:'websocket',Connection:'Upgrade'}},response=>{response.resume();resolve(response.statusCode)});request.on('error',reject);request.end();});assert.equal(overflow,429);
 const forbidden=await fetch(`${base}/api/tournaments/not-real/result`,{method:'POST',body:'{}'});assert.equal(forbidden.status,404);
 console.log(JSON.stringify({environment:'running workerd full services, synthetic inputs and independent clients',royaleId:royale[0].ticket.matchId,royaleMetrics:rs.metrics,capacityAtFour:full,passed:['public 2+2 team parties','oversized team party rejected','eight independent Royale clients','full Expanded runtime','server Royale placements','four-match reservations','fifth queue admitted after release','64 lobby connections and 65th rejection','no externally writable results']},null,2));
}finally{for(const timer of timers)clearInterval(timer);for(const ws of sockets)ws.close();}
