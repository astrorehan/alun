import * as THREE from 'three';
import { isTrashKind, type GameSimulation } from '../simulation';
import type { Entity, EntityKind } from '../types';
import { DOLPHIN_SPOT } from '../world';
import type { Actors } from './actors';
import { Build, hex, type Vec } from './build';
import type { Director, Pose } from './director';
import { striped } from './fleet';
import type { Fx } from './fx';
import { outlineMaterial, toon, type ToonOpts, type ToonPair } from './gfx';
import { inked, mesh } from './kit';
import { clamp, lerp, rng, simX, simY, smooth, toX, toZ } from './space';
import type { Water } from './water';

/**
 * The mother dolphin, caught in a trawl net at the end of the rope: the camera is pulled away to her,
 * the player tears the net off with waves, and she leaps away. What comes off lands in the water as
 * salvage, out of the same supply as everything else. Without films she is freed from the overhead view.
 */

export interface RescueHooks {
  /** A subtitle to show, or two empty strings to clear it. */
  caption?: (kicker: string, line: string) => void;
  sound?: (kind: 'distress' | 'snap' | 'happy' | 'leap', strength: number) => void;
  /** The camera has arrived: the player can help now. */
  help?: () => void;
  /** Net came off; `left` pieces of `total` still hold it. */
  hit?: (left: number, total: number) => void;
  /** It is free, and the thank-you film is rolling. */
  freed?: () => void;
  /** Back in the overhead game. */
  done?: () => void;
}

const ARRIVE = 7;
const LEAVE = 7.4;

const ARRIVE_CAPTIONS: [number, number, string, string][] = [
  [0.5, 3.6, 'DI UJUNG TALI', 'Induk lumba-lumba terjerat sisa jaring pukat!'],
  [3.8, 6.9, 'A.L.U.N.', 'Ayo bantu! Robek tiga lilitannya dengan ombak.'],
];
const LEAVE_CAPTIONS: [number, number, string, string][] = [
  [0.4, 4.2, 'INDUK LUMBA-LUMBA BEBAS', 'Ia lolos lewat celah karang, diikuti ikan-ikan kecil.'],
  [4.4, 7.3, 'BU SARI', 'Pelampung bergaris itu... milik kapal pukat dari luar.'],
];

/** Caught facing north-north-east, so both the close-ups and the play view see its flank. */
const HEADING = 1.21;

/* ================================================================== the animal */

/** Body radius along the length, nose at +X. Shared by the body and the net so the net sits on it. */
const PROFILE: [number, number][] = [
  [-2.05, 0.02],
  [-1.9, 0.12],
  [-1.55, 0.2],
  [-1.05, 0.34],
  [-0.45, 0.5],
  [0.15, 0.58],
  [0.7, 0.55],
  [1.12, 0.45],
  [1.36, 0.33],
  [1.5, 0.22],
  [1.85, 0.15],
  [2.02, 0.1],
  [2.08, 0.02],
];
const WIDE = 0.88;

function radiusAt(x: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const [x1, r1] = PROFILE[i];
    if (x <= x1) {
      const [x0, r0] = PROFILE[i - 1];
      return lerp(r0, r1, (x - x0) / (x1 - x0));
    }
  }
  return 0.02;
}

/** How far a point is down the tail: drives the fluke beat in the shader. */
export const tailOf = (p: THREE.Vector3): number => smooth(-0.3, -2.1, p.x);

const _c = new THREE.Color();

