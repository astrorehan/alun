import type { Entity, JobResult, JobState, Point, Wave } from '../types';
import {
  DOLPHIN_SPOT,
  DUMP_SPOT,
  DUMP_STATION,
  FIRE_SPOTS,
  getShoreX,
  PIER_END,
  RAID_ANCHORS,
  SEA_ROCKS,
  SPAWNING_GROUND,
  TRAWL_STATION,
  VILLAGE_PIER,
  WORLD_H,
  WORLD_W,
} from '../world';
import type { Story } from './director';
import { BOSS_HP, PAY, P_DIRTY, POLLUTER_HP, RAIDER_HP, TRAWL_HP } from './state';
import { firePay, hitDamage } from '../upgrades';

/**
 * What can happen in the lagoon. Each job runs on a plain JobState, so a save can hold it and `enter`
 * can pick it up again at the last safe point. A job never ends well without a wave from the player.
 */

export interface Objective {
  progress?: string;
  key: string;
  title: string;
  sub: string;
  icon: string;
  swatch: 'orange' | 'blue' | 'green' | 'gold' | 'teal' | 'purple' | 'red' | 'slate';
  /** Where to look, in simulation pixels. */
  at?: Point;
  /** A swipe that would do it, shown until the player has the idea. */
  swipe?: { from: Point; to: Point };
}

/** Start in the water behind the object and sweep through it towards the destination. */
export function swipeTowards(object: Point, destination: Point): { from: Point; to: Point } {
  const dx = destination.x - object.x;
  const dy = destination.y - object.y;
  const distance = Math.hypot(dx, dy) || 1;
  return {
    from: { x: object.x - dx / distance * 80, y: object.y - dy / distance * 80 },
    to: { x: object.x + dx / distance * 46, y: object.y + dy / distance * 46 },
  };
}

/** How a wave should treat what it just reached: shove it like any floating thing, or leave it be. */
export type Touch = 'push' | 'hold';

const hyp = Math.hypot;

export abstract class Job {
  constructor(
    protected readonly st: Story,
    readonly s: JobState
  ) {}

  /** Puts the job's things in the water; also after a reload, from the saved phase. */
  abstract enter(resumed: boolean): void;
  abstract update(dt: number): void;

  /** Records moving parts at the end of the frame. */
  snapshot(): void {}
  abstract objective(): Objective;

  /** A wave reached one of this job's things. */
  hit(_e: Entity, _w: Wave, _px: number, _py: number): Touch {
    return 'push';
  }

  /** Moves one of this job's things. False leaves it to the ordinary drift. */
  move(_e: Entity, _dt: number): boolean {
    return false;
  }

  /** Takes the job's things out of the water without a word. */
  abstract clear(): void;

  protected phase(name: string): void {
    this.s.phase = name;
    this.s.t = 0;
    this.st.touchSave();
  }

  protected get sim() {
    return this.st.sim;
  }

  /** One wave counts once against a hull. Returns the damage, or 0 when it does not count. */
  protected hullHit(e: Entity, w: Wave, px: number, py: number, shove: number): number {
    if (w.hitMap.has(e.id) || w.kind === 'buoy_pulse') return 0;
    w.hitMap.set(e.id, w.age);
    this.s.touched = true;
    const k = shove * (0.55 + w.power * 0.45);
    e.vx += px * k;
    e.vy += py * k;
    return Math.min(40, hitDamage(w.power, w.charge, false));
  }

  protected showHit(e: Entity, dmg: number): void {
    e.hitFlash = 0.24;
    this.sim.audio.playTrawlerHit(this.sim.audio.worldXToPan(e.x, WORLD_W));
    this.sim.shake(5);
    this.sim.burst(e.x - 14, e.y, '#a8f9f3', 11);
    this.sim.text(e.x, e.y - 40, `-${dmg}`, '#ffffff', 1);
  }
}

/** Heads for a place at a speed, letting a shove die away as it recovers. */
export function steer(e: Entity, tx: number, ty: number, speed: number, dt: number, grip = 1.6, slow = 46): number {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = hyp(dx, dy) || 1;
  const want = speed * Math.min(1, d / slow);
  const k = Math.min(1, grip * dt);
  e.vx += ((dx / d) * want - e.vx) * k;
  e.vy += ((dy / d) * want - e.vy) * k;
  limit(e, 340);
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  return d;
}

/** However many waves reach a hull, it goes no faster than this. */
function limit(e: Entity, max: number): void {
  const v = hyp(e.vx, e.vy);
  if (v > max) {
    e.vx = (e.vx / v) * max;
    e.vy = (e.vy / v) * max;
  }
}

/** Keeps a boat on the water of the bay. */
function inBay(e: Entity): void {
  e.y = Math.min(WORLD_H - 46, Math.max(64, e.y));
  const shore = getShoreX(e.y) + e.radius + 6;
  if (e.x < shore) {
    e.x = shore;
    e.vx = Math.max(0, e.vx);
  }
}

/** A ship slips round a rock instead of through it. */
export function roundRocks(e: Entity, dt: number): void {
  for (const r of SEA_ROCKS) {
    const dx = e.x - r.x;
    const dy = e.y - r.y;
    const d = hyp(dx, dy) || 1;
    const near = r.r + e.radius + 10;
    if (d >= near) continue;
    const nx = dx / d;
    const ny = dy / d;
    e.x = r.x + nx * near;
    e.y = r.y + ny * near;
    const into = e.vx * nx + e.vy * ny;
    if (into < 0) {
      e.vx -= into * nx;
      e.vy -= into * ny;
    }
    const side = e.vx * -ny + e.vy * nx >= 0 ? 1 : -1;
    e.vx += -ny * side * 70 * dt;
    e.vy += nx * side * 70 * dt;
  }
}

export function face(e: Entity, angle: number, dt: number, rate: number): void {
  const diff = Math.atan2(Math.sin(angle - e.rotation), Math.cos(angle - e.rotation));
  e.rotation += diff * Math.min(1, dt * rate);
}

/* ================================================================== the mother dolphin */

export class DolphinJob extends Job {
  private id = 0;

  enter(resumed: boolean): void {
    // Older saves did not record the remaining knots.
    if (!resumed || this.s.hp <= 0) this.s.hp = 3;
    const e = this.sim.add('dolphin', DOLPHIN_SPOT.x, DOLPHIN_SPOT.y, { radius: 26, mass: 99, hp: this.s.hp, maxHp: 3 });
    this.id = e.id;
    this.s.phase = 'help';
    // the film hands the lagoon back by setting actionTimer; without one, the knots can be torn at once
    if (!this.sim.hooks.dolphin(e)) {
      e.actionTimer = 1;
      this.st.radio(
        'A.L.U.N.',
        'Induk lumba-lumba terjerat di ujung tali. Kirim ombak ke arahnya: tiga lilitan harus robek.'
      );
    }
  }

  update(): void {}

