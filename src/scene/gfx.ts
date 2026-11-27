import * as THREE from 'three';
import { Q } from './quality';

/**
 * Shared GPU state: one set of uniforms that every material references, the GLSL common to all of
 * them, the shadow pass plumbing, and the stylised "toon" material factory.
 */
export const LAMP_MAX = 10;

const v3 = (): THREE.Vector3 => new THREE.Vector3();
const col = (): THREE.Color => new THREE.Color(0, 0, 0);

export const G = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(-0.5, 0.7, -0.4).normalize() },
  uSunCol: { value: col() },
  uSkyCol: { value: col() },
  uGroundCol: { value: col() },
  uRimCol: { value: col() },
  uFogCol: { value: col() },
  uFogSunCol: { value: col() },
  uFog: { value: new THREE.Vector4(200, 0.002, 0, 0) },
  uShadowMap: { value: null as THREE.Texture | null },
  uShadowMat: { value: new THREE.Matrix4() },
  uShadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
  uNoise: { value: null as THREE.Texture | null },
  uLampPos: { value: Array.from({ length: LAMP_MAX }, () => new THREE.Vector4(0, -999, 0, 1)) },
  uLampCol: { value: Array.from({ length: LAMP_MAX }, v3) },
  uLampI: { value: 0 },
  uCloud: { value: new THREE.Vector3(0.3, 0.5, 0) },
  uWind: { value: new THREE.Vector3(0.9, 0.2, 1) },
  uEco: { value: 0.5 },
  uBio: { value: 0 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uGroundTex: { value: null as THREE.Texture | null },
  uGroundRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uShoreTex: { value: null as THREE.Texture | null },
  uShoreRange: { value: new THREE.Vector2(-70, 140) },
  /** Shared cached-water state so underwater dynamic meshes (fish, turtles, net bag) blend cleanly. */
  uCachedUnder: { value: 0 },
  tStaticDepth: { value: null as THREE.Texture | null },
  tWaterTex: { value: null as THREE.Texture | null },
  tWaterDepth: { value: null as THREE.Texture | null },
  uWaterRes: { value: new THREE.Vector2(1, 1) },
  uWaterTexel: { value: new THREE.Vector2(1, 1) },
  uNearFar: { value: new THREE.Vector2(1, 1400) },
  uMurkG: { value: 0 },
  /** Direct-to-screen tone mapping and 2D shift uniforms for cached tiers. */
  uGradeExposure: { value: 1 },
  uGradeSat: { value: 1 },
  uGradeVignette: { value: 0.34 },
  uGradeFlash: { value: 0 },
  uGradeLift: { value: new THREE.Color() },
  uGradeGain: { value: new THREE.Color(1, 1, 1) },
  uGradeFlashC: { value: new THREE.Color('#c8fff8') },
  uShiftG: { value: new THREE.Vector3(0, 0, 1) },
};

export const GLSL_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir, uSunCol, uSkyCol, uGroundCol, uRimCol, uFogCol, uFogSunCol;
uniform vec4 uFog;
uniform sampler2D uNoise;
uniform vec3 uCloud;
uniform vec3 uWind;
uniform float uEco, uBio;
uniform vec2 uRes;
uniform sampler2D uGroundTex;
uniform vec4 uGroundRect;
uniform sampler2D uShoreTex;
uniform vec2 uShoreRange;

