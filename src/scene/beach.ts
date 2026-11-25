import * as THREE from 'three';
import { COLLECTOR_NET, VILLAGE_PIER } from '../world';
import { Build, hex, matrixOf } from './build';
import { outlineMaterial, toon } from './gfx';
import { instanced, setCount, type Inst } from './kit';
import { pathAmount } from './land';
import { beachWidth, clamp, groundAt, lerp, rng, shoreAt, smooth, toX, toZ } from './space';

const _c = new THREE.Color();

function coconut(green: boolean): THREE.BufferGeometry {
  const b = new Build(green ? 3 : 2);
  if (green) {
    b.ball(0.34, { color: '#6f9c34', top: '#b3cf5c', scale: [0.92, 1, 0.92], rot: [0.5, 0, 1.2], pos: [0, 0.24, 0], seg: 9 });
    b.cyl(0.07, 0.1, 0.1, { color: '#8c6a3c', pos: [0.3, 0.3, 0.05], rot: [0, 0, -1.1], seg: 6 });
  } else {
    b.ball(0.29, { color: '#5c3a20', top: '#8f6238', scale: [1, 1.1, 1], rot: [0.3, 0, 1.4], pos: [0, 0.22, 0], seg: 9, rough: 0.02 });
    for (let i = 0; i < 3; i++) b.ball(0.045, { color: '#2c190c', pos: [0.27, 0.26 + Math.cos(i * 2.1) * 0.09, Math.sin(i * 2.1) * 0.09], seg: 5 });
  }
  return b.geo(true);
}

function scallop(): THREE.BufferGeometry {
  const b = new Build(5);
  const pale = hex('#fff1e2');
  b.add(new THREE.SphereGeometry(0.3, 18, 5, 0, Math.PI * 2, 0, Math.PI / 2), {
    color: (p) => _c.set('#f0a08a').lerp(pale, smooth(-0.25, 0.75, Math.sin(Math.atan2(p.z, p.x + 0.34) * 17)) * 0.8 + 0.1),
    scale: [1, 0.42, 0.95],
    pos: [0, 0.02, 0],
  });
  b.box(0.12, 0.07, 0.22, { color: '#e08a72', pos: [-0.29, 0.04, 0], r: 0.03 });
  return b.geo(true);
}

function whelk(): THREE.BufferGeometry {
  const b = new Build(6);
  for (let i = 0; i < 5; i++) {
    const k = i / 4;
    b.ball(lerp(0.2, 0.05, k), { color: i % 2 ? '#e7b27c' : '#fbe3bf', pos: [lerp(-0.08, 0.36, k), lerp(0.16, 0.1, k), 0], scale: [0.8, 1, 1], seg: 8 });
  }
  return b.geo(true);
}

function starfish(): THREE.BufferGeometry {
  const b = new Build(7);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.bar([0, 0.07, 0], [Math.cos(a) * 0.4, 0.04, Math.sin(a) * 0.4], 0.13, 0.05, { color: '#f2762e', top: '#ffb15c', seg: 6 });
  }
  b.ball(0.12, { color: '#ffb15c', pos: [0, 0.1, 0], scale: [1, 0.5, 1], seg: 7 });
  return b.geo(true);
}

function driftwood(seed: number): THREE.BufferGeometry {
  const b = new Build(seed);
  const o = { color: '#a3917a', top: '#d9ccb6', seg: 7 };
  b.tube(
    [
      [-1.15, 0.1, 0.12],
      [-0.4, 0.16, -0.06],
      [0.4, 0.2, 0.08],
      [1.15, 0.34, -0.06],
    ],
    (t) => lerp(0.17, 0.09, t),
    o
  );
  b.bar([0.3, 0.2, 0.06], [0.78, 0.62, -0.34], 0.08, 0.035, o);
  b.bar([-0.35, 0.17, 0], [-0.7, 0.44, 0.36], 0.075, 0.03, o);
  b.bar([0.8, 0.28, 0], [1.02, 0.6, 0.22], 0.05, 0.025, o);
  return b.geo(true);
}

