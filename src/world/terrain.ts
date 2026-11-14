import { clamp01, lerp, smoothstep, TAU } from '../core/math';
import { Noise2D } from '../core/noise';
import { hash2i } from '../core/rng';
import type { WorldId } from '../sim/types';

/**
 * Analytic terrain. `height(x, z, res)` is deterministic for a seed and can be
 * evaluated anywhere — the mesh, the physics, the Sun-horizon maths and the
 * shadow heightmap all sample the same function, so what you see is what the
 * simulation computes. `res` is the sampling spacing in metres: features that
 * are too small to be represented at that spacing are left out (level of detail).
 *
 * Axes: +x east, +z south, y up.
 */
export interface Terrain {
  readonly world: WorldId;
  height(x: number, z: number, res?: number): number;
  /** Subsurface / cold-trap ice potential before visibility constraints, 0..1. */
  iceField(x: number, z: number): number;
  /** Named points of interest (sample sites), deterministic from the seed. */
  readonly pois: Poi[];
}

export interface Poi {
  id: string;
  x: number;
  z: number;
  kind: string;
}

interface CraterLevel {
  cell: number;
  rMin: number;
  rMax: number;
  prob: number;
  /** depth as a fraction of radius for a fresh crater */
  depth: number;
  rim: number;
}

/**
 * Crater field: every level is a jittered grid; each cell may hold one crater.
 * Profile: parabolic bowl rising to a raised rim, then an ejecta blanket that
 * decays with a power law (after Pike's lunar crater morphometry).
 */
function craterField(
  x: number,
  z: number,
  levels: CraterLevel[],
  seed: number,
  res: number,
  softness: number,
  keepOut: (cx: number, cz: number, r: number) => number,
): number {
  let h = 0;
  for (let li = 0; li < levels.length; li++) {
    const L = levels[li];
    if (L.rMax < res * 1.6) continue;
    const fade = smoothstep(res * 1.6, res * 3.2, L.rMax);
    const cx0 = Math.floor(x / L.cell);
    const cz0 = Math.floor(z / L.cell);
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = cx0 + i;
        const cz = cz0 + j;
        const hsh = hash2i(cx, cz, seed + li * 7919);
        if ((hsh & 1023) / 1023 > L.prob) continue;
        const u1 = ((hsh >>> 10) & 1023) / 1023;
        const u2 = ((hsh >>> 20) & 1023) / 1023;
        const h2 = hash2i(cx + 911, cz - 373, seed + li * 104729);
        const u3 = (h2 & 1023) / 1023;
        const u4 = ((h2 >>> 10) & 1023) / 1023;
        const r = L.rMin + (L.rMax - L.rMin) * u3 * u3;
        const px = (cx + 0.2 + 0.6 * u1) * L.cell;
        const pz = (cz + 0.2 + 0.6 * u2) * L.cell;
        const dx = x - px;
        const dz = z - pz;
        const d2 = dx * dx + dz * dz;
        const reach = r * 2.6;
        if (d2 > reach * reach) continue;
        const k = keepOut(px, pz, r);
        if (k <= 0) continue;
        const rho = Math.sqrt(d2) / r;
        // age: old craters are shallower with softer rims
        const age = lerp(1, 0.28, u4 * softness);
        const depth = L.depth * r * age;
        const rim = L.rim * r * age;
        let c: number;
        if (rho < 1) {
          const t = Math.pow(rho, 2.2 + 1.2 * (1 - age));
          c = lerp(-depth, rim, t);
        } else {
          c = rim * Math.pow(rho, -3.4) * smoothstep(2.6, 1.9, rho);
        }
        h += c * k * fade;
      }
    }
  }
  return h;
}

/** Smooth designed mountain: gaussian ridge centred at (cx, cz), elongated along `dir` (radians). */
function massif(x: number, z: number, cx: number, cz: number, height: number, sigAlong: number, sigAcross: number, dir: number): number {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(dir);
  const s = Math.sin(dir);
  const a = dx * c + dz * s;
  const b = -dx * s + dz * c;
  const e = (a * a) / (2 * sigAlong * sigAlong) + (b * b) / (2 * sigAcross * sigAcross);
  return e > 12 ? 0 : height * Math.exp(-e);
}

