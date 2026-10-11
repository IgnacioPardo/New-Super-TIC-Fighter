import { ARENAS, ATTACKS, CABLE_WIDTHS, EFFECT_HITS, MELEE_HITS, PHYSICS, RAM_SIZES, WORLD } from '../shared/content';
import type { AttackAction } from '../shared/content';
import { emptyInput, TICK_RATE } from '../shared/types';
import type { EffectKind, EffectState, FighterState, GameplayEvent, InputFrame, MatchConfig, MatchResult, MatchSnapshot, PlayerAction } from '../shared/types';
import { Bots } from './bots';
import { bodyBounds, clamp, effectBottom, overlaps, supportingPlatform, sweptLanding } from './geometry';
import type { Rectangle } from './geometry';

const DT = 1 / TICK_RATE;
const EPSILON = 0.000001;
const isAttack = (action: PlayerAction): action is AttackAction => action in ATTACKS;
interface BufferedAction { action: AttackAction | 'jump'; expires: number; facing: -1 | 1 }
interface HistoryEntry { action: 'left' | 'right' | 'down' | 'jump' | 'punch' | 'special'; tick: number }
interface FighterRuntime {
  previous: InputFrame;
  buffer?: BufferedAction;
  history: HistoryEntry[];
  launched: boolean;
  effect?: EffectState;
  effectBottom: number;
  effectTop: number;
  attackFacing: -1 | 1;
}
interface Hit {
  owner: FighterState; target: FighterState; action: AttackAction;
  effect?: EffectState; damage: number; vx: number; vy: number; blocked: boolean;
}

/** Framework independent authority. Every step is exactly one 60 Hz tick. */
export class Simulation {
  private state?: MatchSnapshot;
  private readonly inputs = new Map<string, InputFrame>();
  private readonly consumedInputs = new Map<string, InputFrame>();
  private readonly runtimes = new Map<string, FighterRuntime>();
  private bots?: Bots;

  createMatch(config: MatchConfig, matchId = `match-${config.seed >>> 0}`): MatchSnapshot {
    if (config.players.length < 2 || config.players.length > 4) throw new Error('A match requires two to four seats.');
    if (new Set(config.players.map(seat => seat.id)).size !== config.players.length) throw new Error('Seat identities must be unique.');
    if (!ARENAS[config.arena]) throw new Error('Unknown arena.');
    if (config.mode === 'teams' && ([0, 1] as const).some(team => config.players.filter(seat => seat.team === team).length !== 2)) throw new Error('Teams require two fighters on each side.');
    const rules = structuredClone(config);
    rules.lives = clamp(Math.trunc(rules.lives) || 3, 1, 9);
    rules.timeLimit = rules.practice ? 0 : Math.max(0, rules.timeLimit);
    this.inputs.clear(); this.consumedInputs.clear(); this.runtimes.clear();
    this.state = {
      matchId, tick: 0, elapsed: 0, phase: 'countdown', countdown: 3,
      config: rules, fighters: [], effects: [], events: [],
    };
    for (const [index, seat] of rules.players.entries()) {
      const spawnIndex = rules.mode === 'teams' ? seat.team + rules.players.slice(0, index).filter(player => player.team === seat.team).length * 2 : index;
      const spawn = ARENAS[rules.arena].spawns[spawnIndex];
      this.state.fighters.push({
        id: seat.id, x: spawn.x, y: spawn.y, vx: 0, vy: 0,
        facing: spawn.x < 683 ? 1 : -1, grounded: true,
        height: PHYSICS.standingHeight, action: 'idle', actionTime: 0,
        recovery: 0, stun: 0, invulnerable: PHYSICS.respawnProtection,
        damage: 0, lives: rules.lives, eliminated: false, jumpCooldown: 0,
      });
      this.resetRuntime(seat.id);
    }
    this.bots = new Bots(rules);
    return this.snapshot();
  }

