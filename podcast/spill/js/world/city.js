/* The built world, placed once along the journey: towers on the city terraces that rise out of the ground as you
   approach (their windows light at night, warm or mint, one in rose), the bars of the cage zone (they bend away from
   the pointer), birches in the park, the highway's lights on the far bank, campfires on the canal wall. */
import * as THREE from "../vendor/three.min.js";
import { COMMON, TERRAIN, LIGHT } from "./glsl.js";
import { riverX } from "./noise.js";

const TOWER_VERT = /* glsl */ `
${COMMON}
attribute vec3 aPos; attribute vec3 aSize; attribute float aSeed, aRot, aLit, aEdge;
varying vec3 vW, vN; varying float vSeed, vTop, vLit, vBase;
uniform float uCamZ, uCamD, uPulse, uTime, uChaos;
void main() {
  // the whole block shoots out of the ground the moment the camera crosses its line, and jolts with the beat
  float dist = uCamZ - aPos.z;
  float g = smoothstep(aEdge - 0.5, aEdge + 2.2 + hash1(aSeed * 5.0) * 1.5, uCamD);
  float el = 1.0 + 0.14 * sin(g * 9.0) * (1.0 - g) + uPulse * (0.015 + uChaos * 0.06) * smoothstep(60.0, 20.0, dist);
  el += uChaos * 0.02 * sin(uTime * 23.0 + aSeed * 40.0) * step(0.93, hash1(aSeed * 9.0 + floor(uTime * 6.0)));
  vec3 s = vec3(aSize.x, aSize.y * g * el, aSize.z);
  vec3 p = position * s;                    // the box runs from y = 0 to 1
  mat2 r = rot2(aRot);
  p.xz = r * p.xz;
  vec3 n = normal; n.xz = r * n.xz;
  vW = aPos + p;
  vN = n; vSeed = aSeed; vTop = aPos.y + s.y; vLit = aLit; vBase = aPos.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;
const TOWER_FRAG = /* glsl */ `
precision highp float;
${COMMON}
${LIGHT}
varying vec3 vW, vN; varying float vSeed, vTop, vLit, vBase;
uniform vec3 uCam, uConA, uConB, uWinCol, uWinWarm, uAccent;
uniform float uLit, uWinMix, uTime, uFlicker, uPulse;
void main() {
  if (uClip > 0.5 && vW.y < -0.05) discard;
  vec3 n = normalize(vN);
  vec3 albedo = mix(uConA, uConB, hash1(vSeed * 7.0) * 0.7) * (0.85 + 0.3 * vnoise(vW.xz * 0.3 + vW.y * 0.2));
  albedo *= 0.65 + 0.35 * smoothstep(0.0, 9.0, vW.y - vBase);          // dark at the foot
  float lit = 0.0; vec3 wc = vec3(0.0);
  if (abs(n.y) < 0.5) {
    vec2 cell = abs(n.x) > 0.5 ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y);
    vec2 cs = vec2(1.15, 1.7);
    vec2 ci = floor(cell / cs), cf = fract(cell / cs);
    float win = step(0.22, cf.x) * step(cf.x, 0.74) * step(0.28, cf.y) * step(cf.y, 0.74) * step(cell.y, vTop - 1.2) * step(vBase + 0.8, cell.y);
    float r = hash2(ci + vSeed * 13.0);
    lit = step(1.0 - uLit * 0.62, r) * win * vLit;
    float fl = 0.85 + 0.15 * sin(uTime * 1.3 + r * 60.0);
    fl *= 1.0 - uFlicker * step(0.97, hash1(r * 91.0 + floor(uTime * 3.0)));
    lit *= fl;
    wc = mix(uWinCol, uWinWarm, step(1.0 - uWinMix, hash2(ci * 0.37 + 1.0)));
    if (hash2(ci * 1.13 + vSeed) > 0.997 && win > 0.5 && vLit > 0.5) { wc = uAccent; lit = win; }
    albedo *= 1.0 - win * 0.35;                                           // dark glass when unlit
  } else albedo *= 0.9;
  vec3 v = normalize(uCam - vW);
  vec3 col = shade(albedo, n, v, 0.25);
  col += albedo * uAmbSky * uAmbInt * 0.35 * (1.0 - abs(n.y));          // the sky lights the walls from all around
  col = mix(col, wc * (1.7 + 0.35 * uPulse), lit * 0.95);
  col = fogIn(col, vW, uCam);
  gl_FragColor = vec4(col, 1.0);
}`;

const POLE_VERT = /* glsl */ `
${COMMON}
attribute vec3 aPos; attribute vec3 aSize; attribute vec3 aCol; attribute float aSeed, aEdge;
varying vec3 vW, vN, vCol; varying float vSeed;
uniform vec3 uPt; uniform float uBend, uTime, uCamD;
void main() {
  float g = smoothstep(aEdge - 0.5, aEdge + 1.5 + hash1(aSeed * 7.0), uCamD);
  vec3 p = position * aSize * vec3(1.0, g, 1.0);
  vec3 w = aPos + p;
  // the bars bend away from the hand
  vec2 d = w.xz - uPt.xz;
  float dist = length(d);
  float f = sat(1.0 - dist / 1.6);
  float bell = sin(sat((w.y - uPt.y + 1.2) / 2.4) * PI);
  w.xz += normalize(d + vec2(1e-4, 0.0)) * f * f * 0.9 * bell * uBend;
  w.x += sin(uTime * 0.8 + aSeed * 20.0) * 0.015 * p.y;
  vW = w; vN = normal; vCol = aCol; vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const POLE_FRAG = /* glsl */ `
precision highp float;
${COMMON}
${LIGHT}
varying vec3 vW, vN, vCol; varying float vSeed;
uniform vec3 uCam;
void main() {
  if (uClip > 0.5 && vW.y < -0.05) discard;
  vec3 n = normalize(vN);
  vec3 albedo = vCol * (0.8 + 0.3 * vnoise(vec2(vW.y * 2.0, vSeed * 30.0)));
  // birch bark marks
  albedo *= 1.0 - 0.6 * step(0.93, vnoise(vec2(vW.y * 3.0 + vSeed * 40.0, vSeed))) * step(0.8, vCol.g);
  vec3 col = shade(albedo, n, normalize(uCam - vW), 0.1);
  col = fogIn(col, vW, uCam);
  gl_FragColor = vec4(col, 1.0);
}`;

const LIGHT_VERT = /* glsl */ `
${COMMON}
${TERRAIN}
attribute float aOff, aLane, aSeed;
varying float vLane, vDepthFade; varying vec3 vW;
uniform float uTime, uZ0, uLen, uSide;
void main() {
  float v = aLane > 0.5 ? 9.0 : 7.0;
  float along = mod(aOff + uTime * v * (aLane > 0.5 ? 1.0 : -1.0), uLen);
  float z = uZ0 - along;
  vec4 zn = zone(z);
  float rw = zn.a * 60.0;
  float x = riverX(z) + uSide * (rw * 1.15 + 7.0 + aLane * 2.6);
  float y = terrainH(vec2(x, z)) + 0.6;
  vec3 w = vec3(x, y, z);
  vW = w;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  mv.xy += position.xy * 0.35;
  vLane = aLane;
  vDepthFade = smoothstep(0.0, 6.0, along) * smoothstep(uLen, uLen - 6.0, along);
  gl_Position = projectionMatrix * mv;
}`;
const LIGHT_FRAG = /* glsl */ `
precision highp float;
varying float vLane, vDepthFade; varying vec3 vW;
uniform float uInt, uClip;
void main() {
  if (uClip > 0.5 && vW.y < -0.05) discard;
  vec2 p = gl_PointCoord;
  vec3 c = vLane > 0.5 ? vec3(1.0, 0.25, 0.2) : vec3(1.0, 0.95, 0.8);
  gl_FragColor = vec4(c * uInt * vDepthFade * 2.0, 1.0);
}`;

const FLAME_VERT = /* glsl */ `
varying vec2 vUv; uniform vec3 uPos; uniform vec2 uSize;
void main() {
  vUv = uv;
  vec4 mv = viewMatrix * vec4(uPos, 1.0);
  mv.xy += (uv - vec2(0.5, 0.0)) * uSize;
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FRAG = /* glsl */ `
precision highp float;
${COMMON}
varying vec2 vUv;
uniform float uTime, uInt, uLean, uSeed;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float y = p.y * 0.5 + 0.5;
  float x = p.x + uLean * y * y * 0.6;
  vec2 q = vec2(x * 2.4, y * 3.2 - uTime * 2.6 + uSeed);
  float n = fbm(q);
  float n2 = fbm3(q * 1.9 + vec2(3.1, -uTime * 1.4));
  float height = 0.3 + 0.75 * uInt;
  float width = mix(0.75, 0.05, pow(sat(y / height), 0.8)) * (0.5 + 0.5 * uInt) + 0.03;
  float d = abs(x + (n - 0.5) * 1.1 * y) - width * (0.55 + 0.45 * n2);
  float flame = smoothstep(0.1, -0.3, d) * smoothstep(height, height * 0.15, y);
  float core = smoothstep(0.35, -0.35, d + y * 0.45) * smoothstep(height * 0.7, 0.0, y);
  vec3 c = mix(vec3(1.0, 0.38, 0.12), vec3(1.0, 0.72, 0.28), core);
  c = mix(c, vec3(1.0, 0.95, 0.82), core * core);
  c = mix(c, vec3(0.9, 0.25, 0.32), smoothstep(0.45, 1.0, y / height) * 0.5);
  float a = flame * (0.55 + 0.45 * uInt);
  gl_FragColor = vec4(c * a * 2.2, a);
}`;
const GLOW_FRAG = /* glsl */ `
precision highp float; varying vec2 vUv; uniform float uInt, uTime; uniform vec3 uCol;
void main() { float r = length(vUv * 2.0 - 1.0); float a = exp(-r * r * 3.5) * uInt * (0.8 + 0.2 * sin(uTime * 7.0)); gl_FragColor = vec4(uCol * a * 1.5, a); }`;
const GLOW_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const R = (a, b) => a + Math.random() * (b - a);

export function makeCity(scene, shared, J, TJ) {
  const group = new THREE.Group();
  scene.add(group);

  // ---------- towers ----------
  const towers = [];
  const place = (t0, t1, sides, hMin, hMax, deep, every, edgeT) => {
    const edge = J.dAt(edgeT);
    for (let t = t0; t < t1; t += every / J.speedAt(t)) {
      const d = J.dAt(t), z = -d;
      const zn = J.zoneAtT(t);
      for (const side of sides) for (let k = 0; k < deep; k++) {
        if (k > 0 && Math.random() < 0.3) continue;
        const w = R(5, 9);
        // the inner face stays clear of the camera's path, whichever bank it rides along
        const x = riverX(z) + side * (zn.riverW * 0.95 + 1.3 + w / 2 + R(0, 1.5) + k * 9.5 + R(-1.5, 1.5));
        const y = TJ.terrainH(x, z) - 1.5;
        const h = R(hMin, hMax) * (1 + k * 0.2);
        towers.push({ x, y, z: z + R(-2, 2), w, h, dpt: R(5, 9), seed: Math.random(), rot: R(-0.1, 0.1), lit: 1, edge });
      }
    }
  };
  place(15.4, 22.7, [-1, 1], 12, 34, 4, 3.2, 15.508);
  place(25.4, 29.0, [-1, 1], 12, 34, 4, 3.2, 25.408);
  place(34.9, 58.6, [-1, 1], 20, 52, 4, 4, 35.045);
  place(66.9, 71.36, [-1, 1], 10, 30, 3, 3.2, 67.013);
  place(71.36, 80.6, [-1], 10, 26, 3, 4, 67.013);
  place(71.36, 80.6, [1], 6, 12, 1, 6, 67.013);
  const N = towers.length;
  const tgeo = new THREE.InstancedBufferGeometry();
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  tgeo.index = box.index; tgeo.attributes.position = box.attributes.position; tgeo.attributes.normal = box.attributes.normal; tgeo.attributes.uv = box.attributes.uv;
  const ta = (n, size, fill) => { const a = new Float32Array(N * size); towers.forEach((tw, i) => fill(tw, a, i * size)); tgeo.setAttribute(n, new THREE.InstancedBufferAttribute(a, size)); };
  ta("aPos", 3, (t, a, o) => { a[o] = t.x; a[o + 1] = t.y; a[o + 2] = t.z; });
  ta("aSize", 3, (t, a, o) => { a[o] = t.w; a[o + 1] = t.h; a[o + 2] = t.dpt; });
  ta("aSeed", 1, (t, a, o) => { a[o] = t.seed; });
  ta("aRot", 1, (t, a, o) => { a[o] = t.rot; });
  ta("aLit", 1, (t, a, o) => { a[o] = t.lit; });
  ta("aEdge", 1, (t, a, o) => { a[o] = t.edge; });
  tgeo.instanceCount = N;
  const tu = { ...shared, uCamZ: { value: 0 }, uCamD: { value: 0 }, uPulse: { value: 0 }, uTime: { value: 0 }, uChaos: { value: 0 }, uCam: { value: new THREE.Vector3() }, uConA: { value: new THREE.Color() }, uConB: { value: new THREE.Color() }, uWinCol: { value: new THREE.Color() }, uWinWarm: { value: new THREE.Color() }, uAccent: { value: new THREE.Color("#e5484d") }, uLit: { value: 0 }, uWinMix: { value: 0.3 }, uFlicker: { value: 0 } };
  const tmesh = new THREE.Mesh(tgeo, new THREE.ShaderMaterial({ uniforms: tu, vertexShader: TOWER_VERT, fragmentShader: TOWER_FRAG }));
  tmesh.frustumCulled = false; tmesh.renderOrder = 3;
  group.add(tmesh);

  // ---------- poles: the bars of the cage, the birches of the park ----------
  const poles = [];
  const bars = (t0, t1, every, col, h, w, edgeT) => {
    const edge = J.dAt(edgeT);
    for (let t = t0; t < t1; t += every / J.speedAt(t)) {
      const d = J.dAt(t), z = -d, zn = J.zoneAtT(t);
      for (const side of [-1, 1]) {
        const x = riverX(z) + side * (zn.riverW * 0.98 + R(0.2, 0.9));
        const y = TJ.terrainH(x, z);
        poles.push({ x, y: Math.max(y, 0.2) - 0.3, z, w, h: h * R(0.9, 1.1), col, seed: Math.random(), edge });
      }
    }
  };
  bars(34.9, 42.6, 0.7, [0.16, 0.18, 0.24], 9.5, 0.09, 35.045);
  const birches = (t0, t1, edgeT) => {
    const edge = J.dAt(edgeT);
    for (let t = t0; t < t1; t += 0.12) {
      const d = J.dAt(t), z = -d + R(-1, 1), zn = J.zoneAtT(t);
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = riverX(z) + side * (zn.riverW * 0.9 + R(0.5, 11));
      const y = TJ.terrainH(x, z);
      if (y < 0.3) continue;
      poles.push({ x, y: y - 0.5, z, w: R(0.12, 0.22), h: R(9, 15), col: [0.92, 0.93, 0.88], seed: Math.random(), edge });
    }
  };
  birches(22.6, 25.6, 22.706);
  const PN = poles.length;
  const pgeo = new THREE.InstancedBufferGeometry();
  const pbox = new THREE.BoxGeometry(1, 1, 1); pbox.translate(0, 0.5, 0);
  pgeo.index = pbox.index; pgeo.attributes.position = pbox.attributes.position; pgeo.attributes.normal = pbox.attributes.normal;
  const pa = (n, size, fill) => { const a = new Float32Array(PN * size); poles.forEach((p, i) => fill(p, a, i * size)); pgeo.setAttribute(n, new THREE.InstancedBufferAttribute(a, size)); };
  pa("aPos", 3, (p, a, o) => { a[o] = p.x; a[o + 1] = p.y; a[o + 2] = p.z; });
  pa("aSize", 3, (p, a, o) => { a[o] = p.w; a[o + 1] = p.h; a[o + 2] = p.w; });
  pa("aCol", 3, (p, a, o) => { a[o] = p.col[0]; a[o + 1] = p.col[1]; a[o + 2] = p.col[2]; });
  pa("aSeed", 1, (p, a, o) => { a[o] = p.seed; });
  pa("aEdge", 1, (p, a, o) => { a[o] = p.edge; });
  pgeo.instanceCount = PN;
  const pu = { ...shared, uPt: { value: new THREE.Vector3(0, -99, 0) }, uBend: { value: 0 }, uTime: { value: 0 }, uCamD: { value: 0 }, uCam: { value: new THREE.Vector3() } };
  const pmesh = new THREE.Mesh(pgeo, new THREE.ShaderMaterial({ uniforms: pu, vertexShader: POLE_VERT, fragmentShader: POLE_FRAG }));
  pmesh.frustumCulled = false; pmesh.renderOrder = 3;
  group.add(pmesh);

  // ---------- the highway on the far bank ----------
  const LN = 140;
  const lgeo = new THREE.InstancedBufferGeometry();
  const lq = new THREE.PlaneGeometry(1, 1);
  lgeo.index = lq.index; lgeo.attributes.position = lq.attributes.position; lgeo.attributes.uv = lq.attributes.uv;
  const loff = new Float32Array(LN), llane = new Float32Array(LN), lseed = new Float32Array(LN);
  const trafficLen = J.dAt(73.5) - J.dAt(65.5);
  for (let i = 0; i < LN; i++) { loff[i] = Math.random() * trafficLen; llane[i] = i % 2; lseed[i] = Math.random(); }
  lgeo.setAttribute("aOff", new THREE.InstancedBufferAttribute(loff, 1)); lgeo.setAttribute("aLane", new THREE.InstancedBufferAttribute(llane, 1)); lgeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(lseed, 1));
  lgeo.instanceCount = LN;
  const lu = { uZones: shared.uZones, uZoneLen: shared.uZoneLen, uTime: { value: 0 }, uZ0: { value: -J.dAt(65.5) }, uLen: { value: trafficLen }, uSide: { value: -1 }, uInt: { value: 0 }, uClip: shared.uClip };
  const lmesh = new THREE.Mesh(lgeo, new THREE.ShaderMaterial({ uniforms: lu, vertexShader: LIGHT_VERT, fragmentShader: LIGHT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  lmesh.frustumCulled = false; lmesh.renderOrder = 12; lmesh.visible = false;
  group.add(lmesh);

  // ---------- campfires on the canal wall ----------
  const fires = [];
  for (let t = 42.6; t < 49.6; t += 1.1) {
    const d = J.dAt(t), z = -d, zn = J.zoneAtT(t);
    const side = fires.length % 4 === 3 ? 1 : -1;
    const x = riverX(z) + side * (zn.riverW * 1.1 + R(0.2, 0.5));
    const y = TJ.terrainH(x, z) + 0.15;
    fires.push({ x, y, z, seed: Math.random() * 10, int: 0, lean: 0 });
  }
  const fgeo = new THREE.PlaneGeometry(1, 1), ggeo = new THREE.PlaneGeometry(1, 1); ggeo.rotateX(-Math.PI / 2);
  for (const f of fires) {
    f.mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uInt: { value: 0 }, uLean: { value: 0 }, uSeed: { value: f.seed }, uPos: { value: new THREE.Vector3(f.x, f.y, f.z) }, uSize: { value: new THREE.Vector2(1.6, 2.6) } }, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    f.mesh = new THREE.Mesh(fgeo, f.mat); f.mesh.frustumCulled = false; f.mesh.renderOrder = 15; f.mesh.visible = false; group.add(f.mesh);
    f.gmat = new THREE.ShaderMaterial({ uniforms: { uInt: { value: 0 }, uTime: { value: 0 }, uCol: { value: new THREE.Color("#ff9440") } }, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    f.glow = new THREE.Mesh(ggeo, f.gmat); f.glow.position.set(f.x, f.y + 0.03, f.z); f.glow.scale.setScalar(7); f.glow.frustumCulled = false; f.glow.renderOrder = 14; f.glow.visible = false; group.add(f.glow);
  }

  function update(P, cam, time, ctx) {
    tu.uCamZ.value = cam.z; tu.uCamD.value = -cam.z; tu.uPulse.value = ctx.pulse; tu.uTime.value = time; tu.uCam.value.copy(cam); tu.uChaos.value = P.chaos || 0;
    pu.uCamD.value = -cam.z;
    tu.uConA.value.copy(P.concreteA); tu.uConB.value.copy(P.concreteB); tu.uWinCol.value.copy(P.windowCol); tu.uWinWarm.value.copy(P.windowWarm);
    tu.uLit.value = P.windowsLit; tu.uWinMix.value = P.windowMix; tu.uFlicker.value = P.flicker;
    pu.uTime.value = time; pu.uCam.value.copy(cam); pu.uBend.value = P.bars; if (ctx.pt) pu.uPt.value.copy(ctx.pt); else pu.uPt.value.set(0, -99, 0);
    lu.uTime.value = time; lu.uInt.value = P.traffic; lmesh.visible = P.traffic > 0.01;
    for (const f of fires) {
      const near = cam.z - f.z;
      const on = P.fire > 0.01 && near > -4 && near < 70;
      f.mesh.visible = on; f.glow.visible = on;
      if (!on) continue;
      const flick = 0.85 + 0.15 * Math.sin(time * 7 + f.seed * 9) + 0.08 * Math.sin(time * 13 + f.seed);
      f.int = P.fire * flick * (f.blow || 1);
      f.mat.uniforms.uTime.value = time + f.seed; f.mat.uniforms.uInt.value = Math.min(1.2, f.int); f.mat.uniforms.uLean.value = (f.lean || 0) + Math.sin(time * 1.7 + f.seed) * 0.08;
      f.mat.uniforms.uSize.value.set(1.6 + 0.8 * f.int, 1.8 + 2.4 * f.int);
      f.gmat.uniforms.uInt.value = f.int * 0.6; f.gmat.uniforms.uTime.value = time;
    }
  }
  return { update, fires, towers: N, poles: PN, group, towerList: towers, poleList: poles };
}
