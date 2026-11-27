import { GATE_HEIGHT, RING_CHUNK, gateShut, spikeUp, type Terrain } from "./terrain";

export const G = 900;
export const DIVE = 2.1;
export const MIN_SPEED = 230;
export const MAX_SPEED = 2600;
export const STEP = 1 / 60;
/** Backflip speed while holding in the air: one full turn in about 0.87 s. */
export const FLIP_RATE = 7.2;
/** How fast the board settles back towards the flight path once you let go. */
export const ALIGN_RATE = 3.2;
/** Board more than this far from the slope at touchdown: rough. Past CRASH_ANGLE: wipe-out. */
export const ROUGH_ANGLE = 0.7;
export const CRASH_ANGLE = 1.9;
/** Holding down a slope this steep at this speed pierces the surface. */
export const PLUNGE_SLOPE = -0.62;
export const PLUNGE_SPEED = 1050;
export const MAX_DEPTH = 420;

const TAU = Math.PI * 2;

export type Landing = "perfect" | "good" | "rough";
export type Crash = "" | "flip" | "spike" | "gate";

/** What happened during one step, for sound, visuals and tricks. Reused every step. */
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
  /** Full backflips completed on a clean landing this step. */
  flips: number;
  crash: Crash;
  plunge: boolean;
  breach: boolean;
  gem: number;
  gemX: number;
  gemY: number;
  /** A trick ring split in two this step. */
  split: boolean;
  /** The ring crossed this step was a split trick ring. */
  thread: boolean;
}

export interface Spirit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  grounded: boolean;
  /** Below the surface, in the abyss. */
  under: boolean;
  /** Speed along the ground while grounded. */
  speed: number;
  /** Board angle in radians, counter-clockwise (backflips add to it). */
  angle: number;
  /** Rotation accumulated during this flight. */
  airRot: number;
  combo: number;
  bestCombo: number;
  airTime: number;
  maxAlt: number;
  flow: number;
  perfects: number;
  ringsTaken: number;
  gems: number;
  distance: number;
  /** Physics steps since the run started; hazards and collapses are timed against it. */
  frames: number;
}

export function makeSpirit(terrain: Terrain): Spirit {
  const y = terrain.height(0) + 220;
  return { x: 0, y, vx: 440, vy: 0, px: 0, py: y, grounded: false, under: false, speed: 440, angle: 0, airRot: 0, combo: 0, bestCombo: 0, airTime: 0, maxAlt: 0, flow: 0, perfects: 0, ringsTaken: 0, gems: 0, distance: 0, frames: 0 };
}

