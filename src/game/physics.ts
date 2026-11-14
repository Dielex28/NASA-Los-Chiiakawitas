/**
 * A small rigid-body integrator for loose objects on the surface — a thrown rock, a dropped
 * hammer, a feather. No graphics here: the same code runs in the unit tests.
 *
 * What it models, in SI units:
 *  - gravity of the world you are standing on;
 *  - aerodynamic drag, F = ½·ρ·Cd·A·v² against the air (ρ = 0 on the Moon, so mass cancels out
 *    of the motion entirely — Galileo's point, and Apollo 15's hammer and feather);
 *  - wind, which only matters to light things with a lot of area;
 *  - contact with the terrain: restitution along the surface normal, Coulomb friction along it,
 *    and the energy loose regolith soaks up when something rolls through it.
 */

/** Atmospheric density at the surface, kg/m³. Mars has about 1.6 % of Earth's; the Moon has none. */
export const AIR_DENSITY = { moon: 0, mars: 0.02, earth: 1.225 } as const;
export const EARTH_GRAVITY = 9.81;

export interface BodySpec {
  kind: string;
  /** Bounding radius used for contact, m. */
  radius: number;
  /** kg */
  mass: number;
  /** Area presented to the airflow, m². */
  area: number;
  /** Drag coefficient. */
  cd: number;
  /** Fraction of the normal speed kept after a bounce. */
  restitution: number;
  /** Coulomb friction coefficient against regolith. */
  friction: number;
}

/** Apollo 15's demonstration used a 1.32 kg geological hammer and a 0.03 kg falcon feather. */
export const HAMMER: BodySpec = { kind: 'hammer', radius: 0.05, mass: 1.32, area: 0.004, cd: 1.0, restitution: 0.22, friction: 0.7 };
/** Area and drag coefficient are estimates for a 30 cm feather falling flat. */
export const FEATHER: BodySpec = { kind: 'feather', radius: 0.012, mass: 0.03, area: 0.012, cd: 1.3, restitution: 0.02, friction: 0.9 };
/** A fist-sized piece of basalt (about 2 900 kg/m³). */
export const ROCK: BodySpec = { kind: 'rock', radius: 0.048, mass: 1.35, area: 0.0072, cd: 0.5, restitution: 0.32, friction: 0.65 };

export interface Body extends BodySpec {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Tumble, rad/s about each axis — cosmetic, but driven by the motion. */
  wx: number;
  wy: number;
  wz: number;
  /** Seconds since release. */
  t: number;
  x0: number;
  y0: number;
  z0: number;
  /** Highest point reached above the release height, m. */
  apex: number;
  /** Time of the first touch on the ground, s (null while still falling). */
  landedAt: number | null;
  landX: number;
  landZ: number;
  /** Speed at the first touch, m/s. */
  impactSpeed: number;
  bounces: number;
  resting: boolean;
}

export interface PhysEnv {
  /** m/s² */
  gravity: number;
  /** kg/m³ */
  airDensity: number;
  /** Wind velocity, m/s (x, z). */
  windX: number;
  windZ: number;
  ground: (x: number, z: number) => number;
  /** Unit surface normal at (x, z). */
  normal: (x: number, z: number) => [number, number, number];
  /** Upright obstacles: [x, z, radius]. */
  colliders?: ReadonlyArray<readonly [number, number, number]>;
}

export type PhysEvent = { type: 'landed'; body: Body } | { type: 'rest'; body: Body };

const STEP = 1 / 240;
/** Below this normal speed a contact stops bouncing and starts resting or rolling, m/s. */
const REST_SPEED = 0.28;
/** Rolling through loose soil: fraction of tangential speed lost per second. */
const SOIL_DAMPING = 2.4;

export class PhysicsWorld {
  readonly bodies: Body[] = [];
  private nextId = 1;
  private carry = 0;

  add(spec: BodySpec, x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): Body {
    const speed = Math.hypot(vx, vy, vz);
    const b: Body = {
      ...spec,
      id: this.nextId++,
      x,
      y,
      z,
      vx,
      vy,
      vz,
      wx: speed * 2.1,
      wy: speed * 0.6,
      wz: speed * 1.3,
      t: 0,
      x0: x,
      y0: y,
      z0: z,
      apex: 0,
      landedAt: null,
      landX: x,
      landZ: z,
      impactSpeed: 0,
      bounces: 0,
      resting: false,
    };
    this.bodies.push(b);
    return b;
  }

