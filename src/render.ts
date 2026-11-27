import type { Spirit } from "./physics";
import { RING_CHUNK, type Terrain } from "./terrain";
import type { Aura } from "./save";
import { mulberry32 } from "./rng";
import type { CalloutKind } from "./juice";
import { Surfer } from "./surfer";
import { abyss, birds, caustics, hazards, observatory, pod, props, type View } from "./world";

type RGB = [number, number, number];

/**
 * Five skies the world drifts through, one per minute: watercolour twilight, a moonlit sea,
 * aurora, layered paper-cut dawn and sumi-e ink rain. Every layer is drawn per style and
 * blended by weight, so the crossfades are real changes of paint, not colour tints.
 */
export const STYLES = ["Watercolour Twilight", "Moonlit Sea", "Aurora", "Paper Dawn", "Ink Rain"] as const;
export const STYLE_COUNT = STYLES.length;
const TW = 0;
const MOON = 1;
const AUR = 2;
const PAPER = 3;
const INK = 4;

interface Palette {
  skyTop: RGB;
  skyBot: RGB;
  m: [RGB, RGB, RGB];
  seaTop: RGB;
  seaBot: RGB;
  line: RGB;
  accent: RGB;
  orb: RGB;
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const PAL: Palette[] = [
  { skyTop: hex("#241f52"), skyBot: hex("#e8957d"), m: [hex("#8a6aa8"), hex("#6d4f93"), hex("#4b3777")], seaTop: hex("#3d5c9c"), seaBot: hex("#141a42"), line: hex("#ffe2cf"), accent: hex("#ffd39a"), orb: hex("#fff3d6") },
  { skyTop: hex("#02040f"), skyBot: hex("#0e2150"), m: [hex("#101a40"), hex("#0b1434"), hex("#070d24")], seaTop: hex("#0a2a52"), seaBot: hex("#01040b"), line: hex("#cfe6ff"), accent: hex("#9fd0ff"), orb: hex("#eef6ff") },
  { skyTop: hex("#03141c"), skyBot: hex("#1c3a4c"), m: [hex("#21404d"), hex("#17313d"), hex("#0e212a")], seaTop: hex("#0f3a44"), seaBot: hex("#03131a"), line: hex("#8affd6"), accent: hex("#c59bff"), orb: hex("#eafff7") },
  { skyTop: hex("#ffc27a"), skyBot: hex("#fff0d2"), m: [hex("#f0956b"), hex("#d2654f"), hex("#97404a")], seaTop: hex("#2c7a78"), seaBot: hex("#123d46"), line: hex("#fff7e4"), accent: hex("#ff9f43"), orb: hex("#fffaf0") },
  { skyTop: hex("#252a31"), skyBot: hex("#8d939c"), m: [hex("#5a5f68"), hex("#3b3f46"), hex("#22252a")], seaTop: hex("#2a2f36"), seaBot: hex("#0b0d10"), line: hex("#ece9e1"), accent: hex("#d7e3ee"), orb: hex("#ffffff") },
];

const ZONE_TINT: RGB[] = [hex("#ffd9a0"), hex("#9cefff"), hex("#b9f29d"), hex("#d6a6ff")];

function mixPal(w: readonly number[], pick: (p: Palette) => RGB, out: RGB): RGB {
  out[0] = out[1] = out[2] = 0;
  for (let i = 0; i < STYLE_COUNT; i++) {
    if (w[i] <= 0) continue;
    const c = pick(PAL[i]);
    out[0] += c[0] * w[i];
    out[1] += c[1] * w[i];
    out[2] += c[2] * w[i];
  }
  return out;
}

const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function auraColor(aura: Aura, t: number, time: number, out: RGB): RGB {
  const mix = (a: string, b: string) => {
    const x = hex(a);
    const y = hex(b);
    out[0] = lerp(x[0], y[0], t);
    out[1] = lerp(x[1], y[1], t);
    out[2] = lerp(x[2], y[2], t);
  };
  switch (aura) {
    case "tide":
      mix("#2d6bff", "#3ee6d0");
      break;
    case "moth":
      mix("#bfb39a", "#fbf6e8");
      break;
    case "comet":
      mix("#6fa8ff", "#ffffff");
      break;
    case "lotus":
      mix("#ff6fbf", "#ffe3f2");
      break;
    case "starlight": {
      const tw = 0.5 + 0.5 * Math.sin(time * 5 + t * 9);
      mix("#7fa6ff", "#fff4cf");
      out[0] = lerp(out[0], 255, tw * 0.25);
      out[1] = lerp(out[1], 255, tw * 0.25);
      out[2] = lerp(out[2], 255, tw * 0.25);
      break;
    }
    case "prism": {
      const h = ((time * 90 + t * 300) % 360) / 60;
      const x = 1 - Math.abs((h % 2) - 1);
      const seg = Math.floor(h);
      const r = [1, x, 0, 0, x, 1][seg] ?? 1;
      const g = [x, 1, 1, x, 0, 0][seg] ?? 0;
      const b = [0, 0, x, 1, 1, x][seg] ?? 0;
      out[0] = 90 + r * 165;
      out[1] = 90 + g * 165;
      out[2] = 90 + b * 165;
      break;
    }
    default:
      mix("#ff5a2e", "#ffd59a");
  }
  return out;
}

/** Fixed-size particle pool: struct-of-arrays, overwritten round-robin, never reallocated. */
class Particles {
  readonly n = 700;
  x = new Float32Array(this.n);
  y = new Float32Array(this.n);
  vx = new Float32Array(this.n);
  vy = new Float32Array(this.n);
  life = new Float32Array(this.n);
  max = new Float32Array(this.n);
  size = new Float32Array(this.n);
  r = new Uint8Array(this.n);
  g = new Uint8Array(this.n);
  b = new Uint8Array(this.n);
  kind = new Uint8Array(this.n);
  density = 1;
  private next = 0;
  private rnd = mulberry32(99);

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, c: RGB, kind: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.r[i] = c[0];
    this.g[i] = c[1];
    this.b[i] = c[2];
    this.kind[i] = kind;
  }

