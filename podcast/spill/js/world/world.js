/* The world: one continuous ride down a river valley, drawn live.
   Sky dome · terrain · water with a reflection of everything · the city that rises as you come near · roses along the
   banks · birds · fires · particles · post. The journey (journey.js) says where you are and what the light is like. */
import * as THREE from "../vendor/three.min.js";
import { makeJourney } from "./journey.js";
import { makeTerrain as makeTerrainJS, riverX } from "./noise.js";
import { makeSky } from "./sky.js";
import { makeTerrain } from "./terrain.js";
import { makeWater } from "./water.js";
import { makeCity } from "./city.js";
import { makeRoses } from "./roses.js";
import { makeBirds } from "./birds.js";
import { makeParticles, T } from "./particles.js";
import { makePost } from "./post.js";
import { makeGame } from "./game.js";

export function makeWorld(canvas, HR) {
  const D = HR.D, U = HR.util, { clamp, lerp } = U, PT = HR.pointer;
  const mobile = matchMedia("(pointer: coarse)").matches;
  const small = innerWidth * innerHeight < 600000;
  const lite = mobile || small;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: "high-performance" });
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const gl = renderer.getContext();
  const hdr = !!(gl.getExtension("EXT_color_buffer_half_float") || gl.getExtension("EXT_color_buffer_float"));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
  scene.add(camera);

  const J = makeJourney(D);
  const TJ = makeTerrainJS((z) => J.zoneAt(z, 0), (z) => J.zoneAt(z, 1));
  // one light for everything
  const shared = {
    uZones: { value: J.zoneTex }, uZoneLen: { value: J.zoneLen },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uAmbSky: { value: new THREE.Color() }, uAmbGround: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
    uSunInt: { value: 1 }, uAmbInt: { value: 0.5 }, uFogK: { value: 0.012 }, uFogH: { value: 0.06 }, uClip: { value: 0 },
  };
  const sky = makeSky(scene);
  const terrain = makeTerrain(scene, shared, lite ? 120 : 190);
  const reflRT = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType });
  const water = makeWater(scene, shared, lite ? 90 : 150, reflRT.texture);
  const city = makeCity(scene, shared, J, TJ);
  const roses = makeRoses(scene, 170, shared);
  const birds = makeBirds(scene, 48, shared);
  const particles = makeParticles(scene, camera, lite ? { matter: 1200, light: 1200 } : { matter: 2600, light: 2600 });
  const post = makePost(renderer, { hdr, samples: lite ? 2 : 4 });
  // the song's half-beats, and whether each falls in the light or the dark
  const HB = [];
  for (let i = 0; i < D.beats.length; i++) { const b = D.beats[i]; if (b >= D.duration) break; HB.push(b); const nb = D.beats[i + 1]; if (nb != null) { const m = (b + nb) / 2; if (m < D.duration) HB.push(m); } }
  const LIGHTS = HB.map((t) => J.at(t).chaos < 0.5);
  const game = makeGame(scene, shared, { duration: D.duration, hb: HB, light: LIGHTS });
  let gameEvent = null, loops = 0;
  const fwdV = new THREE.Vector3();
  const reflCam = new THREE.PerspectiveCamera();
  const texMat = new THREE.Matrix4();

  // ---------- size ----------
  let W = 1, H = 1, dpr = 1, scale = lite ? 0.6 : 0.85, frameCost = 10, costAt = 0;
  function resize() {
    W = innerWidth; H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, mobile ? 2 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    post.resize(Math.round(W * dpr), Math.round(H * dpr), scale, dpr);
    reflRT.setSize(Math.max(2, Math.round(W * dpr * scale * 0.5)), Math.max(2, Math.round(H * dpr * scale * 0.5)));
  }
  addEventListener("resize", resize);

  // ---------- state ----------
  let P = null, animTime = 0, flash = 0, lastBeat = -1e9, spawnAcc = 0, roseFill = 0, flowerFill = 0, birdMode = "", lastT = -1, crackRose = null, state = -1, glitchKick = 0;
  const para = { x: 0, y: 0 }, torch = { x: 0.5, y: 0.5 };
  const leakPos = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], leakLean = { x: 0.5, y: 0.5 };
  const ro = new THREE.Vector3(), rd = new THREE.Vector3(), pt = new THREE.Vector3(), tmp = new THREE.Vector3(), lookV = new THREE.Vector3(), sunDir = new THREE.Vector3(), upV = new THREE.Vector3(), sunP = new THREE.Vector3();
  let ptOn = false, lastPt = { x: 0, y: 0 }, lastStroke = 0;
  const debug = { refl: true, scene: true };
  const R = (a, b) => a + Math.random() * (b - a);
  const WEIGHTS = ["petal", "ember", "ash", "mote", "dust", "bokeh", "spark", "smoke", "bubble", "leaf", "rain", "streak", "spray"];

  // the crack on the ledge, and the rose that grows from it
  const crackD = J.dEnd + 3.6, crackZ = -crackD, crackRW = J.zoneAtD(crackD).riverW;
  const crackX = riverX(crackZ) + crackRW * 1.08 + 2.8;
  const crack = { x: crackX, z: crackZ, y: TJ.terrainH(crackX, crackZ), pulse: 0 };

  function pickType(p) {
    let total = 0;
    for (const k of WEIGHTS) total += p[k] || 0;
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const k of WEIGHTS) { r -= p[k] || 0; if (r <= 0) return k; }
    return "mote";
  }
  const nearFire = () => { const c = camera.position; let best = null, bd = 1e9; for (const f of city.fires) { const dz = c.z - f.z; if (dz < -3 || dz > 45) continue; const d = Math.abs(dz) + Math.random() * 20; if (d < bd) { bd = d; best = f; } } return best; };
  function emit(kind, p, pre) {
    const o = {};
    switch (kind) {
      case "petal": if (Math.random() < 0.6) { o.sy = 1.25; o.sx = R(-1.3, 0.9); } else { o.sx = -1.35; o.sy = R(-0.6, 1.2); } o.dz = R(2.8, 9); break;
      case "ash": o.sy = 1.25; o.sx = R(-1.3, 1.3); o.dz = R(1.2, 9); o.size = R(0.045, 0.1) * (o.dz / 4); break;
      case "leaf": o.sy = 1.25; o.sx = R(-1.0, 0.6); o.dz = R(1.4, 4); break;
      case "rain": o.sy = 1.3; o.sx = R(-1.3, 1.3); o.dz = R(1, 5); break;
      case "ember": {
        const f = p.fire > 0.02 ? nearFire() : null;
        if (f) { o.x = f.x + R(-0.35, 0.35); o.y = f.y + 0.3; o.z = f.z + R(-0.3, 0.3); o.vx = R(-0.25, 0.25); o.vy = R(0.6, 1.6) * (0.4 + p.fire); o.vz = R(-0.2, 0.2); o.size = R(0.03, 0.07); }
        else { o.sy = -1.2; o.sx = R(-1.3, 1.3); o.dz = R(1.4, 8); }
        break;
      }
      case "smoke": { const f = nearFire(); if (f) { o.x = f.x + R(-0.2, 0.2); o.y = f.y + 0.5; o.z = f.z; } else { o.sy = -1.2; o.dz = R(2, 6); } break; }
      case "streak": o.sx = 1.45; o.sy = R(-1.1, 1.1); o.dz = R(1.5, 9); o.vx = R(-10, -6) * (o.dz / 4); break;
      case "spray": o.sy = -1.15; o.sx = R(-1.3, 1.3); o.dz = R(1.5, 6); o.vy = R(1.5, 4) * (o.dz / 4); o.vx = R(-1, 1); break;
      case "bubble": if (ptOn && Math.random() < 0.5) { o.x = pt.x + R(-0.1, 0.1); o.y = pt.y; o.z = pt.z; } else { o.sx = R(-0.4, 0.4); o.sy = -1.15; o.dz = R(1.5, 4); } break;
      case "bokeh": o.dz = R(2, 9); o.sy = R(-0.2, 1.1); break;
      case "spark": { const f = nearFire(); if (!f) return; o.x = f.x; o.y = f.y + 0.4; o.z = f.z; const a = R(0, 6.28), s = R(0.6, 2.4); o.vx = Math.cos(a) * s; o.vy = Math.abs(Math.sin(a)) * s + 1.2; o.vz = R(-0.6, 0.6); break; }
      default: o.dz = R(1.4, 9);
    }
    const i = particles.spawn(T[kind], o);
    if (pre && i >= 0) { const pl = T[kind] >= 10 ? particles.light : particles.matter; pl.S.life[i] = Math.random() * pl.S.max[i] * 0.7; }
  }

  // where the water meets the land, on one side of the river
  function shoreX(z, side, rw) {
    const x0 = riverX(z);
    for (let o = rw * 0.5; o < rw * 2.4; o += 0.4) if (TJ.terrainH(x0 + side * o, z) > 0.3) return x0 + side * o;
    return x0 + side * rw * 1.2;
  }
  // ---------- the banks ahead are planted as the camera comes ----------
  function plant(d, p) {
    const camZ = camera.position.z;
    while (roseFill < d + 110) {
      const z = -roseFill;
      const t = J.tAt(roseFill);
      const zn = J.zoneAtD(roseFill);
      const nature = 1 - zn.urban;
      const hidden = t > 49.4 && t < 57.5;
      if (hidden) {
        for (const side of [-1, 1]) if (Math.random() < 0.75) {
          const x = riverX(z) + side * (zn.riverW * 0.97 + R(0.1, 0.5)), y = R(0.4, 3.2);
          roses.add({ x, y, z: z + R(-0.6, 0.6), scale: R(0.28, 0.45), bloom: 1, target: 1, rx: R(-0.3, 0.3), ry: side > 0 ? -1.57 + R(-0.5, 0.5) : 1.57 + R(-0.5, 0.5), root: null });
        }
        roseFill += R(1.4, 2.4);
        continue;
      }
      if (Math.random() < nature * 0.95) {
        for (const side of [-1, 1]) if (Math.random() < 0.85) {
          const n = 1 + Math.floor(Math.random() * 3);
          const bx = shoreX(z, side, zn.riverW) + side * (R(0.3, 3) + (Math.random() < 0.3 ? R(3, 11) : 0));
          for (let k = 0; k < n; k++) {
            const x = bx + R(-1.0, 1.0), zz = z + R(-1.2, 1.2);
            const y = TJ.terrainH(x, zz);
            if (y < 0.2) continue;
            const s = R(0.4, 0.8) * (0.85 + 0.3 * zn.meadow);
            roses.add({ x, y: y + 0.55 + s * 0.6, z: zz, scale: s, bloom: p.roseBloom, target: p.roseBloom, speed: R(0.4, 0.9), rx: R(-0.5, 0.2), root: [x + R(-0.05, 0.05), y - 0.1, zz] });
          }
        }
      }
      roseFill += (2.2 + R(0, 2.5)) / Math.max(0.3, p.roseDensity);
    }
    roses.cull(camZ + 6);
    // meadow flowers and grass
    while (flowerFill < d + 70) {
      const z = -flowerFill, zn = J.zoneAtD(flowerFill);
      const dens = zn.meadow * 14 + (1 - zn.urban) * p.grass * 3;
      for (let i = 0; i < dens; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = shoreX(z, side, zn.riverW) + side * R(0.2, zn.riverW * 1.2), zz = z + R(-0.5, 0.5);
        const y = TJ.terrainH(x, zz);
        if (y < 0.3) continue;
        const flower = Math.random() < zn.meadow * 0.75;
        particles.spawn(flower ? T.flower : T.grass, { x, y: y + 0.02, z: zz, size: flower ? R(0.4, 0.75) : R(0.7, 1.3) });
      }
      flowerFill += 1;
    }
  }

  // ---------- frame ----------
  const portrait = () => W < H;
  function update(o) {
    const t0 = performance.now();
    const dt = Math.min(o.dt, 0.05);
    animTime += dt;
    const idle = o.state === "idle";
    const t = idle ? 0 : o.state === "ended" ? D.duration + 0.3 : o.t;
    P = J.at(t);
    const d = J.dAt(t);
    if (Math.abs(t - lastT) > 2.5) { if (t < lastT - 5 && lastT > D.duration - 4) loops++; roseFill = Math.max(0, d - 8); flowerFill = Math.max(0, d - 4); roses.clear(); particles.clear(); if (lastT >= 0) post.cut(); }
    lastT = t;
    const pulse = HR.pulse(o.beat);
    flash = Math.max(0, flash - dt * 2.2);
    glitchKick = Math.max(0, glitchKick - dt * 3);
    // the switch between the two worlds is a cut: the old frame tears off the new one
    const st = P.chaos > 0.5 ? 1 : 0;
    if (state >= 0 && st !== state && o.playing) { post.cut(0.28); flash = 1; glitchKick = 1; for (let i = 0; i < 12; i++) { const k = pickType(P); if (k) emit(k, P); } }
    state = st;
    if (o.beat.index !== lastBeat) {
      if (o.beat.index > lastBeat && o.beat.index - lastBeat < 3) onBeat(o.beat, o.playing);
      lastBeat = o.beat.index;
    }
    const E = o.energy;

    // pointer
    const tx = PT.active ? PT.x / W * 2 - 1 : 0, ty = PT.active ? -(PT.y / H * 2 - 1) : 0;
    para.x = lerp(para.x, tx, 1 - Math.exp(-dt * 2.2)); para.y = lerp(para.y, ty, 1 - Math.exp(-dt * 2.2));

    // the camera on its path
    const bob = Math.sin(animTime * 0.9) * 0.08 + Math.sin(animTime * 1.7) * 0.03;
    const chaos = o.playing ? P.chaos : 0;
    const sh = o.playing ? pulse * (0.012 + chaos * 0.025) + chaos * 0.004 : 0;
    const cx = riverX(-d) + P.camLat + para.x * 0.5;
    let cy = P.camH + bob + para.y * 0.25;
    cy = Math.max(cy, TJ.terrainH(cx, -d) + 1.4);
    camera.position.set(cx + sh * (U.noise1(animTime * 25) - 0.5), cy + sh * (U.noise1(animTime * 25 + 7) - 0.5), -d);
    const ahead = d + 16;
    lookV.set(riverX(-ahead) + P.camLat * 0.75 + P.lookSide + para.x * 3.0, Math.max(P.camH - P.lookDown, TJ.terrainH(riverX(-ahead), -ahead) - 1.5) + para.y * 1.6 + bob * 0.3, -ahead);
    camera.lookAt(lookV);
    camera.fov = P.fov * (portrait() ? 1.3 : 1) * (1 - (o.playing ? pulse * 0.01 : 0));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // the sun, leaning a little toward the pointer
    const az = P.sunAz + para.x * 0.03, el = P.sunEl + para.y * 0.01;
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    shared.uSunDir.value.copy(sunDir); shared.uSunCol.value.copy(P.sunCol); shared.uAmbSky.value.copy(P.ambSky); shared.uAmbGround.value.copy(P.ambGround); shared.uHaze.value.copy(P.haze);
    shared.uSunInt.value = P.sunInt * (1 + E.voc * 0.08); shared.uAmbInt.value = P.ambInt; shared.uFogK.value = P.fogK * (0.7 + 0.6 * P.mist); shared.uFogH.value = P.fogH;

    // where the pointer touches the world (a plane ahead of the camera)
    ro.copy(camera.position);
    rd.set(tx, ty, 0.5).unproject(camera).sub(ro).normalize();
    const s = (-(d + 2.8) - ro.z) / (rd.z || -1e-6);
    pt.copy(ro).addScaledVector(rd, Math.max(0.5, s));
    ptOn = PT.active;
    const th = Math.tan((camera.fov * Math.PI) / 360);
    particles.pointer(ptOn, ro.x, ro.y, ro.z, rd.x, rd.y, rd.z, (PT.vx / W) * 2 * th * camera.aspect * 4, (-PT.vy / H) * 2 * th * 4);

    // the world
    crack.pulse = pulse;
    sky.update(P, sunDir, camera.position, animTime, E);
    terrain.update(P, camera.position, animTime, crack, ptOn ? pt : null);
    const ctx = { pulse, pt: ptOn ? pt : null, cam: [camera.position.x, camera.position.y, camera.position.z], camV: camera.position, glow: P.roseGlow, wind: P.wind, haze: P.haze, fog: P.fogK * 2, birdDark: P.sunInt > 0.4 ? "#1f3a3a" : "#0b0f18" };
    city.update(P, camera.position, animTime, ctx);
    // the fires answer the pointer: a hand moving past makes them lean and flare
    for (const f of city.fires) {
      tmp.set(f.x, f.y + 0.6, f.z);
      const dp = ptOn ? tmp.distanceTo(pt) : 9;
      const blow = ptOn && dp < 2.2 ? clamp(Math.hypot(PT.vx, PT.vy) / 1800) * (1 - dp / 2.2) : 0;
      f.lean = lerp(f.lean || 0, clamp((PT.vx / W) * 6, -1, 1) * blow * 1.5, 1 - Math.exp(-dt * 4)) * Math.exp(-dt * 0.5);
      f.blow = lerp(f.blow || 1, 1 + blow * 0.7, 1 - Math.exp(-dt * 5));
    }
    plant(d, P);
    if (!crackRose && t > 81.2) { crackRose = roses.add({ x: crack.x, y: crack.y + 0.42, z: crack.z, scale: 0.55, bloom: 0.02, target: 1, speed: 0.22, rx: -0.4, ry: 2.6, root: [crack.x, crack.y - 0.05, crack.z] }); }
    if (crackRose && !roses.roses.includes(crackRose)) crackRose = null;
    if (t < 81) crackRose = null;
    roses.setTarget(P.roseBloom);
    if (crackRose) crackRose.target = 1;
    roses.update(dt, animTime, ctx);
    // the game, in the camera's frame
    fwdV.subVectors(lookV, camera.position);
    gameEvent = game.update(dt, camera.position, fwdV, P, o.playing, pulse, animTime, { chaos: P.chaos, beat: o.beat.index, songT: t, loop: loops, pointer: { x: tx, y: ty, active: PT.active, fine: PT.fine }, torch: [torch.x, torch.y], torchR: 0.26 + 0.05 * Math.sin(animTime * 2.1) + E.voc * 0.08, aspect: camera.aspect });
    if (gameEvent.fell) {                                                   // the orb goes under: the river takes it, rings spread, drops fly
      flash = Math.max(flash, 0.35);
      const sp = gameEvent.splash || game.orbPos;
      water.ripple(sp.x, sp.z, animTime, 1.3);
      particles.burst(T.mote, 14, { x: sp.x, y: sp.y + 0.05, z: sp.z, r: 0.2, speed: 1.2, up: 1.8 });
      particles.burst(T.bubble, 6, { x: sp.x, y: sp.y + 0.1, z: sp.z, r: 0.25, speed: 0.5, up: 0.6 });
    }
    else if (gameEvent.landed) { const op = game.orbPos; particles.burst(T.mote, 3, { x: op.x, y: op.y - 0.15, z: op.z, r: 0.25, speed: 0.6, up: 0.3 }); }
    if (gameEvent.double) { const op = game.orbPos; particles.burst(T.spark, 7, { x: op.x, y: op.y, z: op.z, r: 0.12, speed: 1.8, up: 0.6 }); particles.burst(T.ember, 5, { x: op.x, y: op.y - 0.1, z: op.z, r: 0.15, speed: 0.6, up: 0.9 }); flash = Math.max(flash, 0.25); }
    if (gameEvent.wingsLost) { const op = game.orbPos; particles.burst(T.ash, 12, { x: op.x, y: op.y + 0.1, z: op.z, r: 0.3, speed: 0.5, up: -0.2 }); particles.burst(T.mote, 8, { x: op.x, y: op.y, z: op.z, r: 0.3, speed: 0.7, up: 0.1 }); }
    if (gameEvent.launch) { const op = game.orbPos; particles.burst(T.spark, 12, { x: op.x, y: op.y - 0.1, z: op.z, r: 0.2, speed: 1.6, up: 0.4 }); flash = Math.max(flash, 0.35); }
    if (gameEvent.burn) { const op = game.orbPos; particles.burst(T.ember, 16, { x: op.x, y: op.y, z: op.z, r: 0.25, speed: 1.2, up: 1.4 }); particles.burst(T.smoke, 3, { x: op.x, y: op.y, z: op.z, r: 0.1, speed: 0.2, up: 0.5 }); flash = Math.max(flash, 0.4); }
    // birds, as the journey asks
    let bm = J.BIRDS[0];
    for (const b of J.BIRDS) if (b[0] <= t) bm = b;
    const key = bm[0] + bm[1];
    if (key !== birdMode) { birdMode = key; birds.set(bm[1], ctx.cam, { ...(bm[2] || {}), force: true }); }
    birds.update(dt, animTime, ctx);
    // embers from the fires
    if (P.fire > 0.02 && !HR.reducedMotion) for (let i = 0; i < Math.round(P.fire * 2); i++) if (Math.random() < 0.4) emit("ember", P);
    // steady emission, louder when the song is
    const rateMul = (HR.reducedMotion ? 0.3 : 1) * (frameCost > 24 ? 0.5 : 1) * (0.55 + E.rms * 0.8);
    spawnAcc += dt * P.rate * rateMul;
    while (spawnAcc > 1) { spawnAcc -= 1; const k = pickType(P); if (k) emit(k, P); }
    particles.update(dt, animTime, { pulse, haze: P.haze, fog: P.fogK * 2, wind: P.wind });

    // the reflection: the world seen from under the water
    if (debug.refl) {
      reflCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
      upV.set(0, 1, 0).applyQuaternion(camera.quaternion); upV.y = -upV.y;
      reflCam.up.copy(upV);
      reflCam.lookAt(lookV.x, -lookV.y, lookV.z);
      reflCam.projectionMatrix.copy(camera.projectionMatrix);
      reflCam.updateMatrixWorld();
      texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
      shared.uClip.value = 1;
      water.mesh.visible = false; particles.matter.mesh.visible = false; particles.light.mesh.visible = false;
      renderer.setRenderTarget(reflRT);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, false);
      renderer.render(scene, reflCam);
      shared.uClip.value = 0;
      water.mesh.visible = true; particles.matter.mesh.visible = particles.matter.n > 0; particles.light.mesh.visible = particles.light.n > 0;
    }
    water.update(P, camera.position, animTime, texMat, E, pulse);

    // post
    const tuv = ptOn ? { x: PT.x / W, y: 1 - PT.y / H } : null;
    if (tuv) { torch.x = lerp(torch.x, tuv.x, 1 - Math.exp(-dt * 10)); torch.y = lerp(torch.y, tuv.y, 1 - Math.exp(-dt * 10)); }
    else { torch.x = lerp(torch.x, 0.5 + 0.32 * Math.sin(animTime * 0.33), 1 - Math.exp(-dt * 1.5)); torch.y = lerp(torch.y, 0.5 + 0.22 * Math.sin(animTime * 0.21 + 1), 1 - Math.exp(-dt * 1.5)); }
    for (let i = 0; i < 3; i++) {
      const ph = i * 2.1;
      let x = 0.5 + 0.42 * Math.sin(animTime * 0.045 + ph) * Math.cos(animTime * 0.031 + ph * 1.3);
      let y = 0.45 + 0.38 * Math.sin(animTime * 0.038 + ph * 0.7);
      if (i === 0 && ptOn) { leakLean.x = lerp(leakLean.x, PT.x / W, 0.02); leakLean.y = lerp(leakLean.y, 1 - PT.y / H, 0.02); x = lerp(x, leakLean.x, 0.55); y = lerp(y, leakLean.y, 0.55); }
      leakPos[i * 2] = x; leakPos[i * 2 + 1] = y;
    }
    if (ptOn && Math.hypot(PT.x - lastPt.x, PT.y - lastPt.y) > 2) {
      const sp = clamp(PT.speed / 1400);
      post.addStroke(PT.x / W * 2 - 1, -(PT.y / H * 2 - 1), 0.1 + sp * 0.12, 0.03 + sp * 0.1);
      lastPt = { x: PT.x, y: PT.y };
    }
    // where the sun is on screen, for the light shafts
    sunP.copy(camera.position).addScaledVector(sunDir, 300).project(camera);
    const sunUv = sunP.z < 1 && Math.abs(sunP.x) < 1.6 && Math.abs(sunP.y) < 1.6 ? [sunP.x * 0.5 + 0.5, sunP.y * 0.5 + 0.5] : null;
    const leak = [tmpLeak(0, P), tmpLeak(1, P), tmpLeak(2, P)];
    const pp = {
      paint: P.sunCol, bloom: P.bloom + E.low * 0.1, shafts: P.shafts * (0.8 + 0.4 * E.voc), grain: P.grain + pulse * 0.025 + E.high * 0.02 + chaos * 0.03, time: animTime, pulse, flash, chroma: flash * 0.6 + pulse * 0.2 + chaos * (0.12 + pulse * 0.4),
      glitch: chaos * (0.12 + pulse * 0.3) + glitchKick * 0.6, vignette: P.vignette, poster: P.poster, halftone: P.halftone, hide: P.hide, warm: P.warm, sat: P.sat, exposure: P.exposure * (1 + flash * 0.08) * (1 - chaos * 0.1 * (U.hash(Math.floor(animTime * 12)) > 0.9 ? 1 : 0)), floor: 0.45,
      leak, leakPos, leakGain: P.leakGain * (0.7 + E.low * 0.5 + pulse * 0.3), leakR: 0.55, sunCol: P.sunCol, sunUv,
      torch: [torch.x, torch.y], torchR: 0.26 + 0.05 * Math.sin(animTime * 2.1) + E.voc * 0.08,
    };
    post.render(() => { if (debug.scene) renderer.render(scene, camera); }, dt, pp);

    const cost = performance.now() - t0;
    frameCost = lerp(frameCost, cost, 0.05);
    costAt += dt;
    if (costAt > 2.5) {
      costAt = 0;
      if (frameCost > 16 && scale > 0.45) { scale = Math.max(0.45, scale - 0.1); resize(); }
      else if (frameCost < 7 && scale < (lite ? 0.8 : 1)) { scale = Math.min(lite ? 0.8 : 1, scale + 0.05); resize(); }
    }
  }
  const leakCols = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  function tmpLeak(i, p) { const c = leakCols[i]; if (i === 0) c.copy(p.sunCol); else if (i === 1) c.copy(p.skyHor); else c.copy(p.ambSky); return c; }

  function onBeat(b, playing) {
    if (!P || HR.reducedMotion) return;
    if (b.inBar === 0) {
      flash = playing ? 0.7 + P.chaos * 0.3 : 0.3;
      for (let i = 0; i < (playing ? 5 : 2); i++) { const k = pickType(P); if (k) emit(k, P); }
      if (P.fire > 0.2) for (let i = 0; i < 7; i++) emit("spark", P);
      if (P.spray > 0) for (let i = 0; i < 10; i++) emit("spray", P);
      if (P.streak > 0) for (let i = 0; i < 4; i++) emit("streak", P);
      if (P.t > 60.4 && P.t < 64) birds.cue("launch");
    } else if (b.inBar === 2) {
      flash = Math.max(flash, playing ? 0.3 : 0.12);
      for (let i = 0; i < (playing ? 2 : 1); i++) { const k = pickType(P); if (k) emit(k, P); }
      if (P.fire > 0.2) for (let i = 0; i < 3; i++) emit("spark", P);
    }
  }

  // ---------- the viewer's hand ----------
  // march the pointer's ray until it meets the ground or the water
  function hit(x, y, out) {
    const nx = x / W * 2 - 1, ny = -(y / H * 2 - 1);
    tmp.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    let s = 0.5, onWater = false;
    for (let i = 0; i < 90; i++) {
      out.copy(camera.position).addScaledVector(tmp, s);
      const g = TJ.terrainH(out.x, out.z);
      if (out.y <= Math.max(g, 0)) { onWater = g < 0 && out.y <= 0.05; break; }
      s += 0.25 + s * 0.08;
      if (s > 90) { out.copy(camera.position).addScaledVector(tmp, 6); break; }
    }
    return onWater;
  }
  const wp = new THREE.Vector3();
  function bloomAt(x, y) {
    const onWater = hit(x, y, wp);
    const near = roses.nearest(wp, 1.2);
    if (near) { near.target = 1; near.speed = 3; near.born = 0; near.pop = 1; }
    else { const s = R(0.3, 0.45); roses.add({ x: wp.x, y: Math.max(wp.y, 0) + 0.3 + s * 0.5, z: wp.z, scale: s, bloom: 0.05, target: 1, speed: 2.4, rx: R(-0.6, -0.1), pop: 1, root: onWater ? null : [wp.x, wp.y - 0.05, wp.z] }); }
    if (onWater) water.ripple(wp.x, wp.z, animTime, 1.0);
    particles.burst(T.petal, 4, { x: wp.x, y: wp.y + 0.4, z: wp.z, r: 0.3, speed: 0.9, up: 0.9 });
    particles.burst(T.mote, 4, { x: wp.x, y: wp.y + 0.3, z: wp.z, r: 0.4, speed: 0.4, up: 0.3 });
    post.addStroke(x / W * 2 - 1, -(y / H * 2 - 1), 0.3, 0.35);
    flash = Math.max(flash, 0.5);
  }
  function stir(x, y, vx, vy) {
    if (!P) return;
    const onWater = hit(x, y, wp);
    const sp = clamp(Math.hypot(vx, vy) / 1600);
    post.addStroke(x / W * 2 - 1, -(y / H * 2 - 1), 0.12 + sp * 0.1, 0.06 + sp * 0.15);
    if (onWater && animTime - lastStroke > 0.12) { water.ripple(wp.x, wp.z, animTime, 0.35 + sp * 0.5); lastStroke = animTime; }
    if (Math.random() < 0.3 + sp) {
      const kind = P.bubble > 0 ? T.bubble : P.fire > 0.2 ? T.ember : P.ash > 0 ? T.ash : P.petal > 0.05 ? T.petal : T.mote;
      particles.spawn(kind, { x: wp.x, y: wp.y + 0.3, z: wp.z, vx: vx / W * 3, vy: -vy / H * 3 + 0.3, dz: 3 });
    }
  }
  function burst(type, rect, n, opt = {}) {
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const nx = x / W * 2 - 1, ny = -(y / H * 2 - 1);
    tmp.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    wp.copy(camera.position).addScaledVector(tmp, 3);
    const rr = Math.max(rect.width, 20) / W * 3;
    particles.burst(T[type] ?? T.petal, n, { x: wp.x, y: wp.y, z: wp.z, r: rr * 0.5, speed: 0.6 * (opt.spread ?? 1), up: 0.5 });
  }
  function seek() { lastT = -99; }

  resize();
  return { update, resize, bloomAt, stir, burst, seek, renderer, camera, debug, post, game, get gameEvent() { return gameEvent; }, setScale(s) { scale = s; resize(); }, J, sys: { sky, terrain, water, city, roses, birds, particles, shared, reflRT, scene }, get info() { return P ? `${P.t.toFixed(1)}s · ${J.dAt(P.t).toFixed(0)} m` : ""; }, get scale() { return scale; }, get cost() { return frameCost; }, get particles() { return particles.count(); }, get roses() { return roses.roses.length; }, get hdr() { return hdr; } };
}
