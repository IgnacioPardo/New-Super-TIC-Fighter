import { Simulation } from '../simulation/Simulation';
import type { InputFrame, MatchSnapshot } from '../shared/types';

type Command = { type: 'authority'; snapshot: MatchSnapshot; seatIds: string[] } | {type:'inputs'; inputs:InputFrame[]} | {type:'stop'};
const simulation = new Simulation();
let authority: MatchSnapshot | undefined;
let localIds = new Set<string>();
let pending: InputFrame[][] = [];
let lastInputs: InputFrame[] = [];
let lastAuthorityAt = 0;
const scope = self as unknown as {onmessage:((event:MessageEvent<Command>)=>void)|null; postMessage:(snapshot:MatchSnapshot)=>void};
function publish(snapshot: MatchSnapshot) {
  if (!authority) return;
  // Only local transforms/startup are predicted. Remote state and all outcomes
  // remain the last host-confirmed values; renderer interpolates remote updates.
  scope.postMessage({...authority, fighters:authority.fighters.map(fighter => {
    const local = snapshot.fighters.find(item => item.id === fighter.id);
    return localIds.has(fighter.id) && local ? {...fighter,x:local.x,y:local.y,vx:local.vx,vy:local.vy,facing:local.facing,grounded:local.grounded,height:local.height,action:local.action,actionTime:local.actionTime} : fighter;
  })});
}
scope.onmessage = ({data}) => {
  if (data.type === 'stop') { authority = undefined; pending=[]; lastInputs=[]; simulation.stop(); return; }
  if (data.type === 'authority') {
    if (authority?.matchId !== data.snapshot.matchId) { pending=[]; lastInputs=[]; }
    authority=data.snapshot; localIds=new Set(data.seatIds); lastAuthorityAt=performance.now();
    const acknowledged = authority.acknowledgedInputs ?? [];
    pending=pending.map(batch => batch.filter(input => input.tick > (acknowledged.find(item=>item.seatId===input.seatId)?.tick ?? authority!.tick))).filter(batch=>batch.length).slice(-12);
    simulation.restore(authority, acknowledged);
    let next=authority;
    if (authority.phase==='playing') for (const batch of pending) next=simulation.predict(batch);
    publish(next);
  } else if (authority && authority.phase==='playing' && performance.now()-lastAuthorityAt<250) {
    lastInputs=data.inputs.filter(input=>localIds.has(input.seatId));
    pending.push(lastInputs); if(pending.length>12) pending.shift();
    publish(simulation.predict(lastInputs));
  }
};
