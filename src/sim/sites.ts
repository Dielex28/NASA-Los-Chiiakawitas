import type { WorldId } from './types';

/**
 * Places on measured topography. The numbers come from scripts/real-terrain.py, which reads them
 * from the elevation models' own map projection (LOLA: south polar stereographic, 5 m/px).
 */
export type RealSiteId = 'shackleton' | 'ridge' | 'nobile' | 'malapert' | 'jezero';

export interface SiteInfo {
  id: RealSiteId;
  world: WorldId;
  /** Latitude and east longitude of the landing spot, degrees. */
  lat: number;
  lon: number;
  /** Bearing of local north (away from the pole) on the game grid, degrees clockwise from −z. */
  northDeg: number;
}

export const SITES: Record<RealSiteId, SiteInfo> = {
  // LOLA Site04, pixel (1442, 1254): a flat high spot on the crest of Shackleton's rim
  shackleton: { id: 'shackleton', world: 'moon', lat: -89.776, lon: -156.27, northDeg: 203.7 },
  // LOLA Site01, pixel (2542, 1982): the ridge between Shackleton and de Gerlache, an Artemis candidate
  ridge: { id: 'ridge', world: 'moon', lat: -89.373, lon: -151.45, northDeg: 208.5 },
  // LOLA Site06, pixel (1238, 2410): high ground on the rim of Nobile crater
  nobile: { id: 'nobile', world: 'moon', lat: -85.297, lon: 37.09, northDeg: 37.1 },
  // LOLA Site23, pixel (1922, 1170): the summit plateau of Malapert massif, always in view of Earth
  malapert: { id: 'malapert', world: 'moon', lat: -85.962, lon: -2.41, northDeg: 357.6 },
  // Octavia E. Butler Landing, where Perseverance touched down
  jezero: { id: 'jezero', world: 'mars', lat: 18.4447, lon: 77.4508, northDeg: 0 },
};

export const MOON_SITES: RealSiteId[] = ['shackleton', 'ridge', 'nobile', 'malapert'];
export const DEFAULT_SITE: Record<WorldId, RealSiteId> = { moon: 'shackleton', mars: 'jezero' };

/** The site a mission plays on, or null for the designed terrain. */
export function siteOf(m: { world: WorldId; realSite?: boolean | RealSiteId }): RealSiteId | null {
  if (!m.realSite) return null;
  return m.realSite === true ? DEFAULT_SITE[m.world] : m.realSite;
}

/**
 * The lunar Sun at one place. Near the pole the Sun circles the horizon once a month. Its height
 * is the latitude of the point under the Sun (between −1.54° and +1.54° over a 346.6-day
 * "eclipse year") plus the site's distance from the pole, which tilts its horizon towards the
 * Sun when the Sun is over its meridian: el = δ + (90° − |lat|)·cos(H).
 */
export interface SiteSun {
  /** Mean elevation, rad (the Sun's southern declination this season). */
  el0: number;
  /** Swing over the month, rad (the colatitude). */
  wob: number;
  /** Bearing of local north on the grid, rad: the Sun is highest when it stands there. */
  north: number;
  /** The Sun goes round the other way: westwards, as on the real Moon. */
  real: true;
}

/** Southern declination used for the real-terrain scenarios: southern summer, close to the maximum. */
export const SOUTH_SUMMER_DEG = 1.2;

export function siteSun(id: RealSiteId | null, southDeg = SOUTH_SUMMER_DEG): SiteSun | undefined {
  if (!id) return undefined;
  const s = SITES[id];
  if (s.world !== 'moon') return undefined;
  const rad = Math.PI / 180;
  return { el0: southDeg * rad, wob: (90 - Math.abs(s.lat)) * rad, north: s.northDeg * rad, real: true };
}
