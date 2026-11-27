import * as THREE from 'three';
import { type Pose } from './director';
import { Q } from './quality';
import type { PermanentMangrove, PlayerProgress } from '../types';
import { FIRE_SPOTS, MANGROVE_SLOTS, RAFFLESIA_POS, VILLAGE_PIER } from '../world';
import { Build, hex, matrixOf, type Vec } from './build';
import { toon, type ToonPair } from './gfx';
import { instanced, mesh, setCount, type Inst } from './kit';
import { forestAmount, pathAmount } from './land';
import { beachWidth, clamp, groundAt, lerp, noise2, rng, shoreAt, smooth, toX, toZ, type Rng } from './space';

/* ================================================================== leaf atlas */

const SOLID: [number, number] = [0.5, 0.5];

/** Four hand-drawn leaf sprays plus a solid patch, drawn once into a texture. */
function leafAtlas(): THREE.Texture {
  const S = 1024;
  const mk = (fill: string): CanvasRenderingContext2D => {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const x = c.getContext('2d')!;
    x.fillStyle = fill;
    x.fillRect(0, 0, S, S);
    return x;
  };
  const col = mk('#b4b4b4');
  const alp = mk('#000000');
  const r = rng(11);
  const tile = 472;
  const at = (t: number): [number, number] => [(t % 2) * (S - tile) + tile / 2, Math.floor(t / 2) * (S - tile) + tile / 2];

  const leaf = (cx: number, cy: number, a: number, len: number, wid: number, belly: number, lum: number): void => {
    for (const [ctx, isAlpha] of [
      [col, false],
      [alp, true],
    ] as [CanvasRenderingContext2D, boolean][]) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(len * (belly - 0.2), -wid, len * (belly + 0.2), -wid, len, 0);
      ctx.bezierCurveTo(len * (belly + 0.2), wid, len * (belly - 0.2), wid, 0, 0);
      if (isAlpha) {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else {
        const g = ctx.createLinearGradient(0, -wid, 0, wid);
        const hi = Math.min(255, Math.round(lum * 255));
        const lo = Math.round(lum * 196);
        g.addColorStop(0, `rgb(${hi},${hi},${hi})`);
        g.addColorStop(0.49, `rgb(${hi},${hi},${hi})`);
        g.addColorStop(0.51, `rgb(${lo},${lo},${lo})`);
        g.addColorStop(1, `rgb(${lo},${lo},${lo})`);
        ctx.fillStyle = g;
        ctx.fill();
        const rib = Math.min(255, Math.round(lum * 285));
        ctx.strokeStyle = `rgba(${rib},${rib},${rib},0.8)`;
        ctx.lineWidth = Math.max(1.5, wid * 0.1);
        ctx.beginPath();
        ctx.moveTo(len * 0.06, 0);
        ctx.lineTo(len * 0.92, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  // 0: broad rainforest spray
  {
    const [cx, cy] = at(0);
    for (let ring = 0; ring < 3; ring++) {
      const n = [9, 8, 5][ring];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.5 + (r() - 0.5) * 0.4;
        const d = [70, 34, 6][ring];
        leaf(cx + Math.cos(a) * d, cy + Math.sin(a) * d, a + (r() - 0.5) * 0.5, lerp(118, 152, r()), lerp(40, 54, r()), 0.42, lerp(0.6, 0.78, r()) + ring * 0.1);
      }
    }
  }
  // 1: small dense leaves
  {
    const [cx, cy] = at(1);
    for (let i = 0; i < 74; i++) {
      const a = i * 2.39996;
      const d = Math.sqrt(i / 74) * 186;
      const k = 1 - i / 74;
      leaf(cx + Math.cos(a) * d * (1 - k * 0.1), cy + Math.sin(a) * d, a + (r() - 0.5) * 1.6, lerp(46, 64, r()), lerp(19, 26, r()), 0.5, lerp(0.56, 0.95, r()));
    }
  }
  // 2: drooping needles
  {
    const [cx, cy] = at(2);
    for (const [ctx, isAlpha] of [
      [col, false],
      [alp, true],
    ] as [CanvasRenderingContext2D, boolean][]) {
      const rr = rng(31);
      ctx.lineCap = 'round';
      for (let i = 0; i < 120; i++) {
        const a = rr() * Math.PI * 2;
        const l = lerp(90, 222, rr());
        const bend = (rr() - 0.5) * 70;
        const lum = lerp(0.5, 1, rr());
        const v = Math.round(lum * 255);
        ctx.strokeStyle = isAlpha ? '#fff' : `rgb(${v},${v},${v})`;
        ctx.lineWidth = lerp(5, 9, rr());
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(cx + Math.cos(a) * l * 0.5 - Math.sin(a) * bend, cy + Math.sin(a) * l * 0.5 + Math.cos(a) * bend, cx + Math.cos(a) * l, cy + Math.sin(a) * l);
        ctx.stroke();
      }
    }
  }
  // 3: big almond rosette
  {
    const [cx, cy] = at(3);
    for (let ring = 0; ring < 2; ring++) {
      const n = [8, 6][ring];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.42 + (r() - 0.5) * 0.2;
        leaf(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, a, ring ? lerp(130, 150, r()) : lerp(196, 222, r()), ring ? 46 : 62, 0.66, lerp(0.64, 0.82, r()) + ring * 0.14);
      }
    }
  }
  col.fillStyle = '#e8e8e8';
  alp.fillStyle = '#ffffff';
  for (const c of [col, alp]) c.fillRect(S / 2 - 22, S / 2 - 22, 44, 44);

  const A = col.getImageData(0, 0, S, S).data;
  const B = alp.getImageData(0, 0, S, S).data;
  const out = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    out[i * 4] = A[i * 4];
    out[i * 4 + 1] = A[i * 4 + 1];
    out[i * 4 + 2] = A[i * 4 + 2];
    out[i * 4 + 3] = B[i * 4];
  }
  const t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/* ================================================================== leaf geometry */

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _c = new THREE.Color();

class Leaves {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  fx: number[] = [];
  readonly r: Rng;
  constructor(seed: number) {
    this.r = rng(seed);
  }

  private push(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: THREE.Color, ao: number, sway: number, wood: number, glow = 0): void {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    this.fx.push(ao, sway, wood, glow);
  }

  card(center: THREE.Vector3, face: THREE.Vector3, normal: THREE.Vector3, size: number, tile: number, c: THREE.Color, ao: number, sway: number): void {
    const spin = this.r() * Math.PI * 2;
    _a.set(0, 1, 0);
    if (Math.abs(face.y) > 0.95) _a.set(1, 0, 0);
    const x = new THREE.Vector3().crossVectors(_a, face).normalize();
    const y = new THREE.Vector3().crossVectors(face, x).normalize();
    const ux = x.clone().multiplyScalar(Math.cos(spin)).addScaledVector(y, Math.sin(spin));
    const uy = x.clone().multiplyScalar(-Math.sin(spin)).addScaledVector(y, Math.cos(spin));
    const t = 472 / 1024;
    const u0 = (tile % 2) * (1 - t);
    const v0 = Math.floor(tile / 2) * (1 - t);
    const corner = (i: number, j: number): void => {
      _v.copy(center).addScaledVector(ux, (i - 0.5) * size).addScaledVector(uy, (j - 0.5) * size);
      this.push(_v, normal, u0 + i * t, v0 + j * t, c, ao, sway, 0);
    };
    corner(0, 0);
    corner(1, 0);
    corner(1, 1);
    corner(0, 0);
    corner(1, 1);
    corner(0, 1);
  }

  /** Adds a solid mesh (trunk, frond, core) into the same buffer. */
  solid(g: THREE.BufferGeometry, color: (p: THREE.Vector3) => THREE.Color, o: { wood?: number; ao?: (p: THREE.Vector3) => number; sway?: (p: THREE.Vector3) => number; normal?: (p: THREE.Vector3, n: THREE.Vector3) => void; glow?: number } = {}): void {
    const s = g.index ? g.toNonIndexed() : g;
    const P = s.attributes.position as THREE.BufferAttribute;
    const N = s.attributes.normal as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i);
      n.fromBufferAttribute(N, i);
      o.normal?.(p, n);
      this.push(p, n, SOLID[0], SOLID[1], color(p), o.ao ? o.ao(p) : 1, o.sway ? o.sway(p) : 0, o.wood ?? 0, o.glow ?? 0);
    }
  }

  trunk(pts: Vec[], r0: number, r1: number, color: (p: THREE.Vector3) => THREE.Color, o: { seg?: number; rings?: number; flare?: number; sway?: (p: THREE.Vector3) => number } = {}): void {
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
    const rings = o.rings ?? 8;
    const seg = o.seg ?? 7;
    const g = new THREE.TubeGeometry(curve, rings, 1, seg, false);
    const P = g.attributes.position as THREE.BufferAttribute;
    const c = new THREE.Vector3();
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      curve.getPointAt(t, c);
      const rad = lerp(r0, r1, t) + (o.flare ?? 0) * Math.pow(1 - t, 6);
      for (let j = 0; j <= seg; j++) {
        const k = i * (seg + 1) + j;
        P.setXYZ(k, c.x + (P.getX(k) - c.x) * rad, c.y + (P.getY(k) - c.y) * rad, c.z + (P.getZ(k) - c.z) * rad);
      }
    }
    this.solid(g, color, { wood: 1, sway: o.sway, ao: (p) => lerp(0.55, 1, smooth(0, 2.5, p.y)) });
  }

  /** Leafy lobe: cards on a sphere around a dark core. */
  lobe(
    c: THREE.Vector3,
    rad: number,
    squash: number,
    cards: number,
    size: number,
    tile: number,
    crown: THREE.Vector3,
    crownR: number,
    tone: (h: number, rnd: number) => THREE.Color,
    others: { c: THREE.Vector3; r: number }[],
    sway: number,
    o: { minY?: number; solid?: Leaves } = {}
  ): void {
    const core = new THREE.IcosahedronGeometry(rad * 0.84, 0);
    core.scale(1, squash, 1);
    core.translate(c.x, c.y, c.z);
    (o.solid ?? this).solid(core, () => _c.copy(tone(0.1, 0.4)).multiplyScalar(0.5), { ao: () => 0.35, sway: () => sway * 0.8 });
    const minY = o.minY ?? -1;
    for (let i = 0; i < cards; i++) {
      const k = (i + 0.5) / cards;
      const y = 1 - k * 1.55;
      const q = Math.sqrt(Math.max(0, 1 - y * y));
      const ph = i * 2.39996 + this.r() * 0.6;
      const dir = new THREE.Vector3(Math.cos(ph) * q, y, Math.sin(ph) * q);
      const p = new THREE.Vector3(c.x + dir.x * rad * lerp(0.82, 1.02, this.r()), c.y + dir.y * rad * squash * lerp(0.82, 1.02, this.r()), c.z + dir.z * rad * lerp(0.82, 1.02, this.r()));
      const face = dir.clone().add(new THREE.Vector3(this.r() - 0.5, this.r() * 0.7 - 0.1, this.r() - 0.5).multiplyScalar(0.9)).normalize();
      const fromCrown = p.clone().sub(crown).normalize();
      const nrm = dir.clone().multiplyScalar(0.72).addScaledVector(fromCrown, 0.45).normalize();
      let occ = 0;
      for (const o of others) {
        if (o.c === c) continue;
        occ = Math.max(occ, 1 - smooth(o.r * 0.55, o.r * 1.12, p.distanceTo(o.c)));
      }
      if (occ > 0.93) continue;
      const sz = size * lerp(0.8, 1.25, this.r());
      const col = tone(clamp((p.y - (crown.y - crownR)) / (crownR * 2), 0, 1), this.r());
      if (y < minY) {
        this.r(); // keep spin PRNG stream identical for remaining cards
        continue;
      }
      const ao = lerp(0.34, 1, smooth(-0.55, 0.7, dir.y)) * lerp(1, 0.42, occ);
      this.card(p, face, nrm, sz, tile, col, ao, sway);
    }
  }

  geo(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(this.fx), 4));
    return g;
  }
}

