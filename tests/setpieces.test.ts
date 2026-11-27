import { describe, expect, it } from "vitest";
import { BLESS_TIME, MAX_SPEED, makeEvents, makeSpirit, step, STEP } from "../src/physics";
import { LEV_EVERY, LEV_H, RING_CHUNK, Terrain, railY, type Cloud, type Rail, type Whirl } from "../src/terrain";
import { ECLIPSE_FROM, ECLIPSE_TO, eclipseK, gravityScale, stormK } from "../src/events";

const SEED = 4242;

function firstRail(t: Terrain): Rail {
  for (let c = 2; c < 40; c += 2) {
    const r = t.chunk(c).rails[0];
    if (r) return r;
  }
  throw new Error("no rail");
}

function firstWhirl(t: Terrain): Whirl {
  for (let c = 2; c < 80; c++) {
    const w = t.chunk(c).whirls[0];
    if (w) return w;
  }
  throw new Error("no whirl");
}

function firstCloud(t: Terrain): Cloud {
  for (let c = 10; c < 80; c++) {
    const w = t.chunk(c).clouds[0];
    if (w) return w;
  }
  throw new Error("no cloud");
}

describe("sky-rails", () => {
  it("float well above the waves; only the scripted opening has one before chunk 2", () => {
    const t = new Terrain(SEED);
    expect(t.chunk(0).rails).toHaveLength(1);
    expect(t.chunk(1).rails).toHaveLength(0);
    let found = 0;
    for (let c = 2; c < 60; c += 2) {
      for (const r of t.chunk(c).rails) {
        found++;
        expect(railY(r, r.x0)).toBeGreaterThan(t.height(r.x0) + 450);
        expect(r.x1).toBeLessThan((c + 1) * RING_CHUNK);
        expect(r.x0).toBeGreaterThanOrEqual(c * RING_CHUNK);
      }
    }
    expect(found).toBeGreaterThan(15);
  });

  it("lock the board on when crossed, carry it to the end, and let go", () => {
    const t = new Terrain(SEED);
    const r = firstRail(t);
    const s = makeSpirit(t);
    const ev = makeEvents();
    s.x = s.px = r.x0 + 60;
    s.y = s.py = railY(r, s.x) - 30;
    s.vx = 800;
    s.vy = 700;
    let on = false;
    let off = false;
    let lastX = s.x;
    let speed0 = 0;
    for (let i = 0; i < 600 && !off; i++) {
      step(s, t, false, ev, STEP, true);
      if (ev.railOn) {
        on = true;
        speed0 = s.speed;
      }
      if (ev.railOff) off = true;
      if (s.rail) {
        expect(s.x).toBeGreaterThan(lastX);
        expect(Math.abs(s.y - railY(r, s.x))).toBeLessThan(1e-6);
        expect(s.grounded).toBe(false);
      }
      lastX = s.x;
    }
    expect(on).toBe(true);
    expect(off).toBe(true);
    expect(s.rail).toBeNull();
    expect(s.speed).toBeGreaterThan(speed0);
    expect(s.railCd).toBeGreaterThan(0);
  });

  it("do not catch the board again straight away", () => {
    const t = new Terrain(SEED);
    const r = firstRail(t);
    const s = makeSpirit(t);
    const ev = makeEvents();
    s.x = s.px = r.x1 - 5;
    s.y = s.py = railY(r, s.x) + 20;
    s.vx = 900;
    s.vy = -300;
    s.rail = r;
    s.speed = 950;
    let ons = 0;
    for (let i = 0; i < 40; i++) {
      step(s, t, false, ev, STEP, true);
      if (ev.railOn) ons++;
    }
    expect(ons).toBe(0);
  });
});

