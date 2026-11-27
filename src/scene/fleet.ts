import * as THREE from 'three';
import { Build, hex, matrixOf, type Vec } from './build';
import { clamp, lerp, noise3, smooth } from './space';
import { person } from './village';

/**
 * The story's own models. The three ships of the fleet are one hull with different things bolted onto
 * it, so what each of them does is readable from its outline: a torn sail, trawl booms, yellow drums.
 */

const _c = new THREE.Color();
const CREAM = '#fff6e4';
const ORANGE = '#ff6a1f';
const YELLOW = '#f7c51d';
const BLACK = '#20242c';

/* ================================================================== the striped float */

/** The striped float of the outside trawlers: the clue on the rope, and later the thing to sweep. */
export function striped(b: Build, pos: Vec, r: number): void {
  b.ball(r, { color: ORANGE, pos, seg: 12, gloss: 0.4 });
  const band = (y: number, h: number): void => {
    const at = (q: number): number => Math.sqrt(Math.max(0.02, 1 - q * q)) * r * 1.045;
    b.cyl(at(y + h / 2), at(y - h / 2), h * r, { color: CREAM, pos: [pos[0], pos[1] + y * r, pos[2]], seg: 12, gloss: 0.4, open: true });
  };
  band(0, 0.38);
  band(0.72, 0.26);
  band(-0.72, 0.26);
}

/** One end of a trawl: fat, striped, and flying a pennant so it can be seen from far off. */
export function trawlFloat(): THREE.BufferGeometry {
  const b = new Build(410);
  const rad = [0.66, 1.0, 1.16, 1.16, 1.0, 0.66];
  for (let i = 0; i < 5; i++) {
    b.cyl(rad[i + 1], rad[i], 0.4, { color: i % 2 ? CREAM : ORANGE, pos: [0, -0.62 + i * 0.4 + 0.2, 0], seg: 18, gloss: 0.35 });
  }
  b.ball(0.67, { color: ORANGE, pos: [0, 1.36, 0], scale: [1, 0.34, 1], seg: 14, gloss: 0.35 });
  b.add(new THREE.TorusGeometry(0.28, 0.07, 6, 14), { color: BLACK, pos: [0.62, 1.2, 0], rot: [0.5, 0, 0] });
  b.bar([0, 1.5, 0], [0.06, 3.5, 0], 0.08, 0.06, { color: '#3a2c20' });
  b.quad([0.06, 3.45, 0], [0.05, 2.6, 0], [1.35, 2.86, 0.06], [1.35, 3.2, 0.06], { color: ORANGE });
  b.quad([0.5, 3.36, 0.03], [0.5, 2.7, 0.03], [0.86, 2.77, 0.05], [0.86, 3.29, 0.05], { color: CREAM });
  return b.geo(true);
}

/** The small ones strung along a line. */
export function corkFloat(): THREE.BufferGeometry {
  const b = new Build(411);
  striped(b, [0, 0, 0], 0.5);
  return b.geo(true);
}

/* ================================================================== the shared hull */

interface Paint {
  side: string;
  band: string;
  bottom: string;
  rail: string;
  deck: string;
  rust: number;
}

const L = 6.6;

function sect(t: number): { x: number; w: number; keel: number; gun: number } {
  const u = t * 2 - 1;
  const bow = Math.max(0, u);
  return {
    x: (u * L) / 2 + bow * bow * 0.55,
    w: 1.28 * Math.pow(1 - Math.pow(bow, 2.5), 0.75) * lerp(0.84, 1, smooth(-1, -0.4, u)) + 0.03,
    keel: -0.72 + bow * bow * 0.62,
    gun: 0.86 + bow * bow * 0.95 + Math.pow(Math.max(0, -u), 3) * 0.26,
  };
}

/** Height of the deck boards at `x` along the shared hull, in the ship's own space. */
export function deckAt(x: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (sect(m).x < x) lo = m;
    else hi = m;
  }
  return sect((lo + hi) / 2).gun - 0.3;
}

