import { loadGame, saveGame, type Store } from '../src/save';
import { GameSimulation, isTrashKind } from '../src/simulation';
import { BoatJob, BossJob, CalfJob, TrawlJob, WasteJob } from '../src/story/jobs';
import { heldPollution } from '../src/story/state';
import type { Entity, JobRecord, PlayerProgress, Point, UpgradeId } from '../src/types';
import { computeStats, getUpgradeCost, isForSale, UPGRADE_DEFS } from '../src/upgrades';
import { COLLECTOR_NET, getShoreX, PIER_END, SEA_ROCKS, SPAWNING_GROUND, VILLAGE_PIER, WORLD_H } from '../src/world';

/** Headless simulation harness & playtest bot for ALUN Day/Night Active Incremental Wave Defense. */

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

export type Style = 'biasa' | 'tanpa' | 'sejuta' | 'diam';

/** Smart active-incremental shopping list across branches (width, power, eco: Muatan -> Jaring -> Kelangkaan, energy, echo, buoys, tidal lanes, armor). */
const SHOPPING: UpgradeId[] = [
  'wave_width',
  'trash_density',
  'wave_power',
  'net_expand',
  'tidal_energy',
  'wave_power',
  'ai_guide',
  'wave_width',
  'pier_armor',
  'energy_regen',
  'trash_density',
  'tidal_charge',
  'echo_wave',
  'wave_power',
  'trash_rarity',
  'ai_sonar',
  'ai_buoy',
  'tidal_lane',
  'combo_flow',
  'pier_armor',
  'wave_power',
  'echo_wave',
  'energy_regen',
  'ai_buoy',
  'tidal_lane',
  'wave_width',
  'tidal_charge',
  'wave_power',
  'pier_armor',
  'trash_density',
  'trash_rarity',
  'combo_flow',
  'ai_sonar',
  'ai_buoy',
  'echo_wave',
  'tidal_lane',
  'wave_power',
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
  days: { n: number; at: number }[] = [];
  bought: { id: UpgradeId; at: number; level: number }[] = [];
  banners: string[] = [];
  workshop = -1;
  endingAt = -1;
  defeatedAt = -1;
  worstP = 0;
  minPierHp = 100;
  radio: string[] = [];
  saves = 0;
  private lastEarned: number;
  private cool = 0;
  private plannedDrag: { from: Point; to: Point; hold: number; charge: number } | null = null;

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
      chapter: (n) => this.days.push({ n, at: this.clock }),
      celebrate: () => {},
      banner: (title) => this.banners.push(title),
      pierHurt: (hp) => {
        this.minPierHp = Math.min(this.minPierHp, hp);
      },
      defeat: () => {
        this.defeatedAt = this.clock;
      },
      dolphin: () => false,
      filming: () => false,
      worsen: () => {},
      ending: () => {
        this.endingAt = this.clock;
      },
    });
    this.sim.initLagoon(this.progress, computeStats(this.progress));
    this.minPierHp = this.progress.story.pierHp;
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
    this.minPierHp = Math.min(this.minPierHp, s.pierHp);
    if (this.workshop < 0 && s.flags.toolbox) this.workshop = s.clock;

    this.sim.story.snapshot();
    const held = heldPollution(this.progress);
    if (Math.abs(held - s.pollution) > 0.001) {
      this.fail(`P ${s.pollution} != sumber ${held} (Hari ${s.day}/${s.cycle})`);
    }
    if (s.pollution < 0 || s.pollution > 100) this.fail(`P di luar batas ${s.pollution}`);
    if (s.pierHp < 0 || s.pierHp > s.maxPierHp) this.fail(`pierHp di luar batas ${s.pierHp}/${s.maxPierHp}`);
    for (const e of this.sim.entities) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) this.fail(`posisi rusak ${e.kind}`);
    }
  }

  swipe(from: Point, to: Point, charge = 0.14): boolean {
    return this.sim.launchPlayerWave(from.x, from.y, to.x, to.y, charge, this.progress, computeStats(this.progress));
  }

  shop(): void {
    const s = this.progress.story;
    if (!s.flags.toolbox || s.cycle === 'night') return;
    if (this.style === 'tanpa' || this.style === 'diam') {
      if ((s.cycle === 'prep' && s.step === 'shop') || this.sim.story.dawnShopPending()) this.sim.story.leaveWorkshop();
      return;
    }

    // Repair pier if damaged below 70%
    if (s.pierHp < s.maxPierHp * 0.7) {
      this.sim.story.repairPier();
    }

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
      if ((s.cycle === 'prep' && s.step === 'shop') || this.sim.story.dawnShopPending()) this.sim.story.leaveWorkshop();
      return;
    }

    const counts = new Map<UpgradeId, number>();
    for (const id of SHOPPING) {
      const want = (counts.get(id) ?? 0) + 1;
      counts.set(id, want);
      if (this.progress.upgrades[id] >= want) continue;
      // a blueprint that has not come yet, or a level that waits for a later dawn
      if (!isForSale(id, this.progress)) continue;
      if (buy(id)) break;
      // Don't deadlock on one expensive item if a cheaper early item is affordable
      if (getUpgradeCost(id, this.progress.upgrades[id]) > this.progress.coins * 1.8) continue;
      break;
    }
    // when the list is done for today, whatever is left goes on the cheapest tool still on sale
    const listDone = SHOPPING.every((id, i) => {
      const want = SHOPPING.slice(0, i + 1).filter((x) => x === id).length;
      return this.progress.upgrades[id] >= want || !isForSale(id, this.progress);
    });
    if (listDone) {
      const cheap = UPGRADE_DEFS.filter((d) => isForSale(d.id, this.progress)).sort(
        (a, b) => getUpgradeCost(a.id, this.progress.upgrades[a.id]) - getUpgradeCost(b.id, this.progress.upgrades[b.id])
      )[0];
      if (cheap) buy(cheap.id);
    }
    if ((s.cycle === 'prep' && s.step === 'shop') || this.sim.story.dawnShopPending()) this.sim.story.leaveWorkshop();
  }

  play(dt: number): void {
    if (this.style === 'diam' || this.progress.story.defeated) return;
    this.shop();

    const fast = this.style === 'sejuta';
    this.cool -= dt;
    if (this.plannedDrag) {
      this.plannedDrag.hold -= dt;
      if (this.plannedDrag.hold <= 0) {
        const p = this.plannedDrag;
        this.plannedDrag = null;
        const n = fast ? 3 : 10;
        const j = (): number => (Math.random() - 0.5) * 2 * n;
        this.swipe({ x: p.from.x + j(), y: p.from.y + j() }, { x: p.to.x + j(), y: p.to.y + j() }, p.charge);
      }
      return;
    }
    const minEnergy = this.progress.story.cycle === 'night' ? 16 : 20;
    if (this.cool > 0 || this.sim.energy < minEnergy) return;
    const t = this.target();
    if (!t) return;
    const charge = t.heavy && this.sim.stats.chargeUnlocked ? 0.65 : 0.16;
    this.plannedDrag = { from: t.from, to: t.to, hold: fast ? 0.06 : charge > 0.4 ? 0.32 : 0.16, charge };
    this.cool = fast ? 0.18 : this.progress.story.cycle === 'night' ? 0.42 : 0.62;
  }

  carry(e: Point, to: Point, back = 78): { from: Point; to: Point } {
    const d = Math.hypot(to.x - e.x, to.y - e.y) || 1;
    const ux = (to.x - e.x) / d;
    const uy = (to.y - e.y) / d;
    return { from: { x: e.x - ux * back, y: e.y - uy * back }, to: { x: e.x + ux * 60, y: e.y + uy * 60 } };
  }

  private trashTarget(only?: (e: Entity) => boolean): { from: Point; to: Point; heavy?: boolean } | null {
    const list = this.sim.entities.filter((e) => isTrashKind(e.kind) && (!only || only(e)));
    if (!list.length) return null;
    list.sort((a, b) => Math.hypot(a.x - COLLECTOR_NET.x, a.y - COLLECTOR_NET.y) - Math.hypot(b.x - COLLECTOR_NET.x, b.y - COLLECTOR_NET.y));
    const e = list[0];
    const c = this.carry(e, { x: COLLECTOR_NET.x + 6, y: COLLECTOR_NET.y });
    c.from.x = Math.max(getShoreX(c.from.y) + 14, c.from.x);
    return c;
  }

  private target(): { from: Point; to: Point; heavy?: boolean } | null {
    const st = this.sim.story;
    const s = this.progress.story;
    const run = st.run;
    const job = s.job;
    const ents = this.sim.entities;
    const away = (e: Point, push: Point, back = 86): { from: Point; to: Point } => {
      const d = Math.hypot(push.x, push.y) || 1;
      return this.carry(e, { x: e.x + (push.x / d) * 100, y: e.y + (push.y / d) * 100 }, back);
    };

    // 1. Prep phase
    if (s.cycle === 'prep') {
      if (s.step === 'box') {
        const b = ents.find((q) => q.kind === 'toolbox');
        return b ? this.carry(b, PIER_END) : null;
      }
      return this.trashTarget((e) => Boolean(e.opening));
    }

    // 2. Active pirates threatening the pier (closest first!)
    const pirates = st.activePirates().filter((p) => p.x < 1210 && p.y > 40 && p.y < WORLD_H + 10);
    if (pirates.length > 0) {
      pirates.sort((a, b) => (a.tag === 'attack' ? -500 : 0) + a.x - ((b.tag === 'attack' ? -500 : 0) + b.x));
      const p = pirates[0];
      const aim = away(p, { x: 100, y: p.y < 360 ? -24 : 24 }, 92);
      aim.from.x = Math.max(getShoreX(aim.from.y) + 14, aim.from.x);
      return { ...aim, heavy: p.variant === 2 };
    }

    // 3. Active Boss or side job
    if (job && run) {
      if (job.kind === 'dolphin') {
        const e = ents.find((q) => q.kind === 'dolphin');
        if (e) return this.carry({ x: e.x - 20, y: e.y - 10 }, e, 100);
      }
      if (run instanceof BossJob) {
        const f = ents.filter((q) => q.kind === 'float').find((q) => Math.hypot(q.x - q.home!.x, q.y - q.home!.y) <= 74);
        if (f) return away(f, { x: -20, y: f.tag === 'A' ? -90 : 90 }, 70);
        const d = ents.find((q) => q.kind === 'drum');
        if (d) return away(d, { x: d.x - 1070, y: d.y - 600 });
        const b = this.sim.getBossEntity();
        if (b) return { ...this.carry({ x: b.x - 10, y: b.y }, { x: b.x + 60, y: b.y }, 110), heavy: true };
      }
      if (run instanceof TrawlJob) {
        const f = ents.filter((q) => q.kind === 'float').find((q) => Math.hypot(q.x - q.home!.x, q.y - q.home!.y) <= 74);
        if (f) return away(f, { x: -20, y: f.tag === 'A' ? -90 : 90 }, 70);
      }
      if (run instanceof WasteJob) {
        const e = ents.find((q) => q.kind === 'polluter' && q.tag !== 'leaving');
        if (e && e.x < 1250) return this.carry(e, { x: e.x + 80, y: e.y }, 100);
        const pad = this.padTarget();
        if (pad) return pad;
      }
      if (run instanceof BoatJob) {
        const b = ents.find((q) => q.kind === 'boat');
        if (b && job.phase === 'home') return this.carry(b, { x: VILLAGE_PIER.dockX, y: VILLAGE_PIER.dockY });
        if (b && (job.phase === 'sail' || job.phase === 'aground')) {
          const c = run.current();
          if (Math.hypot(b.x - c.x, b.y - c.y) < c.r + 14) return away(b, { x: b.x - c.x - 60, y: b.y - c.y });
        }
      }
      if (run instanceof CalfJob) {
        const n = ents.find((q) => q.kind === 'drift_net');
        if (n) return away(n, { x: 10, y: n.y < SPAWNING_GROUND.y + 120 ? -90 : 90 }, 74);
      }
    }

    // 4. Clean beach pollution when dirty so we get free dawn pier healing!
    if (s.pollution > 30) {
      const r = this.recover();
      if (r) return r;
    }

    // 5. Plant mangrove seed or farm salvage!
    const seed = ents.find((q) => q.kind === 'mangrove_seed');
    if (seed && Math.random() < 0.35) return this.carry(seed, { x: getShoreX(seed.y) - 20, y: seed.y });
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
