import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchConfig, MatchResult, MatchSnapshot } from '../shared/types';

export interface MatchSetState {
 config:MatchConfig;
 bouts:{matchId:string;result:MatchResult}[];
 wins:Record<string,number>;
 complete:boolean;
 winners:string[];
}
/** Finite best-of sets preserve tied bouts and never invent a winner. */
export function useMatchSet(snapshot:MatchSnapshot|null,enabled=true) {
 const [state,setState]=useState<MatchSetState|null>(null);
 const handled=useRef(new Set<string>());
 const startSet=useCallback((config:MatchConfig)=>{
  handled.current.clear();setState({config:structuredClone(config),bouts:[],wins:{},complete:false,winners:[]});
 },[]);
 const clearSet=useCallback(()=>{handled.current.clear();setState(null);},[]);
 useEffect(()=>{
  if(!enabled||!snapshot?.result||snapshot.phase!=='finished'||handled.current.has(snapshot.matchId)) return;
  handled.current.add(snapshot.matchId);
  const result=snapshot.result;
  setState(previous=>{
   if(!previous||previous.complete) return previous;
   const bouts=[...previous.bouts,{matchId:snapshot.matchId,result}],wins={...previous.wins};
   if(result.reason!=='interrupted') for(const id of result.winners) wins[id]=(wins[id]??0)+1;
   const length=previous.config.bestOf??3,target=Math.floor(length/2)+1;
   const score=Math.max(0,...Object.values(wins));
   const complete=result.reason==='interrupted'||score>=target||bouts.length>=length;
   const winners=result.reason!=='interrupted'&&complete&&score>0?previous.config.players.filter(seat=>wins[seat.id]===score).map(seat=>seat.id):[];
   return {...previous,bouts,wins,complete,winners};
  });
 },[snapshot?.matchId,snapshot?.phase,snapshot?.result,enabled]);
 const nextConfig=useCallback(()=>state&&!state.complete?{...structuredClone(state.config),seed:Date.now()}:null,[state]);
 return {state,startSet,clearSet,nextConfig};
}