/** Bow points +X. Everything above the rail is the trade's own. */
function hull(b: Build, o: Paint): void {
  const n = 18;
  const ringAt = (t: number): Vec[] => {
    const p = sect(t);
    const yy = (q: number): number => lerp(p.keel, p.gun, q);
    return [
      [p.x, p.gun, -p.w],
      [p.x, yy(0.6), -p.w * 0.97],
      [p.x, yy(0.28), -p.w * 0.78],
      [p.x, p.keel, 0],
      [p.x, yy(0.28), p.w * 0.78],
      [p.x, yy(0.6), p.w * 0.97],
      [p.x, p.gun, p.w],
    ];
  };
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const A = ringAt(i / n);
    const B = ringAt((i + 1) / n);
    for (let j = 0; j < 6; j++) pos.push(...A[j], ...A[j + 1], ...B[j + 1], ...A[j], ...B[j + 1], ...B[j]);
  }
  const t0 = ringAt(0);
  for (let j = 1; j < 6; j++) pos.push(...t0[0], ...t0[j + 1], ...t0[j]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  const rust = hex('#8a4423');
  b.add(g, {
    color: (p) => {
      const top = 0.86 + Math.pow(Math.max(0, (p.x / L) * 2), 2) * 0.95;
      if (p.y < 0.06) _c.set(o.bottom);
      else if (p.y > top - 0.34) _c.set(o.band);
      else _c.set(o.side);
      const k = noise3(p.x * 1.1, p.y * 0.5, p.z * 1.1) * 0.5 + noise3(p.x * 3.1, p.y * 0.9, p.z) * 0.3;
      return _c.lerp(rust, smooth(0.08, 0.42, k) * o.rust);
    },
    gloss: 0.14,
  });
  const dk: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = sect(i / n);
    const q = sect((i + 1) / n);
    const y0 = p.gun - 0.3;
    const y1 = q.gun - 0.3;
    dk.push(p.x, y0, -p.w * 0.95, p.x, y0, p.w * 0.95, q.x, y1, q.w * 0.95, p.x, y0, -p.w * 0.95, q.x, y1, q.w * 0.95, q.x, y1, -q.w * 0.95);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dk), 3));
  dg.computeVertexNormals();
  b.add(dg, { color: (p) => _c.set(o.deck).multiplyScalar(Math.abs(((p.x * 2.4) % 1) - 0.5) < 0.08 ? 0.72 : 1) });
  for (const s of [-1, 1]) {
    const rail: Vec[] = [];
    for (let i = 0; i <= 12; i++) {
      const p = sect(lerp(0.0, 0.985, i / 12));
      rail.push([p.x, p.gun + 0.02, s * p.w]);
    }
    b.tube(rail, () => 0.1, { color: o.rail, seg: 5, rings: 22 });
  }
  b.box(0.16, 0.22, 2.1, { color: o.rail, pos: [-L / 2 - 0.02, 1.02, 0], r: 0.04 });
}

/** A small wheelhouse aft, with its windows looking over the bow. */
function wheelhouse(b: Build, wall: string, roof: string): void {
  b.box(1.5, 1.35, 1.75, { color: wall, pos: [-1.95, 1.5, 0], r: 0.1, ao: (p) => lerp(0.72, 1, smooth(0.7, 1.6, p.y)) });
  b.box(1.82, 0.18, 2.08, { color: roof, pos: [-1.95, 2.24, 0], r: 0.06 });
  for (const s of [-1, 1]) {
    b.box(0.08, 0.5, 0.62, { color: '#ffd98a', pos: [-1.18, 1.72, s * 0.42], r: 0.03, glow: 0.5 });
    b.box(0.9, 0.42, 0.08, { color: '#1c2c38', pos: [-1.95, 1.74, s * 0.89], r: 0.03, gloss: 0.6 });
  }
}

/* ================================================================== the raider */

/**
 * A dark hull under a torn sail, with grappling poles. Its crew in red headbands, the black flag and the
 * tiller are drawn by `Pirates`, because they move.
 */