float sat(float x){ return clamp(x, 0., 1.); }
vec2 groundUv(vec2 xz){ return (xz - uGroundRect.xy) / uGroundRect.zw; }
float groundH(vec2 xz){ return texture2D(uGroundTex, groundUv(xz)).r; }
vec4 groundInfo(vec2 xz){ return texture2D(uGroundTex, groundUv(xz)); }
/** shoreline X, current run-up height, wet line height, splash energy */
vec4 shoreInfo(float z){ return texture2D(uShoreTex, vec2((z - uShoreRange.x) / uShoreRange.y, .5)); }
vec3 windAt(vec3 p, float phase){
  float g = texture2D(uNoise, p.xz * .011 - uWind.xy * uTime * .035).b;
  float s = sin(uTime * 1.55 + p.x * .31 + p.z * .23 + phase) * .6 + sin(uTime * 3.1 + p.z * .55 + p.x * .2 + phase * 2.3) * .28;
  float a = uWind.z * (.25 + 1.5 * g * g);
  float k = s * .5 + .55 * g;
  return vec3(uWind.x * k, -.22 * abs(k), uWind.y * k + s * .18) * a;
}
`;

/** Direct-to-screen tone mapping matching Post.comp so cached tiers skip the full-res rtFinal + post.comp passes. */
export const GLSL_GRADE_LDR = /* glsl */ `
uniform float uGradeExposure, uGradeSat, uGradeVignette, uGradeFlash;
uniform vec3 uGradeLift, uGradeGain, uGradeFlashC;
vec3 alunNeutral(vec3 color){
  const float startCompression = .76;
  const float desaturation = .12;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < .08 ? x - 6.25 * x * x : .04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1. - startCompression;
  float newPeak = 1. - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1. - 1. / (desaturation * (peak - newPeak) + 1.);
  return mix(color, vec3(newPeak), g);
}
vec3 alunOetf(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, 0.), vec3(1. / 2.4)) - .055, step(.0031308, c)); }
vec3 alunGrade(vec3 c, vec2 screenUv){
  c *= uGradeExposure;
  c += uGradeFlashC * uGradeFlash;
  vec2 q = screenUv - .5;
  c *= 1. - uGradeVignette * smoothstep(.28, .95, length(q * vec2(1.05, 1.)) * 1.25);
  c = alunNeutral(c);
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(vec3(l), c, uGradeSat);
  c = c * uGradeGain + uGradeLift * (1. - c) * (1. - smoothstep(0., .4, l));
  c = clamp(c, 0., 1.);
  c = mix(c, c * c * (3. - 2. * c), .16);
  return alunOetf(c);
}
`;

/** Reconstructs cached surface depth without interpolating across cleared texels. */
export const GLSL_WATER_DEPTH = /* glsl */ `
uniform sampler2D tWaterDepth;
uniform vec2 uWaterRes, uWaterTexel;
float waterDepthAt(vec2 uv, float sceneDepth){
  float nearest = textureLod(tWaterDepth, uv, 0.).r;
  if (nearest >= 1. || nearest - sceneDepth > .008) return nearest;
  vec2 wt = uv * uWaterRes - .5;
  vec2 wf = fract(wt);
  vec2 w0 = (floor(wt) + .5) * uWaterTexel;
  vec4 depths = vec4(
    textureLod(tWaterDepth, w0, 0.).r,
    textureLod(tWaterDepth, w0 + vec2(uWaterTexel.x, 0.), 0.).r,
    textureLod(tWaterDepth, w0 + vec2(0., uWaterTexel.y), 0.).r,
    textureLod(tWaterDepth, w0 + uWaterTexel, 0.).r
  );
  vec4 weights = vec4((1. - wf.x) * (1. - wf.y), wf.x * (1. - wf.y), (1. - wf.x) * wf.y, wf.x * wf.y);
  weights *= 1. - step(1., depths);
  return dot(depths, weights) / max(dot(weights, vec4(1.)), .001);
}
`;

/** Helper chunk for dynamic underwater geometry (fish, manta, turtles, submerged net bag) in cached mode. */
export const GLSL_CACHED_UNDERWATER = /* glsl */ `
#ifdef CACHED_UNDER
#include <packing>
${GLSL_WATER_DEPTH}
uniform float uMurkG;
uniform sampler2D tStaticDepth, tWaterTex;
uniform vec2 uNearFar;
uniform vec3 uShiftG;
float uwLin(float z){ return -perspectiveDepthToViewZ(z, uNearFar.x, uNearFar.y); }
#endif
`;

/** Fragment suffix that depth-tests against static terrain and blends submerged geometry cleanly through cached water. */
export const GLSL_UNDERWATER_END = /* glsl */ `
  #ifdef CACHED_UNDER
  {
    vec2 suv = clamp((gl_FragCoord.xy / uRes - .5) / uShiftG.z + .5 + uShiftG.xy, .001, .999);
    float sd = textureLod(tStaticDepth, suv, 0.).x;
    if (gl_FragCoord.z > sd) discard;
    float wd = waterDepthAt(suv, sd);
    if (gl_FragCoord.z > wd){
      float thick = max(uwLin(gl_FragCoord.z) - uwLin(wd), 0.);
      vec4 wt = textureLod(tWaterTex, suv, 0.);
      if (wt.a < .01) discard;
      float reefK = groundInfo(vWP.xz).g;
      float turb = (1. + uMurkG * .8) * mix(1., .62, reefK);
      vec3 T = exp(-min(thick * 1.03, 90.) * vec3(.4, .16, .115) * turb);
      c = mix(c, c * vec3(.74, 1.02, 1.2) + vec3(0., .012, .024), smoothstep(.02, .9, max(-vWP.y, 0.)) * (1. - reefK * .6));
      c *= T / max(T.g, .08);
      outA *= sat(wt.a * T.g);
    }
  }
  #endif
