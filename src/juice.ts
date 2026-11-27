import type { StepEvents } from "./physics";

/**
 * Module 2: game juice that never touches the simulation's results.
 *
 * Hit-stop pauses real time for a few milliseconds; the physics still runs the same fixed steps
 * in the same order afterwards, so a seed and an input sequence always give the same run.
 * Callouts are short reactions to how a move went: "clean" for a dead-centre ring or a razor
 * perfect, "inches" for a near miss, "skill issue" for a belly flop.
 */

export type CalloutKind = "clean" | "inches" | "skill" | "lock";

export interface Callout {
  text: string;
  kind: CalloutKind;
  big: boolean;
}

const COOLDOWN: Record<CalloutKind, number> = { clean: 1.6, inches: 3.5, skill: 8, lock: 0 };
const CENTRE = 0.6;
const RAZOR = 0.06;
const PERFECT_WINDOW = 0.3;
const INCHES_WINDOW = 0.4;

export class Juice {
  private stop = 0;
  private last: Record<CalloutKind, number> = { clean: -99, inches: -99, skill: -99, lock: -99 };
  /** Set by react() when the last ring was crossed dead centre. */
  centreHit = false;

  /** Freeze the world for `ms` milliseconds of real time. */
  freeze(ms: number): void {
    this.stop = Math.max(this.stop, ms / 1000);
  }

  /** Real seconds to feed the simulation this frame: zero while frozen. */
  consume(dt: number): number {
    if (this.stop <= 0) return dt;
    const used = Math.min(this.stop, dt);
    this.stop -= used;
    return dt - used;
  }

  get frozen(): boolean {
    return this.stop > 0;
  }

  reset(): void {
    this.stop = 0;
    this.centreHit = false;
    for (const k of Object.keys(this.last) as CalloutKind[]) this.last[k] = -99;
  }

  private ready(kind: CalloutKind, clock: number): boolean {
    if (clock - this.last[kind] < COOLDOWN[kind]) return false;
    this.last[kind] = clock;
    return true;
  }

  /** Reads one physics step's events and returns a callout to show, if any. */
  react(ev: StepEvents, clock: number): Callout | null {
    this.centreHit = false;
    if (ev.ring && ev.ringCenter >= CENTRE) {
      this.centreHit = true;
      this.freeze(30);
      if (this.ready("clean", clock)) return { text: "clean", kind: "clean", big: true };
    }
    if (ev.landing === "perfect" && ev.landMiss < RAZOR && this.ready("clean", clock)) return { text: "clean", kind: "clean", big: false };
    if (ev.landing === "good" && ev.landMiss < INCHES_WINDOW && ev.landMiss >= PERFECT_WINDOW && this.ready("inches", clock)) return { text: "inches", kind: "inches", big: false };
    if (ev.nearMiss && this.ready("inches", clock)) return { text: "inches", kind: "inches", big: false };
    if (ev.landing === "rough" && this.ready("skill", clock)) return { text: "skill issue", kind: "skill", big: false };
    return null;
  }
}
