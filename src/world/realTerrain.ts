import { clamp01, smoothstep } from '../core/math';
import { Noise2D } from '../core/noise';
import type { WorldId } from '../sim/types';
import { JEZERO, SHACKLETON, type RealSite } from './data/realSites';
import { makePois, type Poi, type Terrain } from './terrain';

/** Sites built from measured topography instead of invented relief. */
export const REAL_SITES: Record<WorldId, RealSite> = { moon: SHACKLETON, mars: JEZERO };

/** Unpack a site's elevation grid: base64 → gzip → row-delta int16 → metres. */
export async function loadRealSite(site: RealSite): Promise<Float32Array> {
  const bin = atob(site.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw = new Int16Array(await new Response(stream).arrayBuffer());
  const n = site.size;
  const out = new Float32Array(n * n);
  for (let r = 0; r < n; r++) {
    let acc = 0;
    for (let c = 0; c < n; c++) {
      acc += raw[r * n + c];
      out[r * n + c] = acc * site.scale;
    }
  }
  return out;
}

/** Catmull-Rom weights for a fraction t. */
function cubic(t: number, out: Float64Array): void {
  const t2 = t * t;
  const t3 = t2 * t;
  out[0] = -0.5 * t3 + t2 - 0.5 * t;
  out[1] = 1.5 * t3 - 2.5 * t2 + 1;
  out[2] = -1.5 * t3 + 2 * t2 + 0.5 * t;
  out[3] = 0.5 * t3 - 0.5 * t2;
}

/**
 * Terrain taken from a spacecraft elevation model: the rim of Shackleton crater as measured by
 * the LOLA laser altimeter, or the floor of Jezero crater around Perseverance's landing site
 * from stereo images of the CTX camera. The model gives the shape of the land down to its own
 * resolution (5 m and 20 m per sample at the source); below that, where no orbiter has
 * measured anything, a little generated roughness keeps the ground from looking polished.
 * East is +x and north is −z, as on a map.
 */
export class RealTerrain implements Terrain {
  readonly pois: Poi[];
  private n: number;
  private cell: number;
  private noise: Noise2D;
  private wx = new Float64Array(4);
  private wz = new Float64Array(4);

  constructor(
    readonly world: WorldId,
    seed: number,
    readonly site: RealSite,
    private heights: Float32Array,
  ) {
    this.n = site.size;
    this.cell = site.extent / site.size;
    this.noise = new Noise2D(seed + 911);
    this.pois = makePois(
      seed + 5,
      world === 'moon'
        ? ['anorthosite', 'breccia', 'glass', 'basalt', 'iceReg', 'impactMelt', 'agglutinate', 'boulder']
        : ['hematite', 'carbonate', 'sulfate', 'mudstone', 'olivine', 'clay', 'meteorite', 'perchlorate'],
      110,
      720,
      [[0, 0, 80]],
    );
  }

  /** The measured surface, smoothly interpolated between samples. */
  private model(x: number, z: number): number {
    const n = this.n;
    const gx = Math.min(n - 1.001, Math.max(0, x / this.cell + n / 2 - 0.5));
    const gz = Math.min(n - 1.001, Math.max(0, z / this.cell + n / 2 - 0.5));
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    cubic(gx - ix, this.wx);
    cubic(gz - iz, this.wz);
    let h = 0;
    for (let j = 0; j < 4; j++) {
      const row = Math.min(n - 1, Math.max(0, iz + j - 1)) * n;
      let acc = 0;
      for (let i = 0; i < 4; i++) acc += this.wx[i] * this.heights[row + Math.min(n - 1, Math.max(0, ix + i - 1))];
      h += this.wz[j] * acc;
    }
    return h;
  }

  height(x: number, z: number, res = 1): number {
    let h = this.model(x, z);
    // roughness below the resolution of the data, kept off the landing pad
    const pad = smoothstep(12, 46, Math.hypot(x, z));
    if (res < 30) h += pad * 1.3 * (this.noise.fbm(x / 41 + 7, z / 41 - 3, 3) - 0.0);
    if (res < 8) h += pad * 0.3 * this.noise.fbm(x / 8.3 - 11, z / 8.3 + 5, 2);
    if (res < 2.5) h += pad * 0.07 * this.noise.noise(x / 1.9 + 3, z / 1.9 + 9);
    return h;
  }

  iceField(x: number, z: number): number {
    if (this.world === 'moon') {
      // cold traps: the deeper below the rim, the less sunlight has ever reached
      const depth = -this.model(x, z);
      const patch = 0.55 + 0.45 * this.noise.fbm(x / 130 + 40, z / 130 - 12, 2);
      return clamp01(smoothstep(60, 420, depth) * patch * 1.15);
    }
    const patches = smoothstep(0.25, 0.7, this.noise.fbm(x / 240 + 13, z / 240 - 7, 2)) * smoothstep(150, 320, Math.hypot(x, z));
    return clamp01(0.85 * patches);
  }
}
