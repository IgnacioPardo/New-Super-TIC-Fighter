// End-to-end local/remote Worker services. Inputs and clients are synthetic.
import assert from 'node:assert/strict';
const base=process.env.STF_SERVER_URL??'http://127.0.0.1:8791';const versions=await(await fetch(`${base}/api/health`)).json();const sockets=[];
function watch(ws){const queue=[],waiters=[];ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.type==='error')console.error(m);const i=waiters.findIndex(w=>w.p(m));if(i>=0)waiters.splice(i,1)[0].resolve(m);else queue.push(m)});return(p,ms=5000)=>{const i=queue.findIndex(p);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={p,resolve:m=>{clearTimeout(timer);resolve(m)}};const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('Service message timeout: '+p.toString()))},ms);waiters.push(w)})};}
async function connect(path,hello){const ws=new WebSocket(`${base.replace(/^http/,'ws')}${path}`),next=watch(ws);sockets.push(ws);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});ws.send(JSON.stringify({type:'hello',...versions,...hello}));return{ws,next,welcome:await next(m=>m.type==='welcome')};}
const send=(c,m)=>c.ws.send(JSON.stringify(m));const seat=id=>({id,name:id,discipline:'code',appearance:{hair:0,shirt:0,pants:0},team:0,kind:'human',device:'keyboard:0'});
try{
 const response=await fetch(`${base}/api/rooms`,{method:'POST'}),created=await response.json();
 const host=await connect(`/api/rooms/${created.code}/ws`,{hostToken:created.hostToken});
 const guest=await connect(`/api/rooms/${created.code}/ws`,{});
 const hs=[{...seat('h1'),peerId:host.welcome.peerId},{...seat('h2'),peerId:host.welcome.peerId}],gs=[{...seat('g1'),peerId:guest.welcome.peerId},{...seat('g2'),peerId:guest.welcome.peerId}];
 send(host,{type:'seats',players:hs,editId:1});send(guest,{type:'seats',players:gs,editId:2});
 assert.equal((await host.next(m=>m.type==='edit_ack'&&m.editId===1)).accepted,true);assert.equal((await guest.next(m=>m.type==='edit_ack'&&m.editId===2)).accepted,true);
 const room=(await host.next(m=>m.type==='room'&&m.state.players.length===4)).state;
 send(host,{type:'seat_ready',seatId:'g1',ready:true,assetsReady:true});assert.equal((await host.next(m=>m.type==='error')).code,'invalid_ready');
 for(const id of ['h1','h2'])send(host,{type:'seat_ready',seatId:id,ready:true,assetsReady:true});
 for(const id of ['g1','g2'])send(guest,{type:'seat_ready',seatId:id,ready:true,assetsReady:true});
 await host.next(m=>m.type==='room'&&Object.values(m.state.seatReadiness).every(s=>s.ready));
 send(host,{type:'config',config:{...room.config,ruleset:'expanded',arena:'embedded',gameMode:'hill',timeLimit:180,players:room.players},editId:3});
 assert.equal((await host.next(m=>m.type==='edit_ack'&&m.editId===3)).accepted,true);
 await host.next(m=>m.type==='room'&&m.state.config.gameMode==='hill'&&Object.values(m.state.seatReadiness).every(s=>!s.ready));
 send(host,{type:'config',config:{...room.config,ruleset:'expanded',arena:'arcade',gameMode:'royale',timeLimit:240,lives:1,players:room.players},editId:4});await host.next(m=>m.type==='edit_ack'&&m.editId===4);
 const extra=[];
 for(let i=0;i<4;i++){const c=await connect(`/api/rooms/${created.code}/ws`,{});extra.push(c);send(c,{type:'seats',players:[{...seat(`r${i}`),discipline:['ai','iot','vr','printing'][i],peerId:c.welcome.peerId}],editId:5+i});assert.equal((await c.next(m=>m.type==='edit_ack')).accepted,true);send(c,{type:'route',route:'relay'});}
 const royale=(await host.next(m=>m.type==='room'&&m.state.players.length===8)).state;
 for(const id of ['h1','h2'])send(host,{type:'seat_ready',seatId:id,ready:true,assetsReady:true});for(const id of ['g1','g2'])send(guest,{type:'seat_ready',seatId:id,ready:true,assetsReady:true});send(guest,{type:'route',route:'relay'});
 for(let i=0;i<4;i++)send(extra[i],{type:'seat_ready',seatId:`r${i}`,ready:true,assetsReady:true});
 await host.next(m=>m.type==='room'&&m.state.players.length===8&&Object.values(m.state.seatReadiness).every(s=>s.ready)&&m.state.peers.filter(p=>!p.isHost).every(p=>p.route==='relay'));send(host,{type:'start'});const started=await host.next(m=>m.type==='start');assert.equal(started.config.players.length,8);assert.equal(started.config.gameMode,'royale');
 console.log('Running workerd private v2: 2+2 registration, explicit edit acknowledgements, per-seat ownership/readiness, rule invalidation, expanded arena/roster and eight Royale seats passed. Browser P2P is separately exercised.');
}finally{for(const ws of sockets)ws.close();}
