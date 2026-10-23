/* Particles: everything that drifts, rises, falls or glows.
   Two instanced pools drawn as camera-facing quads whose shapes are drawn in the fragment shader:
   matter (petals, ash, leaves, smoke, meadow flowers, grass; painted, alpha-blended) and
   light (embers, motes, dust, bokeh, sparks, bubbles, streaks, spray, rain; additive).
   The simulation runs on the CPU in typed arrays; the pointer stirs whatever is near it. */
import * as THREE from "../vendor/three.min.js";
import { COMMON } from "./glsl.js";

export const T = { petal: 0, ash: 1, leaf: 2, smoke: 3, flower: 4, grass: 5, ember: 10, mote: 11, dust: 12, bokeh: 13, spark: 14, bubble: 15, streak: 16, spray: 17, rain: 18 };
const isLight = (t) => t >= 10;

const VERT = /* glsl */ `
${COMMON}
attribute vec3 aPos;
attribute float aSize, aRot, aType, aSeed, aFade, aFlip;
varying vec2 vUv; varying float vType, vSeed, vFade, vDepth;
uniform float uTime;
void main() {
  vUv = uv * 2.0 - 1.0; vType = aType; vSeed = aSeed; vFade = aFade;
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  vec2 q = position.xy;
  if (aType < 0.5 || (aType > 1.5 && aType < 2.5)) { float f = cos(aFlip); q.x *= f * 0.9 + 0.1 * sign(f + 1e-4); }
  if (aType > 3.5 && aType < 5.5) { q.y += 0.5; q.x += sin(uTime * 1.4 + aSeed * 23.0) * 0.18 * uv.y; }   // flowers and grass sway from the root
  if (aType > 13.5 && aType < 14.5) q *= vec2(3.0, 0.6);
  if (aType > 15.5 && aType < 16.5) q *= vec2(12.0, 0.28);
  if (aType > 17.5) q *= vec2(0.22, 3.0);
  q = rot2(aRot) * q * aSize;
  mv.xy += q;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG_MATTER = /* glsl */ `
