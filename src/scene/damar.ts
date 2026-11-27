import * as THREE from 'three';
import { WAITING_SPOT } from '../world';
import { bird } from './actors';
import { Build, matrixOf } from './build';
import type { Pose } from './director';
import { fishBasket } from './fleet';
import type { Fx } from './fx';
import { outlineMaterial, toon } from './gfx';
import { inked, instanced, mesh } from './kit';
import { movingPerson, type PersonRig } from './people';
import { clamp, lerp, rng, smooth, toX, toZ } from './space';
import { perahu, propPair } from './village';
import type { Water } from './water';

/**
 * Pak Damar's morning, in the opening: he sails out from the pier, finds fish where the gulls are diving
 * outside the reef, throws his net and hauls it in full. Then he stays out there, which is where the rest
 * of the film finds him: waiting outside a pier the tourists' rubbish has closed.
 *
 * All times are on the opening's own clock. His part of the film runs from DAMAR_AT for DAMAR_LEN seconds;
 * the opening cuts to it after the village and on to the reef after it.
 */

export const DAMAR_AT = 10;
export const DAMAR_LEN = 10;

/** The four shots: leaving the pier, looking for fish, the throw, hauling in. */
const SAIL_TO = 12.4;
const LOOK_TO = 14.8;
const CAST_TO = 17.4;
const END = DAMAR_AT + DAMAR_LEN;

/** The throw: wind-up, the net leaves his hands, it lands open on the water. */
const WIND_AT = 15.1;
const THROW_AT = 15.55;
const LAND_AT = 16.35;
/** Hauling: the line comes in, the net breaks the surface full, and goes over the side into the boat. */
const HAUL_FROM = 17.45;
const UP_AT = 18.85;
const IN_AT = 19.4;

export const DAMAR_CAPTIONS: { from: number; to: number; kicker: string; line: string }[] = [
  { from: 10.2, to: 12.3, kicker: 'PAK DAMAR MELAUT', line: 'Seperti setiap pagi, ia berangkat mencari ikan.' },
  { from: 12.5, to: 14.7, kicker: 'MENCARI IKAN', line: 'Camar menukik: di situ ikan berkumpul.' },
  { from: 14.9, to: 17.3, kicker: 'MENEBAR JALA', line: 'Sekali lempar, jala terbuka lebar.' },
  { from: 17.5, to: 19.9, kicker: 'TANGKAPAN PAGI', line: 'Laut yang bersih, ikan pun melimpah.' },
];

/** His boat: the same red perahu the story draws for him, at the same size. Bow points +X. */
const SCALE = 1.12;
const PIER = { x: -25.5, z: 11.5, yaw: Math.PI / 2 };
const WAIT = { x: toX(WAITING_SPOT.x), z: toZ(WAITING_SPOT.y), yaw: Math.PI };
/** Out at sea: where he comes about, where he stops, and where the fish are. */
const SEA_FROM = { x: 74.5, z: 2.7 };
const SEA = { x: 68.5, z: 2.4 };
/** He stands at the bow and throws to the boat's +Z side and a little forward. */
const BOW: [number, number, number] = [1.15, 0.36, 0];
const UP = new THREE.Vector3(0, 1, 0);
const CAST_DIR = new THREE.Vector2(-0.55, -0.83).normalize();
const CAST_DIST = 5.2;

