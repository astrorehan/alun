export type GamePhase = 'title' | 'intro' | 'playing' | 'upgrade' | 'victory' | 'defeat';

export type ShopTab = 'tree' | 'journal';

export type TimeOfDay = 'morning' | 'noon' | 'sunset' | 'night' | 'monsoon' | 'dawn';

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
  | 'pier_armor';

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
  maxLevel: number;
  baseCost: number;
  costMult: number;
  requires: UpgradeId[];
  /**
   * Cell on the workshop map: column 0-6 with A.L.U.N. in column 3, row 0-3, halves allowed. A tool
   * sits one column further from the core than the tool it needs, so every path runs outward.
   */
  col: number;
  row: number;
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
    | 'boss'
    | 'shield';
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
  /** A fishing boat on its way to the pier. */
  | 'boat'
  | 'fire'
  | 'dolphin'
  /** The tool chest snagged at the mooring. */
  | 'toolbox'
  /** The three ships of the fleet share one hull and differ in their gear, and the mother ship has all of it. */
  | 'raider'
  | 'trawl_ship'
  | 'polluter'
  | 'trawler'
  /** One end float of a trawl. */
  | 'float'
  /** A drum the mother ship lowers towards the reef. */
  | 'drum'
  /** The absorbent pad the fishers throw. */
  | 'pad'
  /** A net drifting across the dolphins' lane. */
  | 'drift_net'
  /** Pollution that stays where it is until it is lifted. */
  | 'oil'
  | 'ghost_net'
  | 'deposit';

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
  /** Caught on weed or rope: it stays where it is until the first wave reaches it. */
  snagged?: boolean;
  /** Washed up on the beach. */
  stranded?: boolean;
  /** One of the six pieces that close the pier at the start. */
  opening?: boolean;
  /** Pollution this very thing added, taken back when it is lifted. */
  pollution?: number;
  /** Which part of a job this is ("A" and "B" for the two ends of a trawl). */
  tag?: string;
  /** The pollution source this thing stands for. */
  source?: number;
  /** Where it belongs, for things on a line. */
  home?: Point;
  /** Pirate wave unit stats (only on pirate raider entities). */
  pirateSpeed?: number;
  pirateDmg?: number;
  pirateBounty?: number;
  pirateDumpTime?: number;
  anchorIdx?: number;
  attackWork?: number;
}

export interface Point {
  x: number;
  y: number;
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
  /** Village journal pages already opened by the player. */
  journalSeen: string[];
  story: StoryState;
}

/** Everything that opens a blueprint or a chapter. Once true, always true. */
export type StoryFlag =
  | 'toolbox'
  | 'dolphin'
  | 'seedling'
  | 'planted'
  | 'damar'
  | 'cargo'
  | 'trawl'
  | 'waste'
  | 'calf'
  | 'night'
  | 'ops'
  | 'boss'
  | 'ending';

export type JobKind = 'dolphin' | 'boat' | 'raid' | 'trawl' | 'waste' | 'calf' | 'fire' | 'boss';

export type JobResult = 'done' | 'failed' | 'ignored';

/** One event in the water. Plain data only: it goes into the save as it is. */
export interface JobState {
  id: string;
  kind: JobKind;
  /** A story event, as opposed to one of the repeating ones. */
  story: boolean;
  variant: number;
  phase: string;
  /** Seconds in this phase, and in the whole job. */
  t: number;
  total: number;
  /** What the player's waves did, as opposed to time passing. */
  touched: boolean;
  /** Pollution when the job began, for the log. */
  p0: number;
  hp: number;
  baskets: number;
  /** Progress of whatever the ship is doing, 0..1: seizing a basket, winding the winch, dropping a drum. */
  work: number;
  /** Pay decided at the start (the boat's bonus) or on the way (waste that leaked). */
  pay: number;
  leaked: boolean;
  /** Pollution sources that belong to this job. */
  sources: number[];
  turns: number;
  seen: { trawl: boolean; drum: boolean };
  /** Where things stood, so that a reload does not move them. */
  at: { x: number; y: number } | null;
  gearAt?: Point[];
  windowDamage?: number;
}

export interface JobRecord {
  id: string;
  kind: JobKind;
  result: JobResult;
  pay: number;
  dP: number;
  chapter: number;
  at: number;
}

export type SourceKind = 'spill' | 'ghost_net' | 'deposit';

/** Pollution lying somewhere, with the amount that was really added to P. */
export interface PollutionSource {
  id: number;
  kind: SourceKind;
  amount: number;
  x: number;
  y: number;
  /** The old blotch of chapter 6. */
  old?: boolean;
  /** Deposits stay under the sand until a fisher points one out. */
  shown?: boolean;
}

