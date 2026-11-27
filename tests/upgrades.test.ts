import { describe, expect, it } from "vitest";
import { MAX_LEVEL, SKINS, UPGRADES, drainOf, pullOf, skinOf, startSpeedOf, surgeCoolOf, surgeCostOf } from "../src/gear";
import { Terrain } from "../src/terrain";
import { makeSpirit, surge } from "../src/physics";
import { decode, encode } from "../src/ghost";
import { sanitize } from "../src/save";

describe("gem upgrades", () => {
  it("starts cheap and gets dearer", () => {
    for (const u of UPGRADES) {
      expect(u.price[0]).toBeLessThanOrEqual(25);
      expect(u.price.length).toBe(MAX_LEVEL);
      for (let i = 1; i < u.price.length; i++) expect(u.price[i]).toBeGreaterThan(u.price[i - 1]);
    }
  });
  it("Light Vessel adds about 8% duration per level", () => {
    expect(drainOf(0)).toBe(1);
    expect(1 / drainOf(1)).toBeCloseTo(1.08, 5);
    expect(1 / drainOf(5)).toBeCloseTo(1.4, 5);
  });
  it("Surge Core recharges faster and costs less light", () => {
    expect(surgeCoolOf(0)).toBeCloseTo(4.5, 5);
    expect(surgeCoolOf(5)).toBeGreaterThan(2.7);
    expect(surgeCoolOf(5)).toBeLessThan(2.9);
    expect(surgeCostOf(5)).toBeLessThan(surgeCostOf(0));
  });
  it("Tide Magnet widens pull outside Surge, and levels are clamped", () => {
    expect(pullOf(5)).toBeGreaterThan(pullOf(0));
    expect(pullOf(99)).toBe(pullOf(5));
    expect(pullOf(-3)).toBe(1);
  });
  it("spirit uses the Surge Core cooldown", () => {
    const s = makeSpirit(new Terrain(1), 2.1, 7.2, 1, 1, surgeCoolOf(5));
    expect(surge(s)).toBe(true);
    expect(s.surgeCd).toBeCloseTo(surgeCoolOf(5), 5);
  });
  it("saves keep only valid levels", () => {
    expect(sanitize({ up: { vessel: 3, magnet: 99, core: "x" } }).up).toEqual({ vessel: 3, magnet: 5, core: 0, boost: 0 });
    expect(sanitize({}).up).toEqual({ vessel: 0, magnet: 0, core: 0, boost: 0 });
  });
  it("ghost links carry the levels", () => {
    const g = decode(encode({ seed: 5, hazards: true, board: "wake", magnet: 4, core: 2, boost: 0, score: 1, end: 10, frames: [1], kinds: [0] }))!;
    expect([g.magnet, g.core]).toEqual([4, 2]);
  });
  it("Start Boost raises launch speed and rides in ghost links", () => {
    expect(startSpeedOf(0)).toBe(440);
    expect(startSpeedOf(5)).toBe(590);
    const s = makeSpirit(new Terrain(1), 2.1, 7.2, 1, 1, 4.5, startSpeedOf(3));
    expect(s.speed).toBe(530);
    expect(s.vx).toBe(530);
    const g = decode(encode({ seed: 5, hazards: true, board: "wake", magnet: 0, core: 0, boost: 3, score: 1, end: 10, frames: [1], kinds: [0] }))!;
    expect(g.boost).toBe(3);
  });
  it("skins are owned only when bought, and fall back to the nomad", () => {
    expect(SKINS[0].price).toBe(0);
    expect(skinOf("nope").id).toBe("nomad");
    expect(sanitize({ skin: "ronin", owned: ["wake"] }).skin).toBe("nomad");
    expect(sanitize({ skin: "ronin", owned: ["ronin"] }).skin).toBe("ronin");
  });
  it("saves keep the chest day and run-end counts in range", () => {
    expect(sanitize({ chest: "2026-11-27" }).chest).toBe("2026-11-27");
    expect(sanitize({ chest: "tomorrow" }).chest).toBe("");
    const e = sanitize({ ends: [3, -2, "x", 1.9] }).ends;
    expect(e).toHaveLength(12);
    expect(e.slice(0, 4)).toEqual([3, 0, 0, 1]);
  });
});
