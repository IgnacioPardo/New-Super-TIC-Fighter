import { CONTENT_VERSION, PROTOCOL_VERSION, type InputFrame, type MatchSnapshot } from '../shared/types';
import type { LobbyClientMessage, LobbyServerMessage, LobbyState, MatchClientMessage, MatchServerMessage, MatchTicket, PoolPreference, PublicMatchState } from './publicTypes';
import type { MatchResult, PlayerSeat } from '../shared/types';

export interface PublicClientOptions {
  baseUrl?:string;
  onLobby?:(state:LobbyState)=>void;
  onMatch?:(ticket:MatchTicket)=>void;
  onSnapshot?:(snapshot:MatchSnapshot)=>void;
  onMatchState?:(state:PublicMatchState)=>void;
  onResult?:(result:MatchResult,snapshot:MatchSnapshot)=>void;
  onError?:(code:string,message:string)=>void;
  onStatus?:(status:'connected'|'reconnecting'|'disconnected',ping?:number)=>void;
}
interface Credential {peerId:string;token:string}
const stored=(key:string):Credential|undefined=>{try{return JSON.parse(sessionStorage.getItem(key)??'null')??undefined;}catch{return;}};
const remember=(key:string,value:Credential|undefined)=>{try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{/* storage may be unavailable */}};

