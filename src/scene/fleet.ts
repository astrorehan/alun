import * as THREE from 'three';
import { Build, hex, matrixOf, type Vec } from './build';
import { clamp, lerp, noise3, smooth } from './space';
import { person } from './village';

/** The story's ships and their gear, with silhouettes built to read from the play camera. */

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
const STANDARD_HULL: Vec = [1, 1, 1];

function sect(t: number, [length, beam, height]: Vec = STANDARD_HULL): { x: number; w: number; keel: number; gun: number } {
  const u = t * 2 - 1;
  const bow = Math.max(0, u);
  return {
    x: ((u * L) / 2 + bow * bow * 0.55) * length,
    w: (1.28 * Math.pow(1 - Math.pow(bow, 2.5), 0.75) * lerp(0.84, 1, smooth(-1, -0.4, u)) + 0.03) * beam,
    keel: (-0.72 + bow * bow * 0.62) * height,
    gun: (0.86 + bow * bow * 0.95 + Math.pow(Math.max(0, -u), 3) * 0.26) * height,
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
function hull(b: Build, o: Paint, shape = STANDARD_HULL): void {
  const [length, beam, height] = shape;
  const n = 18;
  const ringAt = (t: number): Vec[] => {
    const p = sect(t, shape);
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
      const top = (0.86 + Math.pow(Math.max(0, (p.x / (L * length)) * 2), 2) * 0.95) * height;
      if (p.y < 0.06) _c.set(o.bottom);
      else if (p.y > top - 0.34 * height) _c.set(o.band);
      else _c.set(o.side);
      const k = noise3(p.x * 1.1, p.y * 0.5, p.z * 1.1) * 0.5 + noise3(p.x * 3.1, p.y * 0.9, p.z) * 0.3;
      return _c.lerp(rust, smooth(0.08, 0.42, k) * o.rust);
    },
    gloss: 0.14,
  });
  const planks = shape === STANDARD_HULL ? [-0.95, 0.95] : [-0.95, -0.69, -0.33, -0.02, 0.25, 0.60, 0.95];
  for (let j = 0; j < planks.length - 1; j++) {
    const left = planks[j];
    const right = planks[j + 1];
    const dk: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = sect(i / n, shape);
      const q = sect((i + 1) / n, shape);
      const y0 = p.gun - 0.3 * height;
      const y1 = q.gun - 0.3 * height;
      dk.push(p.x, y0, p.w * left, p.x, y0, p.w * right, q.x, y1, q.w * right,
        p.x, y0, p.w * left, q.x, y1, q.w * right, q.x, y1, q.w * left);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dk), 3));
    dg.computeVertexNormals();
    b.add(dg, {
      color: (p) => {
        const seam = Math.abs(((p.x * 2.4) % 1) - 0.5) < 0.08;
        const plank = 0.88 + (j % 2) * 0.19 + noise3(p.x * 0.7, j, 0) * 0.12;
        return _c.set(o.deck).multiplyScalar(planks.length === 2 ? 1 - Number(seam) * 0.28 : plank);
      },
    });
  }
  for (const s of [-1, 1]) {
    const rail: Vec[] = [];
    for (let i = 0; i <= 12; i++) {
      const p = sect(lerp(0.0, 0.985, i / 12), shape);
      rail.push([p.x, p.gun + 0.02, s * p.w]);
    }
    b.tube(rail, () => 0.1 * Math.min(1, height), { color: o.rail, seg: 5, rings: 22 });
  }
  b.box(0.16, 0.22 * height, 2.1 * beam, { color: o.rail, pos: [(-L / 2 - 0.02) * length, 1.02 * height, 0], r: 0.04 });
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

/* ================================================================== pirate boats */

