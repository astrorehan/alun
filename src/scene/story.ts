import * as THREE from 'three';
import type { GameSimulation } from '../simulation';
import { BoatJob } from '../story/jobs';
import { PIRATE_SIGNAL_RADIUS, pirateKind } from '../story/state';
import { PIRATE_KIND, type Entity, type PirateKind } from '../types';
import { COLLECTOR_NET, DOLPHIN_SPOT, DUMP_SPOT, MOORING, PIER_END, SPAWNING_GROUND, WAITING_SPOT } from '../world';
import { Build, hex } from './build';
import {
  arc,
  beacon,
  beaconLamp,
  corkFloat,
  deposit,
  DERRICK,
  drum,
  drumShip,
  dumperShip,
  fishBasket,
  guard,
  heavyRaider,
  mooring,
  pad,
  raider,
  shieldShip,
  signalShip,
  rammerShip,
  tugShip,
  cargoBarge,
  salvageBundle,
  skiff,
  smallFish,
  tideCoil,
  toolbox,
  trawlFloat,
  trawlShip,
} from './fleet';
import type { Fx } from './fx';
import { G, GLSL_CACHED_UNDERWATER, GLSL_UNDERWATER_END, outlineMaterial, toon } from './gfx';
import { inked, instanced, mesh, setCount, type Inst } from './kit';
import type { Look } from './look';
import { dolphin, swimSkin, type Rescue } from './rescue';
import { clamp, groundAt, lerp, netRadii, rng, smooth, toX, toZ, UNIT } from './space';
import { MODE, SP } from './sprites';
import { propPair } from './village';
import type { Water } from './water';

/**
 * What the story puts in the lagoon, as one layer over the scene: the tool chest and its rope, the
 * ships and their gear, the pads and drums, the pier's cargo, the beacon, the dolphins and the
 * fish. Everything is read from the simulation each frame, nothing is kept that a save would need.
 */

const UP = new THREE.Vector3(0, 1, 0);
const DECK = 1.17;

/** Where things stand on the pier, in world units. */
const BASKETS: [number, number][] = [
  [-28.75, 12.15],
  [-28.75, 9.95],
];
const CHEST_HOME: [number, number] = [-30.75, 10.15];
const COIL_HOME: [number, number] = [-33.4, 11.55];
const GUARDS: [number, number, number][] = [
  [-35.2, 9.95, 1.5],
  [-40.5, 13.0, 1.1],
];
const BEACON: [number, number] = [-41.0, 7.5];

interface Spot {
  x: number;
  z: number;
  yaw: number;
}
/** Along the outer edge of the landing stage, and the anchorage south of it. */
const HEADS: Spot[] = [
  { x: -25.5, z: 11.5, yaw: Math.PI / 2 },
  { x: -25.1, z: 17.6, yaw: Math.PI / 2 - 0.1 },
];
const BERTH: Spot = { x: -33.2, z: 19.6, yaw: 0.2 };
const CORNER: Spot = { x: -24.0, z: 18.9, yaw: 0 };
const OFFSHORE: Spot = { x: 70, z: 7.2, yaw: 0 };
const WAIT: Spot = { x: toX(WAITING_SPOT.x), z: toZ(WAITING_SPOT.y), yaw: Math.PI };

const PIRATE_HULLS = {
  [PIRATE_KIND.raider]: { piece: 'raider', geometry: raider, scale: 1 },
  [PIRATE_KIND.skiff]: { piece: 'skiff', geometry: skiff, scale: 0.89 },
  [PIRATE_KIND.heavy]: { piece: 'heavy', geometry: heavyRaider, scale: 1.21 },
  [PIRATE_KIND.shield]: { piece: 'shield', geometry: shieldShip, scale: 1.03 },
  [PIRATE_KIND.dumper]: { piece: 'dumper', geometry: dumperShip, scale: 1.05 },
  [PIRATE_KIND.rammer]: { piece: 'rammer', geometry: rammerShip, scale: 1 },
  [PIRATE_KIND.tug]: { piece: 'tug', geometry: tugShip, scale: 1.04 },
  [PIRATE_KIND.signal]: { piece: 'signal', geometry: signalShip, scale: 1.02 },
} as const;

type ShipPiece = (typeof PIRATE_HULLS)[PirateKind]['piece'] | 'pukat' | 'drumship';
type Piece =
  | ShipPiece
  | 'barge'
  | 'bundle'
  | 'float'
  | 'cork'
  | 'drum'
  | 'pad'
  | 'box'
  | 'basket'
  | 'coil'
  | 'deposit'
  | 'guard';

interface Batch {
  im: THREE.InstancedMesh;
  data: THREE.InstancedBufferAttribute;
  n: number;
}

/** A fishing boat that is not in the simulation right now: waiting outside, at the pier, at anchor. */
export interface Guest {
  variant: number;
  x: number;
  z: number;
  yaw: number;
}

interface Moored extends Guest {
  placed: boolean;
}

/** A film borrows the boat and the dolphins. */
export interface StoryFilm {
  boat: Spot | null;
  pod: { x: number; z: number; yaw: number; leap: number } | null;
}

interface PutOpts {
  phase?: number;
  flash?: number;
  roll?: number;
  pitch?: number;
  /** 0 stays upright, 1 lies with the water. */
  tilt?: number;
  tint?: THREE.Color;
}

const WHITE = new THREE.Color(1, 1, 1);
const ROPE = hex('#e8d3a0');
const ROPE_DARK = hex('#6f5a3c');
const TRAWL = hex('#3fae7a');
const BAMBOO = hex('#d7bb72');
const FOAM_ARROW = hex('#a1fff2');
const RAM_WAKE = hex('#ffb677');
const TOW_STRAIN = hex('#ff9c54');
const CHAIN = hex('#5a1a1a');
const OILED = hex('#57496a');
const CLOSED = hex('#b8302a');

const FISH_SCHOOL = 34;
const FISH_PIER = 22;
const FISH_TRAIL = 12;

export class StoryLayer {
  readonly staticGroup = new THREE.Group();
  readonly group = new THREE.Group();
  readonly underGroup = new THREE.Group();
  readonly lamps: { p: THREE.Vector3; r: number; c: THREE.Vector3 }[] = [];
  /** For the actors to draw with the other boats. */
  readonly guests: Guest[] = [];
  /** The title, and the first morning of the opening: none of this has happened yet. */
  veiled = false;
  /** Set while a film moves the boat and the dolphins itself. */
  film: StoryFilm | null = null;
  onCheer: (() => void) | null = null;
  /** Where each raider was drawn this frame, by entity id, for the crew that rides it. */
  readonly raiders = new Map<number, THREE.Matrix4>();
  private raiderPool: THREE.Matrix4[] = [];

  private batch = {} as Record<Piece, Batch>;
  private ropes: THREE.InstancedMesh;
  private ropeN = 0;
  private fish: THREE.InstancedMesh;
  private fishMat: THREE.ShaderMaterial;
  private fishN = 0;
  private lampMesh: THREE.Mesh;
  private lampAt: THREE.Vector3;
  private lit = { value: 0 };
  private mother: THREE.Mesh;
  private calf: THREE.Mesh;
  private swim = { uFlap: { value: 0 }, uAmp: { value: 0.3 }, uHit: { value: 0 } };
  private swim2 = { uFlap: { value: 0 }, uAmp: { value: 0.34 }, uHit: { value: 0 } };
  private calfAt = new THREE.Vector2(999, 999);
  private wet = [false, false];
  private boats: Moored[] = [
    { variant: 0, x: 0, z: 0, yaw: 0, placed: false },
    { variant: 1, x: 0, z: 0, yaw: 0, placed: false },
  ];
  private loot = new Map<number, number>();
  private pulled = 0;
  private schoolAt = new THREE.Vector3(toX(SPAWNING_GROUND.x), 0, toZ(SPAWNING_GROUND.y));
  private schoolR = 1;
  private handed = 0;
  private r = rng(5150);

  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private qi = new THREE.Quaternion();
  private eu = new THREE.Euler();
  private v = new THREE.Vector3();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private s3 = new THREE.Vector3();
  private nrm = new THREE.Vector3(0, 1, 0);
  private t = 0;
  private swell = 1;

