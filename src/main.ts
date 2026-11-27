import "./style.css";
import { Score, INSTRUMENTS } from "./audio";
import { currentSpeed, makeEvents, makeSpirit, step, STEP, type Spirit } from "./physics";
import { Renderer, STYLES, STYLE_COUNT } from "./render";
import { hashString, utcDay } from "./rng";
import { makeRun, makeRunEvents, updateRun, TIERS, type Mode, type Run } from "./rules";
import { AURAS, exportCode, importCode, Vault, type Aura, type KV, type SaveData, type Stats } from "./save";
import { Terrain, ZONES } from "./terrain";

const CYCLE = 60;
const BLEND = 5;

// ---------------------------------------------------------------- unlocks

interface AuraInfo {
  name: string;
  need: string;
  done: (s: Stats) => boolean;
  progress: (s: Stats) => string;
}

const AURA_INFO: Record<Aura, AuraInfo> = {
  ember: { name: "Ember", need: "Yours from the start", done: () => true, progress: () => "" },
  tide: { name: "Tide", need: "25 perfect dives", done: (s) => s.perfects >= 25, progress: (s) => `${Math.min(25, s.perfects)}/25` },
  moth: { name: "Moth", need: "Fly through 20 rings", done: (s) => s.rings >= 20, progress: (s) => `${Math.min(20, s.rings)}/20` },
  comet: { name: "Comet", need: "Climb 1,500 high", done: (s) => s.maxAltitude >= 1500, progress: (s) => `${Math.min(1500, Math.round(s.maxAltitude))}/1500` },
  lotus: { name: "Lotus", need: "A streak of 10 perfect dives", done: (s) => s.bestStreak >= 10, progress: (s) => `${Math.min(10, s.bestStreak)}/10` },
  prism: { name: "Prism", need: "Surf 25 km in total", done: (s) => s.distance >= 250000, progress: (s) => `${Math.min(25, s.distance / 10000).toFixed(1)}/25 km` },
};

interface Ctx {
  run: Run;
  s: Spirit;
  clock: number;
}

const ACHIEVEMENTS: { id: string; name: string; need: string; test: (c: Ctx) => boolean }[] = [
  { id: "first", name: "First light", need: "Land a perfect dive", test: (c) => c.s.perfects >= 1 },
  { id: "streak5", name: "In the pocket", need: "5 perfect dives in a row", test: (c) => c.s.bestCombo >= 5 },
  { id: "streak15", name: "Unbroken", need: "15 perfect dives in a row", test: (c) => c.s.bestCombo >= 15 },
  { id: "rings10", name: "Ring keeper", need: "10 rings in one run", test: (c) => c.s.ringsTaken >= 10 },
  { id: "km1", name: "Out to sea", need: "Surf 1 km in one run", test: (c) => c.s.distance >= 10000 },
  { id: "km5", name: "Far shore", need: "Surf 5 km in one run", test: (c) => c.s.distance >= 50000 },
  { id: "radiant", name: "Radiant", need: "Reach the Radiant tier", test: (c) => c.run.tier >= 2 },
  { id: "transcendent", name: "Transcendent", need: "Reach the Transcendent tier", test: (c) => c.run.tier >= 3 },
  { id: "sky", name: "Touch the sky", need: "Climb 2,000 high", test: (c) => c.s.maxAlt >= 2000 },
  { id: "flow50k", name: "Deep flow", need: "50,000 flow in one run", test: (c) => c.run.score >= 50000 },
  { id: "skies", name: "Five skies", need: "See all five skies in one run", test: (c) => c.clock >= CYCLE * (STYLE_COUNT - 1) + BLEND },
  { id: "daily", name: "Same wave as everyone", need: "Ride today's wave for a minute", test: (c) => c.run.mode === "daily" && c.run.time >= 60 },
  { id: "zen", name: "Still water", need: "Ten minutes in Zen", test: (c) => c.run.mode === "zen" && c.run.time >= 600 },
];

// ---------------------------------------------------------------- storage