export function raider(): THREE.BufferGeometry {
  const b = new Build(420);
  hull(b, { side: '#2c2430', band: '#a8232b', bottom: '#4a1a1a', rail: '#15131a', deck: '#6b4a36', rust: 0.35 });
  // mast and a yard set across the boat at an angle, so the sail reads from any side
  b.bar([0.35, 0.4, 0], [0.45, 6.1, 0], 0.15, 0.1, { color: '#4a3524' });
  const ya = 0.6;
  const dx = Math.cos(ya);
  const dz = Math.sin(ya);
  const yard = (y: number, h: number): [Vec, Vec] => [
    [0.42 - dx * h, y + 0.16, -dz * h],
    [0.42 + dx * h, y - 0.1, dz * h],
  ];
  const top = yard(5.55, 2.6);
  b.bar(top[0], top[1], 0.1, 0.1, { color: '#4a3524' });
  const N = 11;
  const M = 8;
  // where the cloth has gone
  const gone = new Set(['2,3', '3,3', '3,4', '7,2', '8,2', '7,5', '8,6', '0,7', '1,7', '4,7', '5,7', '10,6', '10,7', '9,7', '0,6', '6,7']);
  const ragged = (i: number): number => Math.sin(i * 5.3) * 0.34 + Math.sin(i * 2.1) * 0.22;
  const P = (i: number, j: number): Vec => {
    const u = (i / N) * 2 - 1;
    const v = j / M;
    const half = lerp(2.55, 2.1, v);
    const y = lerp(5.5, 1.75, v) - u * 0.13 + (j === M ? ragged(i) : 0);
    const belly = Math.sin((u * 0.5 + 0.5) * Math.PI) * Math.sin(Math.min(1, v * 1.05) * Math.PI * 0.86) * 0.85;
    return [0.42 + dx * half * u - dz * belly, y, dz * half * u + dx * belly];
  };
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      if (gone.has(`${i},${j}`)) continue;
      const patch = (i === 5 && j === 4) || (i === 2 && j === 6) || (i === 9 && j === 3);
      const col = patch ? '#c9b48a' : j % 3 === 1 ? '#5a1620' : '#a5202b';
      b.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), { color: col });
    }
  }
  // loose ends
  for (const [i, j] of [[3, 4], [8, 6], [5, 8], [10, 5]] as const) {
    const a = P(i, j);
    b.quad(a, [a[0] - 0.1, a[1] - 0.95, a[2] + 0.18], [a[0] + 0.1, a[1] - 0.82, a[2] + 0.2], [a[0] + 0.22, a[1], a[2]], { color: '#a5202b' });
  }
  for (const s of [-1, 1]) b.bar([0.4, 5.9, 0], [-2.6, 1.0, s * 1.1], 0.035, 0.035, { color: '#20181c' });
  b.bar([0.45, 5.9, 0], [3.5, 1.75, 0], 0.035, 0.035, { color: '#20181c' });
  // grappling poles and their hooks
  for (const s of [-1, 1]) {
    b.bar([1.2, 1.1, s * 0.9], [4.5, 2.2, s * 0.5], 0.08, 0.06, { color: '#7a5a3a' });
    b.add(new THREE.TorusGeometry(0.32, 0.08, 6, 12, 3.8), { color: '#8f98a2', pos: [4.6, 2.1, s * 0.5], rot: [0, 0, 1.2], gloss: 0.7 });
  }
  b.box(0.9, 0.6, 0.8, { color: '#5a4030', pos: [-0.6, 0.9, -0.5], rot: [0, 0.3, 0], r: 0.05 });
  return b.geo(true);
}

/* ================================================================== the trawl ship */

