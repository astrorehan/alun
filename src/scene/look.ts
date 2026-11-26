import * as THREE from 'three';
import type { TimeOfDay } from '../types';

/** Everything that changes with the time of day. All fields blend, so light transitions are smooth. */
export interface Look {
  sunDir: THREE.Vector3;
  sun: THREE.Color;
  sky: THREE.Color;
  ground: THREE.Color;
  rim: THREE.Color;
  shallow: THREE.Color;
  mid: THREE.Color;
  deep: THREE.Color;
  abyss: THREE.Color;
  crest: THREE.Color;
  foam: THREE.Color;
  foamShade: THREE.Color;
  zenith: THREE.Color;
  horizon: THREE.Color;
  glow: THREE.Color;
  cloud: THREE.Color;
  fog: THREE.Color;
  lift: THREE.Color;
  gain: THREE.Color;
  fogDensity: number;
  exposure: number;
  saturation: number;
  bloom: number;
  caustic: number;
  glint: number;
  /** How strongly facets that face the sun pick up its colour. */
  sheen: number;
  lamp: number;
  bio: number;
  rain: number;
  cloudShadow: number;
  wind: number;
  swell: number;
}

const C = (h: string, k = 1): THREE.Color => new THREE.Color(h).multiplyScalar(k);
const L = (r: number, g: number, b: number): THREE.Color => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const D = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).normalize();

