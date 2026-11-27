import { currentSpeed, type Spirit, type StepEvents } from "./physics";

/**
 * Run rules on top of the physics: the spirit's light, flow tiers, the score multiplier and
 * milestones. Journey and daily runs end when the light fades; zen never ends.
 */
export type Mode = "journey" | "zen" | "daily";

export const TIERS = ["Calm", "Flowing", "Radiant", "Transcendent"] as const;
/** Seconds without a rough landing needed for each tier. */
export const TIER_AT = [0, 12, 30, 55];
export const KM = 10000;

const DRAIN = 1 / 40;
const SLOW_DRAIN = 1 / 24;
const SLOW_SPEED = 380;

export interface Run {
  mode: Mode;
  light: number;
  score: number;
  mult: number;
  tier: number;
  smooth: number;
  time: number;
  nextKm: number;
  roughRecent: number;
  slowRecent: number;
  ended: boolean;
  cause: string;
  gentle: boolean;
}

export interface RunEvents {
  km: number;
  tierUp: boolean;
  tierLost: boolean;
  ended: boolean;
  gain: number;
}

export function makeRun(mode: Mode, gentle = false): Run {
  return { mode, light: 1, score: 0, mult: 1, tier: 0, smooth: 0, time: 0, nextKm: 1, roughRecent: 0, slowRecent: 0, ended: false, cause: "", gentle };
}

export function makeRunEvents(): RunEvents {
  return { km: 0, tierUp: false, tierLost: false, ended: false, gain: 0 };
}

function causeOf(r: Run): string {
  if (r.roughRecent >= 2) return "Rough landings drained your light. Land along the downhill slopes.";
  if (r.slowRecent >= 4) return "You slowed down and the light ran out. Dive into the valleys to keep speed.";
  return "Your light faded. Perfect dives and rings refill it.";
}

/** One fixed step of run rules, after the physics step. `dx` is the distance moved this step. */
export function updateRun(r: Run, s: Spirit, ev: StepEvents, dx: number, dt: number, out: RunEvents): void {
  out.km = 0;
  out.tierUp = false;
  out.tierLost = false;
  out.ended = false;
  out.gain = 0;
  if (r.ended) return;
  r.time += dt;

  const decay = Math.exp(-dt / 8);
  r.roughRecent *= decay;
  r.slowRecent *= decay;
  const slow = currentSpeed(s) < SLOW_SPEED;
  if (slow) r.slowRecent += dt;

  // Smoothness: time since the last rough landing decides the tier.
  r.smooth += dt;
  if (ev.landing === "rough") {
    r.roughRecent += 1;
    if (r.tier > 0) out.tierLost = true;
    r.smooth = 0;
    r.tier = 0;
  }
  let tier = 0;
  for (let i = 0; i < TIER_AT.length; i++) if (r.smooth >= TIER_AT[i]) tier = i;
  if (tier > r.tier) {
    r.tier = tier;
    out.tierUp = true;
  }

  r.mult = (1 + Math.min(2, s.combo * 0.1)) * (1 + r.tier * 0.25);
  let gain = dx * 0.02 * r.mult;
  if (s.rail) gain += 60 * dt * r.mult;
  if (ev.landing === "perfect") gain += 100 * s.combo * (1 + r.tier * 0.25);
  if (ev.ring) gain += 250 * ev.ring * r.mult;
  r.score += gain;
  out.gain = gain;

  const km = Math.floor(s.distance / KM);
  if (km >= r.nextKm) {
    out.km = km;
    r.nextKm = km + 1;
  }

  if (r.mode === "zen") {
    r.light = 1;
    return;
  }
  let d = (slow ? SLOW_DRAIN : DRAIN) * dt;
  if (r.gentle) d *= 0.35;
  r.light -= d;
  if (s.rail) r.light += 0.1 * dt;
  if (ev.landing === "perfect") r.light += 0.1 + Math.min(0.06, s.combo * 0.01);
  else if (ev.landing === "good") r.light += 0.04;
  else if (ev.landing === "rough") r.light -= 0.06;
  if (ev.ring) r.light += 0.16 * ev.ring;
  if (ev.gem) r.light += 0.08 * ev.gem;
  if (ev.breach) r.light += 0.1;
  if (r.light > 1) r.light = 1;
  if (r.light <= 0) {
    r.light = 0;
    r.ended = true;
    r.cause = causeOf(r);
    out.ended = true;
  }
}
