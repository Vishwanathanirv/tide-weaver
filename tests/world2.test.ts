import { describe, expect, it } from "vitest";
import { TIDE_AT, TIDE_ESCAPE_GAP, TIDE_GAP, TIDE_MAX_STEPS, tideState, tideX } from "../src/tide";
import { RING_CHUNK, Terrain, lagoonAt } from "../src/terrain";
import { makeEvents, makeSpirit, step, STEP } from "../src/physics";
import { makeRun, makeRunEvents, updateRun } from "../src/rules";

describe("tidal wave", () => {
  it("starts well behind you and moves at a steady pace", () => {
    expect(tideX(0)).toBe(TIDE_AT - TIDE_GAP);
    expect(tideX(60) - tideX(0)).toBeCloseTo(560);
  });

  it("is outrun by a fast spirit and catches a slow one", () => {
    const fast = (steps: number) => TIDE_AT + (steps * 900) / 60;
    const slow = (steps: number) => TIDE_AT + (steps * 300) / 60;
    let fastEnd = "chasing";
    let slowEnd = "chasing";
    for (let s = 1; s < TIDE_MAX_STEPS + 10 && (fastEnd === "chasing" || slowEnd === "chasing"); s++) {
      if (fastEnd === "chasing") fastEnd = tideState(fast(s), s);
      if (slowEnd === "chasing") slowEnd = tideState(slow(s), s);
    }
    expect(fastEnd).toBe("escaped");
    expect(slowEnd).toBe("caught");
  });

  it("is anchored to where you were when it rose, so a late start still gives a full chase", () => {
    const base = 41000;
    expect(tideX(0, base)).toBe(base - TIDE_GAP);
    expect(tideState(base, 0, base)).toBe("chasing");
    expect(tideState(base, 1, base)).toBe("chasing");
  });

  it("lets go after the time limit even if you stay just ahead", () => {
    const steps = TIDE_MAX_STEPS + 1;
    expect(tideState(tideX(steps) + TIDE_ESCAPE_GAP - 1, steps)).toBe("escaped");
  });
});

describe("lagoons", () => {
  it("are the last 2 km of every kilometre from the first on", () => {
    expect(lagoonAt(7999)).toBe(false);
    expect(lagoonAt(8000)).toBe(true);
    expect(lagoonAt(9999)).toBe(true);
    expect(lagoonAt(10000)).toBe(false);
    expect(lagoonAt(28500)).toBe(true);
    expect(lagoonAt(1000)).toBe(false);
  });

  it("hold bonus rings and no traps, in every biome", () => {
    const t = new Terrain(321);
    for (const km of [1, 2, 3, 4, 6]) {
      const idx = (km * 10000 - RING_CHUNK) / RING_CHUNK;
      const c = t.chunk(idx);
      expect(c.spikes).toHaveLength(0);
      expect(c.gates).toHaveLength(0);
      expect(c.collapses).toHaveLength(0);
      expect(c.rings.length).toBeGreaterThanOrEqual(4);
      expect(c.rings.every((r) => !r.trick)).toBe(true);
      expect(c.gems.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("leave the other chunks as they were", () => {
    const t = new Terrain(321);
    // Chunk 12 is in the Obsidian Storm and not a lagoon; with this seed the storm still has traps overall.
    let traps = 0;
    for (let i = 10; i < 30; i++) if (i % 5 !== 4) traps += t.chunk(i).spikes.length + t.chunk(i).gates.length;
    expect(traps).toBeGreaterThan(5);
  });
});

describe("light", () => {
  it("is refilled by gems and by breaching out of the water", () => {
    const t = new Terrain(1);
    const s = makeSpirit(t);
    const ev = makeEvents();
    const out = makeRunEvents();
    const run = makeRun("journey", false);
    run.light = 0.5;
    step(s, t, false, ev, STEP);
    ev.gem = 1;
    updateRun(run, s, ev, 0, 0, out);
    expect(run.light).toBeGreaterThan(0.55);
    const before = run.light;
    ev.gem = 0;
    ev.breach = true;
    updateRun(run, s, ev, 0, 0, out);
    expect(run.light).toBeGreaterThan(before + 0.05);
  });
});
