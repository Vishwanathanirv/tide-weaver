/**
 * Ghost racing without a server. Physics is deterministic for a seed and an input sequence, so a
 * run is fully described by when the player pressed, released and surged. That log is a few
 * hundred bytes; it travels in a link, and the other player's browser replays it on its own copy
 * of the wave as a translucent rider beside them.
 */
import { BOARD_IDS, boardOf } from "./gear";
import { makeEvents, makeSpirit, step, surge, STEP, type Spirit, type StepEvents } from "./physics";
import { Terrain } from "./terrain";

const VERSION = 2;
export const MAX_EVENTS = 1500;

export const DOWN = 0;
export const UP = 1;
export const SURGE = 2;
type Kind = typeof DOWN | typeof UP | typeof SURGE;

export interface Ghost {
  /** The wave this run was recorded on (its seed). A ghost only races on the same wave. */
  seed: number;
  /** Hazards were live (journey and daily); false for Zen. */
  hazards: boolean;
  board: string;
  /** The recorded run's final flow, shown to the racer. */
  score: number;
  /** Physics step at which the recorded run ended. */
  end: number;
  frames: number[];
  kinds: Kind[];
}

/** Records presses as they happen. Cheap: one entry per change of input. */
export class Recorder {
  frames: number[] = [];
  kinds: Kind[] = [];
  private down = false;
  /** Set once the log is full; the ghost will end where the log ends. */
  full = false;

  reset(): void {
    this.frames.length = 0;
    this.kinds.length = 0;
    this.down = false;
    this.full = false;
  }

  private push(frame: number, kind: Kind): void {
    if (this.frames.length >= MAX_EVENTS) {
      this.full = true;
      return;
    }
    this.frames.push(frame);
    this.kinds.push(kind);
  }

  /** Call every physics step, before it runs, with the input it will use. */
  hold(frame: number, hold: boolean): void {
    if (hold === this.down) return;
    this.down = hold;
    this.push(frame, hold ? DOWN : UP);
  }

  surge(frame: number): void {
    this.push(frame, SURGE);
  }

  get length(): number {
    return this.frames.length;
  }

  /** The frame after which nothing more was recorded, if the log filled up. */
  get lastFrame(): number {
    return this.frames.length ? this.frames[this.frames.length - 1] : 0;
  }
}

function writeVar(out: number[], n: number): void {
  let v = Math.max(0, Math.floor(n));
  while (v >= 128) {
    out.push((v % 128) | 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

function readVar(bytes: Uint8Array, at: { i: number }): number {
  let n = 0;
  let mul = 1;
  for (let k = 0; k < 6; k++) {
    if (at.i >= bytes.length) throw new Error("short");
    const b = bytes[at.i++];
    n += (b & 127) * mul;
    if (b < 128) return n;
    mul *= 128;
  }
  throw new Error("long");
}

const b64 = (bytes: number[]): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const unb64 = (code: string): Uint8Array => {
  const t = code.replace(/-/g, "+").replace(/_/g, "/");
  const s = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

const BOARD_INDEX = BOARD_IDS;

export function encode(g: Ghost): string {
  const out: number[] = [VERSION, (g.hazards ? 1 : 0) | (Math.max(0, BOARD_INDEX.indexOf(g.board)) << 1)];
  writeVar(out, g.seed >>> 0);
  writeVar(out, g.score);
  writeVar(out, g.end);
  writeVar(out, g.frames.length);
  let prev = 0;
  for (let i = 0; i < g.frames.length; i++) {
    writeVar(out, (g.frames[i] - prev) * 4 + g.kinds[i]);
    prev = g.frames[i];
  }
  return b64(out);
}

/** Returns null for anything that is not a well-formed ghost. Never throws. */
export function decode(code: string): Ghost | null {
  try {
    if (!/^[A-Za-z0-9_-]{4,16000}$/.test(code)) return null;
    const bytes = unb64(code);
    if (bytes[0] !== VERSION) return null;
    const flags = bytes[1];
    const at = { i: 2 };
    const seed = readVar(bytes, at);
    if (seed > 0xffffffff) return null;
    const score = readVar(bytes, at);
    const end = readVar(bytes, at);
    const n = readVar(bytes, at);
    if (n > MAX_EVENTS || end > 60 * 60 * 60) return null;
    const frames: number[] = [];
    const kinds: Kind[] = [];
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const v = readVar(bytes, at);
      const kind = (v % 4) as number;
      if (kind > SURGE) return null;
      prev += Math.floor(v / 4);
      frames.push(prev);
      kinds.push(kind as Kind);
    }
    if (at.i !== bytes.length) return null;
    return { seed, hazards: (flags & 1) === 1, board: BOARD_INDEX[flags >> 1] ?? "wake", score, end, frames, kinds };
  } catch {
    return null;
  }
}

/** Runs a recorded ghost on its own copy of the wave. Advance it with the player's step count. */
export class Replay {
  readonly terrain: Terrain;
  readonly spirit: Spirit;
  private ev: StepEvents = makeEvents();
  private next = 0;
  private holding = false;
  /** The ghost has reached the end of its run, or wiped out. */
  done = false;

  constructor(
    readonly ghost: Ghost,
    seed: number,
  ) {
    this.terrain = new Terrain(seed);
    const b = boardOf(ghost.board);
    this.spirit = makeSpirit(this.terrain, b.dive, b.flip, b.reach);
  }

  /** Steps the ghost until it has taken `frames` physics steps in total. */
  advance(frames: number): void {
    const g = this.ghost;
    while (!this.done && this.spirit.frames < frames) {
      const f = this.spirit.frames;
      while (this.next < g.frames.length && g.frames[this.next] <= f) {
        const k = g.kinds[this.next++];
        if (k === DOWN) this.holding = true;
        else if (k === UP) this.holding = false;
        else surge(this.spirit);
      }
      step(this.spirit, this.terrain, this.holding, this.ev, STEP, g.hazards);
      if (this.spirit.frames >= g.end || this.ev.crash) this.done = true;
    }
  }
}