/** Wide booms over both sides, a net drum aft, and the same striped floats in rows along its rails. */
export function trawlShip(): THREE.BufferGeometry {
  const b = new Build(430);
  hull(b, { side: '#1d5684', band: '#f2efe4', bottom: '#8a2f22', rail: '#143a58', deck: '#9a7a58', rust: 0.55 });
  wheelhouse(b, '#efe9da', '#c8452f');
  // booms, wide enough that the outline alone says trawler
  for (const s of [-1, 1]) {
    b.bar([0.5, 0.9, s * 0.9], [0.9, 3.1, s * 4.6], 0.15, 0.1, { color: '#e8a52a' });
    b.bar([0.2, 4.6, 0], [0.9, 3.1, s * 4.6], 0.045, 0.045, { color: '#2a2018' });
    b.bar([0.9, 3.1, s * 4.6], [0.4, 0.0, s * 4.8], 0.05, 0.05, { color: '#2a2018' });
    b.box(1.1, 0.75, 0.2, { color: '#7a4a2c', pos: [0.4, 0.05, s * 4.8], rot: [0, s * 0.25, 0], r: 0.05 });
    // the net hanging off the boom
    for (let k = 0; k < 6; k++) {
      const t = k / 5;
      const z = s * lerp(1.5, 4.5, t);
      const y = lerp(1.35, 3.0, t);
      b.bar([0.6 + t * 0.25, y, z], [0.15 + t * 0.1, Math.max(0.1, y - 1.7), z], 0.055, 0.04, { color: '#2fae74' });
    }
    for (const q of [0.5, 1.0]) {
      const pts: Vec[] = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        const y = lerp(1.35, 3.0, t);
        pts.push([0.55 + t * 0.2 - q * 0.3, Math.max(0.12, y - 1.7 * q), s * lerp(1.5, 4.5, t)]);
      }
      b.tube(pts, () => 0.05, { color: '#2fae74', seg: 4, rings: 10 });
    }
    // spare floats along the rail
    for (let k = 0; k < 5; k++) {
      const p = sect(0.2 + k * 0.11);
      striped(b, [p.x, p.gun + 0.34, s * (p.w + 0.1)], 0.34);
    }
  }
  b.bar([0.2, 0.6, 0], [0.2, 5.0, 0], 0.15, 0.1, { color: '#e8a52a' });
  b.ball(0.2, { color: '#ff5a3a', pos: [0.2, 5.1, 0], seg: 8, glow: 0.9 });
  // gantry and net drum aft
  for (const s of [-1, 1]) b.bar([-2.9, 0.9, s * 1.0], [-3.4, 3.3, s * 0.8], 0.14, 0.12, { color: '#e8a52a' });
  b.bar([-3.4, 3.3, -0.9], [-3.4, 3.3, 0.9], 0.14, 0.14, { color: '#e8a52a' });
  b.cyl(0.55, 0.55, 1.5, { color: '#2f8f66', pos: [-3.0, 1.45, 0], rot: [Math.PI / 2, 0, 0], seg: 12 });
  for (const s of [-1, 1]) b.cyl(0.7, 0.7, 0.1, { color: '#8a6a2a', pos: [-3.0, 1.45, s * 0.76], rot: [Math.PI / 2, 0, 0], seg: 14 });
  b.merge(person({ shirt: '#f2a03a', sarong: '#2f4f7a', hat: 'none', scale: 0.84 }), matrixOf([1.9, 0.6, 0.2], [0, 1.8, 0]));
  return b.geo(true);
}

/* ================================================================== the drum carrier */

/** Where the derrick's hook hangs, in the ship's own space. */
export const DERRICK: Vec = [4.7, 3.2, 0];

/** A drum standing on end. */
function yellowDrum(b: Build, x: number, y: number, z: number, s = 1): void {
  b.cyl(0.5 * s, 0.5 * s, 1.18 * s, { color: YELLOW, pos: [x, y + 0.59 * s, z], seg: 14, gloss: 0.35 });
  b.cyl(0.515 * s, 0.515 * s, 0.3 * s, { color: BLACK, pos: [x, y + 0.59 * s, z], seg: 14 });
  for (const k of [0.03, 1.15]) b.cyl(0.54 * s, 0.54 * s, 0.09 * s, { color: '#b8891a', pos: [x, y + k * s, z], seg: 14 });
  b.cyl(0.4 * s, 0.4 * s, 0.03, { color: '#e0b01a', pos: [x, y + 1.2 * s, z], seg: 12 });
}

