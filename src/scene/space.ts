import { CORAL_CLUSTERS, getShoreX, SEA_ROCKS, WORLD_H, WORLD_W } from '../world';

/**
 * Bridges the 2D simulation (1280 x 720 px) and the 3D scene.
 * Sim X -> world X, sim Y -> world Z, height -> world Y. Sea level is Y = 0.
 */
export const UNIT = 0.1;

export const toX = (sx: number): number => (sx - WORLD_W / 2) * UNIT;
export const toZ = (sy: number): number => (sy - WORLD_H / 2) * UNIT;
export const simX = (x: number): number => x / UNIT + WORLD_W / 2;
export const simY = (z: number): number => z / UNIT + WORLD_H / 2;

/** Shoreline X (world) at a given Z. Averaged so the two kinks in getShoreX() read as curves. */
export function shoreAt(z: number): number {
  const y = simY(z);
  let sum = 0;
  let w = 0;
  for (let i = -3; i <= 3; i++) {
    const k = 1 - Math.abs(i) / 4;
    sum += getShoreX(y + i * 9) * k;
    w += k;
  }
  return toX(sum / w);
}

/** Signed distance from the shoreline. Positive is out at sea, negative is inland. */
export const seaward = (x: number, z: number): number => x - shoreAt(z);

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function smooth(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export type Rng = () => number;
export function rng(seed: number): Rng {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}

export function fbm(x: number, y: number, oct = 4): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += noise2(x * f + i * 17.3, y * f - i * 9.1) * a;
    a *= 0.5;
    f *= 2.03;
  }
  return s;
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const n = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k);
  return (
    lerp(
      lerp(lerp(n(0, 0, 0), n(1, 0, 0), u), lerp(n(0, 1, 0), n(1, 1, 0), u), v),
      lerp(lerp(n(0, 0, 1), n(1, 0, 1), u), lerp(n(0, 1, 1), n(1, 1, 1), u), v),
      w
    ) *
      2 -
    1
  );
}

/** Where the dry beach gives way to undergrowth, in world units inland of the shoreline. */
export function beachWidth(z: number): number {
  const y = simY(z);
  // Wide and walkable around the village and net, tighter along the two mangrove flats.
  const village = smooth(262, 330, y) * (1 - smooth(500, 566, y));
  return lerp(6.6, 11.4, village) + fbm(z * 0.11 + 4, 2.7, 3) * 2.6;
}

/** 0..1 tidal mud: the two stretches of coast where mangroves can be planted. */
export function mudAmount(z: number): number {
  const y = simY(z);
  const top = smooth(36, 74, y) * (1 - smooth(272, 312, y));
  const bottom = smooth(508, 548, y) * (1 - smooth(706, 748, y));
  return Math.max(top, bottom);
}

const REEF = CORAL_CLUSTERS.map((c) => ({ x: toX(c.x), z: toZ(c.y), r: c.r * UNIT }));
const ROCKS = SEA_ROCKS.map((c) => ({ x: toX(c.x), z: toZ(c.y), r: c.r * UNIT }));

/** 0..1 coral shelf influence. */
export function reefAmount(x: number, z: number): number {
  let m = 0;
  for (const c of REEF) {
    const d = Math.hypot(x - c.x, z - c.z) + noise2(x * 0.32, z * 0.32) * 1.3;
    m = Math.max(m, 1 - smooth(c.r * 0.62, c.r * 1.75, d));
  }
  return m;
}

/** Ground height (beach, forest floor, seabed) in world units. Sea level is 0. */
export function groundAt(x: number, z: number): number {
  const d = seaward(x, z);
  if (d < 0) {
    const b = -d;
    const bw = beachWidth(z);
    const mud = mudAmount(z);
    const slope = lerp(0.158, 0.105, mud);
    let h = slope * Math.min(b, bw) + 0.02;
    // Berm: the soft ridge a real beach builds at the high-tide line.
    h += (1 - mud * 0.8) * 0.2 * Math.exp(-Math.pow((b - bw * 0.62) / 1.5, 2));
    h += smooth(bw - 1.6, bw + 2.6, b) * 0.5;
    h += smooth(bw + 5, bw + 34, b) * (6.2 + fbm(x * 0.05, z * 0.05, 3) * 4.2);
    h += fbm(x * 0.24, z * 0.24, 3) * 0.12 * smooth(0.8, 4, b);
    return h;
  }
  let depth =
    0.07 * d +
    0.45 * smooth(2.5, 9, d) +
    1.05 * smooth(30, 60, d) +
    2.6 * smooth(54, 100, d) +
    5 * smooth(95, 190, d);
  depth += fbm(x * 0.085 + 3, z * 0.085, 3) * 0.9 * smooth(6, 30, d);
  depth += fbm(x * 0.33, z * 0.33 + 8, 2) * 0.16 * smooth(1.2, 5, d);
  // Coral shelf: lifts the seabed close enough to the surface to read through the water.
  const reef = reefAmount(x, z);
  if (reef > 0) depth = lerp(depth, 1.7 + fbm(x * 0.4, z * 0.4, 2) * 0.5, reef * 0.96);
  for (const r of ROCKS) {
    const rd = Math.hypot(x - r.x, z - r.z);
    const m = 1 - smooth(r.r * 0.9, r.r * 2.3, rd);
    if (m > 0) depth = lerp(depth, Math.min(depth, 1.5), m);
  }
  return -Math.max(0, depth);
}

/** Collector net footprint, shared by the mesh, the capture ghosts and the water swirl. */
export function netRadii(simRadius: number): { rx: number; rz: number } {
  const r = simRadius * UNIT;
  return { rx: Math.min(r, 5.7), rz: r };
}
