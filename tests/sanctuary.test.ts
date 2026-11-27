import { describe, expect, it } from "vitest";
import { MOTIF, degreeToMidi } from "../src/audio";
import { AURAS, defaults, exportCode, importCode, sanitize } from "../src/save";

describe("comfort settings", () => {
  it("default to full shake and flashes on", () => {
    const d = defaults();
    expect(d.shake).toBe(1);
    expect(d.flashes).toBe(true);
  });

  it("clamp shake and keep flashes off once chosen", () => {
    expect(sanitize({ shake: 7 }).shake).toBe(1);
    expect(sanitize({ shake: -1 }).shake).toBe(1);
    expect(sanitize({ shake: 0 }).shake).toBe(0);
    expect(sanitize({ shake: 0.35 }).shake).toBe(0.35);
    expect(sanitize({ flashes: false }).flashes).toBe(false);
    expect(sanitize({ flashes: "no" }).flashes).toBe(true);
  });

  it("travel in save codes", () => {
    const d = { ...defaults(), shake: 0.2, flashes: false };
    const back = importCode(exportCode(d))!;
    expect(back.shake).toBe(0.2);
    expect(back.flashes).toBe(false);
  });

  it("old saves without the fields load with defaults", () => {
    const old = { ...defaults() } as Record<string, unknown>;
    delete old.shake;
    delete old.flashes;
    const s = sanitize(old);
    expect(s.shake).toBe(1);
    expect(s.flashes).toBe(true);
  });
});

describe("secret aura", () => {
  it("is a valid aura that a save can wear", () => {
    expect(AURAS).toContain("starlight");
    const s = sanitize({ unlocked: ["ember", "starlight"], aura: "starlight" });
    expect(s.aura).toBe("starlight");
  });

  it("cannot be worn without being unlocked", () => {
    expect(sanitize({ unlocked: ["ember"], aura: "starlight" }).aura).toBe("ember");
  });
});

describe("motif", () => {
  it("is five notes, in order, inside the playable range", () => {
    expect(MOTIF).toHaveLength(5);
    for (let i = 1; i < MOTIF.length; i++) expect(MOTIF[i][1]).toBeGreaterThan(MOTIF[i - 1][1]);
    for (const [d] of MOTIF) {
      expect(d).toBeGreaterThanOrEqual(5);
      expect(d - 5).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(14);
    }
  });

  it("rises to D5 and settles on A4", () => {
    const midi = MOTIF.map(([d]) => degreeToMidi(d));
    expect(midi).toEqual([66, 69, 74, 71, 69]);
  });
});