/** Gradient between two greens with a per-leaf hue wobble, so no crown is one flat colour. */
const tone = (lo: string, hi: string, accent = hi, odds = 0) => {
  const A = hex(lo);
  const B = hex(hi);
  const X = hex(accent);
  const out = new THREE.Color();
  return (h: number, rnd: number): THREE.Color => {
    out.copy(A).lerp(B, clamp(h * 0.85 + (rnd - 0.5) * 0.5, 0, 1));
    if (rnd < odds) out.lerp(X, 0.8);
    out.offsetHSL((rnd - 0.5) * 0.025, 0, (rnd - 0.5) * 0.04);
    return out;
  };
};

const bark = (lo: string, hi: string, rings = 0) => {
  const A = hex(lo);
  const B = hex(hi);
  const out = new THREE.Color();
  return (p: THREE.Vector3): THREE.Color => {
    out.copy(A).lerp(B, smooth(0, 6, p.y));
    if (rings) out.multiplyScalar(Math.sin(p.y * rings) > 0.55 ? 0.74 : 1);
    return out;
  };
};

/* ================================================================== species */

interface SplitGeo {
  solid?: THREE.BufferGeometry;
  trunk?: THREE.BufferGeometry;
  cards?: THREE.BufferGeometry;
}

function rainTree(seed: number, near: boolean): SplitGeo {
  const L = new Leaves(seed);
  const S = new Leaves(seed);
  const r = L.r;
  const h = lerp(4.6, 5.6, r());
  const lean = (r() - 0.5) * 1.1;
  let trunkGeo: THREE.BufferGeometry | undefined;
  if (near) {
    const T = new Leaves(seed);
    T.trunk(
      [
        [0, -0.6, 0],
        [lean * 0.3, h * 0.4, 0],
        [lean, h, lean * 0.3],
      ],
      0.34,
      0.2,
      bark('#4f3b2b', '#8a6f54'),
      { flare: 0.5, rings: 4, seg: 5 }
    );
    trunkGeo = T.geo();
  }
  const crown = new THREE.Vector3(lean, h + 0.5, lean * 0.3);
  const n = near ? 8 : 5;
  const lobes: { c: THREE.Vector3; r: number }[] = [];
  lobes.push({ c: crown.clone().add(new THREE.Vector3(0, 1.0, 0)), r: 1.75 });
  for (let i = 1; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI * 2 + r() * 0.5;
    const d = lerp(1.5, 2.15, r());
    lobes.push({ c: crown.clone().add(new THREE.Vector3(Math.cos(a) * d, lerp(-0.45, 0.6, r()), Math.sin(a) * d)), r: lerp(1.15, 1.7, r()) });
  }
  const tones = [tone('#2c6b3a', '#7ec24a'), tone('#1f5f45', '#5fb35a'), tone('#3f7a35', '#a4cf52'), tone('#24664a', '#6fbf74')];
  const tn = tones[seed % tones.length];
  // Skip underside leaf cards that stay occluded behind canopies or terrain while preserving every visible card's exact pose.
  const minY = near ? -0.38 : -0.1;
  for (const l of lobes) L.lobe(l.c, l.r, 0.82, near ? 26 : 18, near ? 1.54 : 1.92, seed % 3 === 1 ? 1 : 0, crown, 2.6, tn, lobes, 0.2, { minY, solid: S });
  return { solid: S.geo(), trunk: trunkGeo, cards: L.geo() };
}

/** Tall dipterocarp that breaks the canopy line. */
function emergent(seed: number): SplitGeo {
  const L = new Leaves(seed);
  const S = new Leaves(seed);
  const r = L.r;
  const h = 10.5 + r() * 1.5;
  S.trunk(
    [
      [0, -0.6, 0],
      [0.2, h * 0.5, 0.1],
      [-0.1, h, 0],
    ],
    0.4,
    0.22,
    bark('#8c7a66', '#d8c7ae'),
    { flare: 0.8, rings: 7, seg: 6 }
  );
  const crown = new THREE.Vector3(-0.1, h + 0.4, 0);
  const lobes: { c: THREE.Vector3; r: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r();
    const d = i < 2 ? 0.4 : lerp(1.7, 2.9, r());
    lobes.push({ c: crown.clone().add(new THREE.Vector3(Math.cos(a) * d, (i < 2 ? 0.7 : 0) + (r() - 0.5) * 0.9, Math.sin(a) * d)), r: lerp(0.95, 1.45, r()) });
  }
  for (const l of lobes) L.lobe(l.c, l.r, 0.7, 26, 1.3, 1, crown, 2.4, tone('#356f46', '#8fc860', '#d8c25a', 0.06), lobes, 0.3, { minY: -0.45, solid: S });
  return { solid: S.geo(), cards: L.geo() };
}