/** Hermite through [t, x, z] keys, the tangents from the neighbours. */
function path(keys: number[][], t: number, out: THREE.Vector3): THREE.Vector3 {
  const n = keys.length;
  if (t <= keys[0][0]) return out.set(keys[0][1], 0, keys[0][2]);
  if (t >= keys[n - 1][0]) return out.set(keys[n - 1][1], 0, keys[n - 1][2]);
  let i = 0;
  while (i < n - 2 && t >= keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const h = b[0] - a[0];
  const u = (t - a[0]) / h;
  const slope = (j: number, d: number): number => {
    const p = keys[Math.max(0, j - 1)];
    const q = keys[Math.min(n - 1, j + 1)];
    return (q[d] - p[d]) / (q[0] - p[0]);
  };
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const v = (d: number): number => h00 * a[d] + h10 * h * slope(i, d) + h01 * b[d] + h11 * h * slope(i + 1, d);
  return out.set(v(1), 0, v(2));
}

/** Pushing off the pier and out towards the gap in the reef, picking up speed. */
const LEAVE = [
  [10.0, PIER.x, PIER.z],
  [10.9, PIER.x + 1.2, PIER.z - 1.0],
  [12.4, PIER.x + 7.6, PIER.z - 2.6],
];
/** Out at sea, coming about towards the gulls and slowing to a stop. */
const ARRIVE = [
  [SAIL_TO, SEA_FROM.x, SEA_FROM.z],
  [13.7, SEA.x + 1.6, SEA.z + 0.1],
  [LOOK_TO, SEA.x, SEA.z],
];
/**
 * After the catch, slowly in towards the reef gap where the story has him wait: south first, out of the
 * tourists' way (they come in along z 0 between 27 and 29 on the opening's clock), there by the time the
 * last shot hands him over to the story (DRIFTED_AT + DAMAR_LEN).
 */
const HOME_TO = 35;
const HOME = [
  [END, SEA.x, SEA.z],
  [25, SEA.x - 2.4, SEA.z + 6.8],
  [HOME_TO, WAIT.x, WAIT.z],
];

/* ================================================================== models */

/** A throw net, open: a shallow cone of twine with lead weights round the rim. Unit radius, centre up. */
function throwNet(): THREE.BufferGeometry {
  const b = new Build(61);
  const apex = 0.42;
  const yAt = (r: number): number => apex * Math.pow(1 - r, 1.25);
  const twine = '#efe3c4';
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const pts: [number, number, number][] = [0.02, 0.35, 0.7, 1].map((r) => [Math.cos(a) * r, yAt(r), Math.sin(a) * r]);
    b.tube(pts, () => 0.011, { color: twine, seg: 3, rings: 6 });
    b.ball(0.034, { color: '#3a3f46', pos: [Math.cos(a), -0.01, Math.sin(a)], seg: 5 });
  }
  for (const r of [0.3, 0.55, 0.78, 0.97]) {
    b.add(new THREE.TorusGeometry(r, 0.01, 3, 40), { color: twine, pos: [0, yAt(r), 0], rot: [Math.PI / 2, 0, 0] });
  }
  return b.geo();
}

/** A silvery fish of the open water, nose at +X. */
function silverFish(): THREE.BufferGeometry {
  const b = new Build(63);
  const c = new THREE.Color();
  const belly = new THREE.Color('#f4fbff');
  const back = new THREE.Color('#5f8fb0');
  b.ball(0.5, { color: (p) => c.set('#c9dde8').lerp(belly, smooth(0.0, -0.2, p.y)).lerp(back, smooth(0.08, 0.22, p.y)), scale: [1, 0.36, 0.22], seg: 8, gloss: 0.8 });
  b.quad([-0.42, 0, 0], [-0.85, 0.26, 0], [-0.72, 0, 0], [-0.85, -0.26, 0], { color: '#8fb3c8' });
  b.ball(0.05, { color: '#15202c', pos: [0.3, 0.04, 0.09], seg: 5 });
  b.ball(0.05, { color: '#15202c', pos: [0.3, 0.04, -0.09], seg: 5 });
  return b.geo();
}

/* ================================================================== the scene */

interface Jump {
  at: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
  h: number;
  dur: number;
  splashed: boolean;
}

export interface DamarHooks {
  sound?: (kind: 'splash' | 'throw' | 'gull', strength: number) => void;
}

export class Damar {
  readonly group = new THREE.Group();
  private boat = new THREE.Group();
  private rig: PersonRig;
  private net: THREE.Mesh;
  private line: THREE.Mesh;
  private basket: THREE.Mesh;
  private fish: THREE.Mesh[] = [];
  private gulls: THREE.InstancedMesh;
  private hooks: DamarHooks = {};
  private jumps: Jump[] = [];
  private r = rng(777);
  private said = new Set<string>();
  private splashed = false;
  private hauledOut = false;

  private p = new THREE.Vector3();
  private q = new THREE.Vector3();
  private v = new THREE.Vector3();
  private hand = new THREE.Vector3();
  private d = new THREE.Vector3();
  private heading = 0;
  private m = new THREE.Matrix4();

