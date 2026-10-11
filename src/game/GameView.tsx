import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type {
  AppSettings,
  ArenaId,
  AssetsManifest,
  FighterState,
  MatchSnapshot,
  PlayerSeat,
} from '../shared/types';
import { CombatFeedback } from './combatFeedback';
import { authoredPose } from './poses';
import { ARENAS, DISCIPLINES } from '../shared/content';

type SnapshotRef = { current: MatchSnapshot | null };
export interface GameViewProps {
  snapshot: MatchSnapshot | null;
  settings: AppSettings;
  manifest?: AssetsManifest | null;
  arena?: ArenaId;
  snapshotRef?: SnapshotRef;
  onReady?: () => void;
}
interface FighterArt {
  layers: Phaser.GameObjects.Sprite[];
  tag: Phaser.GameObjects.Text;
  halo: Phaser.GameObjects.Graphics;
  seat: PlayerSeat;
}

/** Rendering only. Authoritative positions, actions and combat always come from the simulation. */
export function GameView({
  snapshot,
  snapshotRef,
  settings,
  manifest,
  arena = 'classic',
  onReady,
}: GameViewProps) {
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
    setLoading(true);
    setError('');
    const art = manifest;
    const read = () => snapshotRef?.current ?? latest.current;
    let previous: MatchSnapshot | null = null;
    let received = performance.now();
    let current: MatchSnapshot | null = null;
    const fighters = new Map<string, FighterArt>();
    const effects = new Map<string, Phaser.GameObjects.Image>();
    const indicators = new Map<string, Phaser.GameObjects.Text>();
    const remoteFrames = new Map<
      string,
      { previous: FighterState; current: FighterState; received: number; duration: number; tick: number }
    >();
    const feedback = new CombatFeedback();
    let sparks: Phaser.GameObjects.Graphics;
    let expansion: Phaser.GameObjects.Graphics;
    const echoLayers = new Map<string, Phaser.GameObjects.Sprite[]>();
    const labels = new Map<string, Phaser.GameObjects.Text>();
    const platformVisuals: {
      image: Phaser.GameObjects.Image;
      edge: Phaser.GameObjects.Rectangle;
      light?: Phaser.GameObjects.Rectangle;
    }[] = [];
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
      constructor() {
        super('fight');
      }
      preload() {
        const loadSheet = (key: string, url: string) =>
          this.load.spritesheet(key, url, {
            frameWidth: art.sheets.frameWidth,
            frameHeight: art.sheets.frameHeight,
          });
        loadSheet('body', art.sheets.body);
        for (const layer of ['hair', 'shirt', 'pants'] as const)
          art.sheets[layer].forEach((url, i) => loadSheet(`${layer}-${i}`, url));
        this.load.image(`background-${arena}`, art.backgrounds[arena]);
        (art.arenaPlatforms?.[arena] ?? art.platforms).forEach((url, i) =>
          this.load.image(`platform-${i}`, url),
        );
        for (const [kind, urls] of Object.entries(art.effects))
          (urls ?? []).forEach((url, i) => this.load.image(`effect-${kind}-${i}`, url));
        this.load.on('loaderror', () => {
          if (active)
            setError(
              preferences.current.language === 'es'
                ? 'No se pudo cargar una imagen. Recarga la página.'
                : 'An image could not load. Reload this page.',
            );
        });
      }
      create() {
        background = this.add.image(683, 384, `background-${arena}`).setDisplaySize(1366, 768).setDepth(-20);
        platformGroup = this.add.group();
        hudCamera = this.cameras.add(0, 0, 1366, 768, false, 'markers');
        hudCamera.setBackgroundColor('rgba(0,0,0,0)');
        hudCamera.ignore(background);
        expansion = this.add.graphics().setDepth(11);
        this.addWorld(expansion);
        sparks = this.add.graphics().setDepth(13);
        this.addWorld(sparks);
        if (active) {
          setLoading(false);
          readyCallback.current?.();
        }
      }
      addWorld(object: Phaser.GameObjects.GameObject) {
        hudCamera.ignore(object);
      }
      buildArena(id: string) {
        arenaId = id;
        const arena = ARENAS[id as keyof typeof ARENAS];
        if (!arena) return;
        stageBounds = {
          left: Math.min(...arena.platforms.map((p) => p.x)),
          right: Math.max(...arena.platforms.map((p) => p.x + p.width)),
          top: Math.min(...arena.platforms.map((p) => p.y)),
          bottom: Math.max(...arena.platforms.map((p) => p.y + p.height)),
        };
        background.setTexture(`background-${id}`);
        platformGroup.clear(true, true);
        platformVisuals.length = 0;
        for (const [i, p] of arena.platforms.entries()) {
          const key = `platform-${Math.min(art.platforms.length - 1, p.width <= 270 ? 2 : p.width <= 510 ? 1 : 0)}`;
          const platform = this.add
            .image(p.x, p.y, key)
            .setOrigin(0)
            .setDisplaySize(p.width, p.height)
            .setDepth(0);
          platformGroup.add(platform);
          this.addWorld(platform);
          // Distinct bright landing edge keeps imported girders readable in every environment.
          const edge = this.add
            .rectangle(
              p.x + p.width / 2,
              p.y + 2,
              p.width - 4,
              3,
              Phaser.Display.Color.HexStringToColor(arena.color).color,
              0.7,
            )
            .setDepth(1);
          platformGroup.add(edge);
          this.addWorld(edge);
          const visual: (typeof platformVisuals)[number] = { image: platform, edge };
          platformVisuals.push(visual);
          if (id !== 'classic') {
            const light = this.add
              .rectangle(p.x + 14 + (i % 2) * 10, p.y + 15, 5, 6, id === 'lab' ? 0x70edee : 0xa8fb66, 0.9)
              .setDepth(1);
            platformGroup.add(light);
            this.addWorld(light);
            visual.light = light;
          }
        }
      }
      makeFighter(seat: PlayerSeat) {
        const halo = this.add.graphics().setDepth(3);
        this.addWorld(halo);
        const layers: Phaser.GameObjects.Sprite[] = [];
        layers.push(this.add.sprite(0, 0, 'body').setOrigin(0.5, 1).setDepth(5));
        for (const name of ['hair', 'shirt', 'pants'] as const) {
          const index = seat.appearance[name];
          if (index < art.sheets[name].length)
            layers.push(
              this.add
                .sprite(0, 0, `${name}-${index}`)
                .setOrigin(0.5, 1)
                .setDepth(6 + layers.length),
            );
        }
        layers.forEach((l) => this.addWorld(l));
        const color = DISCIPLINES[seat.discipline].color;
        const tag = this.add
          .text(
            0,
            0,
            `${seat.name}${read()?.config.mode === 'teams' ? `  ${seat.team === 0 ? '◆ A' : '● B'}` : ''}`,
            {
              fontFamily: 'Arial, sans-serif',
              fontSize: '17px',
              fontStyle: 'bold',
              color,
              stroke: '#11131d',
              strokeThickness: 4,
              align: 'center',
            },
          )
          .setOrigin(0.5, 1)
          .setDepth(15);
        this.addWorld(tag);
        const indicator = this.add
          .text(0, 0, `▼ ${seat.name}`, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color,
            backgroundColor: '#10131ce8',
            padding: { x: 8, y: 5 },
          })
          .setOrigin(0.5)
          .setDepth(100)
          .setVisible(false);
        this.cameras.main.ignore(indicator);
        indicators.set(seat.id, indicator);
        const result = { layers, tag, halo, seat };
        fighters.set(seat.id, result);
        return result;
      }
      frameFor(f: FighterState, seat: PlayerSeat, now: number) {
        const pose =
          f.action === 'special' || f.action === 'combo'
            ? `${f.action}-${seat.discipline}`
            : f.action === 'out'
              ? 'hurt'
              : f.action;
        const frames = art.poses[pose] ?? art.poses.idle ?? [0];
        let at = 0;
        if (f.action === 'idle') at = Math.floor(now / 250) % frames.length;
        else if (f.action === 'walk') {
          const cycle = f.actionTime % 0.475;
          at = Math.min(frames.length - 1, Math.floor(cycle / 0.075));
        } else if (f.action === 'hurt' || f.action === 'out')
          at = f.actionTime < 0.12 ? 0 : Math.min(1, frames.length - 1);
        else if (f.action === 'punch') at = Math.min(frames.length - 1, Math.floor(f.actionTime / 0.1));
        else if (f.action === 'special' || f.action === 'combo') {
          // Preserve the preparation pose until the authoritative .20s activation.
          at =
            f.actionTime < 0.2 ? 0 : Math.min(frames.length - 1, 1 + Math.floor((f.actionTime - 0.2) / 0.2));
        }
        return frames[at] ?? frames[0] ?? 0;
      }
      drawExpanded(state: MatchSnapshot) {
        expansion.clear();
        const seenLabels = new Set<string>();
        const seenEchoes = new Set<string>();
        const es = preferences.current.language === 'es';
        const label = (id: string, text: string, x: number, y: number, color = '#e9f4ff') => {
          seenLabels.add(id);
          let object = labels.get(id);
          if (!object) {
            object = this.add
              .text(x, y, text, {
                fontFamily: 'Arial, sans-serif',
                fontSize: '12px',
                fontStyle: 'bold',
                color,
                stroke: '#101725',
                strokeThickness: 3,
                align: 'center',
              })
              .setOrigin(0.5)
              .setDepth(14);
            labels.set(id, object);
            this.addWorld(object);
          }
          object.setText(text).setPosition(x, y).setColor(color);
        };
        for (const [i, visual] of platformVisuals.entries()) {
          const p = state.platforms?.[i] ?? ARENAS[state.config.arena].platforms[i];
          if (!p) continue;
          const visible = p.active !== false;
          visual.image
            .setPosition(p.x, p.y)
            .setVisible(visible)
            .setAlpha(p.warning ? 0.4 : 1);
          visual.edge
            .setPosition(p.x + p.width / 2, p.y + 2)
            .setVisible(visible)
            .setFillStyle(
              p.warning
                ? 0xffbd69
                : Phaser.Display.Color.HexStringToColor(ARENAS[state.config.arena].color).color,
              p.warning ? 1 : 0.7,
            );
          visual.light?.setPosition(p.x + 14 + (i % 2) * 10, p.y + 15).setVisible(visible);
          if (p.warning) {
            expansion.lineStyle(2, 0xffbd69, 0.8).strokeRect(p.x, p.y - 4, p.width, p.height + 8);
            label(`platform-${i}`, '!', p.x + p.width / 2, p.y - 18, '#ffbd69');
          }
          if (p.conveyor && state.config.hazards)
            for (let x = p.x + ((state.tick * 1.5) % 38); x < p.x + p.width; x += 38) {
              expansion
                .lineStyle(2, 0xf5c77c, 0.8)
                .lineBetween(x, p.y + 12, x + 10, p.y + 18)
                .lineBetween(x + 10, p.y + 18, x, p.y + 24);
            }
        }
        if (state.config.ruleset === 'expanded') {
          const objective = state.objective;
          if (state.config.gameMode === 'hill' && objective) {
            const color = objective.contested
              ? 0xffc773
              : objective.ownerId
                ? Phaser.Display.Color.HexStringToColor(
                    DISCIPLINES[state.config.players.find((p) => p.id === objective.ownerId)!.discipline]
                      .color,
                  ).color
                : 0x8adce8;
            expansion
              .fillStyle(color, 0.1)
              .fillRect(objective.x, objective.y, objective.width, objective.height)
              .lineStyle(3, color, 0.8)
              .strokeRect(objective.x, objective.y, objective.width, objective.height);
            label(
              'hill',
              objective.contested
                ? es
                  ? 'DISPUTADA'
                  : 'CONTESTED'
                : objective.ownerId
                  ? (state.config.players.find((p) => p.id === objective.ownerId)?.name ??
                    (es ? 'ZONA' : 'HILL'))
                  : es
                    ? 'ZONA'
                    : 'HILL',
              objective.x + objective.width / 2,
              objective.y - 18,
            );
          }
          if (objective?.safeLeft !== undefined) {
            expansion
              .fillStyle(0xee668e, 0.18)
              .fillRect(-450, -200, objective.safeLeft + 450, 1400)
              .fillRect(objective.safeRight ?? 1586, -200, 1816 - (objective.safeRight ?? 1586), 1400);
            expansion
              .lineStyle(4, 0xff83a7, 0.8)
              .lineBetween(objective.safeLeft, -200, objective.safeLeft, 1200)
              .lineBetween(objective.safeRight ?? 1586, -200, objective.safeRight ?? 1586, 1200);
          }
          if (state.config.hazards && state.config.arena === 'embedded') {
            const phase = state.elapsed % 7,
              warning = phase > 4.5 && phase < 5.9,
              active = phase >= 5.9 && phase < 6.4;
            expansion
              .fillStyle(active ? 0xff6375 : 0xd6a868, warning ? 0.7 : 0.4)
              .fillRect(593, active ? 450 : 90, 180, active ? 175 : 45);
            expansion.lineStyle(2, warning ? 0xffbd69 : 0xb98856, 0.7).strokeRect(593, 440, 180, 200);
            if (warning || active)
              label('press', active ? (es ? 'PRENSA' : 'PRESS') : '!', 683, 420, '#ffc773');
          }
          for (const d of state.deployables ?? []) {
            const color = Phaser.Display.Color.HexStringToColor(
              DISCIPLINES[state.config.players.find((p) => p.id === d.ownerId)!.discipline].color,
            ).color;
            expansion
              .fillStyle(0x101b2a, 0.95)
              .fillRect(d.x, d.y, d.width, d.height)
              .lineStyle(2, color, 0.9)
              .strokeRect(d.x, d.y, d.width, d.height);
            if (d.kind === 'drone') {
              expansion
                .lineStyle(3, color, 0.9)
                .lineBetween(d.x - 14, d.y + 4, d.x + 12, d.y + 4)
                .lineBetween(d.x + d.width - 12, d.y + 4, d.x + d.width + 14, d.y + 4)
                .lineBetween(d.x + 14, d.y + 12, d.x + 14, d.y + 27)
                .lineBetween(d.x + 34, d.y + 12, d.x + 34, d.y + 27);
            }
            if (d.kind === 'drone')
              expansion
                .lineStyle(2, color, 0.8)
                .strokeEllipse(d.x - 2, d.y + 4, 26, 10)
                .strokeEllipse(d.x + d.width + 2, d.y + 4, 26, 10)
                .strokeCircle(d.x + d.width / 2, d.y + 24, 8);
            if (d.kind === 'board' || d.kind === 'hub') {
              for (let pin = 6; pin < d.width; pin += 9)
                expansion
                  .fillStyle(0xf3eac8, 0.8)
                  .fillRect(d.x + pin, d.y - 3, 3, 5)
                  .fillRect(d.x + pin, d.y + d.height - 2, 3, 5);
              expansion
                .lineStyle(2, color, 0.6)
                .strokeCircle(d.x + d.width / 2, d.y + d.height / 2, 9)
                .strokeCircle(d.x + d.width / 2, d.y + d.height / 2, 15);
            }
            if (d.kind === 'board') {
              const arduino =
                state.deployables!.filter((b) => b.ownerId === d.ownerId && b.kind === 'board').indexOf(d) %
                2;
              expansion
                .fillStyle(0xc6d4ce, 0.9)
                .fillRect(d.x + 2, d.y + 16, 7, 13)
                .fillStyle(0x26323f, 1)
                .fillRect(d.x + 16, d.y + 12, arduino ? 24 : 19, arduino ? 10 : 22);
              if (!arduino)
                expansion
                  .lineStyle(1, 0xf0d597, 0.8)
                  .lineBetween(d.x + 18, d.y + 6, d.x + 35, d.y + 6)
                  .lineBetween(d.x + 35, d.y + 6, d.x + 35, d.y + 11);
            }
            if (d.kind === 'hub')
              expansion
                .fillStyle(0xd7e0df, 0.9)
                .fillRect(d.x + d.width - 13, d.y + 5, 13, 13)
                .fillRect(d.x + d.width - 13, d.y + 24, 13, 13)
                .fillStyle(0x252b33, 1)
                .fillRect(d.x + 18, d.y + 15, 17, 17);
            if (d.kind === 'pad')
              expansion
                .lineStyle(3, 0xe4db65, 0.9)
                .lineBetween(d.x + 8, d.y + 10, d.x + 24, d.y + 3)
                .lineBetween(d.x + 24, d.y + 3, d.x + 40, d.y + 10)
                .lineBetween(d.x + 40, d.y + 10, d.x + 56, d.y + 3);
            if (d.kind === 'block') {
              for (let y = d.y + 8; y < d.y + d.height; y += 8)
                expansion.lineStyle(1, color, 0.3).lineBetween(d.x + 3, y, d.x + d.width - 3, y);
            }
            if (d.kind === 'decoy') {
              expansion
                .lineStyle(2, color, 0.55)
                .strokeCircle(d.x + d.width / 2, d.y + 8, 9)
                .lineBetween(d.x + d.width / 2, d.y + 17, d.x + d.width / 2, d.y + d.height)
                .lineBetween(d.x + 8, d.y + 30, d.x + d.width - 8, d.y + 30);
            }
            const names = {
              drone: es ? 'DRON' : 'DRONE',
              board:
                state.deployables!.filter((b) => b.ownerId === d.ownerId && b.kind === 'board').indexOf(d) % 2
                  ? 'ARDUINO'
                  : 'ESP32',
              hub: 'RASPBERRY Pi',
              decoy: es ? 'SEÑUELO' : 'DECOY',
              pad: es ? 'SALTO' : 'BOUNCE',
              block: '3D',
            };
            label(d.id, `${names[d.kind]} ${Math.ceil(d.ttl)}s`, d.x + d.width / 2, d.y - 14);
            expansion
              .fillStyle(color, 0.8)
              .fillRect(
                d.x,
                d.y + d.height + 4,
                d.width * Math.min(1, d.hp / (d.kind === 'block' ? 18 : d.kind === 'board' ? 12 : 16)),
                3,
              );
          }
          const itemNames = {
            usb: 'USB',
            fan: es ? 'VENTILADOR' : 'FAN',
            firewall: es ? 'CORTAFUEGOS' : 'FIREWALL',
            battery: es ? 'BATERÍA' : 'BATTERY',
            overclock: 'OVERCLOCK',
          };
          for (const item of state.items ?? []) {
            expansion
              .fillStyle(0xf5ce75, 0.95)
              .fillRoundedRect(item.x - 16, item.y - 16, 32, 32, 5)
              .lineStyle(2, 0xffffff, 0.8)
              .strokeRoundedRect(item.x - 16, item.y - 16, 32, 32, 5);
            label(item.id, `${itemNames[item.kind]} ${Math.ceil(item.ttl)}s`, item.x, item.y - 28, '#ffe1a0');
          }
          for (const e of state.effects) {
            if (e.width <= 0 || art.effects[e.kind]?.length) continue;
            const owner = state.config.players.find((p) => p.id === e.ownerId),
              color = Phaser.Display.Color.HexStringToColor(
                DISCIPLINES[owner?.discipline ?? 'code'].color,
              ).color;
            expansion
              .fillStyle(color, e.kind === 'echo' ? 0.2 : 0.7)
              .fillRoundedRect(e.x, e.y, e.width, e.height, 5)
              .lineStyle(2, color, 0.9)
              .strokeRoundedRect(e.x, e.y, e.width, e.height, 5);
            if (e.kind === 'mechanical') {
              expansion
                .lineStyle(5, 0xdce2ee, 0.9)
                .lineBetween(e.x + 8, e.y + e.height / 2, e.x + e.width - 8, e.y + e.height / 2)
                .strokeCircle(e.x + e.width / 2, e.y + e.height / 2, 7);
            }
            if (e.kind === 'piston')
              expansion
                .fillStyle(0xe8ebe9, 0.9)
                .fillRect(e.x + e.width * 0.3, e.y + 8, e.width * 0.4, e.height - 16);
            if (e.kind === 'wireless' || e.kind === 'hub')
              expansion
                .lineStyle(2, 0xffffff, 0.7)
                .strokeCircle(e.x + e.width / 2, e.y + e.height / 2, e.width * 0.3);
            if (e.kind === 'echo') {
              label(e.id, es ? 'ECO' : 'ECHO', e.x + e.width / 2, e.y - 12);
              if (owner && e.sourceAction) {
                seenEchoes.add(e.id);
                let layers = echoLayers.get(e.id);
                if (!layers) {
                  const keys = [
                    'body',
                    ...(['hair', 'shirt', 'pants'] as const)
                      .filter((part) => owner.appearance[part] < art.sheets[part].length)
                      .map((part) => `${part}-${owner.appearance[part]}`),
                  ];
                  layers = keys.map((key) => {
                    const sprite = this.add
                      .sprite(0, 0, key)
                      .setOrigin(0.5, 1)
                      .setDepth(10)
                      .setAlpha(0.35)
                      .setTint(color);
                    this.addWorld(sprite);
                    return sprite;
                  });
                  echoLayers.set(e.id, layers);
                }
                const source = state.fighters.find((f) => f.id === owner.id)!;
                const fighter = { ...source, action: e.sourceAction, actionTime: 0.2, recovery: 0 };
                const pose = authoredPose(fighter, owner.discipline, art),
                  frame = pose?.frame ?? this.frameFor(fighter, owner, performance.now());
                for (const layer of layers)
                  layer
                    .setPosition(e.originX ?? e.x + e.width / 2, e.originY ?? e.y + e.height)
                    .setFrame(frame)
                    .setFlipX(e.facing === -1)
                    .setScale(pose?.scaleX ?? 1, pose?.scaleY ?? 1);
              }
            }
            if (e.kind === 'ricochet')
              expansion
                .lineStyle(2, 0xffffff, 0.9)
                .strokeCircle(e.x + e.width / 2, e.y + e.height / 2, e.width / 3);
          }
          for (const f of state.fighters) {
            if (f.eliminated) continue;
            if (f.action === 'recover' || f.action === 'air-dash' || f.action === 'dodge') {
              const color = f.action === 'recover' ? 0x8ee6dd : 0xcedffc;
              expansion
                .lineStyle(3, color, 0.7)
                .lineBetween(f.x - f.vx / 35, f.y - f.vy / 35 - 45, f.x, f.y - 45);
            }
          }
        }
        if (state.training?.hitboxes)
          for (const box of state.training.collisionBoxes ?? []) {
            const color =
              box.kind === 'body'
                ? 0x61ff92
                : box.kind === 'deployable'
                  ? 0x87c4ff
                  : box.active
                    ? 0xff6e76
                    : 0xf4df7c;
            expansion
              .lineStyle(box.kind === 'body' ? 1 : 2, color, 0.9)
              .strokeRect(box.x, box.y, box.width, box.height);
          }
        echoLayers.forEach((layers, id) => {
          if (!seenEchoes.has(id)) {
            layers.forEach((layer) => layer.destroy());
            echoLayers.delete(id);
          }
        });
        labels.forEach((object, id) => {
          if (!seenLabels.has(id)) {
            object.destroy();
            labels.delete(id);
          }
        });
      }
      update(_time: number, delta: number) {
        const state = read();
        if (!state || !background) return;
        if (state !== current) {
          previous = current;
          current = state;
          received = performance.now();
        }
        if (matchId !== state.matchId) {
          matchId = state.matchId;
          remoteFrames.clear();
          previous = null;
          centerX = 683;
          centerY = 384;
          zoom = 1;
          fighters.forEach((f) => {
            f.layers.forEach((l) => l.destroy());
            f.tag.destroy();
            f.halo.destroy();
          });
          fighters.clear();
          effects.forEach((e) => e.destroy());
          effects.clear();
          indicators.forEach((i) => i.destroy());
          indicators.clear();
        }
        if (arenaId !== state.config.arena) this.buildArena(state.config.arena);
        const fraction = Math.min(1, (performance.now() - received) / (1000 / 60));
        const living = state.fighters.filter((f) => !f.eliminated);
        const locals = living.filter((f) =>
          state.config.players.some((p) => p.id === f.id && p.kind === 'human' && p.device !== 'remote'),
        );
        const framed = state.config.gameMode === 'royale' && locals.length ? locals : living;
        if (preferences.current.camera === 'adaptive' && living.length) {
          // The complete platform layout anchors the shot. Falling or launched fighters
          // may add bounded headroom, but cannot drag the arena into a screen corner.
          const anchorLeft =
            state.config.gameMode === 'royale'
              ? Math.min(...framed.map((f) => f.x)) - 160
              : stageBounds.left - 72;
          const anchorRight =
            state.config.gameMode === 'royale'
              ? Math.max(...framed.map((f) => f.x)) + 160
              : stageBounds.right + 72;
          const minX = Math.min(
            anchorLeft,
            ...framed.map((f) => Phaser.Math.Clamp(f.x - 160, stageBounds.left - 180, stageBounds.right)),
          );
          const maxX = Math.max(
            anchorRight,
            ...framed.map((f) => Phaser.Math.Clamp(f.x + 160, stageBounds.left, stageBounds.right + 180)),
          );
          const minY = Math.min(
            stageBounds.top - 160,
            ...framed.map((f) => Phaser.Math.Clamp(f.y - 160, stageBounds.top - 300, stageBounds.bottom)),
          );
          const maxY = stageBounds.bottom + 150;
          const desiredZoom = Math.min(
            1.15,
            Math.max(
              state.config.gameMode === 'royale' ? 0.55 : 0.8,
              Math.min(1366 / (maxX - minX), 768 / (maxY - minY)),
            ),
          );
          const desiredX = (minX + maxX) / 2;
          // Reserve space below the landing surfaces for the fixed HUD.
          const desiredY = Math.max((minY + maxY) / 2, stageBounds.bottom - 239 / desiredZoom);
          const smoothing = preferences.current.reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 50) / 220);
          zoom = Phaser.Math.Linear(zoom, desiredZoom, smoothing);
          centerX = Phaser.Math.Linear(centerX, desiredX, smoothing);
          centerY = Phaser.Math.Linear(centerY, desiredY, smoothing);
        } else {
          zoom = 1;
          centerX = 683;
          centerY = 384;
        }
        this.cameras.main.setZoom(zoom).centerOn(centerX, centerY);
        // Keep the arena's scenery filling the viewport when living fighters force the camera out.
        background.setPosition(centerX, centerY).setDisplaySize(1366 / zoom, 768 / zoom);
        this.drawExpanded(state);
        const placedTags: { x: number; y: number; width: number }[] = [];
        for (const f of state.fighters) {
          const seat = state.config.players.find((p) => p.id === f.id);
          if (!seat) continue;
          let object = fighters.get(f.id);
          if (!object) object = this.makeFighter(seat);
          let old = previous?.fighters.find((p) => p.id === f.id);
          let progress = fraction;
          if (seat.device === 'remote' || seat.kind === 'bot') {
            const now = performance.now();
            let frames = remoteFrames.get(f.id);
            if (!frames) {
              frames = { previous: f, current: f, received: now, duration: 1000 / 60, tick: state.tick };
              remoteFrames.set(f.id, frames);
            } else if (frames.tick !== state.tick) {
              // Guest prediction publishes at 60 Hz while remote positions arrive with host authority.
              // Only a new transform starts the remote interpolation clock.
              if (
                frames.current.x !== f.x ||
                frames.current.y !== f.y ||
                frames.current.action !== f.action ||
                frames.current.facing !== f.facing
              ) {
                frames.previous = frames.current;
                frames.current = f;
                frames.duration = Phaser.Math.Clamp(now - frames.received, 16, 100);
                frames.received = now;
              }
              frames.tick = state.tick;
            }
            old = frames.previous;
            progress = Math.min(1, (now - frames.received) / frames.duration);
          }
          const canInterpolate =
            old && !f.eliminated && Math.abs(f.x - old.x) < 200 && Math.abs(f.y - old.y) < 250;
          const x = canInterpolate && old ? Phaser.Math.Linear(old.x, f.x, progress) : f.x;
          const y = canInterpolate && old ? Phaser.Math.Linear(old.y, f.y, progress) : f.y;
          const pose =
            state.config.ruleset === 'expanded' ? authoredPose(f, seat.discipline, art) : undefined;
          const frame = pose?.frame ?? this.frameFor(f, seat, performance.now());
          const protectedAlpha =
            f.invulnerable > 0
              ? preferences.current.reducedMotion
                ? 0.8
                : Math.floor(performance.now() / 90) % 2
                  ? 0.55
                  : 0.92
              : 1;
          for (const layer of object.layers)
            layer
              .setPosition(x + (pose?.offsetX ?? 0), y + (pose?.offsetY ?? 0))
              .setScale(pose?.scaleX ?? 1, pose?.scaleY ?? 1)
              .setFrame(frame)
              .setFlipX(f.facing === -1)
              .setAlpha(protectedAlpha)
              .setVisible(!f.eliminated);
          let tagY = y - 106;
          // Stack nearby names instead of letting four-player scrums overwrite them.
          for (let lane = 0; lane < 8; lane++) {
            if (
              !placedTags.some(
                (tag) =>
                  Math.abs(tag.x - x) < (tag.width + object.tag.width) / 2 + 4 && Math.abs(tag.y - tagY) < 22,
              )
            )
              break;
            tagY -= 22;
          }
          object.tag.setPosition(x, tagY).setVisible(!f.eliminated);
          if (!f.eliminated) placedTags.push({ x, y: tagY, width: object.tag.width });
          object.halo.clear();
          if (!f.eliminated) {
            const platforms =
              state.platforms?.filter((p) => p.active !== false) ?? ARENAS[state.config.arena].platforms;
            const support = platforms
              .filter((p) => x >= p.x - 18 && x <= p.x + p.width + 18 && p.y >= y - 3)
              .sort((a, b) => a.y - b.y)[0];
            if (support && support.y - y < 190) {
              const proximity = 1 - Math.max(0, support.y - y) / 190;
              object.halo
                .fillStyle(0x090c15, 0.16 + 0.2 * proximity)
                .fillEllipse(Math.round(x), support.y + 3, 20 + 24 * proximity, 7);
            }
          }
          if (!f.eliminated && (state.config.mode === 'teams' || f.invulnerable > 0)) {
            const color = f.invulnerable > 0 ? 0xffffff : seat.team === 0 ? 0x49beff : 0xff72b7;
            object.halo.lineStyle(f.invulnerable > 0 ? 2 : 3, color, 0.8).strokeEllipse(x, y - 45, 78, 112);
          }
          if (!f.eliminated && f.action === 'guard') {
            const meter = (f.guardMeter ?? 100) / 100;
            object.halo
              .lineStyle(3, meter < 0.25 ? 0xff6677 : 0x80dcff, 0.9)
              .strokeEllipse(x, y - 45, 85, 112);
            object.halo
              .fillStyle(0x101725, 0.9)
              .fillRect(x - 30, y - 120, 60, 5)
              .fillStyle(0x80dcff, 1)
              .fillRect(x - 30, y - 120, 60 * meter, 5);
          }
          const cosmetic = seat.appearance.cosmetic;
          if (!f.eliminated && cosmetic && cosmetic !== 'original') {
            const color =
              cosmetic === 'copper'
                ? 0xe9a16d
                : cosmetic === 'neon'
                  ? 0x61f3c7
                  : Phaser.Display.Color.HSVToRGB((state.tick % 360) / 360, 0.65, 1).color;
            object.halo.lineStyle(2, color, 0.8).strokeEllipse(x, y - 4, 56, 12);
          }
          const marker = indicators.get(f.id)!;
          const screenX = (x - centerX) * zoom + 683,
            screenY = (y - centerY) * zoom + 384;
          const outside = !f.eliminated && (screenX < 35 || screenX > 1331 || screenY < 32 || screenY > 740);
          marker
            .setPosition(Phaser.Math.Clamp(screenX, 90, 1276), Phaser.Math.Clamp(screenY, 30, 738))
            .setVisible(outside);
        }
        feedback.consume(state);
        feedback.advance(delta);
        sparks.clear();
        for (const burst of feedback.bursts) {
          const age = burst.age / burst.life;
          const reduced = preferences.current.reducedMotion;
          const travel = reduced ? 0 : age * (burst.kind === 'dust' ? 16 : 24);
          const color =
            burst.kind === 'block'
              ? 0x7fd7ff
              : burst.kind === 'dust'
                ? 0xc3c8d1
                : burst.kind === 'respawn'
                  ? 0x92ecc5
                  : 0xffd984;
          sparks.lineStyle(2, color, (1 - age) * 0.8);
          if (burst.kind === 'respawn' || burst.kind === 'fall') {
            sparks.strokeEllipse(Math.round(burst.x), Math.round(burst.y), 38 + travel, 52 + travel);
          } else
            for (let i = 0; i < (burst.kind === 'dust' ? 4 : 6); i++) {
              const angle = burst.kind === 'dust' ? Math.PI + (i * Math.PI) / 3 : (i * Math.PI) / 3;
              const radius = 7 + travel;
              const px = Math.round(burst.x + Math.cos(angle) * radius),
                py = Math.round(burst.y + Math.sin(angle) * radius);
              sparks.lineBetween(
                px,
                py,
                Math.round(px + Math.cos(angle) * 5),
                Math.round(py + Math.sin(angle) * 5),
              );
            }
        }
        const seen = new Set<string>();
        for (const e of state.effects) {
          if (e.width <= 0 || e.height <= 0) continue;
          seen.add(e.id);
          const available = art.effects[e.kind];
          if (!available?.length) continue;
          const key = `effect-${e.kind}-${Math.min(available.length - 1, Math.max(0, e.frame))}`;
          let object = effects.get(e.id);
          if (!object) {
            object = this.add.image(e.x, e.y, key).setOrigin(0).setDepth(12);
            effects.set(e.id, object);
            this.addWorld(object);
          }
          object
            .setTexture(key)
            .setPosition(e.x, e.y)
            .setDisplaySize(Math.max(1, e.width), Math.max(1, e.height))
            .setFlipX(e.facing === -1);
        }
        effects.forEach((effect, id) => {
          if (!seen.has(id)) {
            effect.destroy();
            effects.delete(id);
          }
        });
      }
    }
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: 1366,
      height: 768,
      backgroundColor: '#10141f',
      transparent: false,
      pixelArt: true,
      antialias: false,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: FightScene,
      audio: { noAudio: true },
      banner: false,
    });
    return () => {
      active = false;
      game.destroy(true);
    };
  }, [manifest, snapshotRef, arena]);
  return (
    <div
      className="game-canvas-wrap"
      aria-label={settings.language === 'es' ? 'Escenario de combate' : 'Fight arena'}
    >
      <div className="phaser-host" ref={host} />
      {(loading || error) && (
        <div className="canvas-loading">
          <span className="loading-ring" />
          <p>{error || (settings.language === 'es' ? 'PREPARANDO EL COMBATE' : 'PREPARING THE FIGHT')}</p>
        </div>
      )}
    </div>
  );
}