/** Explicit public-server transport. There is deliberately no P2P fallback. */
export class PublicClient {
  private lobbySocket?:WebSocket;
  private matchSocket?:WebSocket;
  private credentials?:Credential=stored('stf-public-lobby');
  private ticket?:MatchTicket;
  private lobby?:LobbyState;
  private match?:PublicMatchState;
  private prediction?:Worker;
  private inputTimer?:ReturnType<typeof setInterval>;
  private pingTimer?:ReturnType<typeof setInterval>;
  private retryTimers=new Set<ReturnType<typeof setTimeout>>();
  private closed=false;
  private sequence=0;
  private localTick=0;
  private pendingInputs:InputFrame[]=[];
  private snapshot?:MatchSnapshot;
  private resultIds=new Set<string>();
  private lastPassivePing=0;
  private listening=false;
  private offlineSince?:number;
  private spectating=false;
  private matchForfeited=false;
  private matchGeneration=0;
  private handleOffline=()=>{
    if(this.closed)return;this.offlineSince??=Date.now();for(const timer of this.retryTimers)clearTimeout(timer);this.retryTimers.clear();this.pendingInputs=[];
    const sockets=[this.lobbySocket,this.matchSocket];this.lobbySocket=undefined;this.matchSocket=undefined;
    for(const socket of sockets)if(socket){socket.onclose=null;socket.close();}
    this.options.onStatus?.('reconnecting');
  };
  private handleOnline=()=>{
    if(this.closed||this.offlineSince===undefined)return;const started=this.offlineSince;this.offlineSince=undefined;
    if(Date.now()-started>=15_000){this.options.onStatus?.('disconnected');this.options.onError?.('reconnect_expired','The fifteen-second reconnect window expired.');return;}
    void this.openLobby(started).catch(()=>{});
    if(this.ticket&&!this.matchForfeited&&this.match?.phase!=='finished')void this.openMatch(this.ticket,this.spectating,started).catch(()=>{});
  };
  private seatDraft?:PlayerSeat[];
  private seatsInFlight?:PlayerSeat[];
  private queuedSeatReady=new Map<string,{ready:boolean;assetsReady:boolean}>();
  constructor(private options:PublicClientOptions={}){}
  get state():LobbyState|undefined{return this.lobby;}
  get matchState():PublicMatchState|undefined{return this.match;}
  get latestSnapshot():MatchSnapshot|undefined{return this.snapshot;}
  get peerId():string|undefined{return this.credentials?.peerId;}
  get pendingEdits():boolean{return !!this.seatDraft||!!this.seatsInFlight;}
  get lobbyCredentials():Credential|undefined{return this.credentials;}
  private url(path:string,websocket=false):string{const url=new URL(path,this.options.baseUrl||location.href);if(websocket)url.protocol=url.protocol==='https:'?'wss:':'ws:';return url.href;}
  async connect():Promise<LobbyState>{
    this.closed=false;this.startTimers();return this.openLobby();
  }
  private async openLobby(retryAt=0):Promise<LobbyState>{
    const socket=new WebSocket(this.url('/api/lobby/ws',true));this.lobbySocket=socket;
    return new Promise((resolve,reject)=>{
      let welcomed=false;const timer=setTimeout(()=>{reject(new Error('Public lobby connection timed out.'));socket.close();},8000);
      socket.onopen=()=>this.sendLobby({type:'hello',protocolVersion:PROTOCOL_VERSION,contentVersion:CONTENT_VERSION,...this.credentials});
      socket.onmessage=({data})=>{
        if(data==='pong'){this.options.onStatus?.('connected',Math.max(0,performance.now()-this.lastPassivePing));return;}
        let message:LobbyServerMessage;try{message=JSON.parse(data);}catch{return;}
        if(message.type==='welcome'){welcomed=true;clearTimeout(timer);this.credentials={peerId:message.peerId,token:message.token};remember('stf-public-lobby',this.credentials);this.acceptLobby(message.state);resolve(message.state);this.options.onStatus?.('connected');}
        else if(message.type==='lobby')this.acceptLobby(message.state);
        else if(message.type==='latency_probe')this.sendLobby({type:'latency_reply',nonce:message.nonce});
        else if(message.type==='match')this.options.onMatch?.(message.ticket);
        else if(message.type==='pong')this.options.onStatus?.('connected',Math.max(0,performance.now()-message.nonce));
        else if(message.type==='error'){
          this.options.onError?.(message.code,message.message);
          if(message.code==='reconnect_expired'){this.credentials=undefined;remember('stf-public-lobby',undefined);}
          if(!welcomed){clearTimeout(timer);reject(new Error(message.message));}
        }
      };
      socket.onerror=()=>{if(!welcomed){clearTimeout(timer);reject(new Error('Public lobby is unavailable.'));}};
      socket.onclose=()=>{
        clearTimeout(timer);if(this.lobbySocket!==socket||this.closed)return;
        this.lobbySocket=undefined;this.options.onStatus?.('reconnecting');
        this.retry(()=>this.openLobby(retryAt||Date.now()),retryAt||Date.now());
      };
    });
  }
  private acceptLobby(state:LobbyState):void{
    this.lobby=state;
    if(this.seatsInFlight){const actual=state.party.players.filter(p=>p.peerId===state.peerId);if(this.sameSeats(actual,this.seatsInFlight)){this.seatsInFlight=undefined;this.flushSeats();}}
    this.options.onLobby?.(state);
  }
  private sameSeats(a:PlayerSeat[],b:PlayerSeat[]):boolean{
    const shape=(players:PlayerSeat[])=>players.map(p=>({id:p.id.replace(/^[a-f0-9]{8}_/,''),name:p.name.trim(),discipline:p.discipline,appearance:p.appearance,team:p.team,device:p.device}));return JSON.stringify(shape(a))===JSON.stringify(shape(b));
  }
  setSeats(players:PlayerSeat[]):void{this.seatDraft=structuredClone(players);this.flushSeats();}
  private flushSeats():void{if(!this.seatDraft||this.seatsInFlight||this.lobbySocket?.readyState!==WebSocket.OPEN)return;this.seatsInFlight=this.seatDraft;this.seatDraft=undefined;this.sendLobby({type:'seats',players:this.seatsInFlight});}
  joinParty(code:string):void{this.sendLobby({type:'party_join',code});}
  leaveParty():void{this.sendLobby({type:'party_leave'});}
  setPreference(preference:PoolPreference):void{this.sendLobby({type:'preference',preference});}
  queue(queued:boolean):void{if(queued&&this.pendingEdits){this.options.onError?.('pending_edits','Wait for local fighter edits to settle before queueing.');return;}this.sendLobby({type:'queue',queued});}
  async spectate(matchId:string):Promise<PublicMatchState>{const response=await fetch(this.url(`/api/activities/${matchId}/spectate`));if(!response.ok)throw new Error('Activity unavailable.');const value=await response.json() as {token:string};return this.spectateTicket(matchId,value.token);}
  async spectateTicket(matchId:string,token:string):Promise<PublicMatchState>{this.leaveMatch();this.startTimers();return this.openMatch({matchId,token,peerId:'',seatIds:[],config:{} as MatchTicket['config']},true);}
  async connectMatch(ticket:MatchTicket):Promise<PublicMatchState>{this.leaveMatch();this.ticket=ticket;this.sequence=0;this.localTick=0;this.startTimers();this.prediction=new Worker(new URL('../online/prediction.worker.ts',import.meta.url),{type:'module'});this.prediction.onmessage=({data}:MessageEvent<MatchSnapshot>)=>{if(data.matchId!==this.ticket?.matchId)return;this.snapshot=data;this.options.onSnapshot?.(data);};return this.openMatch(ticket,false);}
  private async openMatch(ticket:MatchTicket,spectator=false,retryAt=0):Promise<PublicMatchState>{
    this.ticket=ticket;this.spectating=spectator;const generation=this.matchGeneration,socket=new WebSocket(this.url(`/api/matches/${ticket.matchId}/ws`,true));this.matchSocket=socket;
    return new Promise((resolve,reject)=>{
      let welcomed=false;const timer=setTimeout(()=>{reject(new Error('Match connection timed out.'));socket.close();},8000);
      socket.onopen=()=>this.sendMatch({type:'hello',protocolVersion:PROTOCOL_VERSION,contentVersion:CONTENT_VERSION,peerId:ticket.peerId,token:ticket.token,spectator});
      socket.onmessage=({data})=>{
        if(data==='pong'){this.options.onStatus?.('connected',Math.max(0,performance.now()-this.lastPassivePing));return;}
        let message:MatchServerMessage;try{message=JSON.parse(data);}catch{return;}
        if(message.type==='welcome'){welcomed=true;clearTimeout(timer);this.sequence=Math.max(this.sequence,message.inputSequence??0);this.pendingInputs=[];this.localTick=Math.max(message.state.snapshot?.tick??0,...(message.state.snapshot?.acknowledgedInputs??[]).filter(input=>ticket.seatIds.includes(input.seatId)).map(input=>input.tick));this.acceptMatch(message.state);resolve(message.state);this.options.onStatus?.('connected');if(message.state.phase==='waiting')for(const [seatId,value] of this.queuedSeatReady)this.sendMatch({type:'ready',seatId,...value});}
        else if(message.type==='match')this.acceptMatch(message.state);
        else if(message.type==='recovery'){this.pendingInputs=[];this.localTick=Math.max(message.snapshot.tick,...(message.snapshot.acknowledgedInputs??[]).filter(input=>ticket.seatIds.includes(input.seatId)).map(input=>input.tick));this.snapshot=undefined;this.prediction?.postMessage({type:'stop'});this.acceptMatch({...this.match!,snapshot:message.snapshot});this.prediction?.postMessage({type:'authority',snapshot:message.snapshot,seatIds:ticket.seatIds});}
        else if(message.type==='snapshot'){
          if(message.snapshot.matchId!==ticket.matchId||this.snapshot&&message.snapshot.tick<this.snapshot.tick)return;
          this.localTick=Math.max(this.localTick,message.snapshot.tick);
          if(this.prediction&&!spectator)this.prediction.postMessage({type:'authority',snapshot:message.snapshot,seatIds:ticket.seatIds});else{this.snapshot=message.snapshot;this.options.onSnapshot?.(message.snapshot);}
        }else if(message.type==='result'){
          this.pendingInputs=[];this.prediction?.postMessage({type:'stop'});this.snapshot=message.snapshot;this.options.onSnapshot?.(message.snapshot);
          if(!this.resultIds.has(message.resultId)){this.resultIds.add(message.resultId);this.options.onResult?.(message.result,message.snapshot);}
        }else if(message.type==='pong')this.options.onStatus?.('connected',Math.max(0,performance.now()-message.nonce));
        else if(message.type==='error'){this.options.onError?.(message.code,message.message);if(!welcomed){clearTimeout(timer);reject(new Error(message.message));}}
      };
      socket.onerror=()=>{if(!welcomed){clearTimeout(timer);reject(new Error('The authoritative match server is unavailable.'));}};
      socket.onclose=()=>{
        clearTimeout(timer);if(this.matchSocket!==socket||this.closed||this.matchForfeited||this.match?.phase==='finished'||generation!==this.matchGeneration)return;this.matchSocket=undefined;this.pendingInputs=[];this.options.onStatus?.('reconnecting');this.retry(()=>generation===this.matchGeneration&&!this.matchForfeited?this.openMatch(ticket,spectator,retryAt||Date.now()):Promise.resolve(),retryAt||Date.now());
      };
    });
  }
  private acceptMatch(state:PublicMatchState):void{this.match=state;this.options.onMatchState?.(state);if(state.snapshot){this.snapshot=state.snapshot;this.options.onSnapshot?.(state.snapshot);}}
  ready(seatId:string,ready:boolean,assetsReady=ready):void{this.queuedSeatReady.set(seatId,{ready,assetsReady});this.sendMatch({type:'ready',seatId,ready,assetsReady});}
  sendInputs(inputs:InputFrame[]):void{
    if(!this.ticket||this.matchForfeited||this.match?.phase!=='running'||this.snapshot?.phase!=='playing')return;this.localTick=Math.max(this.localTick+1,(this.snapshot?.tick??0)+1);const frames=inputs.filter(input=>this.ticket!.seatIds.includes(input.seatId)).map(input=>({...input,tick:this.localTick}));this.pendingInputs.push(...frames);this.pendingInputs=this.pendingInputs.slice(-24);this.prediction?.postMessage({type:'inputs',inputs:frames});
  }
  forfeit():void{this.matchForfeited=true;this.pendingInputs=[];this.sendMatch({type:'forfeit'});}
  leaveMatch():void{this.matchGeneration++;this.matchForfeited=false;const socket=this.matchSocket;this.matchSocket=undefined;if(socket){socket.onclose=null;socket.close();}this.prediction?.terminate();this.prediction=undefined;this.ticket=undefined;this.match=undefined;this.snapshot=undefined;this.pendingInputs=[];this.queuedSeatReady.clear();}
  close():void{this.closed=true;this.leaveMatch();if(this.listening&&typeof window!=='undefined'){window.removeEventListener('offline',this.handleOffline);window.removeEventListener('online',this.handleOnline);}this.listening=false;this.offlineSince=undefined;if(this.inputTimer)clearInterval(this.inputTimer);if(this.pingTimer)clearInterval(this.pingTimer);this.inputTimer=undefined;this.pingTimer=undefined;for(const timer of this.retryTimers)clearTimeout(timer);this.retryTimers.clear();const socket=this.lobbySocket;this.lobbySocket=undefined;if(socket){socket.onclose=null;socket.close();}this.lobby=undefined;this.seatDraft=undefined;this.seatsInFlight=undefined;}
  private startTimers():void{if(!this.listening&&typeof window!=='undefined'){window.addEventListener('offline',this.handleOffline);window.addEventListener('online',this.handleOnline);this.listening=true;}if(!this.inputTimer)this.inputTimer=setInterval(()=>{if(this.pendingInputs.length&&this.matchSocket?.readyState===WebSocket.OPEN){this.sendMatch({type:'input',sequence:++this.sequence,frames:this.pendingInputs});this.pendingInputs=[];}},50);if(!this.pingTimer)this.pingTimer=setInterval(()=>{const active=this.matchSocket?.readyState===WebSocket.OPEN&&this.match?.phase==='running';if(active||performance.now()-this.lastPassivePing>60_000){this.lastPassivePing=performance.now();const socket=this.matchSocket?.readyState===WebSocket.OPEN?this.matchSocket:this.lobbySocket;if(socket?.readyState===WebSocket.OPEN)socket.send('ping');}},2000);}
  private retry(run:()=>Promise<unknown>,started:number):void{if(this.offlineSince!==undefined)return;if(Date.now()-started>=15_000){this.options.onStatus?.('disconnected');this.options.onError?.('reconnect_expired','The fifteen-second reconnect window expired.');return;}const timer=setTimeout(()=>{this.retryTimers.delete(timer);if(!this.closed)void run().catch(()=>{});},700);this.retryTimers.add(timer);}
  private sendLobby(message:LobbyClientMessage):void{if(this.lobbySocket?.readyState===WebSocket.OPEN)this.lobbySocket.send(JSON.stringify(message));}
  private sendMatch(message:MatchClientMessage):void{if(this.matchSocket?.readyState===WebSocket.OPEN&&this.matchSocket.bufferedAmount<64*1024)this.matchSocket.send(JSON.stringify(message));}
}
