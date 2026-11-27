import { BASE_HIT, BASE_PIER_HP, createStory, salvageWeights } from './story/state';
import type { ComputedStats, PlayerProgress, UpgradeDef, UpgradeId } from './types';

/** Damage one hit does to a hull. Scales freely with incremental upgrades, charge & sonar crit! */
export function hitDamage(power: number, charge: number, critBonus = 0): number {
  return Math.ceil(BASE_HIT * power * (1 + charge * 0.85) * (1 + critBonus) - 1e-6);
}

/** Tenaga Pasang as the player sees it: one hit of an uncharged wave. */
export function basicHit(level: number): number {
  return hitDamage(wavePowerAt(level), 0);
}

/** Tenaga Pasang push and hull damage by level; the curve flattens after Lv 3 so one tool cannot carry the nights. */
const WAVE_POWER = [1, 1.56, 2.28, 3.16, 3.8, 4.45, 5.1];

function wavePowerAt(level: number): number {
  return WAVE_POWER[Math.max(0, Math.min(WAVE_POWER.length - 1, Math.round(level)))];
}

/** Coin bonus for a run of catches at this Harmoni Kombo level: steps of 10%, up to the cap. */
export function comboMultiplier(combo: number, level: number): number {
  const step = level > 0 ? 2 : 3;
  return 1 + Math.min(comboCap(level) - 1, Math.floor(combo / step) * 0.1);
}

function comboCap(level: number): number {
  return 1.5 + level * 0.5;
}

function comboWindow(level: number): number {
  return 3.4 + level * 0.8;
}

function regenBoost(level: number): number {
  return level * 0.55;
}

/** Seconds between the seedlings Bu Sari lets go. */
export function seedInterval(level: number): number {
  return Math.max(14, 42 - level * 7);
}

export function firePay(level: number): number {
  return 36 + level * 18;
}

/** Share of arrivals that are crates or better (peti, baterai, relik). */
function goodFindShare(level: number): number {
  const w = salvageWeights(Math.min(5, level), 1);
  const total = w.reduce((a, [, k]) => a + k, 0);
  const good = w.filter(([k]) => k === 'trash_crate' || k === 'trash_battery' || k === 'trash_relic');
  return Math.round((good.reduce((a, [, k]) => a + k, 0) / total) * 100);
}

/** Incremental salvage tide scaling by Arus Muatan Pesisir level (0..6). */
const CLUSTER_MIN = [1, 2, 2, 3, 3, 4, 5];
const CLUSTER_MAX = [2, 3, 4, 4, 5, 6, 7];
const SUPPLY_RATE = [18, 26, 35, 45, 56, 68, 82];
const MAX_SALVAGE = [20, 26, 34, 42, 50, 58, 68];

