import { GATE_HEIGHT, LEV_EVERY, METEOR_SETTLE, RING_CHUNK, WHIRL_R, gateShut, lagoonAt, railY, spikeUp, BEAT_STEPS, type Rail, type Terrain } from "./terrain";

/** What the world layer needs from the camera. */
export interface View {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  scale: number;
  sx(x: number): number;
  sy(y: number): number;
  wx(sx: number): number;
}

function chunks(v: View, fn: (c: number) => void): void {
  const from = Math.max(0, Math.floor(v.wx(-120) / RING_CHUNK));
  const to = Math.floor(v.wx(v.w + 120) / RING_CHUNK);
  for (let c = from; c <= to; c++) fn(c);
}

/** Light rippling across the underside of the surface: strong when you're under, faint otherwise. */
export function caustics(v: View, t: Terrain, time: number, under: boolean): void {
  const { ctx } = v;
  const a = under ? 0.22 : 0.06;
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(170,240,255,${a})`;
  ctx.lineWidth = 2;
  for (let band = 0; band < 5; band++) {
    ctx.beginPath();
    for (let x = -10; x <= v.w + 10; x += 14) {
      const wx = v.wx(x);
      const y = v.sy(t.height(wx)) + 18 + band * 26 * v.scale + Math.sin(wx * 0.02 + time * (1.6 + band * 0.3)) * 6 + Math.sin(wx * 0.007 - time) * 4;
      if (x === -10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

/** Sunken gems and warm jets in the abyss. */
export function abyss(v: View, t: Terrain, time: number): void {
  const { ctx } = v;
  chunks(v, (c) => {
    const ch = t.chunk(c);
    for (const j of ch.jets) {
      const x0 = v.sx(j.x);
      const x1 = v.sx(j.x + j.w);
      if (x1 < -20 || x0 > v.w + 20) continue;
      const top = v.sy(t.height(j.x + j.w / 2));
      const bot = v.sy(t.height(j.x + j.w / 2) - 420);
      const g = ctx.createLinearGradient(0, bot, 0, top);
      g.addColorStop(0, "rgba(255,170,90,0)");
      g.addColorStop(1, "rgba(255,190,120,0.16)");
      ctx.fillStyle = g;
      ctx.fillRect(x0, top, x1 - x0, bot - top);
      ctx.fillStyle = "rgba(255,230,200,0.6)";
      for (let i = 0; i < 9; i++) {
        const bx = x0 + ((i * 37) % Math.max(1, x1 - x0));
        const by = bot - ((time * 140 + i * 53) % Math.max(1, bot - top));
        ctx.beginPath();
        ctx.arc(bx, by, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const gm of ch.gems) {
      if (gm.taken) continue;
      const x = v.sx(gm.x);
      const y = v.sy(gm.y);
      if (x < -30 || x > v.w + 30 || y > v.h + 30) continue;
      const r = 11 * Math.max(0.6, v.scale);
      const spin = Math.sin(time * 2 + gm.x) * 0.5 + 0.5;
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      halo.addColorStop(0, "rgba(140,255,240,0.45)");
      halo.addColorStop(1, "rgba(140,255,240,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#7ff6e4";
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * (0.4 + 0.4 * spin), y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * (0.4 + 0.4 * spin), y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.25 * spin, y - r * 0.2);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
    }
  });
}

/** Obsidian Storm hazards: crystal spikes that rise on the beat and tide gates that slam shut. */
/** A golden bonus gem: what a trap becomes under a Spirit Blessing. */
function blessGem(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, time: number): void {
  const r = 12 * s;
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, "rgba(255,220,130,0.55)");
  g.addColorStop(1, "rgba(255,200,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgb(255,226,140)";
  const k = 0.7 + 0.3 * Math.sin(time * 5 + x);
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.7 * k, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.7 * k, y);
  ctx.closePath();
  ctx.fill();
}

export function hazards(v: View, t: Terrain, frame: number, live: boolean, bless = 0): void {
  const { ctx } = v;
  const a = live ? 1 : 0.35;
  chunks(v, (c) => {
    const ch = t.chunk(c);
    for (const sp of ch.spikes) {
      const x = v.sx(sp.x);
      if (x < -40 || x > v.w + 40) continue;
      if (bless > 0) {
        if (!sp.taken) blessGem(ctx, x, v.sy(t.height(sp.x)) - 22 * v.scale, Math.max(0.6, v.scale), frame / 60);
        continue;
      }
      const base = v.sy(t.height(sp.x));
      const phase = ((frame + sp.phase) % BEAT_STEPS) / BEAT_STEPS;
      const up = spikeUp(sp, frame);
      const hgt = (up ? 46 : 10) * v.scale * (up ? 0.85 + 0.15 * Math.sin(phase * Math.PI * 2) : 1);
      const wdt = 14 * v.scale;
      ctx.fillStyle = `rgba(20,8,26,${a})`;
      ctx.strokeStyle = `rgba(255,60,90,${a * (up ? 0.95 : 0.4)})`;
      ctx.lineWidth = 2;
      for (const [dx, k] of [
        [-wdt * 0.9, 0.7],
        [0, 1],
        [wdt * 0.9, 0.6],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(x + dx - wdt * 0.6, base + 2);
        ctx.lineTo(x + dx, base - hgt * k);
        ctx.lineTo(x + dx + wdt * 0.6, base + 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    for (const g of ch.gates) {
      const x = v.sx(g.x);
      if (x < -40 || x > v.w + 40) continue;
      if (bless > 0) {
        if (!g.taken) blessGem(ctx, x, v.sy(t.height(g.x) + GATE_HEIGHT * 0.4), Math.max(0.6, v.scale), frame / 60);
        continue;
      }
      const base = v.sy(t.height(g.x));
      const top = v.sy(t.height(g.x) + GATE_HEIGHT);
      const shut = gateShut(g, frame);
      const w = 12 * Math.max(0.6, v.scale);
      if (shut) {
        ctx.fillStyle = `rgba(30,6,24,${0.85 * a})`;
        ctx.fillRect(x - w / 2, top, w, base - top);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,50,90,${0.35 * a})`;
        ctx.fillRect(x - w, top, w * 2, base - top);
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = `rgba(255,120,150,${a})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - w / 2, top, w, base - top);
      } else {
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = `rgba(255,120,150,${0.4 * a})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - w / 2, top, w, base - top);
        ctx.setLineDash([]);
      }
    }
  });
}

const hash = (n: number) => {
  const x = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
};