/** Yellow drums two deep on a grubby hull, a derrick over the bow, and a funnel that smokes. */
export function drumShip(): THREE.BufferGeometry {
  const b = new Build(440);
  hull(b, { side: '#3d4a3c', band: '#c9a51c', bottom: '#3a1f1a', rail: '#232a26', deck: '#5f5a48', rust: 0.8 });
  wheelhouse(b, '#8d8c74', '#34352c');
  // hazard chevrons on the wheelhouse front
  for (let i = 0; i < 5; i++) b.box(0.07, 0.34, 0.2, { color: i % 2 ? BLACK : YELLOW, pos: [-1.17, 1.12, -0.64 + i * 0.32], rot: [0.5, 0, 0], r: 0.01 });
  b.cyl(0.34, 0.42, 1.25, { color: '#1c2026', pos: [-2.6, 2.9, 0], seg: 12 });
  b.cyl(0.37, 0.37, 0.28, { color: YELLOW, pos: [-2.6, 3.15, 0], seg: 12 });
  for (const [x, z] of [
    [-0.55, -0.55],
    [-0.55, 0.55],
    [0.55, -0.55],
    [0.55, 0.55],
    [1.65, -0.42],
    [1.65, 0.48],
  ] as const)
    yellowDrum(b, x, 0.58, z);
  for (const [x, z] of [
    [0, -0.5],
    [0.05, 0.52],
    [1.1, 0.02],
  ] as const)
    yellowDrum(b, x, 1.76, z);
  // derrick over the bow
  b.bar([2.35, 0.8, 0], [2.35, 4.3, 0], 0.15, 0.12, { color: '#d8862a' });
  b.bar([2.35, 2.2, 0], [DERRICK[0], DERRICK[1] + 0.9, 0], 0.13, 0.09, { color: '#d8862a' });
  b.bar([2.35, 4.25, 0], [DERRICK[0], DERRICK[1] + 0.9, 0], 0.045, 0.045, { color: '#2a2018' });
  b.bar([DERRICK[0], DERRICK[1] + 0.9, 0], [DERRICK[0], DERRICK[1] + 0.2, 0], 0.04, 0.04, { color: '#2a2018' });
  b.merge(person({ shirt: '#6a705a', sarong: '#34352c', hat: 'none', scale: 0.84 }), matrixOf([2.9, 0.75, -0.6], [0, 1.5, 0]));
  return b.geo(true);
}

/** A drum in the water, lying on its side. */
export function drum(): THREE.BufferGeometry {
  const b = new Build(445);
  const lay: Vec = [0, 0, Math.PI / 2];
  b.cyl(0.82, 0.82, 2.0, { color: YELLOW, rot: lay, seg: 16, gloss: 0.4 });
  b.cyl(0.84, 0.84, 0.5, { color: BLACK, rot: lay, seg: 16, gloss: 0.3 });
  for (const x of [-0.98, 0.98]) b.cyl(0.88, 0.88, 0.13, { color: '#b8891a', pos: [x, 0, 0], rot: lay, seg: 16 });
  for (const x of [-0.62, 0.62]) b.cyl(0.86, 0.86, 0.08, { color: '#d8a51a', pos: [x, 0, 0], rot: lay, seg: 16 });
  b.cyl(0.62, 0.62, 0.05, { color: '#3a2a20', pos: [1.04, 0, 0], rot: lay, seg: 14 });
  // a warning diamond, up where the play camera sees it
  b.box(0.5, 0.06, 0.5, { color: '#ff5a3a', pos: [0, 0.83, 0], rot: [0, Math.PI / 4, 0], r: 0.02, glow: 0.3 });
  return b.geo(true);
}

/* ================================================================== things in the bay */

/** An open-ended wrench lying flat, opening at both ends. About 1.8 long before `m`. */
function wrench(b: Build, m: THREE.Matrix4, col: string): void {
  b.add(new THREE.BoxGeometry(0.95, 0.1, 0.24), { color: col, matrix: m });
  for (const s of [-1, 1]) {
    const g = new THREE.TorusGeometry(0.29, 0.11, 5, 14, 4.3);
    // turn the gap of the ring to face away from the handle, then lay it down
    g.rotateZ((s > 0 ? 0 : Math.PI) - (4.3 + Math.PI * 2) / 2);
    g.rotateX(Math.PI / 2);
    g.scale(1, 0.55, 1);
    g.translate(s * 0.66, 0, 0);
    b.add(g, { color: col, matrix: m });
  }
}

