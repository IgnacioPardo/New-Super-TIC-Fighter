import {
  ARENAS,
  ATTACKS,
  CABLE_WIDTHS,
  EFFECT_HITS,
  MELEE_HITS,
  PHYSICS,
  RAM_SIZES,
  WORLD,
} from '../shared/content';
import type { AttackAction } from '../shared/content';
import { emptyInput, TICK_RATE } from '../shared/types';
import type {
  EffectKind,
  EffectState,
  FighterState,
  GameplayEvent,
  InputFrame,
  MatchConfig,
  MatchResult,
  MatchSnapshot,
  PlayerAction,
  FighterRuntimeState,
  DeployableState,
  ItemKind,
  TrainingCommand,
} from '../shared/types';
import { Bots, Random } from './bots';
import { bodyBounds, clamp, effectBottom, overlaps, supportingPlatform, sweptLanding } from './geometry';
import type { Rectangle } from './geometry';

const DT = 1 / TICK_RATE;
const EPSILON = 0.000001;
const isAttack = (action: PlayerAction): action is AttackAction => action in ATTACKS;
interface BufferedAction {
  action: AttackAction | 'jump';
  expires: number;
  facing: -1 | 1;
}
interface HistoryEntry {
  action: 'left' | 'right' | 'down' | 'jump' | 'punch' | 'special';
  tick: number;
}
interface FighterRuntime {
  previous: InputFrame;
  buffer?: BufferedAction;
  history: HistoryEntry[];
  launched: boolean;
  effect?: EffectState;
  effectBottom: number;
  effectTop: number;
  attackFacing: -1 | 1;
  hitTargets?: string[];
  lastHitBy?: string;
  lastHitTick?: number;
  dodgeRemaining?: number;
  echo?: FighterRuntimeState['echo'];
  bounces?: number;
}
interface Hit {
  owner: FighterState;
  target: FighterState;
  action: AttackAction;
  effect?: EffectState;
  damage: number;
  vx: number;
  vy: number;
  blocked: boolean;
}

/** Framework independent authority. Every step is exactly one 60 Hz tick. */
export class Simulation {
  private state?: MatchSnapshot;
  private readonly inputs = new Map<string, InputFrame>();
  private readonly consumedInputs = new Map<string, InputFrame>();
  private readonly runtimes = new Map<string, FighterRuntime>();
  private bots?: Bots;
  private random = new Random(1);
  private nextItem = 8;
  private serial = 0;
  private projectiles: { effect: EffectState; ttl: number; hitTargets: string[]; bounces?: number }[] = [];
  private get expanded(): boolean {
    return this.state?.config.ruleset === 'expanded';
  }
  private platforms() {
    return (
      this.requireState().platforms?.filter((p) => p.active !== false) ??
      ARENAS[this.requireState().config.arena].platforms
    );
  }

  createMatch(config: MatchConfig, matchId = `match-${config.seed >>> 0}`): MatchSnapshot {
    if (config.players.length < 2 || config.players.length > (config.gameMode === 'royale' ? 8 : 4))
      throw new Error('A match requires two to four seats, or up to eight in Royale.');
    if (new Set(config.players.map((seat) => seat.id)).size !== config.players.length)
      throw new Error('Seat identities must be unique.');
    if (!ARENAS[config.arena]) throw new Error('Unknown arena.');
    if (
      config.mode === 'teams' &&
      ([0, 1] as const).some((team) => config.players.filter((seat) => seat.team === team).length !== 2)
    )
      throw new Error('Teams require two fighters on each side.');
    const rules = structuredClone(config);
    rules.ruleset ??= 'classic';
    if (
      rules.ruleset === 'classic' &&
      rules.players.some((p) => !['networks', 'design', 'code', 'hardware'].includes(p.discipline))
    )
      throw new Error('Classic supports the original four disciplines.');
    if (rules.gameMode === 'survival') {
      const humans = rules.players.filter((p) => p.kind === 'human').length;
      if (humans < 1 || humans > 2 || !rules.players.some((p) => p.kind === 'bot'))
        throw new Error('Survival requires one or two humans and at least one CPU.');
    }
    if (rules.ruleset === 'classic') {
      rules.items = false;
      rules.hazards = false;
    }
    if (rules.gameMode === 'royale') {
      rules.lives = 1;
      rules.timeLimit = 240;
      rules.mode = 'ffa';
    }
    if (rules.gameMode === 'timed' || rules.gameMode === 'hill') rules.timeLimit = rules.timeLimit || 180;
    if (rules.gameMode === 'training') {
      rules.practice = true;
      rules.timeLimit = 0;
    }
    rules.lives = clamp(Math.trunc(rules.lives) || 3, 1, 9);
    rules.timeLimit = rules.practice ? 0 : Math.max(0, rules.timeLimit);
    this.inputs.clear();
    this.consumedInputs.clear();
    this.runtimes.clear();
    this.projectiles = [];
    this.random = new Random(rules.seed ^ 0x726963);
    this.nextItem = 8;
    this.serial = 0;
    this.state = {
      matchId,
      tick: 0,
      elapsed: 0,
      phase: 'countdown',
      countdown: 3,
      config: rules,
      fighters: [],
      effects: [],
      events: [],
      platforms: structuredClone(ARENAS[rules.arena].platforms),
      deployables: [],
      items: [],
      scores: Object.fromEntries(rules.players.map((p) => [p.id, { kos: 0, selfDestructs: 0, hill: 0 }])),
      objective:
        rules.gameMode === 'hill'
          ? { x: 533, y: 220, width: 300, height: 430 }
          : rules.gameMode === 'royale'
            ? { x: -220, y: -150, width: 1806, height: 1350, safeLeft: -220, safeRight: 1586 }
            : rules.gameMode === 'survival'
              ? { x: 0, y: 0, width: 0, height: 0, wave: 1, nextWave: 0 }
              : undefined,
      training: rules.practice
        ? {
            hitboxes: false,
            inputHistory: [],
            recording: false,
            playback: false,
            dummyRecording: [],
            playbackIndex: 0,
          }
        : undefined,
    };
    for (const [index, seat] of rules.players.entries()) {
      const spawnIndex =
        rules.mode === 'teams'
          ? seat.team + rules.players.slice(0, index).filter((player) => player.team === seat.team).length * 2
          : index;
      const spawn = ARENAS[rules.arena].spawns[spawnIndex % ARENAS[rules.arena].spawns.length];
      this.state.fighters.push({
        id: seat.id,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        facing: spawn.x < 683 ? 1 : -1,
        grounded: true,
        height: PHYSICS.standingHeight,
        action: 'idle',
        actionTime: 0,
        recovery: 0,
        stun: 0,
        invulnerable: PHYSICS.respawnProtection,
        damage: 0,
        lives: rules.lives,
        eliminated: false,
        jumpCooldown: 0,
        airJumps: 1,
        airDash: true,
        recoveryAvailable: true,
        dodgeCooldown: 0,
        abilityCooldown: 0,
        guardMeter: 100,
        buffs: {},
      });
      this.resetRuntime(seat.id);
    }
    this.bots = new Bots(rules);
    return this.snapshot();
  }

