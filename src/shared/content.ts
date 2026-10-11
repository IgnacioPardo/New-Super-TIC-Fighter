import type { ArenaDefinition, ArenaId, Discipline, EffectKind, Language, PlayerAction } from './types';

export const WORLD = { width: 1366, height: 768, deathY: 1200 } as const;
export const PHYSICS = {
  acceleration: 3000, speed: 600, gravity: 3000, fallSpeed: 600,
  jumpSpeed: -1000, jumpCooldown: 0.9, bodyWidth: 60,
  standingHeight: 96, crouchingHeight: 64, sweepHeight: 54,
  hitProtection: 0.4, respawnProtection: 1, comboWindow: 0.5, inputBuffer: 0.1,
} as const;

export const ARENAS: Record<ArenaId, ArenaDefinition> = {
  classic: {
    id: 'classic', name: { es: 'Clásico', en: 'Classic' },
    subtitle: { es: 'La ciudad, los fierros y la pelea original.', en: 'The city, the girders, the original fight.' },
    color: '#7c93b3',
    platforms: [
      { x: 500, y: 600, width: 800, height: 50 },
      { x: 600, y: 300, width: 500, height: 50 },
      { x: 320, y: 450, width: 250, height: 50 },
      { x: 766, y: 450, width: 500, height: 50 },
      { x: 100, y: 600, width: 250, height: 50 },
      { x: 50, y: 300, width: 250, height: 50 },
    ],
    spawns: [{ x: 380, y: 450 }, { x: 1160, y: 450 }, { x: 170, y: 300 }, { x: 1010, y: 300 }],
  },
  lab: {
    id: 'lab', name: { es: 'Laboratorio TIC', en: 'TIC Laboratory' },
    subtitle: { es: 'Última hora. Último combate.', en: 'Last period. Last fight.' },
    color: '#557c9b',
    platforms: [
      { x: 283, y: 600, width: 800, height: 50 },
      { x: 133, y: 450, width: 250, height: 50 },
      { x: 983, y: 450, width: 250, height: 50 },
      { x: 433, y: 300, width: 500, height: 50 },
    ],
    spawns: [{ x: 203, y: 450 }, { x: 1163, y: 450 }, { x: 313, y: 450 }, { x: 1053, y: 450 }],
  },
  pc: {
    id: 'pc', name: { es: 'Dentro de la PC', en: 'Inside the PC' },
    subtitle: { es: 'El hardware se toma demasiado en serio.', en: 'The hardware takes this personally.' },
    color: '#335e5c',
    platforms: [
      { x: 433, y: 650, width: 500, height: 50 },
      { x: 183, y: 500, width: 250, height: 50 },
      { x: 933, y: 500, width: 250, height: 50 },
      { x: 433, y: 350, width: 500, height: 50 },
      { x: 183, y: 200, width: 250, height: 50 },
      { x: 933, y: 200, width: 250, height: 50 },
    ],
    spawns: [{ x: 253, y: 500 }, { x: 1113, y: 500 }, { x: 503, y: 350 }, { x: 863, y: 350 }],
  },
};

export interface DisciplineDefinition {
  id: Discipline;
  name: Record<Language, string>;
  subtitle: Record<Language, string>;
  special: Record<Language, string>;
  combo: Record<Language, string>;
  color: string;
}
export const DISCIPLINES: Record<Discipline, DisciplineDefinition> = {
  networks: { id: 'networks', name: { es: 'Redes', en: 'Networks' }, subtitle: { es: 'Conexión directa al mentón.', en: 'A direct connection to the chin.' }, special: { es: 'Cable UTP', en: 'UTP cable' }, combo: { es: 'Cables', en: 'Rising cables' }, color: '#52c6fd' },
  design: { id: 'design', name: { es: 'Diseño', en: 'Design' }, subtitle: { es: 'Seleccionar. Copiar. Pegar.', en: 'Select. Copy. Smash.' }, special: { es: 'Mouse', en: 'Mouse pointer' }, combo: { es: 'Selección', en: 'Selection box' }, color: '#fb73b9' },
  code: { id: 'code', name: { es: 'Programación', en: 'Programming' }, subtitle: { es: 'Este golpe compila.', en: 'This punch compiles.' }, special: { es: 'Bola de código', en: 'Code ball' }, combo: { es: 'Columna de código', en: 'Code column' }, color: '#86ec8f' },
  hardware: { id: 'hardware', name: { es: 'Hardware', en: 'Hardware' }, subtitle: { es: 'Actualización a la fuerza.', en: 'A forceful upgrade.' }, special: { es: 'RAM', en: 'RAM' }, combo: { es: 'Disco', en: 'Spinning disc' }, color: '#fbc565' },
};

