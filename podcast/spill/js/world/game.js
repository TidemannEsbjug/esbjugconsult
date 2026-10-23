/* The game: an endless runner that lives inside the picture, laid on the song's beat.
   Three lanes of translucent glass over the river, scrolling toward you. The track is deterministic: every bar of
   the song gets a chunk from a hash of its index and the level; tiles start and end on half-beats, so everything
   lands on the beat. The glass has a vocabulary, in the spirit of SkyRoads: launch pads that spring you over a gap,
   boost glass that rushes the view and doubles the score, burning glass you must not touch, ice you cannot steer on,
   glass that crumbles under you, float glass that makes the next jump slow and long, bumps that bounce you on the
   beat, and diagonal glass that carries you to the next lane. Roses float along the track, mostly off the safe line.
   You steer with the mouse (or A and D for lanes), jump with a click, W or space, twice in the light for wings, hold
   to glide and set the angle with the mouse, S to dive. In the dark the glass ahead is unlit, and the mouse is the
   torch that shows it. Fall, and the score shows for a moment and the run restarts at once. */
import * as THREE from "../vendor/three.min.js";
import { COMMON } from "./glsl.js";

const LANE_W = 0.95, LEVEL = -1.45, G = 21, JUMP_V = 7.2, ORB_R = 0.23, MAX_PLAT = 160, AHEAD = 3.3, STEP = 1 / 120;
const TOL = 0.015;                                    // seconds of grace at a tile's ends
const LANE_TOL = 0.42;                                // how far from a lane's centre still counts as on it: the glass is 0.8 wide, so the orb's centre must be over it
const K = { glass: 0, nojump: 1, dead: 2, launch: 3, burn: 5, ice: 6, crumble: 7, float: 8, bump: 9 };

// ---------- shaders ----------
const PLAT_VERT = /* glsl */ `
${COMMON}
attribute vec3 aLocal; attribute float aLen, aSeed, aId, aBorn, aKind, aGone;
uniform vec3 uOrigin, uRight, uFwd; uniform float uScroll, uSpeed, uLevel, uOn, uTime, uAhead;
varying vec2 vUv; varying vec3 vN, vW; varying float vSeed, vOn, vAhead, vBorn, vLen, vKind, vGone, vLx; varying vec2 vScreen;
void main() {
  vec3 p = position;
  float prog = p.z + 0.5;
  float s = aLocal.z + prog * aLen;                    // time of this vertex along the track
  float ahead = (s - uScroll) * uSpeed;
  float pop = smoothstep(0.0, 0.35, uTime - aBorn);
  float thick = aKind > 8.5 ? 0.26 : 0.09;
  float x = aLocal.x + p.x * 0.8 * pop;
  vLx = x;
  vec3 local = vec3(x, uLevel + aLocal.y + 0.05 + (p.y + 0.5) * thick - 0.045, ahead + uAhead);
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 world = uOrigin + uRight * local.x + up * local.y + uFwd * local.z;
  vN = normalize(uRight * normal.x + up * normal.y + uFwd * normal.z);
  vW = world; vUv = uv; vSeed = aSeed; vOn = step(abs(aId - uOn), 0.5); vAhead = ahead; vBorn = pop; vLen = aLen * uSpeed; vKind = aKind;
  vGone = aGone > 0.0 ? smoothstep(aGone, aGone + 0.3, uScroll) : 0.0;
  vec4 clip = projectionMatrix * viewMatrix * vec4(world, 1.0);
  vScreen = clip.xy / clip.w * 0.5 + 0.5;
  gl_Position = clip;
}`;
const PLAT_FRAG = /* glsl */ `
precision highp float;
${COMMON}
varying vec2 vUv; varying vec3 vN, vW; varying float vSeed, vOn, vAhead, vBorn, vLen, vKind, vGone, vLx; varying vec2 vScreen;
uniform vec3 uCol, uCam, uLand; uniform float uPulse, uTime, uClip, uAlpha, uReach, uChaos, uBeat, uDark, uAspect, uTorchR, uSpeed;
uniform vec2 uTorch;
float shards(vec2 g, float seed, out vec2 cellId) {
  vec2 gi = floor(g), gf = fract(g);
  float d1 = 9.0, d2 = 9.0; vec2 id = gi;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 c = o + hash22(gi + o + seed * 13.0);
    float d = length(c - gf);
    if (d < d1) { d2 = d1; d1 = d; id = gi + o; } else if (d < d2) d2 = d;
  }
  cellId = id;
  return d2 - d1;
}
void main() {
  if (uClip > 0.5 && vW.y < -0.05) discard;
  vec3 v = normalize(uCam - vW);
  vec3 n = normalize(vN);
  int k = int(vKind + 0.5);
  float top = step(0.5, n.y);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.2);
  vec2 e = abs(vUv - 0.5) * 2.0;
  float edge = smoothstep(0.78, 0.97, max(e.x, e.y));
  float far = 1.0 - smoothstep(uReach * 0.55, uReach, vAhead);
  float near = smoothstep(-3.1, -1.3, vAhead);
  vec3 c = uCol * (0.3 + 0.7 * fres) + uCol * edge * 0.9 + uCol * vOn * 0.6 * (0.5 + 0.5 * uPulse);
  c += vec3(1.0) * edge * 0.15;
  float a = uAlpha * (0.11 + 0.25 * fres + 0.45 * edge + 0.2 * vOn + 0.05 * uPulse);
  // the glass's kind: colour and a mark on the top face
  vec2 q = vec2(vUv.x * 2.0 - 1.0, vUv.y * vLen);
  float icon = 0.0; vec3 kc = uCol; float kmix = 0.0, aplus = 0.0;
  if (k == 3) {                                                                   // launch: chevrons pointing ahead and up, breathing
    kc = vec3(1.0, 0.74, 0.32); kmix = 0.7;
    float ch = fract(q.y * 1.1 + 0.5) - 0.5 - abs(q.x) * 0.35;
    icon = smoothstep(0.07, 0.0, abs(ch)) * step(abs(q.x), 0.72) * top * (0.6 + 0.4 * uPulse); aplus = 0.18;
  } else if (k == 5) {                                                            // burning: fire in the glass
    kc = vec3(1.0, 0.36, 0.18); kmix = 0.8;
    float fl = fbm3(vec2(vUv.x * 3.0 + vSeed * 7.0, q.y * 1.4 - uTime * 2.6));
    icon = smoothstep(0.42, 0.72, fl) * (0.7 + 0.3 * uPulse); aplus = 0.3;
  } else if (k == 6) {                                                            // ice: frost
    kc = vec3(0.78, 0.93, 1.0); kmix = 0.75;
    float fr = vnoise(vec2(vUv.x * 9.0 + vSeed, q.y * 5.0));
    icon = smoothstep(0.58, 0.78, fr) * 0.7 * top; aplus = 0.22;
  } else if (k == 7) {                                                            // crumbling: cracked through
    kc = mix(uCol, vec3(0.85, 0.82, 0.8), 0.5); kmix = 0.4; aplus = 0.05;
  } else if (k == 8) {                                                            // float: slow rising motes
    kc = vec3(0.8, 0.66, 1.0); kmix = 0.7;
    vec2 g = vec2(vUv.x * 3.0, q.y * 1.6 - uTime * 0.7); vec2 gi = floor(g), gf = fract(g) - 0.5;
    icon = smoothstep(0.2, 0.08, length(gf)) * step(0.45, hash2(gi + vSeed)) * top; aplus = 0.12;
  } else if (k == 9) {                                                            // bump: a bright step
    kc = mix(uCol, vec3(1.0), 0.45); kmix = 0.5; aplus = 0.15 + 0.1 * top;
  } else if (k == 1) {                                                            // no-jump glass: darker, barred
    kc = uCol * 0.6; kmix = 0.6;
    float bars = smoothstep(0.85, 1.0, abs(sin(q.y * 4.0))) * top; icon = bars * 0.5; kc = mix(kc, vec3(0.0), bars * 0.6);
  } else if (k == 2) { kc = uCol * 0.7; kmix = 0.5; }
  c = mix(c, kc * (0.4 + 0.8 * fres + 0.9 * edge + 0.3 * vOn), kmix) + kc * icon * 1.3;
  a += aplus + icon * 0.35;
  // the landing: a ripple spreads over the glass from where the orb came down, and rides back with it
  float lt = uTime - uLand.y;
  if (top > 0.5 && lt > 0.0 && lt < 1.1) {
    vec2 dl = vec2((vLx - uLand.x) * 1.7, vAhead + lt * uSpeed);
    float ring = smoothstep(0.2, 0.0, abs(length(dl) - lt * 2.8)) * (1.0 - lt / 1.1) * uLand.z;
    c += (kc + 0.4) * ring * 0.8;
    a += ring * 0.45;
  }
  // the bad reality shows in the glass: cracks, and on the beat shards go missing. Crumbling glass is always cracked.
  float chaos = uChaos + (k == 2 ? 0.35 : 0.0) + (k == 7 ? 0.9 : 0.0);
  if (chaos > 0.01 && top > 0.5) {
    vec2 cid;
    float ed = shards(vec2(vUv.x * 3.0, q.y * 1.6), vSeed, cid);
    float crack = smoothstep(0.09, 0.0, ed) * min(chaos, 1.0);
    float beatSeed = floor(uBeat * 0.5);
    float gone = step(0.82 - min(chaos, 1.0) * 0.22, hash2(cid * 0.37 + vSeed * 7.0 + beatSeed * 3.1)) * min(chaos, 1.0) * (k == 7 ? 0.0 : 1.0);
    float fresh = exp(-fract(uBeat * 0.5) * 6.0);
    c += vec3(1.0, 0.98, 0.95) * crack * (0.35 + 0.5 * fresh);
    c *= 1.0 - crack * 0.25;
    a *= 1.0 - gone * 0.8;
    a += crack * 0.3 * min(chaos, 1.0);
  }
  // crumbled away
  a *= 1.0 - vGone;
  // in the dark the glass ahead is unlit; the torch shows it
  if (uDark > 0.5) {
    float torch = exp(-pow(length((vScreen - uTorch) * vec2(uAspect, 1.0)) / uTorchR, 2.0) * 1.6);
    float lit = max(smoothstep(uSpeed * 1.5, uSpeed * 0.7, vAhead), torch);
    a *= mix(0.08, 1.0, lit);
    c += kc * torch * 0.25;
  }
  gl_FragColor = vec4(c * 1.1, a * far * near * vBorn);
}`;

