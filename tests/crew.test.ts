import { describe, expect, it } from 'vitest';
import { specialist } from '../src/sim/sim';
import { deployAll, run } from './helpers';

describe('crew specialities', () => {
  it('a fit engineer repairs faster; an injured one does not help', () => {
    const repaired = (engineerHealth: number | null): number => {
      const s = deployAll('moon-base', undefined, undefined, (m) => ({ ...m, spe: [], emergencies: [] }));
      s.cfg.hazard = 0;
      const eng = s.crew.find((c) => c.role === 'engineer')!;
      if (engineerHealth === null) eng.role = 'geologist';
      else eng.health = engineerHealth;
      run(s, 2);
      const solar = s.modules.find((m) => m.type === 'solar')!;
      solar.condition = 40;
      const before = solar.condition;
      run(s, 6);
      return solar.condition - before;
    };
    const withEngineer = repaired(100);
    const without = repaired(null);
    expect(withEngineer).toBeGreaterThan(without * 1.2);
    expect(specialist(deployAll('moon-first'), 'medic')).toBe(1);
  });
});
