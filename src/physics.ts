import { GATE_HEIGHT, METEOR_SETTLE, RING_CHUNK, gateShut, railSlope, railY, spikeUp, type Rail, type Terrain, type Whirl } from "./terrain";
import { gravityScale } from "./events";

export const G = 900;
export const DIVE = 2.1;
export const MIN_SPEED = 230;
export const MAX_SPEED = 2600;
export const STEP = 1 / 60;
/** Backflip speed while holding in the air: one full turn in about 0.87 s. */
export const FLIP_RATE = 7.2;
/** How fast the board settles back towards the flight path once you let go. */
export const ALIGN_RATE = 3.2;
/** A hold shorter than this in the air is a dive, not a flip. */
export const FLIP_DELAY = 0.2;
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
  /** Sky-rail: the board locked on / came off this step. */
  railOn: boolean;
  railOff: boolean;
  /** A shrine gate was threaded; all three in order began a Spirit Blessing. */
  shrine: boolean;
  blessing: boolean;
  /** A whirlpool took hold / fired the spirit out. */
  whirlIn: boolean;
  whirlOut: boolean;
  /** Inside a thunderhead's updraft. */
  storm: boolean;
  /** The Leviathan's rune ring was threaded. */
  rune: boolean;
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
  /** How long the current hold has lasted in the air. */
  holdAir: number;
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
  /** Seconds of Surge left (speed burst with a ring magnet), and seconds until the next one. */
  surge: number;
  surgeCd: number;
  /** Handling from the worn board: gravity multiplier while holding, and backflip rate. */
  dive: number;
  flip: number;
  /** Ring catch radius multiplier from the worn board. */
  reach: number;
  /** Gem upgrades: ring pull multiplier and Surge recharge in seconds. */
  pull: number;
  cool: number;
  /** Seconds left in which a late release still launches off a crest. */
  coyote: number;
  /** The sky-rail being ground, and the short cooldown after leaving one. */
  rail: Rail | null;
  railCd: number;
  /** The whirlpool spinning the spirit, how long it has, the speed it came in at, and a cooldown. */
  whirl: Whirl | null;
  whirlT: number;
  whirlSpeed: number;
  whirlCd: number;
  /** Seconds left of a Spirit Blessing, and the shrine chain being threaded (id and gates so far). */
  bless: number;
  chainId: number;
  chainN: number;
}

export const BLESS_TIME = 8;
/** Grace after holding over a crest in which letting go still launches the spirit. */
export const COYOTE = 0.12;
const RAIL_ACCEL = 140;
const WHIRL_TIME = 0.6;

export const SURGE_TIME = 1.2;
export const SURGE_COOLDOWN = 4.5;
const SURGE_BOOST = 420;
/** While surging, rings are caught from this many times further away. */
const SURGE_MAGNET = 1.9;

/** Second verb: a burst of speed and a ring magnet. Not underwater, and only once the cooldown is over. */
export function surge(s: Spirit): boolean {
  if (s.under || s.surgeCd > 0) return false;
  if (s.grounded) s.speed = Math.min(MAX_SPEED, s.speed + SURGE_BOOST * 0.75);
  else {
    s.vx = Math.min(MAX_SPEED, s.vx + SURGE_BOOST);
    s.vy += 140;
  }
  s.surge = SURGE_TIME;
  s.surgeCd = s.cool;
  return true;
}

export function makeSpirit(terrain: Terrain, dive = DIVE, flip = FLIP_RATE, reach = 1, pull = 1, cool = SURGE_COOLDOWN): Spirit {
  const y = terrain.height(0) + 220;
  return { x: 0, y, vx: 440, vy: 0, px: 0, py: y, grounded: false, under: false, speed: 440, angle: 0, airRot: 0, holdAir: 0, combo: 0, bestCombo: 0, airTime: 0, maxAlt: 0, flow: 0, perfects: 0, ringsTaken: 0, gems: 0, distance: 0, frames: 0, surge: 0, surgeCd: 0, dive, flip, reach, pull, cool, coyote: 0, rail: null, railCd: 0, whirl: null, whirlT: 0, whirlSpeed: 0, whirlCd: 0, bless: 0, chainId: -1, chainN: 0 };
}

