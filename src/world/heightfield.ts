import { clamp01, TAU } from '../core/math';
import { TUNE } from '../sim/catalog';
import { horizonAt, sunPosition, sunVisibility } from '../sim/environment';
import { LUNAR_SYNODIC_H, WORLDS } from '../sim/worlds';
import type { SiteProbe, WorldId } from '../sim/types';
import type { Terrain } from './terrain';

/** Side of the square baked heightmap, metres (centred on the landing site). */
export const HF_EXTENT = 6400;
export const HF_SIZE = 1024;
/** Survey grid for the illumination / resource overlays. */
export const SURVEY_EXTENT = 2400;
export const SURVEY_SIZE = 96;

/**
 * A coarse bake of the terrain used wherever many height lookups are needed:
 * the Sun-horizon masks behind the power simulation, the far-field shadows in
 * the terrain shader, the survey maps and the minimap.
 */
export class Heightfield implements SiteProbe {
  readonly data = new Float32Array(HF_SIZE * HF_SIZE);
  readonly texel = HF_EXTENT / HF_SIZE;
  minH = Infinity;
  maxH = -Infinity;
  /** Fraction of the cycle (month / sol) each survey cell is sunlit, 0..1. */
  readonly illum = new Float32Array(SURVEY_SIZE * SURVEY_SIZE);
  /** Ice richness with cold-trap physics applied, 0..1. */
  readonly ice = new Float32Array(SURVEY_SIZE * SURVEY_SIZE);

  constructor(
    readonly terrain: Terrain,
    readonly world: WorldId,
  ) {}

  /** Bake rows [row0, row1). Call repeatedly from a loading loop to keep the page responsive. */
  bakeRows(row0: number, row1: number): void {
    const t = this.terrain;
    const half = HF_EXTENT / 2;
    const tx = this.texel;
    for (let j = row0; j < row1; j++) {
      const z = (j + 0.5) * tx - half;
      for (let i = 0; i < HF_SIZE; i++) {
        const x = (i + 0.5) * tx - half;
        const h = t.height(x, z, tx);
        this.data[j * HF_SIZE + i] = h;
        if (h < this.minH) this.minH = h;
        if (h > this.maxH) this.maxH = h;
      }
    }
  }