function storage(): KV | null {
  try {
    const k = "__tw";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

const vault = new Vault(storage());
let save: SaveData = vault.load();
const score = new Score();
score.setMuted(save.muted);
score.setVolumes(save.musicVolume, save.notesVolume);

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
renderer.fx.density = save.lightParticles ? 0.5 : 1;
const ui = document.getElementById("ui") as HTMLDivElement;

const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  sound: "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  mute: "M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6",
  aura: "M12 3l2.6 5.6L20 9.5l-4 4 1 5.8L12 16.6 7 19.3l1-5.8-4-4 5.4-.9z",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3",
  pause: "M8 5v14M16 5v14",
};

ui.innerHTML = `
  <header class="hud">
    <div class="mark">Tide-Weaver</div>
    <div class="flow"><span id="flow">0</span><span class="unit">flow</span></div>
    <div class="light" id="light" role="meter" aria-label="Light" aria-valuemin="0" aria-valuemax="100"><i id="light-fill"></i></div>
    <div class="mult" id="mult"></div>
    <div class="best" id="best"></div>
  </header>
  <nav class="controls" aria-label="Game">
    <button id="b-sound" aria-label="Sound" data-tip="Sound · M">${icon(save.muted ? ICON.mute : ICON.sound)}</button>
    <button id="b-aura" aria-label="Auras and milestones" data-tip="Auras">${icon(ICON.aura)}</button>
    <button id="b-daily" aria-label="Today's wave" data-tip="Today's wave">${icon(ICON.sun)}</button>
    <button id="b-pause" aria-label="Pause" data-tip="Pause · P">${icon(ICON.pause)}</button>
  </nav>
  <p class="hint" id="hint" hidden></p>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <a class="tag" href="./" aria-label="coralctrl">a coralctrl game</a>
  <div class="scrim" id="scrim" hidden>
    <section class="panel" id="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title"></section>
  </div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const flowEl = $("flow");
const lightEl = $("light");
const lightFill = $("light-fill");
const multEl = $("mult");
const bestEl = $("best");
const hintEl = $("hint");
const scrim = $("scrim");
const panel = $("panel");
const toastEl = $("toast");

// ---------------------------------------------------------------- run state

const params = new URLSearchParams(location.search);
const today = utcDay();
let mode: Mode = params.get("d") === today ? "daily" : params.get("zen") === "1" ? "zen" : "journey";
const cleanSeed = (s: string | null) => (s && /^[a-z0-9-]{1,24}$/i.test(s) ? s.toLowerCase() : null);
let seedLabel = cleanSeed(params.get("seed")) ?? Math.random().toString(36).slice(2, 8);

let terrain!: Terrain;
let spirit!: Spirit;
let run!: Run;
const ev = makeEvents();
const rev = makeRunEvents();
let clock = 0;
let paused = false;
let over = false;
let ending = -1;
let endShownAt = 0;
let lastZone = -1;
let lastStyle = -1;
let passedBest = false;
let wasHolding = false;
/** Nothing moves until the first press, so the player sees that the dive is theirs. */
let started = false;
let idle = 0;
let peakTier = 0;
const weights = new Array(STYLE_COUNT).fill(0);
weights[0] = 1;

// Contextual first-run tips: one short line at a time, never a wall of text.
let tip = save.tutorialDone ? -1 : 0;
let tipHold = 0;
let tipTimer = 0;
const TIPS = ["Hold on a downhill to dive", "Let go at the bottom to fly", "Land along a downhill for a Perfect", "Perfect dives and rings refill your light"];

function bestFlow(): number {
  if (mode === "zen") return save.bestZen;
  if (mode === "daily") return save.daily?.day === today ? save.daily.best : 0;
  return save.bestEndless;
}

function newRun(): void {
  const seed = mode === "daily" ? hashString("daily:" + today) : hashString("seed:" + seedLabel);
  terrain = new Terrain(seed);
  spirit = makeSpirit(terrain);
  run = makeRun(mode, tip !== -1);
  clock = 0;
  over = false;
  ending = -1;
  lastZone = -1;
  lastStyle = -1;
  passedBest = false;
  peakTier = 0;
  started = false;
  idle = 0;
  score.song.length = 0;
  renderer.resetTrail();
  lightEl.hidden = mode === "zen";
  save.stats.runs++;
  persist();
  const url = new URL(location.href);
  url.search = mode === "daily" ? `?d=${today}` : `?seed=${seedLabel}${mode === "zen" ? "&zen=1" : ""}`;
  history.replaceState(null, "", url);
}

function persist(): void {
  vault.save(save);
}

// ---------------------------------------------------------------- input

const pointers = new Set<number>();
const keys = new Set<string>();
const HOLD_KEYS = new Set(["Space", "ArrowDown", "KeyS", "KeyW", "ArrowUp", "Enter"]);
const holding = () => !over && ending < 0 && (pointers.size > 0 || keys.size > 0);

function wake(): void {
  score.unlock();
  score.setMuted(save.muted);
  score.setVolumes(save.musicVolume, save.notesVolume);
}

canvas.addEventListener("pointerdown", (e) => {
  if (paused) return;
  wake();
  started = true;
  pointers.add(e.pointerId);
  canvas.setPointerCapture?.(e.pointerId);
  e.preventDefault();
});
const release = (e: PointerEvent) => pointers.delete(e.pointerId);
window.addEventListener("pointerup", release);
window.addEventListener("pointercancel", release);
window.addEventListener("blur", () => {
  pointers.clear();
  keys.clear();
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  const el = e.target as HTMLElement;
  if (el.closest("input, textarea")) return;
  // Game over: Space or Enter rides again straight away.
  if (over && !scrim.hidden && (e.code === "Space" || e.code === "Enter")) {
    e.preventDefault();
    if (!e.repeat && performance.now() - endShownAt > 500) {
      rideAgain();
      started = true;
      keys.add(e.code);
    }
    return;
  }
  if (HOLD_KEYS.has(e.code) && !paused) {
    if (el.closest("button") && (e.code === "Space" || e.code === "Enter")) return;
    wake();
    started = true;
    keys.add(e.code);
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (e.code === "Escape" || e.code === "KeyP") {
    e.preventDefault();
    if (over) return;
    if (paused) resume();
    else openPause();
  } else if (e.code === "KeyM") toggleSound();
  else if (e.code === "KeyR") document.body.classList.toggle("clean");
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (!paused && !over) openPause();
    score.suspend();
    persist();
  }
});
window.addEventListener("pagehide", persist);

// ---------------------------------------------------------------- panels

let toastTimer = 0;
function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.classList.add("on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("on"), 2600);
}

function openPanel(html: string): void {
  paused = true;
  pointers.clear();
  keys.clear();
  panel.innerHTML = html;
  scrim.hidden = false;
  panel.querySelector<HTMLElement>("[data-autofocus], button, textarea, input")?.focus({ preventScroll: true });
}

function resume(): void {
  scrim.hidden = true;
  paused = false;
  score.resume();
}

const fmt = (n: number) => Math.floor(n).toLocaleString("en");
const SONG = "▁▂▃▄▅▆▇█";
const songStrip = () => score.song.map((d) => SONG[Math.min(7, Math.floor((d / 15) * 8))]).join("") || "▁";
const modeName = () => (mode === "daily" ? `Today's wave · ${today}` : mode === "zen" ? `Zen · wave ${seedLabel}` : `Journey · wave ${seedLabel}`);

function shareUrl(): string {
  const u = new URL(location.href);
  u.hash = "";
  return u.toString();
}

function shareText(): string {
  return `Tide-Weaver · ${modeName()}\n${fmt(run.score)} flow · streak ×${spirit.bestCombo} · ${(spirit.distance / 10000).toFixed(2)} km\n${songStrip()}\n${shareUrl()}`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    t.remove();
    return ok;
  }
}

