/**
 * Three bite-sized goals are always active. Each counts something inside a single run; finish all
 * three and the rank goes up, gems are paid out and a fresh set is dealt.
 */
export type Counter = "breach" | "perfect" | "ring" | "centre" | "flipCentre" | "gem" | "surge" | "km" | "streak" | "tier" | "thread" | "doubleFlip" | "surgeRing" | "plunge";

export interface QuestDef {
  id: Counter;
  text: (n: number) => string;
  /** Targets by difficulty: rank 0, then each rank adds a step (capped at the last). */
  targets: number[];
}

export const QUEST_DEFS: readonly QuestDef[] = [
  { id: "breach", text: (n) => `Breach ${n} times in one run`, targets: [3, 4, 6, 8] },
  { id: "perfect", text: (n) => `${n} perfect dives in one run`, targets: [8, 12, 18, 25] },
  { id: "ring", text: (n) => `Fly through ${n} rings in one run`, targets: [12, 18, 26, 36] },
  { id: "centre", text: (n) => `${n} dead-centre rings in one run`, targets: [3, 5, 8, 12] },
  { id: "flipCentre", text: (n) => (n > 1 ? `${n} dead-centre rings mid-backflip` : "Take a dead-centre ring mid-backflip"), targets: [1, 2, 3, 4] },
  { id: "gem", text: (n) => `Collect ${n} abyss gems in one run`, targets: [6, 9, 13, 18] },
  { id: "surge", text: (n) => `Surge ${n} times in one run`, targets: [3, 4, 6, 8] },
  { id: "km", text: (n) => `Surf ${n} km in one run`, targets: [3, 4, 6, 8] },
  { id: "streak", text: (n) => `A streak of ${n} perfect dives`, targets: [8, 12, 16, 22] },
  { id: "tier", text: () => "Reach the Radiant tier", targets: [2, 3, 3, 3] },
  { id: "thread", text: (n) => `Thread ${n} split rings`, targets: [2, 3, 4, 6] },
  { id: "doubleFlip", text: (n) => (n > 1 ? `Land ${n} double backflips` : "Land a double backflip"), targets: [1, 2, 3, 4] },
  { id: "surgeRing", text: (n) => `Catch ${n} rings during Surges`, targets: [3, 5, 7, 10] },
  { id: "plunge", text: (n) => `Plunge into the abyss ${n} times`, targets: [4, 6, 8, 11] },
];

export interface Quest {
  id: Counter;
  target: number;
  done: boolean;
}

export type Counters = Record<Counter, number>;

export const QUEST_IDS = QUEST_DEFS.map((q) => q.id) as Counter[];
export const emptyCounters = (): Counters => Object.fromEntries(QUEST_IDS.map((k) => [k, 0])) as Counters;

const def = (id: Counter) => QUEST_DEFS.find((q) => q.id === id)!;

/** The tier goal counts tiers reached (Radiant is 2); the others count events. */
export const targetFor = (id: Counter, rank: number): number => {
  const t = def(id).targets;
  return t[Math.min(t.length - 1, Math.max(0, rank))];
};

export const questText = (q: Quest): string => {
  if (q.id === "tier") return q.target >= 3 ? "Reach the Transcendent tier" : "Reach the Radiant tier";
  return def(q.id).text(q.target);
};

/** Deals `count` distinct goals for the given rank. `rand` is injectable so tests are repeatable. */
export function deal(rank: number, count = 3, rand: () => number = Math.random, avoid: Counter[] = []): Quest[] {
  const pool = QUEST_IDS.filter((id) => !avoid.includes(id));
  const out: Quest[] = [];
  while (out.length < count && pool.length) {
    const i = Math.floor(rand() * pool.length);
    const [id] = pool.splice(i, 1);
    out.push({ id, target: targetFor(id, rank), done: false });
  }
  return out;
}

/** Checks the counters against the goals. Returns the goals that were finished by this call. */
export function check(quests: Quest[], counters: Counters): Quest[] {
  const finished: Quest[] = [];
  for (const q of quests) {
    if (!q.done && counters[q.id] >= q.target) {
      q.done = true;
      finished.push(q);
    }
  }
  return finished;
}

export const allDone = (quests: Quest[]): boolean => quests.length > 0 && quests.every((q) => q.done);

export const GEMS_PER_GOAL = 3;
export const GEMS_PER_RANK = 10;
