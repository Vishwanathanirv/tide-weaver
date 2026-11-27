/**
 * Procedural score. Nothing is pre-recorded: a pad drone follows your speed, rain and wind follow
 * the weather, and every dive, ring and apex plays a pentatonic note on the instrument of the
 * shore you are crossing, quantised to an eighth-note grid so a run always sounds like music.
 */

const PENTA = [0, 2, 4, 7, 9];
/** Semitones above the root for scale degrees 1 2 3 5 6 8 9. */
const CHAIN = [0, 2, 4, 7, 9, 12, 14];
const ROOT = 62; // D4: the melody stays in D major pentatonic, so any note fits any chord.
const CHORDS = [
  [50, 57, 61], // Dmaj7 : twilight
  [47, 57, 62], // Bm7   : moonlit
  [45, 52, 56], // Amaj7 : aurora
  [43, 50, 54], // Gmaj7 : dawn
  [40, 50, 55], // Em7   : rain
];
const GRID = 60 / 88 / 2;

/**
 * The Tide-Weaver motif: five notes that rise to the crest and settle (F#4 A4 D5 B4 A4).
 * Scale degrees and eighth-note offsets. It opens the first ride, answers every fifth perfect dive
 * in a streak, and swells for the big moments.
 */
export const MOTIF: readonly (readonly [number, number])[] = [
  [7, 0],
  [8, 1],
  [10, 2],
  [9, 4],
  [8, 6],
];

export const INSTRUMENTS = ["harp", "glass", "reed", "strings"] as const;

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function degreeToMidi(deg: number): number {
  const d = Math.max(0, Math.min(14, Math.round(deg)));
  return ROOT - 12 + 12 * Math.floor(d / 5) + PENTA[d % 5];
}

export class Score {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private muffle!: BiquadFilterNode;
  private musicLevel = 0.8;
  private notesLevel = 0.9;
  private notes!: GainNode;
  private send!: GainNode;
  private padGain!: GainNode;
  private padFilter!: BiquadFilterNode;
  private padOsc: OscillatorNode[] = [];
  private rainGain!: GainNode;
  private windGain!: GainNode;
  private whaleGain!: GainNode;
  private rumbleNoise!: GainNode;
  private rumbleSub!: GainNode;
  private grindGain!: GainNode;
  /** 0..1: how far into the stratosphere the spirit is. */
  private strato = 0;
  private nextBeat = 0;
  private whaleOsc!: OscillatorNode;
  private tap: MediaStreamAudioDestinationNode | null = null;
  private noise!: AudioBuffer;
  private t0 = 0;
  private slot = -1;
  private inSlot = 0;
  private chord = -1;
  private muted = false;
  /** The last notes played, as scale degrees, for the share card. */
  readonly song: number[] = [];

