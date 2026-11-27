/**
 * The tidal wave set-piece. At 3 km a wall of water rises 1.8 km behind you and chases you at a
 * steady pace. Stay ahead of it and it falls away; let it catch you and the light goes out.
 * It depends only on the physics step count, so it never changes the physics and a ghost's run
 * (which records where the run ended) stays valid.
 */
export const TIDE_AT = 30000;
export const TIDE_GAP = 1800;
/** World units per second. A good run goes faster than this; a stalled one does not. */
export const TIDE_SPEED = 560;
/** Once you are this far ahead the wall breaks up and you have outrun it. */
export const TIDE_ESCAPE_GAP = 3200;
export const TIDE_MAX_STEPS = 45 * 60;

/** Where the wall is, `steps` physics steps after it rose. */
export const tideX = (steps: number): number => TIDE_AT - TIDE_GAP + (steps * TIDE_SPEED) / 60;

export type TideState = "chasing" | "caught" | "escaped";

export function tideState(spiritX: number, steps: number): TideState {
  const gap = spiritX - tideX(steps);
  if (gap <= 0) return "caught";
  if (gap > TIDE_ESCAPE_GAP || steps > TIDE_MAX_STEPS) return "escaped";
  return "chasing";
}