export function makeEvents(): StepEvents {
  return { takeoff: false, landing: null, apex: false, ring: 0, ringX: 0, ringY: 0, ringCenter: 0, nearMiss: false, landMiss: 0, flips: 0, crash: "", plunge: false, breach: false, gem: 0, gemX: 0, gemY: 0, split: false, thread: false };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Angle difference wrapped to (-π, π]. */
export function wrap(a: number): number {
  let d = (a + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
}

function underwater(s: Spirit, t: Terrain, holding: boolean, dt: number, ev: StepEvents): void {
  // Holding keeps you deep; letting go, the water pushes you back up hard.
  s.vy += (holding ? -700 : 1500) * dt;
  const ch = t.chunk(Math.floor(s.x / RING_CHUNK));
  for (const j of ch.jets) if (s.x > j.x && s.x < j.x + j.w) s.vy += 2400 * dt;
  s.vy *= 1 - 1.1 * dt;
  s.vx = Math.max(MIN_SPEED * 0.8, s.vx * (1 - 0.25 * dt));
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  const surface = t.height(s.x);
  if (s.y < surface - MAX_DEPTH) {
    s.y = surface - MAX_DEPTH;
    if (s.vy < 0) s.vy = 0;
  }
  s.angle = Math.atan2(s.vy, s.vx);
  if (s.y >= surface) {
    if (s.vy > 0) {
      // Breach: the abyss throws you skyward.
      s.under = false;
      s.grounded = false;
      s.vy = s.vy * 1.35 + 380;
      s.y = surface + 1;
      s.airTime = 0;
      s.airRot = 0;
      ev.breach = true;
    } else s.y = surface - 1;
  }
}

/** Ground contact and air flight for one sub-step. */
function move(s: Spirit, t: Terrain, holding: boolean, dt: number, ev: StepEvents, hazards: boolean): void {
  if (s.under) {
    underwater(s, t, holding, dt, ev);
    return;
  }
  const g = G * (holding ? DIVE : 1);
  if (s.grounded) {
    const k = t.slope(s.x);
    const n = Math.sqrt(1 + k * k);
    const sin = k / n;
    const cos = 1 / n;
    s.speed = clamp((s.speed - g * sin * dt) * (1 - 0.04 * dt), MIN_SPEED, MAX_SPEED);
    s.angle = Math.atan(k);
    const vx = s.speed * cos;
    const vy = s.speed * sin;
    s.vx = vx;
    s.vy = vy;
    if (holding && k < PLUNGE_SLOPE && s.speed > PLUNGE_SPEED) {
      // Dolphin plunge: pierce the surface into the abyss.
      s.grounded = false;
      s.under = true;
      s.x += vx * dt;
      s.y = t.height(s.x) - 2;
      ev.plunge = true;
      return;
    }
    const nx = s.x + vx * dt;
    const ground = t.height(nx);
    const ballistic = s.y + vy * dt - 0.5 * G * dt * dt;
    s.x = nx;
    // Light (not holding) and the ground curves away faster than a free fall: lift off.
    if (!holding && ballistic > ground + 1e-4) {
      s.grounded = false;
      s.y = ballistic;
      s.airTime = 0;
      s.airRot = 0;
      ev.takeoff = true;
    } else s.y = ground;
    return;
  }

  const rising = s.vy > 0;
  s.vy -= g * dt;
  s.vx = Math.max(MIN_SPEED * 0.85, s.vx * (1 - 0.02 * dt));
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.airTime += dt;
  // Holding in the air tucks into a backflip; letting go settles the board to the flight path.
  if (holding) {
    s.angle += FLIP_RATE * dt;
    s.airRot += FLIP_RATE * dt;
  } else {
    const d = wrap(Math.atan2(s.vy, s.vx) - s.angle);
    s.angle += clamp(d, -ALIGN_RATE * dt, ALIGN_RATE * dt);
  }
  const ground = t.height(s.x);
  const alt = s.y - ground;
  if (alt > s.maxAlt) s.maxAlt = alt;
  if (rising && s.vy <= 0 && alt > 160) ev.apex = true;
  if (s.y > ground) return;

  // Landing: board angle against the slope decides whether you ride away or wipe out.
  const k = t.slope(s.x);
  const n = Math.sqrt(1 + k * k);
  const board = Math.abs(wrap(s.angle - Math.atan(k)));
  const along = (s.vx + s.vy * k) / n;
  const normal = (s.vy - s.vx * k) / n;
  const miss = Math.atan2(Math.abs(normal), Math.max(1, along));
  ev.landMiss = miss;
  let speed = along;
  if (board > CRASH_ANGLE && hazards) {
    ev.crash = "flip";
    ev.landing = "rough";
    s.combo = 0;
    speed *= 0.4;
  } else if (board > ROUGH_ANGLE) {
    speed *= 0.62;
    s.combo = 0;
    ev.landing = "rough";
  } else {
    ev.flips = Math.floor((Math.abs(s.airRot) + 0.6) / TAU);
    if (miss < 0.3 && k < -0.03 && s.airTime > 0.25) {
      s.combo++;
      s.perfects++;
      if (s.combo > s.bestCombo) s.bestCombo = s.combo;
      speed *= 1.06 + Math.min(0.12, s.combo * 0.012) + ev.flips * 0.05;
      s.flow += 100 * s.combo;
      ev.landing = "perfect";
    } else if (miss < 0.6) {
      speed *= 0.94 + ev.flips * 0.04;
      ev.landing = "good";
    } else {
      speed *= 0.75;
      s.combo = 0;
      ev.landing = "rough";
    }
  }
  s.speed = clamp(speed, MIN_SPEED, MAX_SPEED);
  s.y = ground;
  s.grounded = true;
  s.angle = Math.atan(k);
  s.airRot = 0;
}

function ringDist2(s: Spirit, rx: number, ry: number, dx: number, dy: number, len2: number): number {
  const u = clamp(((rx - s.px) * dx + (ry - s.py) * dy) / len2, 0, 1);
  const cx = s.px + dx * u - rx;
  const cy = s.py + dy * u - ry;
  return cx * cx + cy * cy;
}

/**
 * One fixed 60 Hz step, split into two sub-steps for stable contact. `hazards` turns on wipe-outs
 * from upside-down landings, spikes and tide gates (off in zen and during the first-run tips).
 */
export function step(s: Spirit, t: Terrain, holding: boolean, ev: StepEvents, dt = STEP, hazards = false): void {
  ev.takeoff = false;
  ev.landing = null;
  ev.apex = false;
  ev.ring = 0;
  ev.nearMiss = false;
  ev.flips = 0;
  ev.crash = "";
  ev.plunge = false;
  ev.breach = false;
  ev.gem = 0;
  ev.split = false;
  ev.thread = false;
  s.frames++;
  t.frame = s.frames;
  t.trigger(s.x);
  s.px = s.x;
  s.py = s.y;
  move(s, t, holding, dt / 2, ev, hazards);
  move(s, t, holding, dt / 2, ev, hazards);

  const chunk = Math.floor(s.x / RING_CHUNK);
  const dx = s.x - s.px;
  const dy = s.y - s.py;
  const len2 = dx * dx + dy * dy || 1;
  for (let c = chunk - 1; c <= chunk; c++) {
    const ch = t.chunk(c);
    for (let i = 0; i < ch.rings.length; i++) {
      const r = ch.rings[i];
      if (r.taken || r.passed) continue;
      // Mirage trick rings split in two at the last moment.
      if (r.trick && r.splitAt < 0 && s.x > r.x - 320) {
        r.splitAt = s.frames;
        ev.split = true;
      }
      let d2: number;
      let rr = r.r;
      let hy = r.y;
      if (r.splitAt >= 0) {
        const off = Math.min(80, (s.frames - r.splitAt) * 4);
        rr = r.r * 0.7;
        const a = ringDist2(s, r.x, r.y + off, dx, dy, len2);
        const b = ringDist2(s, r.x, r.y - off, dx, dy, len2);
        d2 = Math.min(a, b);
        hy = a < b ? r.y + off : r.y - off;
      } else d2 = ringDist2(s, r.x, r.y, dx, dy, len2);
      if (d2 < r.closest) r.closest = d2;
      if (d2 < rr * rr) {
        r.taken = true;
        s.ringsTaken++;
        ev.ring++;
        ev.ringX = r.x;
        ev.ringY = hy;
        ev.ringCenter = 1 - Math.sqrt(d2) / rr;
        ev.thread = r.splitAt >= 0;
        s.flow += 250;
        if (s.grounded) s.speed = Math.min(MAX_SPEED, s.speed + 160);
        else if (!s.under) s.vx = Math.min(MAX_SPEED, s.vx + 160);
      } else if (r.x + r.r < s.x) {
        r.passed = true;
        if (r.closest < r.r * r.r * 2.6) ev.nearMiss = true;
      }
    }
    if (s.under) {
      for (const gm of ch.gems) {
        if (gm.taken) continue;
        const gx = gm.x - s.x;
        const gy = gm.y - s.y;
        if (gx * gx + gy * gy < 46 * 46) {
          gm.taken = true;
          s.gems++;
          ev.gem++;
          ev.gemX = gm.x;
          ev.gemY = gm.y;
          s.flow += 400;
        }
      }
    }
    if (hazards && !s.under && !ev.crash) {
      for (const sp of ch.spikes) {
        if (Math.abs(s.x - sp.x) < 26 && s.y - t.height(sp.x) < 34 && spikeUp(sp, s.frames)) ev.crash = "spike";
      }
      for (const gt of ch.gates) {
        if (s.px < gt.x && s.x >= gt.x && gateShut(gt, s.frames) && s.y < t.height(gt.x) + GATE_HEIGHT) ev.crash = "gate";
      }
    }
  }

  s.distance += dx;
  s.flow += dx * 0.02 * (1 + s.combo * 0.1);
}

export function currentSpeed(s: Spirit): number {
  return s.grounded ? s.speed : Math.hypot(s.vx, s.vy);
}