`;

export const GLSL_LIGHT = /* glsl */ `
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMat;
uniform vec2 uShadowTexel;
uniform vec4 uLampPos[${LAMP_MAX}];
uniform vec3 uLampCol[${LAMP_MAX}];
uniform float uLampI;

float softShadow(vec2 p, float z){
  vec2 t = uShadowTexel * 2.15;
  float s = textureLod(uShadowMap, vec3(p + t * vec2(.79, .34), z), 0.);
  s += textureLod(uShadowMap, vec3(p + t * vec2(-.34, .79), z), 0.);
  s += textureLod(uShadowMap, vec3(p + t * vec2(-.79, -.34), z), 0.);
  s += textureLod(uShadowMap, vec3(p + t * vec2(.34, -.79), z), 0.);
  return s * .25;
}

float sunShadow(vec3 wp, vec3 n){
  vec4 sc = uShadowMat * vec4(wp + n * .14 + uSunDir * .05, 1.);
  vec3 p = sc.xyz / sc.w * .5 + .5;
  vec2 e = min(p.xy, 1. - p.xy);
  float edge = smoothstep(0., .04, min(e.x, e.y));
  if (edge <= 0. || p.z > 1.) return 1.;
  float z = p.z - .0009;
  #ifdef LITE
  return mix(1., softShadow(p.xy, z), edge * .88);
  #else
  float s = 0.;
  vec2 t = uShadowTexel * 1.35;
  s += texture(uShadowMap, vec3(p.xy, z)) * 2.;
  s += texture(uShadowMap, vec3(p.xy + vec2( t.x, 0.), z));
  s += texture(uShadowMap, vec3(p.xy + vec2(-t.x, 0.), z));
  s += texture(uShadowMap, vec3(p.xy + vec2(0.,  t.y), z));
  s += texture(uShadowMap, vec3(p.xy + vec2(0., -t.y), z));
  s += texture(uShadowMap, vec3(p.xy + t * vec2( .8,  .8), z));
  s += texture(uShadowMap, vec3(p.xy + t * vec2(-.8,  .8), z));
  s += texture(uShadowMap, vec3(p.xy + t * vec2( .8, -.8), z));
  s += texture(uShadowMap, vec3(p.xy + t * vec2(-.8, -.8), z));
  return mix(1., s * .1, edge);
  #endif
}
float cloudShade(vec2 xz){
  vec2 q = xz * .0062 + vec2(uTime * .0052, uTime * .0021);
  #ifdef LITE
  float n = texture2D(uNoise, q).b;
  #else
  float n = texture2D(uNoise, q).b * .7 + texture2D(uNoise, q * 2.3 + .31).b * .3;
  #endif
  return 1. - uCloud.x * smoothstep(uCloud.y, uCloud.y + .13, n);
}
vec3 lamps(vec3 wp, vec3 n){
  vec3 s = vec3(0.);
  if (uLampI < .01) return s;
  for (int i = 0; i < ${LAMP_MAX}; i++){
    vec3 d = uLampPos[i].xyz - wp;
    float r2 = dot(d, d);
    float rr = uLampPos[i].w * uLampPos[i].w;
    float a = sat(1. - r2 / rr);
    if (a <= 0.) continue;
    float nl = dot(n, d) / sqrt(r2 + .01) * .5 + .5;
    s += uLampCol[i] * a * a * nl;
  }
  return s * uLampI;
}
vec3 applyFog(vec3 c, vec3 wp){
  vec3 d = wp - cameraPosition;
  float l = length(d);
  float f = 1. - exp(-max(0., l - uFog.x) * uFog.y);
  float s = pow(sat(dot(d / l, uSunDir) * .5 + .5), 5.);
  return mix(c, mix(uFogCol, uFogSunCol, s), f);
}
vec3 toonLight(vec3 alb, vec3 n, vec3 wp, float ao, float gloss, float emis){
  vec3 V = normalize(cameraPosition - wp);
  float sh = sunShadow(wp, n) * cloudShade(wp.xz);
  float ndl = dot(n, uSunDir);
  float lit = smoothstep(-.1, .42, ndl) * sh;
  float hemi = n.y * .5 + .5;
  vec3 amb = mix(uGroundCol, uSkyCol, hemi) * mix(.32, 1., ao);
  vec3 c = alb * (amb + uSunCol * lit * mix(.62, 1., ao));
  float fr = pow(1. - sat(dot(n, V)), 3.5);
  c += uRimCol * fr * (.25 + .75 * lit) * hemi * mix(.3, 1., ao);
  if (gloss > .01){
    vec3 H = normalize(V + uSunDir);
    float sp = pow(sat(dot(n, H)), mix(14., 120., gloss));
    c += uSunCol * smoothstep(.18, .55, sp) * gloss * .5 * sh;
    c += uSkyCol * fr * gloss * .8;
  }
  c += lamps(wp, n) * alb;
  c += alb * emis;
  return c;
}
`;

const VERT = /* glsl */ `
${GLSL_UNIFORMS}
attribute vec4 aFx;
attribute vec4 aInst;
varying vec3 vWP;
varying vec3 vN;
varying vec3 vCol;
varying vec4 vFx;
varying vec4 vInst;
varying vec2 vUv2;
varying vec3 vLP;
#include <common>
/*VHEAD*/
void main(){
  vec3 p = position;
  vec3 n = normal;
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
    M = modelMatrix * instanceMatrix;
  #endif
  vLP = p;
  vFx = aFx;
  vInst = aInst;
  vUv2 = uv;
  vCol = vec3(1.);
  #ifdef USE_COLOR
    vCol = color;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vCol *= instanceColor;
  #endif
  /*VLOCAL*/
  vec4 wp = M * vec4(p, 1.);
  mat3 m3 = mat3(M);
  vec3 s2 = vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2]));
  vec3 wn = normalize(m3 * (n / s2));
  /*VWORLD*/
  vWP = wp.xyz;
  vN = wn;
  gl_Position = projectionMatrix * viewMatrix * wp;
  /*VEND*/
}
`;

const FRAG = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_LIGHT}
${GLSL_GRADE_LDR}
varying vec3 vWP;
varying vec3 vN;
varying vec3 vCol;
varying vec4 vFx;
varying vec4 vInst;
varying vec2 vUv2;
varying vec3 vLP;
/*FHEAD*/
void main(){
  vec3 n = normalize(vN);
  #ifdef DOUBLE_SIDED
    if (!gl_FrontFacing) n = -n;
  #endif
  vec3 alb = vCol;
  float ao = vFx.x;
  float gloss = vFx.z;
  float emis = vFx.w;
  float outA = 1.;
  /*FALBEDO*/
  vec3 c;
  /*FLIGHT*/
  /*FEND*/
  c = applyFog(c, vWP);
  #ifdef DIRECT_LDR
    c = alunGrade(c, gl_FragCoord.xy / uRes);
  #elif defined(STATIC_PACK)
    c = sqrt(clamp(c * .5, 0., 1.));
  #endif
  gl_FragColor = vec4(c, outA);
}
`;

