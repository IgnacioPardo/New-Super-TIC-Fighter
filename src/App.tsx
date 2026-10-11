import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { AppSettings, AssetsManifest, MatchConfig, MatchSnapshot } from './shared/types';
import { GameView } from './game/GameView';
import { Avatar } from './ui/Avatar';
import { Setup } from './ui/Setup';
import { Settings } from './ui/Settings';
import { Guide } from './ui/Guide';
import { TrainingControls } from './ui/TrainingControls';
import { HUD, formatClock } from './ui/HUD';
import { useGameRuntime } from './ui/useGameRuntime';
import type { MenuCommand, MenuIdentity } from './input';
import { useNavigation } from './ui/useNavigation';
import type { OnlineBridge } from './ui/contracts';
import { defaultSeat, loadConfig, loadSettings } from './ui/preferences';
import { disciplineInfo, formatLives, names, pauseMessage, ui } from './ui/i18n';
import { ARENAS } from './shared/content';
import { Icon } from './ui/Icon';
import { menuTargets, MenuDialog, MenuTabs } from './ui/MenuControls';
import { Intro } from './ui/Intro';
import { useUiFeedback } from './ui/useUiFeedback';
import { PublicLobby } from './features/online/PublicLobby';
import { usePublicOnline } from './features/online/usePublicOnline';
import { Tournaments } from './features/competition/Tournaments';
import { Profile } from './features/profile/Profile';
import { SoloMenu, SoloStatus } from './features/solo/SoloMenu';
import { startSolo, observeSolo, advanceArcade, type SoloRequest, type SoloRun } from './features/solo/solo';
import { useMatchSet } from './ui/useMatchSet';
import { SetScore } from './ui/SetScore';
import { ContentTabs, PagedContent, usePageSize } from './ui/ContentPages';
import './ui/MatchEntryResults.css';
import { COSMETICS, loadProgress, saveProgress } from './features/profile/progress';

function withProfileCosmetic(config: MatchConfig): MatchConfig {
 const cosmetic=COSMETICS.find(item=>item.id===localStorage.getItem('stf-cosmetic'))?.id ?? 'original';
 const first=config.players.find(player=>player.kind==='human');
 return {...config,players:config.players.map(player=>player.id===first?.id?{...player,appearance:{...player.appearance,cosmetic}}:player)};
}

