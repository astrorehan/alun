import * as THREE from 'three';
import type { GameSimulation } from '../simulation';
import type { ComputedStats } from '../types';
import { COLLECTOR_NET } from '../world';
import { Build, hex, type Vec } from './build';
import { GLSL_CACHED_UNDERWATER, GLSL_UNDERWATER_END, outlineMaterial, qualityDefines, toon, type ToonPair } from './gfx';
import { Q } from './quality';
import { inked, mesh } from './kit';
import { clamp, groundAt, lerp, netRadii, rng, smooth, toX, toZ } from './space';
import { person, propPair } from './village';
import { FLOAT_HEAD, type Water } from './water';

const CX = toX(COLLECTOR_NET.x);
const CZ = toZ(COLLECTOR_NET.y);
const DEG = Math.PI / 180;
/** Posts span the landward side; past this the arc is only floats, following the capture circle. */
const POST_END = 78 * DEG;
const BOOM_END = 33 * DEG;

const _c = new THREE.Color();

export interface DropSpot {
  p: THREE.Vector3;
  kick: number;
}

/**
 * Jaring Desa: a bamboo fish-weir, not a circle. Posts and curtain on the beach side, floating booms on
 * the sea side that trace the real capture radius, a sorting deck where the catch actually ends up.
 */
export class Net {
  readonly staticGroup = new THREE.Group();
  readonly group = new THREE.Group();
  readonly center = new THREE.Vector3(CX, 0, CZ);
  readonly lamps: { p: THREE.Vector3; r: number; c: THREE.Vector3 }[] = [];
  readonly bins: DropSpot[] = [];
  private binMeshes: THREE.Mesh[] = [];
  private heaps: THREE.Mesh[] = [];
  private heapFill = [0.25, 0.25, 0.25];
  private simR = -1;
  private uPulse = { value: 0 };
  private uC = { value: new THREE.Vector2(CX, CZ) };
  private staticStill: ToonPair;
  private staticInk: THREE.ShaderMaterial;
  private staticCloth: ToonPair;
  private still: ToonPair;
  private stillInk: THREE.ShaderMaterial;
  private floaty: ToonPair;
  private floatyInk: THREE.ShaderMaterial;
  private bagRope: ToonPair;
  private twine: ToonPair;
  private cloth: ToonPair;
  private signPair: ToonPair;
  private staticBuilt = new THREE.Group();
  private built = new THREE.Group();
  private keeper: THREE.Mesh | null = null;
  private cheer = 0;
  private parasol: THREE.Mesh | null = null;
  private signDirty = false;