  setInputs(inputs: InputFrame[]): void {
    if (!this.state || this.state.phase !== 'playing') return;
    for (const input of inputs) {
      const seat = this.state.config.players.find(player => player.id === input.seatId);
      if (!seat || seat.kind === 'bot' || !Number.isFinite(input.tick)) continue;
      const previous = this.inputs.get(input.seatId);
      if (previous && input.tick < previous.tick) continue;
      this.inputs.set(input.seatId, { ...input });
    }
  }

  step(inputs: InputFrame[] = [], options: { prediction?: boolean } = {}): MatchSnapshot {
    const state = this.requireState();
    this.setInputs(inputs);
    if (state.phase === 'paused' || state.phase === 'finished') return this.snapshot();
    state.tick++;
    state.events = state.events.filter(event => state.tick - event.tick <= 120);
    if (state.phase === 'countdown') {
      state.countdown = Math.max(0, state.countdown - DT);
      if (state.countdown < EPSILON) {
        state.countdown = 0; state.phase = 'playing';
        this.clearInputs();
        this.event({ type: 'fight' });
      }
      return this.snapshot();
    }
    state.elapsed += DT;
    if (!options.prediction) this.bots!.observe(state.tick, state.fighters);
    for (const fighter of state.fighters) {
      if (fighter.eliminated) continue;
      const seat = state.config.players.find(player => player.id === fighter.id)!;
      const input = seat.kind === 'bot' && !options.prediction ? this.bots!.input(seat, state.tick) : this.inputs.get(fighter.id) ?? emptyInput(fighter.id, state.tick);
      this.updateFighter(fighter, input);
      // Only a human frame actually received and consumed is acknowledged.
      // Idle fallback frames use authority ticks and cannot acknowledge a
      // guest's independently numbered inputs. Respawn/pause keep this receipt.
      if (seat.kind === 'human' && this.inputs.has(fighter.id)) this.consumedInputs.set(fighter.id, { ...this.runtimes.get(fighter.id)!.previous });
    }
    // Every collision reads this common post-movement, pre-hit state, so trades
    // survive interruption and never depend on the arrival order of inputs.
    if (!options.prediction) this.resolveCombat();
    for (const fighter of state.fighters) {
      if (fighter.eliminated) continue;
      if (isAttack(fighter.action) && fighter.actionTime + EPSILON >= ATTACKS[fighter.action].windup + ATTACKS[fighter.action].active) this.finishAttack(fighter);
    }
    if (!options.prediction) {
      const falling = state.fighters.filter(fighter => !fighter.eliminated && fighter.y > WORLD.deathY);
      for (const fighter of falling) this.fall(fighter);
      this.checkResult();
    }
    this.syncEffects();
    return this.snapshot();
  }

  pause(): MatchSnapshot {
    const state = this.requireState();
    if (state.phase !== 'finished') { state.phase = 'paused'; this.clearInputs(); }
    return this.snapshot();
  }
  resume(): MatchSnapshot {
    const state = this.requireState();
    if (state.phase === 'paused') { state.phase = 'countdown'; state.countdown = 3; this.clearInputs(); }
    return this.snapshot();
  }
  forfeit(seatIds: string[]): MatchSnapshot {
    const state = this.requireState();
    if (state.phase === 'finished') return this.snapshot();
    for (const fighter of state.fighters) {
      if (!seatIds.includes(fighter.id) || fighter.eliminated) continue;
      fighter.lives = 0; fighter.eliminated = true; fighter.action = 'out';
      fighter.vx = 0; fighter.vy = 0; this.resetRuntime(fighter.id);
      this.event({ type: 'fall', seatId: fighter.id });
    }
    this.checkResult(); this.syncEffects();
    return this.snapshot();
  }
  stop(): void { this.state = undefined; this.inputs.clear(); this.consumedInputs.clear(); this.runtimes.clear(); this.bots = undefined; }
  snapshot(): MatchSnapshot {
    this.syncEffects();
    const snapshot = structuredClone(this.requireState()) as MatchSnapshot & { acknowledgedInputs: InputFrame[] };
    snapshot.acknowledgedInputs = [...this.consumedInputs.values()]
      .filter(input => snapshot.config.players.some(seat => seat.id === input.seatId && seat.kind === 'human'))
      .map(input => ({ ...input }));
    return snapshot;
  }