export const UPGRADE_DEFS: UpgradeDef[] = [
  // CENTER ROOT
  {
    id: 'core',
    name: 'Inti Sonar A.L.U.N.',
    shortName: 'A.L.U.N.',
    branch: 'core',
    description: 'Pelampung penjaga laguna. Satu gerakan: klik dan geser di air untuk menyapu sampah & menghalau bajak laut.',
    effectText: () => 'Aktif · satu mekanik ombak terarah',
    statLabel: 'STATUS INTI',
    statBefore: () => 'AKTIF',
    statAfter: () => 'AKTIF',
    cardSwatch: 'teal',
    maxLevel: 1,
    baseCost: 0,
    costMult: 1,
    requires: [],
    col: 3,
    row: 1.5,
    icon: 'core',
  },

  // ================= BRANCH 1: WAVE (TOP-LEFT) =================
  {
    id: 'wave_width',
    name: 'Bentang Ombak',
    shortName: 'Bentang',
    branch: 'wave',
    description: 'Busur ombak jauh lebih lebar, menyapu banyak rongsok dan bajak laut sekaligus.',
    effectText: (lv) => `Lebar ombak +${lv * 28}%`,
    statLabel: 'LEBAR OMBAK',
    statBefore: (lv) => `x${(1 + lv * 0.28).toFixed(2)}`,
    statAfter: (lv) => `x${(1 + (lv + 1) * 0.28).toFixed(2)}`,
    cardSwatch: 'blue',
    maxLevel: 5,
    baseCost: 30,
    costMult: 2.0,
    requires: ['core'],
    col: 2,
    row: 0,
    icon: 'width',
  },
  {
    id: 'wave_power',
    name: 'Tenaga Pasang',
    shortName: 'Tenaga',
    branch: 'wave',
    description: 'Kumparan pasang memperkuat dorongan dan daya hantam ke lambung kapal penjarah & Kapal Induk.',
    effectText: (lv) => `Daya hantam ${basicHit(lv)} · dorongan x${wavePowerAt(lv).toFixed(2)}`,
    statLabel: 'DAYA HANTAM',
    statBefore: (lv) => `${basicHit(lv)}`,
    statAfter: (lv) => `${basicHit(lv + 1)}`,
    cardSwatch: 'blue',
    maxLevel: 6,
    baseCost: 42,
    costMult: 2.05,
    requires: ['core'],
    col: 2,
    row: 1,
    icon: 'power',
  },
  {
    id: 'tidal_charge',
    name: 'Ombak Pasang Penuh',
    shortName: 'Pasang',
    branch: 'wave',
    description: 'Tahan sebelum melepas geseran untuk menciptakan ombak raksasa penghancur formasi penjarah berat.',
    effectText: (lv) =>
      lv === 0 ? 'Buka isi tenaga penuh' : `Daya penuh hingga ${(1.7 + lv * 0.42).toFixed(2)}x`,
    statLabel: 'DAYA PENUH',
    statBefore: (lv) => (lv === 0 ? 'x1.30' : `x${(1.7 + lv * 0.42).toFixed(2)}`),
    statAfter: (lv) => `x${(1.7 + (lv + 1) * 0.42).toFixed(2)}`,
    cardSwatch: 'orange',
    maxLevel: 4,
    baseCost: 135,
    costMult: 2.2,
    requires: ['wave_power'],
    col: 1,
    row: 1,
    icon: 'charge',
  },
  {
    id: 'echo_wave',
    name: 'Gema Susulan',
    shortName: 'Gema',
    branch: 'wave',
    description: 'Setiap sapuan melepas ombak susulan otomatis di jalur yang sama.',
    effectText: (lv) => (lv === 0 ? '+1 ombak susulan otomatis' : `${lv} ombak susulan tiap sapuan`),
    statLabel: 'OMBAK SUSULAN',
    statBefore: (lv) => `${lv}`,
    statAfter: (lv) => `${lv + 1}`,
    cardSwatch: 'purple',
    maxLevel: 4,
    baseCost: 220,
    costMult: 2.35,
    requires: ['wave_width'],
    col: 1,
    row: 0,
    icon: 'echo',
  },
  {
    id: 'tidal_lane',
    name: 'Jalur Panjang',
    shortName: 'Jalur',
    branch: 'wave',
    description: 'Arus Jalur Pasang makin panjang, menjangkau rongsok dan kapal yang lebih jauh.',
    effectText: (lv) => `Panjang arus ${230 + 30 * lv}`,
    statLabel: 'PANJANG ARUS',
    statBefore: (lv) => String(230 + 30 * lv),
    statAfter: (lv) => String(260 + 30 * lv),
    cardSwatch: 'gold',
    maxLevel: 4,
    baseCost: 380,
    costMult: 2.45,
    requires: ['echo_wave', 'tidal_charge'],
    col: 0,
    row: 0.5,
    icon: 'current',
  },

  // ================= BRANCH 2: ENERGY (TOP-RIGHT) =================
  {
    id: 'tidal_energy',
    name: 'Kapasitas Energi',
    shortName: 'Kapasitas',
    branch: 'energy',
    description: 'Cadangan energi lebih besar untuk menahan gelombang bajak laut beruntun di malam hari.',
    effectText: (lv) => `Maks energi ${100 + lv * 40}`,
    statLabel: 'MAKS ENERGI',
    statBefore: (lv) => `${100 + lv * 40}`,
    statAfter: (lv) => `${100 + (lv + 1) * 40}`,
    cardSwatch: 'orange',
    maxLevel: 5,
    baseCost: 36,
    costMult: 1.98,
    requires: ['core'],
    col: 4,
    row: 0,
    icon: 'energy',
  },
  {
    id: 'energy_regen',
    name: 'Regenerasi Energi',
    shortName: 'Regenerasi',
    branch: 'energy',
    description: 'Energi pulih jauh lebih cepat dan setiap sapuan lebih hemat.',
    effectText: (lv) => `Pemulihan +${Math.round(regenBoost(lv) * 100)}% · Biaya ombak -${lv * 10}%`,
    statLabel: 'PEMULIHAN',
    statBefore: (lv) => `+${Math.round(regenBoost(lv) * 100)}%`,
    statAfter: (lv) => `+${Math.round(regenBoost(lv + 1) * 100)}%`,
    cardSwatch: 'orange',
    maxLevel: 5,
    baseCost: 70,
    costMult: 2.0,
    requires: ['tidal_energy'],
    col: 5,
    row: 0,
    icon: 'regen',
  },
  {
    id: 'combo_flow',
    name: 'Harmoni Kombo',
    shortName: 'Kombo',
    branch: 'energy',
    description: 'Kombo tangkapan bertahan lebih lama dan koinnya berlipat jauh lebih tinggi. Tiap tangkapan & hantaman juga mengisi energi!',
    effectText: (lv) =>
      lv === 0
        ? `Kombo naik tiap 2 tangkapan · maks x${comboCap(1).toFixed(1)}`
        : `Jeda kombo ${comboWindow(lv).toFixed(1)} dtk · +${lv * 6} energi tiap tangkapan`,
    statLabel: 'KOIN KOMBO MAKS',
    statBefore: (lv) => `x${comboCap(lv).toFixed(1)}`,
    statAfter: (lv) => `x${comboCap(lv + 1).toFixed(1)}`,
    cardSwatch: 'purple',
    maxLevel: 4,
    baseCost: 150,
    costMult: 2.1,
    requires: ['energy_regen'],
    col: 6,
    row: 0,
    icon: 'combo',
  },

  // ================= BRANCH 3: AI ASSIST (BOTTOM-LEFT) =================
  {
    id: 'ai_guide',
    name: 'Arus Pemandu',
    shortName: 'Pemandu',
    branch: 'ai',
    description: 'A.L.U.N. meluruskan sapuan yang sudah mengarah ke tujuannya: rongsok ke jaring, bantalan ke minyak, bibit ke tepi pantai.',
    effectText: (lv) => (lv === 0 ? 'Sapuan searah diluruskan ke tujuannya' : `Kekuatan pandu +${lv * 38}%`),
    statLabel: 'PANDUAN',
    statBefore: (lv) => (lv === 0 ? 'MATI' : `+${lv * 38}%`),
    statAfter: (lv) => `+${(lv + 1) * 38}%`,
    cardSwatch: 'teal',
    maxLevel: 4,
    baseCost: 56,
    costMult: 2.05,
    requires: ['core'],
    col: 2,
    row: 2,
    icon: 'magnet',
  },
  {
    id: 'ai_sonar',
    name: 'Sonar Bidik',
    shortName: 'Sonar',
    branch: 'ai',
    description: 'Menggambar prediksi jalur ombak sekaligus membidik titik lemah lambung musuh untuk kerusakan ekstra.',
    effectText: (lv) => (lv === 0 ? 'Garis jalur + kerusakan lambung +18%' : `Garis jalur · bonus hantam +${lv * 18}%`),
    statLabel: 'BIDIK LAMBUNG',
    statBefore: (lv) => `+${lv * 18}%`,
    statAfter: (lv) => `+${(lv + 1) * 18}%`,
    cardSwatch: 'teal',
    maxLevel: 3,
    baseCost: 140,
    costMult: 2.25,
    requires: ['ai_guide'],
    col: 1,
    row: 2,
    icon: 'sonar',
  },
  {
    id: 'ai_buoy',
    name: 'Pelampung Penguat',
    shortName: 'Pelampung',
    branch: 'ai',
    description: 'Pelampung di tengah laguna memantulkan ombakmu menjadi gelombang melingkar yang mendorong & merusak kapal musuh!',
    effectText: (lv) => (lv === 0 ? 'Pasang 1 pelampung pemantul' : `${lv} pelampung aktif memantulkan ombak`),
    statLabel: 'PELAMPUNG',
    statBefore: (lv) => `${lv}`,
    statAfter: (lv) => `${lv + 1}`,
    cardSwatch: 'teal',
    maxLevel: 3,
    baseCost: 260,
    costMult: 2.35,
    requires: ['ai_guide'],
    col: 1,
    row: 3,
    icon: 'buoy',
  },

  // ================= BRANCH 4: VILLAGE & COAST =================
  {
    id: 'trash_density',
    name: 'Arus Muatan Pesisir',
    shortName: 'Muatan',
    branch: 'eco',
    description: 'Pasang laut membawa rongsok dalam kelompok besar. Sumber koin utama untuk upgrade mahal!',
    effectText: (lv) => (lv === 0 ? 'Rongsok datang berpasangan' : `Datang ${CLUSTER_MIN[lv]}–${CLUSTER_MAX[lv]} sekaligus`),
    statLabel: 'SEKALI DATANG',
    statBefore: (lv) => `${CLUSTER_MAX[Math.min(6, lv)]}`,
    statAfter: (lv) => `${CLUSTER_MAX[Math.min(6, lv + 1)]}`,
    cardSwatch: 'green',
    maxLevel: 6,
    baseCost: 36,
    costMult: 2.0,
    requires: ['core'],
    col: 4,
    row: 1,
    icon: 'density',
  },
  {
    id: 'net_expand',
    name: 'Jaring Gotong Royong',
    shortName: 'Jaring',
    branch: 'eco',
    description: 'Warga melebarkan Jaring Desa. Rongsok yang lewat di dekat mulut jaring ikut tersedot masuk.',
    effectText: (lv) => `Lebar jaring +${lv * 24}%`,
    statLabel: 'LEBAR JARING',
    statBefore: (lv) => `+${lv * 24}%`,
    statAfter: (lv) => `+${(lv + 1) * 24}%`,
    cardSwatch: 'green',
    maxLevel: 5,
    baseCost: 50,
    costMult: 2.0,
    requires: ['trash_density'],
    col: 5,
    row: 1,
    icon: 'net',
  },
  {
    id: 'trash_rarity',
    name: 'Kelangkaan Muatan',
    shortName: 'Kelangkaan',
    branch: 'eco',
    description: 'Peti kargo (14), baterai (24), dan relik kuno (42) jauh lebih sering ikut arus pasang.',
    effectText: (lv) => `Peluang barang mahal ${goodFindShare(lv)}%`,
    statLabel: 'TEMUAN MAHAL',
    statBefore: (lv) => `${goodFindShare(lv)}%`,
    statAfter: (lv) => `${goodFindShare(lv + 1)}%`,
    cardSwatch: 'gold',
    maxLevel: 5,
    baseCost: 115,
    costMult: 2.15,
    requires: ['net_expand'],
    col: 6,
    row: 1,
    icon: 'rarity',
  },
  {
    id: 'unlock_mangrove',
    name: 'Perawatan Mangrove',
    shortName: 'Mangrove',
    branch: 'eco',
    description: 'Bibit mangrove datang berkala. Akarnya menahan sampah di tepian & menjaga pantai sehat agar dermaga pulih gratis tiap fajar!',
    effectText: (lv) => (lv === 0 ? 'Bibit datang berkala' : `Bibit tiap ${seedInterval(lv)} detik`),
    statLabel: 'JEDA BIBIT',
    statBefore: (lv) => (lv === 0 ? '–' : `${seedInterval(lv)} dtk`),
    statAfter: (lv) => `${seedInterval(lv + 1)} dtk`,
    cardSwatch: 'green',
    maxLevel: 4,
    baseCost: 70,
    costMult: 2.05,
    requires: ['core'],
    col: 4,
    row: 2,
    icon: 'mangrove',
  },
  {
    id: 'unlock_boats',
    name: 'Armada Nelayan',
    shortName: 'Nelayan',
    branch: 'eco',
    description: 'Kemudi baru perahu nelayan: arus silang lebih ringan dan upah ikan siang hari naik.',
    effectText: (lv) => (lv === 0 ? 'Arus silang penuh' : `Arus -${lv * 24}% · bonus upah +${lv * 13} koin`),
    statLabel: 'BONUS NELAYAN',
    statBefore: (lv) => `+${lv * 13}`,
    statAfter: (lv) => `+${(lv + 1) * 13}`,
    cardSwatch: 'blue',
    maxLevel: 3,
    baseCost: 140,
    costMult: 2.15,
    requires: ['core'],
    col: 4,
    row: 3,
    icon: 'boat',
  },
  {
    id: 'unlock_forest',
    name: 'Rimba & Rafflesia',
    shortName: 'Rimba',
    branch: 'eco',
    description: 'Membuka penjagaan rimba siang hari. Padamkan api hutan untuk hadiah koin besar dan pemulihan pantai!',
    effectText: (lv) => (lv === 0 ? 'Tugas api rimba aktif' : `Hadiah api ${firePay(lv)} koin`),
    statLabel: 'HADIAH API',
    statBefore: (lv) => (lv === 0 ? '–' : `${firePay(lv)}`),
    statAfter: (lv) => `${firePay(lv + 1)}`,
    cardSwatch: 'orange',
    maxLevel: 3,
    baseCost: 220,
    costMult: 2.3,
    requires: ['unlock_mangrove'],
    col: 5,
    row: 2,
    icon: 'fire',
  },

  // ================= BRANCH 5: PIER DEFENSE (BOTTOM-CENTER) =================
  {
    id: 'pier_armor',
    name: 'Benteng Dermaga',
    shortName: 'Benteng',
    branch: 'final',
    description: 'Perkuat tiang & pagar kayu dermaga: tambah Maks HP Dermaga, kurangi kerusakan serangan bajak laut, dan langsung tambal +35 HP!',
    effectText: (lv) => `Maks HP ${BASE_PIER_HP + lv * 35} · tahan serangan -${lv * 8}%`,
    statLabel: 'MAKS HP DERMAGA',
    statBefore: (lv) => `${BASE_PIER_HP + lv * 35}`,
    statAfter: (lv) => `${BASE_PIER_HP + (lv + 1) * 35}`,
    cardSwatch: 'red',
    maxLevel: 5,
    baseCost: 65,
    costMult: 2.05,
    requires: ['core'],
    col: 3,
    row: 3,
    icon: 'shield',
  },
];

