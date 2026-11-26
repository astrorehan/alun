import * as THREE from 'three';
import { isTrashKind, type GameSimulation } from '../simulation';
import type { ComputedStats, Entity, EntityKind } from '../types';
import { Build, hex, matrixOf, type Vec } from './build';
import { striped } from './fleet';
import type { Fx } from './fx';
import { G, GLSL_CACHED_UNDERWATER, GLSL_GRADE_LDR, GLSL_LIGHT, GLSL_UNDERWATER_END, GLSL_UNIFORMS, outlineMaterial, registerDirectLdr, toon } from './gfx';
import { inked, instanced, mesh, setCount } from './kit';
import type { Look } from './look';
import type { Net } from './net';
import { clamp, groundAt, lerp, noise3, rng, shoreAt, smooth, toX, toZ, UNIT } from './space';
import { MODE, SP } from './sprites';
import type { Guest } from './story';
import { perahu, person } from './village';
import { FLOAT_HEAD, type Water } from './water';

const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/* ================================================================== debris models (about 1 unit = 1 m) */

function bottle(v: number): THREE.BufferGeometry {
  const b = new Build(200 + v);
  if (v === 0) {
    const lay: Vec = [0, 0, Math.PI / 2];
    b.cyl(0.5, 0.5, 1.35, { color: '#a9e4ff', pos: [-0.15, 0, 0], rot: lay, seg: 12, gloss: 0.9, ao: (p) => lerp(0.75, 1, smooth(-0.4, 0.3, p.y)) });
    b.cyl(0.52, 0.52, 0.5, { color: '#2479d8', pos: [-0.2, 0, 0], rot: lay, seg: 12, gloss: 0.4 });
    b.cyl(0.525, 0.525, 0.14, { color: '#ffffff', pos: [-0.2, 0, 0], rot: lay, seg: 12, gloss: 0.4 });
    b.cyl(0.5, 0.2, 0.46, { color: '#c8f0ff', pos: [0.75, 0, 0], rot: lay, seg: 12, gloss: 0.9 });
    b.cyl(0.2, 0.2, 0.22, { color: '#c8f0ff', pos: [1.05, 0, 0], rot: lay, seg: 10, gloss: 0.9 });
    b.cyl(0.26, 0.26, 0.26, { color: '#f0453a', pos: [1.24, 0, 0], rot: lay, seg: 10, gloss: 0.5 });
    b.cyl(0.36, 0.5, 0.2, { color: '#8fd4f4', pos: [-0.92, 0, 0], rot: lay, seg: 12, gloss: 0.9 });
  } else if (v === 1) {
    const lay: Vec = [0, 0, Math.PI / 2 - 0.12];
    b.cyl(0.52, 0.52, 1.35, { color: '#e2342f', rot: lay, seg: 12, gloss: 0.7, rough: 0.05, roughScale: 2 });
    b.cyl(0.535, 0.535, 0.3, { color: '#fff6e4', pos: [0.05, 0, 0], rot: lay, seg: 12, gloss: 0.6 });
    for (const s of [-1, 1]) b.cyl(s > 0 ? 0.42 : 0.52, s > 0 ? 0.52 : 0.42, 0.14, { color: '#c8d2d8', pos: [s * 0.74, s * -0.09, 0], rot: lay, seg: 12, gloss: 0.9 });
    b.box(0.06, 0.22, 0.3, { color: '#e8eef2', pos: [0.84, -0.04, 0.1], r: 0.02, gloss: 0.9 });
  } else {
    const sole = new THREE.Shape();
    sole.moveTo(-1.05, -0.28);
    sole.bezierCurveTo(-1.35, 0.3, -0.9, 0.48, -0.4, 0.36);
    sole.bezierCurveTo(0.1, 0.24, 0.3, 0.52, 0.85, 0.5);
    sole.bezierCurveTo(1.4, 0.44, 1.35, -0.42, 0.8, -0.46);
    sole.bezierCurveTo(0.2, -0.5, 0, -0.3, -0.4, -0.38);
    sole.bezierCurveTo(-0.7, -0.44, -0.95, -0.5, -1.05, -0.28);
    const mk = (depth: number, y: number, c: string, k: number): void => {
      const g = new THREE.ExtrudeGeometry(sole, { depth, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 1, curveSegments: 5 });
      g.rotateX(-Math.PI / 2);
      g.scale(k, 1, k);
      g.translate(0, y, 0);
      b.add(g, { color: c });
    };
    mk(0.2, -0.08, '#ff5fa2', 1);
    mk(0.06, 0.16, '#ffe06a', 0.92);
    b.tube([[0.66, 0.2, 0.02], [0.35, 0.52, 0.26], [-0.12, 0.2, 0.42]], () => 0.085, { color: '#2fb8c8', seg: 5, rings: 8 });
    b.tube([[0.66, 0.2, 0.02], [0.35, 0.52, -0.22], [-0.12, 0.2, -0.38]], () => 0.085, { color: '#2fb8c8', seg: 5, rings: 8 });
  }
  return b.geo(true);
}

function bag(v: number): THREE.BufferGeometry {
  const b = new Build(220 + v);
  if (v < 2) {
    const col = v === 0 ? '#f6f8f4' : '#f25a4c';
    const g = new THREE.SphereGeometry(1, 16, 11);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const a = Math.atan2(p.z, p.x);
      const fold = 1 + Math.sin(a * 6 + v) * 0.07 * (1 - Math.abs(p.y)) + noise3(p.x * 2 + v * 9, p.y * 2, p.z * 2) * 0.12;
      const pinch = lerp(1, 0.42, smooth(0.45, 1, p.y));
      pos.setXYZ(i, p.x * fold * pinch * 1.05, p.y * 0.68 + (p.y > 0.6 ? 0.14 : 0), p.z * fold * pinch * 0.92);
    }
    g.computeVertexNormals();
    b.add(g, { color: (q) => _c.set(col).multiplyScalar(lerp(0.82, 1.04, smooth(-0.5, 0.5, q.y))), gloss: 0.35 });
    if (v === 1) for (const k of [-0.16, 0.16]) b.add(new THREE.TorusGeometry(0.99, 0.05, 4, 20), { color: '#fff6e4', pos: [0, k, 0], rot: [Math.PI / 2, 0, 0], scale: [1.02, 0.92, 1] });
    for (const s of [-1, 1]) b.tube([[s * 0.2, 0.66, 0.1], [s * 0.42, 1.16, 0.0], [s * 0.12, 1.24, -0.06], [s * 0.1, 0.7, -0.1]], () => 0.085, { color: col, seg: 5, rings: 9 });
  } else {
    b.box(1.75, 0.42, 1.25, { color: '#fbfaf4', pos: [0, 0, 0], r: 0.12 });
    b.box(1.75, 0.4, 1.2, { color: '#f2f0e6', pos: [0, 0.42, -0.36], rot: [-0.5, 0, 0], r: 0.12 });
    b.box(1.3, 0.06, 0.85, { color: '#d8d2c0', pos: [0, 0.2, 0.02], r: 0.02 });
    b.ball(0.2, { color: '#e8a24a', pos: [0.3, 0.26, 0.12], scale: [1.5, 0.6, 1], seg: 7 });
    b.bar([0.5, 0.22, 0.2], [1.25, 0.72, 0.46], 0.06, 0.06, { color: '#ff3f6a', seg: 6 });
  }
  return b.geo(true);
}

function ghostNet(): THREE.BufferGeometry {
  const b = new Build(240);
  const r = b.r;
  b.ball(1.05, { color: '#2f8f66', scale: [1.15, 0.5, 1], seg: 12, rough: 0.16, ao: (p) => lerp(0.6, 1, smooth(-0.4, 0.4, p.y)) });
  for (let i = 0; i < 9; i++) {
    const a = r() * 6.283;
    const pts: Vec[] = [];
    for (let k = 0; k < 5; k++) {
      const t = k / 4;
      const ang = a + t * lerp(1.6, 3.2, r());
      const d = lerp(0.75, 1.5, r());
      pts.push([Math.cos(ang) * d, 0.14 + Math.sin(t * Math.PI) * lerp(0.2, 0.62, r()), Math.sin(ang) * d * 0.9]);
    }
    b.tube(pts, () => 0.085, { color: i % 3 ? '#5fd49a' : '#1f6f52', seg: 5, rings: 12 });
  }
  b.ball(0.32, { color: '#ff8a2a', pos: [0.75, 0.42, 0.4], seg: 9, gloss: 0.4 });
  b.ball(0.28, { color: '#fff6e4', pos: [-0.7, 0.4, -0.3], seg: 9, gloss: 0.4 });
  // what ghost nets actually do
  b.ball(0.3, { color: '#8fb8d0', pos: [-0.2, 0.52, 0.5], scale: [1.6, 0.6, 0.5], rot: [0, 0.6, 0.2], seg: 8 });
  return b.geo(true);
}

