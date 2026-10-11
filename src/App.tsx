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
import { disciplineInfo, formatLives, names, pauseMessage, ui } from './ui/i18n';
import { ARENAS } from './shared/content';
import { Icon } from './ui/Icon';
import { Intro } from './ui/Intro';
import { useUiFeedback } from './ui/useUiFeedback';
import { ControllerStatusPanel } from './ui/ControllerStatusPanel';

type Screen = 'intro' | 'title' | 'setup' | 'online' | 'room' | 'match' | 'results' | 'settings' | 'guide';
export interface AppProps { online?: OnlineBridge }
export default function App({ online }: AppProps) {
 const [settings, setSettings] = useState<AppSettings>(loadSettings);
 const [config, setConfig] = useState<MatchConfig>(loadConfig);
 const [screen, setScreen] = useState<Screen>(() => new URLSearchParams(window.location.search).get('room') ? 'title' : 'intro');
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
 const [selectedMode, setSelectedMode] = useState<'local' | 'online' | 'practice' | 'settings' | 'guide'>('local');
 const menuHandler = useRef<(command: MenuCommand, source: 'keyboard' | 'gamepad') => void>(() => {});
 const lastSnapshot = useRef<MatchSnapshot | null>(null);
 const root = useRef<HTMLDivElement>(null);
 const t = ui[settings.language];
 const runtime = useGameRuntime(settings, manifest, (command, source) => menuHandler.current(command, source), online, source === 'online' && !!online?.state.snapshot, screen === 'match');
 const snapshot = runtime.snapshot;
 const enterTitle = useCallback((fromGamepad = false) => { setMenuInput(fromGamepad ? 'gamepad' : 'keyboard'); void runtime.unlock(); setScreen('title'); }, [runtime.unlock]);
 useUiFeedback(root, runtime.uiSound);
 const previousPhase = useRef(snapshot?.phase);
 useEffect(() => { if (screen === 'results') runtime.uiSound(snapshot?.result?.reason === 'interrupted' ? 'error' : 'ready'); }, [screen, runtime.uiSound]);
 const reportedError = assetError || onlineError || runtime.error || (source === 'online' ? online?.state.error : '');
 useEffect(() => { if (reportedError) runtime.uiSound('error'); }, [reportedError, runtime.uiSound]);
 const pendingController = useRef<string | undefined>(undefined);
 useEffect(() => {
   if (snapshot?.phase === 'paused' && previousPhase.current !== 'paused') runtime.uiSound('pause');
   if (previousPhase.current === 'paused' && snapshot?.phase === 'countdown') runtime.uiSound('resume');
   previousPhase.current = snapshot?.phase;
 }, [snapshot?.phase, runtime.uiSound]);
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
   if (source === 'online' && online?.state.status === 'idle' && ['room', 'match', 'results'].includes(screen)) { setSource('local'); setScreen('title'); }
   if (source === 'online' && online?.state.status === 'lobby' && screen === 'match' && !online.state.snapshot) { runtime.stop(); setScreen('room'); }
   if (online?.state.code && source === 'online' && ['lobby','playing'].includes(online.state.status) && ['online', 'title'].includes(screen)) setScreen('room');
   if (source === 'online' && online?.state.snapshot && screen === 'room') { setRenderReady(false); setScreen(online.state.snapshot.phase === 'finished' ? 'results' : 'match'); }
 }, [online?.state.status, online?.state.code, online?.state.snapshot, source, screen]);
 useEffect(() => { if (snapshot?.phase === 'finished' && (screen === 'match' || (['settings', 'guide'].includes(screen) && returnScreen === 'match'))) setScreen('results'); }, [snapshot?.phase, screen, returnScreen]);
 useEffect(() => {
   if (screen !== 'match' || snapshot?.phase === 'paused') {
     const timer = setTimeout(() => (root.current?.querySelector<HTMLElement>('[data-autofocus]:not(:disabled)') ?? root.current?.querySelector<HTMLElement>('main button:not(:disabled), main input:not(:disabled), .pause-panel button:not(:disabled)'))?.focus({ preventScroll: true }), 30);
     return () => clearTimeout(timer);
   }
 }, [screen, snapshot?.phase]);
 const changeConfig = (next: MatchConfig) => { setConfig(next); setReady({}); };
 const enterLocal = (practice = false) => {
   const controller = runtime.preferredController();
   setSource(practice ? 'practice' : 'local'); setReady({}); setRenderReady(false); lastSnapshot.current = null;
   setConfig(previous => {
     const next = practice ? { ...previous, practice: true, mode: 'ffa' as const, timeLimit: 0, players: [defaultSeat(0, false, settings.language), defaultSeat(1, true, settings.language)] } : { ...previous, practice: false, timeLimit: previous.timeLimit || 300 };
     const first = next.players.find(player => player.kind === 'human');
     return controller && first && !next.players.some(player => player.device === controller) ? { ...next, players: next.players.map(player => player.id === first.id ? { ...player, device: controller } : player) } : next;
   });
   setScreen('setup');
 };
 const leaveMatch = () => { runtime.stop(); if (source === 'online') { online?.rematch(); setScreen('room'); } else setScreen('setup'); };
 const leaveRoom = () => { online?.leave(); runtime.stop(); setSource('local'); setScreen('title'); };
 const back = useCallback(() => {
   if (screen === 'match') {
     if (snapshot?.phase === 'paused') { if (!runtime.reclaim()) return; if (source === 'online') { if (online?.state.isHost && !online.state.members.some(member => !member.connected)) online.resume(); } else runtime.command({ type: 'resume' }); } else { if (source === 'online') online?.pause(); else runtime.command({ type: 'pause' }); }
   } else if (screen === 'settings' || screen === 'guide') setScreen(returnScreen);
   else if (screen === 'title') setScreen('intro');
   else if (screen === 'room') leaveRoom();
   else if (screen === 'results') { if (source === 'online' && !online?.state.isHost && online?.state.status !== 'lobby') leaveRoom(); else leaveMatch(); }
   else setScreen('title');
 }, [screen, returnScreen, source, online, runtime.command, snapshot?.phase, runtime.disconnected, runtime.reclaim]);
 menuHandler.current = (command, inputSource) => {
   setMenuInput(inputSource);
   if (inputSource === 'gamepad') root.current?.setAttribute('data-input', 'gamepad');
   if (screen === 'intro') { if (command === 'confirm' || command === 'pause') enterTitle(inputSource === 'gamepad'); return; }
   if (command === 'back' || command === 'pause') { if (screen !== 'match') runtime.uiSound('back'); back(); return; }
   const focused = document.activeElement as HTMLElement;
   const container = root.current?.querySelector('.pause-panel') ?? root.current?.querySelector('main');
   if (!container) return;
   const options = Array.from(container.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href]')).filter(item => item.getClientRects().length && !item.closest('[hidden], [inert]'));
   const focusItem = (item: HTMLElement) => { if (item === document.activeElement) return; item.focus({ preventScroll: true }); item.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); runtime.uiSound('navigate'); };
   if (!options.length) return;
   if (command === 'confirm') { if (focused?.tagName === 'BUTTON' || focused?.tagName === 'A' || focused?.tagName === 'SUMMARY' || focused?.matches('input[type="checkbox"]')) focused.click(); else if (!options.includes(focused)) focusItem(options[0]); return; }
   if ((command === 'left' || command === 'right') && focused?.tagName === 'SELECT') {
     const select = focused as HTMLSelectElement, direction = command === 'left' ? -1 : 1;
     const index = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + direction));
     if (index === select.selectedIndex) return;
     const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set; setter?.call(select, select.options[index].value); select.dispatchEvent(new Event('change', { bubbles: true })); return;
   }
   if ((command === 'left' || command === 'right') && focused?.matches('input[type="range"]')) {
     const range = focused as HTMLInputElement; const value = Math.max(Number(range.min), Math.min(Number(range.max), Number(range.value) + Number(range.step || 1) * (command === 'left' ? -1 : 1)));
     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(range, String(value)); range.dispatchEvent(new Event('input', { bubbles: true })); return;
   }
   const index = options.indexOf(focused), direction = ['up', 'left'].includes(command) ? -1 : 1;
   if (index < 0) { focusItem(options[0]); return; }
   const horizontal = command === 'left' || command === 'right', origin = focused.getBoundingClientRect();
   const ox = origin.x + origin.width / 2, oy = origin.y + origin.height / 2;
   const candidates = options.filter(item => item !== focused).map(item => {
     const rect = item.getBoundingClientRect(), dx = rect.x + rect.width / 2 - ox, dy = rect.y + rect.height / 2 - oy;
     const along = horizontal ? dx : dy, across = horizontal ? dy : dx;
     return { item, along, score: Math.abs(along) + Math.abs(across) * 3 };
   }).filter(item => item.along * direction > 5).sort((a, b) => a.score - b.score);
   focusItem(candidates[0]?.item ?? options[(index + direction + options.length) % options.length]);
 };
 useEffect(() => { const connected = () => setMenuInput('gamepad'); const key = () => setMenuInput('keyboard'); window.addEventListener('gamepadconnected', connected); window.addEventListener('keydown', key); return () => { window.removeEventListener('gamepadconnected', connected); window.removeEventListener('keydown', key); }; }, []);
 const start = () => { runtime.uiSound('start'); setRenderReady(false); if (source === 'online') online?.start(); else { void runtime.start({ ...config, seed: Date.now() }); setScreen('match'); } };
 const pause = () => source === 'online' ? online?.pause() : runtime.command({ type: 'pause' });
 const resume = () => { if (!runtime.reclaim()) return; if (source === 'online') { if (!online?.state.isHost || online.state.members.some(member => !member.connected)) return; online.resume(); } else runtime.command({ type: 'resume' }); };
 const open = (page: 'settings' | 'guide') => { setReturnScreen(screen); if (screen === 'match') pause(); setScreen(page); };
 const connect = async (create: boolean) => {
   setOnlineError('');
   if (!online) { setOnlineError(t.backendUnavailable); return; }
   if (!name.trim() || (!create && !code.trim())) return;
   pendingController.current = runtime.preferredController();
   setPending(true); setSource('online');
   try { if (create) await online.create(name.trim()); else await online.join(code.trim().toUpperCase(), name.trim()); } catch (error) { setOnlineError(error instanceof Error ? error.message : t.backendUnavailable); } finally { setPending(false); }
 };
 useEffect(() => {
   if (screen !== 'room' || !online?.state.config || !pendingController.current) return;
   const seat = online.state.config.players.find(player => player.peerId === online.state.peerId && player.kind === 'human');
   if (!seat) return;
   const device = pendingController.current; pendingController.current = undefined;
   if (!online.state.config.players.some(player => player.peerId === online.state.peerId && player.device === device)) online.updateSeat({ ...seat, device });
 }, [screen, online?.state.config, online?.state.peerId]);
 const copyInvite = async () => { if (!online?.state.code) return; const link = new URL(window.location.href); link.search = ''; link.searchParams.set('room', online.state.code); await navigator.clipboard.writeText(link.toString()); setCopied(true); setTimeout(() => setCopied(false), 2500); };
 const displaySnapshot = snapshot ?? lastSnapshot.current;
 const isMatch = screen === 'match';
 const pauseNotice = runtime.disconnected ? t.reclaim : source === 'online'
   ? online?.state.members.some(member => !member.connected) ? t.reconnecting
     : pauseMessage(online?.state.pauseReason, settings.language) || (!online?.state.isHost ? t.waitingHost : '')
   : '';
 return <div className={`app ${isMatch ? 'app-match' : ''} screen-${screen}`} ref={root} data-input={menuInput} onPointerDown={() => { if (!runtime.soundUnlocked) void runtime.unlock(); }}>
   <div className="site-atmosphere" aria-hidden="true" style={{ backgroundImage: manifest ? `url("${manifest.backgrounds.classic}")` : undefined }} />
   {screen !== 'intro' && <header className="app-header">
     <button className="brand-button" aria-label="New Super TIC Fighter" onClick={() => { if (isMatch) pause(); else setScreen('title'); }}><picture><source media="(max-width: 760px)" srcSet="/assets/branding/overdrive-icon.svg" /><img src="/assets/branding/overdrive-horizontal.svg" alt="" width="918" height="138" /></picture></button>
     <div className="header-actions">
       {!runtime.soundUnlocked && <button className="sound-unlock" title={t.soundHint} onClick={() => void runtime.unlock()}>♪ <span>{t.soundLocked}</span></button>}
       <button className="icon-button" aria-label={t.fullscreen} title={t.fullscreen} onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()}><Icon name="fullscreen" /></button>
       <button className="language-button" aria-label={t.language} onClick={() => setSettings({ ...settings, language: settings.language === 'es' ? 'en' : 'es' })}>{settings.language.toUpperCase()}</button>
       {screen !== 'settings' && <button className="icon-button" title={t.settings} aria-label={t.settings} onClick={() => open('settings')}><Icon name="settings" /></button>}
     </div>
   </header>}
   <main>
    {screen === 'intro' && <Intro manifest={manifest} settings={settings} onContinue={enterTitle} />}
    {screen === 'title' && <div className="title-screen">
      <section className="title-poster" aria-label="New Super TIC Fighter">
       <div className="hero-logo"><img src={manifest?.logo ?? '/assets/branding/overdrive.svg'} alt="New Super TIC Fighter" width="1208" height="630" fetchPriority="high" /></div>
       <div className="title-cast" aria-hidden="true">{(['networks','design','code','hardware'] as const).map((d,i) => <div key={d} style={{ '--fighter-color': disciplineInfo[d].color } as React.CSSProperties}><Avatar manifest={manifest} discipline={d} appearance={{hair:i,shirt:i,pants:i}} animated={!settings.reducedMotion} /></div>)}</div>
      </section>
      <section className="title-menu-area">
       <nav className="arcade-menu" aria-label={t.titlePrompt}>{(['local','online','practice','settings','guide'] as const).map(mode => <button key={mode} data-testid={`mode-${mode}`} data-autofocus={mode === 'local' ? true : undefined} aria-label={t[mode]} onFocus={() => setSelectedMode(mode)} onMouseEnter={() => setSelectedMode(mode)} onClick={() => mode === 'local' ? enterLocal() : mode === 'practice' ? enterLocal(true) : mode === 'online' ? (setSource('online'),setScreen('online')) : open(mode)}><span className="menu-pointer" aria-hidden="true" /><strong>{t[mode]}</strong></button>)}</nav>
       <p className="mode-hint">{selectedMode === 'local' ? t.localHint : selectedMode === 'online' ? t.onlineHint : selectedMode === 'practice' ? t.practiceHint : selectedMode === 'settings' ? t.settingsHint : t.guideHint}</p>
       <div className="title-utility"><button aria-label={t.language} onClick={() => setSettings({ ...settings, language: settings.language === 'es' ? 'en' : 'es' })}>{settings.language.toUpperCase()}</button><button onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()}><Icon name="fullscreen" />{t.fullscreen}</button>{!runtime.soundUnlocked && <button onClick={() => void runtime.unlock()}><Icon name="sound" />{t.soundLocked}</button>}</div>
      </section>
    </div>}
    {['setup','room','settings','guide','online'].includes(screen) && <div className="page-heading"><button className="back-button" data-ui-sound="back" onClick={back}>← {t.back}</button><div><span className="screen-context">{screen === 'setup' ? source === 'practice' ? t.practice : t.local : screen === 'room' ? `${t.online} / ${t.room} ${online?.state.code ?? ''}` : ''}</span><h1>{screen === 'setup' || screen === 'room' ? t.setup : screen === 'settings' ? t.settings : screen === 'guide' ? t.guide : t.onlineTitle}</h1></div></div>}
    {(screen === 'setup' || screen === 'room') && <>
      {screen === 'room' && online && <div className="room-bar"><div className="room-code"><span>{t.room}</span><strong>{online.state.code}</strong><button className="small-button" onClick={() => void copyInvite()}>{copied ? t.copied : t.copy}</button></div><div className="room-quality"><span className={`status-dot ${online.state.status === 'reconnecting' ? 'warning' : ''}`} /><span>{online.state.status === 'reconnecting' ? t.reconnecting : online.state.route === 'direct' ? t.direct : online.state.route === 'relay' ? t.relay : t.connecting}{online.state.ping !== undefined ? ` · ${Math.round(online.state.ping)} ms${online.state.ping > 180 ? ` · ${t.slowConnection}` : ''}` : ''}</span>{online.forceRelay && <label><input type="checkbox" onChange={e => online.forceRelay?.(e.target.checked)} />{t.forceRelay}</label>}</div><div className="room-members">{online.state.members.map(member => <span key={member.id} className={member.ready ? 'member-ready' : ''}>{member.ready ? '✓' : '•'} {member.name}{member.id === online.state.peerId ? ` (${online.state.isHost ? t.host : t.guest})` : ''}</span>)}</div></div>}
      <Setup config={activeConfig} setConfig={changeConfig} settings={settings} manifest={manifest} devices={runtime.devices} ready={ready} toggleReady={id => source === 'online' ? online?.ready(!online.state.members.find(m => m.id === online.state.peerId)?.ready) : setReady(previous => ({ ...previous, [id]: !previous[id] }))} start={start} online={screen === 'room' ? online : undefined} practice={source === 'practice'} />
    </>}
    {screen === 'settings' && <><ControllerStatusPanel status={runtime.controllers} language={settings.language} /><Settings settings={settings} manifest={manifest} change={setSettings} feedback={runtime.uiSound} /></>}
    {screen === 'guide' && <Guide settings={settings} manifest={manifest} />}
    {screen === 'online' && <div className="online-entry"><div className="online-art"><div className="online-orbit" /><div className="online-fighters"><Avatar manifest={manifest} discipline="networks" appearance={{hair:0,shirt:0,pants:0}} animated={!settings.reducedMotion} /><Avatar manifest={manifest} discipline="code" appearance={{hair:2,shirt:2,pants:2}} animated={!settings.reducedMotion} /></div><h2>{t.online}</h2><p>{t.onlineDescription}</p></div><div className="online-form"><label className="field-label"><span>{t.yourName}</span><input value={name} onChange={e => setName(e.target.value)} maxLength={18} placeholder={t.player} autoComplete="nickname" /></label><button className="primary-button" disabled={pending || !name.trim() || !manifest} onClick={() => void connect(true)}>{pending ? t.connecting : t.create}<span>↗</span></button><div className="or-divider"><span />{t.or}<span /></div><label className="field-label"><span>{t.code}</span><input className="code-input" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={12} placeholder="ABCD234567" autoComplete="off" /></label><button className="secondary-button" disabled={pending || !name.trim() || !code.trim() || !manifest} onClick={() => void connect(false)}>{t.join}<span>→</span></button>{(onlineError || online?.state.error) && <p className="inline-error" role="alert">{onlineError || online?.state.error}</p>}<div className="online-explain"><span>⌁</span><p>{t.onlineNote}</p></div></div></div>}
    {screen === 'match' && <div className="match-screen">
      <div className="match-topbar"><div><span className="status-dot" /><strong>{ARENAS[(snapshot?.config ?? activeConfig).arena].name[settings.language]}</strong><span>{(snapshot?.config ?? activeConfig).practice ? t.practice : (snapshot?.config ?? activeConfig).mode === 'teams' ? t.teams : t.ffa}</span></div><div className="match-clock">{snapshot?.config.practice ? '∞' : snapshot?.config.timeLimit ? formatClock(snapshot.config.timeLimit - snapshot.elapsed) : '∞'}</div><button className="small-button" data-ui-sound="silent" onClick={pause}>Ⅱ {t.pause}</button></div>
      <div className="match-stage"><GameView arena={activeConfig.arena} snapshot={snapshot} snapshotRef={runtime.snapshotRef} settings={settings} manifest={manifest} onReady={() => setRenderReady(true)} />{snapshot?.phase === 'countdown' && renderReady && <div className="countdown-overlay"><span>{Math.ceil(snapshot.countdown) || t.countdownFight}</span><p>{t.countdownReady}</p></div>}{!snapshot && <div className="countdown-overlay">{runtime.error ? <section className="match-error"><h2>{t.interrupted}</h2><p role="alert">{runtime.error}</p><button className="primary-button" onClick={() => window.location.reload()}>{t.reload}</button><button className="secondary-button" onClick={leaveMatch}>{t.lobby}</button></section> : <><span>…</span><p>{t.assetsLoading}</p></>}</div>}</div>
      {snapshot && <HUD snapshot={snapshot} settings={settings} manifest={manifest} />}
      {snapshot?.phase === 'paused' && <div className="modal-shade"><section className="pause-panel">{runtime.disconnected && <span className="eyebrow">{t.disconnected}</span>}<h1>{t.pause}</h1>{pauseNotice && <p>{pauseNotice}</p>}<button data-ui-sound="silent" data-autofocus className="primary-button" disabled={source === 'online' && (!online?.state.isHost || online.state.members.some(member => !member.connected)) || runtime.disconnected && !snapshot.config.players.filter(player => player.kind === 'human' && (source !== 'online' || player.peerId === online?.state.peerId) && player.device.startsWith('gamepad:')).every(player => navigator.getGamepads?.()[Number(player.device.split(':')[1])]?.connected)} onClick={resume}>{t.resume}<span>▶</span></button>{source === 'practice' && <button className="secondary-button" onClick={start}>{t.reset} ↻</button>}<button className="secondary-button" onClick={() => open('settings')}>{t.settings}</button><button className="text-button" data-ui-sound="back" onClick={leaveMatch}>{t.lobby}</button></section></div>}
    </div>}
    {screen === 'results' && displaySnapshot && <Results snapshot={displaySnapshot} settings={settings} manifest={manifest} rematch={() => source === 'online' ? leaveMatch() : start()} primaryLabel={source === 'online' ? !online?.state.isHost && online?.state.status !== 'lobby' ? t.waitingHost : t.lobby : t.rematch} waitingForHost={source === 'online' && !online?.state.isHost && online?.state.status !== 'lobby'} leave={source === 'online' ? leaveRoom : leaveMatch} leaveLabel={source === 'online' ? t.leaveRoom : t.lobby} />}
   </main>
   {!isMatch && screen !== 'intro' && <footer className="app-footer"><span className="footer-mark">STF</span><span>{menuInput === 'gamepad' ? t.gamepadHelp : t.menuHelp}</span>{runtime.controllers.controllers.length > 0 && <span className="controller-connected">✚ {runtime.controllers.controllers[0].label}</span>}<button onClick={() => open('guide')}>{t.guide} <span>?</span></button></footer>}
   {(assetError || online?.state.error && source === 'online' && screen !== 'online') && <div className="global-error" role="alert">{assetError || online?.state.error}</div>}
 </div>;
}
function Results({ snapshot, settings, manifest, rematch, primaryLabel, leave, leaveLabel, waitingForHost }: { snapshot: MatchSnapshot; settings: AppSettings; manifest: AssetsManifest | null; rematch: () => void; primaryLabel: string; waitingForHost: boolean; leave: () => void; leaveLabel: string }) {
 const t = ui[settings.language], result = snapshot.result;
 const winners = snapshot.config.players.filter(p => result?.winners.includes(p.id));
 const draw = result?.reason === 'draw', interrupted = result?.reason === 'interrupted';
 return <div className="results-screen"><span className="eyebrow">{interrupted ? t.noWinner : result?.reason === 'timeout' ? t.timeout : t.lastStanding}</span><h1>{interrupted ? t.interrupted : draw ? t.draw : t.winner}</h1><div className="result-fighters">{(winners.length ? winners : snapshot.config.players).map(seat => <div key={seat.id} style={{ '--fighter-color': disciplineInfo[seat.discipline].color } as React.CSSProperties}>{!draw && !interrupted && <span className="winner-ribbon" aria-hidden="true">1</span>}<Avatar manifest={manifest} appearance={seat.appearance} discipline={seat.discipline} animated={!settings.reducedMotion} /><h2>{seat.name}</h2><span>{names[seat.discipline][settings.language]}</span></div>)}</div><div className="results-actions"><button data-autofocus disabled={waitingForHost} className="primary-button" onClick={rematch}>{primaryLabel}<span>↻</span></button><button className="secondary-button" onClick={leave}>{leaveLabel}<span>←</span></button></div><div className="result-scoreboard">{snapshot.config.players.map(seat => { const f = snapshot.fighters.find(fighter => fighter.id === seat.id); return <div key={seat.id}><strong>{seat.name}</strong><span>{formatLives(f?.lives ?? 0, settings.language)}</span><span>{Math.round(f?.damage ?? 0)}%</span>{result?.winners.includes(seat.id) && <b>1</b>}</div>; })}</div></div>;
}
