/**
 * Boards and scarves, bought with abyss gems. Boards change how the spirit handles: `dive` is the
 * gravity multiplier while holding, `flip` the backflip rate. Scarves only change the picture:
 * `trail` stretches the light trail and `scarf` the length of the rider's scarf.
 */
export interface Board {
  id: string;
  name: string;
  price: number;
  dive: number;
  flip: number;
  /** Ring catch radius multiplier. */
  reach: number;
  /** A particle trail the board leaves, if any. */
  fx?: "ember" | "frost";
  note: string;
}

export interface Scarf {
  id: string;
  name: string;
  price: number;
  trail: number;
  scarf: number;
  note: string;
}

export const BOARDS: readonly Board[] = [
  { id: "wake", name: "Wake", price: 0, dive: 2.1, flip: 7.2, reach: 1, note: "Balanced" },
  { id: "anchor", name: "Anchor", price: 30, dive: 2.35, flip: 6.2, reach: 1, note: "Dives harder, flips slower" },
  { id: "feather", name: "Feather", price: 40, dive: 1.9, flip: 8.4, reach: 1.12, note: "Floats, flips fast, wider ring reach" },
  { id: "tempest", name: "Tempest", price: 90, dive: 2.25, flip: 7.8, reach: 1.06, note: "Heavy dive, quick flips" },
  // New boards go at the end: ghost links store a board by its position in this list.
  { id: "cinder", name: "Cinder", price: 70, dive: 2.2, flip: 7.4, reach: 1.04, fx: "ember", note: "Volcanic: leaves embers" },
  { id: "rime", name: "Rime", price: 70, dive: 2, flip: 7.8, reach: 1.08, fx: "frost", note: "Glacial: leaves frost mist" },
];

export const SCARVES: readonly Scarf[] = [
  { id: "plain", name: "Plain", price: 0, trail: 1, scarf: 1, note: "The first light" },
  { id: "ribbon", name: "Ribbon", price: 25, trail: 1.8, scarf: 1.5, note: "A longer trail" },
  { id: "banner", name: "Banner", price: 35, trail: 1.2, scarf: 2.1, note: "A long, flowing scarf" },
  { id: "comet", name: "Comet tail", price: 60, trail: 2.6, scarf: 1, note: "The longest trail" },
];

export const BOARD_IDS = BOARDS.map((b) => b.id);
export const SCARF_IDS = SCARVES.map((s) => s.id);

export const boardOf = (id: string): Board => BOARDS.find((b) => b.id === id) ?? BOARDS[0];
export const scarfOf = (id: string): Scarf => SCARVES.find((s) => s.id === id) ?? SCARVES[0];

/** Gem upgrades, Lv 0 to MAX_LEVEL. Vessel feeds the run rules; Magnet and Core feed physics (and so ghosts). */
export const MAX_LEVEL = 5;
export type UpId = "vessel" | "magnet" | "core";
export interface Upgrades {
  vessel: number;
  magnet: number;
  core: number;
}
export interface Upgrade {
  id: UpId;
  name: string;
  note: string;
  /** Gem price of each level: index 0 buys Lv 1. */
  price: readonly number[];
}
export const UPGRADES: readonly Upgrade[] = [
  { id: "vessel", name: "Light Vessel", note: "Light drains 8% slower per level", price: [15, 30, 55, 85, 125] },
  { id: "magnet", name: "Tide Magnet", note: "Wider ring pull, a little even outside Surge", price: [20, 35, 60, 90, 130] },
  { id: "core", name: "Surge Core", note: "Faster Surge recharge, less light spent", price: [25, 40, 65, 95, 135] },
];
export const noUpgrades = (): Upgrades => ({ vessel: 0, magnet: 0, core: 0 });
export const clampLevel = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(MAX_LEVEL, Math.floor(n))) : 0);
/** Light drain multiplier: Lv 5 lasts 40% longer. */
export const drainOf = (vessel: number): number => 1 / (1 + 0.08 * clampLevel(vessel));
/** Ring catch multiplier outside Surge; Surge keeps its own larger pull on top. */
export const pullOf = (magnet: number): number => 1 + 0.07 * clampLevel(magnet);
/** Surge recharge, seconds: 4.5 at Lv 0, about 2.8 at Lv 5. */
export const surgeCoolOf = (core: number): number => 4.5 - 0.34 * clampLevel(core);
/** Light a Surge costs (fraction of the bar). */
export const surgeCostOf = (core: number): number => 0.12 * (1 - 0.16 * clampLevel(core));
