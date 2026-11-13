import { hash2i } from './rng';

/**
 * 2D OpenSimplex-style gradient noise (classic simplex, Gustavson) with a seeded
 * permutation, plus fractal helpers. Output of `noise2` is roughly in [-1, 1].
 */
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float32Array([
  1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1, 0.7071, 0.7071, -0.7071, 0.7071, 0.7071, -0.7071, -0.7071,
  -0.7071, 1, 0.4, -1, 0.4, 0.4, -1, -0.4, 1,
]);

export class Noise2D {
  private perm = new Uint8Array(512);
  constructor(seed: number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = hash2i(i, 77, seed) % (i + 1);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise(x: number, y: number): number {
    const perm = this.perm;
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let tt = 0.5 - x0 * x0 - y0 * y0;
    if (tt > 0) {
      const g = (perm[ii + perm[jj]] & 15) << 1;
      tt *= tt;
      n += tt * tt * (GRAD[g] * x0 + GRAD[g + 1] * y0);
    }
    tt = 0.5 - x1 * x1 - y1 * y1;
    if (tt > 0) {
      const g = (perm[ii + i1 + perm[jj + j1]] & 15) << 1;
      tt *= tt;
      n += tt * tt * (GRAD[g] * x1 + GRAD[g + 1] * y1);
    }
    tt = 0.5 - x2 * x2 - y2 * y2;
    if (tt > 0) {
      const g = (perm[ii + 1 + perm[jj + 1]] & 15) << 1;
      tt *= tt;
      n += tt * tt * (GRAD[g] * x2 + GRAD[g + 1] * y2);
    }
    return 70 * n;
  }

  /** Fractal Brownian motion, normalised to about [-1, 1]. */
  fbm(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x * freq + o * 17.31, y * freq - o * 9.77);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged multifractal in [0, 1]: sharp crests, good for mesas and mountain spines. */
  ridged(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    let prev = 1;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.noise(x * freq + o * 31.7, y * freq + o * 3.3));
      n *= n;
      sum += n * amp * prev;
      norm += amp;
      prev = n;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
