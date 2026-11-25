import * as THREE from 'three';
import type { Wave } from '../types';
import type { GameSimulation } from '../simulation';
import { fsMaterial, FullScreen, G, GLSL_LIGHT, GLSL_UNIFORMS, qualityDefines } from './gfx';
import type { Look } from './look';
import { Q } from './quality';
import { clamp, shoreAt, smooth, toX, toZ, UNIT } from './space';
import { SEA_ROCKS, COLLECTOR_NET, CORAL_CLUSTERS } from '../world';

/**
 * The lagoon.
 *  1. Every simulation wave is stamped into a displacement field (sideways, up, foam, energy).
 *  2. A foam buffer ages that foam into lingering lace; a ripple buffer runs a small wave equation.
 *  3. The surface mesh is displaced by the field, so crests are geometry and overlapping waves add up
 *     into real water instead of stacking glowing strokes.
 */
export const FIELD = { x: -50, z: -48, w: 128, h: 96 };
const MAX_STAMPS = 96;

export interface Stamp {
  x: number;
  z: number;
  radius: number;
  height: number;
  foam: number;
  impulse: number;
  gold: number;
}

/** World-space shape of one simulation wave, shared by the GPU stamp and the CPU height query. */
export interface Crest {
  ring: boolean;
  x: number;
  z: number;
  dx: number;
  dz: number;
  half: number;
  amp: number;
  bow: number;
  radius: number;
  alpha: number;
  gold: number;
  seed: number;
  speed: number;
  foam: number;
}

export function crestOf(w: Wave): Crest {
  const t = w.age / w.maxAge;
  const alpha = Math.sin(Math.min(1, t * 5) * Math.PI * 0.5) * (1 - Math.pow(t, 2.1));
  const ring = w.kind === 'ripple' || w.kind === 'resonance' || w.kind === 'buoy_pulse';
  const half = w.crestWidth * 0.5 * UNIT * 1.1;
  const power = clamp(w.power, 0.4, 6);
  let amp: number;
  if (w.kind === 'resonance') amp = 2.0;
  else if (w.kind === 'buoy_pulse') amp = 0.95;
  else if (w.kind === 'ripple') amp = 1.4 + w.charge * 0.9;
  else amp = 1.85 + half * 0.085 + w.charge * 1.45 + Math.min(1.1, (power - 1) * 0.3);
  if (w.kind === 'echo') amp *= 0.8;
  return {
    ring,
    x: toX(w.x),
    z: toZ(w.y),
    dx: Math.cos(w.angle),
    dz: Math.sin(w.angle),
    half,
    amp: amp * (ring ? 1 - t * 0.35 : 1),
    bow: 1.1 + half * 0.34 + w.charge * 0.9,
    radius: w.radius * UNIT,
    alpha: clamp(alpha, 0, 1),
    gold: w.kind === 'resonance' ? 1 : w.charge > 0.65 ? 0.35 : 0,
    seed: (w.id * 0.618) % 1,
    speed: Math.hypot(w.vx, w.vy) * UNIT,
    foam: w.kind === 'buoy_pulse' ? 0.35 : w.kind === 'ripple' ? 0.6 : 1,
  };
}

