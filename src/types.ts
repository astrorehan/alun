export type GamePhase = 'title' | 'intro' | 'playing' | 'upgrade' | 'victory';

export type ShopTab = 'cards' | 'tree' | 'achievements';

export type TimeOfDay = 'morning' | 'noon' | 'sunset' | 'monsoon' | 'dawn';

export type UpgradeBranch = 'core' | 'wave' | 'energy' | 'ai' | 'eco' | 'final';

export type TrashRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type UpgradeId =
  | 'core'
  | 'wave_width'
  | 'wave_power'
  | 'tidal_charge'
  | 'echo_wave'
  | 'resonance_burst'
  | 'tidal_energy'
  | 'energy_regen'
  | 'combo_flow'
  | 'ai_guide'
  | 'ai_sonar'
  | 'ai_buoy'
  | 'net_expand'
  | 'trash_density'
  | 'trash_rarity'
  | 'unlock_mangrove'
  | 'unlock_boats'
  | 'unlock_forest'
  | 'unlock_boss';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  shortName: string;
  branch: UpgradeBranch;
  description: string;
  effectText: (level: number) => string;
  statLabel: string;
  statBefore: (level: number) => string;
  statAfter: (level: number) => string;
  cardSwatch: 'orange' | 'blue' | 'green' | 'gold' | 'teal' | 'purple' | 'red';
  featuredTag?: string;
  featured?: boolean;
  maxLevel: number;
  baseCost: number;
  costMult: number;
  requires: UpgradeId[];
  /** Position in 1000x560 normalized skill-tree coordinate space */
  x: number;
  y: number;
  icon:
    | 'core'
    | 'width'
    | 'power'
    | 'charge'
    | 'echo'
    | 'resonance'
    | 'energy'
    | 'regen'
    | 'combo'
    | 'magnet'
    | 'sonar'
    | 'buoy'
    | 'net'
    | 'density'
    | 'rarity'
    | 'mangrove'
    | 'boat'
    | 'fire'
    | 'boss';
}

export type WaveKind = 'directional' | 'ripple' | 'echo' | 'resonance' | 'buoy_pulse';

export interface Wave {
  id: number;
  kind: WaveKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  arcHalf: number;
  radius: number;
  maxRadius: number;
  crestWidth: number;
  power: number;
  charge: number;
  age: number;
  maxAge: number;
  hitMap: Map<number, number>;
  resonatedWith: Set<number>;
  triggeredBuoys: Set<number>;
  isEcho?: boolean;
}

export type EntityKind =
  | 'trash_bottle'
  | 'trash_bag'
  | 'trash_net'
  | 'trash_crate'
  | 'trash_battery'
  | 'trash_relic'
  | 'mangrove_seed'
  | 'boat'
  | 'fire'
  | 'oil'
  | 'trawler'
  | 'dolphin';

export interface Entity {
  id: number;
  kind: EntityKind;
  rarity?: TrashRarity;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  hp: number;
  maxHp: number;
  value: number;
  age: number;
  rotation: number;
  angVel: number;
  bobPhase: number;
  aiGuidedTimer: number;
  hitFlash: number;
  variant: number;
  actionTimer: number;
}

export interface PermanentMangrove {
  x: number;
  y: number;
  scale: number;
  targetScale: number;
  swayOffset: number;
  seed: number;
}

export interface AiBuoy {
  id: number;
  x: number;
  y: number;
  pulseTimer: number;
  cooldown: number;
  bobPhase: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  alpha: number;
  kind: 'foam' | 'spark' | 'leaf' | 'ember' | 'smoke' | 'ring' | 'biolum';
  drag: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  subtext?: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

export interface AmbientFish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  kind: 'fish' | 'manta';
  phase: number;
  color: string;
}

export interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

export interface PendingEcho {
  delay: number;
  x: number;
  y: number;
  angle: number;
  charge: number;
  powerScale: number;
  widthScale: number;
}

export interface PlayerProgress {
  coins: number;
  totalCoinsEarned: number;
  shopUnlocked: boolean;
  upgrades: Record<UpgradeId, number>;
  mangroves: PermanentMangrove[];
  totalTrash: number;
  totalRareTrash: number;
  totalBoats: number;
  totalFires: number;
  totalWaves: number;
  totalResonances: number;
  victoryAchieved: boolean;
  endlessMode: boolean;
  claimedAchievements: string[];
  /** The dolphin caught in the ghost net has been set free. Missing in older saves. */
  dolphinRescued?: boolean;
}

export interface RarityWeights {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  legendary: number;
}

export interface ComputedStats {
  waveWidth: number;
  waveSpeed: number;
  wavePower: number;
  waveDuration: number;
  maxEnergy: number;
  energyRegen: number;
  baseWaveCost: number;
  chargeUnlocked: boolean;
  maxChargeBonus: number;
  echoCount: number;
  resonanceLevel: number;
  comboMaxMult: number;
  comboEnergyReturn: number;
  aiGuideStrength: number;
  aiSonarLevel: number;
  aiBuoyCount: number;
  netRadius: number;
  netPull: number;
  coinMultiplier: number;
  /** Maximum simultaneous debris items in lagoon */
  maxTrashCount: number;
  /** Seconds between debris cluster spawns */
  trashSpawnInterval: number;
  /** Number of debris spawned per wave cluster */
  trashClusterMin: number;
  trashClusterMax: number;
  trashRarityLevel: number;
  rarityWeights: RarityWeights;
  mangroveLevel: number;
  boatLevel: number;
  forestLevel: number;
  bossUnlocked: boolean;
  ecoPercent: number;
}

export interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  currX: number;
  currY: number;
  holdTime: number;
  charge: number;
  pointerId: number;
}