  constructor(
    private water: Water,
    private fx: Fx
  ) {
    const pair = propPair(THREE.DoubleSide, false);
    const ink = outlineMaterial(1.7, '#15202c');
    const hull = inked(mesh(perahu('#d8342c', '#f2b62c', '#e8342f', false), pair), ink);
    hull.frustumCulled = false;
    this.boat.add(hull);

    this.rig = movingPerson({ shirt: '#38669d', sarong: '#2f4f7a', hat: 'caping', moustache: true, scale: 0.92 }, pair, outlineMaterial(1.1, '#33190f'));
    this.rig.root.frustumCulled = false;
    this.rig.root.rotation.order = 'YXZ';
    this.boat.add(this.rig.root);

    this.basket = inked(mesh(fishBasket(), pair), ink);
    this.basket.scale.setScalar(0.42);
    this.basket.position.set(-0.45, 0.12, 0.1);
    this.basket.visible = false;
    this.boat.add(this.basket);

    this.boat.scale.setScalar(SCALE);
    this.group.add(this.boat);

    // the net and its line live in the world, not on the boat: they fly
    this.net = mesh(throwNet(), pair);
    this.net.frustumCulled = false;
    this.group.add(this.net);
    this.line = mesh(new Build(65).cyl(1, 1, 1, { color: '#d8c79e', seg: 4, open: true }).geo(), pair);
    this.line.frustumCulled = false;
    this.group.add(this.line);

    const fishGeo = silverFish();
    for (let i = 0; i < 10; i++) {
      const f = mesh(fishGeo, pair);
      f.frustumCulled = false;
      f.visible = false;
      this.fish.push(f);
      this.group.add(f);
    }

    const gpair = toon({
      side: THREE.DoubleSide,
      vLocal: 'float fl = sin(uTime * 7.5 + aInst.x * 6.28) * (.45 + .55 * smoothstep(-.2, .6, sin(uTime * .9 + aInst.x * 20.))); p.y += fl * aFx.y * aFx.y * .34 + aFx.y * .1; p.z *= 1. - abs(fl) * .08;',
    });
    this.gulls = instanced(bird(), gpair, Array.from({ length: 4 }, (_, i) => ({ m: new THREE.Matrix4(), i: [i * 0.27, 0, 0, 0] as [number, number, number, number] })));
    this.group.add(this.gulls);
    this.group.visible = false;
  }

  begin(hooks: DamarHooks): void {
    this.hooks = hooks;
    this.r = rng(777);
    this.said.clear();
    this.splashed = false;
    this.hauledOut = false;
    this.jumps = [];
    this.basket.visible = false;
    this.group.visible = true;
  }

  end(): void {
    this.hooks = {};
    this.group.visible = false;
  }

  /** Where the net comes down, in the world. */
  private landing(out: THREE.Vector3): THREE.Vector3 {
    const by = this.bowWorld(this.q);
    return out.set(by.x + CAST_DIR.x * CAST_DIST, 0, by.z + CAST_DIR.y * CAST_DIST);
  }

  /** Where he stands at the bow, in the world, with the boat stopped at sea. */
  private bowWorld(out: THREE.Vector3): THREE.Vector3 {
    // stopped at sea the boat faces west (yaw = PI), so its +X runs to -X in the world
    return out.set(SEA.x - BOW[0] * SCALE, 0, SEA.z);
  }

  /** The boat's place and heading on the opening's clock. */
  private place(t: number, out: THREE.Vector3): number {
    if (t < DAMAR_AT) {
      out.set(PIER.x, 0, PIER.z);
      return PIER.yaw;
    }
    if (t < SAIL_TO) {
      path(LEAVE, t, out);
      path(LEAVE, t + 0.08, this.v);
      const want = Math.atan2(-(this.v.z - out.z), this.v.x - out.x);
      const k = smooth(DAMAR_AT, DAMAR_AT + 1.4, t);
      return lerp(PIER.yaw, want, k);
    }
    if (t < END) {
      path(ARRIVE, t, out);
      // coming about from running out to facing the gulls
      return lerp(Math.PI - 0.35, Math.PI, smooth(SAIL_TO, LOOK_TO, t));
    }
    path(HOME, t, out);
    if (t >= HOME_TO) return WAIT.yaw;
    // along the way, then round to face the gap as he comes to rest
    path(HOME, t + 0.1, this.v);
    const along = Math.atan2(-(this.v.z - out.z), this.v.x - out.x);
    const d = along - Math.PI;
    const yaw = Math.PI + Math.atan2(Math.sin(d), Math.cos(d)) * smooth(END, END + 1.5, t);
    return lerp(yaw, WAIT.yaw, smooth(HOME_TO - 2.5, HOME_TO, t));
  }

