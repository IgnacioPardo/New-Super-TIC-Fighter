import type { Discipline, MatchConfig, MatchSnapshot, PlayerSeat } from '../../shared/types';
import { createSeat } from '../../shared/defaults';
import { loadProgress, saveProgress } from '../profile/progress';

export type SoloKind = 'arcade'|'survival'|'challenge'|'training';
export interface SoloRequest { kind: SoloKind; challengeId?: string; coop?: boolean }
export interface Challenge {
 id: string; title: {es:string;en:string}; description:{es:string;en:string}; target:number; seconds:number;
 discipline:Discipline; arena:MatchConfig['arena']; metric: keyof ChallengeMetrics; opponent:'normal'|'dummy';
}
export interface ChallengeMetrics { distance:number;doubleJumps:number;dodges:number;recoveries:number;airHits:number;spikes:number;blocks:number;specialHits:number;signatureHits:number;boards:number;blinks:number;waves:number }
export const CHALLENGES: Challenge[] = [
 {id:'challenge-1',title:{es:'Segundo impulso',en:'Second wind'},description:{es:'Usa el salto doble tres veces y vuelve a aterrizar.',en:'Double-jump three times and land again.'},target:3,seconds:60,discipline:'networks',arena:'lab',metric:'doubleJumps',opponent:'dummy'},
 {id:'challenge-2',title:{es:'Recorre el circuito',en:'Run the circuit'},description:{es:'Recorre 2400 unidades sin perder tus tres vidas.',en:'Travel 2400 units before losing three stocks.'},target:2400,seconds:45,discipline:'games',arena:'classic',metric:'distance',opponent:'normal'},
 {id:'challenge-3',title:{es:'No me tocas',en:'Untouchable'},description:{es:'Ejecuta cinco esquivas en el suelo.',en:'Perform five ground dodges.'},target:5,seconds:60,discipline:'vr',arena:'virtual',metric:'dodges',opponent:'normal'},
 {id:'challenge-4',title:{es:'Regreso al combate',en:'Back in the fight'},description:{es:'Usa la recuperación aérea y aterriza dos veces.',en:'Use aerial recovery and land twice.'},target:2,seconds:90,discipline:'robotics',arena:'lab',metric:'recoveries',opponent:'dummy'},
 {id:'challenge-5',title:{es:'Presión aérea',en:'Air pressure'},description:{es:'Conecta tres golpes aéreos hacia adelante.',en:'Land three forward aerial attacks.'},target:3,seconds:90,discipline:'hardware',arena:'lab',metric:'airHits',opponent:'normal'},
 {id:'challenge-6',title:{es:'Desde arriba',en:'From above'},description:{es:'Conecta dos golpes aéreos hacia abajo.',en:'Land two downward aerial attacks.'},target:2,seconds:90,discipline:'printing',arena:'embedded',metric:'spikes',opponent:'normal'},
 {id:'challenge-7',title:{es:'Firewall humano',en:'Human firewall'},description:{es:'Bloquea cuatro golpes mirando al rival.',en:'Block four attacks while facing your opponent.'},target:4,seconds:90,discipline:'networks',arena:'lab',metric:'blocks',opponent:'normal'},
 {id:'challenge-8',title:{es:'Código en producción',en:'Ship the code'},description:{es:'Conecta tres ataques especiales.',en:'Land three special attacks.'},target:3,seconds:90,discipline:'code',arena:'classic',metric:'specialHits',opponent:'normal'},
 {id:'challenge-9',title:{es:'Selección precisa',en:'Precise selection'},description:{es:'Conecta dos ataques de firma de Diseño.',en:'Land two Design signature attacks.'},target:2,seconds:90,discipline:'design',arena:'lab',metric:'signatureHits',opponent:'normal'},
 {id:'challenge-10',title:{es:'Sistema embebido',en:'Embedded system'},description:{es:'Mantén dos placas ESP32/Arduino desplegadas a la vez.',en:'Keep two ESP32/Arduino boards deployed at once.'},target:2,seconds:90,discipline:'iot',arena:'embedded',metric:'boards',opponent:'normal'},
 {id:'challenge-11',title:{es:'Otra realidad',en:'Another reality'},description:{es:'Completa cuatro desplazamientos de realidad virtual.',en:'Complete four virtual-reality displacements.'},target:4,seconds:60,discipline:'vr',arena:'virtual',metric:'blinks',opponent:'normal'},
 {id:'challenge-12',title:{es:'Última defensa',en:'Last defense'},description:{es:'Supera las primeras tres oleadas de supervivencia.',en:'Clear the first three survival waves.'},target:3,seconds:240,discipline:'ai',arena:'embedded',metric:'waves',opponent:'normal'},
];
const LADDER:Discipline[]=['networks','design','code','hardware','iot','robotics','vr','ai'];
const freshMetrics=():ChallengeMetrics=>({distance:0,doubleJumps:0,dodges:0,recoveries:0,airHits:0,spikes:0,blocks:0,specialHits:0,signatureHits:0,boards:0,blinks:0,waves:0});
export interface SoloRun {
 id:string; request:SoloRequest; round:number; config:MatchConfig; playerId:string; profileId:string; metrics:ChallengeMetrics;
 completed:boolean; failed:boolean; processedResult?:string; seenEvents:Set<string>; previous?:MatchSnapshot;
 doubleJumpPending:boolean; recoveryPending:boolean;
}
function humanSeats(base:MatchConfig,coop=false):PlayerSeat[]{
 const humans=base.players.filter(p=>p.kind==='human').slice(0,coop?2:1);
 if(!humans.length)humans.push(createSeat(0));
 if(coop&&humans.length<2)humans.push(createSeat(1,{name:'P2',device:'keyboard:1'}));
 return humans.map(p=>({...p,team:0,kind:'human',peerId:undefined}));
}
export function startSolo(request:SoloRequest,base:MatchConfig,round=0):SoloRun {
 const challenge=CHALLENGES.find(c=>c.id===request.challengeId);
 const humans=humanSeats(base,request.coop&&request.kind==='survival');
 if(challenge)humans[0]={...humans[0],discipline:challenge.discipline};
 const survival=request.kind==='survival'||challenge?.metric==='waves';
 const players=[...humans,createSeat(humans.length,{id:'solo-rival-1',name:request.kind==='arcade'?`CPU ${round+1}`:'CPU',kind:'bot',device:'bot',team:1,discipline:request.kind==='arcade'?LADDER[round]:challenge?.metric==='blocks'?'hardware':'hardware',difficulty:request.kind==='arcade'?(round===7?'hard':round<2?'easy':'normal'):request.kind==='training'?'dummy':challenge?.opponent??'normal'})];
 if(survival)while(players.length<4)players.push(createSeat(players.length,{id:`solo-rival-${players.length}`,kind:'bot',device:'bot',team:1,difficulty:'normal',discipline:LADDER[players.length]}));
 const config:MatchConfig={...base,ruleset:'expanded',gameMode:survival?'survival':request.kind==='training'?'training':'stock',bestOf:1,mode:survival?'teams':'ffa',practice:request.kind==='training',arena:challenge?.arena??(request.kind==='arcade'?(['classic','lab','pc','embedded','virtual'] as const)[round%5]:request.kind==='training'?base.arena==='arcade'?'lab':base.arena:'embedded'),lives:3,timeLimit:request.kind==='training'||request.kind==='survival'?0:challenge?.seconds??180,items:false,hazards:false,friendlyFire:false,seed:Date.now(),players};
 return {id:crypto.randomUUID(),request,round,config,playerId:humans[0].id,profileId:localStorage.getItem('stf-active-profile')??'guest',metrics:freshMetrics(),completed:false,failed:false,seenEvents:new Set(),doubleJumpPending:false,recoveryPending:false};
}
export function advanceArcade(run:SoloRun):SoloRun {return startSolo(run.request,run.config,Math.min(7,run.round+1));}
export function observeSolo(run:SoloRun,snapshot:MatchSnapshot):SoloRun {
 if(run.completed||run.failed)return run;
 if(run.previous&&run.previous.matchId!==snapshot.matchId){run.previous=undefined;run.seenEvents.clear();}
 const fighter=snapshot.fighters.find(p=>p.id===run.playerId), before=run.previous?.fighters.find(p=>p.id===run.playerId);
 const metrics=run.metrics;
 if(fighter&&before&&snapshot.tick> (run.previous?.tick??0)&&snapshot.phase==='playing'){
  if(before.lives===fighter.lives&&!fighter.eliminated)metrics.distance+=Math.min(30,Math.abs(fighter.x-before.x));
  if((before.airJumps??1)>(fighter.airJumps??1)&&!fighter.grounded)run.doubleJumpPending=true;
  if(fighter.action==='recover')run.recoveryPending=true;
  if(before.lives!==fighter.lives){run.doubleJumpPending=false;run.recoveryPending=false;}
  if(fighter.grounded&&!before.grounded){if(run.doubleJumpPending)metrics.doubleJumps++;if(run.recoveryPending)metrics.recoveries++;run.doubleJumpPending=false;run.recoveryPending=false;}
 }
 for(const event of snapshot.events){
  if(run.seenEvents.has(event.id))continue;run.seenEvents.add(event.id);
  if(event.type==='block'&&event.targetId===run.playerId)metrics.blocks++;
  if(event.seatId!==run.playerId)continue;
  if(event.type==='attack'&&event.action==='dodge')metrics.dodges++;
  if(event.type==='active'&&event.action==='special'&&event.discipline==='vr')metrics.blinks++;
  if(event.type==='hit'){
   if(event.action==='air-forward')metrics.airHits++;
   if(event.action==='air-down')metrics.spikes++;
   if(event.action==='special')metrics.specialHits++;
   if(event.action==='combo')metrics.signatureHits++;
  }
 }
 metrics.boards=Math.max(metrics.boards,snapshot.deployables?.filter(d=>d.ownerId===run.playerId&&d.kind==='board').length??0);
 metrics.waves=Math.max(metrics.waves,(snapshot.objective?.wave??1)-1);
 const challenge=CHALLENGES.find(c=>c.id===run.request.challengeId);
 if(run.request.kind==='challenge'&&challenge&&metrics[challenge.metric]>=challenge.target){
  run.completed=true;const p=loadProgress(run.profileId);p.completedChallenges=[...new Set([...p.completedChallenges,challenge.id])];saveProgress(p,run.profileId);
 }else if(snapshot.phase==='finished'&&snapshot.matchId!==run.processedResult){
  run.processedResult=snapshot.matchId;
  if(run.request.kind==='arcade'){
   const won=snapshot.result?.winners.includes(run.playerId)??false;run.completed=won;run.failed=!won;
   if(won&&run.round===7){const p=loadProgress(run.profileId);p.arcadeClears++;saveProgress(p,run.profileId);}
  }else if(run.request.kind==='challenge')run.failed=true;
  else if(run.request.kind==='survival'){run.completed=true;const p=loadProgress(run.profileId);p.survivalBest=Math.max(p.survivalBest,metrics.waves);saveProgress(p,run.profileId);}
 }
 run.previous=snapshot;
 return {...run,metrics:{...metrics}};
}
