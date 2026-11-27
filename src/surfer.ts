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
  /** Posture, each eased by the renderer: 0..1 crouch on dives, -1..1 lean (uphill leans back), 0..1 arms thrown out at the peak. */
  crouch: number;
  lean: number;
  arms: number;
  /** -1..1 eased vertical acceleration: positive presses the knees down (troughs), negative extends them (jump apex). */
  flex: number;
  /** Rider skin id. */
  skin: string;
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
  draw(ctx: CanvasRenderingContext2D, sx: number, sy: number, angle: number, size: number, color: string, tuck: boolean, _grounded: boolean, under: boolean, speed: number, dt: number, light: number, o: Look): void {
    const rot = -angle;
    const s = size / 10;
    // Scarf anchor: the rider's neck, rotated with the board.
    const lx = (1.5 + (tuck ? 0 : o.lean * -4)) * s;
    const ly = (tuck ? -18 : -24 + o.crouch * 7) * s;
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

    // The rider: hooded, caped, boots fixed to the deck. Knees take the vertical acceleration.
    const cr = tuck ? 0 : o.crouch;
    const lean = tuck ? 0 : o.lean * -4;
    const arms = tuck ? 0 : o.arms;
    const flex = tuck ? 0.5 : Math.max(-1, Math.min(1, o.flex));
    const hip = (tuck ? -10 : -15 + cr * 4) + flex * 3.4;
    const shoulder = tuck ? -18 : -25 + cr * 7 + flex * 2;
    const BX = -6.5;
    const FX = 6.5;
    const hx = lean * 0.3;
    const sxn = 1.5 + lean;
    const hcx = 2.5 + lean;
    const hcy = shoulder - 5.4;
    const now = performance.now() / 1000;
    const cs = Math.min(1.6, speed / 900);
    // Cloak: from the shoulders, trailing opposite to travel; tail flutters, and drops with a compressed stance.
    const tailX = (-14 - 20 * cs) * s;
    const flutter = Math.sin(now * 9 + speed * 0.002) * (1.4 + 2.6 * cs) * s;
    const tailY = (shoulder + 14 - flex * 3 - cr * 2) * s + flutter;
    const mid2X = (-6 - 9 * cs) * s;
    const sk = o.skin;
    ctx.fillStyle = sk === "ronin" ? "#34121a" : sk === "kitsune" ? "#2b1a12" : sk === "valkyrie" ? "#16233d" : "#171226";
    ctx.beginPath();
    ctx.moveTo((sxn + 2.5) * s, (shoulder - 1) * s);
    ctx.quadraticCurveTo(mid2X, (shoulder - 3) * s + flutter * 0.2, tailX, tailY - 5 * s);
    ctx.lineTo(tailX - 1.5 * s, tailY + 4 * s);
    ctx.quadraticCurveTo(mid2X + 2 * s, (hip + 3) * s, (hx - 1) * s, (hip + 2) * s);
    ctx.lineTo((sxn - 3) * s, (shoulder + 1) * s);
    ctx.closePath();
    ctx.fill();
    // Legs: two-bone IK from fixed boots up to the hip, knees pushed forward.
    ctx.strokeStyle = "#0c0a14";
    ctx.lineWidth = 4.2 * s;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const L1 = 8.2 * s;
    const L2 = 8.2 * s;
    ctx.beginPath();
    for (let k = 0; k < 2; k++) {
      const fx = (k === 0 ? BX : FX) * s;
      const fy = -1.6 * s;
      const hxx = (hx + (k === 0 ? -2 : 2)) * s;
      const hyy = hip * s;
      let dx = hxx - fx;
      let dy = hyy - fy;
      let d = Math.hypot(dx, dy);
      const dMax = L1 + L2 - 0.2;
      if (d > dMax) {
        dx *= dMax / d;
        dy *= dMax / d;
        d = dMax;
      }
      const a = (d * d + L1 * L1 - L2 * L2) / (2 * d);
      const hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const ux = dx / d;
      const uy = dy / d;
      const kx = fx + ux * a + uy * hh;
      const ky = fy + uy * a - ux * hh;
      ctx.moveTo(fx, fy);
      ctx.lineTo(kx, ky);
      ctx.lineTo(fx + dx, fy + dy);
    }
    ctx.stroke();
    // Boots, planted on the deck.
    ctx.fillStyle = "#0c0a14";
    ctx.fillRect((BX - 3) * s, -2.6 * s, 6.4 * s, 2.2 * s);
    ctx.fillRect((FX - 3) * s, -2.6 * s, 6.4 * s, 2.2 * s);
    // Torso, arms.
    ctx.lineWidth = 5.4 * s;
    ctx.beginPath();
    ctx.moveTo(hx * s, hip * s);
    ctx.lineTo(sxn * s, shoulder * s);
    ctx.stroke();
    ctx.lineWidth = 3.2 * s;
    ctx.beginPath();
    if (tuck) {
      ctx.moveTo(1.5 * s, (shoulder + 2) * s);
      ctx.lineTo(7 * s, (hip + 2) * s);
    } else {
      ctx.moveTo(sxn * s, (shoulder + 2) * s);
      ctx.lineTo((-11 - 6 * arms) * s, (shoulder + 7 - 8 * arms) * s);
      ctx.moveTo(sxn * s, (shoulder + 2) * s);
      ctx.lineTo((13 + 6 * arms) * s, (shoulder + 5 - 7 * arms) * s);
    }
    ctx.stroke();
    // Hood: a round cowl with a point swept back.
    ctx.fillStyle = "#0c0a14";
    ctx.beginPath();
    ctx.arc(hcx * s, hcy * s, 4.9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo((hcx - 3.6) * s, (hcy - 3) * s);
    ctx.quadraticCurveTo((hcx - 8) * s, (hcy - 2.4 + flutter / s * 0.15) * s, (hcx - 10.5 - 3 * cs) * s, (hcy + 2.6) * s + flutter * 0.3);
    ctx.lineTo((hcx - 3.4) * s, (hcy + 3.6) * s);
    ctx.closePath();
    ctx.fill();
    // Skins: accessories over the hood.
    if (sk === "ronin") {
      ctx.fillStyle = "#d6b25e";
      ctx.strokeStyle = "#6a4a14";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo((hcx - 11) * s, (hcy - 0.5) * s);
      ctx.lineTo(hcx * s, (hcy - 10) * s);
      ctx.lineTo((hcx + 11) * s, (hcy - 0.5) * s);
      ctx.quadraticCurveTo(hcx * s, (hcy - 3) * s, (hcx - 11) * s, (hcy - 0.5) * s);
      ctx.fill();
      ctx.stroke();
    } else if (sk === "kitsune") {
      ctx.fillStyle = "#e9863a";
      for (const dx of [-2.6, 3.2]) {
        ctx.beginPath();
        ctx.moveTo((hcx + dx - 2.6) * s, (hcy - 3.6) * s);
        ctx.lineTo((hcx + dx + 0.4) * s, (hcy - 11) * s);
        ctx.lineTo((hcx + dx + 3) * s, (hcy - 3.4) * s);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(mid2X, (shoulder + 6) * s + flutter * 0.4);
      ctx.quadraticCurveTo(tailX - 6 * s, tailY - 9 * s, tailX - 12 * s, tailY + 2 * s + flutter);
      ctx.quadraticCurveTo(tailX - 3 * s, tailY + 7 * s, mid2X, (shoulder + 9) * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff4e6";
      ctx.beginPath();
      ctx.arc(tailX - 11 * s, tailY + 2 * s + flutter, 3 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (sk === "valkyrie") {
      ctx.fillStyle = "#9fd0ff";
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo((hcx + dir * 3.8) * s, (hcy - 1) * s);
        ctx.quadraticCurveTo((hcx + dir * 9) * s, (hcy - 8) * s, (hcx + dir * 12) * s, (hcy - 10) * s);
        ctx.quadraticCurveTo((hcx + dir * 8) * s, (hcy - 3) * s, (hcx + dir * 4.5) * s, (hcy + 1) * s);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Rim light, 2.2 px, along the top: hood, shoulder, cloak edge, board nose.
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,244,214,0.95)";
    ctx.beginPath();
    ctx.moveTo((hcx + 4.4) * s, (hcy + 1.4) * s);
    ctx.arc(hcx * s, hcy * s, 4.9 * s, 0.25, -Math.PI * 1.05, true);
    ctx.quadraticCurveTo((hcx - 8) * s, (hcy - 2.4) * s, (hcx - 10.5 - 3 * cs) * s, (hcy + 2.6) * s + flutter * 0.3);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${color},0.95)`;
    ctx.beginPath();
    ctx.moveTo((sxn + 5) * s, (shoulder + 1) * s);
    ctx.lineTo((sxn + 1) * s, (shoulder - 1.4) * s);
    ctx.lineTo((sxn - 2.5) * s, (shoulder - 0.6) * s);
    ctx.quadraticCurveTo(mid2X, (shoulder - 3.4) * s + flutter * 0.2, tailX, tailY - 5 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8 * s, -2.7 * s);
    ctx.lineTo(17.5 * s, -0.4 * s);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }
}
