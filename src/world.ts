import { GATE_HEIGHT, RING_CHUNK, gateShut, spikeUp, BEAT_STEPS, type Terrain } from "./terrain";

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
export function hazards(v: View, t: Terrain, frame: number, live: boolean): void {
  const { ctx } = v;
  const a = live ? 1 : 0.35;
  chunks(v, (c) => {
    const ch = t.chunk(c);
    for (const sp of ch.spikes) {
      const x = v.sx(sp.x);
      if (x < -40 || x > v.w + 40) continue;
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

function silhouette(ctx: CanvasRenderingContext2D, kind: string, u: number, k: number): void {
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
