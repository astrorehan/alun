import type { SceneId } from './story/talk';
import type {
  AiBuoy,
  AmbientFish,
  ComputedStats,
  DragState,
  Entity,
  EntityKind,
  FloatingText,
  Particle,
  PendingEcho,
  PlayerProgress,
  RainDrop,
  TimeOfDay,
  TrashRarity,
  UpgradeId,
  Wave,
} from './types';
import type { TropicalAudio } from './audio';
import { Story } from './story/director';
import { FireJob } from './story/jobs';
import { DAY_DURATION, isBossDay, SALVAGE_VALUE } from './story/state';
import { AI_BUOY_SLOTS, COLLECTOR_NET, getShoreX, MANGROVE_SLOTS, SEA_ROCKS, WORLD_H, WORLD_W } from './world';

/** What the simulation asks of the app around it. */
export interface SimHooks {
  radio: (sender: string, text: string) => void;
  /** Bu Sari tells something (see story/talk.ts). Without it, her lines go out over the radio. */
  talk?: (id: SceneId) => void;
  /** Coins were paid out at this place in the lagoon. */
  coins: (amount: number, x: number, y: number) => void;
  /** Something worth keeping happened: save now. */
  save: () => void;
  chapter: (n: number) => void;
  celebrate: (text: string, swatch: 'orange' | 'blue' | 'green' | 'gold' | 'teal' | 'purple' | 'red') => void;
  /** Non-blocking dramatic center banner (nightfall, huge wave, dawn). */
  banner: (title: string, sub: string, swatch: 'orange' | 'blue' | 'green' | 'gold' | 'teal' | 'purple' | 'red') => void;
  /** Pier took damage from a pirate attack. */
  pierHurt: (hp: number, maxHp: number) => void;
  /** Pier HP reached 0 — run lost, restart from Day 1. */
  defeat: () => void;
  /** The mother dolphin is there. True when a film takes it from here. */
  dolphin: (e: Entity) => boolean;
  /** The first raider of the story is in the water. True when a film introduces its crew. */
  raider?: (e: Entity) => boolean;
  /** One of the dolphin's films, or the help between them, or the raiders' film is running. */
  filming: () => boolean;
  /** The shore got worse by this much. */
  worsen: (kind: 'trash' | 'spill' | 'ghost_net', amount: number) => void;
  /** Day 5 Monsoon Boss defeated — victory dawn! */
  ending: () => void;
}

export function isTrashKind(kind: EntityKind): boolean {
  return (
    kind === 'trash_bottle' ||
    kind === 'trash_bag' ||
    kind === 'trash_net' ||
    kind === 'trash_crate' ||
    kind === 'trash_battery' ||
    kind === 'trash_relic'
  );
}

/** Rarity (colour and sound only), radius and mass of each kind of salvage. */
const TRASH_BODY: Partial<Record<EntityKind, [TrashRarity, number, number]>> = {
  trash_bottle: ['common', 12, 0.82],
  trash_bag: ['common', 13.5, 0.9],
  trash_net: ['uncommon', 16.5, 1.18],
  trash_crate: ['rare', 17.5, 1.28],
  trash_battery: ['epic', 18.5, 1.35],
  trash_relic: ['legendary', 20, 1.3],
};

const MAX_PARTICLES = 260;
/** Seconds a combo waits for the next catch. */
export const COMBO_WINDOW = 3.4;
const MAX_FLOATING_TEXTS = 42;

export class GameSimulation {
  public waves: Wave[] = [];
  public entities: Entity[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public ambientFish: AmbientFish[] = [];
  public rainDrops: RainDrop[] = [];
  public aiBuoys: AiBuoy[] = [];
  public pendingEchoes: PendingEcho[] = [];

  public time = 0;
  public energy = 100;
  public maxEnergy = 100;

  public comboCount = 0;
  public comboTimer = 0;

  public screenShake = 0;
  public hitstopTimer = 0;
  public netPulse = 0;
  public flashAlpha = 0;
  public shoreSplash = 0;
  /** Seconds since the wave being held reached full power, or -1. */
  public chargeFullAge = -1;

  public bossActive = false;
  /** A raider lies across the mouth of the net. */
  public netClosed = false;
  public lagoonInitialized = false;
  /** Counts the lagoons put together so far, for whoever keeps something about one between frames. */
  public lagoonId = 0;
  public readonly story: Story;
  public progress!: PlayerProgress;
  public stats!: ComputedStats;

  public drag: DragState = {
    active: false,
    startX: 0,
    startY: 0,
    currX: 0,
    currY: 0,
    holdTime: 0,
    charge: 0,
    pointerId: -1,
  };

  private nextId = 1;
  private ambientRippleTimer = 0;
  private resonanceCooldown = 0;

  constructor(
    public readonly audio: TropicalAudio,
    public readonly hooks: SimHooks
  ) {
    this.story = new Story(this);
    this.initAmbientLife();
  }

  private initAmbientLife(): void {
    this.ambientFish = [];
    for (let i = 0; i < 2; i++) {
      this.ambientFish.push({
        x: 520 + i * 320,
        y: 190 + i * 340,
        vx: (i === 0 ? 1 : -1) * 26,
        vy: (i === 0 ? 1 : -1) * 9,
        size: 22 + i * 4,
        kind: 'manta',
        phase: i * 2.4,
        color: '#0c5b6e',
      });
    }
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 22 + Math.random() * 24;
      this.ambientFish.push({
        x: 400 + Math.random() * 760,
        y: 80 + Math.random() * 560,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: 5 + Math.random() * 3.5,
        kind: 'fish',
        phase: Math.random() * Math.PI * 2,
        color: i % 3 === 0 ? '#117488' : '#0b5c70',
      });
    }

    this.rainDrops = [];
    for (let i = 0; i < 110; i++) {
      this.rainDrops.push({
        x: Math.random() * (WORLD_W + 200),
        y: Math.random() * WORLD_H,
        len: 16 + Math.random() * 18,
        speed: 520 + Math.random() * 260,
        alpha: 0.16 + Math.random() * 0.22,
      });
    }
  }

