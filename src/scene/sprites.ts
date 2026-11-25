import * as THREE from 'three';
import { G, GLSL_GRADE_LDR, GLSL_UNIFORMS, registerDirectLdr } from './gfx';
import { FLOAT_HEAD, type Water } from './water';

/** Shapes the one sprite shader can draw. */
export const SP = {
  glow: 0,
  drop: 1,
  ring: 2,
  puff: 3,
  leaf: 4,
  star: 5,
  beam: 6,
  dash: 7,
  flame: 8,
  halo: 9,
  mist: 10,
} as const;

/** flat drapes over the water, ground lies flat at a fixed height. */
export const MODE = { billboard: 0, flat: 1, upright: 2, ground: 3 } as const;

class Layer {
  readonly mesh: THREE.Mesh;
  private at: THREE.InstancedBufferAttribute[];
  private geo: THREE.InstancedBufferGeometry;
  private n = 0;

  constructor(
    private cap: number,
    flat: boolean,
    water: Water
  ) {
    const g = new THREE.InstancedBufferGeometry();
    const N = flat ? 8 : 1;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) pos.push((i / N) * 2 - 1, (j / N) * 2 - 1, 0);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = j * (N + 1) + i;
        idx.push(k, k + 1, k + N + 2, k, k + N + 2, k + N + 1);
      }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    const mk = (k: number): THREE.InstancedBufferAttribute => new THREE.InstancedBufferAttribute(new Float32Array(cap * k), k).setUsage(THREE.DynamicDrawUsage);
    this.at = [mk(4), mk(4), mk(4), mk(3)];
    ['iA', 'iB', 'iC', 'iD'].forEach((name, i) => g.setAttribute(name, this.at[i]));
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...G, ...water.shared },
      defines: flat ? { FLAT: 1 } : {},
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `
#ifdef FLAT
${GLSL_UNIFORMS}
${FLOAT_HEAD()}
#endif
attribute vec4 iA, iB, iC; attribute vec3 iD;
varying vec2 vQ; varying vec4 vC; varying vec4 vK; varying vec3 vWP;
void main(){
  vec2 q = position.xy;
  vQ = q; vC = iC; vK = vec4(iB.z, iD.x, iD.y, iD.z);
  float c = cos(iA.w), s = sin(iA.w);
  vec2 z = q * iB.xy;
  vec2 r = vec2(c * z.x - s * z.y, s * z.x + c * z.y);
  vec3 wp;
  #ifdef FLAT
    wp = iA.xyz + vec3(r.x, 0., r.y);
    if (iB.w < 2.){
      float a_, b_;
      wp = waterPos(wp.xz, a_, b_) + vec3(0., .07, 0.);
    }
    vec4 mv = viewMatrix * vec4(wp, 1.);
    vec4 nearer = projectionMatrix * (mv + vec4(0., 0., .35, 0.));
    gl_Position = projectionMatrix * mv;
    gl_Position.z = nearer.z / nearer.w * gl_Position.w;
  #else
    vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    if (iB.w < .5) wp = iA.xyz + R * r.x + U * r.y;
    else wp = iA.xyz + normalize(vec3(R.x, 0., R.z)) * z.x + vec3(0., (q.y * .5 + .5) * iB.y, 0.);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
  #endif
  vWP = wp;
}`,
      fragmentShader: /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_GRADE_LDR}
