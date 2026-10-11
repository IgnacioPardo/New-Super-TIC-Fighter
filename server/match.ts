import { wireSnapshot } from '../src/network/snapshot';
import { Simulation } from '../src/simulation/Simulation';
import { CONTENT_VERSION, PROTOCOL_VERSION, emptyInput, type InputFrame, type MatchConfig, type MatchResult, type MatchSnapshot } from '../src/shared/types';
import type { MatchClientMessage, MatchMetrics, MatchServerMessage, PublicMatchState } from '../src/network/publicTypes';
import type { Env } from './env';
import { json, record, secret, validConfig, validFrames } from './validation';

export interface MatchMember { peerId:string; token:string; seatIds:string[]; seatUserIds?:Record<string,string>; connected:boolean; disconnectedAt?:number; forfeited:boolean; lastSequence:number; ready:Record<string,boolean> }
export interface MatchAdmission { matchId:string; config:MatchConfig; members:MatchMember[]; reservationId?:string; tournamentId?:string; tournamentGameId?:string; spectatorToken?:string }
interface StoredMatch extends MatchAdmission { phase:'waiting'|'running'|'finished'; createdAt:number; startedAt?:number; finishedAt?:number; checkpoint?:MatchSnapshot; resultId?:string; interrupted?:boolean; published?:boolean; metrics:MatchMetrics; recoveryGeneration?:number }
interface Attachment { peerId?:string; spectator?:boolean }
const RECONNECT_MS=15_000, WAIT_MS=60_000, DT=1000/60, MAX_SPECTATORS=8;
const freshMetrics=():MatchMetrics=>({ticks:0,snapshots:0,wallMs:0,tickCpuMs:0,maxTickCpuMs:0,maxLatenessMs:0,catchupTicks:0,droppedTimeMs:0,bytesSent:0,inputPackets:0,checkpointCount:0});

/** Public authority. Active matches stay awake at 60Hz; lobby/finished sockets hibernate. */
export class MatchDO {
  private match?:StoredMatch;
  private simulation=new Simulation();
  private timer?:ReturnType<typeof setTimeout>;
  private nextTickAt=0;
  private timerCount=0;
  private lastTimerWall=0;
  private clockAnchorAt=0;
  private clockAnchorTick=0;
  private lastCheckpointAt=0;
  private inputQueues=new Map<string,InputFrame[]>();
  private inputTicks=new Map<string,number>();
  private lastInputAt=new Map<string,number>();
  private snapshotSequence=0;
  private rates=new WeakMap<WebSocket,{at:number;count:number}>();

