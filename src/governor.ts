/**
 * Frame governor. The game draws a full-screen canvas every frame, so on a busy or small GPU the
 * cost is in filling pixels, not in JavaScript. When frames run long the governor lowers the canvas
 * resolution a step at a time (the picture is scaled up by the browser); after a long smooth spell
 * it tries one step back up, at most a few times a session so it cannot flap.
 * Pure: it only sees frame times, so it can be tested without a browser.
 */
export const MIN_SCALE = 0.55;
const STEP = 0.85;
/** The most pixels the canvas should start with. Measured: a 1280x720 canvas on a software renderer held 60 fps only at 0.55 of this size. */
export const PIXEL_BUDGET = 2_300_000;

/** Largest scale that keeps the canvas within the pixel budget (1 when it already fits). */
export const budgetScale = (cssW: number, cssH: number, dpr: number): number => Math.max(MIN_SCALE, Math.min(1, Math.sqrt(PIXEL_BUDGET / Math.max(1, cssW * cssH * dpr * dpr))));
/** Frames slower than this many milliseconds, on average, mean the display is dropping frames. */
const SLOW_MS = 18.6;
/** Frames at or under this are holding a 60 Hz display. */
const SMOOTH_MS = 17.2;
const DOWN_AFTER = 0.6;
const UP_AFTER = 20;
const MAX_UPS = 3;

export class Governor {
  scale = 1;
  /** The ceiling the governor may climb back to: the pixel budget for this screen. */
  max = 1;
  private ema = 16.7;
  private slow = 0;
  private smooth = 0;
  private ups = 0;
  /** Frame times from a hidden tab or a pause are not a sign of load. */
  private skip = 0;

  /** A new screen size or pixel ratio: restart from its budget. */
  setBudget(max: number): void {
    this.max = max;
    this.scale = Math.min(this.scale, max);
    if (this.scale < max && this.ups === 0) this.scale = max;
  }

  /** Feed the time since the previous frame, in ms. Returns true when `scale` changed. */
  sample(ms: number, active: boolean): boolean {
    if (!active || ms > 120 || ms <= 0) {
      this.skip = 8;
      this.slow = 0;
      this.smooth = 0;
      return false;
    }
    if (this.skip > 0) {
      this.skip--;
      return false;
    }
    this.ema += (ms - this.ema) * 0.12;
    const dt = ms / 1000;
    if (this.ema > SLOW_MS) {
      this.slow += dt;
      this.smooth = 0;
    } else if (this.ema <= SMOOTH_MS) {
      this.smooth += dt;
      this.slow = Math.max(0, this.slow - dt);
    } else {
      this.smooth = 0;
      this.slow = Math.max(0, this.slow - dt);
    }
    if (this.slow >= DOWN_AFTER && this.scale > MIN_SCALE) {
      this.scale = Math.max(MIN_SCALE, this.scale * STEP);
      this.slow = 0;
      this.smooth = 0;
      this.skip = 10;
      this.ema = 16.7;
      return true;
    }
    if (this.smooth >= UP_AFTER && this.scale < this.max && this.ups < MAX_UPS) {
      this.scale = Math.min(this.max, this.scale / STEP);
      this.ups++;
      this.smooth = 0;
      this.skip = 10;
      return true;
    }
    return false;
  }
}
