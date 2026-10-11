import type { Language } from '../shared/types';
import type { MatchSetState } from './useMatchSet';
export function SetScore({state,language}:{state:MatchSetState;language:Language}) {
 const es=language==='es',length=state.config.bestOf??3;
 return <section className="set-score" aria-label={es?'Resultado de la serie':'Set score'}>
  <p>{state.complete?(es?'Serie terminada':'Set complete'):`${es?'Combate':'Bout'} ${state.bouts.length+1}${state.bouts.length<length?` / ${length}`:''}`} · {es?'Al mejor de':'Best of'} {length}</p>
  <div>{state.config.players.map(seat=><span key={seat.id}><strong>{seat.name}</strong><b>{state.wins[seat.id]??0}</b>{state.complete&&state.winners.includes(seat.id)&&<i aria-label={es?'Ganador de la serie':'Set winner'}>★</i>}</span>)}</div>
  {state.complete&&state.winners.length===0&&<strong>{state.bouts.at(-1)?.result.reason==='interrupted'?(es?'Sin resultado':'No result'):(es?'Empate de la serie':'Set tied')}</strong>}
 </section>;
}
