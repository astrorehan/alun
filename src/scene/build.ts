import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, noise3, rng, smooth, type Rng } from './space';

/**
 * Small modelling kit. Every prop in the scene is assembled from primitives into one merged
 * geometry with baked vertex colour, occlusion, sway, gloss and glow, so a whole house is one draw.
 */
export type Vec = [number, number, number];
export type Paint = string | THREE.Color | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color);

export interface Part {
  color: Paint;
  /** Second colour blended in toward the top of the part's own bounding box. */
  top?: string;
  pos?: Vec;
  rot?: Vec;
  scale?: Vec | number;
  matrix?: THREE.Matrix4;
  ao?: number | ((p: THREE.Vector3, n: THREE.Vector3) => number);
  sway?: number | ((p: THREE.Vector3) => number);
  gloss?: number;
  glow?: number;
  /** Random vertex displacement, in local units. */
  rough?: number;
  roughScale?: number;
  flat?: boolean;
  /** Random per-part brightness variation. */
  vary?: number;
  /** Point on the water (x, z) the whole part rides as one piece. Only read when the builder has `anchors` on. */
  anchor?: [number, number];
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

export function matrixOf(pos: Vec = [0, 0, 0], rot: Vec = [0, 0, 0], scale: Vec | number = 1): THREE.Matrix4 {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  if (typeof scale === 'number') _s.set(scale, scale, scale);
  else _s.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(new THREE.Vector3(pos[0], pos[1], pos[2]), _q, _s);
}

export class Build {
  private parts: THREE.BufferGeometry[] = [];
  /** Stores each vertex's anchor in uv, so floats move as solids instead of bending with the water. */
  anchors = false;
  readonly r: Rng;
  constructor(seed = 1) {
    this.r = rng(seed);
  }

  add(src: THREE.BufferGeometry, o: Part): this {
    let g = src.index ? src.toNonIndexed() : src.clone();
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    }
    g.morphAttributes = {};
    const pos = g.attributes.position as THREE.BufferAttribute;
    const n = pos.count;

    if (o.rough) {
      const f = o.roughScale ?? 1.4;
      const ox = this.r() * 100;
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        pos.setXYZ(
          i,
          x + noise3(x * f + ox, y * f, z * f) * o.rough,
          y + noise3(x * f + 31, y * f + ox, z * f) * o.rough,
          z + noise3(x * f, y * f + 57, z * f + ox) * o.rough
        );
      }
      if (!o.flat) smoothNormals(g);
    }
    if (o.flat) g.computeVertexNormals();

    g.computeBoundingBox();
    const lo = g.boundingBox!.min.y;
    const hi = g.boundingBox!.max.y;
    const localY = new Float32Array(n);
    for (let i = 0; i < n; i++) localY[i] = hi > lo ? (pos.getY(i) - lo) / (hi - lo) : 0;

    _m.copy(o.matrix ?? matrixOf(o.pos, o.rot, o.scale ?? 1));
    g.applyMatrix4(_m);

    const nor = g.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(n * 3);
    const fx = new Float32Array(n * 4);
    const base = typeof o.color === 'string' ? new THREE.Color(o.color) : o.color instanceof THREE.Color ? o.color : null;
    const top = o.top ? new THREE.Color(o.top) : null;
    const k = 1 + (this.r() - 0.5) * 2 * (o.vary ?? 0);
    for (let i = 0; i < n; i++) {
      _p.fromBufferAttribute(pos, i);
      _n.fromBufferAttribute(nor, i);
      if (base) _c.copy(base);
      else _c.copy((o.color as (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color)(_p, _n));
      if (top) _c.lerp(top, localY[i]);
      colors[i * 3] = _c.r * k;
      colors[i * 3 + 1] = _c.g * k;
      colors[i * 3 + 2] = _c.b * k;
      fx[i * 4] = typeof o.ao === 'function' ? o.ao(_p, _n) : (o.ao ?? 1);
      fx[i * 4 + 1] = typeof o.sway === 'function' ? o.sway(_p) : (o.sway ?? 0);
      fx[i * 4 + 2] = o.gloss ?? 0;
      fx[i * 4 + 3] = o.glow ?? 0;
    }
    if (this.anchors) {
      const uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        uv[i * 2] = o.anchor ? o.anchor[0] : pos.getX(i);
        uv[i * 2 + 1] = o.anchor ? o.anchor[1] : pos.getZ(i);
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    } else if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aFx', new THREE.BufferAttribute(fx, 4));
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, o: Part & { r?: number }): this {
    const r = o.r ?? Math.min(w, h, d) * 0.18;
    return this.add(r > 0 ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d), o);
  }

  cyl(rt: number, rb: number, h: number, o: Part & { seg?: number; hseg?: number; open?: boolean }): this {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 8, o.hseg ?? 1, o.open ?? false), o);
  }

  ball(r: number, o: Part & { seg?: number }): this {
    const s = o.seg ?? 10;
    return this.add(new THREE.SphereGeometry(r, s, Math.max(4, Math.round(s * 0.7))), o);
  }

  /** Stack elliptical cross-sections from bottom to top. Each ring gives height, half-width,
   * half-depth and an optional fore/aft offset. Shared corners keep the outline continuous. */
  profile(rings: [number, number, number, number?][], sides: number, o: Part): this {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const [y, width, depth, z = 0] of rings) {
      for (let i = 0; i < sides; i++) {
        const angle = ((i + 0.5) / sides) * Math.PI * 2;
        positions.push(width * Math.sin(angle), y, z + depth * Math.cos(angle));
      }
    }
    const last = (rings.length - 1) * sides;
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      for (let row = 0; row < last; row += sides) {
        const a = row + i;
        const b = row + next;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
      if (i > 0 && i < sides - 1) indices.push(0, next, i, last, last + i, last + next);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return this.add(g, o);
  }

  ico(r: number, detail: number, o: Part): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), o);
  }

  /** Round bar between two points. */
  bar(a: Vec, b: Vec, ra: number, rb: number, o: Part & { seg?: number; open?: boolean }): this {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    return this.add(new THREE.CylinderGeometry(rb, ra, len, o.seg ?? 6, 1, o.open ?? false), { ...o, matrix: m });
  }

  /** Tube along a polyline, radius may taper. */
  tube(pts: Vec[], radius: (t: number) => number, o: Part & { seg?: number; rings?: number }): this {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const rings = o.rings ?? pts.length * 3;
    const seg = o.seg ?? 6;
    const g = new THREE.TubeGeometry(curve, rings, 1, seg, false);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const c = new THREE.Vector3();
    for (let i = 0; i <= rings; i++) {
      curve.getPointAt(i / rings, c);
      const r = radius(i / rings);
      for (let j = 0; j <= seg; j++) {
        const k = i * (seg + 1) + j;
        pos.setXYZ(
          k,
          c.x + (pos.getX(k) - c.x) * r,
          c.y + (pos.getY(k) - c.y) * r,
          c.z + (pos.getZ(k) - c.z) * r
        );
      }
    }
    return this.add(g, o);
  }

  /** Flat quad strip through pairs of points, double sided use. */
  quad(a: Vec, b: Vec, c: Vec, d: Vec, o: Part): this {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
    g.computeVertexNormals();
    return this.add(g, o);
  }

  merge(other: THREE.BufferGeometry, m?: THREE.Matrix4): this {
    const g = other.clone();
    g.deleteAttribute('aSN');
    if (m) g.applyMatrix4(m);
    this.parts.push(g);
    return this;
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  geo(outline = false): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    if (outline) addOutlineNormals(g);
    g.computeBoundingSphere();
    return g;
  }
}

