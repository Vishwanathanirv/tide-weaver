/**
 * Clip recorder: always keeps the last few seconds of play, framed for a phone (9:16), so one
 * tap can save it. Browsers cannot cut a rolling recording, so two recorders run staggered by
 * half a window, each restarting every `WINDOW` seconds. Saving stops the one with the most
 * footage (between half a window and a full one), which gives a complete, playable file.
 */
const WINDOW = 10000;
const MIN = 1500;

// Chrome and Firefox record WebM. Safari records MP4 (H.264 and AAC), and newer Safari also WebM,
// so the list names MP4 with codecs first for Safari and the plain forms as a fallback.
const TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/webm", "video/mp4"];

export interface Clip {
  blob: Blob;
  seconds: number;
  ext: string;
}

interface Slot {
  rec: MediaRecorder | null;
  chunks: BlobPart[];
  since: number;
  timer: number;
}

export function clipsSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;
}

export class ClipRecorder {
  private slots: Slot[] = [
    { rec: null, chunks: [], since: 0, timer: 0 },
    { rec: null, chunks: [], since: 0, timer: 0 },
  ];
  private stream: MediaStream | null = null;
  /** Only the canvas's own tracks are stopped; the audio tap belongs to the game. */
  private videoTracks: MediaStreamTrack[] = [];
  private mime = "";
  private on = false;
  private stagger = 0;

  /** The canvas that is recorded: 540 x 960, redrawn by the game each frame. */
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(private audio: () => MediaStream | null) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 540;
    this.canvas.height = 960;
    this.ctx = this.canvas.getContext("2d")!;
  }

  get active(): boolean {
    return this.on;
  }

  start(): void {
    if (this.on || !clipsSupported()) return;
    this.mime = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    if (!this.mime) return;
    const video = this.canvas.captureStream(30);
    this.videoTracks = video.getVideoTracks();
    const a = this.audio();
    this.stream = new MediaStream([...video.getVideoTracks(), ...(a ? a.getAudioTracks() : [])]);
    this.on = true;
    this.begin(0);
    this.stagger = window.setTimeout(() => this.on && this.begin(1), WINDOW / 2);
  }

  stop(): void {
    this.on = false;
    window.clearTimeout(this.stagger);
    for (const s of this.slots) this.end(s, false);
    this.videoTracks.forEach((t) => t.stop());
    this.videoTracks = [];
    this.stream = null;
  }

  private begin(i: number): void {
    const s = this.slots[i];
    if (!this.on || !this.stream) return;
    // Each recorder owns its chunk list: a stopped recorder's last data arrives after the next
    // one has started, and must not land in the new file.
    const chunks: BlobPart[] = [];
    s.chunks = chunks;
    try {
      const rec = new MediaRecorder(this.stream, { mimeType: this.mime, videoBitsPerSecond: 2_500_000 });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(250);
      s.rec = rec;
      s.since = performance.now();
      window.clearTimeout(s.timer);
      s.timer = window.setTimeout(() => {
        this.end(s, false);
        this.begin(i);
      }, WINDOW);
    } catch {
      s.rec = null;
    }
  }

  private end(s: Slot, keep: boolean): Promise<Blob | null> {
    window.clearTimeout(s.timer);
    const rec = s.rec;
    const chunks = s.chunks;
    s.rec = null;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(keep && chunks.length ? new Blob(chunks, { type: this.mime.split(";")[0] }) : null);
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
  }

  /** Saves what has been recorded so far (up to the window) as a file, then keeps recording. */
  async save(): Promise<Clip | null> {
    if (!this.on) return null;
    const now = performance.now();
    let best = -1;
    let age = 0;
    this.slots.forEach((s, i) => {
      if (s.rec && now - s.since > age) {
        age = now - s.since;
        best = i;
      }
    });
    if (best < 0 || age < MIN) return null;
    const s = this.slots[best];
    const blob = await this.end(s, true);
    this.begin(best);
    if (!blob) return null;
    return { blob, seconds: Math.round(age / 100) / 10, ext: this.mime.startsWith("video/mp4") ? "mp4" : "webm" };
  }
}
