import { describe, expect, it } from 'vitest';
import { TUNE } from '../src/sim/catalog';
import { missionById } from '../src/sim/missions';
import { recomputeCaps, setEnabled } from '../src/sim/sim';
import type { SimState } from '../src/sim/types';
import { deployAll, run } from './helpers';

/** A base with a propellant plant, plenty of power and a full water store. */
const base = (id: 'moon-base' | 'mars-first', plantOn: boolean): SimState => {
  const s = deployAll(id, { ...missionById(id).recommended, propellant: 1, reactor: 2, tank: 2 }, undefined, (m) => ({ ...m, spe: [], emergencies: [], storms: [] }));
  s.cfg.hazard = 0;
  // skip the assembly: this test is about the chemistry
  for (const m of s.modules) m.built = 1;
  recomputeCaps(s);
  run(s, 6);
  const plant = s.modules.find((m) => m.type === 'propellant')!;
  setEnabled(s, plant.id, plantOn);
  // a fair comparison between worlds: the plant gets its full 10 kW
  plant.priority = 1;
  for (const m of s.modules) if (m.type === 'greenhouse') setEnabled(s, m.id, false);
  s.stores.water = s.caps.water;
  return s;
};

describe('return propellant', () => {
  for (const id of ['moon-base', 'mars-first'] as const) {
    it(`on ${id === 'moon-base' ? 'the Moon' : 'Mars'} each kilo of water makes the right amount of propellant, at the plant's power limit`, () => {
      const s = base(id, true);
      const before = s.stats.propellantMade ?? 0;
      run(s, 10);
      const made = (s.stats.propellantMade ?? 0) - before;
      expect((s.stats.propellantMade ?? 0) / (s.stats.propellantWater ?? 1)).toBeCloseTo(TUNE.propPerWaterKg[s.world], 6);
      expect(made / 10).toBeCloseTo(10 / TUNE.propKwhPerKg[s.world], 0);
    });
  }

  it('on Mars the same plant and power make about twice as much as on the Moon', () => {
    const moon = base('moon-base', true);
    const mars = base('mars-first', true);
    const m0 = moon.stores.propellant ?? 0;
    const r0 = mars.stores.propellant ?? 0;
    run(moon, 10);
    run(mars, 10);
    expect(((mars.stores.propellant ?? 0) - r0) / ((moon.stores.propellant ?? 0) - m0)).toBeGreaterThan(1.8);
  });

  it('never takes the crew’s drinking water', () => {
    const s = base('moon-base', true);
    const reserve = s.crew.length * 11 * 4;
    s.stores.water = reserve * 0.75;
    let made = s.stores.propellant ?? 0;
    run(s, 12, 1 / 6, (st) => {
      const now = st.stores.propellant ?? 0;
      if (now > made + 1e-9) expect(st.stores.water).toBeGreaterThan(reserve - 1);
      made = now;
    });
  });

  it('meeting the mission objective pays science once', () => {
    const s = base('moon-base', true);
    const science = s.science;
    s.stores.propellant = (s.cfg.fuelGoalKg ?? 0) - 1;
    run(s, 2);
    expect(s.flags.fuelDone).toBe(1);
    expect(s.science - science).toBeGreaterThanOrEqual(TUNE.fuelScience);
  });
});