  constructor(water: Water) {
    const uniforms = { ...water.shared, uPulse: this.uPulse, uNetC: this.uC };
    const head = `${FLOAT_HEAD()}
uniform float uPulse; uniform vec2 uNetC;`;
    const ride = (anchor: string, tilt: string): string => /* glsl */ `
      float fk = aFx.y;
      vec2 rd = normalize(wp.xz - uNetC + 1e-4);
      if (fk > 0.){
        float a_, b_;
        vec2 ax = ${anchor};
        vec3 q = waterPos(ax, a_, b_);
        ${tilt}
        wp.xyz += (q - vec3(ax.x, 0., ax.y)) * fk;
      }
      float bz = sin(uTime * 34. + dot(wp.xz, vec2(1.3, 1.7))) * uPulse;
      wp.xz += rd * (bz * .1 + uPulse * .16 * fk);
      wp.y += uPulse * .22 * fk;
    `;
    // a float is one solid: it leans with the slope of the water under it
    const solid = ride(
      'uv',
      /* glsl */ `
        #ifndef LITE
        vec2 sl = vec2(waterPos(ax + vec2(.4, 0.), a_, b_).y, waterPos(ax + vec2(0., .4), a_, b_).y) - q.y;
        sl = clamp(sl / .4, -.75, .75) * fk;
        vec3 rel = wp.xyz - vec3(ax.x, 0., ax.y);
        wp.y += dot(sl, rel.xz);
        wp.xz -= sl * rel.y * .85;
        #endif`
    );
    const loose = ride('wp.xz', '');
    const lampFx = /* glsl */ `
      float lampy = step(.45, vFx.w);
      alb *= mix(1., mix(.3, 1., sat(uLampI)), lampy);
      emis = vFx.w * mix(1., .1 + 2.1 * uLampI, lampy);
    `;
    const stillPulse = 'wp.xz += normalize(wp.xz - uNetC + 1e-4) * sin(uTime * 34. + wp.x * 1.3 + wp.z * 1.7) * uPulse * .07 * smoothstep(-.4, 1.6, wp.y);';
    this.staticStill = toon({ isStatic: true, uniforms, vHead: 'uniform float uPulse; uniform vec2 uNetC;', vWorld: stillPulse, fAlbedo: lampFx });
    this.staticInk = outlineMaterial(1.35, '#33190f', { isStatic: true });
    this.staticCloth = propPair(THREE.DoubleSide, true);
    this.still = toon({ uniforms, vHead: 'uniform float uPulse; uniform vec2 uNetC;', vWorld: stillPulse, fAlbedo: lampFx });
    this.stillInk = outlineMaterial(1.35, '#33190f');
    this.floaty = toon({ side: THREE.DoubleSide, uniforms, vHead: head, vWorld: solid, fAlbedo: lampFx });
    this.floatyInk = outlineMaterial(1.35, '#33190f', { uniforms, defines: qualityDefines(), vHead: head, vWorld: solid });
    const netUnderBlend = GLSL_UNDERWATER_END;
    this.bagRope = toon({
      side: THREE.DoubleSide,
      uniforms,
      vHead: head,
      vWorld: loose,
      fHead: GLSL_CACHED_UNDERWATER,
      fAlbedo: lampFx,
      fEnd: netUnderBlend,
    });
    const weave = /* glsl */ `
      vec2 q_ = vec2(vUv2.x + vUv2.y, vUv2.x - vUv2.y);
      vec2 f_ = abs(fract(q_) - .5);
      vec2 w_ = fwidth(q_);
      vec2 l_ = smoothstep(.5 - vFx.z - w_, .5 - vFx.z + w_ * .6, f_);
      float knot_ = smoothstep(.3, .22, length(.5 - f_) / (vFx.z * 8.));
      float a_ = max(max(l_.x, l_.y), knot_ * .0);
      outA = a_;
      #ifdef MSAA
      if (a_ < .06) discard;
      #else
      // no coverage samples: thin the twine with a stable screen-door pattern
      if (a_ < .12 + .7 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))))) discard;
      #endif
    `;
    this.twine = toon({
      side: THREE.DoubleSide,
      uniforms,
      vHead: head,
      vWorld: loose,
      fHead: `uniform float uPulse;\n${GLSL_CACHED_UNDERWATER}`,
      fAlbedo: `${weave}
        gloss = 0.; alb = mix(alb, vec3(1., .78, .3), uPulse * .8); emis = uPulse * .5 + .34;`,
      fEnd: netUnderBlend,
      fDepth: `float outA; ${weave}`,
      alphaToCoverage: true,
    });
    this.cloth = propPair(THREE.DoubleSide, false);
    this.signPair = toon({
      isStatic: true,
      uniforms: { tSign: { value: signTexture(() => { this.signDirty = true; }) } },
      fHead: 'uniform sampler2D tSign;',
      fAlbedo: 'alb = texture2D(tSign, vUv2).rgb;',
    });
    this.staticGroup.add(this.staticBuilt);
    this.group.add(this.built);
  }

  setCachedMode(on: boolean): void {
    for (const m of [this.twine.material, this.bagRope.material]) {
      m.transparent = on;
      m.depthTest = !on;
      m.depthWrite = !on;
      if (Boolean(m.defines.CACHED_UNDER) !== on) {
        if (on) m.defines.CACHED_UNDER = 1;
        else delete m.defines.CACHED_UNDER;
        m.needsUpdate = true;
      }
    }
    const wantLite = Q.lite;
    if (Boolean(this.floatyInk.defines.LITE) !== wantLite) {
      if (wantLite) this.floatyInk.defines.LITE = 1;
      else delete this.floatyInk.defines.LITE;
      this.floatyInk.needsUpdate = true;
    }
  }

  /** Arc position. Ellipse toward the beach, the true capture circle toward the sea. */
  private at(th: number, k = 1): { x: number; z: number } {
    const { rx, rz } = netRadii(this.simR);
    const c = Math.cos(th);
    const s = Math.sin(th);
    return { x: CX + (c < 0 ? rx : rz) * c * k, z: CZ + rz * s * k };
  }

