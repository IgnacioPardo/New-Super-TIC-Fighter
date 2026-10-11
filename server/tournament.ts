import type { MatchConfig, MatchResult, MatchSnapshot, PlayerSeat } from '../src/shared/types';
import type { MatchTicket, PublicCapacity, TournamentEntrant, TournamentGame, TournamentStanding, TournamentState } from '../src/network/publicTypes';
import type { MatchAdmission, MatchMember } from './match';
import type { Env } from './env';
import { json, record, secret } from './validation';
interface EntrantMember {peerId:string;token:string;seatIds:string[];userId?:string}
interface Entry extends TournamentEntrant {members:EntrantMember[]}
interface StoredTournament extends Omit<TournamentState,'entrants'> {entrants:Entry[];ownerId:string;capacityLimit:number;ruleset:'classic'|'expanded';processed:string[];tickets:Record<string,MatchTicket[]>;spectatorTokens:Record<string,string>}
interface PeerLookup {peerId:string;players:PlayerSeat[];userId?:string;available:boolean}
interface Attachment {joined:boolean}

/** Durable scheduling/bracket authority. Only verified MatchDO outcomes advance. */
export class TournamentDO {
  private tournament?:StoredTournament;
  private scheduling=false;
  constructor(private state:DurableObjectState,private env:Env){
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS competition(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)');
    const row=state.storage.sql.exec('SELECT data FROM competition WHERE id=1').toArray()[0] as {data:string}|undefined;if(row)this.tournament=JSON.parse(row.data);
  }
  async fetch(request:Request):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/internal/create'&&request.method==='POST'){
      if(this.tournament)return json({error:'exists'},409);
      const value=await request.json() as {id:string;name:string;kind:'elimination'|'round-robin';visibility:'public'|'private';team:boolean;capacity:number;ruleset:'classic'|'expanded';peerId:string;token:string};
      if(!record(value)||typeof value.id!=='string'||typeof value.name!=='string'||!value.name.trim()||value.name.length>40||!['elimination','round-robin'].includes(value.kind)||!['public','private'].includes(value.visibility)||typeof value.team!=='boolean'||!['classic','expanded'].includes(value.ruleset)||!Number.isInteger(value.capacity)||value.kind==='elimination'&&!(value.team?[4,8]:[4,8,16]).includes(value.capacity)||value.kind==='round-robin'&&(value.capacity<4||value.capacity>8))return json({error:'invalid_tournament'},400);
      const owner=await this.peer(value.peerId,value.token);if(!owner)return json({error:'lobby_identity_required'},403);
      this.tournament={id:value.id,name:value.name.trim(),kind:value.kind,visibility:value.visibility,team:value.team,ownerId:owner.peerId,capacityLimit:value.capacity,ruleset:value.ruleset,phase:'registration',entrants:[],games:[],standings:[],championIds:[],createdAt:Date.now(),capacity:null,processed:[],tickets:{},spectatorTokens:{}};this.save();return json(this.publicState(),201);
    }
    const t=this.tournament;if(!t)return json({error:'tournament_not_found'},404);
    if(url.pathname==='/internal/state')return json(this.publicState());
    if(url.pathname==='/internal/ws'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
      if(this.state.getWebSockets().filter(s=>s.readyState===WebSocket.OPEN).length>=16)return json({error:'spectator_limit'},429);
      const pair=new WebSocketPair();this.state.acceptWebSocket(pair[1]);pair[1].serializeAttachment({joined:true});pair[1].send(JSON.stringify({type:'tournament',state:this.publicState()}));return new Response(null,{status:101,webSocket:pair[0]});
    }
    if(url.pathname==='/internal/join'&&request.method==='POST'){
      if(t.phase!=='registration'||t.entrants.length>=t.capacityLimit)return json({error:'registration_closed'},409);
      const value=await request.json() as {name:string;members:EntrantMember[]};
      if(!record(value)||typeof value.name!=='string'||!value.name.trim()||value.name.length>32||!Array.isArray(value.members)||!value.members.length||value.members.length>2)return json({error:'invalid_entrant'},400);
      const players:PlayerSeat[]=[],members:EntrantMember[]=[],browserIds:string[]=[];
      for(const supplied of value.members){
        if(!record(supplied)||!Array.isArray(supplied.seatIds)||!supplied.seatIds.length)return json({error:'invalid_entrant'},400);
        const peer=await this.peer(supplied.peerId,supplied.token);if(!peer)return json({error:'lobby_identity_required'},403);
        for(const id of supplied.seatIds){const p=peer.players.find(p=>p.id===id);if(!p||t.entrants.some(e=>e.players.some(other=>other.id===id)))return json({error:'seat_unavailable'},409);players.push(p);}
        members.push({peerId:peer.peerId,token:supplied.token,seatIds:supplied.seatIds,userId:peer.userId&&supplied.seatIds.includes(peer.players[0]?.id)?peer.userId:undefined});browserIds.push(peer.peerId);
      }
      if(t.ruleset==='classic'&&players.some(p=>!['networks','design','code','hardware'].includes(p.discipline)))return json({error:'fighter_not_classic'},400);
      if(players.length!==(t.team?2:1)||new Set(players.map(p=>p.id)).size!==players.length)return json({error:'entrant_size'},400);
      t.entrants.push({id:crypto.randomUUID(),name:value.name.trim(),players,members,browserIds:[...new Set(browserIds)]});this.save();this.broadcast();return json(this.publicState());
    }
    if(url.pathname==='/internal/start'&&request.method==='POST'){
      const {peerId,token}=await request.json() as EntrantMember,owner=await this.peer(peerId,token);if(!owner||owner.peerId!==t.ownerId)return json({error:'owner_required'},403);
      if(t.phase!=='registration'||t.entrants.length!==t.capacityLimit)return json({error:'entrants_required'},409);
      t.phase='running';this.makeSchedule();this.save();await this.schedule();this.broadcast();return json(this.publicState());
    }
    if(url.pathname==='/internal/tickets'&&request.method==='POST'){
      const {peerId,token}=await request.json() as {peerId:string;token:string};
      const peer=await this.peer(peerId,token);if(!peer)return json({error:'lobby_identity_required'},403);
      return json((t.tickets[peer.peerId]??[]).filter(ticket=>t.games.some(g=>g.phase==='running'&&g.matchId===ticket.matchId)));
    }
    if(url.pathname==='/internal/spectate'&&request.method==='POST'){
      const value=await request.json() as {matchId:string;peerId?:string;token?:string};
      if(t.visibility==='private'){const peer=await this.peer(value.peerId??'',value.token??'');if(!peer||peer.peerId!==t.ownerId&&!t.entrants.some(e=>e.browserIds.includes(peer.peerId)))return json({error:'entrant_required'},403);}
      const game=t.games.find(g=>g.matchId===value.matchId&&g.phase==='running');return game?json({matchId:game.matchId,token:t.spectatorTokens[game.matchId!],spectator:true}):json({error:'game_unavailable'},404);
    }
    if(url.pathname==='/internal/result'&&request.method==='POST')return this.result(await request.json());
    return json({error:'not_found'},404);
  }
  async webSocketMessage(ws:WebSocket,data:string|ArrayBuffer):Promise<void>{if(typeof data==='string'&&data==='ping')ws.send('pong');else ws.close(1008,'progress stream is read only');}
  async alarm():Promise<void>{await this.schedule();}
  private makeSchedule():void{
    const t=this.tournament!,ids=t.entrants.map(e=>e.id);t.games=[];
    if(t.kind==='elimination'){for(let i=0;i<ids.length;i+=2)t.games.push(this.game(1,[ids[i],ids[i+1]]));}
    else{
      const rotating:(string|null)[]=[...ids];if(rotating.length%2)rotating.push(null);
      for(let round=1;round<rotating.length;round++){
        for(let i=0;i<rotating.length/2;i++){const a=rotating[i],b=rotating[rotating.length-1-i];if(a&&b)t.games.push(this.game(round,[a,b]));}
        rotating.splice(1,0,rotating.pop()!);
      }
    }
    this.standings();
  }
  private game(round:number,entrants:[string,string]):TournamentGame{return{id:crypto.randomUUID(),round,entrants,phase:'scheduled',wins:[0,0],bout:0,koDifferential:[0,0]};}
  private async schedule():Promise<void>{
    const t=this.tournament;if(!t||t.phase!=='running'||this.scheduling)return;this.scheduling=true;
    try{
      const occupied=new Set(t.games.filter(g=>g.phase==='running').flatMap(g=>g.entrants.flatMap(id=>t.entrants.find(e=>e.id===id)!.browserIds)));
      for(const game of t.games.filter(g=>g.phase==='scheduled').sort((a,b)=>a.round-b.round)){
        const entries=game.entrants.map(id=>t.entrants.find(e=>e.id===id)!);if(entries.some(e=>e.browserIds.some(id=>occupied.has(id))))continue;
        // Global availability prevents competition/quickplay overlap as well as
        // two couch entrants being scheduled into simultaneous matches.
        let available=true;for(const member of entries.flatMap(e=>e.members)){const peer=await this.peer(member.peerId,member.token);if(!peer?.available){available=false;break;}}
        if(!available)continue;
        const matchId=crypto.randomUUID(),players=entries.flatMap((entry,side)=>entry.players.map(p=>({...p,team:side as 0|1}))),config:MatchConfig={ruleset:t.ruleset,gameMode:'stock',mode:t.team?'teams':'ffa',arena:'classic',lives:3,timeLimit:300,friendlyFire:false,practice:false,seed:crypto.getRandomValues(new Uint32Array(1))[0],bestOf:1,items:false,hazards:false,players};
        const reservationResponse=await this.lobby('/internal/reserve',{matchId,playerCount:players.length,durationSeconds:config.timeLimit});
        if(!reservationResponse.ok){t.capacity=(await reservationResponse.json() as {capacity:PublicCapacity}).capacity;break;}
        const {reservationId}=await reservationResponse.json() as {reservationId:string};const browserIds=[...new Set(entries.flatMap(e=>e.browserIds))];
        const members:MatchMember[]=browserIds.map(peerId=>({peerId,token:secret(),seatIds:players.filter(p=>p.peerId===peerId).map(p=>p.id),seatUserIds:Object.assign({},...entries.flatMap(e=>e.members.filter(m=>m.peerId===peerId&&m.userId).map(m=>({[m.seatIds[0]]:m.userId!})))),connected:false,forfeited:false,lastSequence:0,ready:{}}));
        const admission:MatchAdmission={matchId,config,members,reservationId,tournamentId:t.id,tournamentGameId:game.id};
        let response:Response;try{response=await this.env.MATCHES.get(this.env.MATCHES.idFromName(matchId),{locationHint:'enam'}).fetch('https://internal/internal/create',{method:'POST',body:JSON.stringify(admission)});}catch{await this.lobby('/internal/release',{reservationId,matchId,cancelled:true,elapsedMs:0});continue;}
        if(!response.ok){await this.lobby('/internal/release',{reservationId,matchId,cancelled:true,elapsedMs:0});continue;}
        game.phase='running';game.matchId=matchId;game.bout++;game.seatEntrants=Object.fromEntries(entries.flatMap(e=>e.players.map(p=>[p.id,e.id])));t.spectatorTokens[matchId]=(await response.json() as {spectatorToken:string}).spectatorToken;
        for(const member of members){const ticket:MatchTicket={matchId,peerId:member.peerId,token:member.token,seatIds:member.seatIds,config,tournamentId:t.id};t.tickets[member.peerId]=[...(t.tickets[member.peerId]??[]).slice(-2),ticket];occupied.add(member.peerId);}
        // Publish tickets to connected lobby sockets; client receives the same
        // explicit authoritative ticket used by quickplay, including couch seats.
        await this.lobby('/internal/tournament_tickets',{tickets:members.map(m=>t.tickets[m.peerId].at(-1))});this.save();
      }
      this.broadcast();await this.state.storage.setAlarm(Date.now()+15_000);
    }finally{this.scheduling=false;}
  }
  private async result(value:unknown):Promise<Response>{
    const t=this.tournament!;if(!record(value)||typeof value.resultId!=='string'||typeof value.matchId!=='string'||typeof value.gameId!=='string')return json({error:'invalid_result'},400);
    if(t.processed.includes(value.resultId))return json({ok:true,duplicate:true});
    const game=t.games.find(g=>g.id===value.gameId&&g.phase==='running'&&g.matchId===value.matchId);if(!game)return json({error:'unknown_game'},409);
    const response=await this.env.MATCHES.get(this.env.MATCHES.idFromName(value.matchId)).fetch('https://internal/internal/state');if(!response.ok)return json({error:'match_unavailable'},503);
    const authoritative=await response.json() as {phase:string;resultId:string;result?:MatchResult;snapshot?:MatchSnapshot};
    if(authoritative.phase!=='finished'||authoritative.resultId!==value.resultId||!authoritative.result||JSON.stringify(authoritative.result)!==JSON.stringify(value.result))return json({error:'unverified_result'},403);
    t.processed.push(value.resultId);game.resultId=value.resultId;
    const result=authoritative.result,winners=new Set(result.winners.map(id=>game.seatEntrants?.[id]).filter(Boolean));
    if(result.reason==='interrupted'){game.phase='scheduled';game.matchId=undefined;this.save();await this.schedule();return json({ok:true,replay:true});}
    const winner=winners.size===1?[...winners][0]:undefined;
    if(winner)game.wins[game.entrants.indexOf(winner as string)]++;
    const scores=authoritative.snapshot?.scores;const totals=game.entrants.map(id=>Object.entries(game.seatEntrants??{}).filter(([,entry])=>entry===id).reduce((total,[seat])=>total+(scores?.[seat]?.kos??0)-(scores?.[seat]?.selfDestructs??0),0));
    game.koDifferential![0]+=totals[0]-totals[1];game.koDifferential![1]+=totals[1]-totals[0];
    if(t.kind==='elimination'&&Math.max(...game.wins)<2){game.phase='scheduled';game.matchId=undefined;}
    else{game.phase='finished';game.winner=winner as string|undefined;if(t.kind==='elimination')game.winner=game.wins[0]>game.wins[1]?game.entrants[0]:game.entrants[1];}
    this.advance();this.standings();this.save();this.broadcast();if(t.phase==='running')await this.schedule();else await this.state.storage.deleteAlarm();return json({ok:true});
  }
  private advance():void{
    const t=this.tournament!;
    if(t.kind==='round-robin'){if(t.games.every(g=>g.phase==='finished')){t.phase='finished';this.standings();t.championIds=t.standings.filter(s=>s.rank===1).map(s=>s.entrantId);}return;}
    const round=Math.max(...t.games.map(g=>g.round)),games=t.games.filter(g=>g.round===round);if(games.some(g=>g.phase!=='finished'))return;
    if(games.length===1){t.phase='finished';t.championIds=games[0].winner?[games[0].winner]:[];return;}
    const winners=games.map(g=>g.winner!);for(let i=0;i<winners.length;i+=2)t.games.push(this.game(round+1,[winners[i],winners[i+1]]));
  }
  private standings():void{
    const t=this.tournament!;const rows:TournamentStanding[]=t.entrants.map(e=>({entrantId:e.id,wins:0,losses:0,koDifferential:0,rank:1}));
    for(const game of t.games.filter(g=>g.phase==='finished'))for(const [index,id] of game.entrants.entries()){const row=rows.find(r=>r.entrantId===id)!;if(game.winner===id)row.wins++;else if(game.winner)row.losses++;row.koDifferential+=game.koDifferential?.[index]??0;}
    // Head-to-head is computed across the entire tied-wins group, so the comparator
    // stays transitive for 3+ ties. Remaining equality intentionally shares rank.
    const head=new Map<string,number>();for(const row of rows){const group=new Set(rows.filter(other=>other.wins===row.wins).map(other=>other.entrantId));head.set(row.entrantId,t.games.filter(g=>g.phase==='finished'&&g.winner===row.entrantId&&g.entrants.every(id=>group.has(id))).length);}
    rows.sort((a,b)=>b.wins-a.wins||(head.get(b.entrantId)??0)-(head.get(a.entrantId)??0)||b.koDifferential-a.koDifferential);
    for(let i=0;i<rows.length;i++){const a=rows[i],b=rows[i-1];a.rank=b&&a.wins===b.wins&&head.get(a.entrantId)===head.get(b.entrantId)&&a.koDifferential===b.koDifferential?b.rank:i+1;}
    t.standings=rows;
  }
  private publicState():TournamentState&{ownerId:string;capacityLimit:number;ruleset:'classic'|'expanded'}{const t=this.tournament!;return{id:t.id,name:t.name,kind:t.kind,visibility:t.visibility,team:t.team,phase:t.phase,entrants:t.entrants.map(({members:_,...e})=>e),games:t.games,standings:t.standings,championIds:t.championIds,createdAt:t.createdAt,capacity:t.capacity,ownerId:t.ownerId,capacityLimit:t.capacityLimit,ruleset:t.ruleset};}
  private lobby(path:string,value:unknown):Promise<Response>{return this.env.LOBBY.get(this.env.LOBBY.idFromName('global')).fetch(`https://internal${path}`,{method:'POST',body:JSON.stringify(value)});}
  private async peer(peerId:string,token:string):Promise<PeerLookup|null>{const response=await this.lobby('/internal/peer',{peerId,token});return response.ok?await response.json() as PeerLookup:null;}
  private save():void{const t=this.tournament;if(!t)return;this.state.storage.sql.exec('INSERT INTO competition(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',JSON.stringify(t));if(this.env.DB)this.state.waitUntil(this.env.DB.prepare('INSERT INTO tournament_state(id,name,visibility,phase,data,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,visibility=excluded.visibility,phase=excluded.phase,data=excluded.data,updated_at=excluded.updated_at').bind(t.id,t.name,t.visibility,t.phase,JSON.stringify(this.publicState()),Date.now()).run().then(()=>{}).catch(()=>{}));}
  private broadcast():void{const body=JSON.stringify({type:'tournament',state:this.publicState()});for(const ws of this.state.getWebSockets())if(ws.readyState===WebSocket.OPEN&&(ws.deserializeAttachment() as Attachment)?.joined){if(ws.bufferedAmount>256*1024)ws.close(1013,'slow spectator');else ws.send(body);}}
}
