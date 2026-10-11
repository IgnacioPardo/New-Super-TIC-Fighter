import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { AppSettings, ArenaId, AssetsManifest, FighterState, MatchSnapshot, PlayerSeat } from '../shared/types';
import { ARENAS } from '../shared/content';
import { disciplineInfo } from '../ui/i18n';

type SnapshotRef = { current: MatchSnapshot | null };
export interface GameViewProps {
  snapshot: MatchSnapshot | null;
  settings: AppSettings;
  manifest?: AssetsManifest | null;
  arena?: ArenaId;
  snapshotRef?: SnapshotRef;
  onReady?: () => void;
}
interface FighterArt { layers: Phaser.GameObjects.Sprite[]; tag: Phaser.GameObjects.Text; halo: Phaser.GameObjects.Graphics; seat: PlayerSeat }

/** Rendering only. Authoritative positions, actions and combat always come from the simulation. */
export function GameView({ snapshot, snapshotRef, settings, manifest, arena = 'classic', onReady }: GameViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(snapshot);
  const preferences = useRef(settings);
  const readyCallback = useRef(onReady);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  latest.current = snapshot;
  preferences.current = settings;
  readyCallback.current = onReady;
  useEffect(() => {
    if (!host.current || !manifest) return;
    let active = true;
    const art = manifest;
    const read = () => snapshotRef?.current ?? latest.current;
    let previous: MatchSnapshot | null = null;
    let received = performance.now();
    let current: MatchSnapshot | null = null;
    const fighters = new Map<string, FighterArt>();
    const effects = new Map<string, Phaser.GameObjects.Image>();
    const indicators = new Map<string, Phaser.GameObjects.Text>();
    let background: Phaser.GameObjects.Image;
    let platformGroup: Phaser.GameObjects.Group;
    let worldObjects: Phaser.GameObjects.GameObject[] = [];
    let hudCamera: Phaser.Cameras.Scene2D.Camera;
    let arenaId = '';
    let matchId = '';
    let zoom = 1;
    let centerX = 683;
    let centerY = 384;
    class FightScene extends Phaser.Scene {
      constructor() { super('fight'); }
      preload() {
        const loadSheet = (key: string, url: string) => this.load.spritesheet(key, url, { frameWidth: art.sheets.frameWidth, frameHeight: art.sheets.frameHeight });
        loadSheet('body', art.sheets.body);
        for (const layer of ['hair', 'shirt', 'pants'] as const) art.sheets[layer].forEach((url, i) => loadSheet(`${layer}-${i}`, url));
        this.load.image(`background-${arena}`, art.backgrounds[arena]);
        art.platforms.forEach((url, i) => this.load.image(`platform-${i}`, url));
        for (const [kind, urls] of Object.entries(art.effects)) urls.forEach((url, i) => this.load.image(`effect-${kind}-${i}`, url));
        this.load.on('loaderror', () => { if (active) setError(preferences.current.language === 'es' ? 'No se pudo cargar una imagen. Recarga la página.' : 'An image could not load. Reload this page.'); });
      }
      create() {
        background = this.add.image(683, 384, `background-${arena}`).setDisplaySize(1366, 768).setDepth(-20);
        platformGroup = this.add.group();
        worldObjects = [background];
        hudCamera = this.cameras.add(0, 0, 1366, 768, false, 'markers');
        hudCamera.setBackgroundColor('rgba(0,0,0,0)');
        hudCamera.ignore(worldObjects);
        if (active) { setLoading(false); readyCallback.current?.(); }
      }
      addWorld(object: Phaser.GameObjects.GameObject) { worldObjects.push(object); hudCamera.ignore(object); }
      buildArena(id: string) {
        arenaId = id;
        const arena = ARENAS[id as keyof typeof ARENAS];
        if (!arena) return;
        background.setTexture(`background-${id}`);
        platformGroup.clear(true, true);
        for (const [i, p] of arena.platforms.entries()) {
          const key = `platform-${Math.min(art.platforms.length - 1, p.width <= 270 ? 2 : p.width <= 510 ? 1 : 0)}`;
          const platform = this.add.image(p.x, p.y, key).setOrigin(0).setDisplaySize(p.width, p.height).setDepth(0);
          platformGroup.add(platform); this.addWorld(platform);
          // Distinct bright landing edge keeps imported girders readable in every environment.
          const edge = this.add.rectangle(p.x + p.width / 2, p.y + 2, p.width - 4, 3, Phaser.Display.Color.HexStringToColor(arena.color).color, .7).setDepth(1);
          platformGroup.add(edge); this.addWorld(edge);
          if (id !== 'classic') {
            const light = this.add.rectangle(p.x + 14 + (i % 2) * 10, p.y + 15, 5, 6, id === 'lab' ? 0x70edee : 0xa8fb66, .9).setDepth(1);
            platformGroup.add(light); this.addWorld(light);
          }
        }
      }
      makeFighter(seat: PlayerSeat) {
        const halo = this.add.graphics().setDepth(3);
        this.addWorld(halo);
        const layers: Phaser.GameObjects.Sprite[] = [];
        layers.push(this.add.sprite(0, 0, 'body').setOrigin(.5, 1).setDepth(5));
        for (const name of ['hair', 'shirt', 'pants'] as const) {
          const index = seat.appearance[name];
          if (index < art.sheets[name].length) layers.push(this.add.sprite(0, 0, `${name}-${index}`).setOrigin(.5, 1).setDepth(6 + layers.length));
        }
        layers.forEach(l => this.addWorld(l));
        const color = disciplineInfo[seat.discipline].color;
        const tag = this.add.text(0, 0, `${seat.name}${read()?.config.mode === 'teams' ? `  ${seat.team === 0 ? '◆ A' : '● B'}` : ''}`, { fontFamily: 'Arial, sans-serif', fontSize: '17px', fontStyle: 'bold', color, stroke: '#11131d', strokeThickness: 4, align: 'center' }).setOrigin(.5, 1).setDepth(15);
        this.addWorld(tag);
        const indicator = this.add.text(0, 0, `▼ ${seat.name}`, { fontFamily: 'Arial, sans-serif', fontSize: '18px', fontStyle: 'bold', color, backgroundColor: '#10131ce8', padding: {x: 8, y: 5} }).setOrigin(.5).setDepth(100).setVisible(false);
        this.cameras.main.ignore(indicator);
        indicators.set(seat.id, indicator);
        const result = { layers, tag, halo, seat }; fighters.set(seat.id, result); return result;
      }
      frameFor(f: FighterState, seat: PlayerSeat, now: number) {
        const pose = f.action === 'special' || f.action === 'combo' ? `${f.action}-${seat.discipline}` : f.action === 'out' ? 'hurt' : f.action;
        const frames = art.poses[pose] ?? art.poses.idle ?? [0];
        const at = ['idle', 'walk', 'guard', 'crouch'].includes(f.action) ? Math.floor(now / 110) : Math.floor(f.actionTime / .07);
        return frames[Math.min(frames.length - 1, at % frames.length)] ?? 0;
      }
      update(_time: number, delta: number) {
        const state = read(); if (!state || !background) return;
        if (state !== current) { previous = current; current = state; received = performance.now(); }
        if (matchId !== state.matchId) {
          matchId = state.matchId; previous = null; centerX = 683; centerY = 384; zoom = 1;
          fighters.forEach(f => { f.layers.forEach(l => l.destroy()); f.tag.destroy(); f.halo.destroy(); }); fighters.clear();
          effects.forEach(e => e.destroy()); effects.clear(); indicators.forEach(i => i.destroy()); indicators.clear();
        }
        if (arenaId !== state.config.arena) this.buildArena(state.config.arena);
        const fraction = Math.min(1, (performance.now() - received) / (1000 / 60));
        const living = state.fighters.filter(f => !f.eliminated);
        if (preferences.current.camera === 'adaptive' && living.length) {
          const minX = Math.min(...living.map(f => f.x)), maxX = Math.max(...living.map(f => f.x));
          const minY = Math.min(...living.map(f => f.y - 96)), maxY = Math.max(...living.map(f => f.y));
          const desiredZoom = Math.min(1.38, Math.max(.65, Math.min(1366 / Math.max(760, maxX - minX + 420), 768 / Math.max(500, maxY - minY + 320))));
          const desiredX = Phaser.Math.Clamp((minX + maxX) / 2, 250, 1116);
          const desiredY = Phaser.Math.Clamp((minY + maxY) / 2 + 75, 230, 690);
          const smoothing = preferences.current.reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 50) / 220);
          zoom = Phaser.Math.Linear(zoom, desiredZoom, smoothing); centerX = Phaser.Math.Linear(centerX, desiredX, smoothing); centerY = Phaser.Math.Linear(centerY, desiredY, smoothing);
        } else { zoom = 1; centerX = 683; centerY = 384; }
        this.cameras.main.setZoom(zoom).centerOn(centerX, centerY);
        for (const f of state.fighters) {
          const seat = state.config.players.find(p => p.id === f.id); if (!seat) continue;
          let object = fighters.get(f.id); if (!object) object = this.makeFighter(seat);
          const old = previous?.fighters.find(p => p.id === f.id);
          const canInterpolate = old && !f.eliminated && Math.abs(f.x - old.x) < 200 && Math.abs(f.y - old.y) < 250;
          const x = canInterpolate ? Phaser.Math.Linear(old.x, f.x, fraction) : f.x;
          const y = canInterpolate ? Phaser.Math.Linear(old.y, f.y, fraction) : f.y;
          const frame = this.frameFor(f, seat, performance.now());
          const protectedAlpha = f.invulnerable > 0 ? (Math.floor(performance.now() / 90) % 2 ? .42 : .92) : 1;
          for (const layer of object.layers) layer.setPosition(x, y).setFrame(frame).setFlipX(f.facing === -1).setAlpha(protectedAlpha).setVisible(!f.eliminated);
          object.tag.setPosition(x, y - 106).setVisible(!f.eliminated);
          object.halo.clear();
          if (!f.eliminated && (state.config.mode === 'teams' || f.invulnerable > 0)) {
            const color = f.invulnerable > 0 ? 0xffffff : seat.team === 0 ? 0x49beff : 0xff72b7;
            object.halo.lineStyle(f.invulnerable > 0 ? 2 : 3, color, .8).strokeEllipse(x, y - 45, 78, 112);
          }
          const marker = indicators.get(f.id)!;
          const screenX = (x - centerX) * zoom + 683, screenY = (y - centerY) * zoom + 384;
          const outside = !f.eliminated && (screenX < 35 || screenX > 1331 || screenY < 32 || screenY > 740);
          marker.setPosition(Phaser.Math.Clamp(screenX, 90, 1276), Phaser.Math.Clamp(screenY, 30, 738)).setVisible(outside);
        }
        const seen = new Set<string>();
        for (const e of state.effects) {
          seen.add(e.id); const available = art.effects[e.kind]; if (!available?.length) continue;
          const key = `effect-${e.kind}-${Math.min(available.length - 1, Math.max(0, e.frame))}`;
          let object = effects.get(e.id);
          if (!object) { object = this.add.image(e.x, e.y, key).setOrigin(0).setDepth(12); effects.set(e.id, object); this.addWorld(object); }
          object.setTexture(key).setPosition(e.x, e.y).setDisplaySize(Math.max(1, e.width), Math.max(1, e.height)).setFlipX(e.facing === -1);
        }
        effects.forEach((effect, id) => { if (!seen.has(id)) { effect.destroy(); effects.delete(id); } });
      }
    }
    const game = new Phaser.Game({
      type: Phaser.AUTO, parent: host.current, width: 1366, height: 768, backgroundColor: '#10141f',
      transparent: false, pixelArt: true, antialias: false,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: FightScene, audio: { noAudio: true }, banner: false,
    });
    return () => { active = false; game.destroy(true); };
  }, [manifest, snapshotRef, arena]);
  return <div className="game-canvas-wrap" ref={host} aria-label={settings.language === 'es' ? 'Escenario de combate' : 'Fight arena'}>
    {(loading || error) && <div className="canvas-loading"><span className="loading-ring" /><p>{error || (settings.language === 'es' ? 'PREPARANDO EL COMBATE' : 'PREPARING THE FIGHT')}</p></div>}
  </div>;
}