  private rebuild(simRadius: number, level: number): void {
    this.simR = simRadius;
    for (const grp of [this.built, this.staticBuilt]) {
      grp.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      grp.clear();
    }
    this.lamps.length = 0;
    this.bins.length = 0;
    this.binMeshes.length = 0;
    this.heaps.length = 0;

    const r = rng(77);
    const st = new Build(31);
    const fl = new Build(32);
    fl.anchors = true;
    const br = new Build(35);
    const tw = new Build(33);
    const cl = new Build(34);
    const { rx, rz } = netRadii(simRadius);

    /* ---- walk the arc at even spacing */
    const arc: { x: number; z: number; th: number; s: number }[] = [];
    {
      let s = 0;
      let prev = this.at(POST_END);
      const N = 400;
      for (let i = 0; i <= N; i++) {
        const th = lerp(POST_END, 2 * Math.PI - POST_END, i / N);
        const p = this.at(th);
        s += Math.hypot(p.x - prev.x, p.z - prev.z);
        arc.push({ ...p, th, s });
        prev = p;
      }
    }
    const total = arc[arc.length - 1].s;
    const along = (s: number): { x: number; z: number; th: number } => {
      const t = clamp(s, 0, total);
      let i = 1;
      while (i < arc.length - 1 && arc[i].s < t) i++;
      const a = arc[i - 1];
      const b = arc[i];
      const k = (t - a.s) / Math.max(1e-5, b.s - a.s);
      return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), th: lerp(a.th, b.th, k) };
    };
    const nP = Math.max(9, Math.round(total / 1.75));
    const gap = total / nP;

    /* ---- bamboo posts */
    const bamboo = (a: Vec, c: Vec, ra: number, rb: number): void => {
      const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      st.bar(a, c, ra, rb, {
        color: (p) => _c.set('#d6ad55').lerp(hex('#6e5a34'), smooth(0.32, -0.16, p.y)),
        seg: 8,
        vary: 0.08,
      });
      const k = Math.round(len / 0.62);
      for (let i = 1; i < k; i++) {
        const t = i / k;
        const p: Vec = [lerp(a[0], c[0], t), lerp(a[1], c[1], t), lerp(a[2], c[2], t)];
        st.cyl(lerp(ra, rb, t) * 1.14, lerp(ra, rb, t) * 1.14, 0.07, { color: '#a67f34', pos: p, seg: 8 });
      }
    };
    const tops: Vec[] = [];
    for (let i = 0; i <= nP; i++) {
      const p = along(i * gap);
      const end = i === 0 || i === nP;
      const gy = Math.min(groundAt(p.x, p.z), 0);
      if (end) {
        const h = 4.1;
        st.bar([p.x, gy - 0.6, p.z], [p.x, h, p.z], 0.27, 0.2, {
          color: (q) => _c.set(q.y < 0.3 ? '#6e5a34' : '#fbf6ea'),
          seg: 10,
        });
        st.bar([p.x, -0.1, p.z], [p.x, 0.72, p.z], 0.29, 0.286, { color: '#e2342f', seg: 10 });
        st.bar([p.x, 1.4, p.z], [p.x, 2.1, p.z], 0.276, 0.268, { color: '#e2342f', seg: 10 });
        st.bar([p.x, 2.8, p.z], [p.x, 3.5, p.z], 0.258, 0.246, { color: '#e2342f', seg: 10 });
        st.ball(0.3, { color: '#f7c948', pos: [p.x, h + 0.16, p.z], seg: 9, gloss: 0.5 });
        // lantern on a short arm
        const dir = Math.sign(p.z - CZ);
        const lx = p.x + 0.85;
        const lz = p.z + dir * 0.15;
        st.bar([p.x, h - 0.5, p.z], [lx, h - 0.2, lz], 0.07, 0.055, { color: '#7a5233' });
        st.bar([lx, h - 0.22, lz], [lx, h - 0.5, lz], 0.02, 0.02, { color: '#2a2018' });
        st.cyl(0.2, 0.25, 0.44, { color: '#ffd480', pos: [lx, h - 0.74, lz], seg: 9, glow: 1 });
        st.cyl(0.06, 0.28, 0.18, { color: '#3a2c20', pos: [lx, h - 0.44, lz], seg: 9 });
        st.cyl(0.25, 0.22, 0.08, { color: '#3a2c20', pos: [lx, h - 0.98, lz], seg: 9 });
        this.lamps.push({ p: new THREE.Vector3(lx, h - 0.74, lz), r: 10, c: new THREE.Vector3(0.7, 0.36, 0.11) });
        tops.push([p.x, 1.5, p.z]);
      } else {
        const h = 1.55 + (i % 2) * 0.22 + (r() - 0.5) * 0.16;
        const lean = (r() - 0.5) * 0.16;
        bamboo([p.x - lean * 0.4, gy - 0.5, p.z], [p.x + lean, h, p.z + (r() - 0.5) * 0.1], 0.175, 0.14);
        st.cyl(0.17, 0.17, 0.16, { color: '#f0e0b4', pos: [p.x + lean * 0.8, 1.17, p.z], seg: 8 });
        st.cyl(0.18, 0.18, 0.12, { color: '#e2342f', pos: [p.x + lean, h - 0.06, p.z], seg: 8 });
        tops.push([p.x + lean * 0.8, 1.17, p.z]);
      }
    }

    /* ---- ropes: two sagging lines post to post, so the outline of the net is never a perfect curve */
    const rope = (b: Build, a: Vec, c: Vec, sag: number, rad: number, color: string, sway = 0): void => {
      b.tube(
        [a, [lerp(a[0], c[0], 0.25), lerp(a[1], c[1], 0.25) - sag * 0.75, lerp(a[2], c[2], 0.25)], [lerp(a[0], c[0], 0.5), lerp(a[1], c[1], 0.5) - sag, lerp(a[2], c[2], 0.5)], [lerp(a[0], c[0], 0.75), lerp(a[1], c[1], 0.75) - sag * 0.75, lerp(a[2], c[2], 0.75)], c],
        () => rad,
        { color, seg: 5, rings: 8, sway }
      );
    };
    for (let i = 0; i < tops.length - 1; i++) rope(st, tops[i], tops[i + 1], 0.2, 0.075, '#f0e0b4');

    /* ---- curtain: diamond mesh hung from the rope down to the seabed */
    const CELL = 0.82;
    {
      const cols = nP * 5;
      const rows = 7;
      const pos: number[] = [];
      const uv: number[] = [];
      const P = (i: number, j: number): { p: Vec; u: number; v: number } => {
        const s = (i / cols) * total;
        const a = along(s);
        const f = (i / cols) * nP - Math.floor(((i / cols) * nP) % nP);
        const sag = Math.sin(clamp(f, 0, 1) * Math.PI);
        const gy = Math.min(groundAt(a.x, a.z), -0.05);
        const y = lerp(1.17 - sag * 0.2, gy + 0.03, j / rows);
        const ox = a.x - CX;
        const oz = a.z - CZ;
        const ol = Math.hypot(ox, oz) || 1;
        const belly = sag * 0.2 * Math.sin((j / rows) * Math.PI);
        return { p: [a.x + (ox / ol) * belly, y, a.z + (oz / ol) * belly], u: s / CELL, v: y / CELL };
      };
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
          for (const k of [0, 3, 1, 1, 3, 2]) {
            pos.push(...q[k].p);
            uv.push(q[k].u, q[k].v);
          }
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      g.computeVertexNormals();
      tw.add(g, {
        color: (p) => _c.set('#ff9a3d').lerp(hex('#ffe2a0'), smooth(0.1, 1.1, p.y) * 0.7).lerp(hex('#d8611f'), smooth(-0.1, -0.9, p.y) * 0.6),
        sway: (p) => 0.9 * Math.exp(-Math.pow((p.y - 0.05) / 0.4, 2)),
        gloss: 0.105,
        ao: 1,
      });
    }

    /* ---- the bag: a sagging bowl of mesh just under the surface, roped to every post */
    const front = Math.cos(POST_END) * rz;
    const bowl = (a: number, s: number): Vec => {
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      let k = s;
      const ex = (cs < 0 ? rx : rz) * cs;
      if (ex > front) k *= front / ex;
      const x = CX + (cs < 0 ? rx : rz) * cs * k;
      const z = CZ + rz * sn * k;
      const y = -0.14 - 0.62 * (1 - s * s);
      return [x, Math.max(y, groundAt(x, z) + 0.07), z];
    };
    {
      const A = 64;
      const R = 9;
      const pos: number[] = [];
      const uv: number[] = [];
      for (let i = 0; i < A; i++)
        for (let j = 0; j < R; j++) {
          const q = [bowl((i / A) * 6.28319, j / R), bowl(((i + 1) / A) * 6.28319, j / R), bowl(((i + 1) / A) * 6.28319, (j + 1) / R), bowl((i / A) * 6.28319, (j + 1) / R)];
          for (const k of [0, 1, 3, 1, 2, 3]) {
            pos.push(...q[k]);
            uv.push((q[k][0] - CX) / 0.92, (q[k][2] - CZ) / 0.92);
          }
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      g.computeVertexNormals();
      tw.add(g, { color: '#ff8f2e', sway: 0.35, gloss: 0.12 });
    }
    // gathering ropes of the bag
    for (let i = 0; i <= nP; i += 2) {
      const p = along(i * gap);
      const a = Math.atan2((p.z - CZ) / rz, (p.x - CX) / (p.x < CX ? rx : rz));
      const pts: Vec[] = [];
      for (let k = 0; k <= 4; k++) {
        const q = bowl(a, 1 - k / 5);
        pts.push([q[0], q[1] + 0.03, q[2]]);
      }
      br.tube(pts, () => 0.07, { color: '#ffd9a0', seg: 4, rings: 8, sway: 0.35, glow: 0.2 });
    }
    br.add(new THREE.TorusGeometry(1.0, 0.1, 5, 24), { color: '#ffd9a0', glow: 0.2, pos: [CX, Math.max(-0.7, groundAt(CX, CZ) + 0.12), CZ], rot: [Math.PI / 2, 0, 0], sway: 0.35 });

    /* ---- float line */
    const float = (x: number, z: number, rad: number, col: string, yaw: number): void => {
      fl.ball(rad, { color: col, pos: [x, 0.12, z], scale: [1, 0.86, 1.18], rot: [0, yaw, 0], seg: 10, sway: 1, gloss: 0.45, anchor: [x, z] });
      fl.add(new THREE.TorusGeometry(rad * 1.0, rad * 0.16, 5, 12), { color: '#3a2c20', pos: [x, 0.12, z], rot: [0, yaw, 0], scale: [1, 0.86, 1], sway: 1, anchor: [x, z] });
    };
    const fN = Math.round(total / 0.86);
    const ringPts: Vec[] = [];
    for (let i = 0; i <= fN; i++) {
      const p = along((i / fN) * total);
      const ox = p.x - CX;
      const oz = p.z - CZ;
      const ol = Math.hypot(ox, oz);
      const x = p.x + (ox / ol) * 0.34;
      const z = p.z + (oz / ol) * 0.34;
      ringPts.push([x, 0.06, z]);
      if (i > 0 && i < fN) float(x, z, 0.3, i % 4 === 0 ? '#e2342f' : i % 2 ? '#ff8a2a' : '#fff6e4', -p.th + Math.PI / 2 + Math.PI / 2);
    }
    fl.tube(ringPts, () => 0.07, { color: '#f0e0b4', seg: 5, rings: fN * 2, sway: 1 });

    /* ---- booms: floats along the true capture circle, ending in a flagged marker buoy */
    for (const s of [1, -1]) {
      const pts: Vec[] = [];
      const len = (POST_END - BOOM_END) * rz;
      const n = Math.max(4, Math.round(len / 0.82));
      for (let i = 0; i <= n; i++) {
        const th = lerp(POST_END, BOOM_END, i / n) * s;
        const p = this.at(th);
        pts.push([p.x, 0.06, p.z]);
        if (i > 0 && i < n) float(p.x, p.z, lerp(0.34, 0.27, i / n), i % 2 ? '#fff6e4' : '#ff8a2a', -th);
      }
      fl.tube(pts, () => 0.075, { color: '#f0e0b4', seg: 5, rings: n * 2, sway: 1 });
      // short skirt under the boom
      const pos: number[] = [];
      const uv: number[] = [];
      for (let i = 0; i < n * 3; i++) {
        const a = this.at(lerp(POST_END, BOOM_END, i / (n * 3)) * s);
        const c = this.at(lerp(POST_END, BOOM_END, (i + 1) / (n * 3)) * s);
        const u0 = (len * i) / (n * 3) / CELL;
        const u1 = (len * (i + 1)) / (n * 3) / CELL;
        const q: [Vec, number, number][] = [
          [[a.x, 0.02, a.z], u0, 0],
          [[c.x, 0.02, c.z], u1, 0],
          [[c.x, -0.72, c.z], u1, -0.9],
          [[a.x, -0.72, a.z], u0, -0.9],
        ];
        for (const k of [0, 3, 1, 1, 3, 2]) {
          pos.push(...q[k][0]);
          uv.push(q[k][1], q[k][2]);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      g.computeVertexNormals();
      tw.add(g, { color: '#f08a34', sway: (p) => (p.y > -0.2 ? 1 : 0.5), gloss: 0.1 });
      // marker
      const m = this.at(BOOM_END * s);
      const anchor: [number, number] = [m.x, m.z];
      fl.ball(0.62, { color: (p) => _c.set(p.y > 0.28 ? '#fff6e4' : '#e2342f'), pos: [m.x, 0.2, m.z], seg: 14, sway: 1, gloss: 0.45, anchor });
      fl.bar([m.x, 0.6, m.z], [m.x, 3.0, m.z], 0.09, 0.06, { color: '#f6efe0', sway: 1, anchor });
      fl.ball(0.11, { color: '#f7c948', pos: [m.x, 3.05, m.z], seg: 7, sway: 1, glow: 0.5, anchor });
      const N = 7;
      for (let i = 0; i < N; i++) {
        const a = i / N;
        const c = (i + 1) / N;
        const h = (t: number): number => 0.5 * (1 - t) + 0.02;
        fl.quad([m.x + a * 1.3, 2.5 + h(a), m.z], [m.x + a * 1.3, 2.5 - h(a), m.z], [m.x + c * 1.3, 2.5 - h(c), m.z], [m.x + c * 1.3, 2.5 + h(c), m.z], { color: i % 2 ? '#fff6e4' : '#e2342f', sway: 1, anchor });
      }
    }

    /* ---- sorting deck behind the net */
    const back = CX - rx;
    const dx = back - 1.35;
    const dz = CZ;
    const dy = 1.05;
    const DW = 2.5;
    const DL = 5.4;
    for (let z = -DL / 2; z < DL / 2; z += 0.4) st.box(DW + (r() - 0.5) * 0.25, 0.12, 0.35, { color: ['#c9a25a', '#b98e48', '#d6b068', '#a98040'][Math.floor(r() * 4)], pos: [dx + (r() - 0.5) * 0.1, dy + (r() - 0.5) * 0.03, dz + z + 0.2], rot: [(r() - 0.5) * 0.03, (r() - 0.5) * 0.05, 0], r: 0.03, vary: 0.06 });
    for (const sx of [-1, 1]) st.bar([dx + sx * 1.05, dy - 0.14, dz - DL / 2], [dx + sx * 1.05, dy - 0.14, dz + DL / 2], 0.12, 0.12, { color: '#8c6a3a' });
    for (const sx of [-1, 1])
      for (const z of [-DL / 2 + 0.2, 0, DL / 2 - 0.2]) {
        const gx = dx + sx * 1.1;
        bamboo([gx, groundAt(gx, dz + z) - 0.4, dz + z], [gx, dy + (sx < 0 ? 0.75 : 0.18), dz + z], 0.16, 0.14);
      }
    rope(st, [dx - 1.1, dy + 0.7, dz - DL / 2 + 0.2], [dx - 1.1, dy + 0.7, dz], 0.18, 0.05, '#f0e0b4');
    rope(st, [dx - 1.1, dy + 0.7, dz], [dx - 1.1, dy + 0.7, dz + DL / 2 - 0.2], 0.18, 0.05, '#f0e0b4');
    // gangway up the beach
    for (let i = 0; i < 9; i++) {
      const x = dx - 1.35 - i * 0.42;
      const y = Math.max(groundAt(x, dz + 1.4) + 0.16, lerp(dy, groundAt(dx - 4.6, dz + 1.4) + 0.12, i / 8));
      st.box(0.36, 0.1, 1.25, { color: i % 2 ? '#b98e48' : '#c9a25a', pos: [x, y, dz + 1.4 + (r() - 0.5) * 0.1], rot: [0, (r() - 0.5) * 0.1, -0.08], r: 0.02 });
    }

    /* ---- three sorting bins: where the catch lands */
    const binCols = ['#2f9c5a', '#f2b62c', '#2f7fc8'];
    for (let i = 0; i < 3; i++) {
      const b = new Build(50 + i);
      const p: Vec = [0, 0, 0];
      b.cyl(0.62, 0.5, 0.9, { color: binCols[i], pos: [p[0], 0.45, p[2]], seg: 14, gloss: 0.3, ao: (q) => lerp(0.7, 1, smooth(0, 0.6, q.y)) });
      b.cyl(0.69, 0.69, 0.14, { color: _c.set(binCols[i]).multiplyScalar(1.15).clone(), pos: [p[0], 0.9, p[2]], seg: 14, gloss: 0.3 });
      b.cyl(0.54, 0.54, 0.03, { color: '#2a2018', pos: [p[0], 0.96, p[2]], seg: 14 });
      b.box(0.42, 0.42, 0.05, { color: '#fff6e4', pos: [0, 0.48, 0.56], rot: [-0.08, 0, 0], r: 0.02 });
      b.add(new THREE.TorusGeometry(0.12, 0.035, 4, 10, 4.6), { color: binCols[i], pos: [0, 0.48, 0.6] });
      const bm = inked(mesh(b.geo(true), this.still), this.stillInk);
      bm.position.set(dx + 0.35, dy + 0.06, dz - 1.7 + i * 1.5);
      bm.frustumCulled = false;
      this.built.add(bm);
      this.binMeshes.push(bm);
      const h = new Build(60 + i);
      const junk = ['#7fd0e8', '#f4f1e6', '#e8604a', '#8fd06a', '#c9a25a', '#b7c4cc'];
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4;
        const rr = 0.36 * Math.sqrt(k / 9);
        const s = 0.14 + h.r() * 0.08;
        if (k % 3 === 0) h.box(s * 1.8, s * 1.4, s * 1.6, { color: junk[k % 6], pos: [Math.cos(a) * rr, 0.1 + (0.36 - rr) * 0.5, Math.sin(a) * rr], rot: [k, k * 2, k] });
        else if (k % 3 === 1) h.cyl(s * 0.6, s * 0.7, s * 2.6, { color: junk[k % 6], pos: [Math.cos(a) * rr, 0.1 + (0.36 - rr) * 0.5, Math.sin(a) * rr], rot: [k * 1.3, k, 0.6], seg: 7, gloss: 0.4 });
        else h.ball(s * 1.2, { color: junk[k % 6], pos: [Math.cos(a) * rr, 0.1 + (0.36 - rr) * 0.5, Math.sin(a) * rr], seg: 7, rough: 0.05 });
      }
      const hm = mesh(h.geo(), this.still);
      hm.position.set(bm.position.x, dy + 0.98, bm.position.z);
      hm.frustumCulled = false;
      this.built.add(hm);
      this.heaps.push(hm);
      this.bins.push({ p: new THREE.Vector3(bm.position.x, dy + 1.1, bm.position.z), kick: 0 });
    }

    /* ---- parasol over the deck */
    {
      const b = new Build(70);
      const N = 12;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * 6.28319;
        const a1 = ((i + 1) / N) * 6.28319;
        const col = i % 2 ? '#fff6e4' : '#e2342f';
        const R0 = 1.75;
        const p = (a: number, rr: number, y: number): Vec => [Math.cos(a) * rr, y, Math.sin(a) * rr];
        b.quad(p(a0, 0.02, 0.62), p(a0, R0 * 0.55, 0.42), p(a1, R0 * 0.55, 0.42), p(a1, 0.02, 0.62), { color: col });
        b.quad(p(a0, R0 * 0.55, 0.42), p(a0, R0, 0), p(a1, R0, 0), p(a1, R0 * 0.55, 0.42), { color: col });
        b.quad(p(a0, R0, 0), p((a0 + a1) / 2, R0 * 1.0, -0.2), p((a0 + a1) / 2, R0 * 1.0, -0.2), p(a1, R0, 0), { color: col });
      }
      b.ball(0.11, { color: '#f7c948', pos: [0, 0.7, 0], seg: 7 });
      b.bar([0, -2.4, 0], [0, 0.6, 0], 0.07, 0.06, { color: '#f6efe0' });
      const m = inked(mesh(b.geo(true), this.cloth), this.stillInk);
      m.position.set(dx - 0.5, dy + 2.4, dz - 1.75);
      m.rotation.z = 0.1;
      m.frustumCulled = false;
      this.built.add(m);
      this.parasol = m;
    }

    /* ---- the keeper */
    const k = inked(mesh(person({ shirt: '#ff8a2a', sarong: '#1f7f8a', hat: 'caping', scale: 1.12 }), this.still), this.stillInk);
    k.position.set(dx - 0.55, dy + 0.06, dz + 0.4);
    k.frustumCulled = false;
    this.built.add(k);
    this.keeper = k;

    /* ---- sign */
    {
      const sx = dx - 0.1;
      const sz = dz + DL / 2 + 1.0;
      const gy = groundAt(sx, sz);
      for (const s of [-1.45, 1.45]) bamboo([sx + s, gy - 0.4, sz], [sx + s, 2.5, sz - 0.1], 0.13, 0.11);
      const sb = new Build(71);
      const g = new THREE.BoxGeometry(3.7, 1.15, 0.16);
      sb.add(g, { color: '#ffffff' });
      const geo = sb.geo(true);
      const sm = inked(mesh(geo, this.signPair), this.staticInk);
      sm.position.set(sx, 1.85, sz + 0.12);
      sm.rotation.set(-0.5, 0, 0.02);
      sm.frustumCulled = false;
      this.staticBuilt.add(sm);
    }

    /* ---- umbul-umbul along the beach, and bunting tying it all together */
    const cols: [string, string][] = [
      ['#e83a6a', '#f7c948'],
      ['#1fa39a', '#f6efe0'],
      ['#f28a1f', '#e83a3a'],
      ['#7a4fc0', '#f7c948'],
    ];
    const nU = 2 + Math.min(4, level);
    for (let i = 0; i < nU; i++) {
      const z = CZ + lerp(-rz - 0.4, rz + 0.2, nU === 1 ? 0.5 : i / (nU - 1));
      const x = CX - rx - 3.4 - Math.abs(i / Math.max(1, nU - 1) - 0.5) * 0.6;
      umbul(cl, x, Math.max(groundAt(x, z), 0) - 0.2, z, 7.0 + (i % 2) * 0.6, cols[i % cols.length][0], cols[i % cols.length][1]);
    }
    const bunting = (a: Vec, c: Vec, sag: number): void => {
      const n = Math.round(Math.hypot(a[0] - c[0], a[2] - c[2]) / 0.62);
      const P = (t: number): Vec => [lerp(a[0], c[0], t), lerp(a[1], c[1], t) - Math.sin(t * Math.PI) * sag, lerp(a[2], c[2], t)];
      const pts: Vec[] = [];
      for (let i = 0; i <= 8; i++) pts.push(P(i / 8));
      cl.tube(pts, () => 0.035, { color: '#f0e0b4', seg: 4, rings: 18 });
      const pal = ['#e2342f', '#fff6e4', '#f7c948', '#1fa39a', '#f28a1f'];
      for (let i = 0; i < n; i++) {
        const p = P((i + 0.25) / n);
        const q = P((i + 0.75) / n);
        const tip: Vec = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 0.46, (p[2] + q[2]) / 2];
        cl.quad(p, tip, tip, q, { color: pal[i % pal.length], sway: (v) => (Math.abs(v.y - tip[1]) < 0.02 ? 0.12 : 0) });
      }
    };
    const eA = along(0);
    const eB = along(total);
    const mastX = dx - 1.2;
    st.bar([mastX, groundAt(mastX, dz), dz], [mastX, 5.0, dz], 0.13, 0.09, { color: '#d6ad55' });
    st.ball(0.15, { color: '#f7c948', pos: [mastX, 5.05, dz], seg: 8 });
    bunting([eA.x, 3.7, eA.z], [mastX, 4.8, dz], 0.9);
    bunting([eB.x, 3.7, eB.z], [mastX, 4.8, dz], 0.9);

    const add = (m: THREE.Mesh, isStatic = false): void => {
      m.frustumCulled = false;
      (isStatic ? this.staticBuilt : this.built).add(m);
    };
    add(inked(mesh(st.geo(true), this.staticStill), this.staticInk), true);
    const fm = inked(mesh(fl.geo(true), this.floaty), this.floatyInk);
    add(fm);
    add(mesh(br.geo(), this.bagRope, false));
    add(mesh(tw.geo(), this.twine));
    add(mesh(cl.geo(), this.staticCloth), true);
  }

  /** Something was caught: kick the bin it is heading for. Returns the landing spot. */
  target(slot: number): THREE.Vector3 {
    return this.bins[slot % 3]?.p ?? new THREE.Vector3(CX, 1, CZ);
  }
  land(slot: number): void {
    const b = this.bins[slot % 3];
    if (b) b.kick = 1;
    this.heapFill[slot % 3] = Math.min(1.25, this.heapFill[slot % 3] + 0.09);
    this.cheer = 1;
  }

  /** Returns true when static net geometry or sign texture changed so caches can refresh. */
  update(dt: number, t: number, sim: GameSimulation, stats: ComputedStats, level: number): boolean {
    let staticDirty = this.signDirty;
    this.signDirty = false;
    if (Math.abs(stats.netRadius - this.simR) > 0.5) {
      this.rebuild(stats.netRadius, level);
      staticDirty = true;
    }
    this.uPulse.value = sim.netPulse;
    this.cheer = Math.max(0, this.cheer - dt * 1.4);
    if (this.keeper) {
      const hop = Math.abs(Math.sin(t * 11)) * 0.4 * Math.min(1, this.cheer * 1.6);
      this.keeper.position.y = 1.11 + hop;
      this.keeper.rotation.y = 1.1 + Math.sin(t * 0.8) * 0.5;
    }
    if (this.parasol) this.parasol.rotation.x = Math.sin(t * 1.1) * 0.04;
    this.bins.forEach((b, i) => {
      b.kick = Math.max(0, b.kick - dt * 4.5);
      const k = Math.sin(b.kick * 9) * b.kick;
      this.binMeshes[i].scale.set(1 + k * 0.16, 1 - k * 0.2, 1 + k * 0.16);
      this.heapFill[i] = Math.max(0.3, this.heapFill[i] - dt * 0.02);
      const f = this.heapFill[i] * (1 + k * 0.25);
      this.heaps[i].scale.set(0.8 + f * 0.35, f * 1.3, 0.8 + f * 0.35);
    });
    return staticDirty;
  }
}

