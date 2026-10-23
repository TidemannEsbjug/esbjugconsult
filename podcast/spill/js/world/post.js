/* Post: HDR scene (half float, multisampled) → bloom (quarter size, blurred twice) · light shafts from the sun
   (a sun mask, blurred radially toward it) · a ghost of the last frame before a seek · the hidden world and the torch
   · light leaks · the pointer's colour · exposure and ACES · grade · a breath of gouache · grain and paper · vignette. */
import * as THREE from "../vendor/three.min.js";
import { COMMON, FS_VERT } from "./glsl.js";

const BRIGHT = /* glsl */ `
precision highp float; varying vec2 vUv; uniform sampler2D tScene; uniform float uThr;
void main() {
  vec2 uv = vUv * 0.5 + 0.5;
  vec3 c = texture2D(tScene, uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float k = smoothstep(uThr, uThr + 0.6, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;
const BLUR = /* glsl */ `
precision highp float; varying vec2 vUv; uniform sampler2D tIn; uniform vec2 uDir;
void main() {
  vec2 uv = vUv * 0.5 + 0.5;
  vec3 c = texture2D(tIn, uv).rgb * 0.227027;
  vec2 o1 = uDir * 1.3846153846, o2 = uDir * 3.2307692308;
  c += (texture2D(tIn, uv + o1).rgb + texture2D(tIn, uv - o1).rgb) * 0.3162162162;
  c += (texture2D(tIn, uv + o2).rgb + texture2D(tIn, uv - o2).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;
const SUNMASK = /* glsl */ `
precision highp float; varying vec2 vUv; uniform sampler2D tScene; uniform vec2 uSun; uniform float uAspect;
void main() {
  vec2 uv = vUv * 0.5 + 0.5;
  vec3 c = texture2D(tScene, uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float near = smoothstep(0.55, 0.0, length((uv - uSun) * vec2(uAspect, 1.0)));
  gl_FragColor = vec4(c * smoothstep(0.7, 1.4, l) * near, 1.0);
}`;
const RADIAL = /* glsl */ `
precision highp float; varying vec2 vUv; uniform sampler2D tIn; uniform vec2 uSun; uniform float uDensity;
void main() {
  vec2 uv = vUv * 0.5 + 0.5;
  vec2 step = (uSun - uv) * uDensity / 16.0;
  vec3 c = vec3(0.0); float w = 1.0, tw = 0.0;
  for (int i = 0; i < 16; i++) { c += texture2D(tIn, uv).rgb * w; tw += w; uv += step; w *= 0.92; }
  gl_FragColor = vec4(c / tw, 1.0);
}`;
const FADE = /* glsl */ `precision highp float; uniform float uDecay; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, uDecay); }`;
const STROKE = /* glsl */ `
precision highp float; varying vec2 vUv; uniform vec4 uDots[8]; uniform vec3 uCol; uniform float uAspect; uniform int uN;
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float a = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uN) break;
    vec2 q = vec2(uDots[i].x * uAspect, uDots[i].y);
    float d = length(p - q) / uDots[i].z;
    a += uDots[i].w * sat(1.0 - d) * sat(1.0 - d);
  }
  gl_FragColor = vec4(uCol * sat(a), sat(a));
}`;

const COMP = /* glsl */ `
precision highp float;
varying vec2 vUv;
${COMMON}
uniform sampler2D tScene, tBloom, tShaft, tGhost, tPaint;
uniform float uGhost, uBloom, uShafts, uGrain, uTime, uPulse, uFlash, uChroma, uVignette, uPoster, uHalftone, uHide, uAspect, uDpr, uWarm, uSat, uExposure, uFloor, uGlitch;
uniform vec3 uLeakA, uLeakB, uLeakC, uSunCol;
uniform vec2 uLeakPA, uLeakPB, uLeakPC;
uniform float uLeakGain, uLeakR;
uniform vec2 uTorch; uniform float uTorchR;
vec3 screen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }
void main() {
  vec2 uv = vUv * 0.5 + 0.5;
  vec2 c = vUv;
  // the city tears the picture: rows slide, the channels come apart
  if (uGlitch > 0.001) {
    float row = floor(uv.y * 28.0);
    float tick = floor(uTime * 11.0);
    float g = hash1(row * 1.7 + tick * 3.3);
    float tear = step(1.0 - uGlitch * 0.3, g) * (hash1(row * 7.1 + tick) - 0.5) * 0.08 * uGlitch;
    uv.x += tear;
    float band = step(1.0 - uGlitch * 0.12, hash1(tick * 5.7)) * uGlitch;
    uv.x += band * (hash1(tick) - 0.5) * 0.03;
  }
  vec2 off = c * (0.0004 + uChroma * 0.0025) + vec2(uGlitch * 0.0012, 0.0);
  vec3 col;
  col.r = texture2D(tScene, uv + off).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - off).b;
  if (uGhost > 0.001) col = mix(col, texture2D(tGhost, uv).rgb, uGhost);
  vec3 bloom = texture2D(tBloom, uv).rgb;
  col += bloom * uBloom;
  col += texture2D(tShaft, uv).rgb * uShafts * 0.8;
  if (uHide > 0.001) {
    vec2 tp = (uv - uTorch) * vec2(uAspect, 1.0);
    float tm = exp(-pow(length(tp) / uTorchR, 2.0) * 1.6);
    float keep = 0.04 + 0.96 * tm;
    col = mix(col, col * keep + bloom * uBloom * 0.5 * (1.0 - tm), uHide);
    col += uHide * tm * vec3(0.09, 0.06, 0.04);
  }
  // exposure and the film curve
  col = aces(col * uExposure);
  // light leaks, screened over the print
  vec2 p = vec2(uv.x * uAspect, uv.y);
  float la = exp(-length(p - vec2(uLeakPA.x * uAspect, uLeakPA.y)) / uLeakR);
  float lb = exp(-length(p - vec2(uLeakPB.x * uAspect, uLeakPB.y)) / uLeakR);
  float lc = exp(-length(p - vec2(uLeakPC.x * uAspect, uLeakPC.y)) / uLeakR);
  col = screen(col, (uLeakA * la + uLeakB * lb + uLeakC * lc) * uLeakGain);
  // the pointer's colour, like a wash on wet paper
  vec4 paint = texture2D(tPaint, uv);
  if (paint.a > 0.002) {
    float l = lum(col);
    vec3 tinted = paint.rgb / max(lum(paint.rgb), 1e-3) * l;
    col = mix(col, mix(col, tinted, 0.6), sat(paint.a));
  }
  // grade
  float l = lum(col);
  col = mix(vec3(l), col, uSat);
  col = mix(col, col * vec3(1.05, 0.985, 0.92), uWarm);
  col = mix(col, col * vec3(0.94, 0.99, 1.06), -min(uWarm, 0.0));
  // a breath of gouache
  vec3 q = (floor(col * 10.0) + 0.5) / 10.0;
  col = mix(col, q, uPoster);
  vec2 g = fract(gl_FragCoord.xy / (4.2 * uDpr) + vec2(0.5)) - 0.5;
  float ht = smoothstep(0.55, 0.95, length(g) * 2.0) * (1.0 - smoothstep(0.06, 0.4, lum(col))) * uHalftone;
  col *= 1.0 - ht * 0.2;
  // grain and paper
  float n = hash2(floor(gl_FragCoord.xy / (1.0 + 0.6 * (uDpr - 1.0))) + vec2(fract(uTime * 7.0) * 100.0, fract(uTime * 3.0) * 100.0));
  float n2 = hash2(floor(gl_FragCoord.xy / (2.0 * uDpr)) + vec2(fract(uTime * 5.0) * 71.0));
  col += ((n - 0.5) * 0.7 + (n2 - 0.5) * 0.3) * uGrain * (1.2 - lum(col));
  float paper = vnoise(gl_FragCoord.xy * 0.09 / uDpr) * 0.5 + vnoise(gl_FragCoord.xy * 0.023 / uDpr) * 0.5;
  col *= 0.97 + 0.06 * paper;
  col += uFlash * vec3(1.0, 0.9, 0.8) * 0.1;
  float v = smoothstep(0.5, 1.6, length(c * vec2(1.0, 1.12)));
  col *= 1.0 - uVignette * v;
  col *= 1.0 - uFloor * smoothstep(0.55, 1.0, -c.y) * 0.45;
  gl_FragColor = vec4(col, 1.0);
}`;

export function makePost(renderer, opts) {
  const fsScene = new THREE.Scene();
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  fsScene.add(quad);
  const run = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };

  const hdr = opts.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const rt = (w, h, depth, type, samples) => new THREE.WebGLRenderTarget(w, h, { depthBuffer: depth, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: type || THREE.UnsignedByteType, samples: samples || 0 });
  const sceneA = rt(2, 2, true, hdr, opts.samples), sceneB = rt(2, 2, true, hdr, opts.samples);
  const bloomA = rt(2, 2, false, hdr), bloomB = rt(2, 2, false, hdr), shaftA = rt(2, 2, false, hdr), shaftB = rt(2, 2, false, hdr), paint = rt(2, 2, false);
  let cur = sceneA, ghost = sceneB, ghostAlpha = 0, ghostLen = 0.5;

  const M = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ uniforms, vertexShader: FS_VERT, fragmentShader: frag, depthTest: false, depthWrite: false, ...extra });
  const bright = M(BRIGHT, { tScene: { value: null }, uThr: { value: 0.95 } });
  const blur = M(BLUR, { tIn: { value: null }, uDir: { value: new THREE.Vector2() } });
  const sunmask = M(SUNMASK, { tScene: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 } });
  const radial = M(RADIAL, { tIn: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uDensity: { value: 0.5 } });
  const fade = M(FADE, { uDecay: { value: 0.02 } }, { transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  const stroke = M(COMMON + STROKE, { uDots: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uCol: { value: new THREE.Color("#e5484d") }, uAspect: { value: 1 }, uN: { value: 0 } }, { transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  const comp = M(COMP, {
    tScene: { value: null }, tBloom: { value: null }, tShaft: { value: null }, tGhost: { value: null }, tPaint: { value: null },
    uGhost: { value: 0 }, uBloom: { value: 0.5 }, uShafts: { value: 0.5 }, uGrain: { value: 0.07 }, uTime: { value: 0 }, uPulse: { value: 0 }, uFlash: { value: 0 }, uChroma: { value: 0 },
    uVignette: { value: 0.5 }, uPoster: { value: 0.08 }, uHalftone: { value: 0.12 }, uHide: { value: 0 }, uAspect: { value: 1 }, uDpr: { value: 1 },
    uWarm: { value: 0 }, uSat: { value: 1 }, uExposure: { value: 1 }, uFloor: { value: 0.5 }, uGlitch: { value: 0 },
    uLeakA: { value: new THREE.Color() }, uLeakB: { value: new THREE.Color() }, uLeakC: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uLeakPA: { value: new THREE.Vector2(0.5, 0.5) }, uLeakPB: { value: new THREE.Vector2(0.5, 0.5) }, uLeakPC: { value: new THREE.Vector2(0.5, 0.5) },
    uLeakGain: { value: 0.1 }, uLeakR: { value: 0.5 }, uTorch: { value: new THREE.Vector2(0.5, 0.5) }, uTorchR: { value: 0.3 },
  });

  let W = 2, H = 2, scale = 1, dpr = 1;
  function resize(w, h, s, d) {
    W = w; H = h; scale = s; dpr = d;
    const sw = Math.max(2, Math.round(w * s)), sh = Math.max(2, Math.round(h * s));
    sceneA.setSize(sw, sh); sceneB.setSize(sw, sh);
    const bw = Math.max(2, Math.round(sw / 4)), bh = Math.max(2, Math.round(sh / 4));
    bloomA.setSize(bw, bh); bloomB.setSize(bw, bh); shaftA.setSize(bw, bh); shaftB.setSize(bw, bh);
    paint.setSize(Math.max(2, Math.round(w / 6)), Math.max(2, Math.round(h / 6)));
    comp.uniforms.uAspect.value = w / h; comp.uniforms.uDpr.value = d;
    stroke.uniforms.uAspect.value = w / h; sunmask.uniforms.uAspect.value = w / h;
    ghostAlpha = 0;
  }
  function cut(len = 0.5) { const t = cur; cur = ghost; ghost = t; ghostAlpha = 1; ghostLen = len; }
  const strokes = [];
  function addStroke(x, y, r, a) { if (strokes.length < 8) strokes.push([x, y, r, a]); }

  function render(drawScene, dt, p) {
    renderer.setRenderTarget(cur);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, true);
    drawScene();
    // bloom
    bright.uniforms.tScene.value = cur.texture;
    run(bright, bloomA);
    for (let i = 0; i < 2; i++) {
      blur.uniforms.tIn.value = bloomA.texture; blur.uniforms.uDir.value.set((1.5 + i) / bloomA.width, 0); run(blur, bloomB);
      blur.uniforms.tIn.value = bloomB.texture; blur.uniforms.uDir.value.set(0, (1.5 + i) / bloomA.height); run(blur, bloomA);
    }
    // light shafts
    if (p.shafts > 0.001 && p.sunUv) {
      sunmask.uniforms.tScene.value = cur.texture; sunmask.uniforms.uSun.value.set(p.sunUv[0], p.sunUv[1]);
      run(sunmask, shaftA);
      radial.uniforms.uSun.value.set(p.sunUv[0], p.sunUv[1]);
      radial.uniforms.tIn.value = shaftA.texture; radial.uniforms.uDensity.value = 0.45; run(radial, shaftB);
      radial.uniforms.tIn.value = shaftB.texture; radial.uniforms.uDensity.value = 0.85; run(radial, shaftA);
    }
    // paint
    fade.uniforms.uDecay.value = Math.min(0.25, Math.max(0.004, dt * 0.5));
    run(fade, paint);
    if (strokes.length) {
      const d = stroke.uniforms.uDots.value;
      strokes.forEach((s, i) => d[i].set(s[0], s[1], s[2], s[3]));
      stroke.uniforms.uN.value = strokes.length;
      stroke.uniforms.uCol.value.set(p.paint);
      run(stroke, paint);
      strokes.length = 0;
    }
    // composite
    ghostAlpha = Math.max(0, ghostAlpha - dt / ghostLen);
    const u = comp.uniforms;
    u.tScene.value = cur.texture; u.tBloom.value = bloomA.texture; u.tShaft.value = shaftA.texture; u.tGhost.value = ghost.texture; u.tPaint.value = paint.texture;
    u.uGhost.value = ghostAlpha * ghostAlpha;
    u.uBloom.value = p.bloom; u.uShafts.value = p.sunUv ? p.shafts : 0; u.uGrain.value = p.grain; u.uTime.value = p.time; u.uPulse.value = p.pulse; u.uFlash.value = p.flash; u.uChroma.value = p.chroma;
    u.uVignette.value = p.vignette; u.uPoster.value = p.poster; u.uHalftone.value = p.halftone; u.uHide.value = p.hide;
    u.uWarm.value = p.warm; u.uSat.value = p.sat; u.uExposure.value = p.exposure; u.uFloor.value = p.floor; u.uGlitch.value = p.glitch || 0;
    u.uLeakA.value.copy(p.leak[0]); u.uLeakB.value.copy(p.leak[1]); u.uLeakC.value.copy(p.leak[2]); u.uSunCol.value.copy(p.sunCol);
    u.uLeakPA.value.set(p.leakPos[0], p.leakPos[1]); u.uLeakPB.value.set(p.leakPos[2], p.leakPos[3]); u.uLeakPC.value.set(p.leakPos[4], p.leakPos[5]);
    u.uLeakGain.value = p.leakGain; u.uLeakR.value = p.leakR;
    u.uTorch.value.set(p.torch[0], p.torch[1]); u.uTorchR.value = p.torchR;
    run(comp, null);
  }
  return { resize, cut, render, addStroke, get scale() { return scale; } };
}
