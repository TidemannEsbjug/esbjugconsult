/* The journey: one continuous ride down the river valley, 88 seconds long.
   Where you are is a function of time (a speed profile integrated into distance); what the valley is like where you
   are is a function of distance (zones: nature, the city, the canal, the meadow, the delta, the mountains); what the
   light, the air and the water are like is a function of time (sparse keyframes, eased between).
   The world flips hard between two states, on the song's own section downbeats: the beautiful landscape and the
   chaotic city. Zone edges are sharp lines across the valley; the light snaps within a fraction of a second. */
import * as THREE from "../vendor/three.min.js";

const ss = (x) => x * x * (3 - 2 * x);

export const BASE = {
  sunAz: 0.05, sunEl: 0.08, sunSize: 0.045, sunCol: "#ff8a5c", sunInt: 1.0, sunGlow: 0.6,
  skyTop: "#6f9fcf", skyHor: "#ffd2b8", clouds: 0.4, stars: 0, haze: "#e8cfc0", fogK: 0.0065, fogH: 0.06, mist: 0.5,
  ambSky: "#bfe0ee", ambGround: "#6a7a5a", ambInt: 0.75,
  grassA: "#5f9a5c", grassB: "#9ec86a", rock: "#6f6a66", sand: "#c9b48c", concreteA: "#9ea4ab", concreteB: "#7d848c",
  waterDeep: "#1f6f72", waterShallow: "#5fb8aa", waterSpec: 1.0, waveAmp: 1.0,
  windowsLit: 0.1, windowCol: "#b9ecd6", windowWarm: "#ffd9a0", windowMix: 0.3,
  camH: 3.0, camLat: -3.2, lookDown: 0.6, lookSide: 0, fov: 55,
  petal: 0.6, ember: 0, ash: 0, mote: 0.3, dust: 0, bokeh: 0, spark: 0, smoke: 0, bubble: 0, leaf: 0, rain: 0, streak: 0, spray: 0, rate: 2.5, wind: 0.3, flower: 0, grass: 0.4,
  roseBloom: 1, roseGlow: 0, roseDensity: 1,
  fire: 0, traffic: 0, crack: 0, bars: 0, chaos: 0, gameCol: "#e5484d", gameCol2: "#ffd2b8",
  bloom: 0.5, grain: 0.07, vignette: 0.5, hide: 0, warm: 0, sat: 1, exposure: 1.0, shafts: 0.5, leakGain: 0.08, poster: 0.08, halftone: 0.12, flicker: 0,
};

// the two states
const NATURE = { gameCol: "#e5484d", gameCol2: "#ffd2b8", skyTop: "#6f9fcf", skyHor: "#ffd2b8", sunCol: "#ff8a5c", sunInt: 1.0, sunGlow: 0.7, sunEl: 0.08, haze: "#e8cfc0", ambSky: "#bfe0ee", ambGround: "#6a7a5a", ambInt: 0.75, concreteA: "#9ea4ab", concreteB: "#7d848c", camLat: -3.2, waterDeep: "#1f6f72", waterShallow: "#5fb8aa", sat: 1, warm: 0.15, windowsLit: 0.1, windowMix: 0.3, dust: 0, rain: 0, petal: 0.6, mote: 0.3, rate: 2.5, shafts: 0.7, mist: 0.5, stars: 0, chaos: 0, flicker: 0, grain: 0.07, vignette: 0.5, exposure: 1.0, bloom: 0.5, waterSpec: 1.0, clouds: 0.4, camH: 3.0, lookDown: 0.6, fov: 55 };
const CITY = { gameCol: "#b9ecd6", gameCol2: "#e2e9ef", skyTop: "#8794a4", skyHor: "#cfd6dd", sunCol: "#eef2f5", sunInt: 0.8, sunGlow: 0.1, sunEl: 0.2, haze: "#b8c2cc", ambSky: "#cdd6de", ambGround: "#6a727c", ambInt: 1.1, concreteA: "#5e666e", concreteB: "#3e454c", camLat: -2.2, waterDeep: "#3a4f5c", waterShallow: "#64798a", sat: 0.62, warm: -0.15, windowsLit: 0.2, windowMix: 0.3, petal: 0, dust: 0.8, mote: 0.05, rate: 2.5, shafts: 0.15, mist: 0.35, stars: 0, chaos: 1, flicker: 0.6, grain: 0.11, vignette: 0.55, exposure: 1.0, bloom: 0.45, waterSpec: 0.5, clouds: 0.2, camH: 3.0, lookDown: 0.6, fov: 55 };
const NIGHT = { gameCol: "#8ea4ff", gameCol2: "#b9ecd6", concreteA: "#4a5260", concreteB: "#2e3540", skyTop: "#1e2a60", skyHor: "#5a6aa8", sunEl: -0.06, sunInt: 0.4, sunGlow: 0.3, sunCol: "#8ea4ff", stars: 0.6, haze: "#3a4670", ambSky: "#7a8ac4", ambGround: "#323a50", ambInt: 1.35, waterDeep: "#17284a", waterShallow: "#2f4f78", windowsLit: 0.85, windowMix: 0.3, ember: 0, mote: 0.2, dust: 0.3, rate: 1.5, sat: 0.9, bars: 1, flicker: 0.5, bloom: 0.7, petal: 0, shafts: 0, warm: -0.1, mist: 0.4, exposure: 1.3, vignette: 0.3, camH: 3.4, camLat: -3.2, chaos: 0.9, grain: 0.1, waterSpec: 0.6 };

