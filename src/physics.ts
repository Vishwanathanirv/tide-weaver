import { RING_CHUNK, type Terrain } from "./terrain";

export const G = 900;
export const DIVE = 2.1;
export const MIN_SPEED = 230;
export const MAX_SPEED = 2600;
export const STEP = 1 / 60;

export type Landing = "perfect" | "good" | "rough";

/** What happened during one step, for sound and visuals. Reused every step, never reallocated. */
export interface StepEvents {
  takeoff: boolean;
  landing: Landing | null;
  apex: boolean;
  ring: number;
  ringX: number;
  ringY: number;
  /** 0..1, how close to the centre the last ring was crossed (1 = dead centre). */
  ringCenter: number;
  /** A ring went by just outside reach this step. */
  nearMiss: boolean;
  /** Angle between flight path and slope at the last landing, in radians. */
  landMiss: number;
}

export interface Spirit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  grounded: boolean;
  /** Speed along the ground while grounded. */
  speed: number;
  combo: number;
  bestCombo: number;
  airTime: number;
  maxAlt: number;
  flow: number;
  perfects: number;
  ringsTaken: number;
  distance: number;
}

export function makeSpirit(terrain: Terrain): Spirit {
  const y = terrain.height(0) + 220;
  return { x: 0, y, vx: 440, vy: 0, px: 0, py: y, grounded: false, speed: 440, combo: 0, bestCombo: 0, airTime: 0, maxAlt: 0, flow: 0, perfects: 0, ringsTaken: 0, distance: 0 };
}

export function makeEvents(): StepEvents {
  return { takeoff: false, landing: null, apex: false, ring: 0, ringX: 0, ringY: 0, ringCenter: 0, nearMiss: false, landMiss: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Ground contact and air flight for one sub-step. */
function move(s: Spirit, t: Terrain, holding: boolean, dt: number, ev: StepEvents): void {
  const g = G * (holding ? DIVE : 1);
  if (s.grounded) {
    const k = t.slope(s.x);
    const n = Math.sqrt(1 + k * k);
    const sin = k / n;
    const cos = 1 / n;
    s.speed = clamp((s.speed - g * sin * dt) * (1 - 0.04 * dt), MIN_SPEED, MAX_SPEED);
    const vx = s.speed * cos;
    const vy = s.speed * sin;
    const nx = s.x + vx * dt;
    const ground = t.height(nx);
    const ballistic = s.y + vy * dt - 0.5 * G * dt * dt;
    s.vx = vx;
    s.vy = vy;
    s.x = nx;
    // Light (not holding) and the ground curves away faster than a free fall: lift off.
    if (!holding && ballistic > ground + 1e-4) {
      s.grounded = false;
      s.y = ballistic;
      s.airTime = 0;
      ev.takeoff = true;
    } else {
      s.y = ground;
    }
    return;
  }

  const rising = s.vy > 0;
  s.vy -= g * dt;
  s.vx = Math.max(MIN_SPEED * 0.85, s.vx * (1 - 0.02 * dt));
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.airTime += dt;
  const ground = t.height(s.x);
  const alt = s.y - ground;
  if (alt > s.maxAlt) s.maxAlt = alt;
  if (rising && s.vy <= 0 && alt > 160) ev.apex = true;
  if (s.y > ground) return;

  // Landing: how closely the flight path matches the slope decides the reward.
  const k = t.slope(s.x);
  const n = Math.sqrt(1 + k * k);
  const along = (s.vx + s.vy * k) / n;
  const normal = (s.vy - s.vx * k) / n;
  const miss = Math.atan2(Math.abs(normal), Math.max(1, along));
  ev.landMiss = miss;
  let speed = along;
  if (miss < 0.3 && k < -0.03 && s.airTime > 0.25) {
    s.combo++;
    s.perfects++;
    if (s.combo > s.bestCombo) s.bestCombo = s.combo;
    speed *= 1.06 + Math.min(0.12, s.combo * 0.012);
    s.flow += 100 * s.combo;
    ev.landing = "perfect";
  } else if (miss < 0.6) {
    speed *= 0.94;
    ev.landing = "good";
  } else {
    speed *= 0.75;
    s.combo = 0;
    ev.landing = "rough";
  }
  s.speed = clamp(speed, MIN_SPEED, MAX_SPEED);
  s.y = ground;
  s.grounded = true;
}

/**
 * One fixed 60 Hz step, split into two sub-steps for stable contact. Holding makes the spirit
 * heavy (2.1x gravity) so it dives and sticks to slopes; letting go makes it light, so the
 * ground curving away throws it skyward. There is no failure: a clumsy landing only costs speed.
 */
export function step(s: Spirit, t: Terrain, holding: boolean, ev: StepEvents, dt = STEP): void {
  ev.takeoff = false;
  ev.landing = null;
  ev.apex = false;
  ev.ring = 0;
  ev.nearMiss = false;
  s.px = s.x;
  s.py = s.y;
  move(s, t, holding, dt / 2, ev);
  move(s, t, holding, dt / 2, ev);

  // Starlight rings: segment-circle test, so fast spirits never pass through unseen.
  const chunk = Math.floor(s.x / RING_CHUNK);
  const dx = s.x - s.px;
  const dy = s.y - s.py;
  const len2 = dx * dx + dy * dy || 1;
  for (let c = chunk - 1; c <= chunk; c++) {
    const list = t.rings(c);
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.taken || r.passed) continue;
      const u = clamp(((r.x - s.px) * dx + (r.y - s.py) * dy) / len2, 0, 1);
      const cx = s.px + dx * u - r.x;
      const cy = s.py + dy * u - r.y;
      const d2 = cx * cx + cy * cy;
      if (d2 < r.closest) r.closest = d2;
      if (d2 < r.r * r.r) {
        r.taken = true;
        s.ringsTaken++;
        ev.ring++;
        ev.ringX = r.x;
        ev.ringY = r.y;
        ev.ringCenter = 1 - Math.sqrt(d2) / r.r;
        s.flow += 250;
        if (s.grounded) s.speed = Math.min(MAX_SPEED, s.speed + 160);
        else s.vx = Math.min(MAX_SPEED, s.vx + 160);
      } else if (r.x + r.r < s.x) {
        r.passed = true;
        if (r.closest < r.r * r.r * 2.6) ev.nearMiss = true;
      }
    }
  }

  s.distance += dx;
  s.flow += dx * 0.02 * (1 + s.combo * 0.1);
}

export function currentSpeed(s: Spirit): number {
  return s.grounded ? s.speed : Math.hypot(s.vx, s.vy);
}