export function dolphin(): THREE.BufferGeometry {
  const b = new Build(510);
  const lathe = new THREE.LatheGeometry(
    PROFILE.map(([x, r]) => new THREE.Vector2(r, x)),
    24
  );
  // the lathe turns round +Y; lay it along +X, nose first
  lathe.rotateZ(-Math.PI / 2);
  lathe.scale(1, 1, WIDE);
  const top = hex('#4f7593');
  const cape = hex('#3d5d77');
  const belly = hex('#eef3f5');
  b.add(lathe, {
    color: (p) => _c.copy(top).lerp(cape, smooth(0.3, 0.55, p.y)).lerp(belly, smooth(0.02, -0.32, p.y)),
    gloss: 0.55,
    sway: tailOf,
  });
  // dorsal fin, swept back
  const fin = new THREE.Shape();
  fin.moveTo(0.45, 0);
  fin.quadraticCurveTo(0.08, 0.28, -0.38, 0.8);
  fin.quadraticCurveTo(-0.3, 0.36, -0.58, 0);
  fin.lineTo(0.45, 0);
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1, curveSegments: 6 });
  fg.translate(0, 0, -0.05);
  b.add(fg, { color: '#3f6280', pos: [-0.2, 0.44, 0], gloss: 0.4, sway: tailOf });
  // flippers
  for (const s of [-1, 1]) b.ball(1, { color: '#4a6f8d', scale: [0.42, 0.06, 0.17], pos: [0.55, -0.3, s * 0.48], rot: [s * 0.45, s * 0.55, -0.35], seg: 10, gloss: 0.4 });
  // flukes
  for (const s of [-1, 1]) b.ball(1, { color: '#3f6280', scale: [0.34, 0.055, 0.42], pos: [-2.1, 0, s * 0.3], rot: [0, s * -0.55, 0], seg: 10, gloss: 0.4, sway: 1 });
  // eyes with a catch light, and the smile all dolphins are drawn with
  for (const s of [-1, 1]) {
    b.ball(0.08, { color: '#15202c', pos: [1.16, 0.15, s * 0.38], seg: 8, gloss: 0.9 });
    b.ball(0.03, { color: '#ffffff', pos: [1.21, 0.19, s * 0.42], seg: 5 });
    b.tube([[1.5, -0.05, s * 0.18], [1.75, -0.07, s * 0.13], [1.98, -0.03, s * 0.07]], () => 0.018, { color: '#26384a', seg: 4, rings: 6 });
  }
  return b.geo(true);
}

export interface SwimUniforms {
  uFlap: { value: number };
  uAmp: { value: number };
  uHit: { value: number };
}

/** The skin a dolphin swims in: she beats her tail up and down, and the body follows a little behind the flukes. */
export function swimSkin(u: SwimUniforms): { pair: ToonPair; ink: THREE.ShaderMaterial } {
  const opts: ToonOpts = {
    side: THREE.DoubleSide,
    uniforms: { ...u },
    vHead: 'uniform float uFlap; uniform float uAmp;',
    vLocal: 'float sw = aFx.y; p.y += sin(uFlap - sw * 2.4) * sw * sw * uAmp; p.z += sin(uFlap * .5 + 1.3) * sw * uAmp * .22;',
    fHead: 'uniform float uHit;',
    fAlbedo: 'alb = mix(alb, vec3(1.), uHit * .55); emis += uHit * .35;',
  };
  return { pair: toon(opts), ink: outlineMaterial(1.3, '#15202c', { uniforms: opts.uniforms, vHead: opts.vHead, vLocal: opts.vLocal }) };
}

/** A ring of rope round the body at `x`, a little loose and a little crooked. */
function loop(b: Build, x: number, tilt: number, col: string, seed: number, slack = 1.1): void {
  const r = radiusAt(x) * slack + 0.04;
  const pts: Vec[] = [];
  const n = 11;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + Math.sin(a * 3 + seed) * 0.06;
    pts.push([x + Math.sin(a) * tilt, Math.cos(a) * r * w, Math.sin(a) * r * WIDE * w]);
  }
  b.tube(pts, () => 0.045, { color: col, seg: 5, rings: 28, sway: tailOf });
}

/** A strand of net from one point on the body to another, hugging it on the way. */
function strand(b: Build, x0: number, a0: number, x1: number, a1: number, col: string): void {
  const pts: Vec[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const x = lerp(x0, x1, t);
    const a = lerp(a0, a1, t);
    const r = radiusAt(x) * 1.08 + 0.05;
    pts.push([x, Math.cos(a) * r, Math.sin(a) * r * WIDE]);
  }
  b.tube(pts, () => 0.035, { color: col, seg: 4, rings: 14, sway: tailOf });
}

