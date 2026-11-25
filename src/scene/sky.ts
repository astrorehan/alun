import * as THREE from 'three';
import { G, GLSL_UNIFORMS, registerDirectLdr } from './gfx';
import type { Look } from './look';

/** Sky dome with drawn cumulus and the Bukit Barisan ridge. Only visible once the camera drops low. */
export class Sky {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        ...G,
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uCloudC: { value: new THREE.Color() },
        uStorm: { value: 0 },
        uHill: { value: new THREE.Color() },
      },
      vertexShader: /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.);
  gl_Position = p.xyww;
}`,
      fragmentShader: /* glsl */ `
${GLSL_UNIFORMS}
uniform vec3 uZenith, uHorizon, uGlow, uCloudC, uHill;
uniform float uStorm;
varying vec3 vDir;
float ridge(float a, float s, float f){
  return texture2D(uNoise, vec2(a * f + s, s * .7)).b * .62 + texture2D(uNoise, vec2(a * f * 3.1 + s, s)).a * .24 + texture2D(uNoise, vec2(a * f * 8. + s, .2)).a * .08;
}
void main(){
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.);
  vec3 c = mix(uHorizon, uZenith, pow(sat(y * 1.5), .55));
  float sd = sat(dot(d, uSunDir));
  c += uGlow * (pow(sd, 6.) * .16 + pow(sd, 60.) * .3 * (1. - uStorm));
  c += uGlow * smoothstep(.9988, .9993, sd) * 2.2 * (1. - uStorm);

  // cumulus: flat undersides, heaped tops
  vec2 uv = d.xz / (d.y + .16);
  float n = texture2D(uNoise, uv * .055 + uTime * .0012).b * .64 + texture2D(uNoise, uv * .17 + uTime * .0022).a * .36;
  float cov = smoothstep(.5 - uStorm * .16, .64 - uStorm * .1, n) * smoothstep(.02, .16, d.y);
  float n2 = texture2D(uNoise, (uv + uSunDir.xz * .34) * .055 + uTime * .0012).b * .64 + texture2D(uNoise, (uv + uSunDir.xz * .34) * .17 + uTime * .0022).a * .36;
  float litc = sat(.62 + (n - n2) * 4.2);
  vec3 cc = mix(mix(uZenith, uHorizon, .55) * .8, uCloudC, litc);
  c = mix(c, cc, cov * .92);

  // mountains: three planes of haze, only on the landward side
  float a = atan(d.x, -d.z);
  float land = smoothstep(.42, -.5, a);
  float h1 = ridge(a, .13, .22) * .34 * land - .02;
  float h2 = ridge(a, .51, .34) * .22 * land - .02;
  float h3 = ridge(a, .83, .5) * .13 * land - .015;
  vec3 hz = mix(uHorizon, uFogCol, .5);
  c = mix(c, mix(hz, uHill, .36), smoothstep(.003, -.003, d.y - h1));
  c = mix(c, mix(hz, uHill, .58), smoothstep(.003, -.003, d.y - h2));
  c = mix(c, mix(hz, uHill, .8), smoothstep(.003, -.003, d.y - h3));
  c = mix(c, uFogCol, smoothstep(.035, -.01, d.y) * .65);
  #ifdef STATIC_PACK
    c = sqrt(clamp(c * .5, 0., 1.));
  #endif
  gl_FragColor = vec4(c, 1.);
}`,
    });
    registerDirectLdr(this.mat, true);
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 20), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
  }

  applyLook(l: Look): void {
    const u = this.mat.uniforms;
    u.uZenith.value.copy(l.zenith);
    u.uHorizon.value.copy(l.horizon);
    u.uGlow.value.copy(l.glow);
    u.uCloudC.value.copy(l.cloud);
    u.uStorm.value = l.rain;
    u.uHill.value.copy(l.deep).lerp(l.zenith, 0.45).multiplyScalar(0.62);
  }
}
