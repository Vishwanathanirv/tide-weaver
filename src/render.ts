import type { Spirit } from "./physics";
import { RING_CHUNK, type Terrain } from "./terrain";
import type { Aura } from "./save";
import { mulberry32 } from "./rng";

type RGB = [number, number, number];

/**
 * Four art styles that the world drifts through, one per weather cycle:
 * watercolour washes at twilight, neon bioluminescence at midnight, layered paper-cut at dawn
 * and sumi-e ink in the rain. Every layer is drawn per style and blended by weight, so the
 * crossfades are real paint changes, not colour tints.
 */
export const STYLES = ["Watercolour Twilight", "Neon Midnight", "Paper Dawn", "Ink Rain"] as const;

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
  { skyTop: hex("#02030c"), skyBot: hex("#0c1a48"), m: [hex("#0c1436"), hex("#09102c"), hex("#060a20")], seaTop: hex("#06203a"), seaBot: hex("#010409"), line: hex("#3ee6d0"), accent: hex("#9b7bff"), orb: hex("#c9fff8") },
  { skyTop: hex("#ffc27a"), skyBot: hex("#fff0d2"), m: [hex("#f0956b"), hex("#d2654f"), hex("#97404a")], seaTop: hex("#2c7a78"), seaBot: hex("#123d46"), line: hex("#fff7e4"), accent: hex("#ff9f43"), orb: hex("#fffaf0") },
  { skyTop: hex("#252a31"), skyBot: hex("#8d939c"), m: [hex("#5a5f68"), hex("#3b3f46"), hex("#22252a")], seaTop: hex("#2a2f36"), seaBot: hex("#0b0d10"), line: hex("#ece9e1"), accent: hex("#d7e3ee"), orb: hex("#ffffff") },
];

const ZONE_TINT: RGB[] = [hex("#ffd9a0"), hex("#9cefff"), hex("#b9f29d"), hex("#d6a6ff")];