async function share(): Promise<void> {
  const text = shareText();
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ text });
      return;
    } catch {
      /* cancelled: copy instead */
    }
  }
  toast((await copy(text)) ? "Copied. Paste it anywhere." : "Couldn't copy on this browser.");
}

function postcard(): void {
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const x = c.getContext("2d")!;
  x.drawImage(canvas, 0, 0);
  const s = c.height / 720;
  const g = x.createLinearGradient(0, c.height * 0.62, 0, c.height);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.65)");
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#fff";
  x.font = `500 ${22 * s}px ui-serif, Georgia, serif`;
  x.fillText("TIDE-WEAVER", 36 * s, c.height - 92 * s);
  x.font = `700 ${44 * s}px ui-rounded, system-ui, sans-serif`;
  x.fillText(`${fmt(run.score)} flow`, 36 * s, c.height - 44 * s);
  x.font = `500 ${16 * s}px ui-rounded, system-ui, sans-serif`;
  x.globalAlpha = 0.8;
  x.fillText(`${songStrip()}   ${shareUrl().replace(/^https?:\/\//, "")}`, 36 * s, c.height - 16 * s);
  c.toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `tide-weaver-${mode === "daily" ? today : seedLabel}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/png");
}

const stat = (label: string, value: string) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`;

function runStats(): string {
  return `<div class="stats">${stat("Best streak", "×" + spirit.bestCombo)}${stat("Perfect dives", String(spirit.perfects))}${stat("Rings", String(spirit.ringsTaken))}${stat("Distance", (spirit.distance / 10000).toFixed(2) + " km")}${stat("Highest", fmt(spirit.maxAlt))}${stat("Best tier", TIERS[peakTier])}</div>`;
}

