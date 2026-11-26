import type { GameSimulation } from '../simulation';
import type { Entity, EntityKind, JobKind, JobResult, Point, PollutionSource, StoryState, Wave } from '../types';
import { seedInterval } from '../upgrades';
import {
  COLLECTOR_NET,
  FIRE_SPOTS,
  GHOST_SPOTS,
  getShoreX,
  MOORING,
  MOORING_ROPE,
  OPENING_TRASH,
  PIER_END,
  SPILL_SPOTS,
  VILLAGE_PIER,
  WORLD_H,
  WORLD_W,
} from '../world';
import { BoatJob, BossJob, CalfJob, DolphinJob, face, FireJob, Job, RaidJob, roundRocks, steer, swipeTowards, TrawlJob, WasteJob, type Objective, type Touch } from './jobs';
import {
  addDeposit,
  addPollution,
  CALM,
  CALM_STORY,
  chapterTitle,
  newJob,
  P_DEPOSIT,
  P_DRUM,
  P_GHOST,
  P_HEALTHY,
  P_MANGROVE,
  P_TRASH,
  PATROL,
  PAY,
  removePollution,
  roundsFor,
  SALVAGE_VALUE,
  salvageWeights,
  SUPPLY_HELD,
  SUPPLY_PER_MINUTE,
  SUPPLY_WINDOW,
  whereAt,
} from './state';

const hyp = Math.hypot;

/** Things the scene draws that are not in the water for the waves to push. */
export interface StoryView {
  school: { caught: number; freed: number; gone: number };
  pod: { x: number; y: number; a: number; swim: number; happy: number } | null;
  /** The pod on its way out to sea after a job. */
  podOut: number;
  docked: { t: number; variant: number } | null;
  rope: number;
  /** Something was just handed over at the pier end. */
  handover: number;
}

const REACH_PIER = 50;
/** Seconds the rope tightens before the film about what is at the end of it. */
const ROPE_TIME = 3;

export class Story {
  run: Job | null = null;
  view: StoryView = freshView();
  /** How often a pad was pushed since the last one was absorbed, for the hint. */
  padPushes = 0;
  private saveSoon = false;
  private openingTarget?: number;
  private offered = false;
  private handing: 'dolphin' | null = null;
  private pickDry = 0;

  constructor(readonly sim: GameSimulation) {}

  get s(): StoryState {
    return this.sim.progress.story;
  }

  radio(sender: string, text: string): void {
    this.sim.hooks.radio(sender, text);
  }

  /** Ask for a save at the end of this frame, so that everything that belongs together is in it. */
  touchSave(): void {
    this.saveSoon = true;
  }

  /* ================================================================ entering and leaving the water */

  /**
   * Puts the lagoon together from the story's data. The water is empty when this runs. Without
   * `opening` the six pieces stay out of it: the film throws them, see `layOpening`.
   */
  load(opening = true): void {
    const s = this.s;
    this.run = null;
    this.view = freshView();
    this.openingTarget = undefined;
    this.padPushes = 0;
    this.offered = false;
    this.handing = null;

    if (s.step === 'migrated') this.advance();
    for (const t of s.trash) {
      const e = this.sim.addTrash(t.kind, t.x, t.y, t.variant);
      e.vx = 0;
      e.vy = 0;
      e.snagged = t.snagged;
      e.stranded = t.stranded;
      e.opening = t.opening;
      e.pollution = t.pollution;
      e.age = 1;
    }
    if (opening && s.chapter === 1 && s.step === 'sweep') this.layOpening();
    if (s.box === 'snagged' || s.box === 'loose') this.spawnBox();
    for (const q of s.sources) this.materialise(q);
    if (s.flags.seedling && !s.flags.planted) this.giveSeedling(false);
    if (s.flags.dolphin && !s.flags.seedling) this.giveSeedling(true);
    if (s.job) {
      this.run = this.makeJob(s.job);
      this.run.enter(true);
    }
    this.sim.netClosed = this.run instanceof RaidJob && this.run.closesNet;
  }

  /** The six pieces that close the pier, or those of them that are still missing from the water. */
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