  constructor(
    private water: Water,
    private fx: Fx
  ) {
    const pair = toon({
      side: THREE.DoubleSide,
      fAlbedo: /* glsl */ `
        float lampy = step(.45, vFx.w);
        emis = vFx.w * mix(1., .2 + 1.7 * uLampI, lampy);
        alb = mix(alb, vec3(1.), vInst.y);
        emis += vInst.y * .7;
      `,
    });
    const ink = outlineMaterial(1.7, '#15131a');
    const add = (k: Piece, geo: THREE.BufferGeometry, capacity: number, p = pair): void => {
      const im = instanced(geo, p, [], { capacity, ink });
      im.setColorAt(0, WHITE);
      this.batch[k] = { im, data: im.geometry.attributes.aInst as THREE.InstancedBufferAttribute, n: 0 };
      this.group.add(im);
    };
    add('bundle', salvageBundle(), 96);
    add('barge', cargoBarge(), 12);
    for (const { piece, geometry } of Object.values(PIRATE_HULLS)) add(piece, geometry(), 48);
    add('pukat', trawlShip(), 4);
    add('drumship', drumShip(), 4);
    add('float', trawlFloat(), 8);
    add('cork', corkFloat(), 80);
    add('drum', drum(), 10);
    add('pad', pad(), 4);
    add('box', toolbox(), 2);
    add('basket', fishBasket(), 8);
    add('coil', tideCoil(), 1);
    add('deposit', deposit(), 8);
    add('guard', guard(), 2, propPair(THREE.DoubleSide, false));

    /* ---- every rope in the story is a chain of short cylinders in one draw */
    const seg = new Build(1).cyl(1, 1, 1, { color: '#ffffff', seg: 6, open: true }).geo();
    this.ropes = instanced(seg, toon({}), [], { capacity: 320, cast: false });
    this.ropes.setColorAt(0, WHITE);
    this.group.add(this.ropes);

    /* ---- the fish of the spawning ground, those by the pier, and the few that follow the mother */
    const fishPair = toon({
      side: THREE.DoubleSide,
      vLocal: /* glsl */ `p.z += sin(uTime * 10. + aInst.x * 20. + p.x * 2.4) * .2 * smoothstep(.3, -1., p.x);`,
      fHead: GLSL_CACHED_UNDERWATER,
      fAlbedo: 'emis += .16 + uBio * .6;',
      fEnd: GLSL_UNDERWATER_END,
    });
    this.fishMat = fishPair.material;
    const items: Inst[] = [];
    for (let i = 0; i < FISH_SCHOOL + FISH_PIER + FISH_TRAIL; i++) {
      items.push({ m: new THREE.Matrix4().makeScale(0, 0, 0), color: new THREE.Color().setScalar(lerp(0.85, 1.1, this.r())), i: [this.r(), 0, 0, 0] });
    }
    this.fish = instanced(smallFish(), fishPair, items, { cast: false });
    this.underGroup.add(this.fish);

    /* ---- the dolphins, when no film has them */
    const body = dolphin();
    const swimmer = (u: typeof this.swim): THREE.Mesh => {
      const { pair: p, ink: k } = swimSkin(u);
      const m = inked(mesh(body, p), k);
      m.frustumCulled = false;
      m.visible = false;
      m.rotation.order = 'YXZ';
      this.group.add(m);
      return m;
    };
    this.mother = swimmer(this.swim);
    this.calf = swimmer(this.swim2);
    this.calf.scale.setScalar(0.58);

    /* ---- what stands there all the time */
    const st = new Build(490);
    const mx = toX(MOORING.x);
    const mz = toZ(MOORING.y);
    mooring(st, mx, mz, groundAt(mx, mz - 1.6));
    this.lampAt = beacon(st, BEACON[0], BEACON[1], groundAt(BEACON[0], BEACON[1]));
    const standing = inked(mesh(st.geo(true), propPair(THREE.FrontSide, true)), outlineMaterial(1.1, '#33190f', { isStatic: true }));
    standing.frustumCulled = false;
    this.staticGroup.add(standing);
    this.lampMesh = mesh(
      beaconLamp(),
      toon({
        uniforms: { uLit: this.lit },
        fHead: 'uniform float uLit;',
        fAlbedo: 'alb = mix(vec3(.2, .24, .28), alb, uLit); emis = uLit * 2.2; gloss = 1. - uLit;',
      }),
      false
    );
    this.lampMesh.position.copy(this.lampAt);
    this.lampMesh.frustumCulled = false;
    this.group.add(this.lampMesh);
  }

  setCachedMode(on: boolean): void {
    const m = this.fishMat;
    m.transparent = on;
    m.depthTest = !on;
    m.depthWrite = !on;
    if (Boolean(m.defines.CACHED_UNDER) !== on) {
      if (on) m.defines.CACHED_UNDER = 1;
      else delete m.defines.CACHED_UNDER;
      m.needsUpdate = true;
    }
  }

  /** Puts everything back to where a lagoon begins: another story, or the same one loaded again. */
  reset(): void {
    for (const b of this.boats) b.placed = false;
    this.loot.clear();
    this.pulled = 0;
    this.handed = 0;
    this.calfAt.set(999, 999);
  }

  /* ================================================================ drawing */

  private floatAt(x: number, z: number, span: number): number {
    const h = this.water.heightAt(x, z, this.t, this.swell);
    const hx = this.water.heightAt(x + span, z, this.t, this.swell);
    const hz = this.water.heightAt(x, z + span, this.t, this.swell);
    this.nrm.set(-(hx - h) / span, 1, -(hz - h) / span).normalize();
    return h;
  }

  private put(k: Piece, x: number, y: number, z: number, yaw: number, scale: number, o: PutOpts = {}): void {
    const s = this.batch[k];
    if (s.n >= s.im.instanceMatrix.count) return;
    this.q.setFromEuler(this.eu.set(o.pitch ?? 0, yaw, o.roll ?? 0, 'YXZ'));
    const tilt = o.tilt ?? 0;
    if (tilt > 0) {
      this.q2.setFromUnitVectors(UP, this.nrm).slerp(this.qi, 1 - tilt);
      this.q.premultiply(this.q2);
    }
    this.m4.compose(this.v.set(x, y, z), this.q, this.s3.setScalar(scale));
    s.im.setMatrixAt(s.n, this.m4);
    s.im.setColorAt(s.n, o.tint ?? WHITE);
    s.data.setXYZW(s.n, o.phase ?? 0, o.flash ?? 0, 0, 0);
    s.n += 1;
  }

