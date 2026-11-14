import { describe, expect, it } from 'vitest';
import { TUNE } from '../src/sim/catalog';
import { collectSample } from '../src/sim/sim';
import { createTerrain, expeditionSite } from '../src/world/terrain';
import { deployAll } from './helpers';

/** Walking range of a full suit, there and back, at the game's walking pace (see game.ts). */
const SUIT_SECONDS = 540;
const WALK = 3.1;

describe('expedition', () => {
  for (const [world, seed] of [
    ['moon', 19690720],
    ['mars', 20210218],
  ] as const) {
    it(`on the ${world} the target is out of walking range but reachable by rover`, () => {
      const site = expeditionSite(createTerrain(world, seed));
      const distance = Math.hypot(site.x, site.z);
      expect(2 * distance).toBeGreaterThan(SUIT_SECONDS * WALK);
      // the rover parks on a 15° slope and slides on a 35° one (tests/vehicle.test.ts)
      expect(site.steepest).toBeLessThan(25);
    });
  }

  it('the far sample is worth more than an ordinary one, once', () => {
    const s = deployAll('moon-base');
    const before = s.science;
    expect(collectSample(s, 'freshEjecta-far', true)).toBe(true);
    expect(s.science - before).toBeCloseTo(TUNE.expeditionScience, 6);
    expect(s.flags.expedition).toBe(1);
    expect(collectSample(s, 'freshEjecta-far', true)).toBe(false);
  });
});