// ---------- keyframes in song time ----------
// a key means "by this time, the world is like this": a value holds, then eases into the key over `_blend` seconds
// (3 by default; "full" eases across the whole gap from the previous key). The state switches use 0.35: one beat.
export const KEYS = [
  [0, { sunEl: -0.02, sunInt: 0.6, sunGlow: 1.0, stars: 0.5, skyTop: "#3a3f6e", skyHor: "#c98a86", haze: "#9c8aa0", ambSky: "#8a92c4", ambGround: "#3a4648", ambInt: 0.75, mist: 0.7, camH: 3.2, windowsLit: 0, waterDeep: "#173a44", waterShallow: "#3a6a70", petal: 0.6, rate: 2.5, shafts: 0.8 }],
  [4.6, { _blend: "full", ...NATURE, sunEl: 0.07, stars: 0, mist: 0.5, camH: 3.0 }],
  [15.0, { ...NATURE }],
  // the city, hard, on the downbeat of "Practical illusion"
  [15.508, { _blend: 0.35, ...CITY }],
  [22.4, { ...CITY }],
  // a breath of park inside the city, and back
  [22.706, { _blend: 0.35, ...NATURE, mist: 0.9, sunGlow: 0.8, sunAz: 0.5, sunCol: "#ffb080", sunInt: 0.9, skyHor: "#e0d2c8", haze: "#d8d0c8", mote: 1.0, rate: 3.5, shafts: 1.3, petal: 0.2, sat: 0.9, warm: 0.1 }],
  [25.2, { mist: 0.9, sunGlow: 0.8, sunAz: 0.5, sunCol: "#ffb080", sunInt: 0.9, skyHor: "#e0d2c8", haze: "#d8d0c8", mote: 1.0, rate: 3.5, shafts: 1.3, petal: 0.2, sat: 0.9, warm: 0.1 }],
  [25.408, { _blend: 0.35, ...CITY, sunAz: 0.05 }],
  [28.8, { ...CITY }],
  // the memory: the meadow, golden, on the downbeat of "You used to smile"
  [29.02, { _blend: 0.4, ...NATURE, gameCol: "#ff9a5c", gameCol2: "#ffe0a0", skyTop: "#7fb0d0", skyHor: "#ffd9a0", sunCol: "#ffb070", sunInt: 1.3, sunGlow: 0.9, sunEl: 0.09, haze: "#ffe0c0", ambSky: "#ffd9b8", ambGround: "#5a6a3a", ambInt: 0.6, grassA: "#6aa85a", grassB: "#b8d870", waterDeep: "#2a8a80", waterShallow: "#7fd0b8", sat: 1.05, warm: 0.4, petal: 0.3, mote: 1.2, rate: 4, flower: 1, roseDensity: 1.4, shafts: 1.0, exposure: 1.05, mist: 0.4 }],
  [32.0, { skyTop: "#7fb0d0", skyHor: "#ffd9a0", sunCol: "#ffb070", sunEl: 0.09, sunSize: 0.045 }],
  [33.2, { _blend: 1.2, gameCol: "#ff7a30", gameCol2: "#ffb070", skyTop: "#3a2a5e", skyHor: "#ff9440", sunCol: "#ff7a30", sunEl: 0.035, sunSize: 0.075, sunInt: 1.25, sunGlow: 1.3, haze: "#9a5a6a", ambSky: "#a86a7a", ambGround: "#3a2a30", ember: 1.0, mote: 0.3, rate: 3, bloom: 0.7, warm: 0.3, flower: 0.3, waterDeep: "#2a2a4a", waterShallow: "#7a5a60", shafts: 1.4 }],
  [34.9, { skyTop: "#3a2a5e", skyHor: "#ff9440", sunCol: "#ff7a30", sunEl: 0.0, ember: 0.8, flower: 0 }],
  // night falls at once: the cage, on "But now you're trapped"
  [35.045, { _blend: 0.35, ...NIGHT }],
  [41.6, { ...NIGHT }],
  // the fires along the canal wall, on "My darling"
  [41.909, { _blend: 0.5, gameCol: "#ff9440", gameCol2: "#ffc4a3", skyTop: "#241a44", skyHor: "#6a4a7a", stars: 0.8, fire: 1, ember: 1.4, smoke: 0.1, rate: 4, windowsLit: 0.45, bloom: 0.85, warm: 0.2, sunCol: "#ff9440", sunInt: 0.3, sunGlow: 0.2, haze: "#44325a", ambSky: "#7a5a90", ambGround: "#32263a", ambInt: 1.25, bars: 0, flicker: 0.15, mote: 0.1, camH: 5.2, lookDown: 1.0, camLat: -5.6, exposure: 1.25, vignette: 0.3, chaos: 0.35, grain: 0.09 }],
  [46.0, { _blend: 1, fire: 1, ember: 1.4, smoke: 0.1, rate: 4, camH: 5.2, lookDown: 1.0, camLat: -5.6 }],
  [48.779, { _blend: "full", fire: 0.04, ember: 0.2, smoke: 0.9, rate: 2.5, skyHor: "#4a4070", haze: "#363050", ambSky: "#6a6aa0", ambInt: 1.15, bloom: 0.7, warm: 0, windowsLit: 0.3, camH: 4.6, lookDown: 0.9, camLat: -4.5, chaos: 0.2 }],
  // hidden: dark, the torch finds the roses on the walls
  [49.6, { _blend: 0.6, gameCol: "#e5484d", gameCol2: "#ff7a5c", hide: 1, roseGlow: 0.25, petal: 0.4, mote: 0.4, rate: 2.5, smoke: 0.2, ember: 0.05, fire: 0, chaos: 0.15 }],
  [56.0, { hide: 1, roseGlow: 0.25, skyTop: "#262448", skyHor: "#8e6078", stars: 0.5, camH: 4.2, lookDown: 0.8, exposure: 1.05, vignette: 0.45, camLat: -3.2 }],
  // ash over the rooftops: grey, high, chaotic, on "Fire into ashes"
  [57.426, { _blend: 0.4, ...CITY, gameCol: "#e8e8e8", gameCol2: "#b9bbc0", hide: 0, roseGlow: 0, skyTop: "#6f7378", skyHor: "#a7a9ad", sunCol: "#d8d8d8", sunEl: 0.1, sunInt: 0.5, sunGlow: 0.1, haze: "#a7a9ad", ambSky: "#b8bbc0", ambGround: "#55595f", ambInt: 0.6, waterDeep: "#4a5058", waterShallow: "#6f7378", sat: 0.3, ash: 1, rate: 7, ember: 0.05, smoke: 0, camH: 3, lookDown: 0.6, windowsLit: 0.1, grain: 0.13, flicker: 0.4, mist: 0.8, bloom: 0.5, warm: 0, chaos: 0.7, dust: 0.3 }],
  [60.8, { _blend: "full", camH: 17, lookDown: 3.0, ash: 1, rate: 7, sat: 0.3 }],
  // morning into day: the delta, the herons, at once
  [60.923, { _blend: 0.35, ...NATURE, gameCol: "#ff7a5c", gameCol2: "#ffd9a0", skyTop: "#8fc3d9", skyHor: "#ffd9bf", sunCol: "#ff7a5c", sunEl: 0.035, sunSize: 0.085, sunInt: 1.3, sunGlow: 1.1, haze: "#f0d8c8", ambSky: "#ffd9b8", ambGround: "#4a5a44", ambInt: 0.6, ash: 0, rate: 2.5, mote: 0.6, camH: 7, lookDown: 1.2, shafts: 1.4, warm: 0.4, exposure: 1.05, mist: 0.6, bloom: 0.6 }],
  [64.401, { _blend: "full", sunEl: 0.12, sunSize: 0.06, camH: 1.5, lookDown: 0.2, fov: 62, streak: 1.2, spray: 1.5, rate: 11, wind: 0.9, sunAz: -0.3, waveAmp: 1.7, mote: 0.3, bloom: 0.6, shafts: 0.6, mist: 0.4 }],
  [66.9, { sunEl: 0.12, camH: 1.5, lookDown: 0.2, fov: 62, streak: 1.2, spray: 1.5, rate: 11, wind: 0.9, waveAmp: 1.7 }],
  // the traffic jam: grey, rain, hard
  [67.013, { _blend: 0.35, ...CITY, streak: 0, spray: 0, rain: 0.8, dust: 0.3, rate: 6, wind: 0.05, camH: 3, lookDown: 0.6, fov: 55, waveAmp: 1, windowsLit: 0.3, traffic: 1, sunAz: 0.05, sunEl: 0.1, skyTop: "#7f8fa0", skyHor: "#b8c2cc", mist: 0.7, chaos: 0.85 }],
  [71.0, { ...CITY, rain: 0.8, rate: 6, traffic: 1, skyTop: "#7f8fa0", skyHor: "#b8c2cc", mist: 0.7, sunEl: 0.1, chaos: 0.85 }],
  // the party: a warm city evening, on "Drink your silly poison"
  [71.361, { _blend: 0.4, gameCol: "#ffd9a0", gameCol2: "#ffb090", skyTop: "#3a3a7a", skyHor: "#ffb090", sunCol: "#ffa060", sunEl: 0.02, sunSize: 0.07, sunInt: 0.9, sunGlow: 0.9, haze: "#c8a0a0", ambSky: "#d0a0a8", ambGround: "#3a2a3a", ambInt: 0.7, waterDeep: "#243a5a", waterShallow: "#5a6a90", waterSpec: 0.55, sat: 0.9, rain: 0, bokeh: 1.0, bubble: 1.4, mote: 0.3, dust: 0, rate: 6, windowsLit: 0.9, windowMix: 0.85, traffic: 0.3, warm: 0.4, bloom: 0.8, leakGain: 0.18, shafts: 0.7, mist: 0.5, chaos: 0.45, flicker: 0.3, grain: 0.09 }],
  [74.5, { bokeh: 1.4, bubble: 0.2, mote: 0.4, rate: 5, sunEl: 0.0, windowsLit: 0.9, windowMix: 0.85 }],
  [78.3, { bokeh: 1.4, sat: 0.9, sunInt: 0.9, skyTop: "#3a3a7a", skyHor: "#ffb090", windowsLit: 0.9, warm: 0.4, bloom: 0.8, leakGain: 0.18, traffic: 0.3, waterSpec: 0.55 }],
  [80.4, { _blend: 2, sat: 0.5, sunInt: 0.4, sunGlow: 0.4, skyTop: "#4a5060", skyHor: "#8a7a86", haze: "#8a8a96", ambSky: "#8a8a96", bokeh: 0.4, rate: 2, windowsLit: 0.5, windowMix: 0.5, warm: 0, bloom: 0.6, leakGain: 0.1, traffic: 0, mote: 0.2, camLat: 2, camH: 3, chaos: 0.6, flicker: 0.5 }],
  // the last sunrise: the ledge, the crack, the rose
  [81.75, { _blend: 0.4, ...NATURE, gameCol: "#e5484d", gameCol2: "#ffc4a3", waterSpec: 1.0, skyTop: "#8fc3d9", skyHor: "#ffc4a3", sunCol: "#ff7a5c", sunEl: 0.03, sunGlow: 1.0, sunSize: 0.06, sunInt: 1.2, haze: "#f0d8c8", ambSky: "#ffd9b8", ambGround: "#4a5a44", ambInt: 0.6, sat: 0.95, bokeh: 0, mote: 0.5, petal: 0, rate: 2, crack: 1, warm: 0.5, shafts: 1.0, camLat: 9, lookSide: 3, lookDown: 1.0, camH: 2.8, windowsLit: 0.1, windowMix: 0.3, bloom: 0.6, mist: 0.5 }],
  [84.0, { _blend: "full", sunEl: 0.1, petal: 0.5, crack: 1, camLat: 14, lookSide: 1, lookDown: 1.0, camH: 2.8 }],
  [86.5, { _blend: "full", sunEl: 0.14, sunSize: 0.06, camH: 2.9, camLat: 19.5, lookSide: -7, lookDown: 0.9, petal: 0.5, mote: 0.5, rate: 2.5, crack: 1, warm: 0.3, shafts: 0.9, mist: 0.5, windowsLit: 0, fov: 55 }],
  [89.0, { _blend: "full", sunEl: 0.15, camH: 2.9, camLat: 19.5, lookSide: -7, lookDown: 0.9, petal: 0.5, mote: 0.5, rate: 2.5, crack: 1 }],
];

