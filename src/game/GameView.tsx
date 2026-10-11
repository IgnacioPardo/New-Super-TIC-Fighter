import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { AppSettings, ArenaId, AssetsManifest, FighterState, MatchSnapshot, PlayerSeat } from '../shared/types';
import { CombatFeedback } from './combatFeedback';
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
    setLoading(true); setError('');
    const art = manifest;
    const read = () => snapshotRef?.current ?? latest.current;
    let previous: MatchSnapshot | null = null;
    let received = performance.now();
    let current: MatchSnapshot | null = null;
    const fighters = new Map<string, FighterArt>();
    const effects = new Map<string, Phaser.GameObjects.Image>();
    const indicators = new Map<string, Phaser.GameObjects.Text>();
    const remoteFrames = new Map<string, { previous: FighterState; current: FighterState; received: number; duration: number; tick: number }>();
    const feedback = new CombatFeedback();
    let sparks: Phaser.GameObjects.Graphics;
    let background: Phaser.GameObjects.Image;
    let platformGroup: Phaser.GameObjects.Group;
    let hudCamera: Phaser.Cameras.Scene2D.Camera;
    let arenaId = '';
    let matchId = '';
    let zoom = 1;
    let centerX = 683;
    let centerY = 384;
    let stageBounds = { left: 0, right: 1366, top: 300, bottom: 650 };
    class FightScene extends Phaser.Scene {
      constructor() { super('fight'); }
      preload() {
        const loadSheet = (key: string, url: string) => this.load.spritesheet(key, url, { frameWidth: art.sheets.frameWidth, frameHeight: art.sheets.frameHeight });
        loadSheet('body', art.sheets.body);
        for (const layer of ['hair', 'shirt', 'pants'] as const) art.sheets[layer].forEach((url, i) => loadSheet(`${layer}-${i}`, url));
        this.load.image(`background-${arena}`, art.backgrounds[arena]);
        (art.arenaPlatforms?.[arena] ?? art.platforms).forEach((url, i) => this.load.image(`platform-${i}`, url));
        for (const [kind, urls] of Object.entries(art.effects)) urls.forEach((url, i) => this.load.image(`effect-${kind}-${i}`, url));
        this.load.on('loaderror', () => { if (active) setError(preferences.current.language === 'es' ? 'No se pudo cargar una imagen. Recarga la página.' : 'An image could not load. Reload this page.'); });
      }
      create() {
        background = this.add.image(683, 384, `background-${arena}`).setDisplaySize(1366, 768).setScrollFactor(0).setDepth(-20);
        platformGroup = this.add.group();
        hudCamera = this.cameras.add(0, 0, 1366, 768, false, 'markers');
        hudCamera.setBackgroundColor('rgba(0,0,0,0)');
        hudCamera.ignore(background);
        sparks = this.add.graphics().setDepth(13); this.addWorld(sparks);
        if (active) { setLoading(false); readyCallback.current?.(); }
      }
      addWorld(object: Phaser.GameObjects.GameObject) { hudCamera.ignore(object); }
      buildArena(id: string) {
        arenaId = id;
        const arena = ARENAS[id as keyof typeof ARENAS];
        if (!arena) return;
        stageBounds = {
          left: Math.min(...arena.platforms.map(p => p.x)),
          right: Math.max(...arena.platforms.map(p => p.x + p.width)),
          top: Math.min(...arena.platforms.map(p => p.y)),
          bottom: Math.max(...arena.platforms.map(p => p.y + p.height)),
        };
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
        let at = 0;
        if (f.action === 'idle') at = Math.floor(now / 250) % frames.length;
        else if (f.action === 'walk') { const cycle = f.actionTime % .475; at = Math.min(frames.length - 1, Math.floor(cycle / .075)); }
        else if (f.action === 'hurt' || f.action === 'out') at = f.actionTime < .12 ? 0 : Math.min(1, frames.length - 1);
        else if (f.action === 'punch') at = Math.min(frames.length - 1, Math.floor(f.actionTime / .1));
        else if (f.action === 'special' || f.action === 'combo') {
          // Preserve the preparation pose until the authoritative .20s activation.
          at = f.actionTime < .2 ? 0 : Math.min(frames.length - 1, 1 + Math.floor((f.actionTime - .2) / .2));
        }
        return frames[at] ?? frames[0] ?? 0;
      }
      update(_time: number, delta: number) {
        const state = read(); if (!state || !background) return;
        if (state !== current) { previous = current; current = state; received = performance.now(); }
        if (matchId !== state.matchId) {
          matchId = state.matchId; remoteFrames.clear(); previous = null; centerX = 683; centerY = 384; zoom = 1;
          fighters.forEach(f => { f.layers.forEach(l => l.destroy()); f.tag.destroy(); f.halo.destroy(); }); fighters.clear();
          effects.forEach(e => e.destroy()); effects.clear(); indicators.forEach(i => i.destroy()); indicators.clear();
        }
        if (arenaId !== state.config.arena) this.buildArena(state.config.arena);
        const fraction = Math.min(1, (performance.now() - received) / (1000 / 60));
        const living = state.fighters.filter(f => !f.eliminated);
        if (preferences.current.camera === 'adaptive' && living.length) {
          // The complete platform layout anchors the shot. Falling or launched fighters
          // may add bounded headroom, but cannot drag the arena into a screen corner.
          const minX = Math.min(stageBounds.left - 72, ...living.map(f => Phaser.Math.Clamp(f.x - 160, stageBounds.left - 180, stageBounds.right)));
          const maxX = Math.max(stageBounds.right + 72, ...living.map(f => Phaser.Math.Clamp(f.x + 160, stageBounds.left, stageBounds.right + 180)));
          const minY = Math.min(stageBounds.top - 160, ...living.map(f => Phaser.Math.Clamp(f.y - 160, stageBounds.top - 300, stageBounds.bottom)));
          const maxY = stageBounds.bottom + 150;
          const desiredZoom = Math.min(1.15, Math.max(.8, Math.min(1366 / (maxX - minX), 768 / (maxY - minY))));
          const desiredX = (minX + maxX) / 2;
          // Reserve space below the landing surfaces for the fixed HUD.
          const desiredY = Math.max((minY + maxY) / 2, stageBounds.bottom - 239 / desiredZoom);
          const smoothing = preferences.current.reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 50) / 220);
          zoom = Phaser.Math.Linear(zoom, desiredZoom, smoothing); centerX = Phaser.Math.Linear(centerX, desiredX, smoothing); centerY = Phaser.Math.Linear(centerY, desiredY, smoothing);
        } else { zoom = 1; centerX = 683; centerY = 384; }
        this.cameras.main.setZoom(zoom).centerOn(centerX, centerY);
        // Keep the arena's scenery filling the viewport when living fighters force the camera out.
        background.setDisplaySize(1366 / zoom, 768 / zoom);
        const placedTags: { x: number; y: number; width: number }[] = [];
        for (const f of state.fighters) {
          const seat = state.config.players.find(p => p.id === f.id); if (!seat) continue;
          let object = fighters.get(f.id); if (!object) object = this.makeFighter(seat);
          let old = previous?.fighters.find(p => p.id === f.id);
          let progress = fraction;
          if (seat.device === 'remote' || seat.kind === 'bot') {
            const now = performance.now();
            let frames = remoteFrames.get(f.id);
            if (!frames) { frames = { previous: f, current: f, received: now, duration: 1000 / 60, tick: state.tick }; remoteFrames.set(f.id, frames); }
            else if (frames.tick !== state.tick) {
              // Guest prediction publishes at 60 Hz while remote positions arrive with host authority.
              // Only a new transform starts the remote interpolation clock.
              if (frames.current.x !== f.x || frames.current.y !== f.y || frames.current.action !== f.action || frames.current.facing !== f.facing) {
                frames.previous = frames.current; frames.current = f;
                frames.duration = Phaser.Math.Clamp(now - frames.received, 16, 100); frames.received = now;
              }
              frames.tick = state.tick;
            }
            old = frames.previous; progress = Math.min(1, (now - frames.received) / frames.duration);
          }
          const canInterpolate = old && !f.eliminated && Math.abs(f.x - old.x) < 200 && Math.abs(f.y - old.y) < 250;
          const x = canInterpolate && old ? Phaser.Math.Linear(old.x, f.x, progress) : f.x;
          const y = canInterpolate && old ? Phaser.Math.Linear(old.y, f.y, progress) : f.y;
          const frame = this.frameFor(f, seat, performance.now());
          const protectedAlpha = f.invulnerable > 0 ? (preferences.current.reducedMotion ? .8 : Math.floor(performance.now() / 90) % 2 ? .55 : .92) : 1;
          for (const layer of object.layers) layer.setPosition(x, y).setFrame(frame).setFlipX(f.facing === -1).setAlpha(protectedAlpha).setVisible(!f.eliminated);
          let tagY = y - 106;
          // Stack nearby names instead of letting four-player scrums overwrite them.
          for (let lane = 0; lane < 4; lane++) {
            if (!placedTags.some(tag => Math.abs(tag.x - x) < (tag.width + object.tag.width) / 2 + 4 && Math.abs(tag.y - tagY) < 22)) break;
            tagY -= 22;
          }
          object.tag.setPosition(x, tagY).setVisible(!f.eliminated);
          if (!f.eliminated) placedTags.push({ x, y: tagY, width: object.tag.width });
          object.halo.clear();
          if (!f.eliminated) {
            const platforms = ARENAS[state.config.arena].platforms;
            const support = platforms.filter(p => x >= p.x - 18 && x <= p.x + p.width + 18 && p.y >= y - 3).sort((a, b) => a.y - b.y)[0];
            if (support && support.y - y < 190) {
              const proximity = 1 - Math.max(0, support.y - y) / 190;
              object.halo.fillStyle(0x090c15, .16 + .2 * proximity).fillEllipse(Math.round(x), support.y + 3, 20 + 24 * proximity, 7);
            }
          }
          if (!f.eliminated && (state.config.mode === 'teams' || f.invulnerable > 0)) {
            const color = f.invulnerable > 0 ? 0xffffff : seat.team === 0 ? 0x49beff : 0xff72b7;
            object.halo.lineStyle(f.invulnerable > 0 ? 2 : 3, color, .8).strokeEllipse(x, y - 45, 78, 112);
          }
          const marker = indicators.get(f.id)!;
          const screenX = (x - centerX) * zoom + 683, screenY = (y - centerY) * zoom + 384;
          const outside = !f.eliminated && (screenX < 35 || screenX > 1331 || screenY < 32 || screenY > 740);
          marker.setPosition(Phaser.Math.Clamp(screenX, 90, 1276), Phaser.Math.Clamp(screenY, 30, 738)).setVisible(outside);
        }
        feedback.consume(state);
        feedback.advance(delta);
        sparks.clear();
        for (const burst of feedback.bursts) {
          const age = burst.age / burst.life;
          const reduced = preferences.current.reducedMotion;
          const travel = reduced ? 0 : age * (burst.kind === 'dust' ? 16 : 24);
          const color = burst.kind === 'block' ? 0x7fd7ff : burst.kind === 'dust' ? 0xc3c8d1 : burst.kind === 'respawn' ? 0x92ecc5 : 0xffd984;
          sparks.lineStyle(2, color, (1 - age) * .8);
          if (burst.kind === 'respawn' || burst.kind === 'fall') {
            sparks.strokeEllipse(Math.round(burst.x), Math.round(burst.y), 38 + travel, 52 + travel);
          } else for (let i = 0; i < (burst.kind === 'dust' ? 4 : 6); i++) {
            const angle = burst.kind === 'dust' ? Math.PI + i * Math.PI / 3 : i * Math.PI / 3;
            const radius = 7 + travel;
            const px = Math.round(burst.x + Math.cos(angle) * radius), py = Math.round(burst.y + Math.sin(angle) * radius);
            sparks.lineBetween(px, py, Math.round(px + Math.cos(angle) * 5), Math.round(py + Math.sin(angle) * 5));
          }
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
  return <div className="game-canvas-wrap" aria-label={settings.language === 'es' ? 'Escenario de combate' : 'Fight arena'}>
    <div className="phaser-host" ref={host} />
    {(loading || error) && <div className="canvas-loading"><span className="loading-ring" /><p>{error || (settings.language === 'es' ? 'PREPARANDO EL COMBATE' : 'PREPARING THE FIGHT')}</p></div>}
  </div>;
}
