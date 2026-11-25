import * as THREE from 'three';
import type { GameSimulation } from '../simulation';
import type { ComputedStats } from '../types';
import type { Actors } from './actors';
import { Build, matrixOf } from './build';
import { TITLE_POSE, type Pose } from './director';
import type { Fx } from './fx';
import { outlineMaterial } from './gfx';
import { inked, mesh } from './kit';
import { clamp, lerp, rng, simX, simY, smooth, toX, toZ } from './space';
import { perahu, person, propPair } from './village';
import type { Water } from './water';

/**
 * The opening: a drone tour of the lagoon as it was, a boat of tourists who leave it full of rubbish,
 * and A.L.U.N. waking up to the mess. Everything is the live scene with the camera flown by hand, and
 * the rubbish thrown overboard is the very trash the player starts with.
 */

export interface OpeningHooks {
  /** A subtitle to show, or two empty strings to clear it. */
  caption?: (kicker: string, line: string) => void;
  /** One-off sounds: a splash, a throw, A.L.U.N. coming online. */
  sound?: (kind: 'splash' | 'throw' | 'alun', strength: number) => void;
  /** Outboard motor loudness, 0..1, every frame. */
  motor?: (level: number) => void;
  /** How much birdsong there should be, 0..1, every frame: a full chorus that falls silent with the rubbish. */
  birds?: (level: number) => void;
}

/** Seconds. */
export const OPENING_LENGTH = 32.5;

const CAPTIONS: { from: number; to: number; kicker: string; line: string }[] = [
  { from: 0.7, to: 5.0, kicker: 'PAGI DI PESISIR', line: 'Laguna Alun, jernih dan tenang.' },
  { from: 6.0, to: 9.6, kicker: 'DESA NELAYAN', line: 'Warga hidup dari laut yang bersih.' },
  { from: 10.6, to: 14.2, kicker: 'TERUMBU KARANG', line: 'Karang berwarna-warni tumbuh di bawah air.' },
  { from: 15.2, to: 18.9, kicker: 'TAMU DATANG', line: 'Rombongan wisatawan menyeberang ke laguna...' },
  { from: 19.6, to: 25.2, kicker: 'TAPI...', line: '...sampahnya dibuang begitu saja ke laut.' },
  { from: 26.0, to: 31.2, kicker: 'A.L.U.N. · SISTEM AKTIF', line: 'Laguna tercemar! Ayo kita bersihkan.' },
];

/** When A.L.U.N. comes online. */
const WAKE_AT = 26.2;

/* ================================================================== smooth curves through timed keys */

/**
 * Cubic Hermite through keys of [time, ...values]. Tangents come from the neighbours divided by real
 * time, so a move with keys at uneven times still keeps one steady pace through them.
 */
class Track {
  private readonly dim: number;
  constructor(private readonly keys: number[][]) {
    this.dim = keys[0].length - 1;
  }

  get start(): number {
    return this.keys[0][0];
  }

  get end(): number {
    return this.keys[this.keys.length - 1][0];
  }