const ROPE = ['#2f8f66', '#5fd49a', '#1f6f52'];

/** First to go: a plastic bag snagged on the fin and a turn of rope round the tail. */
function netTail(): THREE.BufferGeometry {
  const b = new Build(520);
  loop(b, -1.35, 0.12, ROPE[0], 1);
  loop(b, -1.62, -0.1, ROPE[1], 2, 1.25);
  strand(b, -1.35, 0.4, -0.6, 1.4, ROPE[2]);
  // the bag, caught on the dorsal fin
  const g = new THREE.SphereGeometry(1, 12, 8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const fold = 1 + Math.sin(Math.atan2(v.z, v.x) * 5) * 0.08 * (1 - Math.abs(v.y));
    pos.setXYZ(i, v.x * fold * 0.32, v.y * 0.24 + (v.y > 0.6 ? 0.05 : 0), v.z * fold * 0.26);
  }
  g.computeVertexNormals();
  // a red kresek, the bag every market stall hands out
  b.add(g, { color: (p) => _c.set('#e8463a').lerp(hex('#ff8a7a'), smooth(0.9, 1.25, p.y)), pos: [-0.52, 1.02, 0.1], rot: [0.3, 0.4, -0.5], gloss: 0.45, sway: tailOf });
  for (const s of [-1, 1]) b.tube([[-0.45 + s * 0.08, 1.2, 0.1], [-0.35 + s * 0.12, 1.36, 0.08], [-0.48, 1.26, 0.06]], () => 0.025, { color: '#e8463a', seg: 4, rings: 6 });
  return b.geo(true);
}

/** Then: a band round the middle, with a bottle and a float dangling off it. */
function netMiddle(): THREE.BufferGeometry {
  const b = new Build(530);
  loop(b, -0.2, 0.18, ROPE[1], 3);
  loop(b, 0.35, -0.12, ROPE[0], 4);
  strand(b, -0.2, -1.0, 0.35, 0.6, ROPE[2]);
  strand(b, 0.35, 2.2, -0.2, 3.6, ROPE[2]);
  // the bottle, hanging off the flank on a short line
  b.tube([[0.1, -0.1, 0.56], [0.15, -0.42, 0.66], [0.2, -0.62, 0.7]], () => 0.025, { color: ROPE[2], seg: 4, rings: 8 });
  const lay: Vec = [0.3, 0, Math.PI / 2 - 0.5];
  b.cyl(0.11, 0.11, 0.44, { color: '#a9e4ff', pos: [0.32, -0.74, 0.72], rot: lay, seg: 10, gloss: 0.9 });
  b.cyl(0.115, 0.115, 0.14, { color: '#2479d8', pos: [0.3, -0.73, 0.72], rot: lay, seg: 10 });
  b.cyl(0.06, 0.06, 0.1, { color: '#f0453a', pos: [0.49, -0.86, 0.74], rot: lay, seg: 8 });
  striped(b, [-0.25, 0.12, -0.68], 0.2);
  return b.geo(true);
}

/** Last: the tangle round the head and flippers that is actually holding it. */
function netHead(): THREE.BufferGeometry {
  const b = new Build(540);
  loop(b, 0.85, 0.2, ROPE[0], 5);
  loop(b, 1.3, -0.15, ROPE[2], 6, 1.15);
  strand(b, 0.85, 0.3, 1.3, -1.2, ROPE[1]);
  strand(b, 0.85, 2.6, 1.3, 4.1, ROPE[1]);
  strand(b, 0.35, -2.4, 1.3, -0.4, ROPE[0]);
  // a loose flap of mesh trailing off it
  for (let k = 0; k < 4; k++) {
    b.tube(
      [
        [0.9, -0.35, -0.3 + k * 0.2],
        [0.4 - k * 0.1, -0.7, -0.55 + k * 0.32],
        [-0.3 - k * 0.15, -0.85, -0.75 + k * 0.42],
      ],
      () => 0.03,
      { color: ROPE[k % 3], seg: 4, rings: 8 }
    );
  }
  // the float that gives its owner away
  striped(b, [1.02, 0.7, -0.12], 0.24);
  return b.geo(true);
}