  /** Startup and movement prediction cannot decide damage, stocks or results. */
  predict(inputs: InputFrame[] = []): MatchSnapshot { return this.step(inputs, { prediction: true }); }

  /** Adopt visible authority for bounded guest movement/startup prediction.
   * Hidden combo/bot history deliberately resets; authority still decides hits.
   */
  restore(snapshot: MatchSnapshot & { acknowledgedInputs?: InputFrame[] }, previousInputs: InputFrame[] = snapshot.acknowledgedInputs ?? []): void {
    this.state = structuredClone(snapshot); this.inputs.clear(); this.consumedInputs.clear(); this.runtimes.clear();
    this.bots = new Bots(this.state.config);
    for (const fighter of this.state.fighters) {
      this.resetRuntime(fighter.id);
      const runtime = this.runtimes.get(fighter.id)!;
      const previousInput = previousInputs.find(input => input.seatId === fighter.id);
      if (previousInput) {
        runtime.previous = { ...previousInput };
        this.consumedInputs.set(fighter.id, { ...previousInput });
        if (this.state.phase === 'playing') this.inputs.set(fighter.id, { ...previousInput });
      }
      runtime.launched = fighter.action === 'hurt'; runtime.attackFacing = fighter.facing;
      runtime.effect = this.state.effects.find(effect => effect.ownerId === fighter.id);
      if (runtime.effect) { runtime.effectBottom = runtime.effect.y + runtime.effect.height; runtime.effectTop = runtime.effect.y; }
    }
  }

  private requireState(): MatchSnapshot {
    if (!this.state) throw new Error('Create a match before running the simulation.');
    return this.state;
  }
  private resetRuntime(seatId: string): void {
    this.runtimes.set(seatId, { previous: emptyInput(seatId), history: [], launched: false, effectBottom: 0, effectTop: 0, attackFacing: 1 });
    this.inputs.delete(seatId); this.bots?.reset(seatId);
  }
  private clearInputs(): void {
    this.inputs.clear(); this.bots?.reset();
    for (const [id, runtime] of this.runtimes) {
      runtime.previous = emptyInput(id); runtime.buffer = undefined; runtime.history = [];
    }
  }
  private event(event: Omit<GameplayEvent, 'id' | 'tick'>): void {
    const state = this.requireState();
    const id = `${state.matchId}:${state.tick}:${event.type}:${event.seatId ?? ''}:${event.targetId ?? ''}`;
    if (!state.events.some(existing => existing.id === id)) state.events.push({ ...event, id, tick: state.tick });
  }

  private history(fighter: FighterState, action: HistoryEntry['action']): void {
    const runtime = this.runtimes.get(fighter.id)!;
    const tick = this.requireState().tick;
    runtime.history = runtime.history.filter(entry => tick - entry.tick <= PHYSICS.comboWindow * TICK_RATE);
    if (runtime.history.at(-1)?.action !== action) runtime.history.push({ action, tick });
    if (runtime.history.length > 3) runtime.history.shift();
  }
  private recognizeCombo(fighter: FighterState): -1 | 1 | undefined {
    const history = this.runtimes.get(fighter.id)!.history;
    if (history.length < 2) return;
    const direction = history.at(-2)!;
    if ((direction.action !== 'left' && direction.action !== 'right') || history.at(-1)!.action !== 'down' || this.requireState().tick - direction.tick > 30) return;
    return direction.action === 'left' ? -1 : 1;
  }
  private queue(fighter: FighterState, action: BufferedAction['action'], facing = fighter.facing): void {
    const runtime = this.runtimes.get(fighter.id)!;
    if (runtime.buffer?.action === 'combo' && action === 'special') return;
    runtime.buffer = { action, facing, expires: this.requireState().tick + PHYSICS.inputBuffer * TICK_RATE };
  }

