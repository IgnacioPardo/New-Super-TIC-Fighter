import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Language, MatchConfig } from '../../shared/types';
import type { PublicOnline } from './usePublicOnline';
import type { PublicPool } from '../../network/publicTypes';
import { Choice } from '../../ui/MenuControls';
import '../features.css';

export function PublicLobby({language,network,config,editFighters}:{language:Language;network:PublicOnline;config:MatchConfig;editFighters:()=>void}){
 const es=language==='es', [code,setCode]=useState(''),[copied,setCopied]=useState(false),sent=useRef('');
 useEffect(()=>{if(network.status==='idle')void network.connect(config);},[network.status]);
 useEffect(()=>{const humans=config.players.filter(p=>p.kind==='human'),key=JSON.stringify(humans);if(network.lobby&&sent.current!==key){sent.current=key;network.updateSeats(humans);}},[config.players,network.lobby]);
 const lobby=network.lobby,leader=lobby?.party.leaderId===lobby?.peerId;
 const pools=[{value:'duel',label:es?'Duelo · 2 jugadores':'Duel · 2 players'},{value:'ffa',label:es?'Todos contra todos · 4':'Free-for-all · 4'},{value:'teams',label:'2v2'},{value:'royale',label:'Royale · 8'}] as {value:PublicPool;label:string}[];
 const messages:Record<string,string>={disabled:es?'El servidor público está en mantenimiento.':'The public server is under maintenance.',matches:es?'Todos los combates están ocupados. Conservamos tu lugar en la cola.':'Every match slot is occupied. Your queue position is kept.',daily:es?'Se alcanzó la capacidad diaria gratuita.':'Today’s free server capacity has been reached.',pending_edits:es?'Estamos guardando los cambios de tus luchadores.':'Your fighter edits are still being saved.',unavailable:es?'No se pudo conectar al servidor público.':'The public server could not be reached.',assets:es?'No se pudieron cargar los recursos del combate. Vuelve a marcar Listo.':'Match assets could not load. Try Ready again.',version_mismatch:es?'Hay una nueva versión. Recarga la página.':'A new version is available. Reload the page.'};
 return <div className="feature-home" data-menu-linear>
  <section className="feature-panel" style={{'--config-accent':'#57d4f1'} as CSSProperties}>
   <header className="feature-heading"><span className="feature-number">VS</span><div><h2>{es?'Punto de encuentro':'Online meeting point'}</h2><p>{es?'Combates ejecutados por el servidor. Todos entran como jugadores.':'Matches run on the server. Everyone joins as a player.'}</p></div><b>{lobby?.onlinePlayers??0} online</b></header>
   <div className="feature-body">
    <div className="feature-actions"><button data-autofocus disabled={!!lobby?.party.queued} onClick={editFighters}>{es?'Luchadores y controles':'Fighters and controls'}</button><span className="config-note">{config.players.filter(p=>p.kind==='human').map(p=>p.name).join(' · ')}</span></div>
    {lobby?<>
     <Choice label={es?'Lista de juego':'Playlist'} value={lobby.party.preference.pool} disabled={!leader||lobby.party.queued} options={pools} change={pool=>network.preference({...lobby.party.preference,pool,ruleset:pool==='royale'?'expanded':lobby.party.preference.ruleset})}/>
     <Choice label={es?'Reglas':'Rules'} value={lobby.party.preference.ruleset} disabled={!leader||lobby.party.queued||lobby.party.preference.pool==='royale'} options={[{value:'expanded',label:es?'Expandido':'Expanded'},{value:'classic',label:es?'Clásico':'Classic'}]} change={ruleset=>network.preference({...lobby.party.preference,ruleset})}/>
     <div className="feature-actions"><button className="primary-button" disabled={!leader||(!lobby.capacity.enabled&&!lobby.party.queued)||network.bridge.state.pendingEdits} onClick={()=>network.queue(!lobby.party.queued)}>{lobby.party.queued?(es?'Cancelar búsqueda':'Cancel search'):(es?'Buscar combate':'Find a match')}</button><span className="config-note">{lobby.party.queued?(es?'Buscando un grupo compatible…':'Looking for a compatible group…'):`${lobby.capacity.queuedParties} ${es?'grupos en cola':'parties queueing'} · ${network.ping?`${Math.round(network.ping)} ms`:''}`}</span></div>
     {lobby.capacity.reason&&<p className="feature-status">{messages[lobby.capacity.reason]}{lobby.capacity.reason==='daily'&&` ${es?'Se reinicia':'Resets'} ${new Date(lobby.capacity.resetAt).toLocaleString(es?'es-AR':'en-US')}`}</p>}
     <p className="config-note">{es?'2v2 admite grupos de hasta dos. No se agregan bots a las partidas públicas.':'2v2 accepts parties of up to two. Public matches never add bots.'}</p>
    </>:<><p className="feature-status">{network.status==='connecting'?(es?'Conectando…':'Connecting…'):(es?'No hay conexión pública.':'Public connection unavailable.')}</p><button onClick={()=>{network.disconnect();void network.connect(config);}}>{es?'Reintentar':'Retry'}</button></>}
   </div>
  </section>
  {lobby&&<section className="feature-panel" style={{'--config-accent':'#a0e769'} as CSSProperties}><header className="feature-heading"><div><h2>{es?'Tu grupo':'Your party'}</h2><p>{es?'Invita amigos de otros dispositivos antes de buscar.':'Invite friends on other devices before queueing.'}</p></div><b>{lobby.party.players.length}/8</b></header><div className="feature-body">
   <ul className="feature-list">{lobby.party.players.map(player=><li key={player.id}><strong>{player.name}</strong><span>{player.peerId===lobby.peerId?(es?'Este equipo':'This device'):(es?'Amigo online':'Online friend')}</span></li>)}</ul>
   <div className="feature-actions"><button onClick={()=>void navigator.clipboard.writeText(lobby.party.inviteCode).then(()=>setCopied(true)).catch(()=>setCopied(false))}>{copied?(es?'Copiado':'Copied'):`${es?'Copiar código':'Copy code'}: ${lobby.party.inviteCode}`}</button>{lobby.party.peerIds.length>1&&<button disabled={lobby.party.queued} onClick={network.leaveParty}>{es?'Salir del grupo':'Leave party'}</button>}</div>
   <label className="config-row name-row"><span>{es?'Código de amigo':'Friend’s code'}</span><input data-keyboard-required maxLength={8} value={code} onChange={e=>setCode(e.target.value.toUpperCase())} aria-label={es?'Código de grupo':'Party code'} autoComplete="off"/></label><button className="small-button" disabled={code.length!==8||lobby.party.queued} onClick={()=>network.joinParty(code)}>{es?'Unirse al grupo':'Join party'}</button>
  </div></section>}
  {!!lobby?.activities.length&&<section className="feature-panel"><header className="feature-heading"><div><h2>{es?'En juego':'Now playing'}</h2></div></header><ul className="feature-list feature-body">{lobby.activities.map(activity=><li key={activity.id}><span>{pools.find(p=>p.value===activity.pool)?.label} · {activity.players}P</span><button disabled={!activity.spectatable} onClick={()=>void network.spectate(activity.id)}>{es?'Ver combate':'Watch match'}</button></li>)}</ul></section>}
  {network.error&&<p className="feature-status" role="alert">{messages[network.errorCode]??(es?'No se pudo completar la acción. Revisa el grupo y vuelve a intentarlo.':'The action could not finish. Check your party and try again.')}</p>}
 </div>;
}
