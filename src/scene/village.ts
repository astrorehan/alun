import * as THREE from 'three';
import { VILLAGE_PIER } from '../world';
import { Build, hex, matrixOf, smoothNormals, type Vec } from './build';
import { G, outlineMaterial, toon, type ToonPair } from './gfx';
import { inked, mesh } from './kit';
import { clamp, groundAt, lerp, rng, shoreAt, smooth, toX, toZ } from './space';

import { movingPerson, type PersonLook, type PersonRig } from './people';
import { buildPantaiPanjang } from './landmark';
export { person } from './people';

export const PIER = { x: toX(VILLAGE_PIER.x), z: toZ(VILLAGE_PIER.y) };
const _c = new THREE.Color();

/** Sways with the wind, and its lamps and windows only wake up after dark. */
export function propPair(side: THREE.Side = THREE.FrontSide, isStatic = false): ToonPair {
  return toon({
    side,
    isStatic,
    vWorld: 'wp.xyz += windAt(wp.xyz, aInst.x * 6.28) * aFx.y;',
    fAlbedo: /* glsl */ `
      float lampy = step(.45, vFx.w);
      alb *= mix(1., mix(.3, 1., sat(uLampI)), lampy);
      emis = vFx.w * mix(1., .1 + 2.1 * uLampI, lampy);
    `,
  });
}

const WOOD = ['#a9764a', '#b98556', '#9a6a42', '#c4925f', '#8c5f3c'];

/* ------------------------------------------------------------------ house parts */

/** A wall of uneven upright boards. Faces +Z in its own space. */
function boards(b: Build, m: THREE.Matrix4, w: number, h: number, cols: string[], holes: { x: number; y: number; w: number; h: number }[] = []): void {
  const n = Math.round(w / 0.36);
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * bw;
    const c = cols[Math.floor(b.r() * cols.length)];
    const segs: [number, number][] = [[0, h]];
    for (const o of holes) {
      if (Math.abs(x - o.x) < o.w / 2) {
        const last = segs.pop()!;
        if (o.y - o.h / 2 > last[0] + 0.05) segs.push([last[0], o.y - o.h / 2]);
        if (o.y + o.h / 2 < last[1] - 0.05) segs.push([o.y + o.h / 2, last[1]]);
      }
    }
    for (const [y0, y1] of segs) {
      const mm = m.clone().multiply(matrixOf([x, (y0 + y1) / 2, (b.r() - 0.5) * 0.04], [0, 0, (b.r() - 0.5) * 0.012]));
      b.add(new THREE.BoxGeometry(bw * 0.93, y1 - y0, 0.12), { color: c, matrix: mm, vary: 0.1, ao: (p) => lerp(0.7, 1, smooth(0, h, p.y)) });
    }
  }
}

function window_(b: Build, m: THREE.Matrix4, x: number, y: number, w: number, h: number, shutter: string): void {
  const at = (px: number, py: number, pz: number, rot: Vec = [0, 0, 0]): THREE.Matrix4 => m.clone().multiply(matrixOf([px, py, pz], rot));
  b.add(new THREE.BoxGeometry(w, h, 0.06), { color: '#ffcf86', matrix: at(x, y, -0.02), glow: 0.6 });
  b.add(new THREE.BoxGeometry(w + 0.16, 0.1, 0.2), { color: '#6b4528', matrix: at(x, y - h / 2, 0.04) });
  b.add(new THREE.BoxGeometry(w + 0.16, 0.1, 0.2), { color: '#6b4528', matrix: at(x, y + h / 2, 0.04) });
  b.add(new THREE.BoxGeometry(0.07, h, 0.1), { color: '#6b4528', matrix: at(x, y, 0.04) });
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(w * 0.48, h, 0.06), { color: shutter, matrix: at(x + s * (w * 0.5 + w * 0.2), y, 0.16, [0, s * 0.5, 0]), vary: 0.08 });
}

/** Rumbia thatch: overlapping rows of ragged palm shingles. */
function thatch(b: Build, m: THREE.Matrix4, w: number, d: number, rise: number, cols: string[], over = 0.5): void {
  const rows = 7;
  const run = d / 2 + over;
  const ang = Math.atan2(rise, d / 2);
  const slope = run / Math.cos(ang);
  for (const s of [-1, 1]) {
    for (let j = 0; j < rows; j++) {
      const t = (j + 0.5) / rows;
      const rowW = w + over * 1.2 + (1 - t) * 0.1;
      const n = Math.round(rowW / 0.42);
      for (let i = 0; i < n; i++) {
        const x = -rowW / 2 + (i + 0.5) * (rowW / n) + (b.r() - 0.5) * 0.06;
        const along = t * slope + (b.r() - 0.5) * 0.14;
        const z = s * Math.cos(ang) * along;
        const y = rise - Math.sin(ang) * along + 0.06 + b.r() * 0.05;
        const len = (slope / rows) * 1.75;
        const c = cols[Math.floor(b.r() * cols.length)];
        b.add(new THREE.BoxGeometry((rowW / n) * 1.08, 0.13, len), {
          color: c,
          matrix: m.clone().multiply(matrixOf([x, y, z], [s * (ang - 0.1), (b.r() - 0.5) * 0.1, (b.r() - 0.5) * 0.06])),
          vary: 0.13,
          ao: lerp(1, 0.72, t * 0.6),
        });
      }
    }
  }
  b.add(new THREE.CylinderGeometry(0.16, 0.16, w + over * 1.5, 7), { color: '#8a6a3a', matrix: m.clone().multiply(matrixOf([0, rise + 0.16, 0], [0, 0, Math.PI / 2])) });
  // crossed finials
  for (const e of [-1, 1])
    for (const s of [-1, 1])
      b.add(new THREE.BoxGeometry(0.1, 1.15, 0.12), { color: '#6b4528', matrix: m.clone().multiply(matrixOf([e * (w / 2 + over * 0.62), rise + 0.28, s * 0.24], [s * 0.62, 0, 0])) });
  // gable ends
  for (const e of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    const x = (e * w) / 2;
    const pts = [x, 0, -d / 2, x, 0, d / 2, x, rise - 0.1, 0];
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(e > 0 ? [pts[0], pts[1], pts[2], pts[6], pts[7], pts[8], pts[3], pts[4], pts[5]] : pts), 3));
    g.computeVertexNormals();
    b.add(g, { color: '#a87c4e', matrix: m, ao: 0.8 });
  }
}

