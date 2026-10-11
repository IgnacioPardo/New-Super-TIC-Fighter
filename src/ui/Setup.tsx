import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppSettings, AssetsManifest, MatchConfig, PlayerSeat } from '../shared/types';
import type { MenuInput } from '../input';
import type { OnlineBridge } from './contracts';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { disciplineInfo, disciplines, names, ui } from './i18n';
import { ARENAS } from '../shared/content';
import { defaultSeat, keyName } from './preferences';
import { Choice, MenuDialog, MenuTabs, menuTargets } from './MenuControls';

const palettes = {hair:['#164d43','#657822','#5c2f82','#53351f'],shirt:['#24b26d','#75c321','#5734c7','#a72547'],pants:['#7de4dc','#65c052','#b574d4','#d3a479']};
type SeatEditor = {open:boolean; tab:'fighter'|'player'};
type ReadyBridge = OnlineBridge & {setSeatReady?:(id:string,ready:boolean,assetsReady:boolean)=>void;state:OnlineBridge['state'] & {pendingEdits?:boolean;seatReadiness?:Record<string,boolean|{ready:boolean;assetsReady:boolean}>}};
export function Setup({config:incomingConfig,setConfig,settings,manifest,devices,ready,toggleReady,start,online,practice,feedback,invalidateReady,readOnly=false,lockRules=false,lockRoster=false,lockDiscipline=false,editorOnly=false}: {
 config:MatchConfig;setConfig:(config:MatchConfig)=>void;settings:AppSettings;manifest:AssetsManifest|null;
 devices:{id:string;label:string;connected:boolean;controllerId?:string}[];ready:Record<string,boolean>;toggleReady:(id:string)=>void;start:()=>void;
 online?:OnlineBridge;practice:boolean;readOnly?:boolean;lockRules?:boolean;lockRoster?:boolean;lockDiscipline?:boolean;editorOnly?:boolean;invalidateReady?:()=>void;feedback?:(cue:'navigate'|'change'|'back'|'confirm'|'error')=>void;
}) {
 const t=ui[settings.language],lang=settings.language,es=lang==='es';
 const bridge=online as ReadyBridge|undefined;
 const host=!online||online.state.isHost;
 const [ruleDraft,setRuleDraft]=useState<Partial<MatchConfig>>({});
 const config=online&&host?{...incomingConfig,...ruleDraft}:incomingConfig;
 useEffect(()=>{
  setRuleDraft(previous=>{
   if(!host||online?.state.error&&!online.state.pendingEdits) return Object.keys(previous).length?{}:previous;
   const next={...previous};let changed=false;
   for(const [key,value] of Object.entries(previous)) if(JSON.stringify(incomingConfig[key as keyof MatchConfig])===JSON.stringify(value)) {delete next[key as keyof MatchConfig];changed=true;}
   return changed?next:previous;
  });
 },[incomingConfig,host,online?.state.error,online?.state.pendingEdits]);
 const scope=useRef<HTMLDivElement>(null);
 const [editors,setEditors]=useState<Record<string,SeatEditor>>({});
 const [drafts,setDrafts]=useState<Record<string,Partial<PlayerSeat>>>({});
 const [rulesOpen,setRulesOpen]=useState(false);
 const cursors=useRef(new Map<string,number>());
 const fingerprints=useRef(new Map<string,string>());
 const [reclaims,setReclaims]=useState<Record<string,boolean>>({});
 const sentReadiness=useRef(new Map<string,string>());
 const [sharedDevice,setSharedDevice]=useState<string|null>(null);
 const owned=(seat:PlayerSeat)=>!online||seat.peerId===online.state.peerId||(host&&seat.kind==='bot');
 const localHumans=config.players.filter(player=>player.kind==='human'&&owned(player));
 const coordinator=useRef<string|null>(null);
 if(!localHumans.some(player=>player.id===coordinator.current)) coordinator.current=localHumans[0]?.id??null;
 const seatValue=(seat:PlayerSeat)=>({...seat,...drafts[seat.id]});
 const editor=(id:string)=>editors[id]??{open:false,tab:'fighter' as const};
 const edit=(id:string,patch:Partial<SeatEditor>)=>setEditors(previous=>({...previous,[id]:{...(previous[id]??{open:false,tab:'fighter'}),...patch}}));
 useEffect(()=>{
  for(const seat of localHumans) {
   const device=devices.find(device=>device.id===seat.device&&device.connected);
   if(device?.controllerId&&!fingerprints.current.has(seat.id)) fingerprints.current.set(seat.id,device.controllerId);
   if(seat.device.startsWith('gamepad:')&&(!device?.connected||device.controllerId!==fingerprints.current.get(seat.id))) setReclaims(previous=>previous[seat.id]?previous:{...previous,[seat.id]:true});
  }
 },[devices,config.players]);
 const acknowledgedReady=(seat:PlayerSeat)=>{
  if(seat.kind==='bot') return true;
  if(owned(seat)&&!ready[seat.id]) return false;
  const state=bridge?.state.seatReadiness?.[seat.id];
  return state!==undefined?typeof state==='boolean'?state:state.ready&&state.assetsReady:online&&!owned(seat)?!!online.state.members.find(member=>member.id===seat.peerId)?.ready:!!ready[seat.id];
 };
 const connected=(seat:PlayerSeat)=>!seat.device.startsWith('gamepad:')||!owned(seat)||!!devices.find(device=>device.id===seat.device&&device.connected)&&!reclaims[seat.id];
 const changeSeat=(id:string,updates:Partial<PlayerSeat>)=>{
  const current=config.players.find(player=>player.id===id);if(!current||!owned(current)||readOnly) return;
  invalidateReady?.();
  const next={...seatValue(current),...updates};
  if(updates.device) {const device=devices.find(device=>device.id===updates.device);if(device?.controllerId) fingerprints.current.set(id,device.controllerId);setReclaims(previous=>({...previous,[id]:false}));}
  if(online) {setDrafts(previous=>({...previous,[id]:{...previous[id],...updates}}));online.updateSeat(next);}
  else setConfig({...config,players:config.players.map(player=>player.id===id?next:player)});
 };
 // Keep optimistic fields until an acknowledgement contains their actual values.
 useEffect(()=>{
  if(!online) return;
  setDrafts(previous=>{
   let changed=false;const next={...previous};
   for(const [id,patch] of Object.entries(previous)) {const seat=config.players.find(player=>player.id===id);if(seat&&Object.entries(patch).every(([key,value])=>JSON.stringify(seat[key as keyof PlayerSeat])===JSON.stringify(value))) {delete next[id];changed=true;}}
   return changed?next:previous;
  });
 },[config.players,online]);
 useEffect(()=>{
  if(!bridge) return;
  if(bridge.setSeatReady) for(const seat of localHumans) {const value=!!ready[seat.id]&&connected(seat)&&!drafts[seat.id]&&!bridge.state.pendingEdits,key=`${value}:${!!manifest}`;if(sentReadiness.current.get(seat.id)!==key) {sentReadiness.current.set(seat.id,key);bridge.setSeatReady(seat.id,value,!!manifest);}}
  else {const value=localHumans.length>0&&localHumans.every(seat=>ready[seat.id]&&connected(seat))&&!bridge.state.pendingEdits&&Object.keys(drafts).length===0&&!!manifest;if(sentReadiness.current.get('peer')!==String(value)) {sentReadiness.current.set('peer',String(value));bridge.ready(value);}}
 },[ready,manifest,drafts,bridge?.state.pendingEdits,reclaims]);
 const update=(patch:Partial<MatchConfig>)=>{if(!host||readOnly) return;invalidateReady?.();if(online) {const {players:_players,...rules}=patch;setRuleDraft(previous=>({...previous,...rules}));online.updateConfig({...config,...patch});}else setConfig({...config,...patch});};
 const changeMode=(gameMode:NonNullable<MatchConfig['gameMode']>)=>{
  let players=config.players;
  if(gameMode==='survival') {
   const humans=players.filter(player=>player.kind==='human');
   if(humans.length<=2) {
    players=[...humans.map(player=>({...player,team:0 as const})),...players.filter(player=>player.kind==='bot').slice(0,4-humans.length).map(player=>({...player,team:1 as const}))];
    while(players.length<4) {const index=[0,1,2,3].find(i=>!players.some(player=>player.id===`p${i+1}`))??players.length;players.push({...defaultSeat(index,true,lang),team:1});}
   }
  }
  update({gameMode,players,timeLimit:gameMode==='survival'?0:gameMode==='stock'?300:gameMode==='royale'?240:180,lives:gameMode==='royale'?1:3,mode:gameMode==='royale'?'ffa':gameMode==='survival'?'teams':config.mode,...(gameMode==='royale'?{arena:'arcade' as const}:{} )});
 };
 const maxFighters=config.gameMode==='royale'?8:4;
 const teamValid=config.gameMode==='survival'?config.players.filter(player=>player.kind==='human').length>=1&&config.players.filter(player=>player.kind==='human').length<=2&&config.players.filter(player=>player.kind==='human').every(player=>player.team===0):config.mode!=='teams'||config.players.length===4&&config.players.filter(player=>player.team===0).length===2&&config.players.filter(player=>player.team===1).length===2;
 const humanDevices=localHumans.map(player=>player.device);
 const devicesValid=new Set(humanDevices).size===humanDevices.length&&localHumans.every(connected);
 const rosterValid=config.players.length>=2&&config.players.length<=maxFighters&&localHumans.length<=4;
 const allReady=practice||config.players.every(acknowledgedReady);
 const routePending=!!online&&online.state.members.length>1&&online.state.route==='connecting';
 const validation=routePending?t.connecting:bridge?.state.pendingEdits||Object.keys(drafts).length||Object.keys(ruleDraft).length?t.pendingEdits:!rosterValid?`${es?'Se necesitan de 2 a':'2 to'} ${maxFighters} ${es?'luchadores.':'fighters required.'}`:!teamValid?config.gameMode==='survival'?(es?'Supervivencia requiere uno o dos humanos en el equipo A.':'Survival needs one or two humans on team A.'):t.teamInvalid:!devicesValid?t.devicesInvalid:!allReady?t.readyInvalid:'';
 const addSeat=(device?:string)=>{
  if(lockRoster||readOnly||config.players.length>=maxFighters||device&&localHumans.length>=4) return;
  const index=Array.from({length:8},(_,i)=>i).find(index=>!config.players.some(player=>player.id===`p${index+1}`))??config.players.length;
  const seat={...defaultSeat(index,!device&&(localHumans.length>=4||!!online&&host),lang),...(device?{kind:'human' as const,device}:{}),...(online?{peerId:online.state.peerId}: {})};
  if(online) online.claimSeat({...seat,id:host?seat.id:crypto.randomUUID().replaceAll('-','')});else update({players:[...config.players,seat]});
 };
 const closeRules=()=>{setRulesOpen(false);window.dispatchEvent(new Event('menu-transition'));};
 const deviceLabel=(seat:PlayerSeat)=>seat.kind==='bot'?`${t.bot} · ${t[seat.difficulty??'normal']}`:seat.device.startsWith('keyboard:')?`${t.keyboard} ${Number(seat.device.split(':')[1])+1}`:!owned(seat)||seat.device==='remote'?t.seatRemote:devices.find(device=>device.id===seat.device)?.label??`${t.gamepad} ${Number(seat.device.split(':')[1])+1}`;
 const handlePad=(input:MenuInput)=>{
  if(scope.current?.closest('[hidden]')) return false;
  const {command,identity}=input;
  if(command==='pause') return true;
  if(rulesOpen) return identity.device!==localHumans.find(player=>player.id===coordinator.current)?.device;
  let seat=localHumans.find(player=>seatValue(player).device===identity.device);
  if(!seat) {
   const disconnected=localHumans.find(player=>reclaims[player.id]&&fingerprints.current.get(player.id)===identity.controllerId);
   if(command==='confirm'&&disconnected) {changeSeat(disconnected.id,{device:identity.device});feedback?.('confirm');return true;}
   if(command==='confirm') {
    const free=localHumans.find(player=>player.device.startsWith('keyboard:'));
    if(free) changeSeat(free.id,{device:identity.device});else addSeat(identity.device);
    window.dispatchEvent(new Event('menu-transition'));feedback?.('confirm');
   }
   return true;
  }
  if(reclaims[seat.id]) {if(command==='confirm'&&identity.controllerId===fingerprints.current.get(seat.id)) {setReclaims(previous=>({...previous,[seat!.id]:false}));feedback?.('confirm');}return true;}
  // Only the coordinator may leave their seat cursor to reach shared controls.
  if(sharedDevice===identity.device) {if(command==='back') {setSharedDevice(null);feedback?.('back');return true;}return false;}
  const article=scope.current?.querySelector<HTMLElement>(`[data-seat-id="${seat.id}"]`);if(!article) return true;
  if(command==='back'&&document.activeElement?.matches('input,textarea')&&article.contains(document.activeElement)) {article.querySelector<HTMLButtonElement>('.fighter-edit')?.focus();return true;}
  if(command==='back') {if(editor(seat.id).open) {edit(seat.id,{open:false});cursors.current.set(identity.device,0);window.dispatchEvent(new CustomEvent('menu-transition',{detail:identity.device}));feedback?.('back');}else if(seat.id===coordinator.current) return false;return true;}
  article.setAttribute('data-controller-command','true');
  const targets=menuTargets(article);if(!targets.length) return true;
  let cursor=Math.min(cursors.current.get(identity.device)??0,targets.length-1);
  const target=targets[cursor];
  if((command==='left'||command==='right')&&!target.dispatchEvent(new CustomEvent('menu-command',{detail:command,bubbles:true,cancelable:true}))) {article.removeAttribute('data-controller-command');feedback?.('change');return true;}
  if(command==='confirm') {
   if(target.matches('input')) {target.focus();feedback?.('confirm');return true;}
   target.setAttribute('data-virtual-activate','true');target.click();target.removeAttribute('data-virtual-activate');if(target.classList.contains('fighter-edit')&&!editor(seat.id).open) {cursor=1;window.dispatchEvent(new CustomEvent('menu-transition',{detail:identity.device}));}
  } else if(['up','down','left','right'].includes(command)) {cursor=Math.max(0,Math.min(targets.length-1,cursor+(['up','left'].includes(command)?-1:1)));feedback?.('navigate');}
  article.removeAttribute('data-controller-command');
  cursors.current.set(identity.device,cursor);
  article.querySelectorAll('[data-controller-focus]').forEach(element=>element.removeAttribute('data-controller-focus'));
  const current=menuTargets(article)[cursor];current?.setAttribute('data-controller-focus','true');current?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  return true;
 };
 useEffect(()=>{
  const element=scope.current;const handle=(event:Event)=>{if(handlePad((event as CustomEvent<MenuInput>).detail)) event.preventDefault();};
  const keyboardBack=(event:Event)=>{if((event as CustomEvent<string>).detail!=='back'||event.defaultPrevented) return;const article=(event.target as HTMLElement)?.closest<HTMLElement>('[data-seat-id]');const id=article?.dataset.seatId;if(id&&editor(id).open) {edit(id,{open:false});article?.querySelector<HTMLButtonElement>('.fighter-edit')?.focus();event.preventDefault();event.stopPropagation();window.dispatchEvent(new CustomEvent('menu-transition',{detail:'keyboard'}));}};
  element?.addEventListener('seat-menu-input',handle);element?.addEventListener('menu-command',keyboardBack);return()=>{element?.removeEventListener('seat-menu-input',handle);element?.removeEventListener('menu-command',keyboardBack);};
 });
 const openRules=(device?:string)=>{setSharedDevice(device??sharedDevice);setRulesOpen(true);};
 const arena=ARENAS[config.arena];
 return <div className="setup-layout setup-overview" ref={scope} data-seat-navigation>
  <section className="roster-section">
   <div className="section-heading"><h2>{t.roster}</h2><span className="count-label">{config.players.length} / {maxFighters}</span></div>
   <p className="seat-join-help">{t.joinController} · {es?'Cada mando edita su luchador. El teclado comparte un cursor.':'Each controller edits its fighter. Keyboard shares one cursor.'}</p>
   <div className="fighter-grid">
    {config.players.map((original,index)=>{const seat=seatValue(original),panel=editor(seat.id),isCoordinator=coordinator.current===seat.id;return <article key={seat.id} className={`fighter-card fighter-summary ${acknowledgedReady(seat)?'is-ready':''} ${panel.open?'is-editing':''} ${!connected(seat)?'is-disconnected':''}`} data-seat-id={seat.id} data-owner={seat.device} style={{'--fighter-color':disciplineInfo[seat.discipline].color} as CSSProperties}>
     <button className="fighter-edit" disabled={!owned(seat)} data-autofocus={index===0||undefined} aria-label={`${t.editFighter}: ${seat.name}`} onClick={()=>{edit(seat.id,{open:!panel.open});}}>
      <span className="fighter-card-top"><span className="seat-number">P{index+1}</span><span className={`ready-light ${acknowledgedReady(seat)?'on':''}`}>{acknowledgedReady(seat)?`✓ ${t.ready}`:t.notReady}</span></span>
      <span className="fighter-preview" data-number={String(index+1).padStart(2,'0')}><Avatar appearance={seat.appearance} discipline={seat.discipline} manifest={manifest} animated={!settings.reducedMotion}/><span className="fighter-stage-line"/></span>
      <strong className="fighter-identity">{seat.name}</strong><span className="fighter-discipline">{names[seat.discipline][lang]}{config.mode==='teams'&&` · ${seat.team===0?'◆ A':'● B'}`}</span>
      <span className="fighter-device">{deviceLabel(seat)}</span><span className="fighter-ownership">{isCoordinator?`★ ${t.coordinator}`:owned(seat)?t.ownFighter:t.seatRemote}</span>
      <span className="fighter-edit-label">{panel.open?t.done:t.change}<span aria-hidden="true">{panel.open?'⌃':'⌄'}</span></span>
     </button>
     {!connected(seat)&&<p className="seat-reclaim" role="status">{t.disconnected}<br/>{t.reclaimSeat}</p>}
     {panel.open&&<div className="inline-fighter-editor" data-menu-linear>
      <MenuTabs label={`${t.editFighter} P${index+1}`} value={panel.tab} options={[{value:'fighter',label:t.appearance},{value:'player',label:`${t.player} / ${t.device}`}]} change={tab=>edit(seat.id,{tab})}/>
      <div role="tabpanel" aria-label={panel.tab==='fighter'?t.appearance:`${t.player} / ${t.device}`}>
       {panel.tab==='fighter'?<>
        <Choice disabled={readOnly||lockDiscipline} label={t.discipline} value={seat.discipline} options={(config.ruleset==='classic'?disciplines.slice(0,4):disciplines).map(value=>({value,label:names[value][lang]}))} change={discipline=>changeSeat(seat.id,{discipline})}/>
        {(['hair','shirt','pants'] as const).map(part=><Choice key={part} disabled={readOnly} label={t[part]} value={seat.appearance[part]} options={palettes[part].map((_,value)=>({value,label:`${value+1} / 4`}))} swatches={palettes[part]} change={value=>changeSeat(seat.id,{appearance:{...seat.appearance,[part]:value}})}/>)}
       </>:<>
        <label className="config-row name-row"><span>{t.name}</span><input aria-label={`${t.name} P${index+1}`} value={seat.name} maxLength={18} disabled={readOnly} onChange={event=>changeSeat(seat.id,{name:event.target.value})}/></label><p className="text-input-help">{t.keyboardText}</p>
        <Choice label={t.player} value={seat.kind} disabled={readOnly||lockRoster||!!online&&!host||practice} options={[{value:'human',label:t.human},{value:'bot',label:t.bot}]} change={kind=>changeSeat(seat.id,{kind,device:kind==='bot'?'bot':`keyboard:${index%4}`,difficulty:'normal'})}/>
        {seat.kind==='bot'?<Choice disabled={readOnly||lockRoster&&!practice} label={t.difficulty} value={seat.difficulty??'normal'} options={[{value:'easy',label:t.easy},{value:'normal',label:t.normal},{value:'hard',label:t.hard},...(practice?[{value:'dummy' as const,label:t.dummy}]:[])]} change={difficulty=>changeSeat(seat.id,{difficulty})}/>:<Choice disabled={readOnly} label={t.device} value={seat.device} options={[
         ...[0,1,2,3].map(value=>({value:`keyboard:${value}`,label:`${t.keyboard} ${value+1}`,disabled:localHumans.some(player=>player.id!==seat.id&&seatValue(player).device===`keyboard:${value}`)})),
         ...devices.filter(device=>device.id.startsWith('gamepad:')&&device.connected).map(device=>({value:device.id,label:device.label,disabled:localHumans.some(player=>player.id!==seat.id&&seatValue(player).device===device.id)})),
         ...(seat.device==='remote'?[{value:'remote',label:t.seatRemote}]:[]),
         ...(seat.device.startsWith('gamepad:')&&!devices.some(device=>device.id===seat.device&&device.connected)?[{value:seat.device,label:t.disconnected}]:[]),
        ]} change={device=>changeSeat(seat.id,{device})}/>}
        {config.mode==='teams'&&<Choice disabled={readOnly||lockRoster} label={t.team} value={seat.team} options={[{value:0,label:'◆ A'},{value:1,label:'● B'}]} change={team=>changeSeat(seat.id,{team})}/>}
        {seat.kind==='human'&&seat.device.startsWith('keyboard:')&&<div className="seat-keys">{['left','down','right','jump','punch','special','guard','combo','dodge'].map(action=><kbd key={action} title={t[action as keyof typeof t]}>{keyName(settings.keyboardBindings[Number(seat.device.split(':')[1])]?.[action]??'')}</kbd>)}</div>}
        {!practice&&!lockRoster&&!readOnly&&config.players.length>2&&host&&<button className="text-button remove-fighter" onClick={()=>update({players:config.players.filter(player=>player.id!==seat.id)})}>{t.remove} {seat.name}</button>}
       </>}
      </div>
     </div>}
     {!practice&&!editorOnly&&<button disabled={!owned(seat)||seat.kind==='bot'||!connected(seat)||!!drafts[seat.id]} className={`ready-button ${acknowledgedReady(seat)?'confirmed':''}`} onClick={()=>toggleReady(seat.id)}>{acknowledgedReady(seat)?`✓ ${t.ready}`:t.readyButton}</button>}
     {isCoordinator&&<button className="seat-shared-button" onClick={()=>{setSharedDevice(seat.device);scope.current?.querySelector<HTMLButtonElement>('.match-summary')?.focus();}}>{t.sharedControls} ↗</button>}
    </article>;})}
    {!practice&&!lockRoster&&!readOnly&&config.players.length<maxFighters&&(host||!!online)&&<button className="add-fighter" onClick={()=>addSeat()}><span aria-hidden="true">+</span>{t.add}</button>}
   </div>
  </section>
  <button className="match-summary" onClick={()=>openRules()} aria-label={`${t.rules} · ${t.arena}`}><span className="arena-thumbnail" style={{backgroundImage:manifest?`url("${manifest.backgrounds[arena.id]??manifest.backgrounds.classic}")`:undefined}}><svg viewBox="0 0 1366 768" aria-hidden="true">{arena.platforms.map((platform,i)=><rect key={i} {...platform}/>)}</svg></span><span><small>{t.arena} / {t.rules}</small><strong>{arena.name[lang]}</strong><span>{t[config.ruleset??'classic']} · {t[config.gameMode??'stock']} · {config.mode==='teams'?t.teams:t.ffa}</span></span><span className="summary-change">{readOnly?(es?'El servidor fija las reglas y el comienzo':'Server controls rules and start'):host?t.change:t.waitHost} <b aria-hidden="true">›</b></span></button>
  {!editorOnly&&<div className="start-panel"><p className={validation?'validation-hint':'help-text'} role="status">{validation||(practice?t.practiceTip:t.readyHelp)}</p><button className="primary-button fight-button" data-ui-sound="silent" disabled={!!validation||!manifest||!host} onClick={start}>{readOnly?(es?'El servidor inicia cuando todos están listos':'Server starts when everyone is ready'):t.start}<span>↗</span></button></div>}
  {rulesOpen&&<MenuDialog mark={<Icon name="arena"/>} language={lang} title={`${t.arena} / ${t.rules}`} subtitle={readOnly?(es?'El servidor fija estas reglas.':'The server sets these rules.'):lockRules?(es?'Este modo fija sus reglas.':'This mode sets its rules.'):!host?t.waitHost:undefined} done={t.done} close={closeRules}>
   <div className="rules-editor"><div className="arena-preview" style={{backgroundImage:manifest?`url("${manifest.backgrounds[arena.id]??manifest.backgrounds.classic}")`:undefined}}><svg viewBox="0 0 1366 768" aria-hidden="true">{arena.platforms.map((platform,i)=><rect key={i} {...platform}/>)}</svg><span>{arena.subtitle[lang]}</span></div><div className="editor-fields">
    <Choice label={t.ruleset} value={config.ruleset??'classic'} disabled={!host||lockRules} options={[{value:'classic',label:t.classic},{value:'expanded',label:t.expanded}]} change={ruleset=>update({ruleset,...(ruleset==='classic'?{arena:'classic',items:false,hazards:false,players:config.players.map(player=>({...player,discipline:disciplines.slice(0,4).includes(player.discipline)?player.discipline:'networks'}))}:{})})}/>
    <Choice label={t.arena} value={config.arena} disabled={!host||lockRules} options={Object.values(ARENAS).filter(value=>config.ruleset!=='classic'||['classic','lab','pc'].includes(value.id)).map(value=>({value:value.id,label:value.name[lang]}))} change={arena=>update({arena})}/>
    {!practice&&<>
     <Choice label={t.gameMode} value={config.gameMode??'stock'} disabled={!host||lockRules} options={(['stock','timed','hill','survival','royale'] as const).map(value=>({value,label:t[value]}))} change={changeMode}/>
     <Choice label={es?'Modo':'Mode'} value={config.mode} disabled={!host||lockRules||config.gameMode==='royale'} options={[{value:'ffa',label:t.ffa},{value:'teams',label:t.teams}]} change={mode=>update({mode})}/>
     <Choice label={t.bestOf} value={config.bestOf??3} disabled={!host||lockRules} options={([1,3,5] as const).map(value=>({value,label:String(value)}))} change={bestOf=>update({bestOf})}/>
     <Choice label={t.lives} value={config.lives} disabled={!host||lockRules||config.gameMode==='royale'} options={[1,2,3,4,5,6,7,8,9].map(value=>({value,label:String(value)}))} change={lives=>update({lives})}/>
     <Choice label={t.time} value={config.timeLimit} disabled={!host||lockRules} options={[60,120,180,240,300,600,900,0].map(value=>({value,label:value?`${value/60} min`:t.unlimited}))} change={timeLimit=>update({timeLimit})}/>
     {config.mode==='teams'&&<Choice label={t.friendly} value={Number(config.friendlyFire)} disabled={!host||lockRules} options={[{value:0,label:t.off},{value:1,label:t.on}]} change={value=>update({friendlyFire:!!value})}/>}
    </>}
    {(['items','hazards'] as const).map(option=><Choice key={option} label={t[option]} value={Number(config[option]??false)} disabled={!host||lockRules||config.ruleset==='classic'} options={[{value:0,label:t.off},{value:1,label:t.on}]} change={value=>update({[option]:!!value})}/>)}
   </div></div>
  </MenuDialog>}
 </div>;
}
