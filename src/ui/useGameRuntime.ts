import { useCallback, useEffect, useRef, useState } from 'react';
import { InputManager } from '../input';
import { AudioManager } from '../audio';
import type { AppSettings, AssetsManifest, MatchConfig, MatchSnapshot, SimulationCommand, SimulationMessage } from '../shared/types';
import type { OnlineBridge } from './contracts';
export type MenuCommand = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause';
export function useGameRuntime(settings: AppSettings, manifest: AssetsManifest | null, onMenu: (command: MenuCommand) => void, online?: OnlineBridge, onlineActive = false) {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const snapshotRef = useRef<MatchSnapshot | null>(null);
  const [devices, setDevices] = useState<{ id: string; label: string; connected: boolean }[]>([]);
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<InputManager | null>(null), audio = useRef<AudioManager | null>(null), worker = useRef<Worker | null>(null);
  const menu = useRef(onMenu), network = useRef(online), remote = useRef(onlineActive);
  const publishAt = useRef(0), phase = useRef('');
  menu.current = onMenu; network.current = online; remote.current = onlineActive;
  const command = useCallback((message: SimulationCommand) => worker.current?.postMessage(message), []);
  useEffect(() => {
    const manager = new InputManager(settings, () => {
      if (snapshotRef.current?.phase === 'playing' || snapshotRef.current?.phase === 'countdown') {
        if (remote.current) network.current?.pause(); else worker.current?.postMessage({ type: 'pause' });
      } else menu.current('pause');
    }, () => {
      setDisconnected(true);
      if (remote.current) network.current?.pause(); else worker.current?.postMessage({ type: 'pause' });
    });
    input.current = manager;
    const unsubscribe = manager.subscribeMenu(command => menu.current(command));
    const instance = new Worker(new URL('../simulation/worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onerror = () => setError(settings.language === 'es' ? 'El combate no pudo iniciarse. Recarga la página para intentarlo de nuevo.' : 'The fight could not start. Reload the page to try again.');
    instance.onmessage = (event: MessageEvent<SimulationMessage>) => {
      if (event.data.type !== 'snapshot' || remote.current) return;
      const next = event.data.snapshot; snapshotRef.current = next;
      audio.current?.handleEvents(next.events);
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
    const scan = setInterval(() => setDevices(manager.getDevices()), 700);
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
    if (onlineActive) { snapshotRef.current = next; if (next) audio.current?.handleEvents(next.events); }
    const running = !!next && next.phase !== 'finished';
    input.current?.setMode(running && next?.phase !== 'paused' ? 'game' : 'menu');
    if (next) input.current?.setPlayers(next.config.players.filter(p => p.kind === 'human' && (!onlineActive || p.peerId === online?.state.peerId)));
    audio.current?.setScene(running ? 'match' : 'menu');
  }, [snapshot, online?.state.snapshot, onlineActive, online?.state.peerId]);
  const start = useCallback((config: MatchConfig) => {
    setDisconnected(false); setError(''); snapshotRef.current = null; setSnapshot(null); phase.current = '';
    input.current?.setPlayers(config.players); input.current?.setMode('game');
    worker.current?.postMessage({ type: 'start', config: { ...config, seed: Date.now() } });
  }, []);
  const stop = useCallback(() => { command({ type: 'stop' }); snapshotRef.current = null; setSnapshot(null); input.current?.setMode('menu'); audio.current?.setScene('menu'); }, [command]);
  const unlock = useCallback(async () => { if (audio.current) { await audio.current.unlock(); setSoundUnlocked(audio.current.unlocked); } }, []);
  const reclaim = useCallback(() => { input.current?.reclaim(); setDisconnected(false); }, []);
  return { snapshot: onlineActive ? online?.state.snapshot ?? null : snapshot, snapshotRef, start, stop, command, devices, soundUnlocked, unlock, disconnected, reclaim, error };
}