  at(t: number, out: number[]): number[] {
    const k = this.keys;
    const n = k.length;
    if (t <= k[0][0] || n === 1) {
      for (let d = 0; d < this.dim; d++) out[d] = k[0][d + 1];
      return out;
    }
    if (t >= k[n - 1][0]) {
      for (let d = 0; d < this.dim; d++) out[d] = k[n - 1][d + 1];
      return out;
    }
    let i = 0;
    while (i < n - 2 && t >= k[i + 1][0]) i++;
    const a = k[i];
    const b = k[i + 1];
    const h = b[0] - a[0];
    const u = (t - a[0]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    for (let d = 1; d <= this.dim; d++) {
      out[d - 1] = h00 * a[d] + h10 * h * this.slope(i, d) + h01 * b[d] + h11 * h * this.slope(i + 1, d);
    }
    return out;
  }

  private slope(j: number, d: number): number {
    const k = this.keys;
    const p = k[Math.max(0, j - 1)];
    const q = k[Math.min(k.length - 1, j + 1)];
    return (q[d] - p[d]) / (q[0] - p[0]);
  }
}

/* ================================================================== the boat's route */

/**
 * In from the open sea through the gap between the rocks, slowing as the rubbish goes over the side,
 * a lazy turn short of the village, and away again fast along the south of the lagoon.
 */
const ROUTE = new Track([
  [11.5, 140, -6.5],
  [14.5, 98, -4],
  [17, 66, -1.5],
  [19, 46, 1],
  [21, 30, 3.5],
  [23, 15, 6],
  [25, 2, 9.5],
  [26.5, -4, 15],
  [27.8, 3, 21],
  [29.2, 19, 24.5],
  [30.6, 40, 27.5],
  [32, 66, 31],
  [33.5, 94, 34],
  [35, 122, 37],
]);
const BOAT_FROM = 11.6;
const BOAT_TO = 34.9;

const _r2 = [0, 0];

function routeAt(t: number, out: THREE.Vector3): THREE.Vector3 {
  ROUTE.at(t, _r2);
  return out.set(_r2[0], 0, _r2[1]);
}

function headingAt(t: number, out: THREE.Vector3): THREE.Vector3 {
  ROUTE.at(t + 0.05, _r2);
  const x1 = _r2[0];
  const z1 = _r2[1];
  ROUTE.at(t - 0.05, _r2);
  out.set(x1 - _r2[0], 0, z1 - _r2[1]);
  const len = out.length();
  return len > 1e-5 ? out.multiplyScalar(1 / len) : out.set(-1, 0, 0);
}

function speedAt(t: number): number {
  ROUTE.at(t + 0.05, _r2);
  const x1 = _r2[0];
  const z1 = _r2[1];
  ROUTE.at(t - 0.05, _r2);
  return Math.hypot(x1 - _r2[0], z1 - _r2[1]) / 0.1;
}

/* ================================================================== models */

/** A jukung fitted out for day trips: longer, a striped awning, an outboard, a cooler. Bow points +X. */
function jukung(): THREE.BufferGeometry {
  const b = new Build(31);
  b.merge(perahu('#1f9bd0', '#ffd23a', null, false), matrixOf([0, 0, 0], [0, 0, 0], [1.75, 1.15, 1.5]));
  // awning posts
  for (const x of [-2.7, 0.15, 2.9]) for (const z of [-0.78, 0.78]) b.bar([x, 0.3, z], [x, 2.52, z], 0.05, 0.045, { color: '#f2ede0', seg: 6 });
  // a striped awning, wound so both slopes face the sky
  const n = 9;
  const x0 = -3.1;
  const x1 = 3.3;
  for (let i = 0; i < n; i++) {
    const a = lerp(x0, x1, i / n);
    const c = lerp(x0, x1, (i + 1) / n);
    const col = i % 2 ? '#f7f2e6' : '#e8503e';
    b.quad([a, 2.74, 0], [a, 2.5, 1.12], [c, 2.5, 1.12], [c, 2.74, 0], { color: col });
    b.quad([a, 2.74, 0], [c, 2.74, 0], [c, 2.5, -1.12], [a, 2.5, -1.12], { color: col });
    // a short valance along each eave
    for (const s of [-1, 1]) b.quad([a, 2.5, s * 1.12], [a, 2.3, s * 1.14], [c, 2.3, s * 1.14], [c, 2.5, s * 1.12], { color: col, sway: 0.04 });
  }
  b.bar([x0 - 0.05, 2.75, 0], [x1 + 0.05, 2.75, 0], 0.05, 0.05, { color: '#f2ede0', seg: 6 });
  // outboard and its tiller
  b.box(0.52, 0.62, 0.44, { color: '#e8503e', pos: [-4.55, 0.92, 0], r: 0.12, gloss: 0.4 });
  b.box(0.46, 0.32, 0.4, { color: '#20262e', pos: [-4.55, 0.48, 0], r: 0.06 });
  b.bar([-4.6, 0.36, 0], [-4.68, -0.62, 0], 0.07, 0.06, { color: '#3a4048' });
  b.bar([-4.32, 0.98, 0], [-3.72, 1.04, 0.16], 0.04, 0.035, { color: '#20262e' });
  // cooler, a lifebuoy
  b.box(0.62, 0.42, 0.48, { color: '#2fb8c8', top: '#e8fbf4', pos: [-2.75, 0.22, 0.42], r: 0.08 });
  const white = new THREE.Color('#ffffff');
  const red = new THREE.Color('#ff5a3a');
  b.add(new THREE.TorusGeometry(0.34, 0.1, 6, 16), { color: (p) => (Math.floor((Math.atan2(p.y - 1.1, p.x - 0.15) + Math.PI) / 0.785) % 2 ? white : red), pos: [0.15, 1.1, 0.84] });
  // the boatman at the tiller
  b.merge(person({ shirt: '#f7f2e6', sarong: '#2f4f7a', hat: 'caping', scale: 0.92 }), matrixOf([-3.72, -0.3, 0.12], [0, Math.PI / 2, 0]));
  // pennant on the bow
  b.bar([3.95, 0.8, 0], [3.95, 2.75, 0], 0.035, 0.03, { color: '#8c6a3a', seg: 5 });
  b.quad([3.95, 2.7, 0], [3.95, 2.28, 0], [3.1, 2.46, 0.02], [3.1, 2.5, 0.02], { color: '#ff5fa2', sway: (p) => clamp((3.95 - p.x) * 0.5, 0, 0.5) });
  return b.geo(true);
}

type Hat = 'sun' | 'cap' | 'none';

/** A day-tripper: loud shirt, shorts, a hat against the sun, maybe sunglasses. Faces +Z, feet at 0. */
function tourist(shirt: string, shorts: string, skin: string, hat: Hat, hatCol: string, shades: boolean): THREE.BufferGeometry {
  const b = new Build(7);
  b.merge(person({ shirt, sarong: shorts, skin, hat: 'none' }));
  if (hat === 'sun') {
    b.cyl(0.52, 0.52, 0.04, { color: hatCol, pos: [0, 1.93, 0.01], seg: 16 });
    b.cyl(0.25, 0.3, 0.24, { color: hatCol, pos: [0, 2.05, -0.01], seg: 12 });
    b.cyl(0.305, 0.305, 0.06, { color: '#2f3a4c', pos: [0, 1.97, -0.01], seg: 12 });
  } else if (hat === 'cap') {
    b.ball(0.31, { color: hatCol, pos: [0, 1.82, -0.02], scale: [1, 0.62, 1], seg: 12 });
    b.box(0.34, 0.04, 0.26, { color: hatCol, pos: [0, 1.86, 0.32], rot: [0.12, 0, 0], r: 0.015 });
  }
  if (shades) {
    b.box(0.42, 0.09, 0.05, { color: '#15202c', pos: [0, 1.715, 0.305], r: 0.02, gloss: 0.9 });
    for (const s of [-1, 1]) b.box(0.03, 0.03, 0.22, { color: '#15202c', pos: [s * 0.22, 1.73, 0.19], r: 0.005 });
  }
  return b.geo(true);
}

function sack(): THREE.BufferGeometry {
  const b = new Build(9);
  b.ball(0.38, { color: '#2a2f36', scale: [1, 1.1, 0.9], seg: 12, rough: 0.06, gloss: 0.5 });
  b.ball(0.12, { color: '#2a2f36', pos: [0, 0.43, 0], scale: [1, 0.8, 1], seg: 7 });
  b.tube([[-0.08, 0.46, 0], [0.04, 0.68, 0.03], [0.12, 0.5, -0.02]], () => 0.04, { color: '#2a2f36', seg: 5, rings: 6 });
  // something sticking out of the top, so you can tell it is rubbish
  b.cyl(0.07, 0.07, 0.36, { color: '#a9e4ff', pos: [0.12, 0.46, 0.06], rot: [0.3, 0, -0.4], seg: 8, gloss: 0.9 });
  return b.geo(true);
}

/* ================================================================== the plan */

interface Rider {
  m: THREE.Mesh;
  base: THREE.Vector3;
  ph: number;
}

interface Throw {
  at: number;
  who: number;
  /** +1 throws to the boat's +Z side, -1 to the other. */
  side: number;
  dist: number;
  fwd: number;
  dur: number;
  arc: number;
  dump: boolean;
  thrown: boolean;
}

const FACE = Math.PI / 2;

export class Opening {
  readonly group = new THREE.Group();
  private boat = new THREE.Group();
  private riders: Rider[] = [];
  private bag: THREE.Mesh;
  private plan: Throw[] = [];
  private sim: GameSimulation | null = null;
  private stats: ComputedStats | null = null;
  private hooks: OpeningHooks = {};
  private clock = -1;
  private shown = -1;
  private woke = false;
  private dumped = false;
  private r = rng(4242);
  private p = new THREE.Vector3();
  private h = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private side = new THREE.Vector3();
  private out = [0, 0, 0, 0, 0, 0, 0];

