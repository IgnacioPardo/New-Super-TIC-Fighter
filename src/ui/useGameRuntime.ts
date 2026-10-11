import { useCallback, useEffect, useRef, useState } from 'react';
import { InputManager, type ControllerStatus, type MenuIdentity } from '../input';
import { AudioManager, type UiSound } from '../audio';
import { preloadMatchAssets } from '../assets';
import type { AppSettings, AssetsManifest, MatchConfig, MatchSnapshot, SimulationCommand, SimulationMessage } from '../shared/types';
import type { OnlineBridge } from './contracts';
import type { MenuCommand } from '../input';
export type { MenuCommand } from '../input';
export function useGameRuntime(settings: AppSettings, manifest: AssetsManifest | null, onMenu: (command: MenuCommand, source: 'keyboard' | 'gamepad', identity: MenuIdentity) => void, online?: OnlineBridge, onlineActive = false, showMatch = false) {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const snapshotRef = useRef<MatchSnapshot | null>(null);
  const [devices, setDevices] = useState<{ id: string; label: string; connected: boolean; controllerId?: string }[]>([]);
  const [controllers, setControllers] = useState<ControllerStatus>({ available: true, blocked: false, controllers: [] });
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [error, setError] = useState('');
  const startGeneration = useRef(0);
  const input = useRef<InputManager | null>(null), audio = useRef<AudioManager | null>(null), worker = useRef<Worker | null>(null);
  const menu = useRef(onMenu), network = useRef(online), remote = useRef(onlineActive);
  const publishAt = useRef(0), phase = useRef('');
  menu.current = onMenu; network.current = online; remote.current = onlineActive;
  const command = useCallback((message: SimulationCommand) => {
    if (message.type === 'training' && message.command.action === 'frame') worker.current?.postMessage({...message,command:{...message.command,inputs:input.current?.poll((snapshotRef.current?.tick ?? 0)+1)}});
    else worker.current?.postMessage(message);
  }, []);
  useEffect(() => {
    const manager = new InputManager(settings, () => {
      if (snapshotRef.current?.phase === 'playing' || snapshotRef.current?.phase === 'countdown') {
        if (remote.current) network.current?.pause(); else worker.current?.postMessage({ type: 'pause' });
      } else menu.current('pause', 'gamepad', {device:'gamepad'});
    }, () => {
      if (!snapshotRef.current || snapshotRef.current.phase === 'finished') return;
      setDisconnected(true);
      if (remote.current) network.current?.pause(); else worker.current?.postMessage({ type: 'pause' });
    });
    input.current = manager;
    const unsubscribe = manager.subscribeMenu((command, source, identity) => menu.current(command, source, identity));
    const instance = new Worker(new URL('../simulation/worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onerror = () => { snapshotRef.current = null; setSnapshot(null); manager.setMode('menu'); setError(settings.language === 'es' ? 'El combate no pudo continuar. Recarga la página para intentarlo de nuevo.' : 'The fight could not continue. Reload the page to try again.'); };
    instance.onmessage = (event: MessageEvent<SimulationMessage>) => {
      if (event.data.type !== 'snapshot' || remote.current) return;
      const next = event.data.snapshot; snapshotRef.current = next;
      audio.current?.handleEvents(next.events, next);
      const now = performance.now();
      if (phase.current !== next.phase || now - publishAt.current > 100) { phase.current = next.phase; publishAt.current = now; setSnapshot(next); }
    };
    let raf = 0, lastPoll = 0;
    const poll = (time: number) => {
      if (remote.current && network.current?.snapshotRef) snapshotRef.current = network.current.snapshotRef.current;
      const state = snapshotRef.current;
      if (state && (state.phase === 'playing' || state.phase === 'countdown') && time - lastPoll >= 15) {
        lastPoll = time; const inputs = manager.poll(state.tick + 1);
        if (remote.current) network.current?.sendInputs(inputs); else instance.postMessage({ type: 'inputs', inputs });
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    const scan = setInterval(() => { setDevices(manager.getDevices()); setControllers(manager.getControllerStatus()); setSoundUnlocked(audio.current?.unlocked ?? false); }, 250);
    setDevices(manager.getDevices());
    const hidden = () => {
      if (document.hidden && (!remote.current || network.current?.state.isHost) && snapshotRef.current && ['playing', 'countdown'].includes(snapshotRef.current.phase)) {
        if (remote.current) network.current?.pause(); else instance.postMessage({ type: 'pause' });
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => { cancelAnimationFrame(raf); clearInterval(scan); unsubscribe(); manager.destroy(); instance.terminate(); document.removeEventListener('visibilitychange', hidden); input.current = null; worker.current = null; };
  }, []);
  useEffect(() => { input.current?.setSettings(settings); audio.current?.setSettings(settings); }, [settings]);
  useEffect(() => {
    if (!manifest) return;
    const manager = new AudioManager(manifest); audio.current = manager; manager.setSettings(settings); manager.setScene('menu');
    return () => { manager.destroy(); audio.current = null; };
  }, [manifest]);
  useEffect(() => {
    const next = onlineActive ? online?.state.snapshot ?? null : snapshot;
    if (onlineActive) { snapshotRef.current = next; if (next) audio.current?.handleEvents(next.events, next); }
    const running = !!next && next.phase !== 'finished';
    input.current?.setMode(running && next?.phase !== 'paused' ? 'game' : 'menu');
    const ownedPlayers = running && next ? next.config.players.filter(p => p.kind === 'human' && (!onlineActive || p.peerId === online?.state.peerId)) : [];
    input.current?.setPlayers(ownedPlayers);
    if (!ownedPlayers.some(player => player.device.startsWith('gamepad:'))) setDisconnected(false);
    audio.current?.setScene(running && next?.phase !== 'paused' && showMatch ? 'match' : 'menu');
  }, [snapshot, online?.state.snapshot, onlineActive, online?.state.peerId, showMatch, manifest]);
  const start = useCallback(async (config: MatchConfig) => {
    const generation = ++startGeneration.current;
    setDisconnected(false); setError(''); snapshotRef.current = null; setSnapshot(null); phase.current = '';
    try {
      await preloadMatchAssets(config);
      if (generation !== startGeneration.current || !worker.current) return;
      input.current?.setPlayers(config.players); input.current?.setMode('game');
      worker.current.postMessage({ type: 'start', config: { ...config, seed: Date.now() >>> 0 } });
    } catch (failure) { if (generation === startGeneration.current) setError(failure instanceof Error ? failure.message : 'El combate no pudo iniciarse / The fight could not start.'); }
  }, []);
  const stop = useCallback(() => { startGeneration.current++; command({ type: 'stop' }); snapshotRef.current = null; setSnapshot(null); setDisconnected(false); input.current?.setPlayers([]); input.current?.setMode('menu'); audio.current?.setScene('menu'); }, [command]);
  const unlock = useCallback(async () => { if (audio.current) { await audio.current.unlock(); setSoundUnlocked(audio.current.unlocked); } }, []);
  const uiSound = useCallback((cue: UiSound) => { audio.current?.playUi(cue); if (audio.current?.unlocked) setSoundUnlocked(true); }, []);
  const preferredController = useCallback(() => input.current?.getDevices().find(device => device.id.startsWith('gamepad:') && device.connected)?.id, []);
  const reclaim = useCallback(() => { const restored = input.current?.reclaim() ?? false; setDisconnected(!restored); return restored; }, []);
  const releaseMenu = useCallback((device?: string) => input.current?.releaseMenu(device), []);
  return { releaseMenu, snapshot: onlineActive ? online?.state.snapshot ?? null : snapshot, snapshotRef, start, stop, command, devices, controllers, preferredController, uiSound, soundUnlocked, unlock, disconnected, reclaim, error };
}