/** Sea almond: flat tiers like a pagoda, with the old leaves that turn red before they fall. */
function ketapang(seed: number): SplitGeo {
  const L = new Leaves(seed);
  const S = new Leaves(seed);
  const r = L.r;
  const h = 6.2;
  S.trunk(
    [
      [0, -0.5, 0],
      [0.15, h * 0.5, 0.1],
      [0, h + 0.5, 0],
    ],
    0.3,
    0.12,
    bark('#5a4636', '#97795c'),
    { flare: 0.35 }
  );
  const tn = tone('#3f7f35', '#8fbf45', '#d8482e', 0.16);
  const tiers: [number, number, number][] = [
    [2.7, 3.1, 11],
    [4.2, 2.6, 9],
    [5.5, 1.85, 7],
    [6.5, 0.95, 5],
  ];
  const up = new THREE.Vector3(0, 1, 0);
  for (const [y, rad, n] of tiers) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + y;
      const tip = new THREE.Vector3(Math.cos(a) * rad * 0.8, y + 0.28, Math.sin(a) * rad * 0.8);
      S.trunk(
        [
          [0, y - 0.25, 0],
          [tip.x * 0.5, y + 0.05, tip.z * 0.5],
          [tip.x, tip.y, tip.z],
        ],
        0.1,
        0.04,
        bark('#5a4636', '#97795c'),
        { seg: 4, rings: 3 }
      );
    }
    const cards = Math.round(rad * rad * 3.4) + 4;
    for (let i = 0; i < cards; i++) {
      const a = i * 2.39996 + y;
      const d = Math.sqrt((i + 0.5) / cards) * rad;
      const p = new THREE.Vector3(Math.cos(a) * d, y + 0.3 + (r() - 0.5) * 0.26 - (d / rad) * 0.16, Math.sin(a) * d);
      const face = up.clone().add(new THREE.Vector3((r() - 0.5) * 0.5 + Math.cos(a) * 0.2, 0, (r() - 0.5) * 0.5 + Math.sin(a) * 0.2)).normalize();
      const n2 = up.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar((d / rad) * 0.75)).normalize();
      L.card(p, face, n2, lerp(1.25, 1.7, r()), 3, tn(0.35 + (d / rad) * 0.4 + y * 0.04, r()), lerp(0.55, 1, d / rad), 0.22);
    }
    const under = new THREE.CylinderGeometry(rad * 0.82, rad * 0.5, 0.12, 12);
    under.translate(0, y + 0.02, 0);
    S.solid(under, () => _c.set('#2a5a30'), { ao: () => 0.35, sway: () => 0.2 });
  }
  return { solid: S.geo(), cards: L.geo() };
}

/** Cemara laut, the casuarinas that line Pantai Panjang. */
function casuarina(seed: number): SplitGeo {
  const L = new Leaves(seed);
  const S = new Leaves(seed);
  const r = L.r;
  const h = 7.6 + r() * 1.2;
  const lean = 0.7;
  S.trunk(
    [
      [0, -0.5, 0],
      [lean * 0.3, h * 0.5, 0],
      [lean, h, 0],
    ],
    0.24,
    0.06,
    bark('#5c4a3d', '#8b7564'),
    { flare: 0.2, sway: (p) => smooth(3, 10, p.y) * 0.3 }
  );
  const tn = tone('#4f8a5c', '#b4d08a');
  const N = 110;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const y = lerp(2.0, h + 0.5, t);
    const rad = lerp(2.2, 0.3, Math.pow(t, 0.9)) * lerp(0.7, 1.1, r());
    const a = i * 2.39996;
    const cx = lean * Math.pow(y / h, 2);
    const d = rad * Math.sqrt(lerp(0.25, 1, r()));
    const p = new THREE.Vector3(cx + Math.cos(a) * d, y, Math.sin(a) * d);
    const out = new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a)).normalize();
    const face = out.clone().add(new THREE.Vector3(r() - 0.5, r() * 0.8, r() - 0.5).multiplyScalar(0.8)).normalize();
    L.card(p, face, out, lerp(1.3, 1.9, r()) * lerp(1, 0.75, t), 2, tn(t, r()), lerp(0.5, 1, d / 1.7) * lerp(0.7, 1, t), 0.25 + t * 0.35);
  }
  return { solid: S.geo(), cards: L.geo() };
}

function frond(L: Leaves, base: THREE.Vector3, az: number, pitch: number, len: number, droop: number, wid: number, colA: THREE.Color, colB: THREE.Color, serrate: number, swayK: number, seg = 13): void {
  const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
  const pt = (t: number): THREE.Vector3 => {
    const x = Math.cos(pitch) * t * len * (1 - 0.12 * t);
    const y = Math.sin(pitch) * t * len - droop * t * t * len;
    return base.clone().addScaledVector(dir, x).add(new THREE.Vector3(0, y, 0));
  };
  const c = new THREE.Color();
  const pos: number[] = [];
  const nor: number[] = [];
  const cols: THREE.Color[] = [];
  const ts: number[] = [];
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg;
    const t1 = (i + 1) / seg;
    const a = pt(t0);
    const b = pt(t1);
    const tan = b.clone().sub(a).normalize();
    const up = new THREE.Vector3().crossVectors(side, tan).normalize();
    if (up.y < 0) up.negate();
    for (const s of [-1, 1]) {
      // two blades per segment, separated by a notch: reads as leaflets without hundreds of cards
      for (let k = 0; k < 2; k++) {
        const u0 = lerp(t0, t1, k / 2);
        const u1 = lerp(t0, t1, (k + 1) / 2);
        const A = pt(u0);
        const B = pt(u1);
        const w = wid * Math.pow(Math.sin(Math.PI * clamp(0.07 + ((u0 + u1) / 2) * 0.9, 0, 1)), 0.75);
        const tipT = clamp(u1 + 0.15, 0, 1.1);
        const tip = pt(tipT).addScaledVector(side, s * w).addScaledVector(up, -w * 0.62);
        const mid = pt(lerp(u0, tipT, 0.42)).addScaledVector(side, s * w * 0.5).addScaledVector(up, -w * 0.12);
        const n = up.clone().addScaledVector(side, s * 0.42).normalize();
        c.copy(colA).lerp(colB, u0 * 0.75 + (k ? 0.1 : 0));
        const tri = (p: THREE.Vector3, q: THREE.Vector3, e: THREE.Vector3): void => {
          for (const v of [p, q, e]) {
            pos.push(v.x, v.y, v.z);
            nor.push(n.x, n.y, n.z);
            cols.push(c.clone());
            ts.push(u0);
          }
        };
        tri(A, B, mid);
        tri(B, tip, mid);
        if (serrate > 1) tri(A, mid, pt(lerp(u0, tipT, 0.25)).addScaledVector(side, s * w * 0.78).addScaledVector(up, -w * 0.36));
      }
    }
  }
  for (let i = 0; i < pos.length / 3; i++) {
    const p = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const n = new THREE.Vector3(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
    L.pos.push(p.x, p.y, p.z);
    L.nor.push(n.x, n.y, n.z);
    L.uv.push(SOLID[0], SOLID[1]);
    L.col.push(cols[i].r, cols[i].g, cols[i].b);
    L.fx.push(lerp(0.55, 1, smooth(0, 0.4, ts[i])), ts[i] * ts[i] * swayK, 0, 0);
  }
}

