// Real workerd services. Delayed nonce replies simulate RTT preferences only;
// they do not represent real WAN measurements or security trust in client clocks.
import assert from 'node:assert/strict';
const base=process.env.STF_SERVER_URL??'http://127.0.0.1:8793',versions=await(await fetch(`${base}/api/health`)).json(),sockets=[],timers=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),send=(c,m)=>c.ws.send(JSON.stringify(m)),get=async()=>(await(await fetch(`${base}/api/lobby`)).json());
function watch(ws,delay){const queue=[],waiters=[];ws.addEventListener('message',({data})=>{if(data==='pong')return;const m=JSON.parse(data);if(m.type==='latency_probe'){timers.push(setTimeout(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'latency_reply',nonce:m.nonce}))},delay));return}const i=waiters.findIndex(w=>w.p(m));if(i>=0)waiters.splice(i,1)[0].resolve(m);else queue.push(m)});return(p,ms=6000)=>{const i=queue.findIndex(p);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={p,resolve:m=>{clearTimeout(timer);resolve(m)}};const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('Latency exercise timeout '+p.toString()))},ms);waiters.push(w)})};}
async function connect(path,hello={},delay=0){const ws=new WebSocket(`${base.replace(/^http/,'ws')}${path}`),next=watch(ws,delay);sockets.push(ws);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});send({ws},{type:'hello',...versions,...hello});return{ws,next,welcome:await next(m=>m.type==='welcome')};}
const seat=id=>({id,name:`QA ${id}`,discipline:'code',appearance:{hair:0,shirt:0,pants:0},team:0,kind:'human',device:'keyboard:0'});
async function peer(name,count,delay=0){const c=await connect('/api/lobby/ws',{},delay);send(c,{type:'seats',players:Array.from({length:count},(_,i)=>seat(`${name}${i}`))});await c.next(m=>m.type==='lobby'&&m.state.party.players.length===count);send(c,{type:'preference',preference:{pool:count===2?'duel':'ffa',ruleset:'classic'}});return c}
try{
 assert.equal((await get()).capacity.activeMatches,0,'Use an idle local service');
 const holders=[],held=[];
 for(let i=0;i<4;i++){const c=await peer(`held${i}`,2);send(c,{type:'queue',queued:true});const ticket=(await c.next(m=>m.type==='match')).ticket;holders.push(c);held.push(await connect(`/api/matches/${ticket.matchId}/ws`,ticket))}
 assert.equal((await get()).capacity.activeMatches,4);
 const anchor=await peer('anchor',1,400),far=await peer('far',1,1400),nearA=await peer('nearA',1,420),nearB=await peer('nearB',1,440),nearC=await peer('nearC',1,460);
 // A forged nonce cannot supply a measured sample; real probes remain outstanding.
 send(anchor,{type:'latency_reply',nonce:'not-issued-by-server'});await sleep(1600);
 for(const c of [anchor,far,nearA,nearB,nearC]){send(c,{type:'queue',queued:true});await c.next(m=>m.type==='lobby'&&m.state.party.queued)}
 const pool=await get();assert.equal(pool.availablePlayers.length,5);assert.ok(pool.availablePlayers.every(p=>p.queued&&p.partySize===1));assert.ok(pool.availablePlayers.every(p=>Object.keys(p).toSorted().join(',')==='id,name,partySize,queued'));
 for(const c of [anchor,far,nearA,nearB,nearC])assert.ok(!JSON.stringify(pool).includes(c.welcome.token));
 send(held[0],{type:'forfeit'});await held[0].next(m=>m.type==='result');
 const chosen=(await anchor.next(m=>m.type==='match')).ticket;const names=chosen.config.players.map(p=>p.name);assert.ok(names.includes('QA anchor0'),'Oldest matchable party must remain included');assert.ok(!names.includes('QA far0'),'Nearby RTT parties should be preferred');assert.ok(['QA nearA0','QA nearB0','QA nearC0'].every(name=>names.includes(name)));
 const finishing=[];for(const c of [anchor,nearA,nearB,nearC]){const ticket=(c===anchor?chosen:(await c.next(m=>m.type==='match')).ticket);finishing.push(await connect(`/api/matches/${ticket.matchId}/ws`,ticket))}
 send(finishing[0],{type:'forfeit'});await finishing[0].next(m=>m.type==='result');for(const c of held.slice(1)){send(c,{type:'forfeit'});await c.next(m=>m.type==='result')}
 console.log(JSON.stringify({environment:'local workerd, synthetic delayed probe replies',selectedNames:names,passed:['server nonce round-trip handshake','forged nonce ignored','compatible oldest party retained','closer measured RTT parties favored','safe available-player names exclude active seats and secrets']},null,2));
}finally{for(const timer of timers)clearTimeout(timer);for(const ws of sockets)ws.close()}
