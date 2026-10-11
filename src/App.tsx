import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, AssetsManifest, MatchConfig, MatchSnapshot } from './shared/types';
import { GameView } from './game/GameView';
import { Avatar } from './ui/Avatar';
import { Setup } from './ui/Setup';
import { Settings } from './ui/Settings';
import { Guide } from './ui/Guide';
import { HUD, formatClock } from './ui/HUD';
import { useGameRuntime } from './ui/useGameRuntime';
import type { MenuCommand } from './ui/useGameRuntime';
import type { OnlineBridge } from './ui/contracts';
import { defaultSeat, loadConfig, loadSettings } from './ui/preferences';
import { disciplineInfo, names, ui } from './ui/i18n';
import { ARENAS } from './shared/content';

type Screen = 'title' | 'setup' | 'online' | 'room' | 'match' | 'results' | 'settings' | 'guide';
export interface AppProps { online?: OnlineBridge }
export default function App({ online }: AppProps) {
 const [settings, setSettings] = useState<AppSettings>(loadSettings);
 const [config, setConfig] = useState<MatchConfig>(loadConfig);
 const [screen, setScreen] = useState<Screen>('title');
 const [returnScreen, setReturnScreen] = useState<Screen>('title');
 const [source, setSource] = useState<'local' | 'online' | 'practice'>('local');
 const [ready, setReady] = useState<Record<string, boolean>>({});
 const [manifest, setManifest] = useState<AssetsManifest | null>(null);
 const [assetError, setAssetError] = useState('');
 const [name, setName] = useState(() => localStorage.getItem('stf-name') ?? '');
 const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('room') ?? '');
 const [onlineError, setOnlineError] = useState('');
 const [pending, setPending] = useState(false);
 const [copied, setCopied] = useState(false);
 const [menuInput, setMenuInput] = useState<'keyboard' | 'gamepad'>('keyboard');
 const [renderReady, setRenderReady] = useState(false);
 const menuHandler = useRef<(command: MenuCommand) => void>(() => {});
 const lastSnapshot = useRef<MatchSnapshot | null>(null);
 const root = useRef<HTMLDivElement>(null);
 const t = ui[settings.language];
 const runtime = useGameRuntime(settings, manifest, command => menuHandler.current(command), online, source === 'online' && !!online?.state.snapshot);
 const snapshot = runtime.snapshot;
 const activeConfig = source === 'online' ? online?.state.config ?? config : config;
 if (snapshot) lastSnapshot.current = snapshot;
 useEffect(() => {
   let active = true;
   fetch('/assets/manifest.json').then(response => { if (!response.ok) throw new Error('assets'); return response.json(); }).then((assets: AssetsManifest) => { if (active) setManifest(assets); }).catch(() => { if (active) setAssetError(settings.language === 'es' ? 'No se pudieron cargar los recursos. Recarga la página.' : 'Game assets could not load. Reload this page.'); });
   return () => { active = false; };
 }, []);
 useEffect(() => { localStorage.setItem('stf-settings', JSON.stringify(settings)); document.documentElement.lang = settings.language; document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full'; }, [settings]);
 useEffect(() => { if (!config.practice) localStorage.setItem('stf-match', JSON.stringify(config)); }, [config]);
 useEffect(() => { localStorage.setItem('stf-name', name); }, [name]);
 useEffect(() => {
   if (online?.state.code && source === 'online' && ['lobby', 'playing'].includes(online.state.status) && ['online', 'title'].includes(screen)) setScreen('room');
   if (source === 'online' && online?.state.snapshot && screen === 'room') { setRenderReady(false); setScreen(online.state.snapshot.phase === 'finished' ? 'results' : 'match'); }
   if (source === 'online' && online?.state.status === 'idle' && ['room', 'match', 'results'].includes(screen)) { setSource('local'); setScreen('title'); }
 }, [online?.state.status, online?.state.code, online?.state.snapshot, source, screen]);
 useEffect(() => { if (snapshot?.phase === 'finished' && ['match', 'settings', 'guide'].includes(screen)) setScreen('results'); }, [snapshot?.phase, screen]);
 useEffect(() => {
   if (screen !== 'match' || snapshot?.phase === 'paused') {
     const timer = setTimeout(() => (root.current?.querySelector<HTMLElement>('[data-autofocus]:not(:disabled)') ?? root.current?.querySelector<HTMLElement>('main button:not(:disabled), main input:not(:disabled), .pause-panel button:not(:disabled)'))?.focus({ preventScroll: true }), 30);
     return () => clearTimeout(timer);
   }
 }, [screen, snapshot?.phase]);
 const changeConfig = (next: MatchConfig) => { setConfig(next); setReady({}); };
 const enterLocal = (practice = false) => {
   setSource(practice ? 'practice' : 'local'); setReady({}); setRenderReady(false); lastSnapshot.current = null;
   setConfig(previous => practice ? { ...previous, practice: true, mode: 'ffa', timeLimit: 0, players: [defaultSeat(0, false, settings.language), defaultSeat(1, true, settings.language)] } : { ...previous, practice: false, timeLimit: previous.timeLimit || 300 });
   setScreen('setup');
 };
 const leaveMatch = () => { runtime.stop(); if (source === 'online') { online?.rematch(); setScreen('room'); } else setScreen('setup'); };
 const leaveRoom = () => { online?.leave(); runtime.stop(); setSource('local'); setScreen('title'); };
 const back = useCallback(() => {
   if (screen === 'match') {
     if (snapshot?.phase === 'paused' && !runtime.disconnected) { if (source === 'online' && online?.state.isHost) online.resume(); else if (source !== 'online') runtime.command({ type: 'resume' }); } else { if (source === 'online') online?.pause(); else runtime.command({ type: 'pause' }); }
   } else if (screen === 'settings' || screen === 'guide') setScreen(returnScreen);
   else if (screen === 'room') leaveRoom();
   else if (screen === 'results') leaveMatch();
   else setScreen('title');
 }, [screen, returnScreen, source, online, runtime.command, snapshot?.phase, runtime.disconnected]);
 menuHandler.current = command => {
   if (command === 'back' || command === 'pause') { back(); return; }
   const focused = document.activeElement as HTMLElement;
   const container = root.current?.querySelector('.pause-panel') ?? root.current?.querySelector('main');
   if (!container) return;
   const options = Array.from(container.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')).filter(item => item.offsetParent !== null);
   if (!options.length) return;
   if (command === 'confirm') { if (focused?.tagName === 'BUTTON' || focused?.tagName === 'A' || focused?.matches('input[type="checkbox"]')) focused.click(); else if (!options.includes(focused)) options[0].focus(); return; }
   if ((command === 'left' || command === 'right') && focused?.tagName === 'SELECT') {
     const select = focused as HTMLSelectElement, direction = command === 'left' ? -1 : 1;
     select.selectedIndex = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + direction));
     const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set; setter?.call(select, select.value); select.dispatchEvent(new Event('change', { bubbles: true })); return;
   }
   if ((command === 'left' || command === 'right') && focused?.matches('input[type="range"]')) {
     const range = focused as HTMLInputElement; const value = Math.max(Number(range.min), Math.min(Number(range.max), Number(range.value) + Number(range.step || 1) * (command === 'left' ? -1 : 1)));
     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(range, String(value)); range.dispatchEvent(new Event('input', { bubbles: true })); return;
   }
   const index = options.indexOf(focused), direction = ['up', 'left'].includes(command) ? -1 : 1;
   options[(index + direction + options.length) % options.length].focus();
 };
 useEffect(() => { const connected = () => setMenuInput('gamepad'); const key = () => setMenuInput('keyboard'); window.addEventListener('gamepadconnected', connected); window.addEventListener('keydown', key); return () => { window.removeEventListener('gamepadconnected', connected); window.removeEventListener('keydown', key); }; }, []);
 const start = () => { setRenderReady(false); if (source === 'online') online?.start(); else { runtime.start({ ...config, seed: Date.now() }); setScreen('match'); } };
 const pause = () => source === 'online' ? online?.pause() : runtime.command({ type: 'pause' });
 const resume = () => { if (!runtime.reclaim()) return; if (source === 'online') online?.resume(); else runtime.command({ type: 'resume' }); };
 const open = (page: 'settings' | 'guide') => { setReturnScreen(screen); if (screen === 'match') pause(); setScreen(page); };
 const connect = async (create: boolean) => {
   setOnlineError('');
   if (!online) { setOnlineError(t.backendUnavailable); return; }
   if (!name.trim() || (!create && !code.trim())) return;
   setPending(true); setSource('online');
   try { if (create) await online.create(name.trim()); else await online.join(code.trim().toUpperCase(), name.trim()); } catch (error) { setOnlineError(error instanceof Error ? error.message : t.backendUnavailable); } finally { setPending(false); }
 };
 const copyInvite = async () => { if (!online?.state.code) return; const link = new URL(window.location.href); link.search = ''; link.searchParams.set('room', online.state.code); await navigator.clipboard.writeText(link.toString()); setCopied(true); setTimeout(() => setCopied(false), 2500); };
 const displaySnapshot = snapshot ?? lastSnapshot.current;
 const isMatch = screen === 'match';
 return <div className={`app ${isMatch ? 'app-match' : ''} screen-${screen}`} ref={root} onPointerDown={() => { if (!runtime.soundUnlocked) void runtime.unlock(); }}>
   <div className="site-atmosphere" aria-hidden="true" style={{ backgroundImage: manifest ? `url("${manifest.backgrounds.classic}")` : undefined }} />
   <header className="app-header">
     <button className="brand-button" aria-label="New Super TIC Fighter" onClick={() => { if (isMatch) pause(); else setScreen('title'); }}><span className="brand-new">NEW</span>{manifest ? <img src={manifest.logo} alt="Super TIC Fighter" /> : <span className="brand-fallback">SUPER TIC <em>FIGHTER</em></span>}</button>
     <div className="header-status"><span className="status-dot" /><span>{source === 'online' && online?.state.code ? `${t.room} ${online.state.code}` : settings.language === 'es' ? 'EL CLÁSICO VUELVE' : 'CLASSIC REBORN'}</span></div>
     <div className="header-actions">
       {!runtime.soundUnlocked && <button className="sound-unlock" title={t.soundHint} onClick={() => void runtime.unlock()}>♪ <span>{t.soundLocked}</span></button>}
       <button className="icon-button" aria-label={t.fullscreen} title={t.fullscreen} onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()}>⛶</button>
       <button className="language-button" aria-label={t.language} onClick={() => setSettings({ ...settings, language: settings.language === 'es' ? 'en' : 'es' })}>{settings.language.toUpperCase()}</button>
       {screen !== 'settings' && <button className="icon-button" title={t.settings} aria-label={t.settings} onClick={() => open('settings')}>⚙</button>}
     </div>
   </header>
   <main>
    {screen === 'title' && <div className="title-screen">
      <section className="title-copy"><span className="eyebrow">{settings.language === 'es' ? 'NUEVOS RIVALES BIENVENIDOS' : 'NEW CHALLENGERS WELCOME'}</span><div className="hero-logo"><span className="new-stamp">NEW</span>{manifest ? <img src={manifest.logo} alt="Super TIC Fighter" /> : <h1>SUPER TIC<br /><em>FIGHTER</em></h1>}</div><p className="title-tagline">{t.subtitle}</p><span className="title-divider" /><p className="title-intro">{t.about}</p>
       <div className="title-utility"><button onClick={() => open('guide')}>{t.guide}<span>↗</span></button><button onClick={() => open('settings')}>{t.settings}<span>⚙</span></button></div>
      </section>
      <section className="mode-selection"><span className="eyebrow">{t.titlePrompt}</span><button className="mode-card local-card" data-autofocus onClick={() => enterLocal()}><span className="mode-index">01</span><span className="mode-icon">✚</span><div><strong>{t.local}</strong><p>{t.localHint}</p></div><span className="mode-arrow">↗</span></button><button className="mode-card online-card" onClick={() => { setSource('online'); setScreen('online'); }}><span className="mode-index">02</span><span className="mode-icon">↯</span><div><strong>{t.online}</strong><p>{t.onlineHint}</p></div><span className="mode-arrow">↗</span></button><button className="mode-card practice-card" onClick={() => enterLocal(true)}><span className="mode-index">03</span><span className="mode-icon">◎</span><div><strong>{t.practice}</strong><p>{t.practiceHint}</p></div><span className="mode-arrow">↗</span></button>
       <div className="mode-fighters">{(['networks','design','code','hardware'] as const).map((d,i) => <div key={d} style={{ '--fighter-color': disciplineInfo[d].color } as React.CSSProperties}><Avatar manifest={manifest} discipline={d} appearance={{hair:i,shirt:i,pants:i}} animated={!settings.reducedMotion} /><span>{names[d][settings.language]}</span></div>)}</div>
      </section>
      <div className="title-bottom"><span>{t.titleFoot}</span><span>{settings.language === 'es' ? '2—4 JUGADORES / COMBATE CLÁSICO' : '2—4 PLAYERS / CLASSIC COMBAT'}</span></div>
    </div>}
    {['setup','room','settings','guide','online'].includes(screen) && <div className="page-heading"><button className="back-button" onClick={back}>← {t.back}</button><div><span className="eyebrow">{screen === 'setup' ? source === 'practice' ? t.practice : t.local : screen === 'room' ? `${t.online} / ${t.room} ${online?.state.code ?? ''}` : 'NEW SUPER TIC FIGHTER'}</span><h1>{screen === 'setup' || screen === 'room' ? t.setup : screen === 'settings' ? t.settings : screen === 'guide' ? t.guide : t.onlineTitle}</h1></div></div>}
    {(screen === 'setup' || screen === 'room') && <>
      {screen === 'room' && online && <div className="room-bar"><div className="room-code"><span>{t.room}</span><strong>{online.state.code}</strong><button className="small-button" onClick={() => void copyInvite()}>{copied ? t.copied : t.copy}</button></div><div className="room-quality"><span className={`status-dot ${online.state.status === 'reconnecting' ? 'warning' : ''}`} /><span>{online.state.status === 'reconnecting' ? t.reconnecting : online.state.route === 'direct' ? t.direct : online.state.route === 'relay' ? t.relay : t.connecting}{online.state.ping !== undefined ? ` · ${Math.round(online.state.ping)} ms` : ''}</span>{online.forceRelay && <label><input type="checkbox" onChange={e => online.forceRelay?.(e.target.checked)} />{t.forceRelay}</label>}</div><div className="room-members">{online.state.members.map(member => <span key={member.id} className={member.ready ? 'member-ready' : ''}>{member.ready ? '✓' : '•'} {member.name}{member.id === online.state.peerId ? ` (${online.state.isHost ? t.host : t.guest})` : ''}</span>)}</div></div>}
      <Setup config={activeConfig} setConfig={changeConfig} settings={settings} manifest={manifest} devices={runtime.devices} ready={ready} toggleReady={id => source === 'online' ? online?.ready(!online.state.members.find(m => m.id === online.state.peerId)?.ready) : setReady(previous => ({ ...previous, [id]: !previous[id] }))} start={start} online={screen === 'room' ? online : undefined} practice={source === 'practice'} />
    </>}
    {screen === 'settings' && <Settings settings={settings} change={setSettings} />}
    {screen === 'guide' && <Guide settings={settings} manifest={manifest} />}
    {screen === 'online' && <div className="online-entry"><div className="online-art"><div className="online-orbit" /><span className="online-symbol">↯</span><h2>{t.online}</h2><p>{t.onlineDescription}</p></div><div className="online-form"><label className="field-label"><span>{t.yourName}</span><input value={name} onChange={e => setName(e.target.value)} maxLength={18} placeholder={t.player} autoComplete="nickname" /></label><button className="primary-button" disabled={pending || !name.trim() || !manifest} onClick={() => void connect(true)}>{pending ? t.connecting : t.create}<span>↗</span></button><div className="or-divider"><span />{settings.language === 'es' ? 'O' : 'OR'}<span /></div><label className="field-label"><span>{t.code}</span><input className="code-input" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={12} placeholder="ABC123" autoComplete="off" /></label><button className="secondary-button" disabled={pending || !name.trim() || !code.trim() || !manifest} onClick={() => void connect(false)}>{t.join}<span>→</span></button>{(onlineError || online?.state.error) && <p className="inline-error" role="alert">{onlineError || online?.state.error}</p>}<div className="online-explain"><span>⌁</span><p>{settings.language === 'es' ? 'Salas privadas, sin cuentas. Comparte el enlace y prepara la revancha.' : 'Private rooms, no accounts. Share the link and prepare your rematch.'}</p></div></div></div>}
    {screen === 'match' && <div className="match-screen">
      <div className="match-topbar"><div><span className="status-dot" /><strong>{ARENAS[(snapshot?.config ?? activeConfig).arena].name[settings.language]}</strong><span>{(snapshot?.config ?? activeConfig).practice ? t.practice : (snapshot?.config ?? activeConfig).mode === 'teams' ? t.teams : t.ffa}</span></div><div className="match-clock">{snapshot?.config.practice ? '∞' : snapshot?.config.timeLimit ? formatClock(snapshot.config.timeLimit - snapshot.elapsed) : '∞'}</div><button className="small-button" onClick={pause}>Ⅱ {t.pause}</button></div>
      <div className="match-stage"><GameView arena={activeConfig.arena} snapshot={snapshot} snapshotRef={runtime.snapshotRef} settings={settings} manifest={manifest} onReady={() => setRenderReady(true)} />{snapshot?.phase === 'countdown' && renderReady && <div className="countdown-overlay"><span>{Math.ceil(snapshot.countdown) || 'FIGHT!'}</span><p>{settings.language === 'es' ? '¿LISTOS?' : 'READY?'}</p></div>}{!snapshot && <div className="countdown-overlay"><span>…</span></div>}</div>
      {snapshot && <HUD snapshot={snapshot} settings={settings} manifest={manifest} />}
      {snapshot?.phase === 'paused' && <div className="modal-shade"><section className="pause-panel"><span className="eyebrow">{runtime.disconnected ? t.disconnected : settings.language === 'es' ? 'UN RESPIRO' : 'TIME OUT'}</span><h1>{t.pause}</h1><p>{runtime.disconnected ? t.reclaim : online?.state.pauseReason || t.pausedHint}</p><button data-autofocus className="primary-button" disabled={source === 'online' && !online?.state.isHost || runtime.disconnected && !snapshot.config.players.filter(p => p.kind === 'human' && p.device.startsWith('gamepad:')).every(p => navigator.getGamepads?.()[Number(p.device.split(':')[1])]?.connected)} onClick={resume}>{t.resume}<span>▶</span></button>{source === 'practice' && <button className="secondary-button" onClick={start}>{t.reset} ↻</button>}<button className="secondary-button" onClick={() => open('settings')}>{t.settings}</button><button className="text-button" onClick={leaveMatch}>{t.lobby}</button></section></div>}
    </div>}
    {screen === 'results' && displaySnapshot && <Results snapshot={displaySnapshot} settings={settings} manifest={manifest} rematch={() => { if (source === 'online') { online?.rematch(); setScreen('room'); } else start(); }} canRematch={source !== 'online' || !!online?.state.isHost} leave={leaveMatch} />}
   </main>
   {!isMatch && <footer className="app-footer"><span className="footer-mark">STF<span>✕</span></span><span>{menuInput === 'gamepad' ? t.gamepadHelp : t.menuHelp}</span><button onClick={() => open('guide')}>{t.guide} <span>?</span></button></footer>}
   {(assetError || runtime.error && source !== 'online' && screen === 'match' || online?.state.error && source === 'online' && screen !== 'online') && <div className="global-error" role="alert">{assetError || runtime.error || online?.state.error}</div>}
 </div>;
}
function Results({ snapshot, settings, manifest, rematch, canRematch, leave }: { snapshot: MatchSnapshot; settings: AppSettings; manifest: AssetsManifest | null; rematch: () => void; canRematch: boolean; leave: () => void }) {
 const t = ui[settings.language], result = snapshot.result;
 const winners = snapshot.config.players.filter(p => result?.winners.includes(p.id));
 const draw = result?.reason === 'draw', interrupted = result?.reason === 'interrupted';
 return <div className="results-screen"><span className="eyebrow">{interrupted ? t.noWinner : result?.reason === 'timeout' ? t.timeout : t.lastStanding}</span><h1>{interrupted ? t.interrupted : draw ? t.draw : t.winner}</h1><div className="result-fighters">{(winners.length ? winners : snapshot.config.players).map(seat => <div key={seat.id} style={{ '--fighter-color': disciplineInfo[seat.discipline].color } as React.CSSProperties}><span className="winner-crown">{!draw && !interrupted ? '♛' : '◆'}</span><Avatar manifest={manifest} appearance={seat.appearance} discipline={seat.discipline} animated={!settings.reducedMotion} /><h2>{seat.name}</h2><span>{names[seat.discipline][settings.language]}</span></div>)}</div><p>{t.resultHint}</p><div className="results-actions"><button data-autofocus disabled={!canRematch} className="primary-button" onClick={rematch}>{t.rematch}<span>↻</span></button><button className="secondary-button" onClick={leave}>{t.lobby}<span>←</span></button></div><div className="result-scoreboard">{snapshot.config.players.map(seat => { const f = snapshot.fighters.find(fighter => fighter.id === seat.id); return <div key={seat.id}><strong>{seat.name}</strong><span>{f?.lives ?? 0} {t.lives}</span><span>{Math.round(f?.damage ?? 0)}%</span>{result?.winners.includes(seat.id) && <b>★</b>}</div>; })}</div></div>;
}