/** A low, narrow boat. The outrigger and exposed motor keep the profile clear of sails. */
export function skiff(): THREE.BufferGeometry {
  const b = new Build(421);
  hull(b, { side: '#d45522', band: '#fff0c9', bottom: '#502a24', rail: '#d39244', deck: '#aa7843', rust: 0.38 }, [1, 0.55, 0.52]);
  // Baskets of coiled line under a short suncloth, lashed to a pair of bent hoops.
  const hood = (u: number, v: number): Vec => [
    0.12 + 1.55 * u + 0.12 * v,
    1.13 + 0.53 * (1 - v * v) + 0.15 * u - 0.11 * Math.sin(Math.PI * u),
    v * (0.76 - 0.12 * u),
  ];
  for (const u of [0, 1]) {
    const hoop: Vec[] = [hood(u, -1), hood(u, 0), hood(u, 1)];
    b.tube(hoop, () => 0.046, { color: '#70593b', seg: 5, rings: 6 });
    for (const v of [-1, 1]) {
      const top = hood(u, v);
      b.bar([top[0] - 0.14, 0.42, top[2]], top, 0.046, 0.04, { color: '#977448' });
    }
  }
  for (let j = 0; j < 6; j++) {
    const v = j / 3 - 1;
    b.quad(hood(0,v), hood(0,v+1/3), hood(0.55,v+1/3), hood(0.55,v), { color: '#566d69' });
    b.quad(hood(0.55,v), hood(0.55,v+1/3), hood(1,v+1/3), hood(1,v), { color: '#78887b' });
  }
  b.cyl(0.34, 0.27, 0.36, { color: '#c49452', pos: [0.92, 0.54, 0.06], seg: 10 });
  b.add(new THREE.TorusGeometry(0.28, 0.07, 5, 11), { color: '#dfd0a4', pos: [0.92, 0.72, 0.06], rot: [Math.PI / 2, 0.14, 0] });
  const float: Vec[] = [[-2.78, 0.28, -2.08], [-2.0, 0.08, -2.16], [0.4, 0.06, -2.17], [2.15, 0.12, -2.14], [2.88, 0.48, -2.03]];
  b.tube(float, (t) => 0.08 + 0.19 * Math.pow(Math.sin(Math.PI * t), 0.4), { color: '#e6a746', top: '#f6d18a', seg: 7, rings: 14 });
  for (const x of [-1.56, 1.42]) {
    b.bar([x, 0.44, 0.55], [x - 0.09, 0.32, -2.18], 0.10, 0.08, { color: '#a8763f' });
    for (const dx of [-0.10, 0.11]) {
      b.bar([x + dx, 0.31, -2.13], [x + dx, 0.06, -2.17], 0.07, 0.07, { color: '#50352b', seg: 5 });
    }
  }
  for (const x of [-1.72, 1.75]) {
    b.box(0.45, 0.14, 1.14, { color: '#e8ba72', pos: [x, 0.41, 0], r: 0.02 });
  }
  b.merge(person({ shirt: '#96503b', sarong: '#39383d', hat: 'caping', scale: 0.74 }), matrixOf([-0.92, 0.24, 0.12], [0, 1.35, 0]));
  b.bar([-1.2, 0.73, 0.37], [-3.58, 0.86, 0.26], 0.06, 0.10, { color: BLACK });
  b.box(0.72, 0.8, 0.64, { color: '#273c42', top: '#58686a', pos: [-3.57, 0.58, 0], rot: [0, 0, -0.1], r: 0.12 });
  b.box(0.74, 0.27, 0.66, { color: '#f3ddae', pos: [-3.62, 0.93, 0], rot: [0, 0, -0.1], r: 0.08 });
  b.box(0.75, 0.09, 0.67, { color: '#d65d32', pos: [-3.60, 0.77, 0], r: 0.02 });
  b.bar([-3.66, 0.35, 0], [-3.88, -0.55, 0], 0.13, 0.08, { color: '#343c42' });
  b.cyl(0.15, 0.15, 0.26, { color: '#746450', pos: [-3.97, -0.54, 0], rot: [0, 0, Math.PI / 2], seg: 8 });
  b.box(0.47, 0.37, 0.48, { color: '#a84232', pos: [-2.48, 0.44, -0.12], rot: [0, -0.19, 0], r: 0.06 });
  b.bar([-2.58, 0.67, -0.14], [-2.38, 0.67, -0.16], 0.038, 0.038, { color: '#e4ab75' });
  return b.geo(true);
}

/** Multiple cloth panels curve between the wood battens of a lug sail. */
function lugSail(b: Build, x: number, height: number, width: number): void {
  const wood = '#513044';
  const n = 5;
  const point = (u: number, v: number): Vec => {
    const billow = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.85;
    return [x + (u - 0.5) * width * lerp(0.82, 1, v) - v * 0.32, lerp(height, 1.5, v) - (u - 0.5) * (0.92 - v * 0.8), (u - 0.5) * width * 0.32 + billow];
  };
  const canvas = ['#af7190', '#dca681', '#956080', '#bd848f', '#704666'];
  b.bar([x, 0.72, 0], [x + 0.22, height + 0.33, 0], 0.15, 0.095, { color: wood });
  for (let j = 0; j < canvas.length; j++) {
    const top = j / canvas.length;
    const bottom = (j + 1) / canvas.length;
    for (let i = 0; i < n; i++) {
      const a = i / n;
      const d = (i + 1) / n;
      b.quad(point(a, top), point(a, bottom), point(d, bottom), point(d, top), { color: canvas[j], glow: j === 1 ? 0.09 : 0, vary: 0.045 });
    }
    b.bar(point(0, top), point(1, top), 0.055, 0.055, { color: wood, seg: 5 });
  }
  b.bar([x + 0.22, height + 0.24, 0], [x - width * 0.48, 0.93, -0.8], 0.035, 0.035, { color: '#372733' });
}

