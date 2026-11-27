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
}

/** Four kinds of shore, each with its own instrument. */
export const ZONES = ["Harp Shallows", "Glass Reef", "Reed Marsh", "Deep Strings"] as const;
export const ZONE_LENGTH = 6000;
export const RING_CHUNK = 2000;

/**
 * Endless rolling hills built from layered sine waves with seeded phases. Height and slope are
 * analytic, so physics never samples a stale mesh and every seed is perfectly repeatable.
 */
export class Terrain {
  readonly seed: number;
  private k: number[];
  private a: number[];
  private p: number[];
  private modK: number;
  private modP: number;
  private ringCache = new Map<number, Ring[]>();

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

  /** Hills grow a little taller the further you travel, up to a cap. */
  private grow(x: number): number {
    return 0.8 + 0.35 * Math.min(1, Math.max(0, x) / 60000);
  }

  private growSlope(x: number): number {
    return x > 0 && x < 60000 ? 0.35 / 60000 : 0;
  }

  height(x: number): number {
    const m = (0.72 + 0.28 * Math.sin(this.modK * x + this.modP)) * this.grow(x);
    return m * (this.a[0] * Math.sin(this.k[0] * x + this.p[0]) + this.a[1] * Math.sin(this.k[1] * x + this.p[1])) + this.a[2] * Math.sin(this.k[2] * x + this.p[2]);
  }

  /** dh/dx, exact. */
  slope(x: number): number {
    const sm = Math.sin(this.modK * x + this.modP);
    const mod = 0.72 + 0.28 * sm;
    const g = this.grow(x);
    const m = mod * g;
    const dm = 0.28 * this.modK * Math.cos(this.modK * x + this.modP) * g + mod * this.growSlope(x);
    const base = this.a[0] * Math.sin(this.k[0] * x + this.p[0]) + this.a[1] * Math.sin(this.k[1] * x + this.p[1]);
    const dbase = this.a[0] * this.k[0] * Math.cos(this.k[0] * x + this.p[0]) + this.a[1] * this.k[1] * Math.cos(this.k[1] * x + this.p[1]);
    return dm * base + m * dbase + this.a[2] * this.k[2] * Math.cos(this.k[2] * x + this.p[2]);
  }

  zone(x: number): number {
    return Math.floor(Math.max(0, x) / ZONE_LENGTH) % ZONES.length;
  }

  /** Starlight rings for one chunk, generated once and cached. */
  rings(chunk: number): Ring[] {
    let list = this.ringCache.get(chunk);
    if (list) return list;
    const r = mulberry32((this.seed ^ Math.imul(chunk + 7, 0x9e3779b1)) >>> 0);
    list = [];
    if (chunk > 0) {
      const n = 1 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const x = chunk * RING_CHUNK + 200 + r() * (RING_CHUNK - 400);
        list.push({ x, y: this.height(x) + 230 + r() * 420, r: 48, taken: false, closest: Infinity, passed: false });
      }
    }
    this.ringCache.set(chunk, list);
    if (this.ringCache.size > 64) {
      const oldest = this.ringCache.keys().next().value;
      if (oldest !== undefined) this.ringCache.delete(oldest);
    }
    return list;
  }
}
