/**
 * Procedural score. Nothing is pre-recorded: a pad drone follows your speed, rain and wind follow
 * the weather, and every dive, ring and apex plays a pentatonic note on the instrument of the
 * shore you are crossing, quantised to an eighth-note grid so a run always sounds like music.
 */

const PENTA = [0, 2, 4, 7, 9];
const ROOT = 62; // D4: the melody stays in D major pentatonic, so any note fits any chord.
const CHORDS = [
  [50, 57, 66], // D  : twilight
  [47, 54, 62], // Bm : moonlit
  [45, 52, 59], // A  : aurora
  [43, 50, 59], // G  : dawn
  [40, 47, 55], // Em : rain
];
const GRID = 60 / 88 / 2;

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
  private musicLevel = 0.8;
  private notesLevel = 0.9;
  private notes!: GainNode;
  private send!: GainNode;
  private padGain!: GainNode;
  private padFilter!: BiquadFilterNode;
  private padOsc: OscillatorNode[] = [];
  private rainGain!: GainNode;
  private windGain!: GainNode;
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
  get gridOrigin(): number {
    return this.t0;
  }
  /** 0..1: how much of the old string pad sits under the lo-fi keys. */
  padLevel = 0.45;

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
    this.master.connect(comp).connect(ctx.destination);

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

    this.rainGain = this.loopNoise("bandpass", 2600, 0.6);
    this.windGain = this.loopNoise("lowpass", 420, 0.4);
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

  suspend(): void {
    if (this.ctx && this.ctx.state === "running") this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  /** Continuous layers, called every frame. */
  update(speed: number, style: number, rain: number, airborne: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const sp = Math.min(1, speed / 1800);
    this.padGain.gain.setTargetAtTime((0.018 + sp * 0.03) * this.padLevel, t, 0.4);
    this.padFilter.frequency.setTargetAtTime(380 + sp * 1300 + (airborne ? 250 : 0), t, 0.3);
    this.windGain.gain.setTargetAtTime(sp * sp * 0.05, t, 0.2);
    this.rainGain.gain.setTargetAtTime(rain * 0.07, t, 0.8);
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
    // The song is kept even when sound is off, so every run has a share card.
    this.song.push(Math.max(0, Math.min(14, Math.round(degree))));
    if (this.song.length > 32) this.song.shift();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const when = this.nextSlot() + later * GRID;
    const midi = degreeToMidi(degree);
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

  /** The light going out: a short falling phrase. */
  fade(): void {
    this.note(9, 0, 0.6);
    this.note(7, 0, 0.5, 1);
    this.note(4, 0, 0.45, 2);
    this.note(2, 0, 0.4, 4);
  }
}
