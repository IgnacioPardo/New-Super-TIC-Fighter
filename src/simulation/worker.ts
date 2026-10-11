import { TICK_RATE } from '../shared/types';
import type { SimulationCommand, SimulationMessage } from '../shared/types';
import { Simulation } from './Simulation';

const simulation = new Simulation();
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SimulationCommand>) => void) | null;
  postMessage: (message: SimulationMessage) => void;
};
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
const period = 1000 / TICK_RATE;
let nextTick = 0;
function publish(): void { scope.postMessage({ type: 'snapshot', snapshot: simulation.snapshot() }); }
function loop(): void {
  if (!running) return;
  scope.postMessage({ type: 'snapshot', snapshot: simulation.step() });
  const now = performance.now();
  // Schedule one step only. A suspended browser never releases a catch-up burst
  // or retroactively spends match time; online health policy lives in transport.
  nextTick = Math.max(nextTick + period, now + period / 2);
  timer = setTimeout(loop, Math.max(0, nextTick - now));
}
scope.onmessage = ({ data }) => {
  if (data.type !== 'start' && !running) return;
  switch (data.type) {
    case 'start':
      if (timer !== undefined) clearTimeout(timer);
      simulation.createMatch(data.config, data.matchId); running = true;
      nextTick = performance.now() + period; publish();
      timer = setTimeout(loop, period); break;
    case 'inputs': simulation.setInputs(data.inputs); break;
    case 'pause': simulation.pause(); publish(); break;
    case 'resume': simulation.resume(); publish(); break;
    case 'forfeit': simulation.forfeit(data.seatIds); publish(); break;
    case 'stop': running = false; if (timer !== undefined) clearTimeout(timer); simulation.stop(); break;
  }
};
