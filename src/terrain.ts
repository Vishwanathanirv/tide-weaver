import { mulberry32 } from "./rng";

const TAU = Math.PI * 2;

export interface Ring {
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
}

export interface Gate {
  x: number;
  phase: number;
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
}

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

  height(x: number): number {
    let h = this.baseHeight(x);
    for (let i = 0; i < this.active.length; i++) {
      const c = this.active[i];
      const u = (x - c.x) / COLLAPSE_WIDTH;
      if (u > -3 && u < 3) h -= COLLAPSE_DEPTH * this.progress(c) * Math.exp(-u * u);
    }
    return h;
  }

  /** dh/dx, exact, including collapsing crests. */
  slope(x: number): number {
    let k = this.baseSlope(x);
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

  rings(chunk: number): Ring[] {
    return this.chunk(chunk).rings;
  }

  chunk(index: number): Chunk {
    let ch = this.cache.get(index);
    if (ch) return ch;
    const r = mulberry32((this.seed ^ Math.imul(index + 7, 0x9e3779b1)) >>> 0);
    ch = { rings: [], gems: [], jets: [], spikes: [], gates: [], collapses: [] };
    if (index > 0) {
      const x0 = index * RING_CHUNK;
      const biome = biomeAt(x0);
      const n = 1 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const x = x0 + 200 + r() * (RING_CHUNK - 400);
        const trick = biome === 1 && r() < 0.6;
        ch.rings.push({ x, y: this.baseHeight(x) + 230 + r() * 420, r: 48, taken: false, closest: Infinity, passed: false, trick, splitAt: -1 });
      }
      // The abyss: gems in the deep and warm jets that push you up.
      const gems = 1 + Math.floor(r() * 3);
      for (let i = 0; i < gems; i++) {
        const x = x0 + 150 + r() * (RING_CHUNK - 300);
        ch.gems.push({ x, y: this.baseHeight(x) - 120 - r() * 220, taken: false });
      }
      if (r() < 0.7) ch.jets.push({ x: x0 + 300 + r() * (RING_CHUNK - 700), w: 110 + r() * 60 });
      if (biome === 1 && r() < 0.75) ch.collapses.push({ x: x0 + 500 + r() * (RING_CHUNK - 1000), at: -1 });
      if (biome === 2) {
        const sp = 1 + Math.floor(r() * 2);
        for (let i = 0; i < sp; i++) ch.spikes.push({ x: x0 + 250 + r() * (RING_CHUNK - 500), phase: Math.floor(r() * BEAT_STEPS) });
        if (r() < 0.8) ch.gates.push({ x: x0 + 400 + r() * (RING_CHUNK - 800), phase: Math.floor(r() * BEAT_STEPS) });
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
