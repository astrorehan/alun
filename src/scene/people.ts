import * as THREE from 'three';
import { Build, type Vec } from './build';
import type { ToonPair } from './gfx';
import { inked, mesh } from './kit';

export interface PersonLook {
  shirt: string;
  sarong: string;
  skin?: string;
  hat?: 'caping' | 'kerudung' | 'none' | 'peci';
  hatCol?: string;
  goggles?: boolean;
  moustache?: boolean;
  shorts?: boolean;
  camera?: boolean;
  ponytail?: boolean;
  scale?: number;
}

function personParts(o: PersonLook, hatDetail?: Build) {
  const body = new Build(1);
  const head = hatDetail ?? new Build(2);
  const arms = [new Build(3), new Build(4)];
  const forearms = [new Build(7), new Build(8)];
  const legs = [new Build(5), new Build(6)];
  const skin = o.skin ?? '#b97a50';
  const ink = '#30232a';
  for (const side of [-1, 1]) {
    const leg = legs[side < 0 ? 0 : 1];
    const x = side * 0.145;
    const step = side * 0.045;
    leg.ico(1, 0, { color: '#63452f', pos: [x, 0.068, step + 0.05], scale: [0.13, 0.071, 0.2] });
    leg.bar([x, 0.09, step], [x, o.shorts ? 0.57 : 0.24, 0], 0.074, 0.09, { color: skin, seg: 5 });
    if (o.shorts) leg.cyl(0.154, 0.14, 0.4, { color: o.sarong, pos: [x, 0.61, 0], seg: 7 });
  }
  if (!o.shorts) {
    body.profile([[0.19, 0.34, 0.25], [0.62, 0.32, 0.23], [0.86, 0.255, 0.19]], 8, { color: o.sarong, flat: true });
    // The woven hem and overlapping front flap follow the face of the wrap.
    body.cyl(0.34, 0.344, 0.046, { color: '#e9bd76', pos: [0, 0.26, 0], scale: [1, 1, 0.74], rot: [0, Math.PI / 8, 0], seg: 8, open: true });
    body.quad([-0.11, 0.21, 0.234], [0.025, 0.25, 0.234], [0.16, 0.78, 0.197], [0.055, 0.78, 0.197], { color: o.sarong, ao: 0.74 });
  }
  body.profile([[0.74, 0.3, 0.205], [0.94, 0.27, 0.2], [1.29, 0.35, 0.23], [1.39, 0.19, 0.16]], 8, { color: o.shirt });
  body.cyl(0.118, 0.13, 0.16, { color: skin, pos: [0, 1.42, 0], seg: 6 });
  for (const side of [-1, 1]) {
    const arm = arms[side < 0 ? 0 : 1];
    const elbow: Vec = [side * 0.405, 1.07, 0.035];
    const wrist: Vec = [side * 0.45, 0.89 + side * 0.04, 0.15 + side * 0.04];
    arm.bar([side * 0.232, 1.292, 0], elbow, 0.112, 0.102, { color: o.shirt, seg: 6 });
    const forearm = forearms[side < 0 ? 0 : 1];
    forearm.bar(elbow, wrist, 0.089, 0.064, { color: skin, seg: 6 });
    arm.bar(elbow, [side * 0.414, 1.037, 0.059], 0.106, 0.103, { color: '#ffe9b8', seg: 6 });
    forearm.ico(0.09, 0, { color: skin, pos: wrist, scale: [0.92, 1.22, 0.92] });
  }

  const accent = o.goggles ? '#d59a52' : o.shorts ? '#fff4d4' : '#f6ac52';
  if (o.goggles) {
    // Split leather tool apron with a brass buckle and a spanner in the hip pocket.
    body.quad([-0.26, 0.54, 0.235], [0.21, 0.58, 0.235], [0.19, 1.03, 0.214], [-0.2, 1.03, 0.214], { color: '#98532f' });
    body.box(0.55, 0.087, 0.39, { color: '#573349', pos: [0, 0.985, 0], r: 0 });
    body.box(0.097, 0.084, 0.035, { color: accent, pos: [0.04, 0.985, 0.22], r: 0 });
    body.bar([0.139, 0.72, 0.258], [0.215, 0.94, 0.263], 0.022, 0.024, { color: '#b0cdd1', seg: 4 });
    body.add(new THREE.TorusGeometry(0.04, 0.016, 3, 6, Math.PI * 1.55), { color: '#dce8dc', pos: [0.22, 0.96, 0.264], rot: [0, 0, 2.56] });
    body.box(0.14, 0.105, 0.028, { color: '#d58951', pos: [0.139, 0.725, 0.262], r: 0 });
  } else {
    // Wide collar panels and an offset camera or knotted neckerchief.
    for (const side of [-1, 1]) {
      const panel: Vec[] = [[0, 1.19, 0.224], [side * 0.19, 1.12, 0.205], [side * 0.229, 1.32, 0.181], [side * 0.093, 1.385, 0.148]];
      if (side < 0) panel.reverse();
      body.quad(panel[0], panel[1], panel[2], panel[3], { color: accent });
    }
    if (o.camera) {
      body.bar([-0.19, 1.32, 0.176], [0.09, 0.89, 0.225], 0.023, 0.023, { color: ink, seg: 4 });
      body.box(0.227, 0.144, 0.09, { color: '#214956', pos: [0.085, 0.91, 0.222], rot: [0, 0, -0.1], r: 0 });
      body.cyl(0.055, 0.062, 0.037, { color: '#9de4df', pos: [0.1, 0.91, 0.275], rot: [Math.PI / 2, 0, 0], seg: 7 });
    } else {
      body.quad([-0.032, 1.23, 0.23], [0.044, 1.012, 0.219], [0.129, 1.047, 0.215], [0.046, 1.246, 0.23], { color: accent });
      body.profile([[0.755, 0.311, 0.22], [0.831, 0.299, 0.216]], 8, { color: '#24515b' });
    }
  }
  const hood = o.hat === 'kerudung';
  const faceZ = hood ? 0.105 : 0.025;
  head.profile([[1.45, 0.115, 0.14], [1.55, 0.23, 0.225], [1.72, 0.286, 0.26],
    [1.84, 0.265, 0.244], [1.96, 0.14, 0.14]], 10, { color: skin, pos: [0, 0, faceZ] });
  for (const side of [-1, 1]) {
    const tilt: Vec = [Math.PI / 2, 0, -side * 0.27];
    head.cyl(0.052, 0.054, 0.023, { color: '#fff1ce', pos: [side * 0.11, 1.712, faceZ + 0.238], scale: [1, 1, 1.15], rot: tilt, seg: 8 });
    head.cyl(0.039, 0.039, 0.016, { color: '#382b37', pos: [side * 0.104, 1.71, faceZ + 0.255], scale: [1, 1, 1.23], rot: tilt, seg: 7 });
    head.ico(0.013, 0, { color: '#fffbe5', pos: [side * 0.105 - 0.009, 1.73, faceZ + 0.265] });
    if (o.moustache) head.ico(1, 0, { color: '#3b3032', pos: [side * 0.062, 1.62, faceZ + 0.242], scale: [0.081, 0.037, 0.037], rot: [0, 0, -side * 0.29] });
    head.bar([side * 0.071, 1.766, faceZ + 0.244], [side * 0.146, 1.773, faceZ + 0.214], 0.013, 0.009, { color: ink, seg: 4 });
  }
  head.ico(1, 0, { color: skin, pos: [0, 1.655, faceZ + 0.241], scale: [0.044, 0.054, 0.056] });
  head.quad([-0.056, 1.603, faceZ + 0.233], [0, 1.58, faceZ + 0.225], [0.056, 1.603, faceZ + 0.233], [0, 1.595, faceZ + 0.233], { color: '#874a38' });
  if (hood) {
    const cloth = o.hatCol ?? '#e8607a';
    head.profile([[1.49, 0.235, 0.21], [1.75, 0.328, 0.296], [1.91, 0.303, 0.29],
      [2.025, 0.19, 0.18], [2.05, 0.08, 0.09]], 10, { color: cloth, pos: [0, 0, -0.018] });
    body.profile([[1.22, 0.347, 0.25], [1.41, 0.268, 0.245], [1.62, 0.226, 0.18]], 8, { color: cloth, flat: true });
    body.quad([-0.205, 1.48, 0.192], [-0.064, 1.15, 0.242], [0.195, 1.4, 0.205], [0.16, 1.49, 0.2], { color: cloth, ao: 0.82 });
    if (o.goggles) {
      head.bar([-0.13, 1.93, 0.237], [0.13, 1.93, 0.237], 0.021, 0.021, { color: '#694838', seg: 5 });
      for (const side of [-1, 1]) {
        const rot: Vec = [1.28, 0, -side * 0.28];
        head.cyl(0.089, 0.092, 0.053, { color: '#ce9350', pos: [side * 0.123, 1.942, 0.221], rot, seg: 8 });
        head.cyl(0.066, 0.069, 0.015, { color: '#81d0e5', pos: [side * 0.128, 1.952, 0.25], rot, seg: 8, gloss: 0.8 });
      }
    }
  } else if (o.hat === 'caping') {
    head.profile([[1.81, 0.556, 0.55], [1.85, 0.578, 0.54], [2.025, 0.32, 0.3], [2.16, 0.057, 0.052]], 12,
      { color: '#b48346', top: '#f0d499', flat: true });
    head.profile([[1.85, 0.578, 0.54], [1.882, 0.543, 0.503]], 12, { color: '#bc753a' });
  } else if (o.hat === 'peci') {
    head.profile([[1.82, 0.289, 0.264], [1.89, 0.30, 0.265], [2.055, 0.269, 0.212]], 8, { color: '#20242c', top: '#414457', flat: true });
  } else {
    head.profile([[1.79, 0.287, 0.258], [1.9, 0.282, 0.26], [1.982, 0.16, 0.14]], 9, { color: ink, pos: [0, 0, 0.021] });
    if (o.ponytail) {
      head.ico(1, 1, { color: '#3a2933', pos: [0.17, 1.87, -0.26], scale: [0.16, 0.22, 0.17], rot: [-0.36, 0, -0.36] });
      head.cyl(0.289, 0.291, 0.042, { color: '#ef9961', pos: [0, 1.831, 0.025], scale: [1, 1, 0.94], seg: 9 });
    }
    head.ico(1, 0, { color: ink, pos: [-0.142, 1.816, 0.211], scale: [0.119, 0.054, 0.06], rot: [0, 0.2, 0.42] });
  }
  return { body, head, arms, forearms, legs };
}

