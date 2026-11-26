import { BASE_HIT, createStory, knowsFleet, salvageWeights, toolLevelCap, type Flags } from './story/state';
import type { ComputedStats, PlayerProgress, UpgradeDef, UpgradeId } from './types';

/** Damage one hit does to a hull. `power` is the wave's own strength, charge included. */
export function hitDamage(power: number, charge: number, resonance: boolean): number {
  return Math.ceil(BASE_HIT * power * (1 + charge * 0.7) * (resonance ? 2.6 : 1) - 1e-6);
}

/** Tenaga Pasang as the player sees it: one hit of an uncharged wave. */
export function basicHit(level: number): number {
  return hitDamage(1 + level * 0.34, 0, false);
}

/** Seconds between the seedlings Bu Sari lets go. */
export function seedInterval(level: number): number {
  return Math.max(24, 56 - level * 10);
}

export function firePay(level: number): number {
  return Math.min(24, 16 + level * 4);
}

/** Share of arrivals that are crates or better, once everything arrives. */
function goodFindShare(level: number): number {
  const all = {
    dolphin: true,
    damar: true,
    waste: true,
    ending: true,
  } as Flags;
  const w = salvageWeights(all, Math.min(5, level));
  const total = w.reduce((a, [, k]) => a + k, 0);
  const good = w.filter(([k]) => k === 'trash_crate' || k === 'trash_battery' || k === 'trash_relic');
  return Math.round((good.reduce((a, [, k]) => a + k, 0) / total) * 100);
}

/** How many pieces the tide brings together, by level of Arus Muatan. */
const CLUSTER_MIN = [1, 2, 2, 2, 3, 3, 4];
const CLUSTER_MAX = [2, 2, 3, 3, 4, 4, 5];
/** Pieces a minute, before the quota of twenty-four. */
const SUPPLY_RATE = [16, 17.2, 18.4, 19.6, 20.8, 22.4, 24];

