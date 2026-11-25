import * as THREE from 'three';
import { CORAL_CLUSTERS, SEA_ROCKS } from '../world';
import type { GameSimulation } from '../simulation';
import { Build, boulder, hex, matrixOf, type Vec } from './build';
import { GLSL_CACHED_UNDERWATER, GLSL_UNDERWATER_END, outlineMaterial, toon } from './gfx';
import { inked, instanced, mesh, type Inst } from './kit';
import { Q } from './quality';
import { clamp, groundAt, lerp, noise3, rng, smooth, toX, toZ, UNIT } from './space';

/* ================================================================== rocks */

const C = {
  wet: hex('#2b3138'),
  algae: hex('#4c5f35'),
  stone: hex('#8f857c'),
  stoneCool: hex('#6d7480'),
  top: hex('#c9bba8'),
  guano: hex('#efe8da'),
  moss: hex('#8fae48'),
  rust: hex('#8c5f44'),
};
const _c = new THREE.Color();

function rockPaint(seed: number) {
  return (p: THREE.Vector3, n: THREE.Vector3): THREE.Color => {
    const a = noise3(p.x * 0.9 + seed, p.y * 0.9, p.z * 0.9);
    const b = noise3(p.x * 2.7, p.y * 2.7 + seed, p.z * 2.7);
    // columnar strata: darker seams climbing the face
    const seam = Math.sin(p.x * 3.1 + p.z * 2.4 + a * 3.2) * 0.5 + 0.5;
    _c.copy(C.stone).lerp(C.stoneCool, clamp(0.5 + a * 0.9, 0, 1));
    _c.lerp(C.rust, clamp(b * 0.55 - 0.05, 0, 0.4) * smooth(0.6, 2, p.y));
    _c.multiplyScalar(lerp(0.78, 1.06, seam * 0.6 + (b * 0.5 + 0.5) * 0.4));
    _c.lerp(C.top, smooth(0.35, 0.85, n.y) * smooth(0.4, 2.6, p.y) * 0.75);
    _c.lerp(C.moss, smooth(0.5, 0.85, n.y + a * 0.35) * smooth(1.2, 3.2, p.y) * 0.8);
    _c.lerp(C.guano, smooth(0.15, 0.6, b + n.y * 0.3) * smooth(3.4, 6.4, p.y) * 0.55);
    // tide line: weed, then black and wet below it
    _c.lerp(C.algae, smooth(1.25, 0.65, p.y + b * 0.25) * 0.75);
    _c.lerp(C.wet, smooth(0.75, 0.2, p.y + b * 0.22));
    return _c;
  };
}

function stack(b: Build, seed: number, r: number, parts: { s: Vec; p: Vec; rot: Vec; k?: number }[]): void {
  parts.forEach((q, i) => {
    const g = boulder(seed * 10 + i, { detail: 5, cuts: 26, rough: 0.03 });
    const k = r * 1.24;
    const m = matrixOf([q.p[0] * k, q.p[1] * k, q.p[2] * k], q.rot, [q.s[0] * k, q.s[1] * k, q.s[2] * k]);
    b.add(g, {
      color: rockPaint(seed + i),
      matrix: m,
      ao: (p, n) => clamp(0.45 + smooth(-0.4, 2.2, p.y) * 0.55, 0, 1) * lerp(0.72, 1, n.y * 0.5 + 0.5),
    });
  });
}