export const UPGRADE_MAP: Record<UpgradeId, UpgradeDef> = UPGRADE_DEFS.reduce(
  (acc, def) => {
    acc[def.id] = def;
    return acc;
  },
  {} as Record<UpgradeId, UpgradeDef>
);

export function getUpgradeCost(id: UpgradeId, currentLevel: number): number {
  const def = UPGRADE_MAP[id];
  if (currentLevel >= def.maxLevel) return Infinity;
  return Math.round(def.baseCost * Math.pow(def.costMult, currentLevel));
}

/**
 * The morning Bu Sari has each blueprint ready. Day 1 starts with two tools only; every dawn after a
 * night survived brings new ones, so the workshop grows with the player instead of opening all at once.
 */
export const BLUEPRINT_DAY: Record<UpgradeId, number> = {
  core: 1,
  wave_power: 1,
  trash_density: 1,
  wave_width: 2,
  net_expand: 2,
  tidal_energy: 2,
  energy_regen: 2,
  pier_armor: 2,
  tidal_charge: 2,
  combo_flow: 3,
  ai_guide: 3,
  trash_rarity: 3,
  unlock_mangrove: 3,
  echo_wave: 3,
  tidal_lane: 3,
  ai_sonar: 4,
  unlock_boats: 4,
  unlock_forest: 4,
  ai_buoy: 5,
};

