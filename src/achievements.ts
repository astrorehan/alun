import type { PlayerProgress } from './types';
import type { UiIconName } from './ui-kit/icons';
import type { UiSwatch } from './ui-kit/templates';

export interface AchievementDef {
  id: string;
  chapter: 1 | 2;
  title: string;
  desc: string;
  icon: UiIconName;
  swatch: UiSwatch;
  target: number;
  rewardCoins: number;
  getValue: (p: PlayerProgress) => number;
}

function countOwnedUpgradeLevels(p: PlayerProgress): number {
  return Object.entries(p.upgrades).reduce((sum, [k, v]) => sum + (k === 'core' ? 0 : v), 0);
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // ================= CHAPTER 1: PENJAGA LAGUNA =================
  {
    id: 'first_waves',
    chapter: 1,
    title: 'Sapuan Pertama',
    desc: 'Kirim 5 sapuan ombak di laguna tropis',
    icon: 'wave',
    swatch: 'green',
    target: 5,
    rewardCoins: 25,
    getValue: (p) => p.totalWaves,
  },
  {
    id: 'clean_25',
    chapter: 1,
    title: 'Pembersih Pesisir',
    desc: 'Giring 25 muatan limbah ke Jaring Desa',
    icon: 'net',
    swatch: 'blue',
    target: 25,
    rewardCoins: 45,
    getValue: (p) => p.totalTrash,
  },
  {
    id: 'upgrade_3',
    chapter: 1,
    title: 'Kalibrasi Perdana',
    desc: 'Tingkatkan 3 level modul A.L.U.N.',
    icon: 'energy',
    swatch: 'purple',
    target: 3,
    rewardCoins: 65,
    getValue: (p) => countOwnedUpgradeLevels(p),
  },
  {
    id: 'rare_5',
    chapter: 1,
    title: 'Pemburu Muatan Langka',
    desc: 'Panen 5 muatan Langka, Epik, atau Legendaris',
    icon: 'rarity',
    swatch: 'gold',
    target: 5,
    rewardCoins: 130,
    getValue: (p) => p.totalRareTrash,
  },
  {
    id: 'mangrove_4',
    chapter: 1,
    title: 'Tunas Mangrove',
    desc: 'Tumbuhkan 4 pohon mangrove di pantai kiri',
    icon: 'mangrove',
    swatch: 'teal',
    target: 4,
    rewardCoins: 160,
    getValue: (p) => p.mangroves.length,
  },
  {
    id: 'clean_140',
    chapter: 1,
    title: 'Panen Raya Laguna',
    desc: 'Kumpulkan 140 muatan limbah total',
    icon: 'density',
    swatch: 'orange',
    target: 140,
    rewardCoins: 240,
    getValue: (p) => p.totalTrash,
  },

  // ================= CHAPTER 2: HARMONI TROPIS =================
  {
    id: 'boats_3',
    chapter: 2,
    title: 'Sahabat Nelayan',
    desc: 'Pandu 3 perahu nelayan bersandar ke dermaga',
    icon: 'boat',
    swatch: 'blue',
    target: 3,
    rewardCoins: 280,
    getValue: (p) => p.totalBoats,
  },
  {
    id: 'fires_3',
    chapter: 2,
    title: 'Penjaga Rafflesia',
    desc: 'Padamkan 3 titik api di tepi rimba tropis',
    icon: 'fire',
    swatch: 'orange',
    target: 3,
    rewardCoins: 360,
    getValue: (p) => p.totalFires,
  },
  {
    id: 'resonance_6',
    chapter: 2,
    title: 'Master Resonansi',
    desc: 'Picu 6 ledakan Resonansi Konstruktif',
    icon: 'resonance',
    swatch: 'purple',
    target: 6,
    rewardCoins: 420,
    getValue: (p) => p.totalResonances,
  },
  {
    id: 'mangrove_10',
    chapter: 2,
    title: 'Sabuk Hijau Pesisir',
    desc: 'Tumbuhkan 10 pohon mangrove permanen',
    icon: 'mangrove',
    swatch: 'green',
    target: 10,
    rewardCoins: 520,
    getValue: (p) => p.mangroves.length,
  },
  {
    id: 'coins_3000',
    chapter: 2,
    title: 'Ekonomi Pesisir Jaya',
    desc: 'Kumpulkan total 3.000 Koin Pesisir',
    icon: 'coin',
    swatch: 'gold',
    target: 3000,
    rewardCoins: 680,
    getValue: (p) => Math.floor(p.totalCoinsEarned),
  },
  {
    id: 'boss_win',
    chapter: 2,
    title: 'Pahlawan Badai Muson',
    desc: 'Usir Kapal Limbah Ilegal dari laguna',
    icon: 'boss',
    swatch: 'red',
    target: 1,
    rewardCoins: 1500,
    getValue: (p) => (p.victoryAchieved ? 1 : 0),
  },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = ACHIEVEMENT_DEFS.reduce(
  (acc, def) => {
    acc[def.id] = def;
    return acc;
  },
  {} as Record<string, AchievementDef>
);

export function isAchievementClaimable(def: AchievementDef, progress: PlayerProgress): boolean {
  if (progress.claimedAchievements.includes(def.id)) return false;
  return def.getValue(progress) >= def.target;
}

export function countClaimableAchievements(
  progress: PlayerProgress,
  chapter?: 1 | 2
): number {
  let count = 0;
  for (const def of ACHIEVEMENT_DEFS) {
    if (chapter !== undefined && def.chapter !== chapter) continue;
    if (isAchievementClaimable(def, progress)) count += 1;
  }
  return count;
}