/** The heavy raider rides high on plated flanks, with twin lugs over a metal ram. */
export function heavyRaider(): THREE.BufferGeometry {
  const b = new Build(422);
  const shape: Vec = [1.04, 1.28, 1.02];
  hull(b, { side: '#382c48', band: '#7c4e69', bottom: '#282630', rail: '#b28976', deck: '#805344', rust: 0.35 }, shape);
  const edge = '#b99182';
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const p = sect(0.045 + i * 0.145, shape);
      const q = sect(0.174 + i * 0.145, shape);
      const a: Vec = [p.x, p.gun + 0.10, s * (p.w + 0.13)];
      const d: Vec = [q.x, q.gun + 0.10, s * (q.w + 0.13)];
      b.quad(a, [p.x + 0.12, 0.07, s * p.w * 0.91], [q.x - 0.06, 0.12, s * q.w * 0.91], d, {
        color: i % 2 ? '#715575' : '#594760', gloss: 0.38,
      });
      b.bar(a, d, 0.065, 0.055, { color: edge, seg: 5 });
      b.cyl(0.09, 0.09, 0.07, { color: '#dfb090', pos: [lerp(p.x, q.x, 0.48), lerp(p.gun, q.gun, 0.48) - 0.12, s * lerp(p.w + 0.17, q.w + 0.17, 0.48)], rot: [Math.PI / 2, 0, 0], seg: 6 });
    }
    const root: Vec = [2.92, 1.09, s * 0.80];
    const tip: Vec = [5.33, 0.82, s * 0.10];
    b.quad(root, [3.10, 0.14, s * 0.63], [4.84, 0.39, s * 0.09], tip, { color: '#a76652', top: '#e9af83', gloss: 0.45 });
    b.quad(root, tip, [5.33, 0.82, 0], [3.20, 1.45, 0], { color: '#dbaf8b', gloss: 0.48 });
  }
  lugSail(b, 1.0, 5.38, 2.8);
  lugSail(b, -1.86, 4.2, 2.0);
  b.add(new THREE.TorusGeometry(0.43, 0.10, 5, 13), { color: '#9a7157', pos: [2.39, 0.9, -0.32], rot: [Math.PI / 2, 0.10, 0] });
  b.merge(person({ shirt: '#783f45', sarong: '#302639', hat: 'peci', scale: 0.82 }), matrixOf([-0.45, 0.65, -1.00], [0, 1.24, 0]));
  return b.geo(true);
}

/** Riveted plates form a wide, sloping shield that wraps around the bow. */
export function shieldShip(): THREE.BufferGeometry {
  const b = new Build(423);
  hull(b, { side: '#294b51', band: '#598083', bottom: '#312d33', rail: '#a4795b', deck: '#8d7050', rust: 0.42 }, [0.96, 1.18, 0.82]);
  const edge = '#aa714e';
  const plate = (a: number, v: number): Vec => {
    const c = Math.cos(a);
    return [2.14 + (2.32 - v * 0.79) * c, lerp(0.46 + c * 0.20, 2.05 + c * 0.81, v), Math.sin(a) * (1.47 + v * 0.52)];
  };
  const crown: Vec[] = [];
  const foot: Vec[] = [];
  const panels = 8;
  for (let i = 0; i <= panels; i++) {
    const a = lerp(-1.57, 1.57, i / panels);
    crown.push(plate(a, 1));
    foot.push(plate(a, 0));
    if (i === panels) break;
    const next = lerp(-1.57, 1.57, (i + 1) / panels);
    b.quad(plate(a, 0), plate(a, 0.62), plate(next, 0.62), plate(next, 0), {
      color: i % 2 ? '#bd8157' : '#b36b4c', gloss: 0.28,
    });
    b.quad(plate(a, 0.62), plate(a, 1), plate(next, 1), plate(next, 0.62), {
      color: i % 2 ? '#f2dbab' : '#dec292', gloss: 0.34, glow: 0.07,
    });
    b.bar(foot[i], crown[i], 0.055, 0.043, { color: edge, seg: 5 });
    const [x, y, z] = plate((a + next) / 2, 0.8);
    b.ball(0.092, { color: '#805337', pos: [x + Math.cos(a) * 0.07, y, z + Math.sin(a) * 0.07], seg: 6 });
  }
  b.tube(crown, () => 0.10, { color: edge, top: '#d99e6c', seg: 6, rings: 12 });
  b.tube(foot, () => 0.13, { color: '#64483b', seg: 5, rings: 12 });
  b.ball(0.47, { color: '#dba669', pos: [4.03, 1.87, 0], scale: [0.43, 1.02, 1.13], seg: 10, gloss: 0.52 });
  for (const s of [-1, 1]) {
    b.bar([0.92, 0.64, s * 1.28], [2.13, 2.08, s * 1.91], 0.12, 0.08, { color: '#604943' });
    b.bar([1.26, 0.64, s * 0.52], [3.46, 2.62, s * 0.69], 0.09, 0.073, { color: '#755342' });
    b.bar([-2.43, 0.62, s * 0.72], [-2.36, 2.45, s * 0.82], 0.075, 0.065, { color: '#61473a' });
    b.bar([-0.87, 0.60, s * 0.74], [-0.72, 2.47, s * 0.82], 0.075, 0.065, { color: '#61473a' });
  }
  for (let i = 0; i < 6; i++) {
    const p = lerp(-1.0, 1.0, i / 6);
    const q = lerp(-1.0, 1.0, (i + 1) / 6);
    const arch = (z: number): number => 2.45 + 0.24 * (1 - z * z);
    b.quad([-2.65, arch(p) - 0.08, p], [-0.43, arch(p), p], [-0.43, arch(q), q], [-2.65, arch(q) - 0.08, q], {
      color: i % 2 ? '#3f6c6a' : '#527b76',
    });
  }
  b.merge(person({ shirt: '#395962', sarong: '#543d35', hat: 'peci', scale: 0.9 }), matrixOf([-1.46, 0.48, -0.24], [0, 1.42, 0]));
  return b.geo(true);
}

