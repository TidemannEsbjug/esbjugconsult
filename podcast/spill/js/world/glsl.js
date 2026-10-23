/* Shared GLSL: hashes, value noise, fbm · the shape of the valley (used by the terrain, the water and the props)
   · one lighting and fog model for everything · ACES. The same noise everywhere means the world agrees with itself. */
export const COMMON = /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718
float sat(float x) { return clamp(x, 0.0, 1.0); }
float hash1(float n) { return fract(sin(n) * 43758.5453123); }
// no sin: the same numbers on the GPU and in JavaScript, so things can be placed on the terrain the GPU draws
float hash2(vec2 p) { vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031); p3 += dot(p3, vec3(p3.y, p3.z, p3.x) + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}
float ridged(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * (1.0 - abs(vnoise(p) * 2.0 - 1.0)); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
mat2 rot2(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
`;

/* The valley. x across, z along (the journey goes toward -z). Water at y = 0.
   uZones: a table over the journey's length; row 0 = (urban, canal, meadow, river half-width), row 1 = (mountain, crack, flats, -) */
export const TERRAIN = /* glsl */ `
uniform sampler2D uZones; uniform float uZoneLen;
float riverX(float z) { float d = -z; return 9.0 * sin(d * 0.028) + 4.0 * sin(d * 0.0113 + 1.3) + 2.0 * sin(d * 0.051 + 2.0); }
vec4 zone(float z) { return texture2D(uZones, vec2(clamp(-z / uZoneLen, 0.0, 1.0), 0.25)); }
vec4 zone2(float z) { return texture2D(uZones, vec2(clamp(-z / uZoneLen, 0.0, 1.0), 0.75)); }
float hills(vec2 p, float mountain) {
  float h = fbm(p * 0.016 + 3.7);
  float r = ridged(p * 0.007 + 1.0);
  return mix(h * 17.0 - 3.0, r * 70.0 - 14.0, mountain);
}
float terrainH(vec2 p) {
  vec4 zn = zone(p.y);
  vec4 z2 = zone2(p.y);
  float urban = zn.r, canal = zn.g, rw = zn.a * 60.0;
  float dx = abs(p.x - riverX(p.y));
  float h = hills(p, z2.r);
  float terr = floor(h / 3.0 + 0.5) * 3.0;
  float flat_ = mix(h, terr, smoothstep(0.75, 1.0, urban) * 0.7) * 0.35 + 3.2;
  h = mix(h, flat_, urban);
  h = mix(h, 1.2, z2.b);
  float bank = mix(smoothstep(rw * 0.5, rw * 2.3, dx), smoothstep(rw * 0.92, rw * 1.08, dx), canal);
  float bed = -3.5 - 2.0 * smoothstep(rw * 0.8, 0.0, dx);
  return mix(bed, max(h, 0.5), bank);
}
`;

/* Light: a sun, a sky hemisphere, mist that takes the sun's colour, a little rim. */
export const LIGHT = /* glsl */ `
uniform vec3 uSunDir, uSunCol, uAmbSky, uAmbGround, uHaze;
uniform float uSunInt, uAmbInt, uFogK, uFogH, uClip;
vec3 shade(vec3 albedo, vec3 n, vec3 v, float spec) {
  float nl = max(dot(n, uSunDir), 0.0);
  float wrap = max((dot(n, uSunDir) + 0.45) / 1.45, 0.0);
  vec3 diff = albedo * (uSunCol * uSunInt * mix(nl, wrap, 0.5) * 0.9);
  vec3 hemi = albedo * mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5) * uAmbInt * 1.6;
  vec3 h = normalize(uSunDir + v);
  float s = pow(max(dot(n, h), 0.0), 48.0) * spec * nl;
  return diff + hemi + uSunCol * s * uSunInt;
}
vec3 fogIn(vec3 col, vec3 world, vec3 cam) {
  vec3 dv = world - cam;
  float dist = length(dv);
  vec3 dir = dv / max(dist, 1e-3);
  float heightK = exp(-max(world.y, 0.0) * uFogH);
  float f = 1.0 - exp(-dist * uFogK * mix(1.0, heightK, 0.7));
  float sunAmt = pow(max(dot(dir, uSunDir), 0.0), 6.0);
  vec3 fc = mix(uHaze, uSunCol, sunAmt * 0.55);
  return mix(col, fc, sat(f));
}
`;

export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
