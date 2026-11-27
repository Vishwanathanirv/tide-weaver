/**
 * The harmonic bed: a slow four-chord progression in D Lydian (Dmaj9, E6/D, C#m7, F#m9, four bars
 * each at 88 BPM) played by five stems that crossfade continuously with how you ride:
 *   base    felt-piano chords, always on
 *   speed   harp arpeggio on the eighth-note grid, grows with speed
 *   flow    round sub-bass pulse and brushed percussion, grows with the multiplier from x1.5
 *   sky     glass-bell harmonics and an airy pad, bloom with altitude
 *   abyss   a low-pass sweep to 250 Hz over everything and a cello swell, when you dive
 * It shares the AudioContext, the grid clock and the music bus with `Score`, so everything stays in time.
 * Nothing is pre-recorded. A ring or landing chime ducks the whole bed for 80 ms so it sparkles on top.
 */
import type { Score } from "./audio";

const GRID = 60 / 88 / 2;
const BAR = 8;
const CHORD_STEPS = BAR * 4;

/** MIDI voicings, bass first. */
export const PROGRESSION: readonly (readonly number[])[] = [
  [50, 57, 61, 64, 66], // Dmaj9
  [50, 56, 59, 61, 64], // E6/D
  [49, 56, 59, 64, 68], // C#m7
  [54, 57, 61, 64, 68], // F#m9
];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface Mix {
  speed: number;
  /** Score multiplier, 1 and up. */
  mult: number;
  /** 0..1 into the stratosphere. */
  strato: number;
  /** 0..1 height above the water. */
  air: number;
  /** 0..1 depth below the water. */
  depth: number;
  live: boolean;
}

/** Stem levels (0..1) for a mix. Pure, so it can be tested. */
export function stemLevels(m: Mix): { base: number; speed: number; flow: number; sky: number; abyss: number } {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return {
    base: m.live ? 1 : 0.7,
    speed: c((m.speed - 0.15) / 0.6),
    flow: c((m.mult - 1.5) / 1.5),
    sky: c(Math.max(m.strato, (m.air - 0.35) / 0.65)),
    abyss: c(m.depth * 1.6),
  };
}

/** Low-pass cutoff of the whole bed: open up top, 250 Hz at depth. */
export const cutoffFor = (depth: number): number => 9000 * Math.pow(250 / 9000, Math.max(0, Math.min(1, depth)));

export class Harmony {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private filter!: BiquadFilterNode;
  private g!: { base: GainNode; speed: GainNode; flow: GainNode; sky: GainNode; abyss: GainNode };
  private lv = { base: 0, speed: 0, flow: 0, sky: 0, abyss: 0 };
  private step = -1;
  private nextAt = 0;
  private arp = 0;

  constructor(private score: Score) {
    // A chime on the effects bus ducks this bed.
    score.onSparkle = () => this.duck();
  }

