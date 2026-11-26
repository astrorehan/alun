import type { EntityKind, JobKind, JobState, PlayerProgress, StoryFlag, StoryState } from '../types';
import { DEPOSIT_SPOTS, MOORING, OLD_BLOTCH } from '../world';

/**
 * The story as plain data: what a save holds, what each flag means and the numbers of the economy.
 * Nothing here touches the page, the renderer or the clock on the wall.
 */

export const CHAPTER_TITLES = [
  '',
  'Dermaga tertutup',
  'Suara di karang',
  'Nelayan pertama pulang',
  'Penjarah menyusul',
  'Siapa yang mengambil ikan',
  'Pantai menanggung akibatnya',
  'Jaga malam',
  'Badai dan kepulangan',
  'Patroli Laguna',
];

export const PATROL = 9;

/**
 * The ships that come back before a chapter's own event, in this order. Each must be seen off, so a
 * failed one comes round again. Chapter 7 has two waits: before the calf, and before the night watch.
 */
export function roundsFor(chapter: number, calf: boolean): JobKind[] {
  switch (chapter) {
    case 5:
      return ['raid', 'raid'];
    case 6:
      return ['raid', 'trawl', 'raid'];
    case 7:
      return calf ? ['trawl', 'raid'] : ['waste', 'raid'];
    default:
      return [];
  }
}

export function chapterTitle(n: number): string {
  return CHAPTER_TITLES[Math.min(PATROL, Math.max(1, n))];
}

export function chapterKicker(n: number): string {
  return n >= PATROL ? 'PATROLI LAGUNA' : `BAB ${n} · ${chapterTitle(n).toUpperCase()}`;
}

/* ================================================================== economy */

/** What each piece of salvage pays. A piece that is in the water always pays this in full. */
export const SALVAGE_VALUE: Partial<Record<EntityKind, number>> = {
  trash_bottle: 4,
  trash_bag: 6,
  trash_net: 8,
  trash_crate: 10,
  trash_battery: 12,
  trash_relic: 16,
};

/** The flag that starts each kind of salvage arriving. */
export const SALVAGE_FLAG: Partial<Record<EntityKind, StoryFlag>> = {
  trash_net: 'dolphin',
  trash_crate: 'damar',
  trash_battery: 'waste',
  trash_relic: 'ending',
};

/** The tide brings at most this many valued pieces in any 60 seconds of play... */
export const SUPPLY_PER_MINUTE = 24;
/** ...and never more than this many lie in the water and on the beach together. */
export const SUPPLY_HELD = 22;
export const SUPPLY_WINDOW = 60;

/** Calm play between the end of one paid job and the start of the next, at the very least. */
export const CALM = 10;
/** The story leaves a little more, for the workshop and for what was just said. */
export const CALM_STORY = 14;

export const PAY = {
  dolphin: 24,
  boat: 16,
  boatBonus: 4,
  basket: 12,
  trawl: 24,
  waste: 24,
  wasteLeaked: 12,
  fireMax: 24,
  ending: 60,
} as const;

/** The most new coins any 60 seconds of play can bring, from the plan's own worst case. */
export const INCOME_CAP = 492;

/* ================================================================== pollution */

export const P_START = 36;
export const P_TRASH = 2;
export const P_DRUM = 12;
export const P_GHOST = 6;
export const P_DEPOSIT = 4;
/** What a planted mangrove holds back of the old deposits. */
export const P_MANGROVE = 2;
export const P_HEALTHY = 30;
export const P_DIRTY = 60;

export const RAIDER_HP = 24;
export const POLLUTER_HP = 30;
export const TRAWL_HP = 90;
export const BOSS_HP = 90;
/** A basic wave, before Tenaga Pasang and charge. */
export const BASE_HIT = 10;

/* ================================================================== blueprints */

export const STORY_FLAGS: StoryFlag[] = [
  'toolbox',
  'dolphin',
  'seedling',
  'planted',
  'damar',
  'cargo',
  'trawl',
  'waste',
  'calf',
  'night',
  'ops',
  'boss',
  'ending',
];

export type Flags = Record<StoryFlag, boolean>;

export function noFlags(): Flags {
  const f = {} as Flags;
  for (const k of STORY_FLAGS) f[k] = false;
  return f;
}

/** Trawl stopped and waste handled: the village knows the whole fleet by now. */
export function knowsFleet(f: Flags): boolean {
  return f.trawl && f.waste;
}

/** How far the workshop can install anything, before each tool's own maximum. */
export function toolLevelCap(f: Flags): number {
  if (f.ending) return 99;
  if (knowsFleet(f)) return 3;
  if (f.damar) return 2;
  return f.toolbox ? 1 : 0;
}

/** The first chapter whose proof is missing is the chapter the player is in. */
export function whereAt(f: Flags, openingLeft: number, callAnswered = false): { chapter: number; step: string } {
  if (f.ending) return { chapter: PATROL, step: 'patrol' };
  if (f.boss) return { chapter: 8, step: 'clean' };
  if (f.ops && callAnswered) return { chapter: 8, step: 'call' };
  if (!f.toolbox) return { chapter: 1, step: openingLeft > 0 ? 'sweep' : 'box' };
  if (!f.dolphin) return { chapter: 2, step: 'rope' };
  if (!f.damar) return { chapter: 3, step: 'wait' };
  if (!f.cargo) return { chapter: 4, step: 'wait' };
  if (!f.trawl) return { chapter: 5, step: 'wait' };
  if (!f.waste) return { chapter: 6, step: 'wait' };
  if (!f.calf || !f.night) return { chapter: 7, step: 'wait' };
  if (f.ops) return { chapter: 8, step: 'call' };
  return { chapter: 7, step: 'healthy' };
}

