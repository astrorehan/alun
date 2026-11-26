import { SCENES } from './talk';
import type { EntityKind, JobKind, JobState, PirateKind, PlayerProgress, StoryFlag, StoryState, WaveSpawn } from '../types';
import { PIRATE_KIND } from '../types';
import { DEPOSIT_SPOTS, MOORING, OLD_BLOTCH } from '../world';

/**
 * Pure data for ALUN's Day/Night Active Incremental Wave Defense:
 * 150s Day (farming + skirmishes + side jobs) -> 60s Night (PvZ-style escalating pirate waves).
 * Pier HP reaching 0 ends the run and restarts from Day 1.
 */

export const DAY_DURATION = 150;
export const NIGHT_DURATION = 60;
export const BOSS_INTERVAL = 5;
export const BASE_PIER_HP = 100;
export const REPAIR_HEAL = 35;

export const CHAPTER_TITLES = [
  '',
  'Dermaga Terbuka',
  'Armada Pukat',
  'Sabotase Limbah',
  'Pengepungan Teluk',
  'Badai Muson',
  'Patroli Tanpa Batas',
];

export const PATROL = 6;

export function dayTitle(day: number): string {
  if (day <= 5) return CHAPTER_TITLES[Math.max(1, day)];
  return 'Patroli Tanpa Batas';
}

export function chapterTitle(n: number): string {
  return dayTitle(n);
}

export function chapterKicker(n: number): string {
  return `HARI ${n} · ${dayTitle(n).toUpperCase()}`;
}

export function isBossDay(day: number): boolean {
  return day >= BOSS_INTERVAL && day % BOSS_INTERVAL === 0;
}

export function pierRepairCost(day: number): number {
  return Math.round(24 + Math.max(0, day - 1) * 8);
}

/* ================================================================== economy */

/** Base coin value of each salvage piece (-20% balanced for early Muatan unlock). */
export const SALVAGE_VALUE: Partial<Record<EntityKind, number>> = {
  trash_bottle: 3,
  trash_bag: 6,
  trash_net: 9,
  trash_crate: 14,
  trash_battery: 24,
  trash_relic: 42,
};

/** Legacy defaults kept exported for compatibility. */
export const SUPPLY_PER_MINUTE = 64;
export const SUPPLY_HELD = 56;
export const SUPPLY_WINDOW = 60;

export const CALM = 8;
export const CALM_STORY = 10;

export const PAY = {
  dolphin: 38,
  boat: 34,
  boatBonus: 13,
  basket: 14,
  trawl: 44,
  waste: 44,
  wasteLeaked: 22,
  fireMax: 52,
  boss: 210,
  ending: 120,
} as const;

/* ================================================================== pollution */

export const P_START = 36;
export const P_TRASH = 2;
export const P_DRUM = 12;
export const P_GHOST = 6;
export const P_DEPOSIT = 4;
export const P_MANGROVE = 3;
export const P_HEALTHY = 30;
export const P_DIRTY = 60;

export const RAIDER_HP = 34;
export const POLLUTER_HP = 32;
export const TRAWL_HP = 62;
export const BOSS_HP = 2200;
export const BASE_HIT = 10;

export function bossHpForDay(day: number): number {
  const tier = Math.max(0, Math.floor((day - BOSS_INTERVAL) / BOSS_INTERVAL));
  return Math.round(BOSS_HP * Math.pow(2.4, tier));
}

export function nightClearBonus(day: number): number {
  return 28 + day * 14;
}

/* ================================================================== pirate specs & PvZ waves */

export interface PirateSpec {
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  bounty: number;
  radius: number;
  mass: number;
  attackPeriod: number;
  intro?: string;
}