export function makeEvents(): StepEvents {
  return { takeoff: false, landing: null, apex: false, ring: 0, ringX: 0, ringY: 0, ringCenter: 0, nearMiss: false, landMiss: 0, flips: 0, crash: "", plunge: false, breach: false, gem: 0, gemX: 0, gemY: 0, split: false, thread: false, railOn: false, railOff: false, shrine: false, blessing: false, whirlIn: false, whirlOut: false, storm: false, rune: false };
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

/** Riding a sky-rail: the board follows the ribbon, speeding up a little, until it ends. */
function grind(s: Spirit, t: Terrain, dt: number, ev: StepEvents): void {
  const r = s.rail!;
  s.speed = Math.min(MAX_SPEED, s.speed + RAIL_ACCEL * dt);
  const k = railSlope(r, s.x);
  const c = 1 / Math.sqrt(1 + k * k);
  s.x += s.speed * c * dt;
  s.vx = s.speed * c;
  s.vy = s.speed * k * c;
  s.angle = Math.atan(k);
  s.grounded = false;
  s.under = false;
  s.airTime = 0;
  s.airRot = 0;
  s.holdAir = 0;
  if (s.x >= r.x1) {
    s.y = railY(r, r.x1);
    s.rail = null;
    s.railCd = 0.5;
    s.vy += 120;
    ev.railOff = true;
  } else s.y = railY(r, s.x);
  const alt = s.y - t.height(s.x);
  if (alt > s.maxAlt) s.maxAlt = alt;
}

/** A whirlpool: sucked under for a moment, spun, then fired out horizontally, faster than you came in. */
function spin(s: Spirit, t: Terrain, dt: number, ev: StepEvents): void {
  s.whirlT += dt;
  const p = Math.min(1, s.whirlT / WHIRL_TIME);
  s.x += s.whirlSpeed * 0.35 * dt;
  const surface = t.height(s.x);
  s.y = surface - 150 * Math.sin(Math.PI * p);
  s.angle += 18 * dt;
  s.vx = s.whirlSpeed * 0.35;
  s.vy = 0;
  if (p >= 1) {
    s.whirl = null;
    s.under = false;
    s.grounded = false;
    s.vx = Math.min(MAX_SPEED, s.whirlSpeed * 1.35 + 380);
    s.vy = 140;
    s.y = surface + 2;
    s.angle = 0.1;
    s.airTime = 0;
    s.airRot = 0;
    s.whirlCd = 1.2;
    s.flow += 500;
    ev.whirlOut = true;
  }
}

/** Ground contact and air flight for one sub-step. */
function move(s: Spirit, t: Terrain, holding: boolean, dt: number, ev: StepEvents, hazards: boolean): void {
  if (s.rail) {
    grind(s, t, dt, ev);
    return;
  }
  if (s.whirl) {
    spin(s, t, dt, ev);
    return;
  }
  if (s.under) {
    underwater(s, t, holding, dt, ev);
    return;
  }
  const g = G * (holding ? s.dive : 1);
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
    if (s.whirlCd <= 0) {
      const wl = t.whirlAt(s.x);
      if (wl) {
        s.whirl = wl;
        s.whirlT = 0;
        s.whirlSpeed = s.speed;
        s.grounded = false;
        s.under = true;
        ev.whirlIn = true;
        return;
      }
    }
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
    // Light (not holding) and the ground curves away faster than a free fall: lift off. Coyote
    // window: hold over a crest and let go up to COYOTE seconds late, and you still launch.
    const flies = ballistic > ground + 1e-4;
    if (!holding && (flies || s.coyote > 0)) {
      s.grounded = false;
      s.y = flies ? ballistic : ground + 1;
      s.airTime = 0;
      s.airRot = 0;
      s.coyote = 0;
      ev.takeoff = true;
    } else {
      s.y = ground;
      s.coyote = holding && flies ? COYOTE : Math.max(0, s.coyote - dt);
    }
    return;
  }

  const rising = s.vy > 0;
  // A little hang at the top of every jump, and moon leaps in the eclipse.
  const hang = !holding && Math.abs(s.vy) < 170 ? 0.84 : 1;
  s.vy -= g * gravityScale(s.x) * hang * dt;
  s.vx = Math.max(MIN_SPEED * 0.85, s.vx * (1 - 0.02 * dt));
  const x0 = s.x;
  const y0 = s.y;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.airTime += dt;
  // A thunderhead's updraft throws you upward.
  if (t.cloudAt(s.x, s.y)) {
    if (s.vy < 1900) s.vy = Math.min(1900, s.vy + 2600 * dt);
    s.vx = Math.min(MAX_SPEED, s.vx + 300 * dt);
    ev.storm = true;
  }
  // A sky-rail: cross the ribbon, from either side, and the board locks on.
  if (s.railCd <= 0) {
    const rl = t.railAt(s.x);
    if (rl) {
      const yr = railY(rl, s.x);
      const before = y0 - railY(rl, x0);
      const after = s.y - yr;
      if (before * after <= 0 || Math.abs(after) < 12) {
        s.rail = rl;
        s.speed = clamp(Math.hypot(s.vx, s.vy), MIN_SPEED, MAX_SPEED);
        s.y = yr;
        s.airRot = 0;
        s.flow += 300;
        ev.railOn = true;
        return;
      }
    }
  }
  // Holding in the air tucks into a backflip; letting go settles the board to the flight path.
  s.holdAir = holding ? s.holdAir + dt : 0;
  if (holding && s.holdAir > FLIP_DELAY) {
    s.angle += s.flip * dt;
    s.airRot += s.flip * dt;
  } else {
    // Close to the water and falling, the board leans towards the slope for you.
    const flight = Math.atan2(s.vy, s.vx);
    const near = s.vy < 0 && s.y - t.height(s.x) < 110;
    const target = near ? flight + wrap(Math.atan(t.slope(s.x)) - flight) * 0.5 : flight;
    const rate = near ? ALIGN_RATE * 1.8 : ALIGN_RATE;
    s.angle += clamp(wrap(target - s.angle), -rate * dt, rate * dt);
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
  ev.railOn = false;
  ev.railOff = false;
  ev.shrine = false;
  ev.blessing = false;
  ev.whirlIn = false;
  ev.whirlOut = false;
  ev.storm = false;
  ev.rune = false;
  s.frames++;
  s.surge = Math.max(0, s.surge - dt);
  s.surgeCd = Math.max(0, s.surgeCd - dt);
  s.bless = Math.max(0, s.bless - dt);
  s.railCd = Math.max(0, s.railCd - dt);
  s.whirlCd = Math.max(0, s.whirlCd - dt);
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
      const catchR = (s.surge > 0 ? rr * SURGE_MAGNET : rr) * s.reach * s.pull * (s.bless > 0 ? 1.5 : 1);
      if (d2 < catchR * catchR) {
        r.taken = true;
        s.ringsTaken++;
        ev.ring++;
        ev.ringX = r.x;
        ev.ringY = hy;
        ev.ringCenter = Math.max(0, 1 - Math.sqrt(d2) / rr);
        ev.thread = r.splitAt >= 0;
        s.flow += 250;
        if (r.shrine >= 0) {
          // Shrine gates must be threaded in order; the third begins a Spirit Blessing.
          ev.shrine = true;
          if (r.order === 0) {
            s.chainId = r.shrine;
            s.chainN = 1;
          } else if (s.chainId === r.shrine && s.chainN === r.order) s.chainN++;
          else {
            s.chainId = -1;
            s.chainN = 0;
          }
          if (s.chainN >= 3) {
            s.bless = BLESS_TIME;
            s.chainId = -1;
            s.chainN = 0;
            ev.blessing = true;
          }
        }
        if (r.rune) {
          ev.rune = true;
          s.flow += 2000;
          if (!s.under) s.vx = Math.min(MAX_SPEED, s.vx + 220);
        }
        if (s.grounded) s.speed = Math.min(MAX_SPEED, s.speed + 160);
        else if (!s.under) s.vx = Math.min(MAX_SPEED, s.vx + 160);
      } else if (r.x + r.r < s.x) {
        r.passed = true;
        if (r.shrine >= 0) {
          s.chainId = -1;
          s.chainN = 0;
        }
        if (r.closest < r.r * r.r * 2.6) ev.nearMiss = true;
      }
    }
    if (!s.under) {
      for (const sh of ch.shards) {
        if (sh.taken || sh.m.at < 0 || s.frames - sh.m.at < METEOR_SETTLE) continue;
        const gx = sh.x - s.x;
        const gy = sh.y - s.y;
        const gr = 58 * s.pull * (s.surge > 0 ? 1.5 : 1);
        if (gx * gx + gy * gy < gr * gr) {
          sh.taken = true;
          s.gems++;
          ev.gem++;
          ev.gemX = sh.x;
          ev.gemY = sh.y;
          s.flow += 400;
        }
      }
    }
    if (s.under) {
      for (const gm of ch.gems) {
        if (gm.taken) continue;
        const gx = gm.x - s.x;
        const gy = gm.y - s.y;
        const gr = 46 * s.pull * (s.surge > 0 ? 1.5 : 1);
        if (gx * gx + gy * gy < gr * gr) {
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
        if (Math.abs(s.x - sp.x) < 26 && s.y - t.height(sp.x) < 34 && spikeUp(sp, s.frames)) {
          if (s.bless <= 0) ev.crash = "spike";
          else if (!sp.taken) {
            sp.taken = true;
            s.gems++;
            ev.gem++;
            ev.gemX = sp.x;
            ev.gemY = t.height(sp.x) + 20;
            s.flow += 400;
          }
        }
      }
      for (const gt of ch.gates) {
        if (s.px < gt.x && s.x >= gt.x && gateShut(gt, s.frames) && s.y < t.height(gt.x) + GATE_HEIGHT) {
          if (s.bless <= 0) ev.crash = "gate";
          else if (!gt.taken) {
            gt.taken = true;
            s.gems++;
            ev.gem++;
            ev.gemX = gt.x;
            ev.gemY = t.height(gt.x) + 120;
            s.flow += 400;
          }
        }
      }
    }
  }

  s.distance += dx;
  s.flow += dx * 0.02 * (1 + s.combo * 0.1);
}

export function currentSpeed(s: Spirit): number {
  return s.grounded ? s.speed : Math.hypot(s.vx, s.vy);
}
