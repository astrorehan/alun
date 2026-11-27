import * as THREE from 'three';
import { Build, matrixOf, type Vec } from './build';
import { groundAt, shoreAt } from './space';

/**
 * Iconic "PANTAI PANJANG" Bengkulu coastal landmark on the south sandy cove:
 * elevated rainbow 3D block letters on red-and-white poles, low red-trimmed plinth,
 * circular star promenade ("Pelataran Bintang"), royal-blue beach umbrellas, and night uplights.
 */
const SIGN_Z = 25.8;
const SIGN_X = shoreAt(SIGN_Z) - 4.4;
const SIGN_YAW = 0.96; // ~55 deg: hugs the south cove and faces both gameplay & title cameras

export const PANTAI_PANJANG = {
  x: SIGN_X,
  z: SIGN_Z,
  yaw: SIGN_YAW,
  /** Half-length along the promenade (local X) and half-depth (local Z). */
  halfW: 7.4,
  halfD: 2.9,
} as const;

const COS_YAW = Math.cos(SIGN_YAW);
const SIN_YAW = Math.sin(SIGN_YAW);

/** True when (x, z) lies inside (or within `pad` metres of) the Pantai Panjang promenade footprint. */
export function nearPantaiPanjang(x: number, z: number, pad = 0): boolean {
  const dx = x - SIGN_X;
  const dz = z - SIGN_Z;
  // Inverse Y-rotation into promenade local coordinates (+lx along text, +lz toward sea/camera)
  const lx = dx * COS_YAW - dz * SIN_YAW;
  const lz = dx * SIN_YAW + dz * COS_YAW;
  return Math.abs(lx) < PANTAI_PANJANG.halfW + pad && Math.abs(lz) < PANTAI_PANJANG.halfD + pad;
}

/** True when a tree of height `tall` at (x, z) would overlap or project over the sign from the 50 deg gameplay camera. */
export function blocksPantaiPanjang(x: number, z: number, tall: number, rad: number): boolean {
  const pad = 1.3 + rad;
  if (nearPantaiPanjang(x, z, pad)) return true;
  // Camera sits south (+Z) at ~50 deg pitch looking north (-Z): a crown at height `tall` projects ~tall * 0.84 northward.
  if (tall > 1.5) {
    if (nearPantaiPanjang(x, z - tall * 0.45, pad)) return true;
    if (nearPantaiPanjang(x, z - tall * 0.88, pad + 0.6)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ letter shapes */

interface GlyphSpec {
  w: number;
  shape: () => THREE.Shape;
}

function glyphP(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.25, 0);
  s.lineTo(0.25, 0.36);
  s.lineTo(0.46, 0.36);
  s.absarc(0.46, 0.68, 0.32, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(0, 1.0);
  s.closePath();

  const hole = new THREE.Path();
  hole.moveTo(0.25, 0.8);
  hole.lineTo(0.44, 0.8);
  hole.absarc(0.44, 0.68, 0.12, Math.PI / 2, -Math.PI / 2, true);
  hole.lineTo(0.25, 0.56);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

function glyphA(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.25, 0);
  s.lineTo(0.31, 0.21);
  s.lineTo(0.57, 0.21);
  s.lineTo(0.63, 0);
  s.lineTo(0.88, 0);
  s.lineTo(0.58, 1.0);
  s.lineTo(0.3, 1.0);
  s.closePath();

  const hole = new THREE.Path();
  hole.moveTo(0.44, 0.72);
  hole.lineTo(0.35, 0.41);
  hole.lineTo(0.53, 0.41);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

function glyphN(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.24, 0);
  s.lineTo(0.24, 0.56);
  s.lineTo(0.58, 0);
  s.lineTo(0.84, 0);
  s.lineTo(0.84, 1.0);
  s.lineTo(0.6, 1.0);
  s.lineTo(0.6, 0.44);
  s.lineTo(0.26, 1.0);
  s.lineTo(0, 1.0);
  s.closePath();
  return s;
}

function glyphT(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.265, 0);
  s.lineTo(0.535, 0);
  s.lineTo(0.535, 0.74);
  s.lineTo(0.8, 0.74);
  s.lineTo(0.8, 1.0);
  s.lineTo(0, 1.0);
  s.lineTo(0, 0.74);
  s.lineTo(0.265, 0.74);
  s.closePath();
  return s;
}

function glyphI(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.3, 0);
  s.lineTo(0.3, 1.0);
  s.lineTo(0, 1.0);
  s.closePath();
  return s;
}

function glyphJ(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.7, 1.0);
  s.lineTo(0.47, 1.0);
  s.lineTo(0.47, 0.35);
  s.absarc(0.35, 0.35, 0.12, 0, -Math.PI, true);
  s.lineTo(0.23, 0.38);
  s.lineTo(0, 0.38);
  s.lineTo(0, 0.35);
  s.absarc(0.35, 0.35, 0.35, Math.PI, Math.PI * 2, false);
  s.lineTo(0.7, 1.0);
  s.closePath();
  return s;
}

