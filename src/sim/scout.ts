import { WORLDS } from './worlds';
import type { SimState } from './types';

type Log = (s: SimState, key: string, sev: 'info' | 'good' | 'warn' | 'bad', params?: Record<string, string | number>, ref?: number) => void;

/**
 * The robotic scout of the Mars missions: a rover of Curiosity's design that landed ahead of
 * the crew and keeps prospecting around the base. Curiosity (Gale crater, since 2012) and
 * Perseverance (Jezero, since 2021) share the same chassis; both run on a radioisotope
 * generator, which is why Curiosity kept working through the global dust storm of 2018 that
 * silenced the solar-powered Opportunity.
 *
 * Walking up to it on EVA and downloading what it gathered gives a little science, once a sol.
 */

/** Science points from one sol's worth of the scout's data. */
export const SCOUT_SCIENCE = 1;

export interface ScoutState {
  /** Sol of the last download (−1: never). */
  lastSol: number;
  downloads: number;
}

/** Only Mars missions bring the scout. */
export function hasScout(s: SimState): boolean {
  return s.world === 'mars';
}

/** Sol number of the mission clock. */
export function scoutSol(s: SimState): number {
  return Math.floor(s.timeH / WORLDS[s.world].solH);
}

/** True when today's data has not been downloaded yet. */
export function scoutReady(s: SimState): boolean {
  return hasScout(s) && (s.scout?.lastSol ?? -1) < scoutSol(s);
}

/** Download the scout's data: science once per sol. Returns the science gained (0 if nothing new). */
export function downloadScout(s: SimState, log: Log): number {
  if (!scoutReady(s)) return 0;
  const first = !s.scout?.downloads;
  s.scout = { lastSol: scoutSol(s), downloads: (s.scout?.downloads ?? 0) + 1 };
  s.science += SCOUT_SCIENCE;
  log(s, 'log.scout.download', 'good', { sci: SCOUT_SCIENCE.toFixed(1) });
  if (first) log(s, 'log.scout.first', 'info');
  return SCOUT_SCIENCE;
}
