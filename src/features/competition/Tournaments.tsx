import { useEffect, useRef, useState } from 'react';
import type { Language, MatchConfig } from '../../shared/types';
import type { TournamentState } from '../../network/publicTypes';
import type { PublicOnline } from '../online/usePublicOnline';
import { Choice } from '../../ui/MenuControls';
import '../features.css';
import { ContentTabs, PagedContent, usePageSize } from '../../ui/ContentPages';

type Listing = { id:string; name:string; phase:string; data?:string; updatedAt?:number };
export function Tournaments({ language, network, config }: { language:Language; network:PublicOnline; config:MatchConfig }) {
 const es=language==='es', pageSize=usePageSize(4,2);
 const [list,setList]=useState<Listing[]>([]),[state,setState]=useState<TournamentState|null>(null);
 const [id,setId]=useState(new URLSearchParams(location.search).get('tournament')??sessionStorage.getItem('stf-tournament')??'');
 const [name,setName]=useState(''),[kind,setKind]=useState<'elimination'|'round-robin'>('elimination');
 const [team,setTeam]=useState(false),[capacity,setCapacity]=useState(4),[visibility,setVisibility]=useState<'public'|'private'>('public');
 const [ruleset,setRuleset]=useState<'classic'|'expanded'>('expanded'),[seat,setSeat]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const generation=useRef(0);
 const [streamRevision,setStreamRevision]=useState(0);
 const ownSeats=network.lobby?.party.players.filter(p=>p.peerId===network.lobby?.peerId)??[];
 const credentials=()=>{const value=network.credentials();if(!value)throw Error('lobby_identity_required');return value;};
 const request=async<T,>(path:string,body?:unknown):Promise<T>=>{
  const response=await fetch(`/api/tournaments${path}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
  const value=await response.json();if(!response.ok)throw Error(value.error??'unavailable');return value;
 };
 const errors:Record<string,string>={
  entrants_required:es?'Completa las plazas antes de comenzar.':'Fill all entrant places before starting.',
  entrant_size:es?'Los equipos necesitan exactamente dos jugadores.':'Teams need exactly two players.',
  seat_unavailable:es?'Ese jugador ya está inscrito.':'That player is already entered.',
  fighter_not_classic:es?'Classic permite Redes, Diseño, Programación y Hardware.':'Classic allows Networks, Design, Programming, and Hardware.',
  registration_closed:es?'La inscripción está cerrada.':'Registration is closed.',
  lobby_identity_required:es?'Conecta al lobby antes de inscribirte.':'Connect to the lobby before entering.',
  owner_required:es?'Solo quien creó la competencia puede iniciarla.':'Only the competition owner can start it.',
  tournament_not_found:es?'No se encontró esa competencia.':'Competition not found.',
  party_leader_required:es?'El líder del grupo debe inscribir al equipo.':'The party leader must enter the team.',
 };
 const act=async(task:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await task();}catch(e){const code=e instanceof Error?e.message:'';setMessage(errors[code]??(es?'No se pudo completar. Vuelve a intentarlo.':'Could not complete the request. Try again.'));}finally{setBusy(false);}};
 const loadList=async()=>{const result=await request<Listing[]|{tournaments:Listing[]}>('');setList(Array.isArray(result)?result:result.tournaments);};
 const open=async(value:string)=>{
  const clean=value.trim().replace(/^.*[?&]tournament=/,'').split('&')[0];
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(clean))throw Error('tournament_not_found');
  const next=await request<TournamentState>(`/${encodeURIComponent(clean)}`);setState(next);setId(next.id);setStreamRevision(value=>value+1);sessionStorage.setItem('stf-tournament',next.id);
 };
 useEffect(()=>{void act(async()=>{await network.connect(config);await loadList();if(id)await open(id);});},[]);
 useEffect(()=>{
  if(!state?.id)return;
  const gen=++generation.current;
  const url=new URL(`/api/tournaments/${state.id}/ws`,location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
  let socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,keepalive:ReturnType<typeof setInterval>|undefined,attempt=0;
  const connect=()=>{
   if(gen!==generation.current)return;
   socket=new WebSocket(url);
   socket.onopen=()=>{attempt=0;keepalive=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send('ping');},20000);};
   socket.onmessage=event=>{try{const data=JSON.parse(event.data);if(data.type==='tournament'&&gen===generation.current)setState(data.state);}catch{/* Non-state keepalive. */}};
   socket.onclose=()=>{clearInterval(keepalive);if(gen===generation.current)retry=setTimeout(connect,Math.min(1000*2**attempt++,15000));};
   socket.onerror=()=>socket?.close();
  };
  connect();
  const online=()=>{if(socket?.readyState===WebSocket.CLOSED){clearTimeout(retry);connect();}};
  window.addEventListener('online',online);
  return()=>{generation.current++;clearTimeout(retry);clearInterval(keepalive);window.removeEventListener('online',online);socket?.close();};
 },[state?.id,streamRevision]);
 const entryName=(entryId:string)=>state?.entrants.find(e=>e.id===entryId)?.name??'—';
 const phase=(value:string)=>({registration:es?'Inscripción':'Registration',running:es?'En juego':'In progress',finished:es?'Finalizada':'Complete',scheduled:es?'Pendiente':'Scheduled'}[value]??value);
 const enter=()=>act(async()=>{
  if(!state)return;
  const selected=ownSeats.find(p=>p.id===seat)??ownSeats[0];if(!selected)throw Error('lobby_identity_required');
  const body=state.team?{...credentials(),party:true,name:name.trim()||network.lobby?.party.players.map(p=>p.name).join(' + ').slice(0,32)}:{name:selected.name,members:[{...credentials(),seatIds:[selected.id]}]};
  setState(await request<TournamentState>(`/${state.id}/join`,body));
 });
 return <div className="feature-home competition-home" data-menu-linear>
  <p className="feature-subtitle">{es?'Duelos y equipos 2v2. Los resultados del servidor deciden cada avance.':'Duels and 2v2 teams. Server results decide every advancement.'}</p>
  {message&&<p role="status" className="feature-status">{message}</p>}
  {state?<ContentTabs key={state.id} label={es?'Competencia':'Competition'} pages={[{id:'competition',label:es?'Competencia':'Competition',content:(<>
   <section className="feature-panel">
    <header className="feature-heading"><div><h2>{state.name}</h2><p>{phase(state.phase)} · {state.team?'2v2':es?'Duelos':'Duels'} · {state.kind==='elimination'?(es?'Eliminación · Al mejor de 3':'Elimination · Best of 3'):(es?'Liga · Una partida por cruce':'League · One game per fixture')}</p></div><b>{state.entrants.length}/{state.capacityLimit}</b></header>
    <div className="feature-body">
     {state.phase==='registration'&&<>
      {!state.team&&<Choice label={es?'Jugador local':'Local player'} value={seat||ownSeats[0]?.id||''} options={ownSeats.map(p=>({value:p.id,label:p.name}))} change={value=>setSeat(String(value))}/>}
      <p className="config-note">{state.team?(es?'El líder inscribe al grupo completo de dos jugadores. Forma el grupo en el lobby público.':'The leader enters the whole two-player party. Form your party in the public lobby.'):(es?'Puedes inscribir a cada jugador local por separado. Sus partidas se programan sin superponerse.':'Enter each couch player separately. Their matches are scheduled without overlap.')}</p>
      <div className="feature-actions"><button disabled={busy||!ownSeats.length} onClick={enter}>{state.team?(es?'Inscribir grupo como equipo':'Enter party as team'):(es?'Inscribir jugador':'Enter player')}</button>
       {state.ownerId===network.lobby?.peerId&&<button disabled={busy||state.entrants.length!==state.capacityLimit} onClick={()=>void act(async()=>setState(await request<TournamentState>(`/${state.id}/start`,credentials())))}>{es?'Comenzar competencia':'Start competition'}</button>}
      </div>
     </>}
     <div className="feature-actions"><button disabled={busy} onClick={()=>void act(async()=>{await open(state.id);const tickets=await request<import('../../network/publicTypes').MatchTicket[]>(`/${state.id}/tickets`,credentials());if(tickets[0])await network.connectTicket(tickets[0]);})}>{es?'Actualizar / Recuperar partida':'Refresh / Recover match'}</button><button onClick={()=>void act(async()=>{await navigator.clipboard.writeText(`${location.origin}/?tournament=${state.id}`);setMessage(es?'Enlace copiado.':'Link copied.');})}>{es?'Copiar invitación':'Copy invite'}</button><button onClick={()=>{setState(null);void act(loadList);}}>{es?'Ver competencias':'Browse competitions'}</button></div>
     <p className="config-note">{es?'Código':'Code'}: {state.id}</p>
     {state.capacity?.reason&&<p className="feature-status">{es?'Esperando capacidad gratuita. El cuadro se conserva y volverá a intentar.':'Waiting for free capacity. The bracket is saved and will retry.'}</p>}
     {state.championIds.length>0&&<h3>{es?'Campeones':'Champions'}: {state.championIds.map(entryName).join(' / ')}</h3>}
    </div>
   </section>
   </>)},{id:'entrants',label:es?'Participantes':'Entrants',content:(<section className="feature-panel"><header className="feature-heading"><h2>{es?'Participantes':'Entrants'}</h2></header><div className="feature-body"><PagedContent size={pageSize} language={language} label={es?'Participantes':'Entrants'} className="feature-list">{state.entrants.map(entry=><li key={entry.id}><strong>{entry.name}</strong><span>{entry.players.map(p=>p.name).join(' + ')}</span></li>)}</PagedContent></div></section>)},
   ...(state.games.length>0?[{id:'fixtures',label:es?'Resultados':'Results',content:(<section className="feature-panel"><header className="feature-heading"><h2>{es?'Cuadro y resultados':'Fixtures and results'}</h2></header><div className="feature-body"><PagedContent size={pageSize} language={language} label={es?'Resultados':'Results'} className="competition-fixtures">{state.games.map(game=><article key={game.id} className={`competition-fixture ${game.phase}`}><small>{es?'Ronda':'Round'} {game.round} · {phase(game.phase)}</small>{game.entrants.map((entry,index)=><div key={entry} className={game.winner===entry?'winner':''}><span>{entryName(entry)}</span><b>{game.wins[index]}</b></div>)}{game.phase==='running'&&game.matchId&&<button onClick={()=>void act(async()=>{const result=await request<{matchId:string;token:string}>(`/${state.id}/spectate`,{...credentials(),matchId:game.matchId});await network.spectateTicket(result.matchId,result.token);})}>{es?'Ver partida':'Watch match'}</button>}</article>)}</PagedContent></div></section>)}]:[]),
   ...(state.kind==='round-robin'&&state.standings.length>0?[{id:'standings',label:es?'Posiciones':'Standings',content:(<section className="feature-panel"><header className="feature-heading"><h2>{es?'Tabla de posiciones':'Standings'}</h2></header><div className="feature-body"><PagedContent size={pageSize} language={language} label={es?'Posiciones':'Standings'} className="feature-list standings-list">{state.standings.map(row=><li key={row.entrantId}><strong>{row.rank}. {entryName(row.entrantId)}</strong><span>{row.wins} {es?'victorias':'wins'} · {row.losses} {es?'derrotas':'losses'} · KO {row.koDifferential>0?'+':''}{row.koDifferential}</span></li>)}</PagedContent></div></section>)}]:[])]}/>
  :<ContentTabs key="browse" label={es?'Competencias':'Competitions'} pages={[{id:'browse',label:es?'Explorar':'Browse',content:(<>

   <section className="feature-panel"><header className="feature-heading"><div><h2>{es?'Competencias abiertas':'Open competitions'}</h2><p>{es?'Sin clasificación MMR. Juega como invitado o con tu cuenta.':'No ranked MMR. Play as a guest or with your account.'}</p></div></header><div className="feature-body"><PagedContent size={pageSize} language={language} label={es?'Competencias':'Competitions'} className="feature-list">{list.map(item=><li key={item.id}><span>{item.name} · {phase(item.phase)}</span><button onClick={()=>void act(()=>open(item.id))}>{es?'Abrir':'Open'}</button></li>)}</PagedContent>{!list.length&&<p>{es?'Aún no hay competencias públicas. Puedes crear una.':'No public competitions yet. Create one below.'}</p>}<label className="config-row"><span>{es?'Código de invitación':'Invite code'}</span><input value={id} onChange={e=>setId(e.target.value)} data-keyboard-required aria-label={es?'Código de competencia':'Competition code'}/></label><div className="feature-actions"><button disabled={busy||!id.trim()} onClick={()=>void act(()=>open(id))}>{es?'Abrir invitación':'Open invite'}</button><button disabled={busy} onClick={()=>void act(loadList)}>{es?'Actualizar lista':'Refresh list'}</button></div></div></section>
   </>)},{id:'create',label:es?'Crear':'Create',content:(<section className="feature-panel competition-create"><header className="feature-heading"><h2>{es?'Crear competencia':'Create competition'}</h2></header><div className="feature-body">
    <label className="config-row"><span>{es?'Nombre':'Name'}</span><input value={name} maxLength={40} onChange={e=>setName(e.target.value)} data-keyboard-required aria-label={es?'Nombre de competencia':'Competition name'}/></label>
    <Choice label={es?'Formato':'Format'} value={kind} options={[{value:'elimination',label:es?'Eliminación':'Elimination'},{value:'round-robin',label:es?'Liga todos contra todos':'Round-robin league'}]} change={value=>{setKind(value as typeof kind);setCapacity(4);}}/>
    <Choice label={es?'Participantes':'Entrants'} value={team?'teams':'duels'} options={[{value:'duels',label:es?'Duelos':'Duels'},{value:'teams',label:'2v2'}]} change={value=>{setTeam(value==='teams');setCapacity(4);}}/>
    <Choice label={es?'Plazas':'Places'} value={capacity} options={(kind==='round-robin'?[4,5,6,7,8]:team?[4,8]:[4,8,16]).map(value=>({value,label:String(value)}))} change={value=>setCapacity(Number(value))}/>
    <Choice label={es?'Reglas':'Rules'} value={ruleset} options={[{value:'expanded',label:'Expanded'},{value:'classic',label:'Classic'}]} change={value=>setRuleset(value as typeof ruleset)}/>
    <Choice label={es?'Visibilidad':'Visibility'} value={visibility} options={[{value:'public',label:es?'Pública':'Public'},{value:'private',label:es?'Por invitación':'Invite only'}]} change={value=>setVisibility(value as typeof visibility)}/>
    <div className="feature-actions"><button disabled={busy||!name.trim()||!network.lobby} onClick={()=>void act(async()=>{const next=await request<TournamentState>('',{...credentials(),name:name.trim(),kind,team,capacity,visibility,ruleset});setState(next);setId(next.id);sessionStorage.setItem('stf-tournament',next.id);})}>{es?'Crear competencia':'Create competition'}</button></div>
   </div></section>
  )}]}/> }
 </div>;
}
