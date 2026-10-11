import { useId, useState } from 'react';
import { Choice } from './MenuControls';
import type { AppSettings, MatchSnapshot, TrainingCommand } from '../shared/types';
import { keyName } from './preferences';
import { ui } from './i18n';
export function TrainingControls({snapshot,settings,command}:{snapshot:MatchSnapshot;settings:AppSettings;command:(command:TrainingCommand)=>void}) {
 const es=settings.language==='es',training=snapshot.training,paused=snapshot.phase==='paused';
 const [expanded,setExpanded]=useState(false),[targetId,setTargetId]=useState(snapshot.config.players.find(seat=>seat.kind==='bot')?.id??snapshot.config.players[0]?.id??''),[damage,setDamage]=useState(0);
 const panelId=useId();
 const target=snapshot.config.players.find(seat=>seat.id===targetId)??snapshot.config.players[0];
 const targetDamage=Math.round(snapshot.fighters.find(fighter=>fighter.id===target?.id)?.damage??0);
 const history:{key:string;seatId:string;tick:number;count:number;label:string}[]=[];
 for(const input of training?.inputHistory ?? []) {
  const label=Object.entries(input).filter(([key,value])=>!['tick','seatId'].includes(key)&&value===true).map(([action])=>(ui[settings.language] as Record<string,string>)[action]??keyName(action)).join(' + ');
  const key=`${input.seatId}:${label}`,previous=history.at(-1);
  if(previous?.key===key) {previous.count++;previous.tick=input.tick;}
  else history.push({key,seatId:input.seatId,tick:input.tick,count:1,label});
 }
 const activeHistory=history.filter(frame=>frame.label);
 const visibleHistory=(activeHistory.length?activeHistory:history).slice(-12);
 const actions:{action:TrainingCommand['action'];label:string;enabled?:boolean}[]=[
  {action:'reset-damage',label:es?'Daño a cero':'Reset damage'},
  {action:'reset-position',label:es?'Restaurar posiciones':'Reset positions'},
  {action:'reset-all',label:es?'Restaurar todo':'Reset all'},
  {action:'hitboxes',label:es?'Hitboxes':'Hitboxes',enabled:!training?.hitboxes},
  {action:'record',label:training?.recording?(es?'Detener grabación':'Stop recording'):(es?'Grabar dummy':'Record dummy'),enabled:!training?.recording},
  {action:'playback',label:training?.playback?(es?'Detener reproducción':'Stop playback'):(es?'Reproducir dummy':'Play dummy'),enabled:!training?.playback},
  {action:'frame',label:es?'Avanzar un cuadro':'Advance one frame'},
 ];
 return <section className={`training-controls ${paused?'training-paused':'training-overlay'}`} aria-label={es?'Herramientas de entrenamiento':'Training tools'} data-menu-linear>
  {!paused&&<button className="training-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={()=>setExpanded(value=>!value)}>{es?'Herramientas de entrenamiento':'Training tools'} <span aria-hidden="true">{expanded?'−':'+'}</span></button>}
  <div id={panelId} className="training-content" hidden={!paused&&!expanded}>
   <div className="training-options">
   <Choice label={es?'Objetivo':'Target'} value={target?.id??''} options={snapshot.config.players.map((seat,index)=>({value:seat.id,label:`P${index+1} · ${seat.name}`}))} change={setTargetId}/>
   <div className="training-damage"><Choice label={es?'Fijar daño':'Set damage'} value={damage} options={[0,25,50,75,100,125,150,175,200].map(value=>({value,label:`${value}%`}))} change={setDamage}/><button className="secondary-button" onClick={()=>command({action:'set-damage',seatId:target?.id,damage})}>{es?'Aplicar daño':'Apply damage'}</button></div>
   <p className="training-target-status" role="status">{target?.name} · {es?'Daño actual':'Current damage'} {targetDamage}%</p>
  <div className="training-toolbar">{actions.map(action=><button key={action.action} className="secondary-button" aria-pressed={action.action==='hitboxes'?training?.hitboxes:action.action==='record'?training?.recording:action.action==='playback'?training?.playback:undefined} disabled={action.action==='playback'&&!training?.dummyRecording.length||action.action==='frame'&&snapshot.phase!=='paused'} onClick={()=>command({action:action.action,enabled:action.enabled})}>{action.label}</button>)}</div>
  </div>
  <div className="training-history" aria-label={es?'Historial de entradas':'Input history'}>{visibleHistory.map((input,index)=><span key={`${input.tick}:${input.seatId}:${index}`}>{input.tick} {input.seatId} {input.label||'·'}{input.count>1?` ×${input.count}`:''}</span>)}</div>
  </div>
 </section>;
}
