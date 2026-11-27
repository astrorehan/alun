import * as THREE from 'three';
import type { GameSimulation } from '../simulation';
import type { Entity } from '../types';
import { PIER_END } from '../world';
import { Build, type Vec } from './build';
import type { Pose } from './director';
import { deckAt } from './fleet';
import type { Fx } from './fx';
import { outlineMaterial, toon } from './gfx';
import { inked, mesh } from './kit';
import { clamp, lerp, smooth, toX, toZ } from './space';
import type { StoryLayer } from './story';
import type { Water } from './water';

/**
 * The raiders' crew: five pirates in red headbands under a black flag, riding every raider ship and
 * reacting to the game (cheering as they attack, staggering when a wave hits the hull, shaking
 * their fists as they leave). The first raider of a story also gets a short film: the camera swings out to
 * the ship, shows the crew, and looks through the captain's spyglass at what they have come for.
 */

export interface PirateHooks {
  /** A subtitle to show, or two empty strings to clear it. */
  caption?: (kicker: string, line: string) => void;
  sound?: (kind: 'drum' | 'horn' | 'glass' | 'tension' | 'alun', strength: number) => void;
  /** The spyglass view: 0 is not looking, otherwise how far the iris is open (0..1). */
  scope?: (open: number, on: boolean) => void;
}

export const PIRATES_LENGTH = 12.8;

const CAPTIONS: [number, number, string, string][] = [
  [0.35, 2.75, 'LAYAR ROBEK', 'Sebuah kapal asing berlayar menuju laguna...'],
  [3.0, 6.1, 'BAJAK LAUT!', 'Awak penjarah bersorak, siap merampas hasil desa.'],
  [6.35, 7.75, 'SANG KAPTEN', 'Ia mengintai lewat teropongnya...'],
  [8.25, 10.05, 'INCARAN MEREKA', 'Mereka mengincar dermaga desa!'],
  [10.45, 12.75, 'A.L.U.N.', 'Halau mereka! Hantam lambung kapalnya dengan ombak.'],
];

/** The drummer's beat, and how hard each one lands. The fifth comes with the horn. */
const BEAT: [number, number][] = [
  [0.25, 1],
  [0.95, 1],
  [1.65, 1],
  [1.92, 0.8],
  [2.9, 1.35],
  [3.55, 0.6],
  [4.05, 0.6],
  [4.55, 0.6],
  [4.8, 0.45],
  [5.05, 0.6],
  [5.55, 0.6],
  [5.8, 0.45],
  [6.05, 0.75],
];
const HORN_AT = 2.9;
const GLASS_AT = 6.7;
/** The cut to the captain, the spyglass iris, and the cut back. */
const CUT_CAPTAIN = 6.2;
const SCOPE_IN = 7.85;
const SCOPE_OUT = 10.25;

/* ================================================================== the crew's looks */

type Role = 'captain' | 'blade' | 'hook' | 'drum' | 'helm';

interface Look {
  skin: string;
  shirt: string;
  stripes?: string;
  vest?: string;
  pants: string;
  band?: string;
  beard?: string;
  patch?: boolean;
  earring?: boolean;
  grin?: boolean;
  captain?: boolean;
  drum?: boolean;
}

const DARK = '#1c140f';
const GOLD = '#f2c14e';
const RED = '#e0322c';
const WOOD = '#7a5a3a';
const STEEL = '#c9d2da';
const BOOT = '#2a1d18';
const DOWN = new THREE.Vector3(0, -1, 0);
const SCALE = 0.84;
/** The shoulders, in a pirate's own space (unscaled); +X is his left, he faces +Z. */
const SHOULDER_Y = 1.5;
const SHOULDER_X = 0.32;
const ARM = 0.68;

/** A box from a to b, `w` wide and `t` thick: a blade, a slat. */
function slab(b: Build, a: Vec, c: Vec, w: number, t: number, o: { color: string; gloss?: number; sway?: (p: THREE.Vector3) => number }): void {
  const A = new THREE.Vector3(...a);
  const C = new THREE.Vector3(...c);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), C.clone().sub(A).normalize());
  const m = new THREE.Matrix4().compose(A.clone().add(C).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  b.add(new THREE.BoxGeometry(t, A.distanceTo(C), w), { color: o.color, gloss: o.gloss, sway: o.sway, matrix: m });
}