const DEPTH_FRAG = /* glsl */ `
${GLSL_UNIFORMS}
varying vec3 vWP;
varying vec3 vN;
varying vec3 vCol;
varying vec4 vFx;
varying vec4 vInst;
varying vec2 vUv2;
varying vec3 vLP;
/*FHEAD*/
void main(){
  /*FDEPTH*/
  gl_FragColor = vec4(1.);
}
`;

/** Shader switches every material shares. */
export function qualityDefines(forStatic = false): Record<string, number> {
  const d: Record<string, number> = {};
  if (Q.lite) d.LITE = 1;
  if (Q.ultra) d.ULTRA = 1;
  if (Q.msaa > 0) d.MSAA = 1;
  if (!forStatic && Q.directLdr) d.DIRECT_LDR = 1;
  if (forStatic && Q.cached && Q.tier === 'low') d.STATIC_PACK = 1;
  return d;
}

/** Registry of toon and dynamic direct-LDR materials so live tier changes refresh shader defines cleanly. */
const trackedToon: { mat: THREE.ShaderMaterial; alphaToCoverage: boolean; isStatic: boolean }[] = [];
const trackedDirect: { mat: THREE.ShaderMaterial; isStatic: boolean }[] = [];

export function registerDirectLdr(mat: THREE.ShaderMaterial, isStatic = false): THREE.ShaderMaterial {
  if (!isStatic && Q.directLdr) mat.defines.DIRECT_LDR = 1;
  else delete mat.defines.DIRECT_LDR;
  if (isStatic && Q.cached && Q.tier === 'low') mat.defines.STATIC_PACK = 1;
  else delete mat.defines.STATIC_PACK;
  trackedDirect.push({ mat, isStatic });
  return mat;
}