describe("shrine gates and the Spirit Blessing", () => {
  function chain(t: Terrain) {
    for (let c = 4; c < 60; c++) {
      const rs = t.chunk(c).rings.filter((r) => r.shrine === c);
      if (rs.length === 3) return rs.sort((a, b) => a.order - b.order);
    }
    throw new Error("no chain");
  }

  function fly(t: Terrain, order: number[]) {
    const rs = chain(t);
    const s = makeSpirit(t);
    const ev = makeEvents();
    let blessed = false;
    for (const i of order) {
      const r = rs[i];
      s.x = s.px = r.x - 40;
      s.y = s.py = r.y;
      s.vx = 700;
      s.vy = 0;
      s.grounded = false;
      for (let k = 0; k < 20; k++) {
        step(s, t, false, ev, STEP, true);
        if (ev.blessing) blessed = true;
        if (s.x > r.x + r.r + 10) break;
      }
    }
    return { s, blessed };
  }

  it("bless you after all three, in order", () => {
    const { s, blessed } = fly(new Terrain(SEED), [0, 1, 2]);
    expect(blessed).toBe(true);
    expect(s.bless).toBeGreaterThan(BLESS_TIME - 1);
  });

  it("do nothing if one is missed or they come out of order", () => {
    expect(fly(new Terrain(SEED), [0, 2]).blessed).toBe(false);
    expect(fly(new Terrain(SEED), [1, 2]).blessed).toBe(false);
    expect(fly(new Terrain(SEED), [2, 1, 0]).blessed).toBe(false);
  });

  it("turn spikes into gems while blessed, and wipe you out otherwise", () => {
    const t = new Terrain(SEED);
    let sp = null as null | { x: number; phase: number; taken: boolean };
    for (let c = 10; c < 80 && !sp; c++) sp = t.chunk(c).spikes[0] ?? null;
    expect(sp).not.toBeNull();
    const run = (bless: number) => {
      const s = makeSpirit(t);
      const ev = makeEvents();
      s.bless = bless;
      let crashed = false;
      let gems = 0;
      for (let i = 0; i < 90; i++) {
        s.x = s.px = sp!.x - 2;
        s.y = s.py = t.height(sp!.x) + 6;
        s.vx = 300;
        s.vy = 0;
        s.grounded = true;
        s.speed = 300;
        s.frames = i;
        step(s, t, false, ev, STEP, true);
        if (ev.crash === "spike") crashed = true;
        gems += ev.gem;
      }
      return { crashed, gems };
    };
    const normal = run(0);
    expect(normal.crashed).toBe(true);
    sp!.taken = false;
    const blessed = run(BLESS_TIME);
    expect(blessed.crashed).toBe(false);
    expect(blessed.gems).toBe(1);
  });
});

describe("whirlpools", () => {
  it("pull you under and fire you out faster than you came in", () => {
    const t = new Terrain(SEED);
    const w = firstWhirl(t);
    const s = makeSpirit(t);
    const ev = makeEvents();
    s.x = s.px = w.x - 90;
    s.y = s.py = t.height(s.x);
    s.grounded = true;
    s.speed = 900;
    let inn = false;
    let out = false;
    let spunUnder = false;
    for (let i = 0; i < 200 && !out; i++) {
      step(s, t, false, ev, STEP, true);
      if (ev.whirlIn) inn = true;
      if (s.whirl && s.under) spunUnder = true;
      if (ev.whirlOut) out = true;
    }
    expect(inn).toBe(true);
    expect(spunUnder).toBe(true);
    expect(out).toBe(true);
    expect(s.under).toBe(false);
    expect(s.vx).toBeGreaterThan(900 * 1.3);
    expect(s.vx).toBeLessThanOrEqual(MAX_SPEED);
    expect(s.whirlCd).toBeGreaterThan(0);
  });

  it("are skipped by flying over them", () => {
    const t = new Terrain(SEED);
    const w = firstWhirl(t);
    const s = makeSpirit(t);
    const ev = makeEvents();
    s.x = s.px = w.x - 200;
    s.y = s.py = t.height(s.x) + 400;
    s.vx = 700;
    s.vy = 0;
    let hit = false;
    for (let i = 0; i < 60; i++) {
      step(s, t, false, ev, STEP, true);
      if (ev.whirlIn) hit = true;
    }
    expect(hit).toBe(false);
  });
});

describe("thunderheads", () => {
  it("throw you upward while you are inside", () => {
    const t = new Terrain(SEED);
    const c = firstCloud(t);
    const s = makeSpirit(t);
    const ev = makeEvents();
    s.x = s.px = c.x;
    s.y = s.py = c.y;
    s.vx = 600;
    s.vy = 0;
    s.grounded = false;
    let stormed = false;
    for (let i = 0; i < 10; i++) {
      step(s, t, false, ev, STEP, true);
      if (ev.storm) stormed = true;
    }
    expect(stormed).toBe(true);
    expect(s.vy).toBeGreaterThan(200);
  });

  it("stand only in the Obsidian Storm", () => {
    const t = new Terrain(SEED);
    for (let c = 0; c < 10; c++) expect(t.chunk(c).clouds).toHaveLength(0);
  });
});