/** Levels a tool can reach on the day its blueprint arrives; every later dawn allows one more. */
const FIRST_DAY_LEVELS = 2;

export function hasBlueprint(id: UpgradeId, f: { toolbox: boolean }, day: number): boolean {
  if (id === 'core') return true;
  return f.toolbox && day >= BLUEPRINT_DAY[id];
}

/** Highest level Bu Sari can build on this day. */
export function levelCapOnDay(id: UpgradeId, day: number): number {
  const opened = BLUEPRINT_DAY[id];
  if (day < opened) return 0;
  return Math.min(UPGRADE_MAP[id].maxLevel, FIRST_DAY_LEVELS + day - opened);
}

/** The first day on which `level` can be built. */
export function dayForLevel(id: UpgradeId, level: number): number {
  return BLUEPRINT_DAY[id] + Math.max(0, level - FIRST_DAY_LEVELS);
}

/** Tools whose blueprints arrived this very morning (none on Day 1: everything is new then). */
export function newBlueprints(progress: PlayerProgress): UpgradeId[] {
  const day = progress.story.day;
  if (day <= 1 || !progress.story.flags.toolbox) return [];
  return UPGRADE_DEFS.filter((d) => d.id !== 'core' && BLUEPRINT_DAY[d.id] === day).map((d) => d.id);
}

