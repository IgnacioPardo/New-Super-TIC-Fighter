import { DEFAULT_SETTINGS } from './shared/defaults';
import { controllerLabel, normalizeController } from './controller';
import { emptyInput, type AppSettings, type InputFrame, type PlayerSeat } from './shared/types';

export type MenuCommand = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause';
export interface ControllerStatus {
  available: boolean;
  blocked: boolean;
  controllers: { id: string; label: string; mapping: string; lastInput: string | null }[];
}
type MenuSource = 'keyboard' | 'gamepad';
const defaults = DEFAULT_SETTINGS.gamepadBindings;
const editing = () => {
  const element = document.activeElement;
  return element instanceof HTMLElement && (element.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(element.tagName));
};

/** Browser devices produce the same actions as remote seats and bots. */
export class InputManager {
  private settings: AppSettings;
  private players: PlayerSeat[] = [];
  private keys = new Set<string>();
  private listeners = new Set<(command: MenuCommand, source: MenuSource) => void>();
  private blocked = false;
  private lastInputs = new Map<number, string>();
  private stickDirections = new Map<number, MenuCommand>();
  private mode: 'menu' | 'game' = 'menu';
  private focused = document.hasFocus();
  private connected = new Set<number>();
  private previousButtons = new Map<number, boolean[]>();
  private menuDirections = new Map<string, number>();
  private reclaimed = new Set<number>();
  private padIdentities = new Map<string, { device: string; id: string }>();
  private raf = 0;
  private destroyed = false;

  constructor(settings: AppSettings, private onPause?: () => void, private onDisconnect?: () => void) {
    this.settings = settings;
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    window.addEventListener('focus', this.focus);
    document.addEventListener('visibilitychange', this.visibility);
    this.scan();
  }