/** Position at a compass azimuth (clockwise from north) and distance from the origin. */
const polar = (az: number, dist: number): [number, number] => [Math.sin(az) * dist, -Math.cos(az) * dist];

export function makePois(seed: number, kinds: string[], minR: number, maxR: number, avoid: Array<[number, number, number]>): Poi[] {
  const out: Poi[] = [];
  let k = 0;
  let guard = 0;
  while (out.length < kinds.length && guard++ < 4000) {
    const u = hash2i(guard, 17, seed) / 4294967296;
    const v = hash2i(guard, 53, seed) / 4294967296;
    const a = u * TAU;
    const r = lerp(minR, maxR, Math.sqrt(v));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    let ok = true;
    for (const p of out) if ((p.x - x) ** 2 + (p.z - z) ** 2 < 150 * 150) ok = false;
    for (const [ax, az, ar] of avoid) if ((ax - x) ** 2 + (az - z) ** 2 < ar * ar) ok = false;
    if (!ok) continue;
    out.push({ id: `${kinds[k]}-${k}`, x, z, kind: kinds[k] });
    k++;
  }
  return out;
}

/* ------------------------------------------------------------------- Moon */

/**
 * Lunar south-pole ridge. The base sits on a high, well-lit crest. A large,
 * permanently shadowed crater ("Umbra") lies to the south, and three distant
 * massifs block the low Sun for a few hours or days each month — the real
 * situation on the rim of Shackleton crater.
 */
export class MoonTerrain implements Terrain {
  readonly world = 'moon' as const;
  readonly pois: Poi[];
  /** Centre and radius of the permanently shadowed crater. */
  readonly umbra = { x: 150, z: 760, r: 430, depth: 150, rim: 14 };
  private n1: Noise2D;
  private n2: Noise2D;
  private seed: number;
  private levels: CraterLevel[] = [
    { cell: 1100, rMin: 150, rMax: 330, prob: 0.55, depth: 0.36, rim: 0.075 },
    { cell: 360, rMin: 42, rMax: 118, prob: 0.6, depth: 0.38, rim: 0.08 },
    { cell: 120, rMin: 13, rMax: 40, prob: 0.6, depth: 0.4, rim: 0.085 },
    { cell: 42, rMin: 4.5, rMax: 13.5, prob: 0.62, depth: 0.4, rim: 0.09 },
    { cell: 15, rMin: 1.5, rMax: 4.6, prob: 0.6, depth: 0.38, rim: 0.09 },
  ];
  private massifs: Array<[number, number, number, number, number, number]>;

  constructor(seed: number) {
    this.seed = seed;
    this.n1 = new Noise2D(seed);
    this.n2 = new Noise2D(seed + 101);
    const m = (az: number, dist: number, h: number, along: number, across: number): [number, number, number, number, number, number] => {
      const [x, z] = polar(az, dist);
      // ridge elongated tangentially (perpendicular to the line of sight from the base)
      return [x, z, h, along, across, Math.atan2(-Math.cos(az), Math.sin(az)) + Math.PI / 2];
    };
    this.massifs = [
      m(3.4, 2300, 440, 430, 330), // the long night: ~2.7 days
      m(1.2, 1500, 380, 150, 210), // a short eclipse early in the month: ~1 day
      m(5.3, 1900, 335, 205, 240), // another short one late in the month
      m(0.25, 2700, 210, 500, 380), // scenery only: these stay below the Sun's path
      m(4.45, 2900, 170, 600, 420),
    ];
    this.pois = makePois(
      seed,
      ['anorthosite', 'breccia', 'glass', 'basalt', 'iceReg', 'impactMelt', 'agglutinate', 'boulder'],
      110,
      720,
      [[0, 0, 80]],
    );
    // one sample site sits on the floor of the shadowed crater
    this.pois[4] = { id: 'iceReg-4', x: this.umbra.x - 40, z: this.umbra.z - 90, kind: 'iceReg' };
  }

