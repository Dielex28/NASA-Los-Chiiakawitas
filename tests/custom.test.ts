import { describe, expect, it } from 'vitest';
import { DEFAULT_CUSTOM, decodeCustom, encodeCustom, normalizeCode, type CustomSpec } from '../src/sim/custom';
import { buildSchedule, customMission, missionById } from '../src/sim/missions';
import { decideEmergency, manifestMass } from '../src/sim/sim';
import { WORLDS } from '../src/sim/worlds';
import { deployAll, run } from './helpers';

const extreme: CustomSpec = {
  world: 'mars',
  days: 120,
  crew: 6,
  budgetKg: 20000,
  scienceGoal: 400,
  doseLimitMsv: 300,
  spe: 3,
  speClass: 3,
  storms: 3,
  stormLevel: 3,
  emergencies: 3,
  fuelKg: 4000,
  resupply: 2,
  realSite: true,
  delayMin: 22,
  variant: 4095,
};

describe('teacher mission editor', () => {
  it('a code gives back exactly the mission it was made from', () => {
    for (const spec of [DEFAULT_CUSTOM.moon, DEFAULT_CUSTOM.mars, extreme, { ...DEFAULT_CUSTOM.moon, days: 3, crew: 1, budgetKg: 3000, variant: 0 }]) {
      const code = encodeCustom(spec);
      expect(code).toMatch(/^H[0-9A-Z]{4}-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
      expect(decodeCustom(code)).toEqual(spec);
    }
  });

  it('codes survive lower case, missing dashes and O/I look-alikes, and catch typos', () => {
    const code = encodeCustom(extreme);
    expect(normalizeCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
    expect(normalizeCode(code.replace(/0/g, 'O').replace(/1/g, 'I'))).toBe(code);
    // change any one character: the check digit notices
    for (let i = 1; i < code.length; i++) {
      if (code[i] === '-') continue;
      const other = code[i] === 'A' ? 'B' : 'A';
      expect(decodeCustom(code.slice(0, i) + other + code.slice(i + 1)), `position ${i}`).toBeNull();
    }
    expect(decodeCustom('hello')).toBeNull();
  });

  it('the Moon has no dust storms or radio delay, whatever the code says', () => {
    const spec = decodeCustom(encodeCustom({ ...DEFAULT_CUSTOM.moon, storms: 3, delayMin: 20 }))!;
    expect(spec.storms).toBe(0);
    expect(spec.delayMin).toBe(0);
    expect(customMission(spec).storms).toEqual([]);
  });

  it('builds the events the teacher asked for, and a cargo list that fits the budget', () => {
    for (const spec of [DEFAULT_CUSTOM.moon, DEFAULT_CUSTOM.mars, extreme, { ...DEFAULT_CUSTOM.mars, budgetKg: 3000 }]) {
      const m = customMission(spec);
      expect(missionById(m.id)).toEqual(m);
      expect(manifestMass(m.recommended)).toBeLessThanOrEqual(m.budgetKg);
      const ev = buildSchedule(m, m.seed);
      expect(ev.filter((e) => e.kind === 'spe').length).toBe(spec.spe);
      expect(ev.filter((e) => e.kind === 'storm').length).toBe(spec.world === 'mars' ? spec.storms : 0);
      expect(m.emergencies?.length).toBe(spec.emergencies);
      expect(m.resupply.length).toBe(spec.resupply);
      for (const e of ev) expect(e.startH).toBeLessThan(spec.days * WORLDS[spec.world].solH);
    }
  });

  for (const world of ['moon', 'mars'] as const) {
    it(`the default ${world} mission can be won with its suggested cargo`, () => {
      const m = customMission(DEFAULT_CUSTOM[world]);
      const s = deployAll(m.id);
      run(s, (m.durationSols + 1) * WORLDS[world].solH, 1 / 6, (st) => {
        st.shelterOrder = st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
        if (st.emergency && !st.emergency.choice) decideEmergency(st, st.emergency.kind === 'eclss' ? 'repair' : 'patch');
      });
      expect(s.outcome?.result).toBe('success');
    });
  }
});
