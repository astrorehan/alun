import * as THREE from 'three';
import type { GameSimulation } from '../simulation';
import type { ComputedStats } from '../types';
import { G, GLSL_GRADE_LDR, GLSL_UNIFORMS, registerDirectLdr } from './gfx';
import type { Look } from './look';
import { platesFor, type Plate, type PlateTone } from './plates';
import { clamp, groundAt, lerp, rng, shoreAt, smooth, toX, toZ, UNIT } from './space';
import { MODE, SP, Sprites } from './sprites';
import { FLOAT_HEAD, type Water } from './water';

const CAP = 900;
const FIREFLIES = 34;
const _c = new THREE.Color();
const cssCache = new Map<string, [number, number, number]>();

/** CSS colour string to linear rgb, cached because the sim reuses a handful of strings. */
export function css(s: string): [number, number, number] {
  let v = cssCache.get(s);
  if (!v) {
    _c.set(s);
    v = [_c.r, _c.g, _c.b];
    cssCache.set(s, v);
  }
  return v;
}

/** Spray, splashes, sim particles, aim guide, rain, flames and floating text. */
export class Fx {
  readonly sprites: Sprites;
  readonly group = new THREE.Group();
  private px = new Float32Array(CAP);
  private py = new Float32Array(CAP);
  private pz = new Float32Array(CAP);
  private vx = new Float32Array(CAP);
  private vy = new Float32Array(CAP);
  private vz = new Float32Array(CAP);
  private life = new Float32Array(CAP);
  private max = new Float32Array(CAP);
  private size = new Float32Array(CAP);
  private kind = new Uint8Array(CAP);
  private head = 0;
  private r = rng(1234);
  private seenWave = new Set<number>();
  private lastCrest = new Map<number, { x: number; z: number; dx: number; dz: number; half: number; ring: boolean; charge: number }>();
  private aim: THREE.Mesh;
  private aimU: Record<string, THREE.IUniform>;
  private aimA = 0;
  private rain: THREE.Mesh;
  private rainU = { value: 0 };
  private acc = 0;
  private drawback = 0;
  /** The gold burst for a full charge has gone off for the wave being held. */
  private fullBurst = false;