/** Everything of a pirate that does not move on its own: boots to hat. Feet at 0, facing +Z. */
function pirateBody(o: Look): THREE.BufferGeometry {
  const b = new Build(31);
  for (const s of [-1, 1]) {
    const x = s * 0.151;
    const step = s * 0.042;
    b.profile([[0, 0.135, 0.187, 0.055], [0.09, 0.146, 0.2, 0.06], [0.18, 0.112, 0.12],
      [0.32, 0.145, 0.14]], 7, { color: BOOT, pos: [x, 0, step], flat: true });
    b.bar([x, 0.28, step], [s * 0.14, 0.85, 0], 0.108, 0.15, { color: o.pants, seg: 7 });
  }
  b.cyl(0.29, 0.3, 0.26, { color: o.pants, pos: [0, 0.84, 0], seg: 8, scale: [1, 1, 0.68] });

  const chest = o.drum ? 0.395 : o.captain ? 0.425 : 0.313;
  b.profile([[0.91, 0.28, 0.199], [1.1, 0.283, 0.206], [1.48, chest, 0.245], [1.59, 0.2, 0.166]],
    8, { color: o.vest ?? o.shirt });
  if (o.vest) {
    b.quad([-0.073, 0.98, 0.194], [0.061, 0.98, 0.194], [0.115, 1.48, 0.231], [-0.115, 1.48, 0.231], { color: o.shirt });
  }
  if (o.stripes) {
    for (const y of [1.13, 1.31]) {
      const t = (y - 1.1) / 0.38;
      const w = lerp(0.283, chest, t);
      const d = lerp(0.206, 0.245, t);
      b.profile([[y, w + 0.006, d + 0.004], [y + 0.068, w + 0.013, d + 0.012]], 8, { color: o.stripes });
    }
  }
  if (o.captain) {
    // a long coat with gold trim, a white jabot and brass buttons
    b.cyl(0.33, 0.45, 0.72, { color: o.shirt, pos: [0, 0.83, 0], seg: 14 });
    b.cyl(0.455, 0.455, 0.06, { color: GOLD, pos: [0, 0.49, 0], seg: 14 });
    for (const side of [-1, 1]) {
      b.ico(1, 0, { color: GOLD, pos: [side * 0.357, 1.515, 0.005], scale: [0.187, 0.09, 0.195] });
      const lapel: Vec[] = [[side * 0.068, 1.045, 0.34], [side * 0.27, 1.455, 0.205], [side * 0.178, 1.587, 0.148], [side * 0.112, 1.44, 0.236]];
      if (side < 0) lapel.reverse();
      b.quad(lapel[0], lapel[1], lapel[2], lapel[3], { color: '#da7645' });
    }
    b.box(0.17, 0.4, 0.06, { color: '#f4efe4', pos: [0, 1.34, 0.245], r: 0 });
    for (const y of [1.08, 1.22, 1.36]) for (const s of [-1, 1]) b.ball(0.03, { color: GOLD, pos: [s * 0.15, y, 0.25], seg: 6, gloss: 0.7 });
  }
  b.cyl(0.318, 0.318, 0.1, { color: '#3a2418', pos: [0, 0.97, 0], seg: 12 });
  b.box(0.13, 0.11, 0.05, { color: GOLD, pos: [0, 0.97, 0.32], r: 0, gloss: 0.6 });

  if (!o.captain) {
    b.profile([[0.887, 0.314, 0.27], [0.991, 0.318, 0.27]], 8, { color: o.drum ? '#ecab4a' : '#bf4949' });
    b.quad([-0.25, 0.96, 0.175], [-0.39, 0.65, 0.154], [-0.26, 0.71, 0.212], [-0.14, 0.965, 0.248], { color: o.drum ? GOLD : RED });
  }
  if (o.drum) {
    b.profile([[1.34, 0.405, 0.286], [1.51, 0.404, 0.275], [1.585, 0.208, 0.161]], 8, { color: '#e6b85a' });
    for (const side of [-1, 1]) b.ico(0.064, 0, { color: '#a6e6c8', pos: [side * 0.215, 1.412, 0.24] });
  }

  if (o.drum) {
    // a standing drum in front of him, red with gold hoops
    b.cyl(0.21, 0.19, 0.46, { color: '#8e2a22', pos: [0, 0.48, 0.5], seg: 14 });
    for (const y of [0.3, 0.68]) b.cyl(0.222, 0.222, 0.045, { color: GOLD, pos: [0, y, 0.5], seg: 14, gloss: 0.5 });
    b.cyl(0.2, 0.2, 0.02, { color: '#efe2c2', pos: [0, 0.715, 0.5], seg: 14 });
  }
  return b.geo(true);
}

function pirateHead(o: Look): THREE.BufferGeometry {
  const b = new Build(32);
  b.profile([[1.565, 0.123, 0.135], [1.665, o.beard ? 0.258 : 0.223, 0.227],
    [1.85, 0.3, 0.29], [2.005, 0.281, 0.272], [2.135, 0.144, 0.155]], 10, { color: o.skin, pos: [0, 0, 0.02] });
  b.ball(0.075, { color: o.skin, pos: [0, 1.82, 0.31], seg: 6 });
  for (const s of [-1, 1]) {
    const covered = o.patch && s === 1;
    if (!covered) {
      b.ball(0.06, { color: '#ffffff', pos: [s * 0.105, 1.9, 0.26], seg: 6 });
      b.ball(0.034, { color: DARK, pos: [s * 0.105, 1.9, 0.31], seg: 6 });
    }
    // brows down towards the nose: up to no good
    b.box(0.13, 0.035, 0.035, { color: o.beard ?? DARK, pos: [s * 0.11, 1.99, 0.27], rot: [0, 0, s * 0.32], r: 0 });
  }
  if (o.patch) {
    b.add(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 10), { color: DARK, pos: [0.105, 1.9, 0.3], rot: [Math.PI / 2 - 0.15, 0, 0] });
    const strap = new THREE.Matrix4().makeRotationZ(-0.42).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    strap.setPosition(0, 1.92, 0.02);
    b.add(new THREE.TorusGeometry(0.308, 0.013, 4, 16), { color: DARK, matrix: strap });
  }
  if (o.beard) {
    b.profile([[1.407, 0.052, 0.06, 0.20], [1.53, 0.18, 0.118, 0.169], [1.69, 0.235, 0.138, 0.14]], 7,
      { color: o.beard, top: '#493341', flat: true });
    b.ball(0.22, { color: o.beard, pos: [0, 1.69, 0.15], scale: [1.18, 0.9, 0.75], seg: 8 });
    for (const s of [-1, 1]) b.ball(0.06, { color: o.beard, pos: [s * 0.085, 1.765, 0.3], scale: [1.6, 0.7, 0.8], rot: [0, 0, s * -0.3], seg: 7 });
  }
  if (o.grin) {
    const z = o.beard ? 0.32 : 0.275;
    b.box(0.17, 0.06, 0.03, { color: '#4a1414', pos: [0, 1.715, z], r: 0 });
    b.box(0.13, 0.025, 0.02, { color: '#fbf6ea', pos: [0, 1.73, z + 0.012], r: 0 });
  }
  if (o.earring) {
    b.add(new THREE.TorusGeometry(0.05, 0.013, 5, 12), { color: GOLD, pos: [-0.3, 1.77, 0.04], rot: [0, Math.PI / 2, 0], gloss: 0.8 });
  }
  if (o.band) {
    // the headband: a cap over the crown, knotted at the back with two loose ends
    b.add(new THREE.SphereGeometry(0.318, 10, 4, 0, Math.PI * 2, 0, 1.15), { color: o.band, pos: [0, 1.86, 0.02] });
    const height = o.drum ? 0.28 : o.patch ? 0.18 : 0.08;
    b.profile([[1.993, 0.305, 0.299], [2.08, 0.30, 0.28], [2.11 + height, 0.124, 0.144, -0.075]], 9,
      { color: o.drum ? '#dd6740' : o.band, flat: true });
    if (o.drum || o.patch) b.profile([[2.036, 0.312, 0.302], [2.091, 0.298, 0.287]], 9, { color: o.drum ? '#ffd877' : '#672a43' });
    for (const side of [-1, 1]) b.ico(1, 0, { color: '#4b2930', pos: [side * 0.262, 1.94, 0.102], scale: [0.062, o.patch ? 0.18 : 0.085, 0.082] });
    b.ball(0.07, { color: o.band, pos: [0.08, 2.0, -0.29], seg: 7 });
    b.tube([[0.08, 2.0, -0.31], [0.13, 1.88, -0.4], [0.17, 1.74, -0.42]], (t) => lerp(0.045, 0.02, t), { color: o.band, seg: 5, rings: 3 });
    b.tube([[0.06, 1.99, -0.32], [0.02, 1.86, -0.43], [-0.04, 1.75, -0.44]], (t) => lerp(0.04, 0.018, t), { color: o.band, seg: 5, rings: 3 });
  }
  if (o.captain) {
    // a tricorn, one corner to the front, with a gold edge and a red plume
    // Three swept-up sides with a narrow binding along the turned edge.
    const brim = (i: number, radius: number, lift: number): Vec => {
      const a = (i / 18) * Math.PI * 2;
      const corner = (1 + Math.cos(3 * a)) * 0.5;
      const r = radius * (0.78 + 0.22 * corner);
      return [Math.sin(a) * r, 2.064 + lift * (1 - 0.73 * corner), Math.cos(a) * r - 0.025];
    };
    for (let i = 0; i < 18; i++) {
      const j = i + 1;
      b.quad(brim(i, 0.28, 0), brim(j, 0.28, 0), brim(j, 0.63, 0.19), brim(i, 0.63, 0.19), { color: '#27222d' });
      b.quad(brim(i, 0.63, 0.19), brim(j, 0.63, 0.19), brim(j, 0.616, 0.22), brim(i, 0.616, 0.22), { color: GOLD });
      b.quad(brim(i, 0.616, 0.22), brim(j, 0.616, 0.22), brim(j, 0.27, 0.037), brim(i, 0.27, 0.037), { color: '#423541' });
    }
    b.cyl(0.25, 0.3, 0.27, { color: '#1d1b22', pos: [0, 2.28, -0.03], seg: 8 });
    b.cyl(0.302, 0.302, 0.06, { color: RED, pos: [0, 2.18, -0.03], seg: 8 });
    b.ball(0.075, { color: '#fbf6ea', pos: [0, 2.27, 0.24], scale: [1, 1, 0.5], seg: 6 });
    b.profile([[0, 0.023, 0.018], [0.14, 0.082, 0.027, -0.025], [0.26, 0.067, 0.022, -0.065],
      [0.34, 0.012, 0.009, -0.135]], 5, { color: RED, top: '#ff9766', pos: [0.21, 2.265, -0.13], scale: [1.55, 1.32, 1.2], rot: [0, -0.25, -0.48], flat: true });
  }
  return b.geo(true).translate(0, -1.60, 0).scale(1.19, 1.04, 1.1);
}

