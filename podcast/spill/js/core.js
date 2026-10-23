/* Shared core: maths, easing, deterministic noise, the tapped beat map, the energy envelope. */
(function () {
  "use strict";
  const HR = (window.HR = window.HR || {});
  const D = (HR.D = window.HR_DATA);

  // ---------- maths ----------
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, x) => clamp((x - a) / (b - a));
  const ease = {
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inQuad: (t) => t * t,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    outBack: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  // deterministic noise: same time, same look (pause and seek stay stable)
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); };
  const noise1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); };
  const mix = (a, b, t) => {                       // hex colour mix
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
    const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
    const bl = Math.round(lerp(pa & 255, pb & 255, t));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  };
  const rgba = (hex, a) => {
    const p = parseInt(hex.slice(1), 16);
    return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`;
  };
  HR.util = { clamp, lerp, inv, ease, hash, noise1, mix, rgba };

  // ---------- the beat map (tapped by the artist, 4/4, bar 1 at 0:00) ----------
  const B = D.beats;
  const lastPeriod = B[B.length - 1] - B[B.length - 2];
  function shape(pos, period) {
    const index = Math.floor(pos);
    const phase = pos - index;
    return { pos, index, phase, period, bar: Math.floor(index / 4), inBar: ((index % 4) + 4) % 4, since: phase * period };
  }
  HR.beatAt = function (t) {
    if (t <= B[0]) return shape((t - B[0]) / (B[1] - B[0]), B[1] - B[0]);
    if (t >= B[B.length - 1]) { const p = lastPeriod; return shape(B.length - 1 + (t - B[B.length - 1]) / p, p); }
    let lo = 0, hi = B.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (B[m] <= t) lo = m; else hi = m; }
    const p = B[lo + 1] - B[lo];
    return shape(lo + (t - B[lo]) / p, p);
  };
  HR.beatTime = (i) => (i < B.length ? B[Math.max(0, i)] : B[B.length - 1] + (i - B.length + 1) * lastPeriod);

  // idle state breathes at the song's own tempo
  const idlePeriod = 60 / D.idleBpm;
  HR.idleBeatAt = (seconds) => shape(seconds / idlePeriod, idlePeriod);

  // a decaying pulse after each beat: 1 on the beat, fading over ~half a beat
  HR.pulse = (b, accentBars = true) => {
    const k = Math.exp(-b.since / (b.period * 0.22));
    if (!accentBars) return k;
    return k * (b.inBar === 0 ? 1 : b.inBar === 2 ? 0.62 : 0.38);
  };

  // ---------- energy envelope (precomputed from the master, 50 fps) ----------
  function unpack(s) {
    const bin = atob(s), a = new Float32Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i) / 255;
    return a;
  }
  const E = { fps: D.env.fps, rms: unpack(D.env.rms), low: unpack(D.env.low), mid: unpack(D.env.mid), high: unpack(D.env.high), voc: D.env.voc ? unpack(D.env.voc) : new Float32Array(1) };
  const at = (arr, f) => {
    const i = Math.floor(f), k = f - i;
    if (i < 0) return 0;
    if (i >= arr.length - 1) return arr[arr.length - 1] || 0;
    return arr[i] * (1 - k) + arr[i + 1] * k;
  };
  HR.energy = (t) => { const f = t * E.fps; return { rms: at(E.rms, f), low: at(E.low, f), mid: at(E.mid, f), high: at(E.high, f), voc: at(E.voc, f) }; };

  // ---------- sections (what the living layer does) ----------
  HR.sectionAt = (t) => {
    let s = D.sections[0];
    for (const x of D.sections) { if (x.t <= t) s = x; else break; }
    return s.mode;
  };

  // ---------- pointer (shared by cursor, lyrics, fx) ----------
  HR.pointer = { x: innerWidth / 2, y: innerHeight / 2, vx: 0, vy: 0, speed: 0, active: false, fine: false, last: 0 };

  // ---------- tiny event bus ----------
  const handlers = {};
  HR.on = (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); };
  HR.emit = (name, payload) => { (handlers[name] || []).forEach((fn) => fn(payload)); };

  HR.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
})();