function modeButton(): string {
  return mode === "zen" ? `<button data-act="journey">Journey mode</button>` : `<button data-act="zen">Zen mode</button>`;
}

function openPause(): void {
  openPanel(`
    <h2 id="panel-title">${modeName()}</h2>
    <div class="final"><b>${fmt(run.score)}</b><span>flow · best ${fmt(Math.max(bestFlow(), run.score))}</span></div>
    ${runStats()}
    <p class="song" aria-label="Your run as notes">${songStrip()}</p>
    <div class="row">
      <button class="primary" data-act="resume" data-autofocus>Keep surfing</button>
      <button data-act="again">Restart</button>
      ${modeButton()}
    </div>
    <div class="row">
      <button data-act="share">Share run</button>
      <button data-act="postcard">Save postcard</button>
      <button data-act="auras">Auras & milestones</button>
      <button data-act="settings">Settings</button>
    </div>
    <p class="small">${mode === "zen" ? "Zen: no light to keep, the waves go on forever." : "Perfect dives and rings refill your light. Keep it burning."}</p>
  `);
}

function openAuras(): void {
  const cards = AURAS.map((a) => {
    const info = AURA_INFO[a];
    const have = save.unlocked.includes(a);
    const on = save.aura === a;
    return `<button class="aura ${on ? "on" : ""}" data-aura="${a}" ${have ? "" : "disabled"} aria-pressed="${on}">
      <i class="swatch sw-${a}" aria-hidden="true"></i><b>${info.name}</b><span>${have ? (on ? "Wearing" : "Wear") : `${info.need} · ${info.progress(save.stats)}`}</span>
    </button>`;
  }).join("");
  const done = ACHIEVEMENTS.filter((a) => save.achievements.includes(a.id)).length;
  const ach = ACHIEVEMENTS.map((a) => {
    const got = save.achievements.includes(a.id);
    return `<li class="${got ? "got" : ""}"><b>${got ? "✦" : "·"} ${a.name}</b><span>${a.need}</span></li>`;
  }).join("");
  openPanel(`
    <h2 id="panel-title">Auras</h2>
    <div class="auras">${cards}</div>
    <h3>Milestones · ${done}/${ACHIEVEMENTS.length}</h3>
    <ul class="ach">${ach}</ul>
    <div class="row"><button class="primary" data-act="back" data-autofocus>Back</button></div>
  `);
}

