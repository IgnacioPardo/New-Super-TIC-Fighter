import { useState } from 'react';
import type { AppSettings, AssetsManifest, MatchConfig, PlayerSeat } from '../shared/types';
import type { OnlineBridge } from './contracts';
import { Avatar } from './Avatar';
import { disciplineInfo, disciplines, names, ui } from './i18n';
import { ARENAS } from '../shared/content';
import { defaultSeat, keyName } from './preferences';

const palettes = {
 hair: ['#164d43', '#657822', '#5c2f82', '#53351f'],
 shirt: ['#24b26d', '#75c321', '#5734c7', '#a72547'],
 pants: ['#7de4dc', '#65c052', '#b574d4', '#d3a479'],
};
export function Setup({ config, setConfig, settings, manifest, devices, ready, toggleReady, start, online, practice }: {
 config: MatchConfig; setConfig: (config: MatchConfig) => void; settings: AppSettings; manifest: AssetsManifest | null;
 devices: { id: string; label: string; connected: boolean }[]; ready: Record<string, boolean>; toggleReady: (id: string) => void; start: () => void;
 online?: OnlineBridge; practice: boolean;
}) {
 const t = ui[settings.language], lang = settings.language;
 const [appearancePart, setAppearancePart] = useState<Record<string, 'hair' | 'shirt' | 'pants'>>({});
 const host = !online || online.state.isHost;
 const changeSeat = (id: string, updates: Partial<PlayerSeat>) => {
   const players = config.players.map(p => p.id === id ? { ...p, ...updates } : p);
   if (online) online.updateSeat(players.find(p => p.id === id)!); else setConfig({ ...config, players });
 };
 const humanDevices = config.players.filter(p => p.kind === 'human' && (!online || p.peerId === online.state.peerId)).map(p => p.device);
 const teamValid = config.mode !== 'teams' || (config.players.filter(p => p.team === 0).length === 2 && config.players.filter(p => p.team === 1).length === 2);
 const devicesValid = new Set(humanDevices).size === humanDevices.length;
 const rosterValid = config.players.length >= 2 && config.players.length <= 4;
 const allReady = practice || config.players.every(p => p.kind === 'bot' || (online ? online.state.members.find(m => m.id === p.peerId)?.ready : ready[p.id]));
 const routePending = !!online && online.state.members.length > 1 && online.state.route === 'connecting';
 const validation = routePending ? t.connecting : !rosterValid ? t.seatsInvalid : !teamValid ? t.teamInvalid : !devicesValid ? t.devicesInvalid : !allReady ? t.readyInvalid : '';
 const update = (patch: Partial<MatchConfig>) => host && (online ? online.updateConfig({ ...config, ...patch }) : setConfig({ ...config, ...patch }));
 const addSeat = () => {
   const available = [0,1,2,3].find(i => !config.players.some(p => p.id === `p${i + 1}`)) ?? config.players.length;
   const seat = defaultSeat(available, online ? true : false, lang);
   if (online) online.claimSeat({ ...seat, peerId: online.state.peerId }); else update({ players: [...config.players, seat] });
 };
 return <div className="setup-layout">
   <section className="roster-section">
     <div className="section-heading"><h2>{t.roster}</h2><span className="count-label">{config.players.length} / 4</span></div>
     <div className="fighter-grid">
       {config.players.map((seat, index) => {
         const owned = !online || seat.peerId === online.state.peerId || (host && seat.kind === 'bot');
         const color = disciplineInfo[seat.discipline].color;
         const part = appearancePart[seat.id] ?? 'hair';
         const confirmed = seat.kind === 'bot' || (online ? online.state.members.find(m => m.id === seat.peerId)?.ready : ready[seat.id]);
         return <article className={`fighter-card ${confirmed ? 'is-ready' : ''}`} key={seat.id} style={{ '--fighter-color': color } as React.CSSProperties}>
           <div className="fighter-card-top"><span className="seat-number">P{index + 1}</span><span className="fighter-class-name">{names[seat.discipline][lang]}</span><span className={`ready-light ${confirmed ? 'on' : ''}`}>{confirmed ? t.ready : t.notReady}</span></div>
           <h3 className="fighter-identity">{seat.name}</h3><div className="fighter-preview"><Avatar appearance={seat.appearance} discipline={seat.discipline} manifest={manifest} animated={!settings.reducedMotion} /><span className="fighter-stage-line" /></div>
           <label className="field-label"><span>{t.discipline}</span><select disabled={!owned} value={seat.discipline} onChange={e => changeSeat(seat.id, { discipline: e.target.value as PlayerSeat['discipline'] })}>{disciplines.map(d => <option value={d} key={d}>{names[d][lang]}</option>)}</select></label>
           <div className="appearance-controls" aria-label={t.appearance}>
             <select aria-label={`${t.appearance} P${index + 1}`} value={part} onChange={e => setAppearancePart(previous => ({ ...previous, [seat.id]: e.target.value as 'hair' | 'shirt' | 'pants' }))}>{(['hair','shirt','pants'] as const).map(option => <option value={option} key={option}>{t[option]}</option>)}</select>
             <div className="appearance-swatches">{palettes[part].map((swatch, i) => <button disabled={!owned} className={`swatch ${seat.appearance[part] === i ? 'selected' : ''}`} key={i} style={{ backgroundColor: swatch }} aria-label={`${t[part]} ${i + 1} P${index + 1}`} aria-pressed={seat.appearance[part] === i} onClick={() => changeSeat(seat.id, { appearance: { ...seat.appearance, [part]: i } })}>{seat.appearance[part] === i ? '✓' : ''}</button>)}</div>
           </div>
           <details className="fighter-options"><summary>{t.player} / {t.device}</summary><div>           <label className="field-label"><span>{t.name}</span><input disabled={!owned} value={seat.name} maxLength={18} aria-label={`${t.name} P${index + 1}`} onChange={e => changeSeat(seat.id, { name: e.target.value })} /></label>
           <div className="seat-kind-row">
             <select aria-label={`${t.player} P${index + 1}`} disabled={!owned || !!online && !host || practice} value={seat.kind} onChange={e => changeSeat(seat.id, { kind: e.target.value as 'human' | 'bot', device: e.target.value === 'bot' ? 'bot' : `keyboard:${index}`, difficulty: 'normal' })}>
               <option value="human">{t.human}</option><option value="bot">{t.bot}</option>
             </select>
             {config.mode === 'teams' && <select aria-label={`${t.team} P${index + 1}`} disabled={!owned} value={seat.team} onChange={e => changeSeat(seat.id, { team: Number(e.target.value) as 0 | 1 })}><option value={0}>◆ A</option><option value={1}>● B</option></select>}
           </div>
           {seat.kind === 'bot' ? <label className="field-label"><span>{t.difficulty}</span><select value={seat.difficulty ?? 'normal'} disabled={!owned} onChange={e => changeSeat(seat.id, { difficulty: e.target.value as PlayerSeat['difficulty'] })}><option value="easy">{t.easy}</option><option value="normal">{t.normal}</option>{practice && <option value="dummy">{t.dummy}</option>}</select></label> : <label className="field-label"><span>{t.device}</span><select disabled={!owned} value={seat.device} onChange={e => changeSeat(seat.id, { device: e.target.value })}>
             {[0,1,2,3].map(i => <option key={i} value={`keyboard:${i}`}>{t.keyboard} {i + 1}</option>)}
             {devices.filter(d => d.id.startsWith('gamepad:') && d.connected).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
             {seat.device === 'remote' && <option value="remote">{t.seatRemote}</option>}
             {seat.device.startsWith('gamepad:') && !devices.some(d => d.id === seat.device && d.connected) && <option value={seat.device}>{t.disconnected}</option>}
           </select></label>}
           {seat.kind === 'human' && seat.device.startsWith('keyboard:') && <div className="seat-keys">{['left','down','right','jump','punch','special','guard','combo'].map(action => <kbd key={action} title={t[action as keyof typeof t]}>{keyName(settings.keyboardBindings[Number(seat.device.split(':')[1])]?.[action] ?? '')}</kbd>)}</div>}
</div></details>
           <div className="seat-bottom">
             {!practice && <button disabled={!owned || seat.kind === 'bot'} className={`ready-button ${confirmed ? 'confirmed' : ''}`} onClick={() => toggleReady(seat.id)}>{confirmed ? `✓ ${t.ready}` : t.readyButton}</button>}
             {!practice && owned && config.players.length > 2 && <button className="icon-button remove-seat" aria-label={`${t.remove} ${seat.name}`} onClick={() => online ? online.updateConfig({ ...config, players: config.players.filter(p => p.id !== seat.id) }) : update({ players: config.players.filter(p => p.id !== seat.id) })}>×</button>}
           </div>
         </article>;
       })}
       {!practice && host && config.players.length < 4 && <button className="add-fighter" onClick={addSeat}><span>+</span>{t.add}</button>}
       {online && !host && config.players.length < 4 && <button className="add-fighter" onClick={() => online.claimSeat({ ...defaultSeat(config.players.length, false, lang), id: crypto.randomUUID().replaceAll('-', ''), peerId: online.state.peerId })}><span>+</span>{t.add}</button>}
     </div>
     {practice && <p className="practice-note"><span>↻</span>{t.practiceTip}</p>}
   </section>
   <section className="rules-section">
     <div className="section-heading"><h2>{t.rules}</h2></div>
     {!host && <p className="help-text">{t.waitHost}</p>}
     <div className="rules-controls">
       {!practice && <label className="field-label"><span>{lang === 'es' ? 'Modo' : 'Mode'}</span><select disabled={!host} value={config.mode} onChange={e => update({ mode: e.target.value as MatchConfig['mode'] })}><option value="ffa">{t.ffa}</option><option value="teams">{t.teams}</option></select></label>}
       {!practice && <div className="rule-pair"><label className="field-label"><span>{t.lives}</span><select disabled={!host} value={config.lives} onChange={e => update({ lives: Number(e.target.value) })}>{[1,2,3,4,5,6,7,8,9].map(v => <option value={v} key={v}>{v}</option>)}</select></label><label className="field-label"><span>{t.time}</span><select disabled={!host} value={config.timeLimit} onChange={e => update({ timeLimit: Number(e.target.value) })}>{[60,120,180,300,600,900,0].map(v => <option value={v} key={v}>{v ? `${v / 60} min` : t.unlimited}</option>)}</select></label></div>}
       {!practice && config.mode === 'teams' && <label className="toggle-field"><span>{t.friendly}</span><input disabled={!host} type="checkbox" checked={config.friendlyFire} onChange={e => update({ friendlyFire: e.target.checked })} /><span className="toggle-track" /></label>}
     </div>
     <div className="section-heading arena-heading"><h2>{t.arena}</h2></div>
     <div className="arena-options">{Object.values(ARENAS).map(arena => <button disabled={!host} aria-pressed={config.arena === arena.id} className={`arena-card ${config.arena === arena.id ? 'selected' : ''}`} key={arena.id} onClick={() => update({ arena: arena.id })} style={{ '--arena-color': arena.color } as React.CSSProperties}>
       <div className="arena-thumbnail" style={{ backgroundImage: manifest ? `url("${manifest.backgrounds[arena.id]}")` : undefined }}><svg viewBox="0 0 1366 768" aria-hidden="true">{arena.platforms.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.width} height={p.height} />)}</svg></div>
       <div><strong>{arena.name[lang]}</strong><span>{arena.subtitle[lang]}</span></div><span className="arena-check">{config.arena === arena.id ? '✓' : ''}</span>
     </button>)}</div>

   </section>
     <div className="start-panel"><p className={validation ? 'validation-hint' : 'help-text'}>{validation || (practice ? t.practiceTip : t.readyHelp)}</p><button className="primary-button fight-button" disabled={!!validation || !manifest || !host} onClick={start}>{t.start}<span>↗</span></button></div>
 </div>;
}
