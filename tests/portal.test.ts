import { afterEach, describe, expect, it, vi } from "vitest";
import { HOWTO_ROWS, howToHtml } from "../src/howto";
import { payload, statsConfigured, track } from "../src/telemetry";
import { gameplay, portal, rewarded, rewardedAvailable } from "../src/ads";
import { sanitize } from "../src/save";

afterEach(() => vi.unstubAllGlobals());

describe("how to play", () => {
  it("is short, has a way back, and never uses italics", () => {
    const html = howToHtml();
    expect(HOWTO_ROWS.length).toBeLessThanOrEqual(6);
    for (const [a, b] of HOWTO_ROWS) expect(html).toContain(`<b>${a}</b><span>${b}</span>`);
    expect(html).toContain('data-act="back"');
    expect(html.toLowerCase()).not.toContain("italic");
  });
});

describe("play stats", () => {
  it("do nothing, and never throw, without a key", () => {
    expect(statsConfigured()).toBe(false);
    expect(() => track("run_start", { mode: "journey" })).not.toThrow();
  });
  it("carry no personal fields", () => {
    const body = JSON.parse(payload("run_end", { km: 1.2 }, "abc123"));
    expect(Object.keys(body).sort()).toEqual(["api_key", "distinct_id", "event", "properties"]);
    expect(body.properties.$process_person_profile).toBe(false);
    expect(body.distinct_id).toBe("abc123");
  });
  it("the save switch defaults on and survives bad data", () => {
    expect(sanitize({}).playStats).toBe(true);
    expect(sanitize({ playStats: false }).playStats).toBe(false);
    expect(sanitize({ playStats: "x" }).playStats).toBe(true);
  });
});

describe("portal adapter", () => {
  it("is inert outside a portal", async () => {
    expect(portal()).toBe("none");
    expect(rewardedAvailable()).toBe(false);
    expect(await rewarded()).toBe(false);
    expect(() => gameplay(true)).not.toThrow();
  });
  it("uses the Poki rewarded break when the SDK is present", async () => {
    const start = vi.fn();
    vi.stubGlobal("window", { PokiSDK: { rewardedBreak: () => Promise.resolve(true), gameplayStart: start } });
    expect(portal()).toBe("poki");
    expect(await rewarded()).toBe(true);
    gameplay(true);
    expect(start).toHaveBeenCalled();
  });
  it("uses CrazyGames and treats an ad error as not watched", async () => {
    vi.stubGlobal("window", { CrazyGames: { SDK: { ad: { requestAd: (_t: string, cb: { adError: (e: unknown) => void }) => cb.adError("none") } } } });
    expect(portal()).toBe("crazygames");
    expect(await rewarded()).toBe(false);
  });
});