  /** On the opening's clock. `cam` is where the camera is, for the sounds' sake. */
  update(t: number, dt: number, time: number, swell: number, hidden: boolean): void {
    this.group.visible = !hidden;
    if (hidden) return;
    const yaw = this.place(t, this.p);
    this.heading = yaw;
    const wh = this.water.heightAt(this.p.x, this.p.z, time, swell);
    const sailing = (t >= DAMAR_AT && t < SAIL_TO) || (t >= SAIL_TO && t < LOOK_TO);
    this.boat.position.set(this.p.x, 0.16 + wh * 0.7 + Math.sin(time * 1.6) * 0.04, this.p.z);
    // a pull on the boat as the net goes, and as it comes in heavy
    const tug = smooth(THROW_AT - 0.05, THROW_AT + 0.15, t) * (1 - smooth(THROW_AT + 0.2, THROW_AT + 0.9, t)) - 0.6 * smooth(UP_AT - 0.4, UP_AT, t) * (1 - smooth(IN_AT, IN_AT + 0.6, t));
    this.boat.rotation.set(Math.sin(time * 1.25) * 0.035 + tug * 0.09, yaw, Math.sin(time * 1.05 + 1) * 0.025 + (sailing ? 0.03 : 0), 'YXZ');
    this.boat.updateMatrixWorld(true);
    if (sailing) this.wake(t, dt);

    this.pose(t, time);
    this.boat.updateMatrixWorld(true);
    this.netAndLine(t, time, swell);
    this.boil(t, time, swell);
    this.birds(t, time);
    this.catchOf(t, time);
    this.basket.visible = t >= IN_AT;

    // the odd sound
    this.say('push', t >= DAMAR_AT + 0.1, () => this.hooks.sound?.('splash', 0.35));
    this.say('gull1', t >= SAIL_TO + 0.25, () => this.hooks.sound?.('gull', 1));
    this.say('gull2', t >= 13.9, () => this.hooks.sound?.('gull', 1));
    this.say('throw', t >= THROW_AT, () => this.hooks.sound?.('throw', 1));
    this.say('land', t >= LAND_AT, () => this.hooks.sound?.('splash', 0.85));
    this.say('up', t >= UP_AT, () => this.hooks.sound?.('splash', 0.6));
    this.say('gull3', t >= IN_AT + 0.2, () => this.hooks.sound?.('gull', 0.8));
  }

  private say(key: string, when: boolean, fn: () => void): void {
    if (!when || this.said.has(key)) return;
    this.said.add(key);
    // a film that was jumped into does not fire everything it passed at once
    fn();
  }

  private wakeAcc = 0;
  private wake(t: number, dt: number): void {
    const x = this.boat.position.x;
    const z = this.boat.position.z;
    const hx = Math.cos(this.heading);
    const hz = -Math.sin(this.heading);
    this.wakeAcc += dt * 9;
    while (this.wakeAcc > 1) {
      this.wakeAcc -= 1;
      const s = this.r() < 0.5 ? -1 : 1;
      this.water.splash({ x: x - hx * 2.6 + hz * s * 0.5, z: z - hz * 2.6 - hx * s * 0.5, radius: 0.7, foam: 0.5, impulse: 0.25 });
    }
    if (t < DAMAR_AT + 0.6) this.water.splash({ x: x + hz * 0.9, z: z - hx * 0.9, radius: 1.1, foam: 0.5, impulse: 0.3 });
  }

  /* ---------------------------------------------------------------- Pak Damar */

  private aim(k: 0 | 1, x: number, z: number, fore = -0.32): void {
    this.rig.arms[k].rotation.set(x, 0, z);
    this.rig.forearms[k].rotation.set(fore, 0, 0);
  }