  private updateFighter(fighter: FighterState, input: InputFrame): void {
    const state = this.requireState();
    const runtime = this.runtimes.get(fighter.id)!;
    const platforms = ARENAS[state.config.arena].platforms;
    for (const key of ['recovery', 'stun', 'invulnerable', 'jumpCooldown'] as const) fighter[key] = Math.max(0, fighter[key] - DT);
    if (fighter.stun < EPSILON && fighter.action === 'hurt') { fighter.action = 'idle'; fighter.actionTime = 0; }
    if (runtime.buffer && state.tick > runtime.buffer.expires) runtime.buffer = undefined;
    runtime.history = runtime.history.filter(entry => state.tick - entry.tick <= 30);
    const locked = isAttack(fighter.action) || fighter.stun > EPSILON;
    if (!locked) {
      if (input.left !== input.right) {
        fighter.facing = input.left ? -1 : 1;
        if ((input.left && !runtime.previous.left) || (input.right && !runtime.previous.right)) this.history(fighter, input.left ? 'left' : 'right');
      }
      if (fighter.grounded && input.down && fighter.action !== 'guard') {
        if (fighter.action !== 'crouch') this.history(fighter, 'down');
        fighter.action = 'crouch'; fighter.height = PHYSICS.crouchingHeight;
      } else if (fighter.action === 'crouch') {
        fighter.action = 'idle'; fighter.height = PHYSICS.standingHeight;
      }
      if (!input.guard || !fighter.grounded || input.down) {
        if (fighter.action === 'guard') fighter.action = 'idle';
      } else if (fighter.recovery < EPSILON) {
        fighter.action = 'guard'; fighter.height = PHYSICS.standingHeight;
      }
    }
    // Capture pressed actions even during the last 100ms of recovery/hit stun.
    // Held inputs also retain the original automatic repeat once legal.
    const pressed = (key: keyof Pick<InputFrame, 'combo' | 'special' | 'punch' | 'jump'>): boolean => input[key] && !runtime.previous[key];
    const canRepeat = !locked && fighter.recovery < EPSILON;
    if (pressed('combo') || (input.combo && canRepeat)) this.queue(fighter, 'combo');
    else if (pressed('special') || (input.special && canRepeat)) {
      const comboFacing = !input.down ? this.recognizeCombo(fighter) : undefined;
      this.queue(fighter, comboFacing ? 'combo' : input.down ? 'sweep' : 'special', comboFacing ?? fighter.facing);
      if (comboFacing) runtime.history = [];
    } else if (pressed('punch') || (input.punch && canRepeat)) this.queue(fighter, input.down ? 'uppercut' : 'punch');
    else if (pressed('jump') || (input.jump && canRepeat)) this.queue(fighter, 'jump');

    if (runtime.buffer && !locked && fighter.grounded && fighter.recovery < EPSILON && fighter.action !== 'guard') {
      const { action, facing } = runtime.buffer;
      if (action === 'jump') {
        if (!input.down && fighter.jumpCooldown < EPSILON) {
          fighter.vy = PHYSICS.jumpSpeed; fighter.grounded = false; fighter.jumpCooldown = PHYSICS.jumpCooldown;
          fighter.action = 'jump'; fighter.height = PHYSICS.standingHeight; this.history(fighter, 'jump'); runtime.buffer = undefined;
        }
      } else {
        runtime.buffer = undefined; this.startAttack(fighter, action, facing);
      }
    }

    const attacking = isAttack(fighter.action);
    if (fighter.stun > EPSILON) {
      fighter.action = 'hurt'; fighter.height = PHYSICS.standingHeight;
    } else if (attacking) {
      if (fighter.action === 'sweep') fighter.vx = runtime.attackFacing * 300;
      else if (fighter.grounded) fighter.vx = 0;
    } else if (fighter.action === 'guard' || fighter.action === 'crouch') fighter.vx = 0;
    else if (input.left !== input.right) {
      const direction = input.left ? -1 : 1;
      if (fighter.vx * direction < 0) fighter.vx = 0;
      fighter.vx = clamp(fighter.vx + direction * PHYSICS.acceleration * DT, -PHYSICS.speed, PHYSICS.speed);
    } else if (!runtime.launched) fighter.vx = 0;

    const oldX = fighter.x; const oldFeet = fighter.y;
    fighter.x += fighter.vx * DT;
    if (!fighter.grounded) {
      if (fighter.vy < PHYSICS.fallSpeed) fighter.vy = Math.min(PHYSICS.fallSpeed, fighter.vy + PHYSICS.gravity * DT);
      fighter.y += fighter.vy * DT;
      const landing = fighter.vy > 0 ? sweptLanding(oldX, oldFeet, fighter.x, fighter.y, platforms) : undefined;
      if (landing) {
        fighter.y = landing.y; fighter.vy = 0; fighter.grounded = true;
        if (runtime.launched) { fighter.vx = 0; runtime.launched = false; }
      }
    } else if (supportingPlatform(fighter, platforms) < 0) {
      fighter.grounded = false;
      if (fighter.action === 'sweep') this.finishAttack(fighter);
    }
    if (isAttack(fighter.action)) {
      fighter.actionTime += DT;
      this.updateEffect(fighter);
    } else if (fighter.action !== 'hurt') {
      fighter.actionTime += DT;
      if (!fighter.grounded) { fighter.action = 'jump'; fighter.height = PHYSICS.standingHeight; }
      else if (fighter.action !== 'guard' && fighter.action !== 'crouch') fighter.action = Math.abs(fighter.vx) > EPSILON ? 'walk' : 'idle';
    } else fighter.actionTime += DT;
    runtime.previous = { ...input };
  }

