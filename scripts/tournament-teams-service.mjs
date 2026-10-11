// Real Lobby/Match/Tournament services; entrants and forfeits are synthetic.
import assert from 'node:assert/strict';
const base=process.env.STF_SERVER_URL??'http://127.0.0.1:8793',versions=await(await fetch(`${base}/api/health`)).json(),sockets=[];
function watch(ws){const queue=[],waiters=[];ws.addEventListener('message',({data})=>{if(data==='pong')return;const m=JSON.parse(data),i=waiters.findIndex(w=>w.p(m));if(i>=0)waiters.splice(i,1)[0].resolve(m);else queue.push(m)});return(p,ms=8000)=>{const i=queue.findIndex(p);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={p,resolve:m=>{clearTimeout(timer);resolve(m)}};const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('Team message timeout '+p.toString()))},ms);waiters.push(w)})};}
async function connect(path,hello,welcome=true){const ws=new WebSocket(`${base.replace(/^http/,'ws')}${path}`),next=watch(ws);sockets.push(ws);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});ws.send(JSON.stringify({type:'hello',...versions,...hello}));return{ws,next,...(welcome?{welcome:await next(m=>m.type==='welcome')}:{})};}
const send=(c,m)=>c.ws.send(JSON.stringify(m)),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),credentials=c=>({peerId:c.welcome.peerId,token:c.welcome.token});
async function post(path,body,status=200){const response=await fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value}
const get=async path=>(await(await fetch(`${base}${path}`)).json()),seat=id=>({id,name:id,discipline:'code',appearance:{hair:0,shirt:0,pants:0},team:0,kind:'human',device:'keyboard:0'});
try{
 const teams=[];
 for(let i=0;i<4;i++){
  const leader=await connect('/api/lobby/ws',{}),member=await connect('/api/lobby/ws',{});
  for(const [index,c] of [leader,member].entries()){send(c,{type:'seats',players:[seat(`team${i}_${index}`)]});await c.next(m=>m.type==='lobby'&&m.state.party.players.length===1)}
  send(member,{type:'party_join',code:leader.welcome.state.party.inviteCode});await leader.next(m=>m.type==='lobby'&&m.state.party.players.length===2);await member.next(m=>m.type==='lobby'&&m.state.party.players.length===2);teams.push({leader,member});
 }
 const tournament=await post('/api/tournaments',{...credentials(teams[0].leader),name:'Party team exercise',kind:'elimination',visibility:'public',team:true,capacity:4,ruleset:'classic'},201);
 const rejected=await post(`/api/tournaments/${tournament.id}/join`,{...credentials(teams[0].member),name:'Not leader',party:true},403);assert.equal(rejected.error,'party_leader_required');
 for(let i=0;i<4;i++)await post(`/api/tournaments/${tournament.id}/join`,{...credentials(teams[i].leader),name:`Team ${i}`,party:true});
 let state=await post(`/api/tournaments/${tournament.id}/start`,credentials(teams[0].leader));
 for(const c of teams.flatMap(t=>[t.leader,t.member]))assert.ok(!JSON.stringify(state).includes(c.welcome.token),'Progress must not expose lobby bearer tokens');
 assert.ok(state.entrants.every(e=>e.players.length===2&&e.browserIds.length===2));const completed=new Set();let bouts=0,spectatorsChecked=false;
 while(state.phase!=='finished'&&bouts<12){
  const running=state.games.filter(g=>g.phase==='running'&&!completed.has(g.matchId));assert.ok(running.length);
  for(const game of running){
   const entrants=state.entrants.filter(e=>game.entrants.includes(e.id)),peers=teams.flatMap(t=>[t.leader,t.member]).filter(p=>entrants.some(e=>e.browserIds.includes(p.welcome.peerId))),connections=[];
   for(const peer of peers){const tickets=await post(`/api/tournaments/${tournament.id}/tickets`,credentials(peer)),ticket=tickets.find(t=>t.matchId===game.matchId);assert.ok(ticket);const connection=await connect(`/api/matches/${ticket.matchId}/ws`,ticket);connection.ticket=ticket;connections.push(connection);for(const seatId of ticket.seatIds)send(connection,{type:'ready',seatId,ready:true,assetsReady:true})}
   await connections[0].next(m=>m.type==='match'&&m.state.phase==='running');
   if(!spectatorsChecked){
    const ticket=await post(`/api/tournaments/${tournament.id}/spectate`,{matchId:game.matchId}),viewers=[];
    for(let i=0;i<8;i++)viewers.push(await connect(`/api/matches/${game.matchId}/ws`,ticket));
    send(viewers[0],{type:'input',sequence:1,frames:[]});assert.equal((await viewers[0].next(m=>m.type==='error')).code,'spectator_read_only');
    const overflow=await connect(`/api/matches/${game.matchId}/ws`,ticket,false);assert.equal((await overflow.next(m=>m.type==='error')).code,'spectator_limit');for(const viewer of viewers)viewer.ws.close();overflow.ws.close();spectatorsChecked=true;
   }
   const losingSeats=state.entrants.find(e=>e.id===game.entrants[1]).players.map(p=>p.id);for(const c of connections.filter(c=>c.ticket.seatIds.some(id=>losingSeats.includes(id))))send(c,{type:'forfeit'});
   const result=await connections.find(c=>!c.ticket.seatIds.some(id=>losingSeats.includes(id))).next(m=>m.type==='result');assert.equal(result.result.winners.length,2);completed.add(game.matchId);bouts++;for(const c of connections)c.ws.close();
  }
  await sleep(200);state=await get(`/api/tournaments/${tournament.id}`);
 }
 assert.equal(state.phase,'finished');assert.equal(state.championIds.length,1);assert.equal(bouts,6);assert.ok(state.games.every(g=>g.phase==='finished'&&Math.max(...g.wins)===2));
 console.log(JSON.stringify({environment:'running workerd services, eight independent synthetic entrants',tournamentId:tournament.id,bestOfThreeBouts:bouts,passed:['leader-only party entrant joins','two-browser teams without sharing member tokens','progress strips all bearer tokens','authenticated per-browser match tickets','eight bounded read-only spectators','ninth spectator rejected','server team winners','six verified bouts advance to one champion']},null,2));
}finally{for(const ws of sockets)ws.close()}
