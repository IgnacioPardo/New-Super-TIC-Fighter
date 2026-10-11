export const PROTOCOL_VERSION = 1;
export const CONTENT_VERSION = 'stf-classic-1';
export const TICK_RATE = 60;
export type Language = 'es' | 'en';
export type Discipline = 'networks' | 'design' | 'code' | 'hardware';
export type ArenaId = 'classic' | 'lab' | 'pc';
export type Difficulty = 'easy' | 'normal' | 'dummy';
export type PlayerAction = 'idle' | 'walk' | 'jump' | 'crouch' | 'guard' | 'punch' | 'uppercut' | 'sweep' | 'special' | 'combo' | 'hurt' | 'out';
export interface Appearance { hair: number; shirt: number; pants: number }
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
export interface MatchConfig {
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
  punch: boolean; special: boolean; guard: boolean; combo: boolean;
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
  recovery: number;
  stun: number;
  invulnerable: number;
  damage: number;
  lives: number;
  eliminated: boolean;
  jumpCooldown: number;
}
export type EffectKind = 'cable' | 'mouse' | 'ball' | 'ram' | 'cables' | 'selection' | 'column' | 'disc';
export interface EffectState {
  id: string; ownerId: string; kind: EffectKind;
  x: number; y: number; width: number; height: number; // top-left bounds
  vx: number; vy: number; facing: -1 | 1; age: number; frame: number;
}
export interface GameplayEvent {
  id: string; tick: number;
  type: 'attack' | 'hit' | 'block' | 'fall' | 'respawn' | 'fight' | 'result';
  seatId?: string; targetId?: string; action?: PlayerAction; discipline?: Discipline;
}
export interface MatchResult { winners: string[]; winningTeam?: 0 | 1; reason: 'last-standing' | 'timeout' | 'draw' | 'interrupted' }
export interface MatchSnapshot {
  matchId: string; tick: number; elapsed: number; phase: 'countdown' | 'playing' | 'paused' | 'finished';
  countdown: number;
  config: MatchConfig;
  fighters: FighterState[];
  effects: EffectState[];
  events: GameplayEvent[];
  result?: MatchResult;
  acknowledgedInputs?: InputFrame[]; // Last inputs consumed by authority, for guest reconciliation.
}
export interface Platform { x: number; y: number; width: number; height: number }
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
  | { type: 'stop' };
export type SimulationMessage = { type: 'snapshot'; snapshot: MatchSnapshot };
export interface AssetsManifest {
  sheets: { body: string; hair: string[]; shirt: string[]; pants: string[]; frameWidth: number; frameHeight: number; columns: number };
  poses: Record<string, number[]>;
  effects: Record<EffectKind, string[]>;
  backgrounds: Record<ArenaId, string>;
  platforms: string[];
  portraits: string[];
  font: string;
  logo: string;
  audio: { intro: string; original: string[]; remake: string[]; effects: Record<string, string> };
}
export const emptyInput = (seatId: string, tick = 0): InputFrame => ({
  seatId, tick, left: false, right: false, down: false, jump: false,
  punch: false, special: false, guard: false, combo: false,
});