  hit(e: Entity, w: Wave): Touch {
    if (e.actionTimer > 0 && e.hp > 0 && w.kind !== 'buoy_pulse' && !w.hitMap.has(e.id)) {
      w.hitMap.set(e.id, w.age);
      this.s.touched = true;
      const tear = w.kind === 'resonance' ? 3 : w.charge >= 0.55 ? 2 : 1;
      e.hp = Math.max(0, e.hp - tear);
      this.s.hp = e.hp;
      this.st.touchSave();
      e.hitFlash = 0.32;
      this.sim.shake(3.5);
      this.sim.burst(e.x, e.y, '#c8fff4', 14);
      if (e.hp <= 0) {
        this.st.settle(this, 'done', PAY.dolphin, { x: e.x, y: e.y - 20 }, 'INDUK BEBAS!');
      } else {
        this.sim.text(e.x, e.y - 26, tear > 1 ? 'SOBEK BESAR!' : 'LILITAN LEPAS!', '#c8fff4', 0.95);
      }
    }
    return 'hold';
  }

  move(e: Entity): boolean {
    // held fast by the net: it thrashes, but it goes nowhere
    e.vx = 0;
    e.vy = 0;
    return true;
  }

  objective(): Objective {
    const e = this.sim.find(this.id);
    const torn = e ? e.maxHp - e.hp : 3;
    return {
      key: `dolphin:${torn}`,
      title: 'Lepaskan lumba-lumba',
      progress: `${torn}/3`,
      sub: 'Geser dari air ke jaring di tubuh induk. Ulangi sampai tiga lilitan lepas.',
      icon: 'dolphin',
      swatch: 'teal',
      at: DOLPHIN_SPOT,
      swipe: { from: { x: DOLPHIN_SPOT.x - 56, y: DOLPHIN_SPOT.y - 19 }, to: DOLPHIN_SPOT },
    };
  }

  clear(): void {
    // under the film it is the film that lets it go
    if (!this.sim.hooks.filming()) this.sim.remove(this.id);
  }
}

/* ================================================================== a fisher in the cross-current */

interface Lane {
  from: Point;
  y: number;
  rock: number;
}

const LANES: Lane[] = [
  { from: { x: 1266, y: 432 }, y: 432, rock: 1 },
  { from: { x: 1266, y: 330 }, y: 336, rock: 0 },
  { from: { x: 1266, y: 618 }, y: 612, rock: 2 },
];

const CURRENT = 46;
const CURRENT_REACH = 205;

export class BoatJob extends Job {
  private boat: Entity | null = null;
  private lane = LANES[this.s.variant % LANES.length];
  private rock = SEA_ROCKS[this.lane.rock];
  private ease = 0;

  enter(resumed: boolean): void {
    const at = resumed && this.s.at && this.s.phase !== 'start' ? this.s.at : this.lane.from;
    this.boat = this.sim.add('boat', at.x, at.y, {
      radius: 24,
      mass: 1.9,
      rotation: Math.PI,
      variant: this.s.story ? 0 : 1,
      tag: 'fisher',
    });
    if (resumed && this.s.phase !== 'start') return;
    const p = this.st.s.pollution;
    this.s.pay = PAY.boat + (p < P_DIRTY ? PAY.boatBonus : 0);
    this.phase('sail');
    this.st.radio(
      'PAK DAMAR',
      this.s.story
        ? 'Aku masuk lewat celah karang. Arus silang menyeretku ke batu, sapu lambungku dari samping!'
        : p >= P_DIRTY
          ? 'Ikan menjauh, upahnya cuma cukup 16. Kalau sempat, angkat endapan di tepi pantai.'
          : 'Perahu nelayan masuk. Arus silangnya kuat, tolong sapu sisi lambungnya.'
    );
    if (p >= P_DIRTY) this.st.offerDeposit();
  }

  update(dt: number): void {
    const b = this.boat;
    if (!b) return;
    this.s.at = { x: Math.round(b.x), y: Math.round(b.y) };
    this.ease = Math.max(0, this.ease - dt);
    if (this.s.phase === 'aground' && this.s.t > 42) {
      this.phase('turn');
      this.st.radio('PAK DAMAR', 'Aku tidak bisa lewat. Kuputar dulu, nanti kucoba lagi.');
    }
    if (this.s.phase === 'turn' && b.x > WORLD_W + 20) {
      this.st.settle(this, 'failed', 0, { x: WORLD_W - 60, y: b.y }, '');
    }
  }

  /** How hard the water pulls the hull towards the rock here, 0 outside the cross-current. */
  private pull(b: Entity): number {
    if (this.s.phase !== 'sail') return 0;
    if (b.x < this.rock.x - 34 || hyp(b.x - this.rock.x, b.y - this.rock.y) > CURRENT_REACH) return 0;
    const steering = this.s.touched ? 1 - this.sim.stats.steering : 1;
    return CURRENT * steering * (this.ease > 0 ? 0.25 : 1);
  }

  /** For the scene: the foam that shows where the current takes the boat. */
  current(): { x: number; y: number; r: number; on: boolean } {
    return { x: this.rock.x, y: this.rock.y, r: CURRENT_REACH, on: this.s.phase === 'sail' || this.s.phase === 'aground' };
  }

  move(e: Entity, dt: number): boolean {
    if (e !== this.boat) return false;
    const ph = this.s.phase;
    if (ph === 'aground') {
      e.vx *= Math.pow(0.9, dt * 60);
      e.vy *= Math.pow(0.9, dt * 60);
      limit(e, 300);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      inBay(e);
      const d = hyp(e.x - this.rock.x, e.y - this.rock.y);
      if (d > this.rock.r + e.radius + 14) {
        this.ease = 3.4;
        this.phase('sail');
      }
      return true;
    }
    if (ph === 'turn') {
      steer(e, WORLD_W + 120, this.lane.y, 46, dt, 1.4);
      face(e, 0, dt, 1.6);
      return true;
    }
    const home = ph === 'home';
    const tx = home ? VILLAGE_PIER.dockX : e.x - 100;
    const ty = home ? VILLAGE_PIER.dockY : this.lane.y;
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = hyp(dx, dy) || 1;
    let wx = home ? (dx / d) * 38 : -30;
    let wy = home ? (dy / d) * 38 : Math.max(-10, Math.min(10, dy * 0.35));
    const pull = this.pull(e);
    if (pull > 0) {
      const rx = this.rock.x - e.x;
      const ry = this.rock.y - e.y;
      const rd = hyp(rx, ry) || 1;
      wx = wx * 0.7 + (rx / rd) * pull;
      wy = (ry / rd) * pull;
    }
    const k = Math.min(1, 2.1 * dt);
    e.vx += (wx - e.vx) * k;
    e.vy += (wy - e.vy) * k;
    limit(e, 300);
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    inBay(e);
    if (hyp(e.vx, e.vy) > 10) face(e, Math.atan2(e.vy, e.vx), dt, 3);

    for (let i = 0; i < SEA_ROCKS.length; i++) {
      const r = SEA_ROCKS[i];
      const ox = e.x - r.x;
      const oy = e.y - r.y;
      const od = hyp(ox, oy) || 1;
      const min = r.r + e.radius;
      if (od < min) {
        e.x = r.x + (ox / od) * min;
        e.y = r.y + (oy / od) * min;
        if (i === this.lane.rock && ph === 'sail') {
          e.vx = 0;
          e.vy = 0;
          this.phase('aground');
          this.sim.shake(4);
          this.sim.burst(r.x + (ox / od) * r.r, r.y + (oy / od) * r.r, '#e5ffff', 14, 'foam');
          this.sim.audio.playNetSnap(0.5);
          this.st.radio('PAK DAMAR', 'Kandas! Sapu aku menjauh dari batu.');
          return true;
        }
      }
    }

    if (ph === 'sail' && e.x < this.rock.x - 60) {
      // nobody gets past the rocks on their own
      if (this.s.touched) {
        this.phase('home');
        if (this.s.story) this.st.radio('PAK DAMAR', 'Sudah lewat batunya! Sekarang aku bisa merapat sendiri.');
      } else this.phase('turn');
    }
    if (home && hyp(e.x - VILLAGE_PIER.dockX, e.y - VILLAGE_PIER.dockY) < VILLAGE_PIER.dockRadius + 16) {
      this.sim.progress.totalBoats += 1;
      this.sim.audio.playBoatSaved(this.sim.audio.worldXToPan(VILLAGE_PIER.dockX, WORLD_W));
      this.sim.burst(VILLAGE_PIER.dockX, VILLAGE_PIER.dockY, '#ffe07d', 20);
      this.st.dock(e.variant);
      this.st.settle(this, 'done', this.s.pay, { x: VILLAGE_PIER.dockX + 20, y: VILLAGE_PIER.dockY - 22 }, 'PERAHU BERSANDAR!');
    }
    return true;
  }