varying vec2 vQ; varying vec4 vC; varying vec4 vK; varying vec3 vWP;
void main(){
  float kind = vK.x, add = vK.y, lit = vK.z, seed = vK.w;
  float r = length(vQ);
  float a = 0.;
  vec3 col = vC.rgb;
  if (kind < .5){ a = exp(-r * r * 4.2) * smoothstep(1., .6, r); }
  else if (kind < 1.5){
    float w = fwidth(r);
    a = smoothstep(1., 1. - w * 1.6, r);
    float sh = smoothstep(-.5, .7, vQ.y + vQ.x * -.35);
    col *= mix(.68, 1.06, sh);
    col += smoothstep(.36, .2, length(vQ - vec2(-.32, .36))) * .35;
  }
  else if (kind < 2.5){ a = smoothstep(1., .94, r) * smoothstep(.76, .93, r); }
  else if (kind < 3.5){
    float n = texture2D(uNoise, vQ * .16 + seed).b * .7 + texture2D(uNoise, vQ * .34 + seed * 3.).a * .4;
    a = smoothstep(.04, .34, (1. - r) * .75 + (n - .62) * .95) * smoothstep(1., .8, r);
    col *= mix(.62, 1.12, smoothstep(-.6, .7, vQ.y + (n - .5)));
  }
  else if (kind < 4.5){
    float w2 = .42 * (1. - vQ.x * vQ.x);
    a = smoothstep(w2, w2 - .12, abs(vQ.y)) * step(abs(vQ.x), 1.);
    col *= mix(.8, 1.15, step(0., vQ.y));
  }
  else if (kind < 5.5){
    vec2 q = abs(vQ);
    float st = max(0., 1. - q.x) * exp(-q.y * 14.) + max(0., 1. - q.y) * exp(-q.x * 14.);
    a = sat(st * st * 1.3 + exp(-r * r * 22.));
  }
  else if (kind < 6.5){
    float y = vQ.y * .5 + .5;
    float n = texture2D(uNoise, vec2(vQ.x * .12 + seed, y * .2 - uTime * .12)).a;
    a = exp(-vQ.x * vQ.x * 5.5) * pow(max(0., 1. - y), 1.5) * smoothstep(0., .06, y) * (.6 + .7 * n);
  }
  else if (kind < 7.5){
    float an = atan(vQ.y, vQ.x) / 6.28318 + uTime * .06;
    float band = smoothstep(1., .95, r) * smoothstep(.8, .85, r);
    a = band * smoothstep(.36, .44, abs(fract(an * 14.) - .5) + .12);
  }
  else if (kind < 8.5){
    float y = vQ.y * .5 + .5;
    float n = texture2D(uNoise, vec2(vQ.x * .18 + seed, y * .24 - uTime * .42 + seed)).b;
    float n2 = texture2D(uNoise, vec2(vQ.x * .42 + seed * 2., y * .5 - uTime * .8)).a;
    float x = vQ.x + (n - .5) * 1.3 * y;
    y = sat(y);
    float w3 = mix(.72, .06, pow(y, .8)) * smoothstep(0., .16, y + .07);
    float body = 1. - smoothstep(w3 * .62, w3, abs(x) + (n2 - .5) * .5 * y);
    a = body * (1. - smoothstep(.62, .95, y + (n2 - .5) * .5));
    float core = (1. - smoothstep(0., w3 * .6, abs(x))) * (1. - smoothstep(.1, .62, y));
    col = mix(vec3(.82, .045, .006), vec3(1.15, .3, .012), 1. - smoothstep(.25, .85, y + abs(x) * .4));
    col = mix(col, vec3(1.5, .98, .2), core);
    col *= vC.rgb;
  }
  else if (kind < 9.5){
    a = exp(-r * r * 3.2) * .55 + smoothstep(1., .9, r) * smoothstep(.7, .88, r) * .9;
    a *= smoothstep(1., .94, r);
  }
  else {
    float n = texture2D(uNoise, vQ * .1 + seed + uTime * .01).b;
    a = exp(-r * r * 3.4) * smoothstep(1., .55, r) * smoothstep(.2, .75, n + (1. - r) * .35);
  }
  a *= vC.a;
  if (a < .004) discard;
  vec3 light = uSkyCol * 1.5 + uSunCol * .72 + uGroundCol * .25;
  col *= mix(vec3(1.), light, lit);
  #ifdef DIRECT_LDR
    if (add > .5) col = alunOetf(clamp(col * uGradeExposure * .65, 0., 1.));
    else col = alunGrade(col, gl_FragCoord.xy / uRes);
  #endif
  gl_FragColor = vec4(col * a, a * (1. - add));
}`,
    });
    registerDirectLdr(mat, false);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = flat ? 18 : 20;
  }

  begin(): void {
    this.n = 0;
  }

  push(x: number, y: number, z: number, sx: number, sy: number, rot: number, r: number, g: number, b: number, a: number, kind: number, mode: number, add: number, lit: number, seed: number): void {
    const n = this.n;
    if (n >= this.cap) return;
    this.at[0].setXYZW(n, x, y, z, rot);
    this.at[1].setXYZW(n, sx, sy, kind, mode);
    this.at[2].setXYZW(n, r, g, b, a);
    this.at[3].setXYZ(n, add, lit, seed);
    this.n = n + 1;
  }

  end(): void {
    for (const t of this.at) {
      t.clearUpdateRanges();
      t.addUpdateRange(0, Math.max(1, this.n) * t.itemSize);
      t.needsUpdate = true;
    }
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
  }
}

/** Every transient effect in the scene goes through two instanced, premultiplied-alpha draw calls. */
export class Sprites {
  readonly group = new THREE.Group();
  private bill: Layer;
  private flat: Layer;
  /** Rings on the water are there to be read in play; a cutscene fades them. */
  rings = 1;

  constructor(water: Water) {
    this.bill = new Layer(1700, false, water);
    this.flat = new Layer(360, true, water);
    this.group.add(this.flat.mesh, this.bill.mesh);
  }

  begin(): void {
    this.bill.begin();
    this.flat.begin();
  }

  /** add: 0 alpha, 1 additive. lit: 0 self-lit, 1 takes scene light. */
  push(x: number, y: number, z: number, sx: number, sy: number, rot: number, r: number, g: number, b: number, a: number, kind: number, mode: number, add = 0, lit = 0, seed = 0): void {
    const flat = mode === MODE.flat || mode === MODE.ground;
    if (mode === MODE.flat) a *= this.rings;
    if (a < 0.004) return;
    (flat ? this.flat : this.bill).push(x, y, z, sx, sy, rot, r, g, b, a, kind, mode, add, lit, seed);
  }

  end(): void {
    this.bill.end();
    this.flat.end();
  }
}