function glyphG(): THREE.Shape {
  const cx = 0.44;
  const cy = 0.5;
  const rx = 0.44;
  const ry = 0.5;
  const irx = 0.22;
  const iry = 0.27;
  const aTop = 0.58;
  const aBot = -0.08;
  const aInnerBot = -0.54;

  const s = new THREE.Shape();
  s.moveTo(cx + rx * Math.cos(aTop), cy + ry * Math.sin(aTop));
  s.absellipse(cx, cy, rx, ry, aTop, Math.PI * 2 + aBot, false, 0);
  s.lineTo(0.88, 0.56);
  s.lineTo(0.46, 0.56);
  s.lineTo(0.46, 0.36);
  s.lineTo(cx + irx * Math.cos(aInnerBot), cy + iry * Math.sin(aInnerBot));
  s.absellipse(cx, cy, irx, iry, aInnerBot, -Math.PI * 2 + aTop, true, 0);
  s.closePath();
  return s;
}

const GLYPHS: Record<string, GlyphSpec> = {
  P: { w: 0.78, shape: glyphP },
  A: { w: 0.88, shape: glyphA },
  N: { w: 0.84, shape: glyphN },
  T: { w: 0.8, shape: glyphT },
  I: { w: 0.3, shape: glyphI },
  J: { w: 0.7, shape: glyphJ },
  G: { w: 0.88, shape: glyphG },
};

const LETTERS: { ch: string; col: string; top: string }[] = [
  { ch: 'P', col: '#cc292b', top: '#eb4b46' },
  { ch: 'A', col: '#e68f1e', top: '#f8b444' },
  { ch: 'N', col: '#edc01e', top: '#fae055' },
  { ch: 'T', col: '#1e9664', top: '#3ec28a' },
  { ch: 'A', col: '#2273b8', top: '#459be0' },
  { ch: 'I', col: '#29add4', top: '#5ad0f2' },
  { ch: ' ', col: '', top: '' },
  { ch: 'P', col: '#8a3a9c', top: '#b25cc6' },
  { ch: 'A', col: '#cc292b', top: '#eb4b46' },
  { ch: 'N', col: '#e68620', top: '#f7ad44' },
  { ch: 'J', col: '#edc01e', top: '#fae055' },
  { ch: 'A', col: '#1e9664', top: '#3ec28a' },
  { ch: 'N', col: '#2273b8', top: '#459be0' },
  { ch: 'G', col: '#29add4', top: '#5ad0f2' },
];