/** Coconut palm with a real lean, ringed trunk and heavy drooping fronds. */
function palm(seed: number, tall: number, lean: number): THREE.BufferGeometry {
  const L = new Leaves(seed);
  const r = L.r;
  const top = new THREE.Vector3(lean, tall, 0);
  L.trunk(
    [
      [0, -0.6, 0],
      [lean * 0.12, tall * 0.28, 0],
      [lean * 0.46, tall * 0.66, 0],
      [top.x, top.y, 0],
    ],
    0.3,
    0.19,
    bark('#7a6049', '#b59a78', 11),
    { rings: 14, flare: 0.28, seg: 8, sway: (p) => smooth(1, tall, p.y) * 0.22 }
  );
  const A = hex('#3f8f36');
  const B = hex('#b9d64a');
  const n = 18;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const az = i * 2.39996 + r() * 0.3;
    const pitch = lerp(1.12, -0.28, k) + (r() - 0.5) * 0.15;
    const len = lerp(3.7, 4.7, Math.sin(k * Math.PI)) * lerp(0.92, 1.08, r());
    const old = k > 0.93;
    frond(
      L,
      top,
      az,
      pitch,
      len,
      lerp(0.5, 0.66, k),
      0.86,
      old ? hex('#8a7438') : A.clone().lerp(hex('#2c7a3c'), r() * 0.6),
      old ? hex('#b09a52') : B.clone().lerp(hex('#7fb83f'), r() * 0.5),
      1,
      1.0,
      15
    );
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28 + r();
    const s = new THREE.SphereGeometry(0.28, 7, 5);
    s.translate(top.x + Math.cos(a) * 0.36, top.y - 0.26 - r() * 0.16, Math.sin(a) * 0.36);
    L.solid(s, () => _c.set(i % 3 ? '#a8783a' : '#8fae3e'), { sway: () => 0.2, ao: () => 0.8 });
  }
  const bud = new THREE.SphereGeometry(0.3, 6, 5);
  bud.translate(top.x, top.y, 0);
  L.solid(bud, () => _c.set('#8a7a3a'), { sway: () => 0.2 });
  return L.geo();
}

function banana(seed: number): THREE.BufferGeometry {
  const L = new Leaves(seed);
  const r = L.r;
  for (let s = 0; s < 3; s++) {
    const ox = (r() - 0.5) * 1.6;
    const oz = (r() - 0.5) * 1.6;
    const h = lerp(1.4, 2.3, r());
    L.trunk(
      [
        [ox, -0.3, oz],
        [ox, h * 0.5, oz],
        [ox, h, oz],
      ],
      0.24,
      0.15,
      bark('#6f8f3e', '#a8bf5a'),
      { rings: 3 }
    );
    for (let i = 0; i < 7; i++) {
      const az = i * 2.39996 + s;
      const pitch = lerp(1.25, 0.35, i / 7);
      const len = lerp(1.7, 2.5, r());
      const wid = lerp(0.34, 0.48, r());
      const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
      const seg = 6;
      const P = (t: number, w: number): THREE.Vector3 => {
        const x = Math.cos(pitch) * t * len;
        const y = Math.sin(pitch) * t * len - 0.62 * t * t * len;
        const ww = wid * Math.pow(Math.sin(Math.PI * clamp(t * 0.92 + 0.06, 0, 1)), 0.6) * w;
        return new THREE.Vector3(ox, h - 0.05, oz).addScaledVector(dir, x).addScaledVector(side, ww).add(new THREE.Vector3(0, y - Math.abs(w) * 0.1, 0));
      };
      const g = new THREE.BufferGeometry();
      const pos: number[] = [];
      for (let k = 0; k < seg; k++) {
        const t0 = k / seg;
        const t1 = (k + 1) / seg - (k % 2 ? 0.02 : 0);
        for (const w of [-1, 1]) {
          const a = P(t0, 0);
          const b = P(t1, 0);
          const c = P(t1, w);
          const d = P(t0, w);
          const push = (...q: THREE.Vector3[]): void => q.forEach((v) => pos.push(v.x, v.y, v.z));
          if (w > 0) push(a, b, c, a, c, d);
          else push(a, c, b, a, d, c);
        }
      }
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.computeVertexNormals();
      const c0 = hex('#4f9a3a').lerp(hex('#8fc84a'), r());
      L.solid(g, (p) => _c.copy(c0).lerp(hex('#d8e68a'), smooth(0.1, 0.0, Math.abs((p.x - ox) * side.x + (p.z - oz) * side.z)) * 0.7), {
        sway: (p) => smooth(0, 2.4, Math.hypot(p.x - ox, p.z - oz)) * 0.8,
      });
    }
  }
  return L.geo();
}

/** Sea pandan: prop roots and a fountain of sword leaves. */
function pandan(seed: number): THREE.BufferGeometry {
  const L = new Leaves(seed);
  const r = L.r;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28 + r();
    L.trunk(
      [
        [Math.cos(a) * 0.8, -0.4, Math.sin(a) * 0.8],
        [Math.cos(a) * 0.4, 0.6, Math.sin(a) * 0.4],
        [0, 1.2, 0],
      ],
      0.08,
      0.07,
      bark('#7a6a52', '#a3906f'),
      { seg: 4, rings: 4 }
    );
  }
  const heads: Vec[] = [
    [0, 1.5, 0],
    [0.6, 1.2, 0.35],
    [-0.5, 1.1, 0.3],
  ];
  for (const hd of heads) {
    L.trunk([[0, 0.9, 0], [hd[0] * 0.5, (hd[1] + 0.9) / 2, hd[2] * 0.5], hd], 0.14, 0.12, bark('#7a6a52', '#a3906f'), { seg: 5, rings: 3 });
    for (let i = 0; i < 22; i++) {
      const az = i * 2.39996;
      const k = i / 22;
      const pitch = lerp(1.35, 0.1, k);
      const len = lerp(1.1, 1.6, r());
      const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(0.09);
      const p = (t: number): THREE.Vector3 =>
        new THREE.Vector3(...hd).addScaledVector(dir, Math.cos(pitch) * t * len).add(new THREE.Vector3(0, Math.sin(pitch) * t * len - 0.8 * t * t * len * (0.4 + k * 0.5), 0));
      const g = new THREE.BufferGeometry();
      const pos: number[] = [];
      for (let s = 0; s < 4; s++) {
        const a = p(s / 4);
        const b = p((s + 1) / 4);
        const w0 = 1 - s / 4;
        const w1 = 1 - (s + 1) / 4;
        const A = a.clone().addScaledVector(side, w0);
        const B = a.clone().addScaledVector(side, -w0);
        const C2 = b.clone().addScaledVector(side, w1);
        const D = b.clone().addScaledVector(side, -w1);
        for (const v of [A, C2, B, B, C2, D]) pos.push(v.x, v.y, v.z);
      }
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.computeVertexNormals();
      L.solid(g, (q) => _c.set('#3f7f4a').lerp(hex('#b8d07a'), smooth(0.3, 1.5, Math.hypot(q.x - hd[0], q.z - hd[2]))), { sway: (q) => Math.hypot(q.x - hd[0], q.z - hd[2]) * 0.25 });
    }
  }
  return L.geo();
}

function bush(seed: number, lo: string, hi: string, flower?: string): SplitGeo {
  const L = new Leaves(seed);
  const S = new Leaves(seed);
  const r = L.r;
  const crown = new THREE.Vector3(0, 0.55, 0);
  const lobes: { c: THREE.Vector3; r: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + r();
    lobes.push({ c: new THREE.Vector3(Math.cos(a) * 0.55 * r(), 0.42 + r() * 0.35, Math.sin(a) * 0.55), r: lerp(0.5, 0.78, r()) });
  }
  for (const l of lobes) L.lobe(l.c, l.r, 0.85, 15, 0.82, seed % 2, crown, 0.9, tone(lo, hi), lobes, 0.18, { minY: -0.1, solid: S });
  if (flower) {
    for (let i = 0; i < 9; i++) {
      const l = lobes[i % lobes.length];
      const a = r() * 6.28;
      const e = lerp(0.3, 1.2, r());
      const p = l.c.clone().add(new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(l.r * 1.06));
      const g = new THREE.OctahedronGeometry(0.11, 0);
      g.scale(1, 0.6, 1);
      g.translate(p.x, p.y, p.z);
      S.solid(g, () => _c.set(flower), { sway: () => 0.18, glow: 0.2 });
    }
  }
  return { solid: S.geo(), cards: L.geo() };
}