/** Where on the animal each layer is anchored, for the splash when it tears away. */
const LAYER_AT: Vec[] = [
  [-1.2, 0.6, 0],
  [0.1, -0.2, 0.5],
  [1.0, 0.3, 0],
];
/** What each layer becomes once it is in the water. */
const LAYER_DEBRIS: { kind: EntityKind; variant: number }[] = [
  { kind: 'trash_bag', variant: 0 },
  { kind: 'trash_bottle', variant: 0 },
  { kind: 'trash_net', variant: 0 },
];

/* ================================================================== the event */

/** 'still' and 'away' are the same event without its films. */
type State = 'idle' | 'arrive' | 'help' | 'leave' | 'still' | 'away';

export class Rescue {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private layers: THREE.Mesh[] = [];
  private flap = { value: 0 };
  private amp = { value: 0.4 };
  private hitU = { value: 0 };
  private state: State = 'idle';
  private sim: GameSimulation | null = null;
  private id = -1;
  private hooks: RescueHooks = {};
  private total = 3;
  private torn = 0;
  private shown = -1;
  private nextCall = 0;
  private start: Pose | null = null;
  private wasAbove = false;
  private away = 0;
  /** Where she is on her way out, for the small fish that follow. */
  readonly trail = { on: false, t: 0, x: 0, z: 0, dx: 1, dz: 0 };
  private r = rng(77);
  private T = new THREE.Vector3(toX(DOLPHIN_SPOT.x), 0, toZ(DOLPHIN_SPOT.y));
  /** The way out to sea once it is free: south of the rocks and out over the reef. */
  private D = new THREE.Vector3(1, 0, 0.45).normalize();
  private v = new THREE.Vector3();
  private o = [0, 0, 0, 0, 0, 0, 0];

  constructor(
    private water: Water,
    private fx: Fx,
    private actors: Actors,
    private director: Director
  ) {
    const { pair, ink } = swimSkin({ uFlap: this.flap, uAmp: this.amp, uHit: this.hitU });
    const add = (g: THREE.BufferGeometry): THREE.Mesh => {
      const m = inked(mesh(g, pair), ink);
      m.frustumCulled = false;
      this.body.add(m);
      return m;
    };
    add(dolphin());
    this.layers = [add(netTail()), add(netMiddle()), add(netHead())];
    this.group.add(this.body);
    this.group.visible = false;
  }

  get active(): boolean {
    return this.state !== 'idle';
  }

  /** True while one of its films is running (no playing then). */
  get filming(): boolean {
    return this.state === 'arrive' || this.state === 'leave';
  }

  /** Where the play camera sits while helping: over the lagoon side, looking out past it to the rocks. */
  /** The dolphin sits in the middle of the frame, clear of the mission banner above and the radio below. */
  view(): Pose {
    const T = this.T;
    return {
      pos: new THREE.Vector3(T.x - 14, 17.5, T.z - 5),
      look: new THREE.Vector3(T.x + 0.2, 0, T.z + 0.1),
      fov: 38,
    };
  }