  constructor(private water: Water) {
    this.sprites = new Sprites(water);
    this.group.add(this.sprites.group);
    /* ---------------- aim guide: a ribbon draped over the water */
    const g = new THREE.PlaneGeometry(1, 1, 40, 14);
    this.aimU = {
      uA: { value: new THREE.Vector4() },
      uB: { value: new THREE.Vector4() },
      uAlpha: { value: 0 },
      uCharge: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...G, ...water.shared, ...this.aimU },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
${GLSL_UNIFORMS}
${FLOAT_HEAD()}
uniform vec4 uA, uB; // x z dx dz | len half bow -
varying vec2 vQ;
void main(){
  float u = position.x + .5; float v = position.y * 2.;
  vQ = vec2(u, v);
  vec2 f = uA.zw, l = vec2(-f.y, f.x);
  float half_ = uB.y * mix(.86, 1.06, u);
  vec2 xz = uA.xy + f * (u * uB.x - uB.z * v * v) + l * v * half_;
  float a_, b_;
  vec3 p = waterPos(xz, a_, b_);
  p.y += .14;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}`,
      fragmentShader: /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_GRADE_LDR}
uniform vec4 uB; uniform float uAlpha, uCharge;
varying vec2 vQ;
void main(){
  float u = vQ.x, v = vQ.y, av = abs(v);
  float x = u * uB.x;
  float fade = smoothstep(0., .1, u) * smoothstep(1., .45, u);
  // crest-shaped chevrons marching outward, the same bow the wave will have
  float ph = fract(x * .34 - uTime * (1.1 + uCharge * 1.6));
  float bar = smoothstep(.0, .06, ph) * smoothstep(.5 - uCharge * .12, .36 - uCharge * .12, ph);
  float edge = smoothstep(1., .9, av);
  float rail = smoothstep(.86, .9, av) * smoothstep(1., .965, av) * step(.45, fract(x * .7 - uTime * 1.4));
  float a = (bar * .5 * edge * mix(.35, 1., 1. - av * av) + rail * .85) * fade;
  // where the crest will be born
  float lip = smoothstep(.0, .02, u) * smoothstep(.075, .05, u) * smoothstep(1., .96, av);
  a = max(a, lip * .95);
  vec3 c = mix(vec3(.78, 1.05, 1.05), vec3(1.25, .86, .3), smoothstep(.5, .85, uCharge));
  c *= .75 + .6 * uBio + .35 * lip;
  #ifdef DIRECT_LDR
    c = alunGrade(c, gl_FragCoord.xy / uRes);
  #endif
  gl_FragColor = vec4(c, a * uAlpha);
  if (gl_FragColor.a < .004) discard;
}`,
    });
    registerDirectLdr(mat, false);
    this.aim = new THREE.Mesh(g, mat);
    this.aim.frustumCulled = false;
    this.aim.renderOrder = 12;
    this.aim.visible = false;
    this.group.add(this.aim);

    /* ---------------- rain: positions live entirely on the GPU */
    const N = 1300;
    const rg = new THREE.InstancedBufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
    rg.setIndex([0, 1, 2, 0, 2, 3]);
    const h = new Float32Array(N * 4);
    for (let i = 0; i < N * 4; i++) h[i] = this.r();
    rg.setAttribute('h', new THREE.InstancedBufferAttribute(h, 4));
    rg.instanceCount = N;
    this.rain = new THREE.Mesh(
      rg,
      new THREE.ShaderMaterial({
        uniforms: { ...G, uRainK: this.rainU },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
${GLSL_UNIFORMS}
attribute vec4 h; uniform float uRainK; varying float vA; varying vec2 vQ;
void main(){
  float top = 46.;
  float sp = 46. + h.w * 22.;
  float y = mod(h.z * 400. - uTime * sp, top);
  vec3 p = vec3(mix(-72., 78., h.x), y, mix(-54., 52., h.y));
  vec3 dir = normalize(vec3(uWind.x * 9., -sp, uWind.y * 9.));
  p.xz += uWind.xy * (y - top) * -.22;
  vec3 V = normalize(cameraPosition - p);
  vec3 s = normalize(cross(dir, V));
  p += s * position.x * .035 - dir * position.y * (1.5 + h.w * 1.6);
  vQ = position.xy;
  vA = step(h.x * h.w, uRainK) * uRainK * mix(.16, .42, h.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}`,
        fragmentShader: /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_GRADE_LDR}
varying float vA; varying vec2 vQ;
void main(){
  vec3 c = vec3(.62, .86, 1.);
  #ifdef DIRECT_LDR
    c = alunGrade(c, gl_FragCoord.xy / uRes);
  #endif
  gl_FragColor = vec4(c, vA * (1. - abs(vQ.x)) * smoothstep(0., .2, vQ.y) * smoothstep(1., .5, vQ.y));
}`,
      })
    );
    registerDirectLdr(this.rain.material as THREE.ShaderMaterial, false);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 30;
    this.rain.visible = false;
    this.group.add(this.rain);
  }

  /** kind: 0 droplet, 1 mist, 2 gold mote, 3 confetti */
  spray(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, kind = 0): void {
    const i = this.head;
    this.head = (i + 1) % CAP;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.size[i] = size;
    this.life[i] = 0;
    this.max[i] = life;
    this.kind[i] = kind;
  }

  /** A crown of droplets. */
  burst(x: number, y: number, z: number, n: number, power: number, kind = 0, size = 0.16): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + this.r() * 0.5;
      const s = power * lerp(0.35, 1, this.r());
      this.spray(x, y, z, Math.cos(a) * s * 0.7, s * lerp(0.9, 1.7, this.r()), Math.sin(a) * s * 0.7, size * lerp(0.6, 1.3, this.r()), lerp(0.5, 0.95, this.r()), kind);
    }
  }

  private emitCrests(dt: number, sim: GameSimulation, bio: number): void {
    const r = this.r;
    for (const w of sim.waves) {
      if (this.seenWave.has(w.id)) continue;
      this.seenWave.add(w.id);
      // launch: the water gets punched, not just tinted
      const x = toX(w.x);
      const z = toZ(w.y);
      if (w.kind === 'echo') continue;
      const k = 0.7 + w.charge * 1.1;
      const n = Math.round(14 + w.charge * 26);
      if (w.kind === 'directional') {
        const dx = Math.cos(w.angle);
        const dz = Math.sin(w.angle);
        for (let i = 0; i < n; i++) {
          const l = (r() * 2 - 1) * w.crestWidth * 0.42 * UNIT;
          const s = lerp(3, 8.5, r()) * k;
          this.spray(x - dz * l, 0.4, z + dx * l, dx * s + (r() - 0.5) * 2, lerp(2.4, 6.2, r()) * k, dz * s + (r() - 0.5) * 2, lerp(0.06, 0.16, r()) * (0.8 + w.charge * 0.4), lerp(0.5, 0.95, r()), w.charge > 0.65 && r() < 0.3 ? 2 : 0);
        }
      } else this.burst(x, 0.3, z, n, 6 * k, w.kind === 'resonance' ? 2 : 0, 0.13);
      this.water.splash({ x, z, radius: 1.4 + w.charge * 1.6, foam: 0.6, impulse: 1.1 + w.charge, gold: w.kind === 'resonance' ? 1 : 0 });
    }
    if (this.seenWave.size > 200) {
      const live = new Set(sim.waves.map((w) => w.id));
      for (const id of this.seenWave) if (!live.has(id)) this.seenWave.delete(id);
    }

    // a crest that runs out of push collapses into a patch of foam instead of fading away
    const alive = new Set<number>();
    for (const w of sim.waves) {
      alive.add(w.id);
      if (w.kind === 'ripple' || w.kind === 'resonance' || w.kind === 'buoy_pulse') continue;
      const left = 1 - w.age / w.maxAge;
      if (left > 0.3) this.lastCrest.set(w.id, { x: toX(w.x), z: toZ(w.y), dx: Math.cos(w.angle), dz: Math.sin(w.angle), half: w.crestWidth * 0.5 * UNIT, ring: false, charge: w.charge });
      else if (left < 0.26 && this.lastCrest.has(w.id)) {
        const c = this.lastCrest.get(w.id)!;
        this.lastCrest.delete(w.id);
        c.x = toX(w.x);
        c.z = toZ(w.y);
        if (c.x < shoreAt(c.z) + 1.5) continue;
        for (let i = 0; i < 5; i++) {
          const l = (i / 4) * 2 - 1;
          const px = c.x - c.dx * (0.6 + l * l * 1.6) - c.dz * l * c.half * 0.8;
          const pz = c.z - c.dz * (0.6 + l * l * 1.6) + c.dx * l * c.half * 0.8;
          this.water.splash({ x: px, z: pz, radius: lerp(1, 1.7, r()) * (1 + c.charge * 0.4), foam: 0.55, impulse: 0.8 });
          this.burst(px, 0.4, pz, 3, 2.4 + c.charge * 1.4, 0, 0.1);
        }
      }
    }
    for (const id of this.lastCrest.keys()) if (!alive.has(id)) this.lastCrest.delete(id);

    for (const c of this.water.crests) {
      const A = c.amp * c.alpha;
      if (A < 0.35) continue;
      const span = c.ring ? Math.min(c.radius * 6.28, 60) : c.half * 2;
      const want = span * (c.ring ? 0.5 : 0.95) * Math.pow(A, 1.1) * dt * (c.ring ? 4 : 7) * c.foam;
      let n = Math.floor(want) + (r() < want % 1 ? 1 : 0);
      n = Math.min(n, 14);
      for (let i = 0; i < n; i++) {
        let x: number;
        let z: number;
        let dx = c.dx;
        let dz = c.dz;
        let env = 1;
        if (c.ring) {
          const a = r() * 6.283;
          dx = Math.cos(a);
          dz = Math.sin(a);
          x = c.x + dx * c.radius;
          z = c.z + dz * c.radius;
        } else {
          const l = r() * 2 - 1;
          env = Math.pow(1 - Math.pow(Math.abs(l), 2.8), 0.85);
          x = c.x + dx * -c.bow * l * l - dz * l * c.half;
          z = c.z + dz * -c.bow * l * l + dx * l * c.half;
        }
        if (x < shoreAt(z) - 1) continue;
        const h = A * env;
        const sp = c.ring ? 4.6 : c.speed * lerp(0.92, 1.22, r());
        const up = lerp(1.0, 3.4, r()) * (0.55 + h * 0.5);
        this.spray(x + dx * 0.3, h * 0.92, z + dz * 0.3, dx * sp + (r() - 0.5) * 1.6, up, dz * sp + (r() - 0.5) * 1.6, lerp(0.06, 0.17, r() * r()) * (0.8 + A * 0.18), lerp(0.35, 0.8, r()), c.gold > 0.3 && r() < 0.3 ? 2 : 0);
        if (r() < 0.16 && bio < 0.5) this.spray(x + dx * 0.5, h * 0.85, z + dz * 0.5, dx * sp * 0.8, up * 0.3, dz * sp * 0.8, lerp(0.55, 1.0, r()) * (0.7 + A * 0.2), lerp(0.35, 0.6, r()), 1);
      }
    }
  }

  private emitShore(dt: number, sim: GameSimulation): void {
    if (sim.shoreSplash < 0.12) return;
    this.acc += dt * 60 * sim.shoreSplash;
    const r = this.r;
    for (const w of sim.waves) {
      const z = toZ(w.y);
      const sx = shoreAt(z);
      if (toX(w.x) > sx + 2.6) continue;
      if (r() > dt * 60 * 0.9) continue;
      const l = (r() - 0.5) * w.crestWidth * 0.8 * UNIT;
      const zz = z + l;
      const x = shoreAt(zz) + 0.4;
      for (let i = 0; i < 3; i++) this.spray(x, 0.3, zz + (r() - 0.5), -lerp(1, 4, r()), lerp(2.2, 5.6, r()) * (0.7 + w.charge * 0.6), (r() - 0.5) * 3, lerp(0.1, 0.24, r()), lerp(0.5, 0.9, r()), 0);
      this.spray(x, 0.4, zz, -0.8, 0.8, 0, lerp(0.6, 1.2, r()), 0.8, 1);
    }
  }

  /** cine: 0 on the play camera, 1 up close, where droplets have to be finer. */
  update(dt: number, t: number, sim: GameSimulation, stats: ComputedStats, look: Look, cam: THREE.Vector3, cine: number): void {
    const sp = this.sprites;
    const fine = 1 - 0.55 * cine;
    const near = (x: number, y: number, z: number): number =>
      cine < 0.02 ? 1 : lerp(1, clamp(Math.hypot(x - cam.x, y - cam.y, z - cam.z) / 18, 0.12, 1), cine);
    const bio = look.bio;
    sp.begin();
    sp.rings = 1 - cine;
    this.emitCrests(dt, sim, bio);
    this.emitShore(dt, sim);

    /* ---------------- spray */
    const w0 = lerp(1, 0.55, bio);
    for (let i = 0; i < CAP; i++) {
      if (this.life[i] >= this.max[i]) continue;
      this.life[i] += dt;
      const k = this.life[i] / this.max[i];
      if (k >= 1) continue;
      const kind = this.kind[i];
      if (kind === 1) {
        this.vy[i] += dt * 0.2;
        const d = Math.exp(-dt * 2.4);
        this.vx[i] *= d;
        this.vz[i] *= d;
      } else if (kind === 3) {
        this.vy[i] -= dt * 7;
        const d = Math.exp(-dt * 1.6);
        this.vx[i] *= d;
        this.vz[i] *= d;
      } else this.vy[i] -= dt * (kind === 2 ? 7 : 15);
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.02 && this.vy[i] < 0 && kind !== 1) {
        if (this.size[i] > 0.16 && this.r() < 0.18) this.water.splash({ x: this.px[i], z: this.pz[i], radius: 0.5, foam: 0.25, impulse: 0.5 });
        this.life[i] = this.max[i];
        continue;
      }
      const s = this.size[i];
      if (kind === 1) sp.push(this.px[i], this.py[i], this.pz[i], s * (0.7 + k * 0.9), s * (0.6 + k * 0.7), i, 1, 1, 1, 0.13 * Math.sin(Math.min(1, k * 3) * 1.57) * (1 - k), SP.mist, MODE.billboard, 0.35, 0.6, i * 0.137);
      else if (kind === 2) {
        const g = s * 2.4 * fine * near(this.px[i], this.py[i], this.pz[i]);
        sp.push(this.px[i], this.py[i], this.pz[i], g, g, 0, 1.6, 1.05, 0.35, 1 - k, SP.star, MODE.billboard, 1);
      }
      else if (kind === 3) {
        const c = [
          [0.9, 0.12, 0.1],
          [1, 0.72, 0.12],
          [0.1, 0.62, 0.56],
          [0.95, 0.9, 0.8],
        ][i % 4];
        sp.push(this.px[i], this.py[i], this.pz[i], s * 1.3, s * 0.8 * Math.abs(Math.sin(t * 9 + i)), i + t * 4, c[0], c[1], c[2], 1 - k * k, SP.leaf, MODE.billboard, 0, 0.6);
      } else {
        // droplets stretch along their motion
        const spd = Math.hypot(this.vx[i], this.vy[i], this.vz[i]);
        const st = clamp(spd * 0.018, 0, 0.28);
        const ang = Math.atan2(this.vy[i] * 0.77 - this.vz[i] * 0.64, this.vx[i]);
        const fade = k < 0.75 ? 1 : (1 - k) * 4;
        const sz = s * (1 - k * 0.45) * fine * near(this.px[i], this.py[i], this.pz[i]);
        sp.push(this.px[i], this.py[i], this.pz[i], sz * (1 + st), sz * (1 - st * 0.35), ang, lerp(0.82, 0.12, bio), lerp(0.86, 0.9, bio), lerp(0.88, 1.15, bio), 0.95 * fade, SP.drop, MODE.billboard, bio * 0.7, 1 - bio * 0.8);
      }
    }

    /* ---------------- sim particles, lifted into 3D */
    for (const p of sim.particles) {
      const k = p.life / p.maxLife;
      const a = p.alpha * (1 - k);
      if (a < 0.02) continue;
      const [r, g, b] = css(p.color);
      const x = toX(p.x);
      const z = toZ(p.y);
      const s = p.size * UNIT;
      switch (p.kind) {
        case 'foam':
          sp.push(x, 0.15 + Math.sin(k * Math.PI) * 0.9, z, s * 0.4 * fine * (1 - k * 0.5), s * 0.4 * fine * (1 - k * 0.5), 0, w0 * 0.86, 0.9, 0.92, a, SP.drop, MODE.billboard, bio * 0.6, 1 - bio);
          break;
        case 'biolum':
          sp.push(x, 0.12, z, s * 1.5, s * 1.5, 0, r * 1.5, g * 1.5, b * 1.5, a, SP.glow, MODE.billboard, 1);
          break;
        case 'spark':
          sp.push(x, 0.6 + k * 2.4, z, s * 2.2 * (1 - k * 0.4), s * 2.2 * (1 - k * 0.4), k * 2, r * 1.7, g * 1.7, b * 1.7, a, SP.star, MODE.billboard, 1);
          break;
        case 'ember':
          sp.push(x + Math.sin(t * 5 + p.x) * 0.2, groundAt(x, z) + 1 + k * 3.4, z, s * 0.9, s * 0.9, 0, r * 2.2, g * 1.6, b, a, SP.glow, MODE.billboard, 1);
          break;
        case 'smoke':
          sp.push(x + k * 1.2, Math.max(0, groundAt(x, z)) + 1.4 + k * 4.6, z, s * (1.6 + k * 2.2), s * (1.6 + k * 2.2), p.x, r * 0.8, g * 0.8, b * 0.8, a * 0.75, SP.puff, MODE.billboard, 0, 0.8, (p.x * 0.013) % 1);
          break;
        case 'leaf':
          sp.push(x, 0.5 + Math.sin(k * 3) * 1.5, z, s * 1.5, s * 0.95, k * 5 + p.x, r, g, b, a, SP.leaf, MODE.billboard, 0, 0.7);
          break;
        case 'ring':
          sp.push(x, 0.14, z, s * 1.05, s * 1.05, 0, r, g, b, a * 0.7, SP.ring, MODE.flat, 0.5, 0.4);
          break;
      }
    }

    /* ---------------- rain */
    this.rain.visible = look.rain > 0.02;
    this.rainU.value = look.rain;

    /* ---------------- fireflies come out with the lanterns */
    if (look.lamp > 0.4 && look.rain < 0.6) {
      const fk = smooth(0.4, 0.8, look.lamp);
      for (let i = 0; i < FIREFLIES; i++) {
        const z = lerp(-34, 34, (i * 0.618) % 1) + Math.sin(t * 0.31 + i * 2.1) * 2.2;
        const x = shoreAt(z) - 8 - ((i * 0.37) % 1) * 9 + Math.cos(t * 0.27 + i) * 1.8;
        const y = Math.max(0, groundAt(x, z)) + 1.2 + Math.sin(t * 0.7 + i * 1.7) * 0.9 + (i % 3);
        const on = Math.pow(Math.max(0, Math.sin(t * 1.5 + i * 3.3)), 2);
        sp.push(x, y, z, 0.42, 0.42, 0, 1.5, 1.7, 0.4, on * fk, SP.glow, MODE.billboard, 1);
      }
    }

    this.updateAim(dt, t, sim, stats, bio);
  }

  private updateAim(dt: number, t: number, sim: GameSimulation, stats: ComputedStats, bio: number): void {
    const sp = this.sprites;
    const d = sim.drag;
    const target = d.active ? 1 : 0;
    this.aimA += (target - this.aimA) * Math.min(1, dt * (d.active ? 14 : 9));
    const charge = d.charge;
    const x0 = toX(d.startX);
    const z0 = toZ(d.startY);
    if (d.active) {
      // the sea draws back before it throws
      this.drawback = Math.min(1, this.drawback + dt * 2.2);
      const rad = 1.9 + charge * 2.6;
      this.water.splash({ x: x0, z: z0, radius: rad, height: -(0.28 + charge * 0.85) * this.drawback, foam: 0, impulse: 0, gold: charge > 0.65 ? 0.35 : 0 });
      const rr = rad * (1.05 - ((t * (1 + charge * 1.5)) % 1) * 0.65);
      const gold = smooth(0.5, 0.8, charge);
      const cr = lerp(0.75, 1.5, gold);
      const cg = lerp(1.1, 0.95, gold);
      const cb = lerp(1.15, 0.35, gold);
      sp.push(x0, 0.2, z0, rr, rr, 0, cr, cg, cb, 0.55, SP.ring, MODE.flat, 0.5);
      sp.push(x0, 0.2, z0, rad * 1.1, rad * 1.1, t * 0.8, cr, cg, cb, 0.8, SP.dash, MODE.flat, 0.5);
      sp.push(x0, 0.25, z0, rad * 1.5, rad * 1.5, 0, cr, cg, cb, 0.18 + charge * 0.4, SP.glow, MODE.flat, 1);
      if (charge > 0.25 && this.r() < dt * 60 * charge * 0.7) {
        const a = this.r() * 6.283;
        this.spray(x0 + Math.cos(a) * rad * 1.5, 0.3, z0 + Math.sin(a) * rad * 1.5, -Math.cos(a) * rad * 2, 1.6, -Math.sin(a) * rad * 2, 0.11, 0.6, charge > 0.6 ? 2 : 0);
      }
      // full power: gold flies up once and a ring runs out from the held water
      const full = sim.chargeFullAge;
      if (full >= 0) {
        if (!this.fullBurst) {
          this.fullBurst = true;
          this.burst(x0, 0.3, z0, 16, 5.5, 2, 0.12);
          this.water.splash({ x: x0, z: z0, radius: rad * 1.2, foam: 0.5, impulse: 0.9, gold: 1 });
        }
        if (full < 0.5) {
          const k = full / 0.5;
          const ring = rad * (1.15 + k * 1.9);
          sp.push(x0, 0.24, z0, ring, ring, 0, 1.7, 1.35, 0.45, (1 - k) * (1 - k) * 0.95, SP.ring, MODE.flat, 0.9);
        }
      } else this.fullBurst = false;
    } else {
      this.drawback = 0;
      this.fullBurst = false;
    }

    const dx = d.currX - d.startX;
    const dy = d.currY - d.startY;
    const dist = Math.hypot(dx, dy);
    const show = d.active && dist >= 16;
    const u = this.aimU;
    if (show) {
      const len = Math.min(240, 80 + dist * 0.8 + charge * 90) * UNIT;
      const half = stats.waveWidth * (1 + charge * 0.52) * 0.5 * UNIT;
      (u.uA.value as THREE.Vector4).set(x0, z0, dx / dist, dy / dist);
      (u.uB.value as THREE.Vector4).set(len, half, 0.9 + half * 0.3 + charge * 0.9, 0);
      u.uCharge.value = charge;
    }
    u.uAlpha.value = this.aimA * (show || !d.active ? 1 : 0) * lerp(0.95, 0.8, bio);
    this.aim.visible = u.uAlpha.value > 0.01 && dist >= 16;
  }
}

