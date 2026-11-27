import "./style.css";
import { Score, INSTRUMENTS } from "./audio";
import { currentSpeed, makeEvents, makeSpirit, step, STEP, type Spirit } from "./physics";
import { Renderer, STYLES } from "./render";
import { hashString, utcDay } from "./rng";
import { AURAS, exportCode, importCode, Vault, type Aura, type KV, type SaveData, type Stats } from "./save";
import { Terrain, ZONES } from "./terrain";

const DAILY_LENGTH = 150;
const CYCLE = 60;
const BLEND = 5;

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

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
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
    <div class="streak" id="streak" aria-live="polite"></div>
  </header>
  <nav class="controls" aria-label="Game">
    <button id="b-sound" aria-label="Sound" title="Sound (M)">${icon(save.muted ? ICON.mute : ICON.sound)}</button>
    <button id="b-aura" aria-label="Auras" title="Auras">${icon(ICON.aura)}</button>
    <button id="b-daily" aria-label="Today's wave" title="Today's wave">${icon(ICON.sun)}</button>
    <button id="b-pause" aria-label="Pause" title="Pause (P)">${icon(ICON.pause)}</button>
  </nav>
  <div class="timer" id="timer" hidden><div id="timer-fill"></div></div>
  <p class="hint" id="hint" hidden>Hold to dive · let go to fly</p>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <a class="tag" href="./" aria-label="coralctrl">a coralctrl game</a>
  <div class="scrim" id="scrim" hidden>
    <section class="panel" id="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title"></section>
  </div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const flowEl = $("flow");
const streakEl = $("streak");
const hintEl = $("hint");
const timerEl = $("timer");
const timerFill = $("timer-fill");
const scrim = $("scrim");
const panel = $("panel");
const toastEl = $("toast");

// ---------------------------------------------------------------- run state

const params = new URLSearchParams(location.search);
const today = utcDay();
type Mode = "endless" | "daily";
let mode: Mode = params.get("d") === today ? "daily" : "endless";
const cleanSeed = (s: string | null) => (s && /^[a-z0-9-]{1,24}$/i.test(s) ? s.toLowerCase() : null);
let seedLabel = cleanSeed(params.get("seed")) ?? Math.random().toString(36).slice(2, 8);

let terrain!: Terrain;
let spirit!: Spirit;
const ev = makeEvents();
let clock = 0;
let runTime = 0;
let ended = false;
let paused = false;
let lastZone = -1;
let lastStyle = -1;
let takeoffs = 0;
const weights = [1, 0, 0, 0];

function newRun(): void {
  const seed = mode === "daily" ? hashString("daily:" + today) : hashString("seed:" + seedLabel);
  terrain = new Terrain(seed);
  spirit = makeSpirit(terrain);
  clock = 0;
  runTime = 0;
  ended = false;
  lastZone = -1;
  lastStyle = -1;
  score.song.length = 0;
  renderer.resetTrail();
  timerEl.hidden = mode !== "daily";
  save.stats.runs++;
  persist();
  const url = new URL(location.href);
  url.search = mode === "daily" ? `?d=${today}` : `?seed=${seedLabel}`;
  history.replaceState(null, "", url);
}

function persist(): void {
  vault.save(save);
}

// ---------------------------------------------------------------- input

const pointers = new Set<number>();
const keys = new Set<string>();
const HOLD_KEYS = new Set(["Space", "ArrowDown", "KeyS", "KeyW", "ArrowUp", "Enter"]);
const holding = () => pointers.size > 0 || keys.size > 0;

function wake(): void {
  score.unlock();
  score.setMuted(save.muted);
}

