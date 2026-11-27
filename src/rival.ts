import { makeEvents, makeSpirit, step, STEP, type Spirit, type StepEvents } from "./physics";
import { Terrain } from "./terrain";

/** How far ahead a rival appears, and how far it may drift ahead or behind before it is replaced. */
export const RIVAL_LEAD = 2600;
export const RIVAL_MAX_AHEAD = 7000;
export const RIVAL_MAX_BEHIND = 2200;

/**
 * A wandering spirit: a computer-steered rider on its own copy of the wave. It never touches the
 * player's physics, hazards or score. It dives the downslopes and lets go on the rises, like a
 * decent but unremarkable player. Pass it, and it pays out once.
 */
export class Rival {
  readonly terrain: Terrain;
  spirit: Spirit;
  private ev: StepEvents = makeEvents();
  /** The player has already overtaken this one. */
  passed = false;
  /** Rivals met so far in this run. */
  met = 0;

  constructor(
    seed: number,
    readonly pace = 1,
  ) {
    this.terrain = new Terrain(seed);
    this.spirit = makeSpirit(this.terrain);
  }

  /** Puts a fresh rival on the wave at x, in step with the player's frame count. */
  appear(x: number, frames: number): void {
    const s = makeSpirit(this.terrain);
    s.x = s.px = x;
    s.y = s.py = this.terrain.height(x) + 40;
    s.vx = s.speed = 520 * this.pace;
    s.frames = frames;
    this.spirit = s;
    this.passed = false;
    this.met++;
  }

  /** Steps the rival until it has taken `frames` steps. Returns true when the player has just passed it. */
  advance(frames: number, playerX: number): boolean {
    const s = this.spirit;
    if (s.frames === 0 && s.x === 0) this.appear(RIVAL_LEAD, frames);
    while (this.spirit.frames < frames) {
      const sp = this.spirit;
      const hold = sp.grounded ? this.terrain.slope(sp.x) < -0.02 : sp.vy < -300 && sp.y - this.terrain.height(sp.x) < 90;
      step(sp, this.terrain, hold, this.ev, STEP, false);
    }
    const r = this.spirit;
    if (r.x - playerX > RIVAL_MAX_AHEAD) this.appear(playerX + RIVAL_LEAD, frames);
    else if (playerX - r.x > RIVAL_MAX_BEHIND && this.passed) this.appear(playerX + RIVAL_LEAD + 1200, frames);
    if (!this.passed && playerX > this.spirit.x) {
      this.passed = true;
      return true;
    }
    return false;
  }
}