precision highp float;
${COMMON}
varying vec2 vUv; varying float vType, vSeed, vFade, vDepth;
uniform vec3 uPetal[5]; uniform vec3 uHaze; uniform float uFog, uTime; uniform vec3 uFlowerA, uFlowerB, uFlowerC;
float petalMask(vec2 p) {
  float y = p.y * 0.5 + 0.5;
  float w = pow(sin(clamp(y, 0.001, 0.999) * PI), 0.55) * (1.0 - 0.22 * y) * 0.92;
  return 1.0 - smoothstep(w - 0.07, w + 0.02, abs(p.x));
}
void main() {
  vec2 p = vUv; float a = 0.0; vec3 c = vec3(1.0);
  int ty = int(vType + 0.5);
  if (ty == 0) {
    float m = petalMask(p); if (m < 0.02) discard;
    int ci = int(mod(floor(vSeed * 97.0), 5.0));
    vec3 base = ci == 0 ? uPetal[0] : ci == 1 ? uPetal[1] : ci == 2 ? uPetal[2] : ci == 3 ? uPetal[3] : uPetal[4];
    float y = p.y * 0.5 + 0.5;
    c = mix(base * 0.62, base, smoothstep(0.0, 0.55, y));
    c = mix(c, mix(base, vec3(1.0, 0.96, 0.9), 0.5), smoothstep(0.55, 1.0, y) * 0.55);
    c *= 1.0 - 0.14 * smoothstep(0.06, 0.0, abs(p.x)) * smoothstep(0.9, 0.3, y);
    c *= 0.88 + 0.24 * vnoise(p * 3.0 + vSeed * 10.0);
    a = m;
  } else if (ty == 1) {
    float ang = atan(p.y, p.x), r = length(p);
    float rr = 0.5 + 0.38 * vnoise(vec2(ang * 1.6 + vSeed * 30.0, vSeed * 5.0));
    a = 1.0 - smoothstep(rr - 0.12, rr, r);
    c = mix(vec3(0.4, 0.41, 0.45), vec3(0.74, 0.75, 0.78), hash1(vSeed * 7.0));
  } else if (ty == 2) {
    float m = petalMask(p * vec2(1.25, 1.0)); if (m < 0.02) discard;
    float y = p.y * 0.5 + 0.5;
    c = mix(vec3(0.2, 0.46, 0.3), vec3(0.5, 0.74, 0.42), y);
    c *= 1.0 - 0.18 * smoothstep(0.04, 0.0, abs(p.x));
    a = m;
  } else if (ty == 3) {
    float r = length(p);
    float n = fbm3(p * 2.2 + vSeed * 10.0 + vec2(0.0, -uTime * 0.25));
    a = sat(n * 1.3 - r * 0.9) * 0.55;
    c = vec3(0.76, 0.78, 0.84);
  } else if (ty == 4) {
    float r = length(p), ang = atan(p.y, p.x);
    float pet = 0.52 + 0.36 * cos(ang * 5.0 + vSeed * 10.0);
    a = 1.0 - smoothstep(pet - 0.12, pet, r);
    float which = fract(vSeed * 3.1);
    c = which < 0.4 ? uFlowerA : which < 0.7 ? uFlowerB : uFlowerC;
    c = mix(c, vec3(1.0, 0.84, 0.42), 1.0 - smoothstep(0.14, 0.26, r));
  } else {
    float y = p.y * 0.5 + 0.5;
    float w = 0.14 * (1.0 - y) + 0.01;
    a = 1.0 - smoothstep(w, w + 0.06, abs(p.x - 0.18 * sin(y * 2.2 + vSeed * 5.0) * y));
    c = mix(vec3(0.19, 0.44, 0.28), vec3(0.47, 0.72, 0.4), y);
  }
  c = mix(c, uHaze, 1.0 - exp(-vDepth * uFog * 0.6));
  gl_FragColor = vec4(c, a * vFade);
}`;

const FRAG_LIGHT = /* glsl */ `
precision highp float;
${COMMON}
varying vec2 vUv; varying float vType, vSeed, vFade, vDepth;
uniform vec3 uEmber, uMote, uDust, uBokeh[4]; uniform float uTime, uPulse;
void main() {
  vec2 p = vUv; float r = length(p); vec3 c = vec3(1.0); float a = 0.0;
  int ty = int(vType + 0.5);
  if (ty == 10) { a = exp(-r * r * 5.0) * (0.75 + 0.3 * sin(uTime * 9.0 + vSeed * 50.0)); c = mix(uEmber, vec3(1.0, 0.95, 0.85), exp(-r * r * 14.0)); }
  else if (ty == 11) { a = exp(-r * r * 4.0) * 0.8 * (0.6 + 0.4 * sin(uTime * 1.3 + vSeed * 20.0)); c = uMote; }
  else if (ty == 12) { a = exp(-r * r * 5.0) * 0.45; c = uDust; }
  else if (ty == 13) {
    a = (0.22 + 0.55 * smoothstep(0.72, 0.98, r)) * (1.0 - smoothstep(0.96, 1.0, r)) * (0.55 + 0.45 * uPulse);
    int ci = int(mod(floor(vSeed * 53.0), 4.0));
    c = ci == 0 ? uBokeh[0] : ci == 1 ? uBokeh[1] : ci == 2 ? uBokeh[2] : uBokeh[3];
  }
  else if (ty == 14) { a = exp(-(p.x * p.x * 1.5 + p.y * p.y * 12.0)); c = vec3(1.0, 0.86, 0.7); }
  else if (ty == 15) { a = smoothstep(0.72, 0.86, r) * (1.0 - smoothstep(0.94, 1.0, r)) * 0.7 + exp(-length(p - vec2(-0.32, 0.36)) * 7.0) * 0.9; c = vec3(1.0, 0.95, 0.9); }
  else if (ty == 16) { a = exp(-(p.x * p.x * 1.4 + p.y * p.y * 10.0)) * 0.55; c = vec3(1.0, 0.9, 0.78); }
  else if (ty == 17) { a = exp(-r * r * 6.0) * 0.9; c = vec3(1.0, 0.97, 0.93); }
  else { a = exp(-(p.x * p.x * 12.0 + p.y * p.y * 1.6)) * 0.3; c = vec3(0.8, 0.86, 0.92); }
  gl_FragColor = vec4(c, a * vFade);
}`;

function pool(cap, light) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index; geo.attributes.position = quad.attributes.position; geo.attributes.uv = quad.attributes.uv;
  const attr = (n, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, a); return a; };
  const A = { pos: attr("aPos", 3), size: attr("aSize", 1), rot: attr("aRot", 1), type: attr("aType", 1), seed: attr("aSeed", 1), fade: attr("aFade", 1), flip: attr("aFlip", 1) };
  const uniforms = light
    ? { uEmber: { value: new THREE.Color("#ff9440") }, uMote: { value: new THREE.Color("#ffd9a0") }, uDust: { value: new THREE.Color("#b9ecd6") }, uBokeh: { value: ["#ffc4a3", "#ffd9a0", "#e5484d", "#f2928a"].map((c) => new THREE.Color(c)) }, uTime: { value: 0 }, uPulse: { value: 0 } }
    : { uPetal: { value: ["#e5484d", "#ff7a5c", "#f2928a", "#ffc4a3", "#d63a4a"].map((c) => new THREE.Color(c)) }, uHaze: { value: new THREE.Color("#e8d3c2") }, uFog: { value: 0.02 }, uTime: { value: 0 }, uFlowerA: { value: new THREE.Color("#ff7a5c") }, uFlowerB: { value: new THREE.Color("#ffc4a3") }, uFlowerC: { value: new THREE.Color("#f4ead8") } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: light ? FRAG_LIGHT : FRAG_MATTER, transparent: true, depthWrite: false, depthTest: true, blending: light ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = light ? 20 : 10;
  // state of arrays
  const S = {};
  for (const k of ["x", "y", "z", "vx", "vy", "vz", "size", "rot", "vr", "type", "seed", "life", "max", "flip", "vflip", "alpha", "grow"]) S[k] = new Float32Array(cap);
  return { geo, mat, mesh, A, S, n: 0, cap, uniforms };
}

export function makeParticles(scene, camera, cap) {
  const matter = pool(cap.matter, false), light = pool(cap.light, true);
  scene.add(matter.mesh); scene.add(light.mesh);
  const P = { wind: 0.3, gust: 0 };
  const tmp = new THREE.Vector3(), basisX = new THREE.Vector3(), basisY = new THREE.Vector3(), basisZ = new THREE.Vector3();
  const rayO = new THREE.Vector3(), rayD = new THREE.Vector3();
  let pointerOn = false, pvx = 0, pvy = 0;

  // a position in front of the camera: (sx, sy) in -1..1 across the view at depth dz
  function viewPoint(sx, sy, dz, out) {
    const th = Math.tan((camera.fov * Math.PI) / 360);
    camera.matrixWorld.extractBasis(basisX, basisY, basisZ);
    out.copy(camera.position)
      .addScaledVector(basisX, sx * th * camera.aspect * dz)
      .addScaledVector(basisY, sy * th * dz)
      .addScaledVector(basisZ, -dz);
    return out;
  }
  const R = (a, b) => a + Math.random() * (b - a);

  function spawn(type, o = {}) {
    const pl = isLight(type) ? light : matter;
    if (pl.n >= pl.cap) return -1;
    const i = pl.n++, S = pl.S;
    const dz = o.dz ?? R(1.6, 8);
    const u = dz / 4;                                  // sizes grow with depth so everything reads at the same size on screen
    if (o.x != null) { S.x[i] = o.x; S.y[i] = o.y; S.z[i] = o.z; }
    else { viewPoint(o.sx ?? R(-1.25, 1.25), o.sy ?? R(-1.1, 1.1), dz, tmp); S.x[i] = tmp.x; S.y[i] = tmp.y; S.z[i] = tmp.z; }
    S.vx[i] = o.vx ?? 0; S.vy[i] = o.vy ?? 0; S.vz[i] = o.vz ?? 0;
    S.rot[i] = o.rot ?? Math.random() * 6.28; S.vr[i] = o.vr ?? (Math.random() - 0.5) * 1.6;
    S.type[i] = type; S.seed[i] = Math.random(); S.life[i] = 0; S.flip[i] = Math.random() * 6.28; S.vflip[i] = 1 + Math.random() * 2.4; S.alpha[i] = o.alpha ?? 1; S.grow[i] = 0;
    const w = P.wind;
    switch (type) {
      case T.petal: S.size[i] = o.size ?? R(0.07, 0.15) * u; S.max[i] = o.max ?? R(8, 14); if (o.vx == null) { S.vx[i] = (0.25 + w * 0.9) * R(0.5, 1.3); S.vy[i] = R(-0.4, -0.15); } break;
      case T.leaf: S.size[i] = o.size ?? R(0.12, 0.2) * u; S.max[i] = o.max ?? R(8, 12); if (o.vx == null) { S.vx[i] = R(-0.3, 0.3); S.vy[i] = R(-0.25, -0.1); } break;
      case T.ash: S.size[i] = o.size ?? R(0.025, 0.06) * u; S.max[i] = o.max ?? R(9, 14); if (o.vx == null) { S.vx[i] = R(-0.15, 0.1); S.vy[i] = R(-0.35, -0.15); } break;
      case T.smoke: S.size[i] = o.size ?? R(0.35, 0.6) * u; S.max[i] = o.max ?? R(4, 6); S.vy[i] = o.vy ?? R(0.25, 0.45); S.vx[i] = o.vx ?? R(-0.08, 0.08); S.vr[i] *= 0.2; break;
      case T.flower: S.size[i] = o.size ?? R(0.05, 0.1) * u; S.max[i] = o.max ?? 1e9; S.rot[i] = 0; S.vr[i] = 0; break;
      case T.grass: S.size[i] = o.size ?? R(0.12, 0.26) * u; S.max[i] = o.max ?? 1e9; S.rot[i] = 0; S.vr[i] = 0; break;
      case T.ember: S.size[i] = o.size ?? R(0.025, 0.06) * u; S.max[i] = o.max ?? R(3, 6); if (o.vx == null) { S.vx[i] = R(-0.15, 0.15); S.vy[i] = R(0.35, 0.8); } break;
      case T.mote: S.size[i] = o.size ?? R(0.03, 0.07) * u; S.max[i] = o.max ?? R(5, 10); if (o.vx == null) { S.vx[i] = (Math.random() - 0.5 + w) * 0.12; S.vy[i] = (Math.random() - 0.6) * 0.1; } break;
      case T.dust: S.size[i] = o.size ?? R(0.015, 0.035) * u; S.max[i] = o.max ?? R(6, 12); if (o.vx == null) { S.vx[i] = R(-0.05, 0.05); S.vy[i] = R(-0.04, 0.04); } break;
      case T.bokeh: S.size[i] = o.size ?? R(0.25, 0.75) * u; S.max[i] = o.max ?? R(5, 9); if (o.vx == null) { S.vx[i] = R(-0.06, 0.06); S.vy[i] = R(-0.05, 0.05); } break;
      case T.spark: S.size[i] = o.size ?? R(0.02, 0.04) * u; S.max[i] = o.max ?? R(0.5, 1.1); S.rot[i] = Math.atan2(S.vy[i], S.vx[i]); break;
      case T.bubble: S.size[i] = o.size ?? R(0.02, 0.06) * u; S.max[i] = o.max ?? R(2.5, 5); S.vy[i] = o.vy ?? R(0.3, 0.7); S.vx[i] = o.vx ?? R(-0.1, 0.1); break;
      case T.streak: S.size[i] = o.size ?? R(0.05, 0.1) * u; S.max[i] = o.max ?? R(0.5, 1); S.vx[i] = o.vx ?? R(-9, -5); S.rot[i] = 0; S.vr[i] = 0; break;
      case T.spray: S.size[i] = o.size ?? R(0.02, 0.05) * u; S.max[i] = o.max ?? R(0.8, 1.6); break;
      case T.rain: S.size[i] = o.size ?? R(0.05, 0.09) * u; S.max[i] = o.max ?? R(1.2, 2.2); S.vy[i] = -8; S.rot[i] = 0; S.vr[i] = 0; break;
      default: S.size[i] = 0.05 * u; S.max[i] = 5;
    }
    return i;
  }

  // a burst at a world point (or a screen rectangle in -1..1 units, at a depth)
  function burst(type, n, o = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, s = o.speed ?? R(0.3, 1.2);
      const x = o.x != null ? o.x + R(-(o.r ?? 0.1), o.r ?? 0.1) : undefined;
      const y = o.y != null ? o.y + R(-(o.r ?? 0.1), o.r ?? 0.1) : undefined;
      const sx = o.sx != null ? o.sx + R(-(o.sw ?? 0.05), o.sw ?? 0.05) : undefined;
      const sy = o.sy != null ? o.sy + R(-(o.sh ?? 0.05), o.sh ?? 0.05) : undefined;
      const up = o.up ?? 0.6;
      spawn(type, { x, y, z: o.z, sx, sy, dz: o.dz, vx: Math.cos(a) * s * (o.spread ?? 1), vy: Math.sin(a) * s * 0.5 + up, vz: (Math.random() - 0.5) * 0.3, size: o.size, max: o.max });
    }
  }

  function kill(pl, i) {
    const j = --pl.n, S = pl.S;
    if (i === j) return;
    for (const k in S) S[k][i] = S[k][j];
  }

  function pointer(on, ox, oy, oz, dx, dy, dz, vx, vy) { pointerOn = on; rayO.set(ox, oy, oz); rayD.set(dx, dy, dz); pvx = vx; pvy = vy; }

  function step(pl, dt, t, ctx) {
    const S = pl.S, w = P.wind, gust = P.gust;
    const camZ = camera.position.z;
    for (let i = pl.n - 1; i >= 0; i--) {
      S.life[i] += dt;
      const ty = S.type[i];
      if (S.life[i] > S.max[i] || S.z[i] > camZ + 0.5 || Math.abs(S.x[i] - camera.position.x) > 40 || Math.abs(S.y[i] - camera.position.y) > 30) { kill(pl, i); continue; }
      let ax = 0, ay = 0;
      switch (ty) {
        case T.petal: ax = w * 0.35 + gust * 0.25; ay = -0.25; S.vx[i] *= 0.995; S.vy[i] += (-0.4 - S.vy[i]) * 0.01; S.rot[i] += S.vr[i] * dt; S.flip[i] += S.vflip[i] * dt; break;
        case T.leaf: ax = w * 0.3 + gust * 0.3; ay = -0.12; S.vy[i] += (-0.3 - S.vy[i]) * 0.01; S.rot[i] += S.vr[i] * dt; S.flip[i] += S.vflip[i] * 0.7 * dt; break;
        case T.ash: ax = Math.sin(t * 0.9 + S.seed[i] * 9) * 0.12 + w * 0.1; ay = -0.05; S.rot[i] += S.vr[i] * dt; break;
        case T.smoke: S.size[i] += dt * 0.12; S.vx[i] += Math.sin(t * 0.7 + S.seed[i] * 7) * 0.02; S.rot[i] += S.vr[i] * dt; break;
        case T.ember: ax = Math.sin(t * 3 + S.seed[i] * 20) * 0.35; ay = 0.25; break;
        case T.mote: ax = Math.sin(t * 0.8 + S.seed[i] * 11) * 0.06 + w * 0.03; ay = Math.cos(t * 0.6 + S.seed[i] * 9) * 0.04; break;
        case T.dust: ax = Math.sin(t * 0.5 + S.seed[i] * 11) * 0.02; ay = Math.cos(t * 0.4 + S.seed[i] * 9) * 0.015; break;
        case T.bokeh: ax = Math.sin(t * 0.3 + S.seed[i] * 11) * 0.02; break;
        case T.spark: S.vx[i] *= 0.94; S.vy[i] = S.vy[i] * 0.94 - 2.5 * dt; S.rot[i] = Math.atan2(S.vy[i], S.vx[i]); break;
        case T.bubble: ax = Math.sin(t * 4 + S.seed[i] * 30) * 0.4; ay = 0.5; break;
        case T.spray: ay = -4; S.vx[i] *= 0.98; break;
        case T.streak: break;
        case T.rain: break;
        default: break;
      }
      if (pointerOn && ty !== T.flower && ty !== T.grass && ty !== T.streak) {
        // the pointer's ray at this particle's depth
        const s = (S.z[i] - rayO.z) / (rayD.z || -1e-6);
        if (s > 0) {
          const px = rayO.x + rayD.x * s, py = rayO.y + rayD.y * s;
          const dx = S.x[i] - px, dy = S.y[i] - py, d2 = dx * dx + dy * dy;
          const Rr = 0.22 * s, R2 = Rr * Rr;
          if (d2 < R2) {
            const d = Math.sqrt(d2) + 1e-3, f = 1 - d / Rr;
            const swirl = 2.2 * f * s * 0.25, push = (ty === T.ember ? -0.6 : 1.1) * f * s * 0.25;
            ax += (-dy / d) * swirl + (dx / d) * push + pvx * 0.12 * f;
            ay += (dx / d) * swirl + (dy / d) * push + pvy * 0.12 * f;
            if (ty === T.petal) S.vflip[i] += f * 0.25;
          }
        }
      }
      S.vx[i] += ax * dt; S.vy[i] += ay * dt;
      S.x[i] += S.vx[i] * dt; S.y[i] += S.vy[i] * dt; S.z[i] += S.vz[i] * dt;
    }
    // upload
    const A = pl.A, n = pl.n;
    for (let i = 0; i < n; i++) {
      A.pos.array[i * 3] = S.x[i]; A.pos.array[i * 3 + 1] = S.y[i]; A.pos.array[i * 3 + 2] = S.z[i];
      A.size.array[i] = S.size[i]; A.rot.array[i] = S.rot[i]; A.type.array[i] = S.type[i]; A.seed.array[i] = S.seed[i]; A.flip.array[i] = S.flip[i];
      const inF = Math.min(1, S.life[i] / 0.7), outF = Math.min(1, (S.max[i] - S.life[i]) / 1.2);
      A.fade.array[i] = Math.max(0, Math.min(inF, outF)) * S.alpha[i];
    }
    for (const k in A) { A[k].needsUpdate = true; A[k].addUpdateRange(0, n * A[k].itemSize); }
    pl.geo.instanceCount = n;
    pl.mesh.visible = n > 0;
  }

  function update(dt, t, ctx) {
    P.wind = ctx.wind; P.gust = Math.sin(t * 0.4) * 0.5 + Math.sin(t * 0.13 + 1) * 0.5;
    matter.uniforms.uTime.value = t; light.uniforms.uTime.value = t; light.uniforms.uPulse.value = ctx.pulse;
    matter.uniforms.uHaze.value.set(ctx.haze); matter.uniforms.uFog.value = ctx.fog;
    step(matter, dt, t, ctx); step(light, dt, t, ctx);
  }
  function clear(keepTypes) {
    for (const pl of [matter, light]) {
      if (!keepTypes) { pl.n = 0; continue; }
      for (let i = pl.n - 1; i >= 0; i--) if (!keepTypes.includes(pl.S.type[i])) kill(pl, i);
    }
  }
  // let long-lived things (flowers, grass) go
  function release(types, over) {
    for (const pl of [matter, light]) for (let i = 0; i < pl.n; i++) if (types.includes(pl.S.type[i]) && pl.S.max[i] > 1e8) pl.S.max[i] = pl.S.life[i] + over;
  }
  const count = () => matter.n + light.n;
  return { spawn, burst, update, clear, release, pointer, viewPoint, count, matter, light };
}
