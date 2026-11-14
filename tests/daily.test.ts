import { describe, expect, it } from 'vitest';
import { buildSchedule, dailyCode, dailyMission, missionById } from '../src/sim/missions';
import { decideEmergency, manifestMass } from '../src/sim/sim';
import { WORLDS } from '../src/sim/worlds';
import { deployAll, run } from './helpers';

describe('daily challenge', () => {
  it('the same code always gives the same mission and events', () => {
    const a = dailyMission('20261114');
    const b = dailyMission('20261114');
    expect(a).toEqual(b);
    expect(buildSchedule(a, a.seed)).toEqual(buildSchedule(b, b.seed));
    expect(missionById('daily-20261114').world).toBe(a.world);
  });

  it('different days give different challenges, on both worlds, with two twists', () => {
    const worlds = new Set<string>();
    const twists = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const m = dailyMission(`202611${String(d).padStart(2, '0')}`);
      worlds.add(m.world);
      expect(m.twists.length).toBe(2);
      expect(new Set(m.twists).size).toBe(2);
      twists.add(m.twists.join('+'));
      expect(manifestMass(m.recommended)).toBeLessThanOrEqual(m.budgetKg);
    }
    expect(worlds.size).toBe(2);
    expect(twists.size).toBeGreaterThan(4);
  });

  it('the code is the local date', () => {
    expect(dailyCode(new Date(2026, 10, 14))).toBe('20261114');
  });

  for (const code of ['20261114', '20261115', '20261116']) {
    it(`challenge ${code} can be won with the recommended cargo and a careful commander`, () => {
      const m = dailyMission(code);
      const s = deployAll(`daily-${code}`);
      run(s, (m.durationSols + 1) * WORLDS[m.world].solH, 1 / 6, (st) => {
        st.shelterOrder = st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
        if (st.emergency && !st.emergency.choice) decideEmergency(st, st.emergency.kind === 'eclss' ? 'repair' : 'patch');
      });
      expect(s.outcome?.result, `${m.world} ${m.twists.join('+')}`).toBe('success');
    });
  }
});
