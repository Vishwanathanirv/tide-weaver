import { describe, expect, it } from "vitest";
import { makeEvents, makeSpirit, step, MAX_SPEED, MIN_SPEED, type Spirit } from "../src/physics";
import { Terrain } from "../src/terrain";
import { exportCode, importCode, sanitize, Vault, defaults, type KV } from "../src/save";
import { degreeToMidi } from "../src/audio";

/** Dive on downslopes, glide on upslopes: a simple player that rides well. */
function ride(seed: number, steps: number): { s: Spirit; takeoffs: number; perfects: number; landings: number } {
  const t = new Terrain(seed);
  const s = makeSpirit(t);
  const ev = makeEvents();
  let takeoffs = 0;
  let landings = 0;
  for (let i = 0; i < steps; i++) {
    const hold = s.grounded && t.slope(s.x) < 0 && t.slope(s.x) > -0.55;
    step(s, t, hold, ev);
    if (ev.takeoff) takeoffs++;
    if (ev.landing) landings++;
  }
  return { s, takeoffs, perfects: s.perfects, landings };
}

describe("terrain", () => {
  it("slope is the exact derivative of height", () => {
    const t = new Terrain(1234);
    for (const x of [0, 137, 999, 5000, 42000, 70000]) {
      const h = 0.01;
      const numeric = (t.height(x + h) - t.height(x - h)) / (2 * h);
      expect(t.slope(x)).toBeCloseTo(numeric, 3);
    }
  });

  it("the same seed builds the same ocean, a different seed a different one", () => {
    expect(new Terrain(7).height(3210)).toBe(new Terrain(7).height(3210));
    expect(new Terrain(7).height(3210)).not.toBe(new Terrain(8).height(3210));
  });

  it("rings are repeatable and sit above the waves", () => {
    const a = new Terrain(5).rings(3);
    const b = new Terrain(5).rings(3);
    expect(a.map((r) => [r.x, r.y])).toEqual(b.map((r) => [r.x, r.y]));
    const t = new Terrain(5);
    for (const r of a) expect(r.y).toBeGreaterThan(t.height(r.x) + 200);
  });
});

describe("physics", () => {
  it("is deterministic for a seed and input sequence", () => {
    const a = ride(99, 3000).s;
    const b = ride(99, 3000).s;
    expect([a.x, a.y, a.flow, a.combo]).toEqual([b.x, b.y, b.flow, b.combo]);
  });

  it("a good rider takes off, lands perfectly and keeps moving forward", () => {
    const r = ride(2024, 60 * 90);
    expect(r.takeoffs).toBeGreaterThan(5);
    expect(r.landings).toBeGreaterThan(5);
    expect(r.perfects).toBeGreaterThan(0);
    expect(r.s.distance).toBeGreaterThan(20000);
  });

  it("never produces NaN or leaves its speed limits, even holding forever", () => {
    const t = new Terrain(3);
    const s = makeSpirit(t);
    const ev = makeEvents();
    for (let i = 0; i < 60 * 120; i++) {
      step(s, t, i % 400 < 300, ev);
      expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
      if (s.grounded) {
        expect(s.speed).toBeGreaterThanOrEqual(MIN_SPEED);
        expect(s.speed).toBeLessThanOrEqual(MAX_SPEED);
        expect(s.y).toBeCloseTo(t.height(s.x), 6);
      } else if (!s.under) {
        expect(s.y).toBeGreaterThan(t.height(s.x));
      } else {
        expect(s.y).toBeLessThanOrEqual(t.height(s.x));
        expect(s.y).toBeGreaterThanOrEqual(t.height(s.x) - 421);
      }
    }
  });
});

class Mem implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

describe("save vault", () => {
  it("round-trips and falls back to the backup slot when the primary is corrupt", () => {
    const kv = new Mem();
    const v = new Vault(kv);
    const d = defaults();
    d.stats.perfects = 31;
    d.unlocked.push("tide");
    d.aura = "tide";
    v.save(d);
    expect(v.load().stats.perfects).toBe(31);
    kv.setItem("tide-weaver.save.a", "{broken");
    expect(v.load().aura).toBe("tide");
    kv.setItem("tide-weaver.save.b", kv.getItem("tide-weaver.save.b")!.replace("31", "99"));
    expect(v.load().stats.perfects).toBe(0);
  });

  it("export codes load back, and tampered codes are refused", () => {
    const d = defaults();
    d.bestEndless = 12345;
    const code = exportCode(d);
    expect(importCode(code)?.bestEndless).toBe(12345);
    expect(importCode(code.slice(0, -4) + "AAAA")).toBeNull();
    expect(importCode("hello")).toBeNull();
  });

  it("sanitize drops unknown auras and keeps the worn aura unlocked", () => {
    const s = sanitize({ unlocked: ["prism", "dragon"], aura: "dragon", stats: { perfects: -5 } });
    expect(s.unlocked).toEqual(["ember", "prism"]);
    expect(s.aura).toBe("ember");
    expect(s.stats.perfects).toBe(0);
  });
});

describe("music", () => {
  it("maps every degree into D major pentatonic", () => {
    const allowed = new Set([2, 4, 6, 9, 11]); // D E F# A B as pitch classes
    for (let d = 0; d <= 14; d++) expect(allowed.has(degreeToMidi(d) % 12)).toBe(true);
  });
});
