import { describe, expect, it } from "vitest";
import { IDLE_FREE, IDLE_RAMP, lazyness, makeRun, makeRunEvents, updateRun } from "../src/rules";
import { makeEvents, makeSpirit, step, STEP } from "../src/physics";
import { Terrain } from "../src/terrain";

/** Plays the real physics and rules for up to `seconds`, with a rule for when the player holds. */
function play(seed: number, holdRule: (s: ReturnType<typeof makeSpirit>, t: Terrain) => boolean, gentle: boolean, seconds = 600) {
  const t = new Terrain(seed);
  const s = makeSpirit(t);
  const ev = makeEvents();
  const run = makeRun("journey", gentle);
  const out = makeRunEvents();
  let idle = 0;
  let f = 0;
  for (; f < seconds * 60 && !run.ended; f++) {
    const hold = holdRule(s, t);
    idle = hold ? 0 : idle + STEP;
    run.idle = idle;
    const x0 = s.x;
    step(s, t, hold, ev, STEP, true);
    updateRun(run, s, ev, s.x - x0, STEP, out);
    if (ev.crash) s.combo = 0;
  }
  return { secs: f / 60, km: s.distance / 10000, run };
}

describe("idleness", () => {
  it("is nothing for the first few seconds, then ramps to full", () => {
    expect(lazyness(0)).toBe(0);
    expect(lazyness(IDLE_FREE)).toBe(0);
    expect(lazyness(IDLE_FREE + IDLE_RAMP / 2)).toBeCloseTo(0.5, 5);
    expect(lazyness(IDLE_FREE + IDLE_RAMP)).toBe(1);
    expect(lazyness(500)).toBe(1);
  });

  it("a player who touches nothing runs out of light within about fifteen seconds", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const gentle of [false, true]) {
        const r = play(seed, () => false, gentle);
        expect(r.run.ended).toBe(true);
        expect(r.secs).toBeLessThan(16);
        expect(r.km).toBeLessThan(1);
      }
    }
  });

  it("a player who dives the downhills goes far longer, and the first-run grace still helps them", () => {
    const dive = (s: ReturnType<typeof makeSpirit>, t: Terrain) => s.grounded && t.slope(s.x) < -0.02;
    let normalTotal = 0;
    let gentleTotal = 0;
    for (const seed of [1, 2, 3, 4]) {
      const normal = play(seed, dive, false);
      const gentle = play(seed, dive, true);
      expect(normal.secs).toBeGreaterThan(20);
      normalTotal += normal.secs;
      gentleTotal += gentle.secs;
    }
    expect(gentleTotal).toBeGreaterThan(normalTotal);
  });

  it("gliding with no input earns almost nothing and never raises the tier", () => {
    const r = play(7, () => false, false);
    expect(r.run.score).toBeLessThan(150);
    expect(r.run.tier).toBe(0);
  });

  it("says why the light went out", () => {
    const r = play(8, () => false, false);
    expect(r.run.cause).toContain("pressing");
  });
});