/** The tools this one builds on are installed. */
export function hasTools(id: UpgradeId, upgrades: Record<UpgradeId, number>): boolean {
  if (id === 'tidal_lane') return (upgrades.echo_wave ?? 0) > 0 || (upgrades.tidal_charge ?? 0) > 0;
  return UPGRADE_MAP[id].requires.every((req) => (upgrades[req] ?? 0) > 0);
}

/** On the shelf: blueprint arrived and parent tools installed. */
export function isUpgradeUnlocked(id: UpgradeId, progress: PlayerProgress): boolean {
  return hasBlueprint(id, progress.story.flags, progress.story.day) && hasTools(id, progress.upgrades);
}

/** Shown in the workshop: owned, or on the shelf today. */
export function isUpgradeShown(id: UpgradeId, progress: PlayerProgress): boolean {
  if (id === 'core') return false;
  if (!progress.story.flags.toolbox) return false;
  return (progress.upgrades[id] ?? 0) > 0 || isUpgradeUnlocked(id, progress);
}

/** Highest level on sale today: two on a blueprint's first day, one more every dawn after. */
export function levelCap(id: UpgradeId, progress: PlayerProgress): number {
  if (!progress.story.flags.toolbox) return 0;
  return levelCapOnDay(id, progress.story.day);
}

