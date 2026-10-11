import { CONTENT_VERSION, PROTOCOL_VERSION, type MatchConfig, type PlayerSeat } from '../src/shared/types';
import type { LobbyClientMessage, LobbyServerMessage, LobbyState, MatchTicket, PoolPreference, PublicActivity, PublicCapacity, PublicParty } from '../src/network/publicTypes';
import type { Env } from './env';
import type { MatchAdmission } from './match';
import { json, record, secret, validSeat } from './validation';
import { recordVerifiedResult } from './accounts';
interface Peer { id:string; token:string; partyId:string; players:PlayerSeat[]; joinedAt:number; disconnectedAt?:number; userId?:string; ticket?:MatchTicket; latencyMs?:number; latencyAt?:number }
interface Party { id:string; inviteCode:string; leaderId:string; preference:PoolPreference; queuedAt?:number }
interface Reservation { id:string; matchId:string; day:string; dayReservations?:Record<string,number>; playerMinutes:number; playerCount:number; createdAt:number; expiresAt:number; released:boolean; activity?:PublicActivity; spectatorToken?:string }
interface Store { peers:Peer[]; parties:Party[]; reservations:Reservation[]; days:Record<string,number> }
interface Attachment { peerId?:string; userId?:string }
const CONNECTIONS=64,MATCHES=4,MINUTES=1200,RECONNECT=15_000;
const day=()=>new Date().toISOString().slice(0,10);
const allocations=(start:number,end:number,count:number):Record<string,number>=>{const result:Record<string,number>={};for(let at=start;at<end;){const date=new Date(at),next=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1),until=Math.min(end,next);result[date.toISOString().slice(0,10)]=(until-at)*count/60_000;at=until;}return result;};
const resetAt=()=>{const now=new Date();return Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);};
const validPreference=(value:unknown):value is PoolPreference=>record(value)&&['duel','ffa','teams','royale'].includes(String(value.pool))&&['classic','expanded'].includes(String(value.ruleset));
/** Hibernating presence, one compatible pool, party-preserving matchmaking and
 * durable quota reservation. The Match DO is the only gameplay authority. */