  /** Shared with the lo-fi engine so both play on one clock and one mix. */
  get context(): AudioContext | null {
    return this.ctx;
  }
  get musicBus(): GainNode {
    return this.music;
  }
  get effectsBus(): GainNode {
    return this.notes;
  }
  get reverbSend(): GainNode {
    return this.send;
  }
  get noiseBuffer(): AudioBuffer {
    return this.noise;
  }
  /** The mix as a media stream, for recording clips with sound. Null until sound is unlocked. */
  get stream(): MediaStream | null {
    return this.tap ? this.tap.stream : null;
  }
  get gridOrigin(): number {
    return this.t0;
  }
  /** 0..1: how much of the old string pad sits under the lo-fi keys. */
  padLevel = 0.22;

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  /** Browsers only allow sound after a gesture; call this from one. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: "interactive" });
    this.ctx = ctx;
    this.t0 = ctx.currentTime;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    // Underwater muffle: a low-pass that closes when you plunge.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = "lowpass";
    this.muffle.frequency.value = 20000;
    this.master.connect(this.muffle).connect(comp).connect(ctx.destination);
    // A copy of the final mix for the clip recorder.
    this.tap = ctx.createMediaStreamDestination();
    comp.connect(this.tap);

    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(ctx, 3.2);
    this.send = ctx.createGain();
    this.send.gain.value = 0.42;
    this.send.connect(verb).connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = this.musicLevel;
    this.music.connect(this.master);

    this.notes = ctx.createGain();
    this.notes.gain.value = 0.5 * this.notesLevel;
    this.notes.connect(this.master);
    this.notes.connect(this.send);

    // Pad: three detuned saw pairs through a soft low-pass, like a bowed section far away.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 500;
    this.padFilter.Q.value = 0.6;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.music);
    this.padGain.connect(this.send);
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.detune.value = i % 2 ? 7 : -7;
      o.frequency.value = hz(CHORDS[0][i >> 1]);
      o.connect(this.padFilter);
      o.start();
      this.padOsc.push(o);
    }
    this.chord = 0;

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // The deep: a slow sine and its octave that glide like a whale call, silent until you go down.
    this.whaleGain = ctx.createGain();
    this.whaleGain.gain.value = 0;
    this.whaleOsc = ctx.createOscillator();
    this.whaleOsc.type = "sine";
    this.whaleOsc.frequency.value = 74;
    const whaleHi = ctx.createOscillator();
    whaleHi.type = "sine";
    whaleHi.frequency.value = 148;
    const hiGain = ctx.createGain();
    hiGain.gain.value = 0.35;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 16;
    lfo.connect(lfoDepth);
    lfoDepth.connect(this.whaleOsc.frequency);
    lfoDepth.connect(whaleHi.frequency);
    this.whaleOsc.connect(this.whaleGain);
    whaleHi.connect(hiGain).connect(this.whaleGain);
    this.whaleGain.connect(this.music);
    this.whaleGain.connect(this.send);
    this.whaleOsc.start();
    whaleHi.start();
    lfo.start();

    this.rainGain = this.loopNoise("bandpass", 2600, 0.6);
    this.windGain = this.loopNoise("lowpass", 420, 0.4);
    // The tidal wave's rumble (sub-bass plus low noise), and the sizzle of grinding a sky-rail.
    this.rumbleNoise = this.loopNoise("lowpass", 110, 0.8);
    this.grindGain = this.loopNoise("bandpass", 3400, 1.6);
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 38;
    this.rumbleSub = ctx.createGain();
    this.rumbleSub.gain.value = 0;
    sub.connect(this.rumbleSub).connect(this.music);
    sub.start();
  }

  private loopNoise(type: BiquadFilterType, freq: number, q: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.music);
    src.start();
    return g;
  }

  private impulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.08);
  }

  setVolumes(music: number, notes: number): void {
    this.musicLevel = music;
    this.notesLevel = notes;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(music, t, 0.05);
    this.notes.gain.setTargetAtTime(0.5 * notes, t, 0.05);
  }

  /** 0..1: height into the thin air above the clouds. */
  setStrato(k: number): void {
    this.strato = Math.max(0, Math.min(1, k));
  }

  /** The tidal wave closing in: a sub-bass rumble that grows with `k` (0 far, 1 on top of you). */
  setRumble(k: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rumbleNoise.gain.setTargetAtTime(0.2 * k, t, 0.25);
    this.rumbleSub.gain.setTargetAtTime(0.05 * k + 0.28 * k * k, t, 0.25);
  }

  /** The sizzle of a board on a sky-rail. */
  setGrind(on: boolean, speed01 = 0): void {
    if (!this.ctx) return;
    this.grindGain.gain.setTargetAtTime(on ? 0.04 + 0.05 * Math.min(1, speed01) : 0, this.ctx.currentTime, 0.05);
  }

