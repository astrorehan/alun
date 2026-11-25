import * as THREE from 'three';
import { toon, G } from './gfx';
import { Q } from './quality';
import {
  beachWidth,
  clamp,
  fbm,
  groundAt,
  mudAmount,
  noise2,
  reefAmount,
  seaward,
  shoreAt,
  smooth,
  toX,
  toZ,
  UNIT,
} from './space';
import { VILLAGE_PIER, COLLECTOR_NET, RAFFLESIA_POS, SEA_ROCKS, CORAL_CLUSTERS } from '../world';

const RECT = { x: -78, z: -78, w: 210, h: 146 };
const SHORE_N = 256;

/** Footpaths people have actually worn into the sand: forest to village, village to net, net to north beach. */
const pier = { x: toX(VILLAGE_PIER.x), z: toZ(VILLAGE_PIER.y) };
const net = { x: toX(COLLECTOR_NET.x), z: toZ(COLLECTOR_NET.y) };
const raff = { x: toX(RAFFLESIA_POS.x), z: toZ(RAFFLESIA_POS.y) };
export const PATHS: [number, number][][] = [
  [
    [pier.x - 1, pier.z],
    [pier.x - 4, pier.z - 3],
    [shoreAt(net.z + 6) - 5.2, net.z + 6],
    [shoreAt(net.z) - 4.6, net.z],
    [shoreAt(net.z - 7) - 5, net.z - 7],
    [shoreAt(raff.z + 4) - 6, raff.z + 4],
    [raff.x + 1.6, raff.z + 1.4],
  ],
  [
    [pier.x - 4, pier.z - 1],
    [pier.x - 11, pier.z - 4],
    [pier.x - 18, pier.z - 2],
    [pier.x - 30, pier.z - 8],
  ],
  [
    [pier.x - 8, pier.z + 2],
    [pier.x - 9, pier.z + 7],
    [pier.x - 6, pier.z + 11],
  ],
];

export function pathAmount(x: number, z: number): number {
  let best = 1e9;
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i];
      const [bx, bz] = p[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
  }
  return 1 - smooth(0.5, 1.7, best + noise2(x * 0.7, z * 0.7) * 0.5);
}

/** 0 on open sand, 1 under the trees. */
export function forestAmount(x: number, z: number): number {
  const b = -seaward(x, z);
  const bw = beachWidth(z);
  return smooth(bw - 1.4, bw + 1.8, b + fbm(x * 0.21, z * 0.21, 3) * 2.2);
}

export class Shore {
  private data = new Uint16Array(SHORE_N * 4);
  private tex: THREE.DataTexture;
  private shoreX = new Float32Array(SHORE_N);
  private surge = new Float32Array(SHORE_N);
  private surgeV = new Float32Array(SHORE_N);
  private wet = new Float32Array(SHORE_N);
  private run = new Float32Array(SHORE_N);
  readonly z0 = -70;
  readonly len = 140;