  private keepOut = (cx: number, cz: number, r: number): number => {
    // keep the landing zone and the crater floor free of big overlapping bowls
    const d = Math.hypot(cx, cz);
    const landing = smoothstep(18 + r * 1.2, 70 + r * 3.5, d);
    const du = Math.hypot(cx - this.umbra.x, cz - this.umbra.z);
    const inUmbra = r > 60 ? smoothstep(this.umbra.r * 0.6, this.umbra.r * 1.9, du) : 1;
    return landing * inUmbra;
  };

  height(x: number, z: number, res = 0): number {
    const d = Math.hypot(x, z);
    // broad crest that carries the base, ~55 m above the surrounding plain
    let h = 55 * Math.exp(-(d * d) / (2 * 520 * 520));
    // regional relief, damped near the landing zone
    const calm = 0.25 + 0.75 * smoothstep(60, 420, d);
    h += 34 * this.n1.fbm(x / 1500, z / 1500, 3) * calm;
    if (res < 80) h += 7 * this.n2.fbm(x / 260 + 5.2, z / 260 - 1.7, 3) * calm;
    if (res < 14) h += 0.55 * this.n1.fbm(x / 38 + 9.1, z / 38 + 4.4, 2) * (0.45 + 0.55 * calm);
    if (res < 3) h += 0.07 * this.n2.fbm(x / 6.5, z / 6.5, 2);
    for (const m of this.massifs) h += massif(x, z, m[0], m[1], m[2], m[3], m[4], m[5]);
    // rising ground toward the horizon so the site reads as a basin rim
    h += 60 * smoothstep(1500, 3200, d) * (0.6 + 0.4 * this.n1.noise(x / 900, z / 900));
    // the permanently shadowed crater
    const u = this.umbra;
    const rho = Math.hypot(x - u.x, z - u.z) / u.r;
    if (rho < 2.6) {
      const wob = 1 + 0.05 * this.n2.noise(x / 240, z / 240);
      const rr = rho * wob;
      h += rr < 1 ? lerp(-u.depth, u.rim, Math.pow(rr, 2.6)) : u.rim * Math.pow(rr, -3.2) * smoothstep(2.6, 1.9, rr);
    }
    h += craterField(x, z, this.levels, this.seed, res, 1, this.keepOut);
    return h;
  }

  iceField(x: number, z: number): number {
    // ice survives only in cold traps; richest toward the floor of the big crater and in patches
    const u = this.umbra;
    const rho = Math.hypot(x - u.x, z - u.z) / u.r;
    const floor = smoothstep(0.95, 0.35, rho);
    const patch = 0.55 + 0.45 * this.n2.fbm(x / 130 + 40, z / 130 - 12, 2);
    return clamp01(floor * patch * 1.15);
  }
}

/* ------------------------------------------------------------------- Mars */

/**
 * Martian crater-floor site in the spirit of Jezero: gentle ochre plains, layered
 * mesas, a dry river channel, dune ripples in the hollows and a distant crater wall.
 */
export class MarsTerrain implements Terrain {
  readonly world = 'mars' as const;
  readonly pois: Poi[];
  private n1: Noise2D;
  private n2: Noise2D;
  private n3: Noise2D;
  private seed: number;
  private levels: CraterLevel[] = [
    { cell: 950, rMin: 110, rMax: 250, prob: 0.3, depth: 0.22, rim: 0.06 },
    { cell: 300, rMin: 34, rMax: 90, prob: 0.34, depth: 0.25, rim: 0.065 },
    { cell: 100, rMin: 10, rMax: 30, prob: 0.3, depth: 0.28, rim: 0.07 },
    { cell: 34, rMin: 3, rMax: 9.5, prob: 0.28, depth: 0.28, rim: 0.07 },
  ];
  /** Guaranteed ice deposit within walking distance of the base. */
  readonly iceSpot: [number, number];