/** Buoys bobbing on the swell with a blinking lamp, one or two per chunk, placed by hash. */
export function props(v: View, t: Terrain, time: number): void {
  const { ctx } = v;
  chunks(v, (c) => {
    const n = hash(c) < 0.55 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const wx = c * RING_CHUNK + 300 + hash(c * 3 + i) * 1400;
      const x = v.sx(wx);
      if (x < -30 || x > v.w + 30) continue;
      const k = t.slope(wx);
      const y = v.sy(t.height(wx)) + Math.sin(time * 2 + wx) * 2;
      const s = Math.max(0.5, v.scale);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.atan(k) * 0.8 + Math.sin(time * 1.6 + wx) * 0.12);
      ctx.fillStyle = "#1a1424";
      ctx.beginPath();
      ctx.moveTo(-9 * s, 0);
      ctx.lineTo(9 * s, 0);
      ctx.lineTo(5 * s, -14 * s);
      ctx.lineTo(-5 * s, -14 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#c2203a";
      ctx.fillRect(-5 * s, -10 * s, 10 * s, 3 * s);
      ctx.fillStyle = "#1a1424";
      ctx.fillRect(-1.2 * s, -26 * s, 2.4 * s, 12 * s);
      const on = Math.sin(time * 3 + wx) > 0.2;
      if (on) {
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(0, -28 * s, 0, 0, -28 * s, 16 * s);
        g.addColorStop(0, "rgba(255,210,120,0.9)");
        g.addColorStop(1, "rgba(255,210,120,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-16 * s, -44 * s, 32 * s, 32 * s);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.fillStyle = on ? "#ffe2a0" : "#5a4a3a";
      ctx.beginPath();
      ctx.arc(0, -28 * s, 2.6 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

/** A loose flock of birds crossing the sky now and then; ink-dark in daylight, pale at night. */
export function birds(v: View, time: number, dark: boolean): void {
  const { ctx } = v;
  const period = 23;
  const n = Math.floor(time / period);
  const ph = (time % period) / 14;
  if (ph > 1) return;
  const y0 = v.h * (0.14 + hash(n) * 0.18);
  ctx.strokeStyle = dark ? "rgba(30,24,40,0.75)" : "rgba(235,235,255,0.6)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const x = v.w * (1.1 - ph * 1.3) + (i % 3) * 22 + Math.floor(i / 3) * 30;
    const y = y0 + (i % 2) * 14 + Math.floor(i / 3) * 9 + Math.sin(time * 3 + i) * 3;
    const flap = Math.sin(time * 9 + i * 1.7) * 4;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - flap);
    ctx.quadraticCurveTo(x - 3, y - 2, x, y);
    ctx.quadraticCurveTo(x + 3, y - 2, x + 7, y - flap);
    ctx.stroke();
  }
}

/** The constellation that circles the observatory: angle offsets and radii, fixed. */
const ORBIT = [0, 0.55, 1.1, 1.5, 2.2, 2.75, 3.3, 3.9, 4.4, 5.0, 5.6];

/**
 * The Starlight Observatory: a floating island with a domed telescope, hidden above the rain
 * clouds. Drawn in world space at (x, y), where y is the island's top; `a` fades it in.
 */
export function observatory(v: View, x: number, y: number, time: number, a: number): void {
  const { ctx } = v;
  const s = v.scale;
  const cx = v.sx(x);
  const cy = v.sy(y);
  const R = 260 * s;
  if (cx < -R * 3 || cx > v.w + R * 3 || cy < -R * 3 || cy > v.h + R * 3) return;
  ctx.save();
  ctx.globalAlpha = a;

  // Halo.
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(cx, cy - R * 0.4, R * 0.1, cx, cy - R * 0.4, R * 2.6);
  halo.addColorStop(0, "rgba(150,180,255,0.32)");
  halo.addColorStop(0.5, "rgba(110,130,230,0.1)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(cx - R * 2.6, cy - R * 3, R * 5.2, R * 5.2);

  // The telescope's beam, slowly sweeping the sky.
  const sweep = -1.05 + Math.sin(time * 0.35) * 0.18;
  const bx = cx + R * 0.22;
  const by = cy - R * 0.62;
  const len = R * 7;
  const spread = 0.07;
  const beam = ctx.createLinearGradient(bx, by, bx + Math.cos(sweep) * len, by + Math.sin(sweep) * len);
  beam.addColorStop(0, "rgba(220,232,255,0.34)");
  beam.addColorStop(1, "rgba(220,232,255,0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + Math.cos(sweep - spread) * len, by + Math.sin(sweep - spread) * len);
  ctx.lineTo(bx + Math.cos(sweep + spread) * len, by + Math.sin(sweep + spread) * len);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // Island: a jagged rock hanging under a flat top, lit from above.
  const bob = Math.sin(time * 0.9) * 8 * s;
  const top = cy + bob;
  ctx.fillStyle = "#1c1f3a";
  ctx.beginPath();
  ctx.moveTo(cx - R, top);
  ctx.lineTo(cx + R, top);
  ctx.lineTo(cx + R * 0.78, top + R * 0.28);
  ctx.lineTo(cx + R * 0.52, top + R * 0.42);
  ctx.lineTo(cx + R * 0.3, top + R * 0.8);
  ctx.lineTo(cx + R * 0.08, top + R * 0.66);
  ctx.lineTo(cx - R * 0.12, top + R * 1.15);
  ctx.lineTo(cx - R * 0.34, top + R * 0.62);
  ctx.lineTo(cx - R * 0.6, top + R * 0.5);
  ctx.lineTo(cx - R * 0.82, top + R * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(170,190,255,0.55)";
  ctx.lineWidth = Math.max(1, 3 * s);
  ctx.beginPath();
  ctx.moveTo(cx - R, top);
  ctx.lineTo(cx + R, top);
  ctx.stroke();

  // Tower and dome.
  const tw = R * 0.5;
  const th = R * 0.34;
  ctx.fillStyle = "#2a2f55";
  ctx.fillRect(cx - tw / 2, top - th, tw, th);
  ctx.fillStyle = "#3a4275";
  ctx.beginPath();
  ctx.arc(cx, top - th, tw * 0.56, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  // Dome slit and the telescope tube following the beam.
  ctx.strokeStyle = "#0d0f22";
  ctx.lineWidth = Math.max(1, 6 * s);
  ctx.beginPath();
  ctx.moveTo(cx, top - th);
  ctx.lineTo(cx + Math.cos(sweep) * tw * 0.56, top - th + Math.sin(sweep) * tw * 0.56);
  ctx.stroke();
  ctx.strokeStyle = "#c9d4ff";
  ctx.lineWidth = Math.max(1.5, 9 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(sweep) * tw * 0.3, top - th + Math.sin(sweep) * tw * 0.3);
  ctx.lineTo(cx + Math.cos(sweep) * tw * 0.85, top - th + Math.sin(sweep) * tw * 0.85);
  ctx.stroke();
  ctx.lineCap = "butt";
  // Warm windows.
  ctx.fillStyle = `rgba(255,214,150,${0.75 + 0.25 * Math.sin(time * 2.1)})`;
  const ww = Math.max(2, 18 * s);
  ctx.fillRect(cx - tw * 0.3, top - th * 0.62, ww, ww * 1.4);
  ctx.fillRect(cx + tw * 0.3 - ww, top - th * 0.62, ww, ww * 1.4);

  // The constellation circling it, joined by faint lines.
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(200,215,255,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < ORBIT.length; i++) {
    const ang = ORBIT[i] + time * 0.12;
    const sx = cx + Math.cos(ang) * R * 1.55;
    const sy = top - R * 0.3 + Math.sin(ang) * R * 0.55;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  ctx.stroke();
  for (let i = 0; i < ORBIT.length; i++) {
    const ang = ORBIT[i] + time * 0.12;
    const sx = cx + Math.cos(ang) * R * 1.55;
    const sy = top - R * 0.3 + Math.sin(ang) * R * 0.55;
    const tw2 = 0.6 + 0.4 * Math.sin(time * 3 + i * 1.7);
    const r = Math.max(1.2, (5 + (i % 3) * 2) * s) * tw2;
    ctx.fillStyle = "rgba(255,248,220,0.9)";
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Hash for per-dolphin variety, stable across frames. */
const dh = (n: number) => {
  const x = Math.sin(n * 91.7 + 13.3) * 24634.6345;
  return x - Math.floor(x);
};

/**
 * A pod of dolphins that races alongside while you hold a streak of perfect dives, leaping from
 * the surface in arcs and splashing back in. Silhouettes with a rim of light; `a` fades the pod.
 */
export function pod(v: View, t: Terrain, spiritX: number, time: number, a: number): void {
  const { ctx } = v;
  for (let i = 0; i < 3; i++) {
    const period = 1.9 + i * 0.43;
    const cycle = time / period + i * 0.37;
    const n = Math.floor(cycle);
    const ph = cycle - n;
    const air = 0.62;
    // They swim a little ahead of you, drifting about so the pod never looks locked to the spirit.
    const lane = 330 + i * 230 + Math.sin(time * 0.6 + i * 2.1) * 70 + (dh(n * 3 + i) - 0.5) * 120;
    const x = spiritX + lane;
    const surface = t.height(x);
    const sx = v.sx(x);
    if (sx < -200 || sx > v.w + 200) continue;
    if (ph > air) continue;
    const u = ph / air;
    const peak = 150 + dh(n + i * 7) * 110;
    const rise = peak * 4 * u * (1 - u);
    const slope = (peak * 4 * (1 - 2 * u)) / 520;
    const ang = Math.atan(slope);
    const y = v.sy(surface + rise - 24);
    const s = v.scale * (0.9 + i * 0.07);
    const fade = a * Math.min(1, u * 8, (1 - u) * 8);

    // Splash rings where it leaves and re-enters the water.
    const edge = Math.min(u, 1 - u);
    if (edge < 0.2) {
      const k = edge / 0.2;
      ctx.strokeStyle = `rgba(210,240,255,${a * (1 - k) * 0.7})`;
      ctx.lineWidth = Math.max(1, 2 * s);
      ctx.beginPath();
      ctx.ellipse(sx, v.sy(surface) + 2, (26 + k * 46) * s, (5 + k * 8) * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(sx, y);
    ctx.rotate(-ang);
    ctx.globalAlpha = fade;
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(52, 2); // beak
    ctx.quadraticCurveTo(40, -3, 30, -12);
    ctx.quadraticCurveTo(6, -22, -22, -14); // back
    ctx.quadraticCurveTo(-44, -8, -58, -2); // tail stock
    ctx.lineTo(-76, -16); // fluke
    ctx.quadraticCurveTo(-68, -3, -66, 1);
    ctx.quadraticCurveTo(-68, 5, -76, 16);
    ctx.lineTo(-58, 3);
    ctx.quadraticCurveTo(-30, 14, 0, 16); // belly
    ctx.quadraticCurveTo(28, 14, 42, 6);
    ctx.closePath();
    ctx.fillStyle = "#2a6f93";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(215,248,255,0.95)";
    ctx.stroke();
    // Dorsal and pectoral fins.
    ctx.fillStyle = "#347fa6";
    ctx.beginPath();
    ctx.moveTo(-4, -19);
    ctx.lineTo(-20, -36);
    ctx.lineTo(-26, -13);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 10);
    ctx.lineTo(0, 28);
    ctx.lineTo(-4, 11);
    ctx.closePath();
    ctx.fill();
    // Eye.
    ctx.fillStyle = "rgba(220,245,255,0.9)";
    ctx.beginPath();
    ctx.arc(32, -3, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- landmarks and foreground

/** One landmark every kilometre, drifting past on a far parallax layer. */
export const LANDMARK_SPACING = 10000;
const LM_PARALLAX = 0.1;
export const KINDS = ["lighthouse", "stack", "arch", "ruins", "wreck"] as const;

const lh = (n: number) => {
  const x = Math.sin(n * 53.13 + 7.7) * 15731.743;
  return x - Math.floor(x);
};

/** Which landmark stands in kilometre slot k: every fifth one is the colossal gate. */
export function landmarkKind(k: number): "colossus" | (typeof KINDS)[number] {
  if (k > 0 && k % 5 === 0) return "colossus";
  return KINDS[Math.floor(lh(k) * KINDS.length)];
}

/** World x where slot k's landmark stands. The gate is exactly on its kilometre mark. */
export function landmarkX(k: number): number {
  return k > 0 && k % 5 === 0 ? k * LANDMARK_SPACING : k * LANDMARK_SPACING + (lh(k + 40) - 0.5) * LANDMARK_SPACING * 0.4;
}

/** Where a landmark flies a flag, set by silhouette() and read by landmarks(). */
let flagAt: [number, number] | null = null;

function silhouette(ctx: CanvasRenderingContext2D, kind: string, u: number, k: number): void {
  flagAt = null;
  ctx.beginPath();
  switch (kind) {
    case "lighthouse":
      // Rock, tapered tower, lamp room and cap.
      ctx.moveTo(-1.5 * u, 0);
      ctx.lineTo(-1.0 * u, -0.35 * u);
      ctx.lineTo(-0.28 * u, -0.45 * u);
      ctx.lineTo(-0.2 * u, -2.2 * u);
      ctx.lineTo(-0.3 * u, -2.2 * u);
      ctx.lineTo(-0.3 * u, -2.5 * u);
      ctx.lineTo(0, -2.9 * u);
      ctx.lineTo(0.3 * u, -2.5 * u);
      ctx.lineTo(0.3 * u, -2.2 * u);
      ctx.lineTo(0.2 * u, -2.2 * u);
      ctx.lineTo(0.28 * u, -0.45 * u);
      ctx.lineTo(1.1 * u, -0.3 * u);
      ctx.lineTo(1.6 * u, 0);
      break;
    case "stack":
      flagAt = [-0.05 * u, -2.7 * u];
      ctx.moveTo(-0.9 * u, 0);
      ctx.lineTo(-0.7 * u, -1.1 * u);
      ctx.lineTo(-0.45 * u, -1.9 * u);
      ctx.lineTo(-0.3 * u, -1.6 * u);
      ctx.lineTo(-0.05 * u, -2.7 * u);
      ctx.lineTo(0.25 * u, -2.0 * u);
      ctx.lineTo(0.45 * u, -2.3 * u);
      ctx.lineTo(0.7 * u, -1.0 * u);
      ctx.lineTo(1.0 * u, 0);
      break;
    case "arch":
      ctx.moveTo(-1.5 * u, 0);
      ctx.lineTo(-1.5 * u, -1.1 * u);
      ctx.quadraticCurveTo(-1.5 * u, -2.3 * u, 0, -2.3 * u);
      ctx.quadraticCurveTo(1.5 * u, -2.3 * u, 1.5 * u, -1.1 * u);
      ctx.lineTo(1.5 * u, 0);
      ctx.lineTo(0.85 * u, 0);
      ctx.lineTo(0.85 * u, -1.0 * u);
      ctx.quadraticCurveTo(0.85 * u, -1.6 * u, 0, -1.6 * u);
      ctx.quadraticCurveTo(-0.85 * u, -1.6 * u, -0.85 * u, -1.0 * u);
      ctx.lineTo(-0.85 * u, 0);
      break;
    case "ruins": {
      // A broken colonnade: five columns of different heights under a fallen lintel.
      ctx.moveTo(-2.2 * u, 0);
      for (let i = 0; i < 5; i++) {
        const x = (-2 + i * 0.95) * u;
        const top = (-(0.9 + lh(k * 5 + i) * 1.5)) * u;
        ctx.lineTo(x - 0.22 * u, 0);
        ctx.lineTo(x - 0.2 * u, top + 0.1 * u);
        ctx.lineTo(x - 0.28 * u, top);
        ctx.lineTo(x + 0.28 * u, top - 0.05 * u);
        ctx.lineTo(x + 0.2 * u, top + 0.15 * u);
        ctx.lineTo(x + 0.22 * u, 0);
      }
      ctx.lineTo(2.2 * u, 0);
      break;
    }
    case "wreck":
      // A hull on its side, a snapped mast and a torn sail.
      ctx.moveTo(-1.8 * u, 0);
      ctx.quadraticCurveTo(-1.6 * u, -0.7 * u, -0.9 * u, -0.8 * u);
      ctx.lineTo(-0.25 * u, -0.85 * u);
      ctx.lineTo(-0.2 * u, -2.6 * u);
      ctx.lineTo(-0.1 * u, -2.6 * u);
      ctx.lineTo(-0.05 * u, -1.0 * u);
      ctx.lineTo(0.9 * u, -1.9 * u);
      ctx.lineTo(0.6 * u, -0.85 * u);
      ctx.quadraticCurveTo(1.3 * u, -0.7 * u, 1.9 * u, -0.2 * u);
      ctx.lineTo(1.7 * u, 0);
      break;
    default: {
      // The gate: a colossal arch with the ribs of something enormous curving up inside it.
      ctx.moveTo(-3.4 * u, 0);
      ctx.lineTo(-3.4 * u, -2.2 * u);
      ctx.quadraticCurveTo(-3.4 * u, -5.0 * u, 0, -5.0 * u);
      ctx.quadraticCurveTo(3.4 * u, -5.0 * u, 3.4 * u, -2.2 * u);
      ctx.lineTo(3.4 * u, 0);
      ctx.lineTo(2.7 * u, 0);
      ctx.lineTo(2.7 * u, -2.2 * u);
      ctx.quadraticCurveTo(2.7 * u, -4.3 * u, 0, -4.3 * u);
      ctx.quadraticCurveTo(-2.7 * u, -4.3 * u, -2.7 * u, -2.2 * u);
      ctx.lineTo(-2.7 * u, 0);
    }
  }
  ctx.closePath();
}

/**
 * Silhouettes far on the horizon, moving at a tenth of your speed. `tint` is a css colour at the
 * sky's haze, `night` 0..1 lights the windows. Every fifth kilometre is the colossal gate.
 */
export function landmarks(v: View, camX: number, groundY: number, time: number, tint: [number, number, number], night: number): void {
  const { ctx } = v;
  const span = (v.w * 0.9) / (LM_PARALLAX * v.scale);
  const first = Math.max(0, Math.floor((camX - span - 4000) / LANDMARK_SPACING));
  const last = Math.floor((camX + span + 4000) / LANDMARK_SPACING);
  const u = v.h * 0.1;
  const baseY = v.h * 0.58 + (v.sy(groundY) - v.h * 0.74) * LM_PARALLAX;
  for (let k = first; k <= last; k++) {
    const wx = landmarkX(k);
    const sx = v.w * 0.5 + (wx - camX) * LM_PARALLAX * v.scale;
    const kind = landmarkKind(k);
    const big = kind === "colossus";
    const reach = big ? 3.6 * u * 1.5 : 2.2 * u * 1.5;
    if (sx < -reach || sx > v.w + reach) continue;
    const size = big ? u * 1.2 : u * (0.85 + lh(k + 7) * 0.5);
    ctx.save();
    ctx.translate(sx, baseY);
    // Haze: far things are the colour of the sky, a little darker.
    ctx.globalAlpha = big ? 0.5 : 0.5;
    ctx.fillStyle = `rgb(${tint[0] * 0.62 | 0},${tint[1] * 0.62 | 0},${tint[2] * 0.7 | 0})`;
    silhouette(ctx, kind, size, k);
    ctx.fill();
    if (flagAt) {
      // A tattered banner on top of the stack, streaming in the wind.
      const [fx, fy] = flagAt;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy - size * 0.7);
      ctx.lineWidth = Math.max(1, size * 0.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx, fy - size * 0.7);
      for (let i = 1; i <= 6; i++) ctx.lineTo(fx + i * size * 0.1, fy - size * 0.7 + Math.sin(time * 4 + i * 0.9 + k) * size * 0.05 * i * 0.4);
      for (let i = 6; i >= 1; i--) ctx.lineTo(fx + i * size * 0.1, fy - size * 0.5 + Math.sin(time * 4 + i * 0.9 + k) * size * 0.05 * i * 0.4);
      ctx.closePath();
      ctx.fill();
    }
    // At night a thin rim of moonlight keeps the shape readable against the dark sky.
    if (night > 0.2) {
      ctx.strokeStyle = `rgba(150,175,255,${0.35 * night})`;
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.stroke();
    }
    if (big) {
      // Ribs inside the gate.
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = Math.max(2, size * 0.1);
      ctx.lineCap = "round";
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const x = i * size * 0.62;
        ctx.beginPath();
        ctx.moveTo(x, -size * 0.2);
        ctx.quadraticCurveTo(x * 0.92, -size * 3.2, x * 0.3, -size * 3.9);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, -size * 4.3);
      ctx.lineTo(0, -size * 0.3);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    // Lights: the lighthouse lamp with a slow beam, and a few lit windows in the ruins.
    if (night > 0.15) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = night;
      if (kind === "lighthouse") {
        const pulse = 0.7 + 0.3 * Math.sin(time * 1.2 + k);
        const lampY = -size * 2.4;
        const lg = ctx.createRadialGradient(0, lampY, 0, 0, lampY, size * 1.7);
        lg.addColorStop(0, `rgba(255,226,150,${0.85 * pulse})`);
        lg.addColorStop(1, "rgba(255,200,120,0)");
        ctx.fillStyle = lg;
        ctx.fillRect(-size * 2, lampY - size * 2, size * 4, size * 4);
        const dir = Math.sin(time * 0.5 + k) > 0 ? 1 : -1;
        const bg = ctx.createLinearGradient(0, lampY, dir * size * 9, lampY - size * 0.3);
        bg.addColorStop(0, "rgba(255,226,150,0.32)");
        bg.addColorStop(1, "rgba(255,226,150,0)");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(0, lampY);
        ctx.lineTo(dir * size * 9, lampY - size * 0.9);
        ctx.lineTo(dir * size * 9, lampY + size * 0.5);
        ctx.closePath();
        ctx.fill();
      } else if (kind === "ruins" || kind === "wreck") {
        ctx.fillStyle = "rgba(255,206,130,0.7)";
        for (let i = 0; i < 3; i++) ctx.fillRect((-0.8 + i * 0.7) * size, -size * (0.35 + lh(k + i) * 0.2), size * 0.1, size * 0.14);
      } else if (big) {
        const g = ctx.createRadialGradient(0, -size * 2.4, 0, 0, -size * 2.4, size * 2.6);
        g.addColorStop(0, "rgba(160,200,255,0.2)");
        g.addColorStop(1, "rgba(160,200,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-size * 3, -size * 5.2, size * 6, size * 5.2);
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/** Dark blades along the bottom edge, moving faster than the world so the scene has a near layer. */
export function foreground(v: View, camX: number, time: number, tint: [number, number, number]): void {
  const { ctx } = v;
  const gap = 58;
  const span = v.w + 240;
  const shift = camX * 1.35 * v.scale;
  ctx.strokeStyle = `rgba(${tint[0] * 0.18 | 0},${tint[1] * 0.2 | 0},${tint[2] * 0.28 | 0},0.82)`;
  ctx.lineCap = "round";
  const base = Math.floor(shift / gap);
  const frac = shift - base * gap;
  const n = Math.ceil(span / gap);
  for (let j = -2; j < n; j++) {
    const i = base + j;
    const x = j * gap - frac - 60;
    const r = lh(i * 3);
    if (r < 0.35) continue;
    const hgt = v.h * (0.05 + r * 0.11);
    const sway = Math.sin(time * 1.3 + i) * hgt * 0.12;
    ctx.lineWidth = 2 + r * 3;
    ctx.beginPath();
    ctx.moveTo(x, v.h + 4);
    ctx.quadraticCurveTo(x + sway * 0.4, v.h - hgt * 0.5, x + sway + (r - 0.5) * 18, v.h - hgt);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

// ---------------------------------------------------------------- ambient life

/**
 * Sea birds perched on the crests. Each flock stands still until you come close, then bursts
 * upward and away. `perch` remembers when each chunk's flock took off.
 */
export function perched(v: View, t: Terrain, perch: Map<number, number>, spiritX: number, time: number, tint: [number, number, number]): void {
  const { ctx } = v;
  const from = Math.max(1, Math.floor(v.wx(-200) / RING_CHUNK) - 1);
  const to = Math.floor(v.wx(v.w + 200) / RING_CHUNK) + 1;
  const s = Math.max(0.6, v.scale);
  ctx.lineCap = "round";
  for (let c = from; c <= to; c++) {
    if (lh(c * 7 + 1) > 0.5) continue;
    const bx = c * RING_CHUNK + 300 + lh(c * 7 + 2) * 1400;
    const n = 3 + Math.floor(lh(c * 7 + 3) * 3);
    let t0 = perch.get(c);
    if (t0 === undefined && spiritX > bx - 460 && spiritX < bx + 260) {
      t0 = time;
      perch.set(c, time);
    }
    ctx.fillStyle = `rgb(${tint[0] * 0.22 | 0},${tint[1] * 0.22 | 0},${tint[2] * 0.3 | 0})`;
    ctx.strokeStyle = ctx.fillStyle;
    for (let i = 0; i < n; i++) {
      const x0 = bx + i * 30;
      const surface = t.height(x0);
      if (t0 === undefined) {
        // Standing on the crest: a small body, a head and a tail.
        const sx = v.sx(x0);
        const sy = v.sy(surface) - 3 * s;
        ctx.beginPath();
        ctx.ellipse(sx, sy - 4 * s, 5.5 * s, 3.4 * s, -0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx + 5 * s, sy - 8 * s, 2.4 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = Math.max(1, 1.6 * s);
        ctx.beginPath();
        ctx.moveTo(sx - 4 * s, sy - 4 * s);
        ctx.lineTo(sx - 10 * s, sy - 2 * s);
        ctx.stroke();
      } else {
        const age = time - t0;
        if (age > 4.5) continue;
        // Scatter: up and forward at slightly different rates, wings beating.
        const x = x0 + age * (260 + i * 45);
        const y = surface + 8 + age * (170 + i * 35) - age * age * 8;
        const sx = v.sx(x);
        const sy = v.sy(y);
        if (sx < -60 || sx > v.w + 60) continue;
        const flap = Math.sin(age * 20 + i * 1.7) * 6 * s;
        ctx.globalAlpha = Math.min(1, (4.5 - age) / 1.5);
        ctx.lineWidth = Math.max(1.2, 1.8 * s);
        ctx.beginPath();
        ctx.moveTo(sx - 9 * s, sy + flap);
        ctx.quadraticCurveTo(sx - 3 * s, sy - Math.abs(flap) * 0.4, sx, sy);
        ctx.quadraticCurveTo(sx + 3 * s, sy - Math.abs(flap) * 0.4, sx + 9 * s, sy + flap);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
  ctx.lineCap = "butt";
  if (perch.size > 40) for (const k of perch.keys()) if (k * RING_CHUNK < spiritX - 9000) perch.delete(k);
}

const FISH = 9;

/**
 * Things that live in the water and on it: jellyfish pulsing in the deep, schools of glowing
 * fish that dart away from you, and paper lanterns bobbing on the swells. Placed from the chunk
 * number alone, so the same wave always has the same creatures in the same places.
 */
export function life(v: View, t: Terrain, spiritX: number, spiritY: number, time: number, night: number): void {
  const { ctx } = v;
  const from = Math.max(1, Math.floor(v.wx(-250) / RING_CHUNK) - 1);
  const to = Math.floor(v.wx(v.w + 250) / RING_CHUNK) + 1;
  const s = Math.max(0.55, v.scale);
  for (let c = from; c <= to; c++) {
    const lagoon = lagoonAt(c * RING_CHUNK);
    // Jellyfish: a pulsing bell and trailing tentacles.
    if (lh(c * 13 + 3) < 0.75) {
      const x = c * RING_CHUNK + lh(c * 13 + 4) * RING_CHUNK + Math.sin(time * 0.2 + c) * 60;
      const y = t.height(x) - 95 - lh(c * 13 + 5) * 210 + Math.sin(time * 0.5 + c * 2) * 14;
      const sx = v.sx(x);
      const sy = v.sy(y);
      if (sx > -80 && sx < v.w + 80) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 1.7 + c);
        const r = (15 + pulse * 4) * s;
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
        g.addColorStop(0, `rgba(214,160,255,${0.35 + 0.15 * night})`);
        g.addColorStop(1, "rgba(214,160,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(sx - r * 3, sy - r * 3, r * 6, r * 6);
        ctx.fillStyle = "rgba(225,190,255,0.55)";
        ctx.beginPath();
        ctx.ellipse(sx, sy, r, r * (0.6 + 0.25 * (1 - pulse)), 0, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = "rgba(225,190,255,0.4)";
        ctx.lineWidth = Math.max(1, 1.4 * s);
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(sx + k * r * 0.4, sy);
          ctx.quadraticCurveTo(sx + k * r * 0.5 + Math.sin(time * 2 + k) * 5 * s, sy + r * 1.2, sx + k * r * 0.35 + Math.sin(time * 1.6 + k * 2) * 7 * s, sy + r * 2.3);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
      }
    }
    // A school of small glowing fish. Each swims its own loop and is pushed away from the spirit.
    if (lh(c * 13 + 6) < 0.8) {
      const cx = c * RING_CHUNK + lh(c * 13 + 7) * RING_CHUNK + Math.sin(time * 0.3 + c) * 130;
      const cy = t.height(cx) - 60 - lh(c * 13 + 8) * 170;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(120,255,230,${0.55 + 0.3 * night})`;
      for (let i = 0; i < FISH; i++) {
        const a = time * (0.7 + (i % 3) * 0.15) + i * 0.9 + c;
        let fx = cx + Math.cos(a) * (40 + (i % 4) * 14);
        let fy = cy + Math.sin(a * 1.3) * (22 + (i % 3) * 8);
        const dx = fx - spiritX;
        const dy = fy - spiritY;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 300) {
          const push = (1 - d / 300) * (1 - d / 300) * 260;
          fx += (dx / d) * push;
          fy += (dy / d) * push;
        }
        const sx = v.sx(fx);
        if (sx < -30 || sx > v.w + 30) continue;
        const sy = v.sy(fy);
        const heading = Math.atan2(-Math.cos(a * 1.3) * 0.3, -Math.sin(a));
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(heading);
        ctx.beginPath();
        ctx.ellipse(0, 0, 5 * s, 2 * s, 0, 0, Math.PI * 2);
        ctx.moveTo(-4 * s, 0);
        ctx.lineTo(-8 * s, -2.4 * s);
        ctx.lineTo(-8 * s, 2.4 * s);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    // Lanterns bobbing on the swells, more of them in a lagoon.
    if (lagoon || lh(c * 13 + 9) < 0.45) {
      const count = lagoon ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const x = c * RING_CHUNK + lh(c * 13 + 10 + i) * RING_CHUNK;
        const sx = v.sx(x);
        if (sx < -40 || sx > v.w + 40) continue;
        const y = t.height(x) + 7 + Math.sin(time * 1.4 + c + i * 2) * 5;
        const sy = v.sy(y);
        const flick = 0.8 + 0.2 * Math.sin(time * 7 + c + i);
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(sx, sy - 6 * s, 0, sx, sy - 6 * s, 26 * s);
        g.addColorStop(0, `rgba(255,196,120,${0.5 * flick * (0.5 + 0.5 * night)})`);
        g.addColorStop(1, "rgba(255,160,80,0)");
        ctx.fillStyle = g;
        ctx.fillRect(sx - 26 * s, sy - 32 * s, 52 * s, 52 * s);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(255,226,170,0.95)";
        ctx.fillRect(sx - 4 * s, sy - 11 * s, 8 * s, 10 * s);
        ctx.fillStyle = "rgba(60,30,20,0.85)";
        ctx.fillRect(sx - 5 * s, sy - 12 * s, 10 * s, 2 * s);
        ctx.fillRect(sx - 5 * s, sy - 2 * s, 10 * s, 2 * s);
      }
    }
  }
}

// ---------------------------------------------------------------- set-pieces

const RAIL_BANDS = [
  [18, 0.1],
  [7, 0.3],
  [2.4, 0.9],
] as const;

/** Sky-rails: shimmering aurora ribbons high above the waves. The one being ground burns brighter. */
export function rails(v: View, t: Terrain, time: number, active: Rail | null): void {
  const { ctx } = v;
  const s = Math.max(0.6, v.scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  chunks(v, (c) => {
    for (const r of t.chunk(c).rails) {
      const x0 = v.sx(r.x0);
      const x1 = v.sx(r.x1);
      if (x1 < -60 || x0 > v.w + 60) continue;
      const on = r === active;
      const n = Math.max(10, Math.ceil((r.x1 - r.x0) / 45));
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, "rgb(120,255,205)");
      g.addColorStop(0.5, "rgb(170,160,255)");
      g.addColorStop(1, "rgb(110,220,255)");
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = g;
      const shimmer = 0.85 + 0.15 * Math.sin(time * 2.4 + r.x0 * 0.01);
      for (const [lw, a] of RAIL_BANDS) {
        ctx.globalAlpha = Math.min(1, a * (on ? 1.5 : 1) * shimmer);
        ctx.lineWidth = lw * s;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const x = r.x0 + ((r.x1 - r.x0) * i) / n;
          if (i === 0) ctx.moveTo(v.sx(x), v.sy(railY(r, x)));
          else ctx.lineTo(v.sx(x), v.sy(railY(r, x)));
        }
        ctx.stroke();
      }
      // Points of light running along the ribbon.
      ctx.fillStyle = "rgb(255,255,255)";
      for (let i = 0; i < 6; i++) {
        const u = (time * 0.3 + i / 6 + r.x0 * 0.001) % 1;
        const x = r.x0 + (r.x1 - r.x0) * u;
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 6 + i);
        ctx.beginPath();
        ctx.arc(v.sx(x), v.sy(railY(r, x)), 2.4 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  });
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
}

/**
 * Shrine gates: torii floating above the sea in chains of three. The next gate to thread pulses;
 * under a Spirit Blessing they turn gold.
 */
export function shrines(v: View, t: Terrain, time: number, chainId: number, chainN: number, bless: number): void {
  const { ctx } = v;
  const s = Math.max(0.6, v.scale);
  chunks(v, (c) => {
    for (const r of t.chunk(c).rings) {
      if (r.shrine < 0 || r.taken) continue;
      const sx = v.sx(r.x);
      const sy = v.sy(r.y);
      if (sx < -90 || sx > v.w + 90) continue;
      const next = r.shrine === chainId ? r.order === chainN : r.order === 0;
      const hw = r.r * 0.95 * v.scale;
      const ht = r.r * 1.15 * v.scale;
      const glow = (next ? 0.9 : 0.45) * (0.8 + 0.2 * Math.sin(time * 4 + r.x));
      ctx.save();
      ctx.translate(sx, sy);
      ctx.globalCompositeOperation = "lighter";
      const hg = ctx.createRadialGradient(0, 0, hw * 0.2, 0, 0, hw * 2.2);
      hg.addColorStop(0, `rgba(255,120,70,${0.2 * glow})`);
      hg.addColorStop(1, "rgba(255,120,70,0)");
      ctx.fillStyle = hg;
      ctx.fillRect(-hw * 2.2, -hw * 2.2, hw * 4.4, hw * 4.4);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = bless > 0 ? "rgb(255,214,120)" : "rgb(232,70,52)";
      ctx.lineCap = "round";
      ctx.lineWidth = 7 * s;
      ctx.beginPath();
      ctx.moveTo(-hw, ht);
      ctx.lineTo(-hw, -ht * 0.55);
      ctx.moveTo(hw, ht);
      ctx.lineTo(hw, -ht * 0.55);
      ctx.stroke();
      ctx.lineWidth = 5 * s;
      ctx.beginPath();
      ctx.moveTo(-hw * 1.1, -ht * 0.15);
      ctx.lineTo(hw * 1.1, -ht * 0.15);
      ctx.stroke();
      ctx.lineWidth = 9 * s;
      ctx.beginPath();
      ctx.moveTo(-hw * 1.45, -ht * 0.5);
      ctx.quadraticCurveTo(0, -ht * 0.85, hw * 1.45, -ht * 0.5);
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.restore();
    }
  });
}

/** Whirlpools: spiral arms turning on the surface, and a dark eye. */
export function whirls(v: View, t: Terrain, time: number): void {
  const { ctx } = v;
  const s = Math.max(0.6, v.scale);
  chunks(v, (c) => {
    for (const w of t.chunk(c).whirls) {
      const sx = v.sx(w.x);
      if (sx < -80 || sx > v.w + 80) continue;
      const sy = v.sy(t.height(w.x)) + 3;
      ctx.fillStyle = "rgba(4,28,48,0.55)";
      ctx.beginPath();
      ctx.ellipse(sx, sy, WHIRL_R * 0.7 * v.scale, 9 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(200,240,255,0.7)";
      ctx.lineWidth = 2 * s;
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) {
          const rr = (k / 24) * WHIRL_R * 0.9 * v.scale;
          const a = arm * 2.094 + k * 0.28 - time * 3.4;
          const x = sx + Math.cos(a) * rr;
          const y = sy + Math.sin(a) * rr * 0.26;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  });
}

/** Thunderheads: dark storm clouds that crackle. Flying into one rides its updraft. */
export function thunderheads(v: View, t: Terrain, time: number, flashes: boolean): void {
  const { ctx } = v;
  const BLOBS = [
    [-0.7, 0.1, 0.7],
    [-0.25, -0.25, 0.85],
    [0.3, -0.2, 0.8],
    [0.75, 0.1, 0.65],
    [0, 0.2, 0.9],
    [0.1, -0.5, 0.55],
  ];
  chunks(v, (c) => {
    for (const cl of t.chunk(c).clouds) {
      const sx = v.sx(cl.x);
      const sy = v.sy(cl.y);
      const r = cl.r * v.scale;
      if (sx < -r * 2 || sx > v.w + r * 2) continue;
      ctx.fillStyle = "rgba(34,38,70,0.92)";
      for (const [dx, dy, k] of BLOBS) {
        ctx.beginPath();
        ctx.arc(sx + dx * r, sy - dy * r * 0.7, r * 0.62 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(78,86,132,0.45)";
      for (const [dx, dy, k] of BLOBS) {
        ctx.beginPath();
        ctx.arc(sx + dx * r, sy - dy * r * 0.7 - r * 0.12, r * 0.4 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      const ph = (time * 0.8 + cl.x * 0.013) % 2.7;
      const flash = ph < 0.12 ? 1 - ph / 0.12 : 0;
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      glow.addColorStop(0, `rgba(190,200,255,${0.1 + 0.08 * Math.sin(time * 3 + cl.x) + (flashes ? 0.45 * flash : 0.05)})`);
      glow.addColorStop(1, "rgba(120,140,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      if (flashes && flash > 0) {
        // A jagged bolt dropping out of the cloud.
        ctx.strokeStyle = `rgba(255,255,255,${flash})`;
        ctx.lineWidth = Math.max(1.5, 2.6 * v.scale);
        ctx.beginPath();
        let bx = sx + (lh(Math.floor(time * 0.8 / 2.7) + cl.x) - 0.5) * r;
        let by = sy + r * 0.2;
        ctx.moveTo(bx, by);
        for (let i = 1; i <= 6; i++) {
          bx += (lh(i * 7 + cl.x) - 0.5) * r * 0.5;
          by += r * 0.28;
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }
  });
}

/**
 * The Leviathan's back: at 5 km and every 5 km after, a sea serpent surfaces beneath the waves.
 * Its arched back is the ramp; its head watches from beyond the rune ring.
 */
export function leviathan(v: View, t: Terrain, time: number): void {
  const { ctx } = v;
  const s = Math.max(0.6, v.scale);
  const lo = v.wx(-300);
  const hi = v.wx(v.w + 300);
  for (let m = Math.max(1, Math.floor((lo - 2300) / LEV_EVERY)); m * LEV_EVERY <= hi + 2300; m++) {
    const c = m * LEV_EVERY;
    if (c < lo - 2300) continue;
    const x0 = c - 1700;
    const x1 = c + 1700;
    const taper = (x: number) => Math.exp(-(((x - c) / 1500) ** 2));
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 60) {
      if (x === x0) ctx.moveTo(v.sx(x), v.sy(t.height(x)) + 2);
      else ctx.lineTo(v.sx(x), v.sy(t.height(x)) + 2);
    }
    for (let x = x1; x >= x0; x -= 60) ctx.lineTo(v.sx(x), v.sy(t.height(x) - 150 * taper(x)));
    ctx.closePath();
    ctx.fillStyle = "rgba(12,52,60,0.94)";
    ctx.fill();
    // Scales along the back.
    ctx.strokeStyle = "rgba(120,230,205,0.25)";
    ctx.lineWidth = Math.max(1, 1.4 * s);
    for (let row = 0; row < 2; row++) {
      for (let x = x0 + (row ? 30 : 0); x <= x1; x += 60) {
        ctx.beginPath();
        ctx.arc(v.sx(x), v.sy(t.height(x) - 28 * row * taper(x)), 15 * s, 0.1, Math.PI - 0.1);
        ctx.stroke();
      }
    }
    // Spines along the ridge.
    for (let x = c - 1300; x <= c + 1300; x += 95) {
      const hgt = (30 + 22 * lh(x * 0.013)) * taper(x) + 10;
      const sx = v.sx(x);
      const sy = v.sy(t.height(x));
      ctx.fillStyle = "rgba(18,78,86,0.96)";
      ctx.strokeStyle = "rgba(120,255,220,0.5)";
      ctx.beginPath();
      ctx.moveTo(sx - 14 * s, sy + 2);
      ctx.lineTo(sx + 4 * s, sy - hgt * s);
      ctx.lineTo(sx + 16 * s, sy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // The head, watching from beyond the runes, and its glowing eye.
    const hx = v.sx(c + 1800);
    const hy = v.sy(t.height(c + 1800));
    ctx.fillStyle = "rgba(12,52,60,0.96)";
    ctx.beginPath();
    ctx.moveTo(hx - 150 * s, hy + 4 * s);
    ctx.quadraticCurveTo(hx - 120 * s, hy - 170 * s, hx + 20 * s, hy - 200 * s);
    ctx.quadraticCurveTo(hx + 150 * s, hy - 215 * s, hx + 250 * s, hy - 120 * s);
    ctx.lineTo(hx + 150 * s, hy - 96 * s);
    ctx.quadraticCurveTo(hx + 190 * s, hy - 60 * s, hx + 130 * s, hy - 30 * s);
    ctx.lineTo(hx + 20 * s, hy + 4 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(120,255,220,0.45)";
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    const eg = ctx.createRadialGradient(hx + 70 * s, hy - 150 * s, 0, hx + 70 * s, hy - 150 * s, 40 * s);
    eg.addColorStop(0, `rgba(255,210,100,${0.8 + 0.2 * Math.sin(time * 2)})`);
    eg.addColorStop(1, "rgba(255,160,60,0)");
    ctx.fillStyle = eg;
    ctx.fillRect(hx + 30 * s, hy - 190 * s, 80 * s, 80 * s);
    ctx.globalCompositeOperation = "source-over";
  }
}

/** Colossal serpent shapes gliding far behind the playable wave, barely there. */
export function deepLife(v: View, camX: number, time: number, tint: [number, number, number]): void {
  const { ctx } = v;
  const SLOT = 7000;
  const par = 0.22;
  const s = Math.max(0.6, v.scale);
  const span = (v.w * 0.9) / (par * v.scale);
  const first = Math.max(0, Math.floor((camX - span) / SLOT));
  const last = Math.floor((camX + span) / SLOT);
  for (let k = first; k <= last; k++) {
    if (lh(k + 60) > 0.55) continue;
    const cx = v.w * 0.5 + (k * SLOT + lh(k + 61) * 2500 - camX) * par * v.scale + Math.sin(time * 0.05 + k) * 80;
    if (cx < -520 * s || cx > v.w + 520 * s) continue;
    const by = v.h * (0.6 + lh(k + 62) * 0.05);
    const L = 780 * s;
    const A = 26 * s;
    ctx.fillStyle = `rgba(${tint[0] * 0.3 | 0},${tint[1] * 0.4 | 0},${tint[2] * 0.5 | 0},0.2)`;
    ctx.beginPath();
    for (let i = 0; i <= 28; i++) {
      const u = i / 28;
      const x = cx + (u - 0.5) * L;
      const y = by + Math.sin(u * 7 + time * 0.5 + k) * A - (1 - Math.abs(2 * u - 1)) * 6 * s;
      const th = (24 * (1 - Math.pow(Math.abs(2 * u - 1), 1.6)) + 3) * s;
      if (i === 0) ctx.moveTo(x, y - th);
      else ctx.lineTo(x, y - th);
    }
    for (let i = 28; i >= 0; i--) {
      const u = i / 28;
      const x = cx + (u - 0.5) * L;
      const y = by + Math.sin(u * 7 + time * 0.5 + k) * A - (1 - Math.abs(2 * u - 1)) * 6 * s;
      const th = (24 * (1 - Math.pow(Math.abs(2 * u - 1), 1.6)) + 3) * s;
      ctx.lineTo(x, y + th);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Foreground framing: ruined arches and fog banks drifting past the camera. Arches fade out
 * toward the middle of the screen so they hug the edges and never block the view.
 */
export function framing(v: View, camX: number, time: number, tint: [number, number, number]): void {
  const { ctx } = v;
  const SLOT = 6000;
  const par = 1.4;
  const s = Math.max(0.6, v.scale);
  const span = (v.w * 0.9) / (par * v.scale);
  const first = Math.max(0, Math.floor((camX - span) / SLOT));
  const last = Math.floor((camX + span) / SLOT);
  ctx.fillStyle = `rgb(${tint[0] * 0.12 | 0},${tint[1] * 0.14 | 0},${tint[2] * 0.2 | 0})`;
  for (let k = first; k <= last; k++) {
    if (lh(k + 90) > 0.5) continue;
    const sx = v.w * 0.5 + (k * SLOT + lh(k + 91) * 2000 - camX) * par * v.scale;
    const edge = Math.abs(sx - v.w * 0.5) / (v.w * 0.5);
    const t = Math.min(1, Math.max(0, (edge - 0.58) / 0.25));
    if (t <= 0 || edge > 1.4) continue;
    const a = 0.85 * t * t * (3 - 2 * t);
    const hgt = v.h * (0.42 + lh(k + 92) * 0.14);
    const w = 150 * s;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(sx - w, v.h + 6);
    ctx.lineTo(sx - w, v.h - hgt * 0.7);
    ctx.quadraticCurveTo(sx - w, v.h - hgt, sx, v.h - hgt);
    ctx.quadraticCurveTo(sx + w, v.h - hgt, sx + w, v.h - hgt * 0.78);
    ctx.lineTo(sx + w * 0.9, v.h - hgt * 0.5);
    ctx.lineTo(sx + w * 0.62, v.h - hgt * 0.62);
    ctx.lineTo(sx + w * 0.62, v.h + 6);
    ctx.lineTo(sx + w * 0.38, v.h + 6);
    ctx.lineTo(sx + w * 0.38, v.h - hgt * 0.7);
    ctx.quadraticCurveTo(sx, v.h - hgt * 0.78, sx - w * 0.38, v.h - hgt * 0.7);
    ctx.lineTo(sx - w * 0.38, v.h + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Fog banks, low and slow.
  const spanF = v.w + 700;
  for (let i = 0; i < 3; i++) {
    const bx = ((((i * 520 - time * (10 + i * 4) - camX * 0.25 * v.scale) % spanF) + spanF) % spanF) - 350;
    const by = v.h * (0.88 + 0.03 * i);
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, 300 * s);
    g.addColorStop(0, "rgba(225,238,250,0.12)");
    g.addColorStop(1, "rgba(225,238,250,0)");
    ctx.fillStyle = g;
    ctx.fillRect(bx - 300 * s, by - 80 * s, 600 * s, 160 * s);
  }
}

/** Abyssal caverns: a dark vault under the surface, hung with glowing crystals around the gem trail. */
const cavTop = new Float32Array(64);
const cavBot = new Float32Array(64);

export function caverns(v: View, t: Terrain, time: number): void {
  const { ctx } = v;
  chunks(v, (c) => {
    for (const cv of t.chunk(c).caverns) {
      const x0 = v.sx(cv.x);
      const x1 = v.sx(cv.x + cv.w);
      if (x1 < -40 || x0 > v.w + 40) continue;
      const step = 40;
      ctx.beginPath();
      const top = cavTop;
      const bot = cavBot;
      const n = Math.min(60, Math.max(2, Math.ceil(cv.w / step)));
      for (let i = 0; i <= n; i++) {
        const wx = cv.x + (cv.w * i) / n;
        const u = i / n;
        const swell = Math.sin(Math.PI * u);
        top[i] = v.sy(t.height(wx) - 40 * swell);
        bot[i] = v.sy(t.height(wx) - 120 - 300 * Math.pow(swell, 0.6));
      }
      ctx.moveTo(x0, top[0]);
      for (let i = 1; i <= n; i++) ctx.lineTo(x0 + ((x1 - x0) * i) / n, top[i]);
      for (let i = n; i >= 0; i--) ctx.lineTo(x0 + ((x1 - x0) * i) / n, bot[i]);
      ctx.closePath();
      const mid = (top[n >> 1] + bot[n >> 1]) / 2;
      const g = ctx.createRadialGradient((x0 + x1) / 2, mid, 10, (x0 + x1) / 2, mid, Math.max(60, (x1 - x0) / 1.6));
      g.addColorStop(0, "rgba(8,14,40,0.62)");
      g.addColorStop(1, "rgba(4,6,22,0.3)");
      ctx.fillStyle = g;
      ctx.fill();
      // Crystals along the ceiling and floor of the vault.
      for (let i = 1; i < n; i += 2) {
        const px = x0 + ((x1 - x0) * i) / n;
        const hue = i % 4 === 1 ? "120,255,235" : "190,150,255";
        const tw = 0.55 + 0.45 * Math.sin(time * 1.7 + i * 1.3);
        const len = (14 + (i % 3) * 7) * Math.max(0.6, v.scale);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(${hue},${0.5 * tw})`;
        ctx.beginPath();
        ctx.moveTo(px - len * 0.22, top[i] + 1);
        ctx.lineTo(px, top[i] + len);
        ctx.lineTo(px + len * 0.22, top[i] + 1);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px - len * 0.2, bot[i] - 1);
        ctx.lineTo(px, bot[i] - len * 0.8);
        ctx.lineTo(px + len * 0.2, bot[i] - 1);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
    }
  });
}

/** Meteors falling into the sea ahead of the spirit, the splash-ramps they raise and the shards they leave. */
export function meteors(v: View, t: Terrain, time: number, frame: number): void {
  const { ctx } = v;
  const sc = Math.max(0.6, v.scale);
  chunks(v, (c) => {
    const ch = t.chunk(c);
    for (const m of ch.meteors) {
      if (m.at < 0) continue;
      const age = frame - m.at;
      if (age < 0 || age > 120) continue;
      const gx = v.sx(m.x);
      const gy = v.sy(t.height(m.x));
      if (gx < -300 || gx > v.w + 300) continue;
      if (age < 22) {
        const k = age / 22;
        const hx = gx + (1 - k) * 560 * sc;
        const hy = gy - (1 - k) * 760 * sc;
        const tx = gx + (1 - Math.max(0, k - 0.2)) * 560 * sc;
        const ty = gy - (1 - Math.max(0, k - 0.2)) * 760 * sc;
        ctx.globalCompositeOperation = "lighter";
        const tr = ctx.createLinearGradient(hx, hy, tx, ty);
        tr.addColorStop(0, "rgba(255,210,140,0.9)");
        tr.addColorStop(1, "rgba(255,120,60,0)");
        ctx.strokeStyle = tr;
        ctx.lineWidth = 9 * sc;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,240,200,0.95)";
        ctx.beginPath();
        ctx.arc(hx, hy, 9 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else {
        const k = (age - 22) / 60;
        if (k < 1) {
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = `rgba(255,214,150,${0.7 * (1 - k)})`;
          ctx.lineWidth = Math.max(1, 5 * (1 - k)) * sc;
          ctx.beginPath();
          ctx.ellipse(gx, gy, (40 + 260 * k) * sc, (8 + 26 * k) * sc, 0, 0, Math.PI * 2);
          ctx.stroke();
          const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 180 * sc);
          rg.addColorStop(0, `rgba(255,190,110,${0.35 * (1 - k)})`);
          rg.addColorStop(1, "rgba(255,190,110,0)");
          ctx.fillStyle = rg;
          ctx.fillRect(gx - 180 * sc, gy - 180 * sc, 360 * sc, 360 * sc);
          ctx.globalCompositeOperation = "source-over";
        }
      }
    }
    for (const sh of ch.shards) {
      if (sh.taken) continue;
      const x = v.sx(sh.x);
      const y = v.sy(sh.y);
      if (x < -30 || x > v.w + 30) continue;
      const ready = sh.m.at >= 0 && frame - sh.m.at >= METEOR_SETTLE;
      const live = sh.m.at >= 0;
      const r = 11 * sc;
      const spin = 0.55 + 0.45 * Math.sin(time * 3 + sh.x);
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      halo.addColorStop(0, `rgba(255,206,120,${ready ? 0.55 : live ? 0.2 : 0.1})`);
      halo.addColorStop(1, "rgba(255,206,120,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = ready ? "rgb(255,222,132)" : "rgba(255,222,132,0.35)";
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.7 * spin, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.7 * spin, y);
      ctx.closePath();
      ctx.fill();
    }
  });
}
