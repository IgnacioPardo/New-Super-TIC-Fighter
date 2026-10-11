import type { AppSettings, MatchConfig, PlayerSeat } from '../shared/types';
export const DEFAULT_SETTINGS: AppSettings & { gamepadDeadZone: number } = {
  language: 'es', camera: 'adaptive', reducedMotion: false, musicVolume: .45, effectsVolume: .7, playlist: 'remake', gamepadDeadZone: .22,
  keyboardBindings: [
    { jump: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', punch: 'KeyZ', special: 'KeyX', guard: 'KeyC', combo: 'KeyV', dodge: 'KeyQ' },
    { jump: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', punch: 'KeyI', special: 'KeyO', guard: 'KeyP', combo: 'KeyL', dodge: 'KeyU' },
    { jump: 'KeyY', down: 'KeyH', left: 'KeyG', right: 'KeyJ', punch: 'KeyB', special: 'KeyN', guard: 'KeyM', combo: 'KeyK', dodge: 'KeyT' },
    { jump: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6', punch: 'Numpad1', special: 'Numpad2', guard: 'Numpad3', combo: 'Numpad0', dodge: 'NumpadDecimal' },
  ], gamepadBindings: { jump: 0, punch: 2, special: 1, combo: 3, guard: 5, dodge: 4, pause: 9 },
};
export function defaultSeat(index: number, bot = false, language = 'es'): PlayerSeat {
  return { id: `p${index + 1}`, name: bot ? `CPU ${index + 1}` : `${language === 'es' ? 'Jugador' : 'Player'} ${index + 1}`, discipline: (['networks','design','code','hardware'] as const)[index % 4], appearance: { hair: index % 4, shirt: index % 4, pants: index % 4 }, team: index >= 2 ? 1 : 0, kind: bot ? 'bot' : 'human', ...(bot ? { difficulty: 'normal' as const } : {}), device: bot ? 'bot' : `keyboard:${index}` };
}
export function loadSettings(): AppSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('stf-settings') ?? 'null');
    if (!saved) return structuredClone(DEFAULT_SETTINGS);
    return { ...structuredClone(DEFAULT_SETTINGS), ...saved,
      language: saved.language === 'en' ? 'en' : 'es',
      musicVolume: Math.max(0, Math.min(1, Number(saved.musicVolume ?? .45))), effectsVolume: Math.max(0, Math.min(1, Number(saved.effectsVolume ?? .7))),
      keyboardBindings: DEFAULT_SETTINGS.keyboardBindings.map((defaults, index) => ({...defaults, ...(saved.keyboardBindings?.[index] ?? {})})),
      gamepadBindings: {...DEFAULT_SETTINGS.gamepadBindings, ...saved.gamepadBindings},
    };
  } catch { return structuredClone(DEFAULT_SETTINGS); }
}
export function loadConfig(): MatchConfig {
  const initial: MatchConfig = { mode: 'ffa', ruleset: 'expanded', gameMode: 'stock', bestOf: 3, items: false, hazards: false, arena: 'classic', lives: 3, timeLimit: 300, friendlyFire: false, practice: false, seed: Date.now(), players: [defaultSeat(0), defaultSeat(1)] };
  try { const saved = JSON.parse(localStorage.getItem('stf-match') ?? 'null'); return saved ? { ...initial, ...saved, ruleset: saved.ruleset ?? 'classic', gameMode: saved.gameMode ?? 'stock', practice: false, seed: Date.now() } : initial; } catch { return initial; }
}
export function keyName(code: string) { return code.replace('Key', '').replace('Numpad', 'Num ').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('Space', '␣'); }

export function bindingConflicts(settings: AppSettings): string[] {
 const all = settings.keyboardBindings.flatMap((bindings,index) => Object.entries(bindings).map(([action,key]) => ({action,key,index})));
 const keyboard=all.filter(binding => binding.action === "dodge" && all.some(other => other !== binding && other.key === binding.key)).map(binding => `P${binding.index+1}: ${keyName(binding.key)}`);
 const dodge=settings.gamepadBindings.dodge;
 return [...keyboard,...(Object.entries(settings.gamepadBindings).some(([action,button])=>action!=='dodge'&&button===dodge)?[`LB / L1 (${dodge})`]:[])];
}
