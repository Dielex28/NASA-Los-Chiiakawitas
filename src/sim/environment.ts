import { clamp, clamp01, lerp, smoothstep, TAU } from '../core/math';
import { LUNAR_SYNODIC_H, MARS_DECL, MARS_LAT, MOON_SUN_EL, MOON_SUN_EL_WOBBLE, WORLDS } from './worlds';
import type { DustStormEvent, EnvState, ScheduledEvent, SpeEvent, WorldId } from './types';

export interface SunPos {
  az: number;
  el: number;
  localH: number;
}

/**
 * Position of the Sun in the local sky.
 *  - Moon (south-pole ridge): the Sun skims the horizon, circling once per synodic
 *    month. Terrain, not a day/night cycle, decides when a spot is lit.
 *  - Mars (18°N): a regular 24 h 39 m sol.
 * Azimuth is measured clockwise from north; +x is east, −z is north.
 */
export function sunPosition(world: WorldId, timeH: number, startLocalH: number): SunPos {
  if (world === 'moon') {
    const az = (TAU * (startLocalH + timeH)) / LUNAR_SYNODIC_H;
    const el = MOON_SUN_EL + MOON_SUN_EL_WOBBLE * Math.cos(az - 0.6);
    const localH = (((startLocalH + timeH) % 24) + 24) % 24;
    return { az: ((az % TAU) + TAU) % TAU, el, localH };
  }
  const solH = WORLDS.mars.solH;
  const localH = (((startLocalH + timeH) % solH) + solH) % solH;
  const hourAngle = TAU * (localH / solH - 0.5);
  const sinEl = Math.sin(MARS_LAT) * Math.sin(MARS_DECL) + Math.cos(MARS_LAT) * Math.cos(MARS_DECL) * Math.cos(hourAngle);
  const el = Math.asin(clamp(sinEl, -1, 1));
  const cosAz = (Math.sin(MARS_DECL) - sinEl * Math.sin(MARS_LAT)) / (Math.max(1e-4, Math.cos(el)) * Math.cos(MARS_LAT));
  let az = Math.acos(clamp(cosAz, -1, 1));
  if (hourAngle > 0) az = TAU - az;
  return { az, el, localH };
}

/** Unit vector pointing at the Sun (x east, y up, z south). */
export function sunDirection(az: number, el: number): [number, number, number] {
  const c = Math.cos(el);
  return [Math.sin(az) * c, Math.sin(el), -Math.cos(az) * c];
}

/** Dose-rate profile of a solar particle event: fast rise (~1.5 h), slow exponential decay. */
export function speRate(ev: SpeEvent, timeH: number): number {
  const t = timeH - ev.startH;
  if (t <= 0 || t >= ev.durationH) return 0;
  const rise = 1.5;
  const tau = ev.durationH / 4;
  if (t < rise) return ev.peak * smoothstep(0, rise, t);
  const tail = smoothstep(ev.durationH, ev.durationH - 2, t);
  return ev.peak * Math.exp(-(t - rise) / tau) * tail;
}

/** Total unshielded dose of an event, mSv (numerical integral, used by forecasts and tests). */
export function speTotal(ev: SpeEvent): number {
  let sum = 0;
  const dt = 0.1;
  for (let t = 0; t < ev.durationH; t += dt) sum += speRate(ev, ev.startH + t + dt / 2) * dt;
  return sum;
}

/** Extra dust optical depth contributed by a storm at a given time. */
export function stormTau(ev: DustStormEvent, timeH: number, solH: number): number {
  const t = timeH - ev.startH;
  if (t <= 0 || t >= ev.durationH) return 0;
  const up = smoothstep(0, 1.2 * solH, t);
  const down = 1 - smoothstep(ev.durationH - 2.5 * solH, ev.durationH, t);
  return ev.peakTau * Math.min(up, down);
}

/**
 * Fraction of sunlight that reaches a sun-tracking array through a dusty atmosphere.
 * Blends direct and scattered light (after Appelbaum & Flood's Mars irradiance model):
 * dust dims the direct beam strongly but much of it comes back as diffuse sky light.
 */
export function atmosphereTransmission(tau: number, sinEl: number): number {
  if (sinEl <= 0) return 0;
  const mu = Math.max(sinEl, 0.18);
  return Math.exp((-0.3 * tau) / mu);
}

/** Visible fraction of the solar disc given the terrain horizon elevation toward the Sun. */
export function sunVisibility(sunEl: number, horizonEl: number, sunRadius: number): number {
  return smoothstep(-sunRadius, sunRadius, sunEl - horizonEl);
}

/** Interpolated horizon elevation at an azimuth from an evenly-binned horizon mask. */
export function horizonAt(mask: number[] | null, az: number): number {
  if (!mask || mask.length === 0) return 0;
  const n = mask.length;
  const f = (((az / TAU) % 1) + 1) % 1 * n;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  return lerp(mask[i0], mask[i1], f - Math.floor(f));
}

export function computeEnv(
  world: WorldId,
  timeH: number,
  startLocalH: number,
  schedule: ScheduledEvent[],
  baseHorizon: number[] | null,
  prev: EnvState | null,
  dtH: number,
): EnvState {
  const w = WORLDS[world];
  const sun = sunPosition(world, timeH, startLocalH);
  let tau = 0;
  let storm = 0;
  let spe = 0;
  for (const ev of schedule) {
    if (ev.kind === 'spe') spe += speRate(ev, timeH);
    else tau += stormTau(ev, timeH, w.solH);
  }
  let solarFactor: number;
  let outsideTarget: number;
  const sunVisBase = sunVisibility(sun.el, horizonAt(baseHorizon, sun.az), w.sunAngularRadius);
  if (world === 'mars') {
    const baseTau = 0.45 + 0.08 * Math.sin(timeH / 131) + 0.05 * Math.sin(timeH / 37 + 1.3);
    storm = clamp01(tau / 4);
    tau += baseTau;
    const sinEl = Math.sin(sun.el);
    // single-axis tracking array: cosine loss softened by tracking
    const track = sinEl > 0 ? Math.sqrt(sinEl) : 0;
    solarFactor = (w.solarConstant / 1361) * atmosphereTransmission(tau, sinEl) * track;
    // diurnal swing, flattened by dust (a real effect: storms warm the nights and cool the days)
    const swing = 30 * (1 - 0.55 * storm);
    outsideTarget = -55 + swing * Math.sin(TAU * ((sun.localH - 9) / w.solH));
  } else {
    solarFactor = sun.el > -0.02 ? 1 : 0; // vertical arrays turn to face a Sun that never climbs
    outsideTarget = lerp(-178, -42, sunVisBase);
  }
  // regolith / air temperature lags behind sunlight
  const lag = world === 'moon' ? 5 : 0.8;
  const outsideC = prev ? lerp(prev.outsideC, outsideTarget, 1 - Math.exp(-dtH / lag)) : outsideTarget;
  return {
    sunAz: sun.az,
    sunEl: sun.el,
    localH: sun.localH,
    solarFactor,
    tau,
    storm,
    outsideC,
    gcrMsvDay: w.gcrMsvDay,
    speMsvH: spe * w.speSurfaceFactor,
    sunVisBase,
  };
}

/** 0 (mild) .. 1 (deep cold): how hard heaters must work at a given outside temperature. */
export function heatFactor(outsideC: number): number {
  return clamp01((-20 - outsideC) / 160);
}
