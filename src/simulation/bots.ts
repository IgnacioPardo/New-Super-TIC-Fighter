import { ARENAS, ATTACKS, NAVIGATION, PHYSICS } from '../shared/content';
import type { AttackAction } from '../shared/content';
import { emptyInput } from '../shared/types';
import type { ArenaId, FighterState, InputFrame, MatchConfig, PlayerSeat } from '../shared/types';
import { clamp, supportingPlatform } from './geometry';

interface BotMemory { nextDecision: number; input: InputFrame; moveUntil: number; target?: string; jumpTarget?: number; launchedAt?: number }

/** Estimate only our own issued movement over the observation delay. */
function anticipateMotion(observed: FighterState, input: InputFrame | undefined, ticks: number, movingTicks: number): { x: number; vx: number } {
  if (!input) return { x: observed.x, vx: observed.vx };
  let x = observed.x, vx = observed.vx, action = observed.action, age = observed.actionTime;
  let recovery = observed.recovery, stun = observed.stun, grounded = observed.grounded;
  let facing = observed.facing;
  const requested: AttackAction | undefined = input.combo ? 'combo' : input.special ? input.down ? 'sweep' : 'special' : input.punch ? input.down ? 'uppercut' : 'punch' : undefined;
  for (let tick = 0; tick < ticks; tick++) {
    const direction = tick >= movingTicks || input.left === input.right ? 0 : input.left ? -1 : 1;
    recovery = Math.max(0, recovery - 1 / 60); stun = Math.max(0, stun - 1 / 60);
    if (stun === 0 && action === 'hurt') action = grounded ? 'idle' : 'jump';
    let attack = action in ATTACKS ? action as AttackAction : undefined;
    if (!attack && stun === 0 && direction && (action !== 'guard' || !input.guard)) facing = direction;
    if (!attack && stun === 0 && grounded && requested && recovery < .000001 && action !== 'guard') {
      attack = requested; action = requested; age = 0; vx = 0;
      if (attack === 'uppercut') grounded = false;
    }
    if (stun > 0) { /* Known launch keeps its public horizontal velocity. */ }
    else if (attack) { if (attack === 'sweep') vx = facing * 300; else if (grounded) vx = 0; }
    else if (grounded && (input.down || input.guard && recovery < .000001)) vx = 0;
    else if (direction) {
      if (vx * direction < 0) vx = 0;
      vx = clamp(vx + direction * PHYSICS.acceleration / 60, -PHYSICS.speed, PHYSICS.speed);
    } else vx = 0;
    x += vx / 60;
    if (attack) {
      age += 1 / 60;
      if (age + .000001 >= ATTACKS[attack].windup + ATTACKS[attack].active) { recovery = ATTACKS[attack].recovery; action = grounded ? 'idle' : 'jump'; age = 0; }
    }
  }
  return { x, vx };
}

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
    if (previous && tick < previous.nextDecision) return { ...previous.input, tick, left: previous.input.left && tick < previous.moveUntil, right: previous.input.right && tick < previous.moveUntil };
    const observedSelf = view.fighters.find(fighter => fighter.id === seat.id);
    const input = emptyInput(seat.id, tick);
    if (!observedSelf || observedSelf.eliminated) return input;
    // Compensate for our own already-issued movement using public velocity.
    // Opponent observations remain delayed. Without this braking estimate a
    // 200ms reaction walks 120 units past a narrow launch point before jumping.
    const me = { ...observedSelf, ...anticipateMotion(observedSelf, previous?.input, delay, previous ? clamp(previous.moveUntil - (tick - delay), 0, delay) : 0) };
    const enemies = view.fighters.filter(fighter => !fighter.eliminated && fighter.id !== seat.id &&
      (this.config.mode !== 'teams' || this.config.players.find(player => player.id === fighter.id)?.team !== seat.team));
    const target = enemies.sort((a, b) => Math.abs(a.x - me.x) + Math.abs(a.y - me.y) * 2 - Math.abs(b.x - me.x) - Math.abs(b.y - me.y) * 2)[0];
    if (!target) return input;
    const platforms = ARENAS[this.config.arena].platforms;
    let desiredX = target.x;
    const from = supportingPlatform(observedSelf, platforms);
    const to = supportingPlatform(target, platforms);
    let jumpTarget = previous?.jumpTarget;
    let launchedAt = previous?.launchedAt;
    let leavingPlatform = false;
    if (jumpTarget !== undefined) {
      const landing = platforms[jumpTarget];
      const pending = tick - (launchedAt ?? tick) <= delay;
      if (!pending && ((from === jumpTarget && observedSelf.grounded) || (!observedSelf.grounded && observedSelf.vy > 0 && observedSelf.y > landing.y))) {
        jumpTarget = undefined; launchedAt = undefined;
      } else {
        // Keep the intended upper landing throughout the legal jump instead
        // of steering back toward a lower rescue surface while ascending.
        desiredX = clamp(target.x, landing.x + 36, landing.x + landing.width - 36);
        if (pending) input.jump = true;
      }
    }
    if (jumpTarget === undefined && from >= 0 && to >= 0 && from !== to) {
      const destination = nextPlatform(this.config.arena, from, to);
      if (destination !== undefined) {
        const start = platforms[from];
        const finish = platforms[destination];
        const center = finish.x + finish.width / 2;
        // Launch close to the adjacent landing edge with room for a running jump.
        const launchX = clamp(center, start.x + 36, start.x + start.width - 36);
        desiredX = launchX;
        if (Math.abs(me.x - launchX) < Math.max(48, PHYSICS.speed * delay / 60 * .6) && finish.y <= start.y && me.jumpCooldown <= delay / 60 && me.recovery <= delay / 60) {
          input.jump = true; jumpTarget = destination; launchedAt = tick;
          desiredX = clamp(target.x, finish.x + 36, finish.x + finish.width - 36);
        }
        if (finish.y > start.y) {
          leavingPlatform = true;
          desiredX = center < start.x + start.width / 2 ? start.x - 48 : start.x + start.width + 48;
        }
      }
    } else if (jumpTarget === undefined && !me.grounded) {
      // Recover toward a surface reachable below, using only the delayed state.
      const below = platforms.filter(platform => platform.y >= me.y && platform.y - me.y < 500)
        .sort((a, b) => Math.abs(clamp(me.x, a.x + 35, a.x + a.width - 35) - me.x) - Math.abs(clamp(me.x, b.x + 35, b.x + b.width - 35) - me.x))[0];
      if (below) desiredX = clamp(target.x, below.x + 35, below.x + below.width - 35);
    }
    // A launched opponent is often already falling out of reach. Stay on our
    // supporting surface instead of pursuing it over a lethal edge. Only an
    // authored descent or committed jump may deliberately leave this surface.
    if (from >= 0 && jumpTarget === undefined && !leavingPlatform) {
      const support = platforms[from];
      desiredX = clamp(desiredX, support.x + 40, support.x + support.width - 40);
    }
    const distance = target.x - me.x;
    const targetFacing = distance === 0 ? me.facing : distance < 0 ? -1 : 1;
    if (desiredX < me.x - 22) input.left = true;
    if (desiredX > me.x + 22) input.right = true;
    const close = Math.abs(distance) < 66 && Math.abs(target.y - me.y) < PHYSICS.standingHeight;
    const inRange = Math.abs(distance) < 380 && Math.abs(target.y - me.y) < 110;
    const mistake = this.random.next() < (seat.difficulty === 'easy' ? 0.24 : 0.07);
    if (me.grounded && jumpTarget === undefined && me.recovery <= delay / 60 && me.stun === 0 && !mistake) {
      if (close) {
        if (me.facing !== targetFacing) { input.left = targetFacing === -1; input.right = targetFacing === 1; }
        const choice = this.random.next();
        if (choice < 0.3) input.punch = true;
        else if (choice < 0.5) { input.down = true; input.punch = true; }
        else if (choice < 0.7) {
          const support = platforms[from];
          const edgeDistance = support ? targetFacing === -1 ? me.x - support.x : support.x + support.width - me.x : 0;
          if (edgeDistance >= 140) { input.down = true; input.special = true; }
          else input.punch = true;
        }
        else if (choice < 0.85) input.combo = true;
        else input.special = true;
      } else if (inRange && from === to) {
        if (me.facing !== targetFacing) { input.left = targetFacing === -1; input.right = targetFacing === 1; }
        if (this.random.next() < 0.4) input.combo = true;
        else input.special = true;
      }
      // Guard is a deliberate response to a visible frontal ordinary punch.
      if (target.action === 'punch' && close && this.random.next() < 0.4) {
        input.punch = false; input.special = false; input.combo = false; input.down = false; input.guard = true;
      }
    }
    if (mistake) { input.left = false; input.right = false; input.jump = false; }
    if (mistake && input.jump === false && launchedAt === tick) { jumpTarget = undefined; launchedAt = undefined; }
    // Schedule a release using our known movement, rather than holding a full
    // reaction interval past the destination. This is a normal input release,
    // with no speed/rules advantage, and keeps Easy's 400ms reaction usable.
    const direction = input.left === input.right ? 0 : input.left ? -1 : 1;
    const remaining = Math.max(0, (desiredX - me.x) * direction - 8);
    let movementTicks = 0, travel = 0, speed = Math.max(0, me.vx * direction);
    if (direction) do {
      speed = Math.min(PHYSICS.speed, speed + PHYSICS.acceleration / 60);
      travel += speed / 60; movementTicks++;
    } while (movementTicks < delay && travel < remaining);
    this.memories.set(seat.id, { nextDecision: tick + delay, input, moveUntil: tick + movementTicks, target: target.id, jumpTarget, launchedAt });
    return input;
  }
}