  private pose(t: number, time: number): void {
    const { root, head } = this.rig;
    // he works from the bow, ahead of the mast and clear of the sail
    const at = BOW;
    let face = Math.PI / 2;
    let lean = Math.sin(time * 1.2) * 0.025;
    let twist = 0;
    head.rotation.set(-0.04, Math.sin(time * 0.6) * 0.18, 0);
    const sw = Math.sin(time * 1.4) * 0.08;
    this.aim(0, -0.2 + sw, -0.1);
    this.aim(1, -0.2 - sw, 0.1);

    if (t < DAMAR_AT) {
      // at the pier, coiling a line into the boat
      face = Math.PI * 0.85;
      const c = Math.sin(time * 3.2);
      this.aim(0, -0.75 + c * 0.25, -0.1, -0.9);
      this.aim(1, -0.75 - c * 0.25, 0.1, -0.9);
      head.rotation.x = 0.25;
    } else if (t < SAIL_TO) {
      // under way: a hand on the sheet, the other waving back to the village
      face = Math.PI / 2;
      twist = -0.5;
      this.aim(0, -0.55, -0.15, -0.7);
      const w = smooth(DAMAR_AT + 0.3, DAMAR_AT + 0.8, t) * (1 - smooth(SAIL_TO - 0.6, SAIL_TO - 0.1, t));
      this.aim(1, lerp(-0.2, -2.75, w), lerp(0.1, 0.35 + Math.sin(time * 9) * 0.3, w), lerp(-0.32, -0.25, w));
      head.rotation.y = lerp(0, -0.9, w);
    } else if (t < LOOK_TO) {
      // scanning the water, then there: an arm straight out at the diving gulls
      face = this.toward();
      const point = smooth(SAIL_TO + 0.5, SAIL_TO + 0.9, t);
      // the rig's upper arms hang outward; turning them in about z first makes the point run forward
      this.aim(0, lerp(-0.25, -1.85 + Math.sin(time * 1.7) * 0.06, point), lerp(-0.1, 0.62, point), lerp(-0.32, -0.06, point));
      this.aim(1, -0.15, 0.15);
      head.rotation.set(lerp(-0.05, -0.18, point), lerp(Math.sin(time * 1.3) * 0.45, 0, point), 0);
    } else if (t < CAST_TO) {
      face = this.toward();
      const wind = smooth(WIND_AT - 0.3, THROW_AT - 0.08, t) * (1 - smooth(THROW_AT - 0.08, THROW_AT, t));
      const go = smooth(THROW_AT - 0.1, THROW_AT + 0.08, t) * (1 - smooth(THROW_AT + 0.45, THROW_AT + 1.2, t));
      const after = smooth(THROW_AT + 0.6, THROW_AT + 1.2, t);
      // the net held low in both hands, swung back and round, and let go high
      const x = lerp(lerp(-0.7, 0.55, wind), -2.05, go);
      this.aim(0, lerp(x, -0.55, after), -0.25 + wind * 0.35, -0.5);
      this.aim(1, lerp(x + 0.1, -0.2, after), 0.25 + wind * 0.2, -0.5);
      twist = 0.8 * wind - 0.45 * go;
      lean = -0.18 * wind + 0.25 * go * (1 - after);
      head.rotation.x = 0.1 * after;
    } else if (t < END) {
      face = this.toward();
      if (t < UP_AT) {
        // hand over hand
        const c = Math.sin((t - HAUL_FROM) * 7.5);
        this.aim(0, -1.0 + c * 0.55, -0.15, -0.7 - c * 0.3);
        this.aim(1, -1.0 - c * 0.55, 0.15, -0.7 + c * 0.3);
        lean = -0.14 + c * 0.04;
      } else if (t < IN_AT + 0.25) {
        // and up and over the side with it
        const u = smooth(UP_AT - 0.1, IN_AT, t);
        this.aim(0, lerp(-1.3, -2.4, u), -0.2, -0.4);
        this.aim(1, lerp(-1.3, -2.4, u), 0.2, -0.4);
        lean = lerp(-0.2, -0.05, u);
        twist = lerp(0, -0.9, smooth(UP_AT + 0.2, IN_AT + 0.2, t));
      } else {
        // a good catch
        const j = smooth(IN_AT + 0.25, IN_AT + 0.55, t);
        this.aim(1, lerp(-0.2, -2.8, j), 0.3 + Math.sin(time * 10) * 0.18 * j, -0.3);
        head.rotation.x = -0.15 * j;
      }
    } else {
      // home towards the gap, steering
      this.aim(0, -0.55, -0.15, -0.7);
    }

    root.position.set(at[0], at[1] + Math.abs(Math.sin(time * 2.2)) * 0.012, at[2]);
    root.rotation.set(lean, face + twist, 0, 'YXZ');
  }

