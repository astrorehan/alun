import type { GameSimulation } from '../simulation';
import type { Entity, EntityKind, JobKind, JobResult, PirateKind, Point, PollutionSource, SavedPirate, StoryState, Wave } from '../types';
import { PIRATE_KIND } from '../types';
import { getUpgradeCost, hitDamage, isForSale, isUpgradeShown, newBlueprints, nextGoal, seedInterval, UPGRADE_DEFS, UPGRADE_MAP } from '../upgrades';
import {
  COLLECTOR_NET,
  FIRE_SPOTS,
  GHOST_SPOTS,
  getShoreX,
  MOORING,
  MOORING_ROPE,
  OPENING_TRASH,
  PIER_END,
  PIRATE_LANES,
  RAID_ANCHORS,
  SPILL_SPOTS,
  SEA_ROCKS,
  VILLAGE_PIER,
  WORLD_H,
  WORLD_W,
} from '../world';
import { SCENES, type SceneId } from './talk';
import { BoatJob, BossJob, CalfJob, DolphinJob, face, FireJob, Job, RaidJob, roundRocks, steer, swipeTowards, TrawlJob, WasteJob, type Objective, type Touch } from './jobs';
import {
  addDeposit,
  addPollution,
  BOSS_INTERVAL,
  buildNightWave,
  CALM,
  DAY_DURATION,
  dayTitle,
  isBossDay,
  newJob,
  NIGHT_DURATION,
  nightClearBonus,
  P_DEPOSIT,
  P_DIRTY,
  P_DRUM,
  P_GHOST,
  P_HEALTHY,
  P_MANGROVE,
  P_TRASH,
  PAY,
  pierRepairCost,
  pirateKind,
  PIRATE_SIGNAL_RADIUS,
  PIRATE_SPECS,
  pirateSpec,
  removePollution,
  REPAIR_HEAL,
  SALVAGE_VALUE,
  salvageWeights,
  SUPPLY_WINDOW,
} from './state';

const hyp = Math.hypot;

/** Things the scene draws that are not in the water for the waves to push. */
export interface StoryView {
  school: { caught: number; freed: number; gone: number };
  pod: { x: number; y: number; a: number; swim: number; happy: number } | null;
  podOut: number;
  docked: { t: number; variant: number } | null;
  rope: number;
  handover: number;
}

/** Snapshot exposed to HUD every frame for the Day/Night + PvZ Wave progress bar & Pier HP. */
export interface WaveHudState {
  day: number;
  cycle: StoryState['cycle'];
  dayTime: number;
  dayDuration: number;
  nightTime: number;
  nightDuration: number;
  /** 0..1 progress along current Day or Night wave bar. */
  progress: number;
  hugeFlags: number[];
  activePirates: number;
  remainingPirates: number;
  waveTotal: number;
  isBossNight: boolean;
  pierHp: number;
  maxPierHp: number;
  shopLocked: boolean;
  repairCost: number;
  canRepair: boolean;
}

const REACH_PIER = 50;
const PIRATE_DUMP_INTERVAL = 3.5;

/** The first time each new kind of ship comes, Bu Sari says how to deal with it. */
const INTRO_SCENE: Partial<Record<PirateKind, SceneId>> = {
  [PIRATE_KIND.shield]: 'shield',
  [PIRATE_KIND.dumper]: 'dumper',
  [PIRATE_KIND.signal]: 'signal',
};

export class Story {
  run: Job | null = null;
  view: StoryView = freshView();
  padPushes = 0;
  private saveSoon = false;
  private openingTarget?: number;
  private offered = false;
  private handing: 'dolphin' | null = null;
  private pickDry = 0;
  private duskWarnedDay = 0;
  /** Seconds of daytime the purse has been able to pay for a tool without a visit to the workshop. */
  private readyFor = 0;
  private bossEscortTimer = 14;

  constructor(readonly sim: GameSimulation) {}

  get s(): StoryState {
    return this.sim.progress.story;
  }

  radio(sender: string, text: string): void {
    this.sim.hooks.radio(sender, text);
  }

  /**
   * Bu Sari has something to tell, once per story. False when it was told before, so the caller
   * can say a short written line instead. Without a scene player (tests, the lab) the lines go
   * out over the radio.
   */
  talk(id: SceneId): boolean {
    const mark = `talk:${id}`;
    if (this.s.marks[mark] !== undefined) return false;
    this.s.marks[mark] = this.s.clock;
    const play = this.sim.hooks.talk;
    if (play) play(id);
    else for (const line of SCENES[id].lines) this.sim.hooks.radio(line.who, line.text);
    this.touchSave();
    return true;
  }

  touchSave(): void {
    this.saveSoon = true;
  }

  /* ================================================================ entering and leaving the water */

  load(opening = true): void {
    const s = this.s;
    this.run = null;
    this.view = freshView();
    this.openingTarget = undefined;
    this.padPushes = 0;
    this.offered = false;
    this.handing = null;
    this.duskWarnedDay = s.dayTime >= DAY_DURATION - 15 ? s.day : 0;
    this.bossEscortTimer = 14;

    // Sync maxPierHp with current pier_armor upgrade
    s.maxPierHp = this.sim.stats.maxPierHp;
    s.pierHp = Math.min(s.pierHp, s.maxPierHp);

    for (const t of s.trash) {
      const e = this.sim.addTrash(t.kind, t.x, t.y, t.variant);
      e.vx = 0;
      e.vy = 0;
      e.snagged = t.snagged;
      e.stranded = t.stranded;
      e.opening = t.opening;
      e.bundle = t.bundle;
      e.pollution = t.pollution;
      e.age = 1;
    }
    if (opening && s.cycle === 'prep' && s.step === 'sweep') this.layOpening();
    if (s.box === 'snagged' || s.box === 'loose') this.spawnBox();
    for (const q of s.sources) this.materialise(q);
    for (const p of s.pirates) this.materialisePirate(p);
    if (s.flags.seedling && !s.flags.planted) this.giveSeedling(false);
    if (s.flags.dolphin && !s.flags.seedling) this.giveSeedling(true);
    if (s.job) {
      this.run = this.makeJob(s.job);
      this.run.enter(true);
    }
    // Starter salvage on retry (skipPrep) so Day 1 is immediately active
    if (s.cycle === 'day' && s.day === 1 && s.dayTime === 0 && this.valuedCount() < 5) {
      this.burstSalvage(6);
    }
    this.sim.netClosed = false;
  }

  layOpening(): void {
    const s = this.s;
    const there = this.sim.entities.filter((e) => e.opening).length;
    const first = s.arrivals.length === 0 && there === 0;
    for (const spot of OPENING_TRASH.slice(0, Math.max(0, s.openingLeft - there))) {
      const e = this.sim.addTrash(spot.kind, spot.x, spot.y, spot.variant);
      e.vx = 0;
      e.vy = 0;
      e.snagged = true;
      e.opening = true;
      e.pollution = P_TRASH;
      if (first) s.arrivals.push(s.clock);
    }
  }

  snapshot(): void {
    const s = this.s;
    s.trash = this.sim.entities
      .filter((e) => SALVAGE_VALUE[e.kind] !== undefined)
      .map((e) => {
        const t: StoryState['trash'][number] = {
          kind: e.kind,
          variant: e.variant,
          x: Math.round(e.x),
          y: Math.round(e.y),
        };
        if (e.snagged) t.snagged = true;
        if (e.stranded) t.stranded = true;
        if (e.bundle) t.bundle = e.bundle;
        if (e.opening) t.opening = true;
        if (e.pollution) t.pollution = e.pollution;
        return t;
      });
    s.pirates = this.activePirates().map((e) => ({
      variant: pirateKind(e.variant),
      x: Math.round(e.x),
      y: Math.round(e.y),
      hp: Math.max(1, Math.round(e.hp)),
      maxHp: Math.max(1, Math.round(e.maxHp)),
      anchorIdx: e.anchorIdx ?? 0,
      tag: e.tag === 'attack' ? 'attack' : 'approach',
      attackWork: e.attackWork ?? 0,
      speed: e.pirateSpeed ?? 50,
      dmg: e.pirateDmg ?? 9,
      bounty: e.pirateBounty ?? 18,
      rotation: e.rotation,
      vx: e.vx, vy: e.vy,
      dumpTime: e.pirateDumpTime,
      ram: e.ram,
      tow: e.tow,
    }));
    const box = this.sim.entities.find((e) => e.kind === 'toolbox');
    if (box) s.boxAt = { x: Math.round(box.x), y: Math.round(box.y) };
    this.run?.snapshot();
  }

  private spawnBox(): void {
    const s = this.s;
    const e = this.sim.add('toolbox', s.boxAt.x, s.boxAt.y, { radius: 21, mass: 1.55, home: { ...MOORING } });
    e.snagged = s.box === 'snagged';
  }

  private materialise(q: PollutionSource): void {
    if (this.sim.entities.some((e) => e.source === q.id)) return;
    if (q.kind === 'spill') {
      this.sim.add('oil', q.x, q.y, { radius: 36, mass: 99, hp: 1, maxHp: 1, source: q.id, rotation: q.id * 1.7 });
    } else if (q.kind === 'ghost_net') {
      this.sim.add('ghost_net', q.x, q.y, { radius: 28, mass: 99, hp: 2, maxHp: 2, source: q.id });
    } else if (q.shown) {
      this.sim.add('deposit', q.x, q.y, { radius: 24, mass: 99, hp: 2, maxHp: 2, source: q.id });
    }
  }

