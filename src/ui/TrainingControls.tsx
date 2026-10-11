import type { AppSettings, MatchSnapshot, TrainingCommand } from '../shared/types';
import { keyName } from './preferences';
export function TrainingControls({snapshot,settings,command}:{snapshot:MatchSnapshot;settings:AppSettings;command:(command:TrainingCommand)=>void}) {
 const es=settings.language==='es',training=snapshot.training;
 const actions:{action:TrainingCommand['action'];label:string;enabled?:boolean}[]=[
  {action:'reset-damage',label:es?'Daño a cero':'Reset damage'},
  {action:'reset-position',label:es?'Restaurar posiciones':'Reset positions'},
  {action:'reset-all',label:es?'Restaurar todo':'Reset all'},
  {action:'hitboxes',label:es?'Hitboxes':'Hitboxes',enabled:!training?.hitboxes},
  {action:'record',label:training?.recording?(es?'Detener grabación':'Stop recording'):(es?'Grabar dummy':'Record dummy'),enabled:!training?.recording},
  {action:'playback',label:training?.playback?(es?'Detener reproducción':'Stop playback'):(es?'Reproducir dummy':'Play dummy'),enabled:!training?.playback},
  {action:'frame',label:es?'Avanzar un cuadro':'Advance one frame'},
 ];
 return <section aria-label={es?'Herramientas de entrenamiento':'Training tools'}>
  <div className="training-toolbar">{actions.map(action=><button key={action.action} className="secondary-button" aria-pressed={action.action==='hitboxes'?training?.hitboxes:action.action==='record'?training?.recording:action.action==='playback'?training?.playback:undefined} disabled={action.action==='playback'&&!training?.dummyRecording.length||action.action==='frame'&&snapshot.phase!=='paused'} onClick={()=>command({action:action.action,enabled:action.enabled})}>{action.label}</button>)}</div>
  <div className="training-history" aria-label={es?'Historial de entradas':'Input history'}>{training?.inputHistory.slice(-12).map((input,index)=><span key={`${input.tick}:${input.seatId}:${index}`}>{input.tick} {input.seatId} {Object.entries(input).filter(([key,value])=>!['tick','seatId'].includes(key)&&value===true).map(([action])=>keyName(action)).join(' + ')||'·'}</span>)}</div>
 </section>;
}