  /** His facing in the boat's space, towards where the net goes. */
  private toward(): number {
    // stopped, the boat faces west (yaw PI), which takes a world direction (x, z) to (-x, -z) in its
    // own space; a person at yaw 0 faces +Z, and yaw turns +Z to (sin, cos)
    return Math.atan2(-CAST_DIR.x, -CAST_DIR.y);
  }

  /** His right wrist, in the world (the rig's forearm runs from the elbow to it). */
  private handAt(out: THREE.Vector3): THREE.Vector3 {
    const f = this.rig.forearms[0];
    f.updateWorldMatrix(true, false);
    return out.set(-0.048, -0.196, 0.075).applyMatrix4(f.matrixWorld);
  }

  /* ---------------------------------------------------------------- the net */

  private netAndLine(t: number, time: number, swell: number): void {
    const net = this.net;
    const L = this.landing(this.q);
    const hand = this.handAt(this.hand);
    let show = t >= LOOK_TO && t < IN_AT;
    let r = 0.2;
    let h = 3.0;
    let x = hand.x;
    let y = hand.y;
    let z = hand.z;
    let spin = 0;
    if (t < THROW_AT) {
      // gathered, hanging from his hands
      y = hand.y - 0.42 * h;
    } else if (t < LAND_AT) {
      const u = (t - THROW_AT) / (LAND_AT - THROW_AT);
      const open = 1 - Math.pow(1 - u, 2.2);
      r = lerp(0.2, 2.4, open);
      h = lerp(3.0, 0.55, open);
      x = lerp(hand.x, L.x, u);
      z = lerp(hand.z, L.z, u);
      const wh = this.water.heightAt(L.x, L.z, time, swell);
      y = lerp(hand.y, wh + 0.05, u) + 4 * u * (1 - u) * 2.1 - 0.42 * h;
      spin = u * 1.3;
    } else if (t < HAUL_FROM) {
      // spread on the water, settling and sinking
      const u = smooth(LAND_AT, HAUL_FROM, t);
      r = 2.4;
      h = lerp(0.55, 0.12, smooth(0, 0.3, u));
      x = L.x;
      z = L.z;
      y = this.water.heightAt(L.x, L.z, time, swell) + lerp(0.02, -0.35, u) - 0.42 * h;
      spin = 1.3;
      if (!this.splashed) {
        this.splashed = true;
        this.water.splash({ x: L.x, z: L.z, radius: 2.6, foam: 1, impulse: 1.3 });
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          this.fx.spray(L.x + Math.cos(a) * 2.3, 0.2, L.z + Math.sin(a) * 2.3, Math.cos(a) * 1.2, 1.4 + this.r(), Math.sin(a) * 1.2, 0.09, 0.6, 0);
        }
      }
    } else {
      // drawn in closed and full, out of the water and up over the side
      const side = this.sideOut(this.v);
      const u = smooth(HAUL_FROM, UP_AT, t);
      r = lerp(2.4, 0.55, smooth(0, 0.5, u));
      h = lerp(0.12, 2.3, smooth(0.2, 1, u));
      const wh = this.water.heightAt(side.x, side.z, time, swell);
      x = lerp(L.x, side.x, u);
      z = lerp(L.z, side.z, u);
      y = lerp(wh - 0.5, wh - 0.4, u) + 1.0 * smooth(0.8, 1, u);
      if (t >= UP_AT) {
        const k = smooth(UP_AT, IN_AT, t);
        x = lerp(side.x, hand.x, k);
        z = lerp(side.z, hand.z, k);
        y = lerp(wh + 0.6, hand.y - 0.42 * h + 0.2, k) + Math.sin(k * Math.PI) * 0.7;
        if (!this.hauledOut) {
          this.hauledOut = true;
          this.water.splash({ x: side.x, z: side.z, radius: 1.4, foam: 1, impulse: 1.0 });
          for (let i = 0; i < 12; i++) this.fx.spray(side.x, wh + 0.4, side.z, (this.r() - 0.5) * 2, 1.5 + this.r() * 1.5, (this.r() - 0.5) * 2, 0.08, 0.7, 0);
        }
        // water running off it
        if (this.r() < 0.5) this.fx.spray(x + (this.r() - 0.5) * 0.6, y + 0.2, z + (this.r() - 0.5) * 0.6, 0, -0.5, 0, 0.06, 0.4, 0);
      }
      spin = 1.3 + u * 0.6;
    }
    net.visible = show;
    if (show) {
      net.position.set(x, y, z);
      net.rotation.set(0, spin, 0);
      net.scale.set(r, h, r);
    }

