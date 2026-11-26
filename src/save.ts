import type { PlayerProgress, StoryState, UpgradeId } from './types';
import { addDeposit, BASE_PIER_HP, createStory, noFlags, P_DEPOSIT, P_DRUM, pirateKind, STORY_FLAGS } from './story/state';
import { computeStats, createInitialProgress, UPGRADE_DEFS } from './upgrades';
import { OLD_BLOTCH } from './world';

/**
 * Versioned localStorage save (v4: Day/Night Active Incremental Wave Defense).
 * Also stores a persistent best-day record that survives Defeat run resets!
 */

export const SAVE_KEY = 'alun_itrush_2026_v4';
export const V3_SAVE_KEY = 'alun_itrush_2026_v3';
export const OLD_SAVE_KEY = 'alun_itrush_2026_v2';
export const BEST_KEY = 'alun_itrush_2026_best';

export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Loaded {
  progress: PlayerProgress;
  hasSave: boolean;
  migrated: boolean;
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function upgradesFrom(raw: unknown): Record<UpgradeId, number> {
  const src = (raw ?? {}) as Partial<Record<UpgradeId, unknown>>;
  const out = {} as Record<UpgradeId, number>;
  for (const def of UPGRADE_DEFS) {
    out[def.id] = Math.max(0, Math.min(def.maxLevel, Math.floor(num(src[def.id], 0))));
  }
  out.core = 1;
  return out;
}

function storyFrom(raw: unknown, maxPierHp: number): StoryState {
  const base = createStory(false);
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Partial<StoryState>;
  const flags = noFlags();
  for (const k of STORY_FLAGS) flags[k] = Boolean(src.flags?.[k]);
  const cycle = src.cycle === 'prep' || src.cycle === 'day' || src.cycle === 'night'
    ? src.cycle
    : flags.toolbox ? 'day' : 'prep';
  const day = Math.max(1, Math.floor(num(src.day, 1)));
  const s: StoryState = {
    ...base,
    ...src,
    version: 4,
    day,
    chapter: Math.max(1, Math.floor(num(src.chapter, day))),
    cycle,
    dayTime: Math.max(0, num(src.dayTime, 0)),
    nightTime: Math.max(0, num(src.nightTime, 0)),
    maxPierHp: Math.max(BASE_PIER_HP, num(src.maxPierHp, maxPierHp)),
    pierHp: Math.max(0, Math.min(maxPierHp, num(src.pierHp, maxPierHp))),
    flags,
    sources: Array.isArray(src.sources) ? src.sources : base.sources,
    trash: Array.isArray(src.trash) ? src.trash : [],
    arrivals: Array.isArray(src.arrivals) ? src.arrivals : [],
    log: Array.isArray(src.log) ? src.log : [],
    recoveries: Array.isArray(src.recoveries) ? src.recoveries : [],
    pirates: Array.isArray(src.pirates)
      ? src.pirates.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({
          ...p,
          variant: pirateKind(p.variant),
          anchorIdx: Math.max(0, Math.floor(num(p.anchorIdx, 0))),
          rotation: num(p.rotation, Math.PI),
          dumpTime: p.dumpTime === undefined ? undefined : Math.max(0, num(p.dumpTime, 0)),
        }))
      : [],
    wavePlan: Array.isArray(src.wavePlan)
      ? src.wavePlan.filter((p) => p && Number.isFinite(p.at)).map((p) => ({
          ...p,
          variant: pirateKind(p.variant),
          lane: Math.floor(num(p.lane, 0)),
        }))
      : [],
    hugeFlags: Array.isArray(src.hugeFlags) ? src.hugeFlags : [],
    marks: { ...base.marks, ...(src.marks ?? {}) },
    saved: { ...base.saved, ...(src.saved ?? {}) },
    boxAt: src.boxAt ?? base.boxAt,
    job: src.job ?? null,
    defeated: Boolean(src.defeated),
  };
  const held =
    s.sources.reduce((a, q) => a + num(q.amount, 0), 0) +
    s.trash.reduce((a, t) => a + num(t.pollution, 0), 0) +
    missingOpening(s) * 2;
  s.pollution = Math.max(0, Math.min(100, held));
  return s;
}

function missingOpening(s: StoryState): number {
  if (s.cycle !== 'prep' || s.step !== 'sweep') return 0;
  return Math.max(0, s.openingLeft - s.trash.filter((t) => t.opening).length);
}

function progressFrom(raw: Partial<PlayerProgress>): PlayerProgress {
  const base = createInitialProgress();
  const upgrades = upgradesFrom(raw.upgrades);
  const maxPierHp = BASE_PIER_HP + (upgrades.pier_armor ?? 0) * 35;
  const p: PlayerProgress = {
    ...base,
    coins: Math.max(0, num(raw.coins, 0)),
    totalCoinsEarned: Math.max(0, num(raw.totalCoinsEarned, 0)),
    shopUnlocked: Boolean(raw.shopUnlocked),
    upgrades,
    mangroves: Array.isArray(raw.mangroves) ? raw.mangroves : [],
    totalTrash: num(raw.totalTrash, 0),
    totalRareTrash: num(raw.totalRareTrash, 0),
    totalBoats: num(raw.totalBoats, 0),
    totalFires: num(raw.totalFires, 0),
    totalWaves: num(raw.totalWaves, 0),
    totalResonances: num(raw.totalResonances, 0),
    victoryAchieved: Boolean(raw.victoryAchieved),
    endlessMode: Boolean(raw.endlessMode),
    journalSeen: Array.isArray(raw.journalSeen) ? raw.journalSeen : [],
    story: storyFrom(raw.story, maxPierHp),
  };
  p.story.maxPierHp = computeStats(p).maxPierHp;
  p.story.pierHp = Math.min(p.story.pierHp, p.story.maxPierHp);
  return p;
}

