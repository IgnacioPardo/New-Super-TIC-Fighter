import { ATTACKS } from '../shared/content';
import type { AssetsManifest, FighterState, PlayerAction } from '../shared/types';

interface Pose {
  frame: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}
/** Authored anticipation/contact/recovery sequences reuse the original layered
 * anatomy: distinct crouch, punch, uppercut and signature source poses. Each
 * costume layer receives the same deformation; no rotated jump-frame shortcut. */
const SEQUENCES: Partial<Record<PlayerAction, [number, number, number]>> = {
  'air-forward': [17, 20, 18],
  'air-down': [0, 1, 37],
  recover: [0, 37, 14],
  dodge: [0, 1, 25],
  'air-dash': [28, 29, 27],
};
const SIGNATURES: Record<string, [number, number, number]> = {
  ai: [33, 34, 25],
  robotics: [30, 32, 31],
  iot: [9, 10, 25],
  vr: [28, 29, 16],
  games: [11, 13, 12],
  printing: [14, 15, 37],
};
export function authoredPose(f: FighterState, discipline: string, art: AssetsManifest): Pose | undefined {
  const action = f.recovery > 0 && f.poseAction ? f.poseAction : f.action;
  const sequence =
    SEQUENCES[action] ?? (action === 'special' || action === 'combo' ? SIGNATURES[discipline] : undefined);
  if (!sequence) return;
  const definition =
    action in ATTACKS ? ATTACKS[action as keyof typeof ATTACKS] : { windup: 0.06, active: 0.12 };
  const phase = f.recovery > 0 && f.poseAction === action ? 2 : f.actionTime < definition.windup ? 0 : 1;
  const squeeze = phase === 0 ? 0.92 : phase === 2 ? 1.03 : 1;
  const extend = phase === 0 ? 1.08 : phase === 2 ? 0.98 : action === 'air-forward' ? 1.13 : 1;
  const total = art.sheets.columns * 7;
  return {
    frame: Math.min(sequence[phase], total - 1),
    scaleX: extend,
    scaleY: squeeze,
    offsetX: phase === 1 && action === 'air-forward' ? f.facing * 7 : 0,
    offsetY: phase === 0 ? 4 : 0,
  };
}