/* what the tide should not have left */
function litterBottle(): THREE.BufferGeometry {
  const b = new Build(11);
  const m = [0, 0, Math.PI / 2] as [number, number, number];
  b.cyl(0.15, 0.15, 0.5, { color: '#9fd8f0', pos: [0, 0.14, 0], rot: m, seg: 9, gloss: 0.5 });
  b.cyl(0.155, 0.155, 0.17, { color: '#f4f9ff', pos: [0.02, 0.14, 0], rot: m, seg: 9 });
  b.cyl(0.07, 0.14, 0.16, { color: '#9fd8f0', pos: [-0.32, 0.14, 0], rot: m, seg: 8 });
  b.cyl(0.08, 0.08, 0.1, { color: '#e2402f', pos: [-0.43, 0.14, 0], rot: m, seg: 8 });
  return b.geo(true);
}
function litterCan(): THREE.BufferGeometry {
  const b = new Build(12);
  const m = [0, 0, Math.PI / 2] as [number, number, number];
  b.cyl(0.14, 0.14, 0.34, { color: '#e0352c', pos: [0, 0.13, 0], rot: m, seg: 9 });
  b.cyl(0.143, 0.143, 0.08, { color: '#fff3e0', pos: [0.02, 0.13, 0], rot: m, seg: 9 });
  b.cyl(0.11, 0.14, 0.04, { color: '#c3cad2', pos: [-0.19, 0.13, 0], rot: m, seg: 9 });
  b.cyl(0.14, 0.11, 0.04, { color: '#c3cad2', pos: [0.19, 0.13, 0], rot: m, seg: 9 });
  return b.geo(true);
}
function litterBag(): THREE.BufferGeometry {
  const b = new Build(13);
  b.ball(0.32, { color: '#e9e4d6', top: '#ffffff', scale: [1.1, 0.5, 0.85], pos: [0, 0.12, 0], rough: 0.09, roughScale: 3.2, seg: 10 });
  b.bar([0.16, 0.24, 0], [0.32, 0.4, 0.08], 0.05, 0.02, { color: '#f7f3e8', seg: 5 });
  b.bar([0.18, 0.24, 0.02], [0.2, 0.42, -0.1], 0.05, 0.02, { color: '#f7f3e8', seg: 5 });
  return b.geo(true);
}

function crab(): THREE.BufferGeometry {
  const b = new Build(21);
  b.ball(0.3, { color: '#d9462c', top: '#ff8a55', scale: [0.78, 0.5, 1.08], pos: [0, 0.2, 0], seg: 10 });
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++)
      b.tube(
        [
          [-0.08 + i * 0.06 - 0.06, 0.18, s * 0.26],
          [-0.12 + i * 0.1 - 0.06, 0.28, s * 0.46],
          [-0.14 + i * 0.14 - 0.06, 0.01, s * 0.6],
        ],
        () => 0.035,
        { color: '#c43d26', seg: 4, rings: 4, sway: 0 }
      );
    b.bar([0.14, 0.18, s * 0.22], [0.36, 0.2, s * 0.32], 0.05, 0.06, { color: '#d9462c', seg: 5 });
    b.ball(0.12, { color: '#e8583a', top: '#ffa070', scale: [1.25, 0.7, 0.8], pos: [0.46, 0.22, s * 0.28], seg: 7 });
    b.cyl(0.02, 0.025, 0.16, { color: '#c43d26', pos: [0.18, 0.36, s * 0.1], seg: 5 });
    b.ball(0.06, { color: '#fff8ee', pos: [0.19, 0.46, s * 0.1], seg: 6 });
    b.ball(0.034, { color: '#1c1410', pos: [0.235, 0.47, s * 0.1], seg: 5 });
  }
  return b.geo(true);
}

interface Crab {
  z: number;
  tz: number;
  home: number;
  inland: number;
  wait: number;
  step: number;
}

/**
 * What the tide leaves on the sand. Shells and coconuts are always there; plastic thins out as the
 * lagoon heals, so the beach itself keeps score.
 */
export class Beach {
  readonly group = new THREE.Group();
  readonly dynGroup = new THREE.Group();
  private litter: { mesh: THREE.InstancedMesh; full: number; shown: number }[] = [];
  private crabs: Crab[] = [];
  private crabMesh: THREE.InstancedMesh;
  private r = rng(818);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private e = new THREE.Euler();