function crate(): THREE.BufferGeometry {
  const b = new Build(250);
  b.box(2.3, 1.45, 1.75, { color: '#0c9fd0', top: '#22d4ff', pos: [0, 0.2, 0], r: 0.12, gloss: 0.3, glow: 0.06 });
  for (const x of [-0.72, 0.72]) b.box(0.26, 1.54, 1.85, { color: '#0e5a72', pos: [x, 0.2, 0], r: 0.05, gloss: 0.3 });
  b.box(2.4, 0.2, 1.85, { color: '#14b4ea', pos: [0, 0.94, 0], r: 0.06, gloss: 0.3 });
  for (const x of [-0.72, 0.72]) b.box(0.3, 0.08, 1.9, { color: '#0a4a66', pos: [x, 1.04, 0], r: 0.03, gloss: 0.3 });
  b.box(0.62, 0.62, 0.1, { color: '#dffeff', pos: [0, 0.24, 0.9], rot: [0, 0, Math.PI / 4], r: 0.05, glow: 0.9 });
  b.box(0.62, 0.1, 0.62, { color: '#dffeff', pos: [0, 1.06, 0], rot: [0, Math.PI / 4, 0], r: 0.04, glow: 0.9 });
  for (const x of [-1, 1]) for (const z of [-0.75, 0.75]) b.ball(0.13, { color: '#b4fbff', pos: [x, 0.98, z], seg: 6, gloss: 0.6 });
  return b.geo(true);
}

function battery(): THREE.BufferGeometry {
  const b = new Build(255);
  const lay: Vec = [0, 0, Math.PI / 2];
  b.cyl(0.82, 0.82, 1.5, { color: '#f2a024', rot: lay, seg: 16, gloss: 0.7 });
  for (const x of [-0.55, 0.55]) b.cyl(0.87, 0.87, 0.2, { color: '#7a4510', pos: [x, 0, 0], rot: lay, seg: 16, gloss: 0.5 });
  b.cyl(0.85, 0.85, 0.5, { color: '#fff2a8', rot: lay, seg: 16, glow: 1.1 });
  for (const s of [-1, 1]) b.cyl(0.72, 0.72, 0.3, { color: '#3a2a20', pos: [s * 0.9, 0, 0], rot: lay, seg: 16, gloss: 0.5 });
  b.cyl(0.26, 0.26, 0.26, { color: '#d8dde2', pos: [1.14, 0, 0], rot: lay, seg: 10, gloss: 0.9 });
  const bolt = new THREE.Shape();
  bolt.moveTo(0.1, 0.5);
  bolt.lineTo(-0.28, -0.06);
  bolt.lineTo(-0.02, -0.06);
  bolt.lineTo(-0.12, -0.5);
  bolt.lineTo(0.28, 0.1);
  bolt.lineTo(0.02, 0.1);
  bolt.lineTo(0.1, 0.5);
  const bg = new THREE.ExtrudeGeometry(bolt, { depth: 0.08, bevelEnabled: false });
  bg.rotateX(-Math.PI / 2);
  bg.translate(0, 0.84, 0);
  b.add(bg, { color: '#7a2f00', glow: 0.1 });
  return b.geo(true);
}

function relic(): THREE.BufferGeometry {
  const b = new Build(260);
  const prof = [
    [0.02, -0.55],
    [0.5, -0.55],
    [0.42, -0.4],
    [0.78, -0.1],
    [0.98, 0.3],
    [0.86, 0.68],
    [0.46, 0.94],
    [0.4, 1.14],
    [0.62, 1.3],
    [0.56, 1.36],
    [0.02, 1.3],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.add(new THREE.LatheGeometry(prof, 20), { color: (p) => _c.set('#b8700a').lerp(hex('#ffc63a'), smooth(-0.3, 1.1, p.y)), gloss: 0.6, glow: 0.1 });
  b.add(new THREE.TorusGeometry(0.96, 0.1, 6, 24), { color: '#b8323f', pos: [0, 0.34, 0], rot: [Math.PI / 2, 0, 0], gloss: 0.6 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.283;
    b.ico(0.15, 0, { color: i % 2 ? '#ff6fd0' : '#5ff0ff', pos: [Math.cos(a) * 1.02, 0.34, Math.sin(a) * 1.02], glow: 0.9 });
    b.ball(0.1, { color: '#fff0b0', pos: [Math.cos(a + 0.39) * 0.86, 0.02, Math.sin(a + 0.39) * 0.86], seg: 6, gloss: 0.8 });
  }
  for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.3, 0.09, 6, 14, 4.2), { color: '#f0b028', pos: [s * 0.82, 0.86, 0], rot: [0, 0, s > 0 ? -1.9 : 1.2], gloss: 0.9 });
  b.ico(0.3, 0, { color: '#ff8ae0', pos: [0, 1.6, 0], glow: 1.2 });
  return b.geo(true);
}

function seed(): THREE.BufferGeometry {
  const b = new Build(270);
  // a coconut-husk pot with a propagule standing in it
  b.ball(0.95, { color: '#9a6a3a', top: '#c08a4e', scale: [1, 0.62, 1], seg: 12, rough: 0.06, ao: (p) => lerp(0.65, 1, smooth(-0.4, 0.3, p.y)) });
  b.add(new THREE.TorusGeometry(0.74, 0.12, 6, 18), { color: '#e2c07a', pos: [0, 0.38, 0], rot: [Math.PI / 2, 0, 0] });
  b.cyl(0.66, 0.6, 0.12, { color: '#4a2f1c', pos: [0, 0.38, 0], seg: 14 });
  b.tube([[0, 0.3, 0], [0.04, 0.9, 0.02], [0, 1.5, 0]], (t) => lerp(0.16, 0.08, t), { color: '#7fb83f', seg: 7, rings: 6 });
  const leaf = (a: number, y: number, len: number, up: number): void => {
    const g = new THREE.SphereGeometry(1, 9, 6);
    g.scale(len * 0.5, 0.07, len * 0.27);
    g.translate(len * 0.48, 0, 0);
    g.rotateZ(up);
    g.rotateY(a);
    g.translate(0, y, 0);
    b.add(g, { color: (p) => _c.set('#3fae5a').lerp(hex('#b8f07a'), smooth(0.2, 0.9, Math.hypot(p.x, p.z))), gloss: 0.3, glow: 0.12 });
  };
  for (let i = 0; i < 4; i++) leaf(i * 1.571 + 0.4, 1.36, 1.05, 0.4);
  for (let i = 0; i < 2; i++) leaf(i * 3.14 + 1.2, 1.5, 0.7, 0.9);
  return b.geo(true);
}

/* ================================================================== big props */

function aiBuoy(): THREE.BufferGeometry {
  const b = new Build(280);
  b.add(new THREE.TorusGeometry(1.0, 0.36, 8, 22), { color: '#f28a1f', pos: [0, 0.14, 0], rot: [Math.PI / 2, 0, 0], gloss: 0.4 });
  for (let i = 0; i < 4; i++) b.box(0.5, 0.78, 0.3, { color: '#fff6e4', pos: [Math.cos(i * 1.571) * 1.02, 0.14, Math.sin(i * 1.571) * 1.02], rot: [0, -i * 1.571 + 1.571, 0], r: 0.1 });
  b.cyl(0.62, 0.86, 0.6, { color: '#17424f', pos: [0, 0.5, 0], seg: 14, gloss: 0.4 });
  b.cyl(0.5, 0.6, 0.9, { color: '#f4fbfb', pos: [0, 1.2, 0], seg: 14, gloss: 0.5 });
  b.cyl(0.7, 0.7, 0.26, { color: '#6ff6ff', pos: [0, 1.28, 0], seg: 18, glow: 0.5 });
  b.cyl(0.44, 0.5, 0.12, { color: '#17424f', pos: [0, 1.68, 0], seg: 14, gloss: 0.4 });
  b.box(0.95, 0.08, 0.5, { color: '#2a6ad8', pos: [0, 1.82, -0.35], rot: [0.5, 0, 0], r: 0.03, gloss: 0.8 });
  for (const x of [-0.25, 0.25]) b.box(0.04, 0.1, 0.5, { color: '#b4d0f8', pos: [x, 1.83, -0.35], rot: [0.5, 0, 0], r: 0 });
  b.bar([0, 1.6, 0], [0, 2.75, 0], 0.07, 0.05, { color: '#d8e4e8' });
  b.ball(0.2, { color: '#6ff6ff', pos: [0, 2.85, 0], seg: 10, glow: 0.4 });
  return b.geo(true);
}

