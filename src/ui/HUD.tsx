import { Avatar } from './Avatar';
import { ITEM_ART } from '../game/expansionArt';
import type { AppSettings, AssetsManifest, MatchSnapshot, ItemKind, PlayerSeat } from '../shared/types';
import { disciplineInfo, formatLives, names } from './i18n';
export function formatClock(seconds:number) {const s=Math.max(0,Math.ceil(seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
const itemLabels:Record<ItemKind,{es:string;en:string}>={usb:{es:'USB',en:'USB'},fan:{es:'Ventilador',en:'Cooling fan'},firewall:{es:'Firewall',en:'Firewall'},battery:{es:'Batería',en:'Battery'},overclock:{es:'Overclock',en:'Overclock'}};
export function HUD({snapshot,settings,manifest}:{snapshot:MatchSnapshot;settings:AppSettings;manifest:AssetsManifest|null}) {
 const es=settings.language==='es',mode=snapshot.config.gameMode??'stock',objective=snapshot.objective;
 const localSeats=snapshot.config.players.filter(seat=>seat.kind==='human'&&seat.device!=='remote');
 const opponents=snapshot.config.players.filter(seat=>!localSeats.some(local=>local.id===seat.id));
 const renderSeat=(seat:PlayerSeat,compact=false)=>{
  const index=snapshot.config.players.findIndex(player=>player.id===seat.id);

   const fighter=snapshot.fighters.find(fighter=>fighter.id===seat.id),score=snapshot.scores?.[seat.id];
   const damage=Math.round(fighter?.damage??0),lives=fighter?.lives??snapshot.config.lives;
   return <article key={seat.id} className={`hud-fighter ${compact?'hud-opponent':''} ${fighter?.eliminated?'eliminated':''} ${fighter&&fighter.stun>0?'hurt':''}`} style={{'--fighter-color':disciplineInfo[seat.discipline].color} as React.CSSProperties}>
    <Avatar portrait appearance={seat.appearance} manifest={manifest} discipline={seat.discipline} hurt={!!fighter&&fighter.stun>0} eliminated={fighter?.eliminated}/>
    <div className="hud-details"><div className="hud-name"><span>P{index+1}</span><strong>{seat.name}</strong>{snapshot.config.mode==='teams'&&<b className={`team-badge team-${seat.team}`}>{seat.team===0?'◆ A':'● B'}</b>}</div><span className="hud-discipline">{names[seat.discipline][settings.language]}</span><div className="hud-values"><strong className={damage>=100?'danger':damage>=60?'warning':''}>{damage}<small>%</small></strong>
     {compact?<span>{fighter?.eliminated?`#${score?.placement??snapshot.result?.placements?.[seat.id]??'—'}`:es?'En pie':'Alive'}</span>:mode==='timed'?<span>{(score?.kos??0)-(score?.selfDestructs??0)} KO</span>:mode==='hill'?<span>{(score?.hill??0).toFixed(1)} s</span>:mode==='royale'&&fighter?.eliminated?<span>#{score?.placement??snapshot.result?.placements?.[seat.id]??'—'}</span>:<div className="stock-display" aria-label={formatLives(lives,settings.language)}>{snapshot.config.practice?'∞':lives<=5?Array.from({length:snapshot.config.lives},(_,i)=><i key={i} className={i<lives?'filled':''}/>):<><i className="filled"/><b>×{lives}</b></>}<span className="stock-count">{snapshot.config.practice?'':`×${lives}`}</span></div>}
    </div>
    {!compact&&snapshot.config.ruleset==='expanded'&&<div className="hud-resources"><span className={fighter?.airJumps?'':'spent'}>{es?'Salto':'Jump'} {fighter?.airJumps??0}</span><span className={fighter?.airDash?'':'spent'}>{es?'Impulso':'Dash'}</span><span className={fighter?.recoveryAvailable?'':'spent'}>{es?'Recuperar':'Recover'}</span>{!!fighter?.dodgeCooldown&&<span>{es?'Esquiva':'Dodge'} {fighter.dodgeCooldown.toFixed(1)}s</span>}{fighter?.guardMeter!==undefined&&<span>{es?'Guardia':'Guard'} {Math.round(fighter.guardMeter)}%</span>}</div>}
    {!compact&&!!fighter?.buffs&&<div className="hud-buffs">{Object.entries(fighter.buffs).filter(([,duration])=>duration>0).map(([kind,duration])=><span key={kind} className="hud-buff-icon" role="img" aria-label={`${itemLabels[kind as ItemKind][settings.language]} · ${Math.ceil(duration)}s`} title={itemLabels[kind as ItemKind][settings.language]}><img src={ITEM_ART[kind as ItemKind].url} alt=""/><i style={{transform:`scaleX(${Math.min(1,duration/ITEM_ART[kind as ItemKind].duration)})`}}/></span>)}</div>}
    </div>
   </article>;
  };
 return <>
  {objective&&<div className="objective-status" role="status">
   {!!objective.suddenDeath&&<strong>{es?'MUERTE SUBITA':'SUDDEN DEATH'} · {formatClock(objective.suddenDeath)}</strong>}
   {mode==='hill'&&<span>{objective.contested?(es?'Zona disputada':'Zone contested'):objective.ownerId?`${es?'Control':'Control'}: ${snapshot.config.players.find(seat=>seat.id===objective.ownerId)?.name??'—'}`:(es?'Zona libre':'Zone unclaimed')}</span>}
   {mode==='survival'&&<strong>{es?'Oleada':'Wave'} {objective.wave??1}{objective.nextWave?` · ${formatClock(objective.nextWave)}`:''}</strong>}
   {mode==='royale'&&<span>{snapshot.fighters.filter(fighter=>!fighter.eliminated).length} {es?'en pie':'remaining'} · {es?'Zona segura reduciéndose':'Safe zone shrinking'}</span>}
  </div>}
  <div className={`match-hud ${mode==='royale'?'royale-hud':''}`} style={{'--seat-count':snapshot.config.players.length} as React.CSSProperties}>
   {mode==='royale'?<>
    {localSeats.length>0&&<div className="royale-local-roster" aria-label={es?'Luchadores locales':'Local fighters'} style={{'--roster-count':localSeats.length} as React.CSSProperties}>{localSeats.map(seat=>renderSeat(seat))}</div>}
    {opponents.length>0&&<div className="royale-opponent-roster" aria-label={es?'Rivales':'Opponents'} style={{'--roster-count':opponents.length} as React.CSSProperties}>{opponents.map(seat=>renderSeat(seat,true))}</div>}
   </>:snapshot.config.players.map(seat=>renderSeat(seat))}
  </div>
 </>;
}