  /* the takes, built once */
  private lift = new Track([
    [0, ...TITLE_POSE.pos.toArray(), ...TITLE_POSE.look.toArray(), TITLE_POSE.fov],
    [2.8, 5, 15, 36, -41, 2, 8, 42],
    [5.5, 18, 30, 40, -40, 0, -8, 46],
  ]);
  private village = new Track([
    [5.5, -11, 6.8, 31, -44, 2.2, 15, 38],
    [7.75, -12, 6.2, 17, -45, 1.6, 5, 38],
    [10, -13.5, 6.6, 2, -43, 1.0, -10, 38],
  ]);
  // high over the north rocks, so the open-sea horizon stays above the frame
  private arrive = new Track([
    [14.5, 54, 13, -17, 0, 0, 0, 26],
    [19, 50, 11.5, -12.5, 0, 0, 0, 34],
  ]);
  // A.L.U.N. on the left third, the spoiled lagoon and the boat leaving on the right
  private alun = new Track([
    [25.5, -37, 3.0, 28, -13, 1.8, 19.5, 30],
    [29, -35.5, 3.6, 26.5, -13, 1.9, 19.5, 28],
  ]);

  constructor(
    private water: Water,
    private fx: Fx,
    private actors: Actors
  ) {
    const pair = propPair(THREE.DoubleSide, false);
    const ink = outlineMaterial(1.1, '#33190f');
    const hull = inked(mesh(jukung(), pair), ink);
    hull.frustumCulled = false;
    this.boat.add(hull);

    const folk: [string, string, string, Hat, string, boolean, number, number][] = [
      ['#ff5fa2', '#f7f2e6', '#e8b48a', 'sun', '#f4e2b0', true, 2.55, 0.36],
      ['#ffd23a', '#2f4f7a', '#b97a50', 'cap', '#e8503e', false, 1.25, -0.38],
      ['#35d0e0', '#e8503e', '#d89a6a', 'none', '', true, -0.05, 0.36],
      ['#ff8a2a', '#3a4a5c', '#c98a5c', 'sun', '#fbf4e2', true, -1.55, -0.36],
    ];
    folk.forEach(([shirt, shorts, skin, hat, hatCol, shades, x, z], i) => {
      const m = inked(mesh(tourist(shirt, shorts, skin, hat, hatCol, shades), pair), ink);
      m.frustumCulled = false;
      m.scale.setScalar(0.9);
      const base = new THREE.Vector3(x, -0.24, z);
      m.position.copy(base);
      m.rotation.set(0, FACE, 0, 'YXZ');
      this.boat.add(m);
      this.riders.push({ m, base, ph: i * 1.7 });
    });

    this.bag = inked(mesh(sack(), pair), ink);
    this.bag.frustumCulled = false;
    this.bag.position.set(-2.35, 0.3, 0.3);
    this.boat.add(this.bag);

    this.group.add(this.boat);
    this.group.visible = false;
  }