export const PIRATE_SPECS: Record<PirateKind, PirateSpec> = {
  [PIRATE_KIND.raider]: {
    name: 'PENJARAH', hp: RAIDER_HP, speed: 54, dmg: 11, bounty: 14, radius: 27, mass: 2.45, attackPeriod: 2.3,
  },
  [PIRATE_KIND.skiff]: {
    name: 'PERAHU CEPAT', hp: 22, speed: 78, dmg: 8, bounty: 11, radius: 23, mass: 1.8, attackPeriod: 1.95,
  },
  [PIRATE_KIND.heavy]: {
    name: 'PENJARAH BERAT', hp: 64, speed: 41, dmg: 18, bounty: 29, radius: 33, mass: 3.8, attackPeriod: 2.6,
  },
  [PIRATE_KIND.shield]: {
    name: 'KAPAL PERISAI', hp: 27, speed: 45, dmg: 12, bounty: 21, radius: 29, mass: 2.8, attackPeriod: 2.4,
    intro: SCENES.shield.lines[0].text,
  },
  [PIRATE_KIND.dumper]: {
    name: 'KAPAL RONGSOK', hp: 30, speed: 49, dmg: 8, bounty: 15, radius: 28, mass: 2.6, attackPeriod: 2.65,
    intro: SCENES.dumper.lines[0].text,
  },
  [PIRATE_KIND.signal]: {
    name: 'KAPAL ISYARAT', hp: 31, speed: 48, dmg: 9, bounty: 20, radius: 28, mass: 2.45, attackPeriod: 2.5,
    intro: SCENES.signal.lines[0].text,
  },
};

export const PIRATE_SIGNAL_RADIUS = 165;

export function pirateKind(value: unknown): PirateKind {
  return typeof value === 'number' && Number.isInteger(value) && value >= PIRATE_KIND.raider && value <= PIRATE_KIND.signal
    ? (value as PirateKind)
    : PIRATE_KIND.raider;
}

/** Enemy ship HP doubles every single day (1x -> 2x -> 4x -> 8x -> 16x -> 32x...). */
export function pirateScale(day: number): number {
  return Math.pow(2, Math.max(0, day - 1));
}

export function pirateSpec(variant: PirateKind, day: number, isNight: boolean): PirateSpec {
  const sc = pirateScale(day) * (isNight ? 1 : 0.78);
  const dmgSc = 1 + Math.max(0, day - 1) * 0.4;
  const spdSc = 1 + Math.min(0.65, Math.max(0, day - 1) * 0.11);
  const massSc = 1 + Math.min(1.8, Math.max(0, day - 1) * 0.25);
  const bountySc = 1 + Math.max(0, day - 1) * 0.3;
  const base = PIRATE_SPECS[variant];
  return {
    ...base,
    hp: Math.round(base.hp * sc),
    speed: Math.round(base.speed * spdSc),
    dmg: Math.round(base.dmg * dmgSc),
    bounty: Math.round(base.bounty * bountySc),
    mass: base.mass * massSc,
  };
}

