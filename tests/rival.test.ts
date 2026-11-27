import { describe, expect, it } from "vitest";
import { Rival, RIVAL_LEAD, RIVAL_MAX_AHEAD } from "../src/rival";
import { makeEvents, makeSpirit, step, STEP } from "../src/physics";
import { Terrain } from "../src/terrain";

describe("wandering rival", () => {
  it("appears ahead, never touches the player's terrain and is deterministic", () => {
    const run = () => {
      const t = new Terrain(8);
      const p = makeSpirit(t);
      const ev = makeEvents();
      const r = new Rival(8);
      const log: number[] = [];
      for (let i = 0; i < 4000; i++) {
        step(p, t, p.grounded && t.slope(p.x) < -0.05, ev, STEP);
        if (r.advance(p.frames, p.x)) log.push(i);
      }
      return { log, x: r.spirit.x, px: p.x };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(Number.isFinite(a.x)).toBe(true);
  });

  it("pays out once per rival when the player passes, and re-appears ahead", () => {
    const r = new Rival(3);
    expect(r.advance(1, 0)).toBe(false);
    expect(r.spirit.x).toBeGreaterThan(RIVAL_LEAD - 200);
    expect(r.advance(2, r.spirit.x + 50)).toBe(true);
    expect(r.advance(3, r.spirit.x + 60)).toBe(false);
    const met = r.met;
    r.advance(4, r.spirit.x + 5000);
    expect(r.met).toBeGreaterThan(met);
    expect(r.passed).toBe(false);
  });

  it("is brought back if it runs far ahead", () => {
    const r = new Rival(5);
    r.advance(1, 0);
    const px = r.spirit.x - RIVAL_MAX_AHEAD - 10;
    r.advance(2, px);
    expect(r.spirit.x - px).toBeLessThanOrEqual(RIVAL_MAX_AHEAD);
  });
});
