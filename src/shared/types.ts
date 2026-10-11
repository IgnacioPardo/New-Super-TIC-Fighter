export const PROTOCOL_VERSION = 2;
export const CONTENT_VERSION = 'stf-expanded-2';
export const TICK_RATE = 60;
export type Language = 'es' | 'en';
export type Discipline = 'networks' | 'design' | 'code' | 'hardware' | 'ai' | 'robotics' | 'iot' | 'vr' | 'games' | 'printing';
export type ArenaId = 'classic' | 'lab' | 'pc' | 'embedded' | 'virtual' | 'arcade';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'dummy';
export type PlayerAction = 'idle' | 'walk' | 'jump' | 'crouch' | 'guard' | 'punch' | 'uppercut' | 'sweep' | 'special' | 'combo' | 'hurt' | 'out' | 'air-forward' | 'air-down' | 'dodge' | 'air-dash' | 'recover';
export interface Appearance { hair: number; shirt: number; pants: number; cosmetic?: 'original' | 'copper' | 'neon' | 'prism' }
export interface PlayerSeat {
  id: string;
  name: string;
  discipline: Discipline;
  appearance: Appearance;
  team: 0 | 1;
  kind: 'human' | 'bot';
  difficulty?: Difficulty;
  peerId?: string;
  device: string; // keyboard:0..3, gamepad:index, bot, or remote
}
export type Ruleset = 'classic' | 'expanded';
export type GameMode = 'stock' | 'timed' | 'hill' | 'royale' | 'survival' | 'training';
export interface MatchConfig {
  ruleset?: Ruleset;
  gameMode?: GameMode;
  bestOf?: 1 | 3 | 5;
  items?: boolean;
  hazards?: boolean;
  mode: 'ffa' | 'teams';
  arena: ArenaId;
  lives: number;
  timeLimit: number; // seconds; 0 means unlimited
  friendlyFire: boolean;
  practice: boolean;
  seed: number;
  players: PlayerSeat[];
}
export interface InputFrame {
  tick: number;
  seatId: string;
  left: boolean; right: boolean; down: boolean; jump: boolean;
  punch: boolean; special: boolean; guard: boolean; combo: boolean; dodge?: boolean;
}
export interface FighterState {
  id: string;
  x: number; y: number; // horizontal centre and feet, in canonical units
  vx: number; vy: number;
  facing: -1 | 1;
  grounded: boolean;
  height: number;
  action: PlayerAction;
  actionTime: number;
  poseAction?: PlayerAction;
  recovery: number;
  stun: number;
  invulnerable: number;
  damage: number;
  lives: number;
  eliminated: boolean;
  jumpCooldown: number;
  airJumps?: number; airDash?: boolean; recoveryAvailable?: boolean;
  dodgeCooldown?: number; abilityCooldown?: number; guardMeter?: number;
  buffs?: Partial<Record<ItemKind, number>>;
}
export type EffectKind = 'cable' | 'mouse' | 'ball' | 'ram' | 'cables' | 'selection' | 'column' | 'disc' | 'echo' | 'mechanical' | 'wireless' | 'hub' | 'displacement' | 'ricochet' | 'piston' | 'usb';
export interface EffectState {
  id: string; ownerId: string; kind: EffectKind;
  x: number; y: number; width: number; height: number; // top-left bounds
  vx: number; vy: number; facing: -1 | 1; age: number; frame: number;
}
export interface GameplayEvent {
  id: string; tick: number;
  type: 'attack' | 'active' | 'hit' | 'block' | 'fall' | 'respawn' | 'fight' | 'result' | 'deploy' | 'item' | 'hazard' | 'objective' | 'wave';
  seatId?: string; targetId?: string; creditedTo?: string; action?: PlayerAction; discipline?: Discipline;
}
export interface MatchResult { winners: string[]; winningTeam?: 0 | 1; reason: 'last-standing' | 'timeout' | 'draw' | 'interrupted'; placements?: Record<string, number>; scores?: Record<string, number> }
export interface MatchSnapshot {
  matchId: string; tick: number; elapsed: number; phase: 'countdown' | 'playing' | 'paused' | 'finished';
  countdown: number;
  config: MatchConfig;
  fighters: FighterState[];
  effects: EffectState[];
  events: GameplayEvent[];
  result?: MatchResult;
  platforms?: Platform[];
  deployables?: DeployableState[];
  items?: ItemState[];
  objective?: ObjectiveState;
  scores?: Record<string, ScoreState>;
  training?: TrainingState;
  runtime?: SimulationRuntime;
  acknowledgedInputs?: InputFrame[]; // Last inputs consumed by authority, for guest reconciliation.
}
export interface Platform { x: number; y: number; width: number; height: number; id?: string; active?: boolean; warning?: boolean; conveyor?: number }
export type ItemKind = 'usb' | 'fan' | 'firewall' | 'battery' | 'overclock';
export interface ItemState { id: string; kind: ItemKind; x: number; y: number; ttl: number }
export interface DeployableState { id: string; ownerId: string; kind: 'drone' | 'board' | 'hub' | 'decoy' | 'pad' | 'block'; x: number; y: number; width: number; height: number; hp: number; ttl: number; cooldown: number; facing: -1 | 1 }
export interface ScoreState { kos: number; selfDestructs: number; hill: number; placement?: number }
export interface ObjectiveState { x: number; y: number; width: number; height: number; ownerId?: string; contested?: boolean; safeLeft?: number; safeRight?: number; suddenDeath?: number; wave?: number; nextWave?: number; hazardPhase?: number }
export interface TrainingState { hitboxes: boolean; inputHistory: InputFrame[]; recording: boolean; playback: boolean; dummyRecording: InputFrame[]; playbackIndex: number }
export interface FighterRuntimeState { previous: InputFrame; buffer?: { action: PlayerAction | 'jump'; expires: number; facing: -1 | 1 }; history: { action: 'left' | 'right' | 'down' | 'jump' | 'punch' | 'special'; tick: number }[]; launched: boolean; effect?: EffectState; effectBottom: number; effectTop: number; attackFacing: -1 | 1; hitTargets?: string[]; lastHitBy?: string; lastHitTick?: number; dodgeRemaining?: number; echo?: { at: number; action: PlayerAction; facing: -1 | 1; x: number; y: number }; bounces?: number }
export interface BotRuntimeState { random: number; memories: [string, { nextDecision: number; input: InputFrame; moveUntil: number; target?: string; jumpTarget?: number; launchedAt?: number }][]; observations: { tick: number; fighters: FighterState[] }[] }
export interface SimulationRuntime { projectiles?: { effect: EffectState; ttl: number; hitTargets: string[]; bounces?: number }[]; fighters: [string, FighterRuntimeState][]; inputs: InputFrame[]; bot?: BotRuntimeState; random: number; nextItem: number; serial: number; trainingInputs?: InputFrame[] }
export type TrainingCommand = { action: 'reset-damage' | 'reset-position' | 'set-damage' | 'set-position' | 'reset-all' | 'hitboxes' | 'record' | 'playback' | 'frame'; seatId?: string; enabled?: boolean; damage?: number; x?: number; y?: number };
export interface ArenaDefinition {
  id: ArenaId; name: Record<Language, string>; subtitle: Record<Language, string>;
  platforms: Platform[]; spawns: { x: number; y: number }[]; color: string;
}
export interface AppSettings {
  language: Language; camera: 'adaptive' | 'fixed'; reducedMotion: boolean;
  musicVolume: number; effectsVolume: number; playlist: 'original' | 'remake';
  keyboardBindings: Record<string, string>[];
  gamepadBindings: Record<string, number>;
  gamepadDeadZone?: number;
}
export type SimulationCommand =
  | { type: 'start'; config: MatchConfig; matchId?: string }
  | { type: 'inputs'; inputs: InputFrame[] }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'forfeit'; seatIds: string[] }
  | { type: 'training'; command: TrainingCommand }
  | { type: 'stop' };
export type SimulationMessage = { type: 'snapshot'; snapshot: MatchSnapshot };
export interface AssetsManifest {
  sheets: { body: string; hair: string[]; shirt: string[]; pants: string[]; frameWidth: number; frameHeight: number; columns: number };
  poses: Record<string, number[]>;
  effects: Partial<Record<EffectKind, string[]>>;
  backgrounds: Record<ArenaId, string>;
  platforms: string[];
  arenaPlatforms?: Partial<Record<ArenaId, string[]>>;
  portraits: string[];
  font: string;
  logo: string;
  audio: { intro: string; menu: string; original: string[]; remake: string[]; effects: Record<string, string> };
}
export const emptyInput = (seatId: string, tick = 0): InputFrame => ({
  seatId, tick, left: false, right: false, down: false, jump: false,
  punch: false, special: false, guard: false, combo: false, dodge: false,
});
