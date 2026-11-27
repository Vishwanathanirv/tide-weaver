import { describe, expect, it } from "vitest";
import { Recorder, Replay, decode, encode, MAX_EVENTS, type Ghost } from "../src/ghost";
import { boardOf } from "../src/gear";
import { makeEvents, makeSpirit, step, surge, STEP } from "../src/physics";
import { Terrain } from "../src/terrain";

/** Plays a scripted run the way the game does, recording as it goes. */
function play(seed: number, board: string, frames: number, hazards: boolean) {
  const t = new Terrain(seed);
  const b = boardOf(board);
  const s = makeSpirit(t, b.dive, b.flip, b.reach);
  const ev = makeEvents();
  const rec = new Recorder();
  for (let i = 0; i < frames; i++) {
    const hold = i % 150 < 55 || i % 400 > 330;
    rec.hold(s.frames, hold);
    if (i % 333 === 120) {
      rec.surge(s.frames);
      surge(s);
    }
    step(s, t, hold, ev, STEP, hazards);
    if (ev.crash) break;
  }
  return { s, rec };
}

const ghostOf = (rec: Recorder, end: number, hazards: boolean, board: string, seed = 0): Ghost => ({ seed, hazards, board, magnet: 0, core: 0, score: 12345, end, frames: rec.frames.slice(), kinds: rec.kinds.slice() });

describe("ghost replay", () => {
  it("lands exactly where the recorded run did", () => {
    for (const board of ["wake", "anchor", "feather"]) {
      const { s, rec } = play(77, board, 2400, false);
      const g = ghostOf(rec, s.frames, false, board);
      const r = new Replay(g, 77);
      r.advance(10_000);
      expect(r.done).toBe(true);
      expect(r.spirit.frames).toBe(s.frames);
      expect(r.spirit.x).toBe(s.x);
      expect(r.spirit.y).toBe(s.y);
      expect(r.spirit.distance).toBe(s.distance);
    }
  });

  it("survives a trip through a link", () => {
    const { s, rec } = play(5, "tempest", 1800, true);
    const g = ghostOf(rec, s.frames, true, "tempest", 4000000000);
    const back = decode(encode(g))!;
    expect(back).toEqual(g);
    const r = new Replay(back, 5);
    r.advance(10_000);
    expect(r.spirit.x).toBe(s.x);
  });

  it("follows the player's step count and can be paused partway", () => {
    const { s, rec } = play(9, "wake", 1200, false);
    const r = new Replay(ghostOf(rec, s.frames, false, "wake"), 9);
    r.advance(300);
    expect(r.spirit.frames).toBe(300);
    expect(r.done).toBe(false);
    r.advance(300);
    expect(r.spirit.frames).toBe(300);
  });

  it("stays small enough for a link", () => {
    const { s, rec } = play(3, "wake", 7200, false);
    const code = encode(ghostOf(rec, s.frames, false, "wake"));
    expect(code.length).toBeLessThan(1600);
  });
});

describe("ghost codes", () => {
  it("reject junk without throwing", () => {
    for (const bad of ["", "x", "!!!!", "AAAA", "AQ", "////", "AQAAAAAAAAAAAAAAAAAAAAAA", "A".repeat(20000), "Ag"]) {
      expect(decode(bad)).toBeNull();
    }
  });

  it("reject a code with trailing bytes or an unknown version", () => {
    const g: Ghost = { seed: 123456, hazards: true, board: "wake", magnet: 2, core: 3, score: 10, end: 100, frames: [1, 5], kinds: [0, 1] };
    const ok = encode(g);
    expect(decode(ok)).toEqual(g);
    expect(decode(ok + "AA")).toBeNull();
    expect(decode("Aw" + ok.slice(2))).toBeNull();
    expect(decode("BQ" + ok.slice(2))).toBeNull();
    expect(decode("AQ" + ok.slice(2))).toBeNull();
  });

  it("recorder stops at its limit and says so", () => {
    const r = new Recorder();
    for (let i = 0; i < MAX_EVENTS + 20; i++) r.hold(i, i % 2 === 0);
    expect(r.length).toBe(MAX_EVENTS);
    expect(r.full).toBe(true);
  });
});
