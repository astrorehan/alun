import type { ComputedStats, PlayerProgress, RarityWeights, UpgradeDef, UpgradeId } from './types';

export const UPGRADE_DEFS: UpgradeDef[] = [
  // CENTER ROOT
  {
    id: 'core',
    name: 'Inti Sonar A.L.U.N.',
    shortName: 'A.L.U.N.',
    branch: 'core',
    description:
      'Pelampung resonansi AI penjaga laguna tropis. Satu mekanik murni: klik & geser di air untuk menyapu ombak terarah.',
    effectText: () => 'Aktif · Sapuan Ombak Terarah',
    statLabel: 'STATUS INTI',
    statBefore: () => 'AKTIF',
    statAfter: () => 'AKTIF',
    cardSwatch: 'teal',
    maxLevel: 1,
    baseCost: 0,
    costMult: 1,
    requires: [],
    x: 500,
    y: 275,
    icon: 'core',
  },

  // ================= BRANCH 1: WAVE MASTERY (TOP-LEFT) =================
  {
    id: 'wave_width',
    name: 'Bentang Ombak',
    shortName: 'Bentang',
    branch: 'wave',
    description:
      'Memperlebar busur ombakmu agar satu sapuan langsung menggiring lebih banyak limbah, biji mangrove, & perahu sekaligus.',
    effectText: (lv) => `Lebar ombak +${lv * 26}% (Lv ${lv}/5)`,
    statLabel: 'LEBAR OMBAK',
    statBefore: (lv) => `x${(1 + lv * 0.26).toFixed(2)}`,
    statAfter: (lv) => `x${(1 + (lv + 1) * 0.26).toFixed(2)}`,
    cardSwatch: 'blue',
    maxLevel: 5,
    baseCost: 20,
    costMult: 1.75,
    requires: ['core'],
    x: 350,
    y: 205,
    icon: 'width',
  },
  {
    id: 'wave_power',
    name: 'Tenaga Pasang',
    shortName: 'Tenaga',
    branch: 'wave',
    description:
      'Meningkatkan dorongan & jarak luncur ombak. Lv 2+ siram api hutan; Lv 3+ pecah minyak & guncang kapal limbah.',
    effectText: (lv) => `Dorongan +${lv * 28}% · Jarak +${lv * 15}%`,
    statLabel: 'DORONGAN',
    statBefore: (lv) => `x${(1 + lv * 0.34).toFixed(2)}`,
    statAfter: (lv) => `x${(1 + (lv + 1) * 0.34).toFixed(2)}`,
    cardSwatch: 'blue',
    maxLevel: 5,
    baseCost: 34,
    costMult: 1.85,
    requires: ['wave_width'],
    x: 215,
    y: 165,
    icon: 'power',
  },
  {
    id: 'tidal_charge',
    name: 'Ombak Pasang Penuh',
    shortName: 'Charge',
    branch: 'wave',
    description:
      'Tahan geseran di air untuk mengisi ombak super berbusa tebal yang sanggup menyiram kebakaran tepi rimba!',
    effectText: (lv) =>
      lv === 0 ? 'Buka overcharge ombak pasang' : `Daya penuh hingga ${(1.55 + lv * 0.35).toFixed(2)}x`,
    statLabel: 'DAYA CHARGE',
    statBefore: (lv) => (lv === 0 ? 'x1.25' : `x${(1.55 + lv * 0.35).toFixed(2)}`),
    statAfter: (lv) => `x${(1.55 + (lv + 1) * 0.35).toFixed(2)}`,
    cardSwatch: 'orange',
    featuredTag: 'SUPER!',
    maxLevel: 3,
    baseCost: 78,
    costMult: 2.1,
    requires: ['wave_power'],
    x: 92,
    y: 112,
    icon: 'charge',
  },
  {
    id: 'echo_wave',
    name: 'Gema Susulan (Echo)',
    shortName: 'Echo',
    branch: 'wave',
    description:
      'Setiap sapuan otomatis memicu gelombang susulan di belakangnya untuk sapuan beruntun & tabrakan resonansi!',
    effectText: (lv) => (lv === 0 ? '+1 ombak susulan otomatis' : `${lv} ombak susulan tiap sapuan`),
    statLabel: 'OMBAK ECHO',
    statBefore: (lv) => `${lv}`,
    statAfter: (lv) => `${lv + 1}`,
    cardSwatch: 'purple',
    featuredTag: 'KOMBO!',
    maxLevel: 3,
    baseCost: 110,
    costMult: 2.25,
    requires: ['wave_width'],
    x: 268,
    y: 72,
    icon: 'echo',
  },
  {
    id: 'resonance_burst',
    name: 'Resonansi Konstruktif',
    shortName: 'Resonansi',
    branch: 'wave',
    description:
      'Saat 2 ombakmu bertemu, tercipta ledakan emas-cyan luas yang menyapu area & menghantam kapal ilegal!',
    effectText: (lv) =>
      lv === 0 ? 'Aktifkan ledakan tabrakan 2 ombak' : `Radius & daya Resonansi Lv ${lv}`,
    statLabel: 'LEDAKAN',
    statBefore: (lv) => (lv === 0 ? 'OFF' : `Lv ${lv}`),
    statAfter: (lv) => `Lv ${lv + 1}`,
    cardSwatch: 'gold',
    featuredTag: 'OP!',
    featured: true,
    maxLevel: 3,
    baseCost: 165,
    costMult: 2.3,
    requires: ['echo_wave', 'tidal_charge'],
    x: 105,
    y: 255,
    icon: 'resonance',
  },

  // ================= BRANCH 2: ENERGY & TEMPO (TOP-RIGHT) =================
  {
    id: 'tidal_energy',
    name: 'Kapasitas Energi',
    shortName: 'Energi',
    branch: 'energy',
    description:
      'Memperbesar cadangan Energi Ombak supaya kamu bisa menyapu gelombang berturut-turut tanpa jeda.',
    effectText: (lv) => `Maks energi ${100 + lv * 35}`,
    statLabel: 'MAKS ENERGI',
    statBefore: (lv) => `${100 + lv * 35}`,
    statAfter: (lv) => `${100 + (lv + 1) * 35}`,
    cardSwatch: 'orange',
    maxLevel: 5,
    baseCost: 22,
    costMult: 1.75,
    requires: ['core'],
    x: 650,
    y: 205,
    icon: 'energy',
  },
  {
    id: 'energy_regen',
    name: 'Aliran Cepat',
    shortName: 'Regen',
    branch: 'energy',
    description:
      'Mempercepat pemulihan Energi Ombak dan meringankan biaya tiap sapuan agar bisa rapid-swipe puluhan limbah!',
    effectText: (lv) => `Pemulihan +${lv * 34}% · Biaya -${lv * 8}%`,
    statLabel: 'PEMULIHAN',
    statBefore: (lv) => `+${lv * 34}%`,
    statAfter: (lv) => `+${(lv + 1) * 34}%`,
    cardSwatch: 'orange',
    maxLevel: 4,
    baseCost: 44,
    costMult: 1.9,
    requires: ['tidal_energy'],
    x: 788,
    y: 155,
    icon: 'regen',
  },
  {
    id: 'combo_flow',
    name: 'Harmoni Kombo',
    shortName: 'Kombo',
    branch: 'energy',
    description:
      'Sapuan beruntun menaikkan multiplier koin sekaligus memulihkan Energi Ombak setiap target masuk jaring!',
    effectText: (lv) =>
      lv === 0 ? 'Buka kombo hingga x2.0 + pulih energi' : `Maks kombo x${(1.5 + lv * 0.5).toFixed(1)} · +${lv * 4} energi`,
    statLabel: 'MAKS KOMBO',
    statBefore: (lv) => `x${(1.5 + lv * 0.5).toFixed(1)}`,
    statAfter: (lv) => `x${(1.5 + (lv + 1) * 0.5).toFixed(1)}`,
    cardSwatch: 'purple',
    maxLevel: 3,
    baseCost: 120,
    costMult: 2.15,
    requires: ['energy_regen'],
    x: 912,
    y: 102,
    icon: 'combo',
  },

  // ================= BRANCH 3: AI ASSIST MODULE (BOTTOM-LEFT) =================
  {
    id: 'ai_guide',
    name: 'AI Arus Pemandu',
    shortName: 'AI Pandu',
    branch: 'ai',
    description:
      'Modul AI membentuk pusaran pintar: limbah otomatis berbelok ke Jaring Desa dan biji mangrove ke pantai lumpur!',
    effectText: (lv) =>
      lv === 0 ? 'Otomatis mengarahkan limbah ke jaring' : `Kekuatan pandu AI +${lv * 36}%`,
    statLabel: 'PANDUAN AI',
    statBefore: (lv) => (lv === 0 ? 'OFF' : `+${lv * 36}%`),
    statAfter: (lv) => `+${(lv + 1) * 36}%`,
    cardSwatch: 'teal',
    featuredTag: 'AI SMART!',
    featured: true,
    maxLevel: 4,
    baseCost: 28,
    costMult: 1.85,
    requires: ['core'],
    x: 350,
    y: 355,
    icon: 'magnet',
  },
  {
    id: 'ai_sonar',
    name: 'Sonar Prediksi AI',
    shortName: 'AI Sonar',
    branch: 'ai',
    description:
      'Menampilkan garis prediksi lintasan AI saat mengarahkan ombak, menyorot target langka, & tambah nilai koin!',
    effectText: (lv) =>
      lv === 0 ? 'Garis vektor AI + bonus koin +18%' : `Prediksi aktif · Bonus nilai +${lv * 18}%`,
    statLabel: 'BONUS SONAR',
    statBefore: (lv) => (lv === 0 ? 'OFF' : `+${lv * 18}%`),
    statAfter: (lv) => `+${(lv + 1) * 18}%`,
    cardSwatch: 'teal',
    maxLevel: 2,
    baseCost: 58,
    costMult: 2.25,
    requires: ['ai_guide'],
    x: 215,
    y: 405,
    icon: 'sonar',
  },
  {
    id: 'ai_buoy',
    name: 'Pelampung AI Otonom',
    shortName: 'Pelampung',
    branch: 'ai',
    description:
      'Pasang Pelampung Sonar AI di laguna. Tiap ombakmu melintas dekat pelampung, AI memancarkan riak penguat!',
    effectText: (lv) =>
      lv === 0 ? 'Pasang 1 Pelampung Penguat AI di laguna' : `${lv} Pelampung AI aktif memantulkan ombakmu`,
    statLabel: 'PELAMPUNG AI',
    statBefore: (lv) => `${lv}`,
    statAfter: (lv) => `${lv + 1}`,
    cardSwatch: 'teal',
    featuredTag: 'OTONOM!',
    maxLevel: 3,
    baseCost: 135,
    costMult: 2.2,
    requires: ['ai_guide'],
    x: 320,
    y: 488,
    icon: 'buoy',
  },

  // ================= BRANCH 4: DEBRIS SUPPLY, RARITY & ECOSYSTEM =================
  {
    id: 'net_expand',
    name: 'Jaring Gotong Royong',
    shortName: 'Jaring',
    branch: 'eco',
    description:
      'Warga desa memperlebar Jaring Kolektor, menambah daya hisap lembut di mulut jaring, & menaikkan nilai koin.',
    effectText: (lv) => `Lebar jaring +${lv * 22}% · Nilai koin +${lv * 28}%`,
    statLabel: 'NILAI KOIN',
    statBefore: (lv) => `x${(1 + lv * 0.28).toFixed(2)}`,
    statAfter: (lv) => `x${(1 + (lv + 1) * 0.28).toFixed(2)}`,
    cardSwatch: 'green',
    maxLevel: 4,
    baseCost: 24,
    costMult: 1.8,
    requires: ['core'],
    x: 650,
    y: 350,
    icon: 'net',
  },
  {
    id: 'trash_density',
    name: 'Arus Muatan Pesisir',
    shortName: 'Muatan',
    branch: 'eco',
    description:
      'Membuka arus laut dengan jauh lebih banyak limbah berkelompok — sekali sapu langsung panen kombo koin!',
    effectText: (lv) => {
      const caps = [12, 20, 30, 42, 56, 72, 90];
      return `Kapasitas laguna ${caps[lv]} muatan · Muncul berkelompok`;
    },
    statLabel: 'KAPASITAS',
    statBefore: (lv) => {
      const caps = [12, 20, 30, 42, 56, 72, 90];
      return `${caps[Math.min(6, lv)]}`;
    },
    statAfter: (lv) => {
      const caps = [12, 20, 30, 42, 56, 72, 90];
      return `${caps[Math.min(6, lv + 1)]}`;
    },
    cardSwatch: 'green',
    featuredTag: 'PANEN!',
    maxLevel: 6,
    baseCost: 26,
    costMult: 1.72,
    requires: ['net_expand'],
    x: 792,
    y: 275,
    icon: 'density',
  },
  {
    id: 'trash_rarity',
    name: 'Kelangkaan Muatan',
    shortName: 'Kelangkaan',
    branch: 'eco',
    description:
      'Membuka & meningkatkan peluang muatan Langka (Cyan), Epik (Emas), hingga Legendaris + bonus nilai +35%/Lv!',
    effectText: (lv) => {
      if (lv === 0) return 'Buka Muatan Langka (45 Koin) & +35% nilai';
      if (lv === 1) return 'Langka aktif · Lv 2 buka Epik (125 Koin)';
      if (lv === 2) return 'Epik aktif · Lv 3 buka Legendaris (340 Koin)';
      return `Semua kelangkaan terbuka · Nilai dasar +${lv * 35}%`;
    },
    statLabel: 'KELANGKAAN',
    statBefore: (lv) => ['UMUM', 'LANGKA', 'EPIK', 'LEGEND', 'LEGEND+', 'SULTAN'][Math.min(5, lv)],
    statAfter: (lv) => ['UMUM', 'LANGKA', 'EPIK', 'LEGEND', 'LEGEND+', 'SULTAN'][Math.min(5, lv + 1)],
    cardSwatch: 'gold',
    featuredTag: 'OP VALUE!',
    featured: true,
    maxLevel: 5,
    baseCost: 52,
    costMult: 1.95,
    requires: ['trash_density'],
    x: 915,
    y: 275,
    icon: 'rarity',
  },
  {
    id: 'unlock_mangrove',
    name: 'Program Mangrove',
    shortName: 'Mangrove',
    branch: 'eco',
    description:
      'Memunculkan biji mangrove di laguna. Sapu ke pantai kiri agar tumbuh permanen (+8% multiplier koin/pohon!).',
    effectText: (lv) =>
      lv === 0 ? 'Buka Biji Mangrove di laguna' : `Kemunculan biji Lv ${lv} · Bonus tanam +${lv * 22} koin`,
    statLabel: 'BIJI MANGROVE',
    statBefore: (lv) => (lv === 0 ? 'KUNCI' : `Lv ${lv}`),
    statAfter: (lv) => `Lv ${lv + 1}`,
    cardSwatch: 'green',
    maxLevel: 3,
    baseCost: 38,
    costMult: 2.0,
    requires: ['net_expand'],
    x: 785,
    y: 385,
    icon: 'mangrove',
  },
  {
    id: 'unlock_boats',
    name: 'Jalur Perahu Nelayan',
    shortName: 'Perahu',
    branch: 'eco',
    description:
      'Perahu nelayan lokal melintasi laguna. Beri dorongan ombak menuju Dermaga Desa untuk Jackpot Koin besar!',
    effectText: (lv) =>
      lv === 0 ? 'Buka Perahu Nelayan (Jackpot koin)' : `Reward perahu +${110 + lv * 70} koin`,
    statLabel: 'JACKPOT PERAHU',
    statBefore: (lv) => (lv === 0 ? 'OFF' : `+${110 + lv * 70}`),
    statAfter: (lv) => `+${110 + (lv + 1) * 70}`,
    cardSwatch: 'blue',
    maxLevel: 3,
    baseCost: 92,
    costMult: 2.1,
    requires: ['unlock_mangrove'],
    x: 912,
    y: 425,
    icon: 'boat',
  },
  {
    id: 'unlock_forest',
    name: 'Rimba & Rafflesia',
    shortName: 'Rafflesia',
    branch: 'eco',
    description:
      'Lindungi tepi hutan & Bunga Rafflesia! Padamkan api pantai dengan ombak pasang & pecah minyak untuk bonus!',
    effectText: (lv) =>
      lv === 0 ? 'Buka Api Hutan, Rafflesia & Minyak' : `Reward padamkan api +${170 + lv * 95} koin`,
    statLabel: 'BONUS RIMBA',
    statBefore: (lv) => (lv === 0 ? 'OFF' : `+${170 + lv * 95}`),
    statAfter: (lv) => `+${170 + (lv + 1) * 95}`,
    cardSwatch: 'orange',
    maxLevel: 2,
    baseCost: 175,
    costMult: 2.35,
    requires: ['unlock_mangrove'],
    x: 705,
    y: 485,
    icon: 'fire',
  },

  // ================= APEX FINAL NODE =================
  {
    id: 'unlock_boss',
    name: 'Operasi Badai Muson',
    shortName: 'Badai Muson',
    branch: 'final',
    description:
      'Panggil misi klimaks malam bioluminescent! Hadapi Kapal Limbah Ilegal dengan Ombak Raksasa & Resonansi!',
    effectText: (lv) =>
      lv === 0 ? 'Mulai Badai Muson & Lawan Kapal Limbah' : 'Badai Muson Aktif · Usir Kapal Limbah!',
    statLabel: 'MISI KLIMAKS',
    statBefore: (lv) => (lv === 0 ? 'SIAGA' : 'AKTIF'),
    statAfter: () => 'MULAI!',
    cardSwatch: 'red',
    featuredTag: 'BOSS FINAL!',
    featured: true,
    maxLevel: 1,
    baseCost: 650,
    costMult: 1,
    requires: ['unlock_forest', 'ai_buoy'],
    x: 500,
    y: 488,
    icon: 'boss',
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

export function isUpgradeUnlocked(id: UpgradeId, upgrades: Record<UpgradeId, number>): boolean {
  const def = UPGRADE_MAP[id];
  if (def.requires.length === 0) return true;
  if (id === 'resonance_burst') {
    return upgrades.echo_wave > 0 || upgrades.tidal_charge > 0;
  }
  return def.requires.every((req) => (upgrades[req] ?? 0) > 0);
}

/** Minimum cost among currently unlocked, non-maxed upgrades (used to gate initial shop unlock). */
export function getMinUnlockableCost(progress: PlayerProgress): number {
  let minCost = Infinity;
  for (const def of UPGRADE_DEFS) {
    if (def.id === 'core') continue;
    const lv = progress.upgrades[def.id] ?? 0;
    if (lv >= def.maxLevel) continue;
    if (!isUpgradeUnlocked(def.id, progress.upgrades)) continue;
    const c = getUpgradeCost(def.id, lv);
    if (c < minCost) minCost = c;
  }
  return minCost;
}

/** Counts how many upgrades the player can currently buy. */
export function countAffordableUpgrades(progress: PlayerProgress): number {
  let count = 0;
  for (const def of UPGRADE_DEFS) {
    if (def.id === 'core') continue;
    const lv = progress.upgrades[def.id] ?? 0;
    if (lv >= def.maxLevel) continue;
    if (!isUpgradeUnlocked(def.id, progress.upgrades)) continue;
    if (progress.coins >= getUpgradeCost(def.id, lv)) count += 1;
  }
  return count;
}

export function createInitialProgress(): PlayerProgress {
  const upgrades = {} as Record<UpgradeId, number>;
  for (const def of UPGRADE_DEFS) {
    upgrades[def.id] = def.id === 'core' ? 1 : 0;
  }
  return {
    coins: 0,
    totalCoinsEarned: 0,
    shopUnlocked: false,
    upgrades,
    mangroves: [],
    totalTrash: 0,
    totalRareTrash: 0,
    totalBoats: 0,
    totalFires: 0,
    totalWaves: 0,
    totalResonances: 0,
    victoryAchieved: false,
    endlessMode: false,
    claimedAchievements: [],
    dolphinRescued: false,
  };
}

function getRarityWeights(rarityLv: number): RarityWeights {
  switch (rarityLv) {
    case 0:
      return { common: 84, uncommon: 16, rare: 0, epic: 0, legendary: 0 };
    case 1:
      return { common: 62, uncommon: 26, rare: 12, epic: 0, legendary: 0 };
    case 2:
      return { common: 46, uncommon: 28, rare: 19, epic: 7, legendary: 0 };
    case 3:
      return { common: 34, uncommon: 26, rare: 23, epic: 13, legendary: 4 };
    case 4:
      return { common: 24, uncommon: 24, rare: 26, epic: 18, legendary: 8 };
    default:
      return { common: 16, uncommon: 20, rare: 28, epic: 22, legendary: 14 };
  }
}

export function computeStats(progress: PlayerProgress): ComputedStats {
  const u = progress.upgrades;
  const widthLv = u.wave_width ?? 0;
  const powerLv = u.wave_power ?? 0;
  const chargeLv = u.tidal_charge ?? 0;
  const echoLv = u.echo_wave ?? 0;
  const resLv = u.resonance_burst ?? 0;
  const energyLv = u.tidal_energy ?? 0;
  const regenLv = u.energy_regen ?? 0;
  const comboLv = u.combo_flow ?? 0;
  const aiGuideLv = u.ai_guide ?? 0;
  const aiSonarLv = u.ai_sonar ?? 0;
  const aiBuoyLv = u.ai_buoy ?? 0;
  const netLv = u.net_expand ?? 0;
  const densityLv = u.trash_density ?? 0;
  const rarityLv = u.trash_rarity ?? 0;
  const mangroveLv = u.unlock_mangrove ?? 0;
  const boatLv = u.unlock_boats ?? 0;
  const forestLv = u.unlock_forest ?? 0;
  const bossLv = u.unlock_boss ?? 0;

  const mangroveCount = progress.mangroves.length;
  const totalLevels = Object.entries(u).reduce(
    (sum, [k, v]) => sum + (k === 'core' ? 0 : v),
    0
  );
  const maxPossibleLevels = UPGRADE_DEFS.reduce(
    (sum, d) => sum + (d.id === 'core' ? 0 : d.maxLevel),
    0
  );

  const ecoRaw =
    10 +
    (totalLevels / maxPossibleLevels) * 55 +
    Math.min(1, mangroveCount / 14) * 25 +
    (progress.victoryAchieved ? 10 : 0);

  const densityCaps = [12, 20, 30, 42, 56, 72, 90];
  const densityIntervals = [1.1, 0.82, 0.6, 0.44, 0.33, 0.24, 0.17];
  const clusterMins = [1, 1, 2, 2, 3, 4, 5];
  const clusterMaxs = [1, 2, 3, 4, 5, 6, 7];
  const dIdx = Math.min(densityCaps.length - 1, densityLv);

  return {
    waveWidth: 74 * (1 + widthLv * 0.26),
    waveSpeed: 315 * (1 + powerLv * 0.14),
    wavePower: 1.0 + powerLv * 0.34,
    waveDuration: 0.94 + powerLv * 0.13 + widthLv * 0.05,
    maxEnergy: 100 + energyLv * 35,
    energyRegen: 16.5 * (1 + regenLv * 0.34),
    baseWaveCost: Math.max(8, 19 * (1 - regenLv * 0.08)),
    chargeUnlocked: chargeLv > 0,
    maxChargeBonus: chargeLv > 0 ? 1.55 + chargeLv * 0.35 : 1.25,
    echoCount: echoLv,
    resonanceLevel: resLv,
    comboMaxMult: 1.5 + comboLv * 0.5,
    comboEnergyReturn: comboLv * 4,
    aiGuideStrength: aiGuideLv > 0 ? 0.48 + aiGuideLv * 0.38 : 0,
    aiSonarLevel: aiSonarLv,
    aiBuoyCount: aiBuoyLv,
    netRadius: 48 * (1 + netLv * 0.22),
    netPull: netLv * 26,
    coinMultiplier:
      (1 + netLv * 0.28 + aiSonarLv * 0.18 + rarityLv * 0.35) * (1 + mangroveCount * 0.08),
    maxTrashCount: densityCaps[dIdx],
    trashSpawnInterval: densityIntervals[dIdx],
    trashClusterMin: clusterMins[dIdx],
    trashClusterMax: clusterMaxs[dIdx],
    trashRarityLevel: rarityLv,
    rarityWeights: getRarityWeights(rarityLv),
    mangroveLevel: mangroveLv,
    boatLevel: boatLv,
    forestLevel: forestLv,
    bossUnlocked: bossLv > 0,
    ecoPercent: Math.min(100, Math.round(ecoRaw)),
  };
}