canvas.addEventListener("pointerdown", (e) => {
  if (paused) return;
  wake();
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
  if (HOLD_KEYS.has(e.code) && !paused) {
    if (el.closest("button") && (e.code === "Space" || e.code === "Enter")) return;
    wake();
    keys.add(e.code);
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (e.code === "Escape" || e.code === "KeyP") {
    e.preventDefault();
    if (paused && !ended) resume();
    else if (!paused) openPause();
  } else if (e.code === "KeyM") toggleSound();
  else if (e.code === "KeyR") document.body.classList.toggle("clean");
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (!paused) openPause();
    score.suspend();
    persist();
  }
});
window.addEventListener("pagehide", persist);

// ---------------------------------------------------------------- panels

function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.classList.add("on");
  window.clearTimeout(toast.t);
  toast.t = window.setTimeout(() => toastEl.classList.remove("on"), 2600);
}
toast.t = 0;

function openPanel(html: string): void {
  paused = true;
  pointers.clear();
  keys.clear();
  panel.innerHTML = html;
  scrim.hidden = false;
  panel.querySelector<HTMLElement>("button, textarea")?.focus({ preventScroll: true });
}

function resume(): void {
  scrim.hidden = true;
  paused = false;
  score.resume();
  canvas.focus?.();
}

const fmt = (n: number) => Math.floor(n).toLocaleString("en");
const SONG = "▁▂▃▄▅▆▇█";
const songStrip = () => score.song.map((d) => SONG[Math.min(7, Math.floor((d / 15) * 8))]).join("") || "▁";

function shareUrl(): string {
  const u = new URL(location.href);
  u.hash = "";
  return u.toString();
}