export function syncToonQuality(): void {
  const wantPackStatic = Q.cached && Q.tier === 'low';
  for (const item of trackedToon) {
    const m = item.mat;
    const wantMsaa = Q.msaa > 0;
    const wantLite = Q.lite;
    const wantUltra = Q.ultra;
    const wantDirect = !item.isStatic && Q.directLdr;
    const wantPack = item.isStatic && wantPackStatic;
    let changed = false;
    if (Boolean(m.defines.LITE) !== wantLite) {
      if (wantLite) m.defines.LITE = 1;
      else delete m.defines.LITE;
      changed = true;
    }
    if (Boolean(m.defines.ULTRA) !== wantUltra) {
      if (wantUltra) m.defines.ULTRA = 1;
      else delete m.defines.ULTRA;
      changed = true;
    }
    if (Boolean(m.defines.MSAA) !== wantMsaa) {
      if (wantMsaa) m.defines.MSAA = 1;
      else delete m.defines.MSAA;
      changed = true;
    }
    if (Boolean(m.defines.DIRECT_LDR) !== wantDirect) {
      if (wantDirect) m.defines.DIRECT_LDR = 1;
      else delete m.defines.DIRECT_LDR;
      changed = true;
    }
    if (Boolean(m.defines.STATIC_PACK) !== wantPack) {
      if (wantPack) m.defines.STATIC_PACK = 1;
      else delete m.defines.STATIC_PACK;
      changed = true;
    }
    const wantA2C = item.alphaToCoverage && wantMsaa;
    if (m.alphaToCoverage !== wantA2C) {
      m.alphaToCoverage = wantA2C;
      changed = true;
    }
    if (changed) m.needsUpdate = true;
  }
  for (const item of trackedDirect) {
    const m = item.mat;
    const wantDirect = !item.isStatic && Q.directLdr;
    const wantPack = item.isStatic && wantPackStatic;
    let changed = false;
    if (Boolean(m.defines.DIRECT_LDR) !== wantDirect) {
      if (wantDirect) m.defines.DIRECT_LDR = 1;
      else delete m.defines.DIRECT_LDR;
      changed = true;
    }
    if (Boolean(m.defines.STATIC_PACK) !== wantPack) {
      if (wantPack) m.defines.STATIC_PACK = 1;
      else delete m.defines.STATIC_PACK;
      changed = true;
    }
    if (changed) m.needsUpdate = true;
  }
}

export interface ToonOpts {
  side?: THREE.Side;
  uniforms?: Record<string, THREE.IUniform>;
  defines?: Record<string, string | number>;
  vHead?: string;
  vLocal?: string;
  vWorld?: string;
  vEnd?: string;
  fHead?: string;
  fAlbedo?: string;
  /** Replaces the default lighting; must assign `c`. */
  fLight?: string;
  fEnd?: string;
  fDepth?: string;
  alphaToCoverage?: boolean;
  /** True for materials that belong in the static world cache. */
  isStatic?: boolean;
  transparent?: boolean;
  depthTest?: boolean;
  depthWrite?: boolean;
  blending?: THREE.Blending;
}

export interface ToonPair {
  material: THREE.ShaderMaterial;
  depth: THREE.ShaderMaterial;
}

/** Sway hook used by anything that bends in the wind; aFx.y is how loose the vertex is. */
export const SWAY = /* glsl */ `wp.xyz += windAt(wp.xyz, aInst.x * 6.28) * aFx.y;`;

