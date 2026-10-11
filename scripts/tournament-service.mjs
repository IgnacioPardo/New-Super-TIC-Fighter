// Running Lobby/Match/Tournament/D1 exercise with independent synthetic clients.
import assert from 'node:assert/strict';
const base=process.env.STF_SERVER_URL??'http://127.0.0.1:8791',versions=await(await fetch(`${base}/api/health`)).json(),sockets=[];
function watch(ws){const queue=[],waiters=[];ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.type==='error')console.error(m);const i=waiters.findIndex(w=>w.p(m));if(i>=0)waiters.splice(i,1)[0].resolve(m);else queue.push(m)});return(p,ms=5000)=>{const i=queue.findIndex(p);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={p,resolve:m=>{clearTimeout(timer);resolve(m)}};const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('Tournament message timeout '+p.toString()))},ms);waiters.push(w)})};}
async function connect(path,hello){const ws=new WebSocket(`${base.replace(/^http/,'ws')}${path}`),next=watch(ws);sockets.push(ws);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});ws.send(JSON.stringify({type:'hello',...versions,...hello}));return{ws,next,welcome:await next(m=>m.type==='welcome')};}
const send=(c,m)=>c.ws.send(JSON.stringify(m));
const post=async(path,body)=>{const response=await fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
const get=async path=>(await(await fetch(`${base}${path}`)).json());
const seat=id=>({id,name:id,discipline:'code',appearance:{hair:0,shirt:0,pants:0},team:0,kind:'human',device:'keyboard:0'});
const credentials=c=>({peerId:c.welcome.peerId,token:c.welcome.token});
try{
 const peers=[];for(let i=0;i<4;i++){const c=await connect('/api/lobby/ws',{});send(c,{type:'seats',players:[seat(`entrant${i}`)]});c.player=(await c.next(m=>m.type==='lobby'&&m.state.party.players.length===1)).state.party.players[0];peers.push(c);}
 const created=await post('/api/tournaments',{...credentials(peers[0]),name:'Service elimination',kind:'elimination',visibility:'public',team:false,capacity:4,ruleset:'classic'});
 for(let i=0;i<4;i++)await post(`/api/tournaments/${created.id}/join`,{name:`Entrant ${i}`,members:[{...credentials(peers[i]),seatIds:[peers[i].player.id]}]});
 let state=await post(`/api/tournaments/${created.id}/start`,credentials(peers[0]));const completed=new Set();let bouts=0;
 while(state.phase!=='finished'&&bouts<12){
  const running=state.games.filter(g=>g.phase==='running'&&!completed.has(g.matchId));assert.ok(running.length,'No authoritative bout scheduled');
  for(const game of running){
   const members=state.entrants.filter(e=>game.entrants.includes(e.id));const chosen=peers.filter(p=>members.some(e=>e.browserIds.includes(p.welcome.peerId)));const connections=[];
   for(const peer of chosen){const tickets=await post(`/api/tournaments/${created.id}/tickets`,credentials(peer)),ticket=tickets.find(t=>t.matchId===game.matchId);assert.ok(ticket);const c=await connect(`/api/matches/${ticket.matchId}/ws`,ticket);c.ticket=ticket;connections.push(c);}
   for(const c of connections)for(const id of c.ticket.seatIds)send(c,{type:'ready',seatId:id,ready:true,assetsReady:true});
   await connections[0].next(m=>m.type==='match'&&m.state.phase==='running');
   const loserId=game.entrants[1],loserSeats=state.entrants.find(e=>e.id===loserId).players.map(p=>p.id);const loser=connections.find(c=>c.ticket.seatIds.some(id=>loserSeats.includes(id)));send(loser,{type:'forfeit'});await connections.find(c=>c!==loser).next(m=>m.type==='result');
   completed.add(game.matchId);bouts++;for(const c of connections)c.ws.close();
  }
  await new Promise(resolve=>setTimeout(resolve,300));state=await get(`/api/tournaments/${created.id}`);
 }
 assert.equal(state.phase,'finished');assert.equal(state.championIds.length,1);assert.equal(state.games.length,3);assert.ok(state.games.every(g=>g.phase==='finished'&&Math.max(...g.wins)===2));assert.equal(bouts,6);
 const listing=await get('/api/tournaments');assert.ok(listing.some(t=>t.id===created.id));
 // Multiple entrants on one browser must never have concurrent separate bouts.
 const couch=await connect('/api/lobby/ws',{});send(couch,{type:'seats',players:[seat('couch1'),seat('couch2')]});const roster=(await couch.next(m=>m.type==='lobby'&&m.state.party.players.length===2)).state.party.players;
 const rr=await post('/api/tournaments',{...credentials(couch),name:'Service shared-browser league',kind:'round-robin',visibility:'private',team:false,capacity:4,ruleset:'classic'});
 for(let i=0;i<2;i++)await post(`/api/tournaments/${rr.id}/join`,{name:`Couch ${i}`,members:[{...credentials(couch),seatIds:[roster[i].id]}]});
 for(let i=0;i<2;i++)await post(`/api/tournaments/${rr.id}/join`,{name:`Remote ${i}`,members:[{...credentials(peers[i]),seatIds:[peers[i].player.id]}]});
 const league=await post(`/api/tournaments/${rr.id}/start`,credentials(couch));const active=league.games.filter(g=>g.phase==='running');const couchEntrants=league.entrants.filter(e=>e.browserIds.includes(couch.welcome.peerId)).map(e=>e.id);assert.ok(active.filter(g=>g.entrants.some(id=>couchEntrants.includes(id))).length<=1);assert.equal(league.games.length,6);
 assert.ok(!(await get('/api/tournaments')).some(t=>t.id===rr.id));
 console.log(JSON.stringify({environment:'running workerd services, synthetic clients/forfeit results',eliminationId:created.id,authoritativeBestOfThreeBouts:bouts,passed:['4-entry elimination','server-only results','best-of-three advancement','durable D1 listing','round-robin pair schedule','shared-browser conflict exclusion','private listing exclusion'],leagueId:rr.id},null,2));
}finally{for(const ws of sockets)ws.close();}
