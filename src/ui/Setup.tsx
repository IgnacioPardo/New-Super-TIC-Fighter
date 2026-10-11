import { useState } from 'react';
import type { AppSettings, AssetsManifest, MatchConfig, PlayerSeat } from '../shared/types';
import type { OnlineBridge } from './contracts';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { disciplineInfo, disciplines, names, ui } from './i18n';
import { ARENAS } from '../shared/content';
import { defaultSeat, keyName } from './preferences';
import { Choice, MenuDialog, MenuTabs } from './MenuControls';

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
 const [editing, setEditing] = useState<string | null>(null);
 const [editorTab, setEditorTab] = useState<'fighter' | 'player'>('fighter');
 const [rulesOpen, setRulesOpen] = useState(false);
 const host = !online || online.state.isHost;
 const owned = (seat: PlayerSeat) => !online || seat.peerId === online.state.peerId || (host && seat.kind === 'bot');
 const confirmed = (seat: PlayerSeat) => seat.kind === 'bot' || (online ? online.state.members.find(member => member.id === seat.peerId)?.ready : ready[seat.id]);
 const changeSeat = (id: string, updates: Partial<PlayerSeat>) => {
  const players = config.players.map(player => player.id === id ? { ...player, ...updates } : player);
  if (online) online.updateSeat(players.find(player => player.id === id)!); else setConfig({ ...config, players });
 };
 const humanDevices = config.players.filter(player => player.kind === 'human' && (!online || player.peerId === online.state.peerId)).map(player => player.device);
 const teamValid = config.mode !== 'teams' || (config.players.filter(player => player.team === 0).length === 2 && config.players.filter(player => player.team === 1).length === 2);
 const devicesValid = new Set(humanDevices).size === humanDevices.length;
 const rosterValid = config.players.length >= 2 && config.players.length <= 4;
 const allReady = practice || config.players.every(confirmed);
 const routePending = !!online && online.state.members.length > 1 && online.state.route === 'connecting';
 const validation = routePending ? t.connecting : !rosterValid ? t.seatsInvalid : !teamValid ? t.teamInvalid : !devicesValid ? t.devicesInvalid : !allReady ? t.readyInvalid : '';
 const update = (patch: Partial<MatchConfig>) => host && (online ? online.updateConfig({ ...config, ...patch }) : setConfig({ ...config, ...patch }));
 const addSeat = () => {
  const available = [0,1,2,3].find(index => !config.players.some(player => player.id === `p${index + 1}`)) ?? config.players.length;
  const seat = defaultSeat(available, !!online && host, lang);
  if (online) online.claimSeat({ ...seat, id: host ? seat.id : crypto.randomUUID().replaceAll('-', ''), peerId: online.state.peerId });
  else update({ players: [...config.players, seat] });
 };
 const deviceLabel = (seat: PlayerSeat) => seat.kind === 'bot' ? `${t.bot} · ${t[seat.difficulty ?? 'normal']}` : seat.device.startsWith('keyboard:') ? `${t.keyboard} ${Number(seat.device.split(':')[1]) + 1}` : seat.device === 'remote' || !owned(seat) ? t.seatRemote : `${t.gamepad} ${Number(seat.device.split(':')[1]) + 1}`;
 const seat = config.players.find(player => player.id === editing);
 const index = seat ? config.players.indexOf(seat) : -1;
 const arena = ARENAS[config.arena];
 return <div className="setup-layout setup-overview">
  <section className="roster-section">
   <div className="section-heading"><h2>{t.roster}</h2><span className="count-label">{config.players.length} / 4</span></div>
   <div className="fighter-grid">
    {config.players.map((player, playerIndex) => <article className={`fighter-card fighter-summary ${confirmed(player) ? 'is-ready' : ''}`} key={player.id} data-seat-id={player.id} style={{ '--fighter-color': disciplineInfo[player.discipline].color } as React.CSSProperties}>
     <button className="fighter-edit" data-autofocus={playerIndex === 0 || undefined} aria-label={`${t.editFighter}: ${player.name}`} onClick={() => { setEditing(player.id); setEditorTab('fighter'); }}>
      <span className="fighter-card-top"><span className="seat-number">P{playerIndex + 1}</span><span className={`ready-light ${confirmed(player) ? 'on' : ''}`}>{confirmed(player) ? `✓ ${t.ready}` : t.notReady}</span></span>
      <span className="fighter-preview" data-number={String(playerIndex + 1).padStart(2, '0')}><Avatar appearance={player.appearance} discipline={player.discipline} manifest={manifest} animated={!settings.reducedMotion} /><span className="fighter-stage-line" /></span>
      <strong className="fighter-identity">{player.name}</strong><span className="fighter-discipline">{names[player.discipline][lang]}{config.mode === 'teams' && ` · ${player.team === 0 ? '◆ A' : '● B'}`}</span>
      <span className="fighter-device">{deviceLabel(player)}</span><span className="fighter-edit-label">{owned(player) ? t.change : t.seatRemote} <span aria-hidden="true">›</span></span>
     </button>
     {!practice && <button disabled={!owned(player) || player.kind === 'bot'} className={`ready-button ${confirmed(player) ? 'confirmed' : ''}`} onClick={() => toggleReady(player.id)}>{confirmed(player) ? `✓ ${t.ready}` : t.readyButton}</button>}
    </article>)}
    {!practice && config.players.length < 4 && <button className="add-fighter" onClick={addSeat}><span aria-hidden="true">+</span>{t.add}</button>}
   </div>
  </section>
  <button className="match-summary" onClick={() => setRulesOpen(true)} aria-label={`${t.rules} · ${t.arena}`}>
   <span className="arena-thumbnail" style={{ backgroundImage: manifest ? `url("${manifest.backgrounds[arena.id]}")` : undefined }}><svg viewBox="0 0 1366 768" aria-hidden="true">{arena.platforms.map((platform, i) => <rect key={i} {...platform} />)}</svg></span>
   <span><small>{t.arena} / {t.rules}</small><strong>{arena.name[lang]}</strong><span>{practice ? t.practice : `${config.mode === 'teams' ? t.teams : t.ffa} · ${config.lives} ${t.lives.toLowerCase()} · ${config.timeLimit ? `${config.timeLimit / 60} min` : t.unlimited}`}</span></span><span className="summary-change">{host ? t.change : t.waitHost} <b aria-hidden="true">›</b></span>
  </button>
  <div className="start-panel"><p className={validation ? 'validation-hint' : 'help-text'} role="status">{validation || (practice ? t.practiceTip : t.readyHelp)}</p><button className="primary-button fight-button" disabled={!!validation || !manifest || !host} onClick={start}>{t.start}<span>↗</span></button></div>
  {seat && <MenuDialog accent={disciplineInfo[seat.discipline].color} mark={`P${index + 1}`} language={settings.language} title={seat.name} subtitle={owned(seat) ? t.editFighter : t.seatRemote} done={t.done} close={() => setEditing(null)}>
   <div className="fighter-editor" style={{ '--fighter-color': disciplineInfo[seat.discipline].color } as React.CSSProperties}>
    <div className="editor-preview" data-number={String(index + 1).padStart(2, '0')}><Avatar appearance={seat.appearance} discipline={seat.discipline} manifest={manifest} animated={!settings.reducedMotion} /><strong>{names[seat.discipline][lang]}</strong><p>{disciplineInfo[seat.discipline].flavor[lang]}</p></div>
    <div className="editor-fields">
     <MenuTabs label={t.editFighter} value={editorTab} options={[{ value: 'fighter', label: t.appearance }, { value: 'player', label: `${t.player} / ${t.device}` }]} change={setEditorTab} />
     <div role="tabpanel" aria-label={editorTab === 'fighter' ? t.appearance : `${t.player} / ${t.device}`}>
      {editorTab === 'fighter' ? <>
       <Choice label={t.discipline} value={seat.discipline} disabled={!owned(seat)} options={disciplines.map(value => ({ value, label: names[value][lang] }))} change={discipline => changeSeat(seat.id, { discipline })} />
       {(['hair','shirt','pants'] as const).map(part => <Choice key={part} label={t[part]} value={seat.appearance[part]} disabled={!owned(seat)} swatches={palettes[part]} options={palettes[part].map((_, value) => ({ value, label: `${value + 1} / 4` }))} change={value => changeSeat(seat.id, { appearance: { ...seat.appearance, [part]: value } })} />)}
      </> : <>
       <label className="config-row name-row"><span>{t.name}</span><input disabled={!owned(seat)} value={seat.name} maxLength={18} aria-label={`${t.name} P${index + 1}`} onChange={event => changeSeat(seat.id, { name: event.target.value })} /></label>
       <Choice label={t.player} value={seat.kind} disabled={!owned(seat) || !!online && !host || practice} options={[{ value: 'human', label: t.human }, { value: 'bot', label: t.bot }]} change={kind => changeSeat(seat.id, { kind, device: kind === 'bot' ? 'bot' : `keyboard:${index}`, difficulty: 'normal' })} />
       {seat.kind === 'bot' ? <Choice label={t.difficulty} value={seat.difficulty ?? 'normal'} disabled={!owned(seat)} options={[{ value: 'easy' as const, label: t.easy }, { value: 'normal' as const, label: t.normal }, ...(practice ? [{ value: 'dummy' as const, label: t.dummy }] : [])]} change={difficulty => changeSeat(seat.id, { difficulty })} /> : <Choice label={t.device} value={seat.device} disabled={!owned(seat)} options={[
        ...[0,1,2,3].map(value => ({ value: `keyboard:${value}`, label: `${t.keyboard} ${value + 1}` })),
        ...devices.filter(device => device.id.startsWith('gamepad:') && device.connected).map(device => ({ value: device.id, label: `${t.gamepad} ${Number(device.id.split(':')[1]) + 1}` })),
        ...(seat.device === 'remote' ? [{ value: 'remote', label: t.seatRemote }] : []),
        ...(seat.device.startsWith('gamepad:') && !devices.some(device => device.id === seat.device && device.connected) ? [{ value: seat.device, label: t.disconnected }] : []),
       ]} change={device => changeSeat(seat.id, { device })} />}
       {config.mode === 'teams' && <Choice label={t.team} value={seat.team} disabled={!owned(seat)} options={[{ value: 0, label: '◆ A' }, { value: 1, label: '● B' }]} change={team => changeSeat(seat.id, { team })} />}
       {seat.kind === 'human' && seat.device.startsWith('keyboard:') && <div className="seat-keys">{['left','down','right','jump','punch','special','guard','combo'].map(action => <kbd key={action} title={t[action as keyof typeof t]}>{keyName(settings.keyboardBindings[Number(seat.device.split(':')[1])]?.[action] ?? '')}</kbd>)}</div>}
       {!practice && owned(seat) && config.players.length > 2 && <button className="text-button remove-fighter" onClick={() => {
        if (online) online.updateConfig({ ...config, players: config.players.filter(player => player.id !== seat.id) }); else update({ players: config.players.filter(player => player.id !== seat.id) });
        setEditing(null);
       }}>{t.remove} {seat.name}</button>}
      </>}
     </div>
    </div>
   </div>
  </MenuDialog>}
  {rulesOpen && <MenuDialog mark={<Icon name="arena" />} language={settings.language} title={`${t.arena} / ${t.rules}`} subtitle={!host ? t.waitHost : undefined} done={t.done} close={() => setRulesOpen(false)}>
   <div className="rules-editor"><div className="arena-preview" style={{ backgroundImage: manifest ? `url("${manifest.backgrounds[arena.id]}")` : undefined }}><svg viewBox="0 0 1366 768" aria-hidden="true">{arena.platforms.map((platform, i) => <rect key={i} {...platform} />)}</svg><span>{arena.subtitle[lang]}</span></div>
    <div className="editor-fields">
     <Choice label={t.arena} value={config.arena} disabled={!host} options={Object.values(ARENAS).map(value => ({ value: value.id, label: value.name[lang] }))} change={arena => update({ arena })} />
     {!practice && <>
      <Choice label={lang === 'es' ? 'Modo' : 'Mode'} value={config.mode} disabled={!host} options={[{ value: 'ffa', label: t.ffa }, { value: 'teams', label: t.teams }]} change={mode => update({ mode })} />
      <Choice label={t.lives} value={config.lives} disabled={!host} options={[1,2,3,4,5,6,7,8,9].map(value => ({ value, label: `${value}` }))} change={lives => update({ lives })} />
      <Choice label={t.time} value={config.timeLimit} disabled={!host} options={[60,120,180,300,600,900,0].map(value => ({ value, label: value ? `${value / 60} min` : t.unlimited }))} change={timeLimit => update({ timeLimit })} />
      {config.mode === 'teams' && <Choice label={t.friendly} value={Number(config.friendlyFire)} disabled={!host} options={[{ value: 0, label: t.off }, { value: 1, label: t.on }]} change={value => update({ friendlyFire: !!value })} />}
     </>}
    </div>
   </div>
  </MenuDialog>}
 </div>;
}
