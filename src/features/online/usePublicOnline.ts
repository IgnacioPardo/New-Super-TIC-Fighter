import { useEffect, useMemo, useRef, useState } from 'react';
import { PublicClient } from '../../network/PublicClient';
import type { LobbyState, MatchTicket, PoolPreference, PublicMatchState } from '../../network/publicTypes';
import type { MatchConfig, MatchSnapshot, PlayerSeat } from '../../shared/types';
import type { OnlineBridge, OnlineState } from '../../ui/contracts';
import { preloadMatchAssets } from '../../assets';

export function usePublicOnline() {
 const [lobby,setLobby]=useState<LobbyState|null>(null),[match,setMatch]=useState<PublicMatchState|null>(null);
 const [snapshot,setSnapshot]=useState<MatchSnapshot|undefined>(),[status,setStatus]=useState<OnlineState['status']>('idle');
 const [error,setError]=useState(''),[errorCode,setErrorCode]=useState(''),[ping,setPing]=useState<number>(),[paused,setPaused]=useState(false);
 const client=useRef<PublicClient|null>(null),ticket=useRef<MatchTicket|null>(null),snapshotRef=useRef<MatchSnapshot|null>(null);
 const localSeats=useRef<PlayerSeat[]>([]),publishAt=useRef(0),lastPhase=useRef(''),generation=useRef(0);
 const pausedRef=useRef(false);pausedRef.current=paused;
 const makeClient=()=>{
  if(client.current)return client.current;
  client.current=new PublicClient({
   onLobby:state=>setLobby(state),
   onMatch:next=>{
    if(ticket.current?.matchId===next.matchId)return;
    ticket.current=next;setPaused(false);setError('');setStatus('connecting');
    void client.current!.connectMatch(next).then(()=>setStatus('lobby')).catch(failure=>{setError(String(failure.message));setStatus('error');});
   },
   onMatchState:state=>{setMatch(state);if(state.phase==='running')setStatus('playing');else if(state.phase==='waiting')setStatus('lobby');},
   onSnapshot:next=>{
    snapshotRef.current=pausedRef.current&&next.phase!=='finished'?{...next,phase:'paused'}:next;
    if(next.phase==='finished'){setPaused(false);setStatus('playing');}
    const now=performance.now();if(next.phase!==lastPhase.current||now-publishAt.current>80){lastPhase.current=next.phase;publishAt.current=now;setSnapshot(next);}
   },
   onResult:(_result,next)=>{snapshotRef.current=next;setSnapshot(next);setPaused(false);setStatus('playing');},
   onError:(code,message)=>{setErrorCode(code);setError(message);},
   onStatus:(next,latency)=>{if(latency!==undefined)setPing(latency);if(next==='reconnecting')setStatus('reconnecting');else if(next==='disconnected')setStatus('error');else setStatus(current=>current==='connecting'||current==='reconnecting'?(ticket.current?'lobby':'lobby'):current);},
  });return client.current;
 };
 useEffect(()=>()=>{generation.current++;client.current?.close();client.current=null;},[]);
 const connect=async(config:MatchConfig)=>{
  if(client.current?.state)return;
  setStatus('connecting');setError('');setErrorCode('');localSeats.current=config.players.filter(p=>p.kind==='human').slice(0,4);
  try{const instance=makeClient();await instance.connect();instance.setSeats(localSeats.current);setStatus('lobby');}catch(failure){setStatus('error');setErrorCode('unavailable');setError(failure instanceof Error?failure.message:'Public lobby unavailable.');}
 };
 const updateSeats=(players:PlayerSeat[])=>{localSeats.current=players.filter(p=>p.kind==='human').slice(0,4);if(client.current?.state&&!ticket.current)client.current.setSeats(localSeats.current);};
 const leaveMatch=()=>{generation.current++;if(match?.phase==='running')client.current?.forfeit();client.current?.leaveMatch();ticket.current=null;snapshotRef.current=null;setSnapshot(undefined);setMatch(null);setPaused(false);setStatus(client.current?.state?'lobby':'idle');};
 const disconnect=()=>{leaveMatch();client.current?.close();client.current=null;setLobby(null);setStatus('idle');};
 const ready=async(id:string,value:boolean)=>{
  if(!ticket.current||!ticket.current.seatIds.includes(id))return;
  const current=generation.current;
  try{if(value)await preloadMatchAssets(ticket.current.config);if(current!==generation.current)return;client.current?.ready(id,value,value);}catch{setErrorCode('assets');setError('Match assets could not load. Retry readiness.');}
 };
 const shownSnapshot=snapshot&&paused&&snapshot.phase!=='finished'?{...snapshot,phase:'paused' as const}:snapshot;
 const state:OnlineState={status,code:ticket.current?.matchId,peerId:ticket.current?.peerId??lobby?.peerId,isHost:false,authority:'server',config:match?.config??ticket.current?.config,members:match?.peers.map(p=>({id:p.peerId,name:match.config.players.find(s=>s.peerId===p.peerId)?.name??'Player',ready:p.seatIds.every(id=>match.seatReadiness[id]),connected:p.connected,seatIds:p.seatIds}))??[],route:'relay',ping,error,snapshot:shownSnapshot,seatReadiness:match?.seatReadiness,pendingEdits:client.current?.pendingEdits??false,pauseReason:paused?'public-local-menu':undefined};
 const bridge:OnlineBridge={state,snapshotRef,create:async()=>{},join:async()=>{},leave:leaveMatch,updateConfig:()=>{},updateSeat:()=>{},claimSeat:()=>{},ready:value=>{for(const id of ticket.current?.seatIds??[])void ready(id,value);},setSeatReady:(id,value)=>{void ready(id,value);},start:()=>{},pause:()=>{pausedRef.current=true;setPaused(true);if(snapshotRef.current)snapshotRef.current={...snapshotRef.current,phase:'paused'};},resume:()=>{pausedRef.current=false;setPaused(false);snapshotRef.current=client.current?.latestSnapshot??null;},rematch:leaveMatch,sendInputs:frames=>{if(!pausedRef.current)client.current?.sendInputs(frames);}};
 return {bridge,lobby,match,status,error,errorCode,ping,paused,connect,updateSeats,disconnect,leaveMatch,
  preference:(value:PoolPreference)=>client.current?.setPreference(value),queue:(value:boolean)=>{setError('');client.current?.queue(value);},joinParty:(code:string)=>client.current?.joinParty(code),leaveParty:()=>client.current?.leaveParty(),
  spectate:async(id:string)=>{setError('');try{const next=await makeClient().spectate(id);setMatch(next);setStatus('playing');}catch{setErrorCode('spectator_limit');setError('Spectating is unavailable.');}},
  connectTicket:async(next:MatchTicket)=>{ticket.current=next;await makeClient().connectMatch(next);},
  credentials:()=>client.current?.lobbyCredentials,
 };
}
export type PublicOnline = ReturnType<typeof usePublicOnline>;