/** One arm, hanging from the shoulder at the origin, with whatever it holds. */
function pirateArm(sleeve: string, skin: string, hold: 'none' | 'blade' | 'glass' | 'hook' | 'stick' | 'coil', cuff?: string): THREE.BufferGeometry {
  const b = new Build(33);
  const elbow: Vec = [0, -0.32, -0.025];
  b.bar([0, 0.04, 0], elbow, 0.127, 0.1, { color: sleeve, seg: 6 });
  b.bar(elbow, [0, -0.61, 0.06], 0.096, 0.074, { color: cuff ? sleeve : skin, seg: 6 });
  if (cuff) b.cyl(0.098, 0.098, 0.07, { color: cuff, pos: [0, -0.56, 0.055], seg: 8 });
  const hand: Vec = [0, -ARM, 0.07];
  if (hold === 'hook') {
    b.cyl(0.07, 0.085, 0.1, { color: '#3a2418', pos: [0, -0.66, 0.065], seg: 8 });
    b.add(new THREE.TorusGeometry(0.085, 0.024, 6, 12, Math.PI * 1.25), { color: GOLD, pos: [0, -0.8, 0.1], rot: [0, Math.PI / 2, 0.8], gloss: 0.8 });
  } else {
    b.ball(0.1, { color: skin, pos: hand, seg: 6 });
  }
  if (hold === 'blade') {
    // a cutlass held point-up out of the fist, the blade curving away from him
    b.cyl(0.03, 0.03, 0.2, { color: '#3a2418', pos: [0, -0.7, 0.13], rot: [0.35, 0, 0], seg: 6 });
    b.add(new THREE.TorusGeometry(0.085, 0.018, 4, 10, Math.PI), { color: GOLD, pos: [0, -0.74, 0.14], rot: [0, Math.PI / 2, 0], gloss: 0.7 });
    slab(b, [0, -0.78, 0.17], [0, -1.12, 0.32], 0.1, 0.025, { color: STEEL, gloss: 0.9 });
    slab(b, [0, -1.1, 0.31], [0, -1.42, 0.52], 0.085, 0.022, { color: STEEL, gloss: 0.9 });
  } else if (hold === 'glass') {
    b.bar([0, -0.68, -0.12], [0, -0.68, 0.36], 0.05, 0.04, { color: '#b8892e', gloss: 0.8 });
    b.cyl(0.054, 0.054, 0.05, { color: '#6a4a20', pos: [0, -0.68, -0.08], rot: [Math.PI / 2, 0, 0], seg: 8 });
  } else if (hold === 'stick') {
    b.bar([0, -0.7, 0.08], [0, -0.82, 0.52], 0.022, 0.018, { color: '#d9b27a' });
    b.ball(0.035, { color: '#f4efe4', pos: [0, -0.83, 0.54], seg: 6 });
  } else if (hold === 'coil') {
    b.add(new THREE.TorusGeometry(0.14, 0.03, 5, 14), { color: '#c9a978', pos: [0, -0.78, 0.1], rot: [0, 0, 0.3] });
  }
  return b.geo(true);
}

