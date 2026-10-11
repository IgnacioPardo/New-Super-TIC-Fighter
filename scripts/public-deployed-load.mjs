// Real deployed services with independent synthetic browser identities/inputs.
// No claim of physical hardware, independent Internet connections, or CPU billing.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base=process.env.STF_SERVER_URL;
assert.ok(base,'Set STF_SERVER_URL explicitly; this script must not default to production.');
const seconds=Number(process.env.STF_LOAD_SECONDS??15),versions=await(await fetch(`${base}/api/health`)).json(),sockets=[],timers=[],matches=[],errors=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),get=async path=>(await(await fetch(`${base}${path}`)).json()),send=(c,m)=>c.ws.send(JSON.stringify(m));
function watch(ws){const queue=[],waiters=[];ws.addEventListener('message',({data})=>{if(data==='pong')return;const m=JSON.parse(data);if(m.type==='error'){errors.push(m.code);if(errors.length<=5)console.error(m)}const i=waiters.findIndex(w=>w.p(m));if(i>=0)waiters.splice(i,1)[0].resolve(m);else{queue.push(m);if(queue.length>1200)queue.shift()}});return(p,ms=12000)=>{const i=queue.findIndex(p);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={p,resolve:m=>{clearTimeout(timer);resolve(m)}};const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('Deployed service timeout '+p.toString()))},ms);waiters.push(w)})};}
async function connect(path,hello){const ws=new WebSocket(`${base.replace(/^http/,'ws')}${path}`),next=watch(ws);sockets.push(ws);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});ws.send(JSON.stringify({type:'hello',...versions,...hello}));return{ws,next,welcome:await next(m=>m.type==='welcome')};}
const seat=(id,discipline='code')=>({id:id.replace(/\s/g,'_'),name:`QA ${id}`.slice(0,24),discipline,appearance:{hair:0,shirt:0,pants:0},team:0,kind:'human',device:'keyboard:0'});
async function create(pool,players){
 const peers=[];
 for(const roster of players){const c=await connect('/api/lobby/ws',{});send(c,{type:'seats',players:roster});await c.next(m=>m.type==='lobby'&&m.state.party.players.length===roster.length);send(c,{type:'preference',preference:{pool,ruleset:pool==='royale'?'expanded':'classic'}});send(c,{type:'queue',queued:true});peers.push(c)}
 for(const c of peers)c.ticket=(await c.next(m=>m.type==='match')).ticket;
 const connections=[];
 for(const c of peers){const connection=await connect(`/api/matches/${c.ticket.matchId}/ws`,c.ticket);connection.ticket=c.ticket;connection.stamps=[];connection.pings=[];connection.tick=0;let sequence=connection.welcome.inputSequence??0;
  connection.ws.addEventListener('message',({data})=>{if(data==='pong')return;const m=JSON.parse(data);if(m.type==='match'&&m.state.phase==='running'&&!connection.running){connection.running=true;connection.tick=m.state.snapshot?.tick??0}if(m.type==='snapshot'){connection.running=true;connection.stamps.push(performance.now());connection.tick=Math.max(connection.tick,m.snapshot.tick)}if(m.type==='pong')connection.pings.push(performance.now()-m.nonce)});
  for(const seatId of c.ticket.seatIds)send(connection,{type:'ready',seatId,ready:true,assetsReady:true});
  timers.push(setInterval(()=>{if(connection.ws.readyState!==WebSocket.OPEN||!connection.running)return;connection.tick+=3;send(connection,{type:'input',sequence:++sequence,frames:connection.ticket.seatIds.map(seatId=>({seatId,tick:connection.tick,left:false,right:false,down:false,jump:false,punch:false,special:false,guard:false,combo:false,dodge:false}))})},50));
  connections.push(connection);
 }
 await connections[0].next(m=>m.type==='snapshot'&&m.snapshot.phase==='playing');
 timers.push(setInterval(()=>{if(connections[0].ws.readyState===WebSocket.OPEN)send(connections[0],{type:'ping',nonce:performance.now()})},1000));
 const match={id:peers[0].ticket.matchId,pool,peers,connections};matches.push(match);return match;
}
function percentile(values,p){const sorted=values.toSorted((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??0}
async function measure(label,active){
 const before=await Promise.all(active.map(m=>get(`/api/matches/${m.id}`))),started=performance.now(),indices=active.map(m=>m.connections[0].stamps.length);
 await sleep(seconds*1000);const after=await Promise.all(active.map(m=>get(`/api/matches/${m.id}`))),wallMs=performance.now()-started;
 return{label,requestedSeconds:seconds,clientWallMs:wallMs,roundTripScope:'connection lifetime',matches:active.map((match,index)=>{const a=after[index],b=before[index],tickDelta=a.metrics.ticks-b.metrics.ticks,snapshotDelta=a.metrics.snapshots-b.metrics.snapshots,stamps=match.connections[0].stamps.slice(indices[index]),intervals=stamps.slice(1).map((at,i)=>at-stamps[i]);assert.equal(a.phase,'running');assert.ok(tickDelta>=seconds*55,JSON.stringify({label,metrics:a.metrics}));assert.ok(a.snapshot.runtime);if(match.pool==='royale')assert.equal(a.snapshot.fighters.length,8);return{pool:match.pool,matchId:match.id,players:a.config.players.length,tickDelta,snapshotDelta,measuredHz:tickDelta/(wallMs/1000),serverWallHz:tickDelta/((a.metrics.wallMs-b.metrics.wallMs)/1000),droppedTimeMs:a.metrics.droppedTimeMs-b.metrics.droppedTimeMs,catchupTicks:a.metrics.catchupTicks-b.metrics.catchupTicks,bytesPerPlayerSecond:(a.metrics.bytesSent-b.metrics.bytesSent)/a.config.players.length/(wallMs/1000),snapshotIntervalMs:{p50:percentile(intervals,.5),p95:percentile(intervals,.95),p99:percentile(intervals,.99)},roundTripMs:{p50:percentile(match.connections[0].pings,.5),p95:percentile(match.connections[0].pings,.95)}}})};
}
try{
 const initial=await get('/api/lobby');assert.equal(initial.capacity.activeMatches,0,'Use an idle preview, not an active player pool.');assert.equal(initial.capacity.enabled,true);
 const disciplines=['networks','ai','robotics','iot','vr','games','printing','hardware'];
 const royale=await create('royale',disciplines.map((d,i)=>[seat(`Royale ${i}`,d)])),duel=await create('duel',[[seat('Duel 0')],[seat('Duel 1')]]);
 const two=await measure('two concurrent matches',[royale,duel]);
 const extraA=await create('duel',[[seat('Load A0')],[seat('Load A1')]]),extraB=await create('duel',[[seat('Load B0')],[seat('Load B1')]]);
 assert.equal((await get('/api/lobby')).capacity.activeMatches,4);const four=await measure('four concurrent matches',[royale,duel,extraA,extraB]);
 for(const match of matches)for(const c of match.connections)send(c,{type:'forfeit'});
 for(let i=0;i<30&&(await get('/api/lobby')).capacity.activeMatches;i++)await sleep(100);
 assert.equal((await get('/api/lobby')).capacity.activeMatches,0);
 const team=await create('teams',[[seat('Team A0'),seat('Team A1')],[seat('Team B0'),seat('Team B1')]]);assert.equal(team.peers[0].ticket.config.players.length,4);send(team.connections[0],{type:'forfeit'});const teamResult=await team.connections[1].next(m=>m.type==='result');assert.equal(teamResult.result.winners.length,2);
 assert.equal(errors.length,0,JSON.stringify(errors));const final=await get('/api/lobby');
 const report={environment:'deployed Cloudflare Worker/DO preview, synthetic clients/inputs from one Argentina Mac',base,versions,recordedAt:new Date().toISOString(),two,four,teamParties:'2+2 couch seats admitted, authoritative two-seat winners',errorCount:errors.length,capacityBefore:initial.capacity,capacityAfter:final.capacity,limitations:['Independent sockets share one Internet connection','CPU clocks are not valid production billed CPU measurements','No physical controllers or injected network loss']};
 if(process.env.STF_REPORT)await writeFile(process.env.STF_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{for(const timer of timers)clearInterval(timer);for(const match of matches)for(const c of match.connections)if(c.ws.readyState===WebSocket.OPEN)send(c,{type:'forfeit'});for(const ws of sockets)ws.close()}