  /** Smooth Day/Night lighting cycle: dawn -> morning -> noon -> sunset -> night (or monsoon on Boss nights). */
  public getTimeOfDay(progress: PlayerProgress): TimeOfDay {
    const s = progress.story;
    if (this.bossActive || (s.cycle === 'night' && isBossDay(s.day))) return 'monsoon';
    if (s.cycle === 'night') return 'night';
    if (s.cycle === 'prep') return 'morning';
    const u = s.dayTime / Math.max(1, DAY_DURATION);
    if (u < 0.14) return s.day > 1 ? 'dawn' : 'morning';
    if (u < 0.34) return 'morning';
    if (u < 0.76) return 'noon';
    return 'sunset';
  }

  /** How many pieces the tourists leave behind. */
  public startingTrashCount(): number {
    return 6;
  }

  /**
   * Puts the lagoon in the water from the save. `clean` keeps the opening trash out of it and the radio
   * silent, for the film, which throws that trash itself.
   */
  public initLagoon(progress: PlayerProgress, stats: ComputedStats, clean = false): void {
    this.story.abandon();
    this.progress = progress;
    this.stats = stats;
    this.waves = [];
    this.entities = [];
    this.particles = [];
    this.floatingTexts = [];
    this.pendingEchoes = [];
    this.lagoonInitialized = true;
    this.lagoonId += 1;

    this.maxEnergy = stats.maxEnergy;
    this.energy = stats.maxEnergy;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.screenShake = 0;
    this.hitstopTimer = 0;
    this.bossActive = false;
    this.netClosed = false;
    this.drag.active = false;

    this.syncAiBuoys(stats);
    this.story.load(!clean);
    if (!clean) this.greet();

    this.audio.setWeather(this.getTimeOfDay(progress), false);
    this.audio.setWaveCharge(0);
  }

  /** The first words on the radio, for anyone who has not opened the workshop yet. */
  public greet(): void {
    const s = this.progress.story;
    if (s.cycle !== 'prep') return;
    // a new story starts with Bu Sari; a story picked up again only gets a reminder
    if (s.step === 'sweep') {
      if (!this.story.talk('wake')) this.hooks.radio('BU SARI', 'Sapu sampahnyo ke Jaring Desa, ya.');
    } else if (s.step === 'box') {
      this.hooks.radio('BU SARI', 'Peti ibuk masih di tambatan. Dorong ke ujung dermaga.');
    } else if (s.step === 'shop') {
      if (!this.story.talk('workshop')) this.hooks.radio('BU SARI', 'Bengkel la buka. Tombolnyo di kanan bawah.');
    }
  }


  /**
   * What floats while nobody is playing yet: trash bobs and slows to a stop where it fell, and nothing
   * is pulled into the net or paid out. Used under the opening.
   */
  public bob(dt: number): void {
    for (const e of this.entities) {
      e.age += dt;
      e.bobPhase += dt * 3.1;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (!isTrashKind(e.kind)) continue;
      // the same easy westward set the lagoon has in play, without the net's pull
      e.vx += (-6 + Math.sin(this.time + e.bobPhase) * 4) * dt;
      e.vy += Math.cos(this.time * 0.8 + e.bobPhase) * 5 * dt;
      const damp = Math.pow(0.962, dt * 60);
      e.vx *= damp;
      e.vy *= damp;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.rotation += e.angVel * dt;
      e.angVel *= 0.94;
      e.y = Math.min(WORLD_H - 42, Math.max(42, e.y));
      e.x = Math.min(WORLD_W - 24, Math.max(getShoreX(e.y) + e.radius + 4, e.x));
    }
  }

  /** Applies newly bought shop upgrades immediately to the live lagoon! */
  public onUpgradePurchased(id: UpgradeId, stats: ComputedStats): void {
    this.stats = stats;
    const prevMax = this.maxEnergy;
    this.maxEnergy = stats.maxEnergy;
    if (this.maxEnergy > prevMax) {
      this.energy = Math.min(this.maxEnergy, this.energy + (this.maxEnergy - prevMax));
    }

    if (id === 'pier_armor') {
      const s = this.progress.story;
      const gain = Math.max(35, stats.maxPierHp - s.maxPierHp);
      s.maxPierHp = stats.maxPierHp;
      s.pierHp = Math.min(s.maxPierHp, s.pierHp + gain);
    }

    this.syncAiBuoys(stats);

    if (id === 'unlock_mangrove' && !this.entities.some((e) => e.kind === 'mangrove_seed')) {
      this.addSeed(560 + Math.random() * 160, 140 + Math.random() * (WORLD_H - 280));
    }
  }

  private syncAiBuoys(stats: ComputedStats): void {
    const targetCount = Math.min(stats.aiBuoyCount, AI_BUOY_SLOTS.length);
    while (this.aiBuoys.length < targetCount) {
      const i = this.aiBuoys.length;
      this.aiBuoys.push({
        id: i + 1,
        x: AI_BUOY_SLOTS[i].x,
        y: AI_BUOY_SLOTS[i].y,
        pulseTimer: 0.6,
        cooldown: 0,
        bobPhase: i * 2.1,
      });
    }
    if (this.aiBuoys.length > targetCount) {
      this.aiBuoys.length = targetCount;
    }
  }

  public updateAmbientOnly(dt: number, progress: PlayerProgress, stats: ComputedStats): void {
    this.time += dt;
    this.updateAmbientFish(dt);
    this.updateParticles(dt);

    this.ambientRippleTimer -= dt;
    if (this.ambientRippleTimer <= 0) {
      this.ambientRippleTimer = 1.8 + Math.random() * 1.4;
      const rx = 440 + Math.random() * 680;
      const ry = 100 + Math.random() * 520;
      this.pushParticle({
        x: rx,
        y: ry,
        vx: 0,
        vy: 0,
        size: 16,
        life: 0,
        maxLife: 1.5,
        color: '#a8f9f3',
        alpha: 0.32,
        kind: 'ring',
        drag: 1,
      });
    }

    for (const m of progress.mangroves) {
      m.scale += (m.targetScale - m.scale) * Math.min(1, dt * 5);
    }

    this.progress = progress;
    this.stats = stats;
    const tod = this.getTimeOfDay(progress);
    this.audio.setWeather(tod, false);
    this.audio.updateWeather(dt);
    this.audio.setWaveCharge(0);
    if (tod === 'monsoon') {
      this.updateRain(dt);
    }
  }