  private line(ax: number, ay: number, az: number, bx: number, by: number, bz: number, rad: number, col: THREE.Color): void {
    const i = this.ropeN;
    if (i >= this.ropes.instanceMatrix.count) return;
    this.a.set(bx - ax, by - ay, bz - az);
    const len = this.a.length();
    if (len < 1e-3) return;
    this.q.setFromUnitVectors(UP, this.a.multiplyScalar(1 / len));
    this.m4.compose(this.v.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), this.q, this.s3.set(rad, len * 1.04, rad));
    this.ropes.setMatrixAt(i, this.m4);
    this.ropes.setColorAt(i, col);
    this.ropeN = i + 1;
  }

  /** A rope from a to b that hangs `sag` in the middle and never goes under the water it crosses. */
  private rope(ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, n: number, rad: number, col: THREE.Color, dry = false): void {
    let px = ax;
    let py = ay;
    let pz = az;
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const x = lerp(ax, bx, u);
      const z = lerp(az, bz, u);
      let y = lerp(ay, by, u) - sag * 4 * u * (1 - u);
      if (!dry && i < n) y = Math.max(y, this.water.heightAt(x, z, this.t, this.swell) + 0.12);
      this.line(px, py, pz, x, y, z, rad, col);
      px = x;
      py = y;
      pz = z;
    }
  }

  private ring(x: number, z: number, r: number, col: readonly [number, number, number], a: number, kind: number = SP.ring, rot = 0): void {
    this.fx.sprites.push(x, 0.14, z, r, r, rot, col[0], col[1], col[2], a, kind, MODE.flat, 0.8);
  }

  /** A pulse that says "here". */
  private beckon(x: number, z: number, r: number, col: readonly [number, number, number], k = 1): void {
    const p = (this.t * 0.7) % 1;
    this.ring(x, z, r * (1 + p * 0.8), col, (1 - p) * 0.6 * k);
    this.ring(x, z, r * 1.08, col, 0.5 * k, SP.dash, -this.t * 0.6);
  }

  /** From a ship's own space to the world, at its heading. */
  private local(e: { rotation: number }, x: number, z: number, lx: number, lz: number): [number, number] {
    const c = Math.cos(e.rotation);
    const s = Math.sin(e.rotation);
    return [x + lx * c - lz * s, z + lx * s + lz * c];
  }

  /* ================================================================ the frame */

  update(dt: number, t: number, sim: GameSimulation, look: Look, rescue: Rescue): void {
    this.t = t;
    this.swell = look.swell;
    for (const k of Object.keys(this.batch) as Piece[]) this.batch[k].n = 0;
    this.ropeN = 0;
    this.fishN = 0;
    this.lamps.length = 0;
    this.guests.length = 0;
    this.raiders.clear();
    const live = !this.veiled && sim.lagoonInitialized && !!sim.progress;

    if (live) {
      this.moorBoats(dt, sim);
      this.pier(dt, sim);
      if (sim.story.s.marks.fender) {
        const x = toX(PIER_END.x), z = toZ(PIER_END.y);
        const h = this.water.heightAt(x + 0.8, z, this.t, this.swell) + 0.36;
        for (const offset of [0.28, 0.78, 1.28]) {
          this.line(x + offset, h, z - 2.65, x + offset, h, z + 2.65, 0.22, BAMBOO);
        }
        for (const dz of [-1.85, 0, 1.85]) {
          this.line(x + 0.14, h + 0.22, z + dz, x + 1.42, h + 0.22, z + dz, 0.08, ROPE_DARK);
          this.line(x - 0.35, DECK + 0.08, z + dz, x + 0.32, h + 0.16, z + dz, 0.07, ROPE);
        }
      }
      for (const e of sim.entities) this.entity(e, dt, sim);
      this.gear(sim);
      this.longRope(sim);
      this.current(dt, sim);
      const lane = sim.tidalLane;
      const drag = sim.drag;
      if (lane) this.flowArrows(lane.x, lane.y, lane.angle, lane.length, FOAM_ARROW, true);
      else if (drag.active && sim.progress.story.flags.toolbox && sim.laneCooldown <= 0 && drag.charge >= 0.42) {
        this.flowArrows(drag.startX, drag.startY, Math.atan2(drag.currY - drag.startY, drag.currX - drag.startX), 230 + sim.stats.laneLevel * 30, FOAM_ARROW, false);
      }
    }
    this.lamp(dt, sim, live, look);
    this.pod(dt, sim, live);
    this.schools(sim, live, rescue);
    this.flush();
  }

  private flowArrows(x: number, y: number, angle: number, length: number, color: THREE.Color, active = false): void {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const shift = active ? (this.t * 0.65) % 0.31 : 0;
    const isWarn = color === RAM_WAKE;
    for (let i = 0; i < 3; i++) {
      const fraction = 0.16 + i * 0.31 + shift;
      if (fraction > 0.96) continue;
      const fade = Math.sin(clamp(fraction, 0.05, 0.96) * Math.PI);
      const ax = toX(x + dx * length * fraction), az = toZ(y + dy * length * fraction);
      const h = this.floatAt(ax, az, 0.4) + 0.14;
      this.fx.sprites.push(
        ax - dx * 0.7, 0.11, az - dy * 0.7,
        2.5, 1.15, angle,
        isWarn ? 1.35 : 0.76, isWarn ? 0.68 : 0.98, isWarn ? 0.36 : 0.96,
        (active ? 0.48 : 0.34) * fade,
        SP.puff, MODE.flat, isWarn ? 0.45 : 0.25, 0.35, i * 0.27
      );
      for (const side of [-1, 1]) {
        this.line(ax - dx * 1.25 + dy * side * 0.88, h, az - dy * 1.25 - dx * side * 0.88, ax, h, az, 0.1, color);
      }
    }
  }

  private flush(): void {
    for (const k of Object.keys(this.batch) as Piece[]) {
      const s = this.batch[k];
      setCount(s.im, s.n);
      if (s.n > 0) {
        s.im.instanceMatrix.needsUpdate = true;
        s.im.instanceColor!.needsUpdate = true;
        s.data.needsUpdate = true;
      }
    }
    setCount(this.ropes, this.ropeN);
    if (this.ropeN > 0) {
      this.ropes.instanceMatrix.needsUpdate = true;
      this.ropes.instanceColor!.needsUpdate = true;
    }
    setCount(this.fish, this.fishN);
    if (this.fishN > 0) this.fish.instanceMatrix.needsUpdate = true;
  }

  /* ================================================================ the fishing boats */

  /**
   * Pak Damar's boat waits outside until it gets in, then lies at the pier, at anchor, and at the end of
   * the story at the pier for good. The other fishers come, unload and sail out again.
   */
  private moorBoats(dt: number, sim: GameSimulation): void {
    const s = sim.story.s;
    const docked = sim.story.view.docked;
    for (const b of this.boats) {
      if (b.variant === 0 && this.film?.boat) {
        b.x = this.film.boat.x;
        b.z = this.film.boat.z;
        b.yaw = this.film.boat.yaw;
        b.placed = true;
        this.guests.push(b);
        continue;
      }
      const e = sim.entities.find((q) => q.kind === 'boat' && q.variant % 2 === b.variant);
      if (e) {
        // the simulation has it: remember where, so that it goes on from there
        b.x = toX(e.x);
        b.z = toZ(e.y);
        b.yaw = -e.rotation;
        b.placed = true;
        continue;
      }
      const atPier = docked !== null && docked.variant % 2 === b.variant;
      let to: Spot;
      if (b.variant === 0) {
        if (!s.flags.damar) to = WAIT;
        else if (atPier || s.flags.ending) to = HEADS[0];
        else if (s.chapter === 7 && s.flags.calf && !s.flags.night) to = OFFSHORE;
        else to = BERTH;
      } else to = atPier ? HEADS[1] : OFFSHORE;

      if (!b.placed) {
        b.placed = true;
        b.x = to.x;
        b.z = to.z;
        b.yaw = to.yaw;
      }
      this.glide(b, to, dt);
      if (b.x > 64) continue;
      this.guests.push(b);
    }
  }

  private glide(b: Moored, to: Spot, dt: number): void {
    // round the corner of the landing stage, and out along the gap in the reef
    let goal: Spot = to;
    if (to === BERTH && b.z < 17.2 && b.x < -20) goal = CORNER;
    else if (to === OFFSHORE && b.x < 18) goal = b.x < -27 ? CORNER : { x: 22, z: 7.6, yaw: 0 };
    const dx = goal.x - b.x;
    const dz = goal.z - b.z;
    const d = Math.hypot(dx, dz);
    const turn = (want: number, k: number): void => {
      b.yaw += Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw)) * Math.min(1, dt * k);
    };
    if (d < 0.08) {
      turn(to.yaw, 1.4);
      return;
    }
    const v = Math.min(goal === to ? d * 0.9 + 0.2 : 4.2, 4.2) * dt;
    b.x += (dx / d) * Math.min(d, v);
    b.z += (dz / d) * Math.min(d, v);
    turn(d > 2.2 || goal !== to ? Math.atan2(-dz, dx) : to.yaw, 1.7);
  }

  /* ================================================================ the pier */

  private pier(dt: number, sim: GameSimulation): void {
    const s = sim.story.s;
    const view = sim.story.view;
    const job = s.job;

    /* ---- whatever was just handed over hops onto the deck */
    if (view.handover > this.handed + 1) this.onCheer?.();
    this.handed = view.handover;
    const hop = (age: number): number => (age < 0 ? 0 : age < 1 ? Math.sin(age * Math.PI) * 1.5 : 0);
    const fresh = view.handover > 0 ? 4 - view.handover : 9;
    if (s.box === 'home') {
      const just = s.step === 'workshop' ? fresh : 9;
      this.put('box', CHEST_HOME[0], DECK + 0.32 + hop(just), CHEST_HOME[1], 0.35, 0.82);
      if (just < 3.5) this.star(CHEST_HOME[0], DECK + 2.6, CHEST_HOME[1], 1.4);
    }
    if (s.flags.damar) {
      const just = s.chapter === 4 && s.baskets === 2 ? fresh : 9;
      this.put('coil', COIL_HOME[0], DECK + hop(just), COIL_HOME[1], 0.5, just < 1 ? smooth(0, 0.5, just) : 0.95);
      if (just < 3.5) this.star(COIL_HOME[0], DECK + 2.2, COIL_HOME[1], 1.5);
    }
    if (s.flags.toolbox) for (const [x, z, yaw] of GUARDS) this.put('guard', x, Math.max(groundAt(x, z), x > -44.2 && Math.abs(z - 10.8) < 1.4 ? DECK : 0), z, yaw + Math.sin(this.t * 0.4 + x) * 0.4, 1, { phase: 0.3 });

    /* ---- the baskets, and the one on its way to the raider's deck */
    const ship = sim.entities.find((e) => e.kind === 'raider' && e.tag !== 'leaving');
    const seizing = job?.kind === 'raid' && job.phase === 'seize' && ship ? job.work : 0;
    const want = seizing > 0.08 ? smooth(0.08, 1, seizing) : 0;
    this.pulled += (want - this.pulled) * Math.min(1, dt * (want < this.pulled ? 3.2 : 8));
    if (s.baskets <= 0) this.pulled = 0;
    const raided = job?.kind === 'raid';
    for (let i = 0; i < Math.min(2, s.baskets); i++) {
      const [bx, bz] = BASKETS[i];
      const last = i === s.baskets - 1;
      if (last && this.pulled > 0.01 && ship) {
        const u = this.pulled;
        const sx = toX(ship.x);
        const sz = toZ(ship.y);
        const x = lerp(bx, sx, u * 0.86);
        const z = lerp(bz, sz, u * 0.86);
        const w = this.water.heightAt(x, z, this.t, this.swell);
        const y = lerp(DECK, w + 0.1, smooth(0.0, 0.16, u)) + arc(u, 0.5);
        this.put('basket', x, y, z, this.t * 0.6, 1, { roll: Math.sin(this.t * 5) * 0.12 });
        this.rope(x, y + 0.9, z, sx, 1.6, sz, 0.5, 8, 0.1, ROPE_DARK);
        this.beckon(x, z, 1.9, [1.6, 0.3, 0.2]);
        if (this.r() < dt * 10) this.water.splash({ x, z, radius: 0.8, foam: 0.7, impulse: 0.3 });
      } else {
        this.put('basket', bx, DECK, bz, i * 1.3 + 0.4, 1);
      }
      if (raided || s.chapter === 4) this.fx.sprites.push(bx, DECK + 0.1, bz, 1.5, 1.5, 0, 1.4, 1.0, 0.35, 0.34, SP.halo, MODE.ground, 0.75);
    }

    /* ---- and its rope across the mouth of the net while it lies there */
    if (sim.netClosed) this.netBoom(sim);
  }

  private star(x: number, y: number, z: number, s: number): void {
    const p = 0.6 + 0.4 * Math.sin(this.t * 6);
    this.fx.sprites.push(x, y, z, s * p, s * p, this.t, 1.6, 1.25, 0.5, 0.9, SP.star, MODE.billboard, 1);
    this.fx.sprites.push(x, y - 0.8, z, s * 1.6, s * 1.6, 0, 1.4, 1.0, 0.4, 0.22, SP.glow, MODE.billboard, 1);
  }

  private netBoom(sim: GameSimulation): void {
    const cx = toX(COLLECTOR_NET.x);
    const cz = toZ(COLLECTOR_NET.y);
    const { rz } = netRadii(sim.stats.netRadius);
    const R = rz + 1.1;
    const n = 12;
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let i = 0; i <= n; i++) {
      const a = lerp(-1.42, 1.42, i / n);
      const x = cx + Math.cos(a) * R;
      const z = cz + Math.sin(a) * R;
      const y = this.water.heightAt(x, z, this.t, this.swell) + 0.3;
      if (i > 0) this.line(px, py, pz, x, y, z, 0.16, CHAIN);
      this.put('cork', x, y, z, i, 1.05, { tint: CLOSED });
      px = x;
      py = y;
      pz = z;
    }
    const p = 0.5 + 0.5 * Math.sin(this.t * 5);
    this.ring(cx, cz, R, [1.5, 0.25, 0.18], 0.35 + p * 0.3);
  }

  /* ================================================================ things in the water */

  private entity(e: Entity, dt: number, sim: GameSimulation): void {
    const x = toX(e.x);
    const z = toZ(e.y);
    const s = sim.story.s;
    if (e.bundle) {
      const gap = Math.max(1.45, e.radius * UNIT + 0.52);
      const [bx, bz] = this.local(e, x, z, -gap * 0.72, gap * 0.69);
      const h = this.floatAt(bx, bz, 0.5);
      const by = h - 0.04 + Math.sin(e.bobPhase + 1.2) * 0.06;
      this.put('bundle', bx, by, bz, -e.rotation + 0.35, 0.78, { tilt: 0.8 });
      this.fx.sprites.shadow(bx, bz, 0.92, 0.62, e.rotation, 0.18, 0.28);
      this.rope(x, h + 0.32, z, bx, by + 0.32, bz, 0.18, 4, 0.05, ROPE);
    }
    switch (e.kind) {
      case 'toolbox':
        this.chest(e, x, z, dt);
        break;
      case 'raider': {
        const variant = pirateKind(e.variant);
        const { piece, scale } = PIRATE_HULLS[variant];
        this.ship(piece, e, x, z, scale, dt);
        if (variant === PIRATE_KIND.tug) {
          const [sx, sz] = this.local(e, x, z, -1.58 * scale, -0.32 * scale);
          if (this.r() < dt * 5) this.fx.spray(sx, 3.6 * scale, sz, 0.5, 1.1, (this.r() - 0.5) * 0.4, lerp(0.45, 0.8, this.r()), 1.4, 1);
        }
        if (e.ram?.phase === 'aim') this.flowArrows(e.x, e.y, e.ram.angle, 240, RAM_WAKE, true);
        if (e.tow && e.tag !== 'leaving') {
          const dx = Math.cos(e.rotation), dz = Math.sin(e.rotation);
          const bx = toX(e.x - dx * 82), bz = toZ(e.y - dz * 82);
          const h = this.floatAt(bx, bz, 0.6);
          const by = h * 0.78 + 0.08 + Math.sin(this.t * 1.4 + e.id) * 0.05;
          this.put('barge', bx, by, bz, -e.rotation, 1, { tilt: 0.7, roll: Math.sin(this.t * 1.5 + e.id) * 0.04 });
          this.fx.sprites.shadow(bx, bz, 2.75, 1.38, e.rotation, 0.68, 0.36);
          this.fx.sprites.push(bx, 0.1, bz, 2.9, 2.2, -e.rotation, 1, 1, 1, 0.2, SP.ring, MODE.flat, 0, 0.9);
          const strain = clamp(e.tow.strain, 0, 1);
          const ax = x - dx * 2.95 * scale, az = z - dz * 2.95 * scale;
          const cx = bx + dx * 1.94, cz = bz + dz * 1.94;
          const sag = 0.48 * (1 - strain * 0.88);
          this.rope(ax, h + 1.38, az, cx, by + 1.12, cz, sag, 7, 0.08, strain > 0.25 ? TOW_STRAIN : ROPE);
          const mx = (ax + cx) * 0.5, mz = (az + cz) * 0.5;
          const my = Math.max(this.water.heightAt(mx, mz, this.t, this.swell) + 0.16, (h + 1.38 + by + 1.12) * 0.5 - sag);
          this.put('cork', mx, my, mz, -e.rotation, 0.54);
        }
        if (variant === PIRATE_KIND.signal && e.tag !== 'leaving') {
          this.ring(x, z, PIRATE_SIGNAL_RADIUS * UNIT, [1.55, 0.96, 0.37], 0.24 + 0.06 * Math.sin(this.t * 2), SP.dash);
        }
        if (e.tag === 'attack') {
          this.beckon(x, z, 4.0 * scale, [1.7, 0.25, 0.16]);
          const px = toX(PIER_END.x);
          const pz = toZ(PIER_END.y);
          this.rope(x, 1.8, z, px, DECK + 0.4, pz, 0.6, 8, 0.09, CHAIN);
        } else if (variant === PIRATE_KIND.heavy && e.tag !== 'leaving') {
          this.ring(x, z, 4.6, [1.45, 0.42, 0.85], 0.45, SP.dash, this.t * 0.5);
        }
        break;
      }
      case 'trawl_ship':
        this.ship('pukat', e, x, z, 1.12, dt);
        break;
      case 'polluter':
        this.ship('drumship', e, x, z, 1.08, dt);
        this.derrick(e, x, z, dt, sim);
        break;
      case 'drum': {
        const h = this.floatAt(x, z, 0.9);
        this.put('drum', x, h + 0.25, z, -e.rotation + this.t * 0.4, 1.1, { flash: clamp(e.hitFlash / 0.14, 0, 1) * 0.6, tilt: 1, roll: Math.sin(this.t * 2) * 0.1, pitch: this.t * 0.7 });
        this.beckon(x, z, 2.5, [1.5, 1.05, 0.2]);
        // the reef it must not reach
        if (e.home) {
          const p = 0.5 + 0.5 * Math.sin(this.t * 3.2);
          this.ring(toX(e.home.x), toZ(e.home.y), 6.6, [1.5, 0.3, 0.2], 0.3 + 0.3 * p);
          this.ring(toX(e.home.x), toZ(e.home.y), 15, [1.4, 0.45, 0.2], 0.22, SP.dash, this.t * 0.2);
        }
        break;
      }
      case 'float': {
        const h = this.floatAt(x, z, 0.8);
        this.put('float', x, h + 0.2, z, -e.rotation, 1.25, { flash: clamp(e.hitFlash / 0.14, 0, 1) * 0.6, tilt: 0.8, roll: Math.sin(this.t * 1.7 + e.id) * 0.1 });
        if (e.home) {
          const hx = toX(e.home.x);
          const hz = toZ(e.home.y);
          const out = Math.hypot(e.x - e.home.x, e.y - e.home.y) > 74;
          this.ring(x, z, 2.1, out ? [0.4, 1.4, 0.8] : [1.5, 0.75, 0.25], 0.7);
          if (!out) this.ring(hx, hz, 7.4, [0.4, 1.25, 1.35], 0.34, SP.dash, this.t * 0.15);
        }
        break;
      }
      case 'drift_net':
        if (e.home) this.ring(toX(e.home.x), toZ(e.home.y), 7.8, [0.4, 1.25, 1.35], 0.3, SP.dash, this.t * 0.15);
        break;
      case 'pad':
        this.drawPad(e, x, z, dt, sim);
        break;
      case 'deposit': {
        const k = 0.75 + 0.25 * (e.hp / Math.max(1, e.maxHp));
        const y = Math.max(groundAt(x, z), -0.1) + 0.1;
        this.put('deposit', x, y, z, e.id * 1.7, 1.1 * k, { flash: clamp(e.hitFlash / 0.3, 0, 1) * 0.5, phase: 0.2 });
        this.beckon(x, z, 2.6, [1.5, 0.5, 0.25], 0.85);
        break;
      }
      case 'ghost_net':
        this.beckon(x, z, 2.9, [0.4, 1.3, 1.0], 0.8);
        if (this.r() < dt * 2.4) this.fx.spray(x + (this.r() - 0.5) * 2, 0.1, z + (this.r() - 0.5) * 2, 0, 1.2, 0, 0.12, 0.7, 0);
        break;
      case 'oil':
        if (s.flags.waste || s.job?.kind === 'waste') this.beckon(x, z, 5.0, [1.2, 0.6, 1.4], 0.6);
        break;
    }
  }

  private chest(e: Entity, x: number, z: number, dt: number): void {
    const h = this.floatAt(x, z, 1.1);
    const stuck = e.snagged;
    const hit = clamp(e.hitFlash / 0.14, 0, 1);
    const y = h + (stuck ? -0.12 : 0.1) + Math.sin(e.bobPhase) * 0.06;
    this.put('box', x, y, z, 0.35 + Math.sin(this.t * 0.6) * 0.12, 1.0, {
      flash: hit * 0.7,
      tilt: 0.8,
      roll: (stuck ? 0.16 : 0) + Math.sin(this.t * 1.3) * 0.07,
      pitch: Math.sin(this.t * 1.1 + 1) * 0.06,
    });
    // the line that holds it on the pier's side
    const mx = toX(MOORING.x) + 1.6;
    const mz = toZ(MOORING.y) - 1.45;
    const d = Math.hypot(x - mx, z - mz);
    this.rope(mx, 1.6, mz, x, y + 1.0, z, clamp(3.2 - d * 0.2, 0.1, 2.4), 10, 0.1, ROPE);
    this.star(x, y + 3.0, z, 1.1);
    const v = Math.hypot(e.vx, e.vy) * UNIT;
    if (v > 1.5 && this.r() < dt * 12) this.water.splash({ x, z, radius: 1.2, foam: 0.6, impulse: 0.4 });
  }

  private ship(k: ShipPiece, e: Entity, x: number, z: number, scale: number, dt: number): void {
    const h = this.floatAt(x, z, 2.4);
    const hit = clamp(e.hitFlash / 0.24, 0, 1);
    this.put(k, x, h * 0.75 + 0.2 + Math.sin(this.t * 1.2 + e.id) * 0.06, z, -e.rotation, scale, {
      flash: hit * 0.6,
      tilt: 0.5,
      roll: Math.sin(this.t * 1.3 + e.id) * 0.03,
      pitch: Math.sin(this.t * 0.9 + e.id) * 0.06 + hit * 0.22,
      phase: 0.1,
    });
    if (k === 'raider') {
      const n = this.raiders.size;
      const m = (this.raiderPool[n] ??= new THREE.Matrix4());
      this.raiders.set(e.id, m.copy(this.m4));
    }
    const v = Math.hypot(e.vx, e.vy) * UNIT;
    const c = Math.cos(e.rotation);
    const s = Math.sin(e.rotation);
    this.fx.sprites.shadow(x, z, 4.2 * scale, 1.65 * scale, e.rotation, .8, .4);
    if (v > 0.8 && this.r() < dt * (10 + v * 3)) {
      const side = this.r() < 0.5 ? -1 : 1;
      this.water.splash({ x: x + c * 3.2 - s * side * 1.2, z: z + s * 3.2 + c * side * 1.2, radius: 0.9, foam: 0.75, impulse: 0.4 });
      this.water.splash({ x: x - c * 3.8, z: z - s * 3.8, radius: 1.1, foam: 0.7, impulse: 0.35 });
    }
    if (k === 'skiff') {
      const foam = smooth(14, 58, e.vx * c + e.vy * s);
      if (foam > 0) {
        for (const side of [-1, 1]) {
          const [sx, sz] = this.local(e, x, z, -4.6 - foam * 1.3, side * 0.52);
          this.fx.sprites.push(sx, 0.1, sz, 1.7 + foam * 2.2, 0.58, e.rotation + side * 0.15, 0.76, 0.95, 0.94, foam * 0.7, SP.puff, MODE.flat, 0, 0.3, (e.id % 7) * 0.18 + side * 0.15);
        }
      }
    }
    this.fx.sprites.push(x, 0.1, z, 4.3 * scale, 3.4 * scale, -e.rotation, 1, 1, 1, 0.24, SP.ring, MODE.flat, 0, 0.9);
  }

  /** The drum on its hook: down, loose, and drifting to where it will burst. Smoke says the ship is at work. */
  private derrick(e: Entity, x: number, z: number, dt: number, sim: GameSimulation): void {
    const [fx, fz] = this.local(e, x, z, -2.8, 0);
    if (this.r() < dt * 9) this.fx.spray(fx, 4.6, fz, 0.9, 1.5, (this.r() - 0.5) * 0.6, lerp(0.8, 1.4, this.r()), 1.8, 1);
    this.fx.sprites.push(fx + 0.4, 5.2 + Math.sin(this.t * 2) * 0.1, fz, 1.0, 1.2, this.t * 0.2, 0.1, 0.09, 0.09, 0.5, SP.puff, MODE.billboard, 0, 0.6, 0.31);
    const job = sim.story.s.job;
    const work = job?.kind === 'waste' && job.phase === 'dump' && e.tag !== 'leaving' ? job.work : e.tag === 'leaving' ? -1 : 0;
    if (work < 0) return;
    const [hx, hz] = this.local(e, x, z, DERRICK[0] * 1.08, DERRICK[2]);
    const top = DERRICK[1] * 1.08 + 0.3;
    const low = smooth(0, 0.6, work);
    if (work < 0.62) {
      const y = lerp(2.5, 0.35, low);
      this.put('drum', hx, y, hz, -e.rotation + Math.PI / 2, 0.8, { roll: Math.sin(this.t * 2.3) * 0.12 });
      this.line(hx, top, hz, hx, y + 0.7, hz, 0.05, ROPE_DARK);
    } else {
      const u = smooth(0.62, 1, work);
      const dx = lerp(hx, toX(DUMP_SPOT.x), u);
      const dz = lerp(hz, toZ(DUMP_SPOT.y), u);
      const h = this.floatAt(dx, dz, 0.9);
      this.put('drum', dx, h + 0.2 - u * 0.25, dz, this.t, 0.95, { tilt: 1, pitch: this.t * 1.6 });
      if (this.r() < dt * 12) this.water.splash({ x: dx, z: dz, radius: 0.9, foam: 0.6, impulse: 0.5 });
    }
    if (work > 0.02) this.beckon(toX(DUMP_SPOT.x), toZ(DUMP_SPOT.y), 3.8, [1.6, 0.4, 0.2], 0.4 + work * 0.6);
  }

  private tint = new THREE.Color();

  private drawPad(e: Entity, x: number, z: number, dt: number, sim: GameSimulation): void {
    const fly = clamp(e.actionTimer / 1.15, 0, 1);
    let soak = 0;
    for (const o of sim.entities) {
      if (o.kind !== 'oil') continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < o.radius + e.radius) soak = Math.max(soak, 1 - clamp(o.hp / Math.max(0.01, o.maxHp), 0, 1), 0.15);
    }
    if (fly > 0) {
      const u = 1 - fly;
      const ax = toX(PIER_END.x);
      const az = toZ(PIER_END.y);
      this.put('pad', lerp(ax, x, u), lerp(2, 0.3, u) + arc(u, 9), lerp(az, z, u), u * 5, lerp(0.5, 1.05, u), { roll: u * 3 });
      if (u > 0.9) this.water.splash({ x, z, radius: 2.2, foam: 0.9, impulse: 1 });
      return;
    }
    const h = this.floatAt(x, z, 1.0);
    const hit = clamp(e.hitFlash / 0.14, 0, 1);
    this.put('pad', x, h + 0.08, z, -e.rotation + 0.3, 1.05, { flash: hit * 0.5, tilt: 1, tint: this.tint.copy(WHITE).lerp(OILED, soak) });
    this.beckon(x, z, 2.7, [1.1, 1.35, 1.5]);
    if (soak > 0 && this.r() < dt * 14) this.water.splash({ x: x + (this.r() - 0.5) * 3, z: z + (this.r() - 0.5) * 3, radius: 0.7, foam: 0.5, impulse: 0.3 });
  }

  /** A trawl in the water: both lines to the ship, the cork line between the floats, and the bag behind it. */
  private gear(sim: GameSimulation): void {
    let A: Entity | null = null;
    let B: Entity | null = null;
    let ship: Entity | null = null;
    for (const e of sim.entities) {
      if (e.kind === 'float') {
        if (e.tag === 'A') A = e;
        else B = e;
      } else if ((e.kind === 'trawl_ship' || e.kind === 'trawler') && e.tag !== 'leaving') ship = e;
    }
    if (!A || !B) return;
    const ax = toX(A.x);
    const az = toZ(A.y);
    const bx = toX(B.x);
    const bz = toZ(B.y);
    if (ship) {
      const sx = toX(ship.x);
      const sz = toZ(ship.y);
      const big = ship.kind === 'trawler';
      const [hx, hz] = this.local(ship, sx, sz, big ? -6.2 : -3.6, 0);
      const y = big ? 4.4 : 3.4;
      this.rope(hx, y, hz, ax, 0.8, az, 1.6, 12, 0.085, ROPE_DARK);
      this.rope(hx, y, hz, bx, 0.8, bz, 1.6, 12, 0.085, ROPE_DARK);
    }
    const span = Math.hypot(ax - bx, az - bz);
    const bag = clamp(9.5 - span * 0.12, 2.5, 8);
    // the bag trails away from the ship, to the west of the floats
    const curve = (k: number, i: number, n: number, out: THREE.Vector3): void => {
      const u = i / n;
      out.set(lerp(ax, bx, u) - Math.sin(u * Math.PI) * bag * k, 0, lerp(az, bz, u));
      out.y = this.water.heightAt(out.x, out.z, this.t, this.swell) + 0.14 - (1 - k) * 0.02;
    };
    const n = 12;
    for (const k of [0.4, 0.75, 1]) {
      for (let i = 0; i < n; i++) {
        curve(k, i, n, this.b);
        const px = this.b.x;
        const py = this.b.y;
        const pz = this.b.z;
        curve(k, i + 1, n, this.b);
        this.line(px, py, pz, this.b.x, this.b.y, this.b.z, 0.07, TRAWL);
      }
    }
    for (let i = 1; i < n; i++) {
      curve(0.4, i, n, this.b);
      const px = this.b.x;
      const py = this.b.y;
      const pz = this.b.z;
      curve(1, i, n, this.b);
      this.line(px, py, pz, this.b.x, this.b.y, this.b.z, 0.05, TRAWL);
      if (i % 2 === 0) this.put('cork', this.b.x, this.b.y + 0.1, this.b.z, i, 0.78);
    }
  }

  /** The rope of chapter 2: from the pier, over the water, to the reef where it has caught something. */
  private longRope(sim: GameSimulation): void {
    const s = sim.story.s;
    const k = s.job?.kind === 'dolphin' ? 1 : sim.story.view.rope;
    if (k <= 0.01 || s.flags.dolphin) return;
    const ax = toX(PIER_END.x) + 0.2;
    const az = toZ(PIER_END.y);
    const bx = toX(DOLPHIN_SPOT.x) - 1.2;
    const bz = toZ(DOLPHIN_SPOT.y) - 0.4;
    const n = 44;
    const reach = Math.max(1, Math.round(n * k));
    // it comes up slack, then pulls straight
    const slack = (1 - smooth(0.6, 1, k)) * 3.2;
    let px = ax;
    let py = DECK + 0.5;
    let pz = az;
    for (let i = 1; i <= reach; i++) {
      const u = i / n;
      const x = lerp(ax, bx, u);
      const z = lerp(az, bz, u) + Math.sin(u * 9) * slack * Math.sin(u * Math.PI) + Math.sin(this.t * 3 + u * 30) * 0.08;
      const w = this.water.heightAt(x, z, this.t, this.swell);
      const y = u < 0.05 ? lerp(DECK + 0.5, w + 0.2, u / 0.05) : w + 0.2;
      this.line(px, py, pz, x, y, z, 0.13, ROPE);
      if (i % 5 === 0 && i < n) this.put('cork', x, w + 0.22, z, i, 1.0, { tilt: 0 });
      px = x;
      py = y;
      pz = z;
    }
    // a glint runs along it, towards whatever is pulling
    const u = (this.t * 0.22) % 1;
    if (u < k) {
      const x = lerp(ax, bx, u);
      const z = lerp(az, bz, u);
      this.fx.sprites.push(x, 0.7, z, 1.5, 1.5, this.t * 2, 1.6, 1.3, 0.6, 0.9 * Math.sin(u * Math.PI), SP.star, MODE.billboard, 1);
    }
  }

  /** Foam that shows where the cross-current takes a boat. */
  private current(dt: number, sim: GameSimulation): void {
    const run = sim.story.run;
    if (!(run instanceof BoatJob)) return;
    const c = run.current();
    if (!c.on) return;
    const boat = sim.entities.find((e) => e.kind === 'boat' && e.tag === 'fisher');
    const x = toX(c.x);
    const z = toZ(c.y);
    const R = c.r * UNIT;
    const base = boat ? Math.atan2(toZ(boat.y) - z, toX(boat.x) - x) : -1;
    const n = 26;
    for (let i = 0; i < n; i++) {
      const u = (this.t * 0.2 + i * 0.381) % 1;
      const a = base + ((((i * 0.618) % 1) * 2 - 1) * 1.15);
      const d = lerp(R * 0.98, 3.4, Math.pow(u, 0.85));
      const swirl = a + (1 - u) * 0.35;
      const px = x + Math.cos(swirl) * d;
      const pz = z + Math.sin(swirl) * d;
      const alpha = Math.sin(u * Math.PI) * 0.62;
      this.fx.sprites.push(px, 0.15, pz, 1.35, 0.2, swirl, 0.95, 1, 1.02, alpha, SP.drop, MODE.flat, 0, 0.8);
      // an arrowhead every so often: this is where it is going
      if (i % 4 === 0) {
        const tx = px - Math.cos(swirl) * 1.3;
        const tz = pz - Math.sin(swirl) * 1.3;
        this.fx.sprites.push(tx + Math.cos(swirl + 0.6) * 0.5, 0.15, tz + Math.sin(swirl + 0.6) * 0.5, 0.62, 0.16, swirl + 0.6, 0.95, 1, 1.02, alpha, SP.drop, MODE.flat, 0, 0.8);
        this.fx.sprites.push(tx + Math.cos(swirl - 0.6) * 0.5, 0.15, tz + Math.sin(swirl - 0.6) * 0.5, 0.62, 0.16, swirl - 0.6, 0.95, 1, 1.02, alpha, SP.drop, MODE.flat, 0, 0.8);
      }
      if (this.r() < dt * 0.9) this.water.splash({ x: px, z: pz, radius: 1.1, foam: 0.7, impulse: 0.2 });
    }
  }

  /* ================================================================ the beacon */

  private lamp(dt: number, sim: GameSimulation, live: boolean, look: Look): void {
    const on = live && sim.story.s.beacon;
    this.lit.value += ((on ? 1 : 0) - this.lit.value) * Math.min(1, dt * 1.6);
    const k = this.lit.value;
    if (k < 0.02) return;
    const p = this.lampAt;
    const sp = this.fx.sprites;
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 3.1);
    sp.push(p.x, p.y, p.z, 3.6 * pulse, 3.6 * pulse, 0, 1.5, 1.1, 0.5, 0.5 * k, SP.glow, MODE.billboard, 1);
    sp.push(p.x, p.y, p.z, 1.5 * pulse, 1.5 * pulse, this.t * 0.4, 1.7, 1.4, 0.8, 0.9 * k, SP.star, MODE.billboard, 1);
    // two beams sweeping the bay
    const a = this.t * 0.7;
    for (let j = 0; j < 2; j++) {
      const b = a + j * Math.PI;
      for (let i = 1; i <= 5; i++) {
        const d = i * 3.2;
        const s = 1.4 + i * 0.5;
        sp.push(p.x + Math.cos(b) * d, p.y - i * 0.35, p.z + Math.sin(b) * d, s, s * 0.6, 0, 1.4, 1.1, 0.6, (0.2 - i * 0.026) * k * (0.35 + look.lamp * 0.8), SP.glow, MODE.billboard, 1);
      }
    }
    this.lamps.push({ p, r: 20, c: new THREE.Vector3(1.1, 0.74, 0.32).multiplyScalar(k * pulse) });
  }

  /* ================================================================ dolphins and fish */

  private pod(dt: number, sim: GameSimulation, live: boolean): void {
    const f = this.film?.pod ?? null;
    const p = live && !f ? sim.story.pod : null;
    const on = !!f || !!p;
    this.mother.visible = on;
    this.calf.visible = on;
    if (!on) {
      this.calfAt.set(999, 999);
      return;
    }
    const x = f ? f.x : toX(p!.x);
    const z = f ? f.z : toZ(p!.y);
    const yaw = f ? f.yaw : -p!.a;
    const happy = f ? f.leap : p!.happy;
    const pace = f ? 1 : p!.swim;
    this.swim.uFlap.value += dt * lerp(6, 13, pace);
    this.swim2.uFlap.value += dt * lerp(8, 16, pace);

    const beat = this.t * lerp(1.5, 3.0, pace);
    this.leap(this.mother, 0, x, z, yaw, beat, happy, 1.12, dt);
    // the calf keeps to her flank, a beat behind
    const bx = x - Math.cos(yaw) * 2.6 + Math.sin(yaw) * 1.7;
    const bz = z + Math.sin(yaw) * 2.6 + Math.cos(yaw) * 1.7;
    if (Math.hypot(this.calfAt.x - bx, this.calfAt.y - bz) > 12) this.calfAt.set(bx, bz);
    this.calfAt.x += (bx - this.calfAt.x) * Math.min(1, dt * 4);
    this.calfAt.y += (bz - this.calfAt.y) * Math.min(1, dt * 4);
    this.leap(this.calf, 1, this.calfAt.x, this.calfAt.y, yaw, beat - 1.1, happy, 0.62, dt);
  }

  private leap(m: THREE.Mesh, i: number, x: number, z: number, yaw: number, beat: number, happy: number, scale: number, dt: number): void {
    const h = this.water.heightAt(x, z, this.t, this.swell);
    const up = Math.sin(beat);
    const high = up > 0 ? up * lerp(0.42, 2.1, happy) * Math.max(0.6, scale) : up * 0.5;
    m.position.set(x, h - 0.12 + high, z);
    m.rotation.set(0, yaw, Math.cos(beat) * lerp(0.22, 0.62, happy));
    m.scale.setScalar(scale);
    const wet = high > 0.25;
    if (wet !== this.wet[i]) {
      this.wet[i] = wet;
      const k = scale * (0.5 + happy * 0.5);
      this.water.splash({ x, z, radius: 1.7 * k, foam: 0.9, impulse: 1.2 * k });
      this.fx.burst(x, h + 0.25, z, Math.round(5 + 8 * k), 2.4 + 2.4 * k, 0, 0.12);
    }
    if (this.r() < dt * 7) this.water.splash({ x: x - Math.cos(yaw) * 1.8 * scale, z: z + Math.sin(yaw) * 1.8 * scale, radius: 0.7 * scale, foam: 0.5, impulse: 0.3 });
  }

  private swimmer(x: number, y: number, z: number, yaw: number, pitch: number, scale: number): void {
    if (scale < 0.02) return;
    this.q.setFromEuler(this.eu.set(0, yaw, pitch, 'YXZ'));
    this.m4.compose(this.v.set(x, y, z), this.q, this.s3.setScalar(scale));
    this.fish.setMatrixAt(this.fishN, this.m4);
    this.fishN += 1;
  }

  private schools(sim: GameSimulation, live: boolean, rescue: Rescue): void {
    const t = this.t;
    const eco = G.uEco.value;
    const view = sim.story.view;
    const job = live ? sim.story.s.job : null;
    const wanted = job?.kind === 'trawl' || (job?.kind === 'boss' && job.phase === 'gear_trawl');

    /* ---- the spawning ground: always there while someone is trying to take it */
    const wild = wanted ? 1 : smooth(0.16, 0.46, eco);
    const gone = live ? clamp(view.school.gone / 3, 0, 1) : 0;
    const caught = live ? view.school.caught : 0;
    const freed = live ? view.school.freed : 0;
    const cx = toX(SPAWNING_GROUND.x);
    const cz = toZ(SPAWNING_GROUND.y);
    // the haul draws them together and towards the ship
    this.schoolAt.x += (cx + caught * 5.5 - this.schoolAt.x) * 0.04;
    this.schoolAt.z += (cz + caught * 0.6 - this.schoolAt.z) * 0.04;
    const r = lerp(lerp(4.6, 2.0, caught), 9.5, freed);
    this.schoolR += (r - this.schoolR) * 0.05;
    const here = wild * (1 - gone);
    for (let i = 0; i < FISH_SCHOOL; i++) {
      const u = i / FISH_SCHOOL;
      const k = smooth(u - 0.12, u + 0.12, here * 1.24 - 0.12);
      const sp = (i % 2 ? 1 : 0.8) * (0.55 + caught * 1.6 + freed * 1.4);
      const a = i * 2.399 + t * sp;
      const d = this.schoolR * (0.35 + 0.65 * Math.sqrt((i * 0.618) % 1)) * (1 + Math.sin(t * 0.9 + i) * 0.12);
      const x = this.schoolAt.x + Math.cos(a) * d * 1.15;
      const z = this.schoolAt.z + Math.sin(a) * d * 0.85;
      const jump = caught > 0.15 ? Math.max(0, Math.sin(t * 3.4 + i * 1.9)) * caught * 0.9 : 0;
      this.swimmer(x, -0.62 + jump + Math.sin(t * 1.3 + i) * 0.1, z, Math.atan2(-Math.cos(a) * 0.85, -Math.sin(a) * 1.15), 0, k * (0.62 + (i % 5) * 0.07));
    }

    /* ---- by the pier: the first to leave and the last to come back */
    const near = smooth(0.62, 0.78, eco);
    for (let i = 0; i < FISH_PIER; i++) {
      const u = i / FISH_PIER;
      const k = smooth(u - 0.1, u + 0.1, near * 1.2 - 0.1);
      const a = i * 2.399 - t * (0.42 + (i % 3) * 0.06);
      const d = 4.4 * (0.4 + 0.6 * Math.sqrt((i * 0.618) % 1));
      const x = -21.5 + Math.cos(a) * d * 1.2 + Math.sin(t * 0.2) * 1.6;
      const z = 14.5 + Math.sin(a) * d * 0.9 + Math.cos(t * 0.17) * 1.2;
      this.swimmer(x, -0.55 + Math.sin(t * 1.5 + i) * 0.1, z, Math.atan2(Math.cos(a) * 0.9, Math.sin(a) * 1.2), 0, k * (0.5 + (i % 4) * 0.06));
    }

    /* ---- the small ones that follow the mother out */
    const tr = rescue.trail;
    if (!tr.on) return;
    for (let i = 0; i < FISH_TRAIL; i++) {
      const back = 2.6 + i * 0.75;
      const side = (((i * 0.618) % 1) * 2 - 1) * 1.6;
      const x = tr.x - tr.dx * back - tr.dz * side;
      const z = tr.z - tr.dz * back + tr.dx * side;
      const ph = t * 6.2 + i * 1.7;
      const y = Math.max(-0.5, Math.sin(ph) * 1.05);
      const k = smooth(0, 1, clamp(tr.t * 1.4 - i * 0.12, 0, 1));
      this.swimmer(x, y, z, Math.atan2(-tr.dz, tr.dx), Math.cos(ph) * 0.8, k * (0.7 + (i % 3) * 0.1));
      if (Math.abs(y) < 0.08 && this.r() < 0.3) this.water.splash({ x, z, radius: 0.5, foam: 0.6, impulse: 0.4 });
    }
  }
}

/** The berth along the pier head, for the film that ends there. */
export const PIER_HEAD: Spot = HEADS[0];