function fern(seed: number): THREE.BufferGeometry {
  const L = new Leaves(seed);
  const r = L.r;
  for (let i = 0; i < 7; i++) {
    frond(L, new THREE.Vector3(0, 0.1, 0), i * 2.39996, lerp(1.0, 0.45, r()), lerp(0.9, 1.4, r()), 0.5, 0.26, hex('#3f7f3a'), hex('#a3cf52'), 0, 0.35, 3);
  }
  return L.geo();
}

function tuft(seed: number): THREE.BufferGeometry {
  const L = new Leaves(seed);
  const r = L.r;
  for (let i = 0; i < 11; i++) {
    const az = i * 2.39996;
    const h = lerp(0.35, 0.75, r());
    const d = lerp(0.08, 0.3, r());
    const bx = Math.cos(az) * d * 0.6;
    const bz = Math.sin(az) * d * 0.6;
    const sx = -Math.sin(az) * 0.055;
    const sz = Math.cos(az) * 0.055;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([bx - sx, -0.05, bz - sz, bx + sx, -0.05, bz + sz, bx + Math.cos(az) * d * 1.6, h, bz + Math.sin(az) * d * 1.6]), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    L.solid(g, (p) => _c.set('#5f9a3e').lerp(hex('#c8dc6a'), smooth(0, 0.6, p.y)), { sway: (p) => Math.max(0, p.y) * 0.4, ao: (p) => lerp(0.6, 1, smooth(0, 0.3, p.y)) });
  }
  return L.geo();
}

/** Katang-katang (beach morning glory): the runner that stitches forest to sand on Sumatran beaches. */
function runner(seed: number): THREE.BufferGeometry {
  const L = new Leaves(seed);
  const r = L.r;
  const disc = (x: number, z: number, s: number, rot: number, c: string): void => {
    const sh = new THREE.Shape();
    sh.moveTo(0, -s * 0.55);
    sh.bezierCurveTo(s * 0.9, -s * 0.5, s * 0.75, s * 0.55, s * 0.18, s * 0.5);
    sh.lineTo(0, s * 0.3);
    sh.lineTo(-s * 0.18, s * 0.5);
    sh.bezierCurveTo(-s * 0.75, s * 0.55, -s * 0.9, -s * 0.5, 0, -s * 0.55);
    const g = new THREE.ShapeGeometry(sh, 2);
    g.rotateX(-Math.PI / 2 + (r() - 0.5) * 0.5);
    g.rotateY(rot);
    g.translate(x, 0.1 + r() * 0.08, z);
    L.solid(g, () => _c.set(c), { normal: (_p, n) => n.set(n.x * 0.5, Math.abs(n.y) + 0.4, n.z * 0.5).normalize() });
  };
  for (let k = 0; k < 3; k++) {
    let x = 0;
    let z = (k - 1) * 0.5;
    let a = (k - 1) * 0.35 + (r() - 0.5) * 0.3;
    const pts: Vec[] = [];
    for (let i = 0; i < 9; i++) {
      pts.push([x, 0.05, z]);
      const c = ['#4f9a44', '#6fb84c', '#3f8a46'][i % 3];
      disc(x + (r() - 0.5) * 0.3, z + 0.22, lerp(0.24, 0.36, r()), r() * 6, c);
      disc(x + (r() - 0.5) * 0.3, z - 0.22, lerp(0.24, 0.36, r()), r() * 6, c);
      if (i % 4 === 2) {
        const f = new THREE.ConeGeometry(0.17, 0.2, 7, 1, true);
        f.rotateX(Math.PI);
        f.translate(x, 0.26, z + (r() - 0.5) * 0.5);
        L.solid(f, () => _c.set('#d878d8'), { glow: 0.15 });
      }
      a += (r() - 0.5) * 0.6;
      x += Math.cos(a) * 0.42;
      z += Math.sin(a) * 0.42;
    }
    L.trunk(pts, 0.035, 0.02, bark('#6f7a3a', '#8a8a4a'), { seg: 3, rings: 5 });
  }
  return L.geo();
}

function mangrove(seed: number): THREE.BufferGeometry {
  const L = new Leaves(seed);
  const r = L.r;
  // arched prop roots are the whole silhouette of a Rhizophora
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.28 + r() * 0.5;
    const d = lerp(0.85, 1.35, r());
    const y = lerp(0.7, 1.15, r());
    L.trunk(
      [
        [Math.cos(a) * d, -0.9, Math.sin(a) * d],
        [Math.cos(a) * d * 0.86, 0.1, Math.sin(a) * d * 0.86],
        [Math.cos(a) * d * 0.42, y * 0.85, Math.sin(a) * d * 0.42],
        [0, y + 0.1, 0],
      ],
      0.07,
      0.09,
      bark('#6a4d3a', '#8f6d52'),
      { seg: 5, rings: 7 }
    );
  }
  L.trunk(
    [
      [0, 0.7, 0],
      [0.1, 1.4, 0.05],
      [0, 2.1, 0],
    ],
    0.18,
    0.12,
    bark('#6a4d3a', '#8f6d52'),
    { seg: 6, rings: 4 }
  );
  const crown = new THREE.Vector3(0, 2.5, 0);
  const lobes: { c: THREE.Vector3; r: number }[] = [{ c: new THREE.Vector3(0, 2.75, 0), r: 0.95 }];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28 + r();
    lobes.push({ c: new THREE.Vector3(Math.cos(a) * 0.85, 2.15 + r() * 0.5, Math.sin(a) * 0.85), r: lerp(0.6, 0.85, r()) });
  }
  for (const l of lobes) L.lobe(l.c, l.r, 0.85, 20, 0.85, 1, crown, 1.4, tone('#2a7a45', '#8fd45a'), lobes, 0.2);
  // hanging propagules
  for (let i = 0; i < 7; i++) {
    const a = r() * 6.28;
    const g = new THREE.CylinderGeometry(0.03, 0.05, 0.42, 4);
    g.translate(Math.cos(a) * 1.1, 1.75 + r() * 0.2, Math.sin(a) * 1.1);
    L.solid(g, () => _c.set('#c8d86a'), { sway: () => 0.25 });
  }
  return L.geo();
}

/** Bumi Rafflesia. Bengkulu's own flower, so it gets modelled properly. */
function rafflesia(): THREE.BufferGeometry {
  const b = new Build(9);
  const r = b.r;
  const red = hex('#b8322e');
  const deep = hex('#7a1a1e');
  const wart = hex('#ffd9b8');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const seg = 7;
    const pos: number[] = [];
    const P = (u: number, v: number): Vec => {
      // u along petal 0..1, v across -1..1
      const w = 0.98 * Math.pow(Math.sin(Math.PI * clamp(0.16 + u * 0.76, 0, 1)), 0.6);
      const x = 0.62 + u * 1.5;
      const y = 0.42 + Math.sin(u * 2.6) * 0.36 - v * v * 0.2 * u - u * u * 0.34;
      const z = v * w;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [x * c - z * s, y, x * s + z * c];
    };
    for (let j = 0; j < seg; j++)
      for (let k = 0; k < seg; k++) {
        const A = P(j / seg, (k / seg) * 2 - 1);
        const B = P((j + 1) / seg, (k / seg) * 2 - 1);
        const D = P((j + 1) / seg, ((k + 1) / seg) * 2 - 1);
        const E = P(j / seg, ((k + 1) / seg) * 2 - 1);
        pos.push(...A, ...E, ...B, ...B, ...E, ...D);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.computeVertexNormals();
    b.add(g, { color: (p) => _c.copy(deep).lerp(red, smooth(0.5, 1.5, Math.hypot(p.x, p.z))), gloss: 0.3, glow: 0.12 });
    for (let w = 0; w < 13; w++) {
      const p = P(0.12 + r() * 0.8, (r() * 2 - 1) * 0.8);
      const s = lerp(0.06, 0.13, r());
      b.ball(s, { color: wart, pos: [p[0], p[1] + 0.02, p[2]], scale: [1, 0.5, 1], seg: 6, glow: 0.15 });
    }
  }
  // the bowl: rim, dark mouth, and the disc of spikes inside
  b.add(new THREE.TorusGeometry(0.66, 0.26, 8, 22), { color: '#d8604a', top: '#ffb08a', pos: [0, 0.62, 0], rot: [Math.PI / 2, 0, 0], gloss: 0.3, glow: 0.1 });
  b.cyl(0.62, 0.5, 0.5, { color: '#3a0c10', pos: [0, 0.36, 0], seg: 18, ao: 0.4 });
  b.cyl(0.42, 0.42, 0.06, { color: '#c8503a', pos: [0, 0.6, 0], seg: 16 });
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39996;
    const d = Math.sqrt(i / 12) * 0.34;
    b.cyl(0.015, 0.045, 0.2, { color: '#ffd0a0', pos: [Math.cos(a) * d, 0.72, Math.sin(a) * d], seg: 5 });
  }
  return b.geo();
}