/** Deterministic PvZ-style night wave schedule over 60 seconds, with marked Huge Waves. */
export function buildNightWave(day: number): { plan: WaveSpawn[]; hugeFlags: number[] } {
  const plan: WaveSpawn[] = [];
  const add = (at: number, variant: PirateKind, lane: number, huge = false, support?: 'trawl' | 'waste'): void => {
    plan.push({ at, variant, lane: lane % 6, huge, support });
  };

  if (day === 1) {
    // Punchy PvZ Day 1 night: 9 ships, final huge wave of 4 ships attacking simultaneously!
    add(1.5, 0, 0);
    add(8, 1, 1);
    add(15, 0, 3);
    add(22, 1, 2);
    add(29, 0, 4);
    // HUGE WAVE
    add(39, 0, 0, true);
    add(40, 1, 3);
    add(41, 0, 1);
    add(42.2, 1, 4);
    return { plan, hugeFlags: [39 / NIGHT_DURATION] };
  }

  if (day === 2) {
    // 13 ships + Brutes & Trawl support
    add(1.5, 1, 0);
    add(6.5, 0, 2);
    add(11.5, 0, 4);
    add(17, 2, 1, false, 'trawl');
    add(22, 1, 3);
    add(26.5, PIRATE_KIND.shield, 5);
    add(31, 2, 2);
    add(35, 1, 0);
    // HUGE WAVE
    add(41, 2, 0, true);
    add(42, 0, 3);
    add(43, 1, 1);
    add(44, 0, 4);
    add(45, 1, 2);
    return { plan, hugeFlags: [41 / NIGHT_DURATION] };
  }

  if (day === 3) {
    // 17 ships + 2 Huge Waves + Drum Ship support
    add(1.5, 0, 0);
    add(5.5, 1, 3);
    add(10, PIRATE_KIND.dumper, 1);
    add(14.5, 2, 2);
    add(18.5, 1, 4);
    // HUGE WAVE 1
    add(23, 2, 0, true, 'waste');
    add(24, PIRATE_KIND.shield, 3);
    add(25, 1, 1);
    add(26, 0, 4);
    add(32, 1, 5);
    add(36, PIRATE_KIND.dumper, 2);
    add(39.5, 2, 0);
    // HUGE WAVE 2 (Final)
    add(44, 2, 1, true);
    add(45, 2, 3);
    add(46, 0, 0);
    add(47, 1, 4);
    add(48, 0, 2);
    return { plan, hugeFlags: [23 / NIGHT_DURATION, 44 / NIGHT_DURATION] };
  }

  if (day === 4) {
    // 21 ships + 2 Huge Waves + Trawl & Drum pressure
    add(1.5, 1, 0);
    add(4.5, 0, 3);
    add(8, 2, 1);
    add(12, 1, 4);
    add(15.5, 0, 2, false, 'trawl');
    add(19, PIRATE_KIND.shield, 5);
    // HUGE WAVE 1
    add(23, 2, 0, true);
    add(24, 2, 3);
    add(25, PIRATE_KIND.signal, 1);
    add(26, 0, 4);
    add(27, 1, 2);
    add(33, 0, 5, false, 'waste');
    add(36.5, 2, 1);
    add(39.5, 1, 3);
    // HUGE WAVE 2 (Final)
    add(44, 2, 0, true);
    add(45, PIRATE_KIND.signal, 2);
    add(46, 2, 4);
    add(47, 1, 1);
    add(48, PIRATE_KIND.dumper, 3);
    add(49, 1, 5);
    add(50, 0, 0);
    return { plan, hugeFlags: [23 / NIGHT_DURATION, 44 / NIGHT_DURATION] };
  }

  if (isBossDay(day)) {
    // Monsoon Boss Night (Day 5, 10, 15...): Mother Ship + heavy escort waves!
    const extra = Math.min(10, Math.floor((day - BOSS_INTERVAL) / BOSS_INTERVAL) * 4);
    add(3, 1, 0);
    add(7, 0, 3);
    add(11.5, 2, 1);
    add(16, 1, 4);
    add(20, PIRATE_KIND.dumper, 2);
    add(24.5, 2, 0);
    // HUGE ESCORT WAVE
    add(30, 2, 0, true);
    add(31, PIRATE_KIND.signal, 3);
    add(32, 0, 1);
    add(33, 1, 4);
    add(34, 1, 2);
    add(40, 0, 5);
    add(44, PIRATE_KIND.shield, 0);
    add(48, 1, 3);
    add(51, 2, 1);
    add(54, 0, 4);
    for (let i = 0; i < extra; i++) {
      add(9 + i * 4.5, (i % 3) as PirateKind, i + 1);
    }
    plan.sort((a, b) => a.at - b.at);
    return { plan, hugeFlags: [30 / NIGHT_DURATION] };
  }

  // Endless Day 6+: dense multi-flag PvZ waves!
  const total = Math.min(34, 21 + (day - 4) * 2);
  const wave1At = 22;
  const wave2At = 44;
  const huge1Count = 5 + Math.min(4, Math.floor((day - 5) / 2));
  const huge2Count = 6 + Math.min(5, Math.floor((day - 5) / 2));
  const trickle = Math.max(5, total - huge1Count - huge2Count);

  for (let i = 0; i < trickle; i++) {
    const t = 1.5 + (i / trickle) * 40;
    const adjusted = Math.abs(t - wave1At) < 3 ? t + 4.5 : t;
    const v: PirateKind = i % 4 === 0 ? 2 : i % 3 === 1 ? 1 : 0;
    const sup = i === 2 ? 'trawl' : i === Math.floor(trickle * 0.65) ? 'waste' : undefined;
    add(adjusted, i === 4 || i === trickle - 1 ? PIRATE_KIND.dumper : v, i + day, false, sup);
  }
  for (let i = 0; i < huge1Count; i++) {
    const v: PirateKind = i < 2 ? 2 : i % 2 === 0 ? 1 : 0;
    add(wave1At + i * 0.85, i === 1 ? PIRATE_KIND.shield : v, i + 1, i === 0);
  }
  for (let i = 0; i < huge2Count; i++) {
    const v: PirateKind = i < 3 ? 2 : i % 2 === 0 ? 1 : 0;
    add(wave2At + i * 0.8, i === 1 ? PIRATE_KIND.signal : v, i + 2, i === 0);
  }
  plan.sort((a, b) => a.at - b.at);
  return { plan, hugeFlags: [wave1At / NIGHT_DURATION, wave2At / NIGHT_DURATION] };
}

/* ================================================================== story flags (milestones) */

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

export function knowsFleet(f: Flags): boolean {
  return f.trawl && f.waste;
}