describe("the Leviathan", () => {
  it("raises a back at 5 km, 10 km and so on, and nowhere else", () => {
    const t = new Terrain(SEED);
    const base = new Terrain(SEED);
    expect(t.height(LEV_EVERY) - (t.height(LEV_EVERY + 3 * 620) - 0)).toBeGreaterThan(LEV_H * 0.8);
    expect(t.height(LEV_EVERY * 2)).toBeGreaterThan(t.height(LEV_EVERY * 2 + 3000) - 400);
    // Far from any back the ground is the plain wave.
    for (const x of [1000, 12345, 31000, 47000, 75000]) expect(Math.abs(t.height(x) - base.height(x))).toBe(0);
  });

  it("has an exact slope, so riding up its back is smooth", () => {
    const t = new Terrain(SEED);
    for (let x = LEV_EVERY - 1500; x <= LEV_EVERY + 1500; x += 97) {
      const numeric = (t.height(x + 0.5) - t.height(x - 0.5)) / 1;
      expect(Math.abs(t.slope(x) - numeric)).toBeLessThan(1e-3);
    }
  });

  it("holds a rune ring beyond the crest", () => {
    const t = new Terrain(SEED);
    let rune = null as null | { x: number; y: number; r: number };
    for (let c = 24; c <= 26 && !rune; c++) rune = t.chunk(c).rings.find((r) => r.rune) ?? null;
    expect(rune).not.toBeNull();
    expect(rune!.x).toBeGreaterThan(LEV_EVERY + 800);
    expect(rune!.y).toBeGreaterThan(t.height(rune!.x) + 500);
    // Only one per back.
    let count = 0;
    for (let c = 20; c <= 30; c++) count += t.chunk(c).rings.filter((r) => r.rune).length;
    expect(count).toBe(1);
  });

  it("a fast ride up the back launches you into the air", () => {
    const t = new Terrain(SEED);
    const s = makeSpirit(t);
    const ev = makeEvents();
    s.x = s.px = LEV_EVERY - 1800;
    s.y = s.py = t.height(s.x);
    s.grounded = true;
    s.speed = 1500;
    let airborne = false;
    for (let i = 0; i < 400; i++) {
      step(s, t, false, ev, STEP, false);
      if (s.x > LEV_EVERY && !s.grounded) airborne = true;
    }
    expect(airborne).toBe(true);
  });
});

describe("eclipse and storm front", () => {
  it("ease gravity inside the eclipse only", () => {
    expect(gravityScale(10000)).toBe(1);
    expect(gravityScale((ECLIPSE_FROM + ECLIPSE_TO) / 2)).toBeCloseTo(0.6, 5);
    expect(gravityScale(ECLIPSE_TO + 5000)).toBe(1);
    expect(eclipseK(ECLIPSE_FROM - 600)).toBeGreaterThan(0);
    expect(eclipseK(ECLIPSE_FROM - 600)).toBeLessThan(1);
  });

  it("lets jumps fly higher there", () => {
    const t = new Terrain(SEED);
    const peak = (x0: number) => {
      const s = makeSpirit(t);
      const ev = makeEvents();
      s.x = s.px = x0;
      s.y = s.py = t.height(x0) + 300;
      s.vx = 700;
      s.vy = 900;
      s.grounded = false;
      // Gravity is the subject here, so no sky-rail may catch the jump.
      s.railCd = 99;
      let top = s.y - t.height(s.x);
      for (let i = 0; i < 120; i++) {
        step(s, t, false, ev, STEP, false);
        top = Math.max(top, s.y - t.height(s.x));
      }
      return top;
    };
    expect(peak(84000)).toBeGreaterThan(peak(12000) * 1.15);
  });

  it("gather the storm front over 2 km", () => {
    expect(stormK(17000)).toBe(0);
    expect(stormK(19000)).toBeGreaterThan(0.3);
    expect(stormK(19000)).toBeLessThan(0.7);
    expect(stormK(21000)).toBe(1);
  });
});

describe("determinism with all of it switched on", () => {
  it("replays identically across set-pieces", () => {
    const run = (seed: number) => {
      const t = new Terrain(seed);
      const s = makeSpirit(t);
      const ev = makeEvents();
      for (let i = 0; i < 9000; i++) {
        const hold = i % 140 < 60 || i % 377 > 330;
        step(s, t, hold, ev, STEP, true);
        if (ev.crash) {
          s.x = s.px = s.x + 200;
          s.y = s.py = t.height(s.x) + 100;
        }
      }
      return [s.x, s.y, s.speed, s.flow, s.gems, s.ringsTaken, s.bless];
    };
    for (const seed of [1, 99, 31337]) {
      const a = run(seed);
      expect(run(seed)).toEqual(a);
      for (const v of a) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("review fixes", () => {
  it("rails near the Leviathan stay well clear of its back", () => {
    const t = new Terrain(SEED);
    let rails = 0;
    for (let c = 22; c <= 28; c++) {
      for (const r of t.chunk(c).rails) {
        rails++;
        for (let x = r.x0; x <= r.x1; x += 40) expect(railY(r, x) - t.height(x)).toBeGreaterThan(380);
      }
    }
    expect(rails).toBeGreaterThan(0);
  });

  it("a thunderhead never slows a spirit that is already rising fast", () => {
    const t = new Terrain(SEED);
    const c = firstCloud(t);
    const s = makeSpirit(t);
    const ev = makeEvents();
    s.x = s.px = c.x;
    s.y = s.py = c.y;
    s.vx = 600;
    s.vy = 2400;
    s.grounded = false;
    step(s, t, false, ev, STEP, true);
    expect(s.vy).toBeGreaterThan(2300);
  });

  it("the board's ring reach is part of the run", () => {
    const t = new Terrain(SEED);
    expect(makeSpirit(t, 2.1, 7.2, 1.12).reach).toBe(1.12);
    expect(makeSpirit(t).reach).toBe(1);
  });
});
