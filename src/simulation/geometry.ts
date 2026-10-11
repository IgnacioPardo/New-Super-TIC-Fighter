import { PHYSICS } from '../shared/content';
import type { FighterState, Platform } from '../shared/types';

export interface Rectangle { x: number; y: number; width: number; height: number }
export const bodyBounds = (fighter: FighterState): Rectangle => ({
  x: Math.trunc(fighter.x - PHYSICS.bodyWidth / 2),
  y: Math.trunc(fighter.y - fighter.height),
  width: PHYSICS.bodyWidth, height: fighter.height,
});
export const overlaps = (a: Rectangle, b: Rectangle): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export function supportingPlatform(fighter: FighterState, platforms: Platform[]): number {
  return platforms.findIndex(platform => Math.abs(fighter.y - platform.y) < 0.01 &&
    fighter.x + PHYSICS.bodyWidth / 2 > platform.x && fighter.x - PHYSICS.bodyWidth / 2 < platform.x + platform.width);
}

/** Cross the top surface using the body position at the exact crossing fraction. */
export function sweptLanding(oldX: number, oldFeet: number, nextX: number, nextFeet: number, platforms: Platform[]): Platform | undefined {
  if (nextFeet <= oldFeet) return;
  let first: Platform | undefined;
  for (const platform of platforms) {
    if (oldFeet > platform.y + 0.01 || nextFeet < platform.y) continue;
    const fraction = (platform.y - oldFeet) / (nextFeet - oldFeet);
    const crossingX = oldX + (nextX - oldX) * fraction;
    if (crossingX + PHYSICS.bodyWidth / 2 <= platform.x || crossingX - PHYSICS.bodyWidth / 2 >= platform.x + platform.width) continue;
    if (!first || platform.y < first.y) first = platform;
  }
  return first;
}

/** Original surface search: extend downward, stopping when top reaches 800. */
export function effectBottom(x: number, width: number, height: number, feet: number, platforms: Platform[]): number {
  const supporting = platforms.filter(platform => x < platform.x + platform.width && x + width > platform.x && platform.y + platform.height > feet - height && platform.y >= feet - height)
    .sort((a, b) => a.y - b.y)[0];
  return supporting ? Math.max(feet, supporting.y + 1) : Math.max(feet, 800 + height);
}