/** The black flag on its staff over the torn sail, and the tiller at the stern. In the ship's space. */
function rigging(): THREE.BufferGeometry {
  const b = new Build(37);
  const SX = 0.46;
  b.bar([0.45, 5.95, 0], [SX, 7.02, 0], 0.04, 0.03, { color: '#2a2018' });
  b.ball(0.06, { color: GOLD, pos: [SX, 7.05, 0], seg: 7, gloss: 0.6 });
  const loose = (p: THREE.Vector3): number => Math.max(0, SX - p.x);
  // the cloth, a grid so that it can ripple
  const W = 1.38;
  const H = 0.84;
  const top = 6.96;
  const cols = 7;
  const rows = 4;
  const P = (i: number, j: number): Vec => [SX - (i / cols) * W, top - (j / rows) * H + (i / cols) * 0.06, 0];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) b.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), { color: '#17161c', sway: loose });
  // the skull and bones on both faces
  const cx = SX - W * 0.5;
  const cy = top - H * 0.42;
  b.ball(0.16, { color: '#f4efe4', pos: [cx, cy + 0.04, 0], scale: [1, 1.05, 0.28], seg: 10, sway: loose });
  b.ball(0.1, { color: '#f4efe4', pos: [cx, cy - 0.1, 0], scale: [0.9, 0.7, 0.28], seg: 8, sway: loose });
  for (const z of [-0.05, 0.05]) for (const s of [-1, 1]) b.ball(0.042, { color: '#17161c', pos: [cx + s * 0.06, cy + 0.04, z], scale: [1, 1.2, 0.5], seg: 6, sway: loose });
  for (const s of [-1, 1]) {
    slab(b, [cx - 0.3, cy - 0.3 + (s > 0 ? 0 : 0.22), 0], [cx + 0.3, cy - 0.08 - (s > 0 ? 0 : 0.22), 0], 0.06, 0.07, { color: '#f4efe4', sway: loose });
    for (const e of [-1, 1]) {
      const x = cx + e * 0.31;
      const y = s > 0 ? (e < 0 ? cy - 0.31 : cy - 0.07) : e < 0 ? cy - 0.07 : cy - 0.31;
      b.ball(0.045, { color: '#f4efe4', pos: [x, y, 0], scale: [1, 1, 0.8], seg: 6, sway: loose });
    }
  }
  // the tiller, for the helmsman's hand
  b.bar([-3.42, 1.2, 0], [-3.5, -0.35, 0], 0.07, 0.06, { color: '#4a3524' });
  b.bar([-3.38, 1.12, 0], [-2.0, 1.32, -0.08], 0.05, 0.045, { color: WOOD });
  return b.geo(true);
}

/** The grappling hook he swings round his head. */
function grapnel(): THREE.BufferGeometry {
  const b = new Build(39);
  b.bar([0, 0.1, 0], [0, -0.28, 0], 0.03, 0.03, { color: '#8f98a2', gloss: 0.7 });
  b.add(new THREE.TorusGeometry(0.045, 0.014, 4, 8), { color: '#8f98a2', pos: [0, 0.14, 0] });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.add(new THREE.TorusGeometry(0.13, 0.024, 5, 10, Math.PI * 0.9), {
      color: '#8f98a2',
      gloss: 0.7,
      matrix: new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeTranslation(0.13, -0.28, 0)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI)),
    });
  }
  return b.geo(true);
}

/* ================================================================== one pirate, one crew */

interface Pirate {
  role: Role;
  g: THREE.Group;
  head: THREE.Mesh;
  heldPose: [THREE.Quaternion, THREE.Quaternion];
  /** Index 0 is his right arm (at -X), 1 his left. */
  arms: [THREE.Group, THREE.Group];
  x: number;
  z: number;
  y: number;
  yaw: number;
  ph: number;
  /** The captain's spyglass at his eye, shown instead of the one in his hand. */
  eyeGlass?: THREE.Mesh;
  handGlass?: THREE.Mesh;
}

interface Crew {
  root: THREE.Group;
  folk: Pirate[];
  grapnel: THREE.Mesh;
  line: THREE.Mesh;
  id: number;
  hurt: number;
  flash: number;
  seen: boolean;
}

type Mood = 'idle' | 'cheer' | 'flail' | 'shake' | 'gloat';

/** What the film asks of the crew at this moment. */
interface Cue {
  t: number;
  /** The pier in the ship's space, for the captain to turn to. */
  aimX: number;
  aimZ: number;
  /** The camera in the ship's space, for the crew to cheer at. */
  camX: number;
  camZ: number;
}

const CAST: { role: Role; x: number; z: number; yaw: number; look: Look; right: Parameters<typeof pirateArm>[2]; left: Parameters<typeof pirateArm>[2] }[] = [
  {
    role: 'captain',
    x: 2.45,
    z: 0,
    yaw: Math.PI / 2,
    look: { skin: '#c98a5c', shirt: '#7a1f2b', pants: '#2a2230', beard: '#1d1b22', patch: true, grin: true, captain: true },
    right: 'none',
    left: 'hook',
  },
  {
    role: 'blade',
    x: 1.1,
    z: 0.62,
    yaw: 0.45,
    look: { skin: '#a56a44', shirt: '#f4efe4', stripes: '#c8302c', pants: '#2f3a4c', band: RED, grin: true, earring: true },
    right: 'blade',
    left: 'none',
  },
  {
    role: 'hook',
    x: -1.5,
    z: -0.52,
    yaw: Math.PI - 0.4,
    look: { skin: '#8a5636', shirt: '#3a3040', vest: '#6b4a36', pants: '#1f2630', band: RED, beard: '#2a1a12', grin: true },
    right: 'none',
    left: 'coil',
  },
  {
    role: 'drum',
    x: -0.35,
    z: 0.32,
    yaw: 0.15,
    look: { skin: '#b97a50', shirt: '#2f5a4a', vest: '#2a2230', pants: '#3a2a20', band: RED, grin: true, drum: true },
    right: 'stick',
    left: 'stick',
  },
  {
    role: 'helm',
    x: -2.45,
    z: 0.22,
    yaw: Math.PI / 2,
    look: { skin: '#d89a6a', shirt: '#3a3040', pants: '#1f2630', band: RED, patch: true, earring: true },
    right: 'none',
    left: 'none',
  },
];

const MAX_CREWS = 2;

/* ================================================================== the layer, and the film */

export class Pirates {
  readonly group = new THREE.Group();
  private crews: Crew[] = [];
  private uFlut = { value: 0 };

  /* the film */
  private sim: GameSimulation | null = null;
  private id = -1;
  private hooks: PirateHooks = {};
  private shown = -1;
  private beat = 0;
  private said = { horn: false, glass: false, tension: false, alun: false };
  private start: Pose | null = null;
  private cue: Cue | null = null;
  /** Where the ship was, smoothed, so the camera does not ride every bob. */
  private at = new THREE.Vector3();
  private fwd = new THREE.Vector3(1, 0, 0);
  private tracked = false;

  private v = new THREE.Vector3();
  private w = new THREE.Vector3();
  private inv = new THREE.Matrix4();