  get active(): boolean {
    return this.sim !== null;
  }

  /** Clears the stage and lays out who throws what, and when. */
  begin(sim: GameSimulation, stats: ComputedStats, hooks: OpeningHooks): void {
    this.sim = sim;
    this.stats = stats;
    this.hooks = hooks;
    this.clock = -1;
    this.shown = -1;
    this.woke = false;
    this.dumped = false;
    this.r = rng(4242);
    this.bag.visible = true;
    this.plan = [];

    const total = sim.startingTrashCount(stats);
    const dumps = Math.min(3, Math.max(0, total - 4));
    const singles = total - dumps;
    const t0 = 19.8;
    const t1 = 24.1;
    for (let i = 0; i < singles; i++) {
      const who = [0, 2, 1, 3, 0, 2, 1][i % 7];
      // the front pair mostly throw to the +Z side, the back pair to -Z, with the odd one the other way
      const side = (who % 2 === 0 ? 1 : -1) * (i % 5 === 3 ? -1 : 1);
      // the camera rides on the +Z side, so what comes its way is lobbed short, low and astern,
      // where it drops out of frame instead of across the faces
      const near = side > 0;
      this.plan.push({
        at: lerp(t0, t1, singles > 1 ? i / (singles - 1) : 0) + (this.r() - 0.5) * 0.16,
        who,
        side,
        dist: near ? lerp(2.2, 3.0, this.r()) : lerp(4.2, 7.2, this.r()),
        fwd: near ? lerp(-3.2, -1.6, this.r()) : lerp(-1.5, 1.5, this.r()),
        dur: near ? lerp(0.65, 0.8, this.r()) : lerp(0.8, 1.0, this.r()),
        arc: near ? lerp(1.3, 1.8, this.r()) : lerp(2.6, 3.4, this.r()),
        dump: false,
        thrown: false,
      });
    }
    for (let i = 0; i < dumps; i++) {
      this.plan.push({
        at: 24.7 + i * 0.07,
        who: 3,
        side: -1,
        dist: lerp(1.6, 3.4, i / Math.max(1, dumps - 1)),
        fwd: -lerp(2.2, 4.0, this.r()),
        dur: lerp(0.5, 0.7, this.r()),
        arc: lerp(1.0, 1.6, this.r()),
        dump: true,
        thrown: false,
      });
    }
    this.plan.sort((a, b) => a.at - b.at);
  }

