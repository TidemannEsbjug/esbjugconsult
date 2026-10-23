/* Roses: the motif. Each rose is a phyllotaxis of curved petals and a few leaves on a stem, all instanced from one
   bent plane. A rose has a bloom (0 bud → 1 open) that the timeline, the lyrics and the pointer can change.
   Layouts: a wild bush in the foreground, a single rose, roses over a ruined wall, one rose growing from a crack. */
import * as THREE from "../vendor/three.min.js";
import { COMMON, LIGHT } from "./glsl.js";

const PETALS = 20, LEAVES = 4, PER = PETALS + LEAVES;

const VERT = /* glsl */ `
${COMMON}
attribute vec3 aRose;            // position of the rose
attribute vec4 aRoseQ;           // orientation of the rose
attribute float aScale, aIndex, aBloom, aKind, aSway;
varying vec2 vUv; varying vec3 vN, vW; varying float vKind, vTier, vSeed, vDepth, vBloom;
uniform float uTime, uWindX, uWindZ;
uniform vec3 uPt; uniform float uPtR;

mat3 rotX(float a) { float s = sin(a), c = cos(a); return mat3(1, 0, 0, 0, c, s, 0, -s, c); }
mat3 rotY(float a) { float s = sin(a), c = cos(a); return mat3(c, 0, -s, 0, 1, 0, s, 0, c); }

vec3 surf(vec2 p, float tier, float open, float kind, out mat3 R, out vec3 shift) {
  // p: x -1..1 across, y 0..1 base→tip
  float tilt, radius, len, wid, curl;
  if (kind < 0.5) {
    tilt = mix(0.12, 0.3 + 1.25 * tier, open * (0.35 + 0.65 * tier));
    radius = mix(0.02, 0.04 + 0.5 * tier, open);
    len = 0.42 + 0.22 * tier;
    wid = (0.3 + 0.3 * tier) * mix(0.55, 1.0, open);
    curl = 0.45 * open;
  } else {
    tilt = 1.25 + 0.2 * tier;
    radius = 0.15;
    len = 0.75 + 0.2 * tier;
    wid = 0.32;
    curl = 0.15;
  }
  float prof = pow(sin(clamp(p.y, 0.001, 0.999) * PI), 0.55) * (1.0 - 0.2 * p.y);
  vec3 lp = vec3(p.x * wid * prof, p.y * len, 0.0);
  lp.z = -0.5 * wid * p.x * p.x * (0.4 + 0.6 * p.y) - curl * len * p.y * p.y;
  R = rotY(2.39996323 * aIndex + aSway) * rotX(tilt);
  shift = vec3(0.0, 0.0, radius);
  return lp;
}

void main() {
  vUv = uv; vKind = aKind; vBloom = aBloom;
  float idx = aKind < 0.5 ? aIndex : aIndex - float(${PETALS});
  float tier = aKind < 0.5 ? idx / float(${PETALS - 1}) : idx / float(${LEAVES - 1});
  vTier = tier; vSeed = hash1(aIndex * 3.1 + aRose.x * 7.0 + aRose.z * 3.0);
  vec2 p = vec2(uv.x * 2.0 - 1.0, uv.y);
  mat3 R; vec3 shift;
  vec3 lp = surf(p, tier, aBloom, aKind, R, shift);
  vec3 lpx = surf(p + vec2(0.02, 0.0), tier, aBloom, aKind, R, shift);
  vec3 lpy = surf(p + vec2(0.0, 0.02), tier, aBloom, aKind, R, shift);
  vec3 n = normalize(cross(lpx - lp, lpy - lp));
  vec3 local = R * (lp + shift);
  n = R * n;
  // leaves hang below the flower
  if (aKind > 0.5) local.y -= 0.08;
  local *= aScale;
  // the wind, and the pointer brushing past
  vec3 world = aRose + qrot(aRoseQ, local);
  float h = sat(local.y / max(aScale, 1e-3) + 0.5);
  float sway = sin(uTime * 1.1 + aRose.x * 2.0 + aRose.z) * 0.03 + sin(uTime * 2.3 + aRose.z * 3.0) * 0.012;
  world.x += (sway + uWindX * 0.03) * h; world.z += uWindZ * 0.02 * h;
  vec3 dp = world - uPt; float dd = length(dp);
  float f = sat(1.0 - dd / uPtR);
  world += normalize(dp + vec3(0.0, 0.001, 0.0)) * f * f * 0.12 * h;
  vN = qrot(aRoseQ, n);
  vW = world;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON}
${LIGHT}
varying vec2 vUv; varying vec3 vN, vW; varying float vKind, vTier, vSeed, vDepth, vBloom;
uniform vec3 uRose, uRoseDark, uRoseLight, uLeaf, uLeafDark, uCam; uniform float uGlow;
void main() {
  if (uClip > 0.5 && vW.y < -0.05) discard;
  vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
  float prof = pow(sin(clamp(p.y, 0.001, 0.999) * PI), 0.55) * (1.0 - 0.2 * p.y);
  float edge = abs(p.x) / max(prof, 1e-3);
  float serr = vKind > 0.5 ? 0.06 * sin(p.y * 60.0) : 0.0;
  if (edge > 0.98 + serr) discard;
  vec3 n = normalize(gl_FrontFacing ? vN : -vN);
  vec3 c;
  if (vKind < 0.5) {
    float tint = vSeed;
    vec3 rose = mix(uRose, uRoseLight, tint * 0.35);
    c = mix(uRoseDark, rose, smoothstep(0.0, 0.5, p.y));
    c = mix(c, uRoseLight, smoothstep(0.55, 1.0, p.y) * 0.45 * (0.5 + 0.5 * vBloom));
    c = mix(c, uRoseDark, (1.0 - vTier) * 0.35 * (1.0 - p.y));           // the heart is deep
    c *= 1.0 - 0.14 * smoothstep(0.07, 0.0, abs(p.x)) * smoothstep(0.95, 0.3, p.y);
    c += uRoseLight * 0.18 * smoothstep(0.75, 1.0, edge) * (0.3 + 0.7 * vBloom);   // a light rim
  } else {
    c = mix(uLeafDark, uLeaf, smoothstep(0.0, 0.9, p.y) * 0.8 + 0.2 * vSeed);
    c *= 1.0 - 0.2 * smoothstep(0.05, 0.0, abs(p.x));
    float vein = smoothstep(0.03, 0.0, abs(fract(p.y * 5.0 + p.x * 0.5) - 0.5) - 0.47) * step(0.3, abs(p.x));
    c *= 1.0 - vein * 0.12;
  }
  vec3 col = shade(c, n, normalize(uCam - vW), vKind < 0.5 ? 0.35 : 0.5);
  col += uRose * uGlow * (vKind < 0.5 ? 1.2 : 0.15);
  col = fogIn(col, vW, uCam);
  gl_FragColor = vec4(col, 1.0);
}`;

