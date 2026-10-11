import { ARENAS, NAVIGATION, PHYSICS } from '../shared/content';
import { emptyInput } from '../shared/types';
import type { ArenaId, FighterState, InputFrame, MatchConfig, PlayerSeat } from '../shared/types';
import { clamp, supportingPlatform } from './geometry';

interface BotMemory { nextDecision: number; input: InputFrame; target?: string }

/** A seeded generator is shared only by bots, never by rendering/audio. */
export class Random {
  private value: number;
  constructor(seed: number) { this.value = seed >>> 0 || 0x9e3779b9; }
  next(): number {
    let value = this.value;
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    this.value = value >>> 0;
    return this.value / 0x100000000;
  }
}

function nextPlatform(arena: ArenaId, from: number, to: number): number | undefined {
  const queue: number[][] = [[from]];
  const visited = new Set([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    if (current === to) return path[1];
    for (const [a, b] of NAVIGATION[arena]) {
      if (a !== current || visited.has(b)) continue;
      visited.add(b); queue.push([...path, b]);
    }
  }
}

export class Bots {
  private readonly memories = new Map<string, BotMemory>();
  private readonly observations: { tick: number; fighters: FighterState[] }[] = [];
  private readonly random: Random;
  constructor(private readonly config: MatchConfig) { this.random = new Random(config.seed); }
  reset(seatId?: string): void {
    if (seatId) this.memories.delete(seatId);
    else { this.memories.clear(); this.observations.length = 0; }
  }
  observe(tick: number, fighters: FighterState[]): void {
    this.observations.push({ tick, fighters: fighters.map(fighter => ({ ...fighter })) });
    while (this.observations.length > 30) this.observations.shift();
  }
  input(seat: PlayerSeat, tick: number): InputFrame {
    if (seat.difficulty === 'dummy') return emptyInput(seat.id, tick);
    const delay = seat.difficulty === 'easy' ? 24 : 12;
    const view = [...this.observations].reverse().find(observation => observation.tick <= tick - delay);
    if (!view) return emptyInput(seat.id, tick);
    const previous = this.memories.get(seat.id);
    if (previous && tick < previous.nextDecision) return { ...previous.input, tick };
    const me = view.fighters.find(fighter => fighter.id === seat.id);
    const input = emptyInput(seat.id, tick);
    if (!me || me.eliminated) return input;
    const enemies = view.fighters.filter(fighter => !fighter.eliminated && fighter.id !== seat.id &&
      (this.config.mode !== 'teams' || this.config.players.find(player => player.id === fighter.id)?.team !== seat.team));
    const target = enemies.sort((a, b) => Math.abs(a.x - me.x) + Math.abs(a.y - me.y) * 2 - Math.abs(b.x - me.x) - Math.abs(b.y - me.y) * 2)[0];
    if (!target) return input;
    const platforms = ARENAS[this.config.arena].platforms;
    let desiredX = target.x;
    const from = supportingPlatform(me, platforms);
    const to = supportingPlatform(target, platforms);
    if (from >= 0 && to >= 0 && from !== to) {
      const destination = nextPlatform(this.config.arena, from, to);
      if (destination !== undefined) {
        const start = platforms[from];
        const finish = platforms[destination];
        const center = finish.x + finish.width / 2;
        // Launch close to the adjacent landing edge with room for a running jump.
        const launchX = clamp(center, start.x + 36, start.x + start.width - 36);
        desiredX = Math.abs(me.x - launchX) > 42 ? launchX : clamp(me.x, finish.x + 36, finish.x + finish.width - 36);
        if (Math.abs(me.x - launchX) < 48 && finish.y <= start.y) input.jump = true;
        if (finish.y > start.y) desiredX = center < start.x + start.width / 2 ? start.x - 48 : start.x + start.width + 48;
      }
    } else if (!me.grounded) {
      // Recover toward a surface reachable below, using only the delayed state.
      const below = platforms.filter(platform => platform.y >= me.y && platform.y - me.y < 500)
        .sort((a, b) => Math.abs(clamp(me.x, a.x + 35, a.x + a.width - 35) - me.x) - Math.abs(clamp(me.x, b.x + 35, b.x + b.width - 35) - me.x))[0];
      if (below) desiredX = clamp(target.x, below.x + 35, below.x + below.width - 35);
    }
    const distance = target.x - me.x;
    if (desiredX < me.x - 22) input.left = true;
    if (desiredX > me.x + 22) input.right = true;
    const close = Math.abs(distance) < 66 && Math.abs(target.y - me.y) < PHYSICS.standingHeight;
    const inRange = Math.abs(distance) < 380 && Math.abs(target.y - me.y) < 110;
    const mistake = this.random.next() < (seat.difficulty === 'easy' ? 0.24 : 0.07);
    if (me.grounded && me.recovery <= delay / 60 && me.stun === 0 && !mistake) {
      if (close) {
        input.left = distance < 0; input.right = distance > 0;
        const choice = this.random.next();
        if (choice < 0.3) input.punch = true;
        else if (choice < 0.5) { input.down = true; input.punch = true; }
        else if (choice < 0.7) { input.down = true; input.special = true; }
        else if (choice < 0.85) input.combo = true;
        else input.special = true;
      } else if (inRange && from === to) {
        input.left = distance < 0; input.right = distance > 0;
        if (this.random.next() < 0.4) input.combo = true;
        else input.special = true;
      }
      // Guard is a deliberate response to a visible frontal ordinary punch.
      if (target.action === 'punch' && close && this.random.next() < 0.4) {
        input.punch = false; input.special = false; input.combo = false; input.down = false; input.guard = true;
      }
    }
    if (mistake) { input.left = false; input.right = false; input.jump = false; }
    this.memories.set(seat.id, { nextDecision: tick + delay, input, target: target.id });
    return input;
  }
}