function openSettings(): void {
  openPanel(`
    <h2 id="panel-title">Settings</h2>
    <h3>Sound</h3>
    <div class="row"><button data-act="sound" aria-pressed="${!save.muted}">Sound ${save.muted ? "off" : "on"}</button></div>
    <label class="slider">Music <input type="range" id="vol-music" min="0" max="100" value="${Math.round(save.musicVolume * 100)}"></label>
    <label class="slider">Notes and effects <input type="range" id="vol-notes" min="0" max="100" value="${Math.round(save.notesVolume * 100)}"></label>
    <h3>Visuals</h3>
    <div class="row">
      <button data-act="motion" aria-pressed="${save.reducedMotion}">Calm motion ${save.reducedMotion ? "on" : "off"}</button>
      <button data-act="particles" aria-pressed="${save.lightParticles}">Particles ${save.lightParticles ? "light" : "full"}</button>
      <button data-act="tips">Show tips again</button>
    </div>
    <h3>Progress</h3>
    <label class="field">Save code<textarea id="code" rows="3" spellcheck="false" placeholder="Paste a save code here to load it"></textarea></label>
    <div class="row">
      <button data-act="export">Copy my save code</button>
      <button data-act="import">Load pasted code</button>
    </div>
    <p class="small">Hold Space or touch to dive · P pause · M sound · R hide the interface for clean recordings</p>
    <div class="row"><button class="primary" data-act="back" data-autofocus>Back</button></div>
  `);
  const music = panel.querySelector<HTMLInputElement>("#vol-music")!;
  const notes = panel.querySelector<HTMLInputElement>("#vol-notes")!;
  const apply = () => {
    save.musicVolume = Number(music.value) / 100;
    save.notesVolume = Number(notes.value) / 100;
    wake();
    persist();
  };
  music.addEventListener("input", apply);
  notes.addEventListener("input", apply);
  notes.addEventListener("change", () => score.note(9, 1, 0.6));
}

/** Saves the run's flow and distance if they beat the records; true if a previous best fell. */
function recordBest(): boolean {
  let isNew = false;
  if (mode === "zen") {
    if (run.score > save.bestZen) {
      isNew = save.bestZen > 0;
      save.bestZen = run.score;
    }
  } else if (mode === "daily") {
    const prev = save.daily?.day === today ? save.daily.best : 0;
    if (run.score > prev) {
      isNew = prev > 0;
      save.daily = { day: today, best: run.score };
    }
  } else {
    if (run.score > save.bestEndless) {
      isNew = save.bestEndless > 0;
      save.bestEndless = run.score;
    }
    if (spirit.distance > save.bestDistance) save.bestDistance = spirit.distance;
  }
  persist();
  return isNew;
}

