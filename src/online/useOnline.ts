import { preloadMatchAssets } from '../assets';
import { useEffect, useRef, useState } from 'react';
import { RoomClient } from '../network/RoomClient';
import type { RoomState, TransportStatus } from '../network/types';
import { createSeat } from '../shared/defaults';
import { emptyInput, type InputFrame, type MatchConfig, type MatchSnapshot, type PlayerSeat, type SimulationMessage } from '../shared/types';
import type { OnlineBridge, OnlineState } from '../ui/contracts';

type BridgeState=OnlineState & {pendingEdits?:boolean;seatReadiness?:Record<string,boolean>};
const initialState = (): BridgeState => ({status:'idle',isHost:false,members:[]});

/** Owns room transport and authority. UI receives only coarse state updates. */
export function useOnline(): OnlineBridge & {setSeatReady(id:string,ready:boolean,assetsReady?:boolean):void} {
  const [state,setState]=useState<BridgeState>(initialState);
  const current=useRef(state); current.current=state;
  const client=useRef<RoomClient|null>(null), authorityWorker=useRef<Worker|null>(null), predictionWorker=useRef<Worker|null>(null);
  const snapshotRef=useRef<MatchSnapshot|null>(null), room=useRef<RoomState|null>(null);
  const localDevices=useRef(new Map<string,string>()), pendingInputs=useRef<InputFrame[]>([]), localTick=useRef(0);
  const lastHostInput=useRef(new Map<string,number>()), latestInputs=useRef(new Map<string,InputFrame>());
  const lastSnapshot=useRef(0), lastPublished=useRef(0), lastSent=useRef(0), reported=useRef('');
  const returningToLobby=useRef(false);
  const seatRemovals=useRef(new Set<string>());
  const seatDrafts=useRef(new Map<string,PlayerSeat>()),configDraft=useRef<MatchConfig|null>(null);
  const editing=useRef<{id:number;kind:'seats'|'config';players?:PlayerSeat[];config?:MatchConfig}|null>(null);
  const editSequence=useRef(0),editTimer=useRef<ReturnType<typeof setTimeout>|null>(null),editGeneration=useRef(0);
  const readyDraft=useRef(new Map<string,{ready:boolean;assetsReady:boolean}>());
  const editedRoster=(next:RoomState):PlayerSeat[]=>{
    let players=next.players;
    if(editing.current?.kind==='seats')players=[...players.filter(p=>p.peerId!==next.peerId||p.kind!=='human'),...editing.current.players!];
    const shared=configDraft.current??editing.current?.config;
    if(shared)players=[...players.filter(p=>p.kind==='human'),...shared.players.filter(p=>p.kind==='bot')];
    players=players.filter(p=>!seatRemovals.current.has(p.id));
    for(const draft of seatDrafts.current.values())players=[...players.filter(p=>p.id!==draft.id),draft];
    return players;
  };
  const unsettled=()=>!!editing.current||seatDrafts.current.size>0||seatRemovals.current.size>0||!!configDraft.current;
  const flushReady=()=>{if(unsettled())return;const connection=client.current,active=room.current;if(!connection||!active)return;for(const [id,value] of readyDraft.current)if(active.players.some(p=>p.id===id&&p.peerId===active.peerId))connection.setSeatReady(id,value.ready,value.assetsReady);readyDraft.current.clear();};
  const invalidate=()=>{editGeneration.current++;readyDraft.current.clear();update({pendingEdits:true,seatReadiness:Object.fromEntries(Object.keys(current.current.seatReadiness??{}).map(id=>[id,false]))});};
  const flushEdits=()=>{
    if(editing.current)return;const connection=client.current,active=room.current;if(!connection||!active||active.phase!=='lobby')return;
    const drafts=[...seatDrafts.current.values()];
    // Removing a host-owned bot must be acknowledged before claiming its identity.
    const replacingBot=drafts.some(p=>p.kind==='human'&&active.players.some(other=>other.id===p.id&&other.kind==='bot'));
    if(replacingBot&&connection.isHost){const config={...(configDraft.current??active.config),players:[...active.players.filter(p=>p.kind==='human'),...(configDraft.current??active.config).players.filter(p=>p.kind==='bot'&&!drafts.some(d=>d.id===p.id))]};const id=++editSequence.current;editing.current={id,kind:'config',config};connection.setConfig(config,id);return;}
    if(drafts.some(p=>p.kind==='human')||seatRemovals.current.size){
      let players=active.players.filter(p=>p.kind==='human'&&p.peerId===active.peerId&&!seatRemovals.current.has(p.id)).map(p=>({...p,device:localDevices.current.get(p.id)??p.device}));
      for(const draft of drafts.filter(p=>p.kind==='human'))players=[...players.filter(p=>p.id!==draft.id),draft];
      for(const draft of drafts.filter(p=>p.kind==='human'))seatDrafts.current.delete(draft.id);seatRemovals.current.clear();
      const id=++editSequence.current;editing.current={id,kind:'seats',players};connection.setSeats(players,id);return;
    }
    if(configDraft.current&&connection.isHost){const proposed=configDraft.current;configDraft.current=null;const config={...proposed,seed:proposed.seed>>>0,practice:false,players:[...active.players.filter(p=>p.kind==='human'),...proposed.players.filter(p=>p.kind==='bot')]};const id=++editSequence.current;editing.current={id,kind:'config',config};connection.setConfig(config,id);return;}
    update({pendingEdits:false});flushReady();
  };
  const queueFlush=()=>{if(editTimer.current)clearTimeout(editTimer.current);editTimer.current=setTimeout(()=>{editTimer.current=null;flushEdits();},40);};

  const ownMatch=useRef(''), routes=useRef(new Map<string,TransportStatus>());
  const update=(patch:Partial<BridgeState>)=>{current.current={...current.current,...patch};setState(current.current);};
  const localize=(config:MatchConfig):MatchConfig=>({...config,players:config.players.map(player=>({...player,device:player.peerId===room.current?.peerId ? localDevices.current.get(player.id) ?? player.device : player.kind==='bot'?'bot':'remote'}))});
  const publish=(snapshot:MatchSnapshot,force=false)=>{
    // A worker response queued before a reliable room control must not undo it.
    const active=room.current;
    if(!force&&active&&(active.phase==='lobby'||
      active.phase==='paused'&&['playing','countdown'].includes(snapshot.phase)||
      active.phase==='finished'&&snapshot.phase!=='finished'||
      active.phase==='playing'&&active.resumeAt&&snapshot.phase==='paused'))return;
    const next={...snapshot,config:localize(snapshot.config)};
    const phaseChanged=next.phase!==snapshotRef.current?.phase;
    snapshotRef.current=next;
    if(force||phaseChanged||performance.now()-lastPublished.current>=100){lastPublished.current=performance.now();update({snapshot:next,status:'playing'});}
  };
  const stop=()=>{
    authorityWorker.current?.postMessage({type:'stop'});predictionWorker.current?.postMessage({type:'stop'});
    snapshotRef.current=null;pendingInputs.current=[];latestInputs.current.clear();lastHostInput.current.clear();reported.current='';ownMatch.current='';localTick.current=0;
  };
  const leave=()=>{if(editTimer.current)clearTimeout(editTimer.current);editTimer.current=null;editing.current=null;seatDrafts.current.clear();seatRemovals.current.clear();configDraft.current=null;readyDraft.current.clear();returningToLobby.current=false;client.current?.close();client.current=null;room.current=null;stop();localDevices.current.clear();routes.current.clear();current.current=initialState();setState(current.current);};
  useEffect(()=>{
    const host=new Worker(new URL('../simulation/worker.ts',import.meta.url),{type:'module'});
    const prediction=new Worker(new URL('./prediction.worker.ts',import.meta.url),{type:'module'});
    authorityWorker.current=host;predictionWorker.current=prediction;
    host.onerror=()=>{
      if(!client.current?.isHost||!ownMatch.current)return;
      update({error:'El combate se interrumpió. Recarga la página antes de volver a jugar. / The fight stopped. Reload before playing again.'});
      client.current.reportResult({winners:[],reason:'interrupted'});
    };
    prediction.onerror=()=>{
      if(!client.current||client.current.isHost)return;
      update({error:'No se pudo continuar el combate. Recarga para reconectar. / The fight could not continue. Reload to reconnect.'});
      client.current.pause('Un jugador necesita reconectar / A player needs to reconnect');
    };
    host.onmessage=({data}:MessageEvent<SimulationMessage>)=>{
      if(data.type!=='snapshot'||!client.current?.isHost||data.snapshot.matchId!==ownMatch.current)return;
      const next=data.snapshot;publish(next);
      if(performance.now()-lastSent.current>=48&&reported.current!==next.matchId){lastSent.current=performance.now();client.current.sendSnapshot(next);}
      if(next.result&&reported.current!==next.matchId){reported.current=next.matchId;client.current.reportResult(next.result,next);}
    };
    prediction.onmessage=({data}:MessageEvent<MatchSnapshot>)=>{if(!client.current?.isHost&&data.matchId===room.current?.matchId)publish(data);};
    const timer=setInterval(()=>{
      const connection=client.current;
      if(!connection)return;
      if(!connection.isHost&&snapshotRef.current?.phase==='playing'&&pendingInputs.current.length){connection.sendInputs(pendingInputs.current.slice(-12));pendingInputs.current=pendingInputs.current.slice(-4);}
      if(connection.isHost&&snapshotRef.current?.phase==='playing'){
        const now=performance.now();const neutral:InputFrame[]=[];
        for(const [seatId,received] of lastHostInput.current) if(now-received>250){const previous=latestInputs.current.get(seatId);if(previous){const input=emptyInput(seatId,previous.tick+1);neutral.push(input);latestInputs.current.set(seatId,input);}lastHostInput.current.delete(seatId);}
        if(neutral.length)host.postMessage({type:'inputs',inputs:neutral});
      }
      if(!connection.isHost&&snapshotRef.current?.phase==='playing'&&performance.now()-lastSnapshot.current>1500){
        publish({...snapshotRef.current,phase:'paused'},true);connection.pause('Host sin respuesta / Host is not responding');
      }
    },33);
    const hidden=()=>{if(document.hidden&&client.current?.isHost&&snapshotRef.current&&['playing','countdown'].includes(snapshotRef.current.phase)){host.postMessage({type:'pause'});client.current.pause('El anfitrión está en otra pestaña / Host tab is hidden');}};
    document.addEventListener('visibilitychange',hidden);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',hidden);client.current?.close();host.terminate();prediction.terminate();};
  },[]);
  const newClient=()=>{
    client.current?.close();stop();routes.current.clear();
    const connection=new RoomClient({
      onEditAck(id,accepted){if(editing.current?.id!==id)return;editing.current=null;if(!accepted){seatDrafts.current.clear();seatRemovals.current.clear();configDraft.current=null;update({pendingEdits:false});}else flushEdits();},
      onRoomState(next){
        const previous=room.current;room.current=next;
        if (returningToLobby.current && connection.isHost && next.phase === 'finished') { returningToLobby.current=false; connection.rematch(); }
        // A refreshed browser cannot recover the authority worker destroyed by refresh.
        if(connection.isHost&&next.matchId&&ownMatch.current!==next.matchId&&previous===null){
          if(next.phase==='finished')connection.rematch();
          else if(next.phase!=='lobby'){
            returningToLobby.current=true;
            connection.reportResult({winners:[],reason:'interrupted'});
          }
        }
        if(next.phase==='lobby'&&previous?.phase!=='lobby'){stop();}
        const statuses=[...routes.current.values()].filter(status=>next.peers.some(peer=>peer.peerId===status.peerId));
        update({code:next.code,peerId:next.peerId,isHost:connection.isHost,config:localize({...next.config,...(configDraft.current??editing.current?.config??{}),players:editedRoster(next)}),pendingEdits:unsettled(),seatReadiness:Object.fromEntries(Object.entries(next.seatReadiness??{}).map(([id,value])=>[id,value.ready])),
          status:next.phase==='lobby'?'lobby':'playing',members:next.peers.map(peer=>({id:peer.peerId,name:next.players.find(p=>p.peerId===peer.peerId)?.name??'Jugador',ready:next.readiness[peer.peerId]?.ready??false,connected:peer.connected,seatIds:next.players.filter(p=>p.peerId===peer.peerId).map(p=>p.id)})),
          pauseReason:next.pauseReason,route:statuses.some(s=>s.route==='relay')?'relay':statuses.length&&statuses.every(s=>s.route==='direct')?'direct':'connecting',
          ...(next.phase==='lobby'?{snapshot:undefined}:{}),
        });
      },
      onInput(_peerId,inputs){
        if(!connection.isHost)return;
        for(const input of inputs){latestInputs.current.set(input.seatId,input);lastHostInput.current.set(input.seatId,performance.now());}
        authorityWorker.current?.postMessage({type:'inputs',inputs});
      },
      onSnapshot(snapshot){lastSnapshot.current=performance.now();predictionWorker.current?.postMessage({type:'authority',snapshot,seatIds:room.current?.players.filter(p=>p.peerId===room.current?.peerId).map(p=>p.id)??[]});},
      onStart(matchId,config){
        returningToLobby.current=false;reported.current='';localTick.current=0;pendingInputs.current=[];update({error:undefined,status:'playing'});
        if(connection.isHost){ownMatch.current=matchId;authorityWorker.current?.postMessage({type:'start',matchId,config});}
        lastSnapshot.current=performance.now();
      },
      onPause(reason){
        pendingInputs.current=[];
        update({pauseReason:reason});
        if(connection.isHost)authorityWorker.current?.postMessage({type:'pause'});
        else if(snapshotRef.current)publish({...snapshotRef.current,phase:'paused'},true);
      },
      onResume(){update({pauseReason:undefined});if(connection.isHost)authorityWorker.current?.postMessage({type:'resume'});},
      onForfeit(seatIds){if(connection.isHost)authorityWorker.current?.postMessage({type:'forfeit',seatIds});},
      onResult(result,finalSnapshot){pendingInputs.current=[];if(finalSnapshot)publish(finalSnapshot,true);else if(snapshotRef.current)publish({...snapshotRef.current,phase:'finished',result},true);},
      onError(_code,message){update({error:message,...(!room.current?{status:'error' as const}:{})});},
      onStatus(status){
        routes.current.set(status.peerId,status);
        const all=[...routes.current.values()];
        update({route:all.some(s=>s.route==='relay')?'relay':all.length&&all.every(s=>s.route==='direct')?'direct':'connecting',ping:Math.max(0,...all.map(s=>s.pingMs??0)),...(status.connected?{}:{status:'reconnecting'})});
      },
    });
    client.current=connection;room.current=null;return connection;
  };
  const replaceConfig=(config:MatchConfig)=>{
    const active=room.current,connection=client.current;if(!active||!connection)return;
    for(const player of config.players.filter(p=>p.kind==='human'&&p.peerId===active.peerId)){
      const previous=editedRoster(active).find(p=>p.id===player.id);if(JSON.stringify(player)!==JSON.stringify(previous))seatDrafts.current.set(player.id,{...player,device:localDevices.current.get(player.id)??player.device});
    }
    for(const player of active.players.filter(p=>p.kind==='human'&&p.peerId===active.peerId))if(!config.players.some(p=>p.kind==='human'&&p.id===player.id))seatRemovals.current.add(player.id);
    if(connection.isHost)configDraft.current=structuredClone(config);
    invalidate();queueFlush();
  };
  const claim=(seat:PlayerSeat)=>{
    const active=room.current,connection=client.current;if(!active||!connection)return;
    const previous=active.players.find(p=>p.id===seat.id);if(previous?.kind==='human'&&previous.peerId!==active.peerId)return;
    if(seat.kind==='bot'){
      if(!connection.isHost)return;if(previous?.kind==='human'&&previous.peerId===active.peerId)seatRemovals.current.add(seat.id);seatDrafts.current.delete(seat.id);const bot={...seat,peerId:undefined,device:'bot',difficulty:seat.difficulty??'normal' as const};
      const base=configDraft.current??active.config;configDraft.current={...base,players:[...editedRoster(active).filter(p=>p.id!==seat.id),bot]};
    }else{seatRemovals.current.delete(seat.id);if(previous?.kind==='bot'&&connection.isHost){const base=configDraft.current??active.config;configDraft.current={...base,players:base.players.filter(p=>p.id!==seat.id)};}const owned={...seat,peerId:active.peerId};localDevices.current.set(seat.id,seat.device);seatDrafts.current.set(seat.id,owned);}
    invalidate();queueFlush();
  };
  const setSeatReady=(id:string,value:boolean,assetsReady=value)=>{
    const active=client.current,config=room.current?.config,generation=editGeneration.current;
    if(!active||!config)return;
    if(!value){readyDraft.current.set(id,{ready:false,assetsReady:false});flushReady();return;}
    void preloadMatchAssets(config).then(()=>{if(client.current!==active||generation!==editGeneration.current)return;readyDraft.current.set(id,{ready:true,assetsReady});flushReady();}).catch(error=>update({error:String(error)}));
  };
  const enter=async(code:string|null,name:string)=>{
    leave();update({status:'connecting',error:undefined});const connection=newClient();
    try{
      const next=code===null?await connection.create():await connection.join(code);
      if(!next.players.some(p=>p.peerId===next.peerId)){
        const used=new Set(next.players.map(p=>p.id));let index=0;while(used.has(`p${index+1}`))index++;
        claim(createSeat(index,{name,device:'keyboard:0',peerId:next.peerId}));
      } else for(const seat of next.players.filter(p=>p.peerId===next.peerId))localDevices.current.set(seat.id,seat.device);
    }catch(error){update({status:'error',error:error instanceof Error?error.message:'No se pudo conectar / Connection failed.'});throw error;}
  };
  return {state,snapshotRef,create:name=>enter(null,name),join:(code,name)=>enter(code,name),leave,
    updateConfig:replaceConfig,
    updateSeat:claim,claimSeat:claim,setSeatReady,
    ready(value){for(const seat of room.current?.players.filter(p=>p.kind==='human'&&p.peerId===room.current?.peerId)??[])setSeatReady(seat.id,value);},
    start(){if(!unsettled())client.current?.start();},pause(){client.current?.pause('Pausa solicitada / Pause requested');},resume(){client.current?.resume();},
    rematch(){const connection=client.current;if(!connection||room.current?.phase==='lobby')return;if(!connection.isHost){if(room.current?.phase!=='finished')leave();return;}if(room.current?.phase==='finished')connection.rematch();else if(room.current?.phase==='playing'||room.current?.phase==='paused'){returningToLobby.current=true;authorityWorker.current?.postMessage({type:'stop'});connection.reportResult({winners:[],reason:'interrupted'});}},
    sendInputs(inputs){
      if(!client.current||!snapshotRef.current)return;
      localTick.current=Math.max(localTick.current+1,snapshotRef.current.tick+1);
      const frames=inputs.map(input=>({...input,tick:localTick.current}));
      if(client.current.isHost)authorityWorker.current?.postMessage({type:'inputs',inputs:frames});
      else {pendingInputs.current.push(...frames);pendingInputs.current=pendingInputs.current.slice(-12);predictionWorker.current?.postMessage({type:'inputs',inputs:frames});}
    },forceRelay(force){client.current?.setForcedRelay(force);},
  };
}