  hit(e: Entity, w: Wave, px: number, py: number): Touch {
    if (e !== this.boat || this.s.phase === 'turn') return 'hold';
    if (w.kind !== 'buoy_pulse') this.s.touched = true;
    if (this.s.phase === 'aground' && !w.hitMap.has(e.id)) {
      // any shove that points away from the rock lifts it off
      const ox = e.x - this.rock.x;
      const oy = e.y - this.rock.y;
      const od = hyp(ox, oy) || 1;
      const away = (px * ox + py * oy) / od;
      w.hitMap.set(e.id, w.age);
      e.hitFlash = 0.14;
      const k = away > -0.2 ? 190 : 70;
      e.vx += (ox / od) * k + px * 40;
      e.vy += (oy / od) * k + py * 40;
      return 'hold';
    }
    return 'push';
  }

  objective(): Objective {
    const b = this.boat;
    const at = b ? { x: b.x, y: b.y } : undefined;
    if (this.s.phase === 'aground') {
      const swipe = b ? swipeTowards(b, { x: 2 * b.x - this.rock.x, y: 2 * b.y - this.rock.y }) : undefined;
      return { key: 'boat:aground', title: 'Bebaskan perahu yang kandas', sub: 'Geser dari sisi batu melewati perahu agar lambungnya terlepas.', icon: 'boat', swatch: 'red', at, swipe };
    }
    if (this.s.phase === 'home') {
      return { key: 'boat:home', title: 'Perahu menuju dermaga', sub: 'Sudah aman! Nelayan akan bersandar sendiri.', icon: 'boat', swatch: 'green' };
    }
    if (this.s.phase === 'turn') {
      return { key: 'boat:turn', title: 'Perahu berputar ke laut', sub: 'Tunggu sebentar. Nelayan akan mencoba lagi.', icon: 'boat', swatch: 'slate' };
    }
    const side = this.lane.y < this.rock.y ? -1 : 1;
    const swipe = b ? swipeTowards(b, { x: b.x - 55, y: b.y + side * 95 }) : undefined;
    return { key: 'boat:sail', title: this.s.story ? 'Bantu perahu Pak Damar' : 'Bantu perahu nelayan', sub: 'Arus menarik perahu ke batu. Geser melintasi lambung mengikuti panah.', icon: 'boat', swatch: 'blue', at, swipe };
  }

  clear(): void {
    if (this.boat) this.sim.remove(this.boat.id);
  }
}

/* ================================================================== raiders */

const SEIZE = 7.5;
const PATIENCE = 52;

export class RaidJob extends Job {
  private ship: Entity | null = null;
  private boat: Entity | null = null;
  private anchor = RAID_ANCHORS[this.s.variant % RAID_ANCHORS.length];

  /** The second raid comes from the other side: up from the south, round the pier head to the net. */
  private get south(): boolean {
    return this.s.variant % RAID_ANCHORS.length === 1;
  }

  enter(resumed: boolean): void {
    if (!resumed || this.s.phase === 'start') {
      this.s.hp = RAIDER_HP;
      this.s.baskets = 2;
      if (this.s.story && this.south) {
        // the night watch: Pak Damar brings the cargo in himself, and the raider is after it
        this.s.phase = 'cargo';
        this.s.t = 0;
        this.st.s.baskets = 0;
        this.boat = this.sim.add('boat', 1262, 428, { radius: 24, mass: 1.9, rotation: Math.PI, variant: 0, tag: 'fisher' });
        this.st.radio('PAK DAMAR', 'Aku bawa bekal untuk suar. Ada layar robek dari selatan, tolong jaga sampai kubongkar!');
        this.st.touchSave();
        return;
      }
      this.st.s.baskets = 2;
      this.phase('approach');
      this.launch();
      this.st.radio(
        'BU SARI',
        this.s.story
          ? 'Layar robek itu penjarah! Mereka mengincar dua keranjang di dermaga.'
          : 'Penjarah lagi! Jaga keranjang di dermaga.'
      );
      return;
    }
    // picked up again: the baskets that were left are still the ones at stake
    if (this.s.phase === 'cargo') {
      const at = this.s.at ?? { x: 760, y: 440 };
      this.boat = this.sim.add('boat', at.x, at.y, { radius: 24, mass: 1.9, rotation: Math.PI, variant: 0, tag: 'fisher' });
      return;
    }
    this.st.s.baskets = this.s.baskets;
    this.launch(this.s.at ?? (this.closesNet ? this.anchor : undefined));
  }

  private launch(at?: Point): void {
    const from = at ?? (this.south ? { x: 716, y: 806 } : { x: WORLD_W + 60, y: 384 });
    this.ship = this.sim.add('raider', from.x, from.y, {
      radius: 28,
      mass: 2.4,
      hp: this.s.hp,
      maxHp: RAIDER_HP,
      rotation: this.south ? -Math.PI * 0.62 : Math.PI,
    });
    this.sim.audio.playAlert();
  }

  snapshot(): void {
    const e = this.boat ?? this.ship;
    if (e) this.s.at = { x: Math.round(e.x), y: Math.round(e.y) };
  }

  get seizing(): number {
    return this.s.phase === 'seize' ? this.s.work : 0;
  }

  get closesNet(): boolean {
    return this.s.phase === 'seize';
  }

