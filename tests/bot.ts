import { loadGame, saveGame, type Store } from '../src/save';
import { GameSimulation, isTrashKind } from '../src/simulation';
import { BoatJob, BossJob, CalfJob, RaidJob, TrawlJob, WasteJob } from '../src/story/jobs';
import { CALM, heldPollution, SALVAGE_VALUE, SUPPLY_HELD, SUPPLY_PER_MINUTE } from '../src/story/state';
import type { Entity, JobRecord, PlayerProgress, Point, UpgradeId } from '../src/types';
import { computeStats, getUpgradeCost, hasBlueprint, isForSale, UPGRADE_DEFS } from '../src/upgrades';
import { COLLECTOR_NET, getShoreX, PIER_END, SEA_ROCKS, SPAWNING_GROUND, VILLAGE_PIER } from '../src/world';

/** The lagoon without a page around it: the real simulation, a hand that swipes, and a ledger. */

export class MemoryStore implements Store {
  data = new Map<string, string>();
  broken = false;
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.broken) throw new Error('quota');
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

export function seedRandom(seed: number): void {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const silent = new Proxy(
  {},
  {
    get: (_t, k) => (k === 'worldXToPan' ? () => 0 : () => undefined),
  }
) as never;

export type Style = 'biasa' | 'tanpa' | 'sejuta' | 'diam' | 'lambat';

const SHOPPING: UpgradeId[] = [
  'wave_width',
  'wave_power',
  'wave_power',
  'ai_guide',
  'wave_power',
  'net_expand',
  'tidal_energy',
  'echo_wave',
  'energy_regen',
];

export interface Violation {
  at: number;
  what: string;
}

export class Session {
  sim: GameSimulation;
  progress: PlayerProgress;
  income: { at: number; amount: number }[] = [];
  violations: Violation[] = [];
  chapters: { n: number; at: number }[] = [];
  bought: { id: UpgradeId; at: number; level: number }[] = [];
  firstBlueprint = -1;
  workshop = -1;
  endingAt = -1;
  worstP = 0;
  radio: string[] = [];
  saves = 0;
  starts: { id: string; at: number; calm: number }[] = [];
  private lastJob: string | null = null;
  private jobEnd = -1;
  private reloaded = true;
  private lastEarned: number;
  private cool = 0;
  private think = 0;
  private key = '';
  private plannedDrag: { from: Point; to: Point; hold: number } | null = null;

  constructor(
    readonly store: MemoryStore,
    readonly style: Style,
    coins = 0
  ) {
    const loaded = loadGame(store);
    this.progress = loaded.progress;
    if (coins) this.progress.coins = coins;
    this.lastEarned = this.progress.totalCoinsEarned;
    this.sim = new GameSimulation(silent, {
      radio: (who, text) => this.radio.push(`${who}: ${text}`),
      coins: () => {},
      save: () => this.save(),
      chapter: (n) => this.chapters.push({ n, at: this.clock }),
      celebrate: () => {},
      dolphin: () => false,
      filming: () => false,
      worsen: () => {},
      ending: () => {
        this.endingAt = this.clock;
      },
    });
    this.sim.initLagoon(this.progress, computeStats(this.progress));
  }

  get clock(): number {
    return this.progress.story.clock;
  }

  save(): void {
    this.sim.story.snapshot();
    this.saves += 1;
    if (!saveGame(this.store, this.progress)) this.violations.push({ at: this.clock, what: 'simpan gagal' });
  }

  private fail(what: string): void {
    if (this.violations.length < 40) this.violations.push({ at: Math.round(this.clock * 10) / 10, what });
  }

  step(dt = 1 / 30): void {
    const stats = computeStats(this.progress);
    this.sim.update(dt, this.progress, stats);
    const s = this.progress.story;

    const gain = this.progress.totalCoinsEarned - this.lastEarned;
    if (gain > 0) this.income.push({ at: s.clock, amount: gain });
    this.lastEarned = this.progress.totalCoinsEarned;

    this.worstP = Math.max(this.worstP, s.pollution);
    const flags = s.flags;
    if (this.workshop < 0 && flags.toolbox) this.workshop = s.clock;
    if (this.firstBlueprint < 0 && hasBlueprint('wave_width', flags)) this.firstBlueprint = s.clock;

    // what must hold at every moment
    const valued = this.sim.entities.filter((e) => SALVAGE_VALUE[e.kind] !== undefined).length;
    if (valued > SUPPLY_HELD) this.fail(`benda bernilai ${valued} > ${SUPPLY_HELD}`);
    const recent = s.arrivals.filter((t) => t > s.clock - 60).length;
    if (recent > SUPPLY_PER_MINUTE) this.fail(`kedatangan ${recent}/60 dtk`);
    this.sim.story.snapshot();
    const held = heldPollution(this.progress);
    if (Math.abs(held - s.pollution) > 0.001) this.fail(`P ${s.pollution} != sumber ${held} (${s.chapter}/${s.step}/${s.job?.id ?? '-'})`);
    if (s.pollution < 0 || s.pollution > 100) this.fail(`P di luar batas ${s.pollution}`);
    // paid jobs keep their distance
    const job = s.job?.id ?? null;
    if (job !== this.lastJob) {
      if (this.lastJob) this.jobEnd = s.clock;
      if (job) {
        this.starts.push({ id: job, at: s.clock, calm: this.jobEnd < 0 ? Infinity : s.clock - this.jobEnd });
        if (this.jobEnd >= 0 && s.clock - this.jobEnd < CALM && !this.reloaded) this.fail(`jeda ${(s.clock - this.jobEnd).toFixed(1)} dtk sebelum ${job}`);
      }
      this.lastJob = job;
      this.reloaded = false;
    }
    for (const e of this.sim.entities) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) this.fail(`posisi rusak ${e.kind}`);
    }
  }

  /** Highest income in any 60 seconds of play. */
  bestMinute(): number {
    let best = 0;
    let sum = 0;
    let j = 0;
    for (let i = 0; i < this.income.length; i++) {
      sum += this.income[i].amount;
      while (this.income[j].at <= this.income[i].at - 60) sum -= this.income[j++].amount;
      best = Math.max(best, sum);
    }
    return best;
  }

  perMinute(): number[] {
    const out: number[] = [];
    for (const i of this.income) {
      const m = Math.floor(i.at / 60);
      out[m] = (out[m] ?? 0) + i.amount;
    }
    return Array.from({ length: Math.floor(this.clock / 60) + 1 }, (_, m) => out[m] ?? 0);
  }

  swipe(from: Point, to: Point, charge = 0.12): boolean {
    return this.sim.launchPlayerWave(from.x, from.y, to.x, to.y, charge, this.progress, computeStats(this.progress));
  }

  shop(): void {
    if (this.style === 'tanpa' || this.style === 'diam') return;
    const s = this.progress.story;
    if (!s.flags.toolbox) return;
    const buy = (id: UpgradeId): boolean => {
      const lv = this.progress.upgrades[id];
      if (!isForSale(id, this.progress)) return false;
      const cost = getUpgradeCost(id, lv);
      if (this.progress.coins < cost) return false;
      this.progress.coins -= cost;
      this.progress.upgrades[id] = lv + 1;
      this.bought.push({ id, at: s.clock, level: lv + 1 });
      this.sim.onUpgradePurchased(id, computeStats(this.progress));
      this.save();
      return true;
    };
    if (this.style === 'sejuta') {
      let again = true;
      while (again) {
        again = false;
        for (const d of UPGRADE_DEFS) if (buy(d.id)) again = true;
      }
      return;
    }
    const counts = new Map<UpgradeId, number>();
    for (const id of SHOPPING) {
      const want = (counts.get(id) ?? 0) + 1;
      counts.set(id, want);
      if (this.progress.upgrades[id] >= want) continue;
      buy(id);
      return;
    }
  }

  /** One thought of the hand: called every frame, swipes when it has a target and the time is right. */
  play(dt: number): void {
    const st = this.sim.story;
    const s = this.progress.story;
    if (s.flags.ops && !s.callAnswered && !s.job && this.style !== 'diam') st.answerCall();
    if (this.style === 'diam') return;
    this.shop();
    if (s.step === 'workshop') st.leaveWorkshop();

    const fast = this.style === 'sejuta';
    const slow = this.style === 'lambat';
    const key = st.objective().key.split(':').slice(0, 2).join(':');
    if (key !== this.key) {
      this.key = key;
      // reading the new objective takes a moment
      this.think = fast ? 0.25 : slow ? 6 : 2.6;
    }
    this.think -= dt;
    this.cool -= dt;
    if (this.plannedDrag) {
      this.plannedDrag.hold -= dt;
      if (this.plannedDrag.hold <= 0) {
        const p = this.plannedDrag;
        this.plannedDrag = null;
        const n = fast ? 4 : slow ? 26 : 13;
        const j = (): number => (Math.random() - 0.5) * 2 * n;
        this.swipe({ x: p.from.x + j(), y: p.from.y + j() }, { x: p.to.x + j(), y: p.to.y + j() });
      }
      return;
    }
    if (this.cool > 0 || this.sim.energy < 22) return;
    const t = this.target(this.think > 0);
    if (!t) return;
    this.plannedDrag = { ...t, hold: fast ? 0.08 : slow ? 0.6 : 0.28 };
    this.cool = fast ? 0.18 : slow ? 1.9 : 0.75 + Math.random() * 0.5;
  }

  /** A swipe that carries something towards a place: it starts behind the thing and runs through it. */
  carry(e: Point, to: Point, back = 78): { from: Point; to: Point } {
    const d = Math.hypot(to.x - e.x, to.y - e.y) || 1;
    const ux = (to.x - e.x) / d;
    const uy = (to.y - e.y) / d;
    return { from: { x: e.x - ux * back, y: e.y - uy * back }, to: { x: e.x + ux * 60, y: e.y + uy * 60 } };
  }

  private trashTarget(only?: (e: Entity) => boolean): { from: Point; to: Point } | null {
    const list = this.sim.entities.filter((e) => isTrashKind(e.kind) && (!only || only(e)));
    if (!list.length) return null;
    list.sort((a, b) => Math.hypot(a.x - COLLECTOR_NET.x, a.y - COLLECTOR_NET.y) - Math.hypot(b.x - COLLECTOR_NET.x, b.y - COLLECTOR_NET.y));
    const e = list[0];
    if (Math.hypot(e.x - COLLECTOR_NET.x, e.y - COLLECTOR_NET.y) < 70 && list.length > 1 && Math.hypot(e.vx, e.vy) > 6) {
      return this.carry(list[1], COLLECTOR_NET);
    }
    const c = this.carry(e, { x: COLLECTOR_NET.x + 6, y: COLLECTOR_NET.y });
    c.from.x = Math.max(getShoreX(c.from.y) + 14, c.from.x);
    return c;
  }

  private target(reading: boolean): { from: Point; to: Point } | null {
    const st = this.sim.story;
    const s = this.progress.story;
    const run = st.run;
    const job = s.job;
    const ents = this.sim.entities;
    const away = (e: Point, push: Point, back = 84): { from: Point; to: Point } => {
      const d = Math.hypot(push.x, push.y) || 1;
      return this.carry(e, { x: e.x + (push.x / d) * 100, y: e.y + (push.y / d) * 100 }, back);
    };
    if (job && run && !reading) {
      if (job.kind === 'dolphin') {
        const e = ents.find((q) => q.kind === 'dolphin');
        if (e) return this.carry({ x: e.x - 20, y: e.y - 10 }, e, 100);
      }
      if (run instanceof BoatJob) {
        const b = ents.find((q) => q.kind === 'boat');
        if (b && job.phase === 'home') return this.carry(b, { x: VILLAGE_PIER.dockX, y: VILLAGE_PIER.dockY });
        if (b && (job.phase === 'sail' || job.phase === 'aground')) {
          const c = run.current();
          const near = Math.hypot(b.x - c.x, b.y - c.y) < c.r + 10;
          if (near) return away(b, { x: b.x - c.x - 60, y: b.y - c.y });
        }
      }
      if (run instanceof RaidJob) {
        const e = ents.find((q) => q.kind === 'raider' && q.tag !== 'leaving');
        if (e && e.x < 1180 && e.y > 50) return away(e, { x: 60, y: e.y < 360 ? -30 : 40 }, 96);
      }
      if (run instanceof TrawlJob || run instanceof BossJob) {
        const f = ents.filter((q) => q.kind === 'float').find((q) => Math.hypot(q.x - q.home!.x, q.y - q.home!.y) <= 74);
        if (f) return away(f, { x: -20, y: f.tag === 'A' ? -90 : 90 }, 70);
        const d = ents.find((q) => q.kind === 'drum');
        if (d) return away(d, { x: d.x - 1070, y: d.y - 600 });
        if (run instanceof BossJob && run.open) {
          const b = this.sim.getBossEntity();
          if (b) return this.carry({ x: b.x - 10, y: b.y }, { x: b.x + 60, y: b.y }, 110);
        }
      }
      if (run instanceof WasteJob) {
        const e = ents.find((q) => q.kind === 'polluter' && q.tag !== 'leaving');
        if (e && e.x < 1250) return this.carry(e, { x: e.x + 80, y: e.y }, 100);
        const pad = this.padTarget();
        if (pad) return pad;
      }
      if (run instanceof CalfJob) {
        const n = ents.find((q) => q.kind === 'drift_net');
        if (n) return away(n, { x: 10, y: n.y < SPAWNING_GROUND.y + 120 ? -90 : 90 }, 74);
      }
    }
    if (s.step === 'box') {
      const b = ents.find((q) => q.kind === 'toolbox');
      if (b && !reading) return this.carry(b, PIER_END);
      return null;
    }
    if (s.step === 'sweep') return reading ? null : this.trashTarget((e) => Boolean(e.opening));
    if (s.step === 'healthy' || s.step === 'clean' || s.pollution > 30) {
      const r = this.recover();
      if (r) return r;
    }
    const seed = ents.find((q) => q.kind === 'mangrove_seed');
    if (seed && Math.random() < 0.3) return this.carry(seed, { x: getShoreX(seed.y) - 20, y: seed.y });
    return this.trashTarget();
  }

  private padTarget(): { from: Point; to: Point } | null {
    const pad = this.sim.entities.find((q) => q.kind === 'pad' && q.actionTimer <= 0);
    if (!pad) return null;
    const oils = this.sim.entities.filter((q) => q.kind === 'oil');
    oils.sort((a, b) => Math.hypot(a.x - pad.x, a.y - pad.y) - Math.hypot(b.x - pad.x, b.y - pad.y));
    if (!oils[0] || Math.hypot(oils[0].x - pad.x, oils[0].y - pad.y) < 40) return null;
    return this.carry(pad, oils[0]);
  }

  private recover(): { from: Point; to: Point } | null {
    const pad = this.padTarget();
    if (pad) return pad;
    const e = this.sim.entities.find((q) => q.kind === 'ghost_net' || q.kind === 'deposit');
    if (e) {
      const from = { x: e.x + 92, y: e.y };
      if (e.kind === 'ghost_net') return { from: { x: e.x - 92, y: e.y + 10 }, to: { x: e.x + 40, y: e.y } };
      return { from, to: { x: e.x - 40, y: e.y } };
    }
    return this.trashTarget((q) => Boolean(q.pollution));
  }

  runFor(seconds: number, until?: () => boolean, dt = 1 / 30): void {
    const n = Math.ceil(seconds / dt);
    for (let i = 0; i < n; i++) {
      this.play(dt);
      this.step(dt);
      if (until?.()) return;
    }
  }

  jobs(): JobRecord[] {
    return this.progress.story.log;
  }
}

export { SEA_ROCKS };
