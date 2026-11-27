import type { Score } from "./audio";

/**
 * Module 1: a procedural lo-fi loop that grows with your flow.
 *
 * - Always: dusty electric-piano chords (Dmaj9, Bm9, Gmaj7, A6/9) and vinyl crackle.
 * - Multiplier ×1.5: swung hi-hats and a soft kick.
 * - Multiplier ×3.0, "LOCKED IN": a sub drop, then bass and snare.
 * - While surfing the water: a white-noise skim that follows your speed.
 *
 * It shares the Score's AudioContext and its 88 BPM grid, so melody notes, chords and drums all
 * land on the same beat. Nothing here touches physics, so seeds stay deterministic.
 */

const BPM = 88;
const SIXTEENTH = 60 / BPM / 4;
const BAR = SIXTEENTH * 16;
const LOOKAHEAD = 0.18;

const CHORDS = [
  [50, 54, 57, 61, 64], // Dmaj9
  [47, 50, 54, 57, 61], // Bm9
  [43, 47, 50, 54, 57], // Gmaj7(9)
  [45, 49, 52, 54, 59], // A6/9
];
const ROOTS = [38, 35, 31, 33];

const HATS_ON = 1.5;
const HATS_OFF = 1.3;
const LOCK_ON = 3.0;
const LOCK_OFF = 2.6;

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class LoFi {
  private ctx: AudioContext | null = null;
  private keys!: GainNode;
  private hats!: GainNode;
  private lock!: GainNode;
  private crackle!: GainNode;
  private skimGain!: GainNode;
  private skimFilter!: BiquadFilterNode;
  private analyser!: AnalyserNode;
  private wave = new Float32Array(256);
  private step = 0;
  private nextTime = 0;
  private hatsOn = false;
  private lockOn = false;
  private playing = false;

  constructor(private score: Score) {}

  get locked(): boolean {
    return this.lockOn;
  }

  /** Builds the graph the first time sound is allowed. Safe to call every frame. */
  private attach(): boolean {
    const ctx = this.score.context;
    if (!ctx || ctx.state !== "running") return false;
    if (this.ctx) return true;
    this.ctx = ctx;
    const out = this.score.musicBus;
    const mk = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    // Keys get a warm low-pass and some of the shared reverb.
    const keysTone = ctx.createBiquadFilter();
    keysTone.type = "lowpass";
    keysTone.frequency.value = 2100;
    this.keys = mk(0);
    this.keys.connect(keysTone).connect(out);
    keysTone.connect(this.score.reverbSend);
    this.hats = mk(0);
    this.hats.connect(out);
    this.lock = mk(0);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.lock.connect(this.analyser);
    this.lock.connect(out);

    // Vinyl crackle: sparse clicks over a whisper of hiss, looped.
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.04;
    for (let k = 0; k < 90; k++) {
      const at = Math.floor(Math.random() * (len - 40));
      const amp = 0.3 + Math.random() * 0.7;
      for (let j = 0; j < 30; j++) d[at + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / 6);
    }
    const crk = ctx.createBufferSource();
    crk.buffer = buf;
    crk.loop = true;
    const crkTone = ctx.createBiquadFilter();
    crkTone.type = "bandpass";
    crkTone.frequency.value = 2400;
    crkTone.Q.value = 0.5;
    this.crackle = mk(0);
    crk.connect(crkTone).connect(this.crackle).connect(out);
    crk.start();

    // Water skim: filtered white noise that opens up with speed.
    const skim = ctx.createBufferSource();
    skim.buffer = this.score.noiseBuffer;
    skim.loop = true;
    this.skimFilter = ctx.createBiquadFilter();
    this.skimFilter.type = "bandpass";
    this.skimFilter.Q.value = 0.9;
    this.skimFilter.frequency.value = 800;
    this.skimGain = mk(0);
    skim.connect(this.skimFilter).connect(this.skimGain).connect(this.score.effectsBus);
    skim.start();

    const t0 = this.score.gridOrigin;
    this.nextTime = t0 + Math.ceil((ctx.currentTime + 0.05 - t0) / BAR) * BAR;
    this.step = 0;
    return true;
  }

  /**
   * Called every frame. `mult` drives the stems; `active` is false while waiting or paused.
   * Returns "locked" or "released" on the frame LOCKED IN starts or ends.
   */
  update(mult: number, active: boolean): "locked" | "released" | null {
    if (!this.attach()) return null;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    let change: "locked" | "released" | null = null;
    if (!this.hatsOn && mult >= HATS_ON) this.hatsOn = true;
    else if (this.hatsOn && mult < HATS_OFF) this.hatsOn = false;
    if (!this.lockOn && mult >= LOCK_ON) {
      this.lockOn = true;
      change = "locked";
      this.drop();
    } else if (this.lockOn && mult < LOCK_OFF) {
      this.lockOn = false;
      change = "released";
    }
    if (active !== this.playing) this.playing = active;
    this.keys.gain.setTargetAtTime(active ? 0.55 : 0.22, t, 0.6);
    this.crackle.gain.setTargetAtTime(active ? 0.5 : 0.3, t, 0.6);
    this.hats.gain.setTargetAtTime(active && this.hatsOn ? 0.5 : 0, t, 0.4);
    this.lock.gain.setTargetAtTime(active && this.lockOn ? 0.7 : 0, t, 0.25);

    // Schedule everything due inside the lookahead window.
    while (this.nextTime < t + LOOKAHEAD) {
      if (this.nextTime > t - 0.02) this.schedule(this.step, this.nextTime);
      this.nextTime += SIXTEENTH;
      this.step = (this.step + 1) % 64;
    }
    return change;
  }

  /** Continuous water skim: on while grounded, louder and brighter with speed. */
  skim(grounded: boolean, speed: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = Math.min(1, speed / 2000);
    this.skimGain.gain.setTargetAtTime(grounded ? 0.025 + sp * 0.07 : 0, t, grounded ? 0.05 : 0.12);
    this.skimFilter.frequency.setTargetAtTime(500 + sp * 2600, t, 0.08);
  }

  /** 0..1 loudness of the bass stem right now, for the waves to pulse with. */
  bass(): number {
    if (!this.ctx || !this.lockOn) return 0;
    this.analyser.getFloatTimeDomainData(this.wave);
    let sum = 0;
    for (let i = 0; i < this.wave.length; i++) sum += this.wave[i] * this.wave[i];
    return Math.min(1, Math.sqrt(sum / this.wave.length) * 6);
  }

  private schedule(step: number, when: number): void {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = CHORDS[bar];
    if (s === 0) this.chord(chord, when, BAR * 0.55, 1);
    if (s === 10) this.chord(chord, when, BAR * 0.3, 0.55);
    if (this.hatsOn) {
      const swing = s % 2 === 1 ? SIXTEENTH * 0.18 : 0;
      if (s % 2 === 0 || s % 4 === 3) this.hat(when + swing, s % 4 === 2 ? 0.9 : 0.5);
      if (s === 0 || s === 7 || s === 10) this.kick(when, s === 0 ? 1 : 0.7, this.hats);
    }
    if (this.lockOn) {
      const root = ROOTS[bar];
      if (s === 0 || s === 6 || s === 8 || s === 14) this.bassNote(hz(root + (s === 6 ? 12 : s === 14 ? 7 : 0)), when, s === 0 ? 0.6 : 0.35);
      if (s === 4 || s === 12) this.snare(when);
      if (s === 0 || s === 8) this.kick(when, 1, this.lock);
    }
  }

  private chord(notes: number[], when: number, length: number, vel: number): void {
    const ctx = this.ctx!;
    notes.forEach((m, i) => {
      // A slight strum, low to high, like fingers on keys.
      const at = when + i * 0.012;
      const f = hz(m);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.06 * vel, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.025 * vel, at + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, at + length);
      const trem = ctx.createGain();
      trem.gain.value = 1;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 4.6;
      const depth = ctx.createGain();
      depth.gain.value = 0.18;
      lfo.connect(depth).connect(trem.gain);
      for (const [mul, amp, type] of [
        [1, 1, "sine"],
        [2, 0.22, "sine"],
        [3, 0.06, "triangle"],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * mul;
        o.detune.value = (Math.random() - 0.5) * 8;
        const og = ctx.createGain();
        og.gain.value = amp;
        o.connect(og).connect(g);
        o.start(at);
        o.stop(at + length + 0.05);
      }
      g.connect(trem).connect(this.keys);
      lfo.start(at);
      lfo.stop(at + length + 0.05);
    });
  }

  private hat(when: number, vel: number): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.score.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.11 * vel, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
    s.connect(hp).connect(g).connect(this.hats);
    s.start(when, Math.random() * 1.5);
    s.stop(when + 0.06);
  }

  private kick(when: number, vel: number, bus: GainNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(115, when);
    o.frequency.exponentialRampToValueAtTime(42, when + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.32 * vel, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    o.connect(g).connect(bus);
    o.start(when);
    o.stop(when + 0.32);
  }

  private snare(when: number): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.score.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    s.connect(bp).connect(g).connect(this.lock);
    s.start(when, Math.random() * 1.5);
    s.stop(when + 0.18);
    const o = ctx.createOscillator();
    o.frequency.value = 185;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.08, when);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    o.connect(og).connect(this.lock);
    o.start(when);
    o.stop(when + 0.1);
  }

  private bassNote(f: number, when: number, vel: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = f / 2;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + SIXTEENTH * 3.5);
    o.connect(lp);
    sub.connect(lp);
    lp.connect(g).connect(this.lock);
    o.start(when);
    sub.start(when);
    o.stop(when + SIXTEENTH * 4);
    sub.stop(when + SIXTEENTH * 4);
  }

  /** The LOCKED IN drop: a falling sub and a reverse-swell of noise. */
  private drop(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(g).connect(this.score.musicBus);
    o.start(t);
    o.stop(t + 1.35);
    const n = ctx.createBufferSource();
    n.buffer = this.score.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + 0.5);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.08, t + 0.45);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    n.connect(f).connect(ng).connect(this.score.musicBus);
    n.start(t);
    n.stop(t + 0.65);
  }
}
