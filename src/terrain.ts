import { mulberry32 } from "./rng";

const TAU = Math.PI * 2;

export interface Ring {
  /** Shrine gate: the chain it belongs to (a chunk index) and its place in the chain of three; -1 for an ordinary ring. */
  shrine: number;
  order: number;
  /** The Leviathan's rune ring. */
  rune: boolean;
  x: number;
  y: number;
  r: number;
  taken: boolean;
  /** Closest the spirit came, for near-miss callouts. Never read by physics. */
  closest: number;
  passed: boolean;
  /** Mirage trick ring: splits in two as you approach. */
  trick: boolean;
  splitAt: number;
}

export const mkRing = (x: number, y: number, r: number, trick = false): Ring => ({ shrine: -1, order: 0, rune: false, x, y, r, taken: false, closest: Infinity, passed: false, trick, splitAt: -1 });

export interface Gem {
  x: number;
  y: number;
  taken: boolean;
}

export interface Jet {
  x: number;
  w: number;
}

export interface Spike {
  x: number;
  phase: number;
  /** Turned into a bonus gem by a Spirit Blessing. */
  taken: boolean;
}

export interface Gate {
  x: number;
  phase: number;
  taken: boolean;
}

/** A shimmering ribbon high above the waves. Touch it and the board locks on and grinds to the end. */
export interface Rail {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  amp: number;
  waves: number;
  ph: number;
}

export const railY = (r: Rail, x: number): number => {
  const u = (x - r.x0) / (r.x1 - r.x0);
  return r.y0 + (r.y1 - r.y0) * u + r.amp * Math.sin(Math.PI * u) * Math.sin(r.waves * Math.PI * u + r.ph);
};
export const railSlope = (r: Rail, x: number): number => (railY(r, x + 1) - railY(r, x - 1)) / 2;

/** A whirlpool on the surface: it pulls you under and fires you out like a cannonball. */
export interface Whirl {
  x: number;
}
export const WHIRL_R = 64;

/** A thunderhead: flying into it rides an electric updraft. */
export interface Cloud {
  x: number;
  y: number;
  r: number;
}

export interface Collapse {
  x: number;
  at: number;
}

export interface Chunk {
  rings: Ring[];
  gems: Gem[];
  jets: Jet[];
  spikes: Spike[];
  gates: Gate[];
  collapses: Collapse[];
  rails: Rail[];
  whirls: Whirl[];
  clouds: Cloud[];
}

/** The Leviathan's arched back: a hump in the water at 5 km and every 5 km after, with a rune ring past the crest. */
export const LEV_EVERY = 50000;
export const LEV_H = 520;
export const LEV_W = 620;
export const RUNE_OFFSET = 1100;

/** Four kinds of shore, each with its own instrument. */
export const ZONES = ["Harp Shallows", "Glass Reef", "Reed Marsh", "Deep Strings"] as const;
export const ZONE_LENGTH = 6000;
export const RING_CHUNK = 2000;
export const KM_UNITS = 10000;
/** One beat at 88 BPM, in 60 Hz physics steps. */
export const BEAT_STEPS = 41;
export const BIOMES = ["Twilight Shallows", "Mirage Straits", "Obsidian Storm"] as const;
export const GATE_HEIGHT = 300;
const COLLAPSE_DEPTH = 120;
const COLLAPSE_WIDTH = 180;
const COLLAPSE_STEPS = 36;

/** The last 2 km of every kilometre from the first on: calm water, extra rings, no traps. */
export const lagoonAt = (x: number): boolean => x >= 8000 && x % KM_UNITS >= KM_UNITS - RING_CHUNK;

export const biomeAt = (x: number): number => (x < KM_UNITS ? 0 : x < KM_UNITS * 2 ? 1 : 2);

/** Spikes stand for the first half of each beat; gates are shut for the second half. */
export const spikeUp = (sp: Spike, frame: number): boolean => (frame + sp.phase) % BEAT_STEPS < BEAT_STEPS / 2;
export const gateShut = (g: Gate, frame: number): boolean => (frame + g.phase) % BEAT_STEPS >= BEAT_STEPS / 2;

/**
 * Endless rolling hills built from layered sine waves with seeded phases, plus seeded content per
 * 2000-unit chunk: rings, sunken gems and thermal jets everywhere; trick rings and collapsing
 * crests in the Mirage Straits; beat-synced spikes and tide gates in the Obsidian Storm.
 * Everything is a pure function of the seed and the physics frame, so runs replay exactly.
 */