/** The sun rises over the forest (left) and sets over the open sea (right). */
export const LOOKS: Record<TimeOfDay, Look> = {
  morning: {
    sunDir: D(-0.6, 0.66, 0.34),
    sun: L(1.06, 0.84, 0.55),
    sky: L(0.25, 0.36, 0.46),
    ground: L(0.22, 0.17, 0.11),
    rim: L(0.3, 0.27, 0.18),
    shallow: C('#86f0e2'),
    mid: C('#1fb9cc'),
    deep: C('#0b80ae'),
    abyss: C('#0b5590'),
    crest: C('#58e8dc'),
    foam: C('#fffdf6'),
    foamShade: C('#a8dfe8'),
    zenith: C('#4fb4e6'),
    horizon: C('#ffe6bf'),
    glow: C('#ffd998', 1.4),
    cloud: C('#fff6e6'),
    fog: C('#cfe9ea'),
    lift: C('#08161c', 0.5),
    gain: C('#fff8ec'),
    fogDensity: 0.0026,
    exposure: 1.02,
    saturation: 1.1,
    bloom: 0.2,
    caustic: 0.95,
    glint: 0.85,
    sheen: 0.1,
    lamp: 0.0,
    bio: 0,
    rain: 0,
    cloudShadow: 0.26,
    wind: 0.8,
    swell: 1,
  },
  noon: {
    sunDir: D(-0.3, 0.88, 0.32),
    sun: L(1.16, 1.05, 0.86),
    sky: L(0.26, 0.4, 0.5),
    ground: L(0.24, 0.19, 0.13),
    rim: L(0.28, 0.28, 0.26),
    shallow: C('#8bf6e6'),
    mid: C('#17c0d4'),
    deep: C('#0786ba'),
    abyss: C('#0a5a9c'),
    crest: C('#5aeee6'),
    foam: C('#ffffff'),
    foamShade: C('#a8e4f0'),
    zenith: C('#2f9fe4'),
    horizon: C('#d8f3fb'),
    glow: C('#fff3cf', 1.4),
    cloud: C('#ffffff'),
    fog: C('#c6ecf2'),
    lift: C('#06141c', 0.4),
    gain: C('#ffffff'),
    fogDensity: 0.0024,
    exposure: 1.02,
    saturation: 1.14,
    bloom: 0.2,
    caustic: 1.15,
    glint: 1,
    sheen: 0.06,
    lamp: 0,
    bio: 0,
    rain: 0,
    cloudShadow: 0.3,
    wind: 1,
    swell: 1.05,
  },
  sunset: {
    sunDir: D(0.78, 0.4, -0.42),
    sun: L(1.0, 0.54, 0.27),
    sky: L(0.3, 0.27, 0.44),
    ground: L(0.22, 0.12, 0.1),
    rim: L(0.5, 0.26, 0.12),
    shallow: C('#7fd8c4'),
    mid: C('#2fa3b4'),
    deep: C('#2a6aa6'),
    abyss: C('#3a4690'),
    crest: C('#86c9bd'),
    foam: C('#ffe2cc'),
    foamShade: C('#b08fbc'),
    zenith: C('#4a5fae'),
    horizon: C('#ffab6b'),
    glow: C('#ffb25e', 2.2),
    cloud: C('#ffc9a0'),
    fog: C('#f2b48c'),
    lift: C('#1a0f2a', 0.6),
    gain: C('#fff0e2'),
    fogDensity: 0.0032,
    exposure: 1.0,
    saturation: 1.1,
    bloom: 0.24,
    caustic: 0.5,
    glint: 1.5,
    sheen: 0.3,
    lamp: 0.36,
    bio: 0.06,
    rain: 0,
    cloudShadow: 0.22,
    wind: 0.7,
    swell: 0.9,
  },
  night: {
    sunDir: D(0.55, 0.72, -0.35),
    sun: L(0.32, 0.44, 0.68),
    sky: L(0.11, 0.18, 0.34),
    ground: L(0.06, 0.09, 0.16),
    rim: L(0.18, 0.32, 0.46),
    shallow: C('#238c9e'),
    mid: C('#125778'),
    deep: C('#0b355a'),
    abyss: C('#071d3d'),
    crest: C('#46d6ec', 0.78),
    foam: C('#c2f6ff', 0.88),
    foamShade: C('#336c98'),
    zenith: C('#0b1634'),
    horizon: C('#223c6b'),
    glow: C('#7cb2e8', 0.75),
    cloud: C('#30496e'),
    fog: C('#192e52'),
    lift: C('#070d22', 0.75),
    gain: C('#eef6ff'),
    fogDensity: 0.0038,
    exposure: 1.08,
    saturation: 1.12,
    bloom: 0.52,
    caustic: 0.32,
    glint: 0.95,
    sheen: 0.12,
    lamp: 1.25,
    bio: 0.76,
    rain: 0,
    cloudShadow: 0.16,
    wind: 1.25,
    swell: 1.25,
  },
  monsoon: {
    sunDir: D(0.42, 0.78, 0.3),
    sun: L(0.2, 0.34, 0.52),
    sky: L(0.1, 0.17, 0.3),
    ground: L(0.05, 0.08, 0.14),
    rim: L(0.12, 0.24, 0.36),
    shallow: C('#1e7f8e'),
    mid: C('#0f4a66'),
    deep: C('#0a2c4a'),
    abyss: C('#081c38'),
    crest: C('#2fb4cf', 0.62),
    foam: C('#a8f4ff', 0.82),
    foamShade: C('#2c6f94'),
    zenith: C('#0c1730'),
    horizon: C('#2a4366'),
    glow: C('#5f8fc0', 0.6),
    cloud: C('#33475f'),
    fog: C('#1b2f4a'),
    lift: C('#050a1c', 0.8),
    gain: C('#eaf4ff'),
    fogDensity: 0.0052,
    exposure: 1.12,
    saturation: 1.08,
    bloom: 0.62,
    caustic: 0.22,
    glint: 0.5,
    sheen: 0.05,
    lamp: 1.35,
    bio: 1,
    rain: 1,
    cloudShadow: 0.12,
    wind: 2.5,
    swell: 2.0,
  },
  dawn: {
    sunDir: D(-0.78, 0.44, 0.26),
    sun: L(1.18, 0.74, 0.46),
    sky: L(0.32, 0.33, 0.48),
    ground: L(0.25, 0.16, 0.13),
    rim: L(0.4, 0.3, 0.2),
    shallow: C('#92f3da'),
    mid: C('#38bcc6'),
    deep: C('#2287b0'),
    abyss: C('#2d629e'),
    crest: C('#b8ffe6', 1.15),
    foam: C('#fff4e8', 1.1),
    foamShade: C('#c4b8dc'),
    zenith: C('#7aa7e0'),
    horizon: C('#ffcfa8'),
    glow: C('#ffcf96', 1.8),
    cloud: C('#ffe2cc'),
    fog: C('#f3d4c0'),
    lift: C('#160f20', 0.5),
    gain: C('#fff6ee'),
    fogDensity: 0.003,
    exposure: 1.04,
    saturation: 1.14,
    bloom: 0.3,
    caustic: 0.9,
    glint: 1.2,
    sheen: 0.24,
    lamp: 0.45,
    bio: 0,
    rain: 0,
    cloudShadow: 0.2,
    wind: 0.7,
    swell: 0.85,
  },
};

export function cloneLook(l: Look): Look {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(l)) {
    out[k] = v instanceof THREE.Color || v instanceof THREE.Vector3 ? v.clone() : v;
  }
  return out as unknown as Look;
}

/** Moves `cur` toward `target` by `t` (0..1), field by field. */
export function blendLook(cur: Look, target: Look, t: number): void {
  const a = cur as unknown as Record<string, unknown>;
  const b = target as unknown as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    const av = a[k];
    const bv = b[k];
    if (av instanceof THREE.Color) av.lerp(bv as THREE.Color, t);
    else if (av instanceof THREE.Vector3) av.lerp(bv as THREE.Vector3, t).normalize();
    else a[k] = (av as number) + ((bv as number) - (av as number)) * t;
  }
}