  setSettings(settings: AppSettings) { this.settings = settings; this.keys.clear(); }
  setPlayers(players: PlayerSeat[]) {
    this.players = players;
    if (!players.length) {
      this.padIdentities.clear(); this.reclaimed.clear(); this.keys.clear();
      return;
    }
    const pads = this.pads();
    for (const player of players) {
      if (!player.device.startsWith('gamepad:')) { this.padIdentities.delete(player.id); continue; }
      const pad = pads[Number(player.device.split(':')[1])];
      const known = this.padIdentities.get(player.id);
      if (pad && (!known || known.device !== player.device)) this.padIdentities.set(player.id, {device:player.device,id:pad.id});
    }

  }
  reclaim(): boolean {
    const pads = this.pads();
    for (const player of this.players) {
      if (!player.device.startsWith('gamepad:')) continue;
      const pad = pads[Number(player.device.split(':')[1])];
      const known = this.padIdentities.get(player.id);
      if (!pad?.connected || (known && known.id !== pad.id)) return false;
    }
    this.reclaimed.clear(); this.keys.clear(); return true;
  }
  setMode(mode: 'menu' | 'game') { if (this.mode !== mode) { this.mode = mode; this.keys.clear(); this.menuDirections.clear(); this.stickDirections.clear(); } }
  subscribeMenu(listener: (command: MenuCommand, source: MenuSource) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  getDevices() {
    return [
      ...Array.from({length: 4}, (_, index) => ({id: `keyboard:${index}`, label: `Keyboard ${index + 1}`, connected: true})),
      ...this.pads().filter((pad): pad is Gamepad => !!pad).map(pad => ({id: `gamepad:${pad.index}`, label: controllerLabel(pad), connected: pad.connected && !this.reclaimed.has(pad.index)})),
    ];
  }
  getControllerStatus(): ControllerStatus {
    const pads = this.pads();
    return {available: typeof navigator.getGamepads === 'function', blocked:this.blocked, controllers:pads.filter((pad): pad is Gamepad => !!pad?.connected).map(pad => ({id:`gamepad:${pad.index}`,label:controllerLabel(pad),mapping:pad.mapping || 'unmapped',lastInput:this.lastInputs.get(pad.index) ?? null}))};
  }
  poll(tick: number): InputFrame[] {
    const pads = this.pads();
    return this.players.filter(player => player.kind === 'human' && /^(keyboard|gamepad):\d+$/.test(player.device)).map(player => {
      const input = emptyInput(player.id, tick);
      if (!document.hasFocus() || document.hidden || editing()) return input;
      const index = Number(player.device.split(':')[1]);
      if (player.device.startsWith('keyboard:')) {
        const bindings = this.settings.keyboardBindings?.[index] ?? {};
        for (const action of ['left','right','down','jump','punch','special','guard','combo'] as const) input[action] = this.keys.has(bindings[action]);
      } else {
        const pad = pads[index];
        if (!pad?.connected || this.reclaimed.has(index)) return input;
        const deadZone = this.settings.gamepadDeadZone ?? .22;
        input.left = (pad.axes[0] ?? 0) < -deadZone || !!pad.buttons[14]?.pressed;
        input.right = (pad.axes[0] ?? 0) > deadZone || !!pad.buttons[15]?.pressed;
        input.down = (pad.axes[1] ?? 0) > deadZone || !!pad.buttons[13]?.pressed;
        for (const action of ['jump','punch','special','guard','combo'] as const) input[action] = !!pad.buttons[this.settings.gamepadBindings?.[action] ?? defaults[action]]?.pressed;
      }
      return input;
    });
  }
  destroy() {
    this.destroyed = true; cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur); window.removeEventListener('focus', this.focus);
    document.removeEventListener('visibilitychange', this.visibility);
    this.keys.clear(); this.listeners.clear();
  }
  private pads = (): (Gamepad | null)[] => {
    try {
      const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).map(pad => pad ? normalizeController(pad) : null) : [];
      this.blocked = false; return pads;
    } catch { this.blocked = true; return []; }
  };
  private emit(command: MenuCommand, source: MenuSource = 'keyboard') { for (const listener of this.listeners) listener(command, source); }
  private blur = () => { this.focused = false; this.keys.clear(); this.menuDirections.clear(); };
  private focus = () => { this.focused = true; this.keys.clear(); };
  private visibility = () => { if (document.hidden) this.blur(); else this.focused = document.hasFocus(); };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private keyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const textInput = document.activeElement instanceof HTMLElement && (document.activeElement.isContentEditable || document.activeElement.matches('input:not([type=range]):not([type=checkbox]), textarea'));
    if (this.mode === 'game' && editing()) return;
    if (this.mode === 'menu' && textInput && !['Escape', 'Enter', 'ArrowUp', 'ArrowDown'].includes(event.code)) return;
    this.keys.add(event.code);
    if (event.code === 'Escape') {
      event.preventDefault();
      if (!event.repeat) { if (this.mode === 'game') this.onPause?.(); else this.emit('back'); }
      return;
    }
    if (this.mode === 'menu') {
      const command = ({ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', Enter:'confirm', Space:'confirm'} as Record<string, MenuCommand>)[event.code];
      if (command && this.listeners.size) { event.preventDefault(); if (!event.repeat || ['up', 'down', 'left', 'right'].includes(command)) this.emit(command); }
    } else if (this.settings.keyboardBindings?.some(bindings => Object.values(bindings).includes(event.code))) event.preventDefault();
  };
  private scan = () => {
    if (this.destroyed) return;
    const now = performance.now();
    this.focused = document.hasFocus();
    if (!this.focused || document.hidden) { this.keys.clear(); this.menuDirections.clear(); this.stickDirections.clear(); }
    const active = new Set<number>();
    for (const pad of this.pads()) {
      if (!pad?.connected) continue;
      active.add(pad.index);
      const previous = this.previousButtons.get(pad.index) ?? [];
      const buttons = pad.buttons.map(button => button.pressed);
      const edge = (index: number) => buttons[index] && !previous[index];
      const pressed = buttons.findIndex((held, index) => held && !previous[index]);
      if (pressed >= 0) this.lastInputs.set(pad.index, `Button ${pressed}`);
      if (this.focused && !document.hidden && (this.mode === 'menu' || !editing())) {
        const pauseButton = this.mode === 'menu' ? 9 : (this.settings.gamepadBindings?.pause ?? 9);
        if (edge(pauseButton)) { if (this.mode === 'game') this.onPause?.(); else this.emit('pause', 'gamepad'); }
        if (this.mode === 'menu') {
          if (edge(0)) this.emit('confirm', 'gamepad');
          if (edge(1)) this.emit('back', 'gamepad');
          const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
          const deadZone = Math.max(.4, this.settings.gamepadDeadZone ?? .22);
          const previousDirection = this.stickDirections.get(pad.index);
          const threshold = previousDirection ? Math.max(.25, deadZone - .12) : deadZone;
          let stick: MenuCommand | undefined = Math.max(Math.abs(x), Math.abs(y)) > threshold
            ? (Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down')) : undefined;
          if (stick && previousDirection && Math.abs(Math.abs(x) - Math.abs(y)) < .12) {
            const previousAxis = previousDirection === 'left' || previousDirection === 'right' ? x : y;
            const previousSign = previousDirection === 'left' || previousDirection === 'up' ? -1 : 1;
            if (previousAxis * previousSign > threshold) stick = previousDirection;
          }
          if (stick) this.stickDirections.set(pad.index, stick); else this.stickDirections.delete(pad.index);
          const dpad = buttons[14] ? 'left' : buttons[15] ? 'right' : buttons[12] ? 'up' : buttons[13] ? 'down' : undefined;
          const direction = dpad ?? stick;
          const directions: [MenuCommand, boolean][] = (['left','right','up','down'] as const).map(command => [command, direction === command]);
          for (const [command, held] of directions) {
            const key = `${pad.index}:${command}`, next = this.menuDirections.get(key);
            if (!held) this.menuDirections.delete(key);
            else if (next === undefined || now >= next) { this.emit(command, 'gamepad'); this.lastInputs.set(pad.index, command); this.menuDirections.set(key, now + (next === undefined ? 350 : 120)); }
          }
        }
      }
      if (this.mode === 'game') {
        const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
        if (Math.max(Math.abs(x), Math.abs(y)) > Math.max(.4, this.settings.gamepadDeadZone ?? .22)) this.lastInputs.set(pad.index, Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down'));
      }
      this.previousButtons.set(pad.index, buttons);
    }
    for (const index of this.connected) if (!active.has(index)) {
      this.previousButtons.delete(index); this.lastInputs.delete(index); this.stickDirections.delete(index);
      for (const key of this.menuDirections.keys()) if (key.startsWith(`${index}:`)) this.menuDirections.delete(key);
      this.reclaimed.add(index);
      if (this.players.some(player => player.device === `gamepad:${index}`)) { this.keys.clear(); this.onDisconnect?.(); }
    }
    this.connected = active;
    this.raf = requestAnimationFrame(this.scan);
  };
}