/** The one thing the workshop is still waiting for. */
export function nextSupply(f: Flags): string | null {
  if (!f.toolbox) return 'Peti perkakas masih tersangkut di tambatan.';
  if (!f.dolphin) return 'Tali di karang bisa dipakai menambal jaring kalau sudah lepas.';
  if (!f.damar) return 'Kumparan masih dibawa Pak Damar.';
  if (!f.cargo) return 'Nelayan baru mau meminjamkan sonar kalau muatannya aman.';
  if (!f.trawl) return 'Warga masih mencari pemilik pelampung bergaris.';
  if (!f.waste) return 'Alat besar dipasang setelah minyak di batu tertangani.';
  if (!f.ending) return 'Sisa tingkat alat dikerjakan setelah armada pulang.';
  return null;
}

/* ================================================================== state */

export function createStory(): StoryState {
  const s: StoryState = {
    version: 3,
    chapter: 1,
    flags: noFlags(),
    clock: 0,
    step: 'sweep',
    pollution: 0,
    sources: [],
    nextSource: 1,
    openingLeft: 6,
    box: 'hidden',
    boxAt: { ...MOORING },
    job: null,
    jobSeq: 0,
    calmUntil: 0,
    turn: 0,
    rounds: 0,
    threat: 0,
    callAnswered: false,
    bossHp: BOSS_HP,
    baskets: 0,
    beacon: false,
    log: [],
    arrivals: [],
    trash: [],
    supplyTimer: 4,
    seedTimer: 20,
    padTimer: 3,
    marks: { bab1: 0 },
    worstP: P_START,
    aboveSince: 0,
    recoveries: [],
    saved: { dolphins: 0, baskets: 0, raids: 0, trawls: 0, spills: 0, deposits: 0, ghosts: 0 },
  };
  s.sources.push({ id: s.nextSource++, kind: 'spill', amount: P_DRUM, x: OLD_BLOTCH.x, y: OLD_BLOTCH.y, old: true });
  for (let i = 0; i < 3; i++) addDeposit(s, P_DEPOSIT);
  s.pollution = 6 * P_TRASH + s.sources.reduce((a, q) => a + q.amount, 0);
  return s;
}

/** Puts an old deposit under the sand, at the first spot nobody uses yet. */
export function addDeposit(s: StoryState, amount: number): void {
  const used = new Set(s.sources.filter((q) => q.kind === 'deposit').map((q) => `${q.x}:${q.y}`));
  const free =
    DEPOSIT_SPOTS.find((d) => !used.has(`${d.x}:${d.y}`)) ?? DEPOSIT_SPOTS[s.nextSource % DEPOSIT_SPOTS.length];
  s.sources.push({ id: s.nextSource++, kind: 'deposit', amount, x: free.x, y: free.y });
}

/** Adds to P and says how much of it fitted under 100. The caller remembers that amount to give it back. */
export function addPollution(s: StoryState, amount: number): number {
  const before = s.pollution;
  s.pollution = Math.min(100, before + amount);
  s.worstP = Math.max(s.worstP, s.pollution);
  if (s.pollution > P_HEALTHY && s.aboveSince < 0) s.aboveSince = s.clock;
  return s.pollution - before;
}

export function removePollution(s: StoryState, amount: number): void {
  s.pollution = Math.max(0, s.pollution - amount);
  if (s.pollution <= P_HEALTHY && s.aboveSince >= 0) {
    s.recoveries.push(Math.round(s.clock - s.aboveSince));
    if (s.recoveries.length > 20) s.recoveries.shift();
    s.aboveSince = -1;
  }
}

export function newJob(s: StoryState, kind: JobKind, story: boolean, variant: number): JobState {
  s.jobSeq += 1;
  return {
    id: `${kind}-${s.jobSeq}`,
    kind,
    story,
    variant,
    phase: 'start',
    t: 0,
    total: 0,
    touched: false,
    p0: s.pollution,
    hp: 0,
    baskets: 0,
    work: 0,
    pay: 0,
    leaked: false,
    sources: [],
    turns: 0,
    seen: { trawl: false, drum: false },
    at: null,
  };
}

/** Salvage that may arrive now, with how often. Kelangkaan moves the weight, never the values. */
export function salvageWeights(f: Flags, rarity: number): [EntityKind, number][] {
  const w: [EntityKind, number][] = [
    ['trash_bottle', Math.max(12, 46 - rarity * 8)],
    ['trash_bag', Math.max(12, 36 - rarity * 5)],
  ];
  const add = (k: EntityKind, base: number, per: number): void => {
    const flag = SALVAGE_FLAG[k];
    if (!flag || f[flag]) w.push([k, base + per * rarity]);
  };
  add('trash_net', 16, 1);
  add('trash_crate', 10, 3);
  add('trash_battery', 6, 4);
  add('trash_relic', 2, 3);
  return w;
}

/** The sum of everything that holds pollution, which P must always equal. The tests lean on it. */
export function heldPollution(p: PlayerProgress): number {
  const s = p.story;
  return s.sources.reduce((a, q) => a + q.amount, 0) + s.trash.reduce((a, q) => a + (q.pollution ?? 0), 0);
}