/** A.L.U.N. himself: the radio voice finally has a body on screen. */
function heroBuoy(): THREE.BufferGeometry {
  const b = new Build(290);
  const ring = new THREE.TorusGeometry(1.32, 0.46, 10, 40);
  ring.rotateX(Math.PI / 2);
  b.add(ring, { color: (p) => (Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / 6.2832) * 12) % 3 === 0 ? _c.set('#fff6e4') : _c.set('#ff7a2a')), pos: [0, 0.1, 0], gloss: 0.5 });
  b.add(new THREE.SphereGeometry(1.14, 24, 16), { color: (p) => _c.set('#e9f0ee').lerp(hex('#bcd6da'), smooth(1.6, 0.3, p.y)), pos: [0, 1.02, 0], scale: [1, 0.94, 1], gloss: 0.35 });
  // batik wave band
  b.cyl(1.07, 1.12, 0.26, { color: '#10808c', pos: [0, 0.5, 0], seg: 28, gloss: 0.3 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * 6.283;
    b.ball(0.13, { color: i % 2 ? '#f7c948' : '#e8fbf4', pos: [Math.cos(a) * 1.12, 0.5 + (i % 2) * 0.04, Math.sin(a) * 1.12], seg: 7 });
  }
  // face plate, tipped up toward the gameplay camera
  b.ball(0.9, { color: '#08222f', pos: [0, 1.34, 0.6], scale: [1, 0.78, 0.8], rot: [-0.62, 0, 0], seg: 20, gloss: 0.6 });
  b.add(new THREE.TorusGeometry(0.86, 0.11, 8, 28), { color: '#10808c', pos: [0, 1.36, 0.64], scale: [1.02, 0.8, 1], rot: [-0.62, 0, 0] });
  b.bar([0, 2.0, -0.05], [0.12, 2.9, -0.1], 0.07, 0.05, { color: '#10808c' });
  b.ball(0.22, { color: '#ffe07d', pos: [0.13, 3.02, -0.1], seg: 10, glow: 0.8 });
  // two leaf ears
  for (const s of [-1, 1]) {
    const g = new THREE.SphereGeometry(1, 10, 7);
    g.scale(0.5, 0.1, 0.26);
    b.add(g, { color: '#4fd17f', pos: [s * 1.2, 1.6, -0.05], rot: [0, 0, s * 0.7], gloss: 0.3 });
  }
  return b.geo(true);
}

function trawler(): THREE.BufferGeometry {
  const b = new Build(300);
  const r = b.r;
  const L = 13;
  const n = 22;
  const prof = (t: number): { x: number; w: number; keel: number; gun: number } => {
    const u = t * 2 - 1;
    const bow = Math.max(0, u);
    return { x: (u * L) / 2 + bow * bow * 0.6, w: 2.35 * Math.pow(1 - Math.pow(bow, 2.6), 0.75) * lerp(0.86, 1, smooth(-1, -0.4, u)) + 0.03, keel: -1.15 + bow * bow * 0.9, gun: 1.75 + bow * bow * 1.45 + Math.pow(Math.max(0, -u), 3) * 0.3 };
  };
  const ringAt = (t: number, k: number): Vec[] => {
    const p = prof(t);
    const yy = (q: number): number => lerp(p.keel, p.gun, q);
    return [
      [p.x, p.gun, -p.w * k],
      [p.x, yy(0.62), -p.w * 0.97 * k],
      [p.x, yy(0.3), -p.w * 0.8 * k],
      [p.x, p.keel, 0],
      [p.x, yy(0.3), p.w * 0.8 * k],
      [p.x, yy(0.62), p.w * 0.97 * k],
      [p.x, p.gun, p.w * k],
    ];
  };
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const A = ringAt(i / n, 1);
    const B = ringAt((i + 1) / n, 1);
    for (let j = 0; j < 6; j++) pos.push(...A[j], ...A[j + 1], ...B[j + 1], ...A[j], ...B[j + 1], ...B[j]);
  }
  const t0 = ringAt(0, 1);
  for (let j = 1; j < 6; j++) pos.push(...t0[0], ...t0[j + 1], ...t0[j]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  const rust = hex('#8a3f1f');
  b.add(g, {
    color: (p) => {
      const q = p.y;
      if (q < 0.12) _c.set('#6a1a16');
      else if (q < 0.3) _c.set('#e8e0cc');
      else if (q > 1.5) _c.set('#c8342a');
      else _c.set('#252c36');
      const k = noise3(p.x * 0.8, p.y * 0.25, p.z * 0.8) * 0.5 + noise3(p.x * 2.4, p.y * 0.6, p.z) * 0.3;
      return _c.lerp(rust, smooth(0.12, 0.42, k) * 0.8);
    },
    gloss: 0.12,
  });
  // deck
  const dk: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = prof(i / n);
    const q = prof((i + 1) / n);
    const y0 = p.gun - 0.4;
    const y1 = q.gun - 0.4;
    dk.push(p.x, y0, -p.w * 0.95, p.x, y0, p.w * 0.95, q.x, y1, q.w * 0.95, p.x, y0, -p.w * 0.95, q.x, y1, q.w * 0.95, q.x, y1, -q.w * 0.95);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dk), 3));
  dg.computeVertexNormals();
  b.add(dg, { color: '#7a5a42' });
  // wheelhouse with a scowl
  b.box(3.0, 2.3, 3.4, { color: '#d8d2c2', pos: [-3.1, 2.5, 0], r: 0.12, vary: 0.05, ao: (p) => lerp(0.75, 1, smooth(1.4, 2.6, p.y)) });
  b.box(3.4, 0.26, 3.8, { color: '#a8342a', pos: [-3.1, 3.75, 0], r: 0.08 });
  b.box(2.0, 0.9, 2.3, { color: '#c8c2b2', pos: [-3.4, 4.3, 0], r: 0.1 });
  for (const s of [-1, 1]) {
    b.box(0.12, 0.72, 1.18, { color: '#ffb04a', pos: [-1.58, 2.82, s * 0.8], rot: [s * 0.3, 0, 0], r: 0.04, glow: 1.0 });
    b.box(0.34, 0.26, 1.6, { color: '#3a2420', pos: [-1.5, 3.28, s * 0.82], rot: [s * 0.36, 0, 0], r: 0.05 });
    b.box(1.6, 0.62, 0.1, { color: '#20303c', pos: [-3.1, 2.8, s * 1.72], r: 0.04, gloss: 0.6 });
  }
  // funnel
  b.cyl(0.62, 0.74, 1.9, { color: '#1c2026', pos: [-4.5, 4.4, 0], seg: 14 });
  b.cyl(0.67, 0.7, 0.5, { color: '#c8342a', pos: [-4.5, 4.6, 0], seg: 14 });
  // gantry and drums
  for (const s of [-1, 1]) b.bar([-5.9, 1.3, s * 1.7], [-6.5, 4.6, s * 1.2], 0.2, 0.17, { color: '#e0a02a' });
  b.bar([-6.5, 4.6, -1.3], [-6.5, 4.6, 1.3], 0.2, 0.2, { color: '#e0a02a' });
  b.cyl(0.75, 0.75, 2.4, { color: '#2f8f66', pos: [-5.2, 1.9, 0], rot: [Math.PI / 2, 0, 0], seg: 12 });
  for (const s of [-1, 1]) b.cyl(0.95, 0.95, 0.14, { color: '#8a6a2a', pos: [-5.2, 1.9, s * 1.2], rot: [Math.PI / 2, 0, 0], seg: 14 });
  // outrigger booms with dragging gear
  for (const s of [-1, 1]) {
    b.bar([-0.6, 1.9, s * 1.6], [0.2, 4.2, s * 6.0], 0.18, 0.11, { color: '#e0a02a' });
    b.bar([-0.2, 5.6, 0], [0.2, 4.2, s * 6.0], 0.05, 0.05, { color: '#2a2018' });
    b.bar([0.2, 4.2, s * 6.0], [-0.4, -0.3, s * 6.2], 0.05, 0.05, { color: '#2a2018' });
    b.box(1.5, 0.95, 0.24, { color: '#6a3a24', pos: [-0.4, -0.1, s * 6.2], rot: [0, s * 0.3, 0], r: 0.06 });
    for (let k = 0; k < 4; k++) b.tube([[-0.9 - k * 0.2, 0.2, s * 6.1], [-2.4, -0.25, s * (5.2 - k * 0.5)], [-4.6, -0.3, s * (3.2 - k * 0.4)]], () => 0.08, { color: '#3fae7a', seg: 4, rings: 8 });
  }
  b.bar([-0.2, 1.2, 0], [-0.2, 6.2, 0], 0.17, 0.11, { color: '#e0a02a' });
  b.ball(0.3, { color: '#ff5a3a', pos: [-0.2, 6.35, 0], seg: 9, glow: 1.2 });
  // a deck heaped with everything it should not have taken
  const junk = ['#e8604a', '#5fb0d8', '#d8b24a', '#7fae5a', '#b8b2a4', '#8a5a9c'];
  for (let i = 0; i < 24; i++) {
    const x = lerp(0.2, 4.0, r());
    const z = (r() * 2 - 1) * 1.45 * (1 - x / 9);
    const s = lerp(0.35, 0.72, r());
    const y = 1.55 + r() * 0.7 + (1 - Math.abs(z) / 1.6) * 0.4;
    if (i % 2) b.box(s * 1.4, s, s * 1.1, { color: junk[i % 6], pos: [x, y, z], rot: [r(), r() * 6, r()], r: 0.05 });
    else b.ball(s * 0.7, { color: junk[i % 6], pos: [x, y, z], seg: 8, rough: 0.1 });
  }
  // and the gear of the whole fleet: drums along the sides, striped floats on the rails
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x = 0.7 + k * 1.15;
      const z = s * (1.75 - k * 0.12);
      b.cyl(0.5, 0.5, 1.2, { color: '#f7c51d', pos: [x, 2.5, z], seg: 14, gloss: 0.35 });
      b.cyl(0.515, 0.515, 0.3, { color: '#20242c', pos: [x, 2.5, z], seg: 14 });
      for (const y of [1.93, 3.07]) b.cyl(0.54, 0.54, 0.09, { color: '#b8891a', pos: [x, y, z], seg: 14 });
    }
    for (let k = 0; k < 4; k++) {
      const p = prof(0.12 + k * 0.1);
      striped(b, [p.x, p.gun + 0.45, s * (p.w + 0.16)], 0.46);
    }
  }
  // rails, anchor, floodlights
  for (const s of [-1, 1]) {
    const pts: Vec[] = [];
    for (let i = 12; i <= n - 1; i++) {
      const p = prof(i / n);
      pts.push([p.x, p.gun + 0.5, s * p.w * 0.98]);
      if (i % 2 === 0) b.bar([p.x, p.gun, s * p.w * 0.98], [p.x, p.gun + 0.5, s * p.w * 0.98], 0.05, 0.05, { color: '#e8e0cc', seg: 5 });
    }
    b.tube(pts, () => 0.055, { color: '#e8e0cc', seg: 5, rings: 20 });
    b.box(0.5, 0.4, 0.4, { color: '#20262e', pos: [-1.6, 4.0, s * 1.5], r: 0.06 });
    b.box(0.1, 0.3, 0.3, { color: '#fff2c8', pos: [-1.33, 4.0, s * 1.5], r: 0.03, glow: 1.4 });
    b.bar([5.2, 2.5, s * 1.1], [5.3, 1.2, s * 1.25], 0.12, 0.1, { color: '#3a4048' });
    b.add(new THREE.TorusGeometry(0.42, 0.11, 6, 12, 3.14), { color: '#3a4048', pos: [5.35, 1.3, s * 1.28], rot: [0, 0, Math.PI] });
  }
  return b.geo(true);
}