  private startAttack(fighter: FighterState, action: AttackAction, facing: -1 | 1): void {
    const runtime = this.runtimes.get(fighter.id)!;
    runtime.effect = undefined; runtime.attackFacing = facing; runtime.launched = false;
    fighter.action = action; fighter.actionTime = 0; fighter.invulnerable = 0; fighter.facing = facing; fighter.vx = 0;
    fighter.height = action === 'sweep' ? PHYSICS.sweepHeight : PHYSICS.standingHeight;
    if (action === 'uppercut') { fighter.vy = -700; fighter.grounded = false; }
    if (action === 'combo') runtime.history = [];
    else if (action === 'punch' || action === 'special') this.history(fighter, action);
    this.event({ type: 'attack', seatId: fighter.id, action, discipline: this.seatDiscipline(fighter.id) });
    if (action === 'combo' && this.seatDiscipline(fighter.id) === 'design') this.spawnEffect(fighter, 'selection');
  }
  private seatDiscipline(id: string) { return this.requireState().config.players.find(seat => seat.id === id)!.discipline; }
  private finishAttack(fighter: FighterState): void {
    if (!isAttack(fighter.action)) return;
    fighter.recovery = ATTACKS[fighter.action].recovery;
    const wasSweep = fighter.action === 'sweep';
    fighter.action = wasSweep && fighter.grounded ? 'crouch' : fighter.grounded ? 'idle' : 'jump';
    fighter.height = wasSweep && fighter.grounded ? PHYSICS.crouchingHeight : PHYSICS.standingHeight;
    fighter.actionTime = 0; if (fighter.grounded) fighter.vx = 0;
    this.runtimes.get(fighter.id)!.effect = undefined;
  }