/* ================================================================== planting */

const FOLIAGE_LIGHT = /* glsl */ `
  vec3 Vf = normalize(cameraPosition - vWP);
  float shf = sunShadow(vWP, n) * cloudShade(vWP.xz);
  if (gloss > .5){
    c = toonLight(alb, n, vWP, ao, 0., emis);
  } else {
    float nd = dot(n, uSunDir) * .5 + .5;
    float l = nd * mix(.5, 1., shf) * mix(.6, 1.04, ao);
    // three painted tones: cool shade, body, sun
    float s = smoothstep(.36, .44, l) * .46 + smoothstep(.6, .68, l) * .54;
    vec3 ambf = mix(uGroundCol, uSkyCol, n.y * .5 + .5) * mix(.42, 1., ao);
    c = alb * vec3(.7, .94, 1.12) * ambf * 1.18 + alb * vec3(1.14, 1.08, .74) * uSunCol * s * mix(.55, 1., ao);
    float tr = pow(sat(dot(Vf, -uSunDir) * .6 + .3), 2.);
    c += alb * vec3(1.1, 1.2, .35) * uSunCol * tr * .4 * mix(.3, 1., shf) * ao;
    float fr = pow(1. - sat(dot(n, Vf)), 3.);
    c += uRimCol * fr * ao * .35 * (.4 + .6 * shf);
    c += lamps(vWP, n) * alb;
    c += alb * emis;
  }
`;

interface ManagedBatch {
  mesh: THREE.InstancedMesh;
  items: Inst[];
  localBox: THREE.Box3;
  isBrush: boolean;
  casts: boolean;
  cineOnly: boolean;
  activeCount: number;
  playCount: number;
}

export class Flora {
  readonly group = new THREE.Group();
  readonly dynGroup = new THREE.Group();
  readonly leafPair: ToonPair;
  private solidPair: ToonPair;
  private solidDoublePair: ToonPair;
  private mangPair: ToonPair;
  private batches: ManagedBatch[] = [];
  private brushShare = 1;
  private playMode = false;
  private playFrustum: THREE.Frustum | null = null;
  private mang: THREE.InstancedMesh;
  private raff: THREE.Mesh;
  private stakes: THREE.InstancedMesh;
  private stakeM: { x: number; z: number; m: THREE.Matrix4 }[] = [];