  private init(): boolean {
    if (this.ctx) return true;
    const ctx = this.score.context;
    if (!ctx) return false;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 9000;
    this.filter.Q.value = 0.5;
    this.out.connect(this.filter).connect(this.score.musicBus);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    this.filter.connect(send).connect(this.score.reverbSend);
    const mk = (v: number): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      n.connect(this.out);
      return n;
    };
    this.g = { base: mk(0), speed: mk(0), flow: mk(0), sky: mk(0), abyss: mk(0) };
    this.step = Math.max(0, Math.ceil((ctx.currentTime - this.score.gridOrigin) / GRID));
    this.nextAt = this.score.gridOrigin + this.step * GRID;
    return true;
  }

  /** Dips the bed for 80 ms. */
  duck(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0.55, t, 0.012);
    this.out.gain.setTargetAtTime(1, t + 0.08, 0.07);
  }

  /** Called every frame. Cheap when sound is not unlocked. */
  update(m: Mix): void {
    if (!this.init() || !this.ctx || this.ctx.state !== "running") return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const lv = stemLevels(m);
    this.lv = lv;
    this.g.base.gain.setTargetAtTime(0.9 * lv.base, t, 0.4);
    this.g.speed.gain.setTargetAtTime(0.75 * lv.speed, t, 0.5);
    this.g.flow.gain.setTargetAtTime(0.8 * lv.flow, t, 0.6);
    this.g.sky.gain.setTargetAtTime(0.8 * lv.sky, t, 0.8);
    this.g.abyss.gain.setTargetAtTime(0.8 * lv.abyss, t, 0.8);
    this.filter.frequency.setTargetAtTime(cutoffFor(m.depth), t, 0.35);
    // Schedule a quarter second ahead on the shared grid.
    let guard = 0;
    while (this.nextAt < t + 0.25 && guard++ < 16) {
      if (this.nextAt >= t - 0.05) this.play(this.step, this.nextAt);
      this.step++;
      this.nextAt = this.score.gridOrigin + this.step * GRID;
    }
  }

  private play(step: number, when: number): void {
    const chord = PROGRESSION[Math.floor(step / CHORD_STEPS) % PROGRESSION.length];
    const inChord = step % CHORD_STEPS;
    const inBar = step % BAR;
    const lv = this.lv;
    // Base: the chord struck like a felt piano, rolled by 38 ms, restruck softly on the third bar.
    if (inChord === 0 || inChord === 2 * BAR) {
      const soft = inChord === 0 ? 1 : 0.55;
      for (let i = 0; i < chord.length; i++) this.felt(hz(chord[i] + (i === 0 ? 0 : 0)), 0.2 * soft * (i === 0 ? 1.1 : 0.8), when + i * 0.038, this.g.base);
    }
    // Speed: a harp arpeggio over the chord tones, an octave up.
    if (lv.speed > 0.04 && inBar % 1 === 0) {
      const tones = chord.slice(1);
      const k = [0, 1, 2, 3, 2, 1, 3, 2][(this.arp++) % 8] % tones.length;
      this.pluck(hz(tones[k] + 12), 0.15 * (0.5 + 0.5 * lv.speed), when, this.g.speed);
    }
    // Flow: a sub-bass pulse on beats 1 and 3, brushes on 2 and 4.
    if (lv.flow > 0.04) {
      if (inBar === 0 || inBar === 4) this.sub(hz(chord[0] - 12), 0.5, when, this.g.flow);
      if (inBar === 2 || inBar === 6) this.brush(when, 0.5, this.g.flow);
    }
    // Sky: glass bells on the top tones, an airy pad swell on each chord.
    if (lv.sky > 0.04) {
      if (inBar === 0 || inBar === 3 || inBar === 5) this.bell(hz(chord[(inBar + 2) % chord.length] + 24), 0.1, when, this.g.sky);
      if (inChord === 0) this.air(chord, when, this.g.sky);
    }
    // Abyss: a cello swell under each chord.
    if (lv.abyss > 0.04 && inChord === 0) this.cello(hz(chord[0] - 12), when, this.g.abyss);
  }

  private osc(type: OscillatorType, f: number, when: number, attack: number, hold: number, release: number, peak: number, dest: AudioNode, detune = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    g.gain.setValueAtTime(Math.max(0.0002, peak), when + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + hold + release);
    o.connect(g).connect(dest);
    o.start(when);
    o.stop(when + attack + hold + release + 0.05);
  }

  private felt(f: number, v: number, when: number, dest: AudioNode): void {
    this.osc("triangle", f, when, 0.006, 0, 3.6, v, dest, -4);
    this.osc("sine", f * 2, when, 0.004, 0, 1.6, v * 0.3, dest, 4);
    this.osc("sine", f * 4.01, when, 0.002, 0, 0.5, v * 0.08, dest);
  }

  private pluck(f: number, v: number, when: number, dest: AudioNode): void {
    this.osc("triangle", f, when, 0.003, 0, 1.2, v, dest);
    this.osc("sine", f * 3, when, 0.002, 0, 0.25, v * 0.2, dest);
  }

  private sub(f: number, v: number, when: number, dest: AudioNode): void {
    this.osc("sine", f, when, 0.015, 0.12, 0.5, v, dest);
  }

  private brush(when: number, v: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.score.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5200;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.1 * v, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    src.connect(bp).connect(g).connect(dest);
    src.start(when, Math.random() * 0.5);
    src.stop(when + 0.2);
  }

  private bell(f: number, v: number, when: number, dest: AudioNode): void {
    this.osc("sine", f, when, 0.002, 0, 3, v, dest);
    this.osc("sine", f * 2.76, when, 0.002, 0, 1.4, v * 0.35, dest);
    this.osc("sine", f * 5.4, when, 0.001, 0, 0.6, v * 0.12, dest);
  }

  private air(chord: readonly number[], when: number, dest: AudioNode): void {
    for (let i = 1; i < chord.length; i++) this.osc("sine", hz(chord[i] + 12), when, 2.4, 3.5, 5, 0.035, dest, i * 5 - 10);
  }

  private cello(f: number, when: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    lp.connect(dest);
    this.osc("sawtooth", f, when, 2.4, 3.2, 5.5, 0.09, lp, -6);
    this.osc("sawtooth", f, when, 2.4, 3.2, 5.5, 0.09, lp, 6);
  }
}