function openGameOver(): void {
  const prevBest = bestFlow();
  const isNew = recordBest();
  endShownAt = performance.now();
  openPanel(`
    <h2 id="panel-title">${mode === "daily" ? `Today's wave · ${today}` : "Your light faded"}</h2>
    <p class="cause">${run.cause}</p>
    <div class="final"><b>${fmt(run.score)}</b><span>flow${isNew ? ` · <strong class="new">new best</strong>` : ` · best ${fmt(Math.max(prevBest, run.score))}`}</span></div>
    ${runStats()}
    <p class="song" aria-label="Your run as notes">${songStrip()}</p>
    <div class="row">
      <button class="primary big" data-act="again" data-autofocus>Ride again <kbd>Space</kbd></button>
      <button data-act="share">Share</button>
      <button data-act="postcard">Postcard</button>
    </div>
    <div class="row">
      ${mode === "daily" ? `<button data-act="journey">Journey mode</button>` : `<button data-act="daily">Today's wave</button>`}
      <button data-act="zen">Zen mode</button>
      <button data-act="auras">Auras & milestones</button>
    </div>
  `);
}

function rideAgain(): void {
  if (mode === "zen" || mode === "journey") recordBest();
  if (mode === "journey" && !cleanSeed(params.get("seed"))) seedLabel = Math.random().toString(36).slice(2, 8);
  newRun();
  resume();
}

function switchMode(m: Mode): void {
  if (!over) recordBest();
  mode = m;
  if (m !== "daily") seedLabel = Math.random().toString(36).slice(2, 8);
  newRun();
  resume();
  toast(m === "zen" ? "Zen: endless, no light to keep" : m === "daily" ? "Today's wave: the same for everyone" : "Journey: keep your light burning");
}

panel.addEventListener("click", async (e) => {
  const t = (e.target as HTMLElement).closest("button");
  if (!t) return;
  const aura = t.dataset.aura as Aura | undefined;
  if (aura && save.unlocked.includes(aura)) {
    save.aura = aura;
    persist();
    openAuras();
    return;
  }
  switch (t.dataset.act) {
    case "resume":
      resume();
      break;
    case "again":
      rideAgain();
      break;
    case "zen":
      switchMode("zen");
      break;
    case "journey":
      switchMode("journey");
      break;
    case "daily":
      switchMode("daily");
      break;
    case "share":
      await share();
      break;
    case "postcard":
      postcard();
      break;
    case "auras":
      openAuras();
      break;
    case "settings":
      openSettings();
      break;
    case "back":
      if (over) openGameOver();
      else openPause();
      break;
    case "sound":
      toggleSound();
      openSettings();
      break;
    case "motion":
      save.reducedMotion = !save.reducedMotion;
      persist();
      openSettings();
      break;
    case "particles":
      save.lightParticles = !save.lightParticles;
      renderer.fx.density = save.lightParticles ? 0.5 : 1;
      persist();
      openSettings();
      break;
    case "tips":
      save.tutorialDone = false;
      tip = 0;
      tipHold = 0;
      persist();
      toast("Tips will show again.");
      break;
    case "export":
      toast((await copy(exportCode(save))) ? "Save code copied." : "Couldn't copy on this browser.");
      break;
    case "import": {
      const code = (panel.querySelector("#code") as HTMLTextAreaElement | null)?.value ?? "";
      const data = importCode(code);
      if (!data) {
        toast("That code isn't a valid Tide-Weaver save.");
        break;
      }
      save = data;
      persist();
      score.setMuted(save.muted);
      score.setVolumes(save.musicVolume, save.notesVolume);
      renderer.fx.density = save.lightParticles ? 0.5 : 1;
      syncSoundIcon();
      toast("Save loaded.");
      openSettings();
      break;
    }
  }
});

scrim.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  const f = [...panel.querySelectorAll<HTMLElement>("button:not(:disabled), textarea, input")];
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

function syncSoundIcon(): void {
  const b = $("b-sound");
  b.innerHTML = icon(save.muted ? ICON.mute : ICON.sound);
  b.setAttribute("aria-pressed", String(!save.muted));
}

function toggleSound(): void {
  wake();
  save.muted = !save.muted;
  score.setMuted(save.muted);
  syncSoundIcon();
  persist();
}

$("b-sound").addEventListener("click", toggleSound);
$("b-aura").addEventListener("click", () => openAuras());
$("b-pause").addEventListener("click", () => (over ? openGameOver() : openPause()));
$("b-daily").addEventListener("click", () => {
  wake();
  switchMode("daily");
});
syncSoundIcon();

// ---------------------------------------------------------------- simulation

function unlockAuras(): void {
  for (const a of AURAS) {
    if (save.unlocked.includes(a) || !AURA_INFO[a].done(save.stats)) continue;
    save.unlocked.push(a);
    persist();
    toast(`New aura: ${AURA_INFO[a].name}`);
    score.milestone();
  }
}

function checkAchievements(): void {
  const c: Ctx = { run, s: spirit, clock };
  for (const a of ACHIEVEMENTS) {
    if (save.achievements.includes(a.id) || !a.test(c)) continue;
    save.achievements.push(a.id);
    persist();
    toast(`✦ ${a.name}`);
    score.milestone();
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function updateWeights(): number {
  const c = Math.floor(clock / CYCLE) % STYLE_COUNT;
  const local = clock % CYCLE;
  weights.fill(0);
  if (local > CYCLE - BLEND) {
    const k = smooth((local - (CYCLE - BLEND)) / BLEND);
    weights[c] = 1 - k;
    weights[(c + 1) % STYLE_COUNT] = k;
    return k > 0.5 ? (c + 1) % STYLE_COUNT : c;
  }
  weights[c] = 1;
  return c;
}

function tick(dt: number): void {
  const before = spirit.x;
  const hold = holding();
  if (hold && !wasHolding) score.whoosh(currentSpeed(spirit) / 1600);
  wasHolding = hold;
  step(spirit, terrain, hold, ev, dt);
  const dx = spirit.x - before;
  updateRun(run, spirit, ev, dx, dt, rev);
  clock += dt;
  renderer.pushTrail(spirit.x, spirit.y);
  save.stats.distance += dx;
  if (run.tier > peakTier) peakTier = run.tier;

  const zone = terrain.zone(spirit.x);
  if (zone !== lastZone) {
    if (lastZone !== -1) renderer.showBanner(`${ZONES[zone]} · ${INSTRUMENTS[zone]}`);
    lastZone = zone;
    renderer.setZone(zone);
  }
  const ground = terrain.height(spirit.x);
  const alt = spirit.y - ground;

  if (ev.takeoff) score.note(2 + Math.min(4, currentSpeed(spirit) / 500), zone, 0.3);
  if (ev.landing === "perfect") {
    const d = 4 + Math.min(8, spirit.combo);
    score.note(d, zone, 0.9);
    score.note(d + 2, zone, 0.7, 1);
    score.note(d + 4, zone, 0.55, 2);
    save.stats.perfects++;
    if (spirit.combo > save.stats.bestStreak) save.stats.bestStreak = spirit.combo;
    renderer.fx.burst(spirit.x, spirit.y, 26 + Math.min(20, spirit.combo * 2), 420, [255, 236, 190], 0, 0.9);
    renderer.pulse(spirit.x, ground, 0.55 + Math.min(0.6, spirit.combo * 0.08));
    renderer.popup(spirit.combo > 1 ? `Perfect ×${spirit.combo}` : "Perfect", spirit.x, spirit.y);
    renderer.kick(0.2 + Math.min(0.2, spirit.combo * 0.02));
    unlockAuras();
  } else if (ev.landing === "good") {
    score.note(3, zone, 0.35);
  } else if (ev.landing === "rough") {
    score.splash();
    renderer.fx.spawn(spirit.x, spirit.y, 0, 0, 0.8, 1, [210, 235, 255], 1);
    renderer.fx.burst(spirit.x, spirit.y, 8, 220, [200, 230, 255], 0, 0.6);
  }
  if (ev.apex) score.note(Math.min(14, 2 + alt / 130), zone, 0.5);
  if (ev.ring) {
    score.note(12, 1, 0.9);
    score.note(14, 1, 0.7, 1);
    save.stats.rings += ev.ring;
    renderer.fx.burst(ev.ringX, ev.ringY, 34, 380, [255, 214, 140], 0, 1);
    renderer.popup(`+${fmt(250 * run.mult)}`, ev.ringX, ev.ringY);
    unlockAuras();
  }
  if (rev.tierUp) {
    renderer.popup(TIERS[run.tier], spirit.x, spirit.y + 60, true);
    renderer.pulse(spirit.x, ground, 0.9);
    score.milestone();
  }
  if (rev.km) {
    renderer.showBanner(`${rev.km} km`);
    score.milestone();
  }
  if (mode === "journey" && !passedBest && save.bestDistance > 2000 && spirit.distance > save.bestDistance) {
    passedBest = true;
    renderer.popup("Past your best", spirit.x, spirit.y + 40, true);
    score.milestone();
  }
  if (alt > save.stats.maxAltitude) {
    save.stats.maxAltitude = alt;
    if (alt >= 1500) unlockAuras();
  }
  if (save.stats.distance >= 250000 && !save.unlocked.includes("prism")) unlockAuras();

  // Tips advance on what the player actually does.
  if (tip === 0) {
    if (hold && spirit.grounded && terrain.slope(spirit.x) < 0) tipHold += dt;
    if (tipHold > 0.6) tip = 1;
  } else if (tip === 1 && !spirit.grounded && alt > 80) tip = 2;
  else if (tip === 2 && ev.landing === "perfect") {
    tip = mode === "zen" ? 4 : 3;
    tipTimer = 0;
  } else if (tip === 3) {
    tipTimer += dt;
    if (tipTimer > 4.5) tip = 4;
  }
  if (tip === 4) {
    tip = -1;
    save.tutorialDone = true;
    run.gentle = false;
    persist();
  }

  if (rev.ended) {
    ending = 0;
    score.fade();
  }
}

// ---------------------------------------------------------------- frame loop

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(2, window.devicePixelRatio || 1));
}
window.addEventListener("resize", resize);
resize();
newRun();
// ?at=SECONDS starts the world clock later: for previewing skies and recording clips.
const startAt = Number(params.get("at"));
if (mode !== "daily" && startAt > 0 && startAt < 400) clock = startAt;

let last = performance.now();
let acc = 0;
let saveClock = 0;
let achClock = 0;
let shownFlow = -1;
let shownMult = "";
let shownBest = "";

function frame(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  if (!paused) {
    // After the light goes out, time slows to a stop before the summary.
    let scaleT = 1;
    if (ending >= 0) {
      ending += dt;
      scaleT = Math.max(0.15, 1 - ending / 1.3);
      if (ending > 1.4 && !over) {
        over = true;
        openGameOver();
      }
    }
    if (!started) {
      // Waiting for the first press: the spirit hovers and breathes.
      const y0 = terrain.height(0) + 220 + Math.sin(now / 420) * 14;
      spirit.py = spirit.y;
      spirit.y = y0;
      acc = 0;
      clock += dt;
    }
    if (started && !holding()) idle += dt;
    else idle = 0;
    acc += started ? dt * scaleT : 0;
    while (acc >= STEP && !paused) {
      tick(STEP);
      acc -= STEP;
    }
    saveClock += dt;
    if (saveClock > 10) {
      saveClock = 0;
      persist();
    }
    achClock += dt;
    if (achClock > 1) {
      achClock = 0;
      checkAchievements();
    }
  }
  const style = updateWeights();
  if (style !== lastStyle) {
    if (lastStyle !== -1) renderer.showBanner(STYLES[style]);
    lastStyle = style;
  }
  const speed = currentSpeed(spirit);
  score.update(paused ? 0 : speed, style, weights[4], !spirit.grounded);
  renderer.draw({
    spirit,
    alpha: paused ? 1 : acc / STEP,
    terrain,
    weights,
    time: clock,
    dt: paused ? 0 : dt,
    aura: save.aura,
    holding: holding(),
    reducedMotion: save.reducedMotion,
    speed,
    light: mode === "zen" ? 1 : run.light,
    tier: run.tier,
    bestX: mode === "journey" && save.bestDistance > 2000 ? save.bestDistance : -1,
  });

  const f = Math.floor(run.score);
  if (f !== shownFlow) {
    shownFlow = f;
    flowEl.textContent = fmt(f);
  }
  const m = `×${run.mult.toFixed(1)} · ${TIERS[run.tier]}${spirit.combo >= 2 ? ` · streak ${spirit.combo}` : ""}`;
  if (m !== shownMult) {
    shownMult = m;
    multEl.textContent = m;
    multEl.dataset.tier = String(run.tier);
  }
  const b = `best ${fmt(Math.max(bestFlow(), run.score))}`;
  if (b !== shownBest) {
    shownBest = b;
    bestEl.textContent = b;
  }
  if (mode !== "zen") {
    lightFill.style.transform = `scaleX(${run.light})`;
    lightEl.classList.toggle("low", run.light < 0.25);
    lightEl.setAttribute("aria-valuenow", String(Math.round(run.light * 100)));
  }
  const nudge = started && idle > 5 && save.stats.runs < 8 && !over && ending < 0;
  const tipText = !started ? "Hold anywhere to dive · let go to fly" : tip >= 0 && tip < TIPS.length ? TIPS[tip] : nudge ? "Hold to dive down the next slope" : "";
  hintEl.classList.toggle("start", !started);
  if (hintEl.textContent !== tipText) hintEl.textContent = tipText;
  hintEl.hidden = !tipText || paused;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
