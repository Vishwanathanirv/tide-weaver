import { describe, expect, it } from "vitest";
import { OPENING_SAFE, Terrain } from "../src/terrain";

describe("scripted opening", () => {
  it("is the same on every wave and clear of traps", () => {
    for (const seed of [1, 99, 4000000000]) {
      const t = new Terrain(seed);
      const c0 = t.chunk(0);
      const c1 = t.chunk(1);
      const rail = c0.rails[0];
      expect(rail.x0).toBeGreaterThanOrEqual(1550);
      expect(rail.x1).toBeLessThanOrEqual(2500);
      expect(rail.y0).toBeGreaterThan(t.height(rail.x0) + 60);
      expect(c1.rings.filter((r) => r.x >= 2600 && r.x <= 3700).length).toBeGreaterThanOrEqual(4);
      expect(c1.whirls.some((w) => w.x < 4000)).toBe(true);
      for (let c = 0; c < 2; c++) {
        const ch = t.chunk(c);
        for (const sp of ch.spikes) expect(sp.x).toBeGreaterThan(OPENING_SAFE);
        for (const g of ch.gates) expect(g.x).toBeGreaterThan(OPENING_SAFE);
        for (const col of ch.collapses) expect(col.x).toBeGreaterThan(OPENING_SAFE);
      }
    }
  });
});

import { makeEvents, makeSpirit, step, STEP } from "../src/physics";

describe("opening is playable", () => {
  it("a plain dive-the-downhills rider reaches the opening Sky-Rail on most waves, then a whirlpool", () => {
    let rail = 0;
    let whirl = 0;
    const n = 60;
    for (let i = 0; i < n; i++) {
      const t = new Terrain(5000 + i * 13);
      const s = makeSpirit(t);
      const ev = makeEvents();
      let r = false;
      let w = false;
      for (let f = 0; f < 60 * 14 && s.x < 4600; f++) {
        step(s, t, s.grounded && t.slope(s.x) < -0.02, ev, STEP, true);
        if (ev.railOn) r = true;
        if (ev.whirlIn) w = true;
      }
      if (r) rail++;
      if (w) whirl++;
    }
    expect(rail / n).toBeGreaterThan(0.5);
    expect(whirl / n).toBeGreaterThan(0.7);
  });
});