  update(dt: number): void {
    const s = this.s;
    if (s.phase === 'cargo') return;
    const e = this.ship;
    if (!e) return;
    if (s.phase === 'seize') {
      s.work += dt / SEIZE;
      if (s.work >= 1) {
        s.work = 0;
        s.baskets -= 1;
        this.st.s.baskets = s.baskets;
        this.sim.text(PIER_END.x, PIER_END.y - 30, 'KERANJANG DIRAMPAS!', '#ff9b8a', 1.1);
        this.sim.audio.playNetSnap(0.8);
        this.sim.shake(4);
        this.st.touchSave();
        if (s.baskets <= 0) {
          this.leave('failed');
          return;
        }
        this.st.radio('BU SARI', 'Satu keranjang sudah di kapal mereka. Selamatkan yang satu lagi!');
      }
    }
    if (s.total > PATIENCE + 20 && s.phase !== 'cargo') {
      // kept off long enough: the tide turns and they give up with what they have
      this.leave(s.baskets > 0 ? 'done' : 'failed');
    }
  }

  private leave(result: JobResult): void {
    const e = this.ship;
    if (!e) return;
    this.st.sendOff(e);
    this.ship = null;
    const kept = this.s.baskets;
    if (result === 'done' && kept > 0) {
      this.st.s.saved.baskets += kept;
      this.st.s.saved.raids += 1;
      this.st.settle(this, 'done', kept * PAY.basket, { x: PIER_END.x + 24, y: PIER_END.y - 26 }, kept === 2 ? 'DUA KERANJANG AMAN!' : 'SATU KERANJANG AMAN!');
    } else {
      this.st.settle(this, 'failed', 0, { x: PIER_END.x, y: PIER_END.y }, '');
    }
  }

  move(e: Entity, dt: number): boolean {
    if (e === this.boat) {
      const d = steer(e, VILLAGE_PIER.dockX + 20, VILLAGE_PIER.dockY, 82, dt, 1.6);
      inBay(e);
      if (hyp(e.vx, e.vy) > 10) face(e, Math.atan2(e.vy, e.vx), dt, 3);
      if (d < VILLAGE_PIER.dockRadius) {
        this.sim.remove(e.id);
        this.boat = null;
        this.st.dock(e.variant);
        this.st.s.baskets = 2;
        this.phase('approach');
        this.launch();
      }
      return true;
    }
    if (e !== this.ship) return false;
    const s = this.s;
    const a = this.anchor;
    e.vx *= Math.pow(0.55, dt);
    e.vy *= Math.pow(0.55, dt);
    const d = steer(e, a.x, a.y, 45, dt, 1.05, 40);
    e.hp = Math.max(0, s.hp);
    if (s.phase === 'approach') {
      if (hyp(e.vx, e.vy) > 10) face(e, Math.atan2(a.y - e.y, a.x - e.x), dt, 2.2);
      if (d < 26) {
        s.work = 0;
        this.phase('seize');
        this.sim.text(e.x, e.y - 44, 'MULUT JARING DITUTUP', '#ffc46a', 0.95);
      }
    } else if (s.phase === 'seize') {
      face(e, this.south ? -Math.PI * 0.66 : Math.PI * 1.12, dt, 1.6);
      if (d > 62) {
        s.work = 0;
        this.phase('approach');
        this.sim.text(e.x, e.y - 44, 'CENGKERAMANNYA LEPAS!', '#c8fff4', 1);
      }
    }
    return true;
  }

  hit(e: Entity, w: Wave, px: number, py: number): Touch {
    if (e === this.boat) return 'push';
    if (e !== this.ship) return 'hold';
    const dmg = this.hullHit(e, w, px, py, 150);
    if (dmg <= 0) return 'hold';
    this.s.hp -= dmg;
    this.showHit(e, dmg);
    if (this.s.hp <= 0) this.leave('done');
    return 'hold';
  }

  objective(): Objective {
    const e = this.ship;
    if (this.s.phase === 'cargo') {
      return { key: 'raid:cargo', title: 'Pak Damar membawa bekal suar', sub: 'Penjarah datang dari selatan. Siapkan ombak di depan dermaga.', icon: 'boat', swatch: 'orange', at: this.boat ? { x: this.boat.x, y: this.boat.y } : undefined };
    }
    const at = e ? { x: e.x, y: e.y } : undefined;
    const left = `${this.s.baskets} keranjang di dermaga`;
    if (this.s.phase === 'seize') {
      return { key: `raid:seize:${this.s.baskets}`, title: 'Keranjang sedang dirampas!', sub: `Hantam lambungnya atau sapu ke samping · ${left}`, icon: 'raider', swatch: 'red', at };
    }
    const swipe = e && this.s.story ? swipeTowards(e, { x: e.x + 90, y: e.y < 360 ? e.y - 35 : e.y + 35 }) : undefined;
    return { key: `raid:go:${this.s.baskets}`, title: 'Halau kapal layar robek', sub: `Geser dari air ke lambung penjarah. Hantam lagi sampai ia mundur · ${left}`, icon: 'raider', swatch: 'orange', at, swipe };
  }

  clear(): void {
    if (this.ship) this.sim.remove(this.ship.id);
    if (this.boat) this.sim.remove(this.boat.id);
  }
}

/* ================================================================== the trawl */

const WINCH = 27;

/** A trawl's two end floats on their lines. Shared by the trawl ship and the mother ship. */
class Trawl {
  readonly floats: Entity[] = [];
  private slackFor = 0;

  constructor(
    private st: Story,
    readonly lane: Point,
    private gap: number,
    positions?: Point[]
  ) {
    for (const tag of ['A', 'B']) {
      const y = lane.y + (tag === 'A' ? -gap : gap);
      const at = positions?.[this.floats.length] ?? { x: lane.x, y };
      this.floats.push(st.sim.add('float', at.x, at.y, { radius: 16, mass: 1.35, tag, home: { x: lane.x, y } }));
    }
  }

  /** One float is clear of the fish. */
  out(e: Entity): boolean {
    const h = e.home!;
    return hyp(e.x - h.x, e.y - h.y) > 74;
  }

  get cleared(): number {
    return this.floats.filter((f) => this.out(f)).length;
  }

  /** Reels the homes toward the ship; true once both ends have hung slack long enough. */
  update(dt: number, work: number, ship: Entity | null): boolean {
    for (const f of this.floats) {
      const side = f.tag === 'A' ? -1 : 1;
      const k = Math.min(1, work);
      const sx = ship ? ship.x - 60 : this.lane.x;
      const sy = ship ? ship.y : this.lane.y;
      f.home!.x = this.lane.x + (sx - this.lane.x) * k * 0.72;
      f.home!.y = this.lane.y + side * this.gap * (1 - k * 0.45) + (sy - this.lane.y) * k * 0.5;
    }
    this.slackFor = this.cleared === this.floats.length ? this.slackFor + dt : 0;
    return this.slackFor > 0.7;
  }

  move(e: Entity, dt: number): boolean {
    if (!this.floats.includes(e)) return false;
    // the line hauls a float back, slowly enough to sweep the other one first
    const h = e.home!;
    const dx = h.x - e.x;
    const dy = h.y - e.y;
    const d = hyp(dx, dy) || 1;
    const pull = Math.min(30, d * 0.35);
    e.vx += (dx / d) * pull * dt;
    e.vy += (dy / d) * pull * dt;
    this.st.sim.drift(e, dt, 0.958, 420);
    return true;
  }