/** A junk scow piled with sacks and scrap, with a slatted chute over one side. */
export function dumperShip(): THREE.BufferGeometry {
  const b = new Build(424);
  hull(b, { side: '#435d36', band: '#97a65b', bottom: '#463229', rail: '#514837', deck: '#76624a', rust: 0.65 }, [1.08, 1.18, 0.74]);
  const beams = '#7a563c';
  const chuteTop = -1.13;
  const chuteEnd = -3.04;
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    b.box(2.14 + Math.sin(i * 1.2) * 0.16, 0.12, 0.26, {
      color: i % 3 === 0 ? '#b99567' : '#8d704d',
      pos: [-0.59, lerp(1.15, 0.29, t), lerp(chuteTop, chuteEnd, t)], rot: [-0.42, 0, 0], r: 0,
    });
  }
  for (const x of [-1.67, 0.46]) {
    b.bar([x, 1.33, chuteTop + 0.05], [x, 0.39, chuteEnd - 0.09], 0.096, 0.075, { color: beams, seg: 5 });
    b.bar([x, 0.44, -1.30], [x, 0.43, -2.65], 0.072, 0.064, { color: '#564139', seg: 5 });
  }
  const hoist: Vec = [-2.54, 3.05, -0.94];
  for (const z of [-1.25, 1.10]) b.bar([-2.64, 0.65, z], hoist, 0.11, 0.083, { color: beams });
  b.bar(hoist, [-1.40, 2.74, -1.65], 0.095, 0.069, { color: '#a18555' });
  b.bar([-1.40, 2.74, -1.65], [-1.32, 1.46, -2.37], 0.028, 0.028, { color: '#4c3b2e' });
  b.cyl(0.17, 0.17, 0.14, { color: '#67503c', pos: [-1.40, 2.74, -1.65], rot: [0, 0, Math.PI / 2], seg: 8 });
  const sacks: [Vec, number, string][] = [
    [[-1.55, 0.92, 0.39], 0.69, '#c4a679'],
    [[-1.06, 1.04, -0.52], 0.65, '#8c9b6c'],
    [[-1.86, 1.25, -0.28], 0.53, '#b79b70'],
    [[-0.92, 1.57, 0.31], 0.55, '#abb681'],
    [[-0.30, 0.95, 0.71], 0.52, '#939586'],
  ];
  for (const [pos, r, color] of sacks) {
    b.ball(r, { color, pos, scale: [1.1, 0.83, 0.9], rot: [0.18, b.r() * 5, 0.24], seg: 8, rough: 0.10 });
    b.cyl(0.095, 0.14, 0.13, { color: '#68553d', pos: [pos[0] - 0.13, pos[1] + r * 0.79, pos[2]], rot: [0.25, 0, 0.32], seg: 6 });
  }
  b.add(new THREE.TorusGeometry(0.41, 0.14, 6, 12), { color: '#383a32', pos: [0.15, 1.31, -0.27], rot: [0.52, 0.42, 0.16] });
  for (const z of [0.65, 1.0]) {
    b.box(2.1, 0.15, 0.26, { color: '#9d7050', pos: [-0.39, 0.83 + z * 0.21, z], rot: [0, -0.16, 0.18], r: 0 });
  }
  for (const x of [-2.41, -1.48, -0.37]) b.bar([x, 0.58, 1.22], [x, 1.36, 1.30], 0.072, 0.063, { color: beams });
  b.bar([-2.48, 1.25, 1.29], [-0.33, 1.30, 1.30], 0.095, 0.065, { color: '#9b7d58' });
  b.merge(person({ shirt: '#8b623a', sarong: '#3c4f3b', hat: 'caping', scale: 0.83 }), matrixOf([1.88, 0.56, 0.15], [0, 1.5, 0]));
  return b.geo(true);
}