  constructor() {
    for (let i = 0; i < SHORE_N; i++) {
      const z = this.zAt(i);
      this.shoreX[i] = shoreAt(z);
      this.wet[i] = 0.2;
    }
    this.tex = new THREE.DataTexture(this.data, SHORE_N, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.wrapS = THREE.ClampToEdgeWrapping;
    G.uShoreTex.value = this.tex;
    G.uShoreRange.value.set(this.z0, this.len);
  }

  private zAt(i: number): number {
    return this.z0 + ((i + 0.5) / SHORE_N) * this.len;
  }

  /** A wave hit the beach: shove water up the sand around this Z. */
  push(z: number, halfWidth: number, strength: number): void {
    for (let i = 0; i < SHORE_N; i++) {
      const k = 1 - Math.abs(this.zAt(i) - z) / Math.max(1.5, halfWidth);
      if (k <= 0) continue;
      this.surgeV[i] = Math.max(this.surgeV[i], strength * k * (2 - k));
    }
  }

  runupAt(z: number): number {
    const f = clamp(((z - this.z0) / this.len) * SHORE_N - 0.5, 0, SHORE_N - 1);
    return this.run[Math.round(f)];
  }

  update(dt: number, t: number, swell: number): void {
    const th = THREE.DataUtils.toHalfFloat;
    for (let i = 0; i < SHORE_N; i++) {
      const z = this.zAt(i);
      // Ballistic uprush, then a slower backwash, the way swash actually moves.
      if (this.surgeV[i] !== 0 || this.surge[i] > 0) {
        this.surge[i] += this.surgeV[i] * dt;
        this.surgeV[i] -= (this.surgeV[i] > 0 ? 3.4 : 0.85) * dt;
        if (this.surge[i] <= 0) {
          this.surge[i] = 0;
          this.surgeV[i] = 0;
        }
      }
      const a = Math.sin(t * 0.92 + z * 0.085 + Math.sin(z * 0.21) * 1.2);
      const b = Math.sin(t * 0.57 - z * 0.05 + 1.7);
      const base = (Math.max(0, a) ** 1.4 * 0.2 + Math.max(0, b) * 0.1 - 0.05) * (0.7 + swell * 0.3);
      this.run[i] = base + this.surge[i];
    }
    for (let i = 0; i < SHORE_N; i++) {
      const p = this.run[Math.max(0, i - 1)];
      const n = this.run[Math.min(SHORE_N - 1, i + 1)];
      const r = this.run[i] * 0.5 + (p + n) * 0.25;
      this.wet[i] = Math.max(this.wet[i] - dt * 0.035 - Math.max(0, this.wet[i] - 0.35) * dt * 0.16, r + 0.03);
      this.data[i * 4] = th(this.shoreX[i]);
      this.data[i * 4 + 1] = th(r);
      this.data[i * 4 + 2] = th(this.wet[i]);
      this.data[i * 4 + 3] = th(Math.min(1, this.surge[i] * 2.5));
    }
    this.tex.needsUpdate = true;
  }
}

const WATER_REEFS = CORAL_CLUSTERS.map((c) => ({ x: toX(c.x), z: toZ(c.y), r: c.r * UNIT }));
const WATER_ROCKS = SEA_ROCKS.map((r) => ({ x: toX(r.x), z: toZ(r.y), r: r.r * UNIT }));

/**
 * Bakes static ground height + reef proximity + nearest rock distance into one RGBA HalfFloat texture:
 * R = ground height, G = smooth reef mask (0..1), B = distance to nearest rock edge, A = 1.
 */
function bakeGroundTexture(): void {
  const N = 512;
  const data = new Uint16Array(N * N * 4);
  const th = THREE.DataUtils.toHalfFloat;
  const one = th(1);
  for (let j = 0; j < N; j++) {
    const z = RECT.z + ((j + 0.5) / N) * RECT.h;
    const sx = shoreAt(z);
    const bw = beachWidth(z);
    const mud = mudAmount(z);
    const slope = 0.158 + (0.105 - 0.158) * mud;
    for (let i = 0; i < N; i++) {
      const x = RECT.x + ((i + 0.5) / N) * RECT.w;
      const d = x - sx;
      let gy: number;
      if (d < 0) {
        const b = -d;
        let h = slope * Math.min(b, bw) + 0.02;
        h += (1 - mud * 0.8) * 0.2 * Math.exp(-Math.pow((b - bw * 0.62) / 1.5, 2));
        h += smooth(bw - 1.6, bw + 2.6, b) * 0.5;
        h += smooth(bw + 5, bw + 34, b) * (6.2 + fbm(x * 0.05, z * 0.05, 3) * 4.2);
        h += fbm(x * 0.24, z * 0.24, 3) * 0.12 * smooth(0.8, 4, b);
        gy = h;
      } else {
        let depth =
          0.07 * d +
          0.45 * smooth(2.5, 9, d) +
          1.05 * smooth(30, 60, d) +
          2.6 * smooth(54, 100, d) +
          5 * smooth(95, 190, d);
        depth += fbm(x * 0.085 + 3, z * 0.085, 3) * 0.9 * smooth(6, 30, d);
        depth += fbm(x * 0.33, z * 0.33 + 8, 2) * 0.16 * smooth(1.2, 5, d);
        const reef = reefAmount(x, z);
        if (reef > 0) depth = depth + (1.7 + fbm(x * 0.4, z * 0.4, 2) * 0.5 - depth) * (reef * 0.96);
        for (const r of WATER_ROCKS) {
          const rd = Math.hypot(x - r.x, z - r.z);
          const m = 1 - smooth(r.r * 0.9, r.r * 2.3, rd);
          if (m > 0) depth = depth + (Math.min(depth, 1.5) - depth) * m;
        }
        gy = -Math.max(0, depth);
      }
      let reefK = 0;
      for (const c of WATER_REEFS) {
        const dist = Math.hypot(x - c.x, z - c.z);
        const rk = 1 - smooth(c.r * 0.9, c.r * 1.7, dist);
        if (rk > reefK) reefK = rk;
      }
      let rockD = 20;
      for (const r of WATER_ROCKS) {
        const rd = Math.hypot(x - r.x, z - r.z) - r.r;
        if (rd < rockD) rockD = rd;
      }
      const o = (j * N + i) * 4;
      data[o] = th(gy);
      data[o + 1] = th(reefK);
      data[o + 2] = th(clamp(rockD, -10, 20));
      data[o + 3] = one;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  G.uGroundTex.value = tex;
  G.uGroundRect.value.set(RECT.x, RECT.z, RECT.w, RECT.h);
}

/** The drowned foot of each sea stack: stone, not sand. */
function rockFoot(x: number, z: number): number {
  let a = 0;
  for (const r of SEA_ROCKS) a = Math.max(a, 1 - smooth(0.4, 4.2, Math.hypot(x - toX(r.x), z - toZ(r.y)) - r.r * UNIT));
  return a;
}

export function buildLand(): THREE.Mesh {
  bakeGroundTexture();

  const ds: number[] = [];
  const push = (a: number, b: number, step: number): void => {
    for (let d = a; d < b - 1e-6; d += step * Q.land) ds.push(d);
  };
  push(-72, -22, 1.7);
  push(-22, -14, 0.8);
  push(-14, -3, 0.42);
  push(-3, 4, 0.24);
  push(4, 34, 0.75);
  push(34, 90, 2.2);
  push(90, 420, 24);
  const zs: number[] = [];
  for (let z = -240; z < -80; z += 10) zs.push(z);
  for (let z = -80; z < 66; z += 0.56 * Q.land) zs.push(z);
  for (let z = 66; z <= 220; z += 10) zs.push(z);

  const W = ds.length;
  const H = zs.length;
  const pos = new Float32Array(W * H * 3);
  const mask = new Float32Array(W * H * 4);
  const col = new Float32Array(W * H * 3).fill(1);
  const fx = new Float32Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    const sx = shoreAt(zs[j]);
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const x = sx + ds[i];
      const z = zs[j];
      pos[k * 3] = x;
      pos[k * 3 + 1] = groundAt(x, z);
      pos[k * 3 + 2] = z;
      mask[k * 4] = ds[i] < 0 ? forestAmount(x, z) : 0;
      mask[k * 4 + 1] = mudAmount(z + fbm(x * 0.12, z * 0.12, 3) * 7) * (1 - smooth(0.6, 3.4, Math.abs(ds[i] - 0.6) + fbm(x * 0.16, z * 0.16, 2) * 2.2));
      mask[k * 4 + 2] = ds[i] < 1 ? pathAmount(x, z) : 0;
      mask[k * 4 + 3] = ds[i] > 0 ? Math.max(reefAmount(x, z), rockFoot(x, z)) : 0;
      fx[k * 4] = 1;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = j * W + i;
      idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(W * H * 2), 2));
  g.setAttribute('aFx', new THREE.BufferAttribute(fx, 4));
  g.setAttribute('aMask', new THREE.BufferAttribute(mask, 4));
  g.setIndex(idx);
  g.computeVertexNormals();

  const c = (h: string): string => {
    const k = new THREE.Color(h);
    return `vec3(${k.r.toFixed(4)},${k.g.toFixed(4)},${k.b.toFixed(4)})`;
  };

  const { material, depth } = toon({
    isStatic: true,
    vHead: 'attribute vec4 aMask; varying vec4 vMask;',
    vLocal: 'vMask = aMask;',
    fHead: 'varying vec4 vMask;',
    fAlbedo: /* glsl */ `
      vec2 q = vWP.xz;
      float n1 = texture2D(uNoise, q * .017).b;
      float n2 = texture2D(uNoise, q * .071 + .3).a;
      float n3 = texture2D(uNoise, q * .37 + .6).a;
      float n4 = texture2D(uNoise, q * 1.7).a;
      vec4 si = shoreInfo(vWP.z);
      float d = vWP.x - si.x;
      float y = vWP.y;

      // ---- dry sand: two warm tones in broad drifts, then grain
      vec3 sand = mix(${c('#f1d7a2')}, ${c('#fff0d0')}, smoothstep(.34, .64, n1 + (n2 - .5) * .35));
      sand = mix(sand, ${c('#e6c08a')}, smoothstep(.56, .78, n2) * .38);
      sand *= 1. + (n4 - .5) * .22 + (n3 - .5) * .1;

      // wind ripples, only on the open dry beach
      vec2 rd = normalize(vec2(.92, .34));
      float ph = dot(q, rd) * 5.2 + (n2 - .5) * 9. + (n1 - .5) * 14.;
      float rm = smoothstep(.3, .62, y) * (1. - vMask.x) * (1. - vMask.y) * smoothstep(.38, .54, n1) * (1. - vMask.z * .9);
      sand *= 1. - rm * smoothstep(-.2, 1., sin(ph)) * .17;
      sand += rm * smoothstep(.55, 1., sin(ph + 2.2)) * .05;
      n.xz -= rd * cos(ph) * rm * .24;
      n = normalize(n);

      // trodden paths, compacted and a shade darker
      float path = vMask.z * (.75 + .25 * n3);
      sand = mix(sand, ${c('#d9a566')} * (.92 + .16 * n4), path * .72);

      // shell and coral grit
      float grit = smoothstep(.66, .7, texture2D(uNoise, q * .93 + .17).a) * step(.5, n3);
      sand = mix(sand, ${c('#fff6e6')}, grit * .55 * (1. - path));

      // high-tide wrack line: broken weed, husk and twig left along the berm
      float wl = .86 + (n2 - .5) * .34 + (n1 - .5) * .3;
      float wrack = smoothstep(.075, .0, abs(y - wl)) * smoothstep(.46, .6, n3) * (1. - vMask.x) * step(y, 1.6);
      sand = mix(sand, ${c('#6b4a2c')}, wrack * .62);

      // ---- tidal mud for the mangrove flats
      float mud = smoothstep(.25, .75, vMask.y + (n2 - .5) * .6);
      vec3 mudc = mix(${c('#b39468')}, ${c('#8a6c4c')}, smoothstep(.35, .65, n1 + (n3 - .5) * .4));
      mudc *= 1. + (n4 - .5) * .2;
      float puddle = smoothstep(.55, .62, n2) * mud;
      sand = mix(sand, mudc, mud * .6);

      // ---- seabed
      if (y < .05){
        float dep = max(0., -y);
        vec3 bed = mix(${c('#f6dfae')}, ${c('#cfc08c')}, smoothstep(.3, .7, n2) * .36 + smoothstep(.36, .64, n1) * .24);
        float sr = sin(dot(q, normalize(vec2(.8, -.5))) * 3.1 + (n2 - .5) * 10.);
        bed *= 1. - .12 * smoothstep(.0, 1., sr) * (1. - smoothstep(2., 5., dep));
        float grass = smoothstep(.555, .65, n1 + (n2 - .5) * .16) * smoothstep(1., 2., dep) * (1. - vMask.w);
        bed = mix(bed, mix(${c('#3a7a58')}, ${c('#5a9a5a')}, n3), grass * .66);
        float stone = smoothstep(.64, .74, texture2D(uNoise, q * .03 + .7).a) * smoothstep(.6, 1.6, dep);
        bed = mix(bed, ${c('#8d8a76')}, stone * .2);
        // coral shelf: crusts of rose, ochre and violet that fade to bone when the reef is sick
        vec2 rq = q + vWP.y * vec2(.9, 1.4);
        float r3 = texture2D(uNoise, rq * .37 + .6).a;
        float rf = smoothstep(.3, .62, vMask.w + (n2 - .5) * .7);
        vec3 live = mix(${c('#b06a7c')}, ${c('#c79a56')}, smoothstep(.4, .6, n2));
        live = mix(live, ${c('#6a5a94')}, smoothstep(.55, .7, r3));
        live = mix(live, ${c('#3f7a6c')}, smoothstep(.6, .72, n1));
        vec3 bone = mix(${c('#7d7a68')}, ${c('#55604f')}, n2);
        vec3 shelf = mix(bone, live * .8, smoothstep(.05, .7, uEco)) * (.6 + .5 * r3);
        // old limestone shows through in dark pits between the colonies
        shelf = mix(shelf, ${c('#33423f')}, smoothstep(.52, .64, texture2D(uNoise, rq * .16 + .2).a) * .7);
        bed = mix(bed, shelf, rf);
        sand = mix(sand, bed, smoothstep(.05, -.25, y));
        gloss = 0.;
      }

      // ---- forest floor creeping onto the sand in tongues and runners
      float veg = vMask.x + (n2 - .5) * .9 + (n3 - .5) * .35;
      float fringe = smoothstep(.16, .34, veg);
      float floorm = smoothstep(.46, .8, veg);
      vec3 turf = mix(${c('#9cc24e')}, ${c('#5fa040')}, smoothstep(.3, .7, n3));
      turf = mix(turf, ${c('#3f8040')}, smoothstep(.5, .75, n1));
      vec3 loam = mix(${c('#35522f')}, ${c('#4a4a2c')}, smoothstep(.4, .7, n2));
      alb = mix(sand, turf * (.86 + .28 * n4), fringe * (1. - path * .8) * step(.05, y));
      alb = mix(alb, loam * (.8 + .4 * n3), floorm * (1. - path * .7) * step(.05, y));
      alb = mix(alb, ${c('#c99a62')} * (.9 + .2 * n4), path * vMask.x * .75);

      // ---- headlands past the planted coast: painted canopy instead of bare slope
      float farL = max(smoothstep(-57., -66., vWP.z), smoothstep(43., 49., vWP.z)) * smoothstep(.5, 1.1, y);
      if (farL > 0.){
        float cell = texture2D(uNoise, q * .052).r;
        float cell2 = texture2D(uNoise, q * .121 + .4).r;
        vec3 wood = mix(${c('#7fb84a')}, ${c('#2c6b3a')}, smoothstep(.12, .62, cell * .65 + cell2 * .35));
        wood = mix(wood, ${c('#4f8f5a')}, smoothstep(.45, .62, n1) * .5);
        alb = mix(alb, wood, farL);
        vec2 gr = vec2(texture2D(uNoise, (q + vec2(.5, 0.)) * .052).r - cell, texture2D(uNoise, (q + vec2(0., .5)) * .052).r - cell);
        n = normalize(n + vec3(gr.x, 0., gr.y) * 3.2 * farL);
        ao *= mix(1., 1. - .55 * smoothstep(.25, .75, cell), farL);
      }

      // ---- wet sand follows the last wave and dries off behind it
      float wetN = (n2 - .5) * .06 + (n1 - .5) * .04;
      float wet = (1. - smoothstep(si.z - .05, si.z + .05, y + wetN)) * step(0., -d + 6.) * (1. - floorm);
      wet *= smoothstep(-.7, -.1, y);
      float damp = (1. - smoothstep(si.z + .02, si.z + .26, y + wetN)) * (1. - floorm);
      alb *= mix(vec3(1.), vec3(.84, .8, .77), damp * step(-.2, y) * (1. - wet));
      alb *= mix(vec3(1.), vec3(.64, .56, .5), wet);
      gloss = max(gloss, wet * .75);
      gloss = max(gloss, puddle * .7 * step(0., y));
      ao *= mix(1., .55, floorm);
    `,
    fEnd: /* glsl */ `
      // wet sand mirrors the sky
      vec3 Vv = normalize(cameraPosition - vWP);
      float fz = pow(1. - sat(dot(n, Vv)), 2.2);
      c = mix(c, uSkyCol * 1.5, wet * fz * .5);
    `,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  depth.dispose();
  return mesh;
}