export function isForSale(id: UpgradeId, progress: PlayerProgress): boolean {
  if (id === 'core') return false;
  return isUpgradeUnlocked(id, progress) && (progress.upgrades[id] ?? 0) < levelCap(id, progress);
}

/** The next level waits for a later dawn, not for coins. */
export function isCappedToday(id: UpgradeId, progress: PlayerProgress): boolean {
  if (id === 'core' || !progress.story.flags.toolbox || !hasTools(id, progress.upgrades)) return false;
  const lv = progress.upgrades[id] ?? 0;
  return lv < UPGRADE_MAP[id].maxLevel && lv >= levelCap(id, progress);
}

/** The cheapest tool on sale right now: what the HUD shows the player saving up for. */
export function nextGoal(progress: PlayerProgress): { id: UpgradeId; level: number; cost: number } | null {
  let best: { id: UpgradeId; level: number; cost: number } | null = null;
  for (const def of UPGRADE_DEFS) {
    if (!isForSale(def.id, progress)) continue;
    const lv = progress.upgrades[def.id] ?? 0;
    const cost = getUpgradeCost(def.id, lv);
    if (!best || cost < best.cost) best = { id: def.id, level: lv + 1, cost };
  }
  return best;
}

export function countAffordableUpgrades(progress: PlayerProgress): number {
  let count = 0;
  for (const def of UPGRADE_DEFS) {
    if (!isForSale(def.id, progress)) continue;
    if (progress.coins >= getUpgradeCost(def.id, progress.upgrades[def.id] ?? 0)) count += 1;
  }
  return count;
}

