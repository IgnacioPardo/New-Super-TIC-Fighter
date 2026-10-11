// End-to-end local/remote Worker services. Inputs and clients are synthetic.
import assert from 'node:assert/strict';
const base=process.env.STF_SERVER_URL??'http://127.0.0.1:8791';const versions=await(await fetch(`${base}/api/health`)).json();const sockets=[];
function watch(ws){const queue=[],waiters=[];ws.addEventListener('message',({data})=>{const m=JSON.parse(data),i=waiters.findIndex(w=>w.p(m));if(i>=0)waiters.splice(i,1)[0].resolve(m);else queue.push(m)});return(p,ms=5000)=>{const i=queue.findIndex(p);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={p,resolve:m=>{clearTimeout(timer);resolve(m)}};const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('Service message timeout'))},ms);waiters.push(w)})};}
async function connect(path,hello){const ws=new WebSocket(`${base.replace(/^http/,'ws')}${path}`),next=watch(ws);sockets.push(ws);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});ws.send(JSON.stringify({type:'hello',...versions,...hello}));return{ws,next,welcome:await next(m=>m.type==='welcome')};}
const send=(c,m)=>c.ws.send(JSON.stringify(m));const seat=id=>({id,name:id,discipline:'code',appearance:{hair:0,shirt:0,pants:0},team:0,kind:'human',device:'keyboard:0'});
try{
 const a=await connect('/api/lobby/ws',{}),b=await connect('/api/lobby/ws',{});
 send(a,{type:'seats',players:[seat('a')]});send(b,{type:'seats',players:[seat('b')]});
 await a.next(m=>m.type==='lobby'&&m.state.party.players.length===1);await b.next(m=>m.type==='lobby'&&m.state.party.players.length===1);
 send(a,{type:'preference',preference:{pool:'duel',ruleset:'classic'}});send(b,{type:'preference',preference:{pool:'duel',ruleset:'classic'}});
 send(a,{type:'queue',queued:true});send(b,{type:'queue',queued:true});
 const ta=(await a.next(m=>m.type==='match')).ticket,tb=(await b.next(m=>m.type==='match')).ticket;assert.equal(ta.matchId,tb.matchId);
 const capacity=await(await fetch(`${base}/api/lobby`)).json();assert.equal(capacity.capacity.maxMatches,4);assert.equal(capacity.capacity.dailyPlayerMinutes,1200);assert.ok(capacity.capacity.reservedPlayerMinutes>0);
 const ma=await connect(`/api/matches/${ta.matchId}/ws`,ta),mb=await connect(`/api/matches/${tb.matchId}/ws`,tb);
 send(ma,{type:'ready',seatId:ta.seatIds[0],ready:true,assetsReady:true});send(mb,{type:'ready',seatId:tb.seatIds[0],ready:true,assetsReady:true});
 await ma.next(m=>m.type==='snapshot'&&m.snapshot.phase==='playing',8000);
 send(ma,{type:'input',sequence:1,frames:[{seatId:tb.seatIds[0],tick:181,left:true,right:false,down:false,jump:false,punch:false,special:false,guard:false,combo:false}]});assert.equal((await ma.next(m=>m.type==='error')).code,'invalid_input');
 send(ma,{type:'result',result:{winners:ta.seatIds,reason:'last-standing'}});assert.equal((await ma.next(m=>m.type==='error')).code,'server_authority');
 ma.ws.close();await mb.next(m=>m.type==='match'&&m.state.peers.some(p=>p.peerId===ta.peerId&&!p.connected));
 const reconnect=await connect(`/api/matches/${ta.matchId}/ws`,ta);assert.equal(reconnect.welcome.state.phase,'running');
 send(reconnect,{type:'forfeit'});const result=await mb.next(m=>m.type==='result');assert.deepEqual(result.result.winners,tb.seatIds);assert.equal(result.verified,true);
 const stored=await(await fetch(`${base}/api/matches/${ta.matchId}`)).json();assert.equal(stored.resultId,result.resultId);assert.equal(stored.phase,'finished');
 await new Promise(resolve=>setTimeout(resolve,200));const released=await(await fetch(`${base}/api/lobby`)).json();assert.ok(released.capacity.usedPlayerMinutes>0);assert.ok(released.capacity.activeMatches<capacity.capacity.activeMatches);
 console.log(JSON.stringify({environment:'running workerd service, synthetic clients',passed:['party preference pool duel','reservation before admission','server seat ownership','server-only result','15s reconnect','forfeit without global pause','idempotent stored result','quota release'],matchId:ta.matchId,capacity:released.capacity},null,2));
}finally{for(const ws of sockets)ws.close();}