  /** Bilinear height from the bake. */
  sample(x: number, z: number): number {
    const half = HF_EXTENT / 2;
    let fx = (x + half) / this.texel - 0.5;
    let fz = (z + half) / this.texel - 0.5;
    if (fx < 0) fx = 0;
    else if (fx > HF_SIZE - 1.001) fx = HF_SIZE - 1.001;
    if (fz < 0) fz = 0;
    else if (fz > HF_SIZE - 1.001) fz = HF_SIZE - 1.001;
    const i = fx | 0;
    const j = fz | 0;
    const u = fx - i;
    const v = fz - j;
    const d = this.data;
    const k = j * HF_SIZE + i;
    return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + HF_SIZE] * (1 - u) + d[k + HF_SIZE + 1] * u) * v;
  }

  /**
   * Terrain horizon as seen from a point: for each azimuth bin, the highest
   * elevation angle of the ground along that bearing. A solar array only
   * produces power while the Sun is above this line.
   */
  horizon(x: number, z: number, heightAboveGround: number): number[] {
    const bins = TUNE.horizonBins;
    const out = new Array<number>(bins);
    const eye = this.terrain.height(x, z, 1) + heightAboveGround;
    for (let b = 0; b < bins; b++) {
      const az = (b / bins) * TAU;
      const dx = Math.sin(az);
      const dz = -Math.cos(az);
      let best = -0.3;
      // near field: analytic terrain (catches a crater rim right next to the mast)
      for (let d = 5; d < 60; d += 5) {
        const a = Math.atan2(this.terrain.height(x + dx * d, z + dz * d, 2.5) - eye, d);
        if (a > best) best = a;
      }
      // far field: the bake, with steps that grow with distance
      for (let d = 60; d < 3400; d *= 1.09) {
        const a = Math.atan2(this.sample(x + dx * d, z + dz * d) - eye, d);
        if (a > best) best = a;
      }
      out[b] = best;
    }
    return out;
  }

  iceRichness(x: number, z: number): number {
    return this.surveyAt(this.ice, x, z);
  }

  illumination(x: number, z: number): number {
    return this.surveyAt(this.illum, x, z);
  }

  private surveyAt(grid: Float32Array, x: number, z: number): number {
    const half = SURVEY_EXTENT / 2;
    const cell = SURVEY_EXTENT / SURVEY_SIZE;
    let fx = (x + half) / cell - 0.5;
    let fz = (z + half) / cell - 0.5;
    if (fx < 0 || fz < 0 || fx > SURVEY_SIZE - 1 || fz > SURVEY_SIZE - 1) return 0;
    fx = Math.min(fx, SURVEY_SIZE - 1.001);
    fz = Math.min(fz, SURVEY_SIZE - 1.001);
    const i = fx | 0;
    const j = fz | 0;
    const u = fx - i;
    const v = fz - j;
    const k = j * SURVEY_SIZE + i;
    return (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + SURVEY_SIZE] * (1 - u) + grid[k + SURVEY_SIZE + 1] * u) * v;
  }

  /**
   * Survey rows [row0, row1): how much of the cycle each cell is lit (at `mast`
   * metres above the ground) and how much ice it can hold. On the Moon ice only
   * survives where the Sun never reaches (a permanently shadowed region).
   */
  surveyRows(row0: number, row1: number, startLocalH: number): void {
    const cell = SURVEY_EXTENT / SURVEY_SIZE;
    const half = SURVEY_EXTENT / 2;
    const w = WORLDS[this.world];
    const steps = this.world === 'moon' ? 96 : 48;
    const period = this.world === 'moon' ? LUNAR_SYNODIC_H : w.solH;
    const suns = [];
    for (let s = 0; s < steps; s++) suns.push(sunPosition(this.world, (period * s) / steps, startLocalH));
    for (let j = row0; j < row1; j++) {
      const z = (j + 0.5) * cell - half;
      for (let i = 0; i < SURVEY_SIZE; i++) {
        const x = (i + 0.5) * cell - half;
        const mask = this.horizonCoarse(x, z, 2);
        let lit = 0;
        let daylight = 0;
        for (const sun of suns) {
          if (this.world === 'mars' && sun.el <= 0) continue;
          daylight++;
          lit += sunVisibility(sun.el, horizonAt(mask, sun.az), w.sunAngularRadius);
        }
        const f = daylight > 0 ? lit / daylight : 0;
        const k = j * SURVEY_SIZE + i;
        this.illum[k] = f;
        const field = this.terrain.iceField(x, z);
        this.ice[k] = this.world === 'moon' ? field * clamp01(1 - f * 12) : field;
      }
    }
  }

  /** Cheaper horizon (bake only, 36 bearings) for the survey grid. */
  private horizonCoarse(x: number, z: number, heightAboveGround: number): number[] {
    const bins = 36;
    const out = new Array<number>(bins);
    const eye = this.sample(x, z) + heightAboveGround;
    for (let b = 0; b < bins; b++) {
      const az = (b / bins) * TAU;
      const dx = Math.sin(az);
      const dz = -Math.cos(az);
      let best = -0.3;
      for (let d = 14; d < 3200; d *= 1.16) {
        const a = Math.atan2(this.sample(x + dx * d, z + dz * d) - eye, d);
        if (a > best) best = a;
      }
      out[b] = best;
    }
    return out;
  }

  /** Ground slope in degrees over a footprint of radius `r`. */
  slopeDeg(x: number, z: number, r: number): number {
    const t = this.terrain;
    const hx = t.height(x + r, z, 1) - t.height(x - r, z, 1);
    const hz = t.height(x, z + r, 1) - t.height(x, z - r, 1);
    return (Math.atan(Math.hypot(hx, hz) / (2 * r)) * 180) / Math.PI;
  }

  /** Highest ground under a circular footprint — where a module's deck must sit. */
  padHeight(x: number, z: number, r: number): { top: number; bottom: number } {
    const t = this.terrain;
    let top = -Infinity;
    let bottom = Infinity;
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * TAU;
      const rr = k === 8 ? 0 : r;
      const h = t.height(x + Math.cos(a) * rr, z + Math.sin(a) * rr, 1);
      if (h > top) top = h;
      if (h < bottom) bottom = h;
    }
    return { top, bottom };
  }
}
