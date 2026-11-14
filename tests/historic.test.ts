import { describe, expect, it } from 'vitest';
import { missionById } from '../src/sim/missions';
import { decideEmergency } from '../src/sim/sim';
import { WORLDS } from '../src/sim/worlds';
import type { SimState } from '../src/sim/types';
import { deployAll, run } from './helpers';

const careful = (st: SimState): void => {
  st.shelterOrder = st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
  if (st.emergency && !st.emergency.choice) decideEmergency(st, st.emergency.kind === 'eclss' ? 'backup' : 'patch');
};

describe('June 2018 on Mars: the storm that ended Opportunity', () => {
  it('the sky goes almost black for weeks (optical depth near 10.8)', () => {
    const s = deployAll('mars-2018');
    let maxTau = 0;
    run(s, 25 * WORLDS.mars.solH, 1 / 3, (st) => (maxTau = Math.max(maxTau, st.env.tau)));
    expect(maxTau).toBeGreaterThan(9);
  });

  it('a base with reactors rides it out; the same base on solar power alone does not', () => {
    const m = missionById('mars-2018');
    const nuclear = deployAll('mars-2018');
    run(nuclear, (m.durationSols + 1) * WORLDS.mars.solH, 1 / 6, careful);
    expect(nuclear.outcome?.result).toBe('success');
    const solarOnly = { ...m.recommended, reactor: 0, solar: 6, battery: 4 };
    const solar = deployAll('mars-2018', solarOnly);
    run(solar, 25 * WORLDS.mars.solH, 1 / 6, careful);
    expect(solar.stats.blackoutH).toBeGreaterThan(nuclear.stats.blackoutH + 48);
  });
});

describe('April 1970: an Apollo 13 accident on the Moon', () => {
  it('at 55 h 55 min a tank bursts: most of the oxygen is gone, the fuel cell dies, the scrubbers fail', () => {
    const s = deployAll('moon-1970');
    run(s, 55.8);
    const o2 = s.stores.o2;
    expect(s.stats.crises ?? 0).toBe(0);
    run(s, 0.3);
    expect(s.stats.crises).toBe(1);
    expect(s.stores.o2).toBeLessThan(o2 * 0.4);
    expect(s.modules.find((m) => m.type === 'fuelcell')!.down).toBe(true);
    expect(s.emergency?.kind).toBe('eclss');
  });

  it('a calm crew that uses the backup canisters gets everyone home', () => {
    const m = missionById('moon-1970');
    const s = deployAll('moon-1970');
    run(s, (m.durationSols + 1) * 24, 1 / 6, careful);
    expect(s.outcome?.result).toBe('success');
  });
});