/** Bu Sari's tool chest: red, strapped in brass, with a wrench on the lid and on the front. */
export function toolbox(): THREE.BufferGeometry {
  const b = new Build(450);
  b.box(2.9, 1.35, 1.9, { color: '#c8302a', top: '#e8503a', pos: [0, 0.3, 0], r: 0.16, gloss: 0.3 });
  b.box(3.04, 0.42, 2.04, { color: '#a8231f', pos: [0, 1.12, 0], r: 0.14, gloss: 0.3 });
  for (const x of [-1.12, 1.12]) {
    b.box(0.24, 1.46, 1.98, { color: '#f2c14a', pos: [x, 0.32, 0], r: 0.04, gloss: 0.5 });
    b.box(0.26, 0.48, 2.12, { color: '#f2c14a', pos: [x, 1.13, 0], r: 0.04, gloss: 0.5 });
  }
  b.box(0.4, 0.42, 0.12, { color: '#f7d878', pos: [0, 0.92, 1.0], r: 0.04, gloss: 0.6 });
  for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.3, 0.07, 6, 12), { color: '#7a5a2a', pos: [s * 1.56, 0.5, 0], rot: [0, Math.PI / 2, 0] });
  wrench(b, matrixOf([0, 1.38, 0], [0, 0.5, 0], 1.05), '#ffffff');
  wrench(b, matrixOf([0, 0.2, 0.98], [Math.PI / 2, 0, 0.0], [0.86, 1, 0.8]), '#ffffff');
  return b.geo(true);
}

/** Fish for the village, heaped in a basket with two handles. */
export function fishBasket(): THREE.BufferGeometry {
  const b = new Build(455);
  b.cyl(0.92, 0.7, 0.95, { color: (p) => _c.set('#d8a552').multiplyScalar(Math.abs(((p.y * 5) % 1) - 0.5) < 0.2 ? 0.8 : 1), pos: [0, 0.48, 0], seg: 16, hseg: 5 });
  b.add(new THREE.TorusGeometry(0.93, 0.12, 6, 18), { color: '#a8742f', pos: [0, 0.96, 0], rot: [Math.PI / 2, 0, 0] });
  for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.26, 0.07, 5, 10, Math.PI), { color: '#a8742f', pos: [s * 0.95, 0.98, 0], rot: [0, Math.PI / 2, 0] });
  const r = b.r;
  for (let i = 0; i < 13; i++) {
    const a = i * 2.4;
    const d = Math.sqrt(i / 13) * 0.66;
    b.ball(0.26, { color: i % 3 === 0 ? '#ff9a5a' : i % 3 === 1 ? '#a9d4ea' : '#7fb4d4', pos: [Math.cos(a) * d, 1.04 + (0.7 - d) * 0.32 + r() * 0.06, Math.sin(a) * d], scale: [1.75, 0.62, 0.62], rot: [0, r() * 6, (r() - 0.5) * 0.7], seg: 8, gloss: 0.5 });
  }
  return b.geo(true);
}

/** The tidal coil for the workshop: copper wound on a spool. */
export function tideCoil(): THREE.BufferGeometry {
  const b = new Build(458);
  const lay: Vec = [Math.PI / 2, 0, 0];
  for (let i = 0; i < 6; i++) b.add(new THREE.TorusGeometry(0.62, 0.14, 7, 20), { color: i % 2 ? '#d8772a' : '#f0a04a', pos: [0, 0.86, -0.4 + i * 0.16], gloss: 0.7 });
  for (const s of [-1, 1]) {
    b.cyl(0.9, 0.9, 0.14, { color: '#7a5233', pos: [0, 0.86, s * 0.58], rot: lay, seg: 18 });
    b.cyl(0.24, 0.24, 0.2, { color: '#2f8fc0', pos: [0, 0.86, s * 0.62], rot: lay, seg: 10, gloss: 0.5 });
  }
  return b.geo(true);
}

/** The absorbent pad: white quilted rolls lashed into a raft. */
export function pad(): THREE.BufferGeometry {
  const b = new Build(460);
  for (let i = 0; i < 5; i++) {
    const z = -1.12 + i * 0.56;
    b.add(new THREE.CapsuleGeometry(0.34, 2.1, 4, 10), { color: i % 2 ? '#f4f7f6' : '#ffffff', pos: [0, 0.18, z], rot: [0, 0, Math.PI / 2], gloss: 0.1 });
  }
  for (const x of [-0.74, 0.74]) b.box(0.22, 0.1, 2.95, { color: '#2f8fc0', pos: [x, 0.54, 0], r: 0.03 });
  for (const [x, z] of [
    [-1.3, -1.2],
    [1.3, -1.2],
    [-1.3, 1.2],
    [1.3, 1.2],
  ] as const)
    b.ball(0.16, { color: '#ffb02a', pos: [x, 0.4, z], seg: 7 });
  return b.geo(true);
}