  private spawnEffect(fighter: FighterState, kind: EffectKind): void {
    const runtime = this.runtimes.get(fighter.id)!;
    const facing = runtime.attackFacing;
    const sizes: Record<EffectKind, [number, number]> = { cable: [68, 32], mouse: [99, 32], ball: [45, 20], ram: [50, 48], cables: [140, 66], selection: [120, 96], column: [60, 96], disc: [52, 52] };
    const [width, height] = sizes[kind];
    const edge = fighter.x + facing * PHYSICS.bodyWidth / 2;
    const gap = kind === 'ram' || kind === 'cables' ? 50 : kind === 'selection' || kind === 'column' ? 20 : kind === 'cable' ? -9 : kind === 'mouse' ? -5 : 0;
    const x = facing === 1 ? edge + gap : edge - width - gap;
    let y = fighter.y - fighter.height;
    if (kind === 'cable') y -= 5;
    if (kind === 'ball' || kind === 'disc') y = fighter.y - fighter.height / 2 - height / 2 - 20;
    if (kind === 'selection') y = fighter.y - height;
    if (kind === 'ram' || kind === 'cables' || kind === 'column') y = effectBottom(x, width, height, fighter.y, ARENAS[this.requireState().config.arena].platforms) - height;
    runtime.effectBottom = y + height; runtime.effectTop = y;
    const speed = kind === 'mouse' || kind === 'disc' ? 1900 : kind === 'ball' ? 700 : 0;
    runtime.effect = { id: `${this.requireState().matchId}:${this.requireState().tick}:${fighter.id}:${kind}`, ownerId: fighter.id, kind, x, y, width, height, vx: speed * facing, vy: kind === 'column' ? -1900 : 0, facing, age: 0, frame: 0 };
  }
  private updateEffect(fighter: FighterState): void {
    if (fighter.action !== 'special' && fighter.action !== 'combo') return;
    const runtime = this.runtimes.get(fighter.id)!;
    const activeAge = Math.max(0, fighter.actionTime - ATTACKS[fighter.action].windup);
    if (!runtime.effect && fighter.actionTime + EPSILON >= ATTACKS[fighter.action].windup) {
      const discipline = this.seatDiscipline(fighter.id);
      const kinds: Record<typeof discipline, [EffectKind, EffectKind]> = { networks: ['cable', 'cables'], design: ['mouse', 'selection'], code: ['ball', 'column'], hardware: ['ram', 'disc'] };
      this.spawnEffect(fighter, kinds[discipline][fighter.action === 'special' ? 0 : 1]);
    }
    const effect = runtime.effect;
    if (!effect) return;
    effect.age = fighter.actionTime;
    const frame = clamp(Math.floor((activeAge + EPSILON) * 40), 0, 14);
    if (effect.kind === 'cable') { effect.frame = frame; effect.width = CABLE_WIDTHS[frame]; }
    else if (effect.kind === 'ram') { effect.frame = frame; [effect.width, effect.height] = RAM_SIZES[frame]; effect.y = runtime.effectBottom - effect.height; }
    else if (effect.kind === 'cables') effect.frame = frame;
    else if (effect.kind === 'selection') effect.frame = fighter.actionTime < 0.2 ? Math.min(6, Math.floor(fighter.actionTime * 35)) : 7 + frame;
    else if (effect.kind === 'mouse') effect.frame = Math.floor(activeAge * 40) % 10;
    else if (effect.kind === 'ball') effect.frame = Math.floor(activeAge * 20) % 6;
    else if (effect.kind === 'disc') effect.frame = Math.floor(activeAge * 40) % 4;
    if (effect.kind === 'cable' || effect.kind === 'ram' || effect.kind === 'cables' || effect.kind === 'selection') {
      const edge = fighter.x + runtime.attackFacing * 30;
      const gap = effect.kind === 'cable' ? -9 : effect.kind === 'selection' ? 20 : 50;
      effect.x = runtime.attackFacing === 1 ? edge + gap : edge - gap - effect.width;
      if (effect.kind === 'cable') effect.y = runtime.effectTop;
      if (effect.kind === 'cables' || effect.kind === 'selection') effect.y = runtime.effectBottom - effect.height;
    } else {
      // Fast projectile collision uses the swept rectangle below, not only its
      // destination, while its actual visible bounds stay source accurate.
      effect.x += effect.vx * DT; effect.y += effect.vy * DT;
    }
  }

