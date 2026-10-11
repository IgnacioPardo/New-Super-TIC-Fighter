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
    subtitle: { es: 'Original · 6 plataformas', en: 'Original · 6 platforms' },
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
    subtitle: { es: 'Simétrico · 4 plataformas', en: 'Symmetric · 4 platforms' },
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
    subtitle: { es: 'Vertical · 6 plataformas', en: 'Vertical · 6 platforms' },
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
  embedded: {
    id: 'embedded', name: { es: 'Taller Embedded', en: 'Embedded Workshop' }, subtitle: { es: 'Bancos · cinta · prensa', en: 'Benches · conveyor · press' }, color: '#e2ad64',
    platforms: [{ x: 150, y: 640, width: 1066, height: 45, conveyor: 95 }, { x: 130, y: 440, width: 310, height: 40 }, { x: 926, y: 440, width: 310, height: 40 }, { x: 508, y: 280, width: 350, height: 35 }],
    spawns: [{ x: 260, y: 440 }, { x: 1100, y: 440 }, { x: 560, y: 280 }, { x: 806, y: 280 }],
  },
  virtual: {
    id: 'virtual', name: { es: 'Laboratorio Virtual', en: 'Virtual Lab' }, subtitle: { es: 'Plataformas con aviso', en: 'Telegraphed changing platforms' }, color: '#ae91fa',
    platforms: [{ x: 258, y: 640, width: 850, height: 40 }, { x: 100, y: 460, width: 300, height: 35 }, { x: 966, y: 460, width: 300, height: 35 }, { x: 480, y: 320, width: 406, height: 35 }, { x: 580, y: 170, width: 206, height: 30 }],
    spawns: [{ x: 350, y: 640 }, { x: 1016, y: 640 }, { x: 530, y: 640 }, { x: 836, y: 640 }],
  },
  arcade: {
    id: 'arcade', name: { es: 'Circuito Arcade', en: 'Arcade Circuit' }, subtitle: { es: 'Escenario amplio · Royale', en: 'Large arena · Royale' }, color: '#ff72be',
    platforms: [{ x: -160, y: 650, width: 1686, height: 45 }, { x: -200, y: 430, width: 320, height: 35 }, { x: 200, y: 350, width: 320, height: 35 }, { x: 846, y: 350, width: 320, height: 35 }, { x: 1246, y: 430, width: 320, height: 35 }, { x: 523, y: 150, width: 320, height: 35 }, { x: 480, y: 500, width: 406, height: 35 }],
    spawns: [{ x: -100, y: 430 }, { x: 1466, y: 430 }, { x: 280, y: 350 }, { x: 1086, y: 350 }, { x: 600, y: 150 }, { x: 766, y: 150 }, { x: 540, y: 500 }, { x: 826, y: 500 }],
  },
};

export interface DisciplineDefinition {
  id: Discipline;
  name: Record<Language, string>;
  special: Record<Language, string>;
  combo: Record<Language, string>;
  color: string;
}
export const DISCIPLINES: Record<Discipline, DisciplineDefinition> = {
  networks: { id: 'networks', name: { es: 'Redes', en: 'Networks' }, special: { es: 'Cable UTP', en: 'UTP cable' }, combo: { es: 'Cables', en: 'Rising cables' }, color: '#52c6fd' },
  design: { id: 'design', name: { es: 'Diseño', en: 'Design' }, special: { es: 'Mouse', en: 'Mouse pointer' }, combo: { es: 'Selección', en: 'Selection box' }, color: '#fb73b9' },
  code: { id: 'code', name: { es: 'Programación', en: 'Programming' }, special: { es: 'Bola de código', en: 'Code ball' }, combo: { es: 'Columna de código', en: 'Code column' }, color: '#86ec8f' },
  hardware: { id: 'hardware', name: { es: 'Hardware', en: 'Hardware' }, special: { es: 'RAM', en: 'RAM' }, combo: { es: 'Disco', en: 'Spinning disc' }, color: '#fbc565' },
  ai: { id: 'ai', name: { es: 'IA', en: 'AI' }, special: { es: 'Predicción y eco', en: 'Prediction echo' }, combo: { es: 'Eco retrasado', en: 'Delayed echo' }, color: '#c3a0ff' },
  robotics: { id: 'robotics', name: { es: 'Robótica', en: 'Robotics' }, special: { es: 'Brazo mecánico', en: 'Mechanical arm' }, combo: { es: 'Dron autónomo', en: 'Autonomous drone' }, color: '#f89272' },
  iot: { id: 'iot', name: { es: 'IoT', en: 'IoT' }, special: { es: 'Placa ESP32 / Arduino', en: 'ESP32 / Arduino board' }, combo: { es: 'Hub Raspberry Pi', en: 'Raspberry Pi hub' }, color: '#58dbcf' },
  vr: { id: 'vr', name: { es: 'Realidad Virtual', en: 'Virtual Reality' }, special: { es: 'Desplazamiento', en: 'Displacement' }, combo: { es: 'Señuelo virtual', en: 'Virtual decoy' }, color: '#79b7ff' },
  games: { id: 'games', name: { es: 'Videojuegos', en: 'Video Games' }, special: { es: 'Proyectil rebote', en: 'Ricochet projectile' }, combo: { es: 'Plataforma resorte', en: 'Bounce pad' }, color: '#e4db65' },
  printing: { id: 'printing', name: { es: 'Impresión 3D', en: '3D Printing' }, special: { es: 'Pistón', en: 'Piston' }, combo: { es: 'Bloque temporal', en: 'Temporary block' }, color: '#98dda9' },
};