export function toon(o: ToonOpts = {}): ToonPair {
  const fill = (src: string): string =>
    src
      .replace('/*VHEAD*/', o.vHead ?? '')
      .replace('/*VLOCAL*/', o.vLocal ?? '')
      .replace('/*VWORLD*/', o.vWorld ?? '')
      .replace('/*VEND*/', o.vEnd ?? '')
      .replace('/*FHEAD*/', o.fHead ?? '')
      .replace('/*FALBEDO*/', o.fAlbedo ?? '')
      .replace('/*FLIGHT*/', o.fLight ?? 'c = toonLight(alb, n, vWP, ao, gloss, emis);')
      .replace('/*FEND*/', o.fEnd ?? '')
      .replace('/*FDEPTH*/', o.fDepth ?? '');
  const uniforms = { ...G, ...(o.uniforms ?? {}) };
  const side = o.side ?? THREE.FrontSide;
  const isStatic = o.isStatic ?? false;
  const wantMsaa = Q.msaa > 0;
  const defines: Record<string, string | number> = { ...qualityDefines(isStatic), ...(o.defines ?? {}) };
  if (wantMsaa) defines.MSAA = 1;
  else delete defines.MSAA;
  if (!isStatic && Q.directLdr) defines.DIRECT_LDR = 1;
  else delete defines.DIRECT_LDR;
  if (isStatic && Q.cached && Q.tier === 'low') defines.STATIC_PACK = 1;
  else delete defines.STATIC_PACK;
  const material = new THREE.ShaderMaterial({
    uniforms,
    defines,
    vertexShader: fill(VERT),
    fragmentShader: fill(FRAG),
    vertexColors: true,
    side,
    ...(o.transparent !== undefined ? { transparent: o.transparent } : {}),
    ...(o.depthTest !== undefined ? { depthTest: o.depthTest } : {}),
    ...(o.depthWrite !== undefined ? { depthWrite: o.depthWrite } : {}),
    ...(o.blending !== undefined ? { blending: o.blending } : {}),
  });
  if (o.alphaToCoverage && wantMsaa) material.alphaToCoverage = true;
  trackedToon.push({ mat: material, alphaToCoverage: !!o.alphaToCoverage, isStatic });
  const depth = new THREE.ShaderMaterial({
    uniforms,
    defines: { ...defines, DEPTH_PASS: 1 },
    vertexShader: fill(VERT),
    fragmentShader: fill(DEPTH_FRAG),
    vertexColors: true,
    side: side === THREE.FrontSide ? THREE.DoubleSide : side,
    colorWrite: false,
  });
  return { material, depth };
}

/** Ink outline: an inverted hull pushed out by a constant number of screen pixels. */
export function outlineMaterial(width = 2.2, color = '#10202e', o: ToonOpts = {}): THREE.ShaderMaterial {
  const c = new THREE.Color(color);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...G, ...(o.uniforms ?? {}), uInk: { value: c }, uInkW: { value: width } },
    defines: { ...(o.defines ?? {}) },
    vertexColors: true,
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
${GLSL_UNIFORMS}
attribute vec4 aFx;
attribute vec4 aInst;
attribute vec3 aSN;
uniform float uInkW;
varying vec3 vWP;
#include <common>
${o.vHead ?? ''}
void main(){
  vec3 p = position;
  vec3 n = aSN;
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
    M = modelMatrix * instanceMatrix;
  #endif
  ${o.vLocal ?? ''}
  vec4 wp = M * vec4(p, 1.);
  mat3 m3 = mat3(M);
  vec3 wn = normalize(m3 * n);
  ${o.vWorld ?? ''}
  vWP = wp.xyz;
  vec4 clip = projectionMatrix * viewMatrix * wp;
  vec3 vn = mat3(viewMatrix) * wn;
  vec2 dir = normalize((projectionMatrix * vec4(vn, 0.)).xy + 1e-5);
  clip.xy += dir * uInkW * 2. / uRes * clip.w * (uRes.y / 900.);
  gl_Position = clip;
}`,
    fragmentShader: /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_GRADE_LDR}
uniform vec3 uInk;
void main(){
  vec3 c = uInk;
  #ifdef DIRECT_LDR
    c = alunGrade(c, gl_FragCoord.xy / uRes);
  #elif defined(STATIC_PACK)
    c = sqrt(clamp(c * .5, 0., 1.));
  #endif
  gl_FragColor = vec4(c, 1.);
}`,
  });
  return registerDirectLdr(mat, o.isStatic ?? false);
}

/* ------------------------------------------------------------------ full-screen passes */

const fsGeo = new THREE.BufferGeometry();
fsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
fsGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

export class FullScreen {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mesh: THREE.Mesh;
  constructor() {
    this.mesh = new THREE.Mesh(fsGeo);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  render(r: THREE.WebGLRenderer, mat: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.mesh.material = mat;
    r.setRenderTarget(target);
    r.render(this.scene, this.cam);
  }
}

export function fsMaterial(
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  extra: Partial<THREE.ShaderMaterialParameters> = {}
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FS_VERT,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    ...extra,
  });
}

export const fsQuad = (mat: THREE.Material): THREE.Mesh => {
  const m = new THREE.Mesh(fsGeo, mat);
  m.frustumCulled = false;
  return m;
};