function mixPal(w: readonly number[], pick: (p: Palette) => RGB, out: RGB): RGB {
  out[0] = out[1] = out[2] = 0;
  for (let i = 0; i < 4; i++) {
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
    for (let k = 0; k < count; k++) {
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
      } else if (k === 3) this.vy[i] -= 60 * dt;
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
  private trail = new Float32Array(96);
  private trailHead = 0;
  private trailLen = 0;
  readonly fx = new Particles();
  private texts: { text: string; x: number; y: number; life: number }[] = [];
  private stars: Float32Array;
  private grain: CanvasPattern | null = null;
  private vignette: HTMLCanvasElement | null = null;
  private shake = 0;
  private banner = { text: "", life: 0 };
  private tmp: RGB = [0, 0, 0];
  private tmp2: RGB = [0, 0, 0];
  private zoneTint = 0;
  private horizon = 0.74;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    const r = mulberry32(7);
    this.stars = new Float32Array(160 * 3);
    for (let i = 0; i < 160; i++) {
      this.stars[i * 3] = r();
      this.stars[i * 3 + 1] = r() * 0.62;
      this.stars[i * 3 + 2] = 0.4 + r() * 1.4;
    }
    for (let i = 0; i < 6; i++) this.texts.push({ text: "", x: 0, y: 0, life: 0 });
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.w = Math.max(1, cssW);
    this.h = Math.max(1, cssH);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.base = clamp(Math.min(this.h / 820, this.w / 620), 0.5, 1.5);
    this.horizon = this.w < this.h ? 0.66 : 0.74;
    // Paper grain, made once per size.
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

  get viewWidth(): number {
    return this.w;
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
  }

  popup(text: string, x: number, y: number): void {
    let slot = this.texts[0];
    for (const t of this.texts) if (t.life < slot.life) slot = t;
    slot.text = text;
    slot.x = x;
    slot.y = y;
    slot.life = 1.4;
  }

  showBanner(text: string): void {
    this.banner.text = text;
    this.banner.life = 3.6;
  }

  setZone(zone: number): void {
    this.zoneTint = zone;
  }

  kick(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  private sx(x: number): number {
    return (x - this.camX) * this.scale + this.w * 0.32;
  }

  private sy(y: number): number {
    return this.h * this.horizon - (y - this.camY) * this.scale;
  }

  private wx(sx: number): number {
    return (sx - this.w * 0.32) / this.scale + this.camX;
  }

  draw(f: FrameState): void {
    const { ctx, w, h } = this;
    const s = f.spirit;
    const px = lerp(s.px, s.x, f.alpha);
    const py = lerp(s.py, s.y, f.alpha);
    const ground = f.terrain.height(px);
    const alt = Math.max(0, py - ground);
    const targetZoom = clamp(520 / (alt + 520), 0.16, 1);
    const k = this.ready ? 1 - Math.exp(-f.dt * 3) : 1;
    this.scale = lerp(this.scale, this.base * targetZoom, k);
    this.camX = px;
    const targetY = ground + Math.max(0, alt - 2200) * 0.85;
    this.camY = this.ready ? lerp(this.camY, targetY, 1 - Math.exp(-f.dt * 4)) : targetY;
    this.ready = true;

    this.fx.update(f.dt, f.time);
    const wt = f.weights;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.shake > 0 && !f.reducedMotion) {
      const a = this.shake * 6;
      ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    }
    this.shake = Math.max(0, this.shake - f.dt * 3);

    this.sky(f, wt);
    this.mountains(wt);
    this.ringsLayer(f);
    this.seaLayer(f, wt);
    this.trailLayer(f, px, py);
    this.particlesLayer(f, wt);
    this.spiritLayer(f, px, py);
    this.weatherLayer(f, wt);
    this.textLayer(f);

    if (this.grain && wt[0] + wt[2] > 0.01) {
      ctx.globalAlpha = 0.09 * (wt[0] + wt[2]);
      ctx.fillStyle = this.grain;
      ctx.fillRect(-20, -20, w + 40, h + 40);
      ctx.globalAlpha = 1;
    }
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, w, h);
  }

  private sky(f: FrameState, wt: number[]): void {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.8);
    g.addColorStop(0, css(mixPal(wt, (p) => p.skyTop, this.tmp)));
    g.addColorStop(1, css(mixPal(wt, (p) => p.skyBot, this.tmp)));
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    // Stars: many at midnight, a few at twilight.
    const sw = wt[1] + wt[0] * 0.35 + wt[3] * 0.05;
    if (sw > 0.01) {
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 160; i++) {
        const tw = 0.55 + 0.45 * Math.sin(f.time * (1 + (i % 5) * 0.4) + i);
        ctx.globalAlpha = sw * tw * 0.9;
        const x = ((this.stars[i * 3] * w - this.camX * 0.01) % w + w) % w;
        const sz = this.stars[i * 3 + 2];
        ctx.fillRect(x, this.stars[i * 3 + 1] * h, sz, sz);
      }
      ctx.globalAlpha = 1;
    }

    // Moon at twilight and midnight, a paper sun at dawn.
    const mx = w * 0.74;
    const my = h * 0.24;
    if (wt[0] + wt[1] > 0.01) {
      ctx.globalAlpha = wt[0] * 0.8 + wt[1];
      const r = Math.min(w, h) * 0.06;
      const mg = ctx.createRadialGradient(mx, my, r * 0.2, mx, my, r * 3);
      mg.addColorStop(0, wt[1] > wt[0] ? "rgba(200,255,250,0.5)" : "rgba(255,236,214,0.45)");
      mg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = mg;
      ctx.fillRect(mx - r * 3, my - r * 3, r * 6, r * 6);
      ctx.fillStyle = wt[1] > wt[0] ? "#dffffb" : "#fff1e2";
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (wt[2] > 0.01) {
      const r = Math.min(w, h) * 0.11;
      ctx.globalAlpha = wt[2];
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

    // Drifting clouds: soft washes, or cut paper at dawn.
    const cw = wt[0] + wt[2] + wt[3] * 0.6;
    if (cw > 0.01) {
      for (let i = 0; i < 6; i++) {
        const span = w + 400;
        const cx = ((i * 337 + 90 - this.camX * 0.04 - f.time * 6) % span + span) % span - 200;
        const cy = h * (0.12 + ((i * 53) % 30) / 100);
        const r = 30 + ((i * 71) % 40);
        if (wt[2] > 0.01) {
          ctx.globalAlpha = wt[2];
          ctx.fillStyle = "rgba(140,60,30,0.16)";
          this.puff(cx + 5, cy + 7, r);
          ctx.fillStyle = "#fff6e6";
          this.puff(cx, cy, r);
        }
        const soft = wt[0] + wt[3] * 0.6;
        if (soft > 0.01) {
          ctx.globalAlpha = soft * 0.32;
          ctx.fillStyle = wt[3] > wt[0] ? "#9aa1ab" : "#f6c9c0";
          this.puff(cx, cy, r * 1.2);
          ctx.globalAlpha = soft * 0.18;
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
    const parallax = [0.08, 0.16, 0.28];
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
      // Watercolour: three translucent washes slightly out of register, with a darker wet edge.
      if (wt[0] > 0.01) {
        ctx.fillStyle = css(col, 0.42 * wt[0]);
        fillRidge(0, 0);
        fillRidge(-3, 5);
        fillRidge(4, 10);
        ctx.strokeStyle = css(col, 0.35 * wt[0]);
        ctx.lineWidth = 2;
        strokeRidge(1);
      }
      // Neon: dark solid with a glowing contour.
      if (wt[1] > 0.01) {
        ctx.fillStyle = css(col, wt[1]);
        fillRidge(0, 0);
        const glow = layer === 2 ? PAL[1].line : PAL[1].accent;
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = css(glow, 0.12 * wt[1]);
        ctx.lineWidth = 8;
        strokeRidge();
        ctx.strokeStyle = css(glow, (0.35 + layer * 0.2) * wt[1]);
        ctx.lineWidth = 1.4;
        strokeRidge();
        ctx.globalCompositeOperation = "source-over";
      }
      // Paper-cut: flat colour over a cast shadow.
      if (wt[2] > 0.01) {
        ctx.fillStyle = `rgba(70,20,15,${0.26 * wt[2]})`;
        fillRidge(6, 8);
        ctx.fillStyle = css(col, wt[2]);
        fillRidge(0, 0);
      }
      // Ink: ridge stroke that fades into mist below.
      if (wt[3] > 0.01) {
        let top = h;
        for (let i = 0; i < n; i++) top = Math.min(top, this.ridge[i * 2 + 1]);
        const g = ctx.createLinearGradient(0, top, 0, top + h * 0.32);
        g.addColorStop(0, css(col, 0.95 * wt[3]));
        g.addColorStop(1, css(sky, 0));
        ctx.fillStyle = g;
        fillRidge(0, 0);
        ctx.strokeStyle = css(col, 0.9 * wt[3]);
        ctx.lineWidth = 3 - layer * 0.6;
        strokeRidge();
      }
    }
  }

  private seaLayer(f: FrameState, wt: number[]): void {
    const { ctx, w, h } = this;
    const step = 6;
    const n = Math.min(255, Math.ceil(w / step) + 2);
    for (let i = 0; i < n; i++) {
      const x = i * step - 4;
      this.sea[i * 2] = x;
      this.sea[i * 2 + 1] = this.sy(f.terrain.height(this.wx(x)));
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

    if (wt[2] > 0.01) {
      ctx.fillStyle = `rgba(20,30,30,${0.3 * wt[2]})`;
      path(-7);
      ctx.fill();
    }
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, css(mixPal(wt, (p) => p.seaTop, this.tmp)));
    g.addColorStop(1, css(mixPal(wt, (p) => p.seaBot, this.tmp)));
    ctx.fillStyle = g;
    path(0);
    ctx.fill();

    const line = mixPal(wt, (p) => p.line, this.tmp);
    const tint = ZONE_TINT[this.zoneTint];
    for (let c = 0; c < 3; c++) line[c] = lerp(line[c], tint[c], 0.22);

    // A second, deeper current under the surface.
    ctx.strokeStyle = css(line, 0.18);
    ctx.lineWidth = 2;
    edge(24 * this.scale + 10);
    ctx.strokeStyle = css(line, 0.08);
    edge(60 * this.scale + 22);

    if (wt[0] > 0.01) {
      ctx.strokeStyle = css(line, 0.9 * wt[0]);
      ctx.lineWidth = 2.5;
      edge(0);
      ctx.strokeStyle = css(line, 0.35 * wt[0]);
      ctx.lineWidth = 6;
      edge(4);
    }
    if (wt[1] > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = css(line, 0.12 * wt[1]);
      ctx.lineWidth = 14;
      edge(0);
      ctx.strokeStyle = css(line, 0.35 * wt[1]);
      ctx.lineWidth = 5;
      edge(0);
      ctx.strokeStyle = css(line, wt[1]);
      ctx.lineWidth = 1.6;
      edge(0);
      ctx.globalCompositeOperation = "source-over";
    }
    if (wt[2] > 0.01) {
      ctx.strokeStyle = css(line, wt[2]);
      ctx.lineWidth = 3;
      edge(0);
    }
    if (wt[3] > 0.01) {
      ctx.strokeStyle = css(line, 0.85 * wt[3]);
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
  }

  private ringsLayer(f: FrameState): void {
    const { ctx } = this;
    const from = Math.floor(this.wx(-100) / RING_CHUNK);
    const to = Math.floor(this.wx(this.w + 100) / RING_CHUNK);
    const accent = mixPal(f.weights, (p) => p.accent, this.tmp);
    for (let c = Math.max(0, from); c <= to; c++) {
      for (const r of f.terrain.rings(c)) {
        if (r.taken) continue;
        const x = this.sx(r.x);
        const y = this.sy(r.y);
        const rad = r.r * this.scale;
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

  private trailLayer(f: FrameState, px: number, py: number): void {
    const { ctx } = this;
    if (this.trailLen < 2) return;
    const wide = f.aura === "comet" ? 1.7 : 1;
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = f.weights[2] > 0.5 ? "source-over" : "lighter";
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
        ctx.strokeStyle = css(c, t * 0.75 * flicker);
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
    // Fireflies drift in at midnight and twilight.
    const ff = wt[1] + wt[0] * 0.3;
    if (ff > 0.05 && Math.random() < ff * 0.5) {
      const x = this.wx(Math.random() * this.w);
      const y = f.terrain.height(x) + 40 + Math.random() * 380;
      this.tmp2[0] = 190;
      this.tmp2[1] = 255;
      this.tmp2[2] = 200;
      if (wt[0] > wt[1]) {
        this.tmp2[0] = 255;
        this.tmp2[1] = 220;
        this.tmp2[2] = 150;
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
    const orb = mixPal(f.weights, (p) => p.orb, this.tmp);
    const halo = auraColor(f.aura, 1, f.time, this.tmp2);
    ctx.globalCompositeOperation = f.weights[2] > 0.5 ? "source-over" : "lighter";
    const g = ctx.createRadialGradient(x, y, 0, x, y, size * 5);
    g.addColorStop(0, css(halo, 0.55));
    g.addColorStop(1, css(halo, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - size * 5, y - size * 5, size * 10, size * 10);
    ctx.globalCompositeOperation = "source-over";

    // Folded-paper wings: open while gliding, tucked while diving.
    const angle = -Math.atan2(s.vy, s.vx);
    const open = f.holding ? 0.15 : s.grounded ? 0.45 : 0.7 + 0.3 * Math.sin(f.time * 9);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = css(orb, 0.85);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-size * 0.4, 0);
      ctx.lineTo(-size * 2.6, side * size * 2.2 * open);
      ctx.lineTo(-size * 1.2, side * size * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = css(orb);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.15, size * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private weatherLayer(f: FrameState, wt: number[]): void {
    const { ctx, w, h } = this;
    // Rain streaks, positions from the clock: no per-drop allocation.
    if (wt[3] > 0.01) {
      ctx.strokeStyle = `rgba(220,228,236,${0.35 * wt[3]})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 140; i++) {
        const sx = (i * 97.3 + f.time * 60 - this.camX * 0.3) % (w + 80);
        const x = sx < 0 ? sx + w + 80 : sx;
        const y = (i * 53.7 + f.time * (700 + (i % 7) * 60)) % (h + 40);
        ctx.moveTo(x - 40, y - 20);
        ctx.lineTo(x - 40 - 7, y + 4);
      }
      ctx.stroke();
      // Lightning: a pale flash every so often.
      const phase = f.time % 9.7;
      if (phase < 0.18 && !f.reducedMotion) {
        ctx.fillStyle = `rgba(240,244,255,${(0.18 - phase) * 1.6 * wt[3]})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
    // Speed lines when the spirit is really flying.
    const sp = (f.speed - 1300) / 1300;
    if (sp > 0 && !f.reducedMotion) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.25, sp * 0.3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const y = ((i * 131.7) % h) * 0.9 + h * 0.05;
        const x = w - ((f.time * 1600 + i * 211) % (w + 300));
        ctx.moveTo(x, y);
        ctx.lineTo(x + 90 + sp * 120, y);
      }
      ctx.stroke();
    }
  }

  private textLayer(f: FrameState): void {
    const { ctx, w, h } = this;
    ctx.textAlign = "center";
    for (const t of this.texts) {
      if (t.life <= 0) continue;
      t.life -= f.dt;
      const a = Math.min(1, t.life * 2);
      ctx.font = "600 15px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillText(t.text, this.sx(t.x), this.sy(t.y) - 30 - (1.4 - t.life) * 28);
    }
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
