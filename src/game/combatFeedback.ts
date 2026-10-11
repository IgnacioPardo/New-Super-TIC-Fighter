import type { FighterState, MatchSnapshot } from '../shared/types';

export interface Burst { x: number; y: number; kind: 'hit' | 'block' | 'dust' | 'respawn' | 'fall'; age: number; life: number; facing: number }
/** Bounded presentation state. Never changes a fighter or advances simulation time. */
export class CombatFeedback {
  bursts: Burst[] = [];
  private match = '';
  private tick = -1;
  private phase = '';
  private historyFloor = -1;
  private seen = new Set<string>();
  private fighters = new Map<string, FighterState>();
  consume(state: MatchSnapshot) {
    const reset = state.matchId !== this.match;
    if (reset) { this.match = state.matchId; this.tick = -1; this.seen.clear(); this.bursts = []; this.fighters.clear(); }
    if (!reset && state.tick < this.tick) return;
    const playing = state.phase === 'playing' && this.phase === 'playing' && !reset;
    if (!playing) { this.bursts = []; this.historyFloor = state.tick; }
    for (const event of state.events) {
      if (this.seen.has(event.id)) continue;
      this.seen.add(event.id);
      // Seed the first snapshot and paused/resumed histories without replaying them.
      if (!playing || event.tick <= this.historyFloor || state.tick - event.tick > 120) continue;
      const fighter = state.fighters.find(f => f.id === (event.targetId ?? event.seatId));
      if (!fighter) continue;
      if (event.type === 'hit' || event.type === 'block') this.add(fighter.x, fighter.y - fighter.height * .6, event.type, fighter.facing);
      else if (event.type === 'respawn') this.add(fighter.x, fighter.y - 42, 'respawn', fighter.facing);
      else if (event.type === 'fall') {
        // Authority can publish fall and respawn together; use the last observed exit.
        const exiting = this.fighters.get(fighter.id) ?? fighter;
        this.add(exiting.x, Math.min(740, exiting.y), 'fall', exiting.facing);
      }
    }
    if (playing && state.tick > this.tick) for (const fighter of state.fighters) {
      const old = this.fighters.get(fighter.id);
      if (!old || fighter.eliminated || old.eliminated || Math.abs(fighter.y - old.y) > 150) continue;
      if ((!old.grounded && fighter.grounded) || (old.grounded && !fighter.grounded && fighter.vy < -100)) this.add(fighter.x, fighter.grounded ? fighter.y : old.y, 'dust', fighter.facing);
    }
    if (this.seen.size > 512) this.seen = new Set([...this.seen].slice(-256));
    this.fighters = new Map(state.fighters.map(f => [f.id, { ...f }]));
    this.tick = state.tick; this.phase = state.phase;
  }
  private add(x: number, y: number, kind: Burst['kind'], facing: number) {
    if (this.bursts.length >= 24) this.bursts.shift();
    this.bursts.push({ x, y, kind, facing, age: 0, life: kind === 'respawn' ? 420 : kind === 'dust' ? 230 : 180 });
  }
  advance(delta: number) {
    for (const burst of this.bursts) burst.age += Math.min(delta, 50);
    this.bursts = this.bursts.filter(b => b.age < b.life);
  }
}