  private thump(when: number, v: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(72, when);
    o.frequency.exponentialRampToValueAtTime(38, when + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(v, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    o.connect(g).connect(this.notes);
    o.start(when);
    o.stop(when + 0.25);
  }

  /** Locking onto a sky-rail: a bright rising ping. */
  railOn(): void {
    this.note(9, 1, 0.8);
    this.note(12, 1, 0.7, 1);
    this.whoosh(0.9);
  }

  /** A whirlpool: a swirl of rising tone as it spins you, then a burst as it fires you out. */
  whirl(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(this.notes);
    o.start(t);
    o.stop(t + 0.75);
  }

  /** A Spirit Blessing: a full, slow chord of bells. */
  bless(): void {
    this.note(4, 1, 0.8);
    this.note(7, 1, 0.75, 0);
    this.note(9, 1, 0.7, 0);
    this.note(12, 1, 0.7, 2);
    this.note(14, 1, 0.65, 3);
    this.thud(0.4);
  }

  /** Lightning inside a thunderhead: a short crackle. */
  zap(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 3800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    s.connect(f).connect(g).connect(this.notes);
    s.start(t, Math.random());
    s.stop(t + 0.2);
  }

  /** The Leviathan's rune ring: a deep boom and the melody. */
  rune(): void {
    this.thud(1);
    this.motif(0, true);
  }

  setUnderwater(on: boolean): void {
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(on ? 700 : 20000, this.ctx.currentTime, on ? 0.05 : 0.15);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === "running") this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  /** Continuous layers, called every frame. */
  update(speed: number, style: number, rain: number, airborne: boolean, air = 0, depth = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const sp = Math.min(1, speed / 1800);
    // High up the score thins to air and chimes; down in the abyss it warms and the deep sings.
    // In the stratosphere the sea falls silent: the music and the wind drop away, and only chimes and a heartbeat remain.
    const calm = 1 - this.strato;
    this.music.gain.setTargetAtTime(this.musicLevel * (1 - 0.85 * this.strato), t, 0.3);
    this.padGain.gain.setTargetAtTime((0.018 + sp * 0.03) * this.padLevel * (1 - 0.55 * air) * (1 + 0.5 * depth) * calm, t, 0.4);
    if (this.strato > 0.08 && t >= this.nextBeat) {
      this.thump(t + 0.02, 0.32 * this.strato);
      this.thump(t + 0.2, 0.2 * this.strato);
      this.nextBeat = t + 1.15 - 0.35 * this.strato;
    }
    this.padFilter.frequency.setTargetAtTime((380 + sp * 1300 + (airborne ? 250 : 0) + air * 1400) * (1 - 0.5 * depth), t, 0.3);
    this.send.gain.setTargetAtTime(0.42 + 0.38 * air + 0.12 * depth, t, 0.5);
    this.whaleGain.gain.setTargetAtTime(0.06 * depth * depth + 0.012 * depth, t, 0.8);
    this.whaleOsc.frequency.setTargetAtTime(66 + 22 * (1 - depth), t, 1.5);
    this.windGain.gain.setTargetAtTime(sp * sp * 0.05 * calm, t, 0.2);
    this.rainGain.gain.setTargetAtTime(rain * 0.07 * calm, t, 0.8);
    if (style !== this.chord) {
      this.chord = style;
      const ch = CHORDS[style];
      for (let i = 0; i < 6; i++) this.padOsc[i].frequency.setTargetAtTime(hz(ch[i >> 1]), t, 1.2);
    }
  }

  /** The next free eighth-note slot; at most three notes share one. */
  private nextSlot(): number {
    const ctx = this.ctx!;
    const n = Math.ceil((ctx.currentTime + 0.015 - this.t0) / GRID);
    if (n > this.slot) {
      this.slot = n;
      this.inSlot = 0;
    }
    if (this.inSlot >= 3) {
      this.slot++;
      this.inSlot = 0;
    }
    this.inSlot++;
    return this.t0 + this.slot * GRID;
  }

  note(degree: number, instrument: number, velocity = 1, later = 0): void {
    this.remember(degree);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    this.play(degree, instrument, velocity, this.nextSlot() + later * GRID);
  }

  /** Rising pitch chain on consecutive rings and clean landings: 1 2 3 5 6 8 9 of the D major scale, then it holds. */
  chain(step: number, instrument = 1, velocity = 0.9, later = 0): void {
    const i = Math.max(0, Math.min(CHAIN.length - 1, Math.floor(step)));
    this.remember(i * 2);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    this.onSparkle?.();
    this.playMidi(ROOT + 12 + CHAIN[i], instrument, velocity * (0.85 + 0.03 * i), this.nextSlot() + later * GRID);
  }

  /** A dead-centre ring: a warm sub thump, a held breath of 30 ms, then the 5th and octave as a bell. */
  centre(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    this.onSparkle?.();
    this.voice("sine", hz(ROOT - 24), 0.34, 0.004, 0.45, t);
    this.voice("sine", hz(ROOT + 19), 0.2, 0.002, 1.6, t + 0.03);
    this.voice("sine", hz(ROOT + 24), 0.13, 0.002, 1.2, t + 0.03);
  }

  /** Set by the harmonic bed so it can duck under a chime. */
  onSparkle: (() => void) | null = null;

  /** The song is kept even when sound is off, so every run has a share card. */
  private remember(degree: number): void {
    this.song.push(Math.max(0, Math.min(14, Math.round(degree))));
    if (this.song.length > 32) this.song.shift();
  }

  private play(degree: number, instrument: number, velocity: number, when: number): void {
    this.playMidi(degreeToMidi(degree), instrument, velocity, when);
  }

  private playMidi(midi: number, instrument: number, velocity: number, when: number): void {
    const v = 0.22 * velocity;
    const f = hz(midi);
    switch (instrument) {
      case 1:
        this.voice("sine", f, v, 0.003, 2.6, when);
        this.voice("sine", f * 2.76, v * 0.28, 0.002, 1.2, when);
        this.voice("sine", f * 5.4, v * 0.1, 0.001, 0.6, when);
        break;
      case 2:
        this.reed(f, v, when);
        break;
      case 3:
        this.pluck(f / 2, v * 1.2, when);
        break;
      default:
        this.voice("triangle", f, v, 0.004, 1.5, when);
        this.voice("sine", f * 2, v * 0.25, 0.004, 0.8, when);
    }
  }

  private voice(type: OscillatorType, f: number, v: number, attack: number, decay: number, when: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(v, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    o.connect(g).connect(this.notes);
    o.start(when);
    o.stop(when + attack + decay + 0.05);
  }

  private reed(f: number, v: number, when: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.value = f * 0.006;
    lfo.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(v, when + 0.07);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.1);
    o.connect(g).connect(this.notes);
    o.start(when);
    lfo.start(when);
    o.stop(when + 1.2);
    lfo.stop(when + 1.2);
    // A breath of air at the start of each reed note.
    const b = ctx.createBufferSource();
    b.buffer = this.noise;
    const bf = ctx.createBiquadFilter();
    bf.type = "bandpass";
    bf.frequency.value = f * 2;
    bf.Q.value = 2;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(v * 0.5, when);
    bg.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    b.connect(bf).connect(bg).connect(this.notes);
    b.start(when, Math.random());
    b.stop(when + 0.2);
  }

  private pluck(f: number, v: number, when: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(3200, when);
    lp.frequency.exponentialRampToValueAtTime(260, when + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(v, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.9);
    o.connect(lp).connect(g).connect(this.notes);
    o.start(when);
    o.stop(when + 1);
  }

  /** A soft splash for a rough landing: unpitched, so it never breaks the music. */
  splash(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    s.connect(f).connect(g).connect(this.notes);
    s.start(t, Math.random());
    s.stop(t + 0.5);
  }

  /** Air rushing past at the start of a dive, louder the faster you go. */
  whoosh(intensity: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || intensity < 0.15) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(380, t);
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * Math.min(1, intensity), t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    s.connect(f).connect(g).connect(this.notes);
    s.start(t, Math.random());
    s.stop(t + 0.45);
  }

  /** A rising bell phrase for a kilometre or a new tier. */
  milestone(): void {
    this.note(9, 1, 0.75);
    this.note(12, 1, 0.65, 1);
    this.note(14, 1, 0.55, 2);
  }

  /**
   * Plays the motif. A whisper is soft and on the shore's instrument; a swell rings it on glass bells,
   * doubled an octave down on the harp, over a low root.
   */
  motif(instrument: number, swell = false): void {
    for (const [d] of MOTIF) this.remember(d);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    // One downbeat for the whole phrase, so the rhythm holds however busy the grid is.
    const base = this.nextSlot();
    const v = swell ? 0.85 : 0.42;
    for (const [d, at] of MOTIF) {
      this.play(d, swell ? 1 : instrument, v, base + at * GRID);
      if (swell) this.play(d - 5, 0, v * 0.5, base + at * GRID);
    }
    if (swell) this.play(0, 3, 0.7, base);
  }

  /** A body hitting water: a dropping sub thud and a rush of low noise. `weight` 0..1 is how hard. */
  thud(weight: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const w = Math.max(0.1, Math.min(1, weight));
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * w, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(this.notes);
    o.start(t);
    o.stop(t + 0.6);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900 + 1400 * w, t);
    f.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.2 * w, t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    n.connect(f).connect(ng).connect(this.notes);
    n.start(t, Math.random());
    n.stop(t + 0.65);
  }

  /** Entering the water at a shallow angle: a silky hiss that rises and fades. */
  skim(speed: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(5200, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 + 0.05 * Math.min(1, speed / 1600), t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    s.connect(f).connect(g).connect(this.notes);
    s.start(t, Math.random());
    s.stop(t + 0.75);
  }

  /** A single high bell for the thin air up high. */
  chime(degree: number, velocity: number): void {
    this.note(degree, 1, velocity, 1);
  }

  /** A Surge: air tearing past and a rising bell, so the burst is felt as well as seen. */
  surge(): void {
    this.whoosh(1.4);
    this.note(7, 1, 0.8);
    this.note(10, 1, 0.7, 1);
    this.note(14, 1, 0.6, 2);
  }

  /** The light going out: a short falling phrase. */
  fade(): void {
    this.note(9, 0, 0.6);
    this.note(7, 0, 0.5, 1);
    this.note(4, 0, 0.45, 2);
    this.note(2, 0, 0.4, 4);
  }
}