const STACKS: { s: Vec; p: Vec; rot: Vec }[][] = [
  [
    { s: [0.98, 0.62, 0.9], p: [0, -0.12, 0], rot: [0.1, 0.3, 0] },
    { s: [0.56, 1.5, 0.52], p: [-0.14, 0.86, -0.1], rot: [0.05, 0.8, 0.14] },
    { s: [0.42, 1.0, 0.44], p: [0.42, 0.5, 0.12], rot: [-0.06, 2.1, -0.16] },
    { s: [0.36, 0.54, 0.36], p: [-0.6, 0.18, 0.42], rot: [0.2, 1.2, 0.2] },
    { s: [0.22, 0.3, 0.22], p: [0.72, 0.06, 0.62], rot: [0.4, 0.2, 0] },
    { s: [0.3, 0.6, 0.3], p: [0.06, 0.5, 0.5], rot: [0.12, 0.4, 0.05] },
  ],
  [
    { s: [0.98, 0.6, 0.92], p: [0, -0.1, 0], rot: [0, 1.1, 0.06] },
    { s: [0.64, 1.1, 0.6], p: [0.08, 0.56, -0.06], rot: [0.08, 0.1, -0.2] },
    { s: [0.42, 0.62, 0.4], p: [-0.5, 0.28, 0.3], rot: [0.14, 1.9, 0.22] },
    { s: [0.26, 0.34, 0.26], p: [0.6, 0.1, 0.5], rot: [0.5, 0.2, 0.3] },
  ],
  [
    { s: [0.98, 0.64, 0.95], p: [0, -0.08, 0], rot: [0.06, 2.2, 0] },
    { s: [0.6, 0.9, 0.58], p: [-0.06, 0.46, 0], rot: [0.1, 0.5, 0.24] },
    { s: [0.36, 0.48, 0.34], p: [0.5, 0.16, 0.3], rot: [0.2, 0.9, -0.2] },
  ],
];

export function buildRocks(): THREE.Group {
  const g = new THREE.Group();
  const pair = toon({ isStatic: true });
  const ink = outlineMaterial(1.5, '#1c2130', { isStatic: true });
  SEA_ROCKS.forEach((rk, i) => {
    const b = new Build(40 + i);
    stack(b, 3 + i * 7, rk.r * UNIT, STACKS[i]);
    const m = inked(mesh(b.geo(true), pair), ink);
    m.position.set(toX(rk.x), 0, toZ(rk.y));
    m.frustumCulled = false;
    g.add(m);
  });

  // half-drowned satellites and shore boulders, so the stacks are not three lonely objects
  const r = rng(77);
  const geo = new Build(5).add(boulder(91, { detail: 2 }), { color: rockPaint(9), ao: 0.9 }).geo();
  const items: Inst[] = [];
  const scatter = (cx: number, cz: number, n: number, r0: number, r1: number, s0: number, s1: number): void => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = lerp(r0, r1, Math.sqrt(r()));
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const s = lerp(s0, s1, r() * r());
      items.push({
        m: matrixOf([x, groundAt(x, z) + s * 0.2, z], [r() * 0.6, r() * 6, r() * 0.6], [s, s * lerp(0.55, 0.9, r()), s * lerp(0.7, 1.1, r())]),
        i: [r(), r(), 0, 0],
      });
    }
  };
  for (const rk of SEA_ROCKS) scatter(toX(rk.x), toZ(rk.y), 16, rk.r * UNIT * 0.95, rk.r * UNIT * 2.1, 0.22, 0.85);
  for (const c of CORAL_CLUSTERS) scatter(toX(c.x), toZ(c.y), 12, 1, c.r * UNIT * 1.5, 0.25, 0.8);
  g.add(instanced(geo, pair, items));
  return g;
}

/* ================================================================== coral */