function turtle(): THREE.BufferGeometry {
  const b = new Build(320);
  b.ball(1, { color: (p) => _c.set('#5f7a3a').lerp(hex('#a3a84e'), smooth(0.1, 0.36, p.y + noise3(p.x * 3, 0, p.z * 3) * 0.12)), scale: [1.15, 0.36, 0.9], seg: 14 });
  b.ball(0.98, { color: '#e6d9a0', pos: [0, -0.1, 0], scale: [1.08, 0.26, 0.84], seg: 12 });
  b.ball(0.32, { color: '#7a9a4e', pos: [1.36, 0.04, 0], scale: [1.2, 0.8, 0.85], seg: 10 });
  const flip = (x: number, s: number, len: number, w: number, back: number): void => {
    const g = new THREE.SphereGeometry(1, 10, 6);
    g.scale(w, 0.08, len * 0.5);
    g.translate(0, 0, len * 0.48);
    g.rotateY(back * s);
    if (s < 0) g.scale(1, 1, -1);
    g.translate(x, 0, s * 0.6);
    if (s < 0) {
      const idx = g.index!;
      for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i);
        idx.setX(i, idx.getX(i + 1));
        idx.setX(i + 1, a);
      }
    }
    b.add(g, { color: '#7a9a4e', sway: (p) => Math.max(0, Math.abs(p.z) - 0.6) });
  };
  for (const s of [-1, 1]) {
    flip(0.6, s, 1.5, 0.34, -0.5 * s);
    flip(-0.9, s, 0.75, 0.26, -0.9 * s);
  }
  return b.geo();
}

function bird(): THREE.BufferGeometry {
  const b = new Build(330);
  b.ball(0.26, { color: '#ffffff', scale: [2.3, 0.75, 0.8], seg: 9 });
  b.ball(0.16, { color: '#ffffff', pos: [0.6, 0.06, 0], seg: 7 });
  b.add(new THREE.ConeGeometry(0.07, 0.26, 5), { color: '#f2a03a', pos: [0.82, 0.04, 0], rot: [0, 0, -Math.PI / 2] });
  for (const s of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    const q: Vec[] = [
      [0.26, 0.03, s * 0.12],
      [-0.22, 0.03, s * 0.12],
      [0.18, 0.06, s * 1.0],
      [-0.16, 0.06, s * 0.95],
      [-0.28, 0.03, s * 1.95],
    ];
    const tri = s > 0 ? [0, 1, 2, 2, 1, 3, 2, 3, 4] : [0, 2, 1, 2, 3, 1, 2, 4, 3];
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tri.flatMap((i) => q[i])), 3));
    g.computeVertexNormals();
    b.add(g, { color: (p) => (Math.abs(p.z) > 1.4 ? _c.set('#3a444c') : _c.set('#f4f7f8')), sway: (p) => Math.max(0, Math.abs(p.z) - 0.1) });
  }
  b.add(new THREE.ConeGeometry(0.2, 0.5, 4), { color: '#eef2f4', pos: [-0.7, 0.02, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 1] });
  return b.geo();
}

/* ================================================================== runtime */

type Kind = 'bottle0' | 'bottle1' | 'bottle2' | 'bag0' | 'bag1' | 'bag2' | 'net' | 'crate' | 'battery' | 'relic' | 'seed' | 'boat0' | 'boat1';

function kindOf(e: { kind: EntityKind; variant: number }): Kind | null {
  switch (e.kind) {
    case 'trash_bottle':
      return (['bottle0', 'bottle1', 'bottle2'] as const)[e.variant % 3];
    case 'trash_bag':
      return (['bag0', 'bag1', 'bag2'] as const)[e.variant % 3];
    case 'trash_net':
    case 'drift_net':
    case 'ghost_net':
      return 'net';
    case 'trash_crate':
      return 'crate';
    case 'trash_battery':
      return 'battery';
    case 'trash_relic':
      return 'relic';
    case 'mangrove_seed':
      return 'seed';
    case 'boat':
      return e.variant % 2 ? 'boat1' : 'boat0';
    default:
      return null;
  }
}

const RARITY: Record<string, [number, number, number]> = {
  uncommon: [0.28, 1.05, 0.5],
  rare: [0.2, 1.0, 1.25],
  epic: [1.4, 0.85, 0.2],
  legendary: [1.5, 0.45, 1.15],
};

interface Seen {
  x: number;
  z: number;
  k: Kind;
  rot: number;
  scale: number;
  trash: boolean;
  flash: number;
}

interface Ghost {
  k: Kind;
  from: THREE.Vector3;
  to: THREE.Vector3;
  slot: number;
  t: number;
  rot: number;
  scale: number;
}

/** Something thrown by hand: it flies, tumbles, splashes, and only then becomes a thing in the sim. */
interface Toss {
  k: Kind;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  spin: number;
  yaw: number;
  land: () => void;
}

const SCALE: Record<Kind, number> = { bottle0: 1.02, bottle1: 1.05, bottle2: 1.0, bag0: 1.12, bag1: 1.12, bag2: 1.0, net: 1.08, crate: 1.02, battery: 1.12, relic: 1.15, seed: 1.2, boat0: 1.12, boat1: 1.12 };
/** The story's nets are the same tangle, bigger: adrift in the lane, or draped over the coral. */
const BIG: Partial<Record<EntityKind, number>> = { drift_net: 1.5, ghost_net: 1.75 };
const SINK: Record<Kind, number> = { bottle0: 0.16, bottle1: 0.14, bottle2: 0.12, bag0: 0.2, bag1: 0.2, bag2: 0.1, net: 0.12, crate: 0.1, battery: 0.22, relic: 0.36, seed: 0.1, boat0: 0.16, boat1: 0.16 };

