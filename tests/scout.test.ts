import { describe, expect, it } from 'vitest';
import { pushLog } from '../src/sim/sim';
import { downloadScout, hasScout, scoutReady, SCOUT_SCIENCE } from '../src/sim/scout';
import { WORLDS } from '../src/sim/worlds';
import { deployAll } from './helpers';

describe('robotic scout', () => {
  it('only Mars missions bring it', () => {
    expect(hasScout(deployAll('moon-base'))).toBe(false);
    const mars = deployAll('mars-first');
    expect(hasScout(mars)).toBe(true);
    expect(downloadScout(deployAll('moon-base'), pushLog)).toBe(0);
  });

  it('its data gives science once a sol, and again the next sol', () => {
    const s = deployAll('mars-first');
    const sci = s.science;
    expect(scoutReady(s)).toBe(true);
    expect(downloadScout(s, pushLog)).toBe(SCOUT_SCIENCE);
    expect(s.science).toBeCloseTo(sci + SCOUT_SCIENCE);
    // the same sol: nothing new to download
    expect(scoutReady(s)).toBe(false);
    expect(downloadScout(s, pushLog)).toBe(0);
    expect(s.science).toBeCloseTo(sci + SCOUT_SCIENCE);
    // next sol
    s.timeH += WORLDS.mars.solH;
    expect(scoutReady(s)).toBe(true);
    expect(downloadScout(s, pushLog)).toBe(SCOUT_SCIENCE);
    expect(s.scout?.downloads).toBe(2);
    expect(s.log.some((e) => e.key === 'log.scout.first')).toBe(true);
  });
});
