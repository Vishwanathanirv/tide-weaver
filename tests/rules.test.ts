import { describe, expect, it } from "vitest";
import { makeEvents, makeSpirit, STEP } from "../src/physics";
import { makeRun, makeRunEvents, updateRun, TIER_AT } from "../src/rules";
import { Terrain } from "../src/terrain";
import { sanitize } from "../src/save";

const setup = (mode: "journey" | "zen" | "daily", gentle = false) => {
  const t = new Terrain(1);
  const s = makeSpirit(t);
  s.grounded = true;
  s.speed = 900;
  return { s, run: makeRun(mode, gentle), ev: makeEvents(), out: makeRunEvents() };
};

describe("run rules", () => {
  it("the light fades without perfect dives and the run ends with a reason", () => {
    const { s, run, ev, out } = setup("journey");
    let ended = false;
    for (let i = 0; i < 60 * 60 && !ended; i++) {
      updateRun(run, s, ev, 10, STEP, out);
      ended = out.ended;
    }
    expect(ended).toBe(true);
    expect(run.time).toBeGreaterThan(30);
    expect(run.time).toBeLessThan(44);
    expect(run.cause.length).toBeGreaterThan(10);
  });

  it("perfect dives and rings refill the light", () => {
    const { s, run, ev, out } = setup("journey");
    run.light = 0.5;
    ev.landing = "perfect";
    s.combo = 3;
    updateRun(run, s, ev, 10, STEP, out);
    expect(run.light).toBeGreaterThan(0.6);
    ev.landing = null;
    ev.ring = 1;
    const before = run.light;
    updateRun(run, s, ev, 10, STEP, out);
    expect(run.light).toBeGreaterThan(before + 0.1);
  });

  it("zen never ends", () => {
    const { s, run, ev, out } = setup("zen");
    for (let i = 0; i < 60 * 300; i++) updateRun(run, s, ev, 10, STEP, out);
    expect(run.ended).toBe(false);
    expect(run.light).toBe(1);
  });

  it("first runs drain gently", () => {
    const a = setup("journey", true);
    for (let i = 0; i < 60 * 40; i++) updateRun(a.run, a.s, a.ev, 10, STEP, a.out);
    expect(a.run.ended).toBe(false);
  });

  it("smooth riding climbs the tiers and a rough landing resets them", () => {
    const { s, run, ev, out } = setup("zen");
    let ups = 0;
    for (let i = 0; i < 60 * (TIER_AT[3] + 1); i++) {
      updateRun(run, s, ev, 10, STEP, out);
      if (out.tierUp) ups++;
    }
    expect(run.tier).toBe(3);
    expect(ups).toBe(3);
    const multHigh = run.mult;
    ev.landing = "rough";
    updateRun(run, s, ev, 10, STEP, out);
    expect(out.tierLost).toBe(true);
    expect(run.tier).toBe(0);
    expect(run.mult).toBeLessThan(multHigh);
  });

  it("reports each kilometre once", () => {
    const { s, run, ev, out } = setup("zen");
    const kms: number[] = [];
    for (let i = 0; i < 2600; i++) {
      s.distance += 10;
      updateRun(run, s, ev, 10, STEP, out);
      if (out.km) kms.push(out.km);
    }
    expect(kms).toEqual([1, 2]);
  });
});

describe("save migration", () => {
  it("old saves gain the new fields with defaults", () => {
    const s = sanitize({ version: 1, bestEndless: 900, hintSeen: true });
    expect(s.bestEndless).toBe(900);
    expect(s.tutorialDone).toBe(true);
    expect(s.achievements).toEqual([]);
    expect(s.musicVolume).toBeCloseTo(0.8);
    expect(s.bestDistance).toBe(0);
  });
});