export class Terrain {
  readonly seed: number;
  /** Set by the physics each step; collapsing crests are timed against it. */
  frame = 0;
  private k: number[];
  private a: number[];
  private p: number[];
  private modK: number;
  private modP: number;
  private cache = new Map<number, Chunk>();
  private active: Collapse[] = [];

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const r = mulberry32(this.seed);
    const wl = [1800 + r() * 500, 900 + r() * 200, 420 + r() * 80];
    this.k = wl.map((w) => TAU / w);
    this.a = [160 + r() * 30, 45 + r() * 15, 6 + r() * 4];
    this.p = [r() * TAU, r() * TAU, r() * TAU];
    this.modK = TAU / (8000 + r() * 3000);
    this.modP = r() * TAU;
  }

  private grow(x: number): number {
    return 0.8 + 0.35 * Math.min(1, Math.max(0, x) / 60000);
  }

  private growSlope(x: number): number {
    return x > 0 && x < 60000 ? 0.35 / 60000 : 0;
  }

  private baseHeight(x: number): number {
    const m = (0.72 + 0.28 * Math.sin(this.modK * x + this.modP)) * this.grow(x);
    return m * (this.a[0] * Math.sin(this.k[0] * x + this.p[0]) + this.a[1] * Math.sin(this.k[1] * x + this.p[1])) + this.a[2] * Math.sin(this.k[2] * x + this.p[2]);
  }

  private baseSlope(x: number): number {
    const sm = Math.sin(this.modK * x + this.modP);
    const mod = 0.72 + 0.28 * sm;
    const g = this.grow(x);
    const m = mod * g;
    const dm = 0.28 * this.modK * Math.cos(this.modK * x + this.modP) * g + mod * this.growSlope(x);
    const base = this.a[0] * Math.sin(this.k[0] * x + this.p[0]) + this.a[1] * Math.sin(this.k[1] * x + this.p[1]);
    const dbase = this.a[0] * this.k[0] * Math.cos(this.k[0] * x + this.p[0]) + this.a[1] * this.k[1] * Math.cos(this.k[1] * x + this.p[1]);
    return dm * base + m * dbase + this.a[2] * this.k[2] * Math.cos(this.k[2] * x + this.p[2]);
  }

  private progress(c: Collapse): number {
    if (c.at < 0) return 0;
    const t = Math.min(1, Math.max(0, (this.frame - c.at) / COLLAPSE_STEPS));
    return t * t * (3 - 2 * t);
  }

  /** Height of the Leviathan's back at x (0 almost everywhere). */
  private levH(x: number): number {
    if (x < LEV_EVERY - 4 * LEV_W) return 0;
    const m = Math.round(x / LEV_EVERY);
    if (m < 1) return 0;
    const u = (x - m * LEV_EVERY) / LEV_W;
    return Math.abs(u) < 4 ? LEV_H * Math.exp(-u * u) : 0;
  }

  private levS(x: number): number {
    if (x < LEV_EVERY - 4 * LEV_W) return 0;
    const m = Math.round(x / LEV_EVERY);
    if (m < 1) return 0;
    const u = (x - m * LEV_EVERY) / LEV_W;
    return Math.abs(u) < 4 ? ((-2 * u) / LEV_W) * LEV_H * Math.exp(-u * u) : 0;
  }

  /** The ground before collapses: where seeded content is placed. */
  private gb(x: number): number {
    return this.baseHeight(x) + this.levH(x);
  }

  height(x: number): number {
    let h = this.baseHeight(x) + this.levH(x);
    for (let i = 0; i < this.active.length; i++) {
      const c = this.active[i];
      const u = (x - c.x) / COLLAPSE_WIDTH;
      if (u > -3 && u < 3) h -= COLLAPSE_DEPTH * this.progress(c) * Math.exp(-u * u);
    }
    return h;
  }

  /** dh/dx, exact, including collapsing crests. */
  slope(x: number): number {
    let k = this.baseSlope(x) + this.levS(x);
    for (let i = 0; i < this.active.length; i++) {
      const c = this.active[i];
      const u = (x - c.x) / COLLAPSE_WIDTH;
      if (u > -3 && u < 3) k += ((COLLAPSE_DEPTH * this.progress(c) * 2 * u) / COLLAPSE_WIDTH) * Math.exp(-u * u);
    }
    return k;
  }

  zone(x: number): number {
    return Math.floor(Math.max(0, x) / ZONE_LENGTH) % ZONES.length;
  }

  /** Starts collapses the spirit is approaching; called by the physics with the spirit's x. */
  trigger(x: number): void {
    const c = Math.floor(x / RING_CHUNK);
    for (let k = c; k <= c + 1; k++) {
      for (const col of this.chunk(k).collapses) {
        if (col.at < 0 && x > col.x - 520) {
          col.at = this.frame;
          this.active.push(col);
        }
      }
    }
    if (this.active.length > 8) this.active = this.active.filter((col) => col.x > x - 3000);
  }

  railAt(x: number): Rail | null {
    for (const r of this.chunk(Math.floor(x / RING_CHUNK)).rails) if (x >= r.x0 && x <= r.x1) return r;
    return null;
  }

  whirlAt(x: number): Whirl | null {
    for (const w of this.chunk(Math.floor(x / RING_CHUNK)).whirls) if (Math.abs(w.x - x) < WHIRL_R) return w;
    return null;
  }

  cloudAt(x: number, y: number): Cloud | null {
    for (const c of this.chunk(Math.floor(x / RING_CHUNK)).clouds) {
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy < c.r * c.r) return c;
    }
    return null;
  }

  rings(chunk: number): Ring[] {
    return this.chunk(chunk).rings;
  }

  chunk(index: number): Chunk {
    let ch = this.cache.get(index);
    if (ch) return ch;
    const r = mulberry32((this.seed ^ Math.imul(index + 7, 0x9e3779b1)) >>> 0);
    ch = { rings: [], gems: [], jets: [], spikes: [], gates: [], collapses: [], rails: [], whirls: [], clouds: [] };
    if (index > 0) {
      const x0 = index * RING_CHUNK;
      const biome = biomeAt(x0);
      const lagoon = lagoonAt(x0);
      const n = 1 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const x = x0 + 200 + r() * (RING_CHUNK - 400);
        const trick = biome === 1 && r() < 0.6 && !lagoon;
        ch.rings.push(mkRing(x, this.gb(x) + 230 + r() * 420, 48, trick));
      }
      // The abyss: gems in the deep and warm jets that push you up.
      const gems = 1 + Math.floor(r() * 3);
      for (let i = 0; i < gems; i++) {
        const x = x0 + 150 + r() * (RING_CHUNK - 300);
        ch.gems.push({ x, y: this.gb(x) - 120 - r() * 220, taken: false });
      }
      if (r() < 0.7) ch.jets.push({ x: x0 + 300 + r() * (RING_CHUNK - 700), w: 110 + r() * 60 });
      if (lagoon) {
        // A gentle arc of rings and a few more gems: a breather with something to collect.
        const lr = mulberry32((this.seed ^ Math.imul(index + 11, 0x85ebca6b)) >>> 0);
        for (let i = 0; i < 3; i++) {
          const x = x0 + 280 + i * 560 + lr() * 120;
          ch.rings.push(mkRing(x, this.gb(x) + 300 + Math.sin(i * 1.3) * 90, 54));
        }
        for (let i = 0; i < 2; i++) {
          const x = x0 + 300 + lr() * (RING_CHUNK - 600);
          ch.gems.push({ x, y: this.gb(x) - 130 - lr() * 160, taken: false });
        }
      }
      if (biome === 1 && !lagoon && r() < 0.75) ch.collapses.push({ x: x0 + 500 + r() * (RING_CHUNK - 1000), at: -1 });
      if (biome === 2 && !lagoon) {
        const sp = 1 + Math.floor(r() * 2);
        for (let i = 0; i < sp; i++) ch.spikes.push({ x: x0 + 250 + r() * (RING_CHUNK - 500), phase: Math.floor(r() * BEAT_STEPS), taken: false });
        if (r() < 0.8) ch.gates.push({ x: x0 + 400 + r() * (RING_CHUNK - 800), phase: Math.floor(r() * BEAT_STEPS), taken: false });
      }
      // Set-pieces and special features use their own random stream, so adding them never shifts
      // the rings, gems and hazards above.
      const er = mulberry32((this.seed ^ Math.imul(index + 31, 0xc2b2ae35)) >>> 0);
      if (index >= 2) {
        if (index % 2 === 0 && er() < 0.9) {
          const rx0 = x0 + 120 + er() * 300;
          const len = 900 + er() * 500;
          let y0 = this.gb(rx0) + 620 + er() * 260;
          let y1 = y0 + (er() - 0.4) * 320;
          // Never bury a rail: along its whole length keep it well above the ground (the Leviathan's back rises).
          let lift = 0;
          for (let x = rx0; x <= rx0 + len; x += 100) lift = Math.max(lift, this.gb(x) + 480 - (y0 + ((y1 - y0) * (x - rx0)) / len));
          y0 += lift;
          y1 += lift;
          ch.rails.push({ x0: rx0, x1: rx0 + len, y0, y1, amp: 20 + er() * 40, waves: 1 + Math.floor(er() * 3), ph: er() * TAU });
        }
        if (index >= 4 && index % 3 === 1) {
          // Three shrine gates in an arc. Fly through all three in order for a Spirit Blessing.
          const lift = [250, 360, 280];
          for (let i = 0; i < 3; i++) {
            const x = x0 + 250 + i * 430;
            const g = mkRing(x, this.gb(x) + lift[i] + er() * 50, 66);
            g.shrine = index;
            g.order = i;
            ch.rings.push(g);
          }
        }
        if (er() < 0.32) ch.whirls.push({ x: x0 + 450 + er() * 1100 });
        if (biome === 2 && er() < 0.55) {
          const cx = x0 + 300 + er() * 1400;
          ch.clouds.push({ x: cx, y: this.gb(cx) + 1150 + er() * 350, r: 170 + er() * 90 });
        }
      }
      // The Leviathan's rune ring, past the crest of its back.
      const m = Math.round((index * RING_CHUNK + RING_CHUNK / 2 - RUNE_OFFSET) / LEV_EVERY);
      if (m >= 1 && Math.floor((m * LEV_EVERY + RUNE_OFFSET) / RING_CHUNK) === index) {
        const rx = m * LEV_EVERY + RUNE_OFFSET;
        const rune = mkRing(rx, this.gb(rx) + 720, 92);
        rune.rune = true;
        ch.rings.push(rune);
      }
    }
    this.cache.set(index, ch);
    if (this.cache.size > 64) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined && oldest < index - 4) this.cache.delete(oldest);
    }
    return ch;
  }
}
