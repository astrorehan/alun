import type { PlayerProgress, StoryState, UpgradeId } from './types';
import { addDeposit, createStory, noFlags, P_DEPOSIT, P_DRUM, STORY_FLAGS } from './story/state';
import { createInitialProgress, UPGRADE_DEFS } from './upgrades';
import { OLD_BLOTCH } from './world';

/**
 * The save: one versioned JSON text in the browser's own storage, written in one go so that coins,
 * pollution, events and salvage always belong to the same moment.
 */

export const SAVE_KEY = 'alun_itrush_2026_v3';
export const OLD_SAVE_KEY = 'alun_itrush_2026_v2';

export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Loaded {
  progress: PlayerProgress;
  /** There is a story to continue. */
  hasSave: boolean;
  /** It came from the version before the story. */
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

/** Fills in whatever an older or damaged text is missing, so that nothing further on has to ask. */
function storyFrom(raw: unknown): StoryState {
  const base = createStory();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Partial<StoryState>;
  const flags = noFlags();
  for (const k of STORY_FLAGS) flags[k] = Boolean(src.flags?.[k]);
  const s: StoryState = {
    ...base,
    ...src,
    version: 3,
    flags,
    sources: Array.isArray(src.sources) ? src.sources : base.sources,
    trash: Array.isArray(src.trash) ? src.trash : [],
    arrivals: Array.isArray(src.arrivals) ? src.arrivals : [],
    log: Array.isArray(src.log) ? src.log : [],
    recoveries: Array.isArray(src.recoveries) ? src.recoveries : [],
    marks: { ...base.marks, ...(src.marks ?? {}) },
    saved: { ...base.saved, ...(src.saved ?? {}) },
    boxAt: src.boxAt ?? base.boxAt,
    job: src.job ?? null,
  };
  // Offer the new workshop visit to older saves between the chest handover and the rescue.
  if (s.step === 'rope' && !s.job && s.flags.toolbox && s.marks.workshopVisit === undefined) s.step = 'workshop';
  // P is what the sources and the stranded pieces hold, whatever a damaged text claims
  const held =
    s.sources.reduce((a, q) => a + num(q.amount, 0), 0) +
    s.trash.reduce((a, t) => a + num(t.pollution, 0), 0) +
    missingOpening(s) * 2;
  s.pollution = Math.max(0, Math.min(100, held));
  return s;
}

/** Opening pieces that are still owed to the water: the film was left before they were laid out. */
function missingOpening(s: StoryState): number {
  if (s.chapter !== 1 || s.step !== 'sweep') return 0;
  return Math.max(0, s.openingLeft - s.trash.filter((t) => t.opening).length);
}

function progressFrom(raw: Partial<PlayerProgress>): PlayerProgress {
  const base = createInitialProgress();
  return {
    ...base,
    coins: Math.max(0, num(raw.coins, 0)),
    totalCoinsEarned: Math.max(0, num(raw.totalCoinsEarned, 0)),
    shopUnlocked: Boolean(raw.shopUnlocked),
    upgrades: upgradesFrom(raw.upgrades),
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
    story: storyFrom(raw.story),
  };
}

interface OldSave extends Partial<Omit<PlayerProgress, 'story'>> {
  dolphinRescued?: boolean;
}

/**
 * A save from before the story. Balance, purchases, the open workshop and boss or patrol access stay;
 * an old rescue counts as the mother's. The story picks up at the first thing that is not proven, and
 * money proves nothing.
 */
export function migrate(old: OldSave): PlayerProgress {
  const p = progressFrom({ ...old, story: undefined } as Partial<PlayerProgress>);
  const s = p.story;
  const f = s.flags;
  f.toolbox = p.shopUnlocked;
  f.dolphin = Boolean(old.dolphinRescued);
  f.damar = p.totalBoats > 0;
  f.seedling = p.mangroves.length > 0;
  f.planted = p.mangroves.length > 0;
  if (p.victoryAchieved) for (const k of STORY_FLAGS) f[k] = true;
  else if ((p.upgrades.unlock_boss ?? 0) > 0) f.ops = true;
  p.upgrades.unlock_boss = 0;

  if (f.toolbox || f.ending) {
    p.shopUnlocked = true;
    s.openingLeft = 0;
    s.box = 'home';
    s.sources = [];
    if (!f.waste) s.sources.push({ id: s.nextSource++, kind: 'spill', amount: P_DRUM, x: OLD_BLOTCH.x, y: OLD_BLOTCH.y, old: true });
    for (let i = 0; i < 3; i++) addDeposit(s, P_DEPOSIT);
    s.pollution = s.sources.reduce((a, q) => a + q.amount, 0);
    s.aboveSince = s.pollution > 30 ? 0 : -1;
  }
  s.worstP = s.pollution;
  s.beacon = f.ending;
  if (f.boss) s.bossHp = 0;
  // the director works out chapter and step from the flags when the lagoon is entered
  s.step = f.toolbox ? 'migrated' : s.step;
  s.supplyTimer = 3;
  return p;
}

export function loadGame(store: Store | null): Loaded {
  const fresh: Loaded = { progress: createInitialProgress(), hasSave: false, migrated: false };
  if (!store) return fresh;
  try {
    const raw = store.getItem(SAVE_KEY);
    if (raw) {
      const progress = progressFrom(JSON.parse(raw) as Partial<PlayerProgress>);
      return { progress, hasSave: true, migrated: false };
    }
    const old = store.getItem(OLD_SAVE_KEY);
    if (old) {
      const parsed = JSON.parse(old) as OldSave;
      if (num(parsed.totalCoinsEarned, 0) > 0 || num(parsed.totalWaves, 0) > 0) {
        return { progress: migrate(parsed), hasSave: true, migrated: true };
      }
    }
  } catch {
    // a text that cannot be read is not a story to continue
  }
  return fresh;
}

/** True when the browser kept it. */
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
    store?.removeItem(OLD_SAVE_KEY);
  } catch {
    // nothing to clear in a browser that keeps nothing
  }
}

/** The browser's storage, or null where a page is not allowed any. */
export function browserStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