  constructor(seed: number) {
    this.seed = seed;
    this.n1 = new Noise2D(seed + 7);
    this.n2 = new Noise2D(seed + 211);
    this.n3 = new Noise2D(seed + 499);
    const a = (hash2i(3, 9, seed) / 4294967296) * TAU;
    this.iceSpot = [Math.cos(a) * 210, Math.sin(a) * 210];
    this.pois = makePois(
      seed,
      ['hematite', 'carbonate', 'sulfate', 'mudstone', 'olivine', 'clay', 'meteorite', 'perchlorate'],
      110,
      720,
      [[0, 0, 80]],
    );
  }

  private keepOut = (cx: number, cz: number, r: number): number => smoothstep(20 + r * 1.2, 80 + r * 3.5, Math.hypot(cx, cz));

  /** Signed distance (m) to the meandering dry channel. */
  private channel(x: number, z: number): number {
    const centre = 430 + 150 * Math.sin(x / 290 + 0.6) + 60 * Math.sin(x / 97 + 2.1);
    return z - centre;
  }

  height(x: number, z: number, res = 0): number {
    const d = Math.hypot(x, z);
    const calm = 0.2 + 0.8 * smoothstep(70, 460, d);
    let h = 38 * this.n1.fbm(x / 1700, z / 1700, 3) * calm;
    if (res < 90) h += 9 * this.n2.fbm(x / 300 - 3.3, z / 300 + 8.1, 3) * calm;
    if (res < 16) h += 1.1 * this.n1.fbm(x / 42 + 2.2, z / 42 - 6.6, 2);
    if (res < 3) h += 0.14 * this.n2.fbm(x / 5.5, z / 5.5, 2);

    // layered mesas: plateaus with stepped, eroded edges
    const ridge = this.n3.ridged(x / 1250 + 1.7, z / 1250 - 0.4, 3);
    const mesaMask = smoothstep(0.5, 0.66, ridge) * smoothstep(240, 560, d);
    if (mesaMask > 0) {
      const top = 62 * mesaMask;
      const steps = 7;
      const stepped = (Math.floor((top / 62) * steps) + smoothstep(0.55, 1, ((top / 62) * steps) % 1)) / steps;
      h += lerp(top, stepped * 62, 0.65);
    }

    // crater wall on the western horizon
    const wall = smoothstep(1500, 2900, -x + 0.35 * z + 400 * this.n1.noise(x / 1300, z / 1300));
    h += 330 * wall * (0.75 + 0.25 * this.n2.noise(x / 420, z / 420));
    h += 50 * smoothstep(1700, 3200, d);

    // dry channel
    const cd = this.channel(x, z);
    const bank = 46 + 14 * this.n2.noise(x / 180, 3.3);
    const cut = smoothstep(bank, bank * 0.35, Math.abs(cd));
    h -= 13 * cut * smoothstep(120, 300, d);

    // dune ripples collect in the hollows
    if (res < 5) {
      const hollow = smoothstep(0.1, -0.35, this.n2.fbm(x / 300 - 3.3, z / 300 + 8.1, 3)) * smoothstep(50, 160, d);
      if (hollow > 0.01) {
        const warp = 5 * this.n3.noise(x / 55, z / 55);
        const phase = (x * 0.83 + z * 0.56) / 7.5 + warp;
        const wave = 0.5 + 0.5 * Math.sin(phase);
        h += 1.15 * hollow * wave * wave * (res < 2 ? 1 : 0.5);
      }
    }
    h += craterField(x, z, this.levels, this.seed, res, 1.6, this.keepOut);
    return h;
  }

  iceField(x: number, z: number): number {
    const lobe = Math.exp(-((x - this.iceSpot[0]) ** 2 + (z - this.iceSpot[1]) ** 2) / (2 * 55 * 55));
    const patches = smoothstep(0.25, 0.7, this.n3.fbm(x / 240 + 13, z / 240 - 7, 2)) * smoothstep(150, 320, Math.hypot(x, z));
    return clamp01(Math.max(0.9 * lobe, 0.85 * patches));
  }
}

export function createTerrain(world: WorldId, seed: number): Terrain {
  return world === 'moon' ? new MoonTerrain(seed) : new MarsTerrain(seed);
}
