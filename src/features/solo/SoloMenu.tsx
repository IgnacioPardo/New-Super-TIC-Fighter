import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Language } from '../../shared/types';
import { CHALLENGES } from './solo';
import type { SoloRequest, SoloRun } from './solo';
import { loadProgress } from '../profile/progress';
import '../features.css';
import { PagedContent, usePageSize } from '../../ui/ContentPages';

export function SoloMenu({language,select}:{language:Language;select:(request:SoloRequest)=>void}){
 const es=language==='es', [challenges,setChallenges]=useState(false);
 const pageSize=usePageSize(4,2);
 const progress=loadProgress(localStorage.getItem('stf-active-profile')??'guest');
 return <div className="feature-home solo-home" data-menu-linear>
  <p className="feature-subtitle">{es?'Elige un desafío. Conserva tu luchador y tus controles.':'Choose your challenge. Keep your fighter and controls.'}</p>
  {!challenges?<div className="feature-grid">
   <button className="feature-card" data-autofocus style={{'--config-accent':'#f4bd67'} as CSSProperties} onClick={()=>select({kind:'arcade'})}><span>08</span><span><strong>Arcade</strong><small>{es?'Ocho combates. Un último rival en Difícil.':'Eight bouts. One final Hard opponent.'}</small></span></button>
   <button className="feature-card" style={{'--config-accent':'#f073c9'} as CSSProperties} onClick={()=>select({kind:'survival'})}><span>∞</span><span><strong>{es?'Supervivencia':'Survival'}</strong><small>{es?'Aguanta oleadas cada vez más difíciles.':'Hold off increasingly difficult waves.'}</small></span></button>
   <button className="feature-card" style={{'--config-accent':'#a0e769'} as CSSProperties} onClick={()=>select({kind:'survival',coop:true})}><span>2P</span><span><strong>{es?'Supervivencia cooperativa':'Co-op survival'}</strong><small>{es?'Dos personas, un equipo. También disponible en salas privadas.':'Two people, one team. Also available in private rooms.'}</small></span></button>
   <button className="feature-card" style={{'--config-accent':'#bfa0ee'} as CSSProperties} onClick={()=>setChallenges(true)}><span>12</span><span><strong>{es?'Desafíos':'Challenges'}</strong><small>{progress.completedChallenges.length}/12 · {es?'Movimiento, defensa y habilidades TIC.':'Movement, defense, and TIC abilities.'}</small></span></button>
   <button className="feature-card" data-testid="mode-practice" style={{'--config-accent':'#57d4f1'} as CSSProperties} onClick={()=>select({kind:'training'})}><span>LAB</span><span><strong>{es?'Entrenamiento':'Training'}</strong><small>{es?'Controla el daño, el dummy y cada fotograma.':'Control damage, the dummy, and every frame.'}</small></span></button>
  </div>:<><button className="small-button" data-autofocus onClick={()=>setChallenges(false)}>{es?'Volver a modos':'Back to modes'}</button><PagedContent size={pageSize} language={language} label={es?'Desafíos':'Challenges'} className="feature-grid challenge-grid">{CHALLENGES.map((challenge,index)=><button className="feature-card" key={challenge.id} style={{'--config-accent':progress.completedChallenges.includes(challenge.id)?'#a0e769':'#57d4f1'} as CSSProperties} onClick={()=>select({kind:'challenge',challengeId:challenge.id})}><span>{progress.completedChallenges.includes(challenge.id)?'✓':String(index+1).padStart(2,'0')}</span><span><strong>{challenge.title[language]}</strong><small>{challenge.description[language]} · {challenge.seconds}s</small></span></button>)}</PagedContent></>}
 </div>;
}
export function SoloStatus({run,language,next,retry,leave}:{run:SoloRun;language:Language;next:()=>void;retry:()=>void;leave:()=>void}){
 const es=language==='es', challenge=CHALLENGES.find(c=>c.id===run.request.challengeId);
 const finished=run.completed||run.failed;
 return <aside className={`solo-status ${finished?'solo-finished':''}`} aria-live="polite" data-solo-status>
  <strong>{run.request.kind==='arcade'?`ARCADE · ${run.round+1}/8`:challenge?.title[language]??(es?'SUPERVIVENCIA':'SURVIVAL')}</strong>
  {challenge&&<><span>{challenge.description[language]}</span><b>{Math.min(challenge.target,Math.floor(run.metrics[challenge.metric]))}/{challenge.target}</b></>}
  {run.request.kind==='survival'&&<span>{es?'Oleadas superadas':'Waves cleared'}: {run.metrics.waves}</span>}
  {finished&&<div className="feature-actions"><p>{run.failed?(es?'Vuelve a intentarlo':'Try again'):run.request.kind==='arcade'&&run.round===7?(es?'¡Arcade completado!':'Arcade cleared!'):(es?'¡Completado!':'Cleared!')}</p>{run.request.kind==='arcade'&&run.completed&&run.round<7?<button data-autofocus onClick={next}>{es?'Siguiente combate':'Next bout'}</button>:<button data-autofocus onClick={retry}>{es?'Reintentar':'Retry'}</button>}<button onClick={leave}>{es?'Volver a modos':'Back to modes'}</button></div>}
 </aside>;
}