/** Narrow sailing canoe with a brass-shod battering prow, crimson-tipped outriggers, and a working red sail. */
export function rammerShip(): THREE.BufferGeometry {
  const b = new Build(426);
  hull(b, { side: '#793e31', band: '#c89969', bottom: '#332e2c', rail: '#51372b', deck: '#957653', rust: 0.18 }, [1.12, 0.80, 0.85]);
  // Solid faceted iron-and-brass battering beak gripping the high stempost so the prow reads at play scale.
  const ridgeA: Vec = [2.78, 1.38, 0];
  const ridgeB: Vec = [4.38, 1.76, 0];
  const noseTop: Vec = [5.72, 1.44, 0];
  const noseBot: Vec = [5.60, 0.82, 0];
  const keelA: Vec = [2.62, 0.14, 0];
  const keelB: Vec = [4.26, 0.46, 0];
  for (const side of [-1, 1]) {
    const collarTop: Vec = [2.72, 1.24, side * 0.74];
    const collarBot: Vec = [2.62, 0.28, side * 0.62];
    const shoulderTop: Vec = [4.28, 1.56, side * 0.38];
    const shoulderBot: Vec = [4.18, 0.56, side * 0.34];
    const tipTop: Vec = [5.66, 1.38, side * 0.13];
    const tipBot: Vec = [5.56, 0.84, side * 0.11];
    // Timber bolster cheeks & top deck cap merging the ram into the bow hull
    b.quad(collarBot, shoulderBot, shoulderTop, collarTop, { color: '#5b392c' });
    b.quad(collarTop, shoulderTop, ridgeB, ridgeA, { color: '#7b5139', top: '#a8784e' });
    b.quad(collarBot, keelA, keelB, shoulderBot, { color: '#3b2c27' });
    // Forged iron side cheeks + burnished brass dorsal bevels tapering to a blunt chisel shoe
    b.quad(shoulderBot, tipBot, tipTop, shoulderTop, { color: '#4d535b', top: '#6d757e', gloss: 0.46 });
    b.quad(shoulderTop, tipTop, noseTop, ridgeB, { color: '#ce8c46', top: '#f2c174', gloss: 0.58 });
    b.quad(shoulderBot, keelB, noseBot, tipBot, { color: '#393e44', gloss: 0.35 });
    // Two iron collar straps and brass rivet bosses along the ram shoulder
    b.bar(collarBot, collarTop, 0.085, 0.085, { color: '#3a3f46', seg: 6 });
    b.bar(shoulderBot, shoulderTop, 0.08, 0.075, { color: '#3a3f46', seg: 6 });
    b.bar(collarTop, ridgeA, 0.075, 0.07, { color: '#3a3f46', seg: 6 });
    b.bar(shoulderTop, ridgeB, 0.07, 0.07, { color: '#c48a46', seg: 6, gloss: 0.5 });
    for (const q of [0.28, 0.64]) {
      b.ball(0.075, {
        color: '#efc072',
        pos: [lerp(shoulderTop[0], tipTop[0], q), lerp(shoulderTop[1], tipTop[1], q) - 0.24, side * lerp(0.39, 0.15, q)],
        seg: 6,
        gloss: 0.6,
      });
    }
    // Twin bamboo outriggers with crimson-painted war tips and dark rattan lashings
    const outrigger: Vec[] = [[-3.05,0.52,side*1.74],[-2.15,0.17,side*1.9],[0.6,0.14,side*1.98],[2.55,0.34,side*1.86],[3.48,0.72,side*1.66]];
    b.tube(outrigger, t => 0.05 + Math.sin(t*Math.PI)*0.165, {
      color: (p) => _c.set(p.x > 1.75 ? '#be3e2c' : '#a67f52').lerp(hex(p.x > 1.75 ? '#df6a48' : '#d8c08e'), smooth(0.1, 0.6, p.y)),
      seg: 7,
      rings: 14,
    });
    for (const x of [-1.9, 1.32]) {
      b.bar([x,0.7,side*0.68],[x+0.16,0.34,side*1.92],0.09,0.075,{color:'#b09465'});
      b.bar([x+0.08,0.30,side*1.91],[x+0.26,0.30,side*1.91],0.16,0.16,{color:'#4c3829'});
    }
  }
  // Closed blunt brass impact nose plate at the very tip of the ram
  b.quad([5.66, 1.38, -0.13], [5.56, 0.84, -0.11], [5.56, 0.84, 0.11], [5.66, 1.38, 0.13], { color: '#e6b264', gloss: 0.62 });
  b.quad([5.66, 1.38, -0.13], [5.66, 1.38, 0.13], [5.72, 1.44, 0.04], [5.72, 1.44, -0.04], { color: '#f2c87b', gloss: 0.62 });
  b.box(0.52, 0.16, 1.48, { color: '#7a593d', pos: [1.58, 0.68, 0], r: 0.03 });
  b.add(new THREE.TorusGeometry(0.28, 0.07, 5, 10), { color: '#c8ae7c', pos: [1.98, 0.72, -0.28], rot: [Math.PI / 2, 0.08, 0] });
  // The head and foot follow separate yards. Bias-cut cloth sags away from the lacing.
  const cloth = (u: number, v: number): Vec => [
    lerp(lerp(1.85, -2.1, u), lerp(1.44, -1.26, u), v),
    lerp(lerp(1.93, 4.52, u), lerp(1.64, 2.0, u), v) - 0.16 * Math.sin(Math.PI*u),
    0.17 - 0.8*u + 0.82*Math.sin(Math.PI*u)*Math.sin(Math.PI*v),
  ];
  b.bar([0.1,0.52,0],[0.02,3.65,-0.11],0.12,0.085,{color:'#5b4530'});
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 5; v++) {
      const color = v === 4 ? '#a47e5c' : u === 5 && v >= 1 && v <= 2 ? '#b57854' : ['#a84f37','#b65c3d','#a9533b'][u % 3];
      b.quad(cloth(u/8,v/5),cloth((u+1)/8,v/5),cloth((u+1)/8,(v+1)/5),cloth(u/8,(v+1)/5),{color});
    }
  }
  for (const v of [0,1]) b.bar(cloth(0,v),cloth(1,v),0.067,0.05,{color:'#c8a670'});
  b.bar(cloth(1,1),[-2.9,0.9,-0.84],0.03,0.03,{color:'#7b6447'});
  b.bar([0.02,3.55,-0.11],[2.87,0.99,0.48],0.03,0.03,{color:'#786247'});
  b.merge(person({ shirt: '#424c50', sarong: '#944b3b', hat: 'peci', scale: 0.86 }), matrixOf([-2.24,0.58,0.02],[0,1.36,0]));
  b.bar([-2.35,1.33,0.44],[-3.79,0.09,0.98],0.07,0.09,{color:'#563726'});
  return b.geo(true);
}

