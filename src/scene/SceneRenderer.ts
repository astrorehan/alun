import * as THREE from 'three';
import type { ComputedStats, GamePhase, PlayerProgress, TimeOfDay } from '../types';
import type { GameSimulation } from '../simulation';
import { bakeNoise, fsMaterial, fsQuad, FullScreen, G, GLSL_GRADE_LDR, GLSL_UNIFORMS, GLSL_WATER_DEPTH, SunShadow, syncToonQuality } from './gfx';
import {
  chooseQuality,
  Q,
  saveQualitySetting,
  setActiveTier,
  TIER_ORDER,
  type QualitySetting,
  type Tier,
} from './quality';
import { blendLook, cloneLook, LOOKS, type Look } from './look';
import { buildLand, Shore } from './land';
import { GLSL_FOAM_PATTERNS, GLSL_SURF, GLSL_WATER_NOISE, Water } from './water';
import { Sky } from './sky';
import { Post } from './post';
import { Director } from './director';
import { Beach } from './beach';
import { Reef } from './reef';
import { Flora } from './flora';
import { Village } from './village';
import { Net } from './net';
import { Fx, TextLayer } from './fx';
import { Actors } from './actors';
import { Opening, type OpeningHooks } from './opening';
import { Rescue, type RescueHooks } from './rescue';
import { Ending, type EndingHooks } from './ending';
import { Pirates, type PirateHooks } from './pirates';
import { coastLook, murkOf } from './health';
import { StoryLayer } from './story';
import { shoreAt, simX, simY, toX, toZ, UNIT } from './space';

const REFRESH_BANDS = 16;
const CAMERA_BLEND_SECONDS = 0.16;
const MANUAL_SCALE_STEP = 0.125;
const MIN_MANUAL_SCALE = 0.5;

const WATER_COMP_FRAG = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_GRADE_LDR}
${GLSL_WATER_DEPTH}
${GLSL_WATER_NOISE}
${GLSL_SURF}
#define WATER_DETAIL 0
${GLSL_FOAM_PATTERNS}
#include <packing>
varying vec2 vUv;
uniform sampler2D tStatic, tStaticDepth, tWater, tFoamAmount, tNrm, tBloom;
uniform vec2 uNearFar;
uniform mat4 uInvVP;
uniform float uCaustic, uMurk, uBloom, uPxK;
uniform vec3 uFoamLit, uFoamShade, uShift;

float lin(float z){ return -perspectiveDepthToViewZ(z, uNearFar.x, uNearFar.y); }
vec3 worldAt(vec2 uv, float z){
  vec4 p = uInvVP * vec4(uv * 2. - 1., z * 2. - 1., 1.);
  return p.xyz / p.w;
}
vec3 readStatic(vec2 p, bool filterColor){
  // Use the texel paired with scene depth at water crossings. Away from those edges,
  // filter the static color so small camera shifts do not make dry foliage shimmer.
  vec3 s = filterColor ? textureLod(tStatic, p, 0.).rgb :
    texelFetch(tStatic, ivec2(p * vec2(textureSize(tStatic, 0))), 0).rgb;
  #ifdef STATIC_PACK
    return s * s * 2.;
  #else
    return s;
  #endif
}

float fineFoam(vec4 amount, vec3 surface, float viewZ){
  vec2 p = surface.xz;
  pxw = viewZ * uPxK / sqrt(max(normalize(cameraPosition - surface).y, .12));
  float foam = 0.;
  if (amount.r > .02) foam = laceMask(amount.r, p * 1.25);
  if (amount.g > .02) foam = max(foam, threads(amount.g, p) * .8);
  if (amount.b > .05) foam = max(foam, threads(amount.b, p * 1.1) * smoothstep(.06, .3, amount.b) * .9);
  if (amount.a > .02){
    float d = p.x - shoreInfo(p.y).x;
    float surf = surfAt(d, p.y).y * smoothstep(16., 2., d) * smoothstep(-2., 1., d);
    foam = max(foam, max(holes(amount.a, p * 1.25) * .68, surf));
  }
  return sat(foam);
}

