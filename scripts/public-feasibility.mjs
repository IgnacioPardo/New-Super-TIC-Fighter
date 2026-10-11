// Running Worker/DO exercise, with synthetic clients and inputs. Never claims
// physical controllers, Argentina Internet latency, or production free CPU cost.
import assert from 'node:assert/strict';
const base=process.env.STF_SERVER_URL??'http://127.0.0.1:8791';
const key=process.env.STF_FEASIBILITY_KEY??'local-measurement-only';
const seconds=Number(process.env.STF_BENCHMARK_SECONDS??30);
const clients=Number(process.env.STF_BENCHMARK_CLIENTS??4);
const versions=await(await fetch(`${base}/api/health`)).json();
const config={ruleset:'classic',gameMode:'stock',mode:'ffa',arena:'classic',lives:3,timeLimit:300,friendlyFire:false,practice:false,seed:42,players:Array.from({length:clients},(_,i)=>({id:`seat${i}`,peerId:`peer${i}`,name:`Measure ${i}`,discipline:['networks','design','code','hardware'][i%4],appearance:{hair:0,shirt:0,pants:0},team:i%2,kind:'human',device:'keyboard:0'}))};
const response=await fetch(`${base}/api/feasibility`,{method:'POST',headers:{'X-Feasibility-Key':key,'Content-Type':'application/json'},body:JSON.stringify(config)});
const admission=await response.json();assert.equal(response.status,201,JSON.stringify(admission));
const sockets=[];const received=[];const intervals=[];const pings=[];let lastSnapshot;let errorCount=0;let measuredStartedAt=0;
try{
  for(const ticket of admission.tickets){
    const ws=new WebSocket(`${base.replace(/^http/,'ws')}/api/matches/${ticket.matchId}/ws`);sockets.push(ws);
    let resolveWelcome,rejectWelcome;const welcome=new Promise((resolve,reject)=>{resolveWelcome=resolve;rejectWelcome=reject});
    const timer=setTimeout(()=>rejectWelcome(new Error('No welcome')),5000);
    const stamps=[];received.push(stamps);let seq=0,tick=0;
    ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.type==='welcome'){clearTimeout(timer);resolveWelcome(m);}if(m.type==='error'&&errorCount++<5)console.error(m);if(m.type==='snapshot'){stamps.push(performance.now());lastSnapshot=m.snapshot;tick=Math.max(tick,m.snapshot.tick);}if(m.type==='pong')pings.push(performance.now()-m.nonce);});
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    ws.send(JSON.stringify({type:'hello',...versions,peerId:ticket.peerId,token:ticket.token}));await welcome;
    for(const id of ticket.seatIds)ws.send(JSON.stringify({type:'ready',seatId:id,ready:true,assetsReady:true}));
    intervals.push(setInterval(()=>{if(ws.readyState!==WebSocket.OPEN)return;tick+=3;ws.send(JSON.stringify({type:'input',sequence:++seq,frames:ticket.seatIds.map(seatId=>({seatId,tick,left:false,right:false,down:false,jump:seq%24===0,punch:seq%8===0,special:seq%13===0,guard:false,combo:false}))}));},50));
  }
  const pingTimer=setInterval(()=>sockets[0].send(JSON.stringify({type:'ping',nonce:performance.now()})),1000);intervals.push(pingTimer);
  measuredStartedAt=performance.now();await new Promise(resolve=>setTimeout(resolve,seconds*1000));
  const state=await(await fetch(`${base}/api/matches/${admission.matchId}`)).json();
  assert.equal(state.authority,'server');assert.ok(state.metrics.ticks>=seconds*55,JSON.stringify(state.metrics));assert.ok(lastSnapshot.tick>0);
  const deltas=received[0].slice(1).map((at,i)=>at-received[0][i]).sort((a,b)=>a-b);
  const percentile=(values,p)=>values[Math.min(values.length-1,Math.floor(values.length*p))]??0;
  console.log(JSON.stringify({environment:base.includes('127.0.0.1')||base.includes('localhost')?'local workerd, synthetic websocket clients/inputs':'deployed Cloudflare Worker/DO, synthetic websocket clients/inputs',matchId:admission.matchId,clients,seconds,metrics:state.metrics,measuredHz:state.metrics.ticks/((performance.now()-measuredStartedAt)/1000),serverWallHz:state.metrics.ticks/(state.metrics.wallMs/1000),errorCount,snapshotIntervalMs:{p50:percentile(deltas,.5),p95:percentile(deltas,.95),p99:percentile(deltas,.99)},roundTripMs:{p50:percentile(pings.sort((a,b)=>a-b),.5),p95:percentile(pings,.95)},bytesPerPlayerSecond:state.metrics.bytesSent/clients/(state.metrics.wallMs/1000)},null,2));
  sockets[0].send(JSON.stringify({type:'input',sequence:999999,frames:[{seatId:'not-owned',tick:1,left:false,right:false,down:false,jump:false,punch:false,special:false,guard:false,combo:false}]}));
  for(const ws of sockets)ws.send(JSON.stringify({type:'forfeit'}));
}finally{for(const timer of intervals)clearInterval(timer);for(const ws of sockets)ws.close();}