  constructor(
    private water: Water,
    private fx: Fx,
    private story: StoryLayer
  ) {
    const opts = {
      side: THREE.DoubleSide,
      uniforms: { uFlut: this.uFlut },
      vHead: 'uniform float uFlut;',
      vLocal: /* glsl */ `
        float loose = aFx.y;
        if (loose > 0.) {
          p.z += (sin(uFlut * 7.2 - loose * 3.4) * .7 + sin(uFlut * 11.9 - loose * 6.3) * .3) * loose * .2;
          p.y += sin(uFlut * 5.1 - loose * 2.6) * loose * .05;
        }
      `,
    };
    const pair = toon(opts);
    const ink = outlineMaterial(1.25, '#15131a', { uniforms: opts.uniforms, vHead: opts.vHead, vLocal: opts.vLocal });
    const part = (geo: THREE.BufferGeometry): THREE.Mesh => {
      const m = inked(mesh(geo, pair), ink);
      m.frustumCulled = false;
      return m;
    };

    const heads = CAST.map((c) => pirateHead(c.look));
    const bodies = CAST.map((c) => pirateBody(c.look));
    const cuff = (c: (typeof CAST)[number]): string | undefined => (c.look.captain ? GOLD : undefined);
    const arms = CAST.map((c) => [pirateArm(c.look.shirt, c.look.skin, c.right, cuff(c)), pirateArm(c.look.shirt, c.look.skin, c.left, cuff(c))] as const);
    const brass = (a: Vec, z: Vec): THREE.BufferGeometry => {
      const g = new Build(41);
      g.bar(a, z, 0.05, 0.04, { color: '#b8892e', gloss: 0.8 });
      g.cyl(0.056, 0.056, 0.05, { color: '#6a4a20', pos: a, rot: [Math.PI / 2, 0, 0], seg: 8 });
      return g.geo(true);
    };
    const eyeGlass = brass([-0.125, 0.312, 0.308], [-0.125, 0.342, 0.95]);
    const handGlass = brass([0, -ARM, -0.12], [0, -ARM, 0.36]);
    const rig = rigging();
    const hook = grapnel();
    const lineGeo = new Build(43).cyl(1, 1, 1, { color: '#c9a978', seg: 5, open: true }).geo(true);

    for (let n = 0; n < MAX_CREWS; n++) {
      const root = new THREE.Group();
      root.matrixAutoUpdate = false;
      root.add(part(rig));
      const folk: Pirate[] = CAST.map((c, i) => {
        const g = new THREE.Group();
        const head = part(heads[i]);
        head.position.y = 1.6;
        g.add(part(bodies[i]), head);
        const mk = (k: 0 | 1): THREE.Group => {
          const a = new THREE.Group();
          a.position.set((k === 0 ? -1 : 1) * SHOULDER_X, SHOULDER_Y, 0);
          a.add(part(arms[i][k]));
          g.add(a);
          return a;
        };
        const p: Pirate = { role: c.role, g, head, heldPose: [new THREE.Quaternion(), new THREE.Quaternion()], arms: [mk(0), mk(1)], x: c.x, z: c.z, y: deckAt(c.x) - 0.02, yaw: c.yaw, ph: i * 1.37 + n * 0.5 };
        if (c.role === 'captain') {
          p.eyeGlass = part(eyeGlass);
          p.eyeGlass.visible = false;
          head.add(p.eyeGlass);
          p.handGlass = part(handGlass);
          p.arms[0].add(p.handGlass);
        }
        g.scale.setScalar(SCALE);
        g.rotation.order = 'YXZ';
        root.add(g);
        return p;
      });
      const gr = part(hook);
      const line = part(lineGeo);
      root.add(gr, line);
      root.visible = false;
      this.group.add(root);
      this.crews.push({ root, folk, grapnel: gr, line, id: -1, hurt: 0, flash: 0, seen: false });
    }
  }

  /* ================================================================ every frame */

  /** Puts a crew on every raider the story drew this frame. Call after the story layer's update. */
  update(dt: number, time: number, sim: GameSimulation): void {
    this.uFlut.value = time;
    for (const c of this.crews) c.seen = false;
    for (const [id, m] of this.story.raiders) {
      let c = this.crews.find((q) => q.id === id);
      if (!c) {
        c = this.crews.find((q) => q.id < 0 || !sim.find(q.id));
        if (!c) continue;
        c.id = id;
        c.hurt = 0;
        c.flash = 0;
      }
      c.seen = true;
      c.root.matrix.copy(m);
      c.root.matrixWorldNeedsUpdate = true;
      c.root.visible = true;
      const e = sim.find(id);
      if (e) this.act(c, e, dt, time, sim);
    }
    for (const c of this.crews) {
      if (c.seen) continue;
      c.root.visible = false;
      c.id = -1;
    }
  }

  /** How the crew feels about the way things are going. */
  private act(c: Crew, e: Entity, dt: number, time: number, sim: GameSimulation): void {
    if (e.hitFlash > c.flash + 0.04) c.hurt = 0.75;
    c.flash = e.hitFlash;
    c.hurt = Math.max(0, c.hurt - dt);
    const job = sim.story.s.job;
    let mood: Mood = 'idle';
    if (c.hurt > 0) mood = 'flail';
    else if (e.tag === 'leaving') {
      const last = sim.story.s.log[sim.story.s.log.length - 1];
      mood = last?.kind === 'raid' && last.result === 'failed' ? 'gloat' : 'shake';
    } else if (e.tag === 'attack' || (job?.kind === 'raid' && job.phase === 'seize')) mood = 'cheer';
    const film = this.cue && e.id === this.id ? this.cue : null;
    for (const p of c.folk) this.pose(p, mood, time, film, dt, c.hurt);
    this.swingHook(c, mood, time, film);
  }

  /** Points an arm along a direction in the pirate's own space. */
  private aim(arm: THREE.Group, x: number, y: number, z: number): void {
    arm.quaternion.setFromUnitVectors(DOWN, this.v.set(x, y, z).normalize());
  }

  /** Points an arm at a place in the pirate's own space (unscaled). */
  private reach(arm: THREE.Group, x: number, y: number, z: number): void {
    this.aim(arm, x - arm.position.x, y - arm.position.y, z - arm.position.z);
  }