// speed along the river, metres per second
const SPEED = [[0, 2.2], [28, 2.2], [31, 2.9], [36, 2.4], [57, 2.2], [59, 3.0], [62, 3.6], [63.8, 5.0], [66.5, 5.0], [68, 2.6], [80, 2.2], [84, 1.5], [86.5, 0.35], [88.7, 0.0], [120, 0.0]];

// zones along the journey, in song time (converted to distance below). The edges are a fifth of a second: a line
// across the valley. Values 0..1; river width as a fraction of 60 m.
const E = 0.2;
const ZONES = {
  urban:    [[0, 0], [15.508 - E, 0], [15.508, 1], [22.706 - E, 1], [22.706, 0.2], [25.408 - E, 0.2], [25.408, 1], [29.02 - E, 1], [29.02, 0], [35.045 - E, 0], [35.045, 1], [60.923 - E, 1], [60.923, 0], [67.013 - E, 0], [67.013, 0.6], [71.361 - E, 0.6], [71.361, 0.5], [130, 0.5]],
  canal:    [[0, 0], [35.045 - E, 0], [35.045, 1], [57.0, 1], [57.426, 0], [80.9, 0], [81.0, 1], [130, 1]],
  meadow:   [[0, 0], [22.706 - E, 0], [22.706, 0.5], [25.408 - E, 0.5], [25.408, 0], [29.02 - E, 0], [29.02, 1], [35.045 - E, 1], [35.045, 0], [130, 0]],
  riverW:   [[0, 0.13], [59.5, 0.13], [62.5, 0.6], [67.013 - E, 0.7], [67.013, 0.2], [71.361, 0.2], [73, 0.35], [80, 0.26], [88, 0.26], [130, 0.26]],
  mountain: [[0, 0], [81, 0], [130, 0.3]],
  flats:    [[0, 0], [80.0, 0], [81.0, 1], [130, 1]],
};
const AFTER = {   // keyed by metres past the end of the ride
  urban:    [[0, 0.5], [12, 0.5], [18, 0]],
  canal:    [[0, 1], [12, 1], [16, 0]],
  meadow:   [[0, 0], [16, 0], [30, 0.5]],
  riverW:   [[0, 0.26], [40, 0.3]],
  mountain: [[0, 0.3], [40, 1]],
  flats:    [[0, 1], [12, 1], [15, 0]],
};