export type AttackAction = Extract<PlayerAction, 'punch' | 'uppercut' | 'sweep' | 'special' | 'combo' | 'air-forward' | 'air-down' | 'recover'>;
export interface AttackDefinition { windup: number; active: number; recovery: number }
/** Original 40 combat steps/s expressed as seconds; renderer uses actionTime. */
export const ATTACKS: Record<AttackAction, AttackDefinition> = {
  punch: { windup: 0.025, active: 0.4, recovery: 0.3 },
  uppercut: { windup: 0.025, active: 0.4, recovery: 0.7 },
  sweep: { windup: 0.025, active: 0.4, recovery: 0.8 },
  special: { windup: 0.2, active: 0.4, recovery: 0.8 },
  combo: { windup: 0.2, active: 0.4, recovery: 1 },
  'air-forward': { windup: .09, active: .16, recovery: .23 },
  'air-down': { windup: .12, active: .18, recovery: .32 },
  recover: { windup: .04, active: .24, recovery: .28 },
};

export interface HitDefinition {
  damage: number; xBase: number; xScale: number; yBase: number; yScale: number;
}
/** Launch uses the victim percentage before adding this hit's damage. */
export const MELEE_HITS: Record<'punch' | 'uppercut' | 'sweep' | 'air-forward' | 'air-down' | 'recover', HitDefinition> = {
  punch: { damage: 6, xBase: 100, xScale: 3, yBase: 600, yScale: 1 },
  uppercut: { damage: 5, xBase: 100, xScale: 1, yBase: 1200, yScale: 1 },
  sweep: { damage: 2, xBase: 100, xScale: 5, yBase: 400, yScale: 1 },
  'air-forward': { damage: 7, xBase: 160, xScale: 3, yBase: 360, yScale: 1 },
  'air-down': { damage: 9, xBase: 80, xScale: 1, yBase: -460, yScale: 1 },
  recover: { damage: 4, xBase: 90, xScale: 2, yBase: 800, yScale: 1 },
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
  echo: { damage: 5, xBase: 100, xScale: 2, yBase: 500, yScale: 1 },
  mechanical: { damage: 8, xBase: 160, xScale: 3, yBase: 500, yScale: 1 },
  wireless: { damage: 3, xBase: 80, xScale: 2, yBase: 350, yScale: 1 },
  hub: { damage: 5, xBase: 140, xScale: 2, yBase: 550, yScale: 1 },
  displacement: { damage: 6, xBase: 160, xScale: 3, yBase: 450, yScale: 1 },
  ricochet: { damage: 6, xBase: 130, xScale: 3, yBase: 500, yScale: 1 },
  piston: { damage: 8, xBase: 120, xScale: 2, yBase: 800, yScale: 1 },
  usb: { damage: 8, xBase: 160, xScale: 3, yBase: 650, yScale: 1 },
};

// Explicit platform links. Each upward edge is a legal Classic single jump;
// lateral/downward edges allow walking off an edge then steering to the landing.
export const NAVIGATION: Record<ArenaId, readonly (readonly [number, number])[]> = {
  classic: [[0, 2], [0, 3], [2, 5], [2, 1], [3, 1], [4, 2], [5, 2], [1, 2], [1, 3], [2, 0], [2, 4], [3, 0], [5, 4]],
  lab: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 1], [3, 2], [1, 0], [2, 0]],
  embedded: [[0,1],[0,2],[1,3],[2,3],[3,1],[3,2],[1,0],[2,0]],
  virtual: [[0,1],[0,2],[1,3],[2,3],[3,4],[4,3],[3,1],[3,2],[1,0],[2,0]],
  arcade: [[0,1],[0,2],[0,3],[0,4],[0,6],[2,5],[3,5],[6,2],[6,3],[5,2],[5,3],[1,0],[2,0],[3,0],[4,0],[6,0]],
  pc: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 3], [5, 3], [3, 1], [3, 2], [1, 0], [2, 0]],
};

export const CABLE_WIDTHS = [68, 96, 124, 152, 180, 208, 236, 264, 264, 236, 208, 180, 152, 124, 96] as const;
export const RAM_SIZES = [
  [50, 48], [50, 48], [50, 48], [50, 48], [50, 48],
  [100, 45], [100, 45], [100, 58], [100, 75], [100, 93],
  [150, 93], [150, 93], [150, 93], [150, 107], [150, 124],
] as const;
