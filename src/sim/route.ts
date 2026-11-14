/**
 * EVA route planning. Before stepping outside, Apollo crews planned every traverse: how far, how
 * steep, how long, and the "walkback limit" — the rover could never take them further than they
 * could walk back with the oxygen left in their backpacks. This works out the same numbers for a
 * route drawn on the terrain, with the game's own suit and rover models so the estimate holds.
 */

export interface RoutePoint {
  x: number;
  z: number;
}

/** The suit model shared with the game: consumables last SUIT_S real seconds at NOMINAL_W. */
export const SUIT_S = 540;
export const NOMINAL_W = 345;
/** Walking pace the estimate assumes, m/s (the game's steady loping walk). */
export const WALK_MS = 3.1;
/** Astronaut plus suit, kg (Apollo A7LB suit and backpack ≈ 90 kg, plus the person). */
export const SUITED_KG = 165;
/** Muscle efficiency turning food energy into climbing work. */
export const MUSCLE_EFF = 0.25;
/** Metabolic rate while working at a stop, W, and while sitting in the rover, W. */
export const WORK_W = 265;
export const SEATED_W = 160;
/** Rover: mass, rolling resistance, cruise speed, drive efficiency, electronics, usable battery. */
export const ROVER = { mass: 620, rolling: 0.06, speed: 4, efficiency: 0.8, hotelW: 120, kwh: 9 };
/** Slopes: above WARN a walk gets risky; above STEEP it is not safe on foot or by rover. */
export const SLOPE_WARN = 15;
export const SLOPE_STEEP = 25;
/** Suit left on arrival that counts as a safe margin. */
export const RESERVE = 0.15;

export interface RouteLeg {
  from: RoutePoint;
  to: RoutePoint;
  dist: number;
  climb: number;
  descent: number;
  maxSlope: number;
}

export interface RoutePlan {
  legs: RouteLeg[];
  /** Out along the waypoints, and the whole loop back to the airlock, m. */
  outbound: number;
  total: number;
  climb: number;
  maxSlope: number;
  /** Sample spans steeper than SLOPE_WARN and SLOPE_STEEP, m. */
  steepM: number;
  tooSteepM: number;
  /** Real seconds on the route on foot (including the stops) — mission minutes, as on EVA. */
  walkS: number;
  /** Fraction of the suit used walking the loop, and driving it in the rover. */
  suitWalk: number;
  suitRover: number;
  /** Fraction of the rover battery the loop takes. */
  battery: number;
  /** Farthest waypoint from the airlock, straight line, m. */
  farthest: number;
  /** By rover: could the crew walk back from every waypoint with the suit left there? */
  walkbackOk: boolean;
  /** Suit fraction needed to walk back from the worst waypoint, after driving there. */
  walkbackNeed: number;
}

/** Suit fraction used for `seconds` at `watts`. */
const suitFor = (seconds: number, watts: number): number => (seconds / SUIT_S) * (watts / NOMINAL_W);

/**
 * Work out a plan: start at the airlock, visit the points in order, come back. `ground` gives the
 * terrain height; `stopS` is the real seconds of work at each waypoint (one per mission minute).
 */
export function planRoute(start: RoutePoint, points: RoutePoint[], ground: (x: number, z: number) => number, gravity: number, stopS = 15): RoutePlan {
  const path = [start, ...points, start];
  const legs: RouteLeg[] = [];
  let steepM = 0;
  let tooSteepM = 0;
  const step = 4;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(dist / step));
    let climb = 0;
    let descent = 0;
    let maxSlope = 0;
    let prev = ground(a.x, a.z);
    for (let k = 1; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const z = a.z + ((b.z - a.z) * k) / n;
      const y = ground(x, z);
      const dy = y - prev;
      const run = dist / n;
      const slope = (Math.atan2(Math.abs(dy), run) * 180) / Math.PI;
      if (dy > 0) climb += dy;
      else descent -= dy;
      if (slope > maxSlope) maxSlope = slope;
      if (slope > SLOPE_WARN) steepM += run;
      if (slope > SLOPE_STEEP) tooSteepM += run;
      prev = y;
    }
    legs.push({ from: a, to: b, dist, climb, descent, maxSlope });
  }
  const total = legs.reduce((s, l) => s + l.dist, 0);
  const outbound = legs.slice(0, -1).reduce((s, l) => s + l.dist, 0);
  const climb = legs.reduce((s, l) => s + l.climb, 0);
  const climbJ = (SUITED_KG * gravity * climb) / MUSCLE_EFF;
  const stops = points.length * stopS;
  const walkS = total / WALK_MS + stops;
  const suitWalk = suitFor(total / WALK_MS, NOMINAL_W) + climbJ / NOMINAL_W / SUIT_S + suitFor(stops, WORK_W);
  const driveS = total / ROVER.speed;
  const suitRover = suitFor(driveS, SEATED_W) + suitFor(stops, WORK_W);
  // rover energy: rolling resistance and climbing at the wheels, plus the electronics; the game
  // counts one real second as a mission minute for energy too
  const wheelJ = ROVER.mass * gravity * (ROVER.rolling * total + climb);
  const batteryKwh = (wheelJ / ROVER.efficiency + ROVER.hotelW * driveS) / 60 / 1000;
  const battery = batteryKwh / ROVER.kwh;
  // walkback: drive out to each waypoint, then walk straight home from there
  let walkbackNeed = 0;
  let along = 0;
  let farthest = 0;
  for (let i = 0; i < points.length; i++) {
    along += legs[i].dist;
    const home = Math.hypot(points[i].x - start.x, points[i].z - start.z);
    farthest = Math.max(farthest, home);
    const used = suitFor(along / ROVER.speed, SEATED_W) + suitFor((i + 1) * stopS, WORK_W);
    walkbackNeed = Math.max(walkbackNeed, used + suitFor(home / WALK_MS, NOMINAL_W));
  }
  return {
    legs,
    outbound,
    total,
    climb,
    maxSlope: legs.reduce((m, l) => Math.max(m, l.maxSlope), 0),
    steepM,
    tooSteepM,
    walkS,
    suitWalk,
    suitRover,
    battery,
    farthest,
    walkbackOk: walkbackNeed <= 1 - RESERVE,
    walkbackNeed,
  };
}

/** How a plan reads at a glance: fine, risky or not to be attempted. */
export function verdict(p: RoutePlan, rover: boolean): 'ok' | 'warn' | 'bad' {
  const suit = rover ? p.suitRover : p.suitWalk;
  if (p.tooSteepM > 8 || suit > 1 - RESERVE || (rover && (p.battery > 0.9 || !p.walkbackOk))) return 'bad';
  if (p.steepM > 20 || suit > 0.65 || (rover && p.battery > 0.6)) return 'warn';
  return 'ok';
}