function staghorn(seed: number): THREE.BufferGeometry {
  const b = new Build(seed);
  const r = b.r;
  const tip = hex('#ffffff');
  const grow = (p: THREE.Vector3, d: THREE.Vector3, len: number, rad: number, lv: number): void => {
    const e = p.clone().addScaledVector(d, len);
    const t0 = lv / 3;
    b.bar([p.x, p.y, p.z], [e.x, e.y, e.z], rad, rad * 0.72, {
      color: (q) => _c.set('#a89c9c').lerp(tip, smooth(0.3, 1.2, q.y)),
      ao: lerp(0.45, 1, t0),
      seg: 4,
      open: true,
    });
    if (lv >= (Q.lite ? 2 : 3)) {
      b.ico(rad * 0.9, 0, { color: tip, pos: [e.x, e.y, e.z] });
      return;
    }
    const n = lv === 0 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const nd = d
        .clone()
        .add(new THREE.Vector3(r() - 0.5, r() * 0.45, r() - 0.5).multiplyScalar(1.35))
        .normalize();
      grow(e, nd, len * lerp(0.62, 0.86, r()), rad * 0.74, lv + 1);
    }
  };
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r();
    grow(new THREE.Vector3(Math.cos(a) * 0.14, -0.1, Math.sin(a) * 0.14), new THREE.Vector3(Math.cos(a) * 0.8, 0.8, Math.sin(a) * 0.8).normalize(), 0.44, 0.1, 0);
  }
  return b.geo();
}

