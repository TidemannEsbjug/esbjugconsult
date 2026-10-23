/* The sky: a dome around the camera. A sun with a glow, a warm band along the horizon toward it, clouds, stars,
   and the ground side of the horizon for the water to reflect. Lives in the scene so the reflection sees it too. */
import * as THREE from "../vendor/three.min.js";
import { COMMON } from "./glsl.js";

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.99999;      // always behind everything
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON}
varying vec3 vDir;
uniform vec3 uSkyTop, uSkyHor, uSunCol, uHaze, uSunDir;
uniform float uSunSize, uSunGlow, uClouds, uStars, uTime, uLow, uVoc, uMist;
void main() {
  vec3 d = normalize(vDir);
  float elev = d.y;
  float sang = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
  float az = atan(d.x, -d.z), sunAz = atan(uSunDir.x, -uSunDir.z);
  float dAz = abs(mod(az - sunAz + PI, TAU) - PI);
  // the gradient, with a haze band on the horizon
  vec3 sky = mix(uSkyHor, uSkyTop, pow(sat(elev * 1.5 + 0.02), 0.6));
  sky = mix(sky, uHaze, sat(1.0 - abs(elev) * 7.0) * uMist * 0.35);
  // the warm band toward the sun, and the glow around it
  sky += uSunCol * 0.2 * exp(-dAz * 1.5) * exp(-max(elev - uSunDir.y, 0.0) * 5.0);
  sky += uSunCol * uSunGlow * (0.55 + 0.3 * uLow + 0.25 * uVoc) * (0.45 * exp(-sang * 5.0) + 0.35 * exp(-sang * 18.0));
  // clouds
  if (uClouds > 0.001 && elev > -0.02) {
    float c = fbm(vec2(az * 2.4, elev * 14.0 - uTime * 0.01));
    float band = sat(1.0 - abs(elev - 0.2) * 3.5);
    c = smoothstep(0.5, 0.7, c) * uClouds * band;
    vec3 lit = mix(uSkyHor, uSunCol, 0.4 * exp(-dAz * 1.3)) + 0.1;
    sky = mix(sky, lit, c * 0.5);
  }
  if (uStars > 0.001 && elev > 0.0) {
    vec2 sp = vec2(az * 80.0, elev * 80.0);
    vec2 ci = floor(sp);
    float h = hash2(ci);
    float st = smoothstep(0.978, 1.0, h) * smoothstep(0.0, 0.25, elev) * (0.55 + 0.45 * sin(uTime * 2.5 + h * 80.0));
    sky += st * uStars * 0.9;
  }
  // the sun
  float disc = 1.0 - smoothstep(uSunSize * 0.9, uSunSize * 1.05, sang);
  sky = mix(sky, uSunCol * 1.6 + 0.3, disc);
  // below the horizon: the haze darkening (the water reflects this)
  sky = mix(sky, uHaze * 0.8, sat(-elev * 6.0));
  gl_FragColor = vec4(sky, 1.0);
}`;

export function makeSky(scene) {
  const u = {
    uSkyTop: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 0.1, -1) }, uSunSize: { value: 0.045 }, uSunGlow: { value: 0.6 }, uClouds: { value: 0.4 }, uStars: { value: 0 }, uTime: { value: 0 }, uLow: { value: 0 }, uVoc: { value: 0 }, uMist: { value: 0.5 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  scene.add(mesh);
  function update(P, sunDir, cam, time, E) {
    mesh.position.copy(cam);
    u.uSkyTop.value.copy(P.skyTop); u.uSkyHor.value.copy(P.skyHor); u.uSunCol.value.copy(P.sunCol); u.uHaze.value.copy(P.haze);
    u.uSunDir.value.copy(sunDir); u.uSunSize.value = P.sunSize; u.uSunGlow.value = P.sunGlow; u.uClouds.value = P.clouds; u.uStars.value = P.stars; u.uMist.value = P.mist;
    u.uTime.value = time; u.uLow.value = E.low; u.uVoc.value = E.voc || 0;
  }
  return { update, mesh, u };
}