/** Tileable noise: R cell distance, G cell edge, B broad fbm, A fine fbm. */
export function bakeNoise(r: THREE.WebGLRenderer, fs: FullScreen): THREE.Texture {
  const rt = new THREE.WebGLRenderTarget(512, 512, {
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
    anisotropy: 8,
  });
  const mat = fsMaterial(
    /* glsl */ `
varying vec2 vUv;
vec2 h2(vec2 p, float per){
  p = mod(p, per);
  vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
vec2 worley(vec2 uv, float per){
  vec2 p = uv * per, i = floor(p), f = fract(p);
  float a = 9., b = 9.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(x, y);
    vec2 o = h2(i + g, per) * .92;
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < a){ b = a; a = d; } else if (d < b){ b = d; }
  }
  return sqrt(vec2(a, b));
}
float gn(vec2 uv, float per){
  vec2 p = uv * per, i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 a = h2(i, per) * 2. - 1., b = h2(i + vec2(1, 0), per) * 2. - 1.;
  vec2 c = h2(i + vec2(0, 1), per) * 2. - 1., d = h2(i + vec2(1, 1), per) * 2. - 1.;
  return mix(mix(dot(a, f), dot(b, f - vec2(1, 0)), u.x), mix(dot(c, f - vec2(0, 1)), dot(d, f - vec2(1, 1)), u.x), u.y);
}
float fb(vec2 uv, float per){
  float s = 0., a = .5;
  for (int i = 0; i < 5; i++){ s += gn(uv + float(i) * .137, per) * a; per *= 2.; a *= .52; }
  return s * .85 + .5;
}
void main(){
  vec2 w = vec2(fb(vUv, 4.), fb(vUv + .37, 4.)) - .5;
  vec2 c = worley(vUv + w * .05, 8.);
  gl_FragColor = vec4(clamp(c.x, 0., 1.), clamp(c.y - c.x, 0., 1.), clamp(fb(vUv, 4.), 0., 1.), clamp(fb(vUv + .61, 14.), 0., 1.));
}`,
    {}
  );
  fs.render(r, mat, rt);
  r.setRenderTarget(null);
  mat.dispose();
  return rt.texture;
}