  /** The lagoon's health over the film: as it should be, then as the player is handed it. */
  eco(base: number): number {
    const clean = Math.max(85, base);
    return lerp(clean, base, smooth(19.4, 26, this.clock));
  }

  /** The camera, one pose per frame. False when the film is over. */
  shoot(t: number, out: Pose, play: Pose): boolean {
    const o = this.out;
    if (t < 5.5) {
      // lift off the beach and back over the water: the whole bay opens up
      const u = t / 5.5;
      this.lift.at(5.5 * ((u * u * (3 - u)) / 2), o);
      this.put(out, o, t, 1);
    } else if (t < 10) {
      // low along the village, the pier, the net
      this.put(out, this.village.at(t, o), t, 1);
    } else if (t < 14.5) {
      // circling the coral garden off the north rocks
      const u = (t - 10) / 4.5;
      const a = lerp(1.22, 2.36, u);
      const R = lerp(15.5, 14, u);
      o[0] = 30 + Math.cos(a) * R;
      o[1] = lerp(7.8, 6.6, u);
      o[2] = -24 + Math.sin(a) * R;
      o[3] = 29;
      o[4] = -1.4;
      o[5] = -25;
      o[6] = 40;
      this.put(out, o, t, 1);
    } else if (t < 19) {
      // down on the water, watching them come in from the horizon
      this.arrive.at(t, o);
      routeAt(t, this.p);
      o[3] = this.p.x;
      o[4] = 1.2;
      o[5] = this.p.z;
      this.put(out, o, t, 0.6);
    } else if (t < 22.5) {
      // alongside the boat, a little ahead of it, as the first things go over the side
      routeAt(t, this.p);
      headingAt(t, this.h);
      const sx = -this.h.z;
      const sz = this.h.x;
      const u = (t - 19) / 3.5;
      const ahead = lerp(4.5, 2.5, u);
      const off = lerp(10.5, 9.5, u);
      o[0] = this.p.x + this.h.x * ahead + sx * off;
      o[1] = lerp(4.8, 5.4, u);
      o[2] = this.p.z + this.h.z * ahead + sz * off;
      o[3] = this.p.x + this.h.x * 0.8;
      o[4] = 1.1;
      o[5] = this.p.z + this.h.z * 0.8;
      o[6] = 38;
      this.put(out, o, t, 0.8);
    } else if (t < 25.5) {
      // up and ahead of it, looking back down the trail it leaves
      routeAt(t, this.p);
      headingAt(t, this.h);
      const u = (t - 22.5) / 3;
      const sx = -this.h.z;
      const sz = this.h.x;
      const ahead = lerp(15, 17, u);
      o[0] = this.p.x + this.h.x * ahead + sx * 5;
      o[1] = lerp(19, 25, smooth(0, 1, u));
      o[2] = this.p.z + this.h.z * ahead + sz * 5;
      o[3] = this.p.x - this.h.x * lerp(2, 4, u);
      o[4] = 0;
      o[5] = this.p.z - this.h.z * lerp(2, 4, u);
      o[6] = 40;
      this.put(out, o, t, 1);
    } else if (t < 29) {
      // A.L.U.N., with what is left of the morning behind him
      this.put(out, this.alun.at(t, o), t, 0.7);
    } else if (t < OPENING_LENGTH) {
      // rise into the game
      this.alun.at(29, o);
      const k = smooth(0, 1, (t - 29) / (OPENING_LENGTH - 29));
      out.pos.set(lerp(o[0], play.pos.x, k), lerp(o[1], play.pos.y, k), lerp(o[2], play.pos.z, k));
      out.look.set(lerp(o[3], play.look.x, k), lerp(o[4], play.look.y, k), lerp(o[5], play.look.z, k));
      out.fov = lerp(o[6], play.fov, k);
    } else {
      out.pos.copy(play.pos);
      out.look.copy(play.look);
      out.fov = play.fov;
      return false;
    }
    return true;
  }

