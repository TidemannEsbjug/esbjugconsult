/* Birds: a small flock, each bird two wings that beat in the vertex shader. A boid simulation on the CPU.
   Modes: distant (a line crossing the far sky) · launch (herons rising off the water on a cue) · circle (a hawk
   turning above) · caged (one bird fluttering inside the cage) · escape (it flies up and out). They avoid the pointer. */
import * as THREE from "../vendor/three.min.js";
import { COMMON, LIGHT } from "./glsl.js";

const VERT = /* glsl */ `
${COMMON}
attribute vec3 aPos; attribute vec3 aDir; attribute float aPhase, aSize, aCol, aFlap;
varying float vCol, vDepth, vShade; varying vec3 vW;
uniform float uTime;
void main() {
  vec3 f = normalize(aDir + vec3(0.0, 0.0, 1e-4));
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 r = normalize(cross(f, up));
  up = cross(r, f);
  vec3 p = position;                 // body along +y of the geometry = forward, wings along x
  float w = abs(p.x);
  float beat = sin(uTime * aFlap + aPhase);
  p.z += beat * w * 0.9 - w * w * 0.25;
  vec3 world = aPos + (r * p.x + f * p.y + up * p.z) * aSize;
  vCol = aCol; vShade = 0.8 + 0.2 * beat; vW = world;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
precision highp float;
${COMMON}
${LIGHT}
varying float vCol, vDepth, vShade; varying vec3 vW;
uniform vec3 uDark, uLight, uCam;
void main() {
  if (uClip > 0.5 && vW.y < -0.05) discard;
  vec3 c = mix(uDark, uLight, vCol) * vShade * (uAmbInt * 1.3 + uSunInt * 0.6 * vCol);
  c = fogIn(c, vW, uCam);
  gl_FragColor = vec4(c, 1.0);
}`;

function birdGeometry() {
  // a body and two swept wings, in the xy plane (y forward)
  const v = [
    // left wing
    -1.0, -0.15, 0, -0.45, 0.1, 0, -0.08, -0.05, 0,
    -1.0, -0.15, 0, -0.08, -0.05, 0, -0.35, -0.35, 0,
    // right wing
    1.0, -0.15, 0, 0.08, -0.05, 0, 0.45, 0.1, 0,
    1.0, -0.15, 0, 0.35, -0.35, 0, 0.08, -0.05, 0,
    // body
    -0.08, -0.05, 0, 0.08, -0.05, 0, 0.0, 0.42, 0,
    -0.08, -0.05, 0, 0.0, -0.45, 0, 0.08, -0.05, 0,
  ];
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  return g;
}

