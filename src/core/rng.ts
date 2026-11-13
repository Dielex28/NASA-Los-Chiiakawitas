/**
 * Deterministic random utilities. Everything procedural in the game (terrain, rocks,
 * event schedules) derives from a mission seed so that a seed reproduces a world.
 */

/** 32-bit integer hash (lowbias32). */
export function hash32(x: number): number {
  x |= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash two integer lattice coordinates + seed → uint32. */
export function hash2i(x: number, y: number, seed: number): number {
  return hash32((Math.imul(x | 0, 0x1f1f1f1f) ^ Math.imul(y | 0, 0x5bd1e995)) + Math.imul(seed | 0, 0x9e3779b1));
}

/** Hash → float in [0, 1). */
export function hash2f(x: number, y: number, seed: number): number {
  return hash2i(x, y, seed) / 4294967296;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small fast seedable PRNG (mulberry32) with a serialisable state. */
export class Rng {
  state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 0x1234567;
  }
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  int(lo: number, hiInclusive: number): number {
    return Math.floor(this.range(lo, hiInclusive + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Approximate normal distribution via sum of uniforms. */
  gauss(mean = 0, sd = 1): number {
    return mean + sd * ((this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508);
  }
  fork(salt: number): Rng {
    return new Rng(hash32(this.state ^ Math.imul(salt, 0x9e3779b1)));
  }
}
