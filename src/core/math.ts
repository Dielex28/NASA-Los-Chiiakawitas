export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (v - a) / (b - a);
export const remap = (v: number, a: number, b: number, c: number, d: number): number =>
  c + (d - c) * clamp01((v - a) / (b - a));
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
/** Frame-rate independent exponential approach. `lambda` ≈ speed (1/s). */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));
/** Shortest signed angular difference b - a, wrapped to (-π, π]. */
export const angleDelta = (a: number, b: number): number => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
};
export const dampAngle = (a: number, b: number, lambda: number, dt: number): number =>
  a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
export const fract = (x: number): number => x - Math.floor(x);
export const sign = (x: number): number => (x < 0 ? -1 : 1);
export const round = (v: number, digits = 0): number => {
  const m = 10 ** digits;
  return Math.round(v * m) / m;
};
