import { describe, expect, it } from "vitest";
import { KINDS, LANDMARK_SPACING, landmarkKind, landmarkX } from "../src/world";

describe("landmarks", () => {
  it("put the colossal gate on every fifth kilometre, exactly", () => {
    for (const k of [5, 10, 15, 40]) {
      expect(landmarkKind(k)).toBe("colossus");
      expect(landmarkX(k)).toBe(k * LANDMARK_SPACING);
    }
    expect(landmarkX(5)).toBe(50000);
  });

  it("never make the gate common, and never leave the start empty of variety", () => {
    const kinds = new Set<string>();
    for (let k = 0; k < 60; k++) {
      const kind = landmarkKind(k);
      if (kind === "colossus") expect(k % 5).toBe(0);
      else expect(KINDS).toContain(kind);
      kinds.add(kind);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });

  it("are the same every time, and stay near their own kilometre", () => {
    for (let k = 1; k < 30; k++) {
      expect(landmarkKind(k)).toBe(landmarkKind(k));
      expect(Math.abs(landmarkX(k) - k * LANDMARK_SPACING)).toBeLessThanOrEqual(LANDMARK_SPACING * 0.2);
    }
  });
});
