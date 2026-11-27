import { describe, expect, it } from "vitest";
import { lagoonFog, stormK } from "../src/events";
import { BOARDS, boardOf } from "../src/gear";
import { QUEST_IDS, deal, emptyCounters, questText, targetFor } from "../src/quests";
import { Recorder, Replay, decode, encode } from "../src/ghost";
import { makeEvents, makeSpirit, step, surge, STEP } from "../src/physics";
import { Terrain } from "../src/terrain";
import { sanitize } from "../src/save";

describe("lagoon fog", () => {
  it("is thickest in the middle of a lagoon and absent elsewhere", () => {
    expect(lagoonFog(5000)).toBe(0);
    expect(lagoonFog(7999)).toBe(0);
    expect(lagoonFog(8000)).toBe(0);
    expect(lagoonFog(8500)).toBeCloseTo(1, 5);
    expect(lagoonFog(9000)).toBe(1);
    expect(lagoonFog(10000)).toBe(0);
    expect(lagoonFog(18700)).toBeGreaterThan(0.5);
  });

  it("eases in and out and stays within 0..1", () => {
    for (let x = 0; x < 40000; x += 37) {
      const f = lagoonFog(x);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(lagoonFog(8200)).toBeGreaterThan(0);
    expect(lagoonFog(8200)).toBeLessThan(1);
  });
});

describe("storm front", () => {
  it("is zero before 1.8 km and full from 2 km", () => {
    expect(stormK(1000)).toBe(0);
    expect(stormK(20000)).toBe(1);
    expect(stormK(30000)).toBe(1);
  });
});

describe("the new goals", () => {
  it("exist, read as sentences and can be dealt", () => {
    for (const id of ["rail", "whirl", "bless", "storm"] as const) {
      expect(QUEST_IDS).toContain(id);
      for (let r = 0; r < 5; r++) expect(questText({ id, target: targetFor(id, r), done: false }).length).toBeGreaterThan(8);
    }
    expect(emptyCounters().rail).toBe(0);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) for (const q of deal(0)) seen.add(q.id);
    expect(seen.has("rail")).toBe(true);
    expect(seen.has("storm")).toBe(true);
  });

  it("survive a pasted save", () => {
    const s = sanitize({ rank: 1, quests: [{ id: "rail", target: 1 }, { id: "whirl", target: 1 }, { id: "bless", target: 99 }] });
    expect(s.quests.map((q) => q.id)).toEqual(["rail", "whirl", "bless"]);
    expect(s.quests[0].target).toBe(targetFor("rail", 1));
  });
});

describe("boards with their own trails", () => {
  it("add a volcanic and a glacial board, both with a fair price and handling", () => {
    const cinder = boardOf("cinder");
    const rime = boardOf("rime");
    expect(cinder.fx).toBe("ember");
    expect(rime.fx).toBe("frost");
    for (const b of [cinder, rime]) {
      expect(b.price).toBeGreaterThan(40);
      expect(b.dive).toBeGreaterThan(1.7);
      expect(b.dive).toBeLessThan(2.6);
    }
    expect(new Set(BOARDS.map((b) => b.id)).size).toBe(BOARDS.length);
  });

  it("travel through a ghost link and replay exactly", () => {
    for (const id of ["cinder", "rime"]) {
      const b = boardOf(id);
      const seed = 818;
      const t = new Terrain(seed);
      const s = makeSpirit(t, b.dive, b.flip, b.reach);
      const ev = makeEvents();
      const rec = new Recorder();
      for (let i = 0; i < 3000; i++) {
        const hold = i % 130 < 50;
        rec.hold(s.frames, hold);
        if (i === 700) {
          rec.surge(s.frames);
          surge(s);
        }
        step(s, t, hold, ev, STEP, true);
        if (ev.crash) break;
      }
      const g = decode(encode({ seed, hazards: true, board: id, score: 100, end: s.frames, frames: rec.frames, kinds: rec.kinds }))!;
      expect(g.board).toBe(id);
      const r = new Replay(g, seed);
      r.advance(100000);
      expect(r.spirit.x).toBe(s.x);
      expect(r.spirit.y).toBe(s.y);
    }
  });
});