  /** Copies what floats into the state, right before a save. */
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
        if (e.opening) t.opening = true;
        if (e.pollution) t.pollution = e.pollution;
        return t;
      });
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

  /* ================================================================ pollution */

  /** A drum broke here. Returns the new spill's id, or 0 when there was only room for deposits. */
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

  /** A trawl got away and what is left of it hangs on the coral. */
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
    this.radio('PAK DAMAR', 'Kawanannya terangkat, dan sisa pukatnya tersangkut di karang.');
  }

  /** Pollution nobody can see any more still lies under the sand, in pieces that can be lifted. */
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

  /** A piece reached the net: pays in full, and takes back what it had spoiled. */
  collected(e: Entity): void {
    const s = this.s;
    if (e.pollution) {
      removePollution(s, e.pollution);
      e.pollution = 0;
    }
    if (e.opening) {
      s.openingLeft = Math.max(0, s.openingLeft - 1);
      e.opening = false;
    }
    this.touchSave();
  }

  /** The first hidden deposit comes to light. */
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

  /** Pads can be had: the village has the gear, or chapter 6 is handing it out right now. */
  private get padsAvailable(): boolean {
    return this.s.flags.waste || (this.s.job?.kind === 'waste' && this.s.job.phase === 'clean');
  }

  /** Everything that can be lifted or absorbed right now, with the basic wave. */
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
    if (s.sources.some((q) => q.kind === 'deposit' && q.shown)) {
      return;
    }
    const others = this.tasks().some((t) => t.kind !== 'deposit');
    const want = s.pollution > P_HEALTHY || (s.flags.ending && s.pollution > 0 && !s.job);
    if (others || !want) return;
    const q = this.showDeposit();
    if (q && !this.offered) {
      this.offered = true;
      this.radio('PAK DAMAR', 'Di tepi pantai itu ada endapan lama. Sapu ombak ke sana sampai terangkat.');
    }
  }

  private padTick(dt: number): void {
    const s = this.s;
    const spills = s.sources.filter((q) => q.kind === 'spill');
    const pads = this.sim.entities.filter((e) => e.kind === 'pad');
    if (!this.padsAvailable || spills.length === 0) {
      for (const p of pads) this.sim.remove(p.id);
      return;
    }
    if (pads.length > 0) {
      // one that was pushed out of reach is fetched back and thrown again
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
      e.hp -= dt * 0.95;
      e.hitFlash = 0.1;
      // it drags through the oil
      p.vx *= Math.pow(0.12, dt);
      p.vy *= Math.pow(0.12, dt);
      if (Math.random() < dt * 14) this.sim.burst(p.x, p.y, '#4a3b5c', 1, 'foam');
      if (e.hp <= 0) {
        this.s.saved.spills += 1;
        const q = this.dropSource(e.source);
        this.sim.remove(p.id);
        this.padPushes = 0;
        this.sim.text(e.x, e.y - 30, `TERSERAP${q && q.amount > 0 ? ` -${q.amount}` : ''}`, '#8ef0c0', 1.1);
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
    // roots hold back the old dirt of the shore
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

  /* ================================================================ the tide */

  valuedCount(): number {
    let n = 0;
    for (const e of this.sim.entities) if (SALVAGE_VALUE[e.kind] !== undefined) n += 1;
    return n;
  }

  /** How many more valued pieces the tide may bring at this moment. */
  quota(): number {
    const s = this.s;
    while (s.arrivals.length && s.arrivals[0] <= s.clock - SUPPLY_WINDOW) s.arrivals.shift();
    return Math.max(0, Math.min(SUPPLY_PER_MINUTE - s.arrivals.length, SUPPLY_HELD - this.valuedCount()));
  }

  /** Books a valued piece against the quota. False when the tide has nothing left to give. */
  arrive(): boolean {
    if (this.quota() <= 0) return false;
    this.s.arrivals.push(this.s.clock);
    return true;
  }

  private pickSalvage(): EntityKind {
    const w = salvageWeights(this.s.flags, this.sim.stats.rarityLevel);
    let roll = Math.random() * w.reduce((a, [, k]) => a + k, 0);
    for (const [kind, k] of w) if ((roll -= k) < 0) return kind;
    return 'trash_bottle';
  }

  private supplyTick(dt: number): void {
    const s = this.s;
    if (!s.flags.toolbox) return;
    s.supplyTimer -= dt;
    if (s.supplyTimer > 0) return;
    const st = this.sim.stats;
    const want = st.supplyClusterMin + Math.floor(Math.random() * (st.supplyClusterMax - st.supplyClusterMin + 1));
    const n = Math.min(want, this.quota());
    s.supplyTimer = st.supplyInterval * Math.max(1, want);
    if (n <= 0) {
      s.supplyTimer = 2;
      return;
    }
    const ax = 930 + Math.random() * 260;
    const ay = 100 + Math.random() * (WORLD_H - 200);
    for (let i = 0; i < n; i++) {
      if (!this.arrive()) break;
      const x = ax + (i ? (Math.random() - 0.5) * 120 : 0);
      const y = Math.max(60, Math.min(WORLD_H - 60, ay + (i ? (Math.random() - 0.5) * 120 : 0)));
      this.sim.addTrash(this.pickSalvage(), x, y);
    }
  }

  private seedTick(dt: number): void {
    const s = this.s;
    const lv = this.sim.stats.mangroveLevel;
    if (lv <= 0 || this.sim.progress.mangroves.length >= 19) return;
    s.seedTimer -= dt;
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

  /* ================================================================ the frame */

  update(dt: number): void {
    const s = this.s;
    s.clock += dt;
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
    this.chapterTick();
    if (s.job && this.run) {
      s.job.t += dt;
      s.job.total += dt;
      this.run.update(dt);
    }
    this.sim.netClosed = this.run instanceof RaidJob && this.run.closesNet;
    this.movePodOut(dt);
    if (this.saveSoon) {
      this.saveSoon = false;
      this.sim.hooks.save();
    }
  }

  private calm(): boolean {
    return this.s.clock >= this.s.calmUntil && !this.sim.drag.active && !this.sim.hooks.filming();
  }

  private chapterTick(): void {
    const s = this.s;
    if (s.job) return;
    switch (s.step) {
      case 'sweep':
        if (s.openingLeft <= 0) {
          s.step = 'box';
          s.box = 'snagged';
          s.boxAt = { ...MOORING };
          this.spawnBox();
          this.sim.burst(MOORING.x, MOORING.y, '#e5ffff', 16, 'foam');
          this.sim.audio.playShopUnlock();
          this.radio('BU SARI', 'Itu peti perkakasku, tersangkut di bawah tambatan! Dorong ke ujung dermaga, ya.');
          this.touchSave();
        }
        return;
      case 'box':
        return;
      case 'rope':
        s.marks.rope ??= s.clock;
        this.view.rope = Math.min(1, (s.clock - s.marks.rope) / 2.2);
        if (s.clock - s.marks.rope >= ROPE_TIME && this.calm()) this.start('dolphin', true, 0);
        return;
      case 'wait':
        if (!this.calm()) return;
        if (s.rounds > 0) {
          const plan = roundsFor(s.chapter, s.flags.calf);
          const i = Math.max(0, plan.length - s.rounds);
          const kind = plan[i] ?? 'raid';
          this.start(kind, false, (i + s.chapter) % 2);
          return;
        }
        if (s.chapter === 3) this.start('boat', true, 0);
        else if (s.chapter === 4) this.start('raid', true, 0);
        else if (s.chapter === 5) this.start('trawl', true, 0);
        else if (s.chapter === 6) this.start('waste', true, 0);
        else if (s.chapter === 7) this.start(s.flags.calf ? 'raid' : 'calf', true, s.flags.calf ? 1 : 0);
        return;
      case 'healthy':
        if (s.pollution <= P_HEALTHY) {
          this.openOperation();
          return;
        }
        this.recurring();
        return;
      case 'call':
        if (s.callAnswered) {
          if (this.calm()) {
            s.step = 'boss';
            this.start('boss', true, 0);
          }
          return;
        }
        this.recurring();
        return;
      case 'clean':
        if (s.pollution <= P_HEALTHY && s.clock - (s.marks.bossDown ?? 0) > 6 && !this.sim.drag.active) this.finishStory();
        return;
      case 'patrol':
        this.recurring();
        return;
    }
  }

  /** Every four turns: one dolphin, one fisher and two ships; raiders come every other ship. */
  private recurring(): void {
    if (!this.calm()) return;
    const s = this.s;
    const slot = s.turn % 4;
    const round = Math.floor(s.turn / 4);
    s.turn += 1;
    if (slot === 0) {
      this.start('calf', false, round % 2);
    } else if (slot === 2) {
      if (s.flags.ending && this.sim.stats.forestLevel > 0 && round % 3 === 2) {
        this.start('fire', false, round % FIRE_SPOTS.length);
      } else {
        this.start('boat', false, round % 3);
      }
    } else {
      const kind: JobKind = (['raid', 'trawl', 'raid', 'waste'] as const)[s.threat % 4];
      s.threat += 1;
      this.start(kind, false, s.threat % 2);
    }
  }

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

  /** Drops whatever is going on without a word (new game, reset). */
  abandon(): void {
    this.run?.clear();
    this.run = null;
  }

  /**
   * Ends a job: result, pollution change and pay go into the state together, and into one save. A job
   * that is already in the book cannot pay again.
   */
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
      chapter: s.chapter,
      at: Math.round(s.clock),
    });
    if (s.log.length > 60) s.log.shift();
    delete s.marks[`start:${j.id}`];
    s.job = null;
    this.run = null;
    s.calmUntil = s.clock + (j.story ? CALM_STORY : CALM + 1);
    if (pay > 0) this.sim.award(pay, at.x, at.y, label, '#ffe07d');
    else if (label) this.sim.text(at.x, at.y, label, '#ffe07d', 1.2);
    if (pay > 0) this.sim.audio.playAchievementClaim();
    this.afterJob(j.kind, result, j.story, j.variant);
    this.touchSave();
  }

  private afterJob(kind: JobKind, result: JobResult, story: boolean, variant: number): void {
    const s = this.s;
    const ok = result === 'done';
    if (!story && ok && s.step === 'wait' && s.rounds > 0) s.rounds -= 1;
    if (kind === 'dolphin' && ok) {
      s.flags.dolphin = true;
      s.saved.dolphins += 1;
      this.view.rope = 0;
      this.handing = 'dolphin';
      // the film ends in its own time; without one the gifts are handed over at once
      if (!this.sim.hooks.filming()) this.afterDolphin();
    } else if (kind === 'boat' && ok) {
      if (!s.flags.damar) {
        s.flags.damar = true;
        s.baskets = 2;
        this.view.handover = 4;
        this.radio(
          'PAK DAMAR',
          'Terima kasih! Dua keranjang ikan dan kumparan pasang untuk bengkel. Tadi ada kapal luar memakai pelampung bergaris yang sama.'
        );
        this.sim.hooks.celebrate('Kumparan Pasang tiba di bengkel!', 'blue');
      } else {
        this.radio('PAK DAMAR', 'Sudah merapat, terima kasih!');
      }
    } else if (kind === 'raid') {
      if (ok && story && variant === 1) {
        s.flags.night = true;
        s.beacon = true;
        s.marks.beacon = s.clock;
        this.radio('PAK DAMAR', 'Bekal sudah dibongkar. Suar menyala!');
        this.sim.hooks.celebrate('Suar desa menyala!', 'gold');
      } else if (ok) {
        if (!s.flags.cargo) {
          s.flags.cargo = true;
          this.radio('BU SARI', 'Muatannya selamat. Mulai sekarang warga berjaga di dermaga, dan sonar boleh dipasang.');
          this.sim.hooks.celebrate('Muatan selamat! Sonar & Gema masuk bengkel', 'teal');
        } else {
          this.radio('BU SARI', 'Muatannya selamat. Warga menyimpannya sekarang.');
        }
      } else {
        this.radio('PAK DAMAR', 'Dua-duanya dibawa lari. Nelayan berikutnya membawa muatan baru, jaga ya.');
      }
      s.baskets = 0;
    } else if (kind === 'trawl') {
      if (ok && !s.flags.trawl) {
        s.flags.trawl = true;
        this.radio('PAK DAMAR', 'Ikannya lolos! Di belakang kapal itu ada pengangkut yang menurunkan drum ke laut.');
      } else if (ok) {
        this.radio('PAK DAMAR', 'Kawanannya lolos lagi.');
      }
    } else if (kind === 'waste') {
      if (ok && !s.flags.waste) {
        s.flags.waste = true;
        this.radio('PAK DAMAR', 'Bersih. Kata radio, armada besar menunggu muson untuk masuk.');
        this.sim.hooks.celebrate('Bengkel: alat tingkat 3 terbuka', 'purple');
      } else if (ok) {
        this.radio('PAK DAMAR', 'Batu itu bersih lagi.');
      }
    } else if (kind === 'calf') {
      if (ok && !s.flags.calf) {
        s.flags.calf = true;
        s.rounds = roundsFor(7, true).length;
        this.radio('BU SARI', 'Keduanya lewat! Malam ini kita berjaga bersama.');
      }
    } else if (kind === 'boss' && ok) {
      s.flags.boss = true;
      s.marks.bossDown = s.clock;
      this.radio('BU SARI', 'Kapal induk mundur, badai reda! Tinggal pantainya.');
      this.sim.audio.playBirdBurst(0.7);
    }
    this.advance();
  }

  /** Moves the story to wherever its flags say it is. */
  advance(): void {
    const s = this.s;
    const before = s.chapter;
    const to = whereAt(s.flags, s.openingLeft, s.callAnswered);
    s.chapter = to.chapter;
    s.step = to.step;
    if (s.step === 'rope') s.marks.rope ??= s.clock;
    if (s.chapter !== before) {
      if (s.step === 'wait') s.rounds = roundsFor(s.chapter, s.flags.calf).length;
      s.marks[`bab${s.chapter}`] = s.clock;
      this.sim.hooks.chapter(s.chapter);
    }
    this.touchSave();
  }

  /** Called when the dolphin's film has ended, or at once when there is none. */
  afterDolphin(): void {
    if (this.handing !== 'dolphin') return;
    this.handing = null;
    this.giveSeedling(true);
    this.radio(
      'BU SARI',
      'Induknya sudah lewat! Pak Damar bisa masuk lewat celah yang sama. Bantu perahunya kalau terseret arus.'
    );
    this.sim.hooks.celebrate('Jaring & Pemandu masuk bengkel!', 'green');
  }

  private openOperation(): void {
    this.s.flags.ops = true;
    this.sim.audio.playShopUnlock();
    this.radio('RADIO BENGKEL', 'Operasi Badai Muson siap, gratis. Jawab di bengkel kapan pun kamu siap.');
    this.sim.hooks.celebrate('Radio bengkel: Operasi Badai Muson', 'red');
    this.advance();
  }

  /** The player answers the night watch's call from the workshop. */
  answerCall(): boolean {
    const s = this.s;
    if (!s.flags.ops || s.flags.boss || s.callAnswered) return false;
    s.callAnswered = true;
    if (!s.job && s.step !== 'call') this.advance();
    this.radio('BU SARI', 'Aku bersiaga di suar. Begitu laut tenang, mereka masuk.');
    this.touchSave();
    return true;
  }

  private finishStory(): void {
    const s = this.s;
    if (s.flags.ending) return;
    s.flags.ending = true;
    this.sim.progress.victoryAchieved = true;
    s.marks.ending = s.clock;
    s.calmUntil = s.clock + CALM + 1;
    s.jobSeq += 1;
    s.log.push({ id: `ending-${s.jobSeq}`, kind: 'boss', result: 'done', pay: PAY.ending, dP: 0, chapter: 8, at: Math.round(s.clock) });
    this.sim.award(PAY.ending, VILLAGE_PIER.dockX + 20, VILLAGE_PIER.dockY - 30, 'CERITA TAMAT', '#ffe07d');
    this.advance();
    this.sim.hooks.ending();
  }

  /* ================================================================ things in the water */

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

  /** A wave reached something of the story's. */
  hit(e: Entity, w: Wave, px: number, py: number): Touch {
    if (e.tag === 'leaving') return 'hold';
    switch (e.kind) {
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
            this.sim.text(e.x, e.y - 26, this.padsAvailable ? 'Perlu bantalan penyerap' : 'Minyak lama menempel', '#f2c16b', 0.8);
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
    if (w.hitMap.has(e.id) || w.kind === 'buoy_pulse' || e.source === undefined) return;
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
    this.sim.text(e.x, e.y - 24, `TERANGKAT${q && q.amount > 0 ? ` -${q.amount}` : ''}`, '#8ef0c0', 1.1);
    this.sim.audio.playMangrovePlant(this.sim.audio.worldXToPan(e.x, WORLD_W));
  }

  /** Moves something of the story's. False leaves it to the ordinary drift. */
  move(e: Entity, dt: number): boolean {
    if (e.tag === 'leaving') {
      const tx = e.home?.x ?? WORLD_W + 160;
      const ty = e.home?.y ?? e.y;
      steer(e, tx, ty, 104, dt, 1.3, 20);
      roundRocks(e, dt);
      if (hyp(e.vx, e.vy) > 14) face(e, Math.atan2(e.vy, e.vx), dt, 2.4);
      if (e.x > WORLD_W + 110 || e.y < -100) this.sim.remove(e.id);
      return true;
    }
    switch (e.kind) {
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
    // within reach Bu Sari helps it along with the boat hook
    const bx = PIER_END.x - e.x;
    const by = PIER_END.y - e.y;
    const bd = hyp(bx, by) || 1;
    if (bd < 92) {
      e.vx += (bx / bd) * 46 * dt;
      e.vy += (by / bd) * 46 * dt;
    }
    this.sim.drift(e, dt, 0.955, 380);
    // its own rope keeps it on the pier's side of the bay
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
    s.step = 'workshop';
    s.supplyTimer = 5;
    this.view.handover = 4;
    this.sim.burst(PIER_END.x, PIER_END.y, '#ffe07d', 22);
    this.sim.audio.playShopUnlock();
    this.radio('BU SARI', 'Ketemu! Sekarang aku bisa memasang alat untuk ombakmu. Mampir ke bengkel, yuk.');
    this.touchSave();
  }

  /** The first visit ends when the player returns to the water, with or without buying a tool. */
  leaveWorkshop(): boolean {
    if (!this.s.flags.toolbox || this.s.marks.workshopVisit !== undefined) return false;
    this.s.marks.workshopVisit = this.s.clock;
    if (this.s.step === 'workshop') {
      this.s.marks.rope = this.s.clock;
      this.advance();
      this.radio('BU SARI', 'Lihat, tali petinya menegang. Ada yang terjerat di karang!');
    }
    return true;
  }

  /** A ship gives up and runs for the open sea. It is no longer part of any job. */
  sendOff(e: Entity): void {
    e.tag = 'leaving';
    e.home = { x: WORLD_W + 180, y: e.y < 200 ? Math.max(180, e.y) : e.y };
    e.hp = Math.max(0.01, e.hp);
  }

  /** A fisher's boat lies at the pier for a while. */
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

  /** The pod wherever it is, in a job or on its way out. */
  get pod(): StoryView['pod'] {
    return this.view.pod ?? this.podTail;
  }

  /** Where a guided wave should carry this, or null to leave it to the wave. */
  guideTarget(e: Entity): Point | null {
    if (e.kind === 'boat' && this.s.job?.phase === 'home') return { x: VILLAGE_PIER.dockX, y: VILLAGE_PIER.dockY };
    if (e.kind === 'pad') {
      const q = this.s.sources.find((x) => x.kind === 'spill');
      return q ? { x: q.x, y: q.y } : null;
    }
    if (e.kind === 'toolbox') return PIER_END;
    return null;
  }

  /* ================================================================ what the player is told */

  private recovery(prefix: string): Objective {
    const s = this.s;
    const t = this.tasks()[0];
    const p = Math.round(s.pollution);
    const title = `Turunkan pencemaran ke ${P_HEALTHY} · kini ${p}`;
    if (!t) {
      return { key: `${prefix}:none:${p}`, title, sub: 'Sapu rongsok sebelum terdampar di pantai.', icon: 'eco', swatch: 'teal' };
    }
    const pad = this.sim.entities.find((e) => e.kind === 'pad' && e.actionTimer <= 0);
    const at = t.kind === 'spill' && pad ? { x: pad.x, y: pad.y } : t.at;
    const sub =
      t.kind === 'spill'
        ? pad
          ? `Dorong bantalan putih melintasi tumpahan · ${t.n} tersisa`
          : `Nelayan menyiapkan bantalan untuk tumpahan · ${t.n} tersisa`
        : t.kind === 'ghost_net'
          ? `Sapu jaring hantu di karang sampai terangkat · ${t.n} tersisa`
          : t.kind === 'trash'
            ? `Sapu sampah terdampar di sepanjang pantai ke jaring · ${t.n} tersisa`
            : 'Sapu ombak ke endapan yang ditunjuk nelayan sampai terangkat.';
    return { key: `${prefix}:${t.kind}:${t.n}:${p}:${pad ? 1 : 0}`, title, sub, icon: t.kind === 'spill' ? 'pad' : t.kind === 'ghost_net' ? 'net' : 'eco', swatch: 'teal', at };
  }

  /** The one objective on screen while playing. */
  objective(): Objective {
    const s = this.s;
    if (this.run && s.job) return this.run.objective();
    const wait = Math.max(0, Math.ceil(s.calmUntil - s.clock));
    switch (s.step) {
      case 'sweep': {
        const done = 6 - s.openingLeft;
        const last = this.openingTarget === undefined ? undefined : this.sim.find(this.openingTarget);
        const next = last?.opening ? last : this.sim.entities.filter((e) => e.opening).sort((a, b) => netDist(a) - netDist(b))[0];
        this.openingTarget = next?.id;
        return {
          key: `sweep:${done}`,
          title: 'Sapu sampah ke jaring',
          progress: `${done}/6`,
          sub: 'Mulai dari titik putih. Geser melewati sampah ke arah jaring, lalu lepas.',
          icon: 'swipe',
          swatch: 'orange',
          at: next ? { x: next.x, y: next.y } : undefined,
          swipe: next ? swipeTowards(next, COLLECTOR_NET) : undefined,
        };
      }
      case 'box': {
        const e = this.sim.entities.find((q) => q.kind === 'toolbox');
        return {
          key: 'box',
          title: 'Antar peti ke dermaga',
          sub: 'Geser melewati peti ke arah Bu Sari. Ulangi sampai ia menerima petinya.',
          icon: 'wrench',
          swatch: 'gold',
          at: e ? { x: e.x, y: e.y } : MOORING,
          swipe: e ? swipeTowards(e, PIER_END) : undefined,
        };
      }
      case 'workshop':
        return { key: 'workshop', title: 'Buka Bengkel Bu Sari', sub: 'Pilih tombol Bengkel di kanan bawah atau tekan E.', icon: 'wrench', swatch: 'gold' };
      case 'rope':
        return { key: 'rope', title: 'Ada tarikan dari karang', sub: 'Tunggu sebentar. Tali peti menegang dan memperlihatkan apa yang terjerat.', icon: 'rope', swatch: 'teal' };
      case 'wait':
        return this.waiting(wait);
      case 'healthy':
        return this.recovery('healthy');
      case 'call':
        if (s.callAnswered) {
          return { key: `call:${wait > 0 ? 1 : 0}`, title: 'Armada mendekat', sub: 'Kapal induk masuk begitu laut tenang. Sapu yang bisa disapu.', icon: 'storm', swatch: 'purple' };
        }
        return { key: 'call', title: 'Jawab radio di bengkel', sub: 'Operasi Badai Muson siap, gratis. Buka bengkel kapan pun kamu siap.', icon: 'radio', swatch: 'red' };
      case 'clean':
        if (s.pollution <= P_HEALTHY) {
          return { key: 'clean:done', title: 'Badai berlalu', sub: 'Pantainya pulih. Pak Damar bersiap melaut saat fajar.', icon: 'eco', swatch: 'green' };
        }
        return this.recovery('clean');
      default:
        return this.patrolling();
    }
  }

  private waiting(wait: number): Objective {
    const s = this.s;
    const failed = s.log.length > 0 && s.log[s.log.length - 1].result !== 'done';
    const sub = 'Sambil menunggu, kamu bisa menyapu sampah atau membuka Bengkel.';
    const o = (key: string, title: string, icon: string, swatch: Objective['swatch'], hint = sub): Objective => ({
      key: `${key}:${failed ? 1 : 0}`,
      title,
      sub: hint,
      progress: wait > 0 ? `${wait} dtk` : undefined,
      icon,
      swatch,
    });
    if (s.rounds > 0) {
      const plan = roundsFor(s.chapter, s.flags.calf);
      const i = Math.max(0, plan.length - s.rounds);
      const kind = plan[i] ?? 'raid';
      const who = kind === 'raid' ? 'Penjarah' : kind === 'trawl' ? 'Kapal pukat' : 'Kapal drum';
      const icon = kind === 'raid' ? 'raider' : kind === 'trawl' ? 'float' : 'drum';
      return o(`wait:round:${i}`, `${who} datang lagi · gelombang ${i + 1}/${plan.length}`, icon, failed ? 'red' : 'orange');
    }
    switch (s.chapter) {
      case 3:
        return o('wait:boat', failed ? 'Pak Damar akan mencoba lagi' : 'Tunggu perahu Pak Damar', 'boat', 'blue', 'Perahu nelayan akan masuk dari laut. Siapkan ombak untuk membantunya melewati batu.');
      case 4:
        return o('wait:raid', failed ? 'Muatan baru segera tiba' : 'Waspadai kapal penjarah', 'basket', 'orange', 'Saat kapal berlayar robek datang, hantam lambungnya untuk menjaga keranjang ikan.');
      case 5:
        return o('wait:trawl', failed ? 'Kapal pukat akan kembali' : 'Cari pemilik pelampung bergaris', 'float', 'blue');
      case 6:
        return o('wait:waste', failed ? 'Kapal drum akan kembali' : 'Awasi kapal pengangkut drum', 'drum', 'gold');
      default:
        return s.flags.calf
          ? o('wait:night', failed ? 'Bekal suar dicoba dibawa lagi' : 'Siapkan jaga malam', 'beacon', 'purple')
          : o('wait:calf', failed ? 'Induk dan anak akan kembali' : 'Awasi jalur ikan', 'dolphin', 'teal');
    }
  }

  private patrolling(): Objective {
    const s = this.s;
    if (s.pollution > P_HEALTHY) return this.recovery('patrol');
    const dep = this.tasks().find((t) => t.kind === 'deposit');
    return {
      key: `patrol:${dep ? 1 : 0}`,
      title: 'Patroli Laguna',
      sub: dep ? 'Laut tenang. Endapan lama di tepi pantai bisa diangkat.' : 'Laut tenang. Sapu rongsok sebelum terdampar.',
      icon: 'wave',
      swatch: 'green',
      at: dep?.at,
    };
  }

  /** Short line for the workshop: what is going on outside. */
  headline(): string {
    return this.s.chapter >= PATROL ? 'Patroli Laguna' : `Bab ${this.s.chapter} · ${chapterTitle(this.s.chapter)}`;
  }
}

function freshView(): StoryView {
  return { school: { caught: 0, freed: 0, gone: 0 }, pod: null, podOut: 0, docked: null, rope: 0, handover: 0 };
}

function netDist(e: Entity): number {
  return hyp(e.x - COLLECTOR_NET.x, e.y - COLLECTOR_NET.y);
}

