import * as THREE from 'three';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { fsMaterial, FullScreen, G } from './gfx';
import type { Look } from './look';
import { Q } from './quality';

/** Bloom chain plus the final grade and optional FXAA. Input is linear HDR, output is display sRGB. */
export class Post {
  private mips: THREE.WebGLRenderTarget[] = [];
  private down: THREE.ShaderMaterial;
  private downFast: THREE.ShaderMaterial;
  private downLamp: THREE.ShaderMaterial;
  private up: THREE.ShaderMaterial;
  private comp: THREE.ShaderMaterial;
  private aa: THREE.ShaderMaterial;
  private ldr = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  private levels = 5;
  private startDiv: 2 | 4 | 6 = 2;
  private useFxaa = true;
  private w = 4;
  private h = 4;

  constructor() {
    this.down = fsMaterial(
      /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uPx; uniform float uFirst;
vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * uPx).rgb; }
void main(){
  vec3 c = s(vec2(0.)) * .25;
  c += (s(vec2(1.,1.)) + s(vec2(-1.,1.)) + s(vec2(1.,-1.)) + s(vec2(-1.,-1.))) * .125;
  c += (s(vec2(2.,0.)) + s(vec2(-2.,0.)) + s(vec2(0.,2.)) + s(vec2(0.,-2.))) * .0625;
  if (uFirst > .5){
    c = min(c, vec3(8.));
    float l = max(c.r, max(c.g, c.b));
    c *= smoothstep(.82, 1.5, l);
  }
  gl_FragColor = vec4(c, 1.);
}`,
      { tSrc: { value: null }, uPx: { value: new THREE.Vector2() }, uFirst: { value: 0 } }
    );
    // 4-tap bilinear box filter used for quarter-res bloom entry on Low/Medium.
    this.downFast = fsMaterial(
      /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uPx; uniform float uFirst;
vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * uPx).rgb; }
void main(){
  vec3 c = (s(vec2(-1., -1.)) + s(vec2(1., -1.)) + s(vec2(-1., 1.)) + s(vec2(1., 1.))) * .25;
  if (uFirst > .5){
    c = min(c, vec3(8.));
    float l = max(c.r, max(c.g, c.b));
    c *= smoothstep(.82, 1.5, l);
  }
  gl_FragColor = vec4(c, 1.);
}`,
      { tSrc: { value: null }, uPx: { value: new THREE.Vector2() }, uFirst: { value: 0 } }
    );
    // Additive lamp bloom entry over the water bloom mip for dusk/dawn/storm village lights in direct-LDR mode.
    this.downLamp = fsMaterial(
      /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uPx; uniform float uStaticPack;
vec3 s(vec2 o){
  vec3 v = texture2D(tSrc, vUv + o * uPx).rgb;
  return uStaticPack > .5 ? v * v * 2. : v;
}
void main(){
  vec3 c = (s(vec2(-1., -1.)) + s(vec2(1., -1.)) + s(vec2(-1., 1.)) + s(vec2(1., 1.))) * .25;
  c = min(c, vec3(8.));
  float l = max(c.r, max(c.g, c.b));
  c *= smoothstep(1.05, 1.85, l);
  gl_FragColor = vec4(c, 1.);
}`,
      { tSrc: { value: null }, uPx: { value: new THREE.Vector2() }, uStaticPack: { value: 0 } },
      { blending: THREE.AdditiveBlending, transparent: true }
    );
    this.up = fsMaterial(
      /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uPx;
vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * uPx).rgb; }
void main(){
  vec3 c = s(vec2(0.)) * 4.;
  c += (s(vec2(1.,0.)) + s(vec2(-1.,0.)) + s(vec2(0.,1.)) + s(vec2(0.,-1.))) * 2.;
  c += s(vec2(1.,1.)) + s(vec2(-1.,1.)) + s(vec2(1.,-1.)) + s(vec2(-1.,-1.));
  gl_FragColor = vec4(c / 16., 1.);
}`,
      { tSrc: { value: null }, uPx: { value: new THREE.Vector2() } },
      { blending: THREE.AdditiveBlending, transparent: true }
    );
    this.comp = fsMaterial(
      /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc, tBloom;
uniform vec2 uRes;
uniform float uBloom, uExposure, uSat, uFlash, uVignette, uFocus;
uniform vec3 uLift, uGain, uFlashC, uShift;
uniform float uTime;
vec3 neutral(vec3 color){
  const float startCompression = .8 - .04;
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
vec3 oetf(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, 0.), vec3(1. / 2.4)) - .055, step(.0031308, c)); }
void main(){
  vec2 uv = clamp((vUv - .5) / uShift.z + .5 + uShift.xy, .001, .999);
  vec3 c = texture2D(tSrc, uv).rgb;
  vec3 b = texture2D(tBloom, uv).rgb;
  if (uFocus > .01){
    float blur = smoothstep(.22, .62, abs(uv.y - .46)) * uFocus;
    vec3 s = c; float w = 1.;
    for (int i = 1; i <= 12; i++){
      float a = float(i) * 2.39996; float r = sqrt(float(i) / 12.) * blur * 9.;
      s += texture2D(tSrc, uv + vec2(cos(a), sin(a)) * r / uRes * (uRes.y / 900.)).rgb; w += 1.;
    }
    c = s / w;
  }
  c += b * uBloom;
  c *= uExposure;
  c += uFlashC * uFlash;
  vec2 q = vUv - .5;
  c *= 1. - uVignette * smoothstep(.28, .95, length(q * vec2(1.05, 1.)) * 1.25);
  c = neutral(c);
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(vec3(l), c, uSat);
  c = c * uGain + uLift * (1. - c) * (1. - smoothstep(0., .4, l));
  c = clamp(c, 0., 1.);
  // a touch of filmic contrast
  c = mix(c, c * c * (3. - 2. * c), .16);
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
  gl_FragColor = vec4(oetf(c) + (n - .5) / 255., 1.);
}`,
      {
        tSrc: { value: null },
        tBloom: { value: null },
        uRes: G.uRes,
        uBloom: { value: 0.3 },
        uExposure: { value: 1 },
        uSat: { value: 1 },
        uFlash: { value: 0 },
        uFlashC: { value: new THREE.Color('#c8fff8') },
        uVignette: { value: 0.34 },
        uFocus: { value: 0 },
        uLift: { value: new THREE.Color() },
        uGain: { value: new THREE.Color(1, 1, 1) },
        uShift: { value: new THREE.Vector3(0, 0, 1) },
        uTime: G.uTime,
      }
    );
    this.aa = fsMaterial(FXAAShader.fragmentShader, {
      tDiffuse: { value: this.ldr.texture },
      resolution: { value: new THREE.Vector2() },
    });
    this.syncQuality();
  }

  get materials(): THREE.Material[] {
    return [this.down, this.downFast, this.downLamp, this.up, this.comp, this.aa];
  }

  syncQuality(): void {
    const changed = this.levels !== Q.bloomLevels || this.startDiv !== Q.bloomStartDiv || this.useFxaa !== Q.fxaa;
    this.levels = Q.bloomLevels;
    this.startDiv = Q.bloomStartDiv;
    this.useFxaa = Q.fxaa;
    if (changed && this.w > 4 && this.h > 4) this.resize(this.w, this.h);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    if (this.useFxaa) {
      this.ldr.setSize(w, h);
      this.aa.uniforms.resolution.value.set(1 / w, 1 / h);
    } else {
      this.ldr.setSize(4, 4);
    }
    for (const m of this.mips) m.dispose();
    this.mips = [];
    let mw = Math.max(2, Math.floor(w / this.startDiv));
    let mh = Math.max(2, Math.floor(h / this.startDiv));
    for (let i = 0; i < this.levels; i++) {
      this.mips.push(
        new THREE.WebGLRenderTarget(mw, mh, {
          type: THREE.HalfFloatType,
          depthBuffer: false,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        })
      );
      mw = Math.max(2, mw >> 1);
      mh = Math.max(2, mh >> 1);
    }
  }

  render(
    r: THREE.WebGLRenderer,
    fs: FullScreen,
    src: THREE.WebGLRenderTarget,
    look: Look,
    flash: number,
    focus: number,
    shift: THREE.Vector3
  ): void {
    let from: THREE.WebGLRenderTarget = src;
    const fast = this.startDiv >= 4;
    for (let i = 0; i < this.mips.length; i++) {
      const mat = fast ? this.downFast : this.down;
      mat.uniforms.tSrc.value = from.texture;
      const stride = fast && i === 0 ? 1.5 : 1;
      mat.uniforms.uPx.value.set(stride / from.width, stride / from.height);
      mat.uniforms.uFirst.value = i === 0 ? 1 : 0;
      fs.render(r, mat, this.mips[i]);
      from = this.mips[i];
    }
    for (let i = this.mips.length - 1; i > 0; i--) {
      this.up.uniforms.tSrc.value = this.mips[i].texture;
      this.up.uniforms.uPx.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
      fs.render(r, this.up, this.mips[i - 1]);
    }
    const u = this.comp.uniforms;
    u.tSrc.value = src.texture;
    u.tBloom.value = this.mips[0].texture;
    u.uBloom.value = look.bloom;
    u.uExposure.value = look.exposure;
    u.uSat.value = look.saturation;
    u.uFlash.value = flash;
    u.uFocus.value = focus;
    u.uLift.value.copy(look.lift);
    u.uGain.value.copy(look.gain);
    u.uShift.value.copy(shift);
    if (this.useFxaa) {
      fs.render(r, this.comp, this.ldr);
      fs.render(r, this.aa, null);
    } else {
      fs.render(r, this.comp, null);
    }
  }

  /** Fast quarter-res bloom off the split water target (+ static lamps at dusk/storm) for direct-LDR cached tiers. */
  renderDirectBloom(
    r: THREE.WebGLRenderer,
    fs: FullScreen,
    waterRT: THREE.WebGLRenderTarget,
    staticRT: THREE.WebGLRenderTarget,
    lampI: number
  ): THREE.Texture {
    if (this.mips.length === 0) return waterRT.texture;
    this.downFast.uniforms.tSrc.value = waterRT.texture;
    this.downFast.uniforms.uPx.value.set(1 / waterRT.width, 1 / waterRT.height);
    this.downFast.uniforms.uFirst.value = 1;
    fs.render(r, this.downFast, this.mips[0]);

    if (lampI > 0.08) {
      this.downLamp.uniforms.tSrc.value = staticRT.texture;
      this.downLamp.uniforms.uPx.value.set(1.5 / staticRT.width, 1.5 / staticRT.height);
      this.downLamp.uniforms.uStaticPack.value = Q.tier === 'low' ? 1 : 0;
      fs.render(r, this.downLamp, this.mips[0]);
    }

    let from = this.mips[0];
    for (let i = 1; i < this.mips.length; i++) {
      this.downFast.uniforms.tSrc.value = from.texture;
      this.downFast.uniforms.uPx.value.set(1 / from.width, 1 / from.height);
      this.downFast.uniforms.uFirst.value = 0;
      fs.render(r, this.downFast, this.mips[i]);
      from = this.mips[i];
    }
    for (let i = this.mips.length - 1; i > 0; i--) {
      this.up.uniforms.tSrc.value = this.mips[i].texture;
      this.up.uniforms.uPx.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
      fs.render(r, this.up, this.mips[i - 1]);
    }
    return this.mips[0].texture;
  }

  dispose(): void {
    for (const m of this.mips) m.dispose();
    this.ldr.dispose();
  }
}
