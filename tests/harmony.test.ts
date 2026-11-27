import { describe, expect, it } from "vitest";
import { PROGRESSION, cutoffFor, stemLevels } from "../src/harmony";

const base = { speed: 0, mult: 1, strato: 0, air: 0, depth: 0, live: true };

describe("harmonic bed", () => {
  it("stays inside D Lydian (D E F# G# A B C#)", () => {
    const lydian = new Set([2, 4, 6, 8, 9, 11, 1]);
    for (const chord of PROGRESSION) for (const n of chord) expect(lydian.has(n % 12)).toBe(true);
    expect(PROGRESSION).toHaveLength(4);
  });
  it("only the base plays at rest", () => {
    const l = stemLevels(base);
    expect(l.base).toBe(1);
    expect(l.speed + l.flow + l.sky + l.abyss).toBe(0);
  });
  it("speed, flow, sky and abyss each open with their own condition", () => {
    expect(stemLevels({ ...base, speed: 0.9 }).speed).toBe(1);
    expect(stemLevels({ ...base, mult: 1.4 }).flow).toBe(0);
    expect(stemLevels({ ...base, mult: 3 }).flow).toBe(1);
    expect(stemLevels({ ...base, strato: 1 }).sky).toBe(1);
    expect(stemLevels({ ...base, air: 0.2 }).sky).toBe(0);
    expect(stemLevels({ ...base, depth: 0.7 }).abyss).toBe(1);
  });
  it("sweeps the low-pass from open to 250 Hz with depth", () => {
    expect(cutoffFor(0)).toBeCloseTo(9000, 3);
    expect(cutoffFor(1)).toBeCloseTo(250, 3);
    expect(cutoffFor(0.5)).toBeLessThan(cutoffFor(0.2));
  });
});
