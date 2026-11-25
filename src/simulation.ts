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
import { TropicalAudio } from './audio';
import {
  AI_BUOY_SLOTS,
  COLLECTOR_NET,
  DOLPHIN_SPOT,
  FIRE_SPOTS,
  getShoreX,
  MANGROVE_SLOTS,
  SEA_ROCKS,
  VILLAGE_PIER,
  WORLD_H,
  WORLD_W,
} from './world';

export interface RadioCallback {
  (sender: string, text: string): void;
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

const MAX_PARTICLES = 260;
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
  public comboMult = 1;

  public screenShake = 0;
  public hitstopTimer = 0;
  public netPulse = 0;
  public flashAlpha = 0;
  public shoreSplash = 0;

  public bossActive = false;
  public lagoonInitialized = false;

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
  private spawnTimer = 0.6;
  private mangroveTimer = 3.2;
  private boatTimer = 6.5;
  private fireTimer = 7.5;
  private oilTimer = 8.5;
  private ambientRippleTimer = 0;

  private audio: TropicalAudio;
  private onRadio: RadioCallback;
  private onVictory: () => void;
  private onCoinsChanged: () => void;

  constructor(
    audio: TropicalAudio,
    onRadio: RadioCallback,
    onVictory: () => void,
    onCoinsChanged: () => void
  ) {
    this.audio = audio;
    this.onRadio = onRadio;
    this.onVictory = onVictory;
    this.onCoinsChanged = onCoinsChanged;
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

  public getTimeOfDay(progress: PlayerProgress, stats: ComputedStats): TimeOfDay {
    if (this.bossActive) return 'monsoon';
    if (progress.victoryAchieved) return 'dawn';
    if (stats.bossUnlocked) return 'monsoon';
    if (stats.ecoPercent < 28) return 'morning';
    if (stats.ecoPercent < 52) return 'noon';
    if (stats.ecoPercent < 76) return 'sunset';
    return 'monsoon';
  }

  /** How much trash a fresh lagoon starts with. */
  public startingTrashCount(stats: ComputedStats): number {
    return Math.min(stats.maxTrashCount, Math.max(9, Math.round(stats.maxTrashCount * 0.65)));
  }

  /**
   * Initializes or resets the continuous tropical lagoon session.
   * `clean` leaves the water empty and A.L.U.N. silent, for the opening that puts the trash there itself.
   */
  public initLagoon(progress: PlayerProgress, stats: ComputedStats, clean = false): void {
    this.waves = [];
    this.entities = [];
    this.particles = [];
    this.floatingTexts = [];
    this.pendingEchoes = [];
    this.lagoonInitialized = true;

    this.maxEnergy = stats.maxEnergy;
    this.energy = stats.maxEnergy;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.comboMult = 1;
    this.screenShake = 0;
    this.hitstopTimer = 0;
    this.bossActive = false;
    this.drag.active = false;

    this.syncAiBuoys(stats);

    // Populate a rich, welcoming starting lagoon!
    const initCount = clean ? 0 : this.startingTrashCount(stats);
    for (let i = 0; i < initCount; i++) {
      this.spawnSingleTrash(stats, true);
    }
    if (stats.mangroveLevel > 0) {
      this.spawnMangroveSeed(true);
    }
    if (stats.bossUnlocked && !progress.victoryAchieved) {
      this.spawnTrawler();
    }

    const tod = this.getTimeOfDay(progress, stats);
    this.audio.setStormAmbience(tod === 'monsoon' ? 1 : 0);

    if (!clean) this.greet(progress);
  }

  /** A.L.U.N.'s first words on the radio: how to play, for anyone who has not opened Kalibrasi yet. */
  public greet(progress: PlayerProgress): void {
    if (!progress.shopUnlocked) {
      this.onRadio(
        'A.L.U.N. · SISTEM AKTIF',
        'Geser di air untuk menyapu limbah ke Jaring Desa. Kumpulkan 20 Koin untuk membuka Kalibrasi!'
      );
    }
  }

  /**
   * What floats while nobody is playing yet: trash bobs and slows to a stop where it fell, and nothing
   * is pulled into the net or paid out. Used under the opening.
   */
  public drift(dt: number): void {
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
  public onUpgradePurchased(id: UpgradeId, progress: PlayerProgress, stats: ComputedStats): void {
    const prevMax = this.maxEnergy;
    this.maxEnergy = stats.maxEnergy;
    if (this.maxEnergy > prevMax) {
      this.energy = Math.min(this.maxEnergy, this.energy + (this.maxEnergy - prevMax));
    }

    this.syncAiBuoys(stats);

    // Instant juicy world payoff for supply & ecosystem upgrades!
    if (id === 'trash_density') {
      const burst = Math.min(8, stats.trashClusterMax + 2);
      for (let i = 0; i < burst; i++) {
        this.spawnSingleTrash(stats, false);
      }
      this.spawnTimer = 0.2;
    } else if (id === 'trash_rarity') {
      const lv = stats.trashRarityLevel;
      const guaranteed: TrashRarity =
        lv === 1 ? 'rare' : lv === 2 ? 'epic' : 'legendary';
      this.spawnSingleTrash(stats, true, guaranteed);
      this.spawnSingleTrash(stats, true, lv >= 2 ? 'rare' : 'uncommon');
    } else if (id === 'unlock_mangrove') {
      this.spawnMangroveSeed(true);
      if (progress.mangroves.length === 0) {
        this.onRadio(
          'BU SARI · WARGA PESISIR',
          'Biji mangrove hijau mulai mengapung! Sapukan ke pantai kiri agar tumbuh Pohon Mangrove permanen!'
        );
      }
    } else if (id === 'unlock_boats') {
      this.spawnBoat();
    } else if (id === 'unlock_forest') {
      this.spawnFire();
      this.spawnOil();
      this.onRadio(
        'PENJAGA RIMBA',
        'Titik api muncul dekat Bunga Rafflesia! Tahan ombak pasang besar ke pantai untuk memadamkannya!'
      );
    } else if (id === 'unlock_boss' && !this.bossActive && !progress.victoryAchieved) {
      this.spawnTrawler();
      this.audio.setStormAmbience(1);
      this.onRadio(
        'A.L.U.N. · BADAI MUSON',
        'Kapal Limbah Ilegal memasuki laguna! Hantam dengan Ombak Raksasa & Resonansi hingga terusir!'
      );
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

    if (this.getTimeOfDay(progress, stats) === 'monsoon') {
      this.updateRain(dt);
    }
  }

  public update(dt: number, progress: PlayerProgress, stats: ComputedStats): void {
    this.time += dt;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.screenShake = Math.max(0, this.screenShake - dt * 18);
      return;
    }

    const tod = this.getTimeOfDay(progress, stats);
    this.audio.setStormAmbience(tod === 'monsoon' ? 1 : 0);
    if (tod === 'monsoon') {
      this.updateRain(dt);
    }

    this.maxEnergy = stats.maxEnergy;
    this.energy = Math.min(stats.maxEnergy, this.energy + stats.energyRegen * dt);
    this.screenShake = Math.max(0, this.screenShake - dt * 28);
    this.netPulse = Math.max(0, this.netPulse - dt * 4);
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.5);
    this.shoreSplash = Math.max(0, this.shoreSplash - dt * 2.4);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.comboMult = 1;
      }
    }