const ORB_VERT = /* glsl */ `
varying vec3 vN, vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const ORB_FRAG = /* glsl */ `
precision highp float;
varying vec3 vN, vW;
uniform vec3 uCol, uCam; uniform float uPulse, uClip, uCaged, uBoost;
void main() {
  if (uClip > 0.5 && vW.y < -0.05) discard;
  vec3 v = normalize(uCam - vW);
  vec3 n = normalize(vN);
  float ndv = max(dot(n, v), 0.0);
  float fres = pow(1.0 - ndv, 2.0);
  float core = pow(ndv, 2.5);
  vec3 c = uCol * (0.5 + 1.1 * core) + vec3(1.0, 0.98, 0.95) * core * core * 0.7 + uCol * fres * 1.4;
  c *= 1.6 + 0.5 * uPulse + 0.5 * uBoost;
  c *= 1.0 - uCaged * 0.45;
  gl_FragColor = vec4(c, 0.92);
}`;

const DISC_VERT = /* glsl */ `
attribute vec3 aPos; attribute float aSize, aAlpha;
varying vec2 vUv; varying float vAlpha;
void main() { vUv = uv * 2.0 - 1.0; vAlpha = aAlpha; vec4 mv = viewMatrix * vec4(aPos, 1.0); mv.xy += position.xy * aSize; gl_Position = projectionMatrix * mv; }`;
const DISC_FRAG = /* glsl */ `
precision highp float; varying vec2 vUv; varying float vAlpha; uniform vec3 uCol;
void main() { float r = length(vUv); float a = exp(-r * r * 4.5) * vAlpha; gl_FragColor = vec4(uCol * a * 1.8, a); }`;
const SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SHADOW_FRAG = /* glsl */ `
precision highp float; varying vec2 vUv; uniform float uA;
void main() { float r = length(vUv); gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - smoothstep(0.5, 1.0, r)) * uA); }`;

// a feather card: x runs root → tip, y across the vane. The tip flexes against the stroke.
const FEATHER_VERT = /* glsl */ `
attribute float aFlex, aLayer;
varying vec2 vUv; varying vec3 vW; varying float vLayer;
void main() {
  vUv = uv; vLayer = aLayer;
  vec3 p = position;
  p.z += aFlex * p.x * p.x;
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FEATHER_FRAG = /* glsl */ `
precision highp float;
${COMMON}
varying vec2 vUv; varying vec3 vW; varying float vLayer;
uniform float uA, uGlow, uClip, uTime; uniform vec3 uCol;
void main() {
  if (uClip > 0.5 && vW.y < -0.05) discard;
  float u = vUv.x;
  float v = vUv.y - 0.5;
  float prof = pow(sat(sin((0.06 + 0.94 * u) * PI)), 0.55) * 0.5;
  float hw = v > 0.0 ? prof * 0.62 : prof;
  float d = hw - abs(v);
  if (d < -0.02) discard;
  float edge = smoothstep(-0.02, 0.05, d);
  float rachis = smoothstep(0.03, 0.0, abs(v) - 0.012 * (1.0 - u * 0.6)) * smoothstep(0.0, 0.08, u);
  float barbs = 0.93 + 0.07 * sin(v * 90.0 + u * 30.0);
  vec3 c = mix(vec3(1.0, 0.985, 0.95), vec3(0.95, 0.975, 1.0), u) * barbs;
  c = mix(c, uCol, 0.14 * (1.0 - u));
  c *= 1.0 - rachis * 0.16;
  c += vec3(1.0, 0.88, 0.65) * uGlow;
  float a = uA * edge * (0.7 + 0.3 * (1.0 - abs(v) / max(hw, 1e-3))) * (0.85 + 0.15 * vLayer) * (0.75 + 0.25 * (1.0 - u));
  gl_FragColor = vec4(c * (0.98 + uGlow * 0.6), a);
}`;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const fract = (x) => x - Math.floor(x);
const hashN = (a, b) => fract(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);   // CPU only: for determinism

export function makeGame(scene, shared, song) {
  // song: { duration, hb: half-beat times within one loop (ascending, < duration), light: light-or-dark per half-beat }
  const DUR = song.duration, HB = song.hb, NHB = HB.length, LIGHT = song.light;

  // ---------- platforms ----------
  const geo = new THREE.InstancedBufferGeometry();
  const box = new THREE.BoxGeometry(1, 1, 1);
  geo.index = box.index; geo.attributes.position = box.attributes.position; geo.attributes.normal = box.attributes.normal; geo.attributes.uv = box.attributes.uv;
  const attr = (n, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PLAT * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, a); return a; };
  const A = { local: attr("aLocal", 3), len: attr("aLen", 1), seed: attr("aSeed", 1), id: attr("aId", 1), born: attr("aBorn", 1), kind: attr("aKind", 1), gone: attr("aGone", 1) };
  const pu = {
    uOrigin: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uFwd: { value: new THREE.Vector3(0, 0, -1) },
    uScroll: { value: 0 }, uSpeed: { value: 6 }, uLevel: { value: LEVEL }, uOn: { value: -1 }, uTime: { value: 0 }, uAhead: { value: AHEAD },
    uCol: { value: new THREE.Color("#ffc4a3") }, uCam: { value: new THREE.Vector3() }, uPulse: { value: 0 }, uClip: shared.uClip, uAlpha: { value: 1 }, uReach: { value: 42 }, uChaos: { value: 0 }, uBeat: { value: 0 },
    uDark: { value: 0 }, uAspect: { value: 1 }, uTorch: { value: new THREE.Vector2(0.5, 0.5) }, uTorchR: { value: 0.3 }, uLand: { value: new THREE.Vector3(0, -9, 0) },
  };
  const pmesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: pu, vertexShader: PLAT_VERT, fragmentShader: PLAT_FRAG, transparent: true, depthWrite: false }));
  pmesh.frustumCulled = false; pmesh.renderOrder = 8;
  scene.add(pmesh);

  // ---------- the orb, its halo and trail, its shadow ----------
  const ou = { uCol: { value: new THREE.Color("#e5484d") }, uCam: { value: new THREE.Vector3() }, uPulse: { value: 0 }, uClip: shared.uClip, uCaged: { value: 0 }, uBoost: { value: 0 } };
  const orb = new THREE.Mesh(new THREE.SphereGeometry(ORB_R, 28, 18), new THREE.ShaderMaterial({ uniforms: ou, vertexShader: ORB_VERT, fragmentShader: ORB_FRAG, transparent: true, depthWrite: false }));
  orb.frustumCulled = false; orb.renderOrder = 9;
  scene.add(orb);
  const NT = 16;
  const tgeo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  tgeo.index = quad.index; tgeo.attributes.position = quad.attributes.position; tgeo.attributes.uv = quad.attributes.uv;
  const tattr = (n, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array((NT + 1) * size), size); a.setUsage(THREE.DynamicDrawUsage); tgeo.setAttribute(n, a); return a; };
  const TA = { pos: tattr("aPos", 3), size: tattr("aSize", 1), alpha: tattr("aAlpha", 1) };
  const trail = new THREE.Mesh(tgeo, new THREE.ShaderMaterial({ uniforms: { uCol: ou.uCol }, vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  trail.frustumCulled = false; trail.renderOrder = 9;
  scene.add(trail);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0.35 } }, vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, transparent: true, depthWrite: false }));
  shadow.frustumCulled = false; shadow.renderOrder = 8;
  scene.add(shadow);
  const trailPts = [];

  // ---------- the wings ----------
  // the yoke sits at the orb and turns with the frame: x right, y up, z back toward the viewer
  const yoke = new THREE.Group();
  yoke.scale.setScalar(0.72);
  scene.add(yoke);
  // feather definitions, in draw order: outer primaries first (underneath), inner and upper layers later (on top)
  const FE = [];
  for (const side of [-1, 1]) {
    for (let i = 9; i >= 0; i--) FE.push({ side, bone: 2, u: 0.12 + 0.088 * i, ang: 1.3 - 0.105 * i, len: 0.24 + 0.026 * i, wid: 0.06, layer: 0 });             // primaries
    for (let i = 7; i >= 0; i--) FE.push({ side, bone: 1, u: 0.1 + 0.12 * i, ang: 1.32 + 0.02 * i, len: 0.2, wid: 0.06, layer: 0 });                            // secondaries
    for (let i = 0; i < 7; i++) FE.push({ side, bone: 1, u: 0.1 + 0.13 * i, ang: 1.25, len: 0.085, wid: 0.045, layer: 1 });                                    // greater coverts
    for (let i = 0; i < 6; i++) FE.push({ side, bone: 2, u: 0.15 + 0.15 * i, ang: 1.1 - 0.09 * i, len: 0.08, wid: 0.042, layer: 1 });
    for (let i = 0; i < 5; i++) FE.push({ side, bone: 1, u: 0.15 + 0.17 * i, ang: 1.05, len: 0.055, wid: 0.04, layer: 2 });                                    // median coverts
    for (let i = 0; i < 4; i++) FE.push({ side, bone: 0, u: 0.25 + 0.22 * i, ang: 1.1 - 0.1 * i, len: 0.075, wid: 0.045, layer: 1 });                          // the upper arm's coverts
    for (let i = 0; i < 6; i++) FE.push({ side, bone: 0, u: -0.1 + 0.08 * i, ang: 0.4 + 0.3 * i, len: 0.06 + 0.01 * i, wid: 0.04, layer: 2 });                 // the tuft at the shoulder, sunk into the orb
  }
  const NF = FE.length;
  const fgeo = new THREE.PlaneGeometry(1, 1, 7, 1);
  fgeo.translate(0.5, 0, 0);
  const flexA = new THREE.InstancedBufferAttribute(new Float32Array(NF), 1); flexA.setUsage(THREE.DynamicDrawUsage);
  const layerA = new THREE.InstancedBufferAttribute(new Float32Array(NF), 1);
  FE.forEach((f, i) => { layerA.array[i] = f.layer; });
  fgeo.setAttribute("aFlex", flexA); fgeo.setAttribute("aLayer", layerA);
  const wingU = { uA: { value: 0 }, uGlow: { value: 0 }, uClip: shared.uClip, uTime: { value: 0 }, uCol: ou.uCol };
  const feathers = new THREE.InstancedMesh(fgeo, new THREE.ShaderMaterial({ uniforms: wingU, vertexShader: FEATHER_VERT, fragmentShader: FEATHER_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide }), NF);
  feathers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  feathers.frustumCulled = false; feathers.renderOrder = 10; feathers.visible = false;
  yoke.add(feathers);
  const V = () => new THREE.Vector3();
  const vS = V(), vE = V(), vWr = V(), vT = V(), vD = V(), vB = V(), vN = V(), vX = V(), vY = V(), vP = V(), vTmp = V(), vZ = V();
  const M = new THREE.Matrix4(), rotZ = new THREE.Matrix4(), fwdQ = new THREE.Vector3(0, 0, -1);
  const armOut = { p0: V(), p1: V(), p2: V(), d0: V(), d1: V(), d2: V() };
  function arm(side, spread, out) {
    const s = spread, f = 1 - s;
    vS.set(side * 0.13, 0.10, 0.10);
    vD.set(side * 1.0, 0.55 - 0.2 * f, 0.12 + 0.45 * f).normalize(); vE.copy(vS).addScaledVector(vD, 0.15 * (0.75 + 0.25 * s)); out.d0.copy(vD);
    vD.set(side * 1.0, 0.08 - 0.1 * f, 0.28 + 0.9 * f).normalize(); vWr.copy(vE).addScaledVector(vD, 0.15 * (0.7 + 0.3 * s)); out.d1.copy(vD);
    vD.set(side * 0.9, -0.06, 0.5 + 1.2 * f).normalize(); vT.copy(vWr).addScaledVector(vD, 0.12 * (0.65 + 0.35 * s)); out.d2.copy(vD);
    out.p0.copy(vS); out.p1.copy(vE); out.p2.copy(vWr);
  }
  function poseWings(spread, flap, flexAmt, time) {
    const back = vB.set(0, -0.4, 1).normalize();
    for (let i = 0; i < NF; i++) {
      const f = FE[i];
      arm(f.side, spread, armOut);
      const p = f.bone === 0 ? armOut.p0 : f.bone === 1 ? armOut.p1 : armOut.p2;
      const d = f.bone === 0 ? armOut.d0 : f.bone === 1 ? armOut.d1 : armOut.d2;
      vN.crossVectors(d, back).normalize(); if (vN.y < 0) vN.negate();
      const b = vTmp.crossVectors(vN, d).normalize(); if (b.z < 0) b.negate();
      const ang = spread * f.ang + (1 - spread) * 1.48 + Math.sin(time * 5.0 + i) * 0.01;
      vX.copy(d).multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang)).normalize();
      vY.crossVectors(vN, vX).normalize();
      vZ.copy(vN);
      const boneLen = f.bone === 0 ? 0.15 : f.bone === 1 ? 0.15 : 0.12;
      vP.copy(p).addScaledVector(d, f.u * boneLen * (0.7 + 0.3 * spread));
      if (f.bone === 0 && f.u < 0.2) vP.multiplyScalar(0.9);
      M.makeBasis(vX.multiplyScalar(f.len), vY.multiplyScalar(f.wid), vZ).setPosition(vP);
      rotZ.makeRotationZ(flap * -f.side);
      M.premultiply(rotZ);
      feathers.setMatrixAt(i, M);
      flexA.array[i] = flexAmt * (f.bone === 2 ? 1.0 : 0.5) * (f.layer === 0 ? 1.0 : 0.3);
    }
    feathers.instanceMatrix.needsUpdate = true;
    flexA.needsUpdate = true;
  }

  // ---------- the track, in song time ----------
  // a tile: { lane, t0, t1 (clock seconds), k0, k1, id, seed, born, kind, safe, move (lanes it slides across), gone (clock it crumbled) }
  const plats = [];
  let nextId = 0, nextBar = 0, laneState = 1, level = 0, totalPlay = 0, runBar0 = 0;   // runBar0: the bar a run's track starts on; chunks hash by bars since then, so every run plays the same track
  const layLog = [];                                    // the last bars laid, for the console
  const barsPerLoop = Math.floor(NHB / 8);
  const hbTime = (k) => {                              // k may be fractional: between two half-beats
    const kf = Math.floor(k), f = k - kf, loop = Math.floor(kf / NHB), i = kf - loop * NHB;
    const t = loop * DUR + HB[i];
    if (f <= 0) return t;
    const tn = i + 1 < NHB ? loop * DUR + HB[i + 1] : (loop + 1) * DUR + HB[0];
    return t + (tn - t) * f;
  };
  const lightAt = (k) => LIGHT[((k % NHB) + NHB) % NHB];
  const barK0 = (bar) => Math.floor(bar / barsPerLoop) * NHB + (bar % barsPerLoop) * 8;
  const barStart = (bar) => hbTime(barK0(bar));
  function addTile(lane, k0, k1, kind, safe, h) {
    if (safe && !kind && k1 - k0 > 3) {                 // no long flat runs on the way: a hop in the middle
      const s = k0 + Math.floor((k1 - k0) / 2);
      addTile(lane, k0, s, kind, safe, h); return addTile(lane, s + 0.5, k1, kind, safe, h);
    }
    if (plats.length >= MAX_PLAT) plats.shift();
    const t = { lane, t0: hbTime(k0), t1: hbTime(k1), k0, k1, id: nextId++, seed: hashN(k0, lane), born: pu.uTime.value, kind: kind || 0, safe: !!safe, gone: 0, h: h || 0 };
    plats.push(t);
    return t;
  }

  // a dark path through the bar (see weave3): len is the tile length, kStart where it begins, danger what the lane
  // you leave becomes (a dead end, or burning glass). quickStart: the glass before ran straight into this bar, so the
  // first move comes at once
  let quickStart = false;
  function darkPath(k0, L, h, len, overlap, kStart, danger) {
    const ov = Math.max(0.9, overlap - 0.1 * Math.max(0, level - 3));   // overlap: the window to slide, in half-beats; it closes a little with every level past 3
    let lane = L, prevLane = -1, k = kStart || 0, i = 0;
    let first = quickStart && !kStart ? Math.min(len, ov + 0.5) : len;
    quickStart = false;
    while (k < 8) {
      const to = next(lane, h(20 + i));
      const back = to === prevLane;                                         // the way turns back: this tile runs half a beat longer, so the lane it came from has a gap
      const end = Math.min(8, k + first + (back ? 0.5 : 0)); first = len;
      addTile(lane, k0 + k, k0 + end, K.nojump, true);
      if (end >= 8) break;
      if (danger) addTile(lane, k0 + end, k0 + Math.min(8, end + 0.5), danger);
      const dEnd = Math.min(8, end + len - 2 * ov - 0.5);                   // ends half a beat before the path can come back to that lane
      if (dEnd > k + 1) addTile(third(lane, to), k0 + k + 0.5, k0 + dEnd, K.dead);
      prevLane = lane; lane = to; k = end - ov; i++;
    }
    return lane;
  }
  // chunks: one bar each, eight half-beats from k0; L is the lane that continues in; each returns the lane that continues out.
  // h(n) is this bar's deterministic random; o the two lanes that are not L
  const next = (L, r) => { const nl = clamp(L + (r < 0.5 ? -1 : 1), 0, 2); return nl === L ? clamp(L + (L === 0 ? 1 : -1), 0, 2) : nl; };
  const third = (L, to) => [0, 1, 2].find((l) => l !== L && l !== to);
  // gaps: 0.5 half-beats is a hop, 1 a jump, 1.5 a jump with a flap or a glide, 2 a flap and a glide, 3 a launch or a flight.
  // heights: 0.6 is one jump up, 1.3 needs the wings. A step down is a drop or a jump; a step up with no gap means jump or fall.
  const CH = {
    // ---- light, from the start ----
    hop(k0, L, h, o) { const g = 2 + Math.floor(h(2) * 3); addTile(L, k0, k0 + g, 0, true); addTile(L, k0 + g + 1, k0 + 8, 0, true); addTile(o[0], k0, k0 + g + 2); if (h(4) < 0.7) addTile(o[1], k0 + 1, k0 + 4 + Math.floor(h(7) * 3)); return L; },
    hopSkip(k0, L, h, o) { addTile(L, k0, k0 + 2, 0, true); addTile(L, k0 + 2.5, k0 + 4.5, 0, true); addTile(L, k0 + 5.5, k0 + 8, 0, true); addTile(o[0], k0 + 1, k0 + 4); addTile(o[1], k0 + 3, k0 + 7); return L; },
    stepping(k0, L, h, o) { for (let i = 0; i < 4; i++) addTile(L, k0 + i * 2, k0 + i * 2 + 1, 0, true); addTile(o[0], k0, k0 + 3); addTile(o[1], k0 + 3, k0 + 6); return L; },
    jumpShift(k0, L, h, o) { const to = next(L, h(2)); addTile(L, k0, k0 + 3, 0, true); addTile(to, k0 + 4, k0 + 8, 0, true); addTile(L, k0 + 5, k0 + 8); addTile(third(L, to), k0, k0 + 5); return to; },
    hopShift(k0, L, h, o) { const to = next(L, h(2)); addTile(L, k0, k0 + 4, 0, true); addTile(to, k0 + 4, k0 + 8, 0, true); addTile(L, k0 + 5, k0 + 8); if (h(3) < 0.7) addTile(third(L, to), k0 + 1, k0 + 6); return to; },
    bumps(k0, L, h, o) { for (let i = 0; i < 4; i++) { addTile(L, k0 + i * 2, k0 + i * 2 + 1, K.bump, true); addTile(L, k0 + i * 2 + 1, k0 + i * 2 + 2, 0, true); } addTile(o[0], k0, k0 + 5); return L; },
    sideHops(k0, L, h, o) { const a = next(L, h(2)), b = next(a, h(3)); addTile(L, k0, k0 + 2, 0, true); addTile(a, k0 + 2.5, k0 + 4.5, 0, true); addTile(b, k0 + 5, k0 + 7.5, 0, true); addTile(L, k0 + 2, k0 + 4); addTile(third(L, a), k0, k0 + 3); return b; },
    zigSteps(k0, L, h, o) { let lane = L; for (let i = 0; i < 4; i++) { addTile(lane, k0 + i * 2, k0 + i * 2 + 1, 0, true); if (i < 3) { const to = next(lane, h(20 + i)); addTile(third(lane, to), k0 + i * 2 + 1, k0 + i * 2 + 3); lane = to; } } return lane; },
    ledge(k0, L, h, o) { addTile(L, k0, k0 + 3, 0, true); addTile(L, k0 + 3, k0 + 6, 0, true, 0.6); addTile(L, k0 + 6.5, k0 + 8, 0, true); addTile(o[0], k0, k0 + 5); return L; },
    // ---- light, level 1 ----
    launchGap(k0, L, h, o) { const to = next(L, h(2)); addTile(L, k0, k0 + 2, 0, true); addTile(L, k0 + 2, k0 + 3, K.launch, true); addTile(to, k0 + 5, k0 + 8, 0, true); addTile(L, k0 + 5, k0 + 6.5); addTile(third(L, to), k0, k0 + 4); return to; },
    burnHop(k0, L, h, o) { addTile(L, k0, k0 + 3, 0, true); addTile(L, k0 + 3, k0 + 4, K.burn, true); addTile(L, k0 + 4, k0 + 8, 0, true); addTile(o[0], k0 + 2, k0 + 6); return L; },
    crumbleRun(k0, L, h, o) { addTile(L, k0, k0 + 1, 0, true); for (let i = 0; i < 3; i++) addTile(L, k0 + 1 + i * 2, k0 + 3 + i * 2, K.crumble, true); addTile(L, k0 + 7, k0 + 8, 0, true); addTile(o[1], k0 + 2, k0 + 5); return L; },
    iceShift(k0, L, h, o) { const to = next(L, h(2)); addTile(L, k0, k0 + 1, 0, true); addTile(L, k0 + 1, k0 + 4, K.ice, true); addTile(to, k0 + 4, k0 + 8, 0, true); addTile(third(L, to), k0 + 2, k0 + 7); return to; },
    zigzag(k0, L, h, o) { const a = next(L, h(2)); addTile(L, k0, k0 + 2, 0, true); addTile(a, k0 + 3, k0 + 5, 0, true); addTile(L, k0 + 6, k0 + 8, 0, true); addTile(third(L, a), k0 + 1, k0 + 7); return L; },
    longLeap(k0, L, h, o) { addTile(L, k0, k0 + 2, 0, true); addTile(L, k0 + 3.5, k0 + 8, 0, true); addTile(o[0], k0 + 1, k0 + 4); return L; },
    climb(k0, L, h, o) { addTile(L, k0, k0 + 2, 0, true); addTile(L, k0 + 2.5, k0 + 4.5, 0, true, 0.6); addTile(L, k0 + 5, k0 + 7.5, 0, true, 1.3); addTile(o[0], k0 + 1, k0 + 6); return L; },
    // ---- light, level 2 ----
    floatLeap(k0, L, h, o) { addTile(L, k0, k0 + 1, 0, true); addTile(L, k0 + 1, k0 + 2, K.float, true); addTile(L, k0 + 4, k0 + 8, 0, true); addTile(o[0], k0 + 2, k0 + 5); return L; },
    launchShift(k0, L, h, o) { const to = next(L, h(2)); addTile(L, k0, k0 + 2, 0, true); addTile(L, k0 + 2, k0 + 3, K.launch, true); addTile(to, k0 + 5, k0 + 8, 0, true); addTile(L, k0 + 6, k0 + 7, K.burn); return to; },
    burnLine(k0, L, h, o) { const to = next(L, h(2)); addTile(L, k0, k0 + 2, 0, true); addTile(L, k0 + 2, k0 + 5, K.burn); addTile(to, k0 + 1, k0 + 8, 0, true); addTile(third(L, to), k0 + 3, k0 + 6, K.burn); return to; },
    iceBurn(k0, L, h, o) { addTile(L, k0, k0 + 1, 0, true); addTile(L, k0 + 1, k0 + 3, K.ice, true); addTile(L, k0 + 3, k0 + 4, K.burn, true); addTile(L, k0 + 4, k0 + 8, 0, true); addTile(o[0], k0 + 2, k0 + 5); return L; },
    stepShift(k0, L, h, o) { const a = next(L, h(2)); addTile(L, k0, k0 + 1, 0, true); addTile(a, k0 + 2, k0 + 3, 0, true); addTile(L, k0 + 4, k0 + 5, 0, true); addTile(a, k0 + 6, k0 + 7, 0, true); addTile(third(L, a), k0 + 1, k0 + 6); return a; },
    crumbleShift(k0, L, h, o) { const to = next(L, h(2)); addTile(L, k0, k0 + 1, 0, true); addTile(L, k0 + 1, k0 + 3, K.crumble, true); addTile(to, k0 + 3, k0 + 5, K.crumble, true); addTile(L, k0 + 5, k0 + 7, K.crumble, true); addTile(L, k0 + 7, k0 + 8, 0, true); addTile(third(L, to), k0 + 2, k0 + 6); return L; },
    soar(k0, L, h, o) { addTile(L, k0, k0 + 1.5, 0, true); addTile(L, k0 + 2.5, k0 + 4, 0, true, 1.3); addTile(L, k0 + 7, k0 + 8, 0, true); addTile(o[0], k0 + 1, k0 + 5); return L; },
    skyRun(k0, L, h, o) { addTile(L, k0, k0 + 1, 0, true); addTile(L, k0 + 1.5, k0 + 3, 0, true, 0.6); addTile(L, k0 + 3.5, k0 + 5, 0, true); addTile(L, k0 + 5.5, k0 + 7, 0, true, 0.6); addTile(L, k0 + 7.5, k0 + 8, 0, true); addTile(o[0], k0 + 2, k0 + 6); return L; },
    // ---- dark: no jumping on the barred glass, so the way is a slide from lane to lane, found with the torch ----
    // a path: tiles of len half-beats, each on a lane next to the last, overlapping one half-beat (the window to
    // slide); the lane you leave stops dead, and the third lane carries a decoy that ends before the path returns
    weave3(k0, L, h) { return darkPath(k0, L, h, 3, 1.5); },           // 4 moves a bar, 1.5 half-beats to make each
    weave25(k0, L, h) { return darkPath(k0, L, h, 2.5, 1.25); },        // 5 moves, 1.25
    weave2(k0, L, h) { return darkPath(k0, L, h, 2, 1); },              // 7 moves, 1
    fork(k0, L, h, o) { const good = h(2) < 0.5 ? 0 : 2, bad = 2 - good; if (L !== 1) addTile(L, k0, k0 + 1.5, K.nojump, true); addTile(1, k0 + (L === 1 ? 0 : 0.5), k0 + 2, K.nojump, true); addTile(good, k0 + 1, k0 + 4, K.nojump, true); addTile(bad, k0 + 1, k0 + 4.5, K.nojump); return darkPath(k0, good, h, 2.5, 1.25, 3); },   // from an edge, a slide to the centre first
    darkBurn(k0, L, h) { return darkPath(k0, L, h, 3, 1.5, 0, K.burn); },
    darkHop(k0, L, h, o) { const a = next(L, h(2)), b = next(a, h(3)); addTile(L, k0, k0 + 2, 0, true); addTile(a, k0 + 2.5, k0 + 4.5, 0, true); addTile(b, k0 + 5, k0 + 8, 0, true); addTile(third(L, a), k0, k0 + 3, K.dead); addTile(L, k0 + 2, k0 + 4, K.dead); return b; },
    darkSteps(k0, L, h, o) { let lane = L; for (let i = 0; i < 4; i++) { addTile(lane, k0 + i * 2, k0 + i * 2 + (i === 3 ? 2 : 1), 0, true); if (i < 3) { const to = next(lane, h(20 + i)); addTile(third(lane, to), k0 + i * 2 + 1, k0 + i * 2 + 2.5, K.dead); lane = to; } } return lane; },
    darkLedge(k0, L, h, o) { const a = next(L, h(2)); addTile(L, k0, k0 + 2, 0, true); addTile(a, k0 + 2.5, k0 + 4.5, 0, true, 0.6); addTile(L, k0 + 5, k0 + 8, 0, true); addTile(third(L, a), k0 + 1, k0 + 5, K.dead); return L; },
  };
  const POOLS = {
    light: [["hop", "hopSkip", "stepping", "jumpShift", "hopShift", "ledge", "sideHops", "zigSteps"], ["launchGap", "burnHop", "crumbleRun", "iceShift", "zigzag", "longLeap", "climb", "zigSteps"], ["floatLeap", "launchShift", "burnLine", "iceBurn", "stepShift", "crumbleShift", "soar", "skyRun"]],
    dark: [["weave3", "darkHop", "darkSteps", "weave3"], ["weave25", "darkBurn", "darkLedge"], ["weave2", "fork"]],
  };
  function layBar(bar) {
    const inLoop = bar % barsPerLoop, k0 = barK0(bar), rel = bar - runBar0;
    const h = (n) => hashN(rel * 7.31 + n * 3.7, level * 5.3 + 1.7);
    // a bar is light only when the dark is nowhere near it: light chunks may need the wings, which the dark takes away
    let light = true;
    for (let k = k0 - 1; k <= k0 + 9; k++) if (!lightAt(k)) light = false;
    const L = laneState;
    const others = [0, 1, 2].filter((l) => l !== L);
    const prev = plats.find((p) => p.safe && p.lane === L && p.k1 === k0 && !p.runway);
    // the pool opens up with the level; a fork needs the centre lane
    const pools = light ? POOLS.light : POOLS.dark;
    let names = [];
    for (let i = 0; i <= Math.min(level + 1, 2); i++) names = names.concat(pools[i]);
    if (!light && L === 1 && h(9) < 0.25) names = ["fork"];
    const name = names[Math.floor(h(1) * names.length) % names.length];
    layLog.push({ bar, rel, level, light, pool: names.length, name }); if (layLog.length > 24) layLog.shift();
    quickStart = !!prev;                               // the way arrives on this lane: the first move comes at once
    laneState = CH[name](k0, L, h, others);
    // the loop's odd half-beats at the end: the way continues on the out lane, with one decoy
    const tail = inLoop === barsPerLoop - 1 ? NHB % 8 : 0;
    if (tail) { addTile(laneState, k0 + 8, k0 + 8 + tail, 0, true); addTile([0, 1, 2].find((l) => l !== laneState), k0 + 8, k0 + 8 + tail); }
    // no flat run across the bar line: where the same glass simply continues at the same height, cut a jump
    if (prev && prev.kind === 0) {
      const cur = plats.find((p) => p.safe && p.lane === L && p.k0 === k0 && p.kind === 0 && p.h === prev.h);
      if (cur) {
        if (prev.k1 - prev.k0 >= 2) { prev.k1 -= 1; prev.t1 = hbTime(prev.k1); }
        else if (cur.k1 - cur.k0 >= 2) { cur.k0 += 1; cur.t0 = hbTime(cur.k0); }
      }
    }
  }
  function layNext() { layBar(nextBar++); }
  function hbAt(c) { const loop = Math.floor(c / DUR), t = c - loop * DUR; let k = 0; while (k + 1 < NHB && HB[k + 1] <= t) k++; return loop * NHB + k; }
  function barAt(c) { const loop = Math.floor(c / DUR), t = c - loop * DUR; let k = 0; while (k + 1 < NHB && HB[k + 1] <= t) k++; return loop * barsPerLoop + Math.min(barsPerLoop - 1, Math.floor(k / 8)); }
  function relay(c) {
    plats.length = 0;
    laneState = 1;     let kc = hbAt(c) + 1;                               // the run joins the half-beat grid a moment after the orb is back
    if (hbTime(kc) < c + 0.4) kc++;
    let b = barAt(c) + 1;
    if (barK0(b) <= kc) b++;
    runBar0 = nextBar = b;
    plats.push({ lane: 1, t0: c - 0.5, t1: hbTime(kc) + 0.02, k0: 0, k1: 0, id: nextId++, seed: 0.5, born: pu.uTime.value, kind: 0, safe: true, gone: 0, h: 0, runway: true });
    if (barK0(b) > kc) addTile(1, kc, barK0(b), 0, true);   // the rest of the bar on the grid: hops, and a jump at the bar line
    while (barStart(nextBar) < c + 12) layNext();
  }

  // ---------- state ----------
  let clock = 0, score = 0, dist = 0, best = 0, speedV = 14;
  try { best = +localStorage.getItem("esbjug-spill-rekord") || 0; } catch (e) {}
  const orbS = { tx: 0, x: 0, y: 0, vy: 0, grounded: true, coyote: 0, squash: 0, air: 0, wings: 0, hasWings: false, usedDouble: false, hold: false, flap: 0, flame: 0, glide: 0, caged: 0, flapV: 0, flapA: 0, floaty: false, gMul: 1, onIce: false, lastTile: -1, born: -9 };
  let running = false, light = true;
  const ev = { double: false, wingsLost: false, launch: false, burn: false, splash: null };
  const frame = { origin: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0), fwd: new THREE.Vector3(0, 0, -1) };
  const mouse = { fine: false };                        // a fine pointer exists: the dark hides the glass beyond its torch

  // faster and harder from the first bar and without end: 14 m/s at the start, 32 by level 4, 60 by level 12; the
  // view ahead shrinks with the level and the dark's windows close (darkPath)
  const difficulty = () => Math.max(0, level * 0.2 + Math.min(0.3, totalPlay / 60));
  const speed = () => Math.min(60, 14.0 + 18.0 * difficulty());

  // the tile under the orb
  const under = () => {
    const lx = orbS.x / LANE_W + 1;
    let best = null;
    for (const p of plats) if (!p.goneDone && Math.abs(p.lane - lx) < LANE_TOL && p.t0 - TOL <= clock && clock <= p.t1 + TOL && p.h <= orbS.y + 0.03 && (!best || p.h > best.h)) best = p;
    return best;
  };

  function restart() {
    score = 0; dist = 0;
    relay(clock);                                       // the same track every run: a runway in the centre lane, then the chunks from the next bar
    orbS.tx = orbS.x = 0; orbS.y = 0; orbS.vy = 0; orbS.grounded = true; orbS.coyote = 0; orbS.air = 0; orbS.born = pu.uTime.value;
    orbS.hasWings = false; orbS.usedDouble = false; orbS.flap = 0; orbS.flame = 0; orbS.glide = 0; orbS.floaty = false; orbS.gMul = 1;
    trailPts.length = 0;
  }

  // ---------- input ----------
  let queuedJump = 0;
  function move(dir) { if (!running || orbS.onIce) return; const lane = clamp(Math.round(orbS.tx / LANE_W + 1) + dir, 0, 2); orbS.tx = lane * LANE_W - LANE_W; }
  function jump() {
    if (!running) return;
    orbS.hold = true;
    const p = under();
    if (p && p.kind === K.nojump && orbS.grounded) { orbS.caged = 1; return; }
    if (!orbS.grounded && orbS.coyote <= 0 && orbS.air > 0.06) {
      if (light && !orbS.usedDouble) {
        orbS.usedDouble = true; orbS.hasWings = true; orbS.vy = JUMP_V * 0.9; orbS.flap = 1; orbS.flame = 1; orbS.squash = -0.5;
        ev.double = true;
      }
      return;
    }
    queuedJump = 0.18;
  }
  function hold(on) { orbS.hold = !!on; }
  function dive() { if (!running || orbS.grounded) return; orbS.vy = Math.min(orbS.vy, -5.5); orbS.hold = false; }
  function aim(nx, ny, active, fine) { mouse.fine = !!fine; }

  // ---------- frame ----------
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function update(dt, cam, fwd, P, playing, pulse, time, fx) {
    running = playing;
    pu.uTime.value = time;
    pu.uChaos.value = fx.chaos; pu.uBeat.value = fx.beat;
    light = fx.chaos < 0.5;
    ev.double = false; ev.wingsLost = false; ev.launch = false; ev.burn = false; ev.splash = null;
    frame.origin.copy(cam);
    frame.fwd.set(fwd.x, 0, fwd.z).normalize();
    frame.right.set(-frame.fwd.z, 0, frame.fwd.x);
    pu.uOrigin.value.copy(frame.origin); pu.uRight.value.copy(frame.right); pu.uFwd.value.copy(frame.fwd);
    pu.uCol.value.copy(P.gameCol2); ou.uCol.value.copy(P.gameCol); pu.uCam.value.copy(cam); ou.uCam.value.copy(cam); pu.uPulse.value = pulse; ou.uPulse.value = pulse;
    speedV += (speed() - speedV) * (1 - Math.exp(-dt * 0.9));
    pu.uSpeed.value = speedV; pu.uReach.value = (26 + speedV * 1.4) * Math.max(0.3, 1 - 0.06 * level); pu.uAlpha.value = playing ? 1 : 0.5;
    pu.uDark.value = !light && fx.pointer && fx.pointer.fine && playing ? 1 : 0;
    pu.uAspect.value = fx.aspect || 1; pu.uTorch.value.set(fx.torch[0], fx.torch[1]); pu.uTorchR.value = fx.torchR;
    if (fx.pointer) aim(fx.pointer.x, fx.pointer.y, fx.pointer.active, fx.pointer.fine);

    const newClock = fx.loop * DUR + fx.songT;
    const jumped = Math.abs(newClock - clock) > 1.5;
    clock = newClock;
    if (jumped || plats.length === 0) restart();
    while (barStart(nextBar) < clock + 12) layNext();
    while (plats.length && plats[0].t1 < clock - 3) plats.shift();

    let fell = false, landed = false, fellScore = 0;
    if (playing) {
      totalPlay += dt; level = Math.floor(totalPlay / 15);
      const steps = Math.max(1, Math.min(12, Math.ceil(dt / STEP)));
      const h = dt / steps;
      for (let k = 0; k < steps && !fell; k++) {
        dist += h * 4.5;
        score = Math.floor(dist);
        // steering: the lane keys; ice holds the orb to its lane
        const p0 = under();
        orbS.onIce = !!(p0 && p0.kind === K.ice && orbS.grounded);
        if (!orbS.onIce) orbS.x += (orbS.tx - orbS.x) * (1 - Math.exp(-h * 22));
        const p = under();
        orbS.caged = Math.max(0, orbS.caged - h * 2.5);
        if (queuedJump > 0) queuedJump -= h;
        if (p && orbS.vy <= 0 && orbS.y <= p.h + 0.02 && orbS.y > p.h - 0.12) {
          const fresh = !orbS.grounded || p.id !== orbS.lastTile;
          if (!orbS.grounded) { landed = true; orbS.squash = 1; pu.uLand.value.set(orbS.x, time, Math.min(1, 0.5 + orbS.air)); }
          orbS.grounded = true; orbS.coyote = 0.08; orbS.y = p.h; orbS.vy = 0;
          orbS.hasWings = false; orbS.usedDouble = false;
          pu.uOn.value = p.id;
          if (fresh) {
            orbS.lastTile = p.id;
            if (p.kind === K.burn) { orbS.vy = -3; orbS.grounded = false; orbS.y = p.h - 0.13; ev.burn = true; }
            else if (p.kind === K.launch) { orbS.vy = 5.7; orbS.gMul = 0.3; orbS.grounded = false; orbS.y = p.h + 0.001; orbS.coyote = 0; orbS.squash = -0.8; orbS.flame = 0.6; ev.launch = true; }
            else if (p.kind === K.bump) { orbS.vy = 4.6; orbS.grounded = false; orbS.y = p.h + 0.001; orbS.coyote = 0; orbS.squash = -0.4; }
            else if (p.kind === K.float) { orbS.floaty = true; }
            else if (p.kind === K.crumble && !p.gone) { p.gone = clock + 0.42; }
          }
        } else {
          orbS.coyote -= h;
          orbS.grounded = false;
          pu.uOn.value = -1;
        }
        const noJump = p && p.kind === K.nojump;
        if (queuedJump > 0 && (orbS.grounded || orbS.coyote > 0) && !noJump) {
          const floaty = orbS.floaty; orbS.floaty = false;
          orbS.vy = floaty ? JUMP_V * 0.8 : JUMP_V; orbS.gMul = floaty ? 0.42 : 1; orbS.grounded = false; orbS.coyote = 0; orbS.y += 0.001; queuedJump = 0; orbS.squash = -0.6;
        }
        if (!orbS.grounded) {
          const g = G * orbS.gMul;
          const gliding = orbS.hasWings && orbS.hold && orbS.vy < 0.2;
          if (gliding) {
            orbS.vy = Math.max(orbS.vy - g * h * 0.3, -1.2); orbS.glide = Math.min(1, orbS.glide + h * 6);
          } else { orbS.vy -= g * h; orbS.glide = Math.max(0, orbS.glide - h * 8); }
          orbS.y += orbS.vy * h; orbS.air += h;
        } else { orbS.air = 0; orbS.glide = Math.max(0, orbS.glide - h * 8); orbS.gMul = 1; }
        if (!light && orbS.hasWings) { orbS.hasWings = false; ev.wingsLost = true; }
        if (p && orbS.y < p.h && orbS.y > p.h - 0.12 && orbS.vy < 0 && p.kind !== K.burn) { orbS.y = p.h; orbS.vy = 0; orbS.grounded = true; }
        orbS.squash *= Math.exp(-h * 9);
        // crumbling glass goes, once stepped on
        for (const q of plats) if (q.gone && !q.goneDone && clock > q.gone) q.goneDone = true;
        const waterY = -(frame.origin.y + LEVEL + 0.14 + ORB_R);     // where the orb's centre meets the river
        if (orbS.y < waterY + ORB_R * 0.4) {
          fell = true;
          ev.splash = tmp2.copy(frame.origin).addScaledVector(frame.right, orbS.x).addScaledVector(frame.fwd, AHEAD); ev.splash.y = 0;
          if (score > best) { best = score; try { localStorage.setItem("esbjug-spill-rekord", String(best)); } catch (e) {} }
          fellScore = score;
          totalPlay = 0; level = 0; speedV = speed();              // every run starts the same: level 0, the start speed, the same track
          restart();
        }
      }
    }

    // ---------- placement ----------
    tmp.copy(frame.origin).addScaledVector(frame.right, orbS.x).addScaledVector(frame.fwd, AHEAD);
    tmp.y += LEVEL + 0.05 + 0.09 + ORB_R + orbS.y;
    orb.position.copy(tmp);
    const sq = orbS.squash, grow = clamp((time - orbS.born) / 0.35, 0, 1);
    const bs = grow * grow * (3 - 2 * grow);
    orb.scale.set((1 + sq * 0.25) * bs, (1 - sq * 0.3) * bs, (1 + sq * 0.25) * bs);
    ou.uCaged.value = orbS.caged;
    const p2 = under();
    shadow.visible = !!p2 && orbS.y - (p2 ? p2.h : 0) > -0.5;
    shadow.position.set(tmp.x, frame.origin.y + LEVEL + (p2 ? p2.h : 0) + 0.05 + 0.095, tmp.z);
    shadow.rotation.x = -Math.PI / 2;
    shadow.material.uniforms.uA.value = 0.35 * clamp(1 - (orbS.y - (p2 ? p2.h : 0)) * 0.4, 0.2, 1) * bs;

    // the wings
    orbS.wings += ((orbS.hasWings ? 1 : 0) - orbS.wings) * (1 - Math.exp(-dt * (orbS.hasWings ? 14 : 8)));
    orbS.flap = Math.max(0, orbS.flap - dt * 2.0);
    orbS.flame = Math.max(0, orbS.flame - dt * 3);
    const ph = 1 - orbS.flap;
    const stroke = orbS.flap > 0 ? (ph < 0.2 ? 0.5 + 0.6 * (ph / 0.2) : 1.1 - 1.9 * Math.min(1, (ph - 0.2) / 0.45)) : 0;
    const flutter = Math.sin(time * 7.0) * 0.1 * orbS.glide + Math.sin(time * 2.6) * 0.16 * (1 - orbS.glide);
    const targetA = (0.15 + 0.2 * orbS.glide) + stroke + flutter;
    const prevA = orbS.flapA;
    orbS.flapA += (targetA - orbS.flapA) * (1 - Math.exp(-dt * 22));
    orbS.flapV = (orbS.flapA - prevA) / Math.max(dt, 1e-3);
    yoke.position.copy(tmp);
    yoke.quaternion.setFromUnitVectors(fwdQ, frame.fwd);
    const spread = orbS.wings * (0.55 + 0.45 * Math.max(orbS.glide, Math.min(1, orbS.flap * 2)));
    feathers.visible = orbS.wings > 0.02;
    if (feathers.visible) poseWings(clamp(spread, 0.05, 1), orbS.flapA, clamp(-orbS.flapV * 0.03, -0.25, 0.25), time);
    wingU.uA.value = 0.62 * orbS.wings; wingU.uGlow.value = orbS.flame * 0.9 + pulse * 0.05; wingU.uTime.value = time;

    // the trail
    trailPts.unshift({ x: tmp.x, y: tmp.y, z: tmp.z });
    if (trailPts.length > NT) trailPts.length = NT;
    const bst = 0;
    TA.pos.array[0] = tmp.x; TA.pos.array[1] = tmp.y; TA.pos.array[2] = tmp.z; TA.size.array[0] = 0.75 + pulse * 0.2 + orbS.flame * 0.9 + bst * 0.3; TA.alpha.array[0] = 0.6 + orbS.flame * 0.5 + bst * 0.3;
    for (let i = 0; i < trailPts.length; i++) {
      const q = trailPts[i], k = 1 - i / NT;
      TA.pos.array[(i + 1) * 3] = q.x; TA.pos.array[(i + 1) * 3 + 1] = q.y; TA.pos.array[(i + 1) * 3 + 2] = q.z;
      TA.size.array[i + 1] = (0.34 + bst * 0.2) * k + 0.06; TA.alpha.array[i + 1] = (0.4 + bst * 0.3) * k * k;
    }
    for (const k in TA) TA[k].needsUpdate = true;
    tgeo.instanceCount = trailPts.length + 1;
    // the platforms
    const n = plats.length;
    for (let i = 0; i < n; i++) {
      const p = plats[i];
      A.local.array[i * 3] = p.lane * LANE_W - LANE_W; A.local.array[i * 3 + 1] = p.h; A.local.array[i * 3 + 2] = p.t0;
      A.len.array[i] = p.t1 - p.t0; A.seed.array[i] = p.seed; A.id.array[i] = p.id; A.born.array[i] = p.born; A.kind.array[i] = p.kind; A.gone.array[i] = p.gone;
    }
    for (const k in A) A[k].needsUpdate = true;
    geo.instanceCount = n;
    pu.uScroll.value = clock;
    return { fell, landed, score: fellScore, double: ev.double, wingsLost: ev.wingsLost, launch: ev.launch, burn: ev.burn, splash: ev.splash };
  }

  return { update, move, jump, hold, dive, aim, reset: restart, get score() { return score; }, get best() { return best; }, get speed() { return speedV; }, get level() { return level; }, get grounded() { return orbS.grounded; }, get y() { return orbS.y; }, get orbPos() { return orb.position; }, get flying() { return !orbS.grounded && orbS.hasWings; }, get light() { return light; }, get wings() { return orbS.hasWings; }, get tiles() { return plats; }, get clock() { return clock; }, get onKind() { const p = under(); return p ? p.kind : -1; }, get layLog() { return layLog; }, set played(v) { totalPlay = v; } };
}
