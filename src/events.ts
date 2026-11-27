/**
 * Distance-based set-pieces that change the sky or the physics. Everything here is a pure
 * function of the world x, so a seed and a sequence of inputs still replay exactly.
 */
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** The storm front gathers over the last 2 km of the Mirage Straits and stays for the Obsidian Storm. */
export const STORM_FROM = 18000;
export const STORM_FULL = 20000;
export const stormK = (x: number): number => smooth((x - STORM_FROM) / (STORM_FULL - STORM_FROM));

/** Lagoons are foggy: visibility tightens and the lanterns light the way. 0..1, easing in and out at the edges. */
export function lagoonFog(x: number): number {
  if (x < 8000) return 0;
  const m = x % 10000;
  if (m < 8000) return 0;
  return smooth(Math.min(m - 8000, 10000 - m) / 500);
}

/** 8 km: the eclipse. The moon is covered, meteors fall, and gravity eases for long moon leaps. */
export const ECLIPSE_FROM = 80000;
export const ECLIPSE_TO = 88000;
export const ECLIPSE_FADE = 1200;
export const ECLIPSE_GRAVITY = 0.6;

export function eclipseK(x: number): number {
  if (x < ECLIPSE_FROM - ECLIPSE_FADE || x > ECLIPSE_TO + ECLIPSE_FADE) return 0;
  return Math.min(smooth((x - (ECLIPSE_FROM - ECLIPSE_FADE)) / (2 * ECLIPSE_FADE)), smooth((ECLIPSE_TO + ECLIPSE_FADE - x) / (2 * ECLIPSE_FADE)));
}

/** How strongly gravity pulls in the air at world x (1 normally, lower in the eclipse). */
export const gravityScale = (x: number): number => 1 - (1 - ECLIPSE_GRAVITY) * eclipseK(x);