function starShape(outerR: number, innerR: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/* ------------------------------------------------------------------ builder */

/**
 * Appends the Pantai Panjang landmark into Village's shared static Build so it renders
 * with zero extra draw calls and inherits the toon + ink outline pipeline.
 */
export function buildPantaiPanjang(
  b: Build,
  lamp: (x: number, y: number, z: number, rad: number, k?: number) => void
): void {
  // Anchor the promenade slab at the highest ground point along its back edge so sand never pokes through.
  let maxGround = groundAt(SIGN_X, SIGN_Z);
  for (const lx of [-6.4, -3.2, 0, 3.2, 6.4]) {
    for (const lz of [-1.8, 0, 1.8]) {
      const wx = SIGN_X + lx * COS_YAW + lz * SIN_YAW;
      const wz = SIGN_Z - lx * SIN_YAW + lz * COS_YAW;
      maxGround = Math.max(maxGround, groundAt(wx, wz));
    }
  }
  const deckY = maxGround + 0.12;
  const base = matrixOf([SIGN_X, deckY, SIGN_Z], [0, SIGN_YAW, 0]);
  const M = (p: Vec, r: Vec = [0, 0, 0], s: Vec | number = 1): THREE.Matrix4 => base.clone().multiply(matrixOf(p, r, s));
  const worldOf = (p: Vec): THREE.Vector3 => new THREE.Vector3(...p).applyMatrix4(base);

  /* ---------------- promenade concrete deck + red-white seafront curb */
  const deckW = 13.8;
  const deckD = 4.6;
  const slabH = 1.25;
  b.add(new THREE.BoxGeometry(deckW, slabH, deckD), {
    color: '#c4beb2',
    top: '#ded8ca',
    matrix: M([0, -slabH / 2, 0.25]),
    ao: (p) => (p.y < deckY - 0.3 ? 0.72 : 0.96),
  });
  // Crisp white apron border along the front & sides
  b.add(new THREE.BoxGeometry(deckW + 0.22, 0.22, 0.26), {
    color: '#f2eee4',
    matrix: M([0, -0.02, deckD / 2 + 0.25]),
  });
  b.add(new THREE.BoxGeometry(deckW + 0.24, 0.08, 0.28), {
    color: '#cf2c2a',
    matrix: M([0, 0.11, deckD / 2 + 0.25]),
  });
  // Subtle paving strips framing the star medallion
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(deckW - 1.2, 0.03, 0.12), {
      color: '#ece6d8',
      matrix: M([0, 0.015, 1.15 + s * 1.1]),
    });
  }

  /* ---------------- star medallion ("Pelataran Bintang") */
  const starZ = 1.15;
  b.add(new THREE.CylinderGeometry(1.48, 1.52, 0.04, 24), {
    color: '#8f9396',
    matrix: M([0, 0.02, starZ]),
  });
  b.add(new THREE.CylinderGeometry(1.24, 1.24, 0.05, 24), {
    color: '#b8b9b6',
    matrix: M([0, 0.026, starZ]),
  });
  const starGeo = new THREE.ExtrudeGeometry(starShape(1.18, 0.45), {
    depth: 0.055,
    bevelEnabled: false,
    curveSegments: 2,
  });
  starGeo.rotateX(-Math.PI / 2);
  b.add(starGeo, {
    color: '#f5efe2',
    matrix: M([0, 0.02, starZ]),
  });

  /* ---------------- red-and-white plinth beam under the letters */
  const signZ = -0.95;
  const plinthW = 12.9;
  b.add(new THREE.BoxGeometry(plinthW, 0.26, 0.56), {
    color: '#f2eee4',
    matrix: M([0, 0.13, signZ]),
  });
  b.add(new THREE.BoxGeometry(plinthW + 0.06, 0.08, 0.6), {
    color: '#cf2c2a',
    matrix: M([0, 0.29, signZ]),
  });

  /* ---------------- 13 rainbow 3D letters on red-and-white poles */
  const scaleH = 1.38;
  const scaleW = 1.02;
  const letterDepth = 0.28;
  const gap = 0.13;
  const wordSpace = 0.52;

  let totalW = 0;
  LETTERS.forEach((it, idx) => {
    if (it.ch === ' ') {
      totalW += wordSpace;
    } else {
      totalW += GLYPHS[it.ch].w * scaleW;
      const next = LETTERS[idx + 1];
      if (next && next.ch !== ' ') totalW += gap;
    }
  });

  const poleBottomY = 0.32;
  const poleH = 0.96;
  const letterBaseY = poleBottomY + poleH - 0.04;
  const tiltX = -0.14; // slight upward tilt so letters read crisply from both 50 deg play view & low title view

  const geoCache = new Map<string, THREE.BufferGeometry>();
  const getGlyphGeo = (ch: string): THREE.BufferGeometry => {
    let g = geoCache.get(ch);
    if (!g) {
      g = new THREE.ExtrudeGeometry(GLYPHS[ch].shape(), {
        depth: letterDepth / scaleH,
        bevelEnabled: true,
        bevelThickness: 0.028,
        bevelSize: 0.02,
        bevelSegments: 1,
        curveSegments: 6,
      });
      g.translate(0, 0, -(letterDepth / scaleH) * 0.5);
      geoCache.set(ch, g);
    }
    return g;
  };

  let cursorX = -totalW / 2;
  LETTERS.forEach((it, idx) => {
    if (it.ch === ' ') {
      cursorX += wordSpace;
      return;
    }
    const spec = GLYPHS[it.ch];
    const lw = spec.w * scaleW;
    const cx = cursorX + lw * 0.5;

    // Red-top / white-bottom vertical support pole matching the real Pantai Panjang sign
    const halfPole = poleH * 0.5;
    b.add(new THREE.CylinderGeometry(0.068, 0.078, halfPole, 8), {
      color: '#f4f0e6',
      matrix: M([cx, poleBottomY + halfPole * 0.5, signZ]),
    });
    b.add(new THREE.CylinderGeometry(0.066, 0.068, halfPole + 0.06, 8), {
      color: '#cf2c2a',
      matrix: M([cx, poleBottomY + halfPole * 1.5, signZ]),
    });
    // Small base collar
    b.add(new THREE.CylinderGeometry(0.11, 0.13, 0.07, 8), {
      color: '#d8d2c6',
      matrix: M([cx, poleBottomY + 0.03, signZ]),
    });

    // Extruded letter
    b.add(getGlyphGeo(it.ch), {
      color: it.col,
      top: it.top,
      gloss: 0.16,
      matrix: M([cursorX, letterBaseY, signZ], [tiltX, 0, 0], [scaleW, scaleH, scaleH]),
    });

    cursorX += lw;
    const next = LETTERS[idx + 1];
    if (next && next.ch !== ' ') cursorX += gap;
  });

  for (const g of geoCache.values()) g.dispose();

  /* ---------------- iconic royal-blue beach umbrellas flanking outside the letters */
  const umbrella = (ux: number, uz: number, tiltZ: number, yaw: number): void => {
    const wp = worldOf([ux, 0, uz]);
    const localGroundY = groundAt(wp.x, wp.z) - deckY;
    const um = M([ux, localGroundY, uz], [0, yaw, tiltZ]);
    const U = (p: Vec, r: Vec = [0, 0, 0]): THREE.Matrix4 => um.clone().multiply(matrixOf(p, r));
    b.add(new THREE.CylinderGeometry(0.045, 0.055, 1.75, 6), { color: '#efeae0', matrix: U([0, 0.86, 0]) });
    b.add(new THREE.CylinderGeometry(0.26, 0.32, 0.1, 8), { color: '#9c9890', matrix: U([0, 0.05, 0]) });
    b.add(new THREE.ConeGeometry(1.06, 0.4, 8, 1, false), {
      color: '#1f72c4',
      top: '#44a0ee',
      gloss: 0.12,
      matrix: U([0, 1.78, 0]),
    });
    b.add(new THREE.SphereGeometry(0.065, 6, 5), { color: '#f5efe2', matrix: U([0, 2.0, 0]) });
    // Two little plastic beach stools tucked beneath
    for (const sx of [-0.42, 0.42]) {
      b.add(new THREE.BoxGeometry(0.36, 0.07, 0.36), { color: '#2b88d8', matrix: U([sx, 0.36, 0.22], [0, sx * 0.4, 0]) });
      for (const lx of [-0.13, 0.13])
        for (const lz of [-0.13, 0.13])
          b.add(new THREE.BoxGeometry(0.048, 0.36, 0.048), { color: '#226eb2', matrix: U([sx + lx, 0.18, 0.22 + lz]) });
    }
  };
  umbrella(-7.75, 0.6, 0.06, 0.35);
  umbrella(7.75, 0.75, -0.05, -0.4);

  /* ---------------- warm ground uplights (wake up at dusk/night) */
  for (const fx of [-3.6, 0, 3.6]) {
    b.add(new THREE.BoxGeometry(0.32, 0.14, 0.22), {
      color: '#3c3834',
      matrix: M([fx, 0.07, signZ + 0.56], [-0.4, 0, 0]),
    });
    b.add(new THREE.BoxGeometry(0.24, 0.06, 0.14), {
      color: '#ffd888',
      glow: 0.9,
      matrix: M([fx, 0.13, signZ + 0.52], [-0.4, 0, 0]),
    });
  }
  const lp = worldOf([0, 1.6, signZ + 1.4]);
  lamp(lp.x, lp.y, lp.z, 11.5, 0.95);
}