  /** Writes a pose with a drone's small, slow hover in it. */
  private put(out: Pose, o: number[], t: number, hover: number): void {
    const a = 0.08 * hover;
    out.pos.set(
      o[0] + (Math.sin(t * 0.83) + Math.sin(t * 1.91 + 1.3) * 0.4) * a,
      o[1] + Math.sin(t * 1.13 + 0.6) * a * 0.7,
      o[2] + (Math.cos(t * 0.71) + Math.sin(t * 1.57 + 2.1) * 0.4) * a
    );
    out.look.set(o[3] + Math.sin(t * 0.61 + 0.4) * a * 0.6, o[4] + Math.sin(t * 0.93) * a * 0.4, o[5] + Math.cos(t * 0.57) * a * 0.6);
    out.fov = o[6];
  }

  /** Moves the boat and its people, and lets things fly. `t` is the camera's clock. */
  update(t: number, dt: number, time: number, swell: number, cam: THREE.Vector3): void {
    if (!this.sim || !this.stats) return;
    this.clock = t;

    /* subtitles */
    let cap = -1;
    for (let i = 0; i < CAPTIONS.length; i++) if (t >= CAPTIONS[i].from && t < CAPTIONS[i].to) cap = i;
    if (cap !== this.shown) {
      this.shown = cap;
      if (cap >= 0) this.hooks.caption?.(CAPTIONS[cap].kicker, CAPTIONS[cap].line);
      else this.hooks.caption?.('', '');
    }
    if (!this.woke && t >= WAKE_AT) {
      this.woke = true;
      this.actors.cheerHero();
      this.hooks.sound?.('alun', 1);
    }
    // the clean lagoon is loud with birds; they go quiet as the rubbish goes in, and a few come back
    const birds = t < 17 ? 0.9 : t < 19.5 ? lerp(0.9, 0.3, smooth(17, 19.5, t)) : t < 26 ? 0.04 : lerp(0.04, 0.3, smooth(26, 30, t));
    this.hooks.birds?.(birds);

    /* the boat */
    const on = t >= BOAT_FROM && t <= BOAT_TO;
    this.group.visible = on;
    if (!on) {
      this.hooks.motor?.(0);
    } else {
      this.placeBoat(t, time, swell);
      const d = cam.distanceTo(this.boat.position);
      this.hooks.motor?.(Math.pow(clamp(1 - d / 70, 0, 1), 1.4) * smooth(BOAT_FROM, BOAT_FROM + 1.5, t) * (1 - smooth(BOAT_TO - 1.5, BOAT_TO, t)));
      this.wake(t, dt);
    }

    /* the people in it */
    for (let i = 0; i < this.riders.length; i++) this.pose(i, t, time);

    /* rubbish over the side */
    for (const th of this.plan) {
      if (th.thrown || t < th.at) continue;
      th.thrown = true;
      this.release(th, on);
    }
  }