// where the birds are, over time
export const BIRDS = [[0, "distant", { n: 9 }], [15.5, "none"], [22.706, "distant", { n: 5 }], [25.4, "none"], [29.02, "flock", { n: 12 }], [35.045, "caged"], [39.4, "escape"], [43, "none"], [52.8, "distant", { n: 7 }], [57.4, "none"], [60.923, "launch", { n: 16, col: 1 }], [64.5, "none"], [67.013, "circle"], [71.361, "none"], [81.75, "distant", { n: 6 }], [85.0, "distant", { n: 14 }]];

const isHex = (v) => typeof v === "string" && v[0] === "#";

export function makeJourney(D) {
  // ---------- parameters over time ----------
  const names = Object.keys(BASE);
  const tracks = {};
  for (const n of names) {
    const ks = [[-1, BASE[n]]];
    for (const [t, obj] of KEYS) if (obj[n] !== undefined) ks.push([t, obj[n]]);
    tracks[n] = ks.map(([t, v]) => [t, isHex(v) ? new THREE.Color(v) : v]);
  }
  const out = {};
  for (const n of names) out[n] = isHex(BASE[n]) ? new THREE.Color() : 0;
  const blendOf = (t) => { for (const [kt, obj] of KEYS) if (kt === t) return obj._blend ?? 3; return 3; };
  function at(t) {
    for (const n of names) {
      const ks = tracks[n];
      let i = 0;
      while (i + 1 < ks.length && ks[i + 1][0] <= t) i++;
      const a = ks[i], b = ks[i + 1];
      if (!b) { if (a[1].isColor) out[n].copy(a[1]); else out[n] = a[1]; continue; }
      const gap = Math.max(1e-3, b[0] - a[0]);
      let bl = blendOf(b[0]);
      bl = bl === "full" ? gap : Math.min(bl, gap);
      const k = ss(Math.min(1, Math.max(0, (t - (b[0] - bl)) / bl)));
      if (a[1].isColor) out[n].copy(a[1]).lerp(b[1], k); else out[n] = a[1] + (b[1] - a[1]) * k;
    }
    out.t = t;
    return out;
  }

  // ---------- distance over time ----------
  const STEP = 0.05, N = Math.ceil(130 / STEP);
  const dist = new Float32Array(N + 1);
  const speedAt = (t) => { let i = 0; while (i + 1 < SPEED.length && SPEED[i + 1][0] <= t) i++; const a = SPEED[i], b = SPEED[i + 1] || a; const k = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * Math.min(1, Math.max(0, k)); };
  for (let i = 1; i <= N; i++) dist[i] = dist[i - 1] + 0.5 * (speedAt((i - 1) * STEP) + speedAt(i * STEP)) * STEP;
  const dAt = (t) => { const x = Math.min(N - 1, Math.max(0, t / STEP)); const i = Math.floor(x), k = x - i; return dist[i] + (dist[i + 1] - dist[i]) * k; };
  const tAt = (d) => { let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (dist[m] <= d) lo = m; else hi = m; } return lo * STEP; };

  // ---------- zones over distance ----------
  const zoneLen = dAt(100) + 400;
  const ZN = 2048;
  const zoneData = new Float32Array(ZN * 2 * 4);
  const lin = (keys, t) => { let i = 0; while (i + 1 < keys.length && keys[i + 1][0] <= t) i++; const a = keys[i], b = keys[i + 1] || a; const k = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * ss(Math.min(1, Math.max(0, k))); };
  const dEnd = dist[Math.round(D.duration / STEP)];
  const zoneRaw = (d) => {
    if (d <= dEnd) { const t = tAt(d); return { urban: lin(ZONES.urban, t), canal: lin(ZONES.canal, t), meadow: lin(ZONES.meadow, t), riverW: lin(ZONES.riverW, t), mountain: lin(ZONES.mountain, t), flats: lin(ZONES.flats, t) }; }
    const m = d - dEnd;
    return { urban: lin(AFTER.urban, m), canal: lin(AFTER.canal, m), meadow: lin(AFTER.meadow, m), riverW: lin(AFTER.riverW, m), mountain: lin(AFTER.mountain, m), flats: lin(AFTER.flats, m) };
  };
  for (let i = 0; i < ZN; i++) {
    const d = (i / (ZN - 1)) * zoneLen, z = zoneRaw(d);
    const row0 = i * 4, row1 = (ZN + i) * 4;
    zoneData[row0] = z.urban; zoneData[row0 + 1] = z.canal; zoneData[row0 + 2] = z.meadow; zoneData[row0 + 3] = z.riverW;
    zoneData[row1] = z.mountain; zoneData[row1 + 1] = 0; zoneData[row1 + 2] = z.flats; zoneData[row1 + 3] = 0;
  }
  const zoneTex = new THREE.DataTexture(zoneData, ZN, 2, THREE.RGBAFormat, THREE.FloatType);
  zoneTex.minFilter = zoneTex.magFilter = THREE.LinearFilter;
  zoneTex.wrapS = zoneTex.wrapT = THREE.ClampToEdgeWrapping;
  zoneTex.needsUpdate = true;
  const zoneAt = (z, row = 0) => {
    const x = Math.min(ZN - 1.001, Math.max(0, (-z / zoneLen) * (ZN - 1)));
    const i = Math.floor(x), k = x - i, o = (row * ZN + i) * 4;
    return [0, 1, 2, 3].map((c) => zoneData[o + c] * (1 - k) + zoneData[o + 4 + c] * k);
  };
  const zoneAtD = (d) => { const z = zoneRaw(d); z.riverW *= 60; return z; };
  const zoneAtT = (t) => zoneAtD(dAt(t));

  return { at, dAt, tAt, speedAt, zoneTex, zoneLen, zoneAt, zoneAtT, zoneAtD, dEnd, BIRDS };
}