  clear(): void {
    for (const f of this.floats) this.st.sim.remove(f.id);
    this.floats.length = 0;
  }
}

const TRAWL_GATE: Point = { x: 1012, y: 346 };

export class TrawlJob extends Job {
  private ship: Entity | null = null;
  trawl: Trawl | null = null;
  private through = false;

  enter(resumed: boolean): void {
    if (!resumed || this.s.phase === 'start') {
      this.s.hp = TRAWL_HP;
      this.phase('enter');
      this.st.radio(
        'PAK DAMAR',
        this.s.story
          ? 'Dari pos jaga terlihat pelampung bergaris ditebar di tempat ikan bertelur. Jangan sampai tergulung!'
          : 'Kapal pukat kembali ke tempat ikan bertelur.'
      );
    } else {
      this.s.phase = 'enter';
      this.s.t = 0;
      this.s.work = 0;
    }
    this.ship = this.sim.add('trawl_ship', WORLD_W + 80, TRAWL_GATE.y + 14, {
      radius: 36,
      mass: 4,
      hp: this.s.hp,
      maxHp: TRAWL_HP,
      rotation: Math.PI,
    });
    this.sim.audio.playAlert();
  }

  update(dt: number): void {
    const s = this.s;
    const e = this.ship;
    if (!e) return;
    e.hp = Math.max(0, s.hp);
    if (s.phase === 'enter') {
      if (hyp(e.x - TRAWL_STATION.x, e.y - TRAWL_STATION.y) < 30) {
        this.trawl = new Trawl(this.st, SPAWNING_GROUND, 62);
        this.phase('haul');
        this.sim.text(SPAWNING_GROUND.x, SPAWNING_GROUND.y - 60, 'PUKAT DITARIK', '#ffc46a', 1);
      }
      return;
    }
    if (s.phase !== 'haul' || !this.trawl) return;
    s.work += dt / WINCH;
    this.st.view.school.caught = Math.min(1, s.work * 1.1);
    if (this.trawl.update(dt, s.work, e)) {
      this.finish('done');
    } else if (s.work >= 1) {
      this.finish('failed');
    }
  }

  private finish(result: JobResult): void {
    const e = this.ship;
    if (!e) return;
    this.trawl?.clear();
    this.trawl = null;
    this.st.sendOff(e);
    this.ship = null;
    if (result === 'done') {
      this.st.view.school.freed = 1;
      this.st.s.saved.trawls += 1;
      this.st.settle(this, 'done', PAY.trawl, { x: SPAWNING_GROUND.x, y: SPAWNING_GROUND.y - 20 }, 'KAWANAN LOLOS!');
    } else {
      this.st.view.school.gone = 40;
      this.st.loseTrawl();
      this.st.settle(this, 'failed', 0, SPAWNING_GROUND, '');
    }
  }

  move(e: Entity, dt: number): boolean {
    if (e === this.ship) {
      // in round the south of the big rock, then up to the spawning ground
      if (e.x < TRAWL_GATE.x + 36) this.through = true;
      const to = this.through ? TRAWL_STATION : TRAWL_GATE;
      steer(e, to.x, to.y, 62, dt, 1.2);
      roundRocks(e, dt);
      const moving = this.s.phase === 'enter' && hyp(e.vx, e.vy) > 16;
      face(e, moving ? Math.atan2(e.vy, e.vx) : Math.PI * 0.98, dt, 1.4);
      return true;
    }
    return this.trawl?.move(e, dt) ?? false;
  }

  hit(e: Entity, w: Wave, px: number, py: number): Touch {
    if (e === this.ship) {
      const dmg = this.hullHit(e, w, px, py, 60);
      if (dmg <= 0) return 'hold';
      this.s.hp -= dmg;
      this.showHit(e, dmg);
      if (this.s.hp <= 0) this.finish('done');
      return 'hold';
    }
    this.s.touched = true;
    return 'push';
  }

  objective(): Objective {
    const t = this.trawl;
    if (!t) {
      return { key: 'trawl:enter', title: 'Kapal pukat masuk', sub: 'Pelampung bergarisnya akan ditebar di jalur ikan.', icon: 'float', swatch: 'orange', at: this.ship ? { x: this.ship.x, y: this.ship.y } : undefined };
    }
    const next = t.floats.find((f) => !t.out(f)) ?? t.floats[0];
    const side = next.tag === 'A' ? -1 : 1;
    return {
      key: `trawl:${t.cleared}`,
      title: 'Bebaskan kawanan ikan',
      sub: `Sapu kedua pelampung bergaris keluar dari jalur ikan · ${t.cleared}/2`,
      icon: 'float',
      swatch: 'blue',
      at: { x: next.x, y: next.y },
      swipe: this.s.touched
        ? undefined
        : { from: { x: next.x + 10, y: next.y - side * 74 }, to: { x: next.x - 10, y: next.y + side * 40 } },
    };
  }

  clear(): void {
    if (this.ship) this.sim.remove(this.ship.id);
    this.trawl?.clear();
  }
}

/* ================================================================== the drum carrier */

const DUMP = 21;

export class WasteJob extends Job {
  private ship: Entity | null = null;

  enter(resumed: boolean): void {
    if (!resumed || this.s.phase === 'start') {
      this.s.hp = POLLUTER_HP;
      this.s.sources = this.st.s.sources.filter((q) => q.kind === 'spill').map((q) => q.id);
      this.phase('enter');
      this.st.radio(
        'BU SARI',
        this.s.story
          ? 'Di batu itu masih ada minyak lama, dan kapal drum kuning mau membuang lagi. Halau dulu!'
          : 'Kapal drum kuning mendekat. Halau sebelum drumnya jatuh.'
      );
    } else if (this.s.phase !== 'clean') {
      this.s.phase = 'enter';
      this.s.t = 0;
      this.s.work = 0;
    }
    if (this.s.phase === 'clean') return;
    this.ship = this.sim.add('polluter', WORLD_W + 80, DUMP_STATION.y + 10, {
      radius: 33,
      mass: 3.4,
      hp: this.s.hp,
      maxHp: POLLUTER_HP,
      rotation: Math.PI,
    });
    this.sim.audio.playAlert();
  }

  get dumping(): number {
    return this.s.phase === 'dump' ? this.s.work : 0;
  }

  update(dt: number): void {
    const s = this.s;
    if (s.phase === 'clean') {
      s.sources = s.sources.filter((id) => this.st.s.sources.some((q) => q.id === id));
      if (s.sources.length === 0) {
        this.st.settle(this, 'done', s.leaked ? PAY.wasteLeaked : PAY.waste, { x: DUMP_SPOT.x - 40, y: DUMP_SPOT.y - 40 }, s.leaked ? 'TUMPAHAN TERSERAP!' : 'BUANGAN DICEGAH!');
        return;
      }
      if (!s.story && s.t > 130) this.st.settle(this, 'ignored', 0, DUMP_SPOT, '');
      return;
    }
    const e = this.ship;
    if (!e) return;
    e.hp = Math.max(0, s.hp);
    if (s.phase === 'enter') {
      if (hyp(e.x - DUMP_STATION.x, e.y - DUMP_STATION.y) < 30) this.phase('dump');
      return;
    }
    s.work += dt / DUMP;
    if (s.work >= 1) {
      s.leaked = true;
      const id = this.st.leak(DUMP_SPOT);
      if (id) s.sources.push(id);
      this.sim.audio.playSplash(1.3);
      this.st.radio('BU SARI', 'Drumnya bocor! Tumpahan baru harus diserap juga.');
      this.st.sendOff(e);
      this.ship = null;
      this.cleanUp();
    }
  }

