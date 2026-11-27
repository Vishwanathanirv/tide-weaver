/**
 * Save vault: two localStorage slots, each with a checksum and schema version. A corrupt or
 * half-written slot falls back to the other, and progress travels between devices or builds as a
 * copyable save code.
 */
export const AURAS = ["ember", "tide", "moth", "comet", "lotus", "prism"] as const;
export type Aura = (typeof AURAS)[number];

export interface Stats {
  distance: number;
  perfects: number;
  rings: number;
  bestStreak: number;
  maxAltitude: number;
  runs: number;
}

export interface SaveData {
  version: 1;
  stats: Stats;
  aura: Aura;
  unlocked: Aura[];
  muted: boolean;
  reducedMotion: boolean;
  hintSeen: boolean;
  bestEndless: number;
  bestZen: number;
  bestDistance: number;
  daily: { day: string; best: number } | null;
  achievements: string[];
  tutorialDone: boolean;
  musicVolume: number;
  notesVolume: number;
  lightParticles: boolean;
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const SLOT_A = "tide-weaver.save.a";
const SLOT_B = "tide-weaver.save.b";

export function defaults(): SaveData {
  return {
    version: 1,
    stats: { distance: 0, perfects: 0, rings: 0, bestStreak: 0, maxAltitude: 0, runs: 0 },
    aura: "ember",
    unlocked: ["ember"],
    muted: false,
    reducedMotion: typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : false,
    hintSeen: false,
    bestEndless: 0,
    bestZen: 0,
    bestDistance: 0,
    daily: null,
    achievements: [],
    tutorialDone: false,
    musicVolume: 0.8,
    notesVolume: 0.9,
    lightParticles: false,
  };
}

export function checksum(text: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
const isAura = (v: unknown): v is Aura => typeof v === "string" && (AURAS as readonly string[]).includes(v);

/** Accept only well-formed fields; anything missing or wrong falls back to defaults. */
export function sanitize(raw: unknown): SaveData {
  const d = defaults();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const st = (r.stats && typeof r.stats === "object" ? r.stats : {}) as Record<string, unknown>;
  const unlocked = Array.isArray(r.unlocked) ? r.unlocked.filter(isAura) : [];
  if (!unlocked.includes("ember")) unlocked.unshift("ember");
  const aura = isAura(r.aura) && unlocked.includes(r.aura) ? r.aura : "ember";
  const daily = r.daily && typeof r.daily === "object" ? (r.daily as Record<string, unknown>) : null;
  return {
    version: 1,
    stats: {
      distance: num(st.distance, 0),
      perfects: num(st.perfects, 0),
      rings: num(st.rings, 0),
      bestStreak: num(st.bestStreak, 0),
      maxAltitude: num(st.maxAltitude, 0),
      runs: num(st.runs, 0),
    },
    aura,
    unlocked: [...new Set(unlocked)],
    muted: r.muted === true,
    reducedMotion: typeof r.reducedMotion === "boolean" ? r.reducedMotion : d.reducedMotion,
    hintSeen: r.hintSeen === true,
    bestEndless: num(r.bestEndless, 0),
    bestZen: num(r.bestZen, 0),
    bestDistance: num(r.bestDistance, 0),
    achievements: Array.isArray(r.achievements) ? [...new Set(r.achievements.filter((a): a is string => typeof a === "string" && a.length < 32))].slice(0, 64) : [],
    tutorialDone: r.tutorialDone === true || r.hintSeen === true,
    musicVolume: Math.min(1, num(r.musicVolume, d.musicVolume)),
    notesVolume: Math.min(1, num(r.notesVolume, d.notesVolume)),
    lightParticles: r.lightParticles === true,
    daily: daily && typeof daily.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(daily.day) ? { day: daily.day, best: num(daily.best, 0) } : null,
  };
}

function pack(data: SaveData): string {
  const body = JSON.stringify(data);
  return JSON.stringify({ v: 1, sum: checksum(body), body });
}

function unpack(text: string | null): SaveData | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as { v?: unknown; sum?: unknown; body?: unknown };
    if (o.v !== 1 || typeof o.body !== "string" || o.sum !== checksum(o.body)) return null;
    return sanitize(JSON.parse(o.body));
  } catch {
    return null;
  }
}

export class Vault {
  constructor(private kv: KV | null) {}

  load(): SaveData {
    if (!this.kv) return defaults();
    let a: string | null = null;
    let b: string | null = null;
    try {
      a = this.kv.getItem(SLOT_A);
      b = this.kv.getItem(SLOT_B);
    } catch {
      return defaults();
    }
    return unpack(a) ?? unpack(b) ?? defaults();
  }

  /** Writes the backup first, so a crash mid-save always leaves one good slot. */
  save(data: SaveData): boolean {
    if (!this.kv) return false;
    const text = pack(data);
    try {
      this.kv.setItem(SLOT_B, text);
      this.kv.setItem(SLOT_A, text);
      return true;
    } catch {
      return false;
    }
  }
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(code: string): string {
  const bin = atob(code);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function exportCode(data: SaveData): string {
  return "TW1." + toBase64(pack(data));
}

export function importCode(code: string): SaveData | null {
  const c = code.trim();
  if (!c.startsWith("TW1.")) return null;
  try {
    return unpack(fromBase64(c.slice(4)));
  } catch {
    return null;
  }
}
