import { describe, expect, it } from "vitest";
import { makeEvents, makeSpirit, step, surge, STEP, SURGE_COOLDOWN, SURGE_TIME, MAX_SPEED } from "../src/physics";
import { Terrain } from "../src/terrain";

function airborne() {
  const t = new Terrain(11);
  const s = makeSpirit(t);
  const ev = makeEvents();
  step(s, t, false, ev, STEP);
  return { t, s, ev };
}

describe("surge", () => {
  it("adds speed in the air and starts its timers", () => {
    const { s } = airborne();
    expect(s.grounded).toBe(false);
    const before = s.vx;
    expect(surge(s)).toBe(true);
    expect(s.vx).toBeGreaterThan(before);
    expect(s.vx).toBeLessThanOrEqual(MAX_SPEED);
    expect(s.surge).toBeCloseTo(SURGE_TIME);
    expect(s.surgeCd).toBeCloseTo(SURGE_COOLDOWN);
  });

  it("refuses while cooling down, then works again", () => {
    const { t, s, ev } = airborne();
    expect(surge(s)).toBe(true);
    expect(surge(s)).toBe(false);
    for (let i = 0; i < Math.ceil(SURGE_COOLDOWN / STEP) + 2; i++) step(s, t, false, ev, STEP);
    expect(s.surge).toBe(0);
    expect(s.surgeCd).toBe(0);
    expect(surge(s)).toBe(true);
  });

  it("is refused under water", () => {
    const { s } = airborne();
    s.under = true;
    expect(surge(s)).toBe(false);
  });

  it("stays deterministic and finite", () => {
    const run = () => {
      const t = new Terrain(5);
      const s = makeSpirit(t);
      const ev = makeEvents();
      for (let i = 0; i < 3000; i++) {
        if (i % 400 === 100) surge(s);
        step(s, t, i % 90 < 40, ev, STEP);
      }
      return [s.x, s.y, s.speed];
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    for (const v of a) expect(Number.isFinite(v)).toBe(true);
  });
});
