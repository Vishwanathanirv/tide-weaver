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