  constructor() {
    const atlas = leafAtlas();
    const uniforms = { tLeaf: { value: atlas } };
    const sharedVWorld = /* glsl */ `wp.xyz += windAt(wp.xyz, aInst.x * 6.28) * aFx.y;`;
    const dryTint = /* glsl */ `
        // tired and yellowed while the coast is sick, lush once it heals
        float lush = smoothstep(.04, .55, uEco);
        float own = fract(vInst.y * 7.31);
        float dry = (1. - lush) * mix(.45, 1., own);
        vec3 tired = mix(vec3(dot(alb, vec3(.35, .5, .15))), alb, .62) * vec3(1.16, .9, .56);
        alb = mix(alb, tired, dry * (1. - step(.5, gloss)));
    `;
    const leafOpts = {
      side: THREE.DoubleSide,
      uniforms,
      alphaToCoverage: true,
      vWorld: sharedVWorld,
      fHead: 'uniform sampler2D tLeaf;',
      fAlbedo: /* glsl */ `
        n = normalize(vN);
        vec4 tl = texture2D(tLeaf, vUv2);
        float la = tl.a;
        la = (la - .42) / max(fwidth(la), .001) + .5;
        #ifdef MSAA
        if (la < .1) discard;
        #else
        if (la < .5) discard;
        #endif
        outA = sat(la);
        alb *= mix(1., tl.r * 1.22, 1. - step(.5, gloss));
        ${dryTint}
      `,
      fLight: FOLIAGE_LIGHT,
      fDepth: 'if (texture2D(tLeaf, vUv2).a < .42) discard;',
    };
    // Opaque foliage (trunks, canopy cores, fronds, blades) skips leaf-atlas sampling and alpha-discard so Early-Z stays active.
    const solidOpts = {
      vWorld: sharedVWorld,
      fAlbedo: /* glsl */ `
        n = normalize(vN);
        alb *= mix(1., 1.10996, 1. - step(.5, gloss));
        ${dryTint}
      `,
      fLight: FOLIAGE_LIGHT,
      isStatic: true,
    };
    this.leafPair = toon({ ...leafOpts, isStatic: true });
    this.solidPair = toon({ ...solidOpts, side: THREE.FrontSide });
    this.solidDoublePair = toon({ ...solidOpts, side: THREE.DoubleSide });
    this.mangPair = toon({ ...leafOpts, isStatic: false });

    const r = rng(404);
    const pier = { x: toX(VILLAGE_PIER.x), z: toZ(VILLAGE_PIER.y) };
    const raff = { x: toX(RAFFLESIA_POS.x) - 1.2, z: toZ(RAFFLESIA_POS.y) };

    /** Keep-out rules: never block the village, the flower or a fire from the gameplay camera. */
    const blocked = (x: number, z: number, tall: number, rad: number): boolean => {
      if (pathAmount(x, z) > 0.12 && tall > 1) return true;
      const vx = (x - (pier.x - 6.5)) / 9.6;
      const vz = (z - (pier.z + 2.4)) / 8.2;
      if (tall > 2.2 && vx * vx + vz * vz < 1) return true;
      const rx = Math.abs(x - raff.x);
      const dz = z - raff.z;
      if (rx < 2.6 + rad && dz > -2.4 - rad * 0.5 && dz < 2.2 + tall * 0.95) return true;
      for (const f of FIRE_SPOTS) if (Math.hypot(x - toX(f.x), z - toZ(f.y)) < 2.4 + rad) return true;
      return false;
    };

    type Sp = { geos: (THREE.BufferGeometry | SplitGeo)[]; items: Inst[][] };
    const sp = (geos: (THREE.BufferGeometry | SplitGeo)[]): Sp => ({ geos, items: geos.map(() => []) });
    const S = {
      rainNear: sp([rainTree(1, true), rainTree(2, true), rainTree(3, true), rainTree(8, true)]),
      rainFar: sp([rainTree(4, false), rainTree(5, false), rainTree(6, false)]),
      emergent: sp([emergent(21), emergent(22)]),
      ketapang: sp([ketapang(31)]),
      casuarina: sp([casuarina(41), casuarina(42)]),
      palm: sp([palm(51, 8.4, 3.0), palm(52, 7.2, 1.6), palm(53, 9.6, 4.2)]),
      banana: sp([banana(61), banana(62)]),
      pandan: sp([pandan(71)]),
      bush: sp([bush(80, '#2f7a3c', '#8fc84a'), bush(81, '#3f8040', '#b4d455'), bush(82, '#2f6f4a', '#6fb86a', '#ff5a4a')]),
      fern: sp([fern(91)]),
      tuft: sp([tuft(95), tuft(96)]),
      runner: sp([runner(97), runner(98)]),
    };
    const add = (s: Sp, x: number, z: number, scale: number, rot: number, o: { sink?: number; tint?: number; v?: number; tilt?: number } = {}): void => {
      const v = o.v ?? Math.floor(r() * s.geos.length);
      const t = 1 + (r() - 0.5) * 2 * (o.tint ?? 0.1);
      const c = new THREE.Color(t * lerp(0.95, 1.07, r()), t, t * lerp(0.9, 1.06, r()));
      s.items[v].push({
        m: matrixOf([x, groundAt(x, z) - (o.sink ?? 0.1), z], [(r() - 0.5) * (o.tilt ?? 0.08), rot, (r() - 0.5) * (o.tilt ?? 0.08)], scale),
        color: c,
        i: [r(), r(), 0, 0],
      });
    };

    /* palms: placed by hand, leaning to the light over the water */
    const palms: [number, number, number, number, number][] = [
      // simY, metres inland, scale, yaw, variant
      [64, 5.4, 0.92, -0.2, 1],
      [88, 7.2, 1.04, 0.3, 0],
      [148, 6.2, 0.86, 0.5, 1],
      [232, 7.0, 1.0, -0.35, 0],
      [262, 8.6, 0.8, 0.5, 1],
      [300, 9.6, 1.08, -0.1, 2],
      [322, 11.6, 0.9, 0.4, 1],
      [396, 10.4, 0.96, 0.25, 0],
      [412, 12.4, 1.06, -0.4, 2],
      [548, 8.4, 1.0, -0.1, 0],
      [574, 10.2, 0.88, 0.55, 1],
      [640, 6.6, 1.02, 0.2, 2],
      [668, 8.4, 0.86, -0.3, 1],
      [716, 6.8, 1.0, 0.1, 0],
      [-20, 6.6, 1.0, 0.2, 0],
      [-70, 7.4, 0.9, -0.3, 2],
    ];
    for (const [sy, b, s, yaw, v] of palms) {
      const z = toZ(sy);
      const x = shoreAt(z) - b;
      add(S.palm, x, z, s, yaw, { v, tint: 0.06, tilt: 0.04 });
    }

    /* a row of casuarinas along the north beach, planted the way the town planted them */
    for (let i = 0; i < 11; i++) {
      const z = -56 + i * 3.7 + (r() - 0.5) * 1.1;
      const x = shoreAt(z) - beachWidth(z) - 1.8 - (i % 2) * 1.7;
      if (blocked(x, z, 8, 1)) continue;
      add(S.casuarina, x, z, lerp(0.78, 1.02, r()), r() * 0.6 - 0.3, { tint: 0.08 });
    }
    /* ketapang shade trees where people rest */
    const shade: [number, number, number][] = [
      [286, 13.4, 0.94],
      [366, 14.6, 1.06],
      [598, 10.8, 0.92],
      [206, 12.6, 0.84],
      [520, 22, 1.0],
    ];
    for (const [sy, b, s] of shade) {
      const z = toZ(sy);
      add(S.ketapang, shoreAt(z) - b, z, s, r() * 6, { tint: 0.05 });
    }

    /* closed forest: dart throwing with species-dependent spacing */
    const placed: { x: number; z: number; r: number }[] = [];
    for (const k of ['palm', 'casuarina', 'ketapang'] as const) {
      for (const list of S[k].items) for (const it of list) placed.push({ x: it.m.elements[12], z: it.m.elements[14], r: k === 'ketapang' ? 2.5 : 1.1 });
    }
    const z0 = -66;
    const z1 = 50;
    for (let n = 0; n < 5200; n++) {
      const z = lerp(z0, z1, r());
      const sx = shoreAt(z);
      const b = beachWidth(z) + 1.2 + Math.pow(r(), 1.15) * 44;
      const x = sx - b;
      if (x < -92) continue;
      const deep = b - beachWidth(z);
      if (forestAmount(x, z) < 0.55) continue;
      const em = r() < 0.05 && deep > 6;
      const scale = em ? lerp(0.85, 1.1, r()) : lerp(0.72, 1.12, r()) * lerp(0.82, 1.08, smooth(0, 10, deep));
      const rad = (em ? 2.1 : 2.05) * scale;
      if (blocked(x, z, em ? 12 : 7.5 * scale, rad)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + rad) * 0.82)) continue;
      placed.push({ x, z, r: rad });
      if (em) add(S.emergent, x, z, scale, r() * 6);
      else add(deep < 17 ? S.rainNear : S.rainFar, x, z, scale, r() * 6, { tint: 0.13, tilt: 0.14 });
    }

    /* skirt: shrubs, ferns, banana and pandan blur the edge between forest and sand */
    const low: { x: number; z: number; r: number }[] = [];
    for (let n = 0; n < 3000; n++) {
      const z = lerp(-60, 47, r());
      const sx = shoreAt(z);
      const bw = beachWidth(z);
      const b = bw - 1.4 + Math.pow(r(), 1.5) * 13;
      const x = sx - b;
      const f = forestAmount(x, z);
      if (f < 0.35) continue;
      const roll = r();
      const pick = roll < 0.5 ? 'bush' : roll < 0.76 ? 'fern' : roll < 0.88 ? 'banana' : 'pandan';
      if (pick === 'pandan' && b - bw > 3) continue;
      const scale = lerp(0.8, 1.3, r()) * (pick === 'banana' ? 0.85 : 1);
      const rad = (pick === 'bush' ? 0.75 : pick === 'fern' ? 0.6 : pick === 'banana' ? 1.0 : 0.9) * scale;
      if (blocked(x, z, pick === 'banana' ? 3.2 : 1.1, rad * 0.5)) continue;
      if (Math.hypot(x - (pier.x - 5), z - pier.z) < 5.4) continue;
      if (low.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + rad) * 0.72)) continue;
      low.push({ x, z, r: rad });
      add(S[pick], x, z, scale, r() * 6, { tint: 0.14, tilt: 0.1 });
    }
    /* grass and beach runners on the sand itself */
    for (let n = 0; n < 1500; n++) {
      const z = lerp(-60, 47, r());
      const bw = beachWidth(z);
      const b = bw + lerp(-3.4, 1.4, r());
      const x = shoreAt(z) - b;
      const f = forestAmount(x, z) + noise2(x * 0.3, z * 0.3) * 0.35;
      if (f < 0.12 || f > 0.85 || pathAmount(x, z) > 0.2) continue;
      add(S.tuft, x, z, lerp(0.7, 1.35, r()), r() * 6, { sink: 0.02, tint: 0.16 });
    }
    for (let n = 0; n < 60; n++) {
      const z = lerp(-58, 46, (n + r()) / 60);
      const bw = beachWidth(z);
      const x = shoreAt(z) - bw - 0.4;
      if (pathAmount(x + 1.5, z) > 0.2 || r() < 0.25) continue;
      if (Math.hypot(x - (pier.x - 4), z - pier.z) < 6) continue;
      add(S.runner, x, z, lerp(0.75, 1.15, r()), (r() - 0.5) * 0.9, { sink: 0.0, tint: 0.08, tilt: 0.02 });
    }

    // Add opaque solids first (FrontSide cores/trunks, then DoubleSide blades/fronds), and alpha-tested cards last
    // so hardware Early-Z rejects occluded undergrowth and back-layer foliage behind solid canopy cores.
    const solidLayer: ManagedBatch[] = [];
    const doubleSolidLayer: ManagedBatch[] = [];
    const cardLayer: ManagedBatch[] = [];

    const register = (
      layer: ManagedBatch[],
      geo: THREE.BufferGeometry,
      pair: ToonPair,
      items: Inst[],
      opts: { cast: boolean; isBrush: boolean; cineOnly?: boolean }
    ): void => {
      if (!items.length) return;
      geo.computeBoundingBox();
      const im = instanced(geo, pair, items, { cast: opts.cast });
      layer.push({
        mesh: im,
        items,
        localBox: geo.boundingBox!.clone(),
        isBrush: opts.isBrush,
        casts: opts.cast,
        cineOnly: !!opts.cineOnly,
        activeCount: items.length,
        playCount: items.length,
      });
    };

    const specs: { sp: Sp; isBrush: boolean; castSolid: boolean; castCards: boolean }[] = [
      { sp: S.rainNear, isBrush: false, castSolid: true, castCards: true },
      // Deep inland canopies cast shadow volume from their opaque cores only (skipping alpha-tested card shadows).
      { sp: S.rainFar, isBrush: false, castSolid: true, castCards: false },
      { sp: S.emergent, isBrush: false, castSolid: true, castCards: true },
      { sp: S.ketapang, isBrush: false, castSolid: true, castCards: true },
      { sp: S.casuarina, isBrush: false, castSolid: true, castCards: true },
      { sp: S.palm, isBrush: false, castSolid: true, castCards: false },
      { sp: S.banana, isBrush: false, castSolid: false, castCards: false },
      { sp: S.pandan, isBrush: true, castSolid: false, castCards: false },
      { sp: S.bush, isBrush: true, castSolid: false, castCards: false },
      { sp: S.fern, isBrush: true, castSolid: false, castCards: false },
      { sp: S.tuft, isBrush: true, castSolid: false, castCards: false },
      { sp: S.runner, isBrush: false, castSolid: false, castCards: false },
    ];
    for (const cfg of specs) {
      cfg.sp.geos.forEach((g, i) => {
        const items = cfg.sp.items[i];
        if (!items.length) return;
        if (g instanceof THREE.BufferGeometry) {
          register(doubleSolidLayer, g, this.solidDoublePair, items, { cast: cfg.castSolid, isBrush: cfg.isBrush });
        } else {
          if (g.solid) register(solidLayer, g.solid, this.solidPair, items, { cast: cfg.castSolid, isBrush: cfg.isBrush });
          // Near-forest trunks are completely buried under their canopies from the overhead gameplay camera.
          if (g.trunk) register(solidLayer, g.trunk, this.solidPair, items, { cast: cfg.castSolid, isBrush: cfg.isBrush, cineOnly: true });
          if (g.cards) register(cardLayer, g.cards, this.leafPair, items, { cast: cfg.castCards, isBrush: cfg.isBrush });
        }
      });
    }
    for (const layer of [solidLayer, doubleSolidLayer, cardLayer]) {
      for (const b of layer) {
        this.group.add(b.mesh);
        this.batches.push(b);
      }
    }
    this.setBrushDensity(Q.brush);

    /* Rafflesia in its clearing */
    this.raff = mesh(rafflesia(), toon({ side: THREE.DoubleSide }));
    this.raff.position.set(raff.x, groundAt(raff.x, raff.z) + 0.05, raff.z);
    this.dynGroup.add(this.raff);

    /* planted mangroves, plus bamboo stakes that mark every slot still empty */
    this.mang = instanced(mangrove(101), this.mangPair, [], { capacity: 26 });
    this.dynGroup.add(this.mang);
    const st = new Build(6);
    st.bar([0, -0.6, 0], [0.04, 1.15, 0], 0.07, 0.055, { color: '#c8a862', top: '#e2c988', seg: 6 });
    st.quad([0.04, 1.1, 0], [0.5, 1.02, 0.02], [0.46, 0.8, 0.02], [0.04, 0.82, 0], { color: '#4fd17f', sway: (p) => Math.max(0, p.x) * 0.9 });
    st.ball(0.1, { color: '#f4e6b8', pos: [0, 0.2, 0], seg: 6 });
    const stakePair = toon({ side: THREE.DoubleSide, vWorld: 'wp.xyz += windAt(wp.xyz, aInst.x * 6.28) * aFx.y;' });
    for (const s of MANGROVE_SLOTS) {
      const x = toX(s.x) + 0.3;
      const z = toZ(s.y);
      this.stakeM.push({ x, z, m: matrixOf([x, groundAt(x, z), z], [(r() - 0.5) * 0.2, r() * 2 - 1, (r() - 0.5) * 0.2], 1) });
    }
    this.stakes = instanced(
      st.geo(),
      stakePair,
      this.stakeM.map((s) => ({ m: s.m, i: [r(), 0, 0, 0] as [number, number, number, number] }))
    );
    this.dynGroup.add(this.stakes);
  }

  private white = new THREE.Color(1, 1, 1);
  private cullBox = new THREE.Box3();
  private cullCam = new THREE.PerspectiveCamera(27, 16 / 9, 1, 1400);
  private cullVP = new THREE.Matrix4();

  /** Recomputes which forest instances can appear (or cast shadows) in the overhead gameplay view. */
  updatePlayCulling(playPose: Pose, aspect: number): void {
    const cam = this.cullCam;
    cam.fov = playPose.fov;
    cam.aspect = aspect;
    cam.position.copy(playPose.pos);
    cam.lookAt(playPose.look);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    this.cullVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.playFrustum = (this.playFrustum ?? new THREE.Frustum()).setFromProjectionMatrix(this.cullVP);
    this.repackBatches();
  }

  /** Switches between gameplay frustum-culled counts and full cinematic counts (title/intro/cutscenes). */
  setPlayMode(playOnly: boolean): boolean {
    if (playOnly === this.playMode) return false;
    this.playMode = playOnly;
    this.applyBatchCounts();
    return true;
  }

  setBrushDensity(share: number): void {
    this.brushShare = clamp(share, 0.2, 1);
    this.repackBatches();
  }

  private repackBatches(): void {
    const frustum = this.playFrustum;
    for (const b of this.batches) {
      const full = b.items.length;
      b.activeCount = b.isBrush ? Math.max(1, Math.round(full * this.brushShare)) : full;
      if (b.cineOnly) {
        b.playCount = 0;
        continue;
      }
      if (!frustum) {
        b.playCount = b.activeCount;
        continue;
      }
      const vis: Inst[] = [];
      const hid: Inst[] = [];
      for (let i = 0; i < b.activeCount; i++) {
        const it = b.items[i];
        this.cullBox.copy(b.localBox).applyMatrix4(it.m);
        // Pad for subtle parallax/shake, and keep off-left/north/south casters whose dawn/sunset shadow enters frame.
        this.cullBox.min.x -= 2.5;
        this.cullBox.max.x += b.casts ? 15 : 2.5;
        this.cullBox.min.z -= b.casts ? 6 : 2.5;
        this.cullBox.max.z += b.casts ? 9 : 2.5;
        if (frustum.intersectsBox(this.cullBox)) vis.push(it);
        else hid.push(it);
      }
      b.playCount = vis.length;
      const instAttr = b.mesh.geometry.attributes.aInst as THREE.InstancedBufferAttribute;
      const data = instAttr.array as Float32Array;
      let k = 0;
      for (const it of vis) {
        b.mesh.setMatrixAt(k, it.m);
        b.mesh.setColorAt(k, it.color ?? this.white);
        if (it.i) data.set(it.i, k * 4);
        k++;
      }
      for (const it of hid) {
        b.mesh.setMatrixAt(k, it.m);
        b.mesh.setColorAt(k, it.color ?? this.white);
        if (it.i) data.set(it.i, k * 4);
        k++;
      }
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
      instAttr.needsUpdate = true;
    }
    this.applyBatchCounts();
  }

  private applyBatchCounts(): void {
    for (const b of this.batches) {
      setCount(b.mesh, this.playMode ? b.playCount : b.activeCount);
    }
  }

  private m4 = new THREE.Matrix4();
  update(t: number, progress: PlayerProgress, mangroveOn: boolean, bloom: number): void {
    const list: PermanentMangrove[] = progress.mangroves;
    const n = Math.min(list.length, 26);
    for (let i = 0; i < n; i++) {
      const m = list[i];
      const x = toX(m.x) + 0.35;
      const z = toZ(m.y);
      const grow = m.scale / Math.max(0.01, m.targetScale);
      const pop = m.scale * (1 + Math.sin(clamp(grow, 0, 1) * Math.PI) * 0.25) * 1.05;
      this.m4.copy(matrixOf([x, groundAt(x, z) + 0.12, z], [Math.sin(t * 1.1 + m.swayOffset) * 0.02, m.seed, Math.cos(t * 0.9 + m.swayOffset) * 0.02], [pop, pop * lerp(0.9, 1.12, (m.seed * 7.3) % 1), pop]));
      this.mang.setMatrixAt(i, this.m4);
    }
    setCount(this.mang, n);
    if (n > 0) this.mang.instanceMatrix.needsUpdate = true;

    let k = 0;
    if (mangroveOn) {
      for (const s of this.stakeM) {
        if (list.some((m) => Math.hypot(toX(m.x) - s.x, toZ(m.y) - s.z) < 2.6)) continue;
        this.stakes.setMatrixAt(k++, s.m);
      }
    }
    this.stakes.count = k;
    this.stakes.visible = k > 0;
    if (k > 0) this.stakes.instanceMatrix.needsUpdate = true;

    const b = lerp(0.95, 1.5, bloom) * (1 + Math.sin(t * 1.7) * 0.018 * bloom);
    this.raff.scale.set(b, b * lerp(0.7, 1, bloom), b);
  }
}
