import * as THREE from 'three';
import type { ToonPair } from './gfx';

export interface Inst {
  m: THREE.Matrix4;
  color?: THREE.Color;
  /** phase, tint, kind, spare */
  i?: [number, number, number, number];
}

export function mesh(geo: THREE.BufferGeometry, pair: ToonPair, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, pair.material);
  if (cast) m.userData.depth = pair.depth;
  return m;
}

/** Adds an ink hull as a child so it follows the mesh around. */
export function inked(m: THREE.Mesh, ink: THREE.Material): THREE.Mesh {
  const o = new THREE.Mesh(m.geometry, ink);
  o.frustumCulled = m.frustumCulled;
  m.add(o);
  return m;
}

export function instanced(
  geo: THREE.BufferGeometry,
  pair: ToonPair,
  items: Inst[],
  opts: { cast?: boolean; ink?: THREE.Material; capacity?: number } = {}
): THREE.InstancedMesh {
  const cap = opts.capacity ?? items.length;
  const g = geo.clone();
  const data = new Float32Array(cap * 4);
  const im = new THREE.InstancedMesh(g, pair.material, cap);
  const white = new THREE.Color(1, 1, 1);
  items.forEach((it, k) => {
    im.setMatrixAt(k, it.m);
    im.setColorAt(k, it.color ?? white);
    if (it.i) data.set(it.i, k * 4);
  });
  if (items.length === 0) im.setColorAt(0, white);
  g.setAttribute('aInst', new THREE.InstancedBufferAttribute(data, 4));
  im.count = items.length;
  im.visible = items.length > 0;
  im.frustumCulled = false;
  if (opts.cast !== false) im.userData.depth = pair.depth;
  if (opts.ink) {
    const o = new THREE.InstancedMesh(g, opts.ink, cap);
    o.instanceMatrix = im.instanceMatrix;
    o.instanceColor = im.instanceColor;
    o.count = im.count;
    o.visible = items.length > 0;
    o.frustumCulled = false;
    im.add(o);
    im.userData.inkMesh = o;
  }
  return im;
}

export function setCount(im: THREE.InstancedMesh, n: number): void {
  im.count = n;
  im.visible = n > 0;
  const o = im.userData.inkMesh as THREE.InstancedMesh | undefined;
  if (o) {
    o.count = n;
    o.visible = n > 0;
  }
}