  public update(dt: number, progress: PlayerProgress, stats: ComputedStats): void {
    this.progress = progress;
    this.stats = stats;
    this.time += dt;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.screenShake = Math.max(0, this.screenShake - dt * 18);
      return;
    }

    const tod = this.getTimeOfDay(progress);
    this.audio.setWeather(tod, true);
    this.audio.updateWeather(dt);
    if (tod === 'monsoon') {
      this.updateRain(dt);
    }

    this.maxEnergy = stats.maxEnergy;
    this.energy = Math.min(stats.maxEnergy, this.energy + stats.energyRegen * dt);
    this.screenShake = Math.max(0, this.screenShake - dt * 28);
    this.netPulse = Math.max(0, this.netPulse - dt * 4);
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.5);
    this.shoreSplash = Math.max(0, this.shoreSplash - dt * 2.4);
    this.resonanceCooldown = Math.max(0, this.resonanceCooldown - dt);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        const lostCombo = this.comboCount;
        this.comboCount = 0;
        if (lostCombo >= 5) {
          this.audio.playComboBreak(lostCombo);
        }
      }
    }

    if (this.drag.active) {
      this.drag.holdTime += dt;
      const chargeSpeed = stats.chargeUnlocked ? 1.15 : 0.7;
      const maxCap = stats.chargeUnlocked ? 1.0 : 0.45;
      this.drag.charge = Math.min(maxCap, Math.max(0, (this.drag.holdTime - 0.08) * chargeSpeed));
      this.audio.setWaveCharge(this.drag.charge);
      if (this.chargeFullAge >= 0) this.chargeFullAge += dt;
      // only a wave that can really be charged says it is full; the short hold without it fills at once
      else if (stats.chargeUnlocked && this.drag.charge >= maxCap - 1e-6) {
        this.chargeFullAge = 0;
        this.audio.playChargeFull();
      }
    } else {
      this.audio.setWaveCharge(0);
      this.chargeFullAge = -1;
    }

    for (const m of progress.mangroves) {
      m.scale += (m.targetScale - m.scale) * Math.min(1, dt * 6);
    }

    for (let i = this.pendingEchoes.length - 1; i >= 0; i--) {
      const pe = this.pendingEchoes[i];
      pe.delay -= dt;
      if (pe.delay <= 0) {
        this.pendingEchoes.splice(i, 1);
        this.spawnWaveInternal(
          'echo',
          pe.x,
          pe.y,
          pe.angle,
          pe.charge,
          stats,
          pe.powerScale,
          pe.widthScale
        );
        this.audio.playWaveLaunch(pe.charge * 0.65, true, this.audio.worldXToPan(pe.x, WORLD_W));
      }
    }

    for (const buoy of this.aiBuoys) {
      buoy.bobPhase += dt * 2.5;
      buoy.pulseTimer = Math.max(0, buoy.pulseTimer - dt);
      buoy.cooldown = Math.max(0, buoy.cooldown - dt);
    }

    this.updateWaves(dt, progress, stats, tod === 'monsoon' || tod === 'night');
    this.updateEntities(dt, progress, stats);
    this.story.update(dt);
    this.updateAmbientFish(dt);
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);
  }

  public launchPlayerWave(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    charge: number,
    progress: PlayerProgress,
    stats: ComputedStats
  ): boolean {
    this.audio.setWaveCharge(0);
    const cost = stats.baseWaveCost * (1 + charge * 0.72);
    if (this.energy < Math.min(8, cost * 0.45)) {
      this.audio.playUiError();
      this.text(startX, startY - 12, 'Energi rendah!', '#f6b96a', 0.85);
      return false;
    }

    const ratio = Math.min(1, this.energy / cost);
    this.energy = Math.max(0, this.energy - cost);

    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.hypot(dx, dy);

    const spawnX = Math.max(getShoreX(startY) + 12, startX);
    const spawnY = Math.max(24, Math.min(WORLD_H - 24, startY));
    const effectiveCharge = charge * ratio;

    if (dist < 16) {
      this.spawnWaveInternal('ripple', spawnX, spawnY, 0, effectiveCharge, stats, 0.85 * ratio, 0.9);
    } else {
      const angle = Math.atan2(dy, dx);
      this.spawnWaveInternal('directional', spawnX, spawnY, angle, effectiveCharge, stats, ratio, 1);

      for (let e = 1; e <= stats.echoCount; e++) {
        this.pendingEchoes.push({
          delay: e * 0.24,
          x: spawnX,
          y: spawnY,
          angle,
          charge: effectiveCharge * 0.75,
          powerScale: (0.78 - (e - 1) * 0.1) * ratio,
          widthScale: 0.92,
        });
      }
    }

    progress.totalWaves += 1;
    this.screenShake = Math.max(this.screenShake, 2.2 + effectiveCharge * 5.2);
    if (effectiveCharge >= 0.85) {
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.045);
      this.flashAlpha = Math.max(this.flashAlpha, 0.06);
    }
    this.audio.playWaveLaunch(effectiveCharge, false, this.audio.worldXToPan(spawnX, WORLD_W));
    return true;
  }

  private spawnWaveInternal(
    kind: Wave['kind'],
    x: number,
    y: number,
    angle: number,
    charge: number,
    stats: ComputedStats,
    powerScale: number,
    widthScale: number
  ): void {
    const chargeMult = 1 + charge * (stats.maxChargeBonus - 1);
    const isCircle = kind === 'ripple' || kind === 'resonance' || kind === 'buoy_pulse';
    const speed = isCircle ? 0 : stats.waveSpeed * (0.94 + charge * 0.34);

    const wave: Wave = {
      id: this.nextId++,
      kind,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle,
      arcHalf: isCircle ? Math.PI : 0.72 + charge * 0.14,
      radius: isCircle ? 16 : 24,
      maxRadius:
        kind === 'resonance'
          ? 148 + stats.resonanceLevel * 34
          : kind === 'buoy_pulse'
            ? 125
            : isCircle
              ? 88 + stats.waveWidth * 0.65 * chargeMult
              : stats.waveWidth * 1.15 * chargeMult,
      crestWidth: stats.waveWidth * widthScale * (1 + charge * 0.52),
      power:
        stats.wavePower *
        powerScale *
        chargeMult *
        (kind === 'resonance' ? 2.15 + stats.resonanceLevel * 0.4 : 1),
      charge,
      age: 0,
      maxAge:
        kind === 'resonance'
          ? 0.72
          : kind === 'buoy_pulse'
            ? 0.68
            : isCircle
              ? 0.76
              : stats.waveDuration * (1 + charge * 0.25),
      hitMap: new Map(),
      resonatedWith: new Set(),
      triggeredBuoys: new Set(),
      isEcho: kind === 'echo',
    };

    this.waves.push(wave);

    const burstCount = kind === 'resonance' ? 26 : 7 + Math.round(charge * 8);
    for (let i = 0; i < burstCount; i++) {
      const a = isCircle
        ? (i / burstCount) * Math.PI * 2 + Math.random() * 0.2
        : angle + (Math.random() - 0.5) * 1.3;
      const spd = (isCircle ? 95 : 130) + Math.random() * 140;
      this.pushParticle({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: 2.5 + Math.random() * 3.6,
        life: 0,
        maxLife: 0.42 + Math.random() * 0.35,
        color: kind === 'resonance' ? (i % 2 === 0 ? '#ffe07d' : '#7ffcff') : '#e5ffff',
        alpha: 0.9,
        kind: kind === 'resonance' ? 'spark' : 'foam',
        drag: 0.92,
      });
    }
  }

  private updateWaves(
    dt: number,
    progress: PlayerProgress,
    stats: ComputedStats,
    isMonsoon: boolean
  ): void {
    const newResonances: { x: number; y: number }[] = [];
    const newBuoyPulses: { x: number; y: number }[] = [];

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.age += dt;
      if (w.age >= w.maxAge) {
        this.waves.splice(i, 1);
        continue;
      }

      const lifeT = w.age / w.maxAge;
      const isCircle = w.kind === 'ripple' || w.kind === 'resonance' || w.kind === 'buoy_pulse';

      if (isCircle) {
        const eased = 1 - Math.pow(1 - lifeT, 2.2);
        w.radius = 16 + (w.maxRadius - 16) * eased;
      } else {
        const slowFactor = 1 - lifeT * 0.38;
        w.x += w.vx * slowFactor * dt;
        w.y += w.vy * slowFactor * dt;
        w.crestWidth += dt * 42;

        if (Math.random() < (isMonsoon ? 0.78 : 0.45)) {
          const perp = w.angle + Math.PI / 2;
          const offset = (Math.random() - 0.5) * w.crestWidth * 0.85;
          this.pushParticle({
            x: w.x + Math.cos(perp) * offset,
            y: w.y + Math.sin(perp) * offset,
            vx: -w.vx * 0.08 + (Math.random() - 0.5) * 18,
            vy: -w.vy * 0.08 + (Math.random() - 0.5) * 18,
            size: isMonsoon ? 2.8 + Math.random() * 3.2 : 2 + Math.random() * 2.8,
            life: 0,
            maxLife: isMonsoon ? 0.7 : 0.44,
            color: isMonsoon ? '#5dfaff' : '#e6ffff',
            alpha: isMonsoon ? 0.76 : 0.52,
            kind: isMonsoon ? 'biolum' : 'foam',
            drag: 0.94,
          });
        }

        const shore = getShoreX(w.y);
        if (w.x < shore + 8) {
          this.shoreSplash = Math.min(1, this.shoreSplash + 0.35 + w.charge * 0.4);
          this.audio.playShoreSplash(0.45 + w.charge * 0.65, this.audio.worldXToPan(shore, WORLD_W));
          this.checkShoreFireSplash(w);
          for (let s = 0; s < 6; s++) {
            this.pushParticle({
              x: shore + 4,
              y: w.y + (Math.random() - 0.5) * w.crestWidth * 0.65,
              vx: 28 + Math.random() * 55,
              vy: (Math.random() - 0.5) * 70,
              size: 3 + Math.random() * 3,
              life: 0,
              maxLife: 0.4 + Math.random() * 0.3,
              color: isMonsoon ? '#8efaff' : '#ffffff',
              alpha: 0.85,
              kind: 'foam',
              drag: 0.9,
            });
          }
          if (w.x < shore - (18 + w.charge * 36)) {
            this.waves.splice(i, 1);
            continue;
          }
        }
      }

      if (w.kind !== 'buoy_pulse') {
        for (const buoy of this.aiBuoys) {
          if (buoy.cooldown <= 0 && !w.triggeredBuoys.has(buoy.id)) {
            const d = Math.hypot(w.x - buoy.x, w.y - buoy.y);
            const hitDist = isCircle ? Math.abs(d - w.radius) < 28 : d < w.crestWidth * 0.55 + 24;
            if (hitDist) {
              w.triggeredBuoys.add(buoy.id);
              buoy.cooldown = 1.15;
              buoy.pulseTimer = 0.65;
              newBuoyPulses.push({ x: buoy.x, y: buoy.y });
            }
          }
        }
      }

      if (stats.resonanceLevel > 0 && w.kind !== 'resonance' && this.resonanceCooldown <= 0 && newResonances.length === 0) {
        for (let j = i - 1; j >= 0; j--) {
          const other = this.waves[j];
          if (other.kind === 'resonance' || w.resonatedWith.has(other.id)) continue;
          // Echoes from the same sweep should not endlessly self-detonate; cross waves or hit a buoy!
          if (w.isEcho && other.isEcho) continue;
          if (w.age < 0.1 || other.age < 0.1) continue;

          const dist = Math.hypot(w.x - other.x, w.y - other.y);
          const touchDist =
            (w.kind === 'ripple' || w.kind === 'buoy_pulse' ? w.radius : w.crestWidth * 0.46) +
            (other.kind === 'ripple' || other.kind === 'buoy_pulse'
              ? other.radius
              : other.crestWidth * 0.46);

          if (dist < touchDist * 0.82 && dist > 18) {
            w.resonatedWith.add(other.id);
            other.resonatedWith.add(w.id);
            newResonances.push({
              x: (w.x + other.x) * 0.5,
              y: (w.y + other.y) * 0.5,
            });
            break;
          }
        }
      }

      this.applyWaveToEntities(w, dt, progress, stats);
    }

    for (const bp of newBuoyPulses) {
      this.spawnWaveInternal('buoy_pulse', bp.x, bp.y, 0, 0.35, stats, 0.95, 1.0);
      this.audio.playWaveLaunch(0.35, true, this.audio.worldXToPan(bp.x, WORLD_W));
    }

    for (const res of newResonances) {
      this.resonanceCooldown = 0.52;
      this.spawnWaveInternal('resonance', res.x, res.y, 0, 1.0, stats, 1.25, 1.25);
      progress.totalResonances += 1;
      this.hitstopTimer = 0.024;
      this.screenShake = Math.max(this.screenShake, 9.5);
      this.flashAlpha = Math.max(this.flashAlpha, 0.2);
      this.audio.playResonanceBurst(this.audio.worldXToPan(res.x, WORLD_W));
      this.text(res.x, res.y - 24, 'RESONANSI!', '#ffe07d', 1.2);
    }
  }

  private checkShoreFireSplash(w: Wave): void {
    for (const e of this.entities) {
      if (e.kind !== 'fire') continue;
      const dist = Math.hypot(e.x - w.x, e.y - w.y);
      if (dist < w.crestWidth * 0.65 + 48) {
        const lastHit = w.hitMap.get(e.id) ?? -1;
        if (w.age - lastHit < 0.22) continue;
        w.hitMap.set(e.id, w.age);
        this.damageFire(e, w.power * (1 + w.charge * 1.15));
        return;
      }
    }
  }

  private damageFire(e: Entity, amount: number): void {
    e.hp -= amount;
    e.hitFlash = 0.22;
    for (let k = 0; k < 10; k++) {
      this.pushParticle({
        x: e.x + (Math.random() - 0.5) * 20,
        y: e.y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 65,
        vy: -40 - Math.random() * 60,
        size: 5 + Math.random() * 6,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.35,
        color: '#e5f5f7',
        alpha: 0.72,
        kind: 'smoke',
        drag: 0.95,
      });
    }
    if (e.hp <= 0) {
      this.audio.playFireDouse(this.audio.worldXToPan(e.x, WORLD_W));
      this.shake(7);
      if (this.story.run instanceof FireJob) this.story.run.douse(e);
      else this.remove(e.id);
    }
  }

  private applyWaveToEntities(
    w: Wave,
    dt: number,
    progress: PlayerProgress,
    stats: ComputedStats
  ): void {
    const isCircle = w.kind === 'ripple' || w.kind === 'resonance' || w.kind === 'buoy_pulse';
    const lifeFade = Math.max(0.25, 1 - (w.age / w.maxAge) * 0.68);
    const cosA = Math.cos(w.angle);
    const sinA = Math.sin(w.angle);

    for (let idx = this.entities.length - 1; idx >= 0; idx--) {
      const e = this.entities[idx];
      const dx = e.x - w.x;
      const dy = e.y - w.y;

      let hit = false;
      let pushX = 0;
      let pushY = 0;

      if (isCircle) {
        const dist = Math.hypot(dx, dy) || 1;
        const ringBand = w.kind === 'resonance' ? 48 : 30;
        if (Math.abs(dist - w.radius) < ringBand + e.radius) {
          hit = true;
          pushX = dx / dist;
          pushY = dy / dist;
        }
      } else {
        const forward = dx * cosA + dy * sinA;
        const lateral = -dx * sinA + dy * cosA;
        const halfW = w.crestWidth * 0.54 + e.radius;
        if (forward > -28 - e.radius && forward < 34 + e.radius && Math.abs(lateral) < halfW) {
          hit = true;
          const curve = (lateral / Math.max(1, halfW)) * 0.22;
          pushX = cosA - sinA * curve;
          pushY = sinA + cosA * curve;
          const len = Math.hypot(pushX, pushY) || 1;
          pushX /= len;
          pushY /= len;
        }
      }

      if (!hit) continue;

      if (e.kind === 'fire') {
        const lastHit = w.hitMap.get(e.id) ?? -1;
        if (w.age - lastHit >= 0.2) {
          w.hitMap.set(e.id, w.age);
          this.damageFire(e, w.power * (w.kind === 'resonance' ? 1.8 : 1 + w.charge));
          idx = Math.min(idx, this.entities.length);
        }
        continue;
      }

      if (this.story.owns(e.kind) && this.story.hit(e, w, pushX, pushY) === 'hold') {
        // whatever that set off may have taken things out of the water
        idx = Math.min(idx, this.entities.length);
        continue;
      }

      if (e.snagged) e.snagged = false;

      // Arus Pemandu bends the push towards where the thing belongs
      let finalDirX = pushX;
      let finalDirY = pushY;

      if (stats.aiGuideStrength > 0) {
        let targetX: number | null = null;
        let targetY: number | null = null;

        if (isTrashKind(e.kind)) {
          targetX = COLLECTOR_NET.x - 10;
          targetY = COLLECTOR_NET.y;
        } else if (e.kind === 'mangrove_seed') {
          const slot = this.findNearestOpenMangroveSlot(e.x, e.y, progress);
          targetX = slot.x;
          targetY = slot.y;
        } else {
          const t = this.story.guideTarget(e);
          if (t) {
            targetX = t.x;
            targetY = t.y;
          }
        }

        if (targetX !== null && targetY !== null) {
          const tdx = targetX - e.x;
          const tdy = targetY - e.y;
          const td = Math.hypot(tdx, tdy) || 1;
          const blend = Math.min(0.88, 0.28 + stats.aiGuideStrength * 0.34);
          finalDirX = pushX * (1 - blend) + (tdx / td) * blend;
          finalDirY = pushY * (1 - blend) + (tdy / td) * blend;
          const flen = Math.hypot(finalDirX, finalDirY) || 1;
          finalDirX /= flen;
          finalDirY /= flen;
          e.aiGuidedTimer = 0.85;
        }
      }

      const forceMag = (w.power * 620 * lifeFade) / e.mass;
      e.vx += finalDirX * forceMag * dt * 2.8;
      e.vy += finalDirY * forceMag * dt * 2.8;
      e.angVel += (Math.random() - 0.5) * 2.2 * dt;

      if (!w.hitMap.has(e.id)) {
        w.hitMap.set(e.id, w.age);
        const kick = (108 + w.power * 76) / e.mass;
        e.vx += finalDirX * kick;
        e.vy += finalDirY * kick;
        e.hitFlash = 0.14;
        if (isTrashKind(e.kind) || e.kind === 'mangrove_seed') {
          const hard = lifeFade * (0.55 + w.charge * 0.7) * (w.isEcho ? 0.6 : 1);
          this.audio.playWaveHit(hard, e.mass, this.audio.worldXToPan(e.x, WORLD_W));
          this.kickSpray(e.x, e.y, finalDirX, finalDirY, 3 + Math.round(w.charge * 4));
        }
      }
    }
  }

  private updateEntities(dt: number, progress: PlayerProgress, stats: ComputedStats): void {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.age += dt;
      e.bobPhase += dt * 3.1;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.aiGuidedTimer = Math.max(0, e.aiGuidedTimer - dt);

      if (this.story.owns(e.kind)) {
        this.story.move(e, dt);
        i = Math.min(i, this.entities.length);
        continue;
      }

      if (e.kind === 'fire') {
        if (Math.random() < 0.32) {
          this.pushParticle({
            x: e.x + (Math.random() - 0.5) * 18,
            y: e.y + (Math.random() - 0.5) * 14,
            vx: (Math.random() - 0.5) * 18,
            vy: -26 - Math.random() * 34,
            size: 2.5 + Math.random() * 3,
            life: 0,
            maxLife: 0.55 + Math.random() * 0.3,
            color: Math.random() < 0.5 ? '#ffae42' : '#ff5b3b',
            alpha: 0.9,
            kind: 'ember',
            drag: 0.98,
          });
        }
        continue;
      }

      // Shimmering sparkles on Epic & Legendary salvage!
      if ((e.rarity === 'epic' || e.rarity === 'legendary') && Math.random() < (e.rarity === 'legendary' ? 0.34 : 0.15)) {
        this.pushParticle({
          x: e.x + (Math.random() - 0.5) * 20,
          y: e.y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 18,
          vy: -16 - Math.random() * 20,
          size: e.rarity === 'legendary' ? 3.2 : 2.3,
          life: 0,
          maxLife: 0.55,
          color: e.rarity === 'legendary' ? (Math.random() < 0.5 ? '#ffe388' : '#ff9ee8') : '#ffd873',
          alpha: 0.9,
          kind: 'spark',
          drag: 0.96,
        });
      }

      if (e.snagged || e.stranded) {
        // caught on weed, or washed up: it stays until a wave fetches it
        if (e.stranded && Math.hypot(e.vx, e.vy) > 26) e.stranded = false;
        else {
          e.vx = 0;
          e.vy = 0;
          e.angVel = 0;
          continue;
        }
      }

      if (isTrashKind(e.kind)) {
        e.vx += (-11 + Math.sin(this.time + e.bobPhase) * 6) * dt;
        e.vy += Math.cos(this.time * 0.8 + e.bobPhase) * 8 * dt;

        const ndx = COLLECTOR_NET.x - e.x;
        const ndy = COLLECTOR_NET.y - e.y;
        const ndist = Math.hypot(ndx, ndy);
        const pullRange = stats.netRadius + 55 + stats.netPull * 1.85;
        if (!this.netClosed && ndist < pullRange && ndist > 1) {
          const pullStrength = (1 - ndist / pullRange) * (62 + stats.netPull * 3.3);
          e.vx += (ndx / ndist) * pullStrength * dt;
          e.vy += (ndy / ndist) * pullStrength * dt;
        }

        if (!this.netClosed && e.aiGuidedTimer > 0 && stats.aiGuideStrength > 0 && ndist > 1) {
          const assist = 68 * stats.aiGuideStrength;
          e.vx += (ndx / ndist) * assist * dt;
          e.vy += (ndy / ndist) * assist * dt;
        }
      } else if (e.kind === 'mangrove_seed') {
        e.vx += -8 * dt;
        if (e.aiGuidedTimer > 0 && stats.aiGuideStrength > 0) {
          const slot = this.findNearestOpenMangroveSlot(e.x, e.y, progress);
          const sdx = slot.x - e.x;
          const sdy = slot.y - e.y;
          const sd = Math.hypot(sdx, sdy) || 1;
          e.vx += (sdx / sd) * 60 * stats.aiGuideStrength * dt;
          e.vy += (sdy / sd) * 60 * stats.aiGuideStrength * dt;
        }
      }

      this.drift(e, dt, 0.962, 450);

      // ===== GOAL CHECKS =====
      if (isTrashKind(e.kind) && !this.netClosed) {
        const dNet = Math.hypot(e.x - COLLECTOR_NET.x, e.y - COLLECTOR_NET.y);
        if (dNet < stats.netRadius + e.radius * 0.55) {
          this.entities.splice(i, 1);
          this.catchTrash(e, progress, stats);
          continue;
        }
      }

      const shore = getShoreX(e.y);
      if (e.kind === 'mangrove_seed' && e.x <= shore + 20) {
        this.entities.splice(i, 1);
        this.plantPermanentMangrove(e.x, e.y, progress);
        this.story.planted();
        this.text(shore + 8, e.y - 14, 'MANGROVE TUMBUH!', '#5ef29e', 1.05);
        this.audio.playMangrovePlant(this.audio.worldXToPan(shore, WORLD_W));
        // new trees, and the birds come straight back to them
        this.audio.playBirdBurst(0.8);
        this.burst(shore + 6, e.y, '#5ef29e', 16, 'leaf');
        continue;
      }

      if (e.x < shore + e.radius + 4) {
        e.x = shore + e.radius + 4;
        const reach = stats.netRadius + 55 + stats.netPull * 1.85;
        const near = Math.hypot(e.x - COLLECTOR_NET.x, e.y - COLLECTOR_NET.y) < reach;
        const rooted = progress.mangroves.some((m) => Math.hypot(m.x - e.x, m.y - e.y) < 48);
        e.actionTimer += 1;
        // the second time the same piece reaches the sand it stays there, unless the net or roots have it
        if (isTrashKind(e.kind) && e.actionTimer >= 2 && !near && !rooted) {
          this.story.strand(e);
          continue;
        }
        e.vx = Math.abs(e.vx) * 0.45 + 14;
        if (isTrashKind(e.kind)) {
          const towardNetY = COLLECTOR_NET.y - e.y;
          e.vy += Math.sign(towardNetY) * (rooted ? 46 : 28);
        }
      }
    }
  }

  /** Lets a thing coast: water drag, the edges of the lagoon and the rocks in it. */
  public drift(e: Entity, dt: number, drag: number, maxSpeed: number): void {
    const damp = Math.pow(drag, dt * 60);
    e.vx *= damp;
    e.vy *= damp;
    const spd = Math.hypot(e.vx, e.vy);
    if (spd > maxSpeed) {
      e.vx = (e.vx / spd) * maxSpeed;
      e.vy = (e.vy / spd) * maxSpeed;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.rotation += e.angVel * dt;
    e.angVel *= 0.94;

    if (e.y < 42) {
      e.y = 42;
      e.vy = Math.abs(e.vy) * 0.6;
    } else if (e.y > WORLD_H - 42) {
      e.y = WORLD_H - 42;
      e.vy = -Math.abs(e.vy) * 0.6;
    }
    if (e.x > WORLD_W - 24) {
      e.x = WORLD_W - 24;
      e.vx = -Math.abs(e.vx) * 0.5;
    }
    if (this.story.owns(e.kind)) {
      const shore = getShoreX(e.y) + e.radius + 4;
      if (e.x < shore) {
        e.x = shore;
        e.vx = Math.abs(e.vx) * 0.4;
      }
    }
    for (const rock of SEA_ROCKS) {
      const rdx = e.x - rock.x;
      const rdy = e.y - rock.y;
      const rdist = Math.hypot(rdx, rdy);
      const minD = rock.r + e.radius;
      if (rdist < minD && rdist > 0.01) {
        const nx = rdx / rdist;
        const ny = rdy / rdist;
        e.x = rock.x + nx * minD;
        e.y = rock.y + ny * minD;
        const dot = e.vx * nx + e.vy * ny;
        if (dot < 0) {
          e.vx -= 1.65 * dot * nx;
          e.vy -= 1.65 * dot * ny;
        }
      }
    }
  }

  private catchTrash(e: Entity, progress: PlayerProgress, stats: ComputedStats): void {
    this.incrementCombo(stats);
    const rarity = e.rarity ?? 'common';
    const color =
      rarity === 'legendary'
        ? '#ffb8f0'
        : rarity === 'epic'
          ? '#ffe07d'
          : rarity === 'rare'
            ? '#7ff7ff'
            : rarity === 'uncommon'
              ? '#7ff0b6'
              : '#b4fbf4';
    const label =
      rarity === 'legendary' ? 'RELIK!' : rarity === 'epic' ? 'BATERAI!' : rarity === 'rare' ? 'PETI!' : undefined;
    this.story.collected(e);
    const comboMult = 1 + Math.min(0.5, Math.floor(this.comboCount / 3) * 0.1);
    const pay = Math.round(e.value * comboMult);
    this.award(
      pay,
      COLLECTOR_NET.x + 12 + (Math.random() - 0.5) * 18,
      COLLECTOR_NET.y - 12 + (Math.random() - 0.5) * 16,
      label,
      color
    );
    progress.totalTrash += 1;
    if (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary') progress.totalRareTrash += 1;
    this.netPulse = 1;
    if (rarity === 'legendary') {
      this.shake(7.5);
      this.flashAlpha = Math.max(this.flashAlpha, 0.16);
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.07);
    } else if (rarity === 'epic') {
      this.shake(4);
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.03);
    }
    this.audio.playTrashCollect(this.comboCount, rarity, this.audio.worldXToPan(COLLECTOR_NET.x, WORLD_W));
    this.burst(COLLECTOR_NET.x, COLLECTOR_NET.y, color, rarity === 'legendary' ? 22 : rarity === 'epic' ? 14 : 8);
  }

  private plantPermanentMangrove(x: number, y: number, progress: PlayerProgress): void {
    if (progress.mangroves.length >= 22) return;
    const slot = this.findNearestOpenMangroveSlot(x, y, progress);
    progress.mangroves.push({
      x: slot.x + (Math.random() - 0.5) * 14,
      y: slot.y + (Math.random() - 0.5) * 12,
      scale: 0.1,
      targetScale: 0.85 + Math.random() * 0.35,
      swayOffset: Math.random() * Math.PI * 2,
      seed: Math.random() * 100,
    });
  }

  private findNearestOpenMangroveSlot(x: number, y: number, progress: PlayerProgress): { x: number; y: number } {
    let best = MANGROVE_SLOTS[0];
    let bestScore = Infinity;
    for (const slot of MANGROVE_SLOTS) {
      const occupied = progress.mangroves.some((m) => Math.hypot(m.x - slot.x, m.y - slot.y) < 30);
      const dist = Math.hypot(slot.x - x, slot.y - y) + (occupied ? 500 : 0);
      if (dist < bestScore) {
        bestScore = dist;
        best = slot;
      }
    }
    return best;
  }

  private incrementCombo(stats: ComputedStats): void {
    this.comboCount += 1;
    this.comboTimer = COMBO_WINDOW;
    if (stats.comboEnergyReturn > 0) {
      this.energy = Math.min(stats.maxEnergy, this.energy + stats.comboEnergyReturn);
    }
    if (this.comboCount >= 5 && this.comboCount % 5 === 0) {
      // every fifth in a row: coins spill, the net flares and the world catches its breath
      this.audio.playComboMilestone(this.comboCount);
      this.text(COLLECTOR_NET.x + 8, COLLECTOR_NET.y - 84, `KOMBO ×${this.comboCount}!`, this.comboCount >= 20 ? '#d9a8ff' : this.comboCount >= 10 ? '#ff9b8a' : '#ffe07d', 1.45);
      this.burst(COLLECTOR_NET.x, COLLECTOR_NET.y, '#ffe07d', 16, 'spark');
      this.shake(3.5);
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.035);
    }
  }

  /** Pays out, and says so in the water. */
  public award(amount: number, x: number, y: number, subtext: string | undefined, color: string): void {
    this.progress.coins += amount;
    this.progress.totalCoinsEarned += amount;
    this.text(x, y, `+${amount}`, color, subtext ? 1.15 : 0.94, subtext);
    this.hooks.coins(amount, x, y);
  }

  /** Puts a thing in the water. */
  public add(kind: EntityKind, x: number, y: number, over: Partial<Entity> = {}): Entity {
    const e: Entity = {
      id: this.nextId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 20,
      mass: 1,
      hp: 1,
      maxHp: 1,
      value: 0,
      age: 0,
      rotation: 0,
      angVel: 0,
      bobPhase: Math.random() * Math.PI * 2,
      aiGuidedTimer: 0,
      hitFlash: 0,
      variant: 0,
      actionTimer: 0,
      ...over,
    };
    this.entities.push(e);
    return e;
  }

  public find(id: number): Entity | undefined {
    return this.entities.find((e) => e.id === id);
  }

  /** A piece of salvage, in the water. Anyone bringing new ones asks the story's tide first. */
  public addTrash(kind: EntityKind, x: number, y: number, variant?: number): Entity {
    const e = this.createTrash(kind, x, y, variant);
    this.entities.push(e);
    return e;
  }

  /** A piece of salvage, ready to go in the water but not in it yet: the caller decides when it lands. */
  public createTrash(kind: EntityKind, x: number, y: number, variant?: number): Entity {
    const [rarity, radius, mass] = TRASH_BODY[kind] ?? TRASH_BODY.trash_bottle!;
    return {
      id: this.nextId++,
      kind,
      rarity,
      x: Math.min(WORLD_W - 30, Math.max(getShoreX(y) + radius + 4, x)),
      y,
      vx: -20 - Math.random() * 26,
      vy: (Math.random() - 0.5) * 20,
      radius,
      mass,
      hp: 1,
      maxHp: 1,
      value: SALVAGE_VALUE[kind] ?? 0,
      age: 0,
      rotation: Math.random() * Math.PI * 2,
      angVel: (Math.random() - 0.5) * 1.4,
      bobPhase: Math.random() * Math.PI * 2,
      aiGuidedTimer: 0,
      hitFlash: 0,
      variant: variant ?? Math.floor(Math.random() * 3),
      actionTimer: 0,
    };
  }

  public addSeed(x: number, y: number): Entity {
    return this.add('mangrove_seed', Math.max(getShoreX(y) + 60, x), y, {
      vx: -10,
      vy: (Math.random() - 0.5) * 12,
      radius: 13,
      mass: 0.78,
      rotation: Math.random() * Math.PI * 2,
      angVel: (Math.random() - 0.5) * 1.1,
    });
  }

  public getBossEntity(): Entity | undefined {
    return this.entities.find((e) => e.kind === 'trawler' && e.tag !== 'leaving');
  }

  public shake(amount: number): void {
    this.screenShake = Math.max(this.screenShake, amount);
  }

  public remove(id: number): void {
    const idx = this.entities.findIndex((e) => e.id === id);
    if (idx !== -1) this.entities.splice(idx, 1);
  }

  private pushParticle(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) {
      this.particles.shift();
    }
    this.particles.push(p);
  }

  /** Droplets thrown on in the direction something was struck. */
  private kickSpray(x: number, y: number, dx: number, dy: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.1;
      const spd = 70 + Math.random() * 120;
      this.pushParticle({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: 2.2 + Math.random() * 2.8,
        life: 0,
        maxLife: 0.32 + Math.random() * 0.25,
        color: '#e8ffff',
        alpha: 0.9,
        kind: 'foam',
        drag: 0.9,
      });
    }
  }

  public burst(
    x: number,
    y: number,
    color: string,
    count: number,
    kind: Particle['kind'] = 'spark'
  ): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 55 + Math.random() * 145;
      this.pushParticle({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: 3 + Math.random() * 4,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.4,
        color,
        alpha: 0.95,
        kind,
        drag: 0.92,
      });
    }
  }

  public text(
    x: number,
    y: number,
    text: string,
    color: string,
    scale = 1,
    subtext?: string
  ): void {
    if (this.floatingTexts.length >= MAX_FLOATING_TEXTS) {
      this.floatingTexts.shift();
    }
    this.floatingTexts.push({
      x,
      y,
      vy: -48,
      text,
      subtext,
      color,
      scale,
      life: 0,
      maxLife: subtext ? 1.35 : 0.9,
    });
  }

  private updateAmbientFish(dt: number): void {
    for (const f of this.ambientFish) {
      f.phase += dt * (f.kind === 'manta' ? 2.4 : 6.2);

      for (const w of this.waves) {
        const dx = f.x - w.x;
        const dy = f.y - w.y;
        const d = Math.hypot(dx, dy);
        if (d < 110 && d > 1) {
          f.vx += (dx / d) * 140 * dt;
          f.vy += (dy / d) * 140 * dt;
        }
      }

      const spd = Math.hypot(f.vx, f.vy) || 1;
      const targetSpd = f.kind === 'manta' ? 28 : 34;
      const newSpd = spd + (targetSpd - spd) * Math.min(1, dt * 2.2);
      f.vx = (f.vx / spd) * newSpd;
      f.vy = (f.vy / spd) * newSpd;

      f.x += f.vx * dt;
      f.y += f.vy * dt;

      const shore = getShoreX(f.y) + 60;
      if (f.x < shore) {
        f.x = shore;
        f.vx = Math.abs(f.vx);
      } else if (f.x > WORLD_W - 24) {
        f.x = WORLD_W - 24;
        f.vx = -Math.abs(f.vx);
      }
      if (f.y < 54) {
        f.y = 54;
        f.vy = Math.abs(f.vy);
      } else if (f.y > WORLD_H - 54) {
        f.y = WORLD_H - 54;
        f.vy = -Math.abs(f.vy);
      }
    }
  }

  private updateRain(dt: number): void {
    for (const r of this.rainDrops) {
      r.x -= r.speed * 0.28 * dt;
      r.y += r.speed * dt;
      if (r.y > WORLD_H + 30 || r.x < -30) {
        r.x = Math.random() * (WORLD_W + 220);
        r.y = -20 - Math.random() * 80;
        if (Math.random() < 0.08) {
          this.pushParticle({
            x: 320 + Math.random() * (WORLD_W - 360),
            y: 40 + Math.random() * (WORLD_H - 80),
            vx: 0,
            vy: 0,
            size: 6,
            life: 0,
            maxLife: 0.55,
            color: '#6bf6ff',
            alpha: 0.3,
            kind: 'ring',
            drag: 1,
          });
        }
      }
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      if (p.kind === 'ring') {
        p.size += dt * 42;
      } else {
        const damp = Math.pow(p.drag, dt * 60);
        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
  }

  private updateFloatingTexts(dt: number): void {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y += ft.vy * dt;
      ft.vy *= 0.94;
    }
  }
}