export function createInitialProgress(skipPrep = false): PlayerProgress {
  const upgrades = {} as Record<UpgradeId, number>;
  for (const def of UPGRADE_DEFS) {
    upgrades[def.id] = def.id === 'core' ? 1 : 0;
  }
  return {
    coins: skipPrep ? 30 : 0,
    totalCoinsEarned: skipPrep ? 30 : 0,
    shopUnlocked: skipPrep,
    upgrades,
    mangroves: [],
    totalTrash: 0,
    totalRareTrash: 0,
    totalBoats: 0,
    totalFires: 0,
    totalWaves: 0,
    totalCurrents: 0,
    victoryAchieved: false,
    endlessMode: false,
    journalSeen: [],
    story: createStory(skipPrep),
  };
}

export function computeStats(progress: PlayerProgress): ComputedStats {
  const u = progress.upgrades;
  const widthLv = u.wave_width ?? 0;
  const powerLv = u.wave_power ?? 0;
  const chargeLv = u.tidal_charge ?? 0;
  const comboLv = u.combo_flow ?? 0;
  const aiGuideLv = u.ai_guide ?? 0;
  const sonarLv = u.ai_sonar ?? 0;
  const netLv = u.net_expand ?? 0;
  const regenLv = u.energy_regen ?? 0;
  const boatLv = u.unlock_boats ?? 0;
  const armorLv = u.pier_armor ?? 0;
  const d = Math.min(SUPPLY_RATE.length - 1, u.trash_density ?? 0);
  const pollution = progress.story.pollution;

  return {
    waveWidth: 76 * (1 + widthLv * 0.28),
    waveSpeed: 320 * (1 + powerLv * 0.13),
    wavePower: wavePowerAt(powerLv),
    waveDuration: 0.96 + powerLv * 0.11 + widthLv * 0.06,
    maxEnergy: 100 + (u.tidal_energy ?? 0) * 40,
    energyRegen: 17.5 * (1 + regenBoost(regenLv)),
    baseWaveCost: Math.max(6, 18.5 * (1 - regenLv * 0.1)),
    chargeUnlocked: chargeLv > 0,
    maxChargeBonus: chargeLv > 0 ? 1.7 + chargeLv * 0.42 : 1.3,
    echoCount: u.echo_wave ?? 0,
    laneLevel: u.tidal_lane ?? 0,
    comboEnergyReturn: comboLv * 6,
    comboWindow: comboWindow(comboLv),
    comboLevel: comboLv,
    aiGuideStrength: aiGuideLv > 0 ? 0.5 + aiGuideLv * 0.38 : 0,
    aiSonarLevel: sonarLv,
    critBonus: sonarLv * 0.18,
    aiBuoyCount: u.ai_buoy ?? 0,
    netRadius: 50 * (1 + netLv * 0.24),
    netPull: netLv * 30,
    supplyInterval: 60 / SUPPLY_RATE[d],
    supplyClusterMin: CLUSTER_MIN[d],
    supplyClusterMax: CLUSTER_MAX[d],
    maxSalvage: MAX_SALVAGE[d],
    salvagePerMinute: SUPPLY_RATE[d],
    rarityLevel: u.trash_rarity ?? 0,
    mangroveLevel: u.unlock_mangrove ?? 0,
    steering: Math.min(0.72, boatLv * 0.24),
    boatLevel: boatLv,
    forestLevel: u.unlock_forest ?? 0,
    maxPierHp: BASE_PIER_HP + armorLv * 35,
    pierArmor: Math.min(0.4, armorLv * 0.08),
    ecoPercent: Math.round(100 - pollution),
    pollution,
  };
}
