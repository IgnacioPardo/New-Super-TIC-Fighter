import type { AppSettings, MatchConfig, PlayerSeat } from './types';

export function createSeat(index: number, overrides: Partial<PlayerSeat> = {}): PlayerSeat {
  return {
    id: `p${index + 1}`, name: `Jugador ${index + 1}`,
    discipline: (['networks', 'design', 'code', 'hardware'] as const)[index % 4],
    appearance: { hair: index % 4, shirt: index % 4, pants: index % 4 },
    team: (index % 2) as 0 | 1, kind: 'human', device: `keyboard:${index}`,
    ...overrides,
  };
}
export const DEFAULT_CONFIG: MatchConfig = {
  ruleset: 'expanded', gameMode: 'stock', bestOf: 3, items: false, hazards: false,
  mode: 'ffa', arena: 'classic', lives: 3, timeLimit: 300,
  friendlyFire: false, practice: false, seed: 2026,
  players: [createSeat(0), createSeat(1, { kind: 'bot', difficulty: 'normal', device: 'bot' })],
};
export const DEFAULT_SETTINGS: AppSettings = {
  language: 'es', camera: 'adaptive', reducedMotion: false,
  musicVolume: 0.6, effectsVolume: 0.8, playlist: 'remake',
  keyboardBindings: [
    { jump: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', punch: 'KeyZ', special: 'KeyX', guard: 'KeyC', combo: 'KeyV', dodge: 'KeyQ' },
    { jump: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', punch: 'KeyI', special: 'KeyO', guard: 'KeyP', combo: 'KeyL', dodge: 'KeyU' },
    { jump: 'KeyY', down: 'KeyH', left: 'KeyG', right: 'KeyJ', punch: 'KeyB', special: 'KeyN', guard: 'KeyM', combo: 'KeyK', dodge: 'KeyT' },
    { jump: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6', punch: 'Numpad1', special: 'Numpad2', guard: 'Numpad3', combo: 'Numpad0', dodge: 'NumpadDecimal' },
  ],
  gamepadBindings: { jump: 0, punch: 2, special: 1, combo: 3, guard: 5, dodge: 4, pause: 9 },
};