/** A tall festival banner on a bent bamboo, the kind that lines a village road on 17 August. */
function umbul(b: Build, x: number, y: number, z: number, h: number, c1: string, c2: string): void {
  const lean = 1.5;
  b.tube(
    [
      [x, y, z],
      [x + 0.02, y + h * 0.5, z],
      [x + 0.12, y + h * 0.82, z],
      [x + 0.5, y + h * 0.97, z],
      [x + lean, y + h * 0.94, z],
    ],
    (t) => lerp(0.095, 0.035, t),
    { color: '#d6ad55', seg: 6, rings: 14 }
  );
  const n = 14;
  const A = hex(c1);
  const B = hex(c2);
  const edge = (t: number): { a: number; c: number; yy: number } => ({
    a: x + 0.09 + (1 - t) * 0.16,
    c: x + 0.09 + lerp(lean * 0.95, 0.3, Math.pow(t, 1.3)),
    yy: y + h * lerp(0.93, 0.2, t),
  });
  for (let i = 0; i < n; i++) {
    const p = edge(i / n);
    const q = edge((i + 1) / n);
    b.quad([p.a, p.yy, z], [q.a, q.yy, z], [q.c, q.yy, z], [p.c, p.yy, z], {
      color: () => _c.copy(i % 4 === 3 ? B : A),
      sway: (v) => clamp((v.x - x - 0.12) * 0.5, 0, 0.42),
    });
  }
}

function signTexture(onFontReady?: () => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 240;
  const g = c.getContext('2d')!;
  const draw = (): void => {
    const r = rng(5);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = ['#a86a3a', '#b87844', '#9c6034', '#b27040'][i];
      g.fillRect(0, i * 60, 768, 60);
      g.strokeStyle = 'rgba(60,30,12,.28)';
      g.lineWidth = 2;
      for (let k = 0; k < 7; k++) {
        const y = i * 60 + r() * 58;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 768; x += 64) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 3);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,18,6,.6)';
      g.fillRect(0, i * 60 + 57, 768, 4);
    }
    g.strokeStyle = '#ffe9bd';
    g.lineWidth = 8;
    g.strokeRect(18, 18, 732, 204);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 118px Fredoka, "Baloo 2", "Trebuchet MS", sans-serif';
    g.fillStyle = 'rgba(50,20,6,.75)';
    g.fillText('JARING DESA', 388, 130, 690);
    g.fillStyle = '#fff3d6';
    g.fillText('JARING DESA', 384, 124, 690);
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  document.fonts
    ?.load('800 118px Fredoka')
    .then(() => {
      draw();
      t.needsUpdate = true;
      onFontReady?.();
    })
    .catch(() => {});
  return t;
}