void main(){
  vec2 uv = clamp((vUv - .5) / uShift.z + .5 + uShift.xy, .001, .999);
  float sd = textureLod(tStaticDepth, uv, 0.).r;
  float wd = waterDepthAt(uv, sd);
  float depthWidth = fwidth(sd - wd);

  vec3 col;
  if (sd <= wd){
    col = readStatic(uv, wd - sd > 2. * depthWidth + .0001);
  } else {
    vec4 w = textureLod(tWater, uv, 0.);
    float zs = lin(sd);
    float zw = lin(wd);
    float thick = max(zs - zw, 0.);
    col = w.rgb;
    bool shallow = thick < 6.2;
    vec3 uw = shallow ? worldAt(uv, sd) : vec3(0.);

    if (w.a > .004 && thick < 30.){
      float ud = thick * .77;
      float reefK = 0.;
      vec2 ruv = uv;
      if (shallow){
        ud = max(-uw.y, 0.);
        reefK = groundInfo(uw.xz).g;
        #ifdef COMP_REFRACT
        if (thick > .04){
          vec2 ch = textureLod(tNrm, uw.xz * .07 + vec2(uTime * .014, -uTime * .012), 0.).xy - .5;
          vec2 cand = clamp(uv + ch * .005 * sat(thick * .45), .001, .999);
          float cd = textureLod(tStaticDepth, cand, 0.).r;
          // A refracted sample must stay on the same surface at a rock or pier edge.
          if (cd > wd && abs(lin(cd) - zs) < max(.22, thick * .24)) ruv = cand;
        }
        #endif
      }
      vec3 under = readStatic(ruv, false);
      if (shallow && ud < 4.5 && uCaustic > .05){
        vec2 cp = uw.xz + uSunDir.xz * ud * .5;
        float t = uTime;
        float ca1 = texture2D(uNoise, cp * .056 + vec2(t * .011, t * .006)).g;
        float ca2 = texture2D(uNoise, cp * .044 - vec2(t * .009, -t * .012)).g;
        float ca = pow(1. - smoothstep(0., .22, min(ca1, ca2)), 2.2);
        under += (under * .85 + .05) * ca * uCaustic * smoothstep(.02, .55, ud) * exp(-ud * .72) * .56;
      }
      under = mix(under, under * vec3(.74, 1.02, 1.2) + vec3(0., .012, .024), smoothstep(.02, .9, ud) * (1. - reefK * .6));
      float turb = (1. + uMurk * .8) * mix(1., .62, reefK);
      vec3 T = exp(-min(thick * 1.03, 90.) * vec3(.4, .16, .115) * turb);
      // the seabed has to be gone before the cutoff above, or its edge draws a line across the deep water
      col += under * T * w.a * smoothstep(30., 14., thick);
    }

    // Match the dry sand at zero thickness, then draw the swash lip from native depth.
    float contact = 0.;
    if (thick < .6 && uw.y < 1.4 && abs(uw.x - shoreInfo(uw.z).x) < 8.){
      float aa = clamp(depthWidth * zw * zw / uNearFar.x, .008, .048);
      col = mix(readStatic(uv, false), col, smoothstep(0., .56, thick));
      contact = smoothstep(0., aa, thick) * (1. - smoothstep(.032, .082 + aa, thick));
    }

    vec4 amount = textureLod(tFoamAmount, uv, 0.);
    if (max(max(amount.r, amount.g), max(amount.b, amount.a)) > .02 || contact > .001){
      vec3 surface = worldAt(uv, wd);
      float foam = fineFoam(amount, surface, zw);
      float grain = nz(surface.xz * .28 + uTime * .015, .28).r;
      vec3 foamColor = mix(uFoamShade, uFoamLit, clamp(.92 - grain * .58, .25, 1.));
      col = mix(col, foamColor, max(foam * .87, contact * (.66 + .22 * grain)));
    }
  }

  if (uBloom > .005) col += texture2D(tBloom, uv).rgb * uBloom;
  float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
  gl_FragColor = vec4(alunGrade(col, vUv) + (dither - .5) / 255., 1.);
  gl_FragDepth = min(sd, wd);
}
`;

export interface QualityState {
  setting: QualitySetting;
  tier: Tier;
  recommendedTier: Tier;
  fromUrl: boolean;
  fps: number;
  width: number;
  height: number;
}

/**
 * Three.js WebGL2 scene renderer for ALUN. Reads the 2D simulation and supports four visual tiers
 * (Low, Medium, High, Ultra) plus Auto with live tier switching and native-res static world caching.
 */
export class SceneRenderer {
  readonly director = new Director();
  private gl: THREE.WebGLRenderer;
  private fs = new FullScreen();
  private worldScene = new THREE.Scene();
  private staticGroup = new THREE.Group();
  private underDynGroup = new THREE.Group();
  private dynGroup = new THREE.Group();
  private overScene = new THREE.Scene();
  private compScene = new THREE.Scene();
  private copyQuad: THREE.Mesh;

  private rtScene!: THREE.WebGLRenderTarget;
  private rtStatic!: THREE.WebGLRenderTarget;
  private rtStaticBack: THREE.WebGLRenderTarget | null = null;
  private rtWater!: THREE.WebGLRenderTarget;
  private rtWaterMoving: THREE.WebGLRenderTarget | null = null;
  private rtFinal!: THREE.WebGLRenderTarget;
  private copyMat: THREE.ShaderMaterial;
  private cameraBlendMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;

  private shadow: SunShadow;
  private post: Post;
  private sky = new Sky();
  private shore = new Shore();
  private land: THREE.Mesh;
  private water: Water;
  private reef: Reef;
  private flora: Flora;
  private village: Village;
  private beach: Beach;
  private net: Net;
  private fx: Fx;
  private actors: Actors;
  private opening: Opening;
  private rescue: Rescue;
  private story: StoryLayer;
  private ending: Ending;
  private pirates: Pirates;
  private text: TextLayer;

  private canvas: HTMLCanvasElement;
  private look: Look = cloneLook(LOOKS.morning);
  private lastTod: TimeOfDay | null = null;
  private eco = 0.25;
  private time = 0;
  private last = performance.now();
  private lastRenderMs = 0;
  private phase: GamePhase | null = null;
  private settingsOpen = false;
  private forceNextFrame = true;
  private shadowCenter = new THREE.Vector3(-4, 0, -2);
  private frame = 0;
  private pixelRatio = 1;
  private scale = 1;
  private liveScale = 1;
  private samples: number[] = [];
  private sampleMs = 0;
  private warm = 0;
  private frameMs = 16;
  private smoothFps = 60;
  private badWindows = 0;
  private goodWindows = 0;
  private autoCooldown = 0;
  private autoChanges = 0;
  private failedTiers = new Set<Tier>();
  private hintedTier: Tier | null = null;
  private ready = false;
  private contextLost = false;
  private disposed = false;

  /** Quality selection state. */
  private setting: QualitySetting = 'auto';
  private readonly recommendedTier: Tier;
  private fromUrl = false;

  /** Static world cache tracking for Low/Medium. */
  private staticValid = false;
  private movingCamera = false;
  private cameraBlend = 0;
  private cachedPoseVersion = -1;
  private cachedEco = -1;
  private cachedSunDir = new THREE.Vector3();
  private cachedShadowSunDir = new THREE.Vector3();
  private cachedSunCol = new THREE.Color();
  private cachedBio = -1;
  private cachedLamp = -1;
  private refreshStage = -1;
  private pendingEco = 0;
  private pendingBio = 0;
  private pendingLamp = 0;
  private pendingSunDir = new THREE.Vector3();
  private pendingSunCol = new THREE.Color();
  private litterDirty = false;
  private foamLit = new THREE.Color();
  private foamShade = new THREE.Color();

  /** Callbacks for UI integration. */
  onQualityChange: ((state: QualityState) => void) | null = null;
  onPerfHint: ((suggested: Tier) => void) | null = null;
  onContextLost: (() => void) | null = null;
  onContextRestored: (() => void) | null = null;

  /** Look-dev overrides used by lab.html. */
  fixedDt: number | null = null;
  forceTod: TimeOfDay | null = null;
  forceEco: number | null = null;

  private boundPointerMove: (e: PointerEvent) => void;
  private boundContextLost: (e: Event) => void;
  private boundContextRestored: () => void;

  constructor(canvas: HTMLCanvasElement, context?: WebGL2RenderingContext) {
    this.canvas = canvas;
    document.documentElement.classList.add('scene3d');
    this.gl = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: true,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.gl.autoClear = false;
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.gl.info.autoReset = false;

    const picked = chooseQuality(this.gl.getContext());
    this.setting = picked.setting;
    this.fromUrl = picked.fromUrl;
    this.recommendedTier = picked.recommendedTier;
    this.liveScale = this.initialLiveScale();
    this.post = new Post();

    this.reef = new Reef();
    this.flora = new Flora();
    this.village = new Village();
    this.beach = new Beach();
    this.land = buildLand();

    G.uNoise.value = bakeNoise(this.gl, this.fs);
    this.syncNoiseFilter();
    this.shadow = new SunShadow(Q.shadow);

    this.staticGroup.add(this.sky.mesh);
    this.staticGroup.add(this.land);
    this.staticGroup.add(this.reef.group);
    this.staticGroup.add(this.flora.group);
    this.staticGroup.add(this.village.group);
    this.staticGroup.add(this.beach.group);

    this.water = new Water();
    this.water.init(this.gl, this.fs);
    this.net = new Net(this.water);
    this.staticGroup.add(this.net.staticGroup);
    this.fx = new Fx(this.water);
    this.actors = new Actors(this.water, this.net, this.fx);
    this.actors.onCatch = () => this.village.cheer();
    this.opening = new Opening(this.water, this.fx, this.actors);
    this.rescue = new Rescue(this.water, this.fx, this.actors, this.director);
    this.story = new StoryLayer(this.water, this.fx);
    this.story.onCheer = () => this.village.cheer();
    this.actors.guests = this.story.guests;
    this.ending = new Ending(this.story, this.fx);
    this.pirates = new Pirates(this.water, this.fx, this.story);
    this.staticGroup.add(this.story.staticGroup);

    this.underDynGroup.add(this.reef.dynGroup);
    this.underDynGroup.add(this.actors.underGroup);
    this.underDynGroup.add(this.story.underGroup);

    this.dynGroup.add(this.flora.dynGroup);
    this.dynGroup.add(this.village.dynGroup);
    this.dynGroup.add(this.beach.dynGroup);
    this.dynGroup.add(this.net.group);
    this.dynGroup.add(this.actors.group);
    this.dynGroup.add(this.story.group);
    this.dynGroup.add(this.opening.group);
    this.dynGroup.add(this.rescue.group);
    this.dynGroup.add(this.pirates.group);

    this.worldScene.add(this.staticGroup, this.underDynGroup, this.dynGroup);

    this.text = new TextLayer(canvas);

    this.copyMat = fsMaterial(
      /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc, tDepth;
void main(){ gl_FragColor = texture2D(tSrc, vUv); gl_FragDepth = texture2D(tDepth, vUv).x; }`,
      { tSrc: { value: null }, tDepth: { value: null } },
      { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth }
    );
    this.copyQuad = fsQuad(this.copyMat);
    this.copyQuad.renderOrder = -1000;
    this.overScene.add(this.copyQuad, this.water.mesh, this.actors.overGroup, this.fx.group);

    this.cameraBlendMat = fsMaterial(
      /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform float uOpacity;
void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, uOpacity); }`,
      { tSrc: { value: null }, uOpacity: { value: 1 } },
      { transparent: true }
    );

    this.compMat = fsMaterial(
      WATER_COMP_FRAG,
      {
        ...G,
        tStatic: { value: null },
        tStaticDepth: { value: null },
        tWater: { value: null },
        tFoamAmount: { value: null },
        tNrm: { value: this.water.nrmTexture },
        tBloom: { value: null },
        uNearFar: { value: new THREE.Vector2(1, 1400) },
        uInvVP: { value: new THREE.Matrix4() },
        uCaustic: { value: 1 },
        uMurk: { value: 0 },
        uBloom: { value: 0.3 },
        uPxK: { value: 0.001 },
        uFoamLit: { value: this.foamLit },
        uFoamShade: { value: this.foamShade },
        uShift: { value: new THREE.Vector3(0, 0, 1) },
      },
      { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth }
    );
    if (Q.waterDetail >= 1) this.compMat.defines.COMP_REFRACT = 1;
    const compQ = fsQuad(this.compMat);
    compQ.renderOrder = -1000;
    this.compScene.add(compQ);

    this.allocTargets();
    this.applyModeFlags();
    this.resize();

    canvas.style.opacity = '0';
    canvas.style.transition = 'opacity 0.8s ease';
    void this.warmUp();

    this.boundPointerMove = (e: PointerEvent) => {
      this.director.parallaxX = (e.clientX / window.innerWidth) * 2 - 1;
      this.director.parallaxY = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', this.boundPointerMove);

    this.boundContextLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      this.staticValid = false;
      this.refreshStage = -1;
      this.onContextLost?.();
    };
    this.boundContextRestored = () => {
      this.contextLost = false;
      G.uNoise.value = bakeNoise(this.gl, this.fs);
      this.syncNoiseFilter();
      this.water.init(this.gl, this.fs);
      this.compMat.uniforms.tNrm.value = this.water.nrmTexture;
      this.shadow.invalidateStatic();
      this.cachedShadowSunDir.set(0, 0, 0);
      this.allocTargets();
      this.resize();
      this.staticValid = false;
      this.refreshStage = -1;
      this.forceNextFrame = true;
      this.onContextRestored?.();
    };
    canvas.addEventListener('webglcontextlost', this.boundContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.boundContextRestored, false);
  }

  private syncNoiseFilter(): void {
    const tex = G.uNoise.value;
    if (!tex) return;
    const wantMin = Q.waterDetail <= 1 ? THREE.LinearMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
    if (tex.minFilter !== wantMin) {
      tex.minFilter = wantMin;
      tex.needsUpdate = true;
    }
  }

  private makeRT(
    w: number,
    h: number,
    samples: number,
    withDepthTex: boolean,
    nearestDepth = false,
    type: THREE.TextureDataType = THREE.HalfFloatType,
    count = 1
  ): THREE.WebGLRenderTarget {
    const depthTex = withDepthTex ? new THREE.DepthTexture(w, h, THREE.UnsignedIntType) : undefined;
    if (depthTex && nearestDepth) {
      depthTex.minFilter = THREE.NearestFilter;
      depthTex.magFilter = THREE.NearestFilter;
    }
    return new THREE.WebGLRenderTarget(w, h, {
      type,
      count,
      format: THREE.RGBAFormat,
      samples,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      ...(depthTex ? { depthTexture: depthTex } : {}),
    });
  }

  private disposeRT(rt: THREE.WebGLRenderTarget | null | undefined): void {
    if (!rt) return;
    rt.depthTexture?.dispose();
    rt.dispose();
  }

  private allocTargets(): void {
    this.disposeRT(this.rtScene);
    this.disposeRT(this.rtStatic);
    this.disposeRT(this.rtStaticBack);
    this.rtStaticBack = null;
    this.disposeRT(this.rtWater);
    this.disposeRT(this.rtWaterMoving);
    this.disposeRT(this.rtFinal);

    const staticType = Q.cached && Q.tier === 'low' ? THREE.UnsignedByteType : THREE.HalfFloatType;
    // A single color/depth sample keeps submerged and dry pixels coherent at silhouettes.
    const makeStatic = (): THREE.WebGLRenderTarget => this.makeRT(4, 4, 0, true, true, staticType);
    const makeWater = (): THREE.WebGLRenderTarget =>
      this.makeRT(4, 4, 0, true, true, THREE.HalfFloatType, Q.cached ? 2 : 1);
    this.rtScene = Q.cached ? makeStatic() : this.makeRT(4, 4, Q.msaa, true);
    this.rtStatic = makeStatic();
    if (Q.cached) this.rtStaticBack = makeStatic();
    this.rtWater = makeWater();
    this.rtWaterMoving = Q.cached ? makeWater() : null;
    this.rtFinal = this.makeRT(
      4, 4, Q.msaa, false, false, Q.cached ? THREE.UnsignedByteType : THREE.HalfFloatType
    );
    this.bindTargetUniforms();
  }

  private bindTargetUniforms(): void {
    this.copyMat.uniforms.tSrc.value = this.rtScene.texture;
    this.copyMat.uniforms.tDepth.value = this.rtScene.depthTexture;
    this.cameraBlendMat.uniforms.tSrc.value = this.rtFinal.texture;
    this.bindStaticTarget(Q.cached ? this.rtStatic : this.rtScene);
    this.bindWaterTarget(this.rtWater);
  }

  private bindStaticTarget(rt: THREE.WebGLRenderTarget): void {
    this.compMat.uniforms.tStatic.value = rt.texture;
    this.compMat.uniforms.tStaticDepth.value = rt.depthTexture;
    this.water.material.uniforms.tScene.value = rt.texture;
    this.water.material.uniforms.tDepth.value = rt.depthTexture;
    G.tStaticDepth.value = rt.depthTexture;
  }

  private bindWaterTarget(rt: THREE.WebGLRenderTarget): void {
    this.compMat.uniforms.tWater.value = rt.texture;
    this.compMat.uniforms.tFoamAmount.value = rt.textures[1] ?? null;
    G.tWaterTex.value = rt.texture;
    G.tWaterDepth.value = rt.depthTexture;
    G.uWaterRes.value.set(rt.width, rt.height);
    G.uWaterTexel.value.set(1 / rt.width, 1 / rt.height);
  }

  private applyModeFlags(): void {
    this.director.use2DShift = Q.cached;
    this.reef.setCachedMode(Q.cached);
    this.actors.setCachedMode(Q.cached);
    this.story.setCachedMode(Q.cached);
    this.net.setCachedMode(Q.cached);
    G.uCachedUnder.value = Q.cached ? 1 : 0;
    const wantRefract = Q.waterDetail >= 1;
    const wantPack = Q.cached && Q.tier === 'low';
    let compChanged = false;
    if (Boolean(this.compMat.defines.COMP_REFRACT) !== wantRefract) {
      if (wantRefract) this.compMat.defines.COMP_REFRACT = 1;
      else delete this.compMat.defines.COMP_REFRACT;
      compChanged = true;
    }
    if (Boolean(this.compMat.defines.STATIC_PACK) !== wantPack) {
      if (wantPack) this.compMat.defines.STATIC_PACK = 1;
      else delete this.compMat.defines.STATIC_PACK;
      compChanged = true;
    }
    if (compChanged) this.compMat.needsUpdate = true;
  }

  private async warmUp(): Promise<void> {
    const cam = this.director.camera;
    const passes = new THREE.Scene();
    for (const m of [...this.post.materials, ...this.water.passes, this.shadow.copyDepthMat]) passes.add(fsQuad(m));

    // Temporarily reveal hidden meshes (aim ribbon, rain, oil, boss, buoys) so compileAsync compiles their shaders upfront.
    const hidden: THREE.Object3D[] = [];
    const reveal = (root: THREE.Object3D): void => {
      root.traverse((o) => {
        if (!o.visible) {
          hidden.push(o);
          o.visible = true;
        }
      });
    };
    reveal(this.worldScene);
    reveal(this.overScene);

    const jobs: Promise<unknown>[] = [];
    const add = (s: THREE.Scene, c: THREE.Camera = cam): void => void jobs.push(this.gl.compileAsync(s, c));
    add(this.worldScene);
    add(this.overScene);
    if (Q.cached) {
      add(this.compScene);
      passes.add(fsQuad(this.cameraBlendMat));
    }
    add(passes);
    this.shadow.asCasters([this.worldScene], () => add(this.worldScene));
    await Promise.all(jobs);
    if (this.disposed) return;
    if (this.rtWaterMoving) {
      this.gl.initRenderTarget(this.rtScene);
      this.gl.initRenderTarget(this.rtWaterMoving);
      this.gl.initRenderTarget(this.rtFinal);
    }
    // Prime D3D11/ANGLE PSOs for MRT wave-stamps and overScene (aim, sprites, oil, rain) with a 1x1 scissor draw
    // against the live render target format so the player's first swipe never hitches.
    this.water.warmStamp(this.gl);
    this.fx.sprites.begin();
    this.fx.sprites.push(0, -999, 0, 0.1, 0.1, 0, 1, 1, 1, 0.05, 0, 0);
    this.fx.sprites.push(0, -999, 0, 0.1, 0.1, 0, 1, 1, 1, 0.05, 0, 1);
    this.fx.sprites.end();
    const warmRt = Q.cached ? null : this.rtFinal;
    if (Q.cached) {
      this.copyQuad.visible = false;
      this.water.mesh.visible = false;
    }
    this.gl.setRenderTarget(warmRt);
    this.gl.setScissorTest(true);
    this.gl.setScissor(0, 0, 1, 1);
    this.gl.render(this.overScene, cam);
    this.gl.setScissorTest(false);
    this.gl.setRenderTarget(null);
    this.copyQuad.visible = true;
    this.water.mesh.visible = true;
    this.fx.sprites.begin();
    this.fx.sprites.end();
    for (const o of hidden) o.visible = false;
    this.ready = true;
    this.last = performance.now();
    this.forceNextFrame = true;
    this.canvas.style.opacity = '1';
    this.onQualityChange?.(this.getQualityState());
  }

  /** Drops the camera to the beach for the title, lifts it back up to play. */
  setPhase(phase: GamePhase): void {
    if (phase === this.phase) return;
    const first = this.phase === null;
    this.phase = phase;
    this.forceNextFrame = true;
    // the opening flies the camera itself, and so does a dolphin's film a save was in the middle of
    if (phase === 'intro' || this.rescue.filming || this.ending.active || this.pirates.filming) return;
    const mode = phase === 'title' ? 'title' : 'play';
    if (first) this.director.snap(mode);
    else this.director.setMode(mode, 2.8);
  }

  /**
   * Plays the opening film over the live lagoon. `sim` should start empty: the tourists fill it.
   * `done` runs once, when the film ends or is skipped, with the camera on its way to the play view.
   */
  playOpening(sim: GameSimulation, stats: ComputedStats, hooks: OpeningHooks, done: () => void): void {
    this.opening.end();
    this.opening.begin(sim, stats, hooks);
    this.director.film(
      (t, out) => this.opening.shoot(t, out, this.director.playPose),
      () => {
        this.opening.end();
        done();
      }
    );
    this.forceNextFrame = true;
  }

  /** Cuts the opening short, leaving the lagoon exactly as the end of it would have. */
  skipOpening(): void {
    if (!this.opening.active) return;
    this.opening.finish();
    this.director.skip();
  }

  get openingActive(): boolean {
    return this.opening.active;
  }

  /** The closing film. `done` runs once, at its end or when it is skipped. */
  playEnding(_sim: GameSimulation, hooks: EndingHooks, done: () => void): void {
    this.ending.end();
    this.ending.begin(hooks);
    this.director.film(
      (t, out) => this.ending.shoot(t, out, this.director.playPose),
      () => {
        this.ending.end();
        done();
      }
    );
    this.forceNextFrame = true;
  }

  skipEnding(): void {
    if (this.ending.active) this.director.skip();
  }

  /**
   * The first raider's film: out to the ship (entity `id`), its crew, and the captain's spyglass on the
   * village pier. `done` runs once, at its end or when it is skipped, with the camera on its way home.
   */
  playPirates(sim: GameSimulation, id: number, hooks: PirateHooks, done: () => void): void {
    this.pirates.end();
    this.pirates.begin(sim, id, hooks);
    this.director.film(
      (t, out) => this.pirates.shoot(t, out, this.director.playPose),
      () => {
        this.pirates.end();
        done();
      }
    );
    this.forceNextFrame = true;
  }

  skipPiratesFilm(): void {
    if (this.pirates.filming) this.director.skip();
  }

  /** Drops the pirates' film without ceremony (reset, new game), the camera straight back to play. */
  cancelPirates(): void {
    if (!this.pirates.filming) return;
    this.pirates.end();
    this.director.setMode('play', 1.2);
  }

  get piratesActive(): boolean {
    return this.pirates.filming;
  }

  /** Where a place in the lagoon is on the page, in CSS pixels. Off to the side of the screen still has a direction. */
  worldToScreen(x: number, y: number): { x: number; y: number } | null {
    if (!this.director.isSettled()) return null;
    const cam = this.director.camera;
    const r = this.canvas.getBoundingClientRect();
    const sh = this.director.screenShift;
    this.probe.set(toX(x), 0, toZ(y)).project(cam);
    if (this.probe.z < -1 || this.probe.z > 1) return null;
    const u = (this.probe.x * 0.5 - sh.x) * sh.z + 0.5;
    const v = (this.probe.y * 0.5 - sh.y) * sh.z + 0.5;
    return { x: r.left + u * r.width, y: r.top + (1 - v) * r.height };
  }
  private probe = new THREE.Vector3();

  /**
   * Pulls the camera away to the tangled dolphin (entity `id`, see GameSimulation.spawnDolphin) and
   * keeps play there until it is free, then films it leaping away and comes back to the lagoon.
   */
  playRescue(sim: GameSimulation, id: number, hooks: RescueHooks): void {
    this.rescue.cancel();
    this.rescue.begin(sim, id, hooks);
    this.forceNextFrame = true;
  }

  /** Skips the rescue's current film, if one is running. */
  skipRescueFilm(): void {
    this.rescue.skip();
  }

  /** Drops the rescue without ceremony (reset, new game). */
  cancelRescue(): void {
    this.rescue.cancel();
  }

  get rescueActive(): boolean {
    return this.rescue.active;
  }

  setSettingsOpen(open: boolean): void {
    if (this.settingsOpen === open) return;
    this.settingsOpen = open;
    this.forceNextFrame = true;
  }

  getQualityState(): QualityState {
    return {
      setting: this.setting,
      tier: Q.tier,
      recommendedTier: this.recommendedTier,
      fromUrl: this.fromUrl,
      fps: Math.round(this.smoothFps),
      width: this.gl.domElement.width,
      height: this.gl.domElement.height,
    };
  }

  /** Live quality switch from the Settings UI or lab; never reloads or loses progress. */
  setQualitySetting(setting: QualitySetting, persist = true): void {
    if (setting === this.setting && !this.fromUrl) return;
    this.setting = setting;
    this.fromUrl = false;
    if (persist) saveQualitySetting(setting);
    this.failedTiers.clear();
    this.autoChanges = 0;
    this.autoCooldown = 0;
    this.hintedTier = null;
    const nextTier = setting === 'auto' ? this.recommendedTier : setting;
    this.applyTier(nextTier);
  }

  private get scalesManualTier(): boolean {
    return !Q.cached && this.setting !== 'auto' && !this.fromUrl;
  }

  private initialLiveScale(): number {
    if (!this.scalesManualTier) return 1;
    if (this.recommendedTier === 'low') return Q.tier === 'ultra' ? .5 : .625;
    return this.recommendedTier === 'medium' ? .875 : 1;
  }

  private applyTier(tier: Tier): void {
    const prevTier = Q.tier;
    const prevCached = Q.cached;
    const prevMsaa = Q.msaa;
    setActiveTier(tier);
    this.liveScale = this.initialLiveScale();
    syncToonQuality();
    this.syncNoiseFilter();
    this.flora.setBrushDensity(Q.brush);
    this.shadow.resize(Q.shadow);
    this.shadow.invalidateStatic();
    this.cachedShadowSunDir.set(0, 0, 0);
    this.water.applyQuality(this.gl, Q.cached);
    this.post.syncQuality();
    this.applyModeFlags();

    const prevPack = prevCached && prevTier === 'low';
    const nextPack = Q.cached && Q.tier === 'low';
    if (prevCached !== Q.cached || prevMsaa !== Q.msaa || prevPack !== nextPack) {
      this.allocTargets();
    } else {
      this.bindTargetUniforms();
    }
    this.staticValid = false;
    this.refreshStage = -1;
    this.samples.length = 0;
    this.sampleMs = 0;
    this.badWindows = 0;
    this.goodWindows = 0;
    this.warm = 0;
    this.resize();
    this.forceNextFrame = true;
    this.onQualityChange?.(this.getQualityState());
  }

  private adapt(ms: number): void {
    if (this.fixedDt !== null || ms <= 0 || ms > 250) return;
    if (this.phase !== 'playing' || this.settingsOpen || document.hidden || !this.director.isSettled()) return;
    const instFps = 1000 / Math.max(4, ms);
    this.smoothFps += (instFps - this.smoothFps) * 0.08;

    if (this.autoCooldown > 0) {
      this.autoCooldown -= ms / 1000;
      return;
    }
    const manualLive = this.scalesManualTier;
    if (++this.warm < (manualLive ? 12 : 35)) return;

    this.samples.push(ms);
    this.sampleMs += ms;
    if (this.samples.length < (manualLive ? 12 : 24) || this.sampleMs < (manualLive ? 1000 : 2200)) return;

    const sorted = this.samples.slice().sort((x, y) => x - y);
    this.frameMs = sorted[sorted.length >> 1];
    this.samples.length = 0;
    this.sampleMs = 0;

    if (this.setting !== 'auto' || this.fromUrl) {
      if (manualLive && this.adaptLiveScale()) return;
      if (!this.fromUrl && Q.tier !== 'low' && this.hintedTier !== Q.tier) {
        if (this.frameMs > 36) {
          if (++this.badWindows >= 2) {
            this.hintedTier = Q.tier;
            this.badWindows = 0;
            const idx = Math.min(TIER_ORDER.indexOf(Q.tier) - 1, TIER_ORDER.indexOf(this.recommendedTier));
            this.onPerfHint?.(TIER_ORDER[idx]);
          }
        } else {
          this.badWindows = 0;
        }
      }
      return;
    }

    if (this.autoChanges >= 3) return;
    const idx = TIER_ORDER.indexOf(Q.tier);
    const downLimit = Q.tier === 'ultra' ? 20 : Q.tier === 'high' ? 23 : 26;
    if (this.frameMs > downLimit && idx > 0) {
      this.goodWindows = 0;
      if (++this.badWindows >= 2) {
        this.failedTiers.add(Q.tier);
        this.autoChanges++;
        this.autoCooldown = 7;
        this.applyTier(TIER_ORDER[idx - 1]);
      }
    } else if (this.frameMs < 9.5 && idx < TIER_ORDER.indexOf('high')) {
      this.badWindows = 0;
      const candidate = TIER_ORDER[idx + 1];
      if (!this.failedTiers.has(candidate) && ++this.goodWindows >= 3) {
        this.autoChanges++;
        this.autoCooldown = 8;
        this.applyTier(candidate);
      }
    } else {
      this.badWindows = 0;
      this.goodWindows = 0;
    }
  }

  private adaptLiveScale(): boolean {
    let next = this.liveScale;
    if (this.frameMs > 32) {
      this.goodWindows = 0;
      next = Math.max(MIN_MANUAL_SCALE, next - MANUAL_SCALE_STEP);
    } else if (this.frameMs < Q.target * 1.12 && next < 1) {
      if (++this.goodWindows >= 3) next = Math.min(1, next + MANUAL_SCALE_STEP);
    } else {
      this.goodWindows = 0;
    }
    if (next === this.liveScale) return false;
    this.liveScale = next;
    this.goodWindows = 0;
    this.badWindows = 0;
    this.autoCooldown = 1.5;
    this.resize();
    this.onQualityChange?.(this.getQualityState());
    return true;
  }

  resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(Q.dprCap, window.devicePixelRatio || 1);
    this.scale = Math.min(1, Math.sqrt((Q.mp * 1e6) / (w * h * dpr * dpr))) * this.liveScale;
    this.pixelRatio = dpr * this.scale;
    this.gl.setPixelRatio(this.pixelRatio);
    this.gl.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const pw = Math.max(4, this.gl.domElement.width);
    const ph = Math.max(4, this.gl.domElement.height);
    if (Q.cached) {
      const cw = Math.max(4, Math.round(pw * Q.cameraScale));
      const ch = Math.max(4, Math.round(ph * Q.cameraScale));
      this.rtScene.setSize(cw, ch);
      this.rtFinal.setSize(cw, ch);
      this.rtStatic.setSize(pw, ph);
      if (this.rtStaticBack) {
        this.rtStaticBack.scissorTest = false;
        this.rtStaticBack.setSize(pw, ph);
      }
      const ww = Math.max(4, Math.round(pw * Q.waterScale));
      const wh = Math.max(4, Math.round(ph * Q.waterScale));
      this.rtWater.setSize(ww, wh);
      this.rtWaterMoving?.setSize(
        Math.max(4, Math.min(ww, Math.round(cw * .75))),
        Math.max(4, Math.min(wh, Math.round(ch * .75)))
      );
    } else {
      this.rtScene.setSize(pw, ph);
      this.rtFinal.setSize(pw, ph);
      this.rtStatic.setSize(4, 4);
      if (this.rtStaticBack) this.rtStaticBack.setSize(4, 4);
      this.rtWater.setSize(4, 4);
    }
    this.post.resize(pw, ph);
    this.text.resize(w, h, Math.min(2, window.devicePixelRatio || 1));
    G.uRes.value.set(pw, ph);
    this.director.fit(w / h, w > h && window.matchMedia('(pointer: coarse)').matches);
    this.staticValid = false;
    this.movingCamera = false;
    this.cameraBlend = 0;
    this.refreshStage = -1;
    this.forceNextFrame = true;
  }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const u = (clientX - r.left) / r.width;
    const v = 1 - (clientY - r.top) / r.height;
    const sh = this.director.screenShift;
    const su = (u - 0.5) / sh.z + 0.5 + sh.x;
    const sv = (v - 0.5) / sh.z + 0.5 + sh.y;
    const ndc = new THREE.Vector3(su * 2 - 1, sv * 2 - 1, 0.5);
    ndc.unproject(this.director.camera);
    const o = this.director.camera.position;
    const d = ndc.sub(o);
    const t = -o.y / (Math.abs(d.y) < 1e-5 ? -1e-5 : d.y);
    return { x: simX(o.x + d.x * t), y: simY(o.z + d.z * t) };
  }

  private renderStaticFull(cam: THREE.Camera, target: THREE.WebGLRenderTarget, renderShadow: boolean): void {
    this.staticGroup.visible = true;
    this.underDynGroup.visible = false;
    this.dynGroup.visible = false;
    if (renderShadow) {
      this.shadow.render(this.gl, [this.worldScene], this.shadowCenter);
      this.cachedShadowSunDir.copy(this.look.sunDir);
    }
    target.scissorTest = false;
    this.gl.setRenderTarget(target);
    this.gl.setClearColor(0x000000, 1);
    this.gl.clear(true, true, false);
    this.gl.render(this.worldScene, cam);
  }

  /**
   * Multi-frame horizontal scissor-band static refresh into pre-allocated rtStaticBack so gradual
   * ToD/eco/litter transitions stay under ~4 ms per frame and swap atomically with zero hitches.
   */
  private stepIncrementalRefresh(cam: THREE.Camera): void {
    const back = this.rtStaticBack;
    if (!back) return;
    const pw = this.rtStatic.width;
    const ph = this.rtStatic.height;
    if (back.width !== pw || back.height !== ph) {
      back.scissorTest = false;
      back.setSize(pw, ph);
    }

    this.staticGroup.visible = true;
    this.underDynGroup.visible = false;
    this.dynGroup.visible = false;

    if (this.refreshStage === 0) {
      this.pendingEco = this.eco;
      this.pendingBio = this.look.bio;
      this.pendingLamp = this.look.lamp;
      this.pendingSunDir.copy(this.look.sunDir);
      this.pendingSunCol.copy(this.look.sun);
      this.refreshStage = 1;
      if (this.look.sunDir.distanceToSquared(this.cachedShadowSunDir) > 0.0004) {
        this.shadow.render(this.gl, [this.worldScene], this.shadowCenter);
        this.cachedShadowSunDir.copy(this.look.sunDir);
        return;
      }
    }

    const band = this.refreshStage - 1;
    const y0 = Math.floor((band * ph) / REFRESH_BANDS);
    const y1 = Math.floor(((band + 1) * ph) / REFRESH_BANDS);
    back.scissorTest = true;
    back.scissor.set(0, y0, pw, Math.max(1, y1 - y0));
    this.gl.setRenderTarget(back);
    this.gl.setClearColor(0x000000, 1);
    this.gl.clear(true, true, false);
    this.gl.render(this.worldScene, cam);
    back.scissorTest = false;

    if (this.refreshStage >= REFRESH_BANDS) {
      const prev = this.rtStatic;
      this.rtStatic = back;
      this.rtStaticBack = prev;
      this.cachedEco = this.pendingEco;
      this.cachedBio = this.pendingBio;
      this.cachedLamp = this.pendingLamp;
      this.cachedSunDir.copy(this.pendingSunDir);
      this.cachedSunCol.copy(this.pendingSunCol);
      this.cachedPoseVersion = this.director.poseVersion;
      this.staticValid = true;
      this.litterDirty = false;
      this.refreshStage = -1;
    } else {
      this.refreshStage++;
    }
  }

  private recordStaticState(): void {
    this.cachedEco = this.eco;
    this.cachedBio = this.look.bio;
    this.cachedLamp = this.look.lamp;
    this.cachedSunDir.copy(this.look.sunDir);
    this.cachedSunCol.copy(this.look.sun);
    this.cachedPoseVersion = this.director.poseVersion;
    this.staticValid = true;
    this.litterDirty = false;
  }

  private staticNeedsGradualRefresh(): boolean {
    if (this.litterDirty) return true;
    if (Math.abs(this.eco - this.cachedEco) > 0.065) return true;
    if (Math.abs(this.look.bio - this.cachedBio) > 0.045) return true;
    if (Math.abs(this.look.lamp - this.cachedLamp) > 0.05) return true;
    if (this.look.sunDir.distanceToSquared(this.cachedSunDir) > 0.0015) return true;
    const dr = this.look.sun.r - this.cachedSunCol.r;
    const dg = this.look.sun.g - this.cachedSunCol.g;
    const db = this.look.sun.b - this.cachedSunCol.b;
    if (dr * dr + dg * dg + db * db > 0.0025) return true;
    return false;
  }

  render(sim: GameSimulation, progress: PlayerProgress, stats: ComputedStats, isPlaying: boolean): void {
    if (!this.ready || this.contextLost || this.disposed) return;
    if (document.hidden && this.fixedDt === null) return;

    const now = performance.now();
    // Save GPU in non-gameplay overlays (shop, settings, victory) and settled title screen.
    if (this.fixedDt === null && !this.forceNextFrame) {
      const overlayPaused = this.settingsOpen || this.phase === 'upgrade' || this.phase === 'victory' || this.phase === 'defeat';
      if (overlayPaused && now - this.lastRenderMs < 80) return;
      if (this.phase === 'title' && Q.cached && this.director.isSettled() && now - this.lastRenderMs < 27) return;
    }
    this.forceNextFrame = false;
    this.lastRenderMs = now;

    const frameDelta = now - this.last;
    this.adapt(frameDelta);
    const real = this.fixedDt ?? Math.min(0.05, Math.max(0.001, frameDelta / 1000));
    const dt = real * this.director.speed;
    this.last = now;
    this.time += dt;
    this.gl.info.reset();

    // the title shows the lagoon as it should be; pressing play reveals the one you are handed
    const onTitle = this.phase === 'title';
    const tod = this.forceTod ?? (onTitle ? 'dawn' : sim.getTimeOfDay(progress));
    const coast = coastLook(stats.pollution) * 100;
    // the opening starts from the lagoon of the title and spoils it as the rubbish goes in
    const ecoNow = this.opening.active ? this.opening.eco(coast) : onTitle ? Math.max(85, coast) : coast;
    const ecoTarget = (this.forceEco ?? ecoNow) / 100;
    if (this.lastTod === null) {
      this.look = cloneLook(LOOKS[tod]);
      this.lastTod = tod;
      this.eco = ecoTarget;
      this.staticValid = false;
    } else if (this.lastTod !== tod) {
      const targetLook = LOOKS[tod];
      if (this.look.sunDir.distanceToSquared(targetLook.sunDir) < 1e-5 && Math.abs(this.look.exposure - targetLook.exposure) < 0.002) {
        this.look = cloneLook(targetLook);
        this.lastTod = tod;
      } else {
        blendLook(this.look, targetLook, 1 - Math.exp(-dt * 0.9));
      }
    }
    this.eco += (ecoTarget - this.eco) * Math.min(1, dt * (this.director.cinematic() > 0.05 ? 0.8 : 1.5));
    this.applyLook(sim.flashAlpha);

    this.trackShore(sim, stats);
    this.shore.update(dt, this.time, this.look.swell);
    this.director.use2DShift = Q.cached && this.fixedDt === null;
    this.director.update(real, sim.screenShake);
    if (this.opening.active) {
      // something else took the camera (the lab's buttons can): wrap the opening up where it stands
      if (this.director.inCutscene) this.opening.update(this.director.clock, dt, this.time, this.look.swell, this.director.camera.position);
      else this.opening.finish();
    }

    const cam = this.director.camera;
    const cine = this.director.cinematic();
    // In overhead gameplay view, land covers the entire screen so the sky dome can be skipped.
    this.sky.mesh.visible = cine > 0.01;

    this.reef.update(this.time, sim);
    if (this.beach.update(dt, this.eco)) this.litterDirty = true;
    this.village.update(dt, this.time, (x, z) => this.water.heightAt(x, z, this.time, this.look.swell));
    if (this.net.update(dt, this.time, sim, stats, progress.upgrades.net_expand ?? 0)) {
      this.staticValid = false;
      this.refreshStage = -1;
      this.shadow.invalidateStatic();
      this.cachedShadowSunDir.set(0, 0, 0);
    }
    // none of it has happened yet on the title, nor on the first morning of the opening
    const veiled = onTitle || this.opening.pristine;
    this.story.veiled = veiled || (this.opening.active && !this.opening.closed);
    this.actors.veiled = veiled;
    if (sim !== this.storySim || sim.lagoonId !== this.storyId) {
      this.storySim = sim;
      this.storyId = sim.lagoonId;
      this.story.reset();
    }
    this.fx.update(dt, this.time, sim, stats, this.look, cam.position, cine);
    this.opening.drawBoatShadow();
    // after the sprite batch is opened, so the marker rings make it to the screen
    if (this.ending.active) this.ending.update(Math.max(0, this.director.clock));
    if (this.pirates.filming) {
      // something else took the camera: the film is over
      if (this.director.inCutscene) this.pirates.film(this.director.clock, cam.position);
      else this.pirates.end();
    }
    this.story.update(dt, this.time, sim, this.look, this.rescue);
    this.pirates.update(dt, this.time, sim);
    this.actors.update(dt, this.time, sim, stats, this.look, cam.position, cine);
    this.rescue.update(dt, this.time, this.look.swell, sim);
    this.fx.sprites.end();
    this.village.applyLamps([...this.story.lamps, ...this.actors.lamps, ...this.net.lamps], this.time);
    this.flora.update(this.time, progress, stats.mangroveLevel > 0, stats.forestLevel > 0 || this.eco >= 0.45 ? 1 : 0.2);
    this.water.update(this.gl, this.fs, dt, sim, cam.position, cine);

    const wu = this.water.material.uniforms;
    wu.uInvVP.value.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
    wu.uNearFar.value.set(cam.near, cam.far);
    wu.uNet.value.z = stats.netRadius * UNIT;
    wu.uNet.value.w = sim.netPulse;
    G.uNearFar.value.set(cam.near, cam.far);

    const sh = this.director.screenShift;
    G.uShiftG.value.copy(sh);

    if (Q.cached) {
      const settled = this.director.isSettled();
      // Keep one reduced-resolution frame at the exact resting pose for a short blend into the cache.
      const movingView = !settled || this.movingCamera;
      this.movingCamera = !settled;
      const output = movingView ? this.rtFinal : null;
      G.uRes.value.set(output?.width ?? this.rtStatic.width, output?.height ?? this.rtStatic.height);
      if (movingView) {
        this.refreshStage = -1;
        this.renderStaticFull(cam, this.rtScene, this.cachedShadowSunDir.lengthSq() === 0);
      } else if (
        !this.staticValid ||
        this.cachedPoseVersion !== this.director.poseVersion ||
        (this.fixedDt !== null && this.staticNeedsGradualRefresh())
      ) {
        this.refreshStage = -1;
        this.renderStaticFull(cam, this.rtStatic, this.look.sunDir.distanceToSquared(this.cachedShadowSunDir) > 0.0004);
        this.recordStaticState();
      } else if (this.refreshStage >= 0) {
        this.stepIncrementalRefresh(cam);
      } else if (this.staticNeedsGradualRefresh()) {
        this.refreshStage = 0;
        this.stepIncrementalRefresh(cam);
      }
      const staticTarget = movingView ? this.rtScene : this.rtStatic;
      const waterTarget = movingView && this.rtWaterMoving ? this.rtWaterMoving : this.rtWater;
      this.bindStaticTarget(staticTarget);
      this.bindWaterTarget(waterTarget);

      // Render the base water color and foam envelopes at reduced resolution.
      wu.uWaterSurfRes.value.set(waterTarget.width, waterTarget.height);
      wu.uPxK.value = (2 * Math.tan((cam.fov * Math.PI) / 360)) / waterTarget.height;
      this.copyQuad.visible = false;
      this.water.mesh.visible = true;
      this.actors.overGroup.visible = false;
      this.fx.group.visible = false;
      this.gl.setRenderTarget(waterTarget);
      this.gl.setClearColor(0x000000, 0);
      this.gl.clear(true, true, false);
      this.gl.render(this.overScene, cam);

      // Bloom stays sparse on Low, where it mainly lights the village and bioluminescence.
      const wantBloom = Q.tier !== 'low' || this.look.bio > 0.02 || this.look.lamp > 0.05;
      const cu = this.compMat.uniforms;
      if (wantBloom) {
        cu.tBloom.value = this.post.renderDirectBloom(this.gl, this.fs, waterTarget, staticTarget, this.look.lamp);
        cu.uBloom.value = this.look.bloom;
      } else {
        cu.uBloom.value = 0;
      }

      // Composite native static world + upsampled water + reef caustics + bloom + grading DIRECTLY to screen.
      cu.uInvVP.value.copy(wu.uInvVP.value);
      cu.uNearFar.value.set(cam.near, cam.far);
      cu.uCaustic.value = this.look.caustic;
      cu.uMurk.value = G.uMurkG.value;
      cu.uPxK.value = (2 * Math.tan((cam.fov * Math.PI) / 360)) / staticTarget.height;
      cu.uShift.value.copy(sh);
      const sunL = this.look.sun.r * 0.3 + this.look.sun.g * 0.5 + this.look.sun.b * 0.2;
      this.foamLit.copy(this.look.foam).multiplyScalar(0.34 + 0.68 * sunL);
      this.foamShade.copy(this.look.foamShade).multiplyScalar(0.34 + 0.68 * sunL);

      this.gl.setRenderTarget(output);
      this.gl.clear(true, true, false);
      this.gl.render(this.compScene, cam);

      // Apply the exact same 2D parallax/shake shift to dynamic 3D meshes via projection matrix offset.
      const pm = cam.projectionMatrix.elements;
      const p0 = pm[0], p5 = pm[5], p8 = pm[8], p9 = pm[9];
      if (sh.z !== 1 || sh.x !== 0 || sh.y !== 0) {
        pm[0] = p0 * sh.z;
        pm[5] = p5 * sh.z;
        pm[8] = p8 * sh.z + 2 * sh.x * sh.z;
        pm[9] = p9 * sh.z + 2 * sh.y * sh.z;
      }

      this.staticGroup.visible = false;
      this.underDynGroup.visible = true;
      this.dynGroup.visible = false;
      this.gl.render(this.worldScene, cam);

      this.underDynGroup.visible = false;
      this.dynGroup.visible = true;
      this.gl.render(this.worldScene, cam);

      this.copyQuad.visible = false;
      this.water.mesh.visible = false;
      this.actors.overGroup.visible = true;
      this.fx.group.visible = true;
      this.gl.render(this.overScene, cam);

      pm[0] = p0; pm[5] = p5; pm[8] = p8; pm[9] = p9;

      if (movingView) {
        this.cameraBlend = CAMERA_BLEND_SECONDS;
        this.cameraBlendMat.uniforms.uOpacity.value = 1;
        this.fs.render(this.gl, this.cameraBlendMat, null);
      } else if (this.cameraBlend > 0) {
        this.cameraBlend = Math.max(0, this.cameraBlend - real);
        this.cameraBlendMat.uniforms.uOpacity.value = this.cameraBlend / CAMERA_BLEND_SECONDS;
        this.fs.render(this.gl, this.cameraBlendMat, null);
      }
    } else {
      // Live pipeline (High / Ultra): split static+dynamic shadow map + single render per MSAA target.
      if (this.frame % Q.shadowEvery === 0) {
        this.shadow.renderSplit(
          this.gl,
          this.fs,
          this.worldScene,
          this.staticGroup,
          this.underDynGroup,
          this.dynGroup,
          this.shadowCenter
        );
      }
      this.staticGroup.visible = true;
      this.underDynGroup.visible = true;
      this.dynGroup.visible = true;
      this.gl.setRenderTarget(this.rtScene);
      this.gl.setClearColor(0x000000, 1);
      this.gl.clear(true, true, false);
      this.gl.render(this.worldScene, cam);

      wu.uWaterSurfRes.value.set(this.gl.domElement.width, this.gl.domElement.height);
      wu.uPxK.value = (2 * Math.tan((cam.fov * Math.PI) / 360)) / this.gl.domElement.height;

      this.copyQuad.visible = true;
      this.water.mesh.visible = true;
      this.actors.overGroup.visible = true;
      this.fx.group.visible = true;
      this.gl.setRenderTarget(this.rtFinal);
      this.gl.clear(true, true, false);
      this.gl.render(this.overScene, cam);

      this.post.render(this.gl, this.fs, this.rtFinal, this.look, sim.flashAlpha, 0, sh);
    }

    this.frame++;
    this.text.draw(sim, cam, isPlaying ? 1 - cine : 0, sh);
  }

  private storySim: GameSimulation | null = null;
  private storyId = -1;

  private hitShore = new Map<number, number>();
  /** Turns waves reaching the sand into run-up, so the beach answers every swipe. */
  private trackShore(sim: GameSimulation, _stats: ComputedStats): void {
    for (const w of sim.waves) {
      const ring = w.kind === 'ripple' || w.kind === 'resonance' || w.kind === 'buoy_pulse';
      const z = toZ(w.y);
      const sx = shoreAt(z);
      if (!ring) {
        const x = toX(w.x);
        if (x < sx + 3 && w.vx < 0 && !this.hitShore.has(w.id)) {
          this.hitShore.set(w.id, this.time);
          const life = 1 - w.age / w.maxAge;
          this.shore.push(z, w.crestWidth * 0.5 * UNIT * 1.15, (0.85 + w.charge * 0.95) * (0.55 + 0.45 * life));
        }
      } else if (toX(w.x) - w.radius * UNIT < sx + 2 && !this.hitShore.has(w.id)) {
        this.hitShore.set(w.id, this.time);
        this.shore.push(z, w.radius * UNIT * 0.6, w.kind === 'resonance' ? 0.9 : 0.5);
      }
    }
    for (const [id, t] of this.hitShore) if (this.time - t > 4) this.hitShore.delete(id);
  }

  private applyLook(flashAlpha: number): void {
    const l = this.look;
    const murk = murkOf(this.eco);
    G.uTime.value = this.time;
    G.uSunDir.value.copy(l.sunDir);
    G.uSunCol.value.copy(l.sun);
    G.uSkyCol.value.copy(l.sky);
    G.uGroundCol.value.copy(l.ground);
    G.uRimCol.value.copy(l.rim);
    G.uFogCol.value.copy(l.fog);
    G.uFogSunCol.value.copy(l.fog).lerp(l.glow, 0.5);
    // an upright screen puts the camera far back; the lagoon is as clear from there
    const { pos, look } = this.director.playPose;
    G.uFog.value.set(Math.max(170, pos.distanceTo(look) + 1), l.fogDensity, 0, 0);
    G.uCloud.value.set(l.cloudShadow, 0.5, 0);
    G.uWind.value.set(0.94, 0.34, l.wind);
    G.uLampI.value = l.lamp;
    G.uBio.value = l.bio;
    G.uEco.value = this.eco;
    G.uMurkG.value = murk;
    G.uGradeExposure.value = l.exposure;
    G.uGradeSat.value = l.saturation;
    G.uGradeFlash.value = flashAlpha;
    G.uGradeLift.value.copy(l.lift);
    G.uGradeGain.value.copy(l.gain);
    this.sky.applyLook(l);
    this.water.applyLook(l, murk);
  }

  info(): { calls: number; tris: number; scale: number; tier: string; setting: QualitySetting; cached: boolean; waterScale: number } {
    return {
      calls: this.gl.info.render.calls,
      tris: this.gl.info.render.triangles,
      scale: this.scale,
      tier: Q.tier,
      setting: this.setting,
      cached: Q.cached,
      waterScale: Q.waterScale,
    };
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('webglcontextlost', this.boundContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.boundContextRestored);
    this.disposeRT(this.rtScene);
    this.disposeRT(this.rtStatic);
    this.disposeRT(this.rtStaticBack);
    this.disposeRT(this.rtWater);
    this.disposeRT(this.rtWaterMoving);
    this.disposeRT(this.rtFinal);
    this.cameraBlendMat.dispose();
    this.shadow.dispose();
    this.post.dispose();
    this.water.dispose();
    this.text.canvas.remove();
    this.gl.dispose();
  }
}