/** Harbor tug with a chamfered watertight pilothouse, bow push-fender, tire fenders, and aft towing arch. */
export function tugShip(): THREE.BufferGeometry {
  const b = new Build(427);
  hull(b, { side: '#234849', band: '#b7a482', bottom: '#3e3330', rail: '#51483a', deck: '#8b7559', rust: 0.34 }, [0.97,1.19,1.04]);
  // Chamfered forward panes wrap around the helm, closed tightly into the cambered roof fascia.
  const footprint: [number,number][] = [[-0.67,-0.97],[0.95,-0.97],[1.59,-0.57],[1.59,0.57],[0.95,0.97],[-0.67,0.97]];
  const corner = (i: number,h: number,scale: number): Vec => {
    const [x,z] = footprint[i % footprint.length];
    return [0.48 + (x-0.48)*scale,h,z*scale];
  };
  for (let i=0; i<footprint.length; i++) {
    const j=i+1;
    b.quad(corner(i,0.65,1.03),corner(j,0.65,1.03),corner(j,1.59,1),corner(i,1.59,1),{color:'#477671'});
    b.quad(corner(i,1.59,1),corner(j,1.59,1),corner(j,2.32,0.94),corner(i,2.32,0.94),{
      color: i === 2 ? '#e3bd78' : i === 1 || i === 3 ? '#3b5d60' : '#243d43',
      gloss: 0.55,
      glow: i === 2 ? 0.24 : 0,
    });
    // Solid upper header fascia closing the gap between window tops and the cambered roof
    b.quad(corner(i,2.30,0.945),corner(j,2.30,0.945),corner(j,2.56,0.94),corner(i,2.56,0.94),{color:'#d1bea0'});
    b.bar(corner(i,1.55,1.02),corner(i,2.46,0.96),0.064,0.066,{color:'#d1bea0'});
    b.bar(corner(i,1.58,1.02),corner(j,1.58,1.02),0.055,0.055,{color:'#b69572'});
    if (i===0 || i===4) {
      const z=i===0?-0.97:0.97;
      b.bar([0.13,1.6,z],[0.15,2.33,z*0.94],0.045,0.045,{color:'#c3ad8a'});
    }
  }
  // Cambered roof, with solid underside thickness, visible eaves, helm hatch, and brass brow lamp.
  const roof = (u:number,v:number):Vec => [
    lerp(-0.91,1.98-0.32*Math.pow(Math.abs(v),3),u),
    2.48 + 0.23*(1-v*v) - 0.06*u, v*1.12,
  ];
  for (let i=0;i<8;i++) {
    const a=i/4-1, d=(i+1)/4-1;
    b.quad(roof(0,a),roof(0,d),roof(1,d),roof(1,a),{color:i%2?'#b8ab8e':'#c4b79a'});
    for (const u of [0,1]) b.bar(roof(u,a),roof(u,d),0.075,0.075,{color:'#786b54'});
  }
  for (const s of [-1, 1]) b.bar(roof(0, s), roof(1, s), 0.07, 0.07, { color: '#786b54' });
  b.box(0.71,0.11,0.66,{color:'#726e58',pos:[0.53,2.71,-0.13],r:0.04});
  // Roof brow searchlight
  b.cyl(0.16, 0.14, 0.28, { color: '#584b3e', pos: [1.76, 2.74, 0], rot: [0, 0, Math.PI / 2], seg: 9 });
  b.cyl(0.13, 0.13, 0.05, { color: '#ffe5a0', pos: [1.91, 2.74, 0], rot: [0, 0, Math.PI / 2], seg: 9, glow: 0.7 });
  // Raked smokestack with soot crown and slender brass steam pipe
  b.bar([-1.12,0.62,-0.32],[-1.56,3.31,-0.32],0.42,0.32,{color:'#855641',seg:12});
  b.bar([-1.50,2.91,-0.32],[-1.58,3.37,-0.32],0.35,0.36,{color:'#333b39',seg:12});
  b.cyl(0.245,0.245,0.03,{color:'#1b2528',pos:[-1.58,3.38,-0.32],seg:12,rot:[0,0,0.16]});
  b.bar([-0.74,1.25,-0.32],[-1.16,3.06,-0.32],0.055,0.05,{color:'#c89956',seg:6,gloss:0.5});
  b.bar([0.06,2.65,0.27],[-0.12,3.8,0.27],0.07,0.045,{color:'#604939'});
  b.ball(0.16,{color:'#f1cd8b',pos:[-0.12,3.8,0.27],seg:8,glow:0.22});
  // Heavy rubber/rope bow push-fender wrapping the blunt tug stem
  const bowPad: Vec[] = [[2.88,1.52,-0.86],[3.58,1.68,-0.42],[3.82,1.76,0],[3.58,1.68,0.42],[2.88,1.52,0.86]];
  b.tube(bowPad, t => 0.17 + 0.09 * Math.sin(t * Math.PI), { color: '#2d3230', top: '#464d4a', seg: 7, rings: 12 });
  for (const [x, y, z] of [[3.32, 1.56, -0.60], [3.76, 1.66, 0], [3.32, 1.56, 0.60]] as const) {
    b.bar([x, y - 0.34, z], [x, y + 0.24, z], 0.05, 0.05, { color: '#9c7e54', seg: 5 });
  }
  for (const side of [-1,1]) {
    for (const [x,y] of [[-2.16,0.6],[0.03,0.48],[1.72,0.68]]) {
      const z=side*(x>1?1.42:1.51);
      b.bar([x-0.12,1.02,z*0.93],[x,y+0.19,z],0.038,0.038,{color:'#907853'});
      b.add(new THREE.TorusGeometry(0.33,0.135,6,12),{color:'#323733',pos:[x,y,z],rot:[side*0.18,0,0.17]});
    }
  }
  // Aft towing winch, curved steel towing arch to keep the hawser clear, and a deckhand watching the tow
  b.cyl(0.32,0.32,1.12,{color:'#937856',pos:[-2.24,1.08,0],rot:[Math.PI/2,0,0],seg:10});
  for (const z of [-0.58,0.58]) b.cyl(0.44,0.44,0.09,{color:'#51544a',pos:[-2.24,1.08,z],rot:[Math.PI/2,0,0],seg:10});
  const arch: Vec[] = [[-2.82, 1.12, -1.16], [-2.88, 1.48, -0.58], [-2.92, 1.58, 0], [-2.88, 1.48, 0.58], [-2.82, 1.12, 1.16]];
  b.tube(arch, () => 0.075, { color: '#4c524c', top: '#787e74', seg: 6, rings: 10 });
  for (const s of [-1, 1]) b.bar([-2.82, 0.85, s * 1.12], [-2.82, 1.18, s * 1.16], 0.07, 0.07, { color: '#4c524c' });
  b.add(new THREE.TorusGeometry(0.32,0.087,6,14),{color:'#c8734d',pos:[-0.48,1.26,1.02]});
  b.merge(person({ shirt: '#566d68', sarong: '#3b373e', hat: 'caping', scale: 0.78 }), matrixOf([-1.28, 0.76, 0.68], [0, -1.25, 0]));
  return b.geo(true);
}

