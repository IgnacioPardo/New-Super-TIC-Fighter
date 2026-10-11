import type { MatchSnapshot } from '../shared/types';
/** Authority checkpoints keep bot observations. Prediction never runs bot AI, so
 * wire snapshots omit that rolling history while retaining gameplay runtimes. */
export function wireSnapshot(snapshot:MatchSnapshot):MatchSnapshot {
  if(!snapshot.runtime)return snapshot;
  return {...snapshot,runtime:{...snapshot.runtime,...(snapshot.runtime.bot?{bot:{...snapshot.runtime.bot,observations:[]}}:{})}};
}