function table(seed: number): THREE.BufferGeometry {
  const b = new Build(seed);
  const r = b.r;
  const plate = (cx: number, cy: number, cz: number, rad: number, tilt: number): void => {
    b.cyl(0.14, 0.3, cy + 0.2, { color: '#7c7278', pos: [cx, cy / 2 - 0.1, cz], seg: 7, ao: 0.5 });
    const N = 26;
    const pts: number[] = [];
    const ring = (k: number, rr: number, y: number): [number, number, number] => {
      const a = (k / N) * Math.PI * 2;
      const w = 1 + Math.sin(a * 5 + seed) * 0.07 + Math.sin(a * 11 + seed * 2) * 0.05;
      return [Math.cos(a) * rr * w, y + Math.sin(a * 7 + seed) * 0.035 * rr, Math.sin(a) * rr * w];
    };
    const rings: [number, number][] = [
      [0.05, 0.02],
      [0.35, 0.0],
      [0.66, 0.05],
      [0.9, 0.13],
      [1.0, 0.16],
      [0.96, 0.06],
      [0.5, -0.1],
      [0.12, -0.16],
    ];
    for (let j = 0; j < rings.length - 1; j++) {
      for (let k = 0; k < N; k++) {
        const A = ring(k, rings[j][0] * rad, rings[j][1]);
        const B = ring(k + 1, rings[j][0] * rad, rings[j][1]);
        const D = ring(k, rings[j + 1][0] * rad, rings[j + 1][1]);
        const E = ring(k + 1, rings[j + 1][0] * rad, rings[j + 1][1]);
        pts.push(...A, ...B, ...E, ...A, ...E, ...D);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    g.computeVertexNormals();
    const inner = hex('#86797a');
    const mid = hex('#c4b9b6');
    const rim = hex('#ffffff');
    b.add(g, {
      color: (p) => {
        const q = Math.hypot(p.x - cx, p.z - cz) / rad;
        _c.copy(inner).lerp(mid, smooth(0.1, 0.7, q));
        if (Math.sin(q * 30 + Math.atan2(p.z - cz, p.x - cx) * 2) > 0.35) _c.multiplyScalar(0.86);
        return _c.lerp(rim, smooth(0.8, 1.0, q));
      },
      pos: [cx, cy, cz],
      rot: [tilt, r() * 6, tilt * 0.6],
      ao: (p) => (p.y > cy - 0.06 ? 1 : 0.4),
    });
  };
  plate(0, 0.75, 0, 1.25, 0.06);
  plate(0.5, 0.42, 0.42, 0.78, -0.1);
  plate(-0.55, 0.36, 0.36, 0.66, 0.12);
  return b.geo();
}

function brain(seed: number): THREE.BufferGeometry {
  const b = new Build(seed);
  const lobes: [number, number, number, number][] = [
    [0, 0.1, 0, 0.8],
    [0.62, 0.0, 0.2, 0.5],
    [-0.5, -0.02, 0.42, 0.46],
  ];
  for (const [x, y, z, s] of lobes) {
    b.ico(1, Q.lite ? 2 : 3, {
      color: '#d8cfc8',
      pos: [x, y, z],
      scale: [s, s * 0.82, s],
      ao: (p) => lerp(0.45, 1, smooth(-0.1, 0.6, p.y)),
    });
  }
  return b.geo();
}

function fan(seed: number): THREE.BufferGeometry {
  const b = new Build(seed);
  const r = b.r;
  const grow = (x: number, y: number, a: number, len: number, rad: number, lv: number): void => {
    const ex = x + Math.sin(a) * len;
    const ey = y + Math.cos(a) * len;
    b.bar([x, y, Math.sin(x * 2) * 0.08], [ex, ey, Math.sin(ex * 2) * 0.08], rad, rad * 0.75, {
      color: (p) => _c.set('#b8a8ae').lerp(hex('#ffffff'), smooth(0.4, 1.8, p.y)),
      seg: 4,
      sway: (p) => smooth(0, 1.8, p.y) * 0.5,
      ao: lerp(0.6, 1, lv / 5),
    });
    if (lv >= 5) return;
    const n = lv < 2 ? 3 : 2;
    for (let i = 0; i < n; i++) grow(ex, ey, a + (i - (n - 1) / 2) * lerp(0.42, 0.62, r()) + (r() - 0.5) * 0.12, len * 0.8, rad * 0.74, lv + 1);
  };
  grow(0, -0.1, 0, 0.42, 0.07, 0);
  return b.geo();
}

function sponge(seed: number): THREE.BufferGeometry {
  const b = new Build(seed);
  const r = b.r;
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 0.42;
    const h = lerp(0.5, 1.25, r());
    const w = lerp(0.14, 0.24, r());
    const tilt: Vec = [(r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5];
    const m = matrixOf([Math.cos(a) * d, h / 2 - 0.1, Math.sin(a) * d], tilt);
    b.add(new THREE.CylinderGeometry(w, w * 0.72, h, 9, 3), { color: '#cfc4bc', top: '#ffffff', matrix: m, rough: 0.05, ao: (p) => lerp(0.5, 1, smooth(0, 0.7, p.y)) });
    const m2 = m.clone().multiply(matrixOf([0, h / 2 + 0.012, 0]));
    b.add(new THREE.CylinderGeometry(w * 0.66, w * 0.5, 0.03, 9), { color: '#4a3a40', matrix: m2, ao: 0.4 });
  }
  return b.geo();
}

function leather(seed: number): THREE.BufferGeometry {
  const b = new Build(seed);
  const N = 28;
  const pts: number[] = [];
  const pr = (k: number, j: number): [number, number, number] => {
    const a = (k / N) * Math.PI * 2;
    const t = j / 5;
    const rr = lerp(0.12, 1, t);
    const ruf = Math.sin(a * 6 + seed) * 0.24 * t * t + Math.sin(a * 13) * 0.07 * t * t;
    return [Math.cos(a) * rr, 0.35 + t * 0.18 + ruf, Math.sin(a) * rr];
  };
  for (let j = 0; j < 5; j++)
    for (let k = 0; k < N; k++) pts.push(...pr(k, j), ...pr(k + 1, j), ...pr(k + 1, j + 1), ...pr(k, j), ...pr(k + 1, j + 1), ...pr(k, j + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  g.computeVertexNormals();
  b.add(g, { color: (p) => _c.set('#9c8e8e').lerp(hex('#ffffff'), smooth(0.3, 1, Math.hypot(p.x, p.z))), ao: (p) => lerp(0.5, 1, smooth(0.1, 0.8, Math.hypot(p.x, p.z))) });
  b.cyl(0.2, 0.34, 0.5, { color: '#8c7c7c', pos: [0, 0.12, 0], ao: 0.5 });
  return b.geo();
}

function anemone(seed: number): THREE.BufferGeometry {
  const b = new Build(seed);
  const r = b.r;
  b.cyl(0.34, 0.26, 0.32, { color: '#8f7f88', pos: [0, 0.08, 0], seg: 10, ao: 0.6 });
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996;
    const d = Math.sqrt(i / 18) * 0.36;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const o = 0.22 + d * 0.9;
    b.tube(
      [
        [x, 0.2, z],
        [x * 1.5, 0.42, z * 1.5],
        [x * 1.5 + Math.cos(a) * o * 0.6, 0.62 + r() * 0.1, z * 1.5 + Math.sin(a) * o * 0.6],
      ],
      (t) => lerp(0.06, 0.035, t) * (t > 0.85 ? 1.5 : 1),
      {
        color: (p) => _c.set('#c8b8be').lerp(hex('#fffbe6'), smooth(0.45, 0.66, p.y)),
        seg: 4,
        rings: 4,
        sway: (p) => smooth(0.2, 0.7, p.y) * 0.7,
        ao: (p) => lerp(0.5, 1, smooth(0.15, 0.5, p.y)),
      }
    );
  }
  return b.geo();
}

function star(seed: number): THREE.BufferGeometry {
  const b = new Build(seed);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.bar([0, 0.06, 0], [Math.cos(a) * 0.42, 0.04, Math.sin(a) * 0.42], 0.11, 0.05, { color: '#f0e8e0', seg: 6 });
  }
  return b.geo();
}

/** Recovers from bone-white to full colour, each colony at its own pace, as the ecosystem heals. */
const CORAL_ALBEDO = /* glsl */ `
  float recov = .34 + .7 * uEco;
  float heal = smoothstep(vInst.y - .12, vInst.y + .1, recov);
  if (vInst.z > .5 && vInst.z < 1.5){
    vec3 q3 = vLP * 5.5;
    float w3 = texture2D(uNoise, q3.xz * .05).b * 7. + texture2D(uNoise, q3.yx * .05 + .4).b * 7.;
    float m = sin(q3.x * 1.6 + q3.z * 1.2 + w3 * 2.2) ;
    float gro = smoothstep(-.1, .5, m);
    alb *= mix(.62, 1.1, gro);
    ao *= mix(.75, 1., gro);
  }
  if (vInst.z > 1.5){
    // polyps: rows of bright tips over a darker skin
    vec2 q2 = vLP.xz * 1.35 + vInst.x * 3.;
    float cell = texture2D(uNoise, q2 * .42).r;
    float tips = smoothstep(.42, .16, cell);
    float rad = length(vLP.xz);
    float rings = .5 + .5 * sin(rad * 15. + texture2D(uNoise, q2 * .1).b * 5.);
    alb *= mix(.62, 1.14, tips) * mix(.86, 1.05, rings);
    ao *= mix(.82, 1., tips);
  }
  float lum = dot(alb, vec3(.3, .5, .2));
  // sick colonies: ashen, furred with algae in the creases
  vec3 bone = mix(vec3(.16, .2, .13), vec3(.74, .7, .6), sat(lum * 1.5 + .04)) * mix(.8, 1., ao);
  alb = mix(mix(vec3(lum), alb, 1.28), alb, .25);
  alb = mix(bone, alb, heal);
  emis += heal * uBio * (.5 + .5 * sin(uTime * 1.4 + vInst.x * 30.)) * .9;
  emis += heal * .26;
`;

const UNDERWATER_BLEND = GLSL_UNDERWATER_END;

export class Reef {
  readonly group = new THREE.Group();
  readonly dynGroup = new THREE.Group();
  private fish: THREE.InstancedMesh;
  private fishMat: THREE.ShaderMaterial;
  private manta: THREE.Mesh[] = [];
  private mantaMat: THREE.ShaderMaterial;
  private school: { c: THREE.Vector3; r: number; a: number; sp: number; y: number; s: number; ph: number }[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private vp = new THREE.Vector3();
  private vs = new THREE.Vector3();

  constructor() {
    this.group.add(buildRocks());
    const pair = toon({
      isStatic: true,
      fAlbedo: CORAL_ALBEDO,
      vWorld: /* glsl */ `wp.xz += vec2(sin(uTime * 1.3 + wp.z * .8 + vInst.x * 6.), cos(uTime * 1.05 + wp.x * .7)) * aFx.y * .22;`,
    });
    const pair2 = toon({
      isStatic: true,
      side: THREE.DoubleSide,
      fAlbedo: CORAL_ALBEDO,
      vWorld: /* glsl */ `wp.xz += vec2(sin(uTime * 1.3 + wp.z * .8 + vInst.x * 6.), cos(uTime * 1.05 + wp.x * .7)) * aFx.y * .22;`,
    });

    type Kind = { geo: THREE.BufferGeometry; items: Inst[]; two?: boolean; tints: string[] };
    const kinds: Record<string, Kind> = {
      stag: { geo: staghorn(1), items: [], tints: ['#ff8a5c', '#b184ff', '#ffc53d', '#ff7fb2', '#ffe9c8', '#ff9a6a'] },
      stag2: { geo: staghorn(8), items: [], tints: ['#ff6f91', '#ffb14a', '#d47cff', '#fff2b0'] },
      table: { geo: table(2), items: [], two: true, tints: ['#ff8fa6', '#b79bff', '#e7c07a', '#9ad47a'] },
      brain: { geo: brain(3), items: [], tints: ['#ffcf5a', '#e9a868', '#ff9088', '#c79bff'] },
      fan: { geo: fan(4), items: [], tints: ['#ea3f86', '#9d52ff', '#ff8a3a', '#ff5a6e'] },
      sponge: { geo: sponge(5), items: [], tints: ['#ffc53a', '#a673ff', '#ff6f92', '#ff9440'] },
      leather: { geo: leather(6), items: [], two: true, tints: ['#ff8f70', '#ffd766', '#d992ff', '#ff86b6'] },
      anem: { geo: anemone(7), items: [], tints: ['#ff79b0', '#8deab4', '#ffb070'] },
      star: { geo: star(9), items: [], tints: ['#3f7dff', '#ff8a3a', '#ff4d68'] },
    };
    const r = rng(2026);
    const pick = (arr: string[]): string => arr[Math.floor(r() * arr.length)];

    CORAL_CLUSTERS.forEach((c, ci) => {
      const cx = toX(c.x);
      const cz = toZ(c.y);
      const R = c.r * UNIT;
      const placed: [number, number, number][] = [];
      const order: [string, number, number, number, number][] = [
        // kind, count, size, ring 0..1, spacing
        ['table', 1 + (ci % 2), 1.6, 0.62, 1.75],
        ['brain', 3, 1.7, 0.8, 1.3],
        ['leather', 3, 1.6, 0.9, 1.15],
        ['stag', 6, 1.7, 1.0, 1.0],
        ['stag2', 5, 1.55, 1.1, 0.95],
        ['fan', 4, 1.3, 1.05, 0.8],
        ['sponge', 3, 1.45, 0.95, 0.85],
        ['anem', 4, 1.5, 1.05, 0.8],
        ['stag', 6, 0.95, 1.25, 0.7],
        ['brain', 4, 0.8, 1.3, 0.7],
        ['star', 3, 1.2, 1.35, 0.6],
      ];
      for (const [kind, count, size, ring, gap] of order) {
        for (let k = 0; k < count; k++) {
          for (let tries = 0; tries < 24; tries++) {
            const a = r() * Math.PI * 2;
            const d = Math.sqrt(r()) * R * ring * 1.02;
            const x = cx + Math.cos(a) * d * 1.1;
            const z = cz + Math.sin(a) * d * 0.92;
            const s = size * lerp(0.75, 1.25, r()) * (R / 5.6);
            if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < (gap * s + p[2]) * 0.62)) continue;
            placed.push([x, z, gap * s]);
            const y = groundAt(x, z) - 0.05;
            // keep every colony under the surface
            const sy = s * lerp(0.85, 1.1, r());
            const health = clamp(r() * 0.8 + (d / R) * 0.2, 0, 1);
            const tint = new THREE.Color(pick(kinds[kind].tints)).multiplyScalar(lerp(0.9, 1.1, r()));
            kinds[kind].items.push({
              m: matrixOf([x, y, z], [(r() - 0.5) * 0.24, r() * 6.28, (r() - 0.5) * 0.24], [s, Math.min(sy, Math.max(0.35, (-y - 0.1) / 1.2)), s]),
              color: tint,
              i: [r(), health, kind === 'brain' ? 1 : kind === 'table' || kind === 'leather' ? 2 : 0, 0],
            });
            break;
          }
        }
      }
    });
    for (const k of Object.values(kinds)) this.group.add(instanced(k.geo, k.two ? pair2 : pair, k.items, { cast: false }));

    /* ---------------- fish */
    const fb = new Build(3);
    fb.ball(0.5, {
      color: (p) => _c.set('#ffd24a').lerp(hex('#ff8a3a'), smooth(-0.1, 0.5, -p.x)).lerp(hex('#ffffff'), Math.abs(p.x - 0.1) < 0.1 ? 0.8 : 0),
      scale: [1, 0.5, 0.3],
      seg: 8,
    });
    fb.quad([-0.45, 0, 0], [-0.95, 0.3, 0], [-0.82, 0, 0], [-0.95, -0.3, 0], { color: '#ff8a3a', sway: 1 });
    const fishPair = toon({
      side: THREE.DoubleSide,
      vLocal: /* glsl */ `p.z += sin(uTime * 9. + aInst.x * 20. + p.x * 2.4) * .22 * smoothstep(.3, -1., p.x);`,
      fHead: GLSL_CACHED_UNDERWATER,
      fAlbedo: /* glsl */ `alb *= mix(vec3(.55), vec3(1.), smoothstep(.1, .5, uEco)); emis += uBio * .6;`,
      fEnd: UNDERWATER_BLEND,
    });
    this.fishMat = fishPair.material;
    const N = 110;
    const items: Inst[] = [];
    const fc = ['#ffffff', '#8ad8ff', '#ffe27a', '#ff9ac0', '#b8ffc8'];
    for (let i = 0; i < N; i++) {
      const c = CORAL_CLUSTERS[i % CORAL_CLUSTERS.length];
      this.school.push({
        c: new THREE.Vector3(toX(c.x), 0, toZ(c.y)),
        r: c.r * UNIT * lerp(0.5, 1.55, r()),
        a: r() * 6.28,
        sp: lerp(0.16, 0.42, r()) * (i % 2 ? 1 : -1),
        y: lerp(-1.2, -0.5, r()),
        s: lerp(0.34, 0.6, r()),
        ph: r() * 6.28,
      });
      items.push({ m: new THREE.Matrix4(), color: new THREE.Color(pick(fc)), i: [r(), 0, 0, 0] });
    }
    for (let i = 0; i < 18; i++) items.push({ m: new THREE.Matrix4(), color: new THREE.Color('#3f7f96'), i: [r(), 0, 0, 0] });
    this.fish = instanced(fb.geo(), fishPair, items, { cast: false });
    this.dynGroup.add(this.fish);

    const mb = new Build(4);
    const dark = hex('#2f4a5e');
    const pale = hex('#5f8296');
    mb.ball(1, { color: (p) => _c.copy(dark).lerp(pale, smooth(0.2, -0.6, p.x)), scale: [1.1, 0.26, 0.62], seg: 14, ao: 1 });
    for (const s of [1, -1]) {
      const g = new THREE.BufferGeometry();
      const pts: number[] = [];
      const P = (u: number, v: number): Vec => {
        // u 0..1 root to tip, v 0..1 front to back
        const span = u * 2.1;
        const lead = 0.75 - u * u * 0.55;
        const trail = -0.6 + u * 0.35;
        const x = lerp(lead, trail, v) - u * u * 0.25;
        return [x, 0.04 * (1 - u), s * (0.2 + span)];
      };
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 4; j++) {
          const A = P(i / 8, j / 4);
          const B = P((i + 1) / 8, j / 4);
          const D = P((i + 1) / 8, (j + 1) / 4);
          const E = P(i / 8, (j + 1) / 4);
          if (s > 0) pts.push(...A, ...E, ...B, ...B, ...E, ...D);
          else pts.push(...A, ...B, ...E, ...B, ...D, ...E);
        }
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      g.computeVertexNormals();
      mb.add(g, { color: (p) => _c.copy(dark).lerp(pale, smooth(0.6, 1.9, Math.abs(p.z)) * 0.5), sway: (p) => Math.abs(p.z) });
    }
    mb.bar([-1, 0, 0], [-3.1, 0.02, 0], 0.09, 0.02, { color: '#2a4152' });
    mb.bar([1.0, 0, 0.26], [1.4, 0.03, 0.3], 0.09, 0.05, { color: '#2a4152' });
    mb.bar([1.0, 0, -0.26], [1.4, 0.03, -0.3], 0.09, 0.05, { color: '#2a4152' });
    const mantaPair = toon({
      side: THREE.DoubleSide,
      vLocal: /* glsl */ `p.y += sin(uTime * 2.1 + aFx.y * -1.1) * aFx.y * aFx.y * .17;`,
      fHead: GLSL_CACHED_UNDERWATER,
      fAlbedo: 'emis += uBio * .5;',
      fEnd: UNDERWATER_BLEND,
    });
    this.mantaMat = mantaPair.material;
    const mg = mb.geo();
    for (let i = 0; i < 2; i++) {
      const m = mesh(mg, mantaPair);
      m.scale.setScalar(1.15 + i * 0.2);
      m.frustumCulled = false;
      this.manta.push(m);
      this.dynGroup.add(m);
    }
  }

  setCachedMode(on: boolean): void {
    for (const m of [this.fishMat, this.mantaMat]) {
      m.transparent = on;
      m.depthTest = !on;
      m.depthWrite = !on;
      if (Boolean(m.defines.CACHED_UNDER) !== on) {
        if (on) m.defines.CACHED_UNDER = 1;
        else delete m.defines.CACHED_UNDER;
        m.needsUpdate = true;
      }
    }
  }

  update(t: number, sim: GameSimulation): void {
    const p = this.vp;
    const s = this.vs;
    this.school.forEach((f, i) => {
      const a = f.a + t * f.sp;
      const rr = f.r * (1 + Math.sin(t * 0.7 + f.ph) * 0.16);
      p.set(f.c.x + Math.cos(a) * rr, f.y + Math.sin(t * 1.3 + f.ph) * 0.12, f.c.z + Math.sin(a) * rr * 0.85);
      const head = Math.atan2(-Math.cos(a) * Math.sign(f.sp) * 0.85, -Math.sin(a) * Math.sign(f.sp));
      this.e.set(0, head, 0);
      this.q.setFromEuler(this.e);
      s.setScalar(f.s);
      this.m4.compose(p, this.q, s);
      this.fish.setMatrixAt(i, this.m4);
    });
    let k = this.school.length;
    let mi = 0;
    for (const f of sim.ambientFish) {
      const head = Math.atan2(-f.vy, f.vx);
      if (f.kind === 'manta') {
        const m = this.manta[mi++];
        if (!m) continue;
        m.position.set(toX(f.x), -0.95, toZ(f.y));
        m.rotation.set(0, head, Math.sin(t * 0.6 + mi) * 0.08);
        continue;
      }
      p.set(toX(f.x), -0.85, toZ(f.y));
      this.e.set(0, head, 0);
      this.q.setFromEuler(this.e);
      s.setScalar(f.size * 0.1 * 0.95);
      this.m4.compose(p, this.q, s);
      if (k < this.fish.count) this.fish.setMatrixAt(k++, this.m4);
    }
    this.fish.instanceMatrix.needsUpdate = true;
  }
}