/** Recomputes normals as if vertices sharing a position were welded. */
export function smoothNormals(g: THREE.BufferGeometry): void {
  g.computeVertexNormals();
  const avg = averagedNormals(g);
  g.setAttribute('normal', new THREE.BufferAttribute(avg, 3));
}

function averagedNormals(g: THREE.BufferGeometry): Float32Array {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const count = pos.count;
  // Pack quantized xyz (250/m precision, +/-260 m range) into a safe 51-bit integer key to avoid string GC.
  const keys = new Float64Array(count);
  const idxMap = new Map<number, number>();
  const sums = new Float32Array(count * 3);
  let uniq = 0;
  for (let i = 0; i < count; i++) {
    const ix = Math.round(pos.getX(i) * 250) + 65536;
    const iy = Math.round(pos.getY(i) * 250) + 65536;
    const iz = Math.round(pos.getZ(i) * 250) + 65536;
    const k = (ix * 131072 + iy) * 131072 + iz;
    keys[i] = k;
    let slot = idxMap.get(k);
    if (slot === undefined) {
      slot = uniq++;
      idxMap.set(k, slot);
    }
    const o = slot * 3;
    sums[o] += nor.getX(i);
    sums[o + 1] += nor.getY(i);
    sums[o + 2] += nor.getZ(i);
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const o = idxMap.get(keys[i])! * 3;
    const ax = sums[o];
    const ay = sums[o + 1];
    const az = sums[o + 2];
    const l = Math.hypot(ax, ay, az) || 1;
    out[i * 3] = ax / l;
    out[i * 3 + 1] = ay / l;
    out[i * 3 + 2] = az / l;
  }
  return out;
}

export function addOutlineNormals(g: THREE.BufferGeometry): void {
  g.setAttribute('aSN', new THREE.BufferAttribute(averagedNormals(g), 3));
}

/** Chiselled boulder: a sphere sliced by random planes, so it reads as fractured stone. */
export function boulder(seed: number, o: { detail?: number; cuts?: number; stretch?: Vec; rough?: number } = {}): THREE.BufferGeometry {
  const r = rng(seed);
  const g = new THREE.IcosahedronGeometry(1, o.detail ?? 5);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const planes: { n: THREE.Vector3; d: number }[] = [];
  const cuts = o.cuts ?? 22;
  for (let i = 0; i < cuts; i++) {
    const n = new THREE.Vector3(r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1).normalize();
    planes.push({ n, d: 0.62 + r() * 0.3 });
  }
  const st = o.stretch ?? [1, 1, 1];
  const rough = o.rough ?? 0.035;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    for (const pl of planes) {
      const d = _p.dot(pl.n) - pl.d;
      if (d > 0) _p.addScaledVector(pl.n, -d);
    }
    const k = noise3(_p.x * 3.1 + seed, _p.y * 3.1, _p.z * 3.1) * rough + noise3(_p.x * 8, _p.y * 8 + seed, _p.z * 8) * rough * 0.4;
    _p.multiplyScalar(1 + k);
    pos.setXYZ(i, _p.x * st[0], _p.y * st[1], _p.z * st[2]);
  }
  smoothNormals(g);
  return g;
}

export const hex = (c: string): THREE.Color => new THREE.Color(c);
export const mixHex = (a: string, b: string, t: number): THREE.Color => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));
export { smooth };