    if (this.drag.active) {
      this.drag.holdTime += dt;
      const chargeSpeed = stats.chargeUnlocked ? 1.15 : 0.7;
      const maxCap = stats.chargeUnlocked ? 1.0 : 0.45;
      this.drag.charge = Math.min(maxCap, Math.max(0, (this.drag.holdTime - 0.08) * chargeSpeed));
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
        this.audio.playWaveLaunch(pe.charge * 0.65, true);
      }
    }

    this.handleSpawns(dt, stats);

    for (const buoy of this.aiBuoys) {
      buoy.bobPhase += dt * 2.5;
      buoy.pulseTimer = Math.max(0, buoy.pulseTimer - dt);
      buoy.cooldown = Math.max(0, buoy.cooldown - dt);
    }

    this.updateWaves(dt, progress, stats, tod === 'monsoon');
    this.updateEntities(dt, progress, stats);
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
    const cost = stats.baseWaveCost * (1 + charge * 0.72);
    if (this.energy < Math.min(8, cost * 0.45)) {
      this.spawnFloatingText(startX, startY - 12, 'Energi rendah!', '#f6b96a', 0.85);
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
    this.audio.playWaveLaunch(effectiveCharge, false);
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
          this.checkShoreFireSplash(w, progress, stats);
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

      if (stats.resonanceLevel > 0 && w.kind !== 'resonance') {
        for (let j = i - 1; j >= 0; j--) {
          const other = this.waves[j];
          if (other.kind === 'resonance' || w.resonatedWith.has(other.id)) continue;
          if (w.age < 0.1 || other.age < 0.1) continue;

          const dist = Math.hypot(w.x - other.x, w.y - other.y);
          const touchDist =
            (w.kind === 'ripple' || w.kind === 'buoy_pulse' ? w.radius : w.crestWidth * 0.46) +
            (other.kind === 'ripple' || other.kind === 'buoy_pulse'
              ? other.radius
              : other.crestWidth * 0.46);

          if (dist < touchDist * 0.85 && dist > 14) {
            w.resonatedWith.add(other.id);
            other.resonatedWith.add(w.id);
            newResonances.push({
              x: (w.x + other.x) * 0.5,
              y: (w.y + other.y) * 0.5,
            });
          }
        }
      }

      this.applyWaveToEntities(w, dt, progress, stats);
    }

    for (const bp of newBuoyPulses) {
      this.spawnWaveInternal('buoy_pulse', bp.x, bp.y, 0, 0.35, stats, 0.95, 1.0);
      this.audio.playWaveLaunch(0.35, true);
    }

    for (const res of newResonances) {
      this.spawnWaveInternal('resonance', res.x, res.y, 0, 1.0, stats, 1.25, 1.25);
      progress.totalResonances += 1;
      this.hitstopTimer = 0.032;
      this.screenShake = Math.max(this.screenShake, 10.5);
      this.flashAlpha = Math.max(this.flashAlpha, 0.22);
      this.audio.playResonanceBurst();
      this.spawnFloatingText(res.x, res.y - 24, 'RESONANSI!', '#ffe07d', 1.2);
    }
  }

  private checkShoreFireSplash(w: Wave, progress: PlayerProgress, stats: ComputedStats): void {
    for (const e of this.entities) {
      if (e.kind !== 'fire') continue;
      const dist = Math.hypot(e.x - w.x, e.y - w.y);
      if (dist < w.crestWidth * 0.65 + 48) {
        const lastHit = w.hitMap.get(e.id) ?? -1;
        if (w.age - lastHit < 0.22) continue;
        w.hitMap.set(e.id, w.age);

        const splashDmg = w.power * (1 + w.charge * 1.15);
        if (splashDmg < 1.1) {
          this.spawnFloatingText(e.x, e.y - 18, 'Perlu Ombak Lebih Kuat!', '#ff9b6a', 0.82);
          continue;
        }
        this.damageFire(e, splashDmg, progress, stats);
      }
    }
  }

  private damageFire(e: Entity, amount: number, progress: PlayerProgress, stats: ComputedStats): void {
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
      this.removeEntity(e.id);
      const reward = Math.round((170 + stats.forestLevel * 95) * stats.coinMultiplier * this.comboMult);
      this.awardCoins(reward, e.x, e.y, 'API PADAM!', '#7bf5a8', progress);
      progress.totalFires += 1;
      this.audio.playFireDouse();
      this.screenShake = Math.max(this.screenShake, 7);
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

      // a tangled dolphin: every wave that reaches it tears a piece of the net away. It only counts once
      // the player has been shown what to do, and the AI buoys leave this one to the player.
      if (e.kind === 'dolphin') {
        if (e.actionTimer > 0 && e.hp > 0 && w.kind !== 'buoy_pulse' && !w.hitMap.has(e.id)) {
          w.hitMap.set(e.id, w.age);
          const tear = w.kind === 'resonance' ? 3 : w.charge >= 0.55 ? 2 : 1;
          e.hp = Math.max(0, e.hp - tear);
          e.hitFlash = 0.32;
          this.screenShake = Math.max(this.screenShake, 3.5);
          this.spawnBurstParticles(e.x, e.y, '#c8fff4', 14);
          if (e.hp <= 0) {
            const reward = Math.round(e.value * stats.coinMultiplier);
            this.awardCoins(reward, e.x, e.y - 20, 'LUMBA-LUMBA BEBAS!', '#7ffcff', progress);
            progress.dolphinRescued = true;
          } else {
            this.spawnFloatingText(e.x, e.y - 26, tear > 1 ? 'SOBEK BESAR!' : 'JARING LEPAS!', '#c8fff4', 0.95);
          }
        }
        continue;
      }

      if (e.kind === 'fire') {
        const lastHit = w.hitMap.get(e.id) ?? -1;
        if (w.age - lastHit >= 0.2) {
          w.hitMap.set(e.id, w.age);
          const dmg = w.power * (w.kind === 'resonance' ? 1.8 : 1 + w.charge);
          if (dmg >= 1.1) {
            this.damageFire(e, dmg, progress, stats);
          }
        }
        continue;
      }

      if (e.kind === 'oil') {
        const lastHit = w.hitMap.get(e.id) ?? -1;
        if (w.age - lastHit >= 0.22) {
          w.hitMap.set(e.id, w.age);
          if (w.power < 1.45 && w.kind !== 'resonance') {
            this.spawnFloatingText(e.x, e.y - 16, 'Upgrade Tenaga Pasang!', '#f2c16b', 0.8);
          } else {
            e.hp -= w.power * (w.kind === 'resonance' ? 2.2 : 1.0);
            e.hitFlash = 0.2;
            e.vx += pushX * 90;
            e.vy += pushY * 90;
            if (e.hp <= 0) {
              this.removeEntity(e.id);
              const reward = Math.round(e.value * stats.coinMultiplier * this.comboMult);
              this.awardCoins(reward, e.x, e.y, 'MINYAK BERSIH!', '#7ffcff', progress);
              this.audio.playResonanceBurst();
              this.spawnBurstParticles(e.x, e.y, '#7ffcff', 18);
            }
          }
        }
        continue;
      }

      if (e.kind === 'trawler') {
        const lastHit = w.hitMap.get(e.id) ?? -1;
        if (w.age - lastHit >= 0.24) {
          w.hitMap.set(e.id, w.age);
          const resMult = w.kind === 'resonance' ? 2.6 : 1.0;
          const dmg = w.power * 7.5 * (1 + w.charge * 0.7) * resMult;
          e.hp -= dmg;
          e.hitFlash = 0.24;
          const shoveX = Math.max(0.55, pushX);
          e.vx += shoveX * (65 + w.power * 32) * resMult;
          e.vy += pushY * 28;
          this.audio.playTrawlerHit();
          this.screenShake = Math.max(this.screenShake, w.kind === 'resonance' ? 12 : 5);
          this.spawnBurstParticles(e.x - 24, e.y, w.kind === 'resonance' ? '#ffe07d' : '#a8f9f3', 12);
          this.spawnFloatingText(
            e.x,
            e.y - 42,
            `-${Math.round(dmg)}`,
            w.kind === 'resonance' ? '#ffe07d' : '#ffffff',
            w.kind === 'resonance' ? 1.25 : 0.95
          );

          if (e.hp <= 0) {
            this.removeEntity(e.id);
            const bonus = Math.round(750 * stats.coinMultiplier);
            this.awardCoins(bonus, e.x, e.y, 'KAPAL TERUSIR!', '#ffe07d', progress);
            this.spawnBurstParticles(e.x, e.y, '#ffe07d', 42);
            this.flashAlpha = 0.45;
            this.screenShake = 16;
            this.bossActive = false;
            progress.victoryAchieved = true;
            this.audio.playVictory();
            this.onVictory();
          }
        }
        continue;
      }

      // ===== AI FLOW GUIDANCE (Skill: sampahnya diarahin!) =====
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
        } else if (e.kind === 'boat') {
          targetX = VILLAGE_PIER.dockX;
          targetY = VILLAGE_PIER.dockY;
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

      // held fast by the net: it thrashes, but it goes nowhere
      if (e.kind === 'dolphin') {
        e.vx = 0;
        e.vy = 0;
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

      if (isTrashKind(e.kind)) {
        e.vx += (-11 + Math.sin(this.time + e.bobPhase) * 6) * dt;
        e.vy += Math.cos(this.time * 0.8 + e.bobPhase) * 8 * dt;

        const ndx = COLLECTOR_NET.x - e.x;
        const ndy = COLLECTOR_NET.y - e.y;
        const ndist = Math.hypot(ndx, ndy);
        const pullRange = stats.netRadius + 55 + stats.netPull * 1.85;
        if (ndist < pullRange && ndist > 1) {
          const pullStrength = (1 - ndist / pullRange) * (62 + stats.netPull * 3.3);
          e.vx += (ndx / ndist) * pullStrength * dt;
          e.vy += (ndy / ndist) * pullStrength * dt;
        }

        if (e.aiGuidedTimer > 0 && stats.aiGuideStrength > 0 && ndist > 1) {
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
      } else if (e.kind === 'boat') {
        e.vx += -14 * dt;
        const targetAngle = Math.atan2(e.vy, e.vx);
        const diff = Math.atan2(Math.sin(targetAngle - e.rotation), Math.cos(targetAngle - e.rotation));
        e.rotation += diff * Math.min(1, dt * 4);
      } else if (e.kind === 'trawler') {
        const targetX = 875;
        if (e.x > targetX) {
          e.vx += -52 * dt;
        }
        e.vy += Math.sin(this.time * 0.9) * 32 * dt;
        e.actionTimer -= dt;
        if (e.actionTimer <= 0) {
          e.actionTimer = 3.0;
          for (let d = 0; d < 3; d++) {
            this.spawnSingleTrash(stats, false, undefined, e.x - 42, e.y + (Math.random() - 0.5) * 56);
          }
        }
      }

      const drag = e.kind === 'trawler' ? 0.93 : e.kind === 'boat' ? 0.968 : 0.962;
      const damp = Math.pow(drag, dt * 60);
      e.vx *= damp;
      e.vy *= damp;

      const maxSpd = e.kind === 'trawler' ? 220 : 450;
      const spd = Math.hypot(e.vx, e.vy);
      if (spd > maxSpd) {
        e.vx = (e.vx / spd) * maxSpd;
        e.vy = (e.vy / spd) * maxSpd;
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.kind !== 'boat' && e.kind !== 'trawler') {
        e.rotation += e.angVel * dt;
        e.angVel *= 0.94;
      }

      if (e.y < 42) {
        e.y = 42;
        e.vy = Math.abs(e.vy) * 0.6;
      } else if (e.y > WORLD_H - 42) {
        e.y = WORLD_H - 42;
        e.vy = -Math.abs(e.vy) * 0.6;
      }

      if (e.kind === 'trawler') {
        if (e.x > WORLD_W + 75) {
          e.x = WORLD_W + 75;
          e.vx = Math.min(0, e.vx);
        }
      } else if (e.x > WORLD_W - 24) {
        e.x = WORLD_W - 24;
        e.vx = -Math.abs(e.vx) * 0.5;
      }

      if (e.kind !== 'trawler') {
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

      // ===== GOAL CHECKS =====
      if (isTrashKind(e.kind)) {
        const dNet = Math.hypot(e.x - COLLECTOR_NET.x, e.y - COLLECTOR_NET.y);
        if (dNet < stats.netRadius + e.radius * 0.55) {
          this.entities.splice(i, 1);
          this.incrementCombo(stats);
          const rarity = e.rarity ?? 'common';
          const reward = Math.max(1, Math.round(e.value * stats.coinMultiplier * this.comboMult));
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
            rarity === 'legendary'
              ? 'LEGENDARIS!'
              : rarity === 'epic'
                ? 'EPIK!'
                : rarity === 'rare'
                  ? 'LANGKA!'
                  : undefined;

          this.awardCoins(
            reward,
            COLLECTOR_NET.x + 12 + (Math.random() - 0.5) * 18,
            COLLECTOR_NET.y - 12 + (Math.random() - 0.5) * 16,
            label,
            color,
            progress
          );
          progress.totalTrash += 1;
          if (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary') {
            progress.totalRareTrash += 1;
          }
          this.netPulse = 1;
          if (rarity === 'legendary') {
            this.screenShake = Math.max(this.screenShake, 7.5);
            this.flashAlpha = Math.max(this.flashAlpha, 0.16);
          } else if (rarity === 'epic') {
            this.screenShake = Math.max(this.screenShake, 4);
          }
          this.audio.playTrashCollect(this.comboCount, rarity);
          this.spawnBurstParticles(
            COLLECTOR_NET.x,
            COLLECTOR_NET.y,
            color,
            rarity === 'legendary' ? 22 : rarity === 'epic' ? 14 : 8
          );
          continue;
        }
      }

      if (e.kind === 'mangrove_seed') {
        const shore = getShoreX(e.y);
        if (e.x <= shore + 20) {
          this.entities.splice(i, 1);
          this.incrementCombo(stats);
          this.plantPermanentMangrove(e.x, e.y, progress);
          const reward = Math.round((32 + stats.mangroveLevel * 22) * stats.coinMultiplier * this.comboMult);
          this.awardCoins(reward, shore + 8, e.y - 14, 'MANGROVE TUMBUH!', '#5ef29e', progress);
          this.audio.playMangrovePlant();
          // new trees, and the birds come straight back to them
          this.audio.playBirdBurst(0.8);
          this.spawnBurstParticles(shore + 6, e.y, '#5ef29e', 16, 'leaf');
          continue;
        }
      }

      if (e.kind === 'boat') {
        const dDock = Math.hypot(e.x - VILLAGE_PIER.dockX, e.y - VILLAGE_PIER.dockY);
        if (dDock < VILLAGE_PIER.dockRadius + e.radius * 0.5) {
          this.entities.splice(i, 1);
          this.incrementCombo(stats);
          const reward = Math.round((110 + stats.boatLevel * 70) * stats.coinMultiplier * this.comboMult);
          this.awardCoins(reward, VILLAGE_PIER.dockX + 20, VILLAGE_PIER.dockY - 22, 'PERAHU SELAMAT!', '#ffe07d', progress);
          progress.totalBoats += 1;
          this.audio.playBoatSaved();
          this.spawnBurstParticles(VILLAGE_PIER.dockX, VILLAGE_PIER.dockY, '#ffe07d', 20);
          continue;
        }
      }

      const shore = getShoreX(e.y);
      if (e.x < shore + e.radius + 4) {
        e.x = shore + e.radius + 4;
        e.vx = Math.abs(e.vx) * 0.45 + 14;
        if (isTrashKind(e.kind)) {
          const towardNetY = COLLECTOR_NET.y - e.y;
          e.vy += Math.sign(towardNetY) * (28 + progress.mangroves.length * 4);
        }
      }
    }
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
    this.comboTimer = 3.4;
    this.comboMult = Math.min(stats.comboMaxMult, 1 + Math.floor(this.comboCount / 2) * 0.15);
    if (stats.comboEnergyReturn > 0) {
      this.energy = Math.min(stats.maxEnergy, this.energy + stats.comboEnergyReturn);
    }
  }

  private awardCoins(
    amount: number,
    x: number,
    y: number,
    subtext: string | undefined,
    color: string,
    progress: PlayerProgress
  ): void {
    progress.coins += amount;
    progress.totalCoinsEarned += amount;
    this.spawnFloatingText(x, y, `+${amount}`, color, subtext ? 1.15 : 0.94, subtext);
    this.onCoinsChanged();
  }

  private handleSpawns(dt: number, stats: ComputedStats): void {
    // High-quantity clustered debris spawning scaled by Arus Muatan (trash_density)!
    const trashCount = this.entities.filter((e) => isTrashKind(e.kind)).length;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && trashCount < stats.maxTrashCount) {
      this.spawnTimer = stats.trashSpawnInterval;
      const room = stats.maxTrashCount - trashCount;
      const clusterSize = Math.min(
        room,
        stats.trashClusterMin +
          Math.floor(Math.random() * (stats.trashClusterMax - stats.trashClusterMin + 1))
      );

      // Spawn cluster around a shared incoming coastal current pocket!
      const anchorX = 940 + Math.random() * 270;
      const anchorY = 95 + Math.random() * (WORLD_H - 190);
      for (let c = 0; c < clusterSize; c++) {
        const ox = anchorX + (Math.random() - 0.5) * 110;
        const oy = Math.max(60, Math.min(WORLD_H - 60, anchorY + (Math.random() - 0.5) * 110));
        this.spawnSingleTrash(stats, false, undefined, ox, oy);
      }
    }

    if (stats.mangroveLevel > 0) {
      const seedCount = this.entities.filter((e) => e.kind === 'mangrove_seed').length;
      this.mangroveTimer -= dt;
      if (this.mangroveTimer <= 0 && seedCount < 2 + stats.mangroveLevel) {
        this.mangroveTimer = Math.max(2.6, 5.4 - stats.mangroveLevel * 0.85);
        this.spawnMangroveSeed(false);
      }
    }

    if (stats.boatLevel > 0) {
      const boatCount = this.entities.filter((e) => e.kind === 'boat').length;
      this.boatTimer -= dt;
      if (this.boatTimer <= 0 && boatCount < 1 + (stats.boatLevel >= 3 ? 1 : 0)) {
        this.boatTimer = Math.max(6.2, 10.5 - stats.boatLevel * 1.4);
        this.spawnBoat();
      }
    }

    if (stats.forestLevel > 0) {
      const fireCount = this.entities.filter((e) => e.kind === 'fire').length;
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && fireCount < 1 + (stats.forestLevel >= 2 ? 1 : 0)) {
        this.fireTimer = 10.5;
        this.spawnFire();
      }

      const oilCount = this.entities.filter((e) => e.kind === 'oil').length;
      this.oilTimer -= dt;
      if (this.oilTimer <= 0 && oilCount < 2) {
        this.oilTimer = 9.0;
        this.spawnOil();
      }
    }
  }

  private rollTrashRarity(stats: ComputedStats): TrashRarity {
    const w = stats.rarityWeights;
    const total = w.common + w.uncommon + w.rare + w.epic + w.legendary;
    let roll = Math.random() * total;
    if ((roll -= w.legendary) < 0) return 'legendary';
    if ((roll -= w.epic) < 0) return 'epic';
    if ((roll -= w.rare) < 0) return 'rare';
    if ((roll -= w.uncommon) < 0) return 'uncommon';
    return 'common';
  }

  private spawnSingleTrash(
    stats: ComputedStats,
    spreadAcrossLagoon: boolean,
    forcedRarity?: TrashRarity,
    overrideX?: number,
    overrideY?: number
  ): void {
    this.entities.push(this.createTrash(stats, spreadAcrossLagoon, forcedRarity, overrideX, overrideY));
  }

  /** A piece of trash, ready to go in the water but not in it yet: the caller decides when it lands. */
  public createTrash(
    stats: ComputedStats,
    spreadAcrossLagoon: boolean,
    forcedRarity?: TrashRarity,
    overrideX?: number,
    overrideY?: number
  ): Entity {
    const rarity = forcedRarity ?? this.rollTrashRarity(stats);

    let kind: EntityKind = 'trash_bottle';
    let value = 6;
    let radius = 12;
    let mass = 0.85;

    if (rarity === 'common') {
      if (Math.random() < 0.55) {
        kind = 'trash_bottle';
        value = 6;
        radius = 12;
        mass = 0.82;
      } else {
        kind = 'trash_bag';
        value = 8;
        radius = 13.5;
        mass = 0.9;
      }
    } else if (rarity === 'uncommon') {
      kind = 'trash_net';
      value = 18;
      radius = 16.5;
      mass = 1.18;
    } else if (rarity === 'rare') {
      kind = 'trash_crate';
      value = 46;
      radius = 17.5;
      mass = 1.28;
    } else if (rarity === 'epic') {
      kind = 'trash_battery';
      value = 125;
      radius = 18.5;
      mass = 1.35;
    } else {
      kind = 'trash_relic';
      value = 340;
      radius = 20;
      mass = 1.3;
    }

    const x =
      overrideX ?? (spreadAcrossLagoon ? 455 + Math.random() * 620 : 940 + Math.random() * 290);
    const y = overrideY ?? 76 + Math.random() * (WORLD_H - 152);

    return {
      id: this.nextId++,
      kind,
      rarity,
      x: Math.min(WORLD_W - 30, Math.max(getShoreX(y) + 60, x)),
      y,
      vx: -20 - Math.random() * 26,
      vy: (Math.random() - 0.5) * 20,
      radius,
      mass,
      hp: 1,
      maxHp: 1,
      value,
      age: 0,
      rotation: Math.random() * Math.PI * 2,
      angVel: (Math.random() - 0.5) * 1.4,
      bobPhase: Math.random() * Math.PI * 2,
      aiGuidedTimer: 0,
      hitFlash: 0,
      variant: Math.floor(Math.random() * 3),
      actionTimer: 0,
    };
  }

  private spawnMangroveSeed(initial: boolean): void {
    const x = initial ? 540 + Math.random() * 320 : 850 + Math.random() * 310;
    const y = 95 + Math.random() * (WORLD_H - 190);
    this.entities.push({
      id: this.nextId++,
      kind: 'mangrove_seed',
      x,
      y,
      vx: -16,
      vy: (Math.random() - 0.5) * 16,
      radius: 13,
      mass: 0.78,
      hp: 1,
      maxHp: 1,
      value: 32,
      age: 0,
      rotation: Math.random() * Math.PI * 2,
      angVel: (Math.random() - 0.5) * 1.1,
      bobPhase: Math.random() * Math.PI * 2,
      aiGuidedTimer: 0,
      hitFlash: 0,
      variant: Math.floor(Math.random() * 3),
      actionTimer: 0,
    });
  }

  private spawnBoat(): void {
    const y = 160 + Math.random() * 410;
    this.entities.push({
      id: this.nextId++,
      kind: 'boat',
      x: WORLD_W - 45,
      y,
      vx: -32,
      vy: (VILLAGE_PIER.dockY - y) * 0.04,
      radius: 24,
      mass: 1.55,
      hp: 1,
      maxHp: 1,
      value: 110,
      age: 0,
      rotation: Math.PI,
      angVel: 0,
      bobPhase: Math.random() * Math.PI * 2,
      aiGuidedTimer: 0,
      hitFlash: 0,
      variant: Math.floor(Math.random() * 2),
      actionTimer: 0,
    });
  }

  /**
   * A dolphin caught in a ghost net and rubbish, held in place until enough of the net is torn away.
   * `hp` is the pieces of net still on it; `actionTimer` above zero means waves may tear at it.
   */
  public spawnDolphin(): Entity {
    const e: Entity = {
      id: this.nextId++,
      kind: 'dolphin',
      x: DOLPHIN_SPOT.x,
      y: DOLPHIN_SPOT.y,
      vx: 0,
      vy: 0,
      radius: 26,
      mass: 99,
      hp: 3,
      maxHp: 3,
      value: 150,
      age: 0,
      rotation: 0,
      angVel: 0,
      bobPhase: 0,
      aiGuidedTimer: 0,
      hitFlash: 0,
      variant: 0,
      actionTimer: 0,
    };
    this.entities.push(e);
    return e;
  }

  private spawnFire(): void {
    const spots = FIRE_SPOTS.filter(
      (s) => !this.entities.some((e) => e.kind === 'fire' && Math.hypot(e.x - s.x, e.y - s.y) < 40)
    );
    if (spots.length === 0) return;
    const spot = spots[Math.floor(Math.random() * spots.length)];
    this.entities.push({
      id: this.nextId++,
      kind: 'fire',
      x: spot.x,
      y: spot.y,
      vx: 0,
      vy: 0,
      radius: 24,
      mass: 99,
      hp: 2.6,
      maxHp: 2.6,
      value: 170,
      age: 0,
      rotation: 0,
      angVel: 0,
      bobPhase: Math.random() * 6,
      aiGuidedTimer: 0,
      hitFlash: 0,
      variant: 0,
      actionTimer: 0,
    });
  }

  private spawnOil(): void {
    const x = 660 + Math.random() * 360;
    const y = 120 + Math.random() * 480;
    this.entities.push({
      id: this.nextId++,
      kind: 'oil',
      x,
      y,
      vx: -10,
      vy: (Math.random() - 0.5) * 14,
      radius: 26,
      mass: 2.2,
      hp: 3.4,
      maxHp: 3.4,
      value: 140,
      age: 0,
      rotation: Math.random() * 6,
      angVel: 0.25,
      bobPhase: Math.random() * 6,
      aiGuidedTimer: 0,
      hitFlash: 0,
      variant: Math.floor(Math.random() * 2),
      actionTimer: 0,
    });
  }

  private spawnTrawler(): void {
    this.bossActive = true;
    this.entities.push({
      id: this.nextId++,
      kind: 'trawler',
      x: WORLD_W + 40,
      y: 350,
      vx: -65,
      vy: 0,
      radius: 48,
      mass: 4.5,
      hp: 180,
      maxHp: 180,
      value: 750,
      age: 0,
      rotation: Math.PI,
      angVel: 0,
      bobPhase: 0,
      aiGuidedTimer: 0,
      hitFlash: 0,
      variant: 0,
      actionTimer: 2.2,
    });
  }

  public getBossEntity(): Entity | undefined {
    return this.entities.find((e) => e.kind === 'trawler');
  }

  private removeEntity(id: number): void {
    const idx = this.entities.findIndex((e) => e.id === id);
    if (idx !== -1) this.entities.splice(idx, 1);
  }

  private pushParticle(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) {
      this.particles.shift();
    }
    this.particles.push(p);
  }

  private spawnBurstParticles(
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

  private spawnFloatingText(
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
