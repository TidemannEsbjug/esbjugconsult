/* The terrain: a heightfield that follows the camera, denser near it, shaped by terrainH() in the shaders.
   Grass, rock on the steep parts, sand at the water, meadow flowers, concrete terraces in the city with slab lines and
   a crack that glows where a rose will grow. Lit by the shared model, lost in the mist with distance. */
import * as THREE from "../vendor/three.min.js";
import { COMMON, TERRAIN, LIGHT } from "./glsl.js";

const VERT = /* glsl */ `
${COMMON}
${TERRAIN}
uniform vec2 uCenter;
varying vec3 vW, vN; varying float vUrban, vMeadow, vFlats, vMount;
void main() {
  // the grid is in -1..1; it spreads out quadratically so there is detail near the camera and reach far away
  vec2 g = vec2(position.x, -position.y);
  vec2 off = g * abs(g) * 420.0;
  vec2 p = uCenter + off;
  float h = terrainH(p);
  float e = 0.35 + length(off) * 0.03;
  float hx = terrainH(p + vec2(e, 0.0)), hz = terrainH(p + vec2(0.0, e));
  vN = normalize(vec3(h - hx, e, h - hz));
  vW = vec3(p.x, h, p.y);
  vec4 zn = zone(p.y); vec4 z2 = zone2(p.y);
  vUrban = zn.r; vMeadow = zn.b; vFlats = z2.b; vMount = z2.r;
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON}
${TERRAIN}
${LIGHT}
varying vec3 vW, vN; varying float vUrban, vMeadow, vFlats, vMount;
uniform vec3 uCam, uGrassA, uGrassB, uRock, uSand, uConA, uConB, uAccent;
uniform vec4 uCrack;     // x, z, strength, pulse
uniform float uTime, uPt, uDebug;
uniform vec3 uPtPos;
void main() {
  if (uClip > 0.5 && vW.y < -0.05) discard;
  vec3 n = normalize(vN);
  vec2 p = vW.xz;
  float slope = 1.0 - n.y;
  // nature
  float n1 = fbm3(p * 0.09), n2 = vnoise(p * 0.7);
  vec3 grass = mix(uGrassA, uGrassB, smoothstep(0.3, 0.75, n1) * 0.8 + n2 * 0.2);
  grass *= 0.9 + 0.2 * vnoise(p * 2.5);
  vec3 rock = uRock * (0.8 + 0.4 * vnoise(p * 0.8));
  vec3 nat = mix(grass, rock, smoothstep(0.55, 0.8, slope));
  nat = mix(nat, uSand, smoothstep(1.4, 0.55, vW.y) * (1.0 - smoothstep(0.3, 0.5, slope)));
  // mountains: snow on the heights
  nat = mix(nat, vec3(0.93, 0.94, 0.96), vMount * smoothstep(28.0, 42.0, vW.y) * (1.0 - smoothstep(0.4, 0.7, slope)));
  // meadow flowers
  if (vMeadow > 0.01) {
    vec2 fc = p * 1.3;
    vec2 fi = floor(fc), ff = fract(fc) - 0.5;
    vec2 o = (hash22(fi) - 0.5) * 0.7;
    float fl = step(length(ff - o), 0.12 + 0.07 * hash2(fi * 2.1)) * step(1.0 - vMeadow * 0.65, hash2(fi * 1.3));
    float which = hash2(fi * 0.77);
    vec3 fcol = which < 0.4 ? vec3(1.0, 0.45, 0.35) : which < 0.7 ? vec3(1.0, 0.78, 0.62) : vec3(0.97, 0.93, 0.85);
    nat = mix(nat, fcol * 1.1, fl * (1.0 - smoothstep(0.3, 0.5, slope)));
    nat = mix(nat, uGrassB * 1.08, vMeadow * 0.25);
  }
  // the city: concrete slabs
  vec2 tile = fract(p / 6.0);
  float line = 1.0 - smoothstep(0.0, 0.035, min(min(tile.x, 1.0 - tile.x), min(tile.y, 1.0 - tile.y)));
  vec3 con = mix(uConA, uConB, fbm3(p * 0.25) * 0.8) * (1.0 - line * 0.3) * (0.92 + 0.12 * vnoise(p * 3.0));
  con = mix(con, con * 0.75, smoothstep(0.5, 0.8, slope));
  vec3 albedo = mix(nat, con, sat(vUrban * 1.3) * (1.0 - vMeadow * 0.6));
  albedo = mix(albedo, con, vFlats);
  // the crack
  if (uCrack.z > 0.001) {
    vec2 c = vW.xz - uCrack.xy;
    float along = c.y;
    float cx = 0.6 * sin(along * 1.3) + 0.25 * sin(along * 3.7 + 1.0) + 0.1 * sin(along * 9.0);
    float d = abs(c.x - cx) * (1.0 + smoothstep(2.0, 7.0, abs(along)) * 4.0);
    float mask = smoothstep(9.0, 3.0, abs(along));
    albedo *= 1.0 - smoothstep(0.16, 0.03, d) * 0.85 * mask;
    float near = exp(-length(vW - uPtPos) * 0.45) * uPt;
    albedo += uAccent * (exp(-d * 2.2) * 0.9) * mask * uCrack.z * (0.45 + 0.55 * uCrack.w) * (0.5 + 1.6 * near);
  }
  vec3 v = normalize(uCam - vW);
  vec3 col = shade(albedo, n, v, 0.12 * vUrban);
  col = fogIn(col, vW, uCam);
  if (uDebug > 0.5) col = vW.y < 0.0 ? vec3(0.0, 0.0, 0.5 - vW.y * 0.1) : vec3(fract(vW.y * 0.5), vUrban, vMeadow);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeTerrain(scene, shared, res) {
  const geo = new THREE.PlaneGeometry(2, 2, res, res);
  const u = {
    ...shared,
    uCenter: { value: new THREE.Vector2() }, uCam: { value: new THREE.Vector3() },
    uGrassA: { value: new THREE.Color() }, uGrassB: { value: new THREE.Color() }, uRock: { value: new THREE.Color() }, uSand: { value: new THREE.Color() },
    uConA: { value: new THREE.Color() }, uConB: { value: new THREE.Color() }, uAccent: { value: new THREE.Color("#e5484d") },
    uCrack: { value: new THREE.Vector4(0, 0, 0, 0) }, uTime: { value: 0 }, uPt: { value: 0 }, uPtPos: { value: new THREE.Vector3() }, uDebug: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  function update(P, cam, time, crack, pt) {
    u.uCenter.value.set(cam.x, cam.z - 120);
    u.uCam.value.copy(cam);
    u.uGrassA.value.copy(P.grassA); u.uGrassB.value.copy(P.grassB); u.uRock.value.copy(P.rock); u.uSand.value.copy(P.sand); u.uConA.value.copy(P.concreteA); u.uConB.value.copy(P.concreteB);
    u.uCrack.value.set(crack.x, crack.z, P.crack, crack.pulse); u.uTime.value = time;
    u.uPt.value = pt ? 1 : 0; if (pt) u.uPtPos.value.copy(pt);
  }
  return { update, mesh, u };
}