  constructor() {
    const r = this.r;
    const staticPair = toon({ isStatic: true });
    const dynPair = toon({ isStatic: false });
    const staticInk = outlineMaterial(1.25, '#33190f', { isStatic: true });
    const dynInk = outlineMaterial(1.25, '#33190f');
    const pier = { x: toX(VILLAGE_PIER.x), z: toZ(VILLAGE_PIER.y) };
    const net = { x: toX(COLLECTOR_NET.x), z: toZ(COLLECTOR_NET.y) };
    const taken: [number, number, number][] = [];

    const place = (n: number, gap: number, lo: number, hi: number, s0: number, s1: number): Inst[] => {
      const out: Inst[] = [];
      for (let k = 0; k < n * 14 && out.length < n; k++) {
        const z = lerp(-48, 43, r());
        const bw = beachWidth(z);
        const x = shoreAt(z) - lerp(lo, Math.max(lo + 0.3, bw - hi), r());
        if (Math.abs(z - pier.z) < 2.4 || Math.hypot(x - net.x, z - net.z) < 8.6 || pathAmount(x, z) > 0.45) continue;
        if (taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < gap + t[2])) continue;
        taken.push([x, z, gap]);
        out.push({
          m: matrixOf([x, groundAt(x, z) - 0.02, z], [(r() - 0.5) * 0.2, r() * 6.28, (r() - 0.5) * 0.2], lerp(s0, s1, r())),
          color: new THREE.Color().setScalar(lerp(0.92, 1.06, r())),
          i: [r(), r(), 0, 0],
        });
      }
      return out;
    };
    const put = (geo: THREE.BufferGeometry, items: Inst[], dyn = false): THREE.InstancedMesh => {
      const m = instanced(geo, dyn ? dynPair : staticPair, items, { ink: dyn ? dynInk : staticInk });
      (dyn ? this.dynGroup : this.group).add(m);
      return m;
    };

    put(driftwood(8), place(7, 1.5, 1.8, 1, 0.8, 1.15));
    put(driftwood(9), place(5, 1.5, 2.2, 0.6, 0.55, 0.85));
    put(coconut(false), place(11, 0.6, 2.0, 0.2, 0.85, 1.15));
    put(coconut(true), place(8, 0.6, 2.2, 0, 0.85, 1.1));
    put(scallop(), place(20, 0.5, 1.0, 1.6, 0.75, 1.2));
    put(whelk(), place(14, 0.5, 1.0, 1.8, 0.75, 1.2));
    put(starfish(), place(11, 0.6, 0.8, 3, 0.8, 1.15));
    const trash = (geo: THREE.BufferGeometry, n: number): void => {
      const items = place(n, 0.9, 0.9, 1.2, 0.95, 1.25);
      this.litter.push({ mesh: put(geo, items), full: items.length, shown: items.length });
    };
    trash(litterBottle(), 14);
    trash(litterCan(), 9);
    trash(litterBag(), 11);

    const N = 9;
    const items: Inst[] = [];
    for (let i = 0; i < N; i++) {
      const home = lerp(-40, 38, (i + r() * 0.7) / N);
      const z = Math.abs(home - pier.z) < 4 ? home + 6 : home;
      this.crabs.push({ z, tz: z, home: z, inland: lerp(1.6, 3.4, r()), wait: r() * 3, step: r() * 6 });
      items.push({ m: new THREE.Matrix4(), color: new THREE.Color().setScalar(lerp(0.9, 1.08, r())), i: [r(), 0, 0, 0] });
    }
    this.crabMesh = put(crab(), items, true);
  }

  /** Returns true when beach litter count changed, so a cached static layer can refresh. */
  update(dt: number, eco: number): boolean {
    let litterChanged = false;
    const left = 1 - smooth(0.18, 0.82, eco);
    for (const l of this.litter) {
      const want = Math.round(l.full * left);
      if (want !== l.shown) {
        l.shown = want;
        setCount(l.mesh, want);
        litterChanged = true;
      }
    }

    this.crabs.forEach((c, i) => {
      c.wait -= dt;
      if (c.wait <= 0) {
        c.wait = lerp(0.8, 4.2, this.r());
        c.tz = c.home + (this.r() - 0.5) * 8;
      }
      // crabs only ever go sideways, in a rush
      const v = clamp((c.tz - c.z) * 5, -3.6, 3.6);
      c.z += v * dt;
      c.step += Math.abs(v) * dt * 9;
      const run = Math.min(1, Math.abs(v));
      const x = shoreAt(c.z) - c.inland;
      this.p.set(x, groundAt(x, c.z) + Math.abs(Math.sin(c.step)) * 0.06 * run, c.z);
      this.e.set(Math.sin(c.step) * 0.12 * run, Math.sin(i * 2.3) * 0.25, 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(0.66 + (i % 3) * 0.1);
      this.m4.compose(this.p, this.q, this.s);
      this.crabMesh.setMatrixAt(i, this.m4);
    });
    this.crabMesh.instanceMatrix.needsUpdate = true;
    return litterChanged;
  }
}