  constructor(private state:DurableObjectState,private env:Env) {
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS public_match (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    const row=state.storage.sql.exec('SELECT data FROM public_match WHERE id=1').toArray()[0] as {data:string}|undefined;
    if(row){
      this.match=JSON.parse(row.data) as StoredMatch;
      for(const member of this.match.members){member.connected=!!this.socketFor(member.peerId);if(!member.connected&&!member.forfeited)member.disconnectedAt??=Date.now();}
      if(this.match.phase==='running'){
        // V2 checkpoints contain every hidden runtime. Old/incomplete snapshots must
        // honestly interrupt rather than invent ability/combo/random state.
        if(this.match.checkpoint?.runtime){this.simulation.restore(this.match.checkpoint);this.clockAnchorAt=Date.now();this.clockAnchorTick=this.match.metrics.ticks;this.match.recoveryGeneration=(this.match.recoveryGeneration??0)+1;this.save();this.broadcast({type:'recovery',generation:this.match.recoveryGeneration,snapshot:wireSnapshot(this.match.checkpoint)});this.startTimer();}
        else this.interrupt('checkpoint unavailable');
      }
    }
  }
  async fetch(request:Request):Promise<Response>{
    const path=new URL(request.url).pathname;
    if(path==='/internal/create'&&request.method==='POST'){
      if(this.match)return json({error:'exists'},409);
      const value=await request.json() as MatchAdmission;
      if(!record(value)||typeof value.matchId!=='string'||!validConfig(value.config,true)||value.config.players.length<2||!Array.isArray(value.members)||!value.members.length)return json({error:'invalid_match'},400);
      const seats=value.members.flatMap(member=>member.seatIds);
      if(seats.length!==value.config.players.length||new Set(seats).size!==seats.length||value.members.some(member=>typeof member.peerId!=='string'||typeof member.token!=='string'||!member.seatIds.length||member.seatIds.some(id=>!value.config.players.some(p=>p.id===id&&p.peerId===member.peerId))))return json({error:'invalid_ownership'},400);
      try{this.simulation.createMatch(value.config,value.matchId);}catch{return json({error:'invalid_simulation_rules'},400);}
      this.match={...value,phase:'waiting',createdAt:Date.now(),members:value.members.map(member=>({...member,connected:false,disconnectedAt:Date.now(),forfeited:false,lastSequence:0,ready:{}})),metrics:freshMetrics(),spectatorToken:value.spectatorToken??secret()};
      this.save();await this.state.storage.setAlarm(Date.now()+WAIT_MS);
      return json({matchId:value.matchId,spectatorToken:this.match.spectatorToken},201);
    }
    if(!this.match)return json({error:'match_not_found'},404);
    if(path==='/internal/state'){if(this.match.startedAt&&this.match.phase==='running')this.match.metrics.wallMs=Math.max(this.match.metrics.wallMs,Date.now()-this.match.startedAt);return json(this.publicState());}
    if(path==='/internal/ws'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
      if(this.state.getWebSockets().length>this.match.members.length+MAX_SPECTATORS+8)return json({error:'connection_limit'},429);
      const pair=new WebSocketPair();this.state.acceptWebSocket(pair[1]);pair[1].serializeAttachment({});
      return new Response(null,{status:101,webSocket:pair[0]});
    }
    return json({error:'not_found'},404);
  }
  async webSocketMessage(ws:WebSocket,data:string|ArrayBuffer):Promise<void>{
    if(typeof data!=='string'||data.length>24*1024){ws.close(1009,'packet too large');return;}
    let message:MatchClientMessage;try{message=JSON.parse(data);}catch{this.error(ws,'invalid_json','Invalid match message.');return;}
    if(!record(message)||typeof message.type!=='string')return this.error(ws,'invalid_message','Invalid match message.');
    const now=this.clock(),rate=this.rates.get(ws)??{at:now,count:0};if(now-rate.at>=1000){rate.at=now;rate.count=0;}this.rates.set(ws,rate);if(++rate.count>35)return this.error(ws,'rate_limited','Send at most twenty batched input packets per second.');
    if(message.type==='hello')return this.hello(ws,message);
    const attachment=ws.deserializeAttachment() as Attachment;
    const member=this.match?.members.find(item=>item.peerId===attachment.peerId);
    if(!attachment.peerId)return this.error(ws,'join_required','Authenticate the match connection first.');
    if(message.type==='ping'){if(Number.isFinite(message.nonce))this.send(ws,{type:'pong',nonce:message.nonce,now});return;}
    if(!member||attachment.spectator)return this.error(ws,'spectator_read_only','Spectators cannot control fighters.');
    if(message.type==='ready'){
      if(this.match?.phase!=='waiting'||!member.seatIds.includes(message.seatId)||typeof message.ready!=='boolean'||typeof message.assetsReady!=='boolean')return this.error(ws,'invalid_ready','Only your own waiting seats can be readied.');
      member.ready[message.seatId]=message.ready&&message.assetsReady;this.save();this.broadcastState();
      if(this.match.members.every(m=>m.connected&&m.seatIds.every(id=>m.ready[id])))this.begin();return;
    }
    if(message.type==='forfeit'){this.forfeit(member);return;}
    if(message.type==='input'){
      const match=this.match!;
      if(member.forfeited||match.phase!=='running')return;
      if(!Number.isSafeInteger(message.sequence)||message.sequence<=member.lastSequence)return;
      if(!validFrames(message.frames,new Set(member.seatIds),24)||message.frames.some(frame=>frame.tick>(match.checkpoint?.tick??0)+180))return this.error(ws,'invalid_input','Input must belong to your seat and use a bounded increasing tick.');
      member.lastSequence=message.sequence;match.metrics.inputPackets++;
      for(const frame of message.frames){
        if(frame.tick<=(this.inputTicks.get(frame.seatId)??-1))continue;
        this.inputTicks.set(frame.seatId,frame.tick);this.lastInputAt.set(frame.seatId,now);
        const queue=this.inputQueues.get(frame.seatId)??[];queue.push({...frame});this.inputQueues.set(frame.seatId,queue.slice(-12));
      }
      return;
    }
    this.error(ws,'server_authority','The server alone controls rules, pause, snapshots and results.');
  }
  async webSocketClose(ws:WebSocket):Promise<void>{this.disconnect(ws);}
  async webSocketError(ws:WebSocket):Promise<void>{this.disconnect(ws);}
  async alarm():Promise<void>{
    const match=this.match;if(!match)return;
    if(match.phase==='waiting'&&Date.now()-match.createdAt>=WAIT_MS)this.interrupt('players did not become ready');
    if(match.phase==='running'){
      for(const member of match.members)if(!member.connected&&!member.forfeited&&this.clock()-(member.disconnectedAt??this.clock())>=RECONNECT_MS)this.forfeit(member);
      if(!this.timer)this.startTimer();
    }
    if(match.phase==='finished'&&!match.published)await this.publishResult();
  }
  private hello(ws:WebSocket,message:Extract<MatchClientMessage,{type:'hello'}>):void{
    const match=this.match!;
    if(message.protocolVersion!==PROTOCOL_VERSION||message.contentVersion!==CONTENT_VERSION){this.error(ws,'version_mismatch','Refresh to use this protocol/content version.',true);ws.close(1008,'refresh required');return;}
    if((ws.deserializeAttachment() as Attachment)?.peerId)return this.error(ws,'already_joined','Already connected.');
    if(message.spectator){
      if(message.token!==match.spectatorToken||this.state.getWebSockets().filter(s=>(s.deserializeAttachment() as Attachment)?.spectator).length>=MAX_SPECTATORS){this.error(ws,'spectator_limit','Invalid spectator ticket or spectator capacity reached.');ws.close(1008);return;}
      const peerId=`spectator-${crypto.randomUUID()}`;ws.serializeAttachment({peerId,spectator:true});this.send(ws,{type:'welcome',peerId,state:this.publicState(),spectator:true});return;
    }
    const member=match.members.find(item=>item.peerId===message.peerId&&item.token===message.token);
    if(!member||member.forfeited||match.phase==='running'&&member.disconnectedAt&&this.clock()-member.disconnectedAt>RECONNECT_MS){this.error(ws,'invalid_ticket','Your ticket or fifteen-second reconnect window expired.');ws.close(1008);return;}
    const old=this.socketFor(member.peerId);if(old&&old!==ws)old.close(4001,'reconnected elsewhere');
    ws.serializeAttachment({peerId:member.peerId});member.connected=true;member.disconnectedAt=undefined;this.save();
    this.send(ws,{type:'welcome',peerId:member.peerId,state:this.publicState(),spectator:false,inputSequence:member.lastSequence});
    if(match.phase==='finished'&&match.checkpoint?.result)this.send(ws,{type:'result',resultId:match.resultId!,result:match.checkpoint.result,snapshot:match.checkpoint,verified:true});
    this.broadcastState();
  }
  private begin():void{
    const match=this.match!;match.phase='running';match.startedAt=Date.now();this.clockAnchorAt=match.startedAt;this.clockAnchorTick=0;match.checkpoint=this.simulation.createMatch(match.config,match.matchId);this.save();this.broadcastState();this.startTimer();
    void this.state.storage.setAlarm(Date.now()+RECONNECT_MS);
  }
  private startTimer():void{if(this.timer||this.match?.phase!=='running')return;this.nextTickAt=Date.now()+DT;this.lastTimerWall=Date.now();this.scheduleTick();}
  private scheduleTick():void{
    // Workers clocks only advance after I/O. A fractional zero-delay retry can
    // spin indefinitely on an unchanged clock. Timer callbacks always own at
    // least one simulation step, and fixed 17/17/16ms delays never busy-loop.
    const delay=++this.timerCount%3===0?16:17;
    this.timer=setTimeout(()=>{this.timer=undefined;this.tick();},delay);
  }
  private tick():void{
    const match=this.match;if(!match||match.phase!=='running')return;
    const now=Date.now();let count=0;const wallAdvanced=now>this.lastTimerWall;this.lastTimerWall=now;
    match.metrics.maxLatenessMs=Math.max(match.metrics.maxLatenessMs,now-this.nextTickAt);
    try{
      while((count===0||wallAdvanced&&now>=this.nextTickAt)&&count<6&&match.phase==='running'){
        const before=performance.now();const frames:InputFrame[]=[];
        for(const member of match.members){
          if(member.forfeited)continue;
          if(!member.connected&&this.clock()-(member.disconnectedAt??this.clock())>=RECONNECT_MS){this.forfeit(member);continue;}
          for(const id of member.seatIds){
            const queue=this.inputQueues.get(id);
            if(member.connected&&queue?.length)frames.push(queue.shift()!);
            else if(!member.connected||this.clock()-(this.lastInputAt.get(id)??0)>250)frames.push(emptyInput(id,this.inputTicks.get(id)??0));
          }
        }
        if(match.phase!=='running')break;
        match.checkpoint=this.simulation.step(frames);const cpu=performance.now()-before;
        match.metrics.ticks++;match.metrics.tickCpuMs+=cpu;match.metrics.maxTickCpuMs=Math.max(match.metrics.maxTickCpuMs,cpu);count++;this.nextTickAt+=DT;
        if(match.metrics.ticks%3===0){this.snapshotSequence++;match.metrics.snapshots++;this.broadcast({type:'snapshot',sequence:this.snapshotSequence,snapshot:wireSnapshot(match.checkpoint),serverTime:Date.now()},true);}
        if(match.checkpoint.result)this.finish(match.checkpoint);
      }
      if(count>1)match.metrics.catchupTicks+=count-1;
      if(wallAdvanced&&this.nextTickAt<now-100){match.metrics.droppedTimeMs+=now-this.nextTickAt;this.nextTickAt=now+DT;}
      match.metrics.wallMs=this.clock()-(match.startedAt??this.clock());
      if(this.clock()-this.lastCheckpointAt>=5000){this.lastCheckpointAt=this.clock();match.metrics.checkpointCount++;this.save();}
      if(match.phase==='running')this.scheduleTick();
    }catch{this.interrupt('simulation runtime interrupted');}
  }
  private forfeit(member:MatchMember):void{
    if(member.forfeited||this.match?.phase==='finished')return;member.forfeited=true;member.connected=false;
    for(const id of member.seatIds)this.inputQueues.delete(id);
    if(this.match?.phase==='running'){this.match.checkpoint=this.simulation.forfeit(member.seatIds);if(this.match.checkpoint.result)this.finish(this.match.checkpoint);}
    else this.interrupt('waiting player forfeited');
    this.save();this.broadcastState();
  }
  private interrupt(_reason:string):void{
    const match=this.match;if(!match||match.phase==='finished')return;
    let snapshot=match.checkpoint;
    if(!snapshot){try{snapshot=this.simulation.createMatch(match.config,match.matchId);}catch{return;}}
    match.interrupted=true;this.finish({...snapshot,phase:'finished',result:{winners:[],reason:'interrupted'}});
  }
  private finish(snapshot:MatchSnapshot):void{
    const match=this.match!;if(match.phase==='finished')return;
    if(this.timer)clearTimeout(this.timer);this.timer=undefined;match.phase='finished';match.finishedAt=this.clock();match.checkpoint=snapshot;match.resultId=`${match.matchId}:result`;match.metrics.wallMs=this.clock()-(match.startedAt??match.createdAt);this.save();
    this.broadcast({type:'result',resultId:match.resultId,result:snapshot.result!,snapshot,verified:true});this.broadcastState();
    this.state.waitUntil(this.publishResult());
  }
  private async publishResult():Promise<void>{
    const match=this.match;if(!match||match.published||!match.checkpoint?.result)return;
    try{
      if(match.reservationId){const response=await this.env.LOBBY.get(this.env.LOBBY.idFromName('global')).fetch('https://internal/internal/release',{method:'POST',body:JSON.stringify({reservationId:match.reservationId,matchId:match.matchId,elapsedMs:Math.max(0,(match.finishedAt??Date.now())-(match.startedAt??match.createdAt)),result:match.checkpoint.result,resultId:match.resultId,config:match.config,seatUserIds:Object.assign({},...match.members.map(m=>m.seatUserIds??{}))})});if(!response.ok)throw new Error('reservation release failed');}
      if(match.tournamentId){const response=await this.env.TOURNAMENTS.get(this.env.TOURNAMENTS.idFromName(match.tournamentId)).fetch('https://internal/internal/result',{method:'POST',body:JSON.stringify({gameId:match.tournamentGameId,matchId:match.matchId,resultId:match.resultId,result:match.checkpoint.result,snapshot:match.checkpoint})});if(!response.ok)throw new Error('tournament advancement failed');}
      match.published=true;this.save();await this.state.storage.deleteAlarm();
    }catch{await this.state.storage.setAlarm(Date.now()+10_000);}
  }
  private disconnect(ws:WebSocket):void{
    const id=(ws.deserializeAttachment() as Attachment)?.peerId,member=this.match?.members.find(m=>m.peerId===id);if(!member||this.socketFor(member.peerId))return;
    member.connected=false;member.disconnectedAt=this.clock();for(const seatId of member.seatIds)this.inputQueues.delete(seatId);this.save();this.broadcastState();
    if(this.match?.phase==='running')void this.state.storage.setAlarm(Date.now()+RECONNECT_MS);
  }
  private clock():number{const match=this.match;return Math.max(Date.now(),match&&this.clockAnchorAt?this.clockAnchorAt+(match.metrics.ticks-this.clockAnchorTick)*DT:0);}
  private socketFor(id:string):WebSocket|undefined{return this.state.getWebSockets().find(s=>s.readyState===WebSocket.OPEN&&(s.deserializeAttachment() as Attachment)?.peerId===id);}
  private publicState():PublicMatchState{const m=this.match!;return{matchId:m.matchId,authority:'server',phase:m.phase,config:m.config,peers:m.members.map(p=>({peerId:p.peerId,connected:p.connected,seatIds:p.seatIds,reconnectUntil:p.disconnectedAt?p.disconnectedAt+RECONNECT_MS:undefined,forfeited:p.forfeited})),seatReadiness:Object.assign({},...m.members.map(p=>p.ready)),snapshot:m.checkpoint,result:m.checkpoint?.result,resultId:m.resultId,interrupted:m.interrupted,metrics:m.metrics,verified:true};}
  private save():void{if(this.match)this.state.storage.sql.exec('INSERT INTO public_match(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',JSON.stringify(this.match));}
  private send(ws:WebSocket,message:MatchServerMessage,gameplay=false):void{if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>256*1024){if(!gameplay)ws.close(1013,'slow client');return;}const body=JSON.stringify(message);ws.send(body);if(this.match)this.match.metrics.bytesSent+=body.length;}
  private broadcast(message:MatchServerMessage,gameplay=false):void{for(const ws of this.state.getWebSockets())if((ws.deserializeAttachment() as Attachment)?.peerId)this.send(ws,message,gameplay);}
  private broadcastState():void{this.broadcast({type:'match',state:this.publicState()});}
  private error(ws:WebSocket,code:string,message:string,refresh=false):void{this.send(ws,{type:'error',code,message,...(refresh?{refresh}: {})});}
}