const STEM_VERT = /* glsl */ `
${COMMON}
attribute vec3 aA; attribute vec3 aB; attribute float aR;
varying float vDepth; varying float vS; varying vec3 vW;
uniform float uTime;
void main() {
  // a thin quad from A (root) to B (flower), facing the camera
  vec3 a = aA, b = aB;
  float s = uv.y; vS = s;
  vec3 p = mix(a, b, s);
  p.x += sin(uTime * 1.1 + a.x * 2.0 + a.z) * 0.03 * s;
  vW = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec4 mva = viewMatrix * vec4(a, 1.0), mvb = viewMatrix * vec4(b, 1.0);
  vec2 dir = normalize(mvb.xy - mva.xy + vec2(1e-4, 0.0));
  vec2 side = vec2(-dir.y, dir.x);
  mv.xy += side * (uv.x - 0.5) * aR * (1.2 - 0.5 * s);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const STEM_FRAG = /* glsl */ `
precision highp float;
${COMMON}
${LIGHT}
varying float vDepth, vS; varying vec3 vW; uniform vec3 uLeafDark, uCam;
void main() { if (uClip > 0.5 && vW.y < -0.05) discard; vec3 c = uLeafDark * (0.7 + 0.3 * vS) * (uAmbInt * 1.2 + uSunInt * 0.5); c = fogIn(c, vW, uCam); gl_FragColor = vec4(c, 1.0); }`;

export function makeRoses(scene, cap, shared) {
  const geo = new THREE.InstancedBufferGeometry();
  const plane = new THREE.PlaneGeometry(1, 1, 5, 8);
  plane.translate(0.5, 0.5, 0);           // uv space 0..1
  geo.index = plane.index; geo.attributes.position = plane.attributes.position; geo.attributes.uv = plane.attributes.uv;
  const N = cap * PER;
  const attr = (n, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(N * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, a); return a; };
  const A = { rose: attr("aRose", 3), q: attr("aRoseQ", 4), scale: attr("aScale", 1), index: attr("aIndex", 1), bloom: attr("aBloom", 1), kind: attr("aKind", 1), sway: attr("aSway", 1) };
  const uniforms = {
    ...shared,
    uTime: { value: 0 }, uWindX: { value: 0 }, uWindZ: { value: 0 }, uPt: { value: new THREE.Vector3(0, -99, 0) }, uPtR: { value: 0.6 }, uCam: { value: new THREE.Vector3() }, uGlow: { value: 0 },
    uRose: { value: new THREE.Color("#e5484d") }, uRoseDark: { value: new THREE.Color("#8a1f2b") }, uRoseLight: { value: new THREE.Color("#ffb3a0") },
    uLeaf: { value: new THREE.Color("#4e8a52") }, uLeafDark: { value: new THREE.Color("#23462f") },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);

  // stems
  const sgeo = new THREE.InstancedBufferGeometry();
  const squad = new THREE.PlaneGeometry(1, 1, 1, 6); squad.translate(0.5, 0.5, 0);
  sgeo.index = squad.index; sgeo.attributes.position = squad.attributes.position; sgeo.attributes.uv = squad.attributes.uv;
  const SA = { a: new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3), b: new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3), r: new THREE.InstancedBufferAttribute(new Float32Array(cap), 1) };
  for (const k in SA) SA[k].setUsage(THREE.DynamicDrawUsage);
  sgeo.setAttribute("aA", SA.a); sgeo.setAttribute("aB", SA.b); sgeo.setAttribute("aR", SA.r);
  const smat = new THREE.ShaderMaterial({ uniforms: { ...shared, uTime: uniforms.uTime, uLeafDark: uniforms.uLeafDark, uCam: uniforms.uCam }, vertexShader: STEM_VERT, fragmentShader: STEM_FRAG, side: THREE.DoubleSide });
  const stems = new THREE.Mesh(sgeo, smat);
  stems.frustumCulled = false;
  stems.renderOrder = 4;
  scene.add(stems);

  const roses = [];     // { x,y,z, q, scale, bloom, target, speed, root:[x,y,z], stem:boolean, born }
  const q = new THREE.Quaternion(), e = new THREE.Euler();

  function add(o) {
    if (roses.length >= cap) roses.shift();
    e.set(o.rx ?? 0, o.ry ?? Math.random() * 6.28, o.rz ?? 0);
    q.setFromEuler(e);
    const r = { x: o.x, y: o.y, z: o.z, q: [q.x, q.y, q.z, q.w], scale: o.scale ?? 0.3, bloom: o.bloom ?? 0, target: o.target ?? 1, speed: o.speed ?? 0.5, root: o.root || null, sway: Math.random() * 6.28, born: 0, pop: o.pop ?? 0 };
    roses.push(r);
    return r;
  }
  function clear() { roses.length = 0; }
  function setTarget(t, speed) { for (const r of roses) { r.target = t; if (speed) r.speed = speed; } }

  function upload() {
    const n = roses.length;
    for (let i = 0; i < n; i++) {
      const r = roses[i];
      const pop = r.pop > 0 ? 1 + 0.25 * Math.sin(Math.min(1, r.born / 0.6) * Math.PI) : 1;
      for (let k = 0; k < PER; k++) {
        const j = i * PER + k;
        A.rose.array[j * 3] = r.x; A.rose.array[j * 3 + 1] = r.y; A.rose.array[j * 3 + 2] = r.z;
        A.q.array[j * 4] = r.q[0]; A.q.array[j * 4 + 1] = r.q[1]; A.q.array[j * 4 + 2] = r.q[2]; A.q.array[j * 4 + 3] = r.q[3];
        A.scale.array[j] = r.scale * pop * (r.pop > 0 ? Math.min(1, r.born / 0.35) : 1);
        A.index.array[j] = k; A.bloom.array[j] = r.bloom; A.kind.array[j] = k < PETALS ? 0 : 1; A.sway.array[j] = r.sway;
      }
      if (r.root) {
        SA.a.array[i * 3] = r.root[0]; SA.a.array[i * 3 + 1] = r.root[1]; SA.a.array[i * 3 + 2] = r.root[2];
        SA.b.array[i * 3] = r.x; SA.b.array[i * 3 + 1] = r.y - 0.05 * r.scale; SA.b.array[i * 3 + 2] = r.z;
        SA.r.array[i] = 0.02 * (0.6 + r.scale);
      } else SA.r.array[i] = 0;
    }
    for (const k in A) { A[k].needsUpdate = true; A[k].addUpdateRange(0, n * PER * A[k].itemSize); }
    for (const k in SA) { SA[k].needsUpdate = true; SA[k].addUpdateRange(0, n * SA[k].itemSize); }
    geo.instanceCount = n * PER; sgeo.instanceCount = n;
    mesh.visible = n > 0; stems.visible = n > 0;
  }

  function update(dt, t, ctx) {
    uniforms.uTime.value = t; uniforms.uWindX.value = ctx.wind; uniforms.uWindZ.value = ctx.wind * 0.3;
    uniforms.uGlow.value = ctx.glow || 0; uniforms.uCam.value.copy(ctx.camV);
    if (ctx.pt) uniforms.uPt.value.copy(ctx.pt); else uniforms.uPt.value.set(0, -99, 0);
    for (const r of roses) {
      r.born += dt;
      const k = 1 - Math.exp(-dt * r.speed);
      r.bloom += (r.target - r.bloom) * k;
    }
    upload();
  }

  const R = (a, b) => a + Math.random() * (b - a);
  // let go of the roses the camera has passed
  function cull(z) { for (let i = roses.length - 1; i >= 0; i--) if (roses[i].z > z) roses.splice(i, 1); }

  // a rose blooms where the viewer touches
  function bloomAt(p, scale) {
    const r = add({ x: p.x, y: p.y, z: p.z, scale: scale ?? 0.22, bloom: 0.05, target: 1, speed: 2.4, rx: R(-0.9, -0.3), rz: R(-0.4, 0.4), pop: 1 });
    return r;
  }
  function nearest(p, maxD) {
    let best = null, bd = maxD;
    for (const r of roses) { const d = Math.hypot(r.x - p.x, r.y - p.y, r.z - p.z); if (d < bd) { bd = d; best = r; } }
    return best;
  }

  return { add, clear, cull, update, setTarget, bloomAt, nearest, roses, uniforms, mesh };
}
