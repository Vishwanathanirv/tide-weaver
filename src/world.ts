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