/** Corrugated zinc gone to rust. */
function zinc(b: Build, m: THREE.Matrix4, w: number, d: number, rise: number, a: string, rust: string, over = 0.45): void {
  const run = d / 2 + over;
  const ang = Math.atan2(rise, d / 2);
  const slope = run / Math.cos(ang);
  const W = w + over * 1.4;
  const n = Math.round(W / 0.16);
  const A = hex(a);
  const R = hex(rust);
  for (const s of [-1, 1]) {
    const pos: number[] = [];
    const P = (i: number, j: number): Vec => {
      const x = -W / 2 + (i / n) * W;
      const t = j / 5;
      const along = t * slope;
      return [x, rise - Math.sin(ang) * along + Math.sin((i / n) * n * 1.57) * 0.05 + 0.1, s * Math.cos(ang) * along];
    };
    for (let i = 0; i < n; i++)
      for (let j = 0; j < 5; j++) {
        const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
        if (s > 0) pos.push(...q[0], ...q[3], ...q[1], ...q[1], ...q[3], ...q[2]);
        else pos.push(...q[0], ...q[1], ...q[3], ...q[1], ...q[2], ...q[3]);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.computeVertexNormals();
    b.add(g, {
      color: (p) => {
        const k = Math.sin(p.x * 2.1 + p.z * 1.3) * 0.5 + Math.sin(p.x * 5.3 - p.z * 3.7) * 0.3;
        return _c.copy(A).lerp(R, smooth(0.0, 0.55, k + (b.r() - 0.5) * 0.3)).multiplyScalar(Math.abs(Math.round(p.x / 1.3) * 1.3 - p.x) < 0.07 ? 0.78 : 1);
      },
      matrix: m,
      gloss: 0.14,
    });
  }
  b.add(new THREE.BoxGeometry(W, 0.12, 0.42), { color: a, matrix: m.clone().multiply(matrixOf([0, rise + 0.16, 0])) });
  for (const e of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    const x = (e * w) / 2;
    const pts = [x, 0, -d / 2, x, 0, d / 2, x, rise, 0];
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(e > 0 ? [pts[0], pts[1], pts[2], pts[6], pts[7], pts[8], pts[3], pts[4], pts[5]] : pts), 3));
    g.computeVertexNormals();
    b.add(g, { color: '#d9c49a', matrix: m });
  }
}

interface HouseOpt {
  x: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
  stilt: number;
  wall: string[];
  roof: 'thatch' | 'zinc';
  roofCols: string[];
  shutter: string;
  rise: number;
  veranda?: boolean;
}

function house(b: Build, o: HouseOpt): void {
  const gy = groundAt(o.x, o.z);
  const base = matrixOf([o.x, Math.max(gy, -0.4), o.z], [0, o.yaw, 0]);
  const M = (p: Vec, r: Vec = [0, 0, 0], s: Vec | number = 1): THREE.Matrix4 => base.clone().multiply(matrixOf(p, r, s));
  const H = 2.15;
  const floor = o.stilt;
  // stilts on flat stones
  for (let i = 0; i <= 2; i++)
    for (let j = 0; j <= 1; j++) {
      const x = lerp(-o.w / 2 + 0.2, o.w / 2 - 0.2, i / 2);
      const z = lerp(-o.d / 2 + 0.2, o.d / 2 - 0.2, j);
      b.add(new THREE.CylinderGeometry(0.15, 0.18, floor + 1.4, 7), { color: '#6f4c30', matrix: M([x, floor / 2 - 0.7, z]), ao: 0.6 });
      b.add(new THREE.CylinderGeometry(0.3, 0.38, 0.24, 7), { color: '#9a948a', matrix: M([x, 0.06, z]) });
    }
  b.add(new THREE.BoxGeometry(o.w + 0.4, 0.18, o.d + 0.4), { color: '#7d5535', matrix: M([0, floor, 0]), ao: 0.85 });
  const wy = floor + 0.09;
  const doorHole = { x: -o.w * 0.2, y: 0.85, w: 0.95, h: 1.7 };
  boards(b, M([0, wy, o.d / 2]), o.w, H, o.wall, [doorHole]);
  boards(b, M([0, wy, -o.d / 2], [0, Math.PI, 0]), o.w, H, o.wall);
  boards(b, M([o.w / 2, wy, 0], [0, Math.PI / 2, 0]), o.d, H, o.wall);
  boards(b, M([-o.w / 2, wy, 0], [0, -Math.PI / 2, 0]), o.d, H, o.wall);
  b.add(new THREE.BoxGeometry(0.95, 1.7, 0.06), { color: '#4a2f1c', matrix: M([doorHole.x, wy + 0.85, o.d / 2 - 0.05]) });
  b.add(new THREE.BoxGeometry(0.1, 0.1, 0.08), { color: '#ffd27a', matrix: M([doorHole.x + 0.3, wy + 0.85, o.d / 2]) });
  window_(b, M([0, wy, o.d / 2 + 0.06]), o.w * 0.24, 1.2, 0.9, 0.85, o.shutter);
  window_(b, M([o.w / 2 + 0.06, wy, 0], [0, Math.PI / 2, 0]), 0, 1.2, 0.9, 0.85, o.shutter);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.add(new THREE.BoxGeometry(0.2, H + 0.1, 0.2), { color: '#6b4528', matrix: M([(sx * o.w) / 2, wy + H / 2, (sz * o.d) / 2]) });
  const roofM = M([0, wy + H, 0]);
  if (o.roof === 'thatch') thatch(b, roofM, o.w, o.d, o.rise, o.roofCols, o.veranda ? 0.7 : 0.5);
  else zinc(b, roofM, o.w, o.d, o.rise, o.roofCols[0], o.roofCols[1]);
  if (o.veranda) {
    const vz = o.d / 2 + 0.85;
    b.add(new THREE.BoxGeometry(o.w + 0.4, 0.14, 1.7), { color: '#946842', matrix: M([0, floor, vz]) });
    for (const x of [-o.w / 2, -o.w * 0.02, o.w / 2]) {
      b.add(new THREE.CylinderGeometry(0.09, 0.1, H + floor, 6), { color: '#7d5535', matrix: M([x, (H + floor) / 2, vz + 0.75]) });
      b.add(new THREE.BoxGeometry(0.05, 0.6, 0.05), { color: '#7d5535', matrix: M([x * 0.5, floor + 0.35, vz + 0.78]) });
    }
    b.add(new THREE.BoxGeometry(o.w * 0.5, 0.09, 0.09), { color: '#c4925f', matrix: M([o.w * 0.25, floor + 0.7, vz + 0.78]) });
    b.add(new THREE.BoxGeometry(o.w + 0.9, 0.1, 2.1), { color: o.roofCols[0], matrix: M([0, wy + H + 0.02, vz + 0.15], [0.24, 0, 0]), vary: 0.05 });
  }
  // ladder
  const lz = o.d / 2 + (o.veranda ? 1.72 : 0.2);
  for (const s of [-0.34, 0.34]) {
    const a = new THREE.Vector3(doorHole.x + s, floor + 0.05, lz);
    const c = new THREE.Vector3(doorHole.x + s, 0.0, lz + floor * 0.75);
    const mid = a.clone().add(c).multiplyScalar(0.5);
    const len = a.distanceTo(c);
    b.add(new THREE.BoxGeometry(0.1, len, 0.12), { color: '#8c5f3c', matrix: M([mid.x, mid.y, mid.z], [-Math.atan2(floor * 0.75, floor), 0, 0]) });
  }
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    b.add(new THREE.BoxGeometry(0.8, 0.09, 0.22), { color: '#c4925f', matrix: M([doorHole.x, floor * (1 - t), lz + floor * 0.75 * t]) });
  }
}