function shareText(): string {
  const head = mode === "daily" ? `Tide-Weaver · today's wave ${today}` : `Tide-Weaver · wave ${seedLabel}`;
  return `${head}\n${fmt(spirit.flow)} flow · streak ×${spirit.bestCombo} · ${spirit.ringsTaken} rings\n${songStrip()}\n${shareUrl()}`;
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
      /* cancelled: fall back to copying */
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
  x.fillText(`${fmt(spirit.flow)} flow`, 36 * s, c.height - 44 * s);
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

function stat(label: string, value: string): string {
  return `<div class="stat"><span>${label}</span><b>${value}</b></div>`;
}

function runStats(): string {
  return `<div class="stats">${stat("Flow", fmt(spirit.flow))}${stat("Best streak", "×" + spirit.bestCombo)}${stat("Perfect dives", String(spirit.perfects))}${stat("Rings", String(spirit.ringsTaken))}${stat("Distance", (spirit.distance / 10000).toFixed(2) + " km")}${stat("Highest", fmt(spirit.maxAlt))}</div>`;
}

function openPause(): void {
  if (mode === "endless") save.bestEndless = Math.max(save.bestEndless, spirit.flow);
  persist();
  openPanel(`
    <h2 id="panel-title">${mode === "daily" ? `Today's wave · ${today}` : `Wave ${seedLabel}`}</h2>
    ${runStats()}
    <p class="song" aria-label="Your run as notes">${songStrip()}</p>
    <div class="row">
      <button class="primary" data-act="resume">Keep surfing</button>
      <button data-act="share">Share run</button>
      <button data-act="postcard">Save postcard</button>
    </div>
    <div class="row">
      <button data-act="new">${mode === "daily" ? "Endless waves" : "New wave"}</button>
      <button data-act="auras">Auras</button>
      <button data-act="settings">Settings</button>
    </div>
    <p class="small">Best endless flow ${fmt(save.bestEndless)}${save.daily?.day === today ? ` · today's best ${fmt(save.daily.best)}` : ""}</p>
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
  openPanel(`<h2 id="panel-title">Auras</h2><div class="auras">${cards}</div><div class="row"><button class="primary" data-act="back">Back</button></div>`);
}

function openSettings(): void {
  openPanel(`
    <h2 id="panel-title">Settings</h2>
    <div class="row">
      <button data-act="sound" aria-pressed="${!save.muted}">Sound ${save.muted ? "off" : "on"}</button>
      <button data-act="motion" aria-pressed="${save.reducedMotion}">Calm motion ${save.reducedMotion ? "on" : "off"}</button>
    </div>
    <label class="field">Save code<textarea id="code" rows="3" spellcheck="false" placeholder="Paste a save code here to load it"></textarea></label>
    <div class="row">
      <button data-act="export">Copy my save code</button>
      <button data-act="import">Load pasted code</button>
    </div>
    <p class="small">Keys: hold Space or tap to dive · P pause · M sound · R hide the interface for clean recordings.</p>
    <div class="row"><button class="primary" data-act="back">Back</button></div>
  `);
}

function endDaily(): void {
  ended = true;
  const prev = save.daily?.day === today ? save.daily.best : 0;
  save.daily = { day: today, best: Math.max(prev, spirit.flow) };
  persist();
  openPanel(`
    <h2 id="panel-title">Today's wave · ${today}</h2>
    ${runStats()}
    <p class="song" aria-label="Your run as notes">${songStrip()}</p>
    <p class="small">${spirit.flow > prev ? (prev ? "A new best for today." : "Your first ride of today's wave.") : `Today's best is ${fmt(prev)}.`} Everyone gets the same wave until midnight UTC.</p>
    <div class="row">
      <button class="primary" data-act="share">Share result</button>
      <button data-act="again">Ride it again</button>
      <button data-act="new">Endless waves</button>
    </div>
  `);
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
    case "share":
      await share();
      break;
    case "postcard":
      postcard();
      break;
    case "new":
      if (mode === "endless") save.bestEndless = Math.max(save.bestEndless, spirit.flow);
      mode = "endless";
      seedLabel = Math.random().toString(36).slice(2, 8);
      newRun();
      resume();
      break;
    case "again":
      newRun();
      resume();
      break;
    case "auras":
      openAuras();
      break;
    case "settings":
      openSettings();
      break;
    case "back":
      if (ended) endDaily();
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
      syncSoundIcon();
      toast("Save loaded.");
      openSettings();
      break;
    }
  }
});

scrim.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  const f = [...panel.querySelectorAll<HTMLElement>("button:not(:disabled), textarea")];
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
$("b-pause").addEventListener("click", () => openPause());
$("b-daily").addEventListener("click", () => {
  wake();
  if (mode === "endless") save.bestEndless = Math.max(save.bestEndless, spirit.flow);
  mode = "daily";
  newRun();
  toast("Today's wave: 2½ minutes, the same for everyone");
  if (paused) resume();
});
syncSoundIcon();

// ---------------------------------------------------------------- simulation

function unlockAuras(): void {
  for (const a of AURAS) {
    if (save.unlocked.includes(a) || !AURA_INFO[a].done(save.stats)) continue;
    save.unlocked.push(a);
    persist();
    toast(`New aura: ${AURA_INFO[a].name}`);
    score.note(14, 1, 0.8);
    score.note(12, 1, 0.6, 1);
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function updateWeights(): number {
  const c = Math.floor(clock / CYCLE) % 4;
  const local = clock % CYCLE;
  weights.fill(0);
  if (local > CYCLE - BLEND) {
    const k = smooth((local - (CYCLE - BLEND)) / BLEND);
    weights[c] = 1 - k;
    weights[(c + 1) % 4] = k;
    return k > 0.5 ? (c + 1) % 4 : c;
  }
  weights[c] = 1;
  return c;
}

let hintTimer = 0;
function tick(): void {
  const before = spirit.x;
  step(spirit, terrain, holding(), ev);
  clock += STEP;
  runTime += STEP;
  renderer.pushTrail(spirit.x, spirit.y);
  save.stats.distance += spirit.x - before;

  const zone = terrain.zone(spirit.x);
  const inst = zone;
  if (zone !== lastZone) {
    if (lastZone !== -1) renderer.showBanner(`${ZONES[zone]} · ${INSTRUMENTS[zone]}`);
    lastZone = zone;
    renderer.setZone(zone);
  }
  const alt = spirit.y - terrain.height(spirit.x);
  if (ev.takeoff) {
    takeoffs++;
    score.note(2 + Math.min(4, currentSpeed(spirit) / 500), inst, 0.3);
  }
  if (ev.landing === "perfect") {
    const d = 4 + Math.min(8, spirit.combo);
    score.note(d, inst, 0.9);
    score.note(d + 2, inst, 0.7, 1);
    score.note(d + 4, inst, 0.55, 2);
    save.stats.perfects++;
    if (spirit.combo > save.stats.bestStreak) save.stats.bestStreak = spirit.combo;
    renderer.fx.burst(spirit.x, spirit.y, 26, 420, [255, 236, 190], 0, 0.9);
    renderer.popup(spirit.combo > 1 ? `Perfect ×${spirit.combo}` : "Perfect", spirit.x, spirit.y);
    renderer.kick(0.25);
    if (!save.hintSeen) {
      save.hintSeen = true;
      persist();
    }
    unlockAuras();
  } else if (ev.landing === "good") {
    score.note(3, inst, 0.35);
  } else if (ev.landing === "rough") {
    score.splash();
    renderer.fx.spawn(spirit.x, spirit.y, 0, 0, 0.8, 1, [210, 235, 255], 1);
    renderer.fx.burst(spirit.x, spirit.y, 8, 220, [200, 230, 255], 0, 0.6);
  }
  if (ev.apex) score.note(Math.min(14, 2 + alt / 130), inst, 0.5);
  if (ev.ring) {
    score.note(12, 1, 0.9);
    score.note(14, 1, 0.7, 1);
    save.stats.rings += ev.ring;
    renderer.fx.burst(ev.ringX, ev.ringY, 34, 380, [255, 214, 140], 0, 1);
    renderer.popup("+250", ev.ringX, ev.ringY);
    unlockAuras();
  }
  if (alt > save.stats.maxAltitude) {
    save.stats.maxAltitude = alt;
    if (alt >= 1500) unlockAuras();
  }
  if (save.stats.distance >= 250000 && !save.unlocked.includes("prism")) unlockAuras();

  if (mode === "daily" && runTime >= DAILY_LENGTH) endDaily();
}

// ---------------------------------------------------------------- frame loop

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(2, window.devicePixelRatio || 1));
}
window.addEventListener("resize", resize);
resize();
newRun();
// ?at=SECONDS starts the world clock later: for previewing styles and recording clips.
const startAt = Number(params.get("at"));
if (mode === "endless" && startAt > 0 && startAt < 240) clock = startAt;

let last = performance.now();
let acc = 0;
let saveClock = 0;
let shownFlow = -1;
let shownCombo = -1;

function frame(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  if (!paused) {
    acc += dt;
    while (acc >= STEP && !paused) {
      tick();
      acc -= STEP;
    }
    saveClock += dt;
    if (saveClock > 10) {
      saveClock = 0;
      persist();
    }
    hintTimer += dt;
  }
  const style = updateWeights();
  if (style !== lastStyle) {
    if (lastStyle !== -1) renderer.showBanner(STYLES[style]);
    lastStyle = style;
  }
  const speed = currentSpeed(spirit);
  score.update(paused ? 0 : speed, style, weights[3], !spirit.grounded);
  renderer.draw({ spirit, alpha: paused ? 1 : acc / STEP, terrain, weights, time: clock, dt: paused ? 0 : dt, aura: save.aura, holding: holding(), reducedMotion: save.reducedMotion, speed });

  const f = Math.floor(spirit.flow);
  if (f !== shownFlow) {
    shownFlow = f;
    flowEl.textContent = fmt(f);
  }
  if (spirit.combo !== shownCombo) {
    shownCombo = spirit.combo;
    streakEl.textContent = spirit.combo >= 2 ? `streak ×${spirit.combo}` : "";
  }
  hintEl.hidden = save.hintSeen || takeoffs > 4 || hintTimer > 25;
  if (mode === "daily") timerFill.style.transform = `scaleX(${Math.min(1, runTime / DAILY_LENGTH)})`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