export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  /** Uniforms other materials need to float on this surface. */
  readonly shared: Record<string, THREE.IUniform>;
  private field: THREE.WebGLRenderTarget;
  private foam: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private ripple: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private fieldSize: [number, number];
  private foamSize: [number, number];
  private rippleSize: [number, number];
  private gridStep: number;
  private calmTimer = 5;
  private stampCam = new THREE.OrthographicCamera(FIELD.x, FIELD.x + FIELD.w, FIELD.z + FIELD.h, FIELD.z, -10, 10);
  readonly stampScene = new THREE.Scene();
  private stampGeo: THREE.InstancedBufferGeometry;
  private a0: THREE.InstancedBufferAttribute;
  private a1: THREE.InstancedBufferAttribute;
  private a2: THREE.InstancedBufferAttribute;
  private foamMat: THREE.ShaderMaterial;
  private rippleMat: THREE.ShaderMaterial;
  private nrm: THREE.WebGLRenderTarget | null = null;
  private stamps: Stamp[] = [];
  crests: Crest[] = [];
  private acc = 0;
  /** 0 on the play camera, 1 down at the water, where a crest needs a lip that really curls. */
  private cine = { value: 0 };
  private grid: THREE.BufferGeometry;
  private hero: THREE.BufferGeometry | null = null;

  constructor() {
    const half = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false } as const;
    this.fieldSize = [...Q.field];
    this.foamSize = [...Q.foam];
    this.rippleSize = [...Q.ripple];
    this.gridStep = Q.grid;
    this.field = new THREE.WebGLRenderTarget(...this.fieldSize, { ...half, count: 2, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const mk = (w: number, h: number): THREE.WebGLRenderTarget =>
      new THREE.WebGLRenderTarget(w, h, { ...half, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.foam = [mk(...this.foamSize), mk(...this.foamSize)];
    this.ripple = [mk(...this.rippleSize), mk(...this.rippleSize)];

    /* ---------------- stamps ---------------- */
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.a0 = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.a1 = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.a2 = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('a0', this.a0);
    g.setAttribute('a1', this.a1);
    g.setAttribute('a2', this.a2);
    g.instanceCount = 0;
    this.stampGeo = g;
    const stampMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { uNoise: G.uNoise, uTime: G.uTime, uCine: this.cine },
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      vertexShader: /* glsl */ `
in vec4 a0; // x z dx dz
in vec4 a1; // half amp bow kind
in vec4 a2; // radius alpha gold seed
out vec2 vL; out vec4 v1; out vec4 v2; out vec2 vDir; out vec2 vXZ;
void main(){
  v1 = a1; v2 = a2; vDir = a0.zw;
  vec2 ext; vec2 off = vec2(0.);
  if (a1.w < .5){ ext = vec2(16., a1.x * 1.3 + 1.6); off.x = -6.; }
  else if (a1.w < 1.5){ ext = vec2(a2.x + 6.); }
  else { ext = vec2(a2.x * 1.6 + .4); }
  vL = position.xy * ext + off;
  vec2 f = a0.zw; vec2 l = vec2(-f.y, f.x);
  vec2 xz = a0.xy + (a1.w < .5 ? f * vL.x + l * vL.y : vL);
  vXZ = xz;
  gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, xz.y, 0., 1.);
}`,
      fragmentShader: /* glsl */ `
precision highp float;
uniform sampler2D uNoise; uniform float uTime, uCine;
in vec2 vL; in vec4 v1; in vec4 v2; in vec2 vDir; in vec2 vXZ;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
float sat(float x){ return clamp(x, 0., 1.); }
void crest(float d, float A, float env, float seed, float along, float foamK, out float h, out float lean, out float foam, out float wake, out float turb, out float face){
  float wf = .42 + .2 * A;
  float wb = 1.15 + .56 * A;
  float prof = d > 0. ? exp(-(d * d) / (wf * wf)) : exp(-(d * d) / (wb * wb));
  float trough = -.17 * exp(-pow((d - wf * 2.3) / (wf * 1.7), 2.));
  float swell2 = .16 * exp(-pow((d + wb * 2.3) / (wb * .95), 2.)) - .1 * exp(-pow((d + wb * 1.55) / (wb * .6), 2.));
  h = A * (prof + trough + swell2);
  lean = A * mix(.42, .66, uCine) * pow(prof, mix(1.6, 2., uCine));
  vec2 nq = vec2(along * .16 + seed * 7., d * .12 - uTime * .55);
  float n = texture(uNoise, nq).a;
  float n2 = texture(uNoise, nq * vec2(2.3, .8) + .4).b;
  // scalloped lip right on the crest; everything behind it stays clear so the form reads
  float scal = (n - .5) * .5 + (n2 - .5) * .3;
  float lipW = .42 + .13 * A;
  if (uCine > .01){
    // up close the lip is a row of rounded bulbs, not fingers
    float b1 = texture(uNoise, vec2(along * .07 + seed * 3., d * .05 - uTime * .08)).r;
    float b2 = texture(uNoise, vec2(along * .19 + seed, d * .12 - uTime * .15)).r;
    float bub = sqrt(max(0., 1. - b1 * b1 * 1.8)) * .6 + sqrt(max(0., 1. - b2 * b2 * 1.8)) * .4;
    scal = mix(scal, (bub - .62) * .9, uCine);
    lipW *= 1. - .36 * uCine;
  }
  float lip = smoothstep(lipW * 1.6, lipW * .5, d - scal * lipW * 1.6) * smoothstep(-lipW * 1.5, -lipW * .35, d + scal * lipW * 2.2);
  float drip = smoothstep(wf * 2.1, wf * .6, d) * step(0., d) * smoothstep(.56, .64, n) * smoothstep(.9, 2., A) * (1. - .85 * uCine);
  float sway = texture(uNoise, vec2(along * .012 + seed, uTime * .16 + seed * 5.)).b - .5;
  float rib = texture(uNoise, vec2(along * .038 + seed * 3. + sway * .12, uTime * .42 + seed)).a * .62 + texture(uNoise, vec2(along * .021 - sway * .2 + seed, uTime * .3)).b * .38;
  foam = max(lip * 1.2, drip) * env * foamK;
  wake = smoothstep(.35, .95, prof) * step(d, wf) * (.16 + .84 * smoothstep(.42, .62, rib)) * env * foamK;
  turb = prof * env;
  face = exp(-pow((d - wf * .7) / (wf * .75), 2.)) * env;
}
void main(){
  float kind = v1.w;
  float alpha = v2.y, gold = v2.z, seed = v2.w;
  float amp = v1.y;
  if (kind < .5){
    float half_ = v1.x;
    float l = vL.y / half_;
    float al = abs(l);
    float env = pow(sat(1. - pow(al, mix(2.8, 2.1, uCine))), mix(.85, 1.15, uCine));
    float wob = texture(uNoise, vec2(vL.y * .05 + seed * 5., uTime * .12 + seed)).b - .5;
    float d = vL.x + v1.z * l * l + wob * 1.1;
    float A = amp * env * alpha * (1. + wob * .5);
    float h, lean, foam, wake, turb, face;
    crest(d, max(A, .001), env * alpha, seed, vL.y, amp > 1. ? sat(.5 + amp * .2) : .4, h, lean, foam, wake, turb, face);
    // wake spiralling off both tips
    float tip = exp(-pow((al - 1.0) * half_ / .8, 2.)) * smoothstep(-6.5, -.6, d) * smoothstep(.5, -.5, d);
    foam += tip * .35 * alpha;
    wake += tip * .7 * alpha;
    vec2 disp = vDir * lean;
    o0 = vec4(disp.x, h, disp.y, foam);
    o1 = vec4(gold * turb, wake, face, turb * .9 + tip * .5);
  } else if (kind < 1.5){
    float r = length(vL);
    vec2 dir = vL / max(r, .001);
    float ang = atan(vL.y, vL.x);
    float wob = texture(uNoise, vec2(ang * .16 + seed, uTime * .1 + seed * 3.)).b - .5;
    float d = r - v2.x + wob * 1.2;
    float A = amp * alpha * (1. + wob * .6);
    float h, lean, foam, wake, turb, face;
    crest(d, max(A, .001), alpha, seed, ang * max(v2.x, 2.), v1.x, h, lean, foam, wake, turb, face);
    // rings pull a smooth bowl behind them
    foam *= 1. + gold * .3;
    vec2 disp = dir * lean;
    o0 = vec4(disp.x, h, disp.y, foam);
    o1 = vec4(gold * turb, wake, face, turb * .6);
  } else {
    float r = length(vL) / v2.x;
    float k = sat(1. - r);
    k = k * k * (3. - 2. * k);
    float n = texture(uNoise, vXZ * .13 + seed).a;
    o0 = vec4(0., amp * k, 0., v1.x * smoothstep(.1, .6, k + (n - .5) * .7));
    o1 = vec4(gold * k, v1.x * k, 0., v1.z * k);
  }
}`,
    });
    const stampMesh = new THREE.Mesh(g, stampMat);
    stampMesh.frustumCulled = false;
    this.stampScene.add(stampMesh);
    this.stampCam.position.set(0, 0, 5);

    /* ---------------- foam ageing ---------------- */
    this.foamMat = fsMaterial(
      /* glsl */ `
varying vec2 vUv;
uniform sampler2D tPrev, tF0, tF1, uNoise;
uniform float uDt, uTime;
uniform vec2 uTexel, uSize;
void main(){
  vec2 w = texture2D(uNoise, vUv * vec2(1.7, 1.3) + uTime * .004).ba - .5;
  vec2 flow = w * .55 + vec2(-.12, .02);
  vec2 uv = vUv - flow * uDt / uSize;
  vec4 p = texture2D(tPrev, uv);
  vec4 q = texture2D(tPrev, uv + vec2(uTexel.x, 0.)) + texture2D(tPrev, uv - vec2(uTexel.x, 0.)) + texture2D(tPrev, uv + vec2(0., uTexel.y)) + texture2D(tPrev, uv - vec2(0., uTexel.y));
  p = mix(p, q * .25, min(1., uDt * 2.2));
  vec4 f0 = texture2D(tF0, vUv);
  vec4 f1 = texture2D(tF1, vUv);
  float fresh = max(p.r * exp(-uDt * 9.), min(1.3, f0.a));
  float nz = texture2D(uNoise, vUv * vec2(5.3, 4.) + .3).b;
  float lace = p.g * exp(-uDt * (.8 + 1.3 * nz)) - uDt * (.04 + .07 * nz);
  lace = max(max(0., lace), min(.85, f1.g));
  float gold = max(p.b * exp(-uDt * 2.4), f1.r);
  float stir = max(p.a * exp(-uDt * .8), min(1., f1.g * .8 + f1.a * .6));
  gl_FragColor = vec4(fresh, lace, gold, stir);
}`,
      {
        tPrev: { value: null },
        tF0: { value: null },
        tF1: { value: null },
        uNoise: G.uNoise,
        uDt: { value: 0.016 },
        uTime: G.uTime,
        uTexel: { value: new THREE.Vector2(1 / Q.foam[0], 1 / Q.foam[1]) },
        uSize: { value: new THREE.Vector2(FIELD.w, FIELD.h) },
      }
    );

    /* ---------------- ripple wave equation ---------------- */
    this.rippleMat = fsMaterial(
      /* glsl */ `
varying vec2 vUv;
uniform sampler2D tPrev, tF0, tF1, uGroundTex;
uniform vec4 uGroundRect;
uniform vec4 uFieldRect;
uniform vec2 uTexel;
uniform float uKick;
void main(){
  vec2 c = texture2D(tPrev, vUv).rg;
  float n = texture2D(tPrev, vUv + vec2(0., uTexel.y)).r;
  float s = texture2D(tPrev, vUv - vec2(0., uTexel.y)).r;
  float e = texture2D(tPrev, vUv + vec2(uTexel.x, 0.)).r;
  float w = texture2D(tPrev, vUv - vec2(uTexel.x, 0.)).r;
  float v = c.g + ((n + s + e + w) * .25 - c.r) * .9;
  v *= .982;
  float h = (c.r + v) * .996;
  float imp = texture2D(tF1, vUv).a;
  h += (imp - h) * min(.5, abs(imp) * .12) * uKick;
  vec2 xz = uFieldRect.xy + vec2(vUv.x, vUv.y) * uFieldRect.zw;
  float g = texture2D(uGroundTex, (xz - uGroundRect.xy) / uGroundRect.zw).r;
  h *= smoothstep(.12, -.25, g);
  vec2 b = min(vUv, 1. - vUv);
  h *= smoothstep(0., .03, min(b.x, b.y));
  gl_FragColor = vec4(clamp(h, -2., 2.), clamp(v, -2., 2.), 0., 1.);
}`,
      {
        tPrev: { value: null },
        tF0: { value: null },
        tF1: { value: null },
        uGroundTex: G.uGroundTex,
        uGroundRect: G.uGroundRect,
        uFieldRect: { value: new THREE.Vector4(FIELD.x, FIELD.z, FIELD.w, FIELD.h) },
        uTexel: { value: new THREE.Vector2(1 / Q.ripple[0], 1 / Q.ripple[1]) },
        uKick: { value: 1 },
      }
    );

    /* ---------------- surface ---------------- */
    const initDefs: Record<string, number> = { ...qualityDefines(), WATER_DETAIL: Q.waterDetail };
    if (Q.cached) initDefs.SPLIT_WATER = 1;
    this.material = new THREE.ShaderMaterial({
      defines: initDefs,
      uniforms: {
        ...G,
        tWave: { value: this.field.textures[0] },
        tWave1: { value: this.field.textures[1] },
        tFoam: { value: this.foam[0].texture },
        tRipple: { value: this.ripple[0].texture },
        tNrm: { value: null },
        tScene: { value: null },
        tDepth: { value: null },
        uWaterSurfRes: { value: new THREE.Vector2(1, 1) },
        uInvVP: { value: new THREE.Matrix4() },
        uNearFar: { value: new THREE.Vector2(1, 1000) },
        uField: { value: new THREE.Vector4(FIELD.x, FIELD.z, FIELD.w, FIELD.h) },
        uShallow: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uDeep: { value: new THREE.Color() },
        uAbyss: { value: new THREE.Color() },
        uCrest: { value: new THREE.Color() },
        uFoamC: { value: new THREE.Color() },
        uFoamS: { value: new THREE.Color() },
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uCaustic: { value: 1 },
        uGlint: { value: 1 },
        uSheen: { value: 0 },
        uSwell: { value: 1 },
        uMurk: { value: 0 },
        uPxK: { value: 0.001 },
        uRain: { value: 0 },
        uRocks: { value: SEA_ROCKS.map((r) => new THREE.Vector3(toX(r.x), toZ(r.y), r.r * UNIT)) },
        uReefs: { value: CORAL_CLUSTERS.map((r) => new THREE.Vector3(toX(r.x), toZ(r.y), r.r * UNIT)) },
        uNet: { value: new THREE.Vector4(toX(COLLECTOR_NET.x), toZ(COLLECTOR_NET.y), 5, 0) },
        uCine: this.cine,
        uWaterActive: { value: 1 },
        uFrame: { value: new THREE.Vector4(0, 0, 1, 0) },
        uBend: { value: new THREE.Vector2(0, 1) },
      },
      vertexShader: /* glsl */ `
${GLSL_UNIFORMS}
uniform sampler2D tWave, tWave1, tRipple;
uniform vec4 uField;
uniform float uSwell;
uniform vec4 uFrame; uniform vec2 uBend;
varying vec3 vWP; varying vec2 vXZ; varying float vZ; varying float vH; varying float vSurf; varying vec3 vSw;
${WATER_FN}
void main(){
  // the grid can be laid along a crest: frame is origin and direction, bend is how far its tips trail
  float bl = min(abs(position.z) / uBend.y, 1.35);
  vec2 xz = uFrame.xy + uFrame.zw * (position.x - uBend.x * bl * bl) + vec2(-uFrame.w, uFrame.z) * position.z;
  vXZ = xz;
  float surf;
  vec3 sw;
  vec3 p = waterPosEx(xz, vH, surf, sw);
  vSurf = surf;
  vSw = sw;
  vWP = p;
  vec4 mv = viewMatrix * vec4(p, 1.);
  vZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: WATER_FRAG(SEA_ROCKS.length),
    });

    this.grid = this.buildGrid();
    this.mesh = new THREE.Mesh(this.grid, this.material);
    this.mesh.frustumCulled = false;
    const u = this.material.uniforms;
    this.shared = { tWave: u.tWave, tRipple: u.tRipple, uField: u.uField, uSwell: u.uSwell };
  }

  private buildGrid(): THREE.BufferGeometry {
    const axis = (a: number, b: number, step: number, loEnd: number, hiEnd: number): number[] => {
      const out: number[] = [];
      for (let k = 14; k >= 1; k--) out.push(a - (Math.pow(1.5, k) - 1) * (a - loEnd) / (Math.pow(1.5, 14) - 1));
      for (let v = a; v <= b + 1e-6; v += step) out.push(v);
      for (let k = 1; k <= 14; k++) out.push(b + (Math.pow(1.5, k) - 1) * (hiEnd - b) / (Math.pow(1.5, 14) - 1));
      return out;
    };
    return this.gridFrom(axis(-44, 68, Q.grid, -140, 900), axis(-44, 42, Q.grid, -900, 160));
  }

  /** A grid for close shots: dense across the crest it is laid along, ordinary everywhere else. */
  private buildHero(): THREE.BufferGeometry {
    const fine = Q.grid * 0.2;
    const axis = (core: number, step: number): number[] => {
      const out: number[] = [];
      for (let v = 0; v <= core; v += step) out.push(v);
      let v = out[out.length - 1];
      let s = step;
      while (v < 48) {
        s = Math.min(Q.grid, s * 1.04);
        out.push((v += s));
      }
      while (v < 940) out.push((v += s *= 1.28));
      return out;
    };
    const mirror = (a: number[]): number[] => [...a.slice(1).reverse().map((v) => -v), ...a];
    return this.gridFrom(mirror(axis(4.6, fine)), mirror(axis(20, Q.grid * 0.8)));
  }

  private gridFrom(xs: number[], zs: number[]): THREE.BufferGeometry {
    const W = xs.length;
    const H = zs.length;
    const pos = new Float32Array(W * H * 3);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        pos[(j * W + i) * 3] = xs[i];
        pos[(j * W + i) * 3 + 2] = zs[j];
      }
    }
    const idx = new Uint32Array((W - 1) * (H - 1) * 6);
    let k = 0;
    for (let j = 0; j < H - 1; j++) {
      for (let i = 0; i < W - 1; i++) {
        const a = j * W + i;
        idx[k++] = a;
        idx[k++] = a + W;
        idx[k++] = a + 1;
        idx[k++] = a + 1;
        idx[k++] = a + W;
        idx[k++] = a + W + 1;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  /** Bakes the fine-chop normal texture. Call once the noise exists. */
  init(r: THREE.WebGLRenderer, fs: FullScreen): void {
    const rt = new THREE.WebGLRenderTarget(512, 512, {
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: Q.waterDetail <= 1 ? THREE.LinearMipmapNearestFilter : THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: false,
      anisotropy: Q.waterDetail <= 1 ? 1 : 8,
    });
    const m = fsMaterial(
      /* glsl */ `
varying vec2 vUv; uniform sampler2D uNoise;
void main(){
  float e = 1.5 / 512.;
  vec2 a = vec2(texture2D(uNoise, vUv + vec2(e, 0.)).b - texture2D(uNoise, vUv - vec2(e, 0.)).b, texture2D(uNoise, vUv + vec2(0., e)).b - texture2D(uNoise, vUv - vec2(0., e)).b);
  vec2 b = vec2(texture2D(uNoise, vUv + vec2(e, 0.)).a - texture2D(uNoise, vUv - vec2(e, 0.)).a, texture2D(uNoise, vUv + vec2(0., e)).a - texture2D(uNoise, vUv - vec2(0., e)).a);
  gl_FragColor = vec4(a * 6. * .5 + .5, b * 3. * .5 + .5);
}`,
      { uNoise: G.uNoise }
    );
    fs.render(r, m, rt);
    r.setRenderTarget(null);
    m.dispose();
    this.nrm = rt;
    this.material.uniforms.tNrm.value = rt.texture;
    for (const t of [...this.foam, ...this.ripple, this.field]) {
      r.setRenderTarget(t);
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
    }
    r.setRenderTarget(null);
  }

  /** Live quality update without recreating the scene. */
  applyQuality(r: THREE.WebGLRenderer, splitWater: boolean): void {
    const prev = r.getRenderTarget();
    const clearRT = (t: THREE.WebGLRenderTarget): void => {
      r.setRenderTarget(t);
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
    };
    if (this.fieldSize[0] !== Q.field[0] || this.fieldSize[1] !== Q.field[1]) {
      this.fieldSize = [...Q.field];
      this.field.setSize(this.fieldSize[0], this.fieldSize[1]);
      clearRT(this.field);
    }
    if (this.foamSize[0] !== Q.foam[0] || this.foamSize[1] !== Q.foam[1]) {
      this.foamSize = [...Q.foam];
      for (const f of this.foam) {
        f.setSize(this.foamSize[0], this.foamSize[1]);
        clearRT(f);
      }
      this.foamMat.uniforms.uTexel.value.set(1 / this.foamSize[0], 1 / this.foamSize[1]);
    }
    if (this.rippleSize[0] !== Q.ripple[0] || this.rippleSize[1] !== Q.ripple[1]) {
      this.rippleSize = [...Q.ripple];
      for (const rp of this.ripple) {
        rp.setSize(this.rippleSize[0], this.rippleSize[1]);
        clearRT(rp);
      }
      this.rippleMat.uniforms.uTexel.value.set(1 / this.rippleSize[0], 1 / this.rippleSize[1]);
    }
    r.setRenderTarget(prev);

    if (Math.abs(this.gridStep - Q.grid) > 1e-4) {
      this.gridStep = Q.grid;
      const next = this.buildGrid();
      if (this.mesh.geometry === this.grid) this.mesh.geometry = next;
      this.grid.dispose();
      this.grid = next;
      if (this.hero) {
        if (this.mesh.geometry === this.hero) this.mesh.geometry = this.grid;
        this.hero.dispose();
        this.hero = null;
      }
    }

    const d = this.material.defines;
    let changed = false;
    const setDef = (k: string, on: boolean): void => {
      if (Boolean(d[k]) !== on) {
        if (on) d[k] = 1;
        else delete d[k];
        changed = true;
      }
    };
    setDef('LITE', Q.lite);
    setDef('ULTRA', Q.ultra);
    setDef('SPLIT_WATER', splitWater);
    if (d.WATER_DETAIL !== Q.waterDetail) {
      d.WATER_DETAIL = Q.waterDetail;
      changed = true;
    }
    if (changed) this.material.needsUpdate = true;
    if (this.nrm) {
      const wantMin = Q.waterDetail <= 1 ? THREE.LinearMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
      const wantAniso = Q.waterDetail <= 1 ? 1 : 8;
      if (this.nrm.texture.minFilter !== wantMin || this.nrm.texture.anisotropy !== wantAniso) {
        this.nrm.texture.minFilter = wantMin;
        this.nrm.texture.anisotropy = wantAniso;
        this.nrm.texture.needsUpdate = true;
      }
    }
    this.calmTimer = 5;
  }

  get nrmTexture(): THREE.Texture | null {
    return this.nrm?.texture ?? null;
  }

  /** Full-screen passes, so their shaders can be compiled ahead of time. */
  get passes(): THREE.Material[] {
    return [this.foamMat, this.rippleMat];
  }

  /** Renders one zero-amplitude stamp into the MRT field target so D3D11 compiles the pipeline upfront. */
  warmStamp(r: THREE.WebGLRenderer): void {
    const prev = r.getRenderTarget();
    this.a0.setXYZW(0, -999, -999, 1, 0);
    this.a1.setXYZW(0, 0, 0, 0, 0);
    this.a2.setXYZW(0, 1, 0, 0, 0);
    this.a0.needsUpdate = this.a1.needsUpdate = this.a2.needsUpdate = true;
    this.stampGeo.instanceCount = 1;
    r.setRenderTarget(this.field);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.render(this.stampScene, this.stampCam);
    r.clear(true, false, false);
    this.stampGeo.instanceCount = 0;
    r.setRenderTarget(prev);
  }

  splash(s: Partial<Stamp> & { x: number; z: number }): void {
    if (this.stamps.length > 40) return;
    this.stamps.push({ radius: 1, height: 0, foam: 0, impulse: 0, gold: 0, ...s });
  }

  applyLook(l: Look, murk: number): void {
    const u = this.material.uniforms;
    u.uShallow.value.copy(l.shallow);
    u.uMid.value.copy(l.mid);
    u.uDeep.value.copy(l.deep);
    u.uAbyss.value.copy(l.abyss);
    u.uCrest.value.copy(l.crest);
    u.uFoamC.value.copy(l.foam);
    u.uFoamS.value.copy(l.foamShade);
    u.uZenith.value.copy(l.zenith);
    u.uHorizon.value.copy(l.horizon);
    u.uGlow.value.copy(l.glow);
    u.uCaustic.value = l.caustic;
    u.uGlint.value = l.glint;
    u.uSheen.value = l.sheen;
    u.uSwell.value = l.swell;
    u.uRain.value = l.rain;
    u.uMurk.value = murk;
  }

  /** Lays the dense grid along the nearest big crest when the camera is down among them. */
  private follow(cam: THREE.Vector3): void {
    let best: Crest | null = null;
    let top = 0;
    if (this.cine.value > 0.05) {
      for (const c of this.crests) {
        if (c.ring || c.amp * c.alpha < 0.5) continue;
        const k = (c.amp * c.alpha) / (10 + Math.hypot(c.x - cam.x, c.z - cam.z));
        if (k > top) {
          top = k;
          best = c;
        }
      }
    }
    this.mesh.geometry = best ? (this.hero ??= this.buildHero()) : this.grid;
    const u = this.material.uniforms;
    u.uFrame.value.set(best ? best.x : 0, best ? best.z : 0, best ? best.dx : 1, best ? best.dz : 0);
    u.uBend.value.set(best ? best.bow : 0, best ? best.half : 1);
  }

  update(r: THREE.WebGLRenderer, fs: FullScreen, dt: number, sim: GameSimulation, cam: THREE.Vector3, cine: number): void {
    this.cine.value = cine;
    /* collect crests */
    this.crests.length = 0;
    let n = 0;
    for (const w of sim.waves) {
      if (n >= MAX_STAMPS - 44) break;
      const c = crestOf(w);
      if (c.alpha < 0.01) continue;
      this.crests.push(c);
      this.a0.setXYZW(n, c.x, c.z, c.dx, c.dz);
      this.a1.setXYZW(n, c.ring ? c.foam : c.half, c.amp, c.bow, c.ring ? 1 : 0);
      this.a2.setXYZW(n, c.radius, c.alpha, c.gold, c.seed);
      n++;
    }
    for (const s of this.stamps) {
      if (n >= MAX_STAMPS) break;
      this.a0.setXYZW(n, s.x, s.z, 1, 0);
      this.a1.setXYZW(n, s.foam, s.height, s.impulse, 2);
      this.a2.setXYZW(n, s.radius, 1, s.gold, (s.x * 13.7 + s.z * 7.1) % 1);
      n++;
    }
    this.stamps.length = 0;
    this.follow(cam);
    this.a0.needsUpdate = true;
    this.a1.needsUpdate = true;
    this.a2.needsUpdate = true;
    this.stampGeo.instanceCount = n;

    if (n > 0) {
      this.calmTimer = 6.5;
      this.material.uniforms.uWaterActive.value = 1;
    } else if (this.calmTimer <= 0) {
      this.acc = 0;
      this.material.uniforms.uWaterActive.value = 0;
      return;
    } else {
      this.calmTimer = Math.max(0, this.calmTimer - dt);
      this.material.uniforms.uWaterActive.value = 1;
    }

    r.setRenderTarget(this.field);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    if (n > 0) r.render(this.stampScene, this.stampCam);

    /* foam */
    this.foamMat.uniforms.tPrev.value = this.foam[0].texture;
    this.foamMat.uniforms.tF0.value = this.field.textures[0];
    this.foamMat.uniforms.tF1.value = this.field.textures[1];
    this.foamMat.uniforms.uDt.value = dt;
    fs.render(r, this.foamMat, this.foam[1]);
    this.foam.reverse();

    /* ripples, fixed step */
    this.acc = Math.min(this.acc + dt, 0.05);
    this.rippleMat.uniforms.tF0.value = this.field.textures[0];
    this.rippleMat.uniforms.tF1.value = this.field.textures[1];
    let kick = 1;
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      this.rippleMat.uniforms.tPrev.value = this.ripple[0].texture;
      this.rippleMat.uniforms.uKick.value = kick;
      kick = 0;
      fs.render(r, this.rippleMat, this.ripple[1]);
      this.ripple.reverse();
    }
    this.material.uniforms.tFoam.value = this.foam[0].texture;
    this.material.uniforms.tRipple.value = this.ripple[0].texture;
  }

  /** CPU mirror of the surface, good enough to float props and trash on. */
  heightAt(x: number, z: number, t: number, swell: number): number {
    const d = x - shoreAt(z);
    const deep = smooth(0.4, 7, d);
    let h = 0;
    for (let i = 0; i < SWELLS.length; i++) {
      const s = SWELLS[i];
      h += Math.sin((x * s[0] + z * s[1]) * s[2] + t * s[3]) * s[4];
    }
    h *= swell * (0.3 + 0.7 * deep);
    for (const c of this.crests) {
      const ox = x - c.x;
      const oz = z - c.z;
      let dd: number;
      let A = c.amp * c.alpha;
      if (c.ring) dd = Math.hypot(ox, oz) - c.radius;
      else {
        const f = ox * c.dx + oz * c.dz;
        const l = (-ox * c.dz + oz * c.dx) / c.half;
        const env = Math.pow(clamp(1 - Math.pow(Math.abs(l), 2.8), 0, 1), 0.85);
        if (env <= 0) continue;
        A *= env;
        dd = f + c.bow * l * l;
      }
      const wf = 0.42 + 0.2 * A;
      const wb = 1.15 + 0.56 * A;
      if (dd > wf * 3 || dd < -wb * 3) continue;
      h += A * Math.exp(-(dd * dd) / (dd > 0 ? wf * wf : wb * wb));
    }
    return Math.tanh(h / 4.6) * 4.6 * smooth(-0.2, 2.2, d);
  }

  dispose(): void {
    this.nrm?.dispose();
  }
}

/** Vertex-shader access to the surface: adds waterPos(xz, hWave, surf). Pair with Water.shared. */
export const FLOAT_HEAD = (): string => `
uniform sampler2D tWave, tRipple;
uniform vec4 uField;
uniform float uSwell;
${WATER_FN}`;

/** dirX, dirZ, k, speed, amplitude. Mirrored in GLSL below. */
const SWELLS: [number, number, number, number, number][] = [
  [0.95, -0.31, 0.34, 1.02, 0.15],
  [0.82, 0.57, 0.52, 1.31, 0.1],
  [0.45, -0.89, 0.93, 1.72, 0.052],
  [-0.2, 0.98, 1.55, 2.2, 0.026],
];

const swellGlsl = SWELLS.map(
  (s) => `
  { vec2 sd = vec2(${s[0].toFixed(3)}, ${s[1].toFixed(3)}); float sp = dot(xz, sd) * ${s[2].toFixed(3)} + uTime * ${s[3].toFixed(3)};
    float sa = ${s[4].toFixed(4)} * k; o.y += sin(sp) * sa; o.xz += sd * cos(sp) * sa * .8; g += sd * cos(sp) * sa * ${s[2].toFixed(3)}; }`
).join('');

export const WATER_FN = /* glsl */ `
#ifndef NZ_LOD
#define NZ_LOD(f) 0.
#endif
vec2 fieldUv(vec2 xz){ return (xz - uField.xy) / uField.zw; }
float inField(vec2 uv){ vec2 b = min(uv, 1. - uv); return smoothstep(0., .025, min(b.x, b.y)); }
float softH(float h){ return tanh(h / 4.6) * 4.6; }
vec3 swellAt(vec2 xz, float k, out vec2 g){
  vec3 o = vec3(0.); g = vec2(0.);
  ${swellGlsl}
  return o;
}
/** small breakers that roll up to the beach: x height, y breaking lip, z foam left behind it, w slope */
vec4 surfAt(float d, float z){
  float n = textureLod(uNoise, vec2(z * .013, uTime * .006), NZ_LOD(.013)).b;
  float n2 = textureLod(uNoise, vec2(z * .045 + 3., uTime * .012), NZ_LOD(.045)).a;
  float n3 = textureLod(uNoise, vec2(z * .17 + 1.7, uTime * .02), NZ_LOD(.17)).a;
  float ph = d * .44 + uTime * .74 + n * 9. + (n2 - .5) * .7 + (n3 - .5) * .3;
  float x = fract(ph / 6.2831);
  float id = floor(ph / 6.2831);
  float brk = textureLod(uNoise, vec2(z * .021 + id * .37, id * .173), NZ_LOD(.021)).a;
  float zone = smoothstep(15., 7., d) * smoothstep(-.6, 1.6, d);
  float lift = smoothstep(.36, .5, x) * (1. - smoothstep(.5, .92, x));
  float a = zone * smoothstep(.4, .6, brk + (n2 - .5) * .2);
  // Same finite difference along d without re-sampling the 4 z-only noise textures.
  float x2 = fract((ph + .22 * .44) / 6.2831);
  float lift2 = smoothstep(.36, .5, x2) * (1. - smoothstep(.5, .92, x2));
  float zone2 = smoothstep(15., 7., d + .22) * smoothstep(-.6, 1.6, d + .22);
  float a2 = zone2 * smoothstep(.4, .6, brk + (n2 - .5) * .2);
  float slope = (lift2 * a2 - lift * a) * (.38 / .22);
  float near = smoothstep(10.5, 3.5, d);
  float w = .006 + .017 * a * near;
  float line = smoothstep(.5 - w, .5 - w * .4, x) * (1. - smoothstep(.5 + w * .3, .5 + w * 1.3, x)) * smoothstep(.1, .5, a * near);
  float trail = smoothstep(.492, .5, x) * (1. - smoothstep(.5, .5 + .15 * a, x)) * a * near;
  return vec4(lift * a * .38, line, trail, slope);
}
vec3 waterPosEx(vec2 xz, out float hWave, out float surfF, out vec3 swOut){
  vec2 uv = fieldUv(xz);
  float inn = inField(uv);
  vec4 w = texture2D(tWave, uv) * inn;
  vec4 si = shoreInfo(xz.y);
  float d = xz.x - si.x;
  float gy = groundH(xz);
  float shoal = smoothstep(.1, -1.1, gy);
  float deep = smoothstep(.4, 7., d);
  w.y = softH(w.y);
  hWave = w.y * shoal;
  vec2 g;
  vec3 s = swellAt(xz, uSwell * (.3 + .7 * deep), g);
  swOut = vec3(g.x, g.y, s.y);
  vec4 sf = vec4(0.);
  if (d > -3. && d < 16.5) sf = surfAt(d, xz.y);
  surfF = sf.y;
  float rip = texture2D(tRipple, uv).r * inn;
  vec3 p = vec3(xz.x, 0., xz.y);
  p.xz += w.xz * shoal;
  p.y += hWave + s.y * shoal + sf.x * smoothstep(.25, -.5, gy) + rip * .32 * shoal;
  p.xz += s.xz * shoal;
  p.y += si.y * smoothstep(6.5, .5, d);
  return p;
}
vec3 waterPos(vec2 xz, out float hWave, out float surfF){
  vec3 sw_;
  return waterPosEx(xz, hWave, surfF, sw_);
}
`;

const WATER_FRAG = (rocks: number): string => /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_LIGHT}
#include <packing>
uniform sampler2D tWave, tWave1, tFoam, tRipple, tNrm, tScene, tDepth;
uniform vec2 uWaterSurfRes;
uniform mat4 uInvVP;
uniform vec2 uNearFar;
uniform vec4 uField;
uniform vec3 uShallow, uMid, uDeep, uAbyss, uCrest, uFoamC, uFoamS, uZenith, uHorizon, uGlow;
uniform float uCaustic, uGlint, uSheen, uSwell, uMurk, uRain, uPxK, uCine, uWaterActive;
uniform vec3 uRocks[${rocks}];
uniform vec4 uNet;
varying vec3 vWP; varying vec2 vXZ; varying float vZ; varying float vH; varying float vSurf; varying vec3 vSw;

// World units per pixel. Noise is always fetched with an explicit level, which is what lets the
// branches below be real: open water skips everything that belongs to crests, beach and rocks.
float pxw;
#define NZ_LOD(f) max(0., log2(pxw * (f) * 512.))
${WATER_FN}
vec4 nz(vec2 uv, float f){ return textureLod(uNoise, uv, NZ_LOD(f)); }

vec3 worldAt(vec2 uv, float z){
  vec4 p = uInvVP * vec4(uv * 2. - 1., z * 2. - 1., 1.);
  return p.xyz / p.w;
}
float lin(float z){ return -perspectiveDepthToViewZ(z, uNearFar.x, uNearFar.y); }
float shadowAt(vec3 wp){
  vec4 sc = uShadowMat * vec4(wp + vec3(0., .14, 0.) + uSunDir * .05, 1.);
  vec3 p = sc.xyz / sc.w * .5 + .5;
  vec2 e = min(p.xy, 1. - p.xy);
  float edge = smoothstep(0., .04, min(e.x, e.y));
  if (edge <= 0. || p.z > 1.) return 1.;
  float z = p.z - .0009;
  #if WATER_DETAIL <= 1
    return mix(1., textureLod(uShadowMap, vec3(p.xy, z), 0.), edge);
  #else
    vec2 t = uShadowTexel * 1.3;
    float s = textureLod(uShadowMap, vec3(p.xy, z), 0.);
    s += textureLod(uShadowMap, vec3(p.xy + t * vec2( .9,  .4), z), 0.);
    s += textureLod(uShadowMap, vec3(p.xy + t * vec2(-.4,  .9), z), 0.);
    s += textureLod(uShadowMap, vec3(p.xy + t * vec2(-.9, -.4), z), 0.);
    s += textureLod(uShadowMap, vec3(p.xy + t * vec2( .4, -.9), z), 0.);
    return mix(1., s * .2, edge);
  #endif
}
float web(vec2 p, float t){
  vec4 w4 = nz(p * .032 + vec2(t * .011, -t * .008), .032);
  vec2 w = w4.ba - .5;
  float thick = .07 + .16 * w4.b;
  float a = nz(p * .115 + w * .16 + vec2(t * .012, t * .006), .115).g;
  float l = 1. - smoothstep(thick * .25, thick, a);
  #if WATER_DETAIL >= 2
    float b = nz(p * .27 - w * .14 - vec2(t * .009, -t * .013), .27).g;
    l = max(l, (1. - smoothstep(.02, .17, b)) * .62);
  #endif
  return l;
}
float causticAt(vec2 p){
  float t = uTime;
  vec2 w = nz(p * .035 + t * .008, .035).ba - .5;
  float a = nz(p * .056 + w * .12 + vec2(t * .011, t * .006), .056).g;
  float b = nz(p * .044 - w * .1 - vec2(t * .009, -t * .012), .044).g;
  float m = min(a, b);
  return pow(1. - smoothstep(0., .22, m), 2.2);
}
/** foam that erodes into rounded islands as it thins */
float laceMask(float amt, vec2 p){
  #if WATER_DETAIL <= 1
  vec4 n1 = nz(p * .056, .056);
  vec4 n2 = nz(p * .115 + (n1.ba - .5) * .25 + .4, .115);
  float n = n1.b * .74 + n2.a * .34 + (.5 - n2.r) * .34;
  #else
  vec2 q = p + (nz(p * .05, .05).ba - .5) * 2.6;
  float n = nz(q * .056, .056).b * .8 + nz(q * .1 + .4, .1).a * .34 + (.5 - nz(q * .12, .12).r) * .34;
  #endif
  n = sat((n - .36) / .46);
  float th = 1. - amt;
  return smoothstep(th - .05, th + .13, n) * smoothstep(.0, .1, amt);
}
/** foam that opens into round holes until only filaments are left, the way a real wash does */
float holes(float amt, vec2 p){
  #if WATER_DETAIL <= 1
  vec2 w = nz(p * .06 + uTime * .006, .06).ba - .5;
  float c = nz((p + w * 2.2) * .115, .115).r * 1.04;
  #else
  vec2 q = p + (nz(p * .06 + uTime * .006, .06).ba - .5) * 2.2;
  float c = nz(q * .105, .105).r * .78 + nz(q * .27 + .37, .27).r * .3;
  #endif
  float th = .06 + (1. - sat(amt)) * .9;
  return smoothstep(th - .02, th + .11, c) * smoothstep(0., .2, amt);
}
/** connected threads of foam: wide and closed when fresh, thinning to a net as it ages */
float threads(float amt, vec2 p){
  #if WATER_DETAIL <= 1
  vec4 w4 = nz(p * .055 + vec2(uTime * .012, -uTime * .009), .055);
  vec2 w = w4.ba - .5;
  float a = nz(p * .145 + w * .42, .145).g;
  float thin = .35 + 1.1 * w4.b;
  float t = (.04 + .26 * amt * amt) * thin + pxw * .62;
  float l = 1. - smoothstep(t * .4, t, a);
  #else
  vec2 w = nz(p * .045 + vec2(uTime * .012, -uTime * .009), .045).ba - .5;
  float a = nz(p * .145 + w * .42, .145).g;
  float thin = .35 + 1.1 * nz(p * .07 + .6, .07).b;
  float t = (.04 + .26 * amt * amt) * thin + pxw * .62;
  float l = 1. - smoothstep(t * .4, t, a);
  float b = nz(p * .36 - w * .34 + .3, .36).g;
  l = max(l, (1. - smoothstep(t * .2, t * .62, b)) * smoothstep(.2, .6, amt) * .85 * smoothstep(.14, .06, pxw));
  #endif
  return l * smoothstep(.03, .52, amt);
}
/** crest foam; on a steep face the pattern is laid along the wall instead of smeared down it */
float crestFoam(float amt, vec2 p, float h, vec2 wd, float steep){
  float m = laceMask(amt, p * 1.25);
  if (steep > .01){
    vec2 q = vec2(dot(p, vec2(-wd.y, wd.x)), h * 1.1);
    q += (nz(q * .07, .07).ba - .5) * 1.2;
    float n = nz(q * .1 + .2, .1).b * .5 + (.66 - nz(q * .16, .16).r) * .5 + (.6 - nz(q * .42 + .3, .42).r) * .26;
    n = sat((n - .17) / .46);
    float th = 1. - amt;
    m = mix(m, smoothstep(th - .03, th + .07, n) * smoothstep(0., .1, amt), steep);
  }
  return m;
}
void main(){
  vec2 xz = vXZ;
  vec4 si = shoreInfo(xz.y);
  float d = xz.x - si.x;
  vec4 gInfo = groundInfo(vWP.xz);
  float gy = gInfo.r;
  #ifdef SPLIT_WATER
  // Deep inland under the forest: never visible, but keep a 4 m shoreline apron for smooth bilinear upsample.
  if (d < -4. && gy > 1.2) discard;
  #endif
  float reefK = gInfo.g;
  float rockNear = gInfo.b;
  vec2 fuv = fieldUv(xz);
  float inn = inField(fuv);
  float depth = max(vWP.y - gy, 0.);
  float shoal = smoothstep(.1, -1.1, gy);
  float far = smoothstep(120., 420., vZ);
  vec3 V = normalize(cameraPosition - vWP);
  pxw = vZ * uPxK / sqrt(max(V.y, .12));

  vec4 w0 = vec4(0.), fm = vec4(0.);
  vec2 rp = vec2(0.);
  if (uWaterActive > .5 && inn > .001){
    w0 = textureLod(tWave, fuv, 0.) * inn;
    fm = textureLod(tFoam, fuv, 0.) * inn;
    rp = textureLod(tRipple, fuv, 0.).rg * inn;
  }
  float hf = softH(w0.y) * shoal;
  float fw = fwidth(hf) * .9 + .012 + .05 * uCine;
  bool crest = abs(w0.y) + w0.a > .006;
  bool surf = d > -3. && d < 16.5 && far < .5;

  // ---------------- normal, from the displaced neighbours
  vec3 dwx = vec3(0.), dwz = vec3(0.);
  float face = 0.;
  if (crest){
    vec2 e = vec2(.16, 0.);
    vec3 wx1 = textureLod(tWave, fieldUv(xz + e.xy), 0.).xyz, wx0 = textureLod(tWave, fieldUv(xz - e.xy), 0.).xyz;
    vec3 wz1 = textureLod(tWave, fieldUv(xz + e.yx), 0.).xyz, wz0 = textureLod(tWave, fieldUv(xz - e.yx), 0.).xyz;
    wx1.y = softH(wx1.y); wx0.y = softH(wx0.y); wz1.y = softH(wz1.y); wz0.y = softH(wz0.y);
    dwx = (wx1 - wx0) / (2. * e.x) * shoal * inn;
    dwz = (wz1 - wz0) / (2. * e.x) * shoal * inn;
    face = textureLod(tWave1, fuv, 0.).b * inn;
  }
  #if WATER_DETAIL <= 1
  vec2 sg = vSw.xy;
  float swH = vSw.z;
  #else
  vec2 sg; float swH = swellAt(xz, uSwell * (.3 + .7 * smoothstep(.4, 7., d)), sg).y;
  #endif
  vec4 sfc = vec4(0.);
  float surfG = 0.;
  if (surf){
    sfc = surfAt(d, xz.y);
    surfG = sfc.w;
  }
  vec2 rg = vec2(0.);
  if (abs(rp.x) + abs(rp.y) > .002){
    vec2 re = .3 / uField.zw;
    float rx = textureLod(tRipple, fuv + vec2(re.x, 0.), 0.).r - textureLod(tRipple, fuv - vec2(re.x, 0.), 0.).r;
    float rz = textureLod(tRipple, fuv + vec2(0., re.y), 0.).r - textureLod(tRipple, fuv - vec2(0., re.y), 0.).r;
    rg = vec2(rx, rz) * .32 / .6 * inn * shoal;
  }
  vec3 Tx = vec3(1. + dwx.x, dwx.y + sg.x * shoal + surfG + rg.x, dwx.z);
  vec3 Tz = vec3(dwz.x, dwz.y + sg.y * shoal + rg.y, 1. + dwz.z);
  vec3 Nb = normalize(cross(Tz, Tx));
  vec2 wd = w0.xz / (length(w0.xz) + 1e-4);
  float steep = crest ? smoothstep(.2, .62, 1. - Nb.y) * uCine : 0.;
  #if WATER_DETAIL == 0
  // Single normal-map fetch packs both fine and coarse chop octaves in xy + zw.
  vec4 c1 = texture2D(tNrm, xz * .068 + vec2(uTime * .013, -uTime * .014));
  vec2 chop = (c1.xy - .5) * 1.02 + (c1.zw - .5) * .34;
  #else
  vec4 c1 = texture2D(tNrm, xz * .052 + vec2(uTime * .011, -uTime * .016));
  vec4 c2 = texture2D(tNrm, xz * .117 - vec2(uTime * .021, uTime * .009));
  vec2 chop = (c1.xy - .5) * .9 + (c2.xy - .5) * .5 + (c2.zw - .5) * .16;
  #ifdef ULTRA
  vec4 c3 = texture2D(tNrm, xz * .26 + vec2(-uTime * .028, uTime * .019));
  chop += (c3.zw - .5) * .14 * (1. - far);
  #endif
  #endif
  chop *= (.55 + .3 * uSwell) * mix(.4, 1., smoothstep(.1, 2., depth)) * (1. - far * .8);
  vec3 N = normalize(Nb - vec3(chop.x, 0., chop.y) * .34);

  // ---------------- depth / refraction
  #ifdef SPLIT_WATER
  // Seabed ray thickness is already known from groundInfo; native composite supplies exact coral/rock depth.
  float thick = depth / max(V.y, .25);
  float path = min(thick * 1.03, 90.);
  #else
  vec2 suv = gl_FragCoord.xy / uWaterSurfRes;
  float rd0 = textureLod(tDepth, suv, 0.).x;
  float zs = lin(rd0);
  float thick = max(zs - vZ, 0.);
  vec3 uw0 = worldAt(suv, rd0);
  vec3 un = cross(dFdx(uw0), dFdy(uw0));
  vec2 off = (viewMatrix * vec4(N.x, 0., N.z, 0.)).xy * vec2(uWaterSurfRes.y / uWaterSurfRes.x, 1.) * .045 * sat(thick * .35) * (60. / (vZ + 20.));
  vec2 ruv = clamp(suv + off, .001, .999);
  vec3 uw = uw0;
  float rd = textureLod(tDepth, ruv, 0.).x;
  if (lin(rd) < vZ) ruv = suv;
  else uw = worldAt(ruv, rd);
  vec3 under = textureLod(tScene, ruv, 0.).rgb;
  float ud = max(vWP.y - uw.y, 0.);
  float path = min(distance(uw, vWP), 90.);
  #endif

  // ---------------- light in the water
  #if WATER_DETAIL == 0
  vec4 lowNz = nz(xz * .0085 + vec2(uTime * .0038, uTime * .0016), .0085);
  float cs = 1. - uCloud.x * smoothstep(uCloud.y, uCloud.y + .13, lowNz.b);
  float sh = d < 44. ? shadowAt(vWP) : 1.;
  #elif WATER_DETAIL == 1
  float cs = 1. - uCloud.x * smoothstep(uCloud.y, uCloud.y + .13, texture2D(uNoise, vWP.xz * .0062 + vec2(uTime * .0052, uTime * .0021)).b);
  float sh = d < 48. ? shadowAt(vWP) : 1.;
  #else
  float cs = cloudShade(vWP.xz);
  float sh = shadowAt(vWP);
  #endif
  float sunL = dot(uSunCol, vec3(.3, .5, .2));
  #ifndef SPLIT_WATER
  if (ud < 5. && uCaustic > .05){
    float ca = causticAt(uw.xz + uSunDir.xz * ud * .5);
    #ifdef ULTRA
    ca = pow(ca, .88) * 1.12;
    #endif
    under += (under * .85 + .05) * ca * uCaustic * smoothstep(.02, .55, ud) * exp(-ud * .72) * cs * mix(.35, 1., sh) * .62;
  }
  #endif

  float silt = 0.;
  if (uMurk > .01) silt = uMurk * smoothstep(.36, .66, nz(xz * .014 + vec2(uTime * .003, 0.), .014).b + .22 * smoothstep(40., 4., d)) * (1. - reefK * .75);
  float turb = (1. + uMurk * .5 + silt * 1.5) * mix(1., .62, reefK);
  vec3 T = exp(-path * vec3(.4, .16, .115) * turb);
  #ifndef SPLIT_WATER
  under = mix(under, under * vec3(.74, 1.02, 1.2) + vec3(.0, .012, .024), smoothstep(.02, .9, ud) * (1. - reefK * .6));
  #endif
  float k0 = 1. - exp(-depth * .25);
  #if WATER_DETAIL == 0
  float tier = k0 * 7. + (lowNz.a - .5) * .7;
  float drift = lowNz.b - .5;
  #else
  float tier = k0 * 7. + (nz(xz * .03, .03).b - .5) * .7;
  float drift = nz(xz * .0085 + vec2(uTime * .002, 0.), .0085).b - .5;
  #endif
  float kT = (floor(tier) + smoothstep(.36, .64, fract(tier))) / 7.;
  float k = mix(k0, kT, .6);
  vec3 body = mix(uShallow, uMid, smoothstep(.04, .42, k));
  body = mix(body, uDeep, smoothstep(.4, .78, k));
  body = mix(body, uAbyss, smoothstep(.76, 1., k));
  body *= 1. + drift * .3;
  body = mix(body, body * vec3(.86, .84, .56) + vec3(.03, .035, .0), uMurk * .5);
  body = mix(body, vec3(.1, .25, .13), silt * .36);
  float lightK = (.3 + .8 * sunL) * mix(.66, 1., cs) * mix(.8, 1., sh);
  body *= lightK;
  vec3 lampL = vec3(0.);
  if (uLampI > .01) lampL = lamps(vWP, vec3(0., 1., 0.));
  body += lampL * .1;
  #ifdef SPLIT_WATER
  vec3 col = body * (1. - T);
  float underK = 1.;
  #else
  vec3 col = under * T + body * (1. - T);
  #endif

  // ---------------- form shading: layered contour bands, like the tiers of a batik cloud
  float ndl = dot(Nb, uSunDir) - uSunDir.y;
  float hN = sat(hf * .42);
  float Lk = (.3 + .8 * sunL) * mix(.72, 1., cs) * mix(.85, 1., sh);
  vec3 crestC = uCrest * Lk;

  // rolling swell, and wavelets running in with it: a lit back, a dark toe
  if (d > 4. && far < .95){
    float swMul = 1. + swH * smoothstep(2., 14., d) * (1. - far) * .2;
    col *= swMul;
    #ifdef SPLIT_WATER
    underK *= swMul;
    #endif
    float u1 = dot(xz, vec2(.95, -.31)), v1 = dot(xz, vec2(.31, .95));
    #if WATER_DETAIL <= 1
    vec4 wn = nz(vec2(v1 * .011, u1 * .006 - uTime * .004), .011);
    float wv = (u1 * .4 + uTime * .62 + (wn.b - .5) * 10. + (wn.a - .5) * .9) / 6.2831;
    float wi = floor(wv), wx = fract(wv);
    float seg = smoothstep(.46, .62, fract(wn.a * 3.7 + wi * .31)) * smoothstep(5., 16., d) * (1. - far);
    #else
    float wv = (u1 * .4 + uTime * .62 + (nz(vec2(v1 * .008, u1 * .005 - uTime * .004), .008).b - .5) * 10. + (nz(vec2(v1 * .03, u1 * .012), .03).a - .5) * .9) / 6.2831;
    float wi = floor(wv), wx = fract(wv);
    float seg = smoothstep(.47, .6, nz(vec2(v1 * .014 + wi * .31, wi * .173 + uTime * .002), .014).a) * smoothstep(5., 16., d) * (1. - far);
    #endif
    float eA = .51 + pxw * .02;
    float wl = smoothstep(.36, .5, wx) * (1. - smoothstep(.5, eA, wx));
    float toeMul = 1. - .1 * seg * smoothstep(.5, eA, wx) * (1. - smoothstep(.51, .6, wx));
    col *= toeMul;
    #ifdef SPLIT_WATER
    underK *= toeMul;
    #endif
    col += crestC * seg * (wl * wl * .1 + smoothstep(.47, .5, wx) * (1. - smoothstep(.5, eA, wx)) * .12);
  }

  if (crest){
    // crests throw a shadow across the water
    vec2 sStep = uSunDir.xz / max(uSunDir.y, .3);
    float shade = 0.;
    #if WATER_DETAIL == 0
    const int MARCH = 2; const float STRIDE = .9;
    #elif WATER_DETAIL == 1
    const int MARCH = 4; const float STRIDE = .5;
    #elif defined(ULTRA)
    const int MARCH = 7; const float STRIDE = .29;
    #else
    const int MARCH = 5; const float STRIDE = .4;
    #endif
    for (int i = 1; i <= MARCH; i++){
      float s = float(i) * STRIDE;
      float hh = softH(textureLod(tWave, fieldUv(xz + sStep * s), 0.).y) * shoal * inn;
      shade = max(shade, smoothstep(.02, .42, hh - hf - s));
    }
    float cShMul = (1. - .3 * shade * (.3 + .7 * cs)) * (1. - .2 * smoothstep(-.035 + fw, -.035 - fw, hf) - .16 * smoothstep(-.13 + fw, -.13 - fw, hf));
    col *= cShMul;
    #ifdef SPLIT_WATER
    underK *= cShMul;
    float baseK = underK;
    #endif
    float lines = 0.;
    float th[6]; th[0] = .13; th[1] = .36; th[2] = .7; th[3] = 1.15; th[4] = 1.75; th[5] = 2.5;
    float mx[6]; mx[0] = .14; mx[1] = .28; mx[2] = .44; mx[3] = .6; mx[4] = .78; mx[5] = .92;
    vec3 base = col;
    for (int i = 0; i < 6; i++){
      float s0 = smoothstep(th[i] - fw, th[i] + fw, hf);
      vec3 tone = mix(mix(uMid, uCrest, .45) * 1.12 * Lk, crestC * 1.06, mx[i] * mx[i]);
      float bk = sat(mx[i] * 1.12);
      col = mix(col, mix(base, tone, bk), s0);
      #ifdef SPLIT_WATER
      underK = mix(underK, baseK * (1. - bk), s0);
      #endif
      float lw = .05 + th[i] * .05;
      lines = max(lines, s0 * (1. - smoothstep(th[i] + lw, th[i] + lw + fw * 1.6, hf)));
    }
    float lm = lines * .3 * (1. - .6 * uCine);
    col = mix(col, crestC * 1.08, lm);
    #ifdef SPLIT_WATER
    underK *= 1. - lm;
    #endif
    if (steep > .01){
      // water being drawn up the face
      float al = dot(xz, vec2(-wd.y, wd.x));
      float st = nz(vec2(al * .13, hf * .035 - uTime * .12), .13).a;
      float s2 = nz(vec2(al * .34 + .4, hf * .06 - uTime * .2), .34).a;
      float pull = smoothstep(.5, .64, st) * .6 + smoothstep(.52, .66, s2) * .4;
      float up = smoothstep(.05, .5, hf) * smoothstep(0., .5, face + .25);
      float pm = pull * steep * up * .3;
      col = mix(col, crestC * 1.04, pm);
      float sm = 1. - smoothstep(.5, .36, st) * steep * up * .16;
      col *= sm;
      #ifdef SPLIT_WATER
      underK *= (1. - pm) * sm;
      #endif
    }
  }
  float ndlMul = 1. + clamp(ndl, -.8, .6) * mix(.42, .62, hN) * mix(.5, 1., cs);
  col *= ndlMul;
  #ifdef SPLIT_WATER
  underK *= ndlMul;
  #endif
  // the hollow under a curling lip
  if (steep > .01){
    float hol = 1. - .38 * uCine * smoothstep(.25, -.45, Nb.y);
    col *= hol;
    #ifdef SPLIT_WATER
    underK *= hol;
    #endif
  }
  // thin water at the lip lets the sun through
  float back = pow(sat(dot(V, -uSunDir) * .5 + .62), 2.);
  float bm = sat(face * hN * (.35 + .6 * back)) * .6;
  col = mix(col, crestC * 1.1, bm);
  #ifdef SPLIT_WATER
  underK *= 1. - bm;
  #endif
  if (steep > .01){
    float stm = steep * smoothstep(.9, 3., hf) * .42;
    col = mix(col, crestC * 1.2, stm);
    #ifdef SPLIT_WATER
    underK *= 1. - stm;
    #endif
  }

  // ---------------- sky
  float ndv = sat(dot(N, V));
  float F = .025 + .975 * pow(1. - ndv, 5.);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = mix(uHorizon, uZenith, pow(sat(R.y * 1.15), .55));
  sky += uGlow * pow(sat(dot(R, uSunDir)), 24.) * .4;
  float fMix = F * .82;
  col = mix(col, sky, fMix);
  #ifdef SPLIT_WATER
  underK *= 1. - fMix;
  #endif
  vec3 Nh = normalize(Nb - vec3(chop.x, 0., chop.y) * 1.05);
  // facets leaning toward the sun take its colour: a glitter path without a mirror
  vec2 sdir = normalize(uSunDir.xz + 1e-4);
  float facet = dot(Nh.xz, sdir);
  float fA = fwidth(facet) + .004;
  float stroke = smoothstep(.2 - fA, .2 + fA, facet) * (1. - smoothstep(.3, .42, facet));
  col += uGlow * uSheen * (smoothstep(.1, .24, facet) * .22 + stroke * 1.5) * mix(.35, 1., sh) * cs * smoothstep(.5, 3., depth) * (1. - smoothstep(.0, .09, abs(w0.y)) * .92);
  float sp = pow(sat(dot(normalize(V + uSunDir), Nh)), 260.);
  if (sp > .004){
    float tw = nz(xz * .6 + uTime * .05, .6).a;
    col += uSunCol * sp * uGlint * (1.2 + 2.2 * smoothstep(.55, .75, tw)) * cs * sh;
  }
  // loose sparkles, like light catching chop
  vec2 gq = xz * .62 + chop * .4;
  vec2 gi = floor(gq); vec2 gf = fract(gq) - .5;
  float gh = fract(sin(dot(gi, vec2(12.99, 78.23))) * 43758.5);
  if (gh > .982){
    float tws = pow(sat(sin(uTime * (1.2 + gh * 2.4) + gh * 40.)), 26.);
    float star = exp(-dot(gf, gf) * 90.) + exp(-abs(gf.x) * 34. - abs(gf.y) * 8.) * .7 + exp(-abs(gf.y) * 34. - abs(gf.x) * 8.) * .7;
    col += uSunCol * star * tws * uGlint * .8 * cs * smoothstep(.6, 2.4, depth) * (1. - far);
  }

  // ---------------- foam
  float foam = 0.;
  float lace = fm.g * .86;
  float lip = 0.;
  if (d < 14.){
    // beach: thin bright lip where the sheet thins out, lace behind it
    float ln = nz(xz * .22 + uTime * .015, .22).a - .5;
    lip = 1. - smoothstep(.02, .05, depth + ln * .05);
    float sheet = (1. - smoothstep(.04, .24, depth + ln * .08)) * smoothstep(.5, .62, nz(xz * .06 + uTime * .006, .06).b + .12);
    float wash = smoothstep(1.5, .1, depth) * smoothstep(13., .5, d);
    float surfZone = smoothstep(16., 2., d) * smoothstep(-2., 1., d);
    float washLace = wash * (.2 + .26 * sin(uTime * .9 + xz.y * .1));
    #if WATER_DETAIL <= 1
    float bAmt = max(max(sheet * .65, sfc.z * .74 * surfZone), max(washLace * .55 * surfZone, si.w * .95 * smoothstep(7., 1., d)));
    float bWash = bAmt > .02 ? holes(bAmt, xz * 1.25) * .68 : 0.;
    foam = max(lip, max(sfc.y * surfZone, bWash));
    #else
    if (sheet > .02) lip = max(lip, holes(sheet * .8, xz * 1.5) * .6);
    float wet = 0.;
    if (sfc.z > .01) wet = holes(sfc.z * .74, xz * 1.25) * .62;
    if (washLace > .02) wet = max(wet, holes(washLace * .6, xz * 1.2) * .42);
    foam = max(lip, max(sfc.y, wet) * surfZone);
    if (si.w > .02) foam = max(foam, holes(si.w * .95, xz) * smoothstep(7., 1., d));
    #endif
  }
  // rocks: a collar that breathes (skipped on >95% of pixels via baked rock distance)
  float rockF = 0.;
  if (rockNear < 4.5){
    for (int i = 0; i < ${rocks}; i++){
      vec2 rv = xz - uRocks[i].xy;
      float rr = length(rv) - uRocks[i].z;
      if (rr > 4.) continue;
      float an = atan(rv.y, rv.x);
      float nn = nz(vec2(an * .32, uTime * .018) + float(i) * .37, .1).b - .5;
      float pulse = sin(uTime * 1.1 + float(i) * 2. + an * 2.) * .28;
      float collar = smoothstep(1.5 + pulse * 1.4 + nn * 2.2, .1, rr);
      float ringw = smoothstep(.16, .0, abs(fract(rr * .42 - uTime * .16 + nn * .5) - .5) - .02) * smoothstep(2.6, .6, rr) * smoothstep(-.4, .5, rr);
      rockF = max(rockF, max(collar * .62, ringw * .34));
    }
    if (rockF > .05) foam = max(foam, threads(rockF, xz * 1.1) * smoothstep(.06, .3, rockF) * .9);
  }
  float solid = 0.;
  if (w0.a > .01){
    solid = crestFoam(w0.a, xz, hf, wd, steep);
    foam = max(foam, solid);
  }
  if (fm.a > .02){
    float aer = smoothstep(.02, .75, fm.a) * (.55 + .45 * nz(xz * .11 + uTime * .02, .11).b);
    float am = aer * .4 * smoothstep(1.2, .2, hf);
    col = mix(col, crestC * .98 + .02, am);
    #ifdef SPLIT_WATER
    underK *= 1. - am;
    #endif
  }
  if (lace > .02){
    float lk = lace * (.45 + 1.1 * nz(xz * .05 + 2., .05).b);
    foam = max(foam, threads(sat(lk * 1.2), xz) * .8 * smoothstep(.9, .15, hf));
  }
  #ifndef SPLIT_WATER
  // a tight line wherever anything solid breaks the surface
  if (thick < 1.2 && depth > .3 && far < .9){
    float cn = nz(xz * .27 + vec2(uTime * .03, -uTime * .02), .27).a - .5;
    float breathe = sin(uTime * 1.5 + xz.x * .9 + xz.y * .7) * .5 + .5;
    float wall = smoothstep(.8, .5, abs(un.y) / (length(un) + 1e-6));
    foam = max(foam, smoothstep(.34 + .3 * breathe + cn * 1.1, .03, thick) * smoothstep(.3, .9, depth) * (1. - reefK) * (1. - far) * wall * .92);
  }
  #endif
  // whitecaps when the wind is up
  if (uSwell > 1.3){
    float cap = smoothstep(.66, .8, nz(xz * vec2(.022, .05) + vec2(uTime * .02, 0.), .05).a) * smoothstep(1.3, 2., uSwell);
    if (cap > .01) foam = max(foam, holes(cap * .5, xz * vec2(.7, 1.3)) * smoothstep(3., 9., d) * .5);
  }
  #if WATER_DETAIL >= 1
  // calm-water lace: the faint network light draws on a shallow lagoon
  if (depth > .2 && depth < 8.){
    float mask = smoothstep(.42, .6, nz(xz * .012 + 5., .012).b);
    if (mask > .02) col += uFoamC * web(xz, uTime) * mask * smoothstep(.2, 1.4, depth) * (1. - smoothstep(3.2, 8., depth)) * .05 * cs * (.4 + sunL * .3);
  }
  #endif

  // relief: foam is lit from the sun side and shades the water behind it
  if (foam > .004 || w0.a > .01){
    float bev = 0.;
    #if WATER_DETAIL >= 2
    if (crest){
      vec2 sd2 = sdir * .34;
      vec4 w2 = textureLod(tWave, fieldUv(xz + sd2), 0.) * inn;
      float foam2 = crestFoam(w2.a, xz + sd2, softH(w2.y) * shoal, wd, steep);
      bev = clamp(solid - foam2, -1., 1.);
      float bsh = 1. - .22 * sat(foam2 - foam);
      col *= bsh;
      #ifdef SPLIT_WATER
      underK *= bsh;
      #endif
    }
    #endif
    vec2 pq = steep > .5 ? vec2(dot(xz, vec2(-wd.y, wd.x)), hf) : xz;
    if (uCine > .01) pq += (nz(pq * .11, .11).ba - .5) * 1.3 * uCine;
    float puff = nz(pq * .3 + uTime * .02, .3).r;
    float fk = .46 + bev * .4 + ndl * .9 + smoothstep(.62, .2, puff) * .42;
    if (uCine > .01 && crest){
      // up close: billows, with creases running the way the water is thrown
      float cl = nz(pq * .15 - uTime * .03, .15).r;
      float al = dot(xz, vec2(-wd.y, wd.x));
      float cr = nz(vec2(al * .16, dot(xz, wd) * .03 - hf * .02), .16).a;
      fk = mix(fk, .42 + bev * .35 + clamp(ndl, -.6, .4) * .3 + smoothstep(.62, .2, puff) * .3 + smoothstep(.6, .12, cl) * .42 + (smoothstep(.36, .62, cr) - .5) * .4, uCine);
    }
    vec3 fcol = mix(uFoamS, uFoamC, sat(fk));
    fcol *= (.34 + .68 * sunL) * mix(.72, 1., cs) * mix(.72, 1., sh);
    fcol += lampL * .35;
    float fmMix = sat(foam) * .96;
    col = mix(col, fcol, fmMix);
    #ifdef SPLIT_WATER
    underK *= 1. - fmMix;
    #endif
  }

  // ---------------- energy: resonance gold, AI cyan, plankton at night
  float gold = fm.b * (1. - .8 * uCine);
  if (gold > .004) col += vec3(1., .68, .2) * gold * (.22 + .42 * foam + .5 * hN) * 1.1;
  if (uBio > .01){
    vec3 bioC = vec3(.04, .78, 1.);
    float bioE = fm.a * (.35 + .65 * nz(xz * .34 + uTime * .03, .34).a);
    float speck = smoothstep(.7, .86, nz(xz * .9 + uTime * .02, .9).a);
    float ripE = sat(length(rg) * 1.5);
    col += bioC * uBio * (bioE * (.35 + 1.6 * speck) + foam * .55 * sat(fm.r + lace + rockF * .7 + vSurf + lip * .4) + ripE * .6 + hN * .14);
    // ribbons of plankton drifting through the dark
    float rib = nz(xz * vec2(.012, .03) + vec2(uTime * .004, uTime * .002), .03).b;
    float ribs = smoothstep(.035, .0, abs(rib - .5)) * smoothstep(5., 14., d);
    col += bioC * uBio * ribs * (.07 + .42 * speck);
  }

  // ---------------- inside the net: the current draws inward
  vec2 nv = xz - uNet.xy;
  float nr = length(nv) / uNet.z;
  if (nr < 1.05){
    float na = atan(nv.y, nv.x);
    float sw = sin(na * 3. + nr * 9. + uTime * 2.6);
    float ins = smoothstep(1.02, .55, nr) * smoothstep(.0, .3, nr);
    col += uFoamC * smoothstep(.62, .98, sw) * ins * .1;
    col += mix(vec3(.5, 1., .9), vec3(1., .8, .3), uNet.w) * ins * uNet.w * .5;
  }

  // rain rings
  if (uRain > .01){
    vec2 rq = xz * .62; vec2 ri = floor(rq); vec2 rf = fract(rq) - .5;
    float h1 = fract(sin(dot(ri, vec2(41.3, 289.1))) * 4375.85);
    float rt = fract(uTime * (.7 + h1 * .7) + h1 * 9.);
    vec2 rc = (vec2(fract(h1 * 57.), fract(h1 * 131.)) - .5) * .5;
    float rr2 = abs(length(rf - rc) - rt * .42);
    col += uFoamC * smoothstep(.05, .0, rr2) * (1. - rt) * .28 * uRain * step(.35, h1);
  }

  #ifdef SPLIT_WATER
  vec3 df = vWP - cameraPosition;
  float fl = length(df);
  float fogF = 1. - exp(-max(0., fl - uFog.x) * uFog.y);
  float fogS = pow(sat(dot(df / max(fl, 1e-4), uSunDir) * .5 + .5), 5.);
  col = mix(col, mix(uFogCol, uFogSunCol, fogS), fogF);
  underK *= 1. - fogF;
  gl_FragColor = vec4(col, sat(underK));
  #else
  col = applyFog(col, vWP);
  gl_FragColor = vec4(col, 1.);
  #endif
}`;
