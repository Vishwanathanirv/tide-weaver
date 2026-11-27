import { describe, expect, it } from "vitest";
import { Juice } from "../src/juice";
import { makeEvents, makeSpirit, step } from "../src/physics";
import { Terrain } from "../src/terrain";

describe("hit-stop", () => {
  it("swallows exactly 30 ms of real time, then lets time through", () => {
    const j = new Juice();
    j.freeze(30);
    expect(j.consume(0.016)).toBe(0);
    expect(j.consume(0.016)).toBeCloseTo(0.002, 6);
    expect(j.frozen).toBe(false);
    expect(j.consume(0.016)).toBe(0.016);
  });
});

describe("callouts", () => {
  it("a dead-centre ring is 'clean' and freezes the frame", () => {
    const j = new Juice();
    const ev = makeEvents();
    ev.ring = 1;
    ev.ringCenter = 0.9;
    expect(j.react(ev, 10)?.text).toBe("clean");
    expect(j.centreHit).toBe(true);
    expect(j.frozen).toBe(true);
  });

  it("an edge ring is not clean", () => {
    const j = new Juice();
    const ev = makeEvents();
    ev.ring = 1;
    ev.ringCenter = 0.2;
    expect(j.react(ev, 10)).toBeNull();
    expect(j.frozen).toBe(false);
  });

  it("just missing the perfect window is 'inches', a belly flop is 'skill issue'", () => {
    const j = new Juice();
    const ev = makeEvents();
    ev.landing = "good";
    ev.landMiss = 0.33;
    expect(j.react(ev, 10)?.text).toBe("inches");
    ev.landing = "rough";
    ev.landMiss = 1;
    expect(j.react(ev, 11)?.text).toBe("skill issue");
  });

  it("cooldowns stop the same callout repeating", () => {
    const j = new Juice();
    const ev = makeEvents();
    ev.landing = "rough";
    expect(j.react(ev, 10)).not.toBeNull();
    expect(j.react(ev, 12)).toBeNull();
    expect(j.react(ev, 19)).not.toBeNull();
  });
});

describe("telemetry", () => {
  it("never changes the physics: same seed and inputs, same run", () => {
    const run = () => {
      const t = new Terrain(77);
      const s = makeSpirit(t);
      const ev = makeEvents();
      let near = 0;
      for (let i = 0; i < 60 * 60; i++) {
        step(s, t, i % 90 < 50, ev);
        if (ev.nearMiss) near++;
        if (ev.ring) expect(ev.ringCenter).toBeGreaterThanOrEqual(0);
      }
      return [s.x, s.y, s.flow, near];
    };
    expect(run()).toEqual(run());
  });
});