/* ------------------------------------------------------------------ people */

interface Actor {
  rig: PersonRig;
  base: THREE.Vector3;
  yaw: number;
  ph: number;
  cheer: number;
  wave: number;
  walk?: { a: THREE.Vector3; b: THREE.Vector3; sp: number };
}

/* ------------------------------------------------------------------ perahu */

/** Painted outrigger canoe. Bow points +X. */
export function perahu(hull: string, stripe: string, sail: string | null, cargo = true): THREE.BufferGeometry {
  const b = new Build(17);
  const n = 16;
  const len = 4.8;
  const prof = (t: number): { w: number; keel: number; gun: number; x: number } => {
    const u = t * 2 - 1;
    const au = Math.abs(u);
    return { x: (u * len) / 2, w: 0.62 * Math.pow(1 - Math.pow(au, 2.4), 0.8) + 0.02, keel: -0.42 + Math.pow(au, 3) * 0.75, gun: 0.36 + Math.pow(au, 3) * 0.85 };
  };
  const ringAt = (t: number, inner: boolean): Vec[] => {
    const p = prof(t);
    const k = inner ? 0.84 : 1;
    return [
      [p.x, p.gun, -p.w * k],
      [p.x, lerp(p.keel, p.gun, 0.45), -p.w * 0.86 * k],
      [p.x, inner ? p.keel + 0.12 : p.keel, 0],
      [p.x, lerp(p.keel, p.gun, 0.45), p.w * 0.86 * k],
      [p.x, p.gun, p.w * k],
    ];
  };
  const skin = (inner: boolean): THREE.BufferGeometry => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const A = ringAt(i / n, inner);
      const B = ringAt((i + 1) / n, inner);
      for (let j = 0; j < 4; j++) {
        if (inner) out.push(...A[j], ...B[j], ...B[j + 1], ...A[j], ...B[j + 1], ...A[j + 1]);
        else out.push(...A[j], ...A[j + 1], ...B[j + 1], ...A[j], ...B[j + 1], ...B[j]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
    smoothNormals(g);
    return g;
  };
  const H = hex(hull);
  const S = hex(stripe);
  const W = hex('#f6efe0');
  b.add(skin(false), {
    color: (p) => {
      const pr = prof(p.x / len + 0.5);
      const q = (p.y - pr.keel) / (pr.gun - pr.keel);
      if (q > 0.7) return _c.copy(W);
      return _c.copy(H).multiplyScalar(lerp(0.78, 1.04, q));
    },
  });
  b.add(skin(true), { color: (p) => _c.set('#8a5a34').lerp(hex('#d09a5c'), smooth(-0.3, 0.4, p.y)), ao: (p) => lerp(0.55, 1, smooth(-0.3, 0.45, p.y)) });
  // painted rail and sheer stripe
  for (const s of [-1, 1]) {
    const rail: Vec[] = [];
    const line: Vec[] = [];
    for (let i = 0; i <= 12; i++) {
      const pr = prof(lerp(0.015, 0.985, i / 12));
      rail.push([pr.x, pr.gun, s * pr.w]);
      line.push([pr.x, lerp(pr.keel, pr.gun, 0.68), s * pr.w * 0.95]);
    }
    b.tube(rail, () => 0.085, { color: stripe, seg: 5, rings: 20 });
    b.tube(line, () => 0.06, { color: S, seg: 4, rings: 20 });
  }
  // eyes on the bow, so the boat can find its way home
  for (const s of [-1, 1]) {
    b.ball(0.13, { color: '#ffffff', pos: [1.72, 0.5, s * 0.37], scale: [1, 1, 0.4], seg: 8 });
    b.ball(0.07, { color: '#12202c', pos: [1.76, 0.5, s * 0.42], scale: [1, 1, 0.4], seg: 6 });
  }
  for (const x of [-1.1, 0, 1.1]) b.box(0.22, 0.09, 1.02, { color: '#c4925f', pos: [x, 0.32, 0], r: 0.02 });
  // outriggers
  for (const x of [-0.95, 0.95]) {
    b.tube(
      [
        [x, 0.46, -1.85],
        [x, 0.66, -0.9],
        [x, 0.5, 0],
        [x, 0.66, 0.9],
        [x, 0.46, 1.85],
      ],
      () => 0.07,
      { color: '#d8b56a', seg: 5, rings: 10 }
    );
  }
  for (const s of [-1, 1]) {
    b.bar([-1.7, 0.06, s * 1.85], [1.8, 0.14, s * 1.85], 0.13, 0.1, { color: '#e6cd86', seg: 7 });
    for (const x of [-0.95, 0.95]) b.bar([x, 0.46, s * 1.85], [x, 0.08, s * 1.85], 0.05, 0.05, { color: '#8c6a3a', seg: 5 });
  }
  if (sail) {
    b.bar([0.35, 0.2, 0], [0.5, 4.75, 0], 0.095, 0.06, { color: '#8c6a3a', seg: 6 });
    b.bar([0.4, 0.75, 0.04], [-2.35, 1.4, 0.04], 0.06, 0.045, { color: '#8c6a3a', seg: 5 });
    const N = 9;
    const P = (u: number, v: number): Vec => {
      const a: Vec = [0.44, 0.8, 0.02];
      const top: Vec = [0.5, 4.65, 0.02];
      const tail: Vec = [-2.3, 1.42, 0.02];
      const x = a[0] + (top[0] - a[0]) * v + (tail[0] - a[0]) * u * (1 - v);
      const y = a[1] + (top[1] - a[1]) * v + (tail[1] - a[1]) * u * (1 - v);
      return [x, y, Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 0.9) * 0.75];
    };
    for (let j = 0; j < N; j++) {
      const out: number[] = [];
      for (let i = 0; i < N; i++) {
        const q = [P(i / N, j / N), P((i + 1) / N, j / N), P((i + 1) / N, (j + 1) / N), P(i / N, (j + 1) / N)];
        out.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
      smoothNormals(sg);
      b.add(sg, { color: j % 2 ? '#fbf4e2' : sail, sway: 0.02 });
    }
  }
  if (cargo) {
    b.cyl(0.24, 0.2, 0.3, { color: '#d8b56a', pos: [-0.5, 0.18, 0.12], seg: 9 });
    for (let i = 0; i < 5; i++) b.ball(0.09, { color: i % 2 ? '#9fc4d8' : '#7fa8c4', pos: [-0.5 + (b.r() - 0.5) * 0.28, 0.36, 0.12 + (b.r() - 0.5) * 0.28], scale: [1.6, 0.7, 0.7], seg: 6 });
    b.ball(0.28, { color: '#3fa08a', pos: [-1.35, 0.12, 0], scale: [1.3, 0.6, 1], seg: 8, rough: 0.06 });
  }
  return b.geo(true);
}

/* ================================================================== village */

export class Village {
  readonly group = new THREE.Group();
  readonly dynGroup = new THREE.Group();
  private folk: Actor[] = [];
  private moored: THREE.Mesh[] = [];
  private flag: THREE.Mesh;
  readonly lampSpots: { p: THREE.Vector3; r: number; c: THREE.Vector3 }[] = [];

  constructor() {
    const staticPair = propPair(THREE.FrontSide, true);
    const staticPair2 = propPair(THREE.DoubleSide, true);
    const pair = propPair(THREE.FrontSide, false);
    const pair2 = propPair(THREE.DoubleSide, false);
    const staticInk = outlineMaterial(1.1, '#33190f', { isStatic: true });
    const dynInk = outlineMaterial(1.1, '#33190f');
    const r = rng(808);
    const px = PIER.x;
    const pz = PIER.z;
    const warm = new THREE.Vector3(0.62, 0.3, 0.09);
    const lamp = (x: number, y: number, z: number, rad: number, k = 1): void => {
      this.lampSpots.push({ p: new THREE.Vector3(x, y, z), r: rad, c: warm.clone().multiplyScalar(k) });
    };

    /* ---------------- pier */
    const b = new Build(21);
    const x0 = px - 4.4;
    const x1 = px + 8.4;
    const deckY = 1.1;
    for (let x = x0; x < x1; x += 0.46) {
      const w = 2.55 + (r() - 0.5) * 0.32;
      b.box(0.41, 0.13, w, { color: WOOD[Math.floor(r() * WOOD.length)], pos: [x, deckY + (r() - 0.5) * 0.05, pz + (r() - 0.5) * 0.14], rot: [(r() - 0.5) * 0.04, (r() - 0.5) * 0.07, (r() - 0.5) * 0.05], vary: 0.1, r: 0.03 });
    }
    // landing stage
    for (let x = x1 - 0.1; x < x1 + 3.2; x += 0.46) {
      const w = 5.4 + (r() - 0.5) * 0.4;
      b.box(0.41, 0.13, w, { color: WOOD[Math.floor(r() * WOOD.length)], pos: [x, deckY - 0.02 + (r() - 0.5) * 0.05, pz + 0.2], rot: [(r() - 0.5) * 0.03, (r() - 0.5) * 0.04, 0], vary: 0.1, r: 0.03 });
    }
    for (const s of [-1, 1]) b.bar([x0, deckY - 0.16, pz + s], [x1 + 3, deckY - 0.16, pz + s], 0.13, 0.13, { color: '#7a5233' });
    const post = (x: number, z: number, top: number): void => {
      const gy = Math.min(groundAt(x, z), deckY);
      b.bar([x + (r() - 0.5) * 0.12, gy - 0.5, z + (r() - 0.5) * 0.12], [x, top, z], 0.21, 0.17, {
        color: (p) => _c.set('#8a5f3d').lerp(hex('#4a3a2c'), smooth(0.35, -0.2, p.y)).lerp(hex('#e8e0d0'), p.y > top - 0.24 ? 0.85 : 0),
        seg: 8,
      });
    };
    for (let x = x0 + 1; x < x1 + 0.4; x += 2.4) for (const s of [-1, 1]) post(x, pz + s * 1.32, deckY + 0.95);
    for (const [x, z] of [
      [x1 + 0.2, pz - 2.4],
      [x1 + 2.9, pz - 2.4],
      [x1 + 0.2, pz + 2.8],
      [x1 + 2.9, pz + 2.8],
      [x1 + 2.9, pz + 0.2],
    ])
      post(x, z, deckY + 1.15);
    // rope rails that actually sag
    const rope = (a: Vec, c: Vec, sag: number): void => {
      const m: Vec = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - sag, (a[2] + c[2]) / 2];
      b.tube([a, m, c], () => 0.05, { color: '#e3cf9a', seg: 4, rings: 6 });
    };
    for (const s of [-1, 1]) for (let x = x0 + 1; x < x1 - 2; x += 2.4) rope([x, deckY + 0.8, pz + s * 1.32], [x + 2.4, deckY + 0.8, pz + s * 1.32], 0.22);

    /* ---------------- things people left on the pier */
    const crate = (x: number, y: number, z: number, s: number, rot: number, c: string): void => {
      const m = matrixOf([x, y + s / 2, z], [0, rot, 0]);
      b.add(new THREE.BoxGeometry(s, s, s), { color: c, matrix: m, vary: 0.06 });
      for (const k of [-1, 1]) {
        b.add(new THREE.BoxGeometry(s * 1.06, s * 0.14, s * 1.06), { color: '#6b4528', matrix: m.clone().multiply(matrixOf([0, k * s * 0.42, 0])) });
      }
    };
    crate(x1 + 1.0, deckY, pz - 1.7, 0.8, 0.3, '#c99a5e');
    crate(x1 + 1.9, deckY, pz - 1.85, 0.7, -0.2, '#b98556');
    crate(x1 + 1.3, deckY + 0.8, pz - 1.75, 0.6, 0.7, '#d8ab6c');
    crate(x0 + 2.2, deckY, pz - 0.75, 0.66, 0.2, '#b98556');
    const barrel = (x: number, y: number, z: number, c: string): void => {
      b.cyl(0.36, 0.36, 0.96, { color: c, pos: [x, y + 0.48, z], seg: 12, gloss: 0.3 });
      for (const k of [0.2, 0.5, 0.8]) b.cyl(0.385, 0.385, 0.07, { color: _c.set(c).multiplyScalar(0.75).clone(), pos: [x, y + k * 0.96, z], seg: 12 });
    };
    barrel(x1 + 2.2, deckY, pz + 1.9, '#2f7fc0');
    barrel(x1 + 1.35, deckY, pz + 2.1, '#2f7fc0');
    const basket = (x: number, y: number, z: number, s: number, fish: string): void => {
      b.cyl(s, s * 0.78, s * 0.8, { color: '#d8ae62', pos: [x, y + s * 0.4, z], seg: 11 });
      b.add(new THREE.TorusGeometry(s, s * 0.12, 5, 14), { color: '#b5853f', pos: [x, y + s * 0.8, z], rot: [Math.PI / 2, 0, 0] });
      for (let i = 0; i < 7; i++) b.ball(s * 0.3, { color: fish, pos: [x + (r() - 0.5) * s, y + s * 0.84, z + (r() - 0.5) * s], scale: [1.4, 0.6, 0.6], rot: [0, r() * 6, 0], seg: 6, vary: 0.2 });
    };
    basket(x1 + 0.6, deckY, pz + 0.9, 0.36, '#9fc9e0');
    basket(x0 + 4.4, deckY, pz + 0.7, 0.34, '#f2a45c');
    for (let i = 0; i < 4; i++) b.add(new THREE.TorusGeometry(0.34 - i * 0.03, 0.06, 5, 14), { color: '#e3cf9a', pos: [x1 - 1.1, deckY + 0.1 + i * 0.1, pz - 0.7], rot: [Math.PI / 2, 0, 0] });

    const lantern = (x: number, y0: number, z: number, h: number, dx: number): void => {
      b.bar([x, y0, z], [x, y0 + h, z], 0.085, 0.065, { color: '#5a3d26' });
      b.bar([x, y0 + h - 0.1, z], [x + dx, y0 + h + 0.12, z], 0.05, 0.04, { color: '#5a3d26' });
      b.bar([x + dx, y0 + h + 0.1, z], [x + dx, y0 + h - 0.18, z], 0.02, 0.02, { color: '#2a2018' });
      b.cyl(0.17, 0.21, 0.36, { color: '#ffd480', pos: [x + dx, y0 + h - 0.38, z], seg: 8, glow: 1 });
      b.cyl(0.06, 0.24, 0.14, { color: '#3a2c20', pos: [x + dx, y0 + h - 0.14, z], seg: 8 });
      b.cyl(0.22, 0.2, 0.07, { color: '#3a2c20', pos: [x + dx, y0 + h - 0.58, z], seg: 8 });
      lamp(x + dx, y0 + h - 0.38, z, 8, 1.1);
    };
    lantern(x1 + 2.9, deckY, pz - 2.4, 2.4, -0.5);
    lantern(x1 + 2.9, deckY, pz + 2.8, 2.4, -0.5);
    lantern(x0 + 1, deckY, pz - 1.32, 2.2, 0.45);

    /* ---------------- houses */
    const t1 = ['#d9b25c', '#c99a46', '#e6c67a', '#b5853a'];
    const t2 = ['#cfa050', '#b8873c', '#dcb868', '#a87832'];
    house(b, { x: px - 8.4, z: pz - 3.4, yaw: 0.12, w: 5.2, d: 3.6, stilt: 1.35, wall: ['#b98a58', '#a97a4a', '#c69865'], roof: 'thatch', roofCols: t1, shutter: '#1f9c94', rise: 2.5, veranda: true });
    house(b, { x: px - 12.6, z: pz + 3.4, yaw: 0.34, w: 4.0, d: 3.2, stilt: 1.1, wall: ['#e8dcc0', '#dccca8', '#f2e8d0'], roof: 'zinc', roofCols: ['#c8573e', '#8a3a2a'], shutter: '#2f7fc0', rise: 1.6 });
    house(b, { x: px - 5.6, z: pz + 5.2, yaw: -0.12, w: 3.6, d: 3.0, stilt: 1.2, wall: ['#8fb8a8', '#7fa898', '#a0c8b6'], roof: 'thatch', roofCols: t2, shutter: '#e0a03a', rise: 2.0 });
    house(b, { x: px - 15.4, z: pz - 4.8, yaw: 0.2, w: 3.6, d: 3.0, stilt: 1.1, wall: ['#b98a58', '#c69865'], roof: 'zinc', roofCols: ['#7f98a4', '#a85a3e'], shutter: '#d8503e', rise: 1.5 });
    lamp(px - 6.6, 3.6, pz - 0.6, 9, 1.0);
    lamp(px - 12.2, 2.9, pz + 5.8, 9, 0.9);
    lamp(px - 5.0, 3.0, pz + 7.4, 9, 0.9);

    /* ---------------- warung: striped awning, coconuts, a bench */
    {
      const wx = px - 5.2;
      const wz = pz - 8.0;
      const gy = groundAt(wx, wz);
      b.box(2.2, 0.85, 0.8, { color: '#2f8fc0', pos: [wx, gy + 0.45, wz], r: 0.05 });
      b.box(2.4, 0.12, 1.0, { color: '#e8d0a0', pos: [wx, gy + 0.92, wz], r: 0.04 });
      for (const sx of [-1, 1]) for (const sz of [-0.5, 1]) b.bar([wx + sx * 1.15, gy, wz + sz * 0.6], [wx + sx * 1.15, gy + (sz > 0 ? 1.95 : 2.5), wz + sz * 0.6], 0.07, 0.07, { color: '#c8a862' });
      for (let i = 0; i < 8; i++) {
        const x = wx - 1.4 + (i + 0.5) * 0.35;
        b.quad([x - 0.175, gy + 2.55, wz - 0.45], [x - 0.175, gy + 1.9, wz + 0.95], [x + 0.175, gy + 1.9, wz + 0.95], [x + 0.175, gy + 2.55, wz - 0.45], { color: i % 2 ? '#f7f2e6' : '#e8503e' });
        b.quad([x - 0.175, gy + 1.9, wz + 0.95], [x - 0.12, gy + 1.62, wz + 0.97], [x + 0.12, gy + 1.62, wz + 0.97], [x + 0.175, gy + 1.9, wz + 0.95], { color: i % 2 ? '#f7f2e6' : '#e8503e', sway: 0.05 });
      }
      for (let i = 0; i < 7; i++) b.ball(0.2, { color: i % 3 ? '#8fbf4a' : '#c8d86a', pos: [wx - 0.7 + (i % 4) * 0.4, gy + 1.15 + (i > 3 ? 0.28 : 0), wz + (i > 3 ? 0 : 0.1)], seg: 8 });
      b.box(1.8, 0.1, 0.4, { color: '#b98556', pos: [wx + 0.3, gy + 0.5, wz + 2.0], rot: [0, 0.14, 0] });
      for (const s of [-0.7, 0.7]) b.box(0.1, 0.5, 0.36, { color: '#7a5233', pos: [wx + 0.3 + s, gy + 0.25, wz + 2.0] });
      lamp(wx, gy + 1.9, wz + 0.6, 7, 0.8);
    }

    /* ---------------- fish drying racks */
    for (const [rx, rz, ry] of [
      [px - 1.6, pz + 5.6, 0.1],
      [px - 2.2, pz + 8.0, -0.1],
    ]) {
      const gy = Math.max(groundAt(rx, rz), 0);
      const M = matrixOf([rx, gy, rz], [0, ry, 0]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 5), { color: '#b5914e', matrix: M.clone().multiply(matrixOf([sx * 1.1, 0.5, sz * 0.5])) });
      b.add(new THREE.BoxGeometry(2.5, 0.06, 1.25), { color: '#d8b56a', matrix: M.clone().multiply(matrixOf([0, 0.98, 0], [0.06, 0, 0])) });
      for (let i = 0; i < 18; i++)
        b.add(new THREE.SphereGeometry(0.12, 6, 4), { color: i % 4 ? '#c9b48a' : '#e0cfa0', matrix: M.clone().multiply(matrixOf([-1.05 + (i % 6) * 0.42, 1.06, -0.4 + Math.floor(i / 6) * 0.4], [0, 0.3, 0], [1.5, 0.3, 0.6])), vary: 0.15 });
    }

    /* ---------------- fire ring with a thread of smoke */
    {
      const fx = px - 8.6;
      const fz = pz + 1.6;
      const gy = groundAt(fx, fz);
      for (let i = 0; i < 8; i++) b.ball(0.16, { color: '#8f8a82', pos: [fx + Math.cos(i * 0.785) * 0.5, gy + 0.06, fz + Math.sin(i * 0.785) * 0.5], seg: 6, vary: 0.15 });
      b.cyl(0.42, 0.42, 0.06, { color: '#3a3230', pos: [fx, gy + 0.03, fz], seg: 10 });
      for (let i = 0; i < 4; i++) b.bar([fx + Math.cos(i * 1.6) * 0.4, gy + 0.05, fz + Math.sin(i * 1.6) * 0.4], [fx, gy + 0.36, fz], 0.06, 0.05, { color: '#4a3524' });
      this.smoke.set(fx, gy + 0.5, fz);
    }

    /* ---------------- clothesline */
    {
      const ax = px - 11.5;
      const az = pz - 0.6;
      const gy = groundAt(ax, az);
      b.bar([ax, gy, az], [ax, gy + 2.2, az], 0.08, 0.06, { color: '#8c6a3a' });
      b.bar([ax + 4.4, gy, az + 0.9], [ax + 4.4, gy + 2.2, az + 0.9], 0.08, 0.06, { color: '#8c6a3a' });
      b.tube([[ax, gy + 2.1, az], [ax + 2.2, gy + 1.9, az + 0.45], [ax + 4.4, gy + 2.1, az + 0.9]], () => 0.025, { color: '#efe6cf', seg: 3, rings: 8 });
    }
    const cloth = new Build(22);
    {
      const ax = px - 11.5;
      const az = pz - 0.6;
      const gy = groundAt(ax, az);
      const cols = ['#e8503e', '#f2c14a', '#2f8fc0', '#7a4fb0', '#3fae7a', '#f7f2e6'];
      for (let i = 0; i < 6; i++) {
        const t = 0.1 + i * 0.15;
        const x = ax + 4.4 * t;
        const z = az + 0.9 * t;
        const y = gy + 2.08 - Math.sin(t * Math.PI) * 0.18;
        const h = lerp(0.7, 1.15, r());
        cloth.quad([x - 0.26, y, z - 0.05], [x + 0.26, y, z + 0.06], [x + 0.26, y - h, z + 0.06], [x - 0.26, y - h, z - 0.05], { color: cols[i], sway: (p) => clamp((y - p.y) * 0.5, 0, 0.6) });
        cloth.quad([x - 0.26, y - h + 0.16, z - 0.045], [x + 0.26, y - h + 0.16, z + 0.065], [x + 0.26, y - h + 0.06, z + 0.065], [x - 0.26, y - h + 0.06, z - 0.045], { color: '#fff4d0', sway: (p) => clamp((y - p.y) * 0.5, 0, 0.6) });
      }
    }

    /* ---------------- flagpole on the village green */
    const fpx = px - 4.6;
    const fpz = pz - 4.4;
    const fgy = groundAt(fpx, fpz);
    b.bar([fpx, fgy, fpz], [fpx, fgy + 6.2, fpz], 0.1, 0.06, { color: '#f2ede0', seg: 7 });
    b.ball(0.13, { color: '#f2c14a', pos: [fpx, fgy + 6.3, fpz], seg: 8 });
    b.cyl(0.5, 0.6, 0.3, { color: '#d8d0c0', pos: [fpx, fgy + 0.12, fpz], seg: 10 });
    {
      const f = new Build(23);
      const N = 12;
      const pos: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = i / N;
        const c = (i + 1) / N;
        pos.push(0.05 + a * 1.9, 0, 0, 0.05 + c * 1.9, 0, 0, 0.05 + c * 1.9, 1.25, 0, 0.05 + a * 1.9, 0, 0, 0.05 + c * 1.9, 1.25, 0, 0.05 + a * 1.9, 1.25, 0);
        pos.push(0.05 + a * 1.9, 0.625, 0.002, 0.05 + c * 1.9, 0.625, 0.002, 0.05 + c * 1.9, 1.25, 0.002, 0.05 + a * 1.9, 0.625, 0.002, 0.05 + c * 1.9, 1.25, 0.002, 0.05 + a * 1.9, 1.25, 0.002);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.computeVertexNormals();
      f.add(g, { color: (p) => (p.y > 0.62 && p.z > 0.001 ? _c.set('#e0262e') : _c.set('#fbf8f0')) });
      const fp = toon({
        side: THREE.DoubleSide,
        vLocal: 'p.z += sin(p.x * 3.2 - uTime * 5.) * .16 * p.x * (.5 + .4 * uWind.z); p.y -= p.x * .05;',
        fAlbedo: 'alb = vLP.y > .625 ? vec3(.74, .02, .03) : vec3(.96, .94, .88);',
      });
      this.flag = mesh(f.geo(), fp);
      this.flag.position.set(fpx, fgy + 4.8, fpz);
      this.flag.frustumCulled = false;
    }

    /* ---------------- Pantai Panjang Bengkulu coastal landmark */
    buildPantaiPanjang(b, lamp);

    const body = inked(mesh(b.geo(true), staticPair), staticInk);
    body.frustumCulled = false;
    this.group.add(body);
    const cm = mesh(cloth.geo(), pair2);
    cm.frustumCulled = false;
    this.dynGroup.add(cm, this.flag);

    /* ---------------- beached and moored canoes */
    const canoe = (g: THREE.BufferGeometry, x: number, y: number, z: number, yaw: number, roll: number, float: boolean, s = 1): void => {
      const m = inked(mesh(g, float ? pair2 : staticPair2), float ? dynInk : staticInk);
      m.position.set(x, y, z);
      m.rotation.set(roll, yaw, 0, 'YXZ');
      m.scale.setScalar(s);
      m.frustumCulled = false;
      if (float) {
        this.dynGroup.add(m);
        this.moored.push(m);
      } else {
        this.group.add(m);
      }
    };
    const bz = pz - 12.2;
    const bx = shoreAt(bz) - 3.0;
    canoe(perahu('#e8503e', '#f2c14a', null), bx, groundAt(bx, bz) + 0.34, bz, 0.35, 0.14, false);
    const bz2 = pz - 16.2;
    const bx2 = shoreAt(bz2) - 4.0;
    canoe(perahu('#2f9c94', '#f7f2e6', null, false), bx2, groundAt(bx2, bz2) + 0.34, bz2, 0.1, -0.1, false, 0.92);
    canoe(perahu('#2f7fc0', '#f2c14a', null), px + 5.6, 0.1, pz + 4.1, 0.16, 0, true, 0.95);
    canoe(perahu('#f2a03a', '#e8503e', null, false), px + 1.6, 0.1, pz + 3.8, -0.1, 0, true, 0.85);

    /* ---------------- villagers */
    const add = (l: PersonLook, x: number, z: number, yaw: number, y?: number, walk?: Actor['walk']): void => {
      const rig = movingPerson(l, pair, dynInk);
      const m = rig.root;
      const gy = y ?? groundAt(x, z);
      m.position.set(x, gy, z);
      m.frustumCulled = false;
      this.dynGroup.add(m);
      this.folk.push({ rig, base: new THREE.Vector3(x, gy, z), yaw, ph: r() * 6, cheer: 0, wave: 0, walk });
    };
    // Bu Sari waits at the end of the pier
    add({ shirt: '#28828b', sarong: '#504465', skin: '#ed9e6d', hat: 'kerudung', hatCol: '#793c81', goggles: true, scale: 1.12 }, x1 + 1.9, pz + 0.5, 1.2, deckY + 0.06);
    add({ shirt: '#f7f2e6', sarong: '#2f6f9c', hat: 'caping', scale: 1.1 }, x0 + 5.4, pz - 0.2, 0.9, deckY + 0.06);
    add({ shirt: '#3fae7a', sarong: '#8a5a3a', hat: 'peci', scale: 1.1 }, px - 4.2, pz - 5.8, 0.6);
    add({ shirt: '#e8503e', sarong: '#34404c', hat: 'none', shorts: true, scale: 0.78 }, px - 3.4, pz - 9.2, 0.4, undefined, {
      a: new THREE.Vector3(px - 3.4, 0, pz - 9.4),
      b: new THREE.Vector3(shoreAt(pz - 18) - 4.4, 0, pz - 18),
      sp: 0.16,
    });
    add({ shirt: '#5fb0e0', sarong: '#f2a03a', hat: 'none', shorts: true, ponytail: true, scale: 0.74 }, px - 4.4, pz - 10.2, 0.4, undefined, {
      a: new THREE.Vector3(px - 4.6, 0, pz - 10),
      b: new THREE.Vector3(shoreAt(pz - 17) - 5.6, 0, pz - 17.4),
      sp: 0.15,
    });
    add({ shirt: '#d8607a', sarong: '#4a7a4a', hat: 'caping', scale: 1.05 }, px - 3.2, pz + 6.9, -0.4);
  }

  readonly smoke = new THREE.Vector3();

  cheer(): void {
    for (const f of this.folk) f.cheer = Math.max(f.cheer, 0.7 + Math.random() * 0.3);
  }

  update(dt: number, t: number, waterAt: (x: number, z: number) => number): void {
    for (const f of this.folk) {
      f.cheer = Math.max(0, f.cheer - dt * 0.9);
      const { root, head, arms, forearms, legs } = f.rig;
      const phase = t * 5.8 + f.ph;
      f.wave = lerp(f.wave, smooth(0, 0.45, f.cheer), 1 - Math.exp(-12 * dt));
      const cheer = f.wave;
      const hop = Math.max(0, Math.sin(phase * 1.45)) ** 1.4 * 0.24 * cheer;
      let gait = 0;
      if (f.walk) {
        const u = t * f.walk.sp + f.ph;
        const k = 0.5 - 0.5 * Math.cos(u);
        const x = lerp(f.walk.a.x, f.walk.b.x, k) + Math.sin(u * 3.1) * 0.7;
        const z = lerp(f.walk.a.z, f.walk.b.z, k);
        const dx = (f.walk.b.x - f.walk.a.x) * 0.5 * Math.sin(u) + 2.17 * Math.cos(u * 3.1);
        const dz = (f.walk.b.z - f.walk.a.z) * 0.5 * Math.sin(u);
        const yaw = Math.atan2(dx, dz);
        root.rotation.y += Math.atan2(Math.sin(yaw - root.rotation.y), Math.cos(yaw - root.rotation.y)) * (1 - Math.exp(-8 * dt));
        gait = clamp(Math.hypot(dx, dz) * f.walk.sp, 0, 1);
        root.position.set(x, groundAt(x, z) + gait * 0.032 * Math.abs(Math.cos(phase)) + hop, z);
      } else {
        root.position.y = f.base.y + hop;
        root.rotation.y = f.yaw + Math.sin(t * 0.5 + f.ph) * 0.12;
      }
      const step = Math.sin(phase) * gait;
      head.rotation.set(0.045 * Math.sin(t * 2 + f.ph) - cheer * 0.12, 0.25 * Math.sin(t * 0.87 + f.ph), -step * 0.055);
      root.rotation.z = step * 0.041;
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        legs[i].rotation.x = side * step * 0.57;
        arms[i].rotation.x = -side * step * 0.48 - 0.13 + 0.07 * Math.sin(t * 1.7 + f.ph);
        const wave = Math.sin(phase * 1.47 + i * 0.84);
        arms[i].rotation.z = side * (0.045 + cheer * (1.09 + 0.19 * wave));
        forearms[i].rotation.x = -0.25 - 0.22 * (1 + side * step) - cheer * 0.19;
        forearms[i].rotation.z = side * cheer * (0.72 + 0.38 * wave);
      }
    }
    this.moored.forEach((m, i) => {
      const h = waterAt(m.position.x, m.position.z);
      m.position.y = 0.12 + h;
      m.rotation.x = Math.sin(t * 1.3 + i * 2) * 0.07;
      m.rotation.z = Math.sin(t * 0.9 + i) * 0.04;
    });
  }

  applyLamps(extra: { p: THREE.Vector3; r: number; c: THREE.Vector3 }[], t: number): void {
    const all = [...extra, ...this.lampSpots];
    for (let i = 0; i < G.uLampPos.value.length; i++) {
      const l = all[i];
      if (!l) {
        G.uLampPos.value[i].set(0, -999, 0, 1);
        G.uLampCol.value[i].set(0, 0, 0);
        continue;
      }
      G.uLampPos.value[i].set(l.p.x, l.p.y, l.p.z, l.r);
      const k = 0.92 + Math.sin(t * 7.3 + i * 1.9) * 0.05 + Math.sin(t * 13.1 + i) * 0.03;
      G.uLampCol.value[i].copy(l.c).multiplyScalar(k);
    }
  }
}