export class Actors {
  readonly group = new THREE.Group();
  readonly underGroup = new THREE.Group();
  readonly overGroup = new THREE.Group();
  readonly lamps: { p: THREE.Vector3; r: number; c: THREE.Vector3 }[] = [];
  onCatch: (() => void) | null = null;
  /** Fishing boats the simulation does not have in the water right now. */
  guests: readonly Guest[] = [];
  /** The title and the first morning of the opening: no oil, no nets. */
  veiled = false;
  private im = {} as Record<Kind, THREE.InstancedMesh>;
  private data = {} as Record<Kind, THREE.InstancedBufferAttribute>;
  private n = {} as Record<Kind, number>;
  private seen = new Map<number, Seen>();
  private ghosts: Ghost[] = [];
  private tosses: Toss[] = [];
  private slot = 0;
  private buoys: THREE.Mesh[] = [];
  private buoyU: { value: number }[] = [];
  private hero: THREE.Group;
  private eyes: THREE.Mesh[] = [];
  private heroYaw = 0;
  private heroJoy = 0;
  private boss: THREE.Mesh;
  private bossFlash = { value: 0 };
  private logs: THREE.InstancedMesh;
  private oil: THREE.Mesh[] = [];
  private oilU: Record<string, THREE.IUniform>[] = [];
  private birds: THREE.InstancedMesh;
  private turtles: THREE.InstancedMesh;
  private turtleMat: THREE.ShaderMaterial;
  private r = rng(9090);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private nrm = new THREE.Vector3();
  private s3 = new THREE.Vector3();
  readonly heroPos = new THREE.Vector3(-19.5, 0, 17.5);
  private eye = new THREE.Vector3();
  private cine = 0;

  constructor(
    private water: Water,
    private net: Net,
    private fx: Fx
  ) {
    const pair = toon({
      side: THREE.DoubleSide,
      fAlbedo: /* glsl */ `
        emis = vFx.w * (.75 + .25 * sin(uTime * 4.2 + vInst.x * 6.28));
        alb = mix(alb, vec3(1.), vInst.y);
        emis += vInst.y * .7;
      `,
    });
    const ink = outlineMaterial(1.7, '#15202c');
    const boatOf = (hull: string, stripe: string, sail: string, shirt: string): THREE.BufferGeometry => {
      const man = person({ shirt, sarong: '#2f4f7a', hat: 'caping', scale: 0.92 });
      return new Build(1).merge(perahu(hull, stripe, sail)).merge(man, matrixOf([-1.0, 0.28, 0], [0, 1.2, 0])).geo(true);
    };
    const geos: Record<Kind, THREE.BufferGeometry> = {
      bottle0: bottle(0),
      bottle1: bottle(1),
      bottle2: bottle(2),
      bag0: bag(0),
      bag1: bag(1),
      bag2: bag(2),
      net: ghostNet(),
      crate: crate(),
      battery: battery(),
      relic: relic(),
      seed: seed(),
      boat0: boatOf('#d8342c', '#f2b62c', '#e8342f', '#fff6e4'),
      boat1: boatOf('#14807c', '#f2c14a', '#14a39a', '#f2c14a'),
    };
    for (const k of Object.keys(geos) as Kind[]) {
      const m = instanced(geos[k], pair, [], { capacity: k.startsWith('boat') ? 8 : 110, ink });
      this.im[k] = m;
      this.data[k] = m.geometry.attributes.aInst as THREE.InstancedBufferAttribute;
      this.n[k] = 0;
      this.group.add(m);
    }

    /* ---- AI buoys */
    const bg = aiBuoy();
    for (let i = 0; i < 3; i++) {
      const u = { value: 0 };
      const p = toon({
        uniforms: { uPulse: u },
        fHead: 'uniform float uPulse;',
        fAlbedo: 'if (vFx.w > .01){ alb = mix(alb, vec3(1., .75, .25), uPulse); emis = vFx.w * (1.4 + .8 * sin(uTime * 4.)) + uPulse * 2.; }',
      });
      const m = inked(mesh(bg, p), ink);
      m.visible = false;
      m.frustumCulled = false;
      this.buoys.push(m);
      this.buoyU.push(u);
      this.group.add(m);
    }

    /* ---- hero */
    this.hero = new THREE.Group();
    const hp = toon({ fAlbedo: 'emis = vFx.w * (1.1 + .6 * sin(uTime * 3.));' });
    const body = inked(mesh(heroBuoy(), hp), ink);
    body.frustumCulled = false;
    this.hero.add(body);
    const eyeMat = toon({ fLight: 'c = vec3(.35, 1.35, 1.5) * 1.25;' });
    for (const s of [-1, 1]) {
      const e = new Build(1).add(new THREE.CapsuleGeometry(0.17, 0.2, 4, 10), { color: '#8ff6ff' }).geo();
      const m = mesh(e, eyeMat, false);
      m.position.set(s * 0.32, 1.78, 1.12);
      m.rotation.x = -0.62;
      m.frustumCulled = false;
      this.eyes.push(m);
      this.hero.add(m);
    }
    const smile = new Build(1).add(new THREE.TorusGeometry(0.24, 0.065, 5, 12, Math.PI), { color: '#8ff6ff', rot: [0, 0, Math.PI] }).geo();
    const sm = mesh(smile, eyeMat, false);
    sm.position.set(0, 1.46, 1.3);
    sm.rotation.x = -0.55;
    sm.frustumCulled = false;
    this.hero.add(sm);
    this.hero.scale.setScalar(1.32);
    this.group.add(this.hero);

    /* ---- trawler */
    const bp = toon({
      side: THREE.DoubleSide,
      uniforms: { uFlash: this.bossFlash },
      fHead: 'uniform float uFlash;',
      fAlbedo: 'emis = vFx.w * (1.2 + .4 * sin(uTime * 6.)); alb = mix(alb, vec3(1.), uFlash * .7); emis += uFlash * .6;',
    });
    this.boss = inked(mesh(trawler(), bp), outlineMaterial(1.9, '#15131a'));
    this.boss.visible = false;
    this.boss.frustumCulled = false;
    this.group.add(this.boss);

    /* ---- what burns */
    const lb = new Build(340);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      lb.bar([Math.cos(a) * 1.3, 0.05, Math.sin(a) * 1.1], [Math.cos(a + 2.6) * 0.5, 0.75 + (i % 2) * 0.25, Math.sin(a + 2.6) * 0.5], 0.2, 0.15, { color: (p) => _c.set('#2a1c16').lerp(hex('#7a4a2a'), smooth(0.8, 1.5, Math.hypot(p.x, p.z))), seg: 7, rough: 0.03 });
    }
    lb.ball(0.7, { color: '#1c1512', pos: [0, 0.05, 0], scale: [1.5, 0.35, 1.3], seg: 9, rough: 0.1 });
    for (let i = 0; i < 7; i++) lb.ico(0.14, 0, { color: '#ff7a2a', pos: [Math.cos(i * 2.4) * 0.6, 0.26, Math.sin(i * 2.4) * 0.6], glow: 2.2 });
    this.logs = instanced(lb.geo(true), toon({ fAlbedo: 'emis = vFx.w * (.6 + .4 * sin(uTime * 9. + vWP.x * 4.));' }), [], { capacity: 6, ink });
    this.group.add(this.logs);