  private pose(p: Pirate, mood: Mood, time: number, film: Cue | null, dt: number, hurt: number): void {
    const t = time + p.ph;
    let rise = 0;
    let lean = Math.sin(t * 1.1) * 0.03;
    let roll = 0;
    let turn = Math.sin(t * 0.45) * 0.12;
    const [R, L] = p.arms;
    // at rest the arms hang, swinging a little with the swell
    const sw = Math.sin(t * 1.6) * 0.08;
    this.aim(R, -0.16, -1, 0.1 + sw);
    this.aim(L, 0.16, -1, 0.1 - sw);
    if (p.eyeGlass && p.handGlass) {
      p.eyeGlass.visible = false;
      p.handGlass.visible = true;
    }

    let m: Mood | 'film' = mood;
    if (film && mood !== 'flail') m = 'film';

    if (m === 'cheer' || m === 'gloat') {
      rise = Math.abs(Math.sin(t * 6.5)) * 0.1;
      const wave = Math.sin(t * 9) * 0.25;
      this.aim(R, -0.4 - wave, 1, 0.15);
      this.aim(L, 0.4 + wave, 1, 0.15);
      if (p.role === 'blade') this.aim(R, -0.25, 1, 0.3 + Math.sin(t * 7) * 0.45);
      if (p.role === 'drum') this.drumAt(p, t, 0.42);
      if (p.role === 'helm') this.reach(L, 0.36, 0.78, 0.55);
      if (p.role === 'captain') this.aim(L, 0.25, 1, 0.35 + Math.sin(t * 8) * 0.2);
    } else if (m === 'flail') {
      const impact = 1 - hurt / 0.75;
      const recoil = Math.sin(impact * Math.PI * 2) * (1 - impact);
      lean = -0.46 * recoil;
      roll = Math.sin(p.ph + 0.7) * recoil * 0.27;
      rise = Math.max(0, recoil) * 0.11;
      this.aim(R, -1, 0.45 + Math.sin(t * 17) * 0.35, 0.2);
      this.aim(L, 1, 0.45 + Math.sin(t * 15 + 1) * 0.35, 0.2);
    } else if (m === 'shake') {
      lean = 0.12;
      turn = Math.PI * 0.1;
      const k = Math.sin(t * 16) * 0.3;
      this.aim(R, -0.25, 0.35 + k, 1);
      this.aim(L, 0.25, 0.35 - k, 1);
    } else if (m === 'idle') {
      if (p.role === 'drum') this.drumAt(p, t, 1.1);
      if (p.role === 'helm') this.reach(L, 0.36, 0.78, 0.55);
      if (p.role === 'blade') this.aim(R, -0.1, -0.5, 1);
      if (p.role === 'hook') this.aim(R, -0.3, -0.4, 1);
    } else if (film) {
      // the film's own business
      const ft = film.t;
      const cheer = smooth(2.85, 3.05, ft) * (1 - smooth(4.4, 4.9, ft));
      rise = cheer * Math.abs(Math.sin(t * 6.5)) * 0.12;
      if (p.role !== 'captain') {
        // once the horn goes they play to the camera, then go back to the job
        const d = Math.atan2(film.camX - p.x, film.camZ - p.z) - p.yaw;
        const most = p.role === 'helm' ? 0.6 : 1.4;
        turn = lerp(turn, clamp(Math.atan2(Math.sin(d), Math.cos(d)), -most, most), smooth(2.6, 3.2, ft) * (1 - smooth(6.0, 6.8, ft)));
      }
      if (p.role === 'drum') this.drumFilm(p, ft);
      else if (p.role === 'helm') {
        this.reach(L, 0.36, 0.78, 0.55);
        if (cheer > 0.1) this.aim(R, -0.35, 1, 0.2 + Math.sin(t * 9) * 0.3);
      } else if (p.role === 'blade') {
        if (ft > 2.85) this.aim(R, -0.25, 1, 0.3 + Math.sin(t * 7) * 0.45 * (ft < 4.6 ? 1 : 0.6));
        else this.aim(R, -0.1, -0.5, 1);
        if (cheer > 0.1) this.aim(L, 0.4, 1, 0.15 + Math.sin(t * 9) * 0.25);
      } else if (p.role === 'hook') {
        if (cheer > 0.1 && ft < 3.6) this.aim(L, 0.4, 1, 0.15 + Math.sin(t * 9) * 0.25);
      } else if (p.role === 'captain') {
        // faces where he is going, then turns to what he wants
        const look = smooth(CUT_CAPTAIN - 0.2, CUT_CAPTAIN + 0.5, ft);
        const d = Math.atan2(film.aimX - p.x, film.aimZ - p.z) - p.yaw;
        turn = lerp(0, clamp(Math.atan2(Math.sin(d), Math.cos(d)), -1.1, 1.1), look);
        if (ft < CUT_CAPTAIN) {
          // the hook goes up with the horn
          if (ft > 2.85) this.aim(L, 0.25, 1, 0.35 + Math.sin(t * 8) * 0.2 * cheer);
        } else if (ft < SCOPE_OUT) {
          const up = smooth(GLASS_AT - 0.35, GLASS_AT + 0.15, ft);
          if (up > 0.5 && p.eyeGlass && p.handGlass) {
            p.eyeGlass.visible = true;
            p.handGlass.visible = false;
          }
          // the arm comes up to hold the glass at his eye
          this.reach(R, lerp(-0.4, -0.12, up), lerp(0.82, 1.84, up), lerp(0.25, 0.62, up));
          this.aim(L, 0.5, -0.8, 0.2);
        } else {
          // and points the hook at it
          this.aim(L, 0.1, 0.18, 1);
          this.aim(R, -0.2, -1, 0.3);
        }
      }
    }

    // Settle into the next gesture while the drummer keeps exact contact on the beat.
    const follow = 1 - Math.exp(-dt * (m === 'flail' ? 24 : 14));
    for (let i = 0; i < 2; i++) {
      const target = p.arms[i].quaternion;
      if (p.role === 'drum' || p.eyeGlass?.visible) p.heldPose[i].copy(target);
      else target.copy(p.heldPose[i].slerp(target, follow));
    }
    const locked = p.eyeGlass?.visible;
    const nod = p.role === 'drum' ? 0.13 * Math.cos(t * 5.7) : 0.045 * Math.sin(t * 1.9);
    p.head.rotation.set(locked ? 0 : nod - lean * 0.5, locked ? 0 : 0.17 * Math.sin(t * 0.86), locked ? 0 : -roll * 0.57);
    p.g.position.set(p.x, p.y + rise, p.z);
    p.g.rotation.set(lean, p.yaw + turn, roll);
  }

  /** Both sticks on the drum, one after the other. */
  private drumAt(p: Pirate, t: number, period: number): void {
    for (const k of [0, 1] as const) {
      const u = (((t / period + k * 0.5) % 1) + 1) % 1;
      this.stick(p, k, smooth(0, 0.45, u) * (1 - smooth(0.82, 1, u)));
    }
  }