  private effectBounds(effect: EffectState): Rectangle {
    return { x: Math.min(effect.x, effect.x - effect.vx * DT), y: Math.min(effect.y, effect.y - effect.vy * DT), width: effect.width + Math.abs(effect.vx * DT), height: effect.height + Math.abs(effect.vy * DT) };
  }
  private resolveCombat(): void {
    const state = this.requireState();
    const hits: Hit[] = [];
    for (const owner of state.fighters) {
      if (owner.eliminated || !isAttack(owner.action) || owner.actionTime + EPSILON < ATTACKS[owner.action].windup) continue;
      const runtime = this.runtimes.get(owner.id)!;
      const effect = runtime.effect;
      if ((owner.action === 'special' || owner.action === 'combo') && (!effect || (effect.kind === 'selection' && effect.frame < 15))) continue;
      const bounds = effect ? this.effectBounds(effect) : bodyBounds(owner);
      const targets = state.fighters.filter(target => !target.eliminated && target.id !== owner.id && target.stun < EPSILON && target.invulnerable < EPSILON)
        .sort((a, b) => Math.abs(a.x - owner.x) - Math.abs(b.x - owner.x) || a.id.localeCompare(b.id));
      for (const target of targets) {
        const ownerSeat = state.config.players.find(seat => seat.id === owner.id)!;
        const targetSeat = state.config.players.find(seat => seat.id === target.id)!;
        if (state.config.mode === 'teams' && !state.config.friendlyFire && ownerSeat.team === targetSeat.team) continue;
        if (!overlaps(bounds, bodyBounds(target))) continue;
        const direction = runtime.attackFacing;
        if ((owner.action === 'punch' || owner.action === 'uppercut') && (target.x - owner.x) * direction <= -20) continue;
        const blocked = owner.action === 'punch' && target.action === 'guard' && target.facing === -direction;
        const k = target.damage;
        const rule = effect ? EFFECT_HITS[effect.kind] : MELEE_HITS[owner.action as keyof typeof MELEE_HITS];
        const damage = blocked ? 2 : rule.damage;
        const vx = direction * rule.xScale * (rule.xBase + k);
        const vy = -rule.yScale * (rule.yBase + k);
        hits.push({ owner, target, action: owner.action, effect, damage, vx, vy, blocked });
        if (effect?.kind === 'mouse' || effect?.kind === 'ball') break;
      }
    }
    // Resolve at most one launch per victim from the common state. Deterministic
    // attack identity breaks exact ties; attacks on other victims still trade.
    hits.sort((a, b) => a.target.id.localeCompare(b.target.id) || a.owner.id.localeCompare(b.owner.id));
    const resolved = new Set<string>();
    const consumed = new Set<string>();
    for (const hit of hits) {
      if (resolved.has(hit.target.id)) continue;
      resolved.add(hit.target.id);
      const { owner, target, effect, action } = hit;
      target.damage = Math.min(200, target.damage + hit.damage);
      if (hit.blocked) {
        target.x = owner.x + this.runtimes.get(owner.id)!.attackFacing * (PHYSICS.bodyWidth + 20);
        this.event({ type: 'block', seatId: owner.id, targetId: target.id, action });
      } else {
        target.vx = hit.vx; target.vy = hit.vy; target.grounded = false;
        target.facing = hit.vx > 0 ? -1 : 1;
        target.action = 'hurt'; target.actionTime = 0; target.height = PHYSICS.standingHeight;
        target.stun = PHYSICS.hitProtection; target.recovery = 0; target.invulnerable = 0;
        const targetRuntime = this.runtimes.get(target.id)!;
        targetRuntime.launched = true; targetRuntime.effect = undefined; targetRuntime.buffer = undefined; targetRuntime.history = [];
        this.event({ type: 'hit', seatId: owner.id, targetId: target.id, action, discipline: this.seatDiscipline(owner.id) });
      }
      if (effect?.kind === 'mouse' || effect?.kind === 'ball') consumed.add(owner.id);
      if (effect?.kind === 'cable' && effect.frame <= 7 && owner.action === 'special') owner.actionTime = ATTACKS.special.windup + (14 - effect.frame) / 40;
    }
    for (const id of consumed) {
      const owner = state.fighters.find(fighter => fighter.id === id)!;
      // A trade has already interrupted this owner; never overwrite its hurt.
      if (owner.action === 'special') this.finishAttack(owner);
    }
  }

