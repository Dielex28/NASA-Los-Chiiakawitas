import { describe, expect, it } from 'vitest';
import { LUNAR_SYNODIC_H } from '../src/sim/worlds';
import { sunPosition } from '../src/sim/environment';
import { missionById } from '../src/sim/missions';
import { SITES, siteOf, siteSun } from '../src/sim/sites';
import { decideEmergency } from '../src/sim/sim';
import { WORLDS } from '../src/sim/worlds';
import { deployAll, flatProbe, run } from './helpers';

/** Fraction of a lunar month the Sun's centre is above a flat horizon at a site. */
const daylight = (id: 'shackleton' | 'ridge' | 'nobile' | 'malapert'): number => {
  const sun = siteSun(id)!;
  let up = 0;
  const n = 720;
  for (let i = 0; i < n; i++) if (sunPosition('moon', (LUNAR_SYNODIC_H * i) / n, 0, sun).el > 0) up++;
  return up / n;
};

describe('real lunar sites', () => {
  it('latitudes come from the LOLA tiles: two sites by the pole, two about 4° away', () => {
    expect(SITES.shackleton.lat).toBeCloseTo(-89.78, 1);
    expect(SITES.ridge.lat).toBeCloseTo(-89.37, 1);
    expect(SITES.nobile.lat).toBeCloseTo(-85.3, 1);
    expect(SITES.malapert.lat).toBeCloseTo(-85.96, 1);
  });

  it('the Sun swings by the colatitude around the season mean: never sets on the rim crests, sets for ~40 % of the month further out', () => {
    const sh = siteSun('shackleton')!;
    expect(((sh.el0 + sh.wob) * 180) / Math.PI).toBeCloseTo(1.2 + 0.224, 2);
    expect(daylight('shackleton')).toBe(1);
    expect(daylight('ridge')).toBe(1);
    expect(daylight('nobile')).toBeGreaterThan(0.55);
    expect(daylight('nobile')).toBeLessThan(0.62);
    expect(daylight('malapert')).toBeGreaterThan(0.55);
    expect(daylight('malapert')).toBeLessThan(0.65);
  });

  it('the Sun is highest over the site meridian and goes round westwards', () => {
    const sun = siteSun('nobile')!;
    const a = sunPosition('moon', 0, 0, sun);
    expect(a.az).toBeCloseTo(sun.north, 5);
    expect(a.el).toBeCloseTo(sun.el0 + sun.wob, 6);
    const b = sunPosition('moon', 10, 0, sun);
    const d = ((b.az - a.az + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    expect(d).toBeLessThan(0);
  });

  it('missions land where they say, with the right Sun', () => {
    expect(siteOf(missionById('moon-real'))).toBe('shackleton');
    expect(siteOf(missionById('mars-real'))).toBe('jezero');
    expect(siteOf(missionById('moon-nobile'))).toBe('nobile');
    expect(siteOf(missionById('moon-base'))).toBeNull();
    const s = deployAll('moon-malapert', undefined, flatProbe);
    expect(s.cfg.sun).toBeDefined();
    expect(s.env.sunEl).toBeGreaterThan(0); // landed after sunrise
    expect(s.env.sunEl).toBeLessThan((1 * Math.PI) / 180);
  });

  for (const id of ['moon-ridge', 'moon-malapert', 'moon-nobile']) {
    it(`${id} can be won with its recommended cargo`, () => {
      const m = missionById(id);
      const s = deployAll(id, undefined, flatProbe);
      run(s, (m.durationSols + 1) * WORLDS.moon.solH, 1 / 6, (st) => {
        st.shelterOrder = st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
        if (st.emergency && !st.emergency.choice) decideEmergency(st, st.emergency.kind === 'eclss' ? 'repair' : 'patch');
      });
      expect(s.outcome?.result, JSON.stringify(s.outcome)).toBe('success');
    });
  }
});