  /** The film's beat: each hit lands on the drum on its own count, the arms taking turns. */
  private drumFilm(p: Pirate, ft: number): void {
    for (const k of [0, 1] as const) {
      let prev = -9;
      let next = 99;
      for (let i = k; i < BEAT.length; i += 2) {
        const at = BEAT[i][0];
        if (at <= ft) prev = at;
        else {
          next = at;
          break;
        }
      }
      // up after a hit, down onto the next one; resting once the beat is over
      let h = smooth(prev, prev + 0.28, ft) * (1 - smooth(next - 0.13, next, ft));
      if (prev < 0) h = smooth(next - 0.6, next - 0.3, ft) * (1 - smooth(next - 0.13, next, ft));
      if (next > 90) h *= 1 - smooth(prev + 0.35, prev + 0.8, ft);
      this.stick(p, k, h);
    }
  }

  /** One drumstick arm: 0 on the drum head, 1 raised. */
  private stick(p: Pirate, k: 0 | 1, h: number): void {
    const s = k === 0 ? -1 : 1;
    this.aim(p.arms[k], s * 0.18, lerp(-0.62, 0.55, h), lerp(1, 0.6, h));
  }

  /** The grappling hook goes round his head while the crew is worked up, and hangs from his hand otherwise. */
  private swingHook(c: Crew, mood: Mood, time: number, film: Cue | null): void {
    const p = c.folk.find((q) => q.role === 'hook')!;
    const on = film ? film.t > 3.0 && film.t < 9 : mood === 'cheer' || mood === 'gloat';
    const R = p.arms[0];
    if (on) this.aim(R, -0.12, 1, 0.05);
    // the hand in the ship's space
    p.g.updateMatrix();
    R.updateMatrix();
    this.v.set(0, -ARM, 0.07).applyMatrix4(R.matrix).applyMatrix4(p.g.matrix);
    const hand = this.w.copy(this.v);
    let hx: number;
    let hy: number;
    let hz: number;
    if (on) {
      const a = time * 9.5;
      hx = hand.x + Math.cos(a) * 0.85;
      hy = hand.y + 0.22 + Math.sin(a * 0.5) * 0.06;
      hz = hand.z + Math.sin(a) * 0.85;
    } else {
      hx = hand.x + 0.05;
      hy = hand.y - 0.55;
      hz = hand.z + 0.1;
    }
    c.grapnel.position.set(hx, hy, hz);
    c.grapnel.rotation.set(on ? 1.2 : 0, on ? -time * 9.5 : 0, 0);
    c.grapnel.scale.setScalar(SCALE);
    // and its line
    const dx = hx - hand.x;
    const dy = hy + 0.13 - hand.y;
    const dz = hz - hand.z;
    const len = Math.hypot(dx, dy, dz);
    c.line.position.set((hand.x + hx) / 2, (hand.y + hy + 0.13) / 2, (hand.z + hz) / 2);
    c.line.quaternion.setFromUnitVectors(this.v.set(0, 1, 0), this.w.set(dx, dy, dz).normalize());
    c.line.scale.set(0.022, len, 0.022);
  }

  /* ================================================================ the film */

  get filming(): boolean {
    return this.sim !== null;
  }

  /** The ship that is about to be filmed, entity `id`. The renderer then runs `shoot` as the camera. */
  begin(sim: GameSimulation, id: number, hooks: PirateHooks): void {
    this.sim = sim;
    this.id = id;
    this.hooks = hooks;
    this.shown = -1;
    this.beat = 0;
    this.said = { horn: false, glass: false, tension: false, alun: false };
    this.start = null;
    this.tracked = false;
    this.lastT = 0;
    this.cue = { t: 0, aimX: 30, aimZ: 0, camX: 0, camZ: -10 };
  }

  private ship(): Entity | undefined {
    return this.sim?.find(this.id);
  }

  /** Keeps the smoothed position and heading of the ship. */
  private track(e: Entity, dt: number): void {
    const x = toX(e.x);
    const z = toZ(e.y);
    const fx = Math.cos(e.rotation);
    const fz = Math.sin(e.rotation);
    if (!this.tracked) {
      this.tracked = true;
      this.at.set(x, 0, z);
      this.fwd.set(fx, 0, fz);
      return;
    }
    const k = 1 - Math.exp(-dt * 3);
    this.at.x += (x - this.at.x) * k;
    this.at.z += (z - this.at.z) * k;
    this.fwd.x += (fx - this.fwd.x) * k * 0.5;
    this.fwd.z += (fz - this.fwd.z) * k * 0.5;
    this.fwd.normalize();
  }

  private lastT = 0;

