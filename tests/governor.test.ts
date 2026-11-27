import { describe, expect, it } from "vitest";
import { Governor, MIN_SCALE } from "../src/governor";

const run = (g: Governor, ms: number, seconds: number, active = true): number => {
  let changes = 0;
  for (let t = 0; t < seconds * 1000; t += ms) if (g.sample(ms, active)) changes++;
  return changes;
};

describe("frame governor", () => {
  it("leaves a smooth display alone", () => {
    const g = new Governor();
    expect(run(g, 16.7, 30)).toBe(0);
    expect(g.scale).toBe(1);
  });
  it("steps the resolution down when frames run long, and stops at the floor", () => {
    const g = new Governor();
    expect(run(g, 33.3, 3)).toBeGreaterThan(0);
    expect(g.scale).toBeLessThan(1);
    run(g, 40, 60);
    expect(g.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    expect(g.scale).toBeCloseTo(MIN_SCALE, 1);
  });
  it("ignores pauses, hidden tabs and long stalls", () => {
    const g = new Governor();
    run(g, 33.3, 10, false);
    g.sample(900, true);
    expect(g.scale).toBe(1);
  });
  it("recovers after a long smooth spell, a few times at most", () => {
    const g = new Governor();
    run(g, 33.3, 3);
    const low = g.scale;
    expect(run(g, 16.7, 30)).toBeGreaterThan(0);
    expect(g.scale).toBeGreaterThan(low);
    for (let i = 0; i < 8; i++) {
      run(g, 33.3, 3);
      run(g, 16.7, 30);
    }
    expect(g.scale).toBeLessThan(1);
  });
});

import { budgetScale, PIXEL_BUDGET } from "../src/governor";
describe("pixel budget", () => {
  it("leaves ordinary screens at full size and shrinks very large canvases", () => {
    expect(budgetScale(1280, 720, 1)).toBe(1);
    expect(budgetScale(390, 844, 2)).toBe(1);
    const big = budgetScale(2560, 1440, 2);
    expect(big).toBeLessThan(0.6 + 0.01);
    expect(big).toBeGreaterThanOrEqual(0.55);
    const mid = budgetScale(2560, 1440, 1);
    expect(mid * mid * 2560 * 1440).toBeLessThanOrEqual(PIXEL_BUDGET * 1.001);
  });
  it("starts from the budget and climbs back no higher", () => {
    const g = new Governor();
    g.setBudget(0.7);
    expect(g.scale).toBeCloseTo(0.7, 5);
    expect(g.max).toBeCloseTo(0.7, 5);
  });
});