/** A piece of salvage in the water or on the beach. */
export interface SavedTrash {
  kind: EntityKind;
  variant: number;
  x: number;
  y: number;
  snagged?: boolean;
  stranded?: boolean;
  opening?: boolean;
  pollution?: number;
}

export type CyclePhase = 'prep' | 'day' | 'night';

/** Stable IDs for pirate variants in saves and wave plans. */
export const PIRATE_KIND = { raider: 0, skiff: 1, heavy: 2, shield: 3, dumper: 4, signal: 5 } as const;
export type PirateKind = (typeof PIRATE_KIND)[keyof typeof PIRATE_KIND];

export interface SavedPirate {
  variant: PirateKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  anchorIdx: number;
  tag: 'approach' | 'attack';
  attackWork: number;
  speed: number;
  dmg: number;
  bounty: number;
  rotation?: number;
  dumpTime?: number;
}

export interface WaveSpawn {
  at: number;
  variant: PirateKind;
  lane: number;
  huge?: boolean;
  /** Optional support ship launched with this sub-wave. */
  support?: 'trawl' | 'waste';
}

export interface StoryState {
  version: 4;
  /** Current day (1..5 for story climax, 6+ for endless). */
  day: number;
  /** Legacy chapter mirror (1..9) kept for journal/renderer compatibility. */
  chapter: number;
  cycle: CyclePhase;
  /** Elapsed seconds inside the current day (0..DAY_DURATION) or night (0..NIGHT_DURATION). */
  dayTime: number;
  nightTime: number;
  /** Pier structural integrity. Reaches 0 => Defeat & restart from Day 1. */
  pierHp: number;
  maxPierHp: number;
  flags: Record<StoryFlag, boolean>;
  /** Seconds played. Nothing in the story looks at the clock on the wall. */
  clock: number;
  /** Where the opening/story stands, for the objective. */
  step: string;
  pollution: number;
  sources: PollutionSource[];
  nextSource: number;
  openingLeft: number;
  box: 'hidden' | 'snagged' | 'loose' | 'home';
  boxAt: { x: number; y: number };
  job: JobState | null;
  jobSeq: number;
  /** No side job may begin before this moment on the play clock. */
  calmUntil: number;
  turn: number;
  rounds: number;
  threat: number;
  callAnswered: boolean;
  bossHp: number;
  baskets: number;
  beacon: boolean;
  log: JobRecord[];
  arrivals: number[];
  trash: SavedTrash[];
  /** Active pirates in the lagoon right now (multiple can attack at once). */
  pirates: SavedPirate[];
  /** Remaining spawns scheduled for the active night wave. */
  wavePlan: WaveSpawn[];
  waveTotal: number;
  waveSpawned: number;
  waveDefeated: number;
  /** Normalized 0..1 positions along the night wave bar where huge waves strike. */
  hugeFlags: number[];
  hugeAnnounced: number;
  /** Countdown to next daytime skirmish pirate. */
  skirmishTimer: number;
  /** Countdown to next daytime village/story side event. */
  sideEventTimer: number;
  supplyTimer: number;
  seedTimer: number;
  padTimer: number;
  marks: Record<string, number>;
  worstP: number;
  aboveSince: number;
  recoveries: number[];
  piratesSunk: number;
  nightsSurvived: number;
  defeated: boolean;
  saved: { dolphins: number; baskets: number; raids: number; trawls: number; spills: number; deposits: number; ghosts: number };
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
  comboEnergyReturn: number;
  aiGuideStrength: number;
  aiSonarLevel: number;
  /** Extra hull damage multiplier from Sonar prediction targeting. */
  critBonus: number;
  aiBuoyCount: number;
  netRadius: number;
  netPull: number;
  /** Seconds between arrivals of salvage, and how many arrive together. */
  supplyInterval: number;
  supplyClusterMin: number;
  supplyClusterMax: number;
  maxSalvage: number;
  salvagePerMinute: number;
  rarityLevel: number;
  mangroveLevel: number;
  /** How much of the cross-current the fishers can steer against on their own, 0..1. */
  steering: number;
  boatLevel: number;
  forestLevel: number;
  /** Pier armor upgrades: max HP and damage reduction fraction (0..0.40). */
  maxPierHp: number;
  pierArmor: number;
  /** Coastal health shown in the HUD: 100 - pollution. */
  ecoPercent: number;
  pollution: number;
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