  /** The camera, one pose per frame. False when the film is over. */
  shoot(t: number, out: Pose, play: Pose): boolean {
    const e = this.ship();
    if (!e || !this.sim) return false;
    this.start ??= { pos: out.pos.clone(), look: out.look.clone(), fov: out.fov };
    this.track(e, Math.max(0, t - this.lastT));
    this.lastT = t;
    const A = this.at;
    const F = this.fwd;
    // the side the camera keeps to: the one towards the bottom of the screen, where the light is
    const sx = -F.z;
    const sz = F.x;
    const side = sz >= 0 ? 1 : -1;
    const Sx = sx * side;
    const Sz = sz * side;
    const place = (f: number, s: number, y: number, o: THREE.Vector3): THREE.Vector3 => o.set(A.x + F.x * f + Sx * s, y, A.z + F.z * f + Sz * s);

    if (t < 3.0) {
      // straight out from the play view to the ship, coming in behind it: its torn sail against the island
      const u = clamp(t / 3.0, 0, 1);
      const k = 1 - Math.pow(1 - u, 2.4);
      const s = this.start;
      place(-11, 5.5, 4.6, this.v);
      place(16, 0, 2.2, this.w);
      const lift = Math.sin(k * Math.PI) * 6;
      out.pos.set(lerp(s.pos.x, this.v.x, k), lerp(s.pos.y, this.v.y, k) + lift, lerp(s.pos.z, this.v.z, k));
      out.look.set(lerp(s.look.x, this.w.x, k), lerp(s.look.y, this.w.y, k), lerp(s.look.z, this.w.z, k));
      out.fov = lerp(s.fov, 40, k);
    } else if (t < CUT_CAPTAIN) {
      // round to her side: the crew on deck, cheering at us
      const u = smooth(0, 1, (t - 3.0) / (CUT_CAPTAIN - 3.0));
      const a = lerp(Math.atan2(5.5, -11), Math.atan2(7.6, 2.4), u);
      const r = lerp(Math.hypot(5.5, 11), Math.hypot(7.6, 2.4), u);
      place(Math.cos(a) * r, Math.sin(a) * r, lerp(4.6, 4.7, u), out.pos);
      place(lerp(16, 0.6, smooth(0, 0.55, u)), 0, lerp(2.2, 1.9, u), out.look);
      out.fov = lerp(40, 34, u);
    } else if (t < SCOPE_IN) {
      // the captain, who has seen something
      const u = smooth(0, 1, (t - CUT_CAPTAIN) / (SCOPE_IN - CUT_CAPTAIN));
      const C = this.captain(e);
      const D = this.toPier(C);
      // in front of him and to the side, slowly closer: the eyepatch, the beard, the glass coming up
      const near = lerp(2.7, 2.15, u);
      out.pos.set(C.x + D.x * near - D.z * 1.3 * side, C.y + 0.22, C.z + D.z * near + D.x * 1.3 * side);
      out.look.set(C.x + D.x * 0.25, C.y - 0.32, C.z + D.z * 0.25);
      out.fov = 38;
    } else if (t < SCOPE_OUT) {
      // through the glass: it searches the shore, then settles on the pier
      const C = this.captain(e);
      const D = this.toPier(C);
      const B = this.pierTarget();
      out.pos.set(C.x + D.x * 1.6, C.y + 0.05, C.z + D.z * 1.6);
      const find = 1 - smooth(SCOPE_IN + 0.1, SCOPE_IN + 1.1, t);
      const sway = Math.sin(t * 1.7) * 0.35;
      out.look.set(B.x - D.z * (find * 7 + sway), B.y + Math.sin(t * 2.3) * 0.25 + find * 1.2, B.z + D.x * (find * 7 + sway));
      out.fov = 5.5;
    } else if (t < PIRATES_LENGTH) {
      // from above her stern, up and home to the lagoon, where she is still at the edge
      const u = smooth(0, 1, (t - SCOPE_OUT) / (PIRATES_LENGTH - SCOPE_OUT));
      place(-9, 4, 9.5, this.v);
      place(3, 0, 1.0, this.w);
      out.pos.set(lerp(this.v.x, play.pos.x, u), lerp(this.v.y, play.pos.y, u), lerp(this.v.z, play.pos.z, u));
      out.look.set(lerp(this.w.x, play.look.x, u), lerp(this.w.y, play.look.y, u), lerp(this.w.z, play.look.z, u));
      out.fov = lerp(42, play.fov, u);
    } else {
      out.pos.copy(play.pos);
      out.look.copy(play.look);
      out.fov = play.fov;
      return false;
    }
    return true;
  }

  /** Where the captain's eye is, in the world. */
  private captain(e: Entity): THREE.Vector3 {
    const m = this.story.raiders.get(e.id);
    const cap = CAST[0];
    this.v.set(cap.x, deckAt(cap.x) + 1.9 * SCALE, cap.z);
    if (m) this.v.applyMatrix4(m);
    else this.v.set(this.at.x + this.fwd.x * cap.x, 2.6, this.at.z + this.fwd.z * cap.x);
    return this.v;
  }

  /** Flat direction from the captain to the pier. */
  private toPier(C: THREE.Vector3): THREE.Vector3 {
    const B = this.pierTarget();
    return this.w.set(B.x - C.x, 0, B.z - C.z).normalize();
  }

  private bk = new THREE.Vector3();
  private pierTarget(): THREE.Vector3 {
    return this.bk.set(toX(PIER_END.x) + 7.5, 1.7, toZ(PIER_END.y) - 0.6);
  }

  /** Captions, sounds, the spyglass and the crew's cues, on the film's clock. */
  film(t: number, camera: THREE.Vector3): void {
    const e = this.ship();
    if (!e || !this.cue) return;
    this.cue.t = t;
    // the pier and the camera, in the ship's own space, for the crew to turn to
    const m = this.story.raiders.get(e.id);
    if (m) {
      this.inv.copy(m).invert();
      const B = this.pierTarget();
      this.v.set(B.x, 0, B.z).applyMatrix4(this.inv);
      this.cue.aimX = this.v.x;
      this.cue.aimZ = this.v.z;
      this.v.copy(camera).applyMatrix4(this.inv);
      this.cue.camX = this.v.x;
      this.cue.camZ = this.v.z;
    }

    let cap = -1;
    for (let i = 0; i < CAPTIONS.length; i++) if (t >= CAPTIONS[i][0] && t < CAPTIONS[i][1]) cap = i;
    if (cap !== this.shown) {
      this.shown = cap;
      if (cap >= 0) this.hooks.caption?.(CAPTIONS[cap][2], CAPTIONS[cap][3]);
      else this.hooks.caption?.('', '');
    }

    while (this.beat < BEAT.length && t >= BEAT[this.beat][0]) {
      this.hooks.sound?.('drum', BEAT[this.beat][1]);
      this.beat += 1;
    }
    if (t >= HORN_AT && !this.said.horn) {
      this.said.horn = true;
      this.hooks.sound?.('horn', 1);
      // spray off the bow as she comes on
      this.splash(e, 1.4);
    }
    if (t >= GLASS_AT && !this.said.glass) {
      this.said.glass = true;
      this.hooks.sound?.('glass', 1);
    }
    if (t >= SCOPE_IN && !this.said.tension) {
      this.said.tension = true;
      this.hooks.sound?.('tension', 1);
    }
    if (t >= SCOPE_OUT + 0.15 && !this.said.alun) {
      this.said.alun = true;
      this.hooks.sound?.('alun', 1);
    }
    if (t < 3.6 && Math.random() < 0.25) this.splash(e, 0.6);

    // the iris of the glass: black at the cut, open, and shut again before the cut back
    const open = smooth(SCOPE_IN, SCOPE_IN + 0.32, t) * (1 - smooth(SCOPE_OUT - 0.36, SCOPE_OUT - 0.02, t));
    const on = t >= SCOPE_IN - 0.05 && t < SCOPE_OUT + 0.03;
    this.hooks.scope?.(open, on);
  }

  private splash(e: Entity, k: number): void {
    const x = toX(e.x) + Math.cos(e.rotation) * 3.4;
    const z = toZ(e.y) + Math.sin(e.rotation) * 3.4;
    this.water.splash({ x, z, radius: 1.0 * k, foam: 0.8, impulse: 0.45 * k });
    if (k > 1) this.fx.burst(x, 0.6, z, 10, 3, 1.6, 0.12);
  }

  /** Puts the film away: the crew go back to the game, the subtitles and the glass clear. */
  end(): void {
    if (!this.sim) return;
    const hooks = this.hooks;
    this.sim = null;
    this.id = -1;
    this.cue = null;
    this.hooks = {};
    hooks.caption?.('', '');
    hooks.scope?.(0, false);
  }
}