/** An old deposit the fishers have marked: black sludge at the tide line with a red flag in it. */
export function deposit(): THREE.BufferGeometry {
  const b = new Build(465);
  const r = b.r;
  b.ball(1.5, { color: (p) => _c.set('#241d1c').lerp(hex('#57463a'), smooth(0.0, 0.5, p.y + noise3(p.x * 2, 0, p.z * 2) * 0.2)), scale: [1.35, 0.36, 1.05], seg: 16, rough: 0.14, gloss: 0.5 });
  b.ball(0.7, { color: '#2c2422', pos: [1.2, 0.0, 0.7], scale: [1.2, 0.4, 1], seg: 10, rough: 0.1, gloss: 0.5 });
  b.ball(0.6, { color: '#33291f', pos: [-1.3, 0.0, -0.6], scale: [1.2, 0.4, 1], seg: 10, rough: 0.1, gloss: 0.5 });
  b.add(new THREE.TorusGeometry(0.5, 0.2, 7, 14), { color: '#15161a', pos: [0.7, 0.42, -0.4], rot: [1.2, 0.2, 0] });
  b.cyl(0.16, 0.16, 0.7, { color: '#8fb8c8', pos: [-0.5, 0.5, 0.4], rot: [0.3, 0.4, 1.2], seg: 8, gloss: 0.6 });
  b.ball(0.36, { color: '#e8e2d2', pos: [-0.1, 0.5, -0.6], scale: [1.2, 0.6, 1], seg: 8, rough: 0.12 });
  for (let i = 0; i < 4; i++) b.box(0.5, 0.06, 0.16, { color: i % 2 ? '#c8452f' : '#5fb0d8', pos: [(r() - 0.5) * 2, 0.46, (r() - 0.5) * 1.2], rot: [r(), r() * 6, r()], r: 0.02 });
  b.bar([0.1, 0.2, 0.1], [0.2, 3.1, 0.1], 0.08, 0.06, { color: '#d6ad55' });
  b.quad([0.2, 3.05, 0.1], [0.18, 2.15, 0.1], [1.45, 2.45, 0.16], [1.45, 2.75, 0.16], { color: '#ff3f2f' });
  return b.geo(true);
}

/** A villager on night watch, with a lantern on a pole. */
export function guard(): THREE.BufferGeometry {
  const b = new Build(470);
  b.merge(person({ shirt: '#2f6f9c', sarong: '#7a4fb0', hat: 'caping', scale: 1.08 }));
  b.bar([0.56, 0, 0.2], [0.6, 2.9, 0.24], 0.06, 0.05, { color: '#8c6a3a' });
  b.bar([0.6, 2.8, 0.24], [0.6, 2.7, 0.62], 0.04, 0.03, { color: '#8c6a3a' });
  b.cyl(0.15, 0.18, 0.32, { color: '#ffd480', pos: [0.6, 2.44, 0.62], seg: 8, glow: 1 });
  b.cyl(0.05, 0.2, 0.12, { color: '#3a2c20', pos: [0.6, 2.66, 0.62], seg: 8 });
  return b.geo(true);
}

/** A little fish of the spawning ground, nose at +X. */
export function smallFish(): THREE.BufferGeometry {
  const b = new Build(475);
  b.ball(0.5, {
    color: (p) => _c.set('#8fe0f2').lerp(hex('#fff6d8'), smooth(0.05, -0.18, p.y)).lerp(hex('#2f9fc8'), smooth(0.12, 0.24, p.y)),
    scale: [1, 0.44, 0.28],
    seg: 8,
    gloss: 0.5,
  });
  b.quad([-0.42, 0, 0], [-0.9, 0.3, 0], [-0.76, 0, 0], [-0.9, -0.3, 0], { color: '#ffd24a', sway: 1 });
  return b.geo();
}

/* ================================================================== what stands there all the time */