  /** Pulls the camera away to the dolphin. `id` is its entity in the sim. */
  begin(sim: GameSimulation, id: number, hooks: RescueHooks): void {
    this.sim = sim;
    this.id = id;
    this.hooks = hooks;
    this.state = 'arrive';
    this.shown = -1;
    this.start = null;
    this.nextCall = 0.4;
    this.r = rng(77);
    const e = sim.entities.find((x) => x.id === id);
    this.restoreKnots(e);
    if (e) {
      this.T.set(toX(e.x), 0, toZ(e.y));
      // the close-ups are a few metres from it: whatever is floating right there drifts out of the shot
      for (const o of sim.entities) {
        if (!isTrashKind(o.kind) && o.kind !== 'mangrove_seed') continue;
        if (o.snagged || o.stranded) continue;
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d >= 160) continue;
        const k = (160 + this.r() * 25) / Math.max(1, d);
        o.x = e.x + (d > 1 ? dx : 1) * k;
        o.y = e.y + (d > 1 ? dy : 0) * k;
      }
    }
    this.body.scale.setScalar(1);
    this.group.visible = true;
    this.director.film(
      (t, out) => this.arrive(t, out),
      () => this.arrived()
    );
    this.director.focus(this.view());
  }

  /** Takes up the event where no film did. */
  private attach(sim: GameSimulation, e: Entity): void {
    this.sim = sim;
    this.id = e.id;
    this.hooks = {};
    this.state = 'still';
    this.restoreKnots(e);
    this.shown = -1;
    this.T.set(toX(e.x), 0, toZ(e.y));
    this.group.visible = true;
  }

  /** Restored knots have already shed their salvage. Only a new hit should tear a layer. */
  private restoreKnots(e?: Entity): void {
    this.total = e?.maxHp ?? 3;
    this.torn = this.total - (e?.hp ?? this.total);
    this.layers.forEach((layer, i) => { layer.visible = i >= this.torn; });
  }

  private arrived(): void {
    if (this.state !== 'arrive') return;
    this.state = 'help';
    this.caption(-1, ARRIVE_CAPTIONS);
    const e = this.entity();
    // from here on waves tear at the net
    if (e) e.actionTimer = 1;
    this.nextCall = 2.5;
    this.hooks.help?.();
  }

  private entity(): Entity | null {
    return this.sim?.entities.find((x) => x.id === this.id) ?? null;
  }

  /* ---------------------------------------------------------------- films */

  private arrive(t: number, out: Pose): boolean {
    if (!this.start) this.start = { pos: out.pos.clone(), look: out.look.clone(), fov: out.fov };
    const T = this.T;
    const o = this.o;
    // a slow circle round it from the south-west to the north-west, high enough to keep the horizon out
    // (south is +Z, so the angle runs clockwise as seen from above)
    const circle = (u: number): number[] => {
      const a = lerp(3.56, 2.76, u);
      const R = lerp(8.6, 7.6, u);
      o[0] = T.x + Math.cos(a) * R;
      o[1] = lerp(4.3, 3.9, u);
      o[2] = T.z - Math.sin(a) * R;
      o[3] = T.x;
      o[4] = 0.3;
      o[5] = T.z;
      o[6] = 36;
      return o;
    };
    if (t < 1.8) {
      // dive in from wherever the player was looking
      const k = smooth(0, 1, t / 1.8);
      const c = circle(0);
      const s = this.start;
      out.pos.set(lerp(s.pos.x, c[0], k), lerp(s.pos.y, c[1], k) + Math.sin(k * Math.PI) * 4, lerp(s.pos.z, c[2], k));
      out.look.set(lerp(s.look.x, c[3], k), lerp(s.look.y, c[4], k), lerp(s.look.z, c[5], k));
      out.fov = lerp(s.fov, c[6], k);
    } else if (t < 5.6) {
      const c = circle((t - 1.8) / 3.8);
      out.pos.set(c[0], c[1] + Math.sin(t * 1.1) * 0.05, c[2]);
      out.look.set(c[3], c[4], c[5]);
      out.fov = c[6];
    } else if (t < ARRIVE) {
      // back up to where the player can reach it
      const k = smooth(0, 1, (t - 5.6) / (ARRIVE - 5.6));
      const c = circle(1);
      const V = this.view();
      out.pos.set(lerp(c[0], V.pos.x, k), lerp(c[1], V.pos.y, k), lerp(c[2], V.pos.z, k));
      out.look.set(lerp(c[3], V.look.x, k), lerp(c[4], V.look.y, k), lerp(c[5], V.look.z, k));
      out.fov = lerp(c[6], V.fov, k);
    } else {
      const V = this.view();
      out.pos.copy(V.pos);
      out.look.copy(V.look);
      out.fov = V.fov;
      return false;
    }
    return true;
  }

  /** Where it is on its way out at film time `t`: a burst free, three leaps, then gone under. */
  private leapAt(t: number, out: THREE.Vector3): { pitch: number; roll: number; under: boolean } {
    const T = this.T;
    const D = this.D;
    if (t < 0.7) {
      const k = t / 0.7;
      out.copy(T).addScaledVector(D, k * 1.5);
      out.y = -0.1 - k * 0.6;
      return { pitch: -0.3 * k, roll: k * Math.PI * 2, under: k > 0.6 };
    }
    const i = Math.min(2, Math.floor((t - 0.7) / 1.25));
    const s = clamp((t - 0.7 - i * 1.25) / 1.0, 0, 1.25);
    const air = Math.min(1, s);
    const len = 6.6;
    const top = i === 2 ? 4.6 : 3.9;
    out.copy(T).addScaledVector(D, 1.5 + i * 7.2 + len * Math.min(s, 1.15));
    if (s <= 1) {
      out.y = -0.8 + top * Math.sin(Math.PI * air);
      const dy = top * Math.PI * Math.cos(Math.PI * air);
      // the last leap has a twist in it
      return { pitch: Math.atan2(dy, len), roll: i === 2 ? smooth(0.25, 0.8, air) * Math.PI * 2 : 0, under: out.y < -0.2 };
    }
    out.y = -1.2;
    return { pitch: -0.2, roll: 0, under: true };
  }

  private leave(t: number, out: Pose): boolean {
    if (!this.start) this.start = { pos: out.pos.clone(), look: out.look.clone(), fov: out.fov };
    const T = this.T;
    const D = this.D;
    // the south side of its path (the rocks are on the north side), high enough that the sea fills the frame
    const nx = -D.z;
    const nz = D.x;
    const side = (u: number): void => {
      const along = lerp(5, 15, u);
      this.o[0] = T.x + D.x * along + nx * 13.5;
      this.o[1] = 8.8;
      this.o[2] = T.z + D.z * along + nz * 13.5;
      const track = lerp(2, 21, smooth(0.15, 1, u));
      this.o[3] = T.x + D.x * track;
      this.o[4] = 1.3;
      this.o[5] = T.z + D.z * track;
      this.o[6] = 40;
    };
    const o = this.o;
    if (t < 0.8) {
      side(0);
      const k = smooth(0, 1, t / 0.8);
      const s = this.start;
      out.pos.set(lerp(s.pos.x, o[0], k), lerp(s.pos.y, o[1], k), lerp(s.pos.z, o[2], k));
      out.look.set(lerp(s.look.x, o[3], k), lerp(s.look.y, o[4], k), lerp(s.look.z, o[5], k));
      out.fov = lerp(s.fov, o[6], k);
    } else if (t < 4.6) {
      side((t - 0.8) / 3.8);
      out.pos.set(o[0], o[1], o[2]);
      out.look.set(o[3], o[4], o[5]);
      out.fov = o[6];
    } else if (t < LEAVE) {
      side(1);
      const P = this.director.playPose;
      const k = smooth(0, 1, (t - 4.6) / (LEAVE - 4.6));
      out.pos.set(lerp(o[0], P.pos.x, k), lerp(o[1], P.pos.y, k), lerp(o[2], P.pos.z, k));
      out.look.set(lerp(o[3], P.look.x, k), lerp(o[4], P.look.y, k), lerp(o[5], P.look.z, k));
      out.fov = lerp(o[6], P.fov, k);
    } else {
      const P = this.director.playPose;
      out.pos.copy(P.pos);
      out.look.copy(P.look);
      out.fov = P.fov;
      return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------- every frame */

  update(dt: number, time: number, swell: number, sim: GameSimulation): void {
    this.trail.on = false;
    if (this.state === 'idle') {
      // no film took her (the player asked for less motion): she is caught all the same
      const e = sim.entities.find((x) => x.kind === 'dolphin');
      if (!e || e.actionTimer <= 0) return;
      this.attach(sim, e);
    }
    if (!this.sim) return;
    const clock = this.director.clock;

    if (this.state === 'leave') {
      this.caption(clock, LEAVE_CAPTIONS);
      this.swimAway(dt, clock < 0 ? 99 : clock, time, swell);
      return;
    }
    if (this.state === 'away') {
      this.away += dt;
      this.swimAway(dt, this.away, time, swell);
      if (this.away > 5.4) this.reset();
      return;
    }

    const e = this.entity();
    if (!e) {
      if (this.state === 'still' && sim.progress?.story.flags.dolphin) {
        // the last knot went, and the job took her out of the water's hands
        while (this.torn < this.layers.length) this.tear(this.torn++);
        this.state = 'away';
        this.away = 0;
        this.wasAbove = false;
        return;
      }
      // the lagoon was reset under us: nothing to film any more
      this.cancel();
      return;
    }
    if (this.state === 'arrive') this.caption(clock, ARRIVE_CAPTIONS);

    const torn = this.total - e.hp;
    if (torn > this.torn) {
      while (this.torn < Math.min(torn, this.layers.length)) this.tear(this.torn++);
      this.hooks.hit?.(e.hp, this.total);
    }
    if (e.hp <= 0) {
      this.free(e);
      return;
    }
    this.struggle(dt, time, swell, e);
  }

  /** Thrashing against the net, now and then hard enough to throw spray. */
  private struggle(dt: number, time: number, swell: number, e: Entity): void {
    const T = this.T;
    const h = this.water.heightAt(T.x, T.z, time, swell);
    const jerk = Math.pow(Math.max(0, Math.sin(time * 2.3) * Math.sin(time * 0.9 + 1)), 3);
    const loose = this.torn / this.total;
    // low in the water, back and fin showing, head lifted to breathe
    this.body.position.set(T.x, h * 0.8 - 0.24 + Math.sin(time * 2.6) * 0.07 + jerk * 0.14, T.z);
    this.body.rotation.set(
      Math.sin(time * 3.1) * (0.24 + loose * 0.1) + jerk * 0.32 * Math.sin(time * 13),
      HEADING + Math.sin(time * 1.7) * 0.18 + jerk * 0.22,
      0.13 + Math.sin(time * 2.2 + 0.5) * 0.07 + jerk * 0.1,
      'YXZ'
    );
    this.body.updateMatrixWorld(true);
    this.flap.value += dt * (8 + jerk * 11 + loose * 4);
    this.amp.value = 0.38 + jerk * 0.28;
    this.hitU.value = clamp(e.hitFlash / 0.32, 0, 1);

    if (this.r() < dt * (2.5 + jerk * 14)) {
      const tail = this.body.localToWorld(this.v.set(-2, 0, 0));
      this.water.splash({ x: tail.x, z: tail.z, radius: 1.1, foam: 0.75, impulse: 0.8 });
      this.fx.burst(tail.x, h + 0.25, tail.z, 4, 2.6 + jerk * 2, 0, 0.11);
    }

    this.nextCall -= dt;
    if (this.nextCall <= 0) {
      this.nextCall = this.state === 'arrive' ? 2.6 : 4.5 + this.r() * 2;
      this.hooks.sound?.('distress', 1);
    }
  }

  /** One layer of net comes off, and what the tide still has room for lands as salvage. */
  private tear(i: number): void {
    const layer = this.layers[i];
    if (!layer || !this.sim) return;
    layer.visible = false;
    const at = this.body.localToWorld(this.v.set(...LAYER_AT[i]));
    this.water.splash({ x: at.x, z: at.z, radius: 2, foam: 1, impulse: 1.6 });
    this.fx.burst(at.x, Math.max(0.3, at.y), at.z, 12, 4.5, 0, 0.14);
    const sim = this.sim;
    if (sim.story.arrive()) {
      const d = LAYER_DEBRIS[i];
      // thrown clear toward the lagoon side, where the play camera can see it drift
      const a = Math.PI + (this.r() - 0.5) * 1.8;
      const dist = lerp(4.5, 7, this.r());
      const e = sim.createTrash(d.kind, simX(this.T.x + Math.cos(a) * dist), simY(this.T.z + Math.sin(a) * dist), d.variant);
      this.actors.toss(e, at, new THREE.Vector3(toX(e.x), 0.25, toZ(e.y)), 0.85, 3.2, () => {
        e.age = 0.45;
        e.vx = Math.cos(a) * 18;
        e.vy = Math.sin(a) * 18;
        sim.entities.push(e);
      });
    }
    this.hooks.sound?.('snap', i === this.layers.length - 1 ? 1 : 0.7);
  }

  /** The last of the net is gone: off it goes, and the camera goes with it. */
  private free(e: Entity): void {
    const sim = this.sim!;
    const i = sim.entities.indexOf(e);
    if (i >= 0) sim.entities.splice(i, 1);
    for (const l of this.layers) l.visible = false;
    this.state = 'leave';
    this.start = null;
    this.shown = -1;
    this.wasAbove = false;
    this.director.film(
      (t, out) => this.leave(t, out),
      () => this.finish()
    );
    this.director.focus(null);
    this.hooks.sound?.('happy', 1);
    this.hooks.freed?.();
  }

  private swimAway(dt: number, t: number, time: number, swell: number): void {
    const p = this.leapAt(t, this.v);
    const yaw = Math.atan2(-this.D.z, this.D.x);
    const turn = smooth(0, 0.7, t);
    this.body.position.copy(this.v);
    this.body.rotation.set(p.roll, lerp(HEADING, yaw, turn), p.pitch, 'YXZ');
    this.flap.value += dt * 13;
    this.amp.value = p.under ? 0.5 : 0.2;
    this.hitU.value = 0;
    // break the surface going up, and again coming down
    const above = this.v.y > -0.15;
    if (above !== this.wasAbove && t > 0.6) {
      this.wasAbove = above;
      const h = this.water.heightAt(this.v.x, this.v.z, time, swell);
      this.water.splash({ x: this.v.x, z: this.v.z, radius: 2.2, foam: 1, impulse: 1.8 });
      this.fx.burst(this.v.x, h + 0.3, this.v.z, 14, 5.5, 0, 0.15);
      this.hooks.sound?.('leap', above ? 0.8 : 1);
    }
    this.group.visible = t < 5.2;
    const tr = this.trail;
    tr.on = t > 0.7 && t < 5.6;
    tr.t = t;
    tr.x = this.v.x;
    tr.z = this.v.z;
    tr.dx = this.D.x;
    tr.dz = this.D.z;
  }

  private finish(): void {
    if (this.state !== 'leave') return;
    const hooks = this.hooks;
    this.reset();
    hooks.caption?.('', '');
    hooks.done?.();
  }

  /** Drops the whole thing without a word, for when the lagoon is reset or a new game starts. */
  cancel(): void {
    if (this.state === 'idle') return;
    const e = this.entity();
    if (e && this.sim) this.sim.entities.splice(this.sim.entities.indexOf(e), 1);
    if (this.director.focused) this.director.focus(null);
    const hooks = this.hooks;
    this.reset();
    hooks.caption?.('', '');
  }

  /** Lets a film be skipped: the arrival goes straight to helping, the farewell straight back to play. */
  skip(): void {
    if (this.filming) this.director.skip();
  }

  private reset(): void {
    this.state = 'idle';
    this.sim = null;
    this.id = -1;
    this.hooks = {};
    this.group.visible = false;
    this.shown = -1;
  }

  private caption(t: number, list: [number, number, string, string][]): void {
    let cap = -1;
    for (let i = 0; i < list.length; i++) if (t >= list[i][0] && t < list[i][1]) cap = i;
    if (cap === this.shown) return;
    this.shown = cap;
    if (cap >= 0) this.hooks.caption?.(list[cap][2], list[cap][3]);
    else this.hooks.caption?.('', '');
  }
}
