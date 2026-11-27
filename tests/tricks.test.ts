import { describe, expect, it } from "vitest";
import { makeEvents, makeSpirit, step, wrap, PLUNGE_SPEED } from "../src/physics";
import { Terrain, biomeAt, spikeUp, gateShut, KM_UNITS } from "../src/terrain";

describe("flips and wipe-outs", () => {
  it("landing upside down wipes out only when hazards are on", () => {
    for (const hazards of [true, false]) {
      const t = new Terrain(11);
      const s = makeSpirit(t);
      const ev = makeEvents();
      s.angle = Math.PI; // upside down, falling
      s.vy = -400;
      let crash = "";
      for (let i = 0; i < 120 && !ev.landing; i++) {
        s.angle = Math.PI;
        step(s, t, false, ev, 1 / 60, hazards);
        if (ev.crash) crash = ev.crash;
      }
      expect(ev.landing).toBe("rough");
      expect(crash).toBe(hazards ? "flip" : "");
    }
  });

  it("holding in the air spins the board backwards", () => {
    const t = new Terrain(11);
    const s = makeSpirit(t);
    const ev = makeEvents();
    s.vy = 600;
    const a0 = s.angle;
    for (let i = 0; i < 45; i++) step(s, t, true, ev);
    expect(s.angle - a0).toBeGreaterThan(3);
  });

  it("a short hold in the air is a dive, not a flip", () => {
    const t = new Terrain(11);
    const s = makeSpirit(t);
    const ev = makeEvents();
    s.vy = 600;
    for (let i = 0; i < 9; i++) step(s, t, true, ev);
    expect(s.airRot).toBe(0);
    expect(Math.abs(wrap(Math.PI * 3))).toBeCloseTo(Math.PI, 6);
  });
});

describe("the abyss", () => {
  it("a fast dive down a steep slope plunges under, and letting go breaches skyward", () => {
    const t = new Terrain(5);
    const s = makeSpirit(t);
    const ev = makeEvents();
    // Put the rider on the steepest nearby downslope at plunge speed.
    let x = 0;
    for (let i = 0; i < 4000; i++) if (t.slope(i) < t.slope(x)) x = i;
    s.x = x;
    s.y = t.height(x);
    s.grounded = true;
    s.speed = PLUNGE_SPEED + 300;
    let plunged = false;
    let breached = false;
    for (let i = 0; i < 600 && !breached; i++) {
      step(s, t, i < 40, ev);
      if (ev.plunge) plunged = true;
      if (ev.breach) breached = true;
    }
    if (t.slope(x) < -0.62) {
      expect(plunged).toBe(true);
      expect(breached).toBe(true);
      expect(s.vy).toBeGreaterThan(0);
    }
  });
});

describe("biomes and traps", () => {
  it("biomes change every kilometre", () => {
    expect(biomeAt(0)).toBe(0);
    expect(biomeAt(KM_UNITS + 1)).toBe(1);
    expect(biomeAt(KM_UNITS * 5)).toBe(2);
  });

  it("only the Obsidian Storm has spikes and gates, only the Mirage has collapses", () => {
    const t = new Terrain(9);
    for (let c = 1; c < 30; c++) {
      const ch = t.chunk(c);
      const b = biomeAt(c * 2000);
      if (b !== 2) expect(ch.spikes.length + ch.gates.length).toBe(0);
      if (b !== 1) expect(ch.collapses.length).toBe(0);
    }
  });

  it("spikes and gates alternate on the beat", () => {
    const sp = { x: 0, phase: 0, taken: false };
    expect(spikeUp(sp, 0)).toBe(true);
    expect(spikeUp(sp, 25)).toBe(false);
    expect(gateShut(sp, 0)).toBe(false);
    expect(gateShut(sp, 25)).toBe(true);
  });

  it("a run with hazards is still deterministic", () => {
    const go = () => {
      const t = new Terrain(42);
      const s = makeSpirit(t);
      const ev = makeEvents();
      let crashes = 0;
      for (let i = 0; i < 60 * 120; i++) {
        step(s, t, i % 70 < 30, ev, 1 / 60, true);
        if (ev.crash) crashes++;
      }
      return [s.x, s.y, s.gems, s.ringsTaken, crashes];
    };
    expect(go()).toEqual(go());
  });
});