/** Recovered canvas roll, creased by two rope lashings with an orange cork tag float. */
export function salvageBundle(): THREE.BufferGeometry {
  const b = new Build(429);
  b.tube([[-0.94,0.31,-0.06],[-0.58,0.4,0],[-0.12,0.43,0.04],[0.49,0.38,0],[0.91,0.33,0.06]],
    t=>0.36 + 0.09*Math.sin(t*Math.PI)-0.07*Math.cos(t*Math.PI*4),{color:'#8e8d72',top:'#baae86',seg:9,rings:11});
  for (const x of [-0.47,0.51]) b.add(new THREE.TorusGeometry(0.425,0.045,5,10),{color:'#705637',pos:[x,0.4,0],rot:[0,Math.PI/2,0]});
  for (const x of [-0.91,0.9]) b.ball(0.32,{color:'#8e8062',pos:[x,0.34,0.01],scale:[0.32,1,1],seg:7});
  striped(b, [0.52, 0.76, 0.24], 0.22);
  return b.geo(true);
}

/** A timber lighter carrying a bow towing bitt, a lashed tarp, a slatted tea chest, and two weathered steel drums. */
export function cargoBarge(): THREE.BufferGeometry {
  const b = new Build(428);
  hull(b,{side:'#565346',band:'#8e7557',deck:'#89785d',rail:'#594538',bottom:'#373b35',rust:0.27},[0.66,1.02,0.66]);
  // Stout timber towing bollard (bitt) at the bow where the tug's hawser fastens
  b.cyl(0.16, 0.19, 0.72, { color: '#4d3a2c', pos: [1.94, 1.06, 0], seg: 8 });
  b.bar([1.94, 1.24, -0.34], [1.94, 1.24, 0.34], 0.075, 0.075, { color: '#6b513b', seg: 6 });
  b.add(new THREE.TorusGeometry(0.21, 0.055, 5, 10), { color: '#d0b583', pos: [1.94, 1.08, 0], rot: [Math.PI / 2, 0.1, 0] });
  const tarp = (u:number,v:number):Vec => [
    -1.08 + u*(0.89-0.14*v), 0.47 + Math.cos(v*Math.PI/2)*0.98 + 0.11*u - 0.085*Math.cos(2*Math.PI*u),
    v*(0.96-0.09*u)+0.08*u,
  ];
  for(let i=0;i<8;i++) for(let j=0;j<6;j++) {
    const u=i/4-1,v=j/3-1;
    b.quad(tarp(u,v),tarp(u+0.25,v),tarp(u+0.25,v+1/3),tarp(u,v+1/3),{color:i<2?'#656f63':'#717e70'});
  }
  for(const u of [-1,1]) {
    for(let j=0;j<6;j++){
      const a=tarp(u,j/3-1), d=tarp(u,(j+1)/3-1);
      b.quad(a,d,[d[0],0.42,d[2]],[a[0],0.42,a[2]],{color:'#53645b'});
    }
  }
  for(const u of [-0.57,0.51]) {
    const rope:Vec[]=[];
    for(let j=0;j<=8;j++){const p=tarp(u,j/4-1);p[1]+=0.045;rope.push(p);}
    b.tube(rope,()=>0.044,{color:'#c8ae80',seg:5,rings:10});
  }
  b.box(0.97,0.82,1.07,{color:'#9e7950',pos:[0.43,0.8,-0.42],r:0.035});
  for(const x of [0.02,0.84]) b.box(0.1,0.91,1.11,{color:'#634e3a',pos:[x,0.82,-0.42],r:0});
  b.bar([0,0.48,0.14],[0.84,1.16,0.14],0.061,0.061,{color:'#c3a776',seg:4});
  // Two varied steel drums (rust-red and weathered sea-slate) with rolled hoops
  const drums: [number, number, number, string, string][] = [
    [0.31, 0.62, 0.89, '#a05336', '#b87654'],
    [1.16, 0.18, 0.78, '#486a70', '#6d9096'],
  ];
  for (const [x, z, h, col, top] of drums) {
    b.cyl(0.35, 0.33, h, { color: col, top, pos: [x, 0.45 + h / 2, z], seg: 10 });
    for (const q of [0.22, 0.72, 0.98]) b.cyl(0.368, 0.368, 0.043, { color: '#4d4f48', pos: [x, 0.45 + h * q, z], seg: 10 });
  }
  b.add(new THREE.TorusGeometry(0.24, 0.06, 5, 10), { color: '#c8ae80', pos: [1.34, 0.78, -0.50], rot: [Math.PI / 2, -0.1, 0] });
  return b.geo(true);
}