/* ================================================================== floating text */

/** Score pops are drawn on a 2D canvas above the scene: crisp type, thick ink, coin included. */
/** Edge and fill of each kind of plate. */
const PLATE_TONES: Record<PlateTone, [string, string]> = {
  foe: ['#ff9b8a', 'rgba(13, 30, 42, 0.9)'],
  busy: ['#ffd27a', 'rgba(139, 20, 34, 0.94)'],
  open: ['#fff1a8', 'rgba(196, 72, 8, 0.95)'],
  friend: ['#8fe8db', 'rgba(8, 58, 66, 0.9)'],
  care: ['#ffe08a', 'rgba(46, 32, 66, 0.9)'],
};

export class TextLayer {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private dpr = 1;
  private w = 1;
  private h = 1;
  private v = new THREE.Vector3();
  private dirty = false;
  /** What the canvas is showing, so that labels nothing has moved are not drawn again. */
  private shown = '';
  private lastPlates = 0;

  constructor(host: HTMLCanvasElement) {
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    this.canvas.setAttribute('aria-hidden', 'true');
    host.parentElement?.insertBefore(this.canvas, host.nextSibling);
  }

  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dirty = false;
    this.shown = '';
    // Touch the 2D backing store once on resize so the first floating score pop does not stall on allocation.
    this.ctx.clearRect(0, 0, 1, 1);
  }

  private project(cam: THREE.Camera, x: number, y: number, z: number, shift: THREE.Vector3): [number, number] | null {
    this.v.set(x, y, z).project(cam);
    if (this.v.z > 1) return null;
    const su = this.v.x * 0.5 + 0.5;
    const sv = this.v.y * 0.5 + 0.5;
    // Invert the 2D post UV transform: sceneUv = (screenUv - 0.5) / zoom + 0.5 + shift
    const u = (su - 0.5 - shift.x) * shift.z + 0.5;
    const v = (sv - 0.5 - shift.y) * shift.z + 0.5;
    return [u * this.w, (1 - v) * this.h];
  }

  /** One name plate, with what its owner is up to under it. */
  private plate(p: Plate, x: number, y: number, u: number): void {
    const g = this.ctx;
    const size = Math.max(11, 15.5 * u);
    g.font = `700 ${size.toFixed(1)}px Fredoka, "Baloo 2", "Trebuchet MS", sans-serif`;
    const w = Math.max(g.measureText(p.text).width + size * 1.1, p.work >= 0 || p.hull >= 0 ? size * 6 : 0);
    const h = size * 1.48;
    const px = clamp(x, w / 2 + 6, Math.max(w / 2 + 6, this.w - w / 2 - 6));
    const py = Math.min(y, this.h - h - size);
    const [edge, fill] = PLATE_TONES[p.tone];
    g.fillStyle = fill;
    g.strokeStyle = edge;
    g.lineWidth = Math.max(1.4, size * 0.13);
    g.beginPath();
    g.roundRect(px - w / 2, py - h / 2, w, h, h * 0.42);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fillText(p.text, px, py + size * 0.06);
    let top = py + h / 2 + size * 0.22;
    const bar = (k: number, color: string): void => {
      const bh = size * 0.5;
      g.fillStyle = '#0d2230';
      g.beginPath();
      g.roundRect(px - w / 2, top, w, bh, bh / 2);
      g.fill();
      const in_ = Math.max(1, size * 0.1);
      const full = w - in_ * 2;
      g.fillStyle = color;
      g.beginPath();
      g.roundRect(px - w / 2 + in_, top + in_, Math.max(bh - in_ * 2, full * clamp(k, 0, 1)), bh - in_ * 2, bh / 2);
      g.fill();
      top += bh + size * 0.12;
    };
    if (p.work >= 0) bar(p.work, '#ffb02e');
    if (p.hull >= 0) bar(p.hull, p.tone === 'friend' ? '#5fe0c8' : p.tone === 'care' ? '#b58cff' : '#ff5d4a');
  }

  draw(sim: GameSimulation, cam: THREE.Camera, fade: number, shift: THREE.Vector3): void {
    const live = fade > 0.01;
    const plates = live ? platesFor(sim) : [];
    // fire and the netted dolphin carry a bar of their own
    const bars = live ? sim.entities.filter((e) => (e.kind === 'fire' || e.kind === 'dolphin') && e.maxHp >= 2 && e.hp < e.maxHp) : [];
    const texts = live && sim.floatingTexts.length > 0;
    const g = this.ctx;
    if (!texts && plates.length === 0 && bars.length === 0) {
      if (this.dirty) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.dirty = false;
        this.shown = '';
      }
      return;
    }
    const spots: [Plate, number, number][] = [];
    let sign = `${fade.toFixed(2)}`;
    for (const p of plates) {
      const q = this.project(cam, toX(p.x), 0.2, toZ(p.y) + p.drop, shift);
      if (!q || q[0] < -60 || q[0] > this.w + 60 || q[1] < -20 || q[1] > this.h + 20) continue;
      spots.push([p, q[0], q[1]]);
      sign += `|${p.text}${Math.round(q[0] * 2)},${Math.round(q[1] * 2)},${Math.round(p.work * 120)},${Math.round(p.hull * 120)}`;
    }
    for (const e of bars) sign += `|${e.id}:${Math.round(e.x)},${Math.round(e.y)},${Math.round((e.hp / e.maxHp) * 60)}`;
    if (!texts && this.dirty) {
      // a label that stays put is already on the canvas; one that moves is redrawn half as often as the sea
      if (sign === this.shown) return;
      const now = performance.now();
      if (now - this.lastPlates < 28 && !this.shown.startsWith('~')) return;
    }
    this.lastPlates = performance.now();
    // floating text leaves something to wipe even when the labels have not moved since
    this.shown = texts ? `~${sign}` : sign;
    this.dirty = true;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const u = this.h / 900;

    g.globalAlpha = fade;
    for (const [p, x, y] of spots) this.plate(p, x, y, u);

    for (const e of bars) {
      const p = this.project(cam, toX(e.x), 3.2, toZ(e.y), shift);
      if (!p) continue;
      const w = 56 * u;
      const h = 9 * u;
      g.fillStyle = '#0d2230';
      g.beginPath();
      g.roundRect(p[0] - w / 2 - 3 * u, p[1] - h / 2 - 3 * u, w + 6 * u, h + 6 * u, h);
      g.fill();
      g.fillStyle = '#27485a';
      g.beginPath();
      g.roundRect(p[0] - w / 2, p[1] - h / 2, w, h, h / 2);
      g.fill();
      const k = clamp(e.hp / e.maxHp, 0, 1);
      g.fillStyle = e.kind === 'fire' ? '#ff9a3d' : '#5fe0c8';
      g.beginPath();
      g.roundRect(p[0] - w / 2, p[1] - h / 2, Math.max(h, w * k), h, h / 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath();
      g.roundRect(p[0] - w / 2 + 2 * u, p[1] - h / 2 + 1.5 * u, Math.max(h, w * k) - 4 * u, h * 0.32, h / 4);
      g.fill();
    }

    for (const ft of sim.floatingTexts) {
      const t = ft.life / ft.maxLife;
      const pop = t < 0.14 ? lerp(0.3, 1.22, t / 0.14) : t < 0.26 ? lerp(1.22, 1, (t - 0.14) / 0.12) : 1;
      const a = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1;
      const p = this.project(cam, toX(ft.x), 2.2 + t * 2.4, toZ(ft.y), shift);
      if (!p) continue;
      const size = 27 * ft.scale * u * pop;
      const coin = ft.text.startsWith('+');
      g.globalAlpha = a * fade;
      g.font = `700 ${size.toFixed(1)}px Fredoka, "Baloo 2", "Trebuchet MS", sans-serif`;
      const tw = g.measureText(ft.text).width;
      let x = p[0];
      if (coin) {
        x += size * 0.42;
        const cx = p[0] - tw / 2 - size * 0.16;
        const cy = p[1];
        const rr = size * 0.42;
        g.fillStyle = '#3a1d06';
        g.beginPath();
        g.arc(cx, cy + size * 0.03, rr + size * 0.1, 0, 7);
        g.fill();
        g.fillStyle = '#f2a51c';
        g.beginPath();
        g.arc(cx, cy, rr, 0, 7);
        g.fill();
        g.fillStyle = '#ffd95a';
        g.beginPath();
        g.arc(cx, cy - rr * 0.08, rr * 0.78, 0, 7);
        g.fill();
        g.fillStyle = '#fff4c0';
        g.beginPath();
        g.ellipse(cx - rr * 0.28, cy - rr * 0.34, rr * 0.26, rr * 0.16, -0.6, 0, 7);
        g.fill();
      }
      g.lineWidth = size * 0.26;
      g.strokeStyle = '#0d2230';
      g.strokeText(ft.text, x, p[1] + size * 0.04);
      g.fillStyle = ft.color;
      g.fillText(ft.text, x, p[1]);
      if (ft.subtext) {
        const s2 = size * 0.56;
        g.font = `700 ${s2.toFixed(1)}px Fredoka, "Baloo 2", "Trebuchet MS", sans-serif`;
        g.lineWidth = s2 * 0.3;
        g.strokeText(ft.subtext, p[0], p[1] - size * 0.82);
        g.fillStyle = '#ffffff';
        g.fillText(ft.subtext, p[0], p[1] - size * 0.82);
      }
    }
    g.globalAlpha = 1;
  }
}