export class LobbyDO {
  private store:Store={peers:[],parties:[],reservations:[],days:{}};
  private rates=new WeakMap<WebSocket,{at:number;count:number}>();
  private latencyProbes=new WeakMap<WebSocket,{nonce:string;at:number}>();
  private matching=false;
  constructor(private state:DurableObjectState,private env:Env){
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS lobby(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)');
    const row=state.storage.sql.exec('SELECT data FROM lobby WHERE id=1').toArray()[0] as {data:string}|undefined;if(row)this.store=JSON.parse(row.data);for(const r of this.store.reservations)r.dayReservations??={[r.day]:r.playerMinutes};
    for(const peer of this.store.peers)if(!this.socketFor(peer.id))peer.disconnectedAt??=Date.now();
    this.save();this.state.waitUntil(this.scheduleAlarm());
  }
  async fetch(request:Request):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/internal/state')return json({capacity:this.capacity(),parties:this.publicParties(),activities:this.activities(),availablePlayers:this.availablePlayers(),onlinePlayers:this.onlinePlayers()});
    if(url.pathname==='/internal/peer'&&request.method==='POST'){
      const {peerId,token}=await request.json() as {peerId:string;token:string};const peer=this.store.peers.find(p=>p.id===peerId&&p.token===token&&this.socketFor(p.id));
      return peer?json({peerId:peer.id,players:peer.players,userId:peer.userId,browserId:peer.id,available:!peer.ticket||!this.store.reservations.some(r=>r.matchId===peer.ticket!.matchId&&!r.released)}):json({error:'invalid_peer'},403);
    }
    if(url.pathname==='/internal/party'&&request.method==='POST'){
      const {peerId,token}=await request.json() as {peerId:string;token:string};const leader=this.store.peers.find(p=>p.id===peerId&&p.token===token&&this.socketFor(p.id)),party=leader&&this.store.parties.find(p=>p.id===leader.partyId&&p.leaderId===leader.id);
      if(!party)return json({error:'party_leader_required'},403);
      const peers=this.partyPeers(party.id);if(peers.some(peer=>!this.socketFor(peer.id)||peer.ticket&&this.store.reservations.some(r=>r.matchId===peer.ticket!.matchId&&!r.released)))return json({error:'party_unavailable'},409);
      return json({members:peers.map(peer=>({peerId:peer.id,token:peer.token,seatIds:peer.players.map(p=>p.id)}))});
    }
    if(url.pathname==='/internal/tournament_tickets'&&request.method==='POST'){
      const {tickets}=await request.json() as {tickets:MatchTicket[]};for(const ticket of tickets){const peer=this.store.peers.find(p=>p.id===ticket.peerId);if(!peer)continue;peer.ticket=ticket;const socket=this.socketFor(peer.id);if(socket)this.send(socket,{type:'match',ticket});}this.save();return json({ok:true});
    }
    if(url.pathname==='/internal/reserve'&&request.method==='POST'){
      const value=await request.json() as {matchId:string;playerCount:number;durationSeconds:number};
      if(!Number.isInteger(value.playerCount)||value.playerCount<2||value.playerCount>8||!Number.isInteger(value.durationSeconds)||value.durationSeconds<1||value.durationSeconds>300)return json({error:'invalid_reservation'},400);
      const reservation=this.reserve(value.matchId,value.playerCount,value.durationSeconds);if(!reservation)return json({error:'capacity',capacity:this.capacity()},429);
      return json({reservationId:reservation.id},201);
    }
    if(url.pathname==='/internal/release'&&request.method==='POST'){
      const value=await request.json() as {reservationId:string;matchId:string;elapsedMs:number;startedAt?:number;cancelled?:boolean;result?:Parameters<typeof recordVerifiedResult>[2];config?:MatchConfig;seatUserIds?:Record<string,string>};
      const reservation=this.store.reservations.find(r=>r.id===value.reservationId&&r.matchId===value.matchId);if(!reservation)return json({error:'reservation_missing'},404);
      if(!reservation.released){
        reservation.released=true;
        if(!value.cancelled){const elapsed=Math.min(reservation.playerMinutes*60_000/reservation.playerCount,Math.max(0,value.elapsedMs)),start=Number.isFinite(value.startedAt)?Math.max(reservation.createdAt,value.startedAt!):reservation.createdAt;for(const [date,minutes] of Object.entries(allocations(start,start+elapsed,reservation.playerCount)))this.store.days[date]=(this.store.days[date]??0)+minutes;}
        this.save();
      }
      if(value.result&&value.config)await recordVerifiedResult(this.env,value.matchId,value.result,value.config,value.seatUserIds??{});
      this.broadcast();this.state.waitUntil(this.matchmake());return json({ok:true});
    }
    if(url.pathname==='/internal/spectate'){
      const active=this.store.reservations.find(r=>r.matchId===url.searchParams.get('matchId')&&!r.released&&r.spectatorToken);return active?json({matchId:active.matchId,token:active.spectatorToken,spectator:true}):json({error:'activity_not_found'},404);
    }
    if(url.pathname==='/internal/ws'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
      if(this.state.getWebSockets().filter(ws=>ws.readyState===WebSocket.OPEN).length>=CONNECTIONS)return json({error:'lobby_full',capacity:this.capacity()},429);
      const pair=new WebSocketPair();this.state.acceptWebSocket(pair[1]);pair[1].serializeAttachment({userId:request.headers.get('X-Verified-User')??undefined});return new Response(null,{status:101,webSocket:pair[0]});
    }
    return json({error:'not_found'},404);
  }
  async webSocketMessage(ws:WebSocket,data:string|ArrayBuffer):Promise<void>{
    if(typeof data!=='string'||data.length>12*1024){ws.close(1009,'packet too large');return;}
    let message:LobbyClientMessage;try{message=JSON.parse(data);}catch{return this.error(ws,'invalid_json','Invalid lobby message.');}
    if(!record(message))return;
    const now=Date.now(),rate=this.rates.get(ws)??{at:now,count:0};if(now-rate.at>=1000){rate.at=now;rate.count=0;}this.rates.set(ws,rate);if(++rate.count>12)return this.error(ws,'rate_limited','Too many lobby changes.');
    if(message.type==='hello'){this.hello(ws,message);return;}
    const peer=this.store.peers.find(p=>p.id===(ws.deserializeAttachment() as Attachment)?.peerId);if(!peer)return this.error(ws,'join_required','Join the public lobby first.');
    const party=this.store.parties.find(p=>p.id===peer.partyId)!;
    switch(message.type){
      case 'latency_reply':{
        const probe=this.latencyProbes.get(ws);if(!probe||message.nonce!==probe.nonce)return;this.latencyProbes.delete(ws);const elapsed=Date.now()-probe.at;if(elapsed<0||elapsed>3000)return;
        peer.latencyMs=peer.latencyMs===undefined?elapsed:peer.latencyMs*.7+elapsed*.3;peer.latencyAt=Date.now();this.save();return;
      }
      case 'seats':{
        if(!Array.isArray(message.players)||message.players.length<1||message.players.length>4||!message.players.every(p=>validSeat(p))||new Set(message.players.map(p=>p.id)).size!==message.players.length)return this.error(ws,'invalid_seats','Choose one to four unique local humans.');
        const otherSeats=this.partyPeers(party.id).filter(p=>p.id!==peer.id).flatMap(p=>p.players);if(otherSeats.length+message.players.length>8)return this.error(ws,'party_full','The party supports at most eight fighters.');
        // Browser-local IDs are namespaced on the server; a peer cannot steal a seat.
        const players=message.players.map(p=>({...p,id:p.id.startsWith(`${peer.id.slice(0,8)}_`)?p.id:`${peer.id.slice(0,8)}_${p.id.slice(0,32)}`,peerId:peer.id,name:p.name.trim(),difficulty:undefined}));
        if(new Set(players.map(p=>p.id)).size!==players.length)return this.error(ws,'invalid_seats','Local seat identifiers must remain unique after namespacing.');
        peer.players=players;party.queuedAt=undefined;break;
      }
      case 'party_join':{
        const target=this.store.parties.find(p=>p.inviteCode===String(message.code).trim().toUpperCase());if(!target||target.queuedAt||peer.ticket&&!this.store.reservations.find(r=>r.matchId===peer.ticket!.matchId)?.released)return this.error(ws,'invalid_party','That party is unavailable.');
        if(this.partyPeers(target.id).flatMap(p=>p.players).length+peer.players.length>8)return this.error(ws,'party_full','The party is full.');this.removeFromParty(peer);peer.partyId=target.id;target.queuedAt=undefined;break;
      }
      case 'party_leave':this.removeFromParty(peer);this.newParty(peer);break;
      case 'preference':if(party.leaderId!==peer.id||!validPreference(message.preference))return this.error(ws,'party_leader','Only the party leader changes the compatible pool.');party.preference=message.preference;party.queuedAt=undefined;break;
      case 'queue':{
        if(party.leaderId!==peer.id||typeof message.queued!=='boolean')return this.error(ws,'party_leader','Only the party leader queues the party.');
        const peers=this.partyPeers(party.id),count=peers.flatMap(p=>p.players).length,max=party.preference.pool==='teams'?2:party.preference.pool==='duel'?2:party.preference.pool==='ffa'?4:8;
        if(message.queued&&(!count||count>max||peers.some(p=>!this.socketFor(p.id)||p.ticket&&this.store.reservations.some(r=>r.matchId===p.ticket!.matchId&&!r.released))))return this.error(ws,'party_not_compatible',party.preference.pool==='teams'?'Public teams allow at most two humans in each party. Larger couch groups can use FFA, Royale or private rooms.':'Every party member must be connected and available for the selected pool.');
        if(message.queued&&party.preference.ruleset==='classic'&&peers.flatMap(p=>p.players).some(p=>!['networks','design','code','hardware'].includes(p.discipline)))return this.error(ws,'fighter_not_classic','Choose an original discipline for the Classic pool.');
        if(message.queued&&this.env.PUBLIC_ENABLED!=='true')return this.error(ws,'public_disabled','Public matches are disabled while feasibility is being measured.');party.queuedAt=message.queued?Date.now():undefined;break;
      }
      case 'ping':if(Number.isFinite(message.nonce))this.send(ws,{type:'pong',nonce:message.nonce,now:Date.now()});return;
      default:return this.error(ws,'unknown_message','Unknown lobby message.');
    }
    if(Date.now()-(peer.latencyAt??0)>30_000)this.probeLatency(ws);this.save();this.broadcast();await this.matchmake();await this.scheduleAlarm();
  }
  async webSocketClose(ws:WebSocket):Promise<void>{await this.disconnect(ws);}
  async webSocketError(ws:WebSocket):Promise<void>{await this.disconnect(ws);}
  async alarm():Promise<void>{
    const now=Date.now();for(const peer of [...this.store.peers])if(peer.disconnectedAt&&now-peer.disconnectedAt>=RECONNECT){this.removeFromParty(peer);this.store.peers=this.store.peers.filter(p=>p.id!==peer.id);}
    // A lost Match object is charged its conservative reservation, never silently
    // made free. Explicit completion refunds unused reserved time idempotently.
    for(const r of this.store.reservations)if(!r.released&&r.expiresAt<=now){r.released=true;for(const [date,minutes] of Object.entries(r.dayReservations??{[r.day]:r.playerMinutes}))this.store.days[date]=(this.store.days[date]??0)+minutes;}
    this.store.reservations=this.store.reservations.filter(r=>!r.released||now-r.createdAt<86_400_000);
    this.store.days=Object.fromEntries(Object.entries(this.store.days).filter(([key])=>key>=new Date(now-7*86_400_000).toISOString().slice(0,10)));
    this.save();this.broadcast();await this.matchmake();await this.scheduleAlarm();
  }
  private hello(ws:WebSocket,message:Extract<LobbyClientMessage,{type:'hello'}>):void{
    if(message.protocolVersion!==PROTOCOL_VERSION||message.contentVersion!==CONTENT_VERSION){this.error(ws,'version_mismatch','Refresh to use protocol/content v2.',true);ws.close(1008);return;}
    const attachment=ws.deserializeAttachment() as Attachment;if(attachment.peerId)return this.error(ws,'already_joined','Already joined.');
    let peer=this.store.peers.find(p=>p.id===message.peerId&&p.token===message.token);
    if(message.token&&(!peer||peer.disconnectedAt&&Date.now()-peer.disconnectedAt>RECONNECT)){this.error(ws,'reconnect_expired','The fifteen-second lobby reconnect window expired.');ws.close(1008);return;}
    if(!peer){peer={id:crypto.randomUUID(),token:secret(),partyId:'',players:[],joinedAt:Date.now(),userId:attachment.userId};this.store.peers.push(peer);this.newParty(peer);}
    const old=this.socketFor(peer.id);if(old&&old!==ws)old.close(4001,'reconnected elsewhere');peer.disconnectedAt=undefined;peer.userId=attachment.userId;ws.serializeAttachment({peerId:peer.id,userId:peer.userId});this.save();this.send(ws,{type:'welcome',peerId:peer.id,token:peer.token,state:this.publicState(peer)});if(peer.ticket&&this.store.reservations.some(r=>r.matchId===peer!.ticket!.matchId&&!r.released))this.send(ws,{type:'match',ticket:peer.ticket});this.probeLatency(ws);this.broadcast();
  }
  private reserve(matchId:string,count:number,seconds:number):Reservation|undefined{
    const existing=this.store.reservations.find(r=>r.matchId===matchId);if(existing)return existing.released?undefined:existing;
    const capacity=this.capacity(),minutes=count*(seconds+75)/60,started=Date.now(),days=allocations(started,started+(seconds+75)*1000,count);
    if(!capacity.enabled||capacity.activeMatches>=MATCHES||Object.entries(days).some(([date,amount])=>(this.store.days[date]??0)+this.store.reservations.filter(r=>!r.released).reduce((sum,r)=>sum+(r.dayReservations?.[date]??(r.day===date?r.playerMinutes:0)),0)+amount>MINUTES))return;
    const r:Reservation={id:crypto.randomUUID(),matchId,day:day(),dayReservations:days,playerMinutes:minutes,playerCount:count,createdAt:Date.now(),expiresAt:Date.now()+(seconds+90)*1000,released:false};this.store.reservations.push(r);this.save();void this.scheduleAlarm();return r;
  }
  private async matchmake():Promise<void>{
    if(this.matching||this.env.PUBLIC_ENABLED!=='true')return;this.matching=true;
    try{
      for(let attempt=0;attempt<MATCHES;attempt++){
        if(this.capacity().activeMatches>=MATCHES)break;
        const queued=this.store.parties.filter(p=>p.queuedAt&&this.partyPeers(p.id).every(peer=>this.socketFor(peer.id))).sort((a,b)=>a.queuedAt!-b.queuedAt!);let chosen:Party[]|undefined,teams:Set<string>|undefined;
        for(const first of queued){
          const latency=this.partyLatency(first),candidates=queued.filter(p=>p.preference.pool===first.preference.pool&&p.preference.ruleset===first.preference.ruleset).sort((a,b)=>{
            const al=this.partyLatency(a),bl=this.partyLatency(b),distance=(value:number|undefined)=>latency===undefined||value===undefined?Infinity:Math.abs(value-latency);
            return distance(al)-distance(bl)||a.queuedAt!-b.queuedAt!;
          });
          const target=first.preference.pool==='duel'?2:first.preference.pool==='royale'?8:4;chosen=this.subset(candidates,target,first);
          if(chosen){if(first.preference.pool==='teams'){const side=this.subset(chosen,2);if(!side){chosen=undefined;continue;}teams=new Set(side.map(p=>p.id));}break;}
        }
        if(!chosen)break;
        const peers=chosen.flatMap(p=>this.partyPeers(p.id)),pref=chosen[0].preference,matchId=crypto.randomUUID();
        const config:MatchConfig={ruleset:pref.ruleset,gameMode:pref.pool==='royale'?'royale':'stock',mode:pref.pool==='teams'?'teams':'ffa',arena:pref.pool==='royale'?'arcade':'classic',lives:pref.pool==='royale'?1:3,timeLimit:pref.pool==='royale'?240:300,friendlyFire:false,practice:false,seed:crypto.getRandomValues(new Uint32Array(1))[0],items:false,hazards:false,bestOf:1,players:peers.flatMap(peer=>peer.players.map(p=>({...p,team:pref.pool==='teams'?(teams!.has(peer.partyId)?0:1):p.team})))};
        const reservation=this.reserve(matchId,config.players.length,config.timeLimit);if(!reservation)break;
        const members=peers.map(peer=>({peerId:peer.id,token:secret(),seatIds:peer.players.map(p=>p.id),seatUserIds:peer.userId&&peer.players[0]?{[peer.players[0].id]:peer.userId}:{},connected:false,forfeited:false,lastSequence:0,ready:{}}));
        const admission:MatchAdmission={matchId,config,members,reservationId:reservation.id};
        let response:Response;try{response=await this.env.MATCHES.get(this.env.MATCHES.idFromName(matchId),{locationHint:'enam'}).fetch('https://internal/internal/create',{method:'POST',body:JSON.stringify(admission)});}catch{reservation.released=true;this.save();break;}
        if(!response.ok){reservation.released=true;this.save();break;}
        const created=await response.json() as {spectatorToken:string};reservation.spectatorToken=created.spectatorToken;reservation.activity={id:matchId,pool:pref.pool,ruleset:pref.ruleset,players:config.players.length,startedAt:Date.now(),spectatable:true};
        for(const party of chosen)party.queuedAt=undefined;
        for(const peer of peers){const member=members.find(m=>m.peerId===peer.id)!;peer.ticket={matchId,peerId:peer.id,token:member.token,seatIds:member.seatIds,config};const socket=this.socketFor(peer.id);if(socket)this.send(socket,{type:'match',ticket:peer.ticket});}
        this.save();this.broadcast();
      }
    }finally{this.matching=false;}
  }
  private subset(parties:Party[],target:number,anchor?:Party):Party[]|undefined{
    const start=anchor?this.partyPeers(anchor.id).flatMap(p=>p.players).length:0;if(start>target)return;const chosen=new Map<number,Party[]>([[start,anchor?[anchor]:[]]]);if(start===target)return chosen.get(target);
    for(const party of parties){if(party.id===anchor?.id)continue;const size=this.partyPeers(party.id).flatMap(p=>p.players).length;if(!size)continue;for(const [total,list] of [...chosen.entries()].sort((a,b)=>b[0]-a[0]))if(total+size<=target&&!chosen.has(total+size))chosen.set(total+size,[...list,party]);if(chosen.has(target))return chosen.get(target);}return;
  }
  private probeLatency(ws:WebSocket):void{const previous=this.latencyProbes.get(ws);if(previous&&Date.now()-previous.at<=3000)return;const nonce=secret();this.latencyProbes.set(ws,{nonce,at:Date.now()});this.send(ws,{type:'latency_probe',nonce});}
  private partyLatency(party:Party):number|undefined{const samples=this.partyPeers(party.id).filter(p=>p.latencyMs!==undefined&&Date.now()-(p.latencyAt??0)<=60_000).map(p=>p.latencyMs!);return samples.length?Math.max(...samples):undefined;}
  private newParty(peer:Peer):void{const id=crypto.randomUUID();peer.partyId=id;this.store.parties.push({id,inviteCode:secret().slice(0,8).toUpperCase(),leaderId:peer.id,preference:{pool:'duel',ruleset:'expanded'}});}
  private removeFromParty(peer:Peer):void{const party=this.store.parties.find(p=>p.id===peer.partyId);if(!party)return;const others=this.partyPeers(party.id).filter(p=>p.id!==peer.id);party.queuedAt=undefined;if(!others.length)this.store.parties=this.store.parties.filter(p=>p.id!==party.id);else if(party.leaderId===peer.id)party.leaderId=others[0].id;}
  private partyPeers(id:string):Peer[]{return this.store.peers.filter(p=>p.partyId===id);}
  private publicParty(party:Party):PublicParty{const peers=this.partyPeers(party.id);return{id:party.id,leaderId:party.leaderId,inviteCode:party.inviteCode,peerIds:peers.map(p=>p.id),players:peers.flatMap(p=>p.players),queued:!!party.queuedAt,preference:party.preference};}
  private publicParties():LobbyState['parties']{return this.store.parties.map(p=>({id:p.id,players:this.partyPeers(p.id).flatMap(peer=>peer.players).length,queued:!!p.queuedAt,preference:p.preference}));}
  private activities():PublicActivity[]{return this.store.reservations.filter(r=>!r.released&&r.activity).map(r=>r.activity!);}
  private onlinePlayers():number{return this.store.peers.filter(p=>this.socketFor(p.id)).reduce((total,p)=>total+p.players.length,0);}
  private availablePlayers():LobbyState['availablePlayers']{return this.store.peers.filter(p=>this.socketFor(p.id)&&(!p.ticket||!this.store.reservations.some(r=>r.matchId===p.ticket!.matchId&&!r.released))).flatMap(peer=>{const party=this.store.parties.find(p=>p.id===peer.partyId)!;return peer.players.map(player=>({id:player.id,name:player.name,partySize:this.partyPeers(party.id).reduce((n,p)=>n+p.players.length,0),queued:!!party.queuedAt}));}).slice(0,64);}
  private capacity():PublicCapacity{const active=this.store.reservations.filter(r=>!r.released),used=this.store.days[day()]??0,reserved=active.reduce((n,r)=>n+(r.dayReservations?.[day()]??(r.day===day()?r.playerMinutes:0)),0),enabled=this.env.PUBLIC_ENABLED==='true';return{enabled,activeMatches:active.length,maxMatches:MATCHES,connections:this.state.getWebSockets().filter(s=>s.readyState===WebSocket.OPEN).length,maxConnections:CONNECTIONS,usedPlayerMinutes:used,reservedPlayerMinutes:reserved,dailyPlayerMinutes:MINUTES,resetAt:resetAt(),queuedParties:this.store.parties.filter(p=>p.queuedAt).length,reason:!enabled?'disabled':active.length>=MATCHES?'matches':used+reserved+12.5>MINUTES?'daily':undefined};}
  private publicState(peer:Peer):LobbyState{return{peerId:peer.id,party:this.publicParty(this.store.parties.find(p=>p.id===peer.partyId)!),parties:this.publicParties(),activities:this.activities(),availablePlayers:this.availablePlayers(),capacity:this.capacity(),onlinePlayers:this.onlinePlayers()};}
  private async disconnect(ws:WebSocket):Promise<void>{const id=(ws.deserializeAttachment() as Attachment)?.peerId,peer=this.store.peers.find(p=>p.id===id);if(!peer||this.socketFor(peer.id))return;peer.disconnectedAt=Date.now();const party=this.store.parties.find(p=>p.id===peer.partyId);if(party)party.queuedAt=undefined;this.save();this.broadcast();await this.scheduleAlarm();}
  private socketFor(id:string):WebSocket|undefined{return this.state.getWebSockets().find(ws=>ws.readyState===WebSocket.OPEN&&(ws.deserializeAttachment() as Attachment)?.peerId===id);}
  private broadcast():void{for(const peer of this.store.peers){const ws=this.socketFor(peer.id);if(ws)this.send(ws,{type:'lobby',state:this.publicState(peer)});}}
  private send(ws:WebSocket,message:LobbyServerMessage):void{if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>256*1024){ws.close(1013,'slow client');return;}ws.send(JSON.stringify(message));}
  private error(ws:WebSocket,code:string,message:string,refresh=false):void{this.send(ws,{type:'error',code,message,...(refresh?{refresh}:{})});}
  private save():void{this.state.storage.sql.exec('INSERT INTO lobby(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',JSON.stringify(this.store));}
  private async scheduleAlarm():Promise<void>{const deadlines=[...this.store.peers.filter(p=>p.disconnectedAt).map(p=>p.disconnectedAt!+RECONNECT),...this.store.reservations.filter(r=>!r.released).map(r=>r.expiresAt)];if(deadlines.length)await this.state.storage.setAlarm(Math.max(Date.now()+100,Math.min(...deadlines)));else await this.state.storage.deleteAlarm();}
}