/** Depth-only sun shadow map sampled with hardware comparison. */
export class SunShadow {
  target!: THREE.WebGLRenderTarget;
  private staticTarget: THREE.WebGLRenderTarget | null = null;
  readonly copyDepthMat: THREE.ShaderMaterial;
  readonly cam = new THREE.OrthographicCamera(-70, 70, 60, -60, 1, 320);
  private swaps: { mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[] = [];
  private vp = new THREE.Matrix4();
  private size = 0;
  private staticValid = false;
  private lastSunDir = new THREE.Vector3(9, 9, 9);

  constructor(size: number) {
    this.copyDepthMat = fsMaterial(
      /* glsl */ `
varying vec2 vUv; uniform sampler2D tDepth;
void main(){ gl_FragDepth = texture2D(tDepth, vUv).x; }`,
      { tDepth: { value: null } },
      { colorWrite: false, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth }
    );
    this.resize(size);
  }

  invalidateStatic(): void {
    this.staticValid = false;
  }

  resize(size: number): void {
    if (size === this.size && this.target) return;
    if (this.target) {
      this.target.depthTexture?.dispose();
      this.target.dispose();
    }
    if (this.staticTarget) {
      this.staticTarget.depthTexture?.dispose();
      this.staticTarget.dispose();
      this.staticTarget = null;
    }
    this.size = size;
    this.staticValid = false;
    const depth = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    depth.format = THREE.DepthFormat;
    depth.compareFunction = THREE.LessEqualCompare;
    depth.minFilter = THREE.LinearFilter;
    depth.magFilter = THREE.LinearFilter;
    this.target = new THREE.WebGLRenderTarget(size, size, { depthTexture: depth, depthBuffer: true });
    G.uShadowMap.value = depth;
    G.uShadowTexel.value.set(1 / size, 1 / size);
  }

  private ensureStaticTarget(): THREE.WebGLRenderTarget {
    if (this.staticTarget && this.staticTarget.width === this.size) return this.staticTarget;
    if (this.staticTarget) {
      this.staticTarget.depthTexture?.dispose();
      this.staticTarget.dispose();
    }
    const sd = new THREE.DepthTexture(this.size, this.size, THREE.UnsignedIntType);
    sd.format = THREE.DepthFormat;
    sd.minFilter = THREE.NearestFilter;
    sd.magFilter = THREE.NearestFilter;
    this.staticTarget = new THREE.WebGLRenderTarget(this.size, this.size, { depthTexture: sd, depthBuffer: true });
    this.copyDepthMat.uniforms.tDepth.value = sd;
    this.staticValid = false;
    return this.staticTarget;
  }

  /** Runs `fn` with every caster wearing its depth material and everything else hidden. */
  asCasters(scenes: THREE.Object3D | THREE.Object3D[], fn: () => void): void {
    const list = Array.isArray(scenes) ? scenes : [scenes];
    this.swaps.length = 0;
    const hidden: THREE.Object3D[] = [];
    for (const scene of list) {
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const d = m.userData.depth as THREE.Material | undefined;
        if (d) {
          this.swaps.push({ mesh: m, mat: m.material });
          m.material = d;
        } else hidden.push(m);
      });
    }
    for (const h of hidden) h.visible = false;
    fn();
    for (const s of this.swaps) s.mesh.material = s.mat;
    for (const h of hidden) h.visible = true;
  }

  private aim(center: THREE.Vector3): void {
    const dir = G.uSunDir.value;
    this.cam.position.copy(center).addScaledVector(dir, 150);
    // The sun passes near vertical at dusk. Keep the shadow camera roll stable there.
    this.cam.up.set(0, 0, 1);
    this.cam.lookAt(center);
    this.cam.updateMatrixWorld();
    this.cam.updateProjectionMatrix();
    this.vp.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);
    G.uShadowMat.value.copy(this.vp);
  }

  render(r: THREE.WebGLRenderer, scenes: THREE.Scene | THREE.Scene[], center: THREE.Vector3): void {
    const list = Array.isArray(scenes) ? scenes : [scenes];
    this.aim(center);
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.target);
    r.setClearColor(0xffffff, 1);
    r.clear(true, true, false);
    this.asCasters(list, () => {
      for (const s of list) r.render(s, this.cam);
    });
    r.setRenderTarget(prev);
  }

  /**
   * Live-tier split shadow map: caches the 1.4M static forest/village/land shadow triangles and only
   * rebakes them when the sun moves, then hardware-blits static depth and draws only dynamic casters.
   */
  renderSplit(
    r: THREE.WebGLRenderer,
    fs: FullScreen,
    worldScene: THREE.Scene,
    staticGroup: THREE.Group,
    underDynGroup: THREE.Group,
    dynGroup: THREE.Group,
    center: THREE.Vector3
  ): void {
    const st = this.ensureStaticTarget();
    const prev = r.getRenderTarget();
    const dir = G.uSunDir.value;
    if (!this.staticValid || !dir.equals(this.lastSunDir)) {
      // The copied depth and the dynamic casters must use the same projection.
      this.aim(center);
      staticGroup.visible = true;
      underDynGroup.visible = false;
      dynGroup.visible = false;
      r.setRenderTarget(st);
      r.clear(false, true, false);
      this.asCasters(staticGroup, () => r.render(worldScene, this.cam));
      this.lastSunDir.copy(dir);
      this.staticValid = true;
    }

    // Prefer native WebGL2 hardware depth blit (~0.04 ms, preserves Hi-Z); fall back to full-screen quad.
    r.setRenderTarget(this.target);
    const gl = r.getContext() as WebGL2RenderingContext;
    const props = r.properties as unknown as { get(o: object): { __webglFramebuffer?: WebGLFramebuffer } };
    const srcFbo = props.get(st)?.__webglFramebuffer;
    const dstFbo = props.get(this.target)?.__webglFramebuffer;
    if (srcFbo && dstFbo) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, srcFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dstFbo);
      gl.blitFramebuffer(0, 0, this.size, this.size, 0, 0, this.size, this.size, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
    } else {
      fs.render(r, this.copyDepthMat, this.target);
    }

    staticGroup.visible = false;
    underDynGroup.visible = false;
    dynGroup.visible = true;
    r.setRenderTarget(this.target);
    this.asCasters(dynGroup, () => r.render(worldScene, this.cam));
    staticGroup.visible = true;
    underDynGroup.visible = true;
    dynGroup.visible = true;
    r.setRenderTarget(prev);
  }

  dispose(): void {
    this.target?.depthTexture?.dispose();
    this.target?.dispose();
    this.staticTarget?.depthTexture?.dispose();
    this.staticTarget?.dispose();
    this.copyDepthMat.dispose();
  }
}