export function makeBirds(scene, cap, shared) {
  const geo = birdGeometry();
  const attr = (n, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, a); return a; };
  const A = { pos: attr("aPos", 3), dir: attr("aDir", 3), phase: attr("aPhase", 1), size: attr("aSize", 1), col: attr("aCol", 1), flap: attr("aFlap", 1) };
  const uniforms = { ...shared, uTime: { value: 0 }, uDark: { value: new THREE.Color("#1f3a3a") }, uLight: { value: new THREE.Color("#f4ead8") }, uCam: { value: new THREE.Vector3() } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  scene.add(mesh);

  const B = [];        // { p: Vector3, v: Vector3, phase, size, col, flap, target }
  let mode = "none", t0 = 0, centre = new THREE.Vector3(), params = {};
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const R = (a, b) => a + Math.random() * (b - a);

  function set(m, cam, opt = {}) {
    if (m === mode && !opt.force) return;
    mode = m; t0 = 0; params = opt; B.length = 0;
    const cx = cam[0], cy = cam[1], cz = cam[2];
    if (m === "distant") {
      const n = opt.n ?? 14;
      centre.set(cx + R(-6, -2), cy + R(2.5, 4), cz - R(18, 26));
      for (let i = 0; i < n; i++) {
        const b = { p: centre.clone().add(new THREE.Vector3(i * 0.9 + R(-0.3, 0.3), Math.abs(i - n / 2) * -0.25 + R(-0.2, 0.2), R(-1, 1))), v: new THREE.Vector3(1.2, 0.05, 0), phase: Math.random() * 6.28, size: R(0.16, 0.24), col: opt.col ?? 0, flap: R(5, 7) };
        B.push(b);
      }
    } else if (m === "launch") {
      const n = opt.n ?? 16;
      for (let i = 0; i < n; i++) {
        const dz = R(5, 14);
        const b = { p: new THREE.Vector3(cx + R(-1.2, 1.2) * dz * 0.5, cy - 1.45 + dz * 0.01, cz - dz), v: new THREE.Vector3(0, 0, 0), phase: Math.random() * 6.28, size: R(0.18, 0.3) * (dz / 8), col: opt.col ?? 1, flap: R(3.5, 5), wait: R(0, 1.4) };
        B.push(b);
      }
    } else if (m === "circle") {
      B.push({ p: new THREE.Vector3(cx, cy + 3.2, cz - 9), v: new THREE.Vector3(1, 0, 0), phase: 0, size: 0.34, col: 0, flap: 1.6, ang: 0 });
    } else if (m === "caged") {
      B.push({ p: new THREE.Vector3(cx, cy - 0.1, cz - 2.6), v: new THREE.Vector3(0.3, 0, 0), phase: 0, size: 0.12, col: 1, flap: 14, ang: 0 });
    } else if (m === "escape") {
      B.push({ p: new THREE.Vector3(cx + 0.6, cy - 0.3, cz - 3), v: new THREE.Vector3(-0.3, 0.3, 0), phase: 0, size: 0.14, col: 1, flap: 9 });
    } else if (m === "flock") {
      const n = opt.n ?? 20;
      centre.set(cx + R(-2, 2), cy + 2.5, cz - 9);
      for (let i = 0; i < n; i++) B.push({ p: centre.clone().add(new THREE.Vector3(R(-2, 2), R(-1, 1), R(-2, 2))), v: new THREE.Vector3(R(-1, 1), R(-0.3, 0.3), R(-1, 1)), phase: Math.random() * 6.28, size: R(0.14, 0.22), col: opt.col ?? 0, flap: R(5, 8) });
    }
    upload();
  }
  function cue(name) { if (name === "launch") for (const b of B) b.wait = Math.min(b.wait ?? 0, R(0, 0.8)); }

  function upload() {
    const n = B.length;
    for (let i = 0; i < n; i++) {
      const b = B[i];
      A.pos.array[i * 3] = b.p.x; A.pos.array[i * 3 + 1] = b.p.y; A.pos.array[i * 3 + 2] = b.p.z;
      A.dir.array[i * 3] = b.v.x; A.dir.array[i * 3 + 1] = b.v.y; A.dir.array[i * 3 + 2] = b.v.z;
      A.phase.array[i] = b.phase; A.size.array[i] = b.size; A.col.array[i] = b.col; A.flap.array[i] = b.flap;
    }
    for (const k in A) { A[k].needsUpdate = true; A[k].addUpdateRange(0, n * A[k].itemSize); }
    geo.instanceCount = n;
    mesh.visible = n > 0;
  }

  function update(dt, t, ctx) {
    t0 += dt;
    uniforms.uTime.value = t; uniforms.uCam.value.copy(ctx.camV);
    uniforms.uDark.value.set(ctx.birdDark || "#1f3a3a");
    const pt = ctx.pt;
    for (const b of B) {
      if (mode === "distant") {
        b.p.addScaledVector(b.v, dt);
        b.p.y += Math.sin(t * 0.7 + b.phase) * 0.003;
      } else if (mode === "launch") {
        if (b.wait > 0) { b.wait -= dt; continue; }
        b.v.y += (1.3 - b.v.y) * (1 - Math.exp(-dt * 0.8));
        b.v.x += (0.6 - b.v.x) * (1 - Math.exp(-dt * 0.5));
        b.v.z += (0.4 - b.v.z) * (1 - Math.exp(-dt * 0.4));
        b.p.addScaledVector(b.v, dt);
        b.p.y += Math.sin(t * 2 + b.phase) * 0.004;
      } else if (mode === "circle") {
        b.ang += dt * 0.35;
        const r = 3.2;
        const nx = ctx.cam[0] + Math.cos(b.ang) * r, nz = ctx.cam[2] - 9 + Math.sin(b.ang) * r * 0.6, ny = ctx.cam[1] + 3.2 + Math.sin(b.ang * 0.5) * 0.3;
        b.v.set(nx - b.p.x, ny - b.p.y, nz - b.p.z).multiplyScalar(1 / Math.max(dt, 1e-3));
        b.p.set(nx, ny, nz);
      } else if (mode === "caged") {
        // flutters between perches; shies from the pointer
        b.ang += dt;
        const home = tmp.set(ctx.cam[0] + Math.sin(b.ang * 0.9) * 0.45, ctx.cam[1] - 0.15 + Math.sin(b.ang * 1.7) * 0.22, ctx.cam[2] - 2.6 + Math.cos(b.ang * 0.7) * 0.25);
        if (pt) { tmp2.subVectors(b.p, pt); const d = tmp2.length(); if (d < 0.8) home.addScaledVector(tmp2.normalize(), (0.8 - d) * 1.2); }
        tmp2.subVectors(home, b.p);
        b.v.lerp(tmp2.multiplyScalar(2.5), 1 - Math.exp(-dt * 3));
        b.p.addScaledVector(b.v, dt);
      } else if (mode === "escape") {
        b.v.y += 0.9 * dt; b.v.x -= 0.5 * dt; b.v.z += 0.25 * dt;
        b.p.addScaledVector(b.v, dt);
      } else if (mode === "flock") {
        // boids
        tmp.set(0, 0, 0); tmp2.set(0, 0, 0); let n = 0;
        for (const o of B) { if (o === b) continue; const d = o.p.distanceTo(b.p); if (d < 3) { tmp.add(o.p); tmp2.add(o.v); n++; if (d < 0.6) b.v.addScaledVector(b.p.clone().sub(o.p).normalize(), dt * 2); } }
        if (n) { tmp.multiplyScalar(1 / n).sub(b.p); b.v.addScaledVector(tmp, dt * 0.8); tmp2.multiplyScalar(1 / n); b.v.lerp(tmp2, dt * 0.5); }
        b.v.addScaledVector(centre.clone().sub(b.p), dt * 0.3);
        if (pt) { tmp2.subVectors(b.p, pt); const d = tmp2.length(); if (d < 2.5) b.v.addScaledVector(tmp2.normalize(), (2.5 - d) * dt * 4); }
        const sp = b.v.length(); if (sp > 2.2) b.v.multiplyScalar(2.2 / sp); if (sp < 0.8) b.v.multiplyScalar(0.8 / Math.max(sp, 1e-3));
        b.p.addScaledVector(b.v, dt);
      }
    }
    upload();
  }
  function clear() { mode = "none"; B.length = 0; upload(); }
  return { set, cue, update, clear, get mode() { return mode; }, uniforms };
}