    // the line from his hand to the top of the net
    show = show && t >= THROW_AT - 0.05;
    this.line.visible = show;
    if (show) {
      const top = this.v.set(x, y + 0.42 * h, z);
      const dx = top.x - hand.x;
      const dy = top.y - hand.y;
      const dz = top.z - hand.z;
      const len = Math.max(0.01, Math.hypot(dx, dy, dz));
      this.line.position.set((hand.x + top.x) / 2, (hand.y + top.y) / 2, (hand.z + top.z) / 2);
      this.line.quaternion.setFromUnitVectors(UP, this.d.set(dx / len, dy / len, dz / len));
      this.line.scale.set(0.022, len, 0.022);
    }
  }

  /** Just outside the outrigger on the side he throws to: where the net comes up. */
  private sideOut(out: THREE.Vector3): THREE.Vector3 {
    const b = this.bowWorld(out);
    return out.set(b.x + CAST_DIR.x * 2.3, 0, b.z + CAST_DIR.y * 2.3);
  }

  /* ---------------------------------------------------------------- fish and birds */

  /** Little fish breaking the surface where the gulls are, until the net comes down on them. */
  private boil(t: number, time: number, swell: number): void {
    const on = t >= SAIL_TO && t < LAND_AT + 0.15;
    const L = this.landing(this.q);
    if (on && this.jumps.length < 6 && this.r() < 0.35) {
      const a = this.r() * Math.PI * 2;
      const d = Math.sqrt(this.r()) * 1.9;
      const b = this.r() * Math.PI * 2;
      this.jumps.push({ at: t, x: L.x + Math.cos(a) * d, z: L.z + Math.sin(a) * d, dx: Math.cos(b), dz: Math.sin(b), h: lerp(0.5, 1.1, this.r()), dur: lerp(0.35, 0.55, this.r()), splashed: false });
    }
    let used = 0;
    for (let i = this.jumps.length - 1; i >= 0; i--) {
      const j = this.jumps[i];
      const u = (t - j.at) / j.dur;
      if (u >= 1 || u < 0 || !on) {
        if (u >= 1) this.water.splash({ x: j.x + j.dx * 0.7, z: j.z + j.dz * 0.7, radius: 0.45, foam: 0.8, impulse: 0.35 });
        this.jumps.splice(i, 1);
        continue;
      }
      if (!j.splashed) {
        j.splashed = true;
        this.water.splash({ x: j.x, z: j.z, radius: 0.45, foam: 0.8, impulse: 0.3 });
        this.fx.spray(j.x, 0.2, j.z, j.dx, 1.6, j.dz, 0.06, 0.5, 0);
      }
      if (used >= 6) continue;
      const f = this.fish[used++];
      const wh = this.water.heightAt(j.x, j.z, time, swell);
      f.visible = true;
      f.position.set(j.x + j.dx * 0.7 * u, wh + 4 * u * (1 - u) * j.h, j.z + j.dz * 0.7 * u);
      f.rotation.set(0, -Math.atan2(j.dz, j.dx), lerp(0.9, -0.9, u), 'YXZ');
      f.scale.setScalar(0.42);
    }
    // the rest of the fish are the catch's, or nobody's
    if (t < HAUL_FROM) for (let i = used; i < this.fish.length; i++) this.fish[i].visible = false;
  }

  /** The catch: silver in the net as it comes up, flapping, gone into the basket once aboard. */
  private catchOf(t: number, time: number): void {
    if (t < HAUL_FROM) return;
    const on = t >= UP_AT - 0.35 && t < IN_AT;
    const net = this.net;
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      f.visible = on && net.visible;
      if (!f.visible) continue;
      const a = i * 2.39 + Math.sin(time * 9 + i) * 0.2;
      const rr = net.scale.x * lerp(0.35, 0.8, (i % 4) / 3);
      const yy = net.position.y + net.scale.y * 0.42 * lerp(0.05, 0.45, ((i * 7) % 10) / 10);
      f.position.set(net.position.x + Math.cos(a) * rr, yy, net.position.z + Math.sin(a) * rr);
      f.rotation.set(Math.sin(time * 14 + i * 1.7) * 0.7, a + Math.PI / 2, Math.sin(time * 11 + i) * 0.5, 'YXZ');
      f.scale.setScalar(0.4);
    }
  }

  private birds(t: number, time: number): void {
    const on = t >= SAIL_TO - 0.2 && t < CAST_TO;
    this.gulls.visible = on;
    if (!on) return;
    const L = this.landing(this.q);
    // they scatter when the net comes down
    const scatter = smooth(LAND_AT - 0.2, LAND_AT + 0.8, t);
    for (let i = 0; i < 4; i++) {
      const w = (i % 2 ? -1 : 1) * (0.9 + i * 0.12);
      const a = time * w + i * 1.6;
      const R = 2.2 + i * 0.55 + scatter * 9;
      // now and then one folds up and drops at the water
      const dive = Math.max(0, Math.sin(time * 0.9 + i * 1.9)) ** 8 * (1 - scatter);
      const x = L.x + Math.cos(a) * R;
      const z = L.z + Math.sin(a) * R;
      const y = lerp(4.2 + i * 0.6, 0.8, dive) + scatter * 4;
      const vx = -Math.sin(a) * w;
      const vz = Math.cos(a) * w;
      this.m.copy(matrixOf([x, y, z], [clamp(-w * 0.45, -0.5, 0.5), -Math.atan2(vz, vx), -dive * 0.9], 0.85));
      this.gulls.setMatrixAt(i, this.m);
    }
    this.gulls.instanceMatrix.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- the camera */

  /** One pose per frame for his part of the film. */
  shoot(t: number, out: Pose): void {
    const B = this.boat.position;
    const hx = Math.cos(this.heading);
    const hz = -Math.sin(this.heading);
    // the boat's +Z, in the world
    const sx = Math.sin(this.heading);
    const sz = Math.cos(this.heading);
    if (t < SAIL_TO) {
      // ahead of him and to the south, falling back as he comes on: the village behind him
      const u = smooth(DAMAR_AT, SAIL_TO, t);
      out.pos.set(B.x + lerp(9.5, 7.6, u), lerp(3.6, 3.1, u), B.z + lerp(3.0, 2.0, u));
      out.look.set(B.x - 1.8, 1.2, B.z + 0.3);
      out.fov = 40;
    } else if (t < LOOK_TO) {
      // off his left side and a little ahead, clear of the sail: his hand at his brow, the gulls beyond him
      const u = smooth(SAIL_TO, LOOK_TO, t);
      const bx = B.x + hx * BOW[0] * SCALE;
      const bz = B.z + hz * BOW[0] * SCALE;
      const ox = -CAST_DIR.y;
      const oz = CAST_DIR.x;
      const off = lerp(7.4, 6.6, u);
      out.pos.set(bx + ox * off + CAST_DIR.x * 1.4, lerp(4.0, 3.6, u), bz + oz * off + CAST_DIR.y * 1.4);
      out.look.set(bx + CAST_DIR.x * 2.4, 1.9, bz + CAST_DIR.y * 2.4);
      out.fov = 42;
    } else if (t < CAST_TO) {
      // from the other side, high enough that the open sea stays out of the top of the frame
      const u = smooth(LOOK_TO, CAST_TO, t);
      const L = this.landing(this.q);
      const mx = (B.x + L.x) / 2;
      const mz = (B.z + L.z) / 2;
      out.pos.set(B.x - sx * 7.4 + hx * 2.2, lerp(5.6, 5.2, u), B.z - sz * 7.4 + hz * 2.2);
      out.look.set(lerp(B.x, mx, 0.6), 0.9, lerp(B.z, mz, 0.6));
      out.fov = 42;
    } else {
      // close in as it comes up full, looking down on the boat
      const u = smooth(CAST_TO, END, t);
      const S = this.sideOut(this.q);
      out.pos.set(S.x + sx * 2.5 - hx * lerp(4.6, 4.0, u), lerp(4.7, 4.3, u), S.z + sz * 2.5 - hz * lerp(4.6, 4.0, u));
      out.look.set(lerp(S.x, B.x, 0.45), 1.3, lerp(S.z, B.z, 0.45));
      out.fov = 40;
    }
  }

}