  private dropSource(id: number): PollutionSource | null {
    const s = this.s;
    const i = s.sources.findIndex((q) => q.id === id);
    if (i < 0) return null;
    const [q] = s.sources.splice(i, 1);
    const e = this.sim.entities.find((x) => x.source === id);
    if (e) this.sim.remove(e.id);
    removePollution(s, q.amount);
    this.touchSave();
    return q;
  }

  /* ================================================================ pirates & pier HP */

  activePirates(): Entity[] {
    return this.sim.entities.filter((e) => e.kind === 'raider' && e.tag !== 'leaving');
  }

  private pickAnchor(): number {
    const counts = RAID_ANCHORS.map(() => 0);
    for (const p of this.activePirates()) {
      const idx = (p.anchorIdx ?? 0) % RAID_ANCHORS.length;
      counts[idx] += 1;
    }
    let best = 0;
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] < counts[best]) best = i;
    }
    return best;
  }

  private materialisePirate(p: SavedPirate): Entity {
    const spec = pirateSpec(p.variant, this.s.day, true);
    return this.sim.add('raider', p.x, p.y, {
      radius: spec.radius,
      mass: spec.mass,
      hp: p.hp,
      maxHp: p.maxHp,
      variant: p.variant,
      rotation: p.rotation ?? Math.PI,
      tag: p.tag,
      anchorIdx: p.anchorIdx,
      attackWork: p.attackWork,
      pirateSpeed: p.speed,
      pirateDmg: p.dmg,
      pirateBounty: p.bounty,
      vx: p.vx ?? 0, vy: p.vy ?? 0,
      pirateDumpTime: p.dumpTime,
      ram: p.ram,
      tow: p.tow,
    });
  }

  /** Spawns one pirate ship from an outer lane heading straight to attack the pier. */
  spawnPirate(variant: PirateKind, laneIdx: number, isNight: boolean): Entity {
    const lane = PIRATE_LANES[Math.abs(laneIdx) % PIRATE_LANES.length];
    const spec = pirateSpec(variant, this.s.day, isNight);
    const jitterY = (Math.random() - 0.5) * 44;
    const e = this.sim.add('raider', lane.x, Math.max(70, Math.min(WORLD_H + 54, lane.y + jitterY)), {
      radius: spec.radius,
      mass: spec.mass,
      hp: spec.hp,
      maxHp: spec.hp,
      variant,
      rotation: lane.rot,
      tag: 'approach',
      anchorIdx: this.pickAnchor(),
      attackWork: 0,
      tow: variant === PIRATE_KIND.tug ? { strain: 0, returning: false } : undefined,
      pirateSpeed: spec.speed,
      pirateDmg: spec.dmg,
      pirateBounty: spec.bounty,
    });
    // Give the film the camera before this wave queues any dialogue.
    this.tryPirateFilm(e);
    const introMark = `pirate:${variant}`;
    if (spec.intro && this.s.marks[introMark] === undefined) {
      this.s.marks[introMark] = this.s.clock;
      const scene = INTRO_SCENE[variant];
      if (!scene || !this.talk(scene)) this.radio('BU SARI', spec.intro);
    }
    this.touchSave();
    return e;
  }

  private tryPirateFilm(e: Entity): boolean {
    if (
      e.tag === 'approach' &&
      e.variant === PIRATE_KIND.raider &&
      this.s.marks.pirates === undefined &&
      !this.sim.hooks.filming() &&
      this.sim.hooks.raider?.(e)
    ) {
      this.s.marks.pirates = this.s.clock;
      this.touchSave();
      return true;
    }
    return false;
  }

  private movePirate(e: Entity, dt: number): boolean {
    if (this.tryPirateFilm(e)) return true;
    const a = RAID_ANCHORS[(e.anchorIdx ?? 0) % RAID_ANCHORS.length];
    const speed = e.pirateSpeed ?? 50;
    const variant = pirateKind(e.variant);
    if (e.tow) {
      const tow = e.tow;
      if (tow.strain >= 1) {
        const bx = e.x - Math.cos(e.rotation) * 65, by = e.y - Math.sin(e.rotation) * 65;
        for (const offset of [-20, 16, 44]) this.sim.addTrash('trash_crate', bx + offset, by);
        this.sim.text(bx, by, 'MUATAN LEPAS!', '#ffe07d', 1);
        e.tow = undefined;
        this.sendOff(e);
        this.touchSave();
        return true;
      }
      if (e.x < 780) tow.returning = true;
      const tx = tow.returning ? WORLD_W + 160 : 710;
      steer(e, tx, 430, speed, dt);
      face(e, Math.atan2(430 - e.y, tx - e.x), dt, 2.4);
      if (tow.returning && e.x > WORLD_W + 70) this.sendOff(e);
      return true;
    }
    if (variant === PIRATE_KIND.rammer && e.tag !== 'attack') {
      if (!e.ram && e.x < WORLD_W - 100) {
        e.ram = { phase: 'aim', time: 2, angle: Math.atan2(a.y - e.y, a.x - e.x) };
      }
      const ram = e.ram;
      if (ram) {
        ram.time -= dt;
        e.rotation = ram.angle;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= Math.exp(-2 * dt);
        e.vy *= Math.exp(-2 * dt);
        if (ram.phase === 'rush') {
          e.x += Math.cos(ram.angle) * 245 * dt;
          e.y += Math.sin(ram.angle) * 245 * dt;
          if (hyp(e.x - a.x, e.y - a.y) < 40) {
            const escort = this.s.job;
            if (this.s.marks.lastBoat && escort?.kind === 'boat' && !escort.touched) {
              escort.phase = 'turn';
              escort.t = 0;
              this.radio('PAK DAMAR', 'Jalurnyo ketutup! Aku putar balik.');
            }
            this.damagePier(e.pirateDmg ?? 19, e.x, e.y);
            this.sendOff(e);
          } else if (ram.time <= 0 || e.x < getShoreX(e.y) + 30 || SEA_ROCKS.some(r => hyp(e.x-r.x, e.y-r.y) < r.r + e.radius)) {
            ram.phase = 'stun';
            ram.time = 2.5;
            this.sim.text(e.x, e.y, 'OLENG!', '#ffe07d', 1);
            if (this.s.marks.lastBoat && this.s.job?.kind === 'boat') this.s.job.touched = true;
          }
        } else if (ram.time <= 0) {
          if (ram.phase === 'aim') { ram.phase = 'rush'; ram.time = 3.4; }
          else e.ram = undefined;
        }
        return true;
      }
    }
    const canFollowSignal = e.tag !== 'attack' && variant !== PIRATE_KIND.signal;

    // Mild separation so pirate swarms spread organically instead of stacking on 1 pixel
    let speedBoost = 1;
    let sepX = 0;
    let sepY = 0;
    for (const o of this.sim.entities) {
      if (o === e || o.kind !== 'raider' || o.tag === 'leaving') continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const d = hyp(dx, dy);
      if (canFollowSignal && o.variant === PIRATE_KIND.signal && d < PIRATE_SIGNAL_RADIUS) speedBoost = 1.42;
      const minD = e.radius + o.radius + 10;
      if (d > 0.1 && d < minD) {
        const push = (minD - d) * 1.8;
        sepX += (dx / d) * push;
        sepY += (dy / d) * push;
      }
    }

    e.vx *= Math.pow(0.28, dt);
    e.vy *= Math.pow(0.28, dt);
    e.vx += sepX * dt * 2.4;
    e.vy += sepY * dt * 2.4;

    const d = steer(e, a.x, a.y, speed * speedBoost, dt, 2.1, 30);
    roundRocks(e, dt);

    if (e.tag !== 'attack') {
      if (hyp(e.vx, e.vy) > 10) face(e, Math.atan2(a.y - e.y, a.x - e.x), dt, 2.8);
      if (variant === PIRATE_KIND.dumper) this.dumpPirateTrash(e, dt);
      if (d < 42) {
        e.tag = 'attack';
        e.attackWork = Math.max(e.attackWork ?? 0, 0.38);
        this.sim.text(e.x, e.y - 40, 'DERMAGA DISERANG!', '#ff8b78', 0.92);
      }
    } else {
      face(e, Math.atan2(PIER_END.y - e.y, PIER_END.x - e.x), dt, 2.4);
      if (d > 82) {
        // Player's wave knocked them away from the pier, attack interrupted!
        e.tag = 'approach';
        e.attackWork = Math.max(0, (e.attackWork ?? 0) * 0.35);
      } else {
        e.attackWork = (e.attackWork ?? 0) + dt / PIRATE_SPECS[variant].attackPeriod;
        if (e.attackWork >= 1) {
          e.attackWork = 0;
          const damage = e.pirateDmg ?? pirateSpec(variant, this.s.day, this.s.cycle === 'night').dmg;
          this.damagePier(damage, e.x, e.y);
          // Slight recoil animation on the pirate hull when ramming
          e.vx += 34;
        }
      }
    }
    return true;
  }

  private dumpPirateTrash(e: Entity, dt: number): void {
    const elapsed = e.pirateDumpTime ?? 0;
    const emptyAt = PIRATE_DUMP_INTERVAL * 2;
    if (elapsed >= emptyAt || e.x > WORLD_W - 50 || e.y < 60 || e.y > WORLD_H - 45) return;
    e.pirateDumpTime = Math.min(emptyAt, elapsed + dt);
    const drops = Math.floor(elapsed / PIRATE_DUMP_INTERVAL);
    if (Math.floor(e.pirateDumpTime / PIRATE_DUMP_INTERVAL) === drops) return;

    const sx = Math.sin(e.rotation);
    const sy = -Math.cos(e.rotation);
    const trash = this.sim.addTrash(drops === 0 ? 'trash_bag' : 'trash_net', e.x + sx * 32, e.y + sy * 32);
    trash.vx = e.vx * 0.35 + sx * 38;
    trash.vy = e.vy * 0.35 + sy * 38;
    trash.pollution = addPollution(this.s, P_TRASH);
    if (trash.pollution > 0) this.sim.hooks.worsen('trash', trash.pollution);
    this.sim.audio.playToss();
    this.sim.burst(trash.x, trash.y, '#e8ffdc', 7);
    this.touchSave();
  }

  private hitPirate(e: Entity, w: Wave, px: number, py: number): Touch {
    if (w.hitMap.has(e.id)) return 'hold';
    w.hitMap.set(e.id, w.age);

    // The push points away from its source. A wave coming at the bow opposes the ship's heading.
    const guarded = e.variant === PIRATE_KIND.shield && px * Math.cos(e.rotation) + py * Math.sin(e.rotation) < -0.55;
    const guard = guarded ? 0.25 : 1;
    const inSignalAura =
      e.variant !== PIRATE_KIND.signal &&
      this.sim.entities.some(
        (o) => o !== e && o.kind === 'raider' && o.tag !== 'leaving' && o.variant === PIRATE_KIND.signal && hyp(e.x - o.x, e.y - o.y) < PIRATE_SIGNAL_RADIUS
      );
    const auraGuard = inSignalAura ? 0.75 : 1;
    const buoyScale = w.kind === 'buoy_pulse' ? 0.52 : 1;
    const dmg = Math.max(
      1,
      Math.round(
        hitDamage(w.power, w.charge, this.sim.stats.critBonus) *
          buoyScale *
          guard *
          auraGuard
      )
    );
    // Knockback pushes raiders away from the pier; heavy & late-day hulls push through weaker waves!
    const powerPush = 0.55 + Math.sqrt(Math.max(0.1, w.power)) * 0.44;
    const massCap = 220 / Math.pow(Math.max(1.8, e.mass) / 3, 0.6);
    const rawShove = (155 / Math.max(1.6, e.mass)) * powerPush * buoyScale;
    const shove = Math.min(massCap, rawShove) * guard * auraGuard;
    e.vx += px * shove;
    e.vy += py * shove;

    e.hp -= dmg;
    e.hitFlash = 0.24;
    this.sim.audio.playShipHit(this.sim.audio.worldXToPan(e.x, WORLD_W));
    this.sim.shake(4);
    this.sim.burst(e.x - 10, e.y, '#a8f9f3', 10);
    const hitText = guarded ? `PERISAI -${dmg}` : `-${dmg}`;
    this.sim.text(e.x, e.y - 36, hitText, guarded ? '#ffe07d' : '#ffffff', 0.96);

    if (this.sim.stats.comboEnergyReturn > 0) {
      this.sim.energy = Math.min(this.sim.stats.maxEnergy, this.sim.energy + this.sim.stats.comboEnergyReturn);
    }

    if (e.hp <= 0) {
      this.sinkPirate(e);
    }
    return 'hold';
  }

  private sinkPirate(e: Entity): void {
    const s = this.s;
    const bounty = e.pirateBounty ?? 18;
    const isBrute = e.variant === PIRATE_KIND.heavy;
    s.piratesSunk += 1;
    s.saved.raids += 1;
    if (s.cycle === 'night') s.waveDefeated += 1;

    this.sim.award(bounty, e.x, e.y - 18, isBrute ? 'PENJARAH BERAT KABUR!' : undefined, '#ffe07d');
    this.sim.burst(e.x, e.y, '#ffe07d', isBrute ? 24 : 14);
    this.sim.audio.playShipSink(this.sim.audio.worldXToPan(e.x, WORLD_W));

    // Sunk pirates drop floating salvage loot you can sweep into the net for extra income!
    const drops = isBrute ? 2 : Math.random() < 0.72 ? 1 : 0;
    for (let i = 0; i < drops; i++) {
      const kind: EntityKind = isBrute
        ? i === 0 ? 'trash_crate' : Math.random() < 0.45 ? 'trash_battery' : 'trash_net'
        : Math.random() < 0.35 ? 'trash_crate' : 'trash_bag';
      const loot = this.sim.addTrash(kind, e.x + (i ? 22 : -12), e.y + (Math.random() - 0.5) * 32);
      loot.vx = -25 + (Math.random() - 0.5) * 30;
      loot.vy = (Math.random() - 0.5) * 35;
    }

    if (s.piratesSunk === 1 && s.cycle === 'day') this.talk('loot');

    this.sendOff(e);
    this.touchSave();
  }

  damagePier(rawAmount: number, fromX: number, fromY: number): void {
    const s = this.s;
    if (s.defeated) return;
    if (s.marks.fender) {
      delete s.marks.fender;
      this.sim.text(PIER_END.x, PIER_END.y, 'BAMBU MENAHAN!', '#8ef0c0', 1);
      this.touchSave();
      return;
    }
    const dmg = Math.max(1, Math.round(rawAmount * (1 - this.sim.stats.pierArmor)));
    s.pierHp = Math.max(0, s.pierHp - dmg);
    this.sim.shake(7.5);
    this.sim.flashAlpha = Math.max(this.sim.flashAlpha, 0.16);
    this.sim.audio.playPierHit();
    this.sim.burst((fromX + PIER_END.x) * 0.5, (fromY + PIER_END.y) * 0.5, '#ff6b5a', 14);
    this.sim.text(PIER_END.x + 14, PIER_END.y - 34, `-${dmg} DERMAGA!`, '#ff7a70', 1.15);
    this.sim.hooks.pierHurt(s.pierHp, s.maxPierHp);
    this.touchSave();

    if (s.pierHp <= 0) {
      s.defeated = true;
      this.sim.hooks.defeat();
    }
  }

  /** Workshop quick-repair for Pier HP (Day only). */
  repairPier(): boolean {
    const s = this.s;
    if (s.cycle === 'night' || s.pierHp >= s.maxPierHp) return false;
    const cost = pierRepairCost(s.day);
    if (this.sim.progress.coins < cost) return false;
    this.sim.progress.coins -= cost;
    s.pierHp = Math.min(s.maxPierHp, s.pierHp + REPAIR_HEAL);
    this.sim.audio.playUpgradeBuy();
    this.touchSave();
    return true;
  }

  /* ================================================================ pollution */

  leak(at: Point): number {
    const s = this.s;
    const spills = s.sources.filter((q) => q.kind === 'spill');
    const free = [at, ...SPILL_SPOTS].find((p) => spills.every((q) => hyp(q.x - p.x, q.y - p.y) > 70));
    const amount = addPollution(s, P_DRUM);
    this.sim.hooks.worsen('spill', amount);
    this.touchSave();
    if (spills.length >= 4 || !free) {
      this.bury(amount);
      return 0;
    }
    const x = Math.min(WORLD_W - 60, Math.max(getShoreX(free.y) + 120, free.x));
    const q: PollutionSource = { id: s.nextSource++, kind: 'spill', amount, x, y: Math.min(WORLD_H - 70, Math.max(80, free.y)) };
    s.sources.push(q);
    this.materialise(q);
    this.sim.burst(q.x, q.y, '#2b2236', 18, 'smoke');
    this.sim.text(q.x, q.y - 40, 'TUMPAHAN +12', '#ff9b8a', 1.05);
    return q.id;
  }

  loseTrawl(): void {
    const s = this.s;
    const spot = GHOST_SPOTS.find((p) => !s.sources.some((q) => q.kind === 'ghost_net' && hyp(q.x - p.x, q.y - p.y) < 40));
    const amount = addPollution(s, P_GHOST);
    this.sim.hooks.worsen('ghost_net', amount);
    this.touchSave();
    if (!spot) {
      this.bury(amount);
      return;
    }
    const q: PollutionSource = { id: s.nextSource++, kind: 'ghost_net', amount, x: spot.x, y: spot.y };
    s.sources.push(q);
    this.materialise(q);
    this.sim.text(spot.x, spot.y - 30, 'JARING HANTU +6', '#ff9b8a', 1.05);
    this.radio('PAK DAMAR', 'Waduh, pukatnyo lolos. Jaring hantunyo nyangkut di karang.');
  }

  private bury(amount: number): void {
    let left = amount;
    while (left > 0) {
      addDeposit(this.s, Math.min(P_DEPOSIT, left));
      left -= P_DEPOSIT;
    }
  }

  strand(e: Entity): void {
    e.stranded = true;
    e.vx = 0;
    e.vy = 0;
    if (e.pollution === undefined) {
      e.pollution = addPollution(this.s, P_TRASH);
      this.sim.text(e.x + 16, e.y - 18, 'TERDAMPAR', '#ffc46a', 0.8);
      this.sim.hooks.worsen('trash', e.pollution);
      this.touchSave();
    }
  }

  collected(e: Entity): void {
    const s = this.s;
    if (e.pollution) {
      removePollution(s, e.pollution);
      e.pollution = 0;
    }
    if (e.opening) {
      s.openingLeft = Math.max(0, s.openingLeft - 1);
      e.opening = false;
      if (s.openingLeft > 0) this.talk('firstCatch');
    }
    this.touchSave();
  }

  showDeposit(): PollutionSource | null {
    const q = this.s.sources.find((x) => x.kind === 'deposit' && !x.shown);
    if (!q) return null;
    q.shown = true;
    this.materialise(q);
    this.touchSave();
    return q;
  }

  offerDeposit(): void {
    if (this.s.sources.some((q) => q.kind === 'deposit' && q.shown)) return;
    this.showDeposit();
  }

  private get padsAvailable(): boolean {
    return this.s.flags.toolbox;
  }

  private tasks(): { kind: 'spill' | 'ghost_net' | 'trash' | 'deposit'; n: number; at: Point }[] {
    const out: { kind: 'spill' | 'ghost_net' | 'trash' | 'deposit'; n: number; at: Point }[] = [];
    const of = (k: PollutionSource['kind']): PollutionSource[] => this.s.sources.filter((q) => q.kind === k);
    const spills = of('spill');
    if (spills.length && this.padsAvailable) out.push({ kind: 'spill', n: spills.length, at: spills[0] });
    const ghosts = of('ghost_net');
    if (ghosts.length) out.push({ kind: 'ghost_net', n: ghosts.length, at: ghosts[0] });
    const trash = this.sim.entities.filter((e) => e.pollution);
    if (trash.length) out.push({ kind: 'trash', n: trash.length, at: { x: trash[0].x, y: trash[0].y } });
    const deps = of('deposit').filter((q) => q.shown);
    if (deps.length) out.push({ kind: 'deposit', n: deps.length, at: deps[0] });
    return out;
  }

  private depositTick(): void {
    const s = this.s;
    if (s.cycle !== 'day') return;
    if (s.sources.some((q) => q.kind === 'deposit' && q.shown)) return;
    const others = this.tasks().some((t) => t.kind !== 'deposit');
    if (others || s.pollution <= P_HEALTHY) return;
    const q = this.showDeposit();
    if (q && !this.offered) {
      this.offered = true;
      this.radio('PAK DAMAR', 'Ado endapan lamo di tepi pantai. Sapu tu, besok pagi warga nambal dermaga gratis.');
    }
  }

  private padTick(dt: number): void {
    const s = this.s;
    const spills = s.sources.filter((q) => q.kind === 'spill');
    const pads = this.sim.entities.filter((e) => e.kind === 'pad');
    if (!this.padsAvailable || spills.length === 0 || s.cycle === 'night') {
      for (const p of pads) this.sim.remove(p.id);
      return;
    }
    if (pads.length > 0) {
      const p = pads[0];
      this.pickDry += dt;
      const near = Math.min(...spills.map((q) => hyp(q.x - p.x, q.y - p.y)));
      if (near > 470 || this.pickDry > 45) {
        this.sim.remove(p.id);
        s.padTimer = 1;
      }
      return;
    }
    s.padTimer -= dt;
    if (s.padTimer > 0) return;
    const q = spills[0];
    const dx = PIER_END.x - q.x;
    const dy = PIER_END.y - q.y;
    const d = hyp(dx, dy) || 1;
    const x = q.x + (dx / d) * 158;
    const y = q.y + (dy / d) * 158;
    const e = this.sim.add('pad', x, y, { radius: 25, mass: 1.02, home: { x, y } });
    e.actionTimer = 1.15;
    this.pickDry = 0;
    this.padPushes = 0;
    s.padTimer = 5;
    this.sim.audio.playToss();
  }

  private absorb(p: Entity, dt: number): void {
    for (const e of this.sim.entities) {
      if (e.kind !== 'oil' || e.source === undefined) continue;
      if (hyp(e.x - p.x, e.y - p.y) > e.radius + p.radius * 0.45) continue;
      e.hp -= dt * 1.15;
      e.hitFlash = 0.1;
      p.vx *= Math.pow(0.12, dt);
      p.vy *= Math.pow(0.12, dt);
      if (Math.random() < dt * 14) this.sim.burst(p.x, p.y, '#4a3b5c', 1, 'foam');
      if (e.hp <= 0) {
        this.s.saved.spills += 1;
        this.s.flags.waste = true;
        const q = this.dropSource(e.source);
        this.sim.remove(p.id);
        this.padPushes = 0;
        this.sim.award(19, e.x, e.y - 30, `TERSERAP${q && q.amount > 0 ? ` -${q.amount}` : ''}`, '#8ef0c0');
        this.sim.burst(e.x, e.y, '#7ffcff', 18);
        this.sim.audio.playMangrovePlant(this.sim.audio.worldXToPan(e.x, WORLD_W));
        this.s.padTimer = 2.5;
      }
      return;
    }
  }

  planted(): void {
    const s = this.s;
    s.flags.planted = true;
    let left = P_MANGROVE;
    for (const q of [...s.sources]) {
      if (left <= 0) break;
      if (q.kind !== 'deposit') continue;
      const take = Math.min(left, q.amount);
      q.amount -= take;
      left -= take;
      removePollution(s, take);
      if (q.amount <= 0) this.dropSource(q.id);
    }
    this.touchSave();
  }

  /* ================================================================ incremental salvage tide */

  valuedCount(): number {
    let n = 0;
    for (const e of this.sim.entities) if (SALVAGE_VALUE[e.kind] !== undefined) n += 1;
    return n;
  }

  quota(): number {
    const s = this.s;
    const st = this.sim.stats;
    while (s.arrivals.length && s.arrivals[0] <= s.clock - SUPPLY_WINDOW) s.arrivals.shift();
    return Math.max(0, Math.min(st.salvagePerMinute - s.arrivals.length, st.maxSalvage - this.valuedCount()));
  }

  arrive(): boolean {
    if (this.quota() <= 0) return false;
    this.s.arrivals.push(this.s.clock);
    return true;
  }

  private pickSalvage(): EntityKind {
    const w = salvageWeights(this.sim.stats.rarityLevel, this.s.day);
    let roll = Math.random() * w.reduce((a, [, k]) => a + k, 0);
    for (const [kind, k] of w) if ((roll -= k) < 0) return kind;
    return 'trash_bottle';
  }

  private burstSalvage(count: number): void {
    for (let i = 0; i < count; i++) {
      if (!this.arrive()) break;
      const x = 680 + Math.random() * 440;
      const y = 100 + Math.random() * (WORLD_H - 200);
      this.sim.addTrash(this.pickSalvage(), x, y);
    }
  }

  private supplyTick(dt: number): void {
    const s = this.s;
    if (!s.flags.toolbox || s.cycle === 'prep') return;
    // During night waves, salvage slows down so focus stays on pirate combat (pirates drop loot instead!)
    const rateScale = s.cycle === 'night' ? 0.35 : 1;
    s.supplyTimer -= dt * rateScale;
    if (s.supplyTimer > 0) return;
    const st = this.sim.stats;
    const want = st.supplyClusterMin + Math.floor(Math.random() * (st.supplyClusterMax - st.supplyClusterMin + 1));
    const n = Math.min(want, this.quota());
    s.supplyTimer = st.supplyInterval * Math.max(1, want * 0.94);
    if (n <= 0) {
      s.supplyTimer = 1.6;
      return;
    }
    const ax = 900 + Math.random() * 280;
    const ay = 100 + Math.random() * (WORLD_H - 200);
    for (let i = 0; i < n; i++) {
      if (!this.arrive()) break;
      const x = ax + (i ? (Math.random() - 0.5) * 140 : 0);
      const y = Math.max(64, Math.min(WORLD_H - 64, ay + (i ? (Math.random() - 0.5) * 140 : 0)));
      const e = this.sim.addTrash(this.pickSalvage(), x, y);
      if (s.cycle === 'day') {
        const roll = s.marks.bundleRoll ?? 0;
        if (roll % 3 !== 2) e.bundle = this.pickSalvage();
        s.marks.bundleRoll = roll + 1;
      }
    }
  }

  private seedTick(dt: number): void {
    const s = this.s;
    if (s.cycle !== 'day') return;
    const lv = this.sim.stats.mangroveLevel;
    if (lv <= 0 || this.sim.progress.mangroves.length >= 19) return;
    s.seedTimer -= dt * 5 / 3;
    if (s.seedTimer > 0) return;
    s.seedTimer = seedInterval(lv);
    if (this.sim.entities.filter((e) => e.kind === 'mangrove_seed').length < 2) {
      this.sim.addSeed(620 + Math.random() * 260, 100 + Math.random() * (WORLD_H - 200));
    }
  }

  private giveSeedling(first: boolean): void {
    if (first) {
      this.s.flags.seedling = true;
      this.touchSave();
    }
    if (!this.sim.entities.some((e) => e.kind === 'mangrove_seed')) this.sim.addSeed(430, 566);
  }

  /* ================================================================ main frame update */

  update(dt: number): void {
    const s = this.s;
    if (s.defeated) return;
    s.clock += dt;
    s.maxPierHp = this.sim.stats.maxPierHp;

    this.view.handover = Math.max(0, this.view.handover - dt);
    this.view.podOut = Math.max(0, this.view.podOut - dt);
    this.view.school.gone = Math.max(0, this.view.school.gone - dt);
    this.view.school.freed = Math.max(0, this.view.school.freed - dt * 0.4);
    if (!s.job || (s.job.kind !== 'trawl' && s.job.kind !== 'boss')) this.view.school.caught = 0;
    if (this.view.docked) {
      this.view.docked.t += dt;
      if (this.view.docked.t > 26) this.view.docked = null;
    }

    this.supplyTick(dt);
    this.seedTick(dt);
    this.padTick(dt);
    this.depositTick();

    if (s.cycle === 'prep') {
      this.prepTick();
    } else if (s.cycle === 'day') {
      this.dayTick(dt);
    } else if (s.cycle === 'night') {
      this.nightTick(dt);
    }

    if (s.job && this.run) {
      s.job.t += dt;
      s.job.total += dt;
      this.run.update(dt);
    }
    this.sim.netClosed = false;
    this.movePodOut(dt);

    if (this.saveSoon) {
      this.saveSoon = false;
      this.sim.hooks.save();
    }
  }

  /* ================================================================ prep -> day -> night */

  private prepTick(): void {
    const s = this.s;
    if (s.step === 'sweep' && s.openingLeft <= 0) {
      s.step = 'box';
      s.box = 'snagged';
      s.boxAt = { ...MOORING };
      this.spawnBox();
      this.sim.burst(MOORING.x, MOORING.y, '#e5ffff', 16, 'foam');
      this.sim.audio.playShopUnlock();
      if (!this.talk('chest')) this.radio('BU SARI', 'Peti ibuk di tambatan tu. Dorong ke ujung dermaga.');
      this.touchSave();
    }
  }

  private dayTick(dt: number): void {
    const s = this.s;
    const filming = this.sim.hooks.filming();
    if (filming) return;
    // the morning starts in the workshop: the day only begins once the player has been in
    if (this.dawnShopPending()) return;

    s.dayTime += dt;
    s.step = 'day';
    s.beacon = s.dayTime >= DAY_DURATION - 15;

    // coins that could be a tool for a while: point at the workshop (the dusk call below does it once more)
    const canBuy = this.sim.progress.coins >= (nextGoal(this.sim.progress)?.cost ?? Infinity);
    this.readyFor = canBuy ? this.readyFor + dt : 0;
    if (this.readyFor >= 24 && s.dayTime < DAY_DURATION - 18) {
      this.readyFor = 0;
      const ready = this.affordableNames();
      if (ready.length) this.sim.hooks.shopNudge?.(ready[0]);
    }

    // Consolidate the final daytime freight near the collection route before the shop closes.
    if (s.dayTime >= DAY_DURATION - 24 && s.marks.freightDay !== s.day) {
      s.marks.freightDay = s.day;
      for (const dy of [-42, 0, 42]) {
        const crate = this.sim.addTrash('trash_crate', COLLECTOR_NET.x + 190, COLLECTOR_NET.y + dy);
        crate.bundle = 'trash_battery';
      }
      this.sim.text(COLLECTOR_NET.x + 190, COLLECTOR_NET.y - 64, 'MUATAN SENJA!', '#ffe07d', 1);
      this.touchSave();
    }

    // Dusk warning
    if (s.dayTime >= DAY_DURATION - 15 && this.duskWarnedDay !== s.day) {
      this.duskWarnedDay = s.day;
      this.sim.audio.playAlert();
      const ready = this.affordableNames();
      if (ready.length) this.sim.hooks.shopNudge?.(ready[0]);
      if (isBossDay(s.day)) this.radio('BU SARI', 'Langit la gelap. Badai datang! Kalau masih ado koin, habiskan di bengkel sekarang.');
      else if (!this.talk('dusk')) {
        this.radio(
          'BU SARI',
          ready.length
            ? `Senja! Koin kau cukup buat ${ready.slice(0, 2).join(' samo ')}. Pasang di bengkel sebelum gelap!`
            : `Senja. Kalau nak nambal dermaga, sekarang. Malam ${s.day} sebentar lagi.`
        );
      }
    }

    // Daytime skirmish pirates: keeps Day active, tense & rewarding!
    s.skirmishTimer -= dt * 5 / 3;
    if (s.skirmishTimer <= 0 && s.dayTime < DAY_DURATION - 15) {
      const active = this.activePirates().length;
      if (active < 4) {
        const firstScout = s.day === 1 && s.piratesSunk === 0;
        const firstTug = s.day === 2 && !s.marks.firstTug;
        const count = firstScout || firstTug
          ? 1
          : s.day >= 3
            ? Math.random() < 0.45 ? 3 : 2
            : s.day >= 2
              ? 2
              : Math.random() < 0.45 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const variant: PirateKind = firstScout
            ? 0
            : s.day >= 3 && i === 0 && Math.random() < 0.45
              ? 2
              : s.day >= 2 && i === 1 && Math.random() < 0.4
                ? PIRATE_KIND.shield
                : Math.random() < 0.44
                  ? 1
                  : 0;
          const introduceTug = s.day >= 2 && !s.marks.firstTug && i === 0;
          if (introduceTug) s.marks.firstTug = s.clock;
          this.spawnPirate(introduceTug ? PIRATE_KIND.tug : variant, firstScout ? 0 : Math.floor(Math.random() * PIRATE_LANES.length), false);
        }
        this.sim.audio.playAlert();
        if (!(firstScout && this.talk('scout'))) this.radio('PAK DAMAR', 'Kapal layar robek siang-siang! Usir dio dari dermaga!');
      }
      s.skirmishTimer = Math.max(16, 28 - s.day * 2.2) + Math.random() * 5;
    }

    // Daytime side events (dolphins, fishers, trawlers, drum ships, forest fires) for bonus coins & narrative flavor
    if (!this.sim.hooks.filming() && !s.job && s.dayTime < DAY_DURATION - 22 && s.clock >= s.calmUntil) {
      s.sideEventTimer -= dt * 5 / 3;
      if (s.sideEventTimer <= 0) {
        this.launchDaySideEvent();
        s.sideEventTimer = 42;
      }
    }

    if (s.dayTime >= DAY_DURATION) {
      this.startNight();
    }
  }

  private launchDaySideEvent(): void {
    const s = this.s;
    if (s.day === 1 && !s.flags.dolphin) {
      this.start('dolphin', true, 0);
      return;
    }
    if (s.day === 1 && !s.flags.damar) {
      this.start('boat', true, 0);
      return;
    }
    const pool: JobKind[] = ['boat', 'calf'];
    if (s.day >= 2) pool.push('trawl');
    if (s.day >= 3) pool.push('waste');
    if (this.sim.stats.forestLevel > 0) pool.push('fire');
    const kind = pool[s.turn % pool.length];
    s.turn += 1;
    const variant = kind === 'fire' ? s.turn % FIRE_SPOTS.length : s.turn % 3;
    this.start(kind, false, variant);
  }

  private startNight(): void {
    const s = this.s;
    s.cycle = 'night';
    s.step = 'night';
    s.dayTime = DAY_DURATION;
    s.nightTime = 0;
    s.beacon = true;

    // Resume unfinished village work at dawn, with its original payout and remaining time.
    if (this.run && s.job) {
      this.run.snapshot();
      s.morningJob = s.job;
      this.run.clear();
      this.run = null;
      s.job = null;
    }

    const wave = buildNightWave(s.day);
    s.wavePlan = wave.plan;
    s.waveTotal = wave.plan.length;
    s.waveSpawned = 0;
    s.waveDefeated = 0;
    s.hugeFlags = wave.hugeFlags;
    s.hugeAnnounced = 0;
    this.bossEscortTimer = 14;

    this.sim.audio.playRaidHorn();
    if (isBossDay(s.day)) {
      this.start('boss', true, 0);
      this.sim.hooks.banner(`MALAM ${s.day} · BADAI MUSON!`, 'Kapal Induk dan armada pengawal memasuki laguna!', 'red');
    } else {
      this.sim.hooks.banner(
        `MALAM ${s.day} · SERBUAN BAJAK LAUT`,
        `Bertahan dari ${s.waveTotal} kapal penjarah, jaga HP Dermaga!`,
        'orange'
      );
    }
    this.touchSave();
  }

  private nightTick(dt: number): void {
    const s = this.s;
    const bossNight = isBossDay(s.day);
    const active = this.activePirates();

    // PvZ anti-stall: if player annihilated all active pirates early on a normal night, fast-forward to next spawn!
    if (!bossNight && active.length === 0 && s.wavePlan.length > 0) {
      const nextAt = s.wavePlan[0].at;
      if (nextAt - s.nightTime > 2.2) {
        s.nightTime = nextAt - 2.2;
      }
    }

    s.nightTime += dt;

    // Execute scheduled wave spawns
    while (s.wavePlan.length > 0 && s.wavePlan[0].at <= s.nightTime) {
      const item = s.wavePlan.shift()!;
      if (item.huge) {
        s.hugeAnnounced += 1;
        this.sim.audio.playRaidHorn(true);
        this.sim.shake(5.5);
        this.sim.hooks.banner('GELOMBANG BESAR MENDEKAT!', 'Armada layar robek menyerbu serentak!', 'red');
      }
      if (s.day === 1 && item.variant === PIRATE_KIND.rammer && !s.job) {
        s.marks.lastBoat = 1;
        this.start('boat', true, 0);
        this.radio('PAK DAMAR', 'Perahu terakhir! Belokkan pendobrak, aku bawa bambu pelindung dermaga!');
      }
      const ship = this.spawnPirate(item.variant, item.lane, true);
      if (!bossNight && s.waveSpawned === 0) {
        const lines = [
          'Datang dio! Tahan mereka jauh dari dermaga.',
          'Malam kedua. Ado perahu cepat samo penjarah berat. Yang berat tu hantam berkali-kali.',
          'Malam ketiga, makin rapat. Pakai Jalur Pasang, samo Gema atau Pelampung kalau la punya.',
          'Malam keempat. Mereka datang dari segala arah. Tahan sampai pagi!',
        ];
        this.radio('BU SARI', lines[Math.min(lines.length - 1, Math.max(0, s.day - 1))]);
      }
      if (s.day === 1 && item.variant === PIRATE_KIND.rammer && s.marks.lastBoat) {
        ship.x = 1130;
        ship.y = 429;
        ship.anchorIdx = 0;
      }
      s.waveSpawned += 1;
      if (item.support && !s.job) {
        this.start(item.support, false, s.day % 2);
      }
    }

    // Boss Night extra escort trickle if the Mother Ship survives past initial schedule
    if (bossNight && s.job?.kind === 'boss' && s.wavePlan.length === 0) {
      this.bossEscortTimer -= dt;
      if (this.bossEscortTimer <= 0 && active.length < 5) {
        this.bossEscortTimer = 11;
        this.spawnPirate(Math.random() < 0.45 ? PIRATE_KIND.shield : 1, 0, true);
        this.spawnPirate(Math.random() < 0.65 ? 2 : PIRATE_KIND.signal, 3, true);
        this.spawnPirate(Math.random() < 0.5 ? 1 : 0, 5, true);
      }
    }

    // Check Night Completion!
    if (bossNight) {
      if (!s.job || s.job.kind !== 'boss') {
        // Mother ship defeated! Remaining escorts flee in panic
        for (const p of this.activePirates()) this.sendOff(p);
        this.finishNight(true);
      }
    } else if (s.wavePlan.length === 0 && this.activePirates().length === 0) {
      // If a support ship (trawl/waste) is still lingering, send it packing at dawn
      if (this.run && s.job && (s.job.kind === 'trawl' || s.job.kind === 'waste')) {
        this.run.clear();
        this.run = null;
        s.job = null;
      }
      if (s.marks.lastBoat && s.job?.kind === 'boat') {
        if (s.job.phase !== 'turn') return;
        if (this.run) this.settle(this.run, 'failed', 0, PIER_END, 'PAK DAMAR PUTAR BALIK');
      }
      this.finishNight(false);
    }
  }

  private finishNight(wasBoss: boolean): void {
    const s = this.s;
    const clearedDay = s.day;
    s.nightsSurvived += 1;
    if (clearedDay >= 1) s.flags.cargo = true;
    if (clearedDay >= 4) s.flags.night = true;

    const bonus = nightClearBonus(clearedDay);
    this.sim.award(bonus, VILLAGE_PIER.dockX + 36, VILLAGE_PIER.dockY - 28, `MALAM ${clearedDay} SELAMAT!`, '#8ef0c0');
    this.sim.audio.playBirdBurst(0.8);

    // Eco-linked dawn repair: clean coast = citizens repair pier for free!
    let freeHeal = 0;
    if (s.pollution <= P_HEALTHY) freeHeal = 25;
    else if (s.pollution < P_DIRTY) freeHeal = 10;
    if (freeHeal > 0 && s.pierHp < s.maxPierHp) {
      const gained = Math.min(freeHeal, s.maxPierHp - s.pierHp);
      s.pierHp += gained;
      this.sim.text(PIER_END.x + 20, PIER_END.y - 54, `+${gained} HP DERMAGA (PANTAI BERSIH)`, '#8ef0c0', 1.0);
    }

    // Advance into next Day
    s.day += 1;
    s.chapter = s.day;
    s.cycle = 'day';
    s.step = 'day';
    s.dayTime = 0;
    s.nightTime = 0;
    s.beacon = false;
    s.wavePlan = [];
    s.waveTotal = 0;
    s.waveSpawned = 0;
    s.waveDefeated = 0;
    s.hugeFlags = [];
    s.skirmishTimer = Math.max(18, 28 - s.day * 1.5);
    s.sideEventTimer = 24;
    s.marks[`day${s.day}`] = s.clock;

    if (s.morningJob) {
      s.job = s.morningJob;
      delete s.morningJob;
      this.run = this.makeJob(s.job);
      this.run.enter(true);
    }

    // Fresh morning salvage wave so Day starts rich & exciting
    this.burstSalvage(5 + Math.min(5, this.sim.stats.supplyClusterMax));

    if (wasBoss && clearedDay === BOSS_INTERVAL && !s.flags.ending) {
      s.flags.boss = true;
      s.flags.ending = true;
      this.sim.progress.victoryAchieved = true;
      s.marks.ending = s.clock;
      this.sim.award(PAY.ending, VILLAGE_PIER.dockX + 20, VILLAGE_PIER.dockY - 56, 'BADAI MUSON DITAKLUKKAN!', '#ffe07d');
      this.touchSave();
      this.sim.hooks.ending();
      return;
    }

    s.marks.dawnShop = s.day;
    s.marks.dawnShopAt = s.clock + 1.6;

    this.sim.hooks.chapter(s.day);
    this.sim.hooks.banner(
      `FAJAR TIBA · HARI ${s.day}`,
      freeHeal >= 25
        ? `Pantai bersih! Warga menambal dermaga +${freeHeal} HP. Bengkel buka!`
        : freeHeal > 0
          ? `Dermaga pulih +${freeHeal} HP. Bersihkan pantai & belanja di Bengkel!`
          : 'Pantai kotor. Tambal dermaga di Bengkel & sapu sampah!',
      'green'
    );
    const fresh = newBlueprints(this.sim.progress)
      .filter((id) => isUpgradeShown(id, this.sim.progress))
      .map((id) => UPGRADE_MAP[id].shortName);
    const news = fresh.length ? ` Cetak biru baru di bengkel: ${fresh.join(', ')}.` : ' Bengkel ibu buka, alat kau bisa naik level lagi.';
    const morningLines: Record<number, string> = {
      2: `Pagi. Malam nanti penjarah berat samo kapal pukat mulai datang.${news}`,
      3: `Pagi. Armadanyo makin besar, kapal drum ikut turun.${news}`,
      4: `Pagi. Malam ini mereka ngepung dari segala arah.${news}`,
    };
    const told = s.day === 2 ? this.talk('dawn') : isBossDay(s.day) ? this.talk('storm') : false;
    if (!told) {
      this.radio(
        'BU SARI',
        isBossDay(s.day)
          ? 'Langit hitam lagi... Muson balik malam ini. Habiskan koin di bengkel!'
          : morningLines[s.day] ?? `Pagi hari ${s.day}. Patroli lanjut, malam nanti makin ganas.${news}`
      );
    }
    this.touchSave();
  }

  /* ================================================================ side jobs */

  private makeJob(j: NonNullable<StoryState['job']>): Job {
    switch (j.kind) {
      case 'dolphin':
        return new DolphinJob(this, j);
      case 'boat':
        return new BoatJob(this, j);
      case 'raid':
        return new RaidJob(this, j);
      case 'trawl':
        return new TrawlJob(this, j);
      case 'waste':
        return new WasteJob(this, j);
      case 'calf':
        return new CalfJob(this, j);
      case 'fire':
        return new FireJob(this, j);
      case 'boss':
        return new BossJob(this, j);
    }
  }

  private start(kind: JobKind, story: boolean, variant: number): void {
    const s = this.s;
    s.job = newJob(s, kind, story, variant);
    s.marks[`start:${s.job.id}`] = s.clock;
    this.run = this.makeJob(s.job);
    this.run.enter(false);
    this.touchSave();
  }

  abandon(): void {
    this.run?.clear();
    this.run = null;
  }

  settle(job: Job, result: JobResult, pay: number, at: Point, label: string): void {
    const s = this.s;
    const j = s.job;
    if (!j || this.run !== job || s.log.some((r) => r.id === j.id)) return;
    job.clear();
    s.log.push({
      id: j.id,
      kind: j.kind,
      result,
      pay,
      dP: s.pollution - j.p0,
      chapter: s.day,
      at: Math.round(s.clock),
    });
    if (s.log.length > 60) s.log.shift();
    delete s.marks[`start:${j.id}`];
    s.job = null;
    this.run = null;
    s.calmUntil = s.clock + CALM;
    if (pay > 0) this.sim.award(pay, at.x, at.y, label, '#ffe07d');
    else if (label) this.sim.text(at.x, at.y, label, '#ffe07d', 1.2);
    if (pay > 0) this.sim.audio.playAchievementClaim();
    this.afterJob(j.kind, result);
    this.touchSave();
  }

  private afterJob(kind: JobKind, result: JobResult): void {
    const s = this.s;
    const ok = result === 'done';
    if (kind === 'boat' && s.marks.lastBoat) {
      delete s.marks.lastBoat;
      if (ok) {
        s.marks.fender = 1;
        this.sim.text(PIER_END.x, PIER_END.y, 'PELINDUNG BAMBU +1', '#8ef0c0', 1);
      }
    }
    if (kind === 'dolphin' && ok) {
      s.flags.dolphin = true;
      s.saved.dolphins += 1;
      this.view.rope = 0;
      this.handing = 'dolphin';
      if (!this.sim.hooks.filming()) this.afterDolphin();
    } else if (kind === 'boat' && ok) {
      if (!s.flags.damar) {
        s.flags.damar = true;
        this.view.handover = 4;
        this.radio('PAK DAMAR', 'Makasih, nak! Hati-hati, di luar karang banyak kapal layar robek. Nunggu malam dio tu.');
      } else {
        this.radio('PAK DAMAR', 'Merapat aman! Ini ikan, jual buat modal bengkel.');
      }
    } else if (kind === 'trawl' && ok) {
      s.flags.trawl = true;
      this.radio('PAK DAMAR', 'Ikannyo lolos, pukatnyo mundur. Mantap!');
    } else if (kind === 'waste' && ok) {
      s.flags.waste = true;
      this.radio('PAK DAMAR', 'Tumpahannyo beres. Pantai bersih lagi.');
    } else if (kind === 'calf' && ok) {
      s.flags.calf = true;
      this.radio('BU SARI', 'Induk samo anaknyo lewat. Aman!');
    } else if (kind === 'boss' && ok) {
      s.flags.boss = true;
      s.marks.bossDown = s.clock;
      if (!this.talk('bossDown')) this.radio('BU SARI', 'Kapal induknyo kabur lagi! Badai reda.');
      this.sim.audio.playBirdBurst(0.8);
    }
  }

  afterDolphin(): void {
    if (this.handing !== 'dolphin') return;
    this.handing = null;
    this.giveSeedling(true);
    if (!this.talk('seedling')) this.radio('BU SARI', 'Bebas lagi dio! Ado bibit bakau, sapu ke pantai kiri.');
  }

  /* ================================================================ entities owned by story */

  owns(kind: EntityKind): boolean {
    switch (kind) {
      case 'toolbox':
      case 'boat':
      case 'raider':
      case 'trawl_ship':
      case 'polluter':
      case 'trawler':
      case 'float':
      case 'drum':
      case 'pad':
      case 'drift_net':
      case 'oil':
      case 'ghost_net':
      case 'deposit':
      case 'dolphin':
        return true;
      default:
        return false;
    }
  }

  hit(e: Entity, w: Wave, px: number, py: number): Touch {
    if (e.tag === 'leaving') return 'hold';
    switch (e.kind) {
      case 'raider':
        return this.hitPirate(e, w, px, py);
      case 'toolbox':
        if (e.snagged) {
          e.snagged = false;
          this.s.box = 'loose';
          this.touchSave();
        }
        return 'push';
      case 'pad':
        if (e.actionTimer > 0) return 'hold';
        if (!w.hitMap.has(e.id)) this.padPushes += 1;
        return 'push';
      case 'oil':
        if (!w.hitMap.has(e.id)) {
          w.hitMap.set(e.id, w.age);
          e.hitFlash = 0.12;
          if (w.kind === 'directional') {
            this.sim.text(e.x, e.y - 26, 'Dorong bantalan putih ke sini', '#f2c16b', 0.8);
          }
        }
        return 'hold';
      case 'ghost_net':
      case 'deposit':
        this.lift(e, w);
        return 'hold';
      default:
        return this.run?.hit(e, w, px, py) ?? 'push';
    }
  }

  private lift(e: Entity, w: Wave): void {
    if (w.hitMap.has(e.id) || e.source === undefined) return;
    w.hitMap.set(e.id, w.age);
    e.hp -= 1;
    e.hitFlash = 0.3;
    this.sim.burst(e.x, e.y, e.kind === 'deposit' ? '#c9b48a' : '#c8fff4', 12);
    if (e.hp > 0) {
      this.sim.text(e.x, e.y - 22, e.kind === 'deposit' ? 'TERKIKIS' : 'MELONGGAR', '#c8fff4', 0.85);
      return;
    }
    const kind = e.kind;
    const q = this.dropSource(e.source);
    if (kind === 'deposit') this.s.saved.deposits += 1;
    else this.s.saved.ghosts += 1;
    this.sim.award(13, e.x, e.y - 24, `TERANGKAT${q && q.amount > 0 ? ` -${q.amount}` : ''}`, '#8ef0c0');
    this.sim.audio.playMangrovePlant(this.sim.audio.worldXToPan(e.x, WORLD_W));
  }

  move(e: Entity, dt: number): boolean {
    if (e.tag === 'leaving') {
      const tx = e.home?.x ?? WORLD_W + 160;
      const ty = e.home?.y ?? e.y;
      steer(e, tx, ty, 118, dt, 1.4, 20);
      roundRocks(e, dt);
      if (hyp(e.vx, e.vy) > 14) face(e, Math.atan2(e.vy, e.vx), dt, 2.5);
      if (e.x > WORLD_W + 110 || e.y < -100 || e.y > WORLD_H + 120) this.sim.remove(e.id);
      return true;
    }
    switch (e.kind) {
      case 'raider':
        return this.movePirate(e, dt);
      case 'toolbox':
        this.moveBox(e, dt);
        return true;
      case 'pad':
        e.actionTimer = Math.max(0, e.actionTimer - dt);
        if (e.actionTimer <= 0) {
          this.sim.drift(e, dt, 0.955, 430);
          this.absorb(e, dt);
        }
        return true;
      case 'oil':
      case 'ghost_net':
      case 'deposit':
        e.vx = 0;
        e.vy = 0;
        return true;
      default:
        return this.run?.move(e, dt) ?? false;
    }
  }

  private moveBox(e: Entity, dt: number): void {
    if (e.snagged) {
      e.vx = 0;
      e.vy = 0;
      return;
    }
    const bx = PIER_END.x - e.x;
    const by = PIER_END.y - e.y;
    const bd = hyp(bx, by) || 1;
    if (bd < 92) {
      e.vx += (bx / bd) * 46 * dt;
      e.vy += (by / bd) * 46 * dt;
    }
    this.sim.drift(e, dt, 0.955, 380);
    const rx = e.x - MOORING.x;
    const ry = e.y - MOORING.y;
    const rd = hyp(rx, ry);
    if (rd > MOORING_ROPE) {
      const nx = rx / rd;
      const ny = ry / rd;
      e.x = MOORING.x + nx * MOORING_ROPE;
      e.y = MOORING.y + ny * MOORING_ROPE;
      const out = e.vx * nx + e.vy * ny;
      if (out > 0) {
        e.vx -= out * 1.3 * nx;
        e.vy -= out * 1.3 * ny;
      }
    }
    if (hyp(e.x - PIER_END.x, e.y - PIER_END.y) < REACH_PIER) this.boxHome(e);
  }

  private boxHome(e: Entity): void {
    const s = this.s;
    this.sim.remove(e.id);
    s.box = 'home';
    s.flags.toolbox = true;
    this.sim.progress.shopUnlocked = true;
    s.marks.workshop = s.clock;
    // Pause Day 1 timer during onboarding step 3 so the player can calmly visit Bengkel & buy their 1st tool!
    s.cycle = 'prep';
    s.step = 'shop';
    s.day = 1;
    s.chapter = 1;
    s.dayTime = 0;
    this.view.handover = 4;
    this.sim.burst(PIER_END.x, PIER_END.y, '#ffe07d', 24);
    this.sim.audio.playShopUnlock();
    // enough for Muatan, the tool the workshop walks the player through
    const wage = Math.max(35, getUpgradeCost('trash_density', 0) - this.sim.progress.coins);
    this.sim.award(wage, PIER_END.x + 22, PIER_END.y - 26, 'UPAH DERMAGA!', '#ffe07d');
    this.sim.hooks.banner('BENGKEL TERBUKA!', 'Buka Bengkel [E] & pasang Muatan untuk memulai Hari 1!', 'gold');
    if (!this.talk('workshop')) this.radio('BU SARI', 'Bengkel la buka. Tombolnyo di kanan bawah.');
    this.touchSave();
  }

  private beginDayOne(): void {
    const s = this.s;
    s.cycle = 'day';
    s.step = 'day';
    s.day = 1;
    s.chapter = 1;
    s.dayTime = 0;
    s.supplyTimer = 1.5;
    s.skirmishTimer = 14;
    s.sideEventTimer = 42;
    this.burstSalvage(6);
    this.sim.hooks.banner('HARI 1 · SIAPKAN PERTAHANAN!', 'Sapu sampah untuk koin · Tahan gelombang bajak laut saat Malam tiba!', 'green');
    if (!this.talk('dayOne')) this.radio('A.L.U.N.', 'Jalur Pasang siap. Tahan sampai tiga panah muncul, geser lalu lepas.');
    this.touchSave();
  }

  leaveWorkshop(): boolean {
    const s = this.s;
    if (!s.flags.toolbox) return false;
    let changed = false;
    this.readyFor = 0;
    if (s.marks.workshopVisit === undefined) {
      s.marks.workshopVisit = s.clock;
      changed = true;
    }
    if (s.cycle === 'prep' && s.step === 'shop') {
      this.beginDayOne();
      changed = true;
    }
    if (this.dawnShopPending()) {
      delete s.marks.dawnShop;
      delete s.marks.dawnShopAt;
      this.sim.hooks.banner(`HARI ${s.day} DIMULAI!`, 'Sapu rongsok jadi koin · Malam nanti bajak laut datang lagi.', 'green');
      changed = true;
    }
    return changed;
  }

  /** Dawn has come and the player has not been to the workshop yet: the day waits. */
  dawnShopPending(): boolean {
    const s = this.s;
    return s.cycle === 'day' && s.flags.toolbox && s.marks.dawnShop === s.day;
  }

  /** Time for the workshop to open by itself (a moment after dawn, so the night's reward can land). */
  dawnShopDue(): boolean {
    return this.dawnShopPending() && this.s.clock >= (this.s.marks.dawnShopAt ?? 0);
  }

  /** Tools the purse can pay for right now, cheapest first, as "Tenaga Lv 3". */
  affordableNames(): string[] {
    const p = this.sim.progress;
    return UPGRADE_DEFS.filter((d) => isForSale(d.id, p) && p.coins >= getUpgradeCost(d.id, p.upgrades[d.id] ?? 0))
      .sort((a, b) => getUpgradeCost(a.id, p.upgrades[a.id] ?? 0) - getUpgradeCost(b.id, p.upgrades[b.id] ?? 0))
      .map((d) => `${d.shortName} Lv ${(p.upgrades[d.id] ?? 0) + 1}`);
  }

  /** The cheapest tool on sale, for the HUD (null when everything waits for a later dawn). */
  goal(): ReturnType<typeof nextGoal> {
    return nextGoal(this.sim.progress);
  }

  sendOff(e: Entity): void {
    e.tag = 'leaving';
    e.home = { x: WORLD_W + 180, y: e.y < 200 ? Math.max(180, e.y) : e.y };
    e.hp = Math.max(0.01, e.hp);
  }

  dock(variant: number): void {
    this.view.docked = { t: 0, variant };
  }

  podLeaves(): void {
    this.view.podOut = 5;
    const p = this.view.pod;
    if (p) this.podTail = { ...p };
  }

  private podTail: StoryView['pod'] = null;

  private movePodOut(dt: number): void {
    const p = this.podTail;
    if (!p) return;
    if (this.view.podOut <= 0 || this.view.pod) {
      this.podTail = null;
      return;
    }
    p.x += Math.cos(p.a) * 90 * dt;
    p.y += Math.sin(p.a) * 90 * dt;
    p.a += dt * 0.25;
  }

  get pod(): StoryView['pod'] {
    return this.view.pod ?? this.podTail;
  }

  guideTarget(e: Entity): Point | null {
    if (e.kind === 'boat' && this.s.job?.phase === 'home') return { x: VILLAGE_PIER.dockX, y: VILLAGE_PIER.dockY };
    if (e.kind === 'pad') {
      const q = this.s.sources.find((x) => x.kind === 'spill');
      return q ? { x: q.x, y: q.y } : null;
    }
    if (e.kind === 'toolbox') return PIER_END;
    return null;
  }

  /* ================================================================ HUD & objectives */

  waveHud(): WaveHudState {
    const s = this.s;
    const active = this.activePirates().length;
    const remaining = active + s.wavePlan.length;
    const repairCost = pierRepairCost(s.day);
    const progress =
      s.cycle === 'day'
        ? Math.min(1, s.dayTime / DAY_DURATION)
        : s.cycle === 'night'
          ? Math.min(1, s.nightTime / NIGHT_DURATION)
          : 0;
    return {
      day: s.day,
      cycle: s.cycle,
      dayTime: s.dayTime,
      dayDuration: DAY_DURATION,
      nightTime: s.nightTime,
      nightDuration: NIGHT_DURATION,
      progress,
      hugeFlags: s.hugeFlags,
      activePirates: active,
      remainingPirates: remaining,
      waveTotal: s.waveTotal,
      isBossNight: s.cycle === 'night' && isBossDay(s.day),
      pierHp: Math.round(s.pierHp),
      maxPierHp: Math.round(s.maxPierHp),
      shopLocked: s.cycle === 'night',
      repairCost,
      canRepair: s.cycle !== 'night' && s.pierHp < s.maxPierHp && this.sim.progress.coins >= repairCost,
    };
  }

  objective(): Objective {
    const s = this.s;
    if (s.cycle === 'prep') {
      if (s.step === 'sweep') {
        const done = 6 - s.openingLeft;
        const last = this.openingTarget === undefined ? undefined : this.sim.find(this.openingTarget);
        const next = last?.opening ? last : this.sim.entities.filter((e) => e.opening).sort((a, b) => netDist(a) - netDist(b))[0];
        this.openingTarget = next?.id;
        return {
          key: `sweep:${done}:${this.sim.progress.totalWaves > 0 ? 1 : 0}`,
          title: '1/3 · Sapu sampah ke Jaring Desa',
          progress: `${done}/6`,
          sub:
            this.sim.progress.totalWaves === 0
              ? 'Klik/sentuh di air lalu geser mengikuti panah untuk mendorong sampah masuk ke jaring.'
              : 'Lanjutkan menyapu semua sampah pembuka ke jaring agar dermaga bebas!',
          icon: 'swipe',
          swatch: 'orange',
          at: next ? { x: next.x, y: next.y } : undefined,
          swipe: next ? swipeTowards(next, COLLECTOR_NET) : undefined,
        };
      }
      if (s.step === 'shop') {
        return {
          key: 'prep:shop',
          title: '3/3 · Buka Bengkel [E] & pasang Muatan',
          progress: 'Siap',
          sub: 'Pasang Muatan di Bengkel, lalu mulai Hari 1!',
          icon: 'shop',
          swatch: 'gold',
        };
      }
      const box = this.sim.entities.find((q) => q.kind === 'toolbox');
      return {
        key: 'box',
        title: '2/3 · Antar peti perkakas ke dermaga',
        sub: 'Dorong peti Bu Sari ke ujung dermaga untuk membuka Bengkel & bonus koin!',
        icon: 'wrench',
        swatch: 'gold',
        at: box ? { x: box.x, y: box.y } : MOORING,
        swipe: box ? swipeTowards(box, PIER_END) : undefined,
      };
    }

    // Active boss or night combat takes priority
    if (s.cycle === 'night') {
      if (this.run && s.job?.kind === 'boss') return this.run.objective();
      if (s.marks.lastBoat && s.job?.kind === 'boat' && s.job.phase !== 'turn') {
        return { key: 'night:last-boat', title: 'Perahu terakhir Pak Damar', sub: 'Belokkan Pendobrak ke samping dan bantu nelayan merapat. Bambu menahan satu serangan.', icon: 'boat', swatch: 'blue' };
      }
      const pirates = this.activePirates();
      const nearest = pirates.sort((a, b) => a.x - b.x)[0];
      const rem = pirates.length + s.wavePlan.length;
      const attacking = pirates.some((p) => p.tag === 'attack');
      return {
        key: `night:${s.day}:${rem}:${attacking ? 1 : 0}`,
        title: attacking ? 'Dermaga diserang! Halau!' : `Serbuan Malam ${s.day}`,
        progress: `${rem} kapal`,
        sub: 'Hantam & dorong kapal bajak laut menjauh dari dermaga sebelum HP Dermaga habis!',
        icon: 'raider',
        swatch: attacking ? 'red' : 'orange',
        at: nearest ? { x: nearest.x, y: nearest.y } : undefined,
      };
    }

    // Daytime: active side job or skirmish pirate or farming prompt
    const pirates = this.activePirates();
    if (pirates.length > 0) {
      const p = pirates.sort((a, b) => a.x - b.x)[0];
      const firstCombat = s.day === 1 && s.piratesSunk === 0;
      return {
        key: `day:pirate:${pirates.length}:${firstCombat ? 1 : 0}`,
        title: firstCombat ? 'Halau pengintai bajak laut!' : 'Pengintai bajak laut!',
        progress: `${pirates.length} kapal`,
        sub: firstCombat
          ? 'Geser ombak ke arah lambung kapal untuk mendorongnya mundur & merusaknya sebelum mencapai dermaga!'
          : 'Dorong dan hantam kapal layar robek untuk hadiah koin dan peti rampasan.',
        icon: 'raider',
        swatch: 'red',
        at: { x: p.x, y: p.y },
        swipe: firstCombat ? swipeTowards(p, { x: p.x + 110, y: p.y < 360 ? p.y - 28 : p.y + 28 }) : undefined,
      };
    }
    if (this.run && s.job) return this.run.objective();

    const rem = Math.max(0, Math.ceil(DAY_DURATION - s.dayTime));
    const mm = `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
    const bossSoon = isBossDay(s.day);
    return {
      key: `day:${s.day}:${bossSoon ? 1 : 0}:${s.pollution > P_HEALTHY ? 1 : 0}`,
      title: bossSoon ? `Siapkan diri · Badai Muson!` : `Hari ${s.day} · Bersih-bersih & Upgrade`,
      progress: mm,
      sub:
        s.pollution > P_HEALTHY
          ? 'Sapu rongsok ke jaring untuk koin & turunkan pencemaran agar dermaga pulih gratis tiap fajar.'
          : 'Pantai bersih! Kumpulkan koin dan perkuat A.L.U.N. di Bengkel [E] sebelum malam tiba.',
      icon: bossSoon ? 'storm' : 'sun',
      swatch: bossSoon ? 'purple' : 'green',
    };
  }

  headline(): string {
    const s = this.s;
    return `Hari ${s.day} · ${dayTitle(s.day)}`;
  }
}

function freshView(): StoryView {
  return { school: { caught: 0, freed: 0, gone: 0 }, pod: null, podOut: 0, docked: null, rope: 0, handover: 0 };
}

function netDist(e: Entity): number {
  return hyp(e.x - COLLECTOR_NET.x, e.y - COLLECTOR_NET.y);
}