type Screen = 'intro' | 'title' | 'setup' | 'online' | 'online-hub' | 'room' | 'match' | 'results' | 'settings' | 'guide' | 'solo' | 'profile' | 'public' | 'tournaments';
export interface AppProps { online?: OnlineBridge }
export default function App({ online: privateOnline }: AppProps) {
 const [settings, setSettings] = useState<AppSettings>(loadSettings);
 const [config, setConfig] = useState<MatchConfig>(()=>withProfileCosmetic(loadConfig()));
 const root = useRef<HTMLDivElement>(null);
 const navigation = useNavigation<Screen>(() => new URLSearchParams(window.location.search).get('screen') === 'profile' ? 'profile' : new URLSearchParams(window.location.search).get('room') ? 'title' : 'intro', root);
 const { screen, replace: setScreen } = navigation;
 const [returnScreen, setReturnScreen] = useState<Screen>('title');
 const [source, setSource] = useState<'local' | 'online' | 'practice' | 'solo' | 'public' | 'public-edit'>(() => new URLSearchParams(window.location.search).has('tournament') ? 'public' : 'local');
 const publicNetwork = usePublicOnline();
 const online = source === 'public' ? publicNetwork.bridge : privateOnline;
 const isRemote = source === 'online' || source === 'public';
 const [soloRun,setSoloRun] = useState<SoloRun|null>(null);
 const beforeSolo = useRef<MatchConfig|null>(null);
 const recordedMatches = useRef(new Set<string>());
 const [ready, setReady] = useState<Record<string, boolean>>({});
 const [manifest, setManifest] = useState<AssetsManifest | null>(null);
 const [assetError, setAssetError] = useState('');
 const [name, setName] = useState(() => localStorage.getItem('stf-name') ?? '');
 const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('room') ?? '');
 const [onlineError, setOnlineError] = useState('');
 const [privateEntryMode,setPrivateEntryMode] = useState<'create'|'join'>(() => new URLSearchParams(window.location.search).has('room') ? 'join' : 'create');
 const [pending, setPending] = useState(false);
 const [copied, setCopied] = useState(false);
 const [menuInput, setMenuInput] = useState<'keyboard' | 'gamepad'>('keyboard');
 const [renderReady, setRenderReady] = useState(false);
 const [selectedMode, setSelectedMode] = useState<'local' | 'solo' | 'online-hub'>('local');
 const menuHandler = useRef<(command: MenuCommand, source: 'keyboard' | 'gamepad', identity: MenuIdentity) => void>(() => {});
 const lastSnapshot = useRef<MatchSnapshot | null>(null);
 const t = ui[settings.language];
 const runtime = useGameRuntime(settings, manifest, (command, source, identity) => menuHandler.current(command, source, identity), online, isRemote && !!online?.state.snapshot, screen === 'match');
 const snapshot = runtime.snapshot;
 const matchSet = useMatchSet(snapshot, source === 'local' || source === 'online');
 useEffect(() => {if(source==='solo' && snapshot) setSoloRun(previous => previous ? observeSolo(previous,snapshot) : null);},[snapshot,source]);
 useEffect(() => {if(source==='solo' && soloRun?.completed && snapshot?.phase==='playing') runtime.command({type:'pause'});},[soloRun?.completed,snapshot?.phase,source]);
 useEffect(() => {if(!snapshot?.result || isRemote || recordedMatches.current.has(snapshot.matchId)) return;recordedMatches.current.add(snapshot.matchId);for(const seat of snapshot.config.players.filter(player=>player.kind==='human')) {const profileId=seat.id===snapshot.config.players.find(player=>player.kind==='human')?.id ? localStorage.getItem('stf-active-profile')??'guest' : `couch:${seat.id}`;const progress=loadProgress(profileId);progress.matches++;if(snapshot.result.winners.includes(seat.id)) progress.wins++;saveProgress(progress,profileId);}},[snapshot?.matchId,snapshot?.phase,snapshot?.result,source]);
 useEffect(() => {if(source==='online' && snapshot && !matchSet.state && snapshot.phase!=='finished') matchSet.startSet(snapshot.config);},[source,snapshot?.matchId,matchSet.state]);
 const enterTitle = useCallback((fromGamepad = false) => { setMenuInput(fromGamepad ? 'gamepad' : 'keyboard'); void runtime.unlock(); setScreen(new URLSearchParams(window.location.search).has('tournament') ? 'tournaments' : 'title'); }, [runtime.unlock]);
 useUiFeedback(root, runtime.uiSound);
 useEffect(() => { const release = (event: Event) => runtime.releaseMenu((event as CustomEvent<string>).detail || undefined); window.addEventListener('menu-transition', release); return () => window.removeEventListener('menu-transition', release); }, [runtime.releaseMenu]);
 const previousPhase = useRef(snapshot?.phase);
 useEffect(() => { if (screen === 'results') runtime.uiSound(snapshot?.result?.reason === 'interrupted' ? 'error' : 'ready'); }, [screen, runtime.uiSound]);
 const reportedError = assetError || onlineError || runtime.error || (isRemote ? online?.state.error : '');
 useEffect(() => { if (reportedError) runtime.uiSound('error'); }, [reportedError, runtime.uiSound]);
 const pendingController = useRef<string | undefined>(undefined);
 useEffect(() => {
   if (snapshot?.phase === 'paused' && previousPhase.current !== 'paused') runtime.uiSound('pause');
   if (previousPhase.current === 'paused' && snapshot?.phase === 'countdown') runtime.uiSound('resume');
   previousPhase.current = snapshot?.phase;
 }, [snapshot?.phase, runtime.uiSound]);
 const activeConfig = isRemote ? online?.state.config ?? config : config;
 const configRevision = useRef(JSON.stringify(activeConfig));
 useEffect(() => {const signature=JSON.stringify(activeConfig);if(signature!==configRevision.current) {configRevision.current=signature;setReady({});}},[activeConfig]);
 if (snapshot) lastSnapshot.current = snapshot;
 useEffect(() => {
   let active = true;
   fetch('/assets/manifest.json').then(response => { if (!response.ok) throw new Error('assets'); return response.json(); }).then((assets: AssetsManifest) => { if (active) setManifest(assets); }).catch(() => { if (active) setAssetError(settings.language === 'es' ? 'No se pudieron cargar los recursos. Recarga la página.' : 'Game assets could not load. Reload this page.'); });
   return () => { active = false; };
 }, []);
 useEffect(() => { localStorage.setItem('stf-settings', JSON.stringify(settings)); document.documentElement.lang = settings.language; document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full'; }, [settings]);
 useEffect(() => { if (!config.practice && source !== 'solo') localStorage.setItem('stf-match', JSON.stringify(config)); }, [config]);
 useEffect(() => { localStorage.setItem('stf-name', name); }, [name]);
 useEffect(() => {const refresh=()=>setConfig(previous=>withProfileCosmetic(previous));window.addEventListener('stf-profile',refresh);return()=>window.removeEventListener('stf-profile',refresh);},[]);
 const appliedPrivateCosmetic=useRef('');
 useEffect(() => {
  if(source!=='online'||screen!=='room'||!online?.state.config) return;
  const seat=online.state.config.players.find(player=>player.kind==='human'&&player.peerId===online.state.peerId);
  const cosmetic=COSMETICS.find(item=>item.id===localStorage.getItem('stf-cosmetic'))?.id??'original';
  const key=`${online.state.code}:${seat?.id}:${cosmetic}`;
  if(seat&&seat.appearance.cosmetic!==cosmetic&&appliedPrivateCosmetic.current!==key) {appliedPrivateCosmetic.current=key;online.updateSeat({...seat,appearance:{...seat.appearance,cosmetic}});}
 },[source,screen,online?.state.code,online?.state.peerId,online?.state.config,config]);
 useEffect(() => {
   if (source === 'online' && online?.state.status === 'idle' && ['room', 'match', 'results'].includes(screen)) { setSource('local'); setScreen('title'); }
   if (source === 'online' && online?.state.status === 'lobby' && screen === 'match' && !online.state.snapshot) { runtime.stop(); setScreen('room'); }
   if (online?.state.code && source === 'online' && ['lobby','playing'].includes(online.state.status) && ['online', 'title'].includes(screen)) setScreen('room');
   if (source === 'online' && online?.state.snapshot && screen === 'room') { setRenderReady(false); setScreen(online.state.snapshot.phase === 'finished' ? 'results' : 'match'); }
 }, [online?.state.status, online?.state.code, online?.state.snapshot, source, screen]);
 useEffect(() => {
  if (source !== 'public') return;
  if (publicNetwork.match?.phase === 'waiting' && !['results','settings','guide'].includes(screen)) {setReady({});setScreen('room');}
  if (publicNetwork.match?.phase === 'running' && ['public','tournaments','room'].includes(screen)) {setRenderReady(false);setScreen('match');}
 }, [source,publicNetwork.match?.matchId,publicNetwork.match?.phase,screen]);
 useEffect(() => { if (source !== 'solo' && source !== 'public-edit' && (source !== 'public' || publicNetwork.match?.phase !== 'waiting') && snapshot?.phase === 'finished' && (screen === 'match' || (['settings', 'guide'].includes(screen) && navigation.contains('match')))) setScreen('results'); }, [snapshot?.phase, screen, returnScreen, source]);
 useLayoutEffect(() => {
   if (screen !== 'match' || snapshot?.phase === 'paused') {
     if (root.current?.hasAttribute('data-navigation-restored')) { root.current.removeAttribute('data-navigation-restored'); return; }
     (root.current?.querySelector<HTMLElement>('[data-autofocus]:not(:disabled)') ?? root.current?.querySelector<HTMLElement>('main button:not(:disabled), main input:not(:disabled), .pause-panel button:not(:disabled)'))?.focus({ preventScroll: true });
   }
 }, [screen, snapshot?.phase]);
 const changeConfig = (next: MatchConfig) => { setConfig(next); setReady({}); };
 const enterLocal = (practice = false) => {
   const controller = runtime.preferredController();
   setSoloRun(null);matchSet.clearSet();setSource(practice ? 'practice' : 'local'); setReady({}); setRenderReady(false); lastSnapshot.current = null;
   setConfig(previous => {
     const next = practice ? { ...previous, practice: true, gameMode: 'training' as const, mode: 'ffa' as const, timeLimit: 0, players: [defaultSeat(0, false, settings.language), defaultSeat(1, true, settings.language)] } : { ...previous, practice: false, timeLimit: previous.timeLimit || 300 };
     const first = next.players.find(player => player.kind === 'human');
     return withProfileCosmetic(controller && first && !next.players.some(player => player.device === controller) ? { ...next, players: next.players.map(player => player.id === first.id ? { ...player, device: controller } : player) } : next);
   });
   navigation.navigate('setup');
 };
 const leaveSolo = () => {runtime.stop();setSoloRun(null);if(beforeSolo.current) setConfig(beforeSolo.current);setSource('local');navigation.reset('solo');};
 const chooseSolo = (request:SoloRequest) => {beforeSolo.current=structuredClone(config);const run=startSolo(request,withProfileCosmetic(config));const controller=runtime.preferredController();if(controller) run.config.players=run.config.players.map(player=>player.id===run.playerId?{...player,device:controller}:player);setSoloRun(run);setSource('solo');setConfig(run.config);setReady({});setRenderReady(false);navigation.navigate('setup');};
 const launchSolo = (run:SoloRun) => {setSoloRun(run);setConfig(run.config);setRenderReady(false);void runtime.start(run.config);setScreen('match');};
 const nextSolo = () => {if(soloRun) launchSolo(advanceArcade(soloRun));};
 const retrySolo = () => {if(soloRun) launchSolo(startSolo(soloRun.request,soloRun.config,soloRun.round));};
 const publicHome = useRef<Screen>(new URLSearchParams(window.location.search).has('tournament')?'tournaments':'public');
 const enterPublic = (page: 'public' | 'tournaments') => {const next=withProfileCosmetic(config),controller=runtime.preferredController(),first=next.players.find(player=>player.kind==='human');setConfig(controller&&first&&!next.players.some(player=>player.device===controller)?{...next,players:next.players.map(player=>player.id===first.id?{...player,device:controller}:player)}:next);runtime.stop();setSoloRun(null);matchSet.clearSet();setSource('public');setReady({});publicHome.current=page;navigation.navigate(page);};
 const editPublicFighters = () => {setSource('public-edit');setReady({});navigation.navigate('setup');};
 const leavePublicMatch = () => {publicNetwork.leaveMatch();runtime.stop();setReady({});setSource('public');setScreen(publicHome.current);};
 const continuePublic = () => {if(publicNetwork.match?.phase==='waiting') {runtime.stop();setReady({});setScreen('room');} else leavePublicMatch();};
 const leaveMatch = () => { if(source==='public') {leavePublicMatch();return;} if(source === 'solo') {leaveSolo();return;} if(source!=='online'||matchSet.state?.complete) matchSet.clearSet();runtime.stop(); if (source === 'online') { online?.rematch(); setScreen('room'); } else setScreen('setup'); };
 const leaveRoom = () => { if(source==='public') {leavePublicMatch();return;} online?.leave(); runtime.stop(); setSource('local'); navigation.reset('title'); };
 const back = useCallback(() => {
   if (screen === 'setup' && source === 'public-edit') {publicNetwork.updateSeats(config.players);setSource('public');navigation.pop(publicHome.current);return;}
   if ((screen === 'public' || screen === 'tournaments') && source === 'public') {publicNetwork.disconnect();setSource('local');navigation.pop('title');return;}
   if (screen === 'match' && source === 'solo' && (soloRun?.completed || soloRun?.failed)) {leaveSolo();return;}
   if (screen === 'setup' && source === 'solo') {leaveSolo();return;}
   if (screen === 'match') {
     if (snapshot?.phase === 'paused') { if (!runtime.reclaim()) return; if (isRemote) { if (source === 'public' || online?.state.isHost && !online.state.members.some(member => !member.connected)) online?.resume(); } else runtime.command({ type: 'resume' }); } else { if (isRemote) online?.pause(); else runtime.command({ type: 'pause' }); }
   } else if (screen === 'settings' || screen === 'guide') navigation.pop(returnScreen);
   else if (screen === 'title') navigation.reset('intro');
   else if (screen === 'room') leaveRoom();
   else if (screen === 'results') { if (source === 'online' && !online?.state.isHost && online?.state.status !== 'lobby') leaveRoom(); else leaveMatch(); }
   else navigation.pop('title');
 }, [screen, returnScreen, source, online, runtime.command, snapshot?.phase, runtime.disconnected, runtime.reclaim, soloRun?.completed, soloRun?.failed]);
 menuHandler.current = (command, inputSource, identity) => {
   setMenuInput(inputSource);
   if (inputSource === 'gamepad') root.current?.setAttribute('data-input', 'gamepad');
   if (command === 'pause' && screen !== 'match') return;
   if (screen === 'intro') { if (command === 'confirm') enterTitle(inputSource === 'gamepad'); return; }
   const focused = document.activeElement as HTMLElement;
   // Local-seat controllers navigate their own inline editor, without moving browser focus.
   const seatScope = root.current?.querySelector<HTMLElement>('[data-seat-navigation]');
   if (inputSource === 'gamepad' && seatScope) {
     let handled = false;
     flushSync(() => { handled = !seatScope.dispatchEvent(new CustomEvent('seat-menu-input', {detail:{command,source:inputSource,identity},bubbles:false,cancelable:true})); });
     if (handled) return;
   }
   if (focused?.matches('input:not([type=range]):not([type=checkbox]), textarea') && command === 'back') {
     const scope = focused.closest('[data-menu-dialog], [data-seat-id]') ?? root.current;
     (scope ? menuTargets(scope).find(target => target !== focused && target.tagName === 'BUTTON') : undefined)?.focus(); return;
   }
   const dialog = root.current?.querySelector<HTMLElement>('[data-menu-dialog]');
   const commandTarget = dialog && !dialog.contains(focused) ? dialog : focused;
   // Native keyboard/gamepad events can arrive before React's next render.
   // Commit each adjustment before calculating the following one.
   let handled = false;
   flushSync(() => { handled = !!commandTarget && !commandTarget.dispatchEvent(new CustomEvent('menu-command', { detail: command, bubbles: true, cancelable: true })); });
   if (handled) {
     if (command === 'back' || command === 'pause') runtime.uiSound('back');
     else if ((command === 'left' || command === 'right') && focused.closest('.choice-row, [role=tablist]')) runtime.uiSound(focused.closest('[role=tablist]') ? 'navigate' : 'change');
     return;
   }
   if (command === 'back' || command === 'pause') { if (screen !== 'match') runtime.uiSound('back'); back(); return; }
   const container = root.current?.querySelector('[data-menu-dialog]') ?? root.current?.querySelector('.pause-panel') ?? focused.closest('.inline-fighter-editor') ?? root.current;
   if (!container) return;
   const options = menuTargets(container);
   const focusItem = (item: HTMLElement) => { if (item === document.activeElement) return; item.focus({ preventScroll: true }); item.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); runtime.uiSound('navigate'); };
   if (!options.length) return;
   if (command === 'confirm') { if (focused?.tagName === 'BUTTON' || focused?.tagName === 'A' || focused?.tagName === 'SUMMARY' || focused?.matches('input[type="checkbox"]')) focused.click(); else if (focused?.matches('input:not([type=range]), textarea')) focusItem(options[Math.min(options.length - 1, options.indexOf(focused) + 1)]); else if (!options.includes(focused)) focusItem(options[0]); return; }
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
   if (container.hasAttribute('data-menu-linear') || focused.closest('[data-menu-linear]')) {
     if (command === 'up' || command === 'down') focusItem(options[Math.max(0, Math.min(options.length - 1, index + direction))]);
     return;
   }
   const horizontal = command === 'left' || command === 'right', origin = focused.getBoundingClientRect();
   const ox = origin.x + origin.width / 2, oy = origin.y + origin.height / 2;
   const candidates = options.filter(item => item !== focused).map(item => {
     const rect = item.getBoundingClientRect(), dx = rect.x + rect.width / 2 - ox, dy = rect.y + rect.height / 2 - oy;
     const along = horizontal ? dx : dy, across = horizontal ? dy : dx;
     return { item, along, score: Math.abs(along) + Math.abs(across) * 3 };
   }).filter(item => item.along * direction > 5).sort((a, b) => a.score - b.score);
   if (candidates[0]) focusItem(candidates[0].item);
 };
 useEffect(() => { const connected = () => setMenuInput('gamepad'); const key = () => setMenuInput('keyboard'); window.addEventListener('gamepadconnected', connected); window.addEventListener('keydown', key); return () => { window.removeEventListener('gamepadconnected', connected); window.removeEventListener('keydown', key); }; }, []);
 const start = () => { runtime.uiSound('start'); setRenderReady(false); if (source === 'online') {if(!matchSet.state || matchSet.state.complete) matchSet.startSet(activeConfig);online?.start();} else { if(source==='solo' && soloRun) {setSoloRun({...soloRun,config:structuredClone(config)});} else if(source!=='practice') matchSet.startSet(config);void runtime.start({ ...config, seed: Date.now() >>> 0 }); setScreen('match'); } };
 const nextBout = () => {const next=matchSet.nextConfig();if(next) {setRenderReady(false);void runtime.start(next);setScreen('match');}else start();};
 const pause = () => isRemote ? online?.pause() : runtime.command({ type: 'pause' });
 const resume = () => { if (!runtime.reclaim()) return; if (isRemote) { if (source !== 'public' && (!online?.state.isHost || online.state.members.some(member => !member.connected))) return; online?.resume(); } else runtime.command({ type: 'resume' }); };
 const open = (page: 'settings' | 'guide') => { if (page === screen) return; setReturnScreen(screen); if (screen === 'match') pause(); navigation.navigate(page); };
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
 const pauseNotice = runtime.disconnected ? t.reclaim : source === 'public' ? settings.language==='es' ? 'El combate sigue para los demás mientras abres el menú.' : 'The match continues for everyone else while your menu is open.' : source === 'online'
   ? online?.state.members.some(member => !member.connected) ? t.reconnecting
     : pauseMessage(online?.state.pauseReason, settings.language) || (!online?.state.isHost ? t.waitingHost : '')
   : '';
 return <div className={`app ${isMatch ? 'app-match' : screen === 'intro' || screen === 'settings' ? '' : 'game-menu'} screen-${screen}`} ref={root} data-menu-input={menuInput} data-input={menuInput} onClickCapture={event => {
   // WebKit does not focus pointer-clicked buttons; preserve the menu's focus origin.
   const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button:not(:disabled)');
   if (!target?.hasAttribute('data-virtual-activate')) target?.focus({ preventScroll: true });
 }} onPointerDown={() => { if (!runtime.soundUnlocked) void runtime.unlock(); }}>
   <div className="site-atmosphere" aria-hidden="true" style={{ backgroundImage: manifest ? `url("${manifest.backgrounds.classic}")` : undefined }} />
   {screen !== 'intro' && <header className="app-header">
     <button className="brand-button" aria-label="New Super TIC Fighter" onClick={() => { if (isMatch) pause(); else {if(source==='public'||source==='public-edit'){publicNetwork.disconnect();setSource('local');}navigation.reset('title');} }}><picture><source media="(max-width: 760px)" srcSet="/assets/branding/overdrive-icon.svg" /><img src="/assets/branding/overdrive-horizontal.svg" alt="" width="918" height="138" /></picture></button>
     <div className="header-actions">
       {!runtime.soundUnlocked && <button className="sound-unlock" title={t.soundHint} onClick={() => void runtime.unlock()}>♪ <span>{t.soundLocked}</span></button>}
       <button className="icon-button" aria-label={t.fullscreen} title={t.fullscreen} onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()}><Icon name="fullscreen" /></button>
       <button className="language-button" aria-label={t.language} onClick={() => setSettings({ ...settings, language: settings.language === 'es' ? 'en' : 'es' })}>{settings.language.toUpperCase()}</button>
       {screen === 'title' && <button className="profile-shortcut" data-testid="mode-profile" onClick={() => navigation.navigate('profile')}>{settings.language === 'es' ? 'PERFIL' : 'PROFILE'}</button>}
       {screen !== 'settings' && <button data-testid="mode-settings" className="icon-button" title={t.settings} aria-label={t.settings} onClick={() => open('settings')}><Icon name="settings" /></button>}
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
       <nav className="arcade-menu" aria-label={t.titlePrompt}>{(['local','solo','online-hub'] as const).map(mode => <button key={mode} data-selected={mode === selectedMode} data-testid={`mode-${mode}`} data-autofocus={mode === selectedMode ? true : undefined} onFocus={() => setSelectedMode(mode)} onClick={() => mode === 'local' ? enterLocal() : navigation.navigate(mode)}><span className="menu-pointer" aria-hidden="true" /><strong>{mode === 'local' ? settings.language === 'es' ? 'JUGAR' : 'PLAY' : mode === 'solo' ? 'SOLO' : 'ONLINE'}</strong><span className="title-choice-arrow" aria-hidden="true">›</span></button>)}</nav>
       <p className="mode-hint">{selectedMode === 'local' ? settings.language === 'es' ? 'Combate local · amigos y bots' : 'Local battles · friends and bots' : selectedMode === 'solo' ? settings.language === 'es' ? 'Arcade, desafíos y entrenamiento' : 'Arcade, challenges and training' : settings.language === 'es' ? 'Buscar partida, salas y torneos' : 'Quick play, rooms and tournaments'}</p>
      </section>
    </div>}
    {['setup','room','settings','guide','online','online-hub','solo','profile','public','tournaments'].includes(screen) && <div className="page-heading"><button className="back-button" data-ui-sound="back" onClick={back}>← {t.back}</button><div><span className="screen-context">{screen === 'setup' ? source === 'practice' ? t.practice : source === 'solo' ? `SOLO / ${soloRun?.request.kind.toUpperCase()}` : t.local : screen === 'room' ? source==='public' ? settings.language==='es'?'COMBATE PÚBLICO':'PUBLIC MATCH' : `${t.online} / ${t.room} ${online?.state.code ?? ''}` : ''}</span><h1>{screen === 'setup' || screen === 'room' ? t.setup : screen === 'settings' ? t.settings : screen === 'guide' ? t.guide : screen === 'public' ? settings.language==='es'?'ONLINE PÚBLICO':'PUBLIC ONLINE' : screen === 'tournaments' ? settings.language==='es'?'TORNEOS':'TOURNAMENTS' : screen === 'solo' ? 'SOLO' : screen === 'profile' ? settings.language === 'es' ? 'PERFIL' : 'PROFILE' : screen === 'online-hub' ? 'ONLINE' : t.onlineTitle}</h1></div></div>}
    {(screen === 'setup' || screen === 'room' || ['settings','guide'].includes(screen) && (navigation.contains('setup') || navigation.contains('room'))) && <div hidden={screen !== 'setup' && screen !== 'room'}>
      {screen === 'room' && online && source==='public' && <div className="room-bar"><strong>{settings.language==='es'?'Combate público':'Public match'}</strong><div className="room-quality"><span className={`status-dot ${online.state.status==='reconnecting'?'warning':''}`} /><span>{online.state.status==='reconnecting'?t.reconnecting:settings.language==='es'?'Servidor':'Server'}{online.state.ping!==undefined?` · ${Math.round(online.state.ping)} ms`:''}</span></div><div className="room-members">{online.state.members.map(member=><span key={member.id} className={member.ready?'member-ready':''}>{member.ready?'✓':'•'} {member.name}</span>)}</div></div>}
      {screen === 'room' && online && source!=='public' && <div className="room-bar"><div className="room-code"><span>{t.room}</span><strong>{online.state.code}</strong><button className="small-button" onClick={() => void copyInvite()}>{copied ? t.copied : t.copy}</button></div><div className="room-quality"><span className={`status-dot ${online.state.status === 'reconnecting' ? 'warning' : ''}`} /><span>{online.state.status === 'reconnecting' ? t.reconnecting : online.state.route === 'direct' ? t.direct : online.state.route === 'relay' ? t.relay : t.connecting}{online.state.ping !== undefined ? ` · ${Math.round(online.state.ping)} ms${online.state.ping > 180 ? ` · ${t.slowConnection}` : ''}` : ''}</span>{online.forceRelay && <label><input type="checkbox" onChange={e => online.forceRelay?.(e.target.checked)} />{t.forceRelay}</label>}</div><div className="room-members">{online.state.members.map(member => <span key={member.id} className={member.ready ? 'member-ready' : ''}>{member.ready ? '✓' : '•'} {member.name}{member.id === online.state.peerId ? ` (${online.state.isHost ? t.host : t.guest})` : ''}</span>)}</div></div>}
      <Setup config={activeConfig} setConfig={changeConfig} settings={settings} manifest={manifest} devices={runtime.devices} ready={ready} toggleReady={id => setReady(previous => ({ ...previous, [id]: !previous[id] }))} start={start} online={isRemote ? online : undefined} readOnly={source==='public'} editorOnly={source==='public-edit'} lockRules={source==='solo' && soloRun?.request.kind!=='training' || source==='public-edit'} lockRoster={source==='solo'} lockDiscipline={source==='solo' && soloRun?.request.kind==='challenge'} practice={source === 'practice' || soloRun?.request.kind === 'training'} invalidateReady={() => setReady({})} feedback={runtime.uiSound} />
    </div>}
    {screen === 'online-hub' && <nav className="online-mode-menu" aria-label="Online">
      <button className="online-mode" data-testid="mode-public" data-autofocus onClick={() => enterPublic('public')}><span className="menu-pointer" aria-hidden="true" /><span><strong>{settings.language === 'es' ? 'BUSCAR PARTIDA' : 'QUICK PLAY'}</strong><small>{settings.language === 'es' ? 'Jugadores online · servidores públicos' : 'Online players · public servers'}</small></span></button>
      <button className="online-mode" data-testid="mode-online" onClick={() => {setSource('online');navigation.navigate('online');}}><span className="menu-pointer" aria-hidden="true" /><span><strong>{settings.language === 'es' ? 'SALA PRIVADA' : 'PRIVATE ROOM'}</strong><small>{settings.language === 'es' ? 'Crea una sala o únete con un código' : 'Create a room or join with a code'}</small></span></button>
      <button className="online-mode" data-testid="mode-tournaments" onClick={() => enterPublic('tournaments')}><span className="menu-pointer" aria-hidden="true" /><span><strong>{settings.language === 'es' ? 'TORNEOS' : 'TOURNAMENTS'}</strong><small>{settings.language === 'es' ? 'Eliminación y ligas · duelos y equipos' : 'Brackets and leagues · duels and teams'}</small></span></button>
    </nav>}
    {screen === 'public' && <PublicLobby language={settings.language} network={publicNetwork} config={config} editFighters={editPublicFighters} />}
    {screen === 'tournaments' && <Tournaments language={settings.language} network={publicNetwork} config={config} />}
    {screen === 'solo' && <SoloMenu language={settings.language} select={chooseSolo} />}
    {screen === 'profile' && <Profile language={settings.language} manifest={manifest} fighter={config.players.find(player=>player.kind==='human') ?? config.players[0]} reducedMotion={settings.reducedMotion} />}
    {screen === 'room' && matchSet.state && <SetScore state={matchSet.state} language={settings.language} />}
    {screen === 'settings' && <Settings settings={settings} manifest={manifest} change={setSettings} feedback={runtime.uiSound} controllers={runtime.controllers} />}
    {screen === 'guide' && <Guide settings={settings} manifest={manifest} />}
    {screen === 'online' && <div className="online-entry">
      <div className="online-art"><div className="online-fighters"><Avatar manifest={manifest} discipline="networks" appearance={{hair:0,shirt:0,pants:0}} animated={!settings.reducedMotion} /><Avatar manifest={manifest} discipline="code" appearance={{hair:2,shirt:2,pants:2}} animated={!settings.reducedMotion} /></div><h2>{settings.language==='es'?'CON AMIGOS':'WITH FRIENDS'}</h2><p>{t.onlineDescription}</p></div>
      <div className="online-form"><MenuTabs label={t.onlineTitle} value={privateEntryMode} options={[{value:'create',label:t.create},{value:'join',label:t.join}]} change={setPrivateEntryMode}/>
       <label className="field-label"><span>{t.yourName}</span><input value={name} onChange={e => setName(e.target.value)} maxLength={18} placeholder={t.player} autoComplete="nickname" /><small>{t.keyboardText}</small></label>
       {privateEntryMode==='create'?<button className="primary-button" disabled={pending || !name.trim() || !manifest} onClick={() => void connect(true)}>{pending ? t.connecting : t.create}<span>↗</span></button>:<><label className="field-label"><span>{t.code}</span><input className="code-input" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={12} placeholder="ABCD234567" autoComplete="off" /></label><button className="secondary-button" disabled={pending || !name.trim() || !code.trim() || !manifest} onClick={() => void connect(false)}>{t.join}<span>→</span></button></>}
       {(onlineError || online?.state.error) && <div className="inline-error" role="alert"><p>{onlineError || online?.state.error}</p>{/reload|version/i.test(onlineError || online?.state.error || '') && <button className="small-button" onClick={()=>window.location.reload()}>{t.reload}</button>}</div>}
       <div className="online-explain"><p>{t.onlineNote}</p></div>
      </div>
    </div>}
    {screen === 'match' && <div className="match-screen">
      <div className="match-topbar"><div><span className="status-dot" /><strong>{ARENAS[(snapshot?.config ?? activeConfig).arena].name[settings.language]}</strong><span>{(snapshot?.config ?? activeConfig).practice ? t.practice : t[(snapshot?.config ?? activeConfig).gameMode ?? 'stock']}</span></div><div className="match-clock">{snapshot?.config.practice ? '∞' : snapshot?.config.timeLimit ? formatClock(snapshot.config.timeLimit - snapshot.elapsed) : '∞'}</div><button className="small-button" data-ui-sound="silent" onClick={pause}>Ⅱ {t.pause}</button></div>
      <div className="match-stage"><GameView arena={activeConfig.arena} snapshot={snapshot} snapshotRef={runtime.snapshotRef} settings={settings} manifest={manifest} onReady={() => setRenderReady(true)} />{snapshot?.phase === 'countdown' && renderReady && <div className="countdown-overlay"><span>{Math.ceil(snapshot.countdown) || t.countdownFight}</span><p>{t.countdownReady}</p></div>}{!snapshot && <div className="countdown-overlay">{runtime.error ? <section className="match-error"><h2>{t.interrupted}</h2><p role="alert">{runtime.error}</p><button className="primary-button" onClick={() => window.location.reload()}>{t.reload}</button><button className="secondary-button" onClick={leaveMatch}>{t.lobby}</button></section> : <><span>…</span><p>{t.assetsLoading}</p></>}</div>}</div>
      {snapshot && <HUD snapshot={snapshot} settings={settings} manifest={manifest} />}{snapshot && snapshot.phase!=='paused' && (source === 'practice' || soloRun?.request.kind === 'training') && <TrainingControls snapshot={snapshot} settings={settings} command={command => runtime.command({type:'training',command})} />}
      {source === 'solo' && soloRun && soloRun.request.kind !== 'training' && !(soloRun.completed || soloRun.failed) && <SoloStatus run={soloRun} language={settings.language} next={nextSolo} retry={retrySolo} leave={leaveSolo} />}
      {source === 'solo' && soloRun && (soloRun.completed || soloRun.failed) && <MenuDialog language={settings.language} title={soloRun.request.kind === 'arcade' ? 'ARCADE' : settings.language === 'es' ? 'DESAFIO' : 'CHALLENGE'} done={t.back} close={leaveSolo}><SoloStatus run={soloRun} language={settings.language} next={nextSolo} retry={retrySolo} leave={leaveSolo} /></MenuDialog>}
      {snapshot?.phase === 'paused' && !(source === 'solo' && (soloRun?.completed || soloRun?.failed)) && <MenuDialog language={settings.language} title={t.pause} done={t.back} close={resume}><section className="pause-panel">{runtime.disconnected && <span className="eyebrow">{t.disconnected}</span>}{pauseNotice && <p>{pauseNotice}</p>}<button data-ui-sound="silent" data-autofocus className="primary-button" disabled={source === 'online' && (!online?.state.isHost || online.state.members.some(member => !member.connected)) || runtime.disconnected && !snapshot.config.players.filter(player => player.kind === 'human' && (!isRemote || player.peerId === online?.state.peerId) && player.device.startsWith('gamepad:')).every(player => navigator.getGamepads?.()[Number(player.device.split(':')[1])]?.connected)} onClick={resume}>{t.resume}<span>▶</span></button>{source === 'practice' && <button className="secondary-button" onClick={start}>{t.reset} ↻</button>}{(source === 'practice' || soloRun?.request.kind === 'training') && <TrainingControls snapshot={snapshot} settings={settings} command={command => runtime.command({type:'training',command})} />}<button className="secondary-button" onClick={() => open('settings')}>{t.settings}</button><button className="text-button" data-ui-sound="back" onClick={leaveMatch}>{t.lobby}</button></section></MenuDialog>}
    </div>}
    {screen === 'results' && displaySnapshot && <Results snapshot={displaySnapshot} settings={settings} manifest={manifest} rematch={() => source === 'public' ? continuePublic() : source === 'online' ? leaveMatch() : nextBout()} setState={source==='public'?undefined:matchSet.state} primaryLabel={source==='public' ? publicNetwork.match?.phase==='waiting' ? settings.language==='es'?'SIGUIENTE COMBATE':'NEXT BOUT' : settings.language==='es'?'VOLVER A ONLINE':'BACK TO ONLINE' : (source === 'local' || source==='online' && online?.state.isHost) && matchSet.state && !matchSet.state.complete ? settings.language === 'es' ? 'SIGUIENTE COMBATE' : 'NEXT BOUT' : source === 'online' ? !online?.state.isHost && online?.state.status !== 'lobby' ? t.waitingHost : t.lobby : t.rematch} waitingForHost={source === 'online' && !online?.state.isHost && online?.state.status !== 'lobby'} leave={source === 'public' ? leavePublicMatch : source === 'online' ? leaveRoom : leaveMatch} leaveLabel={source === 'online' ? t.leaveRoom : t.lobby} />}
   </main>
   {!isMatch && screen !== 'intro' && <footer className="app-footer"><span className="footer-mark">STF</span><span>{menuInput === 'gamepad' ? t.gamepadHelp : (['setup', 'room', 'settings'].includes(screen) ? t.configHelp : t.menuHelp)}</span>{runtime.controllers.controllers.length > 0 && <span className="controller-connected">✚ {runtime.controllers.controllers[0].label}</span>}<button data-testid="mode-guide" onClick={() => open('guide')}>{t.guide} <span>?</span></button></footer>}
   {(assetError || online?.state.error && isRemote && screen !== 'online') && <div className="global-error" role="alert">{assetError || online?.state.error}</div>}
 </div>;
}
function Results({ snapshot, settings, manifest, rematch, primaryLabel, leave, leaveLabel, waitingForHost, setState }: { setState?: import('./ui/useMatchSet').MatchSetState | null; snapshot: MatchSnapshot; settings: AppSettings; manifest: AssetsManifest | null; rematch: () => void; primaryLabel: string; waitingForHost: boolean; leave: () => void; leaveLabel: string }) {
 const t = ui[settings.language], result = snapshot.result, es=settings.language==='es';
 const fightersPerPage=usePageSize(4,2),scoreRows=usePageSize(4,2);
 const winners = snapshot.config.players.filter(p => result?.winners.includes(p.id));
 const mode=snapshot.config.gameMode??'stock';
 const placement=(id:string)=>result?.placements?.[id]??snapshot.scores?.[id]?.placement;
 const scoreboardPlayers=mode==='royale'?[...snapshot.config.players].sort((a,b)=>(placement(a.id)??99)-(placement(b.id)??99)):snapshot.config.players;
 const draw = result?.reason === 'draw', interrupted = result?.reason === 'interrupted';
 return <div className="results-screen">
  <span className="eyebrow">{interrupted ? t.noWinner : result?.reason === 'timeout' ? t.timeout : t.lastStanding}</span><h1>{interrupted ? t.interrupted : draw ? t.draw : t.winner}</h1>
  <ContentTabs label={es?'Resultados':'Results'} pages={[
   {id:'podium',label:es?'Podio':'Podium',content:<PagedContent size={fightersPerPage} language={settings.language} label={es?'Luchadores':'Fighters'} className="result-fighters">{(winners.length ? winners : snapshot.config.players).map(seat => <div key={seat.id} style={{ '--fighter-color': disciplineInfo[seat.discipline].color } as React.CSSProperties}>{!draw && !interrupted && <span className="winner-ribbon" aria-hidden="true">1</span>}<Avatar manifest={manifest} appearance={seat.appearance} discipline={seat.discipline} animated={!settings.reducedMotion} /><h2>{seat.name}</h2><span>{names[seat.discipline][settings.language]}</span></div>)}</PagedContent>},
   {id:'scores',label:es?'Marcador':'Scoreboard',content:<PagedContent size={scoreRows} language={settings.language} label={es?'Marcador':'Scoreboard'} className="result-scoreboard">{scoreboardPlayers.map(seat => {
    const f=snapshot.fighters.find(fighter=>fighter.id===seat.id),score=snapshot.scores?.[seat.id];
    const metric=mode==='hill'?`${(result?.scores?.[seat.id]??score?.hill??0).toFixed(1)} s`:mode==='timed'?`${result?.scores?.[seat.id]??((score?.kos??0)-(score?.selfDestructs??0))} KO`:formatLives(f?.lives??0,settings.language);
    return <div className="result-player-row" key={seat.id} style={{'--fighter-color':disciplineInfo[seat.discipline].color} as React.CSSProperties}>
     <Avatar manifest={manifest} appearance={seat.appearance} discipline={seat.discipline}/>
     <div className="result-player-identity"><strong>{seat.name}</strong><span>{names[seat.discipline][settings.language]}</span></div>
     <div className="result-player-stat"><small>{mode==='hill'?(es?'Control':'Control'):mode==='timed'?'KO':t.lives}</small><span>{metric}</span></div>
     <div className="result-player-stat"><small>{es?'Daño':'Damage'}</small><span>{Math.round(f?.damage??0)}%</span></div>
     {(mode==='royale'||result?.winners.includes(seat.id))&&<b className="result-player-place" aria-label={`${es?'Puesto':'Place'} ${mode==='royale'?placement(seat.id)??'—':1}`}>#{mode==='royale'?placement(seat.id)??'—':1}</b>}
    </div>;
   })}</PagedContent>}
  ]}/>
  {setState && <SetScore state={setState} language={settings.language} />}
  <div className="results-actions"><button data-autofocus disabled={waitingForHost} className="primary-button" onClick={rematch}>{primaryLabel}<span>↻</span></button><button className="secondary-button" onClick={leave}>{leaveLabel}<span>←</span></button></div>
 </div>;
}
