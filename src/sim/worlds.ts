import type { WorldId } from './types';

/**
 * Physical parameters of the two destinations. Values are real unless a comment
 * says they were adapted for play. Sources are listed in docs/SCIENCE.md.
 */
export interface WorldDef {
  id: WorldId;
  gravity: number;
  /** Length of the calendar day used by the mission clock, hours. */
  solH: number;
  /** Solar irradiance at the top of the atmosphere, W/m². */
  solarConstant: number;
  /** Unshielded surface dose-equivalent rate from galactic cosmic rays, mSv/day. */
  gcrMsvDay: number;
  /** Fraction of a solar-particle-event dose that reaches the surface (atmospheric shielding). */
  speSurfaceFactor: number;
  /** One-way light time to Earth, seconds (min, max). */
  lightDelayS: [number, number];
  /** Thermal time constant of an unpowered habitat, hours. */
  thermalTauH: number;
  /** Extra wear from abrasive dust. */
  wearFactor: number;
  hasAtmosphere: boolean;
  /** Angular radius of the solar disc, radians. */
  sunAngularRadius: number;
}

export const WORLDS: Record<WorldId, WorldDef> = {
  moon: {
    id: 'moon',
    gravity: 1.62,
    solH: 24, // mission clock counts Earth days; the Sun takes 708.7 h to circle the horizon
    solarConstant: 1361,
    gcrMsvDay: 1.37, // Lunar Lander Neutrons & Dosimetry (Chang'e 4), 2020: 1369 µSv/day
    speSurfaceFactor: 1,
    lightDelayS: [1.25, 1.35],
    thermalTauH: 72,
    wearFactor: 1,
    hasAtmosphere: false,
    sunAngularRadius: 0.00465,
  },
  mars: {
    id: 'mars',
    gravity: 3.71,
    solH: 24.6597, // 24 h 39 m 35 s
    solarConstant: 586, // mean; varies 492–715 W/m² with orbital eccentricity
    gcrMsvDay: 0.67, // MSL/RAD, Gale crater (Hassler et al. 2014: 0.64 ± 0.12)
    speSurfaceFactor: 0.3, // ~20 g/cm² of CO₂ overhead stops most solar protons
    lightDelayS: [186, 1342],
    thermalTauH: 48,
    wearFactor: 1.15,
    hasAtmosphere: true,
    sunAngularRadius: 0.00305,
  },
};

/** Hours for the Sun to return to the same azimuth at the lunar pole (synodic month). */
export const LUNAR_SYNODIC_H = 708.7;
/** Site latitude / solar declination used for the Mars scenario (Jezero-like, northern spring). */
export const MARS_LAT = 18.4 * (Math.PI / 180);
export const MARS_DECL = 9 * (Math.PI / 180);
/** Mean and seasonal wobble of solar elevation at the lunar south-pole ridge site (radians). */
export const MOON_SUN_EL = 4.6 * (Math.PI / 180);
export const MOON_SUN_EL_WOBBLE = 1.1 * (Math.PI / 180);
