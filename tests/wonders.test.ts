import { describe, expect, it } from "vitest";
import { COYOTE, makeEvents, makeSpirit, step, STEP } from "../src/physics";
import { METEOR_H, METEOR_SETTLE, RING_CHUNK, Terrain } from "../src/terrain";

const find = (t: Terrain, pick: (c: ReturnType<Terrain["chunk"]>) => boolean): number => {
  for (let c = 3; c < 200; c++) if (pick(t.chunk(c))) return c;
  return -1;
};

describe("meteor splash-ramps", () => {
  it("raise the water once struck, and shards hang above them", () => {
    const t = new Terrain(21);
    const c = find(t, (ch) => ch.meteors.length > 0);
    expect(c).toBeGreaterThan(0);
    const ch = t.chunk(c);
    const m = ch.meteors[0];
    expect(ch.shards).toHaveLength(3);
    const flat = t.height(m.x);
    t.frame = 100;
    t.trigger(m.x - 800);
    expect(m.at).toBe(100);
    t.frame = 100 + 80;
    expect(t.height(m.x)).toBeCloseTo(flat + METEOR_H, 3);
    // Slope is the exact derivative of the height, ramp included.
    for (const x of [m.x - 150, m.x - 40, m.x + 90]) {
      const num = (t.height(x + 0.5) - t.height(x - 0.5)) / 1;
      expect(t.slope(x)).toBeCloseTo(num, 2);
    }
  });

  it("shards are only caught after the strike has settled", () => {
    const t = new Terrain(21);
    const c = find(t, (ch) => ch.shards.length > 0);
    const sh = t.chunk(c).shards[1];
    const s = makeSpirit(t);
    const ev = makeEvents();
    s.x = s.px = sh.x - 5;
    s.y = s.py = sh.y;
    s.vx = 400;
    s.vy = 0;
    s.frames = 500;
    sh.m.at = s.frames - (METEOR_SETTLE - 5);
    step(s, t, false, ev, STEP);
    expect(sh.taken).toBe(false);
    s.x = s.px = sh.x - 5;
    s.y = s.py = sh.y;
    sh.m.at = s.frames - METEOR_SETTLE - 2;
    step(s, t, false, ev, STEP);
    expect(sh.taken).toBe(true);
    expect(ev.gem).toBe(1);
  });

  it("is deterministic", () => {
    const run = () => {
      const t = new Terrain(21);
      const s = makeSpirit(t);
      const ev = makeEvents();
      for (let i = 0; i < 6000; i++) step(s, t, i % 100 < 45, ev, STEP);
      return [s.x, s.y, s.gems];
    };
    expect(run()).toEqual(run());
  });
});

describe("abyssal caverns", () => {
  it("hold a trail of seven gems in the deep", () => {
    const t = new Terrain(9);
    const c = find(t, (ch) => ch.caverns.length > 0);
    expect(c).toBeGreaterThan(0);
    const cv = t.chunk(c).caverns[0];
    const inside = t.chunk(c).gems.filter((g) => g.x >= cv.x && g.x <= cv.x + cv.w);
    expect(inside.length).toBeGreaterThanOrEqual(7);
    for (const g of inside) expect(g.y).toBeLessThan(t.height(g.x));
    expect(cv.x + cv.w).toBeLessThan((c + 1) * RING_CHUNK);
  });
});

describe("coyote launch window", () => {
  it("arms while holding over a crest and launches a late release, then expires", () => {
    const t = new Terrain(3);
    const mk = () => {
      const s = makeSpirit(t);
      s.grounded = true;
      s.x = s.px = 7300;
      s.y = s.py = t.height(7300);
      s.speed = 1400;
      return s;
    };
    expect(COYOTE).toBeGreaterThan(0.05);
    expect(COYOTE).toBeLessThan(0.2);
    // Armed: pretend the crest just passed while holding.
    const s = mk();
    const ev = makeEvents();
    s.coyote = COYOTE;
    step(s, t, false, ev, STEP);
    expect(ev.takeoff).toBe(true);
    expect(s.grounded).toBe(false);
    // No window, no launch on a descent while holding.
    const d = mk();
    d.coyote = 0;
    step(d, t, true, ev, STEP);
    expect(d.grounded || d.under).toBe(true);
  });

  it("only arms over a crest while holding", () => {
    const t = new Terrain(3);
    let armed = 0;
    const s = makeSpirit(t);
    const ev = makeEvents();
    for (let i = 0; i < 3000; i++) {
      step(s, t, s.grounded, ev, STEP);
      if (s.coyote > 0) armed++;
    }
    expect(armed).toBeGreaterThan(0);
    const free = makeSpirit(t);
    for (let i = 0; i < 3000; i++) {
      step(free, t, false, ev, STEP);
      expect(free.coyote).toBe(0);
    }
  });
});