export type AttackAction = Extract<PlayerAction, 'punch' | 'uppercut' | 'sweep' | 'special' | 'combo'>;
export interface AttackDefinition { windup: number; active: number; recovery: number }
/** Original 40 combat steps/s expressed as seconds; renderer uses actionTime. */
export const ATTACKS: Record<AttackAction, AttackDefinition> = {
  punch: { windup: 0.025, active: 0.4, recovery: 0.3 },
  uppercut: { windup: 0.025, active: 0.4, recovery: 0.7 },
  sweep: { windup: 0.025, active: 0.4, recovery: 0.8 },
  special: { windup: 0.2, active: 0.4, recovery: 0.8 },
  combo: { windup: 0.2, active: 0.4, recovery: 1 },
};

export interface HitDefinition {
  damage: number; xBase: number; xScale: number; yBase: number; yScale: number;
}
/** Launch uses the victim percentage before adding this hit's damage. */
export const MELEE_HITS: Record<'punch' | 'uppercut' | 'sweep', HitDefinition> = {
  punch: { damage: 6, xBase: 100, xScale: 3, yBase: 600, yScale: 1 },
  uppercut: { damage: 5, xBase: 100, xScale: 1, yBase: 1200, yScale: 1 },
  sweep: { damage: 2, xBase: 100, xScale: 5, yBase: 400, yScale: 1 },
};
export const EFFECT_HITS: Record<EffectKind, HitDefinition> = {
  cable: { damage: 3, xBase: 100, xScale: 3, yBase: 600, yScale: 1 },
  mouse: { damage: 6, xBase: 100, xScale: 2, yBase: 600, yScale: 1 },
  ball: { damage: 6, xBase: 150, xScale: 3, yBase: 600, yScale: 1 },
  ram: { damage: 5, xBase: 150, xScale: 2, yBase: 600, yScale: 2 },
  cables: { damage: 9, xBase: 50, xScale: 2, yBase: 600, yScale: 2 },
  selection: { damage: 4, xBase: 150, xScale: 3, yBase: 600, yScale: 1 },
  column: { damage: 4, xBase: 50, xScale: 2, yBase: 600, yScale: 2 },
  disc: { damage: 6, xBase: 50, xScale: 2, yBase: 600, yScale: 1 },
};

// Explicit platform links. Each upward edge is a legal Classic single jump;
// lateral/downward edges allow walking off an edge then steering to the landing.
export const NAVIGATION: Record<ArenaId, readonly (readonly [number, number])[]> = {
  classic: [[0, 2], [0, 3], [2, 5], [2, 1], [3, 1], [4, 2], [5, 2], [1, 2], [1, 3], [2, 0], [2, 4], [3, 0], [5, 4]],
  lab: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 1], [3, 2], [1, 0], [2, 0]],
  pc: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 3], [5, 3], [3, 1], [3, 2], [1, 0], [2, 0]],
};

export const CABLE_WIDTHS = [68, 96, 124, 152, 180, 208, 236, 264, 264, 236, 208, 180, 152, 124, 96] as const;
export const RAM_SIZES = [
  [50, 48], [50, 48], [50, 48], [50, 48], [50, 48],
  [100, 45], [100, 45], [100, 58], [100, 75], [100, 93],
  [150, 93], [150, 93], [150, 93], [150, 107], [150, 124],
] as const;