  private cleanUp(): void {
    this.phase('clean');
    this.st.s.padTimer = Math.min(this.st.s.padTimer, 1.6);
    if (this.s.sources.length > 0 && !this.s.leaked) {
      this.st.radio('PAK DAMAR', 'Kapalnya lari. Kulempar bantalan penyerap, dorong melintasi bercaknya.');
    }
  }

  move(e: Entity, dt: number): boolean {
    if (e !== this.ship) return false;
    steer(e, DUMP_STATION.x, DUMP_STATION.y, 60, dt, 1.2);
    face(e, Math.PI * 1.04, dt, 1.4);
    return true;
  }

  hit(e: Entity, w: Wave, px: number, py: number): Touch {
    if (e !== this.ship) return 'push';
    const dmg = this.hullHit(e, w, px, py, 80);
    if (dmg <= 0) return 'hold';
    this.s.hp -= dmg;
    this.showHit(e, dmg);
    if (this.s.hp <= 0) {
      this.sim.text(e.x, e.y - 50, 'KAPAL DRUM LARI!', '#c8fff4', 1.1);
      this.st.sendOff(e);
      this.ship = null;
      this.cleanUp();
    }
    return 'hold';
  }

  objective(): Objective {
    if (this.s.phase === 'clean') {
      const n = this.s.sources.length;
      const spill = this.st.s.sources.find((q) => q.id === this.s.sources[0]);
      const pad = this.sim.entities.find((q) => q.kind === 'pad');
      return {
        key: `waste:clean:${n}:${pad ? 1 : 0}`,
        title: this.s.leaked ? 'Serap tumpahan minyak' : 'Serap bercak lama di batu',
        sub: pad ? `Dorong bantalan putih melintasi bercak · sisa ${n}` : `Nelayan menyiapkan bantalan penyerap · sisa ${n}`,
        icon: 'pad',
        swatch: 'teal',
        at: pad && pad.actionTimer <= 0 ? { x: pad.x, y: pad.y } : spill ? { x: spill.x, y: spill.y } : undefined,
        swipe:
          pad && pad.actionTimer <= 0 && spill && this.st.padPushes === 0
            ? towards({ x: pad.x, y: pad.y }, spill)
            : undefined,
      };
    }
    const at = this.ship ? { x: this.ship.x, y: this.ship.y } : undefined;
    return { key: 'waste:ship', title: 'Halau kapal drum kuning', sub: 'Hantam lambungnya sebelum drum jatuh ke laut.', icon: 'drum', swatch: 'red', at };
  }

  clear(): void {
    if (this.ship) this.sim.remove(this.ship.id);
  }
}

