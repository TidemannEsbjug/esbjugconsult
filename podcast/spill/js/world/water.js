/* The water: a plane that follows the camera, with waves made of layered noise (and a long slow swell), the world
   reflected in it (a mirrored camera renders the scene into a texture; it is sampled through the wave normals),
   fresnel between reflection and the water's own colour, the sun's specular road, depth from the terrain (shallows go
   bright, the shore gets a lick of foam), and ripples where the viewer touches it. */
import * as THREE from "../vendor/three.min.js";
import { COMMON, TERRAIN, LIGHT } from "./glsl.js";

const VERT = /* glsl */ `
uniform vec2 uCenter;
varying vec3 vW; varying vec4 vRefl;
uniform mat4 uTexMat;
void main() {
  vec2 g = vec2(position.x, -position.y);
  vec2 off = g * abs(g) * 520.0;
  vW = vec3(uCenter.x + off.x, 0.0, uCenter.y + off.y);
  vRefl = uTexMat * vec4(vW, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON}
${TERRAIN}
${LIGHT}
varying vec3 vW; varying vec4 vRefl;
uniform sampler2D tRefl;
uniform vec3 uCam, uDeep, uShallow;
uniform float uTime, uAmp, uSpec, uLow, uPulse, uDebug;
uniform vec4 uRipple[8];      // x, z, start time, strength

float wave(vec2 p, float t) {
  float h = 0.0;
  h += vnoise(p * 0.55 + vec2(t * 0.25, t * 0.11)) * 0.5;
  h += vnoise(p * 1.4 + vec2(-t * 0.35, t * 0.2)) * 0.25;
  h += vnoise(p * 3.3 + vec2(t * 0.5, -t * 0.45)) * 0.12;
  h += sin(p.x * 0.35 + p.y * 0.2 + t * 0.9) * 0.18;              // the long swell
  for (int i = 0; i < 8; i++) {
    vec4 r = uRipple[i];
    if (r.w <= 0.0) continue;
    float age = t - r.z;
    if (age < 0.0 || age > 4.0) continue;
    float d = length(p - r.xy);
    float ring = sin(d * 6.0 - age * 7.0) * exp(-d * 0.9) * exp(-age * 1.1) * smoothstep(0.0, 0.3, age) * r.w;
    h += ring * (1.0 - smoothstep(age * 2.0, age * 2.0 + 1.5, d)) * 0.9;
  }
  return h;
}

void main() {
  if (uClip > 0.5) discard;
  vec2 p = vW.xz;
  float t = uTime;
  float e = 0.12;
  float h0 = wave(p, t), hx = wave(p + vec2(e, 0.0), t), hz = wave(p + vec2(0.0, e), t);
  float amp = uAmp * 1.5;
  vec3 n = normalize(vec3((h0 - hx) * amp, e, (h0 - hz) * amp));
  // depth under this point
  float ground = terrainH(p);
  float depth = max(-ground, 0.0);
  float shallow = exp(-depth * 0.55);
  vec3 v = normalize(uCam - vW);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  fres = mix(0.04, 0.9, fres);
  // the reflection, bent by the waves
  vec2 ruv = vRefl.xy / vRefl.w + n.xz * 0.11;
  ruv = clamp(ruv, 0.002, 0.998);
  vec3 refl = texture2D(tRefl, ruv).rgb;
  // the water's own colour: deep → shallow, lit by the sun from above
  vec3 own = mix(uDeep, uShallow, shallow);
  own *= 0.75 + 0.35 * max(dot(n, uSunDir), 0.0) * uSunInt;
  own += uAmbSky * uAmbInt * 0.25;
  refl *= mix(vec3(1.0), uDeep * 2.2, 0.3);
  vec3 col = mix(own, refl, fres);
  // glints
  float gl = pow(vnoise(p * 5.0 + vec2(t * 0.9, -t * 0.6)) * vnoise(p * 7.0 - vec2(t * 0.5, t * 0.8)), 6.0);
  col += uSunCol * gl * 1.4 * uSunInt * (0.5 + 0.5 * uLow);
  // the sun's road
  vec3 hv = normalize(uSunDir + v);
  float spec = pow(max(dot(n, hv), 0.0), 120.0) * uSpec * uSunInt * (0.8 + 0.4 * uLow);
  float road = pow(max(dot(n, hv), 0.0), 14.0) * 0.12 * uSunInt;
  col += uSunCol * (spec * 2.2 + road);
  // the shore
  float foam = smoothstep(0.9, 0.0, depth) * (0.35 + 0.65 * smoothstep(0.45, 0.7, vnoise(p * 2.0 + vec2(t * 0.6, -t * 0.3))));
  col = mix(col, uShallow * 1.15 + 0.15, foam * 0.6);
  col = fogIn(col, vW, uCam);
  if (uDebug > 0.5) col = uDebug > 1.5 ? vec3(depth * 0.2, shallow, foam) : vec3(0.0, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeWater(scene, shared, res, reflTex) {
  const geo = new THREE.PlaneGeometry(2, 2, res, res);
  const u = {
    ...shared,
    uCenter: { value: new THREE.Vector2() }, uCam: { value: new THREE.Vector3() }, uTexMat: { value: new THREE.Matrix4() }, tRefl: { value: reflTex },
    uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
    uTime: { value: 0 }, uAmp: { value: 1 }, uSpec: { value: 1 }, uLow: { value: 0 }, uPulse: { value: 0 }, uDebug: { value: 0 },
    uRipple: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  let ri = 0;
  function ripple(x, z, time, strength) { u.uRipple.value[ri % 8].set(x, z, time, strength); ri++; }
  function update(P, cam, time, texMat, E, pulse) {
    u.uCenter.value.set(cam.x, cam.z - 150);
    u.uCam.value.copy(cam);
    u.uTexMat.value.copy(texMat);
    u.uDeep.value.copy(P.waterDeep); u.uShallow.value.copy(P.waterShallow);
    u.uTime.value = time; u.uAmp.value = P.waveAmp; u.uSpec.value = P.waterSpec; u.uLow.value = E.low; u.uPulse.value = pulse;
  }
  return { update, ripple, mesh, u };
}