  setInputs(inputs: InputFrame[]): void {
    if (!this.state || this.state.phase !== 'playing') return;
    for (const input of inputs) {
      const seat = this.state.config.players.find((player) => player.id === input.seatId);
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
    state.events = state.events.filter((event) => state.tick - event.tick <= 120);
    if (state.phase === 'countdown') {
      state.countdown = Math.max(0, state.countdown - DT);
      if (state.countdown < EPSILON) {
        state.countdown = 0;
        state.phase = 'playing';
        this.clearInputs();
        this.event({ type: 'fight' });
      }
      return this.snapshot();
    }
    state.elapsed += DT;
    if (this.expanded) this.updateWorld(!options.prediction);
    if (!options.prediction) this.bots!.observe(state.tick, state.fighters);
    for (const fighter of state.fighters) {
      if (fighter.eliminated) continue;
      const seat = state.config.players.find((player) => player.id === fighter.id)!;
      let input =
        seat.kind === 'bot' && !options.prediction
          ? this.bots!.input(seat, state.tick, state)
          : (this.inputs.get(fighter.id) ?? emptyInput(fighter.id, state.tick));
      if (
        state.training &&
        seat.kind === 'bot' &&
        state.training.playback &&
        state.training.dummyRecording.length
      ) {
        input = {
          ...state.training.dummyRecording[
            state.training.playbackIndex++ % state.training.dummyRecording.length
          ],
          seatId: seat.id,
          tick: state.tick,
        };
      }
      if (state.training && seat.kind === 'human') {
        state.training.inputHistory.push({ ...input });
        state.training.inputHistory = state.training.inputHistory.slice(-120);
        if (state.training.recording && state.training.dummyRecording.length < 600)
          state.training.dummyRecording.push({ ...input });
      }
      if (this.expanded) this.updateExpandedFighter(fighter, input);
      else this.updateFighter(fighter, input);
      // Only a human frame actually received and consumed is acknowledged.
      // Idle fallback frames use authority ticks and cannot acknowledge a
      // guest's independently numbered inputs. Respawn/pause keep this receipt.
      if (seat.kind === 'human' && this.inputs.has(fighter.id))
        this.consumedInputs.set(fighter.id, { ...this.runtimes.get(fighter.id)!.previous });
    }
    // Every collision reads this common post-movement, pre-hit state, so trades
    // survive interruption and never depend on the arrival order of inputs.
    if (!options.prediction) {
      this.resolveCombat();
      if (this.expanded) this.resolveWorldCombat();
    }
    for (const fighter of state.fighters) {
      if (fighter.eliminated) continue;
      if (
        isAttack(fighter.action) &&
        fighter.actionTime + EPSILON >= ATTACKS[fighter.action].windup + ATTACKS[fighter.action].active
      )
        this.finishAttack(fighter);
    }
    if (!options.prediction) {
      const falling = state.fighters.filter(
        (fighter) =>
          !fighter.eliminated &&
          (fighter.y > WORLD.deathY || (this.expanded && (fighter.x < -450 || fighter.x > 1816))),
      );
      if (state.config.gameMode === 'royale')
        for (const fighter of falling)
          state.scores![fighter.id].placement =
            state.fighters.filter((f) => !f.eliminated).length - falling.length + 1;
      for (const fighter of falling) this.fall(fighter);
      this.checkResult();
    }
    this.syncEffects();
    return this.snapshot();
  }

  pause(): MatchSnapshot {
    const state = this.requireState();
    if (state.phase !== 'finished') {
      state.phase = 'paused';
      this.clearInputs();
    }
    return this.snapshot();
  }
  resume(): MatchSnapshot {
    const state = this.requireState();
    if (state.phase === 'paused') {
      state.phase = 'countdown';
      state.countdown = 3;
      this.clearInputs();
    }
    return this.snapshot();
  }
  forfeit(seatIds: string[]): MatchSnapshot {
    const state = this.requireState();
    if (state.phase === 'finished') return this.snapshot();
    const forfeiting = state.fighters.filter((f) => seatIds.includes(f.id) && !f.eliminated);
    if (state.config.gameMode === 'royale')
      for (const f of forfeiting)
        state.scores![f.id].placement =
          state.fighters.filter((f) => !f.eliminated).length - forfeiting.length + 1;
    for (const fighter of state.fighters) {
      if (!seatIds.includes(fighter.id) || fighter.eliminated) continue;
      fighter.lives = 0;
      fighter.eliminated = true;
      fighter.action = 'out';
      fighter.vx = 0;
      fighter.vy = 0;
      this.resetRuntime(fighter.id);
      this.event({ type: 'fall', seatId: fighter.id });
    }
    this.checkResult();
    this.syncEffects();
    return this.snapshot();
  }
  stop(): void {
    this.state = undefined;
    this.inputs.clear();
    this.consumedInputs.clear();
    this.runtimes.clear();
    this.bots = undefined;
  }
  snapshot(): MatchSnapshot {
    this.syncEffects();
    const snapshot = structuredClone(this.requireState()) as MatchSnapshot & {
      acknowledgedInputs: InputFrame[];
    };
    snapshot.runtime = {
      fighters: structuredClone([...this.runtimes.entries()]),
      inputs: structuredClone([...this.inputs.values()]),
      bot: this.bots?.serialize(),
      random: this.random.state(),
      nextItem: this.nextItem,
      serial: this.serial,
      projectiles: structuredClone(this.projectiles),
    };
    snapshot.acknowledgedInputs = [...this.consumedInputs.values()]
      .filter((input) =>
        snapshot.config.players.some((seat) => seat.id === input.seatId && seat.kind === 'human'),
      )
      .map((input) => ({ ...input }));
    return snapshot;
  }

  /** Startup and movement prediction cannot decide damage, stocks or results. */
  predict(inputs: InputFrame[] = []): MatchSnapshot {
    return this.step(inputs, { prediction: true });
  }

  /** Adopt visible authority for bounded guest movement/startup prediction.
   * Hidden combo/bot history deliberately resets; authority still decides hits.
   */
  restore(
    snapshot: MatchSnapshot & { acknowledgedInputs?: InputFrame[] },
    previousInputs: InputFrame[] = snapshot.acknowledgedInputs ?? [],
  ): void {
    this.state = structuredClone(snapshot);
    this.inputs.clear();
    this.consumedInputs.clear();
    this.runtimes.clear();
    this.bots = new Bots(this.state.config);
    if (snapshot.runtime) {
      const saved = snapshot.runtime;
      this.random.restore(saved.random);
      this.nextItem = saved.nextItem;
      this.serial = saved.serial;
      this.projectiles = structuredClone(saved.projectiles ?? []);
      for (const [id, runtime] of saved.fighters)
        this.runtimes.set(id, structuredClone(runtime) as FighterRuntime);
      for (const input of saved.inputs) this.inputs.set(input.seatId, { ...input });
      for (const input of snapshot.acknowledgedInputs ?? [])
        this.consumedInputs.set(input.seatId, { ...input });
      if (saved.bot) this.bots.restore(saved.bot);
      // Explicit receipt override is used by guest reconciliation only.
      for (const input of previousInputs) {
        const runtime = this.runtimes.get(input.seatId);
        if (runtime) runtime.previous = { ...input };
      }
      return;
    }
    this.projectiles = [];
    this.random = new Random(snapshot.config.seed ^ 0x726963);
    this.nextItem = 8;
    this.serial = 0;
    for (const fighter of this.state.fighters) {
      this.resetRuntime(fighter.id);
      const runtime = this.runtimes.get(fighter.id)!;
      const previousInput = previousInputs.find((input) => input.seatId === fighter.id);
      if (previousInput) {
        runtime.previous = { ...previousInput };
        this.consumedInputs.set(fighter.id, { ...previousInput });
        if (this.state.phase === 'playing') this.inputs.set(fighter.id, { ...previousInput });
      }
      runtime.launched = fighter.action === 'hurt';
      runtime.attackFacing = fighter.facing;
      runtime.effect = this.state.effects.find((effect) => effect.ownerId === fighter.id);
      if (runtime.effect) {
        runtime.effectBottom = runtime.effect.y + runtime.effect.height;
        runtime.effectTop = runtime.effect.y;
      }
    }
  }

  private requireState(): MatchSnapshot {
    if (!this.state) throw new Error('Create a match before running the simulation.');
    return this.state;
  }
  private resetRuntime(seatId: string): void {
    this.runtimes.set(seatId, {
      previous: emptyInput(seatId),
      history: [],
      launched: false,
      effectBottom: 0,
      effectTop: 0,
      attackFacing: 1,
    });
    this.inputs.delete(seatId);
    this.bots?.reset(seatId);
  }
  private clearInputs(): void {
    this.inputs.clear();
    this.bots?.reset();
    for (const [id, runtime] of this.runtimes) {
      runtime.previous = emptyInput(id);
      runtime.buffer = undefined;
      runtime.history = [];
    }
  }
  private event(event: Omit<GameplayEvent, 'id' | 'tick'>): void {
    const state = this.requireState();
    const id = `${state.matchId}:${state.tick}:${event.type}:${event.seatId ?? ''}:${event.targetId ?? ''}`;
    if (!state.events.some((existing) => existing.id === id))
      state.events.push({ ...event, id, tick: state.tick });
  }

  private history(fighter: FighterState, action: HistoryEntry['action']): void {
    const runtime = this.runtimes.get(fighter.id)!;
    const tick = this.requireState().tick;
    runtime.history = runtime.history.filter((entry) => tick - entry.tick <= PHYSICS.comboWindow * TICK_RATE);
    if (runtime.history.at(-1)?.action !== action) runtime.history.push({ action, tick });
    if (runtime.history.length > 3) runtime.history.shift();
  }
  private recognizeCombo(fighter: FighterState): -1 | 1 | undefined {
    const history = this.runtimes.get(fighter.id)!.history;
    if (history.length < 2) return;
    const direction = history.at(-2)!;
    if (
      (direction.action !== 'left' && direction.action !== 'right') ||
      history.at(-1)!.action !== 'down' ||
      this.requireState().tick - direction.tick > 30
    )
      return;
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
    const platforms = this.platforms();
    for (const key of ['recovery', 'stun', 'invulnerable', 'jumpCooldown'] as const)
      fighter[key] = Math.max(0, fighter[key] - DT);
    if (fighter.stun < EPSILON && fighter.action === 'hurt') {
      fighter.action = 'idle';
      fighter.actionTime = 0;
    }
    if (runtime.buffer && state.tick > runtime.buffer.expires) runtime.buffer = undefined;
    runtime.history = runtime.history.filter((entry) => state.tick - entry.tick <= 30);
    const locked = isAttack(fighter.action) || fighter.stun > EPSILON;
    if (!locked) {
      if (input.left !== input.right && (fighter.action !== 'guard' || !input.guard)) {
        fighter.facing = input.left ? -1 : 1;
        if ((input.left && !runtime.previous.left) || (input.right && !runtime.previous.right))
          this.history(fighter, input.left ? 'left' : 'right');
      }
      if (fighter.grounded && input.down && fighter.action !== 'guard') {
        if (fighter.action !== 'crouch') this.history(fighter, 'down');
        fighter.action = 'crouch';
        fighter.height = PHYSICS.crouchingHeight;
      } else if (fighter.action === 'crouch') {
        fighter.action = 'idle';
        fighter.height = PHYSICS.standingHeight;
      }
      if (!input.guard || !fighter.grounded) {
        if (fighter.action === 'guard') fighter.action = 'idle';
      } else if (!input.down && fighter.recovery < EPSILON) {
        fighter.action = 'guard';
        fighter.height = PHYSICS.standingHeight;
      }
    }
    // Capture pressed actions even during the last 100ms of recovery/hit stun.
    // Held inputs also retain the original automatic repeat once legal.
    const pressed = (key: keyof Pick<InputFrame, 'combo' | 'special' | 'punch' | 'jump'>): boolean =>
      input[key] && !runtime.previous[key];
    const canRepeat = !locked && fighter.recovery < EPSILON;
    if (pressed('combo') || (input.combo && canRepeat)) this.queue(fighter, 'combo');
    else if (pressed('special') || (input.special && canRepeat)) {
      const comboFacing = !input.down ? this.recognizeCombo(fighter) : undefined;
      this.queue(
        fighter,
        comboFacing ? 'combo' : input.down ? 'sweep' : 'special',
        comboFacing ?? fighter.facing,
      );
      if (comboFacing) runtime.history = [];
    } else if (pressed('punch') || (input.punch && canRepeat))
      this.queue(fighter, input.down ? 'uppercut' : 'punch');
    else if (pressed('jump') || (input.jump && canRepeat)) this.queue(fighter, 'jump');

    if (
      runtime.buffer &&
      !locked &&
      fighter.grounded &&
      fighter.recovery < EPSILON &&
      fighter.action !== 'guard'
    ) {
      const { action, facing } = runtime.buffer;
      if (action === 'jump') {
        if (!input.down && fighter.jumpCooldown < EPSILON) {
          fighter.vy = PHYSICS.jumpSpeed;
          fighter.grounded = false;
          fighter.jumpCooldown = PHYSICS.jumpCooldown;
          fighter.action = 'jump';
          fighter.height = PHYSICS.standingHeight;
          this.history(fighter, 'jump');
          runtime.buffer = undefined;
        }
      } else {
        runtime.buffer = undefined;
        this.startAttack(fighter, action, facing);
      }
    }

    const attacking = isAttack(fighter.action);
    if (fighter.stun > EPSILON) {
      fighter.action = 'hurt';
      fighter.height = PHYSICS.standingHeight;
    } else if (attacking) {
      if (fighter.action === 'sweep') fighter.vx = runtime.attackFacing * 300;
      else if (fighter.grounded) fighter.vx = 0;
    } else if (fighter.action === 'guard' || fighter.action === 'crouch') fighter.vx = 0;
    else if (input.left !== input.right) {
      const direction = input.left ? -1 : 1;
      if (fighter.vx * direction < 0) fighter.vx = 0;
      fighter.vx = clamp(fighter.vx + direction * PHYSICS.acceleration * DT, -PHYSICS.speed, PHYSICS.speed);
    } else if (!runtime.launched) fighter.vx = 0;

    const oldX = fighter.x;
    const oldFeet = fighter.y;
    fighter.x += fighter.vx * DT;
    if (!fighter.grounded) {
      if (fighter.vy < PHYSICS.fallSpeed)
        fighter.vy = Math.min(PHYSICS.fallSpeed, fighter.vy + PHYSICS.gravity * DT);
      fighter.y += fighter.vy * DT;
      const landing =
        fighter.vy > 0 ? sweptLanding(oldX, oldFeet, fighter.x, fighter.y, platforms) : undefined;
      if (landing) {
        fighter.y = landing.y;
        fighter.vy = 0;
        fighter.grounded = true;
        if (runtime.launched) {
          fighter.vx = 0;
          runtime.launched = false;
        }
      }
    } else if (supportingPlatform(fighter, platforms) < 0) {
      fighter.grounded = false;
      if (fighter.action === 'sweep') this.finishAttack(fighter);
    }
    if (isAttack(fighter.action)) {
      const before = fighter.actionTime;
      fighter.actionTime += DT;
      if (
        (fighter.action === 'special' || fighter.action === 'combo') &&
        before + EPSILON < ATTACKS[fighter.action].windup &&
        fighter.actionTime + EPSILON >= ATTACKS[fighter.action].windup
      ) {
        this.event({
          type: 'active',
          seatId: fighter.id,
          action: fighter.action,
          discipline: this.seatDiscipline(fighter.id),
        });
      }
      this.updateEffect(fighter);
    } else if (fighter.action !== 'hurt') {
      fighter.actionTime += DT;
      if (!fighter.grounded) {
        fighter.action = 'jump';
        fighter.height = PHYSICS.standingHeight;
      } else if (fighter.action !== 'guard' && fighter.action !== 'crouch')
        fighter.action = Math.abs(fighter.vx) > EPSILON ? 'walk' : 'idle';
    } else fighter.actionTime += DT;
    runtime.previous = { ...input };
  }

  private startAttack(fighter: FighterState, action: AttackAction, facing: -1 | 1): void {
    const runtime = this.runtimes.get(fighter.id)!;
    runtime.hitTargets = [];
    runtime.effect = undefined;
    runtime.attackFacing = facing;
    runtime.launched = false;
    fighter.poseAction = action;
    fighter.action = action;
    fighter.actionTime = 0;
    fighter.invulnerable = 0;
    fighter.facing = facing;
    fighter.vx = 0;
    fighter.height = action === 'sweep' ? PHYSICS.sweepHeight : PHYSICS.standingHeight;
    if (this.expanded && action === 'recover') {
      fighter.vy = -1050;
      fighter.grounded = false;
      fighter.recoveryAvailable = false;
    }
    if (this.expanded && action === 'air-down') fighter.vy = Math.max(300, fighter.vy);
    if (this.expanded && this.seatDiscipline(fighter.id) === 'ai')
      runtime.echo = { at: this.requireState().tick + 30, action, facing, x: fighter.x, y: fighter.y };
    if (action === 'uppercut') {
      fighter.vy = -700;
      fighter.grounded = false;
    }
    if (action === 'combo') runtime.history = [];
    else if (action === 'punch' || action === 'special') this.history(fighter, action);
    this.event({ type: 'attack', seatId: fighter.id, action, discipline: this.seatDiscipline(fighter.id) });
    if (action === 'combo' && this.seatDiscipline(fighter.id) === 'design')
      this.spawnEffect(fighter, 'selection');
  }
  private seatDiscipline(id: string) {
    return this.requireState().config.players.find((seat) => seat.id === id)!.discipline;
  }
  private finishAttack(fighter: FighterState): void {
    if (!isAttack(fighter.action)) return;
    fighter.recovery = ATTACKS[fighter.action].recovery;
    const wasSweep = fighter.action === 'sweep';
    fighter.action = wasSweep && fighter.grounded ? 'crouch' : fighter.grounded ? 'idle' : 'jump';
    fighter.height = wasSweep && fighter.grounded ? PHYSICS.crouchingHeight : PHYSICS.standingHeight;
    fighter.actionTime = 0;
    if (fighter.grounded) fighter.vx = 0;
    this.runtimes.get(fighter.id)!.effect = undefined;
  }

  private spawnEffect(fighter: FighterState, kind: EffectKind): void {
    const runtime = this.runtimes.get(fighter.id)!;
    const facing = runtime.attackFacing;
    const sizes: Record<EffectKind, [number, number]> = {
      echo: [110, 70],
      mechanical: [210, 42],
      wireless: [28, 28],
      hub: [150, 110],
      displacement: [140, 70],
      ricochet: [32, 32],
      piston: [90, 150],
      usb: [24, 18],
      cable: [68, 32],
      mouse: [99, 32],
      ball: [45, 20],
      ram: [50, 48],
      cables: [140, 66],
      selection: [120, 96],
      column: [60, 96],
      disc: [52, 52],
    };
    const [width, height] = sizes[kind];
    const edge = fighter.x + (facing * PHYSICS.bodyWidth) / 2;
    const gap =
      kind === 'ram' || kind === 'cables'
        ? 50
        : kind === 'selection' || kind === 'column'
          ? 20
          : kind === 'cable'
            ? -9
            : kind === 'mouse'
              ? -5
              : 0;
    const x = facing === 1 ? edge + gap : edge - width - gap;
    let y = fighter.y - fighter.height;
    if (kind === 'cable') y -= 5;
    if (kind === 'ball' || kind === 'disc') y = fighter.y - fighter.height / 2 - height / 2 - 20;
    if (kind === 'selection') y = fighter.y - height;
    if (kind === 'ram' || kind === 'cables' || kind === 'column')
      y = effectBottom(x, width, height, fighter.y, this.platforms()) - height;
    runtime.effectBottom = y + height;
    runtime.effectTop = y;
    const speed =
      kind === 'ricochet'
        ? 780
        : kind === 'usb'
          ? 900
          : kind === 'wireless'
            ? 560
            : kind === 'mouse' || kind === 'disc'
              ? 1900
              : kind === 'ball'
                ? 700
                : 0;
    runtime.effect = {
      id: `${this.requireState().matchId}:${this.requireState().tick}:${fighter.id}:${kind}`,
      ownerId: fighter.id,
      kind,
      x,
      y,
      width,
      height,
      vx: speed * facing,
      vy: kind === 'column' ? -1900 : 0,
      facing,
      age: 0,
      frame: 0,
    };
  }
  private updateEffect(fighter: FighterState): void {
    if (fighter.action !== 'special' && fighter.action !== 'combo') return;
    const runtime = this.runtimes.get(fighter.id)!;
    const activeAge = Math.max(0, fighter.actionTime - ATTACKS[fighter.action].windup);
    if (!runtime.effect && fighter.actionTime + EPSILON >= ATTACKS[fighter.action].windup) {
      const discipline = this.seatDiscipline(fighter.id);
      if (this.expanded && this.activateExpanded(fighter)) return;
      const kinds: Record<typeof discipline, [EffectKind, EffectKind]> = {
        ai: ['ball', 'echo'],
        robotics: ['mechanical', 'mechanical'],
        iot: ['wireless', 'hub'],
        vr: ['displacement', 'displacement'],
        games: ['ricochet', 'ricochet'],
        printing: ['piston', 'piston'],
        networks: ['cable', 'cables'],
        design: ['mouse', 'selection'],
        code: ['ball', 'column'],
        hardware: ['ram', 'disc'],
      };
      this.spawnEffect(fighter, kinds[discipline][fighter.action === 'special' ? 0 : 1]);
      const spawned = runtime.effect as EffectState | undefined;
      if (this.expanded && spawned?.kind === 'ricochet') {
        this.projectiles.push({ effect: structuredClone(spawned), ttl: 2.5, hitTargets: [], bounces: 0 });
        runtime.effect = { ...spawned, width: 0, height: 0, vx: 0 };
        return;
      }
    }
    const effect = runtime.effect;
    if (!effect) return;
    effect.age = fighter.actionTime;
    const frame = clamp(Math.floor((activeAge + EPSILON) * 40), 0, 14);
    if (effect.kind === 'cable') {
      effect.frame = frame;
      effect.width = CABLE_WIDTHS[frame];
    } else if (effect.kind === 'ram') {
      effect.frame = frame;
      [effect.width, effect.height] = RAM_SIZES[frame];
      effect.y = runtime.effectBottom - effect.height;
    } else if (effect.kind === 'cables') effect.frame = frame;
    else if (effect.kind === 'selection')
      effect.frame = fighter.actionTime < 0.2 ? Math.min(6, Math.floor(fighter.actionTime * 35)) : 7 + frame;
    else if (effect.kind === 'mouse') effect.frame = Math.floor(activeAge * 40) % 10;
    else if (effect.kind === 'ball') effect.frame = Math.floor(activeAge * 20) % 6;
    else if (effect.kind === 'disc') effect.frame = Math.floor(activeAge * 40) % 4;
    if (
      effect.kind === 'cable' ||
      effect.kind === 'ram' ||
      effect.kind === 'cables' ||
      effect.kind === 'selection'
    ) {
      const edge = fighter.x + runtime.attackFacing * 30;
      const gap = effect.kind === 'cable' ? -9 : effect.kind === 'selection' ? 20 : 50;
      effect.x = runtime.attackFacing === 1 ? edge + gap : edge - gap - effect.width;
      if (effect.kind === 'cable') effect.y = runtime.effectTop;
      if (effect.kind === 'cables' || effect.kind === 'selection')
        effect.y = runtime.effectBottom - effect.height;
    } else {
      // Fast projectile collision uses the swept rectangle below, not only its
      // destination, while its actual visible bounds stay source accurate.
      effect.x += effect.vx * DT;
      effect.y += effect.vy * DT;
    }
  }

  private effectBounds(effect: EffectState): Rectangle {
    return {
      x: Math.min(effect.x, effect.x - effect.vx * DT),
      y: Math.min(effect.y, effect.y - effect.vy * DT),
      width: effect.width + Math.abs(effect.vx * DT),
      height: effect.height + Math.abs(effect.vy * DT),
    };
  }
  private resolveCombat(): void {
    const state = this.requireState();
    const hits: Hit[] = [];
    for (const owner of state.fighters) {
      if (
        owner.eliminated ||
        !isAttack(owner.action) ||
        owner.actionTime + EPSILON < ATTACKS[owner.action].windup
      )
        continue;
      const runtime = this.runtimes.get(owner.id)!;
      const effect = runtime.effect;
      if (
        (owner.action === 'special' || owner.action === 'combo') &&
        (!effect || effect.width <= 0 || (effect.kind === 'selection' && effect.frame < 15))
      )
        continue;
      const bounds = effect ? this.effectBounds(effect) : this.meleeBounds(owner);
      const targets = state.fighters
        .filter(
          (target) =>
            !target.eliminated &&
            target.id !== owner.id &&
            target.stun < EPSILON &&
            target.invulnerable < EPSILON,
        )
        .sort((a, b) => Math.abs(a.x - owner.x) - Math.abs(b.x - owner.x) || a.id.localeCompare(b.id));
      for (const target of targets) {
        const ownerSeat = state.config.players.find((seat) => seat.id === owner.id)!;
        const targetSeat = state.config.players.find((seat) => seat.id === target.id)!;
        if (
          (state.config.mode === 'teams' &&
            !state.config.friendlyFire &&
            ownerSeat.team === targetSeat.team) ||
          (state.config.gameMode === 'survival' && ownerSeat.kind === targetSeat.kind)
        )
          continue;
        if (
          !overlaps(bounds, bodyBounds(target)) ||
          (this.expanded && runtime.hitTargets?.includes(target.id))
        )
          continue;
        const direction = runtime.attackFacing;
        if (
          (owner.action === 'punch' || owner.action === 'uppercut') &&
          (target.x - owner.x) * direction <= -20
        )
          continue;
        const blocked =
          (owner.action === 'punch' || (this.expanded && owner.action !== 'air-down')) &&
          target.action === 'guard' &&
          target.facing === -direction &&
          (target.guardMeter ?? 100) > 0;
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
      const credit = this.runtimes.get(target.id)!;
      credit.lastHitBy = owner.id;
      credit.lastHitTick = state.tick;
      if (this.expanded) {
        this.runtimes.get(owner.id)!.hitTargets?.push(target.id);
        if (target.buffs?.firewall) {
          delete target.buffs.firewall;
          target.invulnerable = 0.2;
          this.event({ type: 'block', seatId: owner.id, targetId: target.id });
          continue;
        }
      }
      target.damage = Math.min(200, target.damage + hit.damage * (owner.buffs?.overclock ? 1.25 : 1));
      if (hit.blocked) {
        if (this.expanded) target.guardMeter = Math.max(0, (target.guardMeter ?? 100) - 22);
        target.x = owner.x + this.runtimes.get(owner.id)!.attackFacing * (PHYSICS.bodyWidth + 20);
        this.event({ type: 'block', seatId: owner.id, targetId: target.id, action });
      } else {
        target.vx = hit.vx;
        target.vy = hit.vy;
        target.grounded = false;
        target.facing = hit.vx > 0 ? -1 : 1;
        target.action = 'hurt';
        target.actionTime = 0;
        target.height = PHYSICS.standingHeight;
        target.stun = PHYSICS.hitProtection;
        target.recovery = 0;
        target.invulnerable = 0;
        const targetRuntime = this.runtimes.get(target.id)!;
        targetRuntime.launched = true;
        targetRuntime.effect = undefined;
        targetRuntime.buffer = undefined;
        targetRuntime.history = [];
        this.event({
          type: 'hit',
          seatId: owner.id,
          targetId: target.id,
          action,
          discipline: this.seatDiscipline(owner.id),
        });
      }
      if (effect?.kind === 'mouse' || effect?.kind === 'ball') consumed.add(owner.id);
      if (effect?.kind === 'cable' && effect.frame <= 7 && owner.action === 'special')
        owner.actionTime = ATTACKS.special.windup + (14 - effect.frame) / 40;
    }
    for (const id of consumed) {
      const owner = state.fighters.find((fighter) => fighter.id === id)!;
      // A trade has already interrupted this owner; never overwrite its hurt.
      if (owner.action === 'special') this.finishAttack(owner);
    }
  }

  private fall(fighter: FighterState): void {
    const state = this.requireState();
    const rt = this.runtimes.get(fighter.id)!;
    const credited = rt.lastHitBy && state.tick - (rt.lastHitTick ?? 0) < 480 ? rt.lastHitBy : undefined;
    if (state.scores) {
      if (credited && state.scores[credited]) state.scores[credited].kos++;
      else state.scores[fighter.id].selfDestructs++;
    }
    this.event({ type: 'fall', seatId: fighter.id, creditedTo: credited });
    if (
      !state.config.practice &&
      (!['timed', 'hill'].includes(state.config.gameMode ?? 'stock') ||
        state.objective?.suddenDeath !== undefined)
    )
      fighter.lives--;
    if (fighter.lives <= 0) {
      fighter.lives = 0;
      fighter.eliminated = true;
      fighter.action = 'out';
      fighter.vx = 0;
      fighter.vy = 0;
      this.resetRuntime(fighter.id);
      return;
    }
    const candidates = ARENAS[state.config.arena].spawns;
    const opponents = state.fighters.filter(
      (other) => other.id !== fighter.id && !other.eliminated && other.y <= WORLD.deathY,
    );
    const spawn = [...candidates].sort((a, b) => {
      const score = (point: typeof a) =>
        opponents.length
          ? Math.min(...opponents.map((other) => Math.hypot(point.x - other.x, point.y - other.y)))
          : 0;
      return score(b) - score(a);
    })[0];
    Object.assign(fighter, {
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facing: spawn.x < 683 ? 1 : -1,
      grounded: true,
      height: PHYSICS.standingHeight,
      action: 'idle',
      actionTime: 0,
      recovery: 0,
      stun: 0,
      invulnerable: PHYSICS.respawnProtection,
      damage: 0,
      jumpCooldown: 0,
      airJumps: 1,
      airDash: true,
      recoveryAvailable: true,
      dodgeCooldown: 0,
      abilityCooldown: 0,
      guardMeter: 100,
      buffs: {},
    });
    state.deployables = state.deployables?.filter((d) => Math.hypot(d.x - spawn.x, d.y - spawn.y) > 130);
    this.resetRuntime(fighter.id);
    this.event({ type: 'respawn', seatId: fighter.id });
  }
  private checkResult(): void {
    const state = this.requireState();
    if (state.phase === 'finished' || state.config.practice) return;
    if (this.checkExpandedResult()) return;
    const living = state.fighters.filter((fighter) => !fighter.eliminated);
    if (state.config.mode === 'ffa' && living.length <= 1) {
      this.finish({
        winners: living.map((fighter) => fighter.id),
        reason: living.length ? 'last-standing' : 'draw',
      });
      return;
    }
    if (state.config.mode === 'teams') {
      const teams = new Set(
        living.map((fighter) => state.config.players.find((seat) => seat.id === fighter.id)!.team),
      );
      if (teams.size <= 1) {
        const winningTeam = [...teams][0];
        this.finish({
          winners:
            winningTeam === undefined
              ? []
              : state.config.players.filter((seat) => seat.team === winningTeam).map((seat) => seat.id),
          winningTeam,
          reason: teams.size ? 'last-standing' : 'draw',
        });
        return;
      }
    }
    if (state.config.timeLimit <= 0 || state.elapsed + EPSILON < state.config.timeLimit) return;
    if (state.config.mode === 'ffa') {
      const most = Math.max(...state.fighters.map((fighter) => fighter.lives));
      const winners = state.fighters.filter((fighter) => fighter.lives === most).map((fighter) => fighter.id);
      this.finish({
        winners: winners.length === 1 ? winners : [],
        reason: winners.length === 1 ? 'timeout' : 'draw',
      });
    } else {
      const totals = ([0, 1] as const).map((team) =>
        state.fighters
          .filter((fighter) => state.config.players.find((seat) => seat.id === fighter.id)!.team === team)
          .reduce((total, fighter) => total + fighter.lives, 0),
      );
      const winningTeam = totals[0] === totals[1] ? undefined : totals[0] > totals[1] ? 0 : 1;
      this.finish({
        winners:
          winningTeam === undefined
            ? []
            : state.config.players.filter((seat) => seat.team === winningTeam).map((seat) => seat.id),
        winningTeam,
        reason: winningTeam === undefined ? 'draw' : 'timeout',
      });
    }
  }
  private updateExpandedFighter(f: FighterState, input: InputFrame): void {
    const state = this.requireState(),
      rt = this.runtimes.get(f.id)!;
    const before = rt.previous;
    for (const key of ['recovery', 'stun', 'invulnerable', 'jumpCooldown'] as const)
      f[key] = Math.max(0, f[key] - DT);
    f.dodgeCooldown = Math.max(0, (f.dodgeCooldown ?? 0) - DT);
    f.abilityCooldown = Math.max(0, (f.abilityCooldown ?? 0) - DT);
    for (const kind of Object.keys(f.buffs ?? {}) as ItemKind[]) {
      f.buffs![kind] = Math.max(0, (f.buffs![kind] ?? 0) - DT);
      if (!f.buffs![kind]) delete f.buffs![kind];
    }
    if (f.stun < EPSILON && f.action === 'hurt') {
      f.action = f.grounded ? 'idle' : 'jump';
      f.actionTime = 0;
    }
    rt.dodgeRemaining = Math.max(0, (rt.dodgeRemaining ?? 0) - DT);
    if (!rt.dodgeRemaining && (f.action === 'dodge' || f.action === 'air-dash')) {
      f.action = f.grounded ? 'idle' : 'jump';
      f.recovery = 0.1;
    }
    let locked = isAttack(f.action) || f.stun > EPSILON || (rt.dodgeRemaining ?? 0) > 0;
    const pressed = (key: 'jump' | 'punch' | 'special' | 'combo' | 'dodge') =>
      Boolean(input[key] && !before[key]);
    if (!locked && input.left !== input.right) f.facing = input.left ? -1 : 1;
    if (!locked && pressed('dodge') && (f.dodgeCooldown ?? 0) < EPSILON && (f.grounded || f.airDash)) {
      f.action = f.grounded ? 'dodge' : 'air-dash';
      f.poseAction = f.action;
      f.actionTime = 0;
      f.invulnerable = f.grounded ? 0.18 : 0.1;
      rt.dodgeRemaining = f.grounded ? 0.22 : 0.18;
      f.dodgeCooldown = 0.65;
      const direction = input.left !== input.right ? (input.left ? -1 : 1) : f.facing;
      f.vx = direction * (f.grounded ? 900 : 1100);
      if (!f.grounded) {
        f.airDash = false;
        f.vy = input.down ? 600 : 0;
      }
      locked = true;
      this.event({ type: 'attack', seatId: f.id, action: f.action });
    }
    if (
      !locked &&
      f.recovery < EPSILON &&
      pressed('jump') &&
      (f.grounded || (f.airJumps ?? 0) > 0) &&
      !input.down
    ) {
      if (!f.grounded) f.airJumps = (f.airJumps ?? 1) - 1;
      f.vy = PHYSICS.jumpSpeed * (f.grounded ? 1 : 0.87);
      f.grounded = false;
      f.jumpCooldown = 0.12;
      f.action = 'jump';
      f.actionTime = 0;
      rt.launched = false;
      this.event({ type: 'attack', seatId: f.id, action: 'jump' });
    }
    if (
      !locked &&
      f.recovery < EPSILON &&
      f.grounded &&
      input.guard &&
      !input.down &&
      (f.guardMeter ?? 100) > 0
    ) {
      f.action = 'guard';
      f.guardMeter = Math.max(0, (f.guardMeter ?? 100) - DT * 14);
      if (!f.guardMeter) {
        f.stun = 0.45;
        f.action = 'hurt';
        this.event({ type: 'block', seatId: f.id });
      }
    } else if (!locked) {
      if (f.action === 'guard') f.action = 'idle';
      f.guardMeter = Math.min(100, (f.guardMeter ?? 100) + DT * 20);
    }
    locked ||= f.stun > EPSILON;
    if (pressed('punch') && f.buffs?.usb && !locked && f.recovery < EPSILON) {
      this.projectile(f, 'usb', f.x + f.facing * 40, f.y - 65, 24, 18, 900 * f.facing, 1.4);
      delete f.buffs.usb;
      f.recovery = 0.28;
      this.event({ type: 'item', seatId: f.id });
    } else if (f.action !== 'guard') {
      let requested: AttackAction | 'jump' | undefined;
      if (pressed('special') && !f.grounded && f.recoveryAvailable) requested = 'recover';
      else if (pressed('punch') || (input.punch && !locked && f.recovery < EPSILON))
        requested = f.grounded
          ? input.down
            ? 'uppercut'
            : 'punch'
          : input.down
            ? 'air-down'
            : 'air-forward';
      else if (f.grounded && (pressed('combo') || (input.combo && !locked && f.recovery < EPSILON)))
        requested = 'combo';
      else if (f.grounded && (pressed('special') || (input.special && !locked && f.recovery < EPSILON)))
        requested = input.down ? 'sweep' : 'special';
      if (requested) this.queue(f, requested);
      if (rt.buffer && state.tick > rt.buffer.expires) rt.buffer = undefined;
      if (rt.buffer && !locked && f.recovery < EPSILON && rt.buffer.action !== 'jump') {
        const action = rt.buffer.action;
        const ability = action === 'special' || action === 'combo';
        if (
          (!ability || (f.abilityCooldown ?? 0) < EPSILON) &&
          (action !== 'recover' || f.recoveryAvailable)
        ) {
          this.startAttack(f, action, rt.buffer.facing);
          rt.buffer = undefined;
          if (ability) f.abilityCooldown = action === 'combo' ? 1.2 : 0.65;
          locked = true;
        }
      }
    }
    const attacking = isAttack(f.action);
    if (f.stun > EPSILON) {
      f.action = 'hurt';
      f.height = PHYSICS.standingHeight;
    } else if (rt.dodgeRemaining) {
      if (f.action === 'air-dash') f.vy = input.down ? 600 : 0;
    } else if (attacking) {
      if (f.action === 'sweep') f.vx = rt.attackFacing * 300;
      else if (f.grounded) f.vx = 0;
    } else if (f.action === 'guard' || (f.grounded && input.down)) {
      f.vx = 0;
      if (f.action !== 'guard') {
        f.action = 'crouch';
        f.height = PHYSICS.crouchingHeight;
      }
    } else if (input.left !== input.right) {
      const dir = input.left ? -1 : 1;
      f.vx = clamp(
        f.vx + dir * PHYSICS.acceleration * DT,
        -PHYSICS.speed * (f.buffs?.overclock ? 1.2 : 1),
        PHYSICS.speed * (f.buffs?.overclock ? 1.2 : 1),
      );
      rt.launched = false;
    } else if (!rt.launched) f.vx *= f.grounded ? 0.5 : 0.96;
    const oldX = f.x,
      oldY = f.y;
    const support = this.platforms()[supportingPlatform(f, this.platforms())];
    f.x += (f.vx + (f.grounded && state.config.hazards ? (support?.conveyor ?? 0) : 0)) * DT;
    if (!f.grounded) {
      const cap = input.down && f.vy > 0 ? 1100 : PHYSICS.fallSpeed;
      if (!(rt.dodgeRemaining && f.action === 'air-dash'))
        f.vy = Math.min(cap, f.vy + PHYSICS.gravity * DT * (f.buffs?.fan ? 0.45 : 1));
      f.y += f.vy * DT;
      const landing = f.vy > 0 ? sweptLanding(oldX, oldY, f.x, f.y, this.platforms()) : undefined;
      if (landing) {
        f.y = landing.y;
        f.vy = 0;
        f.grounded = true;
        f.airJumps = 1;
        f.airDash = true;
        f.recoveryAvailable = true;
        if (rt.launched) {
          f.vx = 0;
          rt.launched = false;
        }
      }
    } else if (supportingPlatform(f, this.platforms()) < 0) f.grounded = false;
    if (isAttack(f.action)) {
      const old = f.actionTime;
      f.actionTime += DT;
      if (old < ATTACKS[f.action].windup && f.actionTime + EPSILON >= ATTACKS[f.action].windup)
        this.event({ type: 'active', seatId: f.id, action: f.action, discipline: this.seatDiscipline(f.id) });
      this.updateEffect(f);
    } else {
      f.actionTime += DT;
      if (f.stun < EPSILON && !rt.dodgeRemaining && f.action !== 'guard') {
        if (!f.grounded) f.action = 'jump';
        else if (!input.down) f.action = Math.abs(f.vx) > 20 ? 'walk' : 'idle';
        f.height = f.action === 'crouch' ? PHYSICS.crouchingHeight : PHYSICS.standingHeight;
      }
    }
    rt.previous = { ...input };
  }

  private meleeBounds(f: FighterState): Rectangle {
    if (!this.expanded) return bodyBounds(f);
    if (f.action === 'air-down') return { x: f.x - 32, y: f.y - 35, width: 64, height: 92 };
    if (f.action === 'recover') return { x: f.x - 35, y: f.y - 120, width: 70, height: 120 };
    if (f.action === 'air-forward' || f.action === 'punch')
      return { x: f.facing === 1 ? f.x - 15 : f.x - 95, y: f.y - 85, width: 110, height: 60 };
    return bodyBounds(f);
  }

  private projectile(
    f: FighterState,
    kind: EffectKind,
    x: number,
    y: number,
    width: number,
    height: number,
    vx: number,
    ttl: number,
    vy = 0,
  ): void {
    this.projectiles.push({
      effect: {
        id: `${this.requireState().matchId}:p${++this.serial}`,
        ownerId: f.id,
        kind,
        x,
        y,
        width,
        height,
        vx,
        vy,
        facing: f.facing,
        age: 0,
        frame: 0,
      },
      ttl,
      hitTargets: [],
    });
    if (this.projectiles.length > 48) this.projectiles.shift();
  }
  private activateExpanded(f: FighterState): boolean {
    const rt = this.runtimes.get(f.id)!,
      discipline = this.seatDiscipline(f.id);
    // A zero-area sentinel marks an activation already consumed by a deployable.
    if (rt.effect) return false;
    const combo = f.action === 'combo';
    let kind: DeployableState['kind'] | undefined;
    if (discipline === 'robotics' && combo) kind = 'drone';
    if (discipline === 'iot') kind = combo ? 'hub' : 'board';
    if (discipline === 'vr' && combo) kind = 'decoy';
    if (discipline === 'games' && combo) kind = 'pad';
    if (discipline === 'printing' && combo) kind = 'block';
    if (kind) {
      this.deploy(f, kind);
      rt.effect = {
        id: `${f.id}:deploy:${this.requireState().tick}`,
        ownerId: f.id,
        kind: discipline === 'iot' ? 'wireless' : 'displacement',
        x: f.x,
        y: f.y,
        width: 0,
        height: 0,
        vx: 0,
        vy: 0,
        facing: f.facing,
        age: 0,
        frame: 0,
      };
      return true;
    }
    if (discipline === 'vr' && !combo) {
      const old = f.x;
      f.x = clamp(f.x + f.facing * 170, -150, 1516);
      this.projectile(
        f,
        'displacement',
        Math.min(old, f.x) - 25,
        f.y - 90,
        Math.abs(f.x - old) + 50,
        70,
        0,
        0.16,
      );
      rt.effect = {
        id: `${f.id}:shift:${this.requireState().tick}`,
        ownerId: f.id,
        kind: 'displacement',
        x: old,
        y: f.y,
        width: 0,
        height: 0,
        vx: 0,
        vy: 0,
        facing: f.facing,
        age: 0,
        frame: 0,
      };
      return true;
    }
    return false;
  }
  private deploy(f: FighterState, kind: DeployableState['kind']): void {
    const state = this.requireState(),
      list = state.deployables!,
      max = kind === 'board' || kind === 'block' ? 2 : 1;
    const owned = list.filter((d) => d.ownerId === f.id && d.kind === kind);
    if (owned.length >= max) list.splice(list.indexOf(owned[0]), 1);
    const width = kind === 'block' ? 85 : kind === 'hub' ? 65 : kind === 'pad' ? 95 : 48,
      height = kind === 'block' ? 55 : kind === 'pad' ? 14 : 45;
    let x = f.x + f.facing * (kind === 'drone' ? 30 : 100) - width / 2,
      y = f.y - height;
    if (kind === 'drone') y = f.y - 150;
    const supporting = this.platforms()
      .filter((p) => x + width > p.x && x < p.x + p.width && p.y >= f.y - 4)
      .sort((a, b) => a.y - b.y)[0];
    if (supporting && kind !== 'drone') y = supporting.y - height;
    // Spawn-clear corridors and one-way surfaces prevent sealing or body traps.
    const spawn = ARENAS[state.config.arena].spawns.find(
      (p) => Math.hypot(p.x - (x + width / 2), p.y - (y + height)) < 110,
    );
    if (spawn && (kind === 'block' || kind === 'pad')) x = clamp(x + f.facing * 140, -120, 1400);
    if (kind === 'block' && !supporting) return;
    list.push({
      id: `${state.matchId}:d${++this.serial}`,
      ownerId: f.id,
      kind,
      x,
      y,
      width,
      height,
      hp: kind === 'block' ? 18 : kind === 'board' ? 12 : kind === 'drone' ? 16 : 10,
      ttl: kind === 'block' ? 8 : kind === 'decoy' ? 4 : kind === 'pad' ? 8 : 12,
      cooldown: kind === 'board' ? 1 : kind === 'hub' ? 0.5 : 0.75,
      facing: f.facing,
    });
    this.event({ type: 'deploy', seatId: f.id, discipline: this.seatDiscipline(f.id) });
  }
  private updateWorld(authority: boolean): void {
    const state = this.requireState();
    const bases = ARENAS[state.config.arena].platforms;
    state.platforms = bases.map((p, i) => {
      const result = { ...p, id: `arena-${i}`, active: true, warning: false };
      if (state.config.hazards && state.config.arena === 'virtual' && i > 0) {
        const cycle = (state.elapsed + i * 1.3) % 8;
        result.warning = cycle > 5.5 && cycle < 6.5;
        result.active = cycle < 6.5;
        result.x = p.x + Math.sin(state.elapsed * 0.5 + i) * 50;
      }
      if (state.config.hazards && state.config.arena === 'arcade' && i === 6)
        result.x = p.x + Math.sin(state.elapsed * 0.5) * 170;
      return result;
    });
    for (const d of state.deployables ?? [])
      if (d.kind === 'block')
        state.platforms.push({
          x: d.x,
          y: d.y,
          width: d.width,
          height: d.height,
          id: d.id,
          active: true,
          warning: d.ttl < 1.5,
        });
    for (const [id, rt] of this.runtimes) {
      if (rt.echo && state.tick >= rt.echo.at) {
        const f = state.fighters.find((f) => f.id === id)!;
        const e = rt.echo;
        this.projectile(
          { ...f, facing: e.facing },
          'echo',
          e.x + (e.facing === 1 ? 20 : -140),
          e.y - 90,
          120,
          80,
          0,
          0.22,
        );
        rt.echo = undefined;
      }
    }
    for (const p of this.projectiles) {
      p.ttl -= DT;
      p.effect.age += DT;
      if (p.effect.kind === 'usb') p.effect.vy = Math.min(700, p.effect.vy + PHYSICS.gravity * DT * 0.35);
      p.effect.x += p.effect.vx * DT;
      p.effect.y += p.effect.vy * DT;
      p.effect.frame = Math.floor(p.effect.age * 20) % 6;
      if (p.effect.kind === 'ricochet' && (p.bounces ?? 0) < 2) {
        const e = p.effect,
          bounds = this.platforms();
        if (
          e.x < -200 ||
          e.x + e.width > 1566 ||
          bounds.some((b) => overlaps({ x: e.x, y: e.y, width: e.width, height: e.height }, b))
        ) {
          e.vx *= -1;
          e.facing = e.vx > 0 ? 1 : -1;
          e.x += e.vx * DT * 2;
          p.bounces = (p.bounces ?? 0) + 1;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.ttl > 0);
    for (const d of state.deployables ?? []) {
      d.ttl -= DT;
      d.cooldown -= DT;
      const owner = state.fighters.find((f) => f.id === d.ownerId);
      if (!owner || owner.eliminated) {
        d.ttl = 0;
        continue;
      }
      if (d.kind === 'drone') {
        d.x += (owner.x + owner.facing * 100 - d.width / 2 - d.x) * Math.min(1, DT * 3);
        d.y += (owner.y - 170 - d.y) * Math.min(1, DT * 3);
        if (d.cooldown <= 0) {
          d.cooldown = 1.1;
          this.projectile(owner, 'mechanical', d.x, d.y + 20, 30, 24, owner.facing * 520, 0.9);
        }
      }
      if (d.kind === 'board' && d.cooldown <= 0) {
        const hub = state.deployables!.find((h) => h.ownerId === d.ownerId && h.kind === 'hub');
        d.cooldown = hub ? 0.6 : 1.2;
        const target = state.fighters
          .filter(
            (f) => !f.eliminated && f.id !== d.ownerId && this.enemy(owner, f) && Math.abs(f.y - d.y) < 140,
          )
          .sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x))[0];
        if (target) {
          const dir = target.x > d.x ? 1 : -1;
          this.projectile({ ...owner, facing: dir }, 'wireless', d.x, d.y + 10, 28, 28, dir * 560, 1.1);
        }
      }
      if (d.kind === 'hub' && d.cooldown <= 0) {
        d.cooldown = 1.8;
        this.projectile(owner, 'hub', d.x - 55, d.y - 35, 175, 110, 0, 0.18);
      }
      if (d.kind === 'pad')
        for (const f of state.fighters)
          if (
            !f.eliminated &&
            f.vy >= 0 &&
            Math.abs(f.y - (d.y + d.height)) < 22 &&
            f.x > d.x - 20 &&
            f.x < d.x + d.width + 20
          ) {
            f.vy = -1250;
            f.grounded = false;
          }
    }
    state.deployables = state.deployables?.filter((d) => d.ttl > 0 && d.hp > 0);
    if (!authority) return;
    for (const item of state.items ?? []) item.ttl -= DT;
    state.items = state.items?.filter((i) => i.ttl > 0);
    if (state.config.items && state.elapsed >= this.nextItem) {
      this.nextItem = state.elapsed + 10 + this.random.next() * 5;
      const kind = (['usb', 'fan', 'firewall', 'battery', 'overclock'] as ItemKind[])[
          Math.floor(this.random.next() * 5)
        ],
        p = this.platforms()[Math.floor(this.random.next() * this.platforms().length)];
      if (p && state.items!.length < 3)
        state.items!.push({
          id: `${state.matchId}:i${++this.serial}`,
          kind,
          x: p.x + 45 + this.random.next() * Math.max(0, p.width - 90),
          y: p.y - 26,
          ttl: 15,
        });
    }
    for (const item of state.items ?? [])
      for (const f of state.fighters) {
        if (f.eliminated || item.ttl <= 0 || Math.abs(f.x - item.x) > 45 || Math.abs(f.y - 55 - item.y) > 65)
          continue;
        item.ttl = 0;
        f.buffs ??= {};
        if (item.kind === 'battery') {
          f.airJumps = 1;
          f.airDash = true;
          f.recoveryAvailable = true;
          f.abilityCooldown = 0;
        } else f.buffs[item.kind] = item.kind === 'usb' ? 20 : item.kind === 'firewall' ? 10 : 8;
        this.event({ type: 'item', seatId: f.id });
      }
    const objective = state.objective;
    if (state.config.gameMode === 'hill' && objective) {
      const occupants = state.fighters.filter(
        (f) =>
          !f.eliminated &&
          f.grounded &&
          f.x >= objective.x &&
          f.x <= objective.x + objective.width &&
          f.y >= objective.y &&
          f.y <= objective.y + objective.height,
      );
      const identities = new Set(
        occupants.map((f) =>
          state.config.mode === 'teams'
            ? `team:${state.config.players.find((p) => p.id === f.id)!.team}`
            : f.id,
        ),
      );
      objective.contested = identities.size > 1;
      objective.ownerId = identities.size === 1 ? occupants[0]?.id : undefined;
      if (identities.size === 1) for (const f of occupants) state.scores![f.id].hill += DT / occupants.length;
    }
    if (state.config.gameMode === 'royale' && objective) {
      const amount = clamp((state.elapsed - 30) / 180, 0, 1);
      objective.safeLeft = -220 + amount * 820;
      objective.safeRight = 1586 - amount * 820;
      objective.x = objective.safeLeft;
      objective.width = objective.safeRight - objective.safeLeft;
      for (const f of state.fighters)
        if (!f.eliminated && (f.x < objective.safeLeft || f.x > objective.safeRight)) {
          f.damage = Math.min(200, f.damage + DT * 12);
          f.vx += (f.x < objective.safeLeft ? -1 : 1) * DT * 500;
          f.invulnerable = 0;
          if (f.damage >= 200) f.y = WORLD.deathY + 1;
        }
    }
    if (state.config.hazards) {
      const phase = state.elapsed % 7;
      if (objective) objective.hazardPhase = phase;
      if (state.config.arena === 'embedded' && phase > 5.9 && phase < 6.4) {
        for (const f of state.fighters)
          if (!f.eliminated && f.x > 593 && f.x < 773 && f.y > 440 && f.invulnerable < EPSILON) {
            f.damage = Math.min(200, f.damage + 12);
            f.vy = -650;
            f.grounded = false;
            f.stun = 0.35;
            f.invulnerable = 0.6;
            this.event({ type: 'hazard', seatId: f.id });
          }
      }
    }
    if (objective?.suddenDeath !== undefined) objective.suddenDeath = Math.max(0, objective.suddenDeath - DT);
  }
  private enemy(a: FighterState, b: FighterState): boolean {
    const state = this.requireState();
    return (
      a.id !== b.id &&
      (state.config.gameMode !== 'survival' ||
        state.config.players.find((p) => p.id === a.id)?.kind !==
          state.config.players.find((p) => p.id === b.id)?.kind) &&
      (state.config.mode !== 'teams' ||
        state.config.friendlyFire ||
        state.config.players.find((p) => p.id === a.id)?.team !==
          state.config.players.find((p) => p.id === b.id)?.team)
    );
  }
  private resolveWorldCombat(): void {
    const state = this.requireState();
    for (const p of this.projectiles)
      for (const d of state.deployables ?? []) {
        const owner = state.fighters.find((f) => f.id === p.effect.ownerId),
          defender = state.fighters.find((f) => f.id === d.ownerId);
        if (
          !owner ||
          !defender ||
          p.ttl <= 0 ||
          !this.enemy(owner, defender) ||
          p.hitTargets.includes(d.id) ||
          !overlaps(this.effectBounds(p.effect), d)
        )
          continue;
        p.hitTargets.push(d.id);
        d.hp -= EFFECT_HITS[p.effect.kind].damage;
        if (d.kind === 'decoy' || ['wireless', 'usb', 'mechanical', 'ricochet'].includes(p.effect.kind))
          p.ttl = 0;
        this.event({ type: 'hit', seatId: owner.id, targetId: d.ownerId });
      }
    for (const p of this.projectiles) {
      if (p.ttl <= 0) continue;
      const owner = state.fighters.find((f) => f.id === p.effect.ownerId);
      if (!owner) continue;
      for (const target of state.fighters) {
        if (p.ttl <= 0) break;
        if (
          target.eliminated ||
          target.invulnerable > EPSILON ||
          target.stun > EPSILON ||
          p.hitTargets.includes(target.id) ||
          !this.enemy(owner, target) ||
          !overlaps(this.effectBounds(p.effect), bodyBounds(target))
        )
          continue;
        p.hitTargets.push(target.id);
        this.worldHit(owner, target, p.effect.kind, p.effect.facing);
        if (['wireless', 'usb', 'mechanical'].includes(p.effect.kind)) p.ttl = 0;
      }
    }
    for (const d of state.deployables ?? [])
      for (const owner of state.fighters) {
        const defender = state.fighters.find((f) => f.id === d.ownerId);
        if (
          !defender ||
          !this.enemy(owner, defender) ||
          owner.eliminated ||
          owner.id === d.ownerId ||
          !isAttack(owner.action) ||
          owner.actionTime < ATTACKS[owner.action].windup
        )
          continue;
        const rt = this.runtimes.get(owner.id)!;
        if (rt.hitTargets?.includes(d.id)) continue;
        const bounds = rt.effect ? this.effectBounds(rt.effect) : this.meleeBounds(owner);
        if (overlaps(bounds, d)) {
          rt.hitTargets?.push(d.id);
          d.hp -= owner.action === 'combo' ? 10 : 6;
          this.event({ type: 'hit', seatId: owner.id, targetId: d.ownerId });
        }
      }
  }
  private worldHit(owner: FighterState, target: FighterState, kind: EffectKind, direction: -1 | 1): void {
    const state = this.requireState(),
      rule = EFFECT_HITS[kind],
      rt = this.runtimes.get(target.id)!;
    if (target.buffs?.firewall) {
      delete target.buffs.firewall;
      target.invulnerable = 0.2;
      this.event({ type: 'block', seatId: owner.id, targetId: target.id });
      return;
    }
    if (target.action === 'guard' && target.facing === -direction && (target.guardMeter ?? 100) > 0) {
      target.guardMeter = Math.max(0, (target.guardMeter ?? 100) - 20);
      target.damage = Math.min(200, target.damage + 1);
      this.event({ type: 'block', seatId: owner.id, targetId: target.id });
      return;
    }
    const k = target.damage;
    target.damage = Math.min(200, k + rule.damage * (owner.buffs?.overclock ? 1.25 : 1));
    target.vx = direction * rule.xScale * (rule.xBase + k);
    target.vy = -rule.yScale * (rule.yBase + k);
    target.grounded = false;
    target.action = 'hurt';
    target.actionTime = 0;
    target.stun = 0.4;
    target.recovery = 0;
    rt.launched = true;
    rt.effect = undefined;
    rt.buffer = undefined;
    rt.lastHitBy = owner.id;
    rt.lastHitTick = state.tick;
    this.event({
      type: 'hit',
      seatId: owner.id,
      targetId: target.id,
      discipline: this.seatDiscipline(owner.id),
    });
  }
  private checkExpandedResult(): boolean {
    const state = this.requireState(),
      mode = state.config.gameMode;
    if (mode === 'training') return true;
    if (mode === 'survival') {
      const humans = state.fighters.filter(
        (f) => state.config.players.find((p) => p.id === f.id)?.kind === 'human',
      );
      if (humans.every((f) => f.eliminated)) {
        this.finish({
          winners: [],
          reason: 'last-standing',
          scores: Object.fromEntries(humans.map((f) => [f.id, state.objective?.wave ?? 1])),
        });
        return true;
      }
      const bots = state.fighters.filter(
        (f) => state.config.players.find((p) => p.id === f.id)?.kind === 'bot',
      );
      if (bots.length && bots.every((f) => f.eliminated)) {
        const o = state.objective!;
        if (!o.nextWave) o.nextWave = state.elapsed + 2;
        if (state.elapsed >= o.nextWave) {
          o.wave = (o.wave ?? 1) + 1;
          o.nextWave = 0;
          for (const f of bots) {
            f.lives = 1;
            f.eliminated = false;
            const spawn =
              ARENAS[state.config.arena].spawns[bots.indexOf(f) % ARENAS[state.config.arena].spawns.length];
            Object.assign(f, {
              x: spawn.x,
              y: spawn.y,
              vx: 0,
              vy: 0,
              damage: 0,
              stun: 0,
              invulnerable: 1,
              grounded: true,
              action: 'idle',
              recovery: 0,
              airJumps: 1,
              airDash: true,
              recoveryAvailable: true,
            });
            this.resetRuntime(f.id);
            const seat = state.config.players.find((p) => p.id === f.id)!;
            seat.difficulty = o.wave >= 5 ? 'hard' : 'normal';
          }
          this.event({ type: 'wave' });
        }
      }
      return true;
    }
    if (mode !== 'timed' && mode !== 'hill' && mode !== 'royale') return false;
    const living = state.fighters.filter((f) => !f.eliminated);
    if (mode === 'royale') {
      if (living.length <= 1) {
        if (living[0]) state.scores![living[0].id].placement = 1;
        this.finish({
          winners: living.map((f) => f.id),
          reason: living.length ? 'last-standing' : 'draw',
          placements: Object.fromEntries(
            Object.entries(state.scores!).map(([id, s]) => [id, s.placement ?? 1]),
          ),
        });
        return true;
      }
      if (state.elapsed >= state.config.timeLimit) {
        const sorted = [...living].sort((a, b) => a.damage - b.damage);
        const best = sorted[0].damage,
          winners = sorted.filter((f) => f.damage === best);
        for (const f of living)
          state.scores![f.id].placement = 1 + living.filter((o) => o.damage < f.damage).length;
        this.finish({
          winners: winners.map((f) => f.id),
          reason: winners.length === 1 ? 'timeout' : 'draw',
          placements: Object.fromEntries(
            Object.entries(state.scores!).map(([id, s]) => [id, s.placement ?? 1]),
          ),
        });
      }
      return true;
    }
    if (living.length <= 1) {
      this.finish({ winners: living.map((f) => f.id), reason: living.length ? 'last-standing' : 'draw' });
      return true;
    }
    if (state.elapsed + EPSILON < state.config.timeLimit) return true;
    const metric = (id: string) =>
      mode === 'hill' ? state.scores![id].hill : state.scores![id].kos - state.scores![id].selfDestructs;
    const groups =
      state.config.mode === 'teams'
        ? ([0, 1] as const).map((team) => ({
            ids: state.config.players.filter((p) => p.team === team).map((p) => p.id),
            value: state.config.players
              .filter((p) => p.team === team)
              .reduce((sum, p) => sum + metric(p.id), 0),
          }))
        : state.fighters.map((f) => ({ ids: [f.id], value: metric(f.id) }));
    const best = Math.max(...groups.map((g) => g.value)),
      leaders = groups.filter((g) => Math.abs(g.value - best) < EPSILON);
    if (leaders.length === 1) {
      const ids = leaders[0].ids;
      this.finish({
        winners: ids,
        winningTeam:
          state.config.mode === 'teams' ? state.config.players.find((p) => p.id === ids[0])?.team : undefined,
        reason: 'timeout',
        scores: Object.fromEntries(state.fighters.map((f) => [f.id, metric(f.id)])),
      });
      return true;
    }
    if (!state.objective) state.objective = { x: 0, y: 0, width: 0, height: 0 };
    if (state.objective.suddenDeath === undefined) {
      state.objective.suddenDeath = 20;
      for (const f of state.fighters) {
        if (!leaders.some((g) => g.ids.includes(f.id))) {
          f.eliminated = true;
          f.lives = 0;
        } else {
          f.damage = 150;
          f.lives = 1;
        }
      }
      this.event({ type: 'objective' });
    }
    if (state.objective.suddenDeath <= 0)
      this.finish({
        winners: [],
        reason: 'draw',
        scores: Object.fromEntries(state.fighters.map((f) => [f.id, metric(f.id)])),
      });
    return true;
  }
  training(command: TrainingCommand): MatchSnapshot {
    const state = this.requireState();
    if (!state.config.practice && state.config.gameMode !== 'training') return this.snapshot();
    state.training ??= {
      hitboxes: false,
      inputHistory: [],
      recording: false,
      playback: false,
      dummyRecording: [],
      playbackIndex: 0,
    };
    if (command.action === 'frame') {
      const phase = state.phase;
      state.phase = 'playing';
      this.step(command.inputs ?? []);
      state.phase = phase === 'finished' ? 'finished' : 'paused';
      return this.snapshot();
    }
    if (command.action === 'hitboxes') state.training.hitboxes = command.enabled ?? !state.training.hitboxes;
    if (command.action === 'record') {
      state.training.recording = command.enabled ?? !state.training.recording;
      state.training.playback = false;
      if (state.training.recording) state.training.dummyRecording = [];
    }
    if (command.action === 'playback') {
      state.training.playback = command.enabled ?? !state.training.playback;
      state.training.recording = false;
      state.training.playbackIndex = 0;
    }
    for (const [index, f] of state.fighters.entries())
      if (!command.seatId || f.id === command.seatId) {
        if (command.action === 'set-damage') f.damage = clamp(command.damage ?? 0, 0, 200);
        if (command.action === 'set-position') {
          f.x = clamp(command.x ?? f.x, -400, 1766);
          f.y = clamp(command.y ?? f.y, -300, 1100);
          f.vx = 0;
          f.vy = 0;
          f.grounded = supportingPlatform(f, this.platforms()) >= 0;
          f.action = f.grounded ? 'idle' : 'jump';
          f.stun = 0;
          f.recovery = 0;
          this.resetRuntime(f.id);
        }
        if (command.action === 'reset-damage' || command.action === 'reset-all') {
          f.damage = 0;
          f.stun = 0;
          f.recovery = 0;
        }
        if (command.action === 'reset-position' || command.action === 'reset-all') {
          const p = ARENAS[state.config.arena].spawns[index % ARENAS[state.config.arena].spawns.length];
          Object.assign(f, {
            x: p.x,
            y: p.y,
            vx: 0,
            vy: 0,
            grounded: true,
            action: 'idle',
            actionTime: 0,
            airJumps: 1,
            airDash: true,
            recoveryAvailable: true,
          });
          this.resetRuntime(f.id);
        }
      }
    if (command.action === 'reset-all') {
      state.deployables = [];
      state.items = [];
      this.projectiles = [];
      state.training.inputHistory = [];
    }
    return this.snapshot();
  }
  private finish(result: MatchResult): void {
    const state = this.requireState();
    state.phase = 'finished';
    state.result = result;
    this.clearInputs();
    this.event({ type: 'result' });
  }
  private syncEffects(): void {
    if (!this.state) return;
    this.state.effects = [...this.runtimes.values()]
      .flatMap((runtime) => (runtime.effect ? [runtime.effect] : []))
      .concat(this.projectiles.map((p) => p.effect));
  }
}