  private placeBoat(t: number, time: number, swell: number): void {
    routeAt(t, this.p);
    headingAt(t, this.h);
    const yaw = Math.atan2(-this.h.z, this.h.x);
    // lean into the turn
    headingAt(t - 0.2, this.tmp);
    const a0 = Math.atan2(-this.tmp.z, this.tmp.x);
    headingAt(t + 0.2, this.tmp);
    const a1 = Math.atan2(-this.tmp.z, this.tmp.x);
    const turn = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)) / 0.4;
    const sp = speedAt(t);
    const wh = this.water.heightAt(this.p.x, this.p.z, time, swell);
    this.boat.position.set(this.p.x, 0.12 + wh * 0.7 + Math.sin(time * 1.7) * 0.04, this.p.z);
    this.boat.rotation.set(clamp(-turn * 0.16, -0.16, 0.16) + Math.sin(time * 1.3) * 0.03, yaw, clamp(sp * 0.005, 0, 0.065) + Math.sin(time * 1.1 + 1) * 0.02, 'YXZ');
    this.boat.updateMatrixWorld(true);
  }

  private wakeAcc = 0;
  private wake(t: number, dt: number): void {
    const sp = speedAt(t);
    if (sp < 1) return;
    const x = this.boat.position.x;
    const z = this.boat.position.z;
    const hx = this.h.x;
    const hz = this.h.z;
    const k = clamp(sp / 12, 0.3, 1.2);
    this.water.splash({ x: x - hx * 4.6, z: z - hz * 4.6, radius: 1.3 * k, foam: 0.75, impulse: 0.55 * k });
    this.wakeAcc += dt * (8 + sp);
    while (this.wakeAcc > 1) {
      this.wakeAcc -= 1;
      const s = this.r() < 0.5 ? -1 : 1;
      this.water.splash({ x: x + hx * 3.2 - hz * s * 1.1, z: z + hz * 3.2 + hx * s * 1.1, radius: 0.8, foam: 0.6, impulse: 0.35 * k });
      if (this.r() < 0.5) this.fx.spray(x + hx * 3.6 - hz * s * 1.0, 0.4, z + hz * 3.6 + hx * s * 1.0, -hz * s * 2 + hx * 1.5, lerp(1.2, 2.6, this.r()), hx * s * 2 + hz * 1.5, lerp(0.07, 0.14, this.r()), lerp(0.4, 0.7, this.r()), 0);
    }
  }

  /** Sitting, swaying, and when it is their turn: twist, wind up, throw, settle. */
  private pose(i: number, t: number, time: number): void {
    const rd = this.riders[i];
    let yaw = FACE + Math.sin(time * 0.7 + rd.ph) * 0.12;
    let lean = Math.sin(time * 1.3 + rd.ph) * 0.03;
    let rise = 0;
    for (const th of this.plan) {
      if (th.who !== i) continue;
      const p = (t - (th.at - 0.45)) / 0.95;
      if (p < 0 || p > 1) continue;
      const turn = smooth(0, 0.25, p) * (1 - smooth(0.72, 1, p));
      yaw = lerp(yaw, th.side > 0 ? 0.15 : Math.PI - 0.15, turn);
      // back on the wind-up, through on the throw
      lean += -0.4 * smooth(0.05, 0.4, p) * (1 - smooth(0.4, 0.5, p)) + 0.45 * smooth(0.42, 0.52, p) * (1 - smooth(0.6, 0.95, p));
      rise = Math.max(rise, (th.dump ? 0.42 : 0.28) * Math.sin(clamp(p, 0, 1) * Math.PI));
    }
    rd.m.position.set(rd.base.x, rd.base.y + rise + Math.abs(Math.sin(time * 2.1 + rd.ph)) * 0.015, rd.base.z);
    rd.m.rotation.set(lean, yaw, 0, 'YXZ');

    // the sack comes up with whoever empties it
    if (i === 3 && !this.dumped) {
      const dump = this.plan.find((th) => th.dump);
      if (dump) {
        const p = clamp((t - (dump.at - 0.45)) / 0.45, 0, 1);
        this.bag.position.set(lerp(-2.35, -1.55, p), lerp(0.3, 1.5, smooth(0, 1, p)), lerp(0.3, -0.75, p));
        this.bag.rotation.set(-p * 1.2, 0, p * 0.6);
      }
    }
  }

  /** Where a throw comes down. Worked out from the route, so a skipped film leaves the same lagoon. */
  private landing(th: Throw, out: THREE.Vector3): THREE.Vector3 {
    const t = th.at + th.dur * 0.6;
    routeAt(t, out);
    headingAt(th.at, this.side);
    const hx = this.side.x;
    const hz = this.side.z;
    // the boat's local +Z, turned with it: yaw takes +X to (hx, hz) and +Z to (-hz, hx)
    const sx = -hz;
    const sz = hx;
    return out.set(out.x + sx * th.side * th.dist + hx * th.fwd, 0, out.z + sz * th.side * th.dist + hz * th.fwd);
  }

  private release(th: Throw, live: boolean): void {
    const sim = this.sim!;
    const to = this.landing(th, new THREE.Vector3());
    const e = sim.createTrash(this.stats!, false, 'common', simX(to.x), simY(to.z));
    if (th.dump && e.kind === 'trash_bottle' && this.r() < 0.6) {
      // a sack of rubbish is mostly bags and takeaway boxes
      e.kind = 'trash_bag';
      e.value = 8;
      e.radius = 13.5;
      e.mass = 0.9;
    }
    to.set(toX(e.x), 0.25, toZ(e.y));
    const sp = speedAt(th.at);
    headingAt(th.at, this.h);
    const land = (): void => {
      e.age = 0.45;
      e.vx = this.h.x * sp * 2.2 + (this.r() - 0.5) * 8;
      e.vy = this.h.z * sp * 2.2 + (this.r() - 0.5) * 8;
      sim.entities.push(e);
      if (live) this.hooks.sound?.('splash', th.dump ? 0.7 : 1);
    };
    if (!live) {
      e.vx = e.vy = 0;
      land();
      return;
    }
    if (th.dump) {
      this.dumped = true;
      this.bag.visible = false;
    }
    const from = th.dump
      ? this.boat.localToWorld(new THREE.Vector3(-1.6, 1.55, -0.8))
      : this.boat.localToWorld(new THREE.Vector3(this.riders[th.who].base.x, 1.35, this.riders[th.who].base.z + th.side * 0.75));
    this.actors.toss(e, from, to, th.dur, th.arc, land);
    if (!th.dump) this.hooks.sound?.('throw', 1);
  }

  /** Jumps to the end: every throw lands where it would have, the boat is gone, the captions clear. */
  finish(): void {
    if (!this.sim) return;
    // what is still in the air lands quietly: a skip should not end on a dozen splashes
    this.hooks = { caption: this.hooks.caption, motor: this.hooks.motor };
    this.actors.landAll();
    for (const th of this.plan) {
      if (th.thrown) continue;
      th.thrown = true;
      this.release(th, false);
    }
    this.end();
  }

  /** Puts everything away. */
  end(): void {
    if (!this.sim) return;
    this.sim = null;
    this.stats = null;
    this.clock = -1;
    this.group.visible = false;
    this.hooks.motor?.(0);
    this.hooks.caption?.('', '');
    this.hooks = {};
  }
}
