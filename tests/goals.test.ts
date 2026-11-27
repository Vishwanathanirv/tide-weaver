import { describe, expect, it } from "vitest";
import { QUEST_IDS, allDone, check, deal, emptyCounters, questText, targetFor } from "../src/quests";
import { BOARDS, SCARVES, boardOf, scarfOf } from "../src/gear";
import { defaults, exportCode, importCode, sanitize } from "../src/save";

describe("goals", () => {
  it("deal three different goals", () => {
    for (let i = 0; i < 40; i++) {
      const q = deal(i % 4);
      expect(q).toHaveLength(3);
      expect(new Set(q.map((x) => x.id)).size).toBe(3);
      for (const x of q) expect(x.done).toBe(false);
    }
  });

  it("get harder with rank, up to a cap", () => {
    for (const id of QUEST_IDS) {
      expect(targetFor(id, 3)).toBeGreaterThanOrEqual(targetFor(id, 0));
      expect(targetFor(id, 50)).toBe(targetFor(id, 3));
      expect(targetFor(id, -2)).toBe(targetFor(id, 0));
    }
  });

  it("all read as sentences", () => {
    for (const id of QUEST_IDS) expect(questText({ id, target: targetFor(id, 0), done: false }).length).toBeGreaterThan(8);
  });

  it("complete once, and only when the counter reaches the target", () => {
    const q = deal(0, 3, () => 0);
    const c = emptyCounters();
    expect(check(q, c)).toHaveLength(0);
    c[q[0].id] = q[0].target - 1;
    expect(check(q, c)).toHaveLength(0);
    c[q[0].id] = q[0].target;
    expect(check(q, c).map((x) => x.id)).toEqual([q[0].id]);
    expect(check(q, c)).toHaveLength(0);
    expect(allDone(q)).toBe(false);
    for (const x of q) c[x.id] = x.target;
    check(q, c);
    expect(allDone(q)).toBe(true);
  });

  it("an empty list is never done", () => {
    expect(allDone([])).toBe(false);
  });
});

describe("gear", () => {
  it("has a free default of each kind and falls back to it", () => {
    expect(BOARDS[0].price).toBe(0);
    expect(SCARVES[0].price).toBe(0);
    expect(boardOf("nope").id).toBe("wake");
    expect(scarfOf("nope").id).toBe("plain");
  });

  it("boards differ in handling but stay close enough to balance", () => {
    for (const b of BOARDS) {
      expect(b.dive).toBeGreaterThan(1.7);
      expect(b.dive).toBeLessThan(2.6);
      expect(b.flip).toBeGreaterThan(5.5);
      expect(b.flip).toBeLessThan(9);
    }
  });
});

describe("progress in saves", () => {
  it("round-trips bank, gear, rank and goals", () => {
    const d = defaults();
    d.bank = 44;
    d.owned = ["wake", "plain", "anchor", "ribbon"];
    d.board = "anchor";
    d.scarf = "ribbon";
    d.rank = 2;
    d.quests = deal(2);
    d.quests[0].done = true;
    d.clips = false;
    const back = importCode(exportCode(d))!;
    expect(back.bank).toBe(44);
    expect(back.board).toBe("anchor");
    expect(back.scarf).toBe("ribbon");
    expect(back.rank).toBe(2);
    expect(back.quests).toEqual(d.quests);
    expect(back.clips).toBe(false);
  });

  it("will not wear gear that is not owned or does not exist", () => {
    expect(sanitize({ board: "tempest", owned: ["wake"] }).board).toBe("wake");
    expect(sanitize({ board: "dragon", owned: ["dragon", "anchor"] }).owned).toEqual(["wake", "plain", "nomad", "anchor"]);
    expect(sanitize({ scarf: "comet" }).scarf).toBe("plain");
  });

  it("repair broken goals and nonsense numbers", () => {
    const s = sanitize({ quests: [{ id: "nope", target: 5 }, { id: "ring", target: -1 }], bank: -5, rank: 1e9 });
    // Targets always come from the rank, so a pasted save cannot make goals trivial.
    const cheat = sanitize({ rank: 0, quests: [{ id: "ring", target: 1 }, { id: "gem", target: 1 }, { id: "surge", target: 1 }] });
    expect(cheat.quests.map((q) => q.target)).toEqual([targetFor("ring", 0), targetFor("gem", 0), targetFor("surge", 0)]);
    expect(s.quests).toHaveLength(3);
    expect(s.bank).toBe(0);
    expect(s.rank).toBe(99);
    const dup = sanitize({ quests: [{ id: "ring", target: 5 }, { id: "ring", target: 6 }, { id: "gem", target: 6 }] });
    expect(new Set(dup.quests.map((q) => q.id)).size).toBe(3);
  });

  it("old saves get fresh goals and an empty bank", () => {
    const old = { ...defaults() } as Record<string, unknown>;
    for (const k of ["bank", "owned", "board", "scarf", "rank", "quests", "clips"]) delete old[k];
    const s = sanitize(old);
    expect(s.bank).toBe(0);
    expect(s.board).toBe("wake");
    expect(s.quests).toHaveLength(3);
  });
});
