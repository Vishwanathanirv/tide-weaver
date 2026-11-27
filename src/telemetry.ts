/**
 * Anonymous play stats, off unless a PostHog project key is set at build time (VITE_POSTHOG_KEY).
 * No cookies, no person profiles, no names: one random device id kept in localStorage so a funnel
 * (first run, second run, where runs end) can be counted. The player can switch it off in Settings.
 * Events are fire-and-forget; a failed send never touches the game.
 */
const KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ?? "";
const HOST = ((import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com").replace(/\/$/, "");
const ID_KEY = "tide-weaver.device";

let enabled = true;
let id = "";

export const statsConfigured = (): boolean => KEY.length > 0;
export const setStats = (on: boolean): void => {
  enabled = on;
};

function deviceId(): string {
  if (id) return id;
  try {
    let v = localStorage.getItem(ID_KEY);
    if (!v) {
      v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(ID_KEY, v);
    }
    id = v;
  } catch {
    id = "anon";
  }
  return id;
}

export type Props = Record<string, string | number | boolean>;

/** Builds the request body; exported so it can be tested without the network. */
export function payload(event: string, props: Props, device: string): string {
  return JSON.stringify({ api_key: KEY, event, distinct_id: device, properties: { ...props, $process_person_profile: false, $lib: "tide-weaver" } });
}

export function track(event: string, props: Props = {}): void {
  if (!KEY || !enabled) return;
  try {
    const body = payload(event, props, deviceId());
    const url = `${HOST}/capture/`;
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) return;
    void fetch(url, { method: "POST", body, keepalive: true, mode: "no-cors" }).catch(() => {});
  } catch {
    /* never let stats touch the game */
  }
}
