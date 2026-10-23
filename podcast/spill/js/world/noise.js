/* The same noise as the shaders, on the CPU, so things can be placed on the terrain the GPU draws. */
const fract = (x) => x - Math.floor(x);
export function hash2(x, y) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}
export function fbm(x, y) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 4; i++) {
    v += a * vnoise(x, y);
    const nx = 1.6 * x - 1.2 * y, ny = 1.2 * x + 1.6 * y;    // mat2(1.6, 1.2, -1.2, 1.6) * p, column-major as in GLSL
    x = nx; y = ny; a *= 0.5;
  }
  return v;
}
export function ridged(x, y) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 4; i++) {
    v += a * (1 - Math.abs(vnoise(x, y) * 2 - 1));
    x = x * 2.03 + 7.1; y = y * 2.03 + 7.1; a *= 0.5;
  }
  return v;
}
export const riverX = (z) => { const d = -z; return 9 * Math.sin(d * 0.028) + 4 * Math.sin(d * 0.0113 + 1.3) + 2 * Math.sin(d * 0.051 + 2.0); };
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// zone(z) returns [urban, canal, meadow, riverW], zone2(z) returns [mountain, crack, flats, 0]
export function makeTerrain(zone, zone2) {
  function hills(x, z, mountain) {
    const h = fbm(x * 0.016 + 3.7, z * 0.016 + 3.7);
    const r = ridged(x * 0.007 + 1.0, z * 0.007 + 1.0);
    return (h * 17 - 3) * (1 - mountain) + (r * 70 - 14) * mountain;
  }
  function terrainH(x, z) {
    const zn = zone(z), z2 = zone2(z);
    const urban = zn[0], canal = zn[1], rw = zn[3] * 60;
    const dx = Math.abs(x - riverX(z));
    let h = hills(x, z, z2[0]);
    const terr = Math.floor(h / 3 + 0.5) * 3;
    const flat_ = (h + (terr - h) * ss(0.75, 1.0, urban) * 0.7) * 0.35 + 3.2;
    h = h + (flat_ - h) * urban;
    h = h + (1.2 - h) * z2[2];
    const bank = ss(rw * 0.5, rw * 2.3, dx) * (1 - canal) + ss(rw * 0.92, rw * 1.08, dx) * canal;
    const bed = -3.5 - 2.0 * ss(rw * 0.8, 0, dx);
    return bed + (Math.max(h, 0.5) - bed) * bank;
  }
  return { terrainH, hills };
}