export const UPGRADE_DEFS: UpgradeDef[] = [
  // CENTER ROOT
  {
    id: 'core',
    name: 'Inti Sonar A.L.U.N.',
    shortName: 'A.L.U.N.',
    branch: 'core',
    description: 'Pelampung penjaga laguna. Satu gerakan: klik dan geser di air untuk mengirim ombak terarah.',
    effectText: () => 'Aktif · ombak dasar, daya hantam 10',
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
    description: 'Busur ombak lebih lebar, jadi satu sapuan menjangkau lebih banyak benda.',
    effectText: (lv) => `Lebar ombak +${lv * 26}%`,
    statLabel: 'LEBAR OMBAK',
    statBefore: (lv) => `x${(1 + lv * 0.26).toFixed(2)}`,
    statAfter: (lv) => `x${(1 + (lv + 1) * 0.26).toFixed(2)}`,
    cardSwatch: 'blue',
    maxLevel: 5,
    baseCost: 60,
    costMult: 1.75,
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
    description: 'Kumparan pasang membuat ombak mendorong lebih kuat dan menghantam lambung lebih keras.',
    effectText: (lv) => `Daya hantam ${basicHit(lv)} · dorongan +${lv * 34}%`,
    statLabel: 'DAYA HANTAM',
    statBefore: (lv) => `${basicHit(lv)}`,
    statAfter: (lv) => `${basicHit(lv + 1)}`,
    cardSwatch: 'blue',
    maxLevel: 5,
    baseCost: 78,
    costMult: 1.85,
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
    description: 'Tahan sebelum melepas geseran. Ombak mengisi lebih lama dan datang lebih tinggi.',
    effectText: (lv) =>
      lv === 0 ? 'Ombak bisa ditahan sampai penuh' : `Daya penuh hingga ${(1.55 + lv * 0.35).toFixed(2)}x`,
    statLabel: 'DAYA PENUH',
    statBefore: (lv) => (lv === 0 ? 'x1.25' : `x${(1.55 + lv * 0.35).toFixed(2)}`),
    statAfter: (lv) => `x${(1.55 + (lv + 1) * 0.35).toFixed(2)}`,
    cardSwatch: 'orange',
    maxLevel: 3,
    baseCost: 234,
    costMult: 2.1,
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
    description: 'Setiap sapuan diikuti ombak susulan yang lebih kecil di jalur yang sama.',
    effectText: (lv) => (lv === 0 ? '+1 ombak susulan otomatis' : `${lv} ombak susulan tiap sapuan`),
    statLabel: 'OMBAK SUSULAN',
    statBefore: (lv) => `${lv}`,
    statAfter: (lv) => `${lv + 1}`,
    cardSwatch: 'purple',
    maxLevel: 3,
    baseCost: 330,
    costMult: 2.25,
    requires: ['wave_width'],
    col: 1,
    row: 0,
    icon: 'echo',
  },
  {
    id: 'resonance_burst',
    name: 'Resonansi Konstruktif',
    shortName: 'Resonansi',
    branch: 'wave',
    description: 'Saat dua ombakmu bertemu, air di antaranya meledak dan menyapu sekelilingnya.',
    effectText: (lv) => (lv === 0 ? 'Aktifkan ledakan pertemuan ombak' : `Radius & daya ledakan Lv ${lv}`),
    statLabel: 'LEDAKAN',
    statBefore: (lv) => (lv === 0 ? 'MATI' : `Lv ${lv}`),
    statAfter: (lv) => `Lv ${lv + 1}`,
    cardSwatch: 'gold',
    maxLevel: 3,
    baseCost: 495,
    costMult: 2.3,
    requires: ['echo_wave', 'tidal_charge'],
    col: 0,
    row: 0.5,
    icon: 'resonance',
  },

  // ================= BRANCH 2: ENERGY (TOP-RIGHT) =================
  {
    id: 'tidal_energy',
    name: 'Kapasitas Energi',
    shortName: 'Kapasitas',
    branch: 'energy',
    description: 'Cadangan energi lebih besar, jadi lebih banyak ombak bisa dikirim beruntun.',
    effectText: (lv) => `Maks energi ${100 + lv * 35}`,
    statLabel: 'MAKS ENERGI',
    statBefore: (lv) => `${100 + lv * 35}`,
    statAfter: (lv) => `${100 + (lv + 1) * 35}`,
    cardSwatch: 'orange',
    maxLevel: 5,
    baseCost: 66,
    costMult: 1.75,
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
    description: 'Energi pulih lebih cepat dan setiap sapuan lebih ringan.',
    effectText: (lv) => `Pemulihan +${lv * 34}% · Biaya -${lv * 8}%`,
    statLabel: 'PEMULIHAN',
    statBefore: (lv) => `+${lv * 34}%`,
    statAfter: (lv) => `+${(lv + 1) * 34}%`,
    cardSwatch: 'orange',
    maxLevel: 4,
    baseCost: 132,
    costMult: 1.9,
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
    description: 'Setiap benda yang masuk jaring mengembalikan energi, jadi tangkapan beruntun membuatmu terus menyapu.',
    effectText: (lv) => (lv === 0 ? 'Tangkapan memulihkan energi' : `+${lv * 4} energi tiap tangkapan`),
    statLabel: 'ENERGI / TANGKAPAN',
    statBefore: (lv) => `+${lv * 4}`,
    statAfter: (lv) => `+${(lv + 1) * 4}`,
    cardSwatch: 'purple',
    maxLevel: 3,
    baseCost: 360,
    costMult: 2.15,
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
    description:
      'A.L.U.N. membelokkan yang kamu sapu: rongsok ke jaring, bantalan ke tumpahan, perahu ke dermaga.',
    effectText: (lv) => (lv === 0 ? 'Sapuan berbelok ke tujuannya' : `Kekuatan pandu +${lv * 36}%`),
    statLabel: 'PANDUAN',
    statBefore: (lv) => (lv === 0 ? 'MATI' : `+${lv * 36}%`),
    statAfter: (lv) => `+${(lv + 1) * 36}%`,
    cardSwatch: 'teal',
    maxLevel: 4,
    baseCost: 84,
    costMult: 1.85,
    requires: ['core'],
    col: 2,
    row: 2,
    icon: 'magnet',
  },
  {
    id: 'ai_sonar',
    name: 'Sonar Prediksi',
    shortName: 'Sonar',
    branch: 'ai',
    description: 'Menggambar jalur ombak sebelum dilepas dan menyorot benda penting di air.',
    effectText: (lv) => (lv === 0 ? 'Garis jalur ombak' : lv === 1 ? 'Garis jalur aktif' : 'Garis jalur lebih panjang'),
    statLabel: 'GARIS JALUR',
    statBefore: (lv) => ['MATI', 'AKTIF', 'JAUH'][Math.min(2, lv)],
    statAfter: (lv) => ['MATI', 'AKTIF', 'JAUH'][Math.min(2, lv + 1)],
    cardSwatch: 'teal',
    maxLevel: 2,
    baseCost: 174,
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
    description: 'Pelampung di laguna menjawab ombakmu yang lewat dengan riak tambahan.',
    effectText: (lv) => (lv === 0 ? 'Pasang 1 pelampung' : `${lv} pelampung terpasang`),
    statLabel: 'PELAMPUNG',
    statBefore: (lv) => `${lv}`,
    statAfter: (lv) => `${lv + 1}`,
    cardSwatch: 'teal',
    maxLevel: 3,
    baseCost: 405,
    costMult: 2.2,
    requires: ['ai_guide'],
    col: 1,
    row: 3,
    icon: 'buoy',
  },

  // ================= BRANCH 4: VILLAGE & COAST =================
  {
    id: 'net_expand',
    name: 'Jaring Gotong Royong',
    shortName: 'Jaring',
    branch: 'eco',
    description: 'Warga menambal dan melebarkan Jaring Desa. Rongsok tertarik masuk dari lebih jauh.',
    effectText: (lv) => `Lebar jaring +${lv * 22}%`,
    statLabel: 'LEBAR JARING',
    statBefore: (lv) => `+${lv * 22}%`,
    statAfter: (lv) => `+${(lv + 1) * 22}%`,
    cardSwatch: 'green',
    maxLevel: 4,
    baseCost: 72,
    costMult: 1.8,
    requires: ['core'],
    col: 4,
    row: 1,
    icon: 'net',
  },
  {
    id: 'trash_density',
    name: 'Arus Muatan Pesisir',
    shortName: 'Muatan',
    branch: 'eco',
    description: 'Spesialisasi patroli: pasang membawa rongsok berkelompok, dalam jatah pasang yang sama.',
    effectText: (lv) => (lv === 0 ? 'Rongsok datang satu-satu' : `Datang ${CLUSTER_MIN[lv]}–${CLUSTER_MAX[lv]} sekaligus`),
    statLabel: 'SEKALI DATANG',
    statBefore: (lv) => `${CLUSTER_MAX[Math.min(6, lv)]}`,
    statAfter: (lv) => `${CLUSTER_MAX[Math.min(6, lv + 1)]}`,
    cardSwatch: 'green',
    maxLevel: 6,
    baseCost: 78,
    costMult: 1.72,
    requires: ['net_expand'],
    col: 5,
    row: 1,
    icon: 'density',
  },
  {
    id: 'trash_rarity',
    name: 'Kelangkaan Muatan',
    shortName: 'Kelangkaan',
    branch: 'eco',
    description: 'Spesialisasi patroli: peti, baterai dan relik lebih sering ikut pasang. Nilainya tetap.',
    effectText: (lv) => (lv === 0 ? 'Temuan biasa' : `Peluang temuan bagus ${goodFindShare(lv)}%`),
    statLabel: 'TEMUAN BAGUS',
    statBefore: (lv) => `${goodFindShare(lv)}%`,
    statAfter: (lv) => `${goodFindShare(lv + 1)}%`,
    cardSwatch: 'gold',
    maxLevel: 5,
    baseCost: 156,
    costMult: 1.95,
    requires: ['trash_density'],
    col: 6,
    row: 1,
    icon: 'rarity',
  },
  {
    id: 'unlock_mangrove',
    name: 'Perawatan Mangrove',
    shortName: 'Mangrove',
    branch: 'eco',
    description: 'Bu Sari melepas bibit secara berkala. Sapu ke tepi kiri: akarnya menahan kotoran dan mengikis endapan.',
    effectText: (lv) => (lv === 0 ? 'Bibit datang berkala' : `Bibit tiap ${seedInterval(lv)} detik`),
    statLabel: 'JEDA BIBIT',
    statBefore: (lv) => (lv === 0 ? '–' : `${seedInterval(lv)} dtk`),
    statAfter: (lv) => `${seedInterval(lv + 1)} dtk`,
    cardSwatch: 'green',
    maxLevel: 3,
    baseCost: 114,
    costMult: 2.0,
    requires: ['core'],
    col: 4,
    row: 2,
    icon: 'mangrove',
  },
  {
    id: 'unlock_boats',
    name: 'Bantuan Kemudi',
    shortName: 'Kemudi',
    branch: 'eco',
    description: 'Kemudi baru untuk perahu nelayan. Setelah kamu dorong sekali, arus silang lebih mudah mereka lawan.',
    effectText: (lv) => (lv === 0 ? 'Arus silang terasa penuh' : `Arus silang terasa ${100 - lv * 22}%`),
    statLabel: 'ARUS TERASA',
    statBefore: (lv) => `${100 - lv * 22}%`,
    statAfter: (lv) => `${100 - (lv + 1) * 22}%`,
    cardSwatch: 'blue',
    maxLevel: 3,
    baseCost: 276,
    costMult: 2.1,
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
    description: 'Kadang ada api di tepi hutan. Kirim ombak sampai memercik ke pantai untuk memadamkannya.',
    effectText: (lv) => (lv === 0 ? 'Tugas api masuk patroli' : `Upah padamkan api ${firePay(lv)} koin`),
    statLabel: 'UPAH API',
    statBefore: (lv) => (lv === 0 ? '–' : `${firePay(lv)}`),
    statAfter: (lv) => `${firePay(lv + 1)}`,
    cardSwatch: 'orange',
    maxLevel: 2,
    baseCost: 525,
    costMult: 2.35,
    requires: ['unlock_mangrove'],
    col: 5,
    row: 2,
    icon: 'fire',
  },

  // ================= THE RADIO CALL (NOT FOR SALE) =================
  {
    id: 'unlock_boss',
    name: 'Operasi Badai Muson',
    shortName: 'Badai Muson',
    branch: 'final',
    description: 'Panggilan radio untuk menghadang kapal induk sebelum muson. Gratis, kamu yang memilih waktunya.',
    effectText: () => 'Panggilan radio',
    statLabel: 'PANGGILAN',
    statBefore: () => 'SIAGA',
    statAfter: () => 'JAWAB',
    cardSwatch: 'red',
    maxLevel: 1,
    baseCost: 0,
    costMult: 1,
    requires: ['core'],
    col: 3,
    row: 3,
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
  // The six pieces at the pier pay 28 coins, enough for the workshop's introductory fitting.
  if (id === 'wave_width' && currentLevel === 0) return 20;
  const def = UPGRADE_MAP[id];
  if (currentLevel >= def.maxLevel) return Infinity;
  return Math.round(def.baseCost * Math.pow(def.costMult, currentLevel));
}

/** The event that put this blueprint in the workshop. */
export function hasBlueprint(id: UpgradeId, f: Flags): boolean {
  switch (id) {
    case 'core':
      return true;
    case 'wave_width':
    case 'tidal_energy':
      return f.toolbox;
    case 'net_expand':
    case 'ai_guide':
    case 'energy_regen':
      return f.dolphin;
    case 'unlock_mangrove':
      return f.planted;
    case 'wave_power':
    case 'tidal_charge':
    case 'unlock_boats':
      return f.damar;
    case 'ai_sonar':
    case 'echo_wave':
      return f.cargo;
    case 'combo_flow':
    case 'ai_buoy':
    case 'resonance_burst':
      return knowsFleet(f);
    case 'trash_density':
    case 'trash_rarity':
    case 'unlock_forest':
      return f.ending;
    case 'unlock_boss':
      return false;
  }
}

/** The tools this one builds on are installed. */
export function hasTools(id: UpgradeId, upgrades: Record<UpgradeId, number>): boolean {
  if (id === 'resonance_burst') return upgrades.echo_wave > 0 || upgrades.tidal_charge > 0;
  return UPGRADE_MAP[id].requires.every((req) => (upgrades[req] ?? 0) > 0);
}

/** On the shelf: the blueprint is here and the tools it builds on are installed. */
export function isUpgradeUnlocked(id: UpgradeId, progress: PlayerProgress): boolean {
  return hasBlueprint(id, progress.story.flags) && hasTools(id, progress.upgrades);
}

/** Shown in the workshop: something to buy, or something already installed. */
export function isUpgradeShown(id: UpgradeId, progress: PlayerProgress): boolean {
  if (id === 'core' || id === 'unlock_boss') return false;
  return (progress.upgrades[id] ?? 0) > 0 || isUpgradeUnlocked(id, progress);
}

/** The highest level the workshop can install right now. */
export function levelCap(id: UpgradeId, progress: PlayerProgress): number {
  return Math.min(UPGRADE_MAP[id].maxLevel, toolLevelCap(progress.story.flags));
}

/** A level is for sale now, whether or not the player can pay for it. */
export function isForSale(id: UpgradeId, progress: PlayerProgress): boolean {
  if (id === 'core' || id === 'unlock_boss') return false;
  return isUpgradeUnlocked(id, progress) && (progress.upgrades[id] ?? 0) < levelCap(id, progress);
}

/** How many upgrades the player can pay for right now. */
export function countAffordableUpgrades(progress: PlayerProgress): number {
  let count = 0;
  for (const def of UPGRADE_DEFS) {
    if (!isForSale(def.id, progress)) continue;
    if (progress.coins >= getUpgradeCost(def.id, progress.upgrades[def.id] ?? 0)) count += 1;
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
    journalSeen: [],
    story: createStory(),
  };
}

export function computeStats(progress: PlayerProgress): ComputedStats {
  const u = progress.upgrades;
  const widthLv = u.wave_width ?? 0;
  const powerLv = u.wave_power ?? 0;
  const chargeLv = u.tidal_charge ?? 0;
  const comboLv = u.combo_flow ?? 0;
  const aiGuideLv = u.ai_guide ?? 0;
  const netLv = u.net_expand ?? 0;
  const regenLv = u.energy_regen ?? 0;
  const boatLv = u.unlock_boats ?? 0;
  const d = Math.min(SUPPLY_RATE.length - 1, u.trash_density ?? 0);
  const pollution = progress.story.pollution;

  return {
    waveWidth: 74 * (1 + widthLv * 0.26),
    waveSpeed: 315 * (1 + powerLv * 0.14),
    wavePower: 1.0 + powerLv * 0.34,
    waveDuration: 0.94 + powerLv * 0.13 + widthLv * 0.05,
    maxEnergy: 100 + (u.tidal_energy ?? 0) * 35,
    energyRegen: 16.5 * (1 + regenLv * 0.34),
    baseWaveCost: Math.max(8, 19 * (1 - regenLv * 0.08)),
    chargeUnlocked: chargeLv > 0,
    maxChargeBonus: chargeLv > 0 ? 1.55 + chargeLv * 0.35 : 1.25,
    echoCount: u.echo_wave ?? 0,
    resonanceLevel: u.resonance_burst ?? 0,
    comboEnergyReturn: comboLv * 4,
    aiGuideStrength: aiGuideLv > 0 ? 0.48 + aiGuideLv * 0.38 : 0,
    aiSonarLevel: u.ai_sonar ?? 0,
    aiBuoyCount: u.ai_buoy ?? 0,
    netRadius: 48 * (1 + netLv * 0.22),
    netPull: netLv * 26,
    supplyInterval: 60 / SUPPLY_RATE[d],
    supplyClusterMin: CLUSTER_MIN[d],
    supplyClusterMax: CLUSTER_MAX[d],
    rarityLevel: u.trash_rarity ?? 0,
    mangroveLevel: u.unlock_mangrove ?? 0,
    steering: Math.min(0.66, boatLv * 0.22),
    boatLevel: boatLv,
    forestLevel: u.unlock_forest ?? 0,
    ecoPercent: Math.round(100 - pollution),
    pollution,
  };
}