  remove(body: Body): void {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  clear(): void {
    this.bodies.length = 0;
    this.carry = 0;
  }

  /** Advance by `dt` seconds in fixed sub-steps; returns what happened on the way. */
  step(dt: number, env: PhysEnv): PhysEvent[] {
    const events: PhysEvent[] = [];
    this.carry += Math.min(dt, 0.25);
    while (this.carry >= STEP) {
      this.carry -= STEP;
      for (const b of this.bodies) if (!b.resting) this.integrate(b, STEP, env, events);
    }
    return events;
  }

  private integrate(b: Body, h: number, env: PhysEnv, events: PhysEvent[]): void {
    b.t += h;
    // drag acts along the velocity relative to the air
    const k = (0.5 * env.airDensity * b.cd * b.area) / b.mass;
    if (k > 0) {
      const rx = b.vx - env.windX;
      const ry = b.vy;
      const rz = b.vz - env.windZ;
      const rel = Math.hypot(rx, ry, rz);
      // implicit in the speed, so a very light body cannot overshoot and oscillate
      const f = 1 / (1 + k * rel * h);
      b.vx = env.windX + rx * f;
      b.vy = ry * f;
      b.vz = env.windZ + rz * f;
    }
    b.vy -= env.gravity * h;
    const yBefore = b.y;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
    if (b.y - b.y0 > b.apex) b.apex = b.y - b.y0;

    // upright obstacles (modules, boulders)
    if (env.colliders) {
      for (const c of env.colliders) {
        const dx = b.x - c[0];
        const dz = b.z - c[1];
        const r = c[2] + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-9 && b.y - env.ground(c[0], c[1]) < c[2] * 2.2) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const nz = dz / d;
          b.x = c[0] + nx * r;
          b.z = c[1] + nz * r;
          const vn = b.vx * nx + b.vz * nz;
          if (vn < 0) {
            b.vx -= (1 + b.restitution) * vn * nx;
            b.vz -= (1 + b.restitution) * vn * nz;
          }
        }
      }
    }

    const floor = env.ground(b.x, b.z) + b.radius;
    if (b.y > floor) return;
    // the touch happened part-way through this step: interpolate, so times are good to well under a millisecond
    const into = yBefore > b.y ? Math.min(1, Math.max(0, (yBefore - floor) / (yBefore - b.y))) : 1;
    b.y = floor;
    const [nx, ny, nz] = env.normal(b.x, b.z);
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (b.landedAt === null) {
      b.landedAt = b.t - h * (1 - into);
      b.landX = b.x;
      b.landZ = b.z;
      b.impactSpeed = Math.hypot(b.vx, b.vy, b.vz);
      events.push({ type: 'landed', body: b });
    }
    if (vn < 0) {
      // split into normal and tangential parts
      let tx = b.vx - vn * nx;
      let ty = b.vy - vn * ny;
      let tz = b.vz - vn * nz;
      const bounce = -vn > REST_SPEED ? -vn * b.restitution : 0;
      // friction impulse is limited by the normal impulse (Coulomb)
      const tangential = Math.hypot(tx, ty, tz);
      if (tangential > 1e-6) {
        const lost = Math.min(tangential, b.friction * (-vn + bounce));
        const keep = (tangential - lost) / tangential;
        tx *= keep;
        ty *= keep;
        tz *= keep;
      }
      b.vx = tx + bounce * nx;
      b.vy = ty + bounce * ny;
      b.vz = tz + bounce * nz;
      if (bounce > 0) {
        b.bounces++;
        b.wx *= 0.6;
        b.wy *= 0.6;
        b.wz *= 0.6;
      }
    }
    // in contact: loose soil drags on anything that slides or rolls through it
    const soil = Math.exp(-SOIL_DAMPING * h);
    b.vx *= soil;
    b.vz *= soil;
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    b.wx = speed * 6;
    b.wy *= soil;
    b.wz = speed * 2;
    // rests when slow, unless the slope is steep enough to keep it sliding
    const slope = Math.sqrt(Math.max(0, 1 - ny * ny));
    if (speed < 0.06 && slope < b.friction * 0.9) {
      b.vx = b.vy = b.vz = 0;
      b.wx = b.wy = b.wz = 0;
      b.resting = true;
      events.push({ type: 'rest', body: b });
    }
  }
}

/**
 * Time for a body released at rest to fall `height` metres, with the same integrator.
 * Used to tell the player what the same drop would have looked like elsewhere.
 */
export function fallTime(spec: BodySpec, height: number, gravity: number, airDensity: number): number {
  const w = new PhysicsWorld();
  const b = w.add(spec, 0, height + spec.radius, 0);
  const env: PhysEnv = { gravity, airDensity, windX: 0, windZ: 0, ground: () => 0, normal: () => [0, 1, 0] };
  for (let i = 0; i < 2400 && b.landedAt === null; i++) w.step(1 / 60, env);
  return b.landedAt ?? Infinity;
}

/** Range on level ground of a throw at `speed` m/s and `elevation` radians, ignoring air. */
export function vacuumRange(speed: number, elevation: number, gravity: number, height = 0): number {
  const vx = speed * Math.cos(elevation);
  const vy = speed * Math.sin(elevation);
  const t = (vy + Math.sqrt(vy * vy + 2 * gravity * height)) / gravity;
  return vx * t;
}

/**
 * Metabolic power of a suited astronaut, watts. Apollo crews averaged roughly 230–300 W on
 * the lunar surface with peaks above 500 W; this is a simple fit to that range.
 */
export function metabolicWatts(speed: number, thrust: number, working: number): number {
  return 125 + 46 * Math.min(speed, 6.5) + 8 * Math.min(speed, 6.5) ** 2 + 90 * thrust + 140 * working;
}