/** The mooring off the pier: three piles and a beam, with old rope round them. Built round the origin. */
export function mooring(b: Build, x: number, z: number, bed: number): void {
  const pile = (dx: number, dz: number, top: number): void => {
    b.bar([x + dx, bed - 0.4, z + dz], [x + dx * 0.9, top, z + dz * 0.9], 0.3, 0.24, {
      color: (p) => _c.set('#8a5f3d').lerp(hex('#3f3226'), smooth(0.5, -0.1, p.y)).lerp(hex('#e8e0d0'), p.y > top - 0.3 ? 0.9 : 0),
      seg: 9,
    });
  };
  pile(-1.7, -1.5, 2.5);
  pile(1.8, -1.6, 2.8);
  pile(0.1, -2.3, 2.1);
  b.bar([x - 1.8, 1.55, z - 1.45], [x + 1.9, 1.7, z - 1.5], 0.17, 0.17, { color: '#a9764a' });
  for (const [dx, y] of [
    [-1.58, 1.5],
    [1.66, 1.72],
  ] as const)
    for (let k = 0; k < 3; k++) b.add(new THREE.TorusGeometry(0.33, 0.07, 5, 12), { color: '#e3cf9a', pos: [x + dx, y - 0.16 + k * 0.14, z - 1.46], rot: [Math.PI / 2, 0, 0] });
  b.ball(0.22, { color: '#f2c14a', pos: [x + 1.62, 2.95, z - 1.44], seg: 9, gloss: 0.4 });
}

/** The beacon off the pier head: a little lighthouse on piles. Returns where its lamp is. */
export function beacon(b: Build, x: number, z: number, bed: number): THREE.Vector3 {
  for (const [dx, dz] of [
    [-0.8, -0.8],
    [0.8, -0.8],
    [-0.8, 0.8],
    [0.8, 0.8],
  ] as const)
    b.bar([x + dx * 1.15, bed - 0.4, z + dz * 1.15], [x + dx, 1.15, z + dz], 0.2, 0.17, { color: (p) => _c.set('#8a5f3d').lerp(hex('#3f3226'), smooth(0.5, -0.1, p.y)), seg: 8 });
  b.cyl(1.35, 1.35, 0.2, { color: '#a9764a', pos: [x, 1.2, z], seg: 14 });
  const bands = ['#fbf6ea', '#d8342c', '#fbf6ea', '#d8342c', '#fbf6ea'];
  for (let i = 0; i < 5; i++) b.cyl(lerp(0.92, 0.66, (i + 1) / 5), lerp(0.92, 0.66, i / 5), 0.72, { color: bands[i], pos: [x, 1.3 + 0.36 + i * 0.72, z], seg: 16 });
  b.box(0.42, 0.8, 0.1, { color: '#5a3d26', pos: [x, 1.72, z + 0.88], r: 0.04 });
  const top = 1.3 + 5 * 0.72;
  b.cyl(0.98, 0.9, 0.16, { color: '#34404c', pos: [x, top + 0.06, z], seg: 16 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.283;
    b.bar([x + Math.cos(a) * 0.9, top + 0.1, z + Math.sin(a) * 0.9], [x + Math.cos(a) * 0.9, top + 0.5, z + Math.sin(a) * 0.9], 0.03, 0.03, { color: '#34404c', seg: 4 });
  }
  b.add(new THREE.TorusGeometry(0.9, 0.04, 4, 20), { color: '#34404c', pos: [x, top + 0.5, z], rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.283;
    b.bar([x + Math.cos(a) * 0.5, top + 0.1, z + Math.sin(a) * 0.5], [x + Math.cos(a) * 0.5, top + 1.1, z + Math.sin(a) * 0.5], 0.045, 0.045, { color: '#34404c', seg: 5 });
  }
  b.cyl(0.1, 0.86, 0.6, { color: '#d8342c', pos: [x, top + 1.4, z], seg: 14 });
  b.ball(0.13, { color: '#f2c14a', pos: [x, top + 1.76, z], seg: 8 });
  return new THREE.Vector3(x, top + 0.58, z);
}

/** The lamp in it, which is all that changes when it is lit. */
export function beaconLamp(): THREE.BufferGeometry {
  const b = new Build(480);
  b.ball(0.4, { color: '#fff0b8', scale: [1, 1.25, 1], seg: 12, glow: 1 });
  return b.geo();
}

/** How far up a thing in the air is, for a throw that lasts `u` 0..1. */
export const arc = (u: number, top: number): number => top * 4 * clamp(u, 0, 1) * (1 - clamp(u, 0, 1));