interface OldSave extends Partial<Omit<PlayerProgress, 'story'>> {
  dolphinRescued?: boolean;
  story?: Partial<StoryState>;
}

/** Migrates legacy v2/v3 saves cleanly into the v4 Day/Night Wave Defense run. */
export function migrate(old: OldSave): PlayerProgress {
  const p = progressFrom({ ...old, story: undefined } as Partial<PlayerProgress>);
  const s = p.story;
  const f = s.flags;
  const hadBox = Boolean(old.shopUnlocked || old.story?.flags?.toolbox);
  f.toolbox = hadBox;
  f.dolphin = Boolean(old.dolphinRescued || old.story?.flags?.dolphin);
  f.damar = Boolean(p.totalBoats > 0 || old.story?.flags?.damar);
  f.seedling = p.mangroves.length > 0;
  f.planted = p.mangroves.length > 0;
  if (p.victoryAchieved) {
    for (const k of STORY_FLAGS) f[k] = true;
    s.day = 6;
    s.nightsSurvived = 5;
  } else if (hadBox) {
    s.day = Math.max(1, Math.min(5, Math.floor((num(old.story?.chapter, 1) + 1) / 2)));
  }

  if (hadBox || f.ending) {
    p.shopUnlocked = true;
    s.openingLeft = 0;
    s.box = 'home';
    s.cycle = 'day';
    s.step = 'day';
    s.dayTime = 0;
    s.nightTime = 0;
    s.sources = [];
    if (!f.waste) s.sources.push({ id: s.nextSource++, kind: 'spill', amount: P_DRUM, x: OLD_BLOTCH.x, y: OLD_BLOTCH.y, old: true });
    for (let i = 0; i < 3; i++) addDeposit(s, P_DEPOSIT);
    s.pollution = s.sources.reduce((a, q) => a + q.amount, 0);
    s.aboveSince = s.pollution > 30 ? 0 : -1;
  }
  s.chapter = s.day;
  s.worstP = s.pollution;
  return p;
}

export function loadGame(store: Store | null): Loaded {
  const fresh: Loaded = { progress: createInitialProgress(), hasSave: false, migrated: false };
  if (!store) return fresh;
  try {
    const raw = store.getItem(SAVE_KEY);
    if (raw) {
      const progress = progressFrom(JSON.parse(raw) as Partial<PlayerProgress>);
      // A defeated run is not resumable; start fresh.
      if (progress.story.defeated || progress.story.pierHp <= 0) return fresh;
      return { progress, hasSave: true, migrated: false };
    }
    const v3 = store.getItem(V3_SAVE_KEY);
    if (v3) {
      const parsed = JSON.parse(v3) as OldSave;
      if (num(parsed.totalCoinsEarned, 0) > 0 || num(parsed.totalWaves, 0) > 0 || parsed.shopUnlocked) {
        return { progress: migrate(parsed), hasSave: true, migrated: true };
      }
    }
    const old = store.getItem(OLD_SAVE_KEY);
    if (old) {
      const parsed = JSON.parse(old) as OldSave;
      if (num(parsed.totalCoinsEarned, 0) > 0 || num(parsed.totalWaves, 0) > 0) {
        return { progress: migrate(parsed), hasSave: true, migrated: true };
      }
    }
  } catch {
    // Damaged save falls back to a fresh run
  }
  return fresh;
}

export function saveGame(store: Store | null, progress: PlayerProgress): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function clearGame(store: Store | null): void {
  try {
    store?.removeItem(SAVE_KEY);
    store?.removeItem(V3_SAVE_KEY);
    store?.removeItem(OLD_SAVE_KEY);
  } catch {
    // ignore
  }
}

export interface BestRecord {
  bestDay: number;
  bestNights: number;
  bestPirates: number;
}

export function loadBest(store: Store | null): BestRecord {
  const empty: BestRecord = { bestDay: 0, bestNights: 0, bestPirates: 0 };
  if (!store) return empty;
  try {
    const raw = store.getItem(BEST_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<BestRecord>;
    return {
      bestDay: Math.max(0, Math.floor(num(parsed.bestDay, 0))),
      bestNights: Math.max(0, Math.floor(num(parsed.bestNights, 0))),
      bestPirates: Math.max(0, Math.floor(num(parsed.bestPirates, 0))),
    };
  } catch {
    return empty;
  }
}

export function updateBest(store: Store | null, progress: PlayerProgress): BestRecord {
  const cur = loadBest(store);
  const next: BestRecord = {
    bestDay: Math.max(cur.bestDay, progress.story.day),
    bestNights: Math.max(cur.bestNights, progress.story.nightsSurvived),
    bestPirates: Math.max(cur.bestPirates, progress.story.piratesSunk),
  };
  try {
    store?.setItem(BEST_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function browserStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