// Model the joints once in their rest pose. Scenery bakes that pose into its boat mesh.
const neck: Vec = [0, 1.43, 0];
function joints(o: PersonLook, hatDetail?: Build) {
  const parts = personParts(o, hatDetail);
  const joint = (b: Build, pivot: Vec, sx: number, sy: number, sz: number) => ({
    geo: b.geo(true).translate(-pivot[0], -pivot[1], -pivot[2]).scale(sx, sy, sz),
    pivot: new THREE.Vector3(pivot[0] * 1.06, pivot[1] * 0.89, pivot[2]),
  });
  const limb = (b: Build, p: Vec) => joint(b, p, 1.06, 0.89, 1);
  return {
    body: limb(parts.body, [0, 0, 0]),
    head: joint(parts.head, neck, 1.36, 1.28, 1.27),
    arms: parts.arms.map((b, i) => limb(b, [i ? 0.232 : -0.232, 1.292, 0])),
    forearms: parts.forearms.map((b, i) => limb(b, [i ? 0.405 : -0.405, 1.07, 0.035])),
    legs: parts.legs.map((b, i) => limb(b, [i ? 0.145 : -0.145, 0.66, 0])),
  };
}

export function person(o: PersonLook): THREE.BufferGeometry {
  const j = joints(o);
  const b = new Build();
  for (const part of [j.body, j.head, ...j.arms, ...j.forearms, ...j.legs]) {
    b.merge(part.geo, new THREE.Matrix4().makeTranslation(part.pivot));
  }
  const s = o.scale ?? 1;
  return b.geo(true).scale(s, s, s);
}

export function movingPerson(o: PersonLook, pair: ToonPair, ink: THREE.Material, hatDetail?: Build) {
  const j = joints(o, hatDetail);
  const root = new THREE.Group();
  const attach = (part: typeof j.body) => {
    const m = inked(mesh(part.geo, pair), ink);
    m.position.copy(part.pivot);
    root.add(m);
    return m;
  };
  attach(j.body);
  root.scale.setScalar(o.scale ?? 1);
  const arms = j.arms.map(attach);
  const forearms = j.forearms.map((part, i) => {
    const forearm = attach(part);
    forearm.position.sub(arms[i].position);
    arms[i].add(forearm);
    return forearm;
  });
  return { root, head: attach(j.head), arms, forearms, legs: j.legs.map(attach) };
}

export type PersonRig = ReturnType<typeof movingPerson>;