  private fall(fighter: FighterState): void {
    const state = this.requireState();
    this.event({ type: 'fall', seatId: fighter.id });
    if (!state.config.practice) fighter.lives--;
    if (fighter.lives <= 0) {
      fighter.lives = 0; fighter.eliminated = true; fighter.action = 'out';
      fighter.vx = 0; fighter.vy = 0; this.resetRuntime(fighter.id); return;
    }
    const candidates = ARENAS[state.config.arena].spawns;
    const opponents = state.fighters.filter(other => other.id !== fighter.id && !other.eliminated && other.y <= WORLD.deathY);
    const spawn = [...candidates].sort((a, b) => {
      const score = (point: typeof a) => opponents.length ? Math.min(...opponents.map(other => Math.hypot(point.x - other.x, point.y - other.y))) : 0;
      return score(b) - score(a);
    })[0];
    Object.assign(fighter, { x: spawn.x, y: spawn.y, vx: 0, vy: 0, facing: spawn.x < 683 ? 1 : -1, grounded: true, height: PHYSICS.standingHeight, action: 'idle', actionTime: 0, recovery: 0, stun: 0, invulnerable: PHYSICS.respawnProtection, damage: 0, jumpCooldown: 0 });
    this.resetRuntime(fighter.id);
    this.event({ type: 'respawn', seatId: fighter.id });
  }
  private checkResult(): void {
    const state = this.requireState();
    if (state.phase === 'finished' || state.config.practice) return;
    const living = state.fighters.filter(fighter => !fighter.eliminated);
    if (state.config.mode === 'ffa' && living.length <= 1) {
      this.finish({ winners: living.map(fighter => fighter.id), reason: living.length ? 'last-standing' : 'draw' }); return;
    }
    if (state.config.mode === 'teams') {
      const teams = new Set(living.map(fighter => state.config.players.find(seat => seat.id === fighter.id)!.team));
      if (teams.size <= 1) {
        const winningTeam = [...teams][0];
        this.finish({ winners: winningTeam === undefined ? [] : state.config.players.filter(seat => seat.team === winningTeam).map(seat => seat.id), winningTeam, reason: teams.size ? 'last-standing' : 'draw' }); return;
      }
    }
    if (state.config.timeLimit <= 0 || state.elapsed + EPSILON < state.config.timeLimit) return;
    if (state.config.mode === 'ffa') {
      const most = Math.max(...state.fighters.map(fighter => fighter.lives));
      const winners = state.fighters.filter(fighter => fighter.lives === most).map(fighter => fighter.id);
      this.finish({ winners: winners.length === 1 ? winners : [], reason: winners.length === 1 ? 'timeout' : 'draw' });
    } else {
      const totals = ([0, 1] as const).map(team => state.fighters.filter(fighter => state.config.players.find(seat => seat.id === fighter.id)!.team === team).reduce((total, fighter) => total + fighter.lives, 0));
      const winningTeam = totals[0] === totals[1] ? undefined : totals[0] > totals[1] ? 0 : 1;
      this.finish({ winners: winningTeam === undefined ? [] : state.config.players.filter(seat => seat.team === winningTeam).map(seat => seat.id), winningTeam, reason: winningTeam === undefined ? 'draw' : 'timeout' });
    }
  }
  private finish(result: MatchResult): void {
    const state = this.requireState(); state.phase = 'finished'; state.result = result;
    this.clearInputs(); this.event({ type: 'result' });
  }
  private syncEffects(): void {
    if (!this.state) return;
    this.state.effects = [...this.runtimes.values()].flatMap(runtime => runtime.effect ? [runtime.effect] : []);
  }
}
