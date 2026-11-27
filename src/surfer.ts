/**
 * The shadow-surfer: a silhouette rider on a glowing energy board, with a 10-segment Verlet
 * ribbon scarf that trails behind and reacts to speed, flips and the plunge. Visual only: the
 * physics never reads anything here.
 */

const SEGMENTS = 10;

/** How the rider reads: scarf length from the gear, and the Surge charge. */
export interface Look {
  scarf: number;
  surgeReady: boolean;
  /** 0..1 while a Surge burns. */
  surgeOn: number;
}

export class Surfer {
  private x = new Float32Array(SEGMENTS);
  private y = new Float32Array(SEGMENTS);
  private ox = new Float32Array(SEGMENTS);
  private oy = new Float32Array(SEGMENTS);
  private ready = false;

  reset(): void {
    this.ready = false;
  }

  /** Steps the scarf in screen space so it follows the camera smoothly. */
  private scarf(ax: number, ay: number, speed: number, under: boolean, dt: number, seg: number): void {
    if (!this.ready) {
      for (let i = 0; i < SEGMENTS; i++) {
        this.x[i] = this.ox[i] = ax - i * seg;
        this.y[i] = this.oy[i] = ay;
      }
      this.ready = true;
    }
    const drag = under ? 0.82 : 0.9;
    const wind = Math.min(2.2, speed / 700) * (under ? 0.5 : 1);
    const grav = under ? -0.05 : 0.35;
    const k = Math.min(2, dt * 60);
    this.x[0] = ax;
    this.y[0] = ay;
    for (let i = 1; i < SEGMENTS; i++) {
      const vx = (this.x[i] - this.ox[i]) * drag;
      const vy = (this.y[i] - this.oy[i]) * drag;
      this.ox[i] = this.x[i];
      this.oy[i] = this.y[i];
      this.x[i] += vx - wind * k;
      this.y[i] += vy + grav * k + Math.sin(performance.now() / 160 + i) * 0.25;
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < SEGMENTS; i++) {
        const dx = this.x[i] - this.x[i - 1];
        const dy = this.y[i] - this.y[i - 1];
        const d = Math.hypot(dx, dy) || 1;
        const f = (d - seg) / d;
        this.x[i] -= dx * f;
        this.y[i] -= dy * f;
      }
    }
  }

  /**
   * Draws the rider at screen (sx, sy). `angle` is the board angle in world space (counter-
   * clockwise); `size` scales the figure; `color` is the aura's rgb triple as a css rgb() body.
   */
  draw(ctx: CanvasRenderingContext2D, sx: number, sy: number, angle: number, size: number, color: string, tuck: boolean, grounded: boolean, under: boolean, speed: number, dt: number, light: number, o: Look): void {
    const rot = -angle;
    const s = size / 10;
    // Scarf anchor: the rider's neck, rotated with the board.
    const lx = 1.5 * s;
    const ly = (tuck ? -18 : -24) * s;
    const nx = sx + lx * Math.cos(rot) - ly * Math.sin(rot);
    const ny = sy + lx * Math.sin(rot) + ly * Math.cos(rot);
    // The scarf is the light made visible: it shortens and dims as the light fades.
    const lit = 0.4 + 0.6 * light;
    this.scarf(nx, ny, speed, under, dt, 5.2 * s * o.scarf * lit);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";
    for (let i = 1; i < SEGMENTS; i++) {
      const t = 1 - i / SEGMENTS;
      ctx.strokeStyle = `rgba(${color},${(0.35 + 0.6 * t) * (0.5 + 0.5 * light)})`;
      ctx.lineWidth = Math.max(1, 5 * s * t + 1);
      ctx.beginPath();
      ctx.moveTo(this.x[i - 1], this.y[i - 1]);
      ctx.lineTo(this.x[i], this.y[i]);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot);
    // Energy board: a bright core with a soft glow and a wake of light underneath.
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(${color},0.35)`;
    ctx.beginPath();
    ctx.ellipse(0, 1 * s, 22 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgb(${color})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17 * s, 2.6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(-12 * s, -0.8 * s, 24 * s, 1.4 * s);
    // Surge charge: a shimmer runs down the board when it is ready, and the board burns while it lasts.
    if (o.surgeOn > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * o.surgeOn})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 24 * s, 4.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else if (o.surgeReady) {
      const p = (performance.now() / 900) % 1;
      const gx = (-18 + 36 * p) * s;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(gx - 2 * s, -2.4 * s, 4 * s, 4.8 * s);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(gx - 6 * s, -2.4 * s, 12 * s, 4.8 * s);
    }

    // The rider: crouched for speed, tucked tight in a flip.
    const knee = tuck ? 14 : grounded ? 9 : 7;
    const hip = tuck ? -10 : -14;
    const shoulder = tuck ? -18 : -24;
    ctx.strokeStyle = "#0c0a14";
    ctx.lineWidth = 4.2 * s;
    ctx.beginPath();
    ctx.moveTo(-6 * s, -2 * s);
    ctx.lineTo(-knee * 0.5 * s, (hip + 6) * s);
    ctx.lineTo(-2 * s, hip * s);
    ctx.moveTo(6 * s, -2 * s);
    ctx.lineTo((knee * 0.6) * s, (hip + 5) * s);
    ctx.lineTo(2 * s, hip * s);
    ctx.stroke();
    ctx.lineWidth = 5.2 * s;
    ctx.beginPath();
    ctx.moveTo(0, hip * s);
    ctx.lineTo(1.5 * s, shoulder * s);
    ctx.stroke();
    ctx.lineWidth = 3.2 * s;
    ctx.beginPath();
    if (tuck) {
      ctx.moveTo(1.5 * s, (shoulder + 2) * s);
      ctx.lineTo(7 * s, (hip + 2) * s);
    } else {
      ctx.moveTo(1.5 * s, (shoulder + 2) * s);
      ctx.lineTo(-11 * s, (shoulder + 7) * s);
      ctx.moveTo(1.5 * s, (shoulder + 2) * s);
      ctx.lineTo(13 * s, (shoulder + 5) * s);
    }
    ctx.stroke();
    ctx.fillStyle = "#0c0a14";
    ctx.beginPath();
    ctx.arc(2.5 * s, (shoulder - 5) * s, 4.6 * s, 0, Math.PI * 2);
    ctx.fill();
    // Rim light so the silhouette reads on dark skies.
    ctx.strokeStyle = `rgba(${color},0.75)`;
    ctx.lineWidth = 1.1 * s;
    ctx.beginPath();
    ctx.arc(2.5 * s, (shoulder - 5) * s, 4.6 * s, -Math.PI * 0.9, -Math.PI * 0.1);
    ctx.stroke();
    ctx.restore();
  }
}