/** A swipe that carries something from where it is towards a place. */
function towards(a: Point, b: Point): { from: Point; to: Point } {
  const d = hyp(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / d;
  const uy = (b.y - a.y) / d;
  return { from: { x: a.x - ux * 70, y: a.y - uy * 70 }, to: { x: a.x + ux * 60, y: a.y + uy * 60 } };
}

/* ================================================================== mother and calf */

interface PodLane {
  path: Point[];
  nets: Point[];
}

const POD_LANES: PodLane[] = [
  {
    path: [{ x: 1180, y: 348 }, { x: 1010, y: 252 }, { x: 872, y: 226 }, { x: 730, y: 240 }, { x: 560, y: 292 }, { x: 470, y: 200 }, { x: 560, y: 120 }],
    nets: [{ x: 954, y: 238 }, { x: 852, y: 224 }, { x: 742, y: 238 }],
  },
  {
    path: [{ x: 1190, y: 430 }, { x: 1010, y: 436 }, { x: 850, y: 452 }, { x: 700, y: 500 }, { x: 600, y: 580 }, { x: 720, y: 640 }],
    nets: [{ x: 940, y: 440 }, { x: 834, y: 456 }, { x: 716, y: 492 }],
  },
];

const POD_WAIT = 78;

export class CalfJob extends Job {
  private nets: Entity[] = [];
  private lane = POD_LANES[this.s.variant % POD_LANES.length];
  private leg = 0;

  enter(resumed: boolean): void {
    if (!resumed || this.s.phase === 'start') {
      this.phase('wait');
      this.st.radio(
        'A.L.U.N.',
        this.s.story
          ? 'Induk lumba-lumba kembali membawa anaknya. Jaring hanyut menutup jalur mereka.'
          : 'Lumba-lumba tertahan jaring hanyut. Buka jalurnya.'
      );
    } else if (this.s.phase !== 'swim') {
      this.s.t = 0;
    }
    const p = this.lane.path[0];
    this.st.view.pod = { x: p.x, y: p.y, a: Math.PI, swim: 0, happy: 0 };
    this.sim.audio.playDolphin('distress');
    if (this.s.phase === 'swim') return;
    for (const n of this.lane.nets) {
      this.nets.push(this.sim.add('drift_net', n.x, n.y, { radius: 22, mass: 1.15, home: { x: n.x, y: n.y } }));
    }
  }

  private out(e: Entity): boolean {
    return hyp(e.x - e.home!.x, e.y - e.home!.y) > 78;
  }

  update(dt: number): void {
    const pod = this.st.view.pod;
    if (!pod) return;
    const s = this.s;
    if (s.phase === 'wait') {
      const p = this.lane.path[0];
      pod.x = p.x + Math.cos(s.total * 0.7) * 26;
      pod.y = p.y + Math.sin(s.total * 0.7) * 14;
      pod.a = s.total * 0.7 + Math.PI / 2;
      pod.swim = 0.4;
      for (let i = this.nets.length - 1; i >= 0; i--) {
        const n = this.nets[i];
        if (this.out(n)) {
          this.nets.splice(i, 1);
          this.sim.remove(n.id);
          this.sim.burst(n.x, n.y, '#c8fff4', 12);
          this.sim.text(n.x, n.y - 22, 'JALUR TERBUKA', '#c8fff4', 0.9);
          this.sim.audio.playNetSnap(0.6);
          this.st.touchSave();
        }
      }
      if (this.nets.length === 0) {
        this.leg = 1;
        this.phase('swim');
        return;
      }
      if (s.t > POD_WAIT) {
        this.st.radio('BU SARI', 'Mereka berbalik ke laut dalam. Nanti mereka coba lagi.');
        this.clear();
        this.st.settle(this, 'failed', 0, p, '');
      }
      return;
    }
    // swim the lane, point to point
    const path = this.lane.path;
    if (this.leg === 0) this.leg = 1;
    const to = path[Math.min(this.leg, path.length - 1)];
    const dx = to.x - pod.x;
    const dy = to.y - pod.y;
    const d = hyp(dx, dy) || 1;
    const speed = 108;
    const want = Math.atan2(dy, dx);
    pod.a += Math.atan2(Math.sin(want - pod.a), Math.cos(want - pod.a)) * Math.min(1, dt * 3);
    pod.x += Math.cos(pod.a) * speed * dt;
    pod.y += Math.sin(pod.a) * speed * dt;
    pod.swim = 1;
    pod.happy = Math.min(1, pod.happy + dt * 0.6);
    if (d < 46) this.leg += 1;
    if (this.leg >= path.length || s.t > 16) {
      const mid = path[2];
      this.st.s.saved.dolphins += 1;
      this.sim.audio.playDolphin('happy');
      this.st.podLeaves();
      this.st.settle(this, 'done', PAY.dolphin, { x: mid.x, y: mid.y - 24 }, 'INDUK & ANAK LEWAT!');
    }
  }

  hit(_e: Entity, w: Wave): Touch {
    if (w.kind !== 'buoy_pulse') this.s.touched = true;
    return 'push';
  }

  move(e: Entity, dt: number): boolean {
    if (e.kind !== 'drift_net') return false;
    // adrift, but the eddy over the lane keeps it there until something shoves it out
    const h = e.home!;
    e.vx += (h.x - e.x) * 0.25 * dt;
    e.vy += (h.y - e.y) * 0.25 * dt;
    this.sim.drift(e, dt, 0.955, 420);
    return true;
  }

  objective(): Objective {
    if (this.s.phase === 'swim') {
      const pod = this.st.view.pod;
      return { key: 'calf:swim', title: 'Jalurnya terbuka', sub: 'Induk dan anak sedang melintas.', icon: 'dolphin', swatch: 'green', at: pod ? { x: pod.x, y: pod.y } : undefined };
    }
    const n = this.lane.nets.length - this.nets.length;
    const next = this.nets[0];
    return {
      key: `calf:${n}`,
      title: this.s.story ? 'Buka jalan untuk induk dan anak' : 'Buka jalan untuk lumba-lumba',
      sub: `Sapu jaring hanyut keluar dari jalurnya · ${n}/${this.lane.nets.length}`,
      icon: 'dolphin',
      swatch: 'teal',
      at: next ? { x: next.x, y: next.y } : undefined,
      swipe: next && !this.s.touched ? { from: { x: next.x + 8, y: next.y + 74 }, to: { x: next.x - 8, y: next.y - 44 } } : undefined,
    };
  }

  clear(): void {
    for (const n of this.nets) this.sim.remove(n.id);
    this.nets = [];
    this.st.view.pod = null;
  }
}

/* ================================================================== a fire at the forest edge */

export class FireJob extends Job {
  private id = 0;

  enter(resumed: boolean): void {
    const spot = FIRE_SPOTS[this.s.variant % FIRE_SPOTS.length];
    const e = this.sim.add('fire', spot.x, spot.y, { radius: 24, mass: 99, hp: 2.6, maxHp: 2.6 });
    this.id = e.id;
    if (resumed && this.s.phase === 'burn') return;
    this.phase('burn');
    this.st.radio('PENJAGA RIMBA', 'Ada api di tepi hutan. Kirim ombak sampai memercik ke pantai!');
    this.sim.audio.playAlert();
  }

  update(): void {
    if (this.s.t > 70) {
      this.clear();
      this.st.settle(this, 'ignored', 0, FIRE_SPOTS[this.s.variant % FIRE_SPOTS.length], '');
    }
  }

  /** Splashed with enough water. */
  douse(e: Entity): void {
    this.sim.progress.totalFires += 1;
    this.clear();
    this.st.settle(this, 'done', firePay(this.sim.stats.forestLevel), { x: e.x, y: e.y - 14 }, 'API PADAM!');
  }

  objective(): Objective {
    const spot = FIRE_SPOTS[this.s.variant % FIRE_SPOTS.length];
    return { key: 'fire', title: 'Padamkan api di tepi hutan', sub: 'Geser ombak ke pantai di dekatnya. Tahan dulu supaya lebih kuat.', icon: 'fire', swatch: 'red', at: spot };
  }

  clear(): void {
    this.sim.remove(this.id);
  }
}

/* ================================================================== the mother ship */

const GEAR_TRAWL = 24;
const GEAR_DRUM = 21;
const WINDOW = 10;
/** A whole turn of the storm cannot take more than this off the hull, so both kinds of gear get their turn. */
const PER_WINDOW = 30;
const DRUM_REEF: Point = { x: 1070, y: 600 };
const BOSS_STATION: Point = { x: 1060, y: 372 };

export class BossJob extends Job {
  private ship: Entity | null = null;
  trawl: Trawl | null = null;
  private drum: Entity | null = null;

  enter(resumed: boolean): void {
    if (!resumed || this.s.phase === 'start') {
      this.s.hp = this.st.s.bossHp;
      this.s.phase = 'enter';
      this.s.t = 0;
      this.st.radio('BU SARI', 'Kapal induk masuk. Gagalkan alatnya dulu, lalu hantam lambungnya selagi ia berhenti.');
      this.st.touchSave();
    }
    const at = this.s.at ?? (this.s.phase === 'enter' ? { x: WORLD_W + 120, y: BOSS_STATION.y } : BOSS_STATION);
    this.ship = this.sim.add('trawler', at.x, at.y, {
      radius: 50,
      mass: 5,
      hp: this.s.hp,
      maxHp: BOSS_HP,
      rotation: Math.PI,
    });
    if (this.s.phase === 'gear_trawl' || this.s.phase === 'gear_drum') {
      // Older saves can still resume the deployment from its starting point.
      if (!this.s.gearAt) {
        this.s.t = 0;
        this.s.work = 0;
      }
      if (this.s.phase === 'gear_trawl') this.lowerTrawl(this.s.gearAt);
      else this.lowerDrum(this.s.gearAt?.[0]);
    }
    if (this.open) this.s.windowDamage ??= Math.min(PER_WINDOW, BOSS_HP - this.s.hp);
    this.sim.bossActive = true;
    this.sim.audio.playAlert();
  }

  snapshot(): void {
    const e = this.ship;
    if (e) this.s.at = { x: e.x, y: e.y };
    this.s.gearAt = this.trawl?.floats.map(({ x, y }) => ({ x, y }));
    if (this.drum) this.s.gearAt = [{ x: this.drum.x, y: this.drum.y }];
  }

  /** The hull can be hurt: it lies still, hauling its gear back. */
  get open(): boolean {
    return this.s.phase === 'window';
  }

  get drumAt(): Entity | null {
    return this.drum;
  }

  private lowerTrawl(positions?: Point[]): void {
    this.trawl = new Trawl(this.st, { x: SPAWNING_GROUND.x - 10, y: SPAWNING_GROUND.y + 30 }, 62, positions);
    this.trawl.update(0, this.s.work, this.ship);
  }

  private lowerDrum(at?: Point): void {
    const e = this.ship!;
    const start = at ?? { x: e.x - 70, y: e.y + 66 };
    this.drum = this.sim.add('drum', start.x, start.y, { radius: 18, mass: 1.6, home: { ...DRUM_REEF } });
  }

  private nextGear(): void {
    const s = this.s;
    s.work = 0;
    s.turns += 1;
    if (s.turns % 2 === 1) {
      s.seen.trawl = true;
      this.lowerTrawl();
      this.phase('gear_trawl');
      this.st.radio('A.L.U.N.', 'Pukatnya turun di tempat ikan bertelur. Sapu kedua pelampung bergaris keluar.');
    } else {
      s.seen.drum = true;
      this.lowerDrum();
      this.phase('gear_drum');
      this.st.radio('A.L.U.N.', 'Drum hanyut ke karang kanan bawah. Sapu menjauh dari karang!');
    }
  }

  private openWindow(text: string): void {
    this.trawl?.clear();
    this.trawl = null;
    if (this.drum) this.sim.remove(this.drum.id);
    this.drum = null;
    this.s.windowDamage = 0;
    this.phase('window');
    this.sim.text(this.ship!.x, this.ship!.y - 74, text, '#c8fff4', 1.15);
    this.st.radio('BU SARI', 'Ia berhenti menarik alatnya. Hantam lambungnya sekarang!');
  }

  update(dt: number): void {
    const s = this.s;
    const e = this.ship;
    if (!e) return;
    this.st.s.bossHp = s.hp;
    e.hp = Math.max(0, s.hp);
    switch (s.phase) {
      case 'enter':
        if (hyp(e.x - BOSS_STATION.x, e.y - BOSS_STATION.y) < 40) this.nextGear();
        break;
      case 'gear_trawl': {
        s.work += dt / GEAR_TRAWL;
        this.st.view.school.caught = Math.min(1, s.work);
        if (this.trawl!.update(dt, s.work, e)) {
          this.st.view.school.freed = 1;
          this.openWindow('PUKAT GAGAL!');
        } else if (s.work >= 1) {
          this.trawl!.clear();
          this.trawl = null;
          this.st.view.school.gone = 20;
          this.st.loseTrawl();
          this.phase('rest');
        }
        break;
      }
      case 'gear_drum': {
        const d = this.drum!;
        s.work += dt / GEAR_DRUM;
        const reef = hyp(d.x - DRUM_REEF.x, d.y - DRUM_REEF.y);
        if (reef < 66 || s.work >= 1) {
          if (reef < 150) {
            s.leaked = true;
            this.st.leak({ x: Math.round(d.x), y: Math.round(d.y) });
            this.sim.audio.playSplash(1.3);
            this.st.radio('BU SARI', 'Drumnya pecah di karang. Tumpahannya bisa diserap setelah ini.');
            this.sim.remove(d.id);
            this.drum = null;
            this.phase('rest');
          } else {
            this.openWindow('DRUM MENJAUH!');
          }
        } else if (reef > 268) {
          this.openWindow('DRUM MENJAUH!');
        }
        break;
      }
      case 'window':
        if (s.t > WINDOW || (s.windowDamage ?? 0) >= PER_WINDOW) this.phase('rest');
        break;
      case 'rest':
        if (s.t > 3.2) this.nextGear();
        break;
    }
  }

  move(e: Entity, dt: number): boolean {
    if (e === this.ship) {
      const sway = this.s.phase === 'window' ? 0 : Math.sin(this.s.total * 0.45) * 30;
      steer(e, BOSS_STATION.x, BOSS_STATION.y + sway, 70, dt, 1.1);
      face(e, Math.PI, dt, 1);
      return true;
    }
    if (e === this.drum) {
      const dx = DRUM_REEF.x - e.x;
      const dy = DRUM_REEF.y - e.y;
      const d = hyp(dx, dy) || 1;
      e.vx += (dx / d) * 24 * dt;
      e.vy += (dy / d) * 24 * dt;
      this.sim.drift(e, dt, 0.962, 380);
      return true;
    }
    return this.trawl?.move(e, dt) ?? false;
  }

  hit(e: Entity, w: Wave, px: number, py: number): Touch {
    if (e !== this.ship) {
      if (w.kind !== 'buoy_pulse') this.s.touched = true;
      return 'push';
    }
    const dmg = this.hullHit(e, w, px, py, 34);
    if (dmg <= 0) return 'hold';
    if (!this.open) {
      this.sim.text(e.x - 20, e.y - 60, 'GAGALKAN ALATNYA DULU', '#ffc46a', 0.9);
      e.hitFlash = 0.1;
      return 'hold';
    }
    const dealt = this.s.windowDamage ?? 0;
    const take = Math.min(dmg, PER_WINDOW - dealt, this.s.hp);
    if (take <= 0) return 'hold';
    this.s.windowDamage = dealt + take;
    this.s.hp -= take;
    this.st.s.bossHp = this.s.hp;
    this.showHit(e, take);
    this.sim.shake(7);
    this.st.touchSave();
    if (this.s.hp <= 0) {
      this.sim.burst(e.x, e.y, '#ffe07d', 40);
      this.sim.flashAlpha = 0.4;
      this.sim.shake(15);
      this.st.sendOff(e);
      this.ship = null;
      this.sim.bossActive = false;
      this.clear();
      this.st.settle(this, 'done', 0, { x: e.x, y: e.y }, 'KAPAL INDUK MUNDUR!');
    }
    return 'hold';
  }

  objective(): Objective {
    const e = this.ship;
    const hits = Math.ceil(Math.max(0, this.s.hp) / 10);
    const at = e ? { x: e.x, y: e.y } : undefined;
    switch (this.s.phase) {
      case 'gear_trawl': {
        const t = this.trawl!;
        const next = t.floats.find((f) => !t.out(f)) ?? t.floats[0];
        return { key: `boss:trawl:${t.cleared}`, title: 'Belokkan pukat kapal induk', sub: `Sapu kedua pelampung bergaris keluar dari jalur ikan · ${t.cleared}/2`, icon: 'float', swatch: 'blue', at: { x: next.x, y: next.y } };
      }
      case 'gear_drum': {
        const d = this.drum!;
        return { key: 'boss:drum', title: 'Jauhkan drum dari karang', sub: 'Sapu drum kuning menjauh dari karang kanan bawah.', icon: 'drum', swatch: 'gold', at: { x: d.x, y: d.y } };
      }
      case 'window':
        return { key: `boss:window:${hits}`, title: 'Hantam lambungnya sekarang!', sub: `Ia berhenti menarik alat · sekitar ${hits} hantaman dasar lagi`, icon: 'boss', swatch: 'red', at };
      default:
        return { key: 'boss:rest', title: 'Kapal induk di laguna', sub: 'Tunggu alatnya turun, lalu gagalkan.', icon: 'boss', swatch: 'purple', at };
    }
  }

  clear(): void {
    if (this.ship) this.sim.remove(this.ship.id);
    this.ship = null;
    this.trawl?.clear();
    this.trawl = null;
    if (this.drum) this.sim.remove(this.drum.id);
    this.drum = null;
    this.sim.bossActive = false;
  }
}