/** A curved swallowtail and a string of signal flags over a lookout's platform. */
export function signalShip(): THREE.BufferGeometry {
  const b = new Build(425);
  hull(b, { side: '#644339', band: '#dc9250', bottom: '#382738', rail: '#ce9b6a', deck: '#98715a', rust: 0.36 }, [1.04, 1.10, 0.94]);
  const mast: Vec = [0.68, 6.68, 0];
  const rope = '#6a513a';
  b.bar([0.45, 0.59, 0], mast, 0.16, 0.08, { color: '#654839' });
  b.cyl(0.73, 0.46, 0.40, { color: '#8f5c42', pos: [0.59, 4.02, 0], seg: 11 });
  b.cyl(0.78, 0.76, 0.09, { color: '#d19d5e', pos: [0.59, 4.23, 0], seg: 11 });
  b.ball(0.18, { color: '#ffd587', pos: mast, seg: 8, glow: 0.24 });
  for (const s of [-1, 1]) {
    b.bar([0.63, 4.25, 0], [-2.92, 1.03, s * 1.01], 0.045, 0.04, { color: rope });
    b.bar([0.63, 4.25, 0], [1.55, 0.96, s * 1.14], 0.045, 0.04, { color: rope });
    b.cyl(0.14, 0.21, 0.34, { color: '#ffbc59', pos: [-2.27, 1.52, s * 1.12], seg: 8, glow: 0.72 });
    b.cyl(0.23, 0.16, 0.13, { color: '#7f5438', pos: [-2.27, 1.73, s * 1.12], seg: 8 });
  }
  const flag = (u: number, v: number): Vec => {
    const cut = 0.72 * Math.pow(u, 4) * (1 - Math.abs(2 * v - 1));
    return [0.65 - 3.82 * u + cut, 6.46 - (1.62 - u * 0.46) * v + 0.34 * Math.sin(u * Math.PI), u * 0.86 + 0.26 * Math.sin(u * 7 + v)];
  };
  const colors = ['#e59b32', '#fff0be', '#cf7133'];
  const rows = [0, 0.43, 0.62, 1];
  for (let i = 0; i < 8; i++) {
    const u = i / 8;
    const v = (i + 1) / 8;
    for (let j = 0; j < colors.length; j++) {
      const lo = rows[j];
      const hi = rows[j + 1];
      b.quad(flag(u, lo), flag(u, hi), flag(v, hi), flag(v, lo), { color: colors[j], glow: 0.13, vary: 0.06 });
    }
  }
  const pennant = (t: number): Vec => [lerp(0.69, 3.55, t), lerp(5.76, 1.53, t) - Math.sin(t * Math.PI) * 0.42, lerp(0, -0.63, t)];
  b.tube([pennant(0), pennant(0.5), pennant(1)], () => 0.037, { color: rope, seg: 5, rings: 6 });
  for (let i = 0; i < 5; i++) {
    const a = pennant(0.16 + i * 0.146);
    const d = pennant(0.27 + i * 0.146);
    b.quad(a, [a[0] - 0.56, a[1] - 0.79, a[2] - 0.57], [a[0] - 0.38, a[1] - 0.85, a[2] - 0.59], d, {
      color: i % 2 ? '#db7950' : '#fff1c3', glow: 0.10,
    });
  }
  b.merge(person({ shirt: '#a46942', sarong: '#5f3641', hat: 'none', scale: 0.9 }), matrixOf([0.63, 4.22, -0.17], [0, 1.12, 0]));
  b.merge(person({ shirt: '#5e414e', sarong: '#573e33', hat: 'peci', scale: 0.76 }), matrixOf([2.05, 0.76, 0.12], [0, 1.6, 0]));
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