  burst(x: number, y: number, count: number, speed: number, c: RGB, kind = 0, life = 0.9): void {
    const n = Math.max(1, Math.round(count * this.density));
    for (let k = 0; k < n; k++) {
      const a = this.rnd() * Math.PI * 2;
      const s = speed * (0.35 + this.rnd() * 0.65);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s + speed * 0.3, life * (0.6 + this.rnd() * 0.6), 1.5 + this.rnd() * 2.5, c, kind);
    }
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = this.kind[i];
      if (k === 0) this.vy[i] -= 420 * dt;
      else if (k === 2) {
        this.vx[i] += Math.sin(time * 2 + i) * 18 * dt;
        this.vy[i] += Math.cos(time * 1.7 + i * 0.3) * 18 * dt;
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
  }
}

export interface FrameState {
  spirit: Spirit;
  alpha: number;
  terrain: Terrain;
  weights: number[];
  time: number;
  dt: number;
  aura: Aura;
  holding: boolean;
  reducedMotion: boolean;
  speed: number;
  /** 0..1: the spirit's light. The world dims as it fades. */
  light: number;
  /** 0..3: flow tier, which brightens the trail. */
  tier: number;
  /** World x of the best distance so far, or -1. */
  bestX: number;
  /** Physics frame, for beat-timed hazards. */
  frame: number;
  /** Hazards can hurt (journey and daily, after the tips). */
  hazardsLive: boolean;
  /** 0..1 screen-shake strength from the settings. */
  shake: number;
  /** Full-screen flashes (lightning, beat lifts) allowed. */
  flashes: boolean;
  /** The Starlight Observatory in world space, and how far it has faded in (0 = not here). */
  obsX: number;
  obsY: number;
  obsA: number;
  /** 0..1: how much of the current Surge is left. */
  surge: number;
  /** Perfect-dive streak, which calls the dolphins. */
  streak: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private base = 1;
  scale = 1;
  private camX = 0;
  private camY = 0;
  private ready = false;
  private ridge = new Float32Array(512);
  private sea = new Float32Array(512);
  private seaN = 0;
  private trail = new Float32Array(96);
  private trailHead = 0;
  private trailLen = 0;
  readonly fx = new Particles();
  private texts: { text: string; x: number; y: number; life: number; big: boolean }[] = [];
  private stars: Float32Array;
  private grain: CanvasPattern | null = null;
  private vignette: HTMLCanvasElement | null = null;
  private shake = 0;
  private banner = { text: "", life: 0 };
  private tmp: RGB = [0, 0, 0];
  private tmp2: RGB = [0, 0, 0];
  private zoneTint = 0;
  private horizon = 0.74;
  private glow = 0;
  private waves: { x: number; y: number; life: number }[] = [];
  private moonX = 0;
  private moonY = 0;
  private zoom = 1;
  private punch = 0;
  private bars = 0;
  private barsTarget = 0;
  private bass = 0;
  /** Camera feel: where the spirit sits across the screen, roll, dive and surge shots, dolphin pod fade. */
  private ax = 0.32;
  private roll = 0;
  private tilt = 0;
  private diveK = 0;
  private surgeK = 0;
  private podA = 0;
  private surfer = new Surfer();
  private view: View = { ctx: null as unknown as CanvasRenderingContext2D, w: 1, h: 1, scale: 1, sx: (x) => this.sx(x), sy: (y) => this.sy(y), wx: (x) => this.wx(x) };
  private calls: { text: string; kind: CalloutKind; x: number; y: number; life: number; big: boolean }[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    const r = mulberry32(7);
    this.stars = new Float32Array(170 * 3);
    for (let i = 0; i < 170; i++) {
      this.stars[i * 3] = r();
      this.stars[i * 3 + 1] = r() * 0.6;
      this.stars[i * 3 + 2] = 0.4 + r() * 1.4;
    }
    for (let i = 0; i < 6; i++) this.texts.push({ text: "", x: 0, y: 0, life: 0, big: false });
    for (let i = 0; i < 4; i++) this.waves.push({ x: 0, y: 0, life: 0 });
    for (let i = 0; i < 4; i++) this.calls.push({ text: "", kind: "clean", x: 0, y: 0, life: 0, big: false });
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.w = Math.max(1, cssW);
    this.h = Math.max(1, cssH);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.base = clamp(Math.min(this.h / 820, this.w / 620), 0.5, 1.5);
    this.horizon = this.w < this.h ? 0.66 : 0.74;
    this.moonX = this.w * 0.74;
    this.moonY = this.h * 0.22;
    const g = document.createElement("canvas");
    g.width = g.height = 160;
    const gx = g.getContext("2d")!;
    const img = gx.createImageData(160, 160);
    const r = mulberry32(3);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + r() * 145;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255 * r() * 0.5;
    }
    gx.putImageData(img, 0, 0);
    this.grain = this.ctx.createPattern(g, "repeat");
    const v = document.createElement("canvas");
    v.width = Math.max(1, Math.round(this.w / 4));
    v.height = Math.max(1, Math.round(this.h / 4));
    const vx = v.getContext("2d")!;
    const rg = vx.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.35, v.width / 2, v.height / 2, Math.max(v.width, v.height) * 0.72);
    rg.addColorStop(0, "rgba(0,0,0,0)");
    rg.addColorStop(1, "rgba(0,0,0,0.42)");
    vx.fillStyle = rg;
    vx.fillRect(0, 0, v.width, v.height);
    this.vignette = v;
  }

  pushTrail(x: number, y: number): void {
    this.trail[this.trailHead * 2] = x;
    this.trail[this.trailHead * 2 + 1] = y;
    this.trailHead = (this.trailHead + 1) % 48;
    if (this.trailLen < 48) this.trailLen++;
  }

  resetTrail(): void {
    this.trailLen = 0;
    this.ready = false;
    for (const t of this.texts) t.life = 0;
    for (const w of this.waves) w.life = 0;
    for (const c of this.calls) c.life = 0;
    this.barsTarget = 0;
    this.surfer.reset();
  }

  /** A wipe-out: the rider bursts into glowing shards. */
  shatter(x: number, y: number, rgb: [number, number, number]): void {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + Math.random() * 0.3;
      const sp = 260 + Math.random() * 420;
      this.fx.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp + 180, 0.8 + Math.random() * 0.6, 4 + Math.random() * 5, rgb, 3);
    }
    this.kick(0.6);
    this.punchIn(0.08);
  }

  /** Letterbox bars for LOCKED IN. */
  setCinema(on: boolean): void {
    this.barsTarget = on ? 1 : 0;
  }

  /** 0..1 bass loudness: the waves breathe with it. */
  setBass(level: number): void {
    this.bass = level;
  }

  /** A quick zoom-in that settles back, for impact. */
  punchIn(amount: number): void {
    this.punch = Math.max(this.punch, amount);
  }

  callout(text: string, kind: CalloutKind, x: number, y: number, big = false): void {
    let slot = this.calls[0];
    for (const c of this.calls) if (c.life < slot.life) slot = c;
    slot.text = text;
    slot.kind = kind;
    slot.x = x;
    slot.y = y;
    slot.big = big;
    slot.life = big ? 1.6 : 1.2;
  }

  popup(text: string, x: number, y: number, big = false): void {
    let slot = this.texts[0];
    for (const t of this.texts) if (t.life < slot.life) slot = t;
    slot.text = text;
    slot.x = x;
    slot.y = y;
    slot.life = big ? 1.8 : 1.4;
    slot.big = big;
  }

  showBanner(text: string): void {
    this.banner.text = text;
    this.banner.life = 3.6;
  }

  setZone(zone: number): void {
    this.zoneTint = zone;
  }

  /** A quick sideways lean of the whole picture, settling back: landings and wipe-outs. */
  swing(amount: number): void {
    this.tilt = Math.max(-0.08, Math.min(0.08, this.tilt + amount));
  }

  kick(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  /** A perfect dive: a ring of light runs out across the water and the sea glows for a moment. */
  pulse(x: number, y: number, strength: number): void {
    let slot = this.waves[0];
    for (const w of this.waves) if (w.life < slot.life) slot = w;
    slot.x = x;
    slot.y = y;
    slot.life = 1;
    this.glow = Math.min(1.4, this.glow + strength);
  }

  sx(x: number): number {
    return (x - this.camX) * this.scale + this.w * this.ax;
  }

  sy(y: number): number {
    return this.h * this.horizon - (y - this.camY) * this.scale;
  }

  wx(sx: number): number {
    return (sx - this.w * this.ax) / this.scale + this.camX;
  }

  draw(f: FrameState): void {
    const { ctx, w, h } = this;
    const s = f.spirit;
    const px = lerp(s.px, s.x, f.alpha);
    const py = lerp(s.py, s.y, f.alpha);
    const ground = f.terrain.height(px);
    const alt = Math.max(0, py - ground);
    // Close by default. Height and speed ease it back gently; a dive pushes in, a Surge pulls out
    // and LOCKED IN slowly pushes in with a drifting lean. Impacts punch it in for a moment.
    const k = this.ready ? 1 - Math.exp(-f.dt * 3) : 1;
    const ease = (v: number, target: number, rate: number) => v + (target - v) * (this.ready ? 1 - Math.exp(-f.dt * rate) : 1);
    this.diveK = ease(this.diveK, f.holding && f.spirit.grounded ? 1 : 0, 5);
    this.surgeK = ease(this.surgeK, f.surge, 6);
    const speedZoom = 1 / (1 + Math.max(0, f.speed - 1500) / 7000);
    const shot = 1 + 0.1 * this.diveK + 0.07 * this.bars - 0.1 * this.surgeK;
    const targetZoom = clamp((700 / (alt + 700)) * speedZoom, 0.34, 1);
    this.zoom = lerp(this.zoom, clamp(this.base * 1.28, 0.6, 1.5) * targetZoom * shot, k);
    // Look ahead: the faster you go, the further left the spirit sits.
    const speedN = clamp((f.speed - 500) / 2000, 0, 1);
    this.ax = ease(this.ax, 0.34 - 0.11 * speedN - 0.03 * this.surgeK, 2);
    // Roll with the path, a lean kicked by impacts, and a slow drift while LOCKED IN.
    const path = Math.atan2(f.spirit.vy, f.spirit.vx);
    const rollTarget = f.reducedMotion ? 0 : clamp(path * 0.16 + this.tilt + Math.sin(f.time * 0.45) * 0.035 * this.bars, -0.08, 0.08);
    this.roll = ease(this.roll, rollTarget, 3.2);
    this.tilt *= Math.exp(-f.dt * 2.4);
    this.punch = Math.max(0, this.punch - f.dt * 0.35);
    this.scale = this.zoom * (1 + (f.reducedMotion ? 0 : this.punch));
    this.bars += (this.barsTarget - this.bars) * (1 - Math.exp(-f.dt * 5));
    this.camX = px;
    const depth = Math.max(0, ground - py);
    const lead = clamp(f.spirit.vy * 0.11, -150, 150);
    const targetY = ground + Math.max(0, alt - 2200) * 0.85 - depth * 0.85 + lead;
    this.camY = this.ready ? lerp(this.camY, targetY, 1 - Math.exp(-f.dt * 4)) : targetY;
    this.ready = true;
    this.fx.update(f.dt, f.time);
    this.glow = Math.max(0, this.glow - f.dt * 1.2);
    const wt = f.weights;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.shake > 0 && !f.reducedMotion && f.shake > 0) {
      const a = this.shake * 6 * f.shake;
      ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    }
    this.shake = Math.max(0, this.shake - f.dt * 3);

    // The world layers roll about the middle of the screen; the scale keeps the corners covered.
    ctx.save();
    if (Math.abs(this.roll) > 0.0005) {
      const r = Math.abs(this.roll);
      const cover = Math.max(Math.cos(r) + (w / h) * Math.sin(r), Math.cos(r) + (h / w) * Math.sin(r));
      ctx.translate(w / 2, h / 2);
      ctx.rotate(this.roll);
      ctx.scale(cover, cover);
      ctx.translate(-w / 2, -h / 2);
    }
    this.sky(f, wt);
    this.mountains(wt);
    this.view.ctx = ctx;
    this.view.w = w;
    this.view.h = h;
    this.view.scale = this.scale;
    birds(this.view, f.time, wt[3] + wt[4] > 0.5);
    if (f.obsA > 0) observatory(this.view, f.obsX, f.obsY, f.time, f.obsA);
    this.bestMarker(f);
    this.ringsLayer(f);
    this.seaLayer(f, wt);
    this.underwater(f, wt);
    this.view.ctx = ctx;
    this.view.w = w;
    this.view.h = h;
    this.view.scale = this.scale;
    caustics(this.view, f.terrain, f.time, f.spirit.under);
    abyss(this.view, f.terrain, f.time);
    hazards(this.view, f.terrain, f.frame, f.hazardsLive);
    props(this.view, f.terrain, f.time);
    this.podA = ease(this.podA, f.streak >= 3 ? 1 : 0, f.streak >= 3 ? 1.2 : 0.6);
    if (this.podA > 0.02) pod(this.view, f.terrain, px, f.time, this.podA);
    this.trailLayer(f, px, py);
    this.particlesLayer(f, wt);
    this.spiritLayer(f, px, py);
    this.weatherLayer(f, wt);
    this.textLayer(f);
    ctx.restore();
    this.bannerLayer(f);

    const paperish = wt[TW] + wt[PAPER];
    if (this.grain && paperish > 0.01) {
      ctx.globalAlpha = 0.09 * paperish;
      ctx.fillStyle = this.grain;
      ctx.fillRect(-20, -20, w + 40, h + 40);
      ctx.globalAlpha = 1;
    }
    // As the light fades, the night closes in.
    if (f.light < 0.999) {
      ctx.fillStyle = `rgba(4,4,16,${(1 - f.light) * 0.5})`;
      ctx.fillRect(-20, -20, w + 40, h + 40);
    }
    // A soft lift of light on every beat, stronger when the music is locked in.
    if (!f.reducedMotion && f.flashes) {
      const ph = (f.frame % 41) / 41;
      const beat = Math.max(0, 1 - ph * 5);
      if (beat > 0) {
        ctx.fillStyle = `rgba(255,255,255,${beat * (0.025 + this.bars * 0.05)})`;
        ctx.fillRect(-20, -20, w + 40, h + 40);
      }
    }
    if (f.spirit.under) {
      ctx.fillStyle = "rgba(0,30,60,0.22)";
      ctx.fillRect(-20, -20, w + 40, h + 40);
    }
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, w, h);
    if (this.bars > 0.005) {
      const bh = h * 0.085 * this.bars;
      ctx.fillStyle = "#000";
      ctx.fillRect(-20, -20, w + 40, bh + 20);
      ctx.fillRect(-20, h - bh, w + 40, bh + 20);
    }
  }

  private sky(f: FrameState, wt: number[]): void {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.8);
    g.addColorStop(0, css(mixPal(wt, (p) => p.skyTop, this.tmp)));
    g.addColorStop(1, css(mixPal(wt, (p) => p.skyBot, this.tmp)));
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    const night = wt[MOON] + wt[AUR] * 0.9 + wt[TW] * 0.35 + wt[INK] * 0.05;
    if (night > 0.01) {
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 170; i++) {
        const tw = 0.55 + 0.45 * Math.sin(f.time * (1 + (i % 5) * 0.4) + i);
        ctx.globalAlpha = night * tw * 0.9;
        const x = (((this.stars[i * 3] * w - this.camX * 0.01) % w) + w) % w;
        const sz = this.stars[i * 3 + 2];
        ctx.fillRect(x, this.stars[i * 3 + 1] * h, sz, sz);
      }
      ctx.globalAlpha = 1;
      // A shooting star every few seconds, never two at once.
      const period = 6.3;
      const n = Math.floor(f.time / period);
      const ph = (f.time % period) / 0.9;
      if (ph < 1 && !f.reducedMotion) {
        const sx = w * (0.15 + hash(n) * 0.6);
        const sy = h * (0.05 + hash(n + 9) * 0.18);
        const len = 160 + hash(n + 3) * 120;
        const hx = sx + len * ph;
        const hy = sy + len * 0.35 * ph;
        const tg = ctx.createLinearGradient(hx, hy, hx - 90, hy - 32);
        tg.addColorStop(0, `rgba(255,255,255,${night * (1 - ph)})`);
        tg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = tg;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - 90, hy - 32);
        ctx.stroke();
      }
    }

    // Aurora curtains: slow green and violet bands breathing across the sky.
    if (wt[AUR] > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      for (let band = 0; band < 3; band++) {
        const top = h * (0.08 + band * 0.07);
        const col = band === 1 ? "197,155,255" : "120,255,200";
        const g2 = ctx.createLinearGradient(0, top - 20, 0, top + h * 0.22);
        g2.addColorStop(0, `rgba(${col},0)`);
        g2.addColorStop(0.35, `rgba(${col},${0.22 * wt[AUR]})`);
        g2.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g2;
        ctx.beginPath();
        const step = 24;
        for (let x = -step; x <= w + step; x += step) {
          const y = top + Math.sin(x * 0.006 + f.time * 0.25 + band * 2) * 26 + Math.sin(x * 0.017 - f.time * 0.4 + band) * 10;
          if (x === -step) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let x = w + step; x >= -step; x -= step) {
          const y = top + h * 0.2 + Math.sin(x * 0.005 + f.time * 0.2 + band) * 30;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // The moon at night, a paper sun at dawn, both with a soft halo.
    const mx = this.moonX;
    const my = this.moonY;
    const moon = wt[TW] * 0.8 + wt[MOON] + wt[AUR] * 0.6;
    if (moon > 0.01) {
      const r = Math.min(w, h) * 0.06;
      const silver = wt[MOON] + wt[AUR] > wt[TW];
      const pulse = 1 + 0.06 * Math.sin(f.time * 0.8);
      const mg = ctx.createRadialGradient(mx, my, r * 0.5, mx, my, r * 4.2 * pulse);
      mg.addColorStop(0, silver ? "rgba(214,232,255,0.42)" : "rgba(255,236,214,0.42)");
      mg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = moon;
      ctx.fillStyle = mg;
      ctx.fillRect(mx - r * 5, my - r * 5, r * 10, r * 10);
      ctx.fillStyle = silver ? "#eef5ff" : "#fff1e2";
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = silver ? "rgba(150,170,205,0.22)" : "rgba(220,170,150,0.2)";
      ctx.beginPath();
      ctx.arc(mx - r * 0.3, my - r * 0.2, r * 0.22, 0, Math.PI * 2);
      ctx.arc(mx + r * 0.32, my + r * 0.28, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (wt[PAPER] > 0.01) {
      const r = Math.min(w, h) * 0.11;
      ctx.globalAlpha = wt[PAPER];
      const cols = ["#ffe3a8", "#ffd27a", "#ffbe55", "#ffa83d"];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = "rgba(120,50,20,0.18)";
        ctx.beginPath();
        ctx.arc(mx + 4, my + 6, r * (1 - i * 0.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.arc(mx, my, r * (1 - i * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const cw = wt[TW] + wt[PAPER] + wt[INK] * 0.6 + wt[MOON] * 0.25;
    if (cw > 0.01) {
      for (let i = 0; i < 6; i++) {
        const span = w + 400;
        const cx = (((i * 337 + 90 - this.camX * 0.04 - f.time * 6) % span) + span) % span - 200;
        const cy = h * (0.12 + ((i * 53) % 30) / 100);
        const r = 30 + ((i * 71) % 40);
        if (wt[PAPER] > 0.01) {
          ctx.globalAlpha = wt[PAPER];
          ctx.fillStyle = "rgba(140,60,30,0.16)";
          this.puff(cx + 5, cy + 7, r);
          ctx.fillStyle = "#fff6e6";
          this.puff(cx, cy, r);
        }
        const soft = wt[TW] + wt[INK] * 0.6 + wt[MOON] * 0.25;
        if (soft > 0.01) {
          ctx.globalAlpha = soft * 0.3;
          ctx.fillStyle = wt[INK] > wt[TW] ? "#9aa1ab" : wt[MOON] > wt[TW] ? "#3b4f7a" : "#f6c9c0";
          this.puff(cx, cy, r * 1.2);
          ctx.globalAlpha = soft * 0.16;
          this.puff(cx + 6, cy - 4, r * 1.4);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  private puff(x: number, y: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 0.9, y + r * 0.15, r * 0.75, 0, Math.PI * 2);
    ctx.arc(x - r * 0.9, y + r * 0.2, r * 0.65, 0, Math.PI * 2);
    ctx.fill();
  }

  private mountains(wt: number[]): void {
    const { ctx, w, h } = this;
    const step = 12;
    const n = Math.min(255, Math.ceil(w / step) + 2);
    const ms = lerp(1, this.scale / this.base, 0.35);
    const parallax = [0.06, 0.14, 0.28];
    for (let layer = 0; layer < 3; layer++) {
      const amp = h * (0.2 - layer * 0.035) * ms;
      const baseY = h * (0.5 + layer * 0.07) + (1 - ms) * h * 0.08;
      const off = this.camX * parallax[layer] * 0.6;
      const seed = layer * 1.7;
      for (let i = 0; i < n; i++) {
        const x = i * step;
        const u = (x + off) / (380 - layer * 60);
        const y = baseY - amp * (0.55 + 0.3 * Math.sin(u + seed) + 0.12 * Math.sin(u * 2.3 + seed * 2) + 0.05 * Math.sin(u * 5.1));
        this.ridge[i * 2] = x;
        this.ridge[i * 2 + 1] = y;
      }
      const col = mixPal(wt, (p) => p.m[layer], this.tmp);
      const sky = mixPal(wt, (p) => p.skyBot, this.tmp2);
      const fillRidge = (dx: number, dy: number) => {
        ctx.beginPath();
        ctx.moveTo(this.ridge[0] + dx, h + 10);
        for (let i = 0; i < n; i++) ctx.lineTo(this.ridge[i * 2] + dx, this.ridge[i * 2 + 1] + dy);
        ctx.lineTo(this.ridge[(n - 1) * 2] + dx, h + 10);
        ctx.closePath();
        ctx.fill();
      };
      const strokeRidge = (dy = 0) => {
        ctx.beginPath();
        for (let i = 0; i < n; i++) ctx[i ? "lineTo" : "moveTo"](this.ridge[i * 2], this.ridge[i * 2 + 1] + dy);
        ctx.stroke();
      };
      // Atmospheric haze: the far range sits closer to the colour of the sky.
      const haze = (2 - layer) * 0.18;
      if (wt[TW] > 0.01) {
        ctx.fillStyle = css(col, 0.42 * wt[TW]);
        fillRidge(0, 0);
        fillRidge(-3, 5);
        fillRidge(4, 10);
        ctx.strokeStyle = css(col, 0.35 * wt[TW]);
        ctx.lineWidth = 2;
        strokeRidge(1);
      }
      const glowy = wt[MOON] + wt[AUR];
      if (glowy > 0.01) {
        ctx.fillStyle = css(col, glowy);
        fillRidge(0, 0);
        if (haze > 0) {
          ctx.fillStyle = css(sky, haze * glowy * 0.6);
          fillRidge(0, 0);
        }
        ctx.globalCompositeOperation = "lighter";
        for (const [i, wgt] of [
          [MOON, wt[MOON]],
          [AUR, wt[AUR]],
        ] as const) {
          if (wgt < 0.01) continue;
          const glow = layer === 2 ? PAL[i].line : PAL[i].accent;
          ctx.strokeStyle = css(glow, 0.1 * wgt);
          ctx.lineWidth = 8;
          strokeRidge();
          ctx.strokeStyle = css(glow, (0.25 + layer * 0.15) * wgt);
          ctx.lineWidth = 1.3;
          strokeRidge();
        }
        ctx.globalCompositeOperation = "source-over";
      }
      if (wt[PAPER] > 0.01) {
        ctx.fillStyle = `rgba(70,20,15,${0.26 * wt[PAPER]})`;
        fillRidge(6, 8);
        ctx.fillStyle = css(col, wt[PAPER]);
        fillRidge(0, 0);
      }
      if (wt[INK] > 0.01) {
        let top = h;
        for (let i = 0; i < n; i++) top = Math.min(top, this.ridge[i * 2 + 1]);
        const g = ctx.createLinearGradient(0, top, 0, top + h * 0.32);
        g.addColorStop(0, css(col, 0.95 * wt[INK]));
        g.addColorStop(1, css(sky, 0));
        ctx.fillStyle = g;
        fillRidge(0, 0);
        ctx.strokeStyle = css(col, 0.9 * wt[INK]);
        ctx.lineWidth = 3 - layer * 0.6;
        strokeRidge();
      }
    }
  }

  private bestMarker(f: FrameState): void {
    if (f.bestX <= 0) return;
    const x = this.sx(f.bestX);
    if (x < -40 || x > this.w + 40) return;
    const { ctx, h } = this;
    const top = this.sy(f.terrain.height(f.bestX));
    const g = ctx.createLinearGradient(0, 0, 0, top);
    g.addColorStop(0, "rgba(255,230,170,0)");
    g.addColorStop(1, "rgba(255,230,170,0.35)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 3, 0, 6, top);
    ctx.fillStyle = "rgba(255,240,210,0.85)";
    ctx.font = "600 11px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BEST", x, Math.min(top - 10, h * 0.3));
    ctx.textAlign = "start";
  }

  private seaLayer(f: FrameState, wt: number[]): void {
    const { ctx, w, h } = this;
    const step = 6;
    const n = Math.min(255, Math.ceil(w / step) + 2);
    this.seaN = n;
    const calm = f.reducedMotion ? 0.3 : 1;
    for (let i = 0; i < n; i++) {
      const x = i * step - 4;
      const wx = this.wx(x);
      // Visual-only ripples ride on top of the physics surface.
      const ripple = (Math.sin(wx * 0.045 + f.time * 2.1) * 1.3 + Math.sin(wx * 0.011 - f.time * 1.2) * 1.9) * calm * (1 + this.bass * 3.5);
      this.sea[i * 2] = x;
      this.sea[i * 2 + 1] = this.sy(f.terrain.height(wx)) + ripple;
    }
    let top = h;
    for (let i = 0; i < n; i++) top = Math.min(top, this.sea[i * 2 + 1]);
    const path = (dy: number) => {
      ctx.beginPath();
      ctx.moveTo(this.sea[0], h + 10);
      for (let i = 0; i < n; i++) ctx.lineTo(this.sea[i * 2], this.sea[i * 2 + 1] + dy);
      ctx.lineTo(this.sea[(n - 1) * 2], h + 10);
      ctx.closePath();
    };
    const edge = (dy: number) => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx[i ? "lineTo" : "moveTo"](this.sea[i * 2], this.sea[i * 2 + 1] + dy);
      ctx.stroke();
    };

    if (wt[PAPER] > 0.01) {
      ctx.fillStyle = `rgba(20,30,30,${0.3 * wt[PAPER]})`;
      path(-7);
      ctx.fill();
    }
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, css(mixPal(wt, (p) => p.seaTop, this.tmp)));
    g.addColorStop(1, css(mixPal(wt, (p) => p.seaBot, this.tmp)));
    ctx.fillStyle = g;
    path(0);
    ctx.fill();

    // Moon or sun on the water: a column of broken light under it.
    const refl = wt[TW] * 0.5 + wt[MOON] + wt[AUR] * 0.5 + wt[PAPER] * 0.6;
    if (refl > 0.01) {
      const mx = this.moonX;
      const idx = clamp(Math.round((mx + 4) / step), 0, n - 1);
      const surf = this.sea[idx * 2 + 1];
      ctx.globalCompositeOperation = "lighter";
      const c = wt[PAPER] > 0.5 ? "255,200,120" : wt[MOON] + wt[AUR] > wt[TW] ? "200,225,255" : "255,225,200";
      for (let i = 0; i < 16; i++) {
        const y = surf + 8 + i * 9;
        if (y > h) break;
        const wob = Math.sin(f.time * 1.7 + i * 1.3) * 10;
        const len = (36 - i * 1.6) * (0.6 + 0.4 * Math.sin(f.time * 2.3 + i));
        ctx.fillStyle = `rgba(${c},${refl * 0.22 * (1 - i / 16)})`;
        ctx.fillRect(mx + wob - len / 2, y, len, 2);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    const line = mixPal(wt, (p) => p.line, this.tmp);
    const tint = ZONE_TINT[this.zoneTint];
    for (let c = 0; c < 3; c++) line[c] = lerp(line[c], tint[c], 0.22);
    const lift = this.glow + this.bass * 0.5;

    ctx.strokeStyle = css(line, 0.18);
    ctx.lineWidth = 2;
    edge(24 * this.scale + 10);
    ctx.strokeStyle = css(line, 0.08);
    edge(60 * this.scale + 22);

    if (wt[TW] > 0.01) {
      ctx.strokeStyle = css(line, 0.9 * wt[TW]);
      ctx.lineWidth = 2.5;
      edge(0);
      ctx.strokeStyle = css(line, 0.35 * wt[TW]);
      ctx.lineWidth = 6;
      edge(4);
    }
    const glowy = wt[MOON] + wt[AUR];
    if (glowy > 0.01 || lift > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = css(line, 0.12 * glowy + 0.14 * lift);
      ctx.lineWidth = 14 + lift * 10;
      edge(0);
      ctx.strokeStyle = css(line, 0.35 * glowy + 0.3 * lift);
      ctx.lineWidth = 5;
      edge(0);
      ctx.strokeStyle = css(line, Math.min(1, glowy + lift * 0.5));
      ctx.lineWidth = 1.6;
      edge(0);
      ctx.globalCompositeOperation = "source-over";
    }
    if (wt[PAPER] > 0.01) {
      ctx.strokeStyle = css(line, wt[PAPER]);
      ctx.lineWidth = 3;
      edge(0);
    }
    if (wt[INK] > 0.01) {
      ctx.strokeStyle = css(line, 0.85 * wt[INK]);
      ctx.lineCap = "round";
      for (let i = 0; i + 2 < n; i += 2) {
        ctx.lineWidth = 1.5 + 2.5 * (0.5 + 0.5 * Math.sin(i * 0.37 + this.camX * 0.002));
        ctx.beginPath();
        ctx.moveTo(this.sea[i * 2], this.sea[i * 2 + 1]);
        ctx.lineTo(this.sea[(i + 2) * 2], this.sea[(i + 2) * 2 + 1]);
        ctx.stroke();
      }
      ctx.lineCap = "butt";
    }

    // Perfect-dive rings running out across the water.
    for (const wv of this.waves) {
      if (wv.life <= 0) continue;
      wv.life -= f.dt * 1.1;
      const t = 1 - Math.max(0, wv.life);
      ctx.strokeStyle = css(line, 0.6 * Math.max(0, wv.life));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.sx(wv.x), this.sy(wv.y) + 4, 20 + t * 220 * this.scale, 4 + t * 26 * this.scale, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Glowing plankton drifting below the surface. */
  private underwater(f: FrameState, wt: number[]): void {
    const amount = (wt[TW] * 0.4 + wt[MOON] + wt[AUR] + wt[INK] * 0.15 + wt[PAPER] * 0.1) * this.fx.density;
    if (amount < 0.02 || this.seaN === 0) return;
    const { ctx, w, h } = this;
    const step = 6;
    ctx.globalCompositeOperation = "lighter";
    const c = wt[AUR] > 0.4 ? "140,255,210" : wt[MOON] > 0.4 ? "170,210,255" : "180,255,235";
    for (let i = 0; i < 46; i++) {
      const span = w + 60;
      const x = (((hash(i) * span - this.camX * (0.4 + hash(i + 50) * 0.5) * this.scale + f.time * 8) % span) + span) % span - 30;
      const idx = clamp(Math.round((x + 4) / step), 0, this.seaN - 1);
      const surf = this.sea[idx * 2 + 1];
      const room = Math.max(30, h - surf - 30);
      const depth = 20 + hash(i + 7) * room;
      const y = surf + depth + Math.sin(f.time * 0.6 + i) * 6;
      if (y > h) continue;
      const tw = 0.5 + 0.5 * Math.sin(f.time * (0.8 + hash(i + 3)) + i * 2);
      const a = amount * tw * Math.max(0, 1 - depth / (room + 40)) * 0.55;
      ctx.fillStyle = `rgba(${c},${a * 0.3})`;
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = `rgba(${c},${a})`;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private ringsLayer(f: FrameState): void {
    const { ctx } = this;
    const from = Math.floor(this.wx(-100) / RING_CHUNK);
    const to = Math.floor(this.wx(this.w + 100) / RING_CHUNK);
    const accent = mixPal(f.weights, (p) => p.accent, this.tmp);
    for (let c = Math.max(0, from); c <= to; c++) {
      for (const r of f.terrain.rings(c)) {
        if (r.taken) continue;
        const split = r.splitAt >= 0;
        const off = split ? Math.min(80, (f.frame - r.splitAt) * 4) : 0;
        for (const sign of split ? [1, -1] : [0]) {
        const x = this.sx(r.x);
        const y = this.sy(r.y + sign * off);
        const breathe = 1 + 0.05 * Math.sin(f.time * 3 + r.x);
        const rad = r.r * this.scale * breathe * (split ? 0.7 : 1);
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = css(accent, 0.18);
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = css(accent, 0.95);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = css(accent, 0.9);
        for (let i = 0; i < 3; i++) {
          const a = f.time * 1.4 + (i * Math.PI * 2) / 3;
          ctx.fillRect(x + Math.cos(a) * rad - 1.5, y + Math.sin(a) * rad - 1.5, 3, 3);
        }
        }
      }
    }
  }

  private trailLayer(f: FrameState, px: number, py: number): void {
    const { ctx } = this;
    if (this.trailLen < 2) return;
    // The trail answers how you move: faster is wider, higher tiers burn brighter.
    const sp = clamp(f.speed / 1600, 0.35, 1.3);
    const wide = (f.aura === "comet" ? 1.7 : 1) * sp * (1 + f.tier * 0.15);
    const bright = (0.55 + f.tier * 0.15) * (0.5 + 0.5 * f.light);
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = f.weights[PAPER] > 0.5 ? "source-over" : "lighter";
    let lx = 0;
    let ly = 0;
    for (let i = 0; i <= this.trailLen; i++) {
      let x: number;
      let y: number;
      if (i === this.trailLen) {
        x = px;
        y = py;
      } else {
        const idx = (this.trailHead - this.trailLen + i + 48) % 48;
        x = this.trail[idx * 2];
        y = this.trail[idx * 2 + 1];
      }
      const sx = this.sx(x);
      const sy = this.sy(y);
      if (i > 0) {
        const t = i / this.trailLen;
        const c = auraColor(f.aura, t, f.time, this.tmp);
        const flicker = f.aura === "moth" ? 0.6 + 0.4 * Math.sin(f.time * 20 + i) : 1;
        ctx.strokeStyle = css(c, Math.min(1, t * bright * flicker));
        ctx.lineWidth = Math.max(1, 12 * t * wide * clamp(this.scale, 0.45, 1.3));
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
      lx = sx;
      ly = sy;
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "butt";
  }

  private particlesLayer(f: FrameState, wt: number[]): void {
    const { ctx, fx } = this;
    const ff = (wt[MOON] + wt[AUR] + wt[TW] * 0.3) * fx.density;
    if (ff > 0.05 && Math.random() < ff * 0.45) {
      const x = this.wx(Math.random() * this.w);
      const y = f.terrain.height(x) + 40 + Math.random() * 380;
      if (wt[TW] > wt[MOON] + wt[AUR]) {
        this.tmp2[0] = 255;
        this.tmp2[1] = 220;
        this.tmp2[2] = 150;
      } else {
        this.tmp2[0] = 170;
        this.tmp2[1] = 255;
        this.tmp2[2] = 215;
      }
      fx.spawn(x, y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 3 + Math.random() * 3, 2, this.tmp2, 2);
    }
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < fx.n; i++) {
      if (fx.life[i] <= 0) continue;
      const x = this.sx(fx.x[i]);
      const y = this.sy(fx.y[i]);
      if (x < -40 || x > this.w + 40 || y < -40 || y > this.h + 40) continue;
      const t = fx.life[i] / fx.max[i];
      const k = fx.kind[i];
      const col = `rgba(${fx.r[i]},${fx.g[i]},${fx.b[i]},`;
      if (k === 1) {
        ctx.strokeStyle = col + t * 0.6 + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, (1 - t) * 60 * this.scale + 4, (1 - t) * 14 * this.scale + 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (k === 2) {
        const a = Math.min(1, t * 3) * Math.min(1, (1 - t) * 4);
        ctx.fillStyle = col + a * 0.25 + ")";
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.fillStyle = col + a + ")";
        ctx.fillRect(x - 1, y - 1, 2.5, 2.5);
      } else if (k === 3) {
        const sz = fx.size[i] * (0.6 + t);
        const a = f.time * 9 + i;
        ctx.fillStyle = col + t + ")";
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * sz, y + Math.sin(a) * sz);
        ctx.lineTo(x + Math.cos(a + 2.3) * sz * 0.7, y + Math.sin(a + 2.3) * sz * 0.7);
        ctx.lineTo(x + Math.cos(a + 4) * sz * 0.5, y + Math.sin(a + 4) * sz * 0.5);
        ctx.closePath();
        ctx.fill();
      } else {
        const sz = fx.size[i] * (0.5 + t);
        ctx.fillStyle = col + t + ")";
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private spiritLayer(f: FrameState, px: number, py: number): void {
    const { ctx } = this;
    const s = f.spirit;
    const x = this.sx(px);
    const y = this.sy(py);
    const size = 10 * clamp(this.scale * 1.1, 0.75, 1.5);
    const halo = auraColor(f.aura, 1, f.time, this.tmp2);
    // Low light: the halo shrinks and flickers.
    const flick = f.light < 0.25 ? 0.6 + 0.4 * Math.sin(f.time * 18) : 1;
    const hr = size * (1.6 + 1.8 * f.light) * flick;
    ctx.globalCompositeOperation = f.weights[PAPER] > 0.5 ? "source-over" : "lighter";
    const g = ctx.createRadialGradient(x, y, 0, x, y, hr);
    g.addColorStop(0, css(halo, 0.55 * flick));
    g.addColorStop(1, css(halo, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - hr, y - hr, hr * 2, hr * 2);
    ctx.globalCompositeOperation = "source-over";

    this.surfer.draw(ctx, x, y, s.angle, size, `${halo[0] | 0},${halo[1] | 0},${halo[2] | 0}`, f.holding && !s.grounded && !s.under, s.grounded, s.under, f.speed, f.dt, f.light);
    // Diving: chevrons under the spirit show that your press is pulling it down.
    if (f.holding) {
      const pulse = 0.55 + 0.45 * Math.sin(f.time * 14);
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * pulse})`;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let i = 0; i < 2; i++) {
        const cy = y + size * (2.2 + i * 1.5);
        ctx.globalAlpha = 1 - i * 0.4;
        ctx.beginPath();
        ctx.moveTo(x - size * 1.2, cy);
        ctx.lineTo(x, cy + size * 0.9);
        ctx.lineTo(x + size * 1.2, cy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = "butt";
    }
  }

  private weatherLayer(f: FrameState, wt: number[]): void {
    const { ctx, w, h } = this;
    if (wt[INK] > 0.01) {
      ctx.strokeStyle = `rgba(220,228,236,${0.35 * wt[INK]})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const drops = Math.round(140 * this.fx.density);
      for (let i = 0; i < drops; i++) {
        const sx = (i * 97.3 + f.time * 60 - this.camX * 0.3) % (w + 80);
        const x = sx < 0 ? sx + w + 80 : sx;
        const y = (i * 53.7 + f.time * (700 + (i % 7) * 60)) % (h + 40);
        ctx.moveTo(x - 40, y - 20);
        ctx.lineTo(x - 40 - 7, y + 4);
      }
      ctx.stroke();
      const phase = f.time % 9.7;
      if (phase < 0.18 && !f.reducedMotion && f.flashes) {
        ctx.fillStyle = `rgba(240,244,255,${(0.18 - phase) * 1.6 * wt[INK]})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
    const sp = Math.max((f.speed - 900) / 1300, f.surge * 0.9);
    if (sp > 0 && !f.reducedMotion) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.25, sp * 0.3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const y = ((i * 131.7) % h) * 0.9 + h * 0.05;
        const x = w - ((f.time * 1600 + i * 211) % (w + 300));
        ctx.moveTo(x, y);
        ctx.lineTo(x + 90 + sp * 120, y);
      }
      ctx.stroke();
    }
  }

  private textLayer(f: FrameState): void {
    const { ctx } = this;
    ctx.textAlign = "center";
    for (const t of this.texts) {
      if (t.life <= 0) continue;
      t.life -= f.dt;
      const a = Math.min(1, t.life * 2);
      ctx.font = t.big ? "700 20px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" : "600 15px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillText(t.text, this.sx(t.x), this.sy(t.y) - 30 - ((t.big ? 1.8 : 1.4) - t.life) * 28);
    }
    for (const c of this.calls) {
      if (c.life <= 0) continue;
      c.life -= f.dt;
      const max = c.big ? 1.6 : 1.2;
      const age = max - c.life;
      const pop = 1 + 0.4 * Math.max(0, 1 - age / 0.18);
      const a = Math.min(1, c.life * 2.5);
      const col = c.kind === "clean" ? "159,255,224" : c.kind === "inches" ? "255,210,122" : c.kind === "skill" ? "255,154,208" : "255,255,255";
      ctx.save();
      ctx.translate(this.sx(c.x), this.sy(c.y) - 58 - age * 22);
      ctx.scale(pop, pop);
      ctx.font = c.kind === "lock" ? "800 30px ui-rounded, system-ui, sans-serif" : c.big ? "800 24px ui-rounded, system-ui, sans-serif" : "800 18px ui-rounded, system-ui, sans-serif";
      ctx.letterSpacing = c.kind === "lock" ? "6px" : "1px";
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(0,0,0,${0.35 * a})`;
      ctx.strokeText(c.text, 0, 0);
      ctx.fillStyle = `rgba(${col},${a})`;
      ctx.fillText(c.text, 0, 0);
      ctx.letterSpacing = "0px";
      ctx.restore();
    }
    ctx.textAlign = "start";
  }

  /** The banner stays level, outside the camera roll. */
  private bannerLayer(f: FrameState): void {
    const { ctx, w, h } = this;
    ctx.textAlign = "center";
    if (this.banner.life > 0) {
      this.banner.life -= f.dt;
      const b = this.banner.life;
      const a = Math.min(1, b, (3.6 - b) * 2);
      ctx.font = "500 13px ui-serif, Georgia, serif";
      ctx.fillStyle = `rgba(255,255,255,${a * 0.85})`;
      ctx.letterSpacing = "6px";
      ctx.fillText(this.banner.text.toUpperCase(), w / 2, h * 0.16);
      ctx.letterSpacing = "0px";
    }
    ctx.textAlign = "start";
  }
}