    /* ---- oil: an iridescent skin that rides the water */
    const og = new THREE.PlaneGeometry(2, 2, 22, 22);
    for (let i = 0; i < 4; i++) {
      const u: Record<string, THREE.IUniform> = { uO: { value: new THREE.Vector4() }, uO2: { value: new THREE.Vector4() } };
      const m = new THREE.Mesh(
        og,
        new THREE.ShaderMaterial({
          uniforms: { ...G, ...water.shared, ...u },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          vertexShader: /* glsl */ `
${GLSL_UNIFORMS}
${FLOAT_HEAD()}
uniform vec4 uO; varying vec2 vQ; varying vec3 vWP;
void main(){
  vQ = position.xy;
  vec2 xz = uO.xy + position.xy * uO.z;
  float a_, b_; vec3 p = waterPos(xz, a_, b_);
  p.y += .05; vWP = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}`,
          fragmentShader: /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_LIGHT}
${GLSL_GRADE_LDR}
uniform vec4 uO, uO2; varying vec2 vQ; varying vec3 vWP;
void main(){
  float r = length(vQ); float an = atan(vQ.y, vQ.x) + uO.w;
  float n = texture2D(uNoise, vec2(cos(an), sin(an)) * .11 + uO2.x + uTime * .008).b - .5;
  float n2 = texture2D(uNoise, vQ * .24 + uO2.x - uTime * .01).a - .5;
  float edge = .76 + n * .55 + n2 * .16;
  float a = smoothstep(edge, edge - .05, r);
  if (a < .01) discard;
  float rim = smoothstep(edge - .02, edge - .2, r);
  float ph = r * 5. + n2 * 7. + n * 5. + uTime * .25;
  vec3 iri = .5 + .5 * cos(ph + vec3(0., 2.1, 4.2));
  vec3 c = mix(vec3(.018, .016, .026), iri * vec3(.2, .13, .26), smoothstep(.45, .9, sin(ph * 1.4) * .5 + .5) * .7);
  c = mix(iri * .2, c, rim);
  vec3 V = normalize(cameraPosition - vWP);
  vec3 N = normalize(vec3(n2 * .5, 1., n * .5));
  c += uSkyCol * pow(1. - sat(dot(N, V)), 2.) * .6;
  c += uSunCol * smoothstep(.975, .99, dot(normalize(V + uSunDir), N)) * .8;
  c = mix(c, vec3(.6, .5, .8), uO2.y * .4);
  c = applyFog(c, vWP);
  #ifdef DIRECT_LDR
    c = alunGrade(c, gl_FragCoord.xy / uRes);
  #endif
  gl_FragColor = vec4(c, a * .94);
}`,
        })
      );
      registerDirectLdr(m.material as THREE.ShaderMaterial, false);
      m.frustumCulled = false;
      m.renderOrder = 8;
      m.visible = false;
      this.oil.push(m);
      this.oilU.push(u);
      this.overGroup.add(m);
    }

    /* ---- birds and turtles */
    const bpair = toon({ side: THREE.DoubleSide, vLocal: 'float fl = sin(uTime * 6.5 + aInst.x * 6.28) * (.35 + .65 * smoothstep(-.2, .6, sin(uTime * .7 + aInst.x * 20.))); p.y += fl * aFx.y * aFx.y * .34 + aFx.y * .1; p.z *= 1. - abs(fl) * .08;' });
    this.birds = instanced(bird(), bpair, Array.from({ length: 6 }, (_, i) => ({ m: new THREE.Matrix4(), i: [i * 0.143, 0, 0, 0] as [number, number, number, number] })));
    this.group.add(this.birds);
    const tpair = toon({
      side: THREE.DoubleSide,
      vLocal: 'float fl = sin(uTime * 2.1 + aInst.x * 6.28); p.y += fl * aFx.y * .34; p.x -= (cos(uTime * 2.1 + aInst.x * 6.28) * .5 + .5) * aFx.y * .4;',
      fHead: GLSL_CACHED_UNDERWATER,
      fEnd: GLSL_UNDERWATER_END,
    });
    this.turtleMat = tpair.material;
    this.turtles = instanced(turtle(), tpair, Array.from({ length: 3 }, (_, i) => ({ m: new THREE.Matrix4(), i: [i * 0.31, 0, 0, 0] as [number, number, number, number] })));
    this.underGroup.add(this.turtles);
  }

  setCachedMode(on: boolean): void {
    const m = this.turtleMat;
    m.transparent = on;
    m.depthTest = !on;
    m.depthWrite = !on;
    if (Boolean(m.defines.CACHED_UNDER) !== on) {
      if (on) m.defines.CACHED_UNDER = 1;
      else delete m.defines.CACHED_UNDER;
      m.needsUpdate = true;
    }
  }

  /**
   * Throws a piece of trash from a hand to the water. `land` runs on the splash, which is the moment
   * the caller should put the entity in the sim, so the piece in the air and the one afloat are the same.
   */
  toss(e: { kind: EntityKind; variant: number }, from: THREE.Vector3, to: THREE.Vector3, dur: number, arc: number, land: () => void): void {
    const k = kindOf(e);
    if (!k) {
      land();
      return;
    }
    this.tosses.push({ k, from: from.clone(), to: to.clone(), t: 0, dur, arc, spin: (this.r() - 0.5) * 9, yaw: this.r() * 6.28, land });
  }

  /** Lands everything still in the air at once. */
  landAll(): void {
    for (const s of this.tosses.splice(0)) s.land();
  }

  /** A.L.U.N. bounces, the same way he does when the net catches something. */
  cheerHero(): void {
    this.heroJoy = 1;
  }

  private floatAt(x: number, z: number, t: number, swell: number, span: number): number {
    const h = this.water.heightAt(x, z, t, swell);
    const hx = this.water.heightAt(x + span, z, t, swell);
    const hz = this.water.heightAt(x, z + span, t, swell);
    this.nrm.set(-(hx - h) / span, 1, -(hz - h) / span).normalize();
    return h;
  }

  private put(k: Kind, x: number, y: number, z: number, yaw: number, scale: number, squash: number, phase: number, flash: number, tilt = true, roll = 0, pitch = 0): void {
    const i = this.n[k];
    const m = this.im[k];
    if (i >= m.instanceMatrix.count) return;
    this.q.setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    if (tilt) {
      this.q2.setFromUnitVectors(UP, this.nrm);
      this.q.premultiply(this.q2);
    }
    this.s3.set(scale * (2 - squash), scale * squash, scale * (2 - squash));
    this.m4.compose(this.v.set(x, y, z), this.q, this.s3);
    m.setMatrixAt(i, this.m4);
    this.data[k].setXYZW(i, phase, flash, 0, 0);
    this.n[k] = i + 1;
  }

  update(dt: number, t: number, sim: GameSimulation, stats: ComputedStats, look: Look, cam: THREE.Vector3, cine: number): void {
    this.eye.copy(cam);
    this.cine = cine;
    for (const k of Object.keys(this.n) as Kind[]) this.n[k] = 0;
    this.lamps.length = 0;
    const sp = this.fx.sprites;
    const swell = look.swell;
    const live = new Set<number>();
    let oilN = 0;
    let fireN = 0;
    let bossOn = false;

    for (const e of sim.entities) {
      const x = toX(e.x);
      const z = toZ(e.y);
      if (this.veiled && (e.source !== undefined || e.kind === 'boat')) continue;
      if (e.kind === 'oil') {
        this.drawOil(e, oilN++, x, z);
        continue;
      }
      if (e.kind === 'fire') {
        this.drawFire(e, fireN++, x, z, t, look);
        continue;
      }
      if (e.kind === 'trawler') {
        bossOn = true;
        this.drawBoss(e, x, z, t, dt, swell);
        continue;
      }
      const k = kindOf(e);
      if (!k) continue;
      live.add(e.id);
      const h = this.floatAt(x, z, t, swell, e.kind === 'boat' ? 1.4 : 0.7);
      const grow = smooth(0, 0.4, e.age);
      const pop = grow * (1 + Math.sin(clamp(e.age / 0.4, 0, 1) * Math.PI) * 0.18);
      const hit = clamp(e.hitFlash / 0.14, 0, 1);
      const squash = 1 + Math.sin(hit * Math.PI) * 0.22;
      const bob = Math.sin(e.bobPhase) * 0.07;
      const scale = SCALE[k] * pop * (BIG[e.kind] ?? 1);
      const wob = Math.sin(e.bobPhase * 0.8) * 0.12;
      this.put(k, x, h + SINK[k] + bob, z, -e.rotation, scale, squash, e.id * 0.137, hit * 0.75 * (1 - cine * 0.9), true, wob, wob * 0.6);
      const prev = this.seen.get(e.id);
      if (hit > 0.6 && (!prev || prev.flash < 0.3)) {
        this.water.splash({ x, z, radius: e.radius * UNIT * 1.2, foam: 0.85, impulse: 1 });
        this.fx.burst(x, h + 0.3, z, e.kind === 'boat' ? 8 : 5, 3.2, 0, 0.1);
      }
      this.seen.set(e.id, { x, z, k, rot: -e.rotation, scale, trash: isTrashKind(e.kind), flash: hit });

      /* ground every object in the water, then say what it is worth */
      const rad = e.radius * UNIT;
      sp.push(x, h + 0.06, z, rad * 1.12 * grow, rad * 1.02 * grow, e.id, 1, 1, 1, 0.34 * (1 - look.bio * 0.5), SP.ring, MODE.flat, 0, 0.9);
      if (look.bio > 0.2) sp.push(x, h + 0.06, z, rad * 1.5, rad * 1.5, 0, 0.1, 0.9, 1.1, 0.5 * look.bio, SP.glow, MODE.flat, 1);
      if (e.kind === 'boat') {
        const spd = Math.hypot(e.vx, e.vy) * UNIT;
        if (spd > 1.2) this.water.splash({ x: x - Math.cos(e.rotation) * 2.2, z: z - Math.sin(e.rotation) * 2.2, radius: 0.7, foam: 0.5, impulse: 0.35 });
      }
      const rc = e.rarity ? RARITY[e.rarity] : undefined;
      if (rc) {
        const pulse = 0.5 + 0.5 * Math.sin(t * (e.rarity === 'legendary' ? 5 : 3.4) + e.id);
        const big = e.rarity === 'legendary' ? 1.95 : e.rarity === 'epic' ? 1.75 : 1.5;
        sp.push(x, h + 0.1, z, rad * big * (1 + pulse * 0.08), rad * big * (1 + pulse * 0.08), 0, rc[0], rc[1], rc[2], (0.4 + pulse * 0.28) * grow, SP.halo, MODE.flat, 0.75);
        if (e.rarity === 'epic' || e.rarity === 'legendary') {
          const bh = e.rarity === 'legendary' ? 9.5 : 6.5;
          sp.push(x, h, z, rad * 0.85, bh * (0.92 + pulse * 0.08), 0, rc[0], rc[1], rc[2], 0.62 * grow, SP.beam, MODE.upright, 1, 0, (e.id * 0.31) % 1);
          sp.push(x, h + 1.8 + Math.sin(t * 2 + e.id) * 0.3, z, 0.7 + pulse * 0.4, 0.7 + pulse * 0.4, t * 0.6, rc[0] * 1.4, rc[1] * 1.4, rc[2] * 1.4, pulse, SP.star, MODE.billboard, 1);
        }
      }
      if (e.kind === 'mangrove_seed') {
        const p = 0.5 + 0.5 * Math.sin(t * 3 + e.id);
        sp.push(x, h + 0.1, z, rad * 1.6, rad * 1.6, 0, 0.3, 1.1, 0.45, 0.4 + p * 0.25, SP.halo, MODE.flat, 0.7);
      }
      if (e.aiGuidedTimer > 0) sp.push(x, h + 0.14, z, rad * 1.45, rad * 1.45, -t, 0.35, 1.3, 1.5, Math.min(1, e.aiGuidedTimer * 1.4) * 0.8, SP.dash, MODE.flat, 0.8);
      if (stats.aiSonarLevel > 0 && (e.kind === 'mangrove_seed' || e.kind === 'boat' || e.rarity === 'epic' || e.rarity === 'legendary')) {
        const c = rc ?? (e.kind === 'boat' ? ([1.3, 0.95, 0.35] as const) : ([0.4, 1.2, 0.6] as const));
        const p = (t * 0.9 + e.id * 0.13) % 1;
        sp.push(x, h + 0.12, z, rad * (1.4 + p * 1.1), rad * (1.4 + p * 1.1), 0, c[0], c[1], c[2], (1 - p) * 0.7, SP.ring, MODE.flat, 0.8);
      }
    }

    for (const b of this.guests) {
      const h = this.floatAt(b.x, b.z, t, swell, 1.4);
      const w = Math.sin(t * 1.15 + b.z);
      this.put(b.variant % 2 ? 'boat1' : 'boat0', b.x, h + SINK.boat0 + w * 0.05, b.z, b.yaw, SCALE.boat0, 1, b.variant * 0.37, 0, true, w * 0.06, w * 0.03);
      sp.push(b.x, h + 0.06, b.z, 2.7, 2.45, b.yaw, 1, 1, 1, 0.3 * (1 - look.bio * 0.5), SP.ring, MODE.flat, 0, 0.9);
    }

    /* ---- anything that vanished inside the weir gets carried to a bin */
    for (const [id, s] of this.seen) {
      if (live.has(id)) continue;
      this.seen.delete(id);
      if (!s.trash || Math.hypot(s.x - this.net.center.x, s.z - this.net.center.z) > stats.netRadius * UNIT + 4.5) continue;
      const slot = this.slot++ % 3;
      this.ghosts.push({ k: s.k, from: new THREE.Vector3(s.x, 0.3, s.z), to: this.net.target(slot).clone(), slot, t: 0, rot: s.rot, scale: s.scale });
      this.water.splash({ x: s.x, z: s.z, radius: 1.7, foam: 1, impulse: 1.4 });
      this.fx.burst(s.x, 0.3, s.z, 12, 5, 0, 0.13);
      this.heroJoy = 1;
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt / 0.78;
      if (g.t >= 1) {
        this.net.land(g.slot);
        this.fx.burst(g.to.x, g.to.y, g.to.z, 5, 3, 2, 0.12);
        for (let k = 0; k < 7; k++) this.fx.spray(g.to.x, g.to.y, g.to.z, (this.r() - 0.5) * 4, 3 + this.r() * 3, (this.r() - 0.5) * 4, 0.2, 1.1, 3);
        this.onCatch?.();
        this.ghosts.splice(i, 1);
        continue;
      }
      const u = g.t;
      const e = u * u * (3 - 2 * u);
      const x = lerp(g.from.x, g.to.x, e);
      const z = lerp(g.from.z, g.to.z, e);
      const y = lerp(g.from.y, g.to.y, e) + Math.sin(u * Math.PI) * 4.6;
      this.put(g.k, x, y, z, g.rot + u * 5, g.scale * lerp(1.1, 0.5, e), 1, 0, 0.15, false, u * 4, u * 3);
      if (this.r() < dt * 40) this.fx.spray(x, y, z, 0, 0.6, 0, 0.1, 0.5, 2);
    }

    /* ---- trash on its way overboard */
    for (let i = this.tosses.length - 1; i >= 0; i--) {
      const s = this.tosses[i];
      s.t += dt / s.dur;
      if (s.t >= 1) {
        const h = this.water.heightAt(s.to.x, s.to.z, t, swell);
        this.water.splash({ x: s.to.x, z: s.to.z, radius: 1.5, foam: 1, impulse: 1.6 });
        this.fx.burst(s.to.x, h + 0.2, s.to.z, 9, 4.2, 0, 0.14);
        this.fx.spray(s.to.x, h + 0.3, s.to.z, 0, 1.4, 0, 0.9, 0.7, 1);
        this.tosses.splice(i, 1);
        s.land();
        continue;
      }
      const u = s.t;
      const x = lerp(s.from.x, s.to.x, u);
      const z = lerp(s.from.z, s.to.z, u);
      const y = lerp(s.from.y, s.to.y, u) + s.arc * 4 * u * (1 - u);
      // trash is drawn big so it reads from the play camera; in a hand it would dwarf the hand, so it
      // leaves small and arrives at the size it floats at
      const grow = lerp(0.38, 1, smooth(0.1, 0.95, u));
      this.put(s.k, x, y, z, s.yaw + u * s.spin, SCALE[s.k] * grow, 1, 0, 0, false, u * s.spin * 0.7, u * s.spin * 0.4);
    }

    for (const k of Object.keys(this.n) as Kind[]) {
      const m = this.im[k];
      const count = this.n[k];
      setCount(m, count);
      m.visible = count > 0;
      if (count > 0) {
        m.instanceMatrix.needsUpdate = true;
        this.data[k].needsUpdate = true;
      }
    }
    for (let i = oilN; i < this.oil.length; i++) this.oil[i].visible = false;
    const logN = Math.min(fireN, 6);
    setCount(this.logs, logN);
    this.logs.visible = logN > 0;
    if (logN > 0) this.logs.instanceMatrix.needsUpdate = true;
    this.boss.visible = bossOn;

    this.updateBuoys(dt, t, sim, swell, look);
    this.updateHero(dt, t, sim, swell, look);
    this.updateFauna(t, look);
  }

  private drawOil(e: Entity, i: number, x: number, z: number): void {
    const m = this.oil[i];
    if (!m) return;
    m.visible = true;
    const k = (0.65 + (e.hp / e.maxHp) * 0.35) * e.radius * UNIT * 1.55;
    (this.oilU[i].uO.value as THREE.Vector4).set(x, z, k, e.rotation);
    (this.oilU[i].uO2.value as THREE.Vector4).set((e.id * 0.317) % 1, clamp(e.hitFlash / 0.14, 0, 1), 0, 0);
  }

  private drawFire(e: Entity, i: number, x: number, z: number, t: number, look: Look): void {
    const gy = Math.max(0, groundAt(x, z));
    const k = clamp(0.35 + 0.65 * (e.hp / e.maxHp), 0, 1);
    if (i < 6) {
      this.logs.setMatrixAt(i, matrixOf([x, gy, z], [0, e.id, 0], 1.15));
    }
    const sp = this.fx.sprites;
    sp.push(x, gy + 0.16, z, 3.3, 2.9, 0, 0.03, 0.02, 0.018, 0.8, SP.mist, MODE.ground, 0, 0, 0.3);
    sp.push(x, gy + 0.2, z, 5.2 * k, 5.2 * k, 0, 1.4, 0.42, 0.06, 0.14 + look.lamp * 0.2, SP.glow, MODE.ground, 1);
    const n = 8;
    for (let j = 0; j < n; j++) {
      const a = j * 2.39996 + e.id;
      const d = Math.sqrt((j + 0.5) / n) * 1.15;
      const fl = 1 + Math.sin(t * (7 + (j % 3)) + j * 2) * 0.12;
      const h = lerp(2.6, 1.3, j / n) * k * fl;
      sp.push(x + Math.cos(a) * d, gy + h * 0.86, z + Math.sin(a) * d * 0.7, h * 0.46, h, Math.sin(t * 3 + j) * 0.08, 1, 1, 1, 0.97, SP.flame, MODE.billboard, 0.06, 0, (j * 0.137 + e.id * 0.07) % 1);
    }
    if (this.r() < 0.16) this.fx.spray(x + (this.r() - 0.5) * 1.4, gy + 2.2 * k, z, 0.8, 2.2, (this.r() - 0.5) * 0.6, lerp(0.8, 1.5, this.r()), 1.6, 1);
    const hit = clamp(e.hitFlash / 0.14, 0, 1);
    if (hit > 0.05) sp.push(x, gy + 1.2, z, 2.6, 2.6, 0, 1, 1, 1, hit * 0.8, SP.puff, MODE.billboard, 0, 0.8, t % 1);
    this.lamps.push({ p: new THREE.Vector3(x, gy + 1.4, z), r: 10, c: new THREE.Vector3(1.0, 0.34, 0.07).multiplyScalar(k) });
  }

  private drawBoss(e: Entity, x: number, z: number, t: number, dt: number, swell: number): void {
    const b = this.boss;
    const h = this.floatAt(x, z, t, swell, 3);
    const hit = clamp(e.hitFlash / 0.14, 0, 1);
    this.bossFlash.value = hit;
    b.position.set(x, 0.35 + h * 0.6 + Math.sin(t * 1.1) * 0.12, z);
    this.q.setFromEuler(new THREE.Euler(Math.sin(t * 0.9) * 0.05 + hit * 0.12, -e.rotation, Math.sin(t * 1.3) * 0.03, 'YXZ'));
    this.q2.setFromUnitVectors(UP, this.nrm);
    this.q2.slerp(new THREE.Quaternion(), 0.6);
    b.quaternion.copy(this.q).premultiply(this.q2);
    const dx = Math.cos(e.rotation);
    const dz = Math.sin(e.rotation);
    if (this.r() < dt * 30) this.water.splash({ x: x + dx * 6, z: z + dz * 6 + (this.r() - 0.5) * 3, radius: 1.3, foam: 0.9, impulse: 0.6 });
    if (this.r() < dt * 24) this.water.splash({ x: x - dx * 6.4, z: z - dz * 6.4 + (this.r() - 0.5) * 3, radius: 1.4, foam: 0.8, impulse: 0.5 });
    if (this.r() < dt * 14) this.fx.spray(x - dx * 4.6, 5.8, z - dz * 4.6, 1.6, 1.6, (this.r() - 0.5) * 0.6, lerp(1.0, 1.7, this.r()), 2.2, 1);
    this.fx.sprites.push(x + dx * 1.2, 3.2, z + dz * 1.2, 4, 4, 0, 1.2, 0.6, 0.2, 0.18, SP.glow, MODE.billboard, 1);
  }

  private updateBuoys(dt: number, t: number, sim: GameSimulation, swell: number, look: Look): void {
    const sp = this.fx.sprites;
    for (let i = 0; i < 3; i++) {
      const b = sim.aiBuoys[i];
      const m = this.buoys[i];
      m.visible = !!b;
      if (!b) continue;
      const x = toX(b.x);
      const z = toZ(b.y);
      const h = this.floatAt(x, z, t, swell, 0.9);
      const p = clamp(b.pulseTimer / 0.65, 0, 1);
      this.buoyU[i].value = p;
      m.position.set(x, h + 0.02, z);
      this.q.setFromEuler(new THREE.Euler(Math.sin(t * 1.4 + i) * 0.07, 0.3, Math.cos(t * 1.1 + i) * 0.07));
      this.q2.setFromUnitVectors(UP, this.nrm);
      m.quaternion.copy(this.q).premultiply(this.q2);
      m.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.18);
      sp.push(x, h + 0.08, z, 2.9, 2.9, t * 0.35, 0.35, 1.25, 1.4, 0.55, SP.dash, MODE.flat, 0.8);
      sp.push(x, h + 2.95, z, 0.9 + p * 1.6, 0.9 + p * 1.6, 0, lerp(0.4, 1.6, p), lerp(1.3, 1.0, p), lerp(1.5, 0.3, p), 0.6 + look.bio * 0.3, SP.glow, MODE.billboard, 1);
      const ring = (t * 0.5 + i * 0.33) % 1;
      sp.push(x, h + 0.1, z, 1.2 + ring * 3.4, 1.2 + ring * 3.4, 0, 0.35, 1.25, 1.4, (1 - ring) * 0.4, SP.ring, MODE.flat, 0.8);
    }
    void dt;
  }

  private updateHero(dt: number, t: number, sim: GameSimulation, swell: number, look: Look): void {
    const p = this.heroPos;
    const h = this.floatAt(p.x, p.z, t, swell, 1.0);
    this.heroJoy = Math.max(0, this.heroJoy - dt * 1.2);
    let tx = p.x;
    let tz = p.z + 10;
    if (sim.drag.active) {
      tx = toX(sim.drag.currX);
      tz = toZ(sim.drag.currY);
    } else if (sim.waves.length) {
      const w = sim.waves[sim.waves.length - 1];
      tx = toX(w.x);
      tz = toZ(w.y);
    }
    // on the gameplay camera he glances around; when the camera comes down to him he looks at you
    const want = this.cine > 0.25 ? Math.atan2(this.eye.x - p.x, this.eye.z - p.z) : clamp(Math.atan2(tx - p.x, Math.max(2, tz - p.z + 16)), -0.85, 0.85);
    const turn = Math.atan2(Math.sin(want - this.heroYaw), Math.cos(want - this.heroYaw));
    this.heroYaw += turn * Math.min(1, dt * 4);
    const hop = Math.abs(Math.sin(t * 9)) * 0.55 * Math.min(1, this.heroJoy * 1.5);
    this.hero.position.set(p.x, h + hop, p.z);
    this.q.setFromEuler(new THREE.Euler(Math.sin(t * 1.2) * 0.06, this.heroYaw, Math.cos(t * 0.9) * 0.06, 'YXZ'));
    this.q2.setFromUnitVectors(UP, this.nrm);
    this.hero.quaternion.copy(this.q).premultiply(this.q2);
    const blink = (t % 3.7) < 0.12 ? 0.12 : 1;
    const happy = this.heroJoy > 0.15 ? 0.45 : 1;
    for (const e of this.eyes) e.scale.set(1, blink * happy, 1);
    const sp = this.fx.sprites;
    sp.push(p.x, h + 0.06, p.z, 2.55, 2.45, 0, 1, 1, 1, 0.4 * (1 - look.bio * 0.5), SP.ring, MODE.flat, 0, 0.9);
    const ring = (t * 0.4) % 1;
    sp.push(p.x, h + 0.1, p.z, 2 + ring * 2.2, 2 + ring * 2.2, 0, 1.2, 0.9, 0.4, (1 - ring) * 0.22, SP.ring, MODE.flat, 0.7);
  }

  private updateFauna(t: number, look: Look): void {
    const up = look.rain > 0.5 ? 0 : 1;
    for (let i = 0; i < 6; i++) {
      const flock = i < 3 ? 0 : 1;
      const R = flock ? 22 : 30;
      const w = flock ? -0.11 : 0.085;
      const a = t * w + i * (flock ? 0.2 : 0.16) + flock * 2.4;
      const cx = flock ? 30 : -6;
      const cz = flock ? -10 : 4;
      const x = cx + Math.cos(a) * R * 1.5 + (i % 2) * 2.2;
      const z = cz + Math.sin(a) * R * 0.8 + (i % 3) * 1.6;
      const y = 11.5 + Math.sin(t * 0.4 + i) * 1.2 + i * 0.35;
      const vx = -Math.sin(a) * R * 1.5 * w;
      const vz = Math.cos(a) * R * 0.8 * w;
      this.birds.setMatrixAt(i, matrixOf([x, y, z], [clamp(w * 3.2, -0.5, 0.5), -Math.atan2(vz, vx), 0.0], 0.9));
    }
    this.birds.instanceMatrix.needsUpdate = true;
    // the birds go where the fish are
    this.birds.count = Math.round(lerp(1, 6, smooth(0.14, 0.62, G.uEco.value)));
    this.birds.visible = up > 0;

    const on = smooth(0.3, 0.5, G.uEco.value);
    for (let i = 0; i < 3; i++) {
      const a = t * (0.055 + i * 0.012) + i * 2.1;
      const x = lerp(2, 30, (i * 0.5) % 1) + Math.cos(a) * (13 - i * 2);
      const z = [8, -18, 22][i] + Math.sin(a * 1.4) * 7;
      const vx = -Math.sin(a) * (13 - i * 2);
      const vz = Math.cos(a * 1.4) * 1.4 * 7;
      const sea = shoreAt(z) + 10;
      this.turtles.setMatrixAt(i, matrixOf([Math.max(x, sea), -0.62 + Math.sin(t * 0.8 + i) * 0.12, z], [0, -Math.atan2(vz, vx), Math.sin(t * 0.7 + i) * 0.1], 0.95 * on));
    }
    this.turtles.instanceMatrix.needsUpdate = true;
    this.turtles.visible = on > 0.02;
  }
}