/** Pure incremental: no chapter level caps once the workshop is open! */
export function toolLevelCap(f: Flags): number {
  return f.toolbox ? 99 : 0;
}

export function whereAt(f: Flags, openingLeft: number): { chapter: number; step: string } {
  if (!f.toolbox) return { chapter: 1, step: openingLeft > 0 ? 'sweep' : 'box' };
  return { chapter: f.ending ? PATROL : 1, step: 'day' };
}

export function nextSupply(f: Flags): string | null {
  if (!f.toolbox) return 'Sapu 6 sampah awal dan antar peti perkakas untuk membuka bengkel.';
  return null;
}

/* ================================================================== state */

export function createStory(skipPrep = false): StoryState {
  const flags = noFlags();
  if (skipPrep) flags.toolbox = true;

  const s: StoryState = {
    version: 4,
    day: 1,
    chapter: 1,
    cycle: skipPrep ? 'day' : 'prep',
    dayTime: 0,
    nightTime: 0,
    pierHp: BASE_PIER_HP,
    maxPierHp: BASE_PIER_HP,
    flags,
    clock: 0,
    step: skipPrep ? 'day' : 'sweep',
    pollution: 0,
    sources: [],
    nextSource: 1,
    openingLeft: skipPrep ? 0 : 6,
    box: skipPrep ? 'home' : 'hidden',
    boxAt: { ...MOORING },
    job: null,
    jobSeq: 0,
    calmUntil: 0,
    turn: 0,
    rounds: 0,
    threat: 0,
    callAnswered: false,
    bossHp: BOSS_HP,
    baskets: 2,
    beacon: false,
    log: [],
    arrivals: [],
    trash: [],
    pirates: [],
    wavePlan: [],
    waveTotal: 0,
    waveSpawned: 0,
    waveDefeated: 0,
    hugeFlags: [],
    hugeAnnounced: 0,
    skirmishTimer: 26,
    sideEventTimer: 22,
    supplyTimer: 1.5,
    seedTimer: 18,
    padTimer: 2.5,
    marks: { bab1: 0, day1: 0 },
    worstP: P_START,
    aboveSince: 0,
    recoveries: [],
    piratesSunk: 0,
    nightsSurvived: 0,
    defeated: false,
    saved: { dolphins: 0, baskets: 0, raids: 0, trawls: 0, spills: 0, deposits: 0, ghosts: 0 },
  };
  s.sources.push({ id: s.nextSource++, kind: 'spill', amount: P_DRUM, x: OLD_BLOTCH.x, y: OLD_BLOTCH.y, old: true });
  for (let i = 0; i < 3; i++) addDeposit(s, P_DEPOSIT);
  s.pollution = (skipPrep ? 0 : 6 * P_TRASH) + s.sources.reduce((a, q) => a + q.amount, 0);
  s.worstP = s.pollution;
  if (s.pollution <= P_HEALTHY) s.aboveSince = -1;
  return s;
}

export function addDeposit(s: StoryState, amount: number): void {
  const used = new Set(s.sources.filter((q) => q.kind === 'deposit').map((q) => `${q.x}:${q.y}`));
  const free =
    DEPOSIT_SPOTS.find((d) => !used.has(`${d.x}:${d.y}`)) ?? DEPOSIT_SPOTS[s.nextSource % DEPOSIT_SPOTS.length];
  s.sources.push({ id: s.nextSource++, kind: 'deposit', amount, x: free.x, y: free.y });
}

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

/** Pure incremental salvage weights: rare items start scarce and bloom as you upgrade Rarity & reach later Days! */
export function salvageWeights(rarity: number, day = 1): [EntityKind, number][] {
  const d = Math.min(8, Math.max(0, day - 1));
  return [
    ['trash_bottle', Math.max(8, 46 - rarity * 7 - d * 2)],
    ['trash_bag', Math.max(10, 34 - rarity * 4 - d * 1.5)],
    ['trash_net', 14 + rarity * 2 + d * 1.2],
    ['trash_crate', 5 + rarity * 6 + d * 2.2],
    ['trash_battery', 1.5 + rarity * 5 + d * 1.8],
    ['trash_relic', 0.4 + rarity * 3.8 + d * 1.5],
  ];
}

export function heldPollution(p: PlayerProgress): number {
  const s = p.story;
  return s.sources.reduce((a, q) => a + q.amount, 0) + s.trash.reduce((a, q) => a + (q.pollution ?? 0), 0);
}
