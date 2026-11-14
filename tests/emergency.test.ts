import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { DECIDE_H, LEAK_O2_KGH, LIOH_H, emergencyOptions, triggerEmergency } from '../src/sim/emergency';
import { decideEmergency, pushLog } from '../src/sim/sim';
import type { SimState } from '../src/sim/types';
import { deployAll, run } from './helpers';

const hab = (s: SimState) => s.modules.find((m) => m.type === 'hab')!;
const start = (s: SimState, kind: 'leak' | 'meteor' | 'eclss'): void => {
  const m = kind === 'eclss' ? s.modules.find((x) => x.type === 'eclss')! : hab(s);
  expect(triggerEmergency(s, kind, new Rng(1), pushLog, m)).toBe(true);
};
/** A base with everything built and nothing else going on. */
const quiet = (): SimState => {
  const s = deployAll('moon-base', undefined, undefined, (m) => ({ ...m, spe: [], emergencies: [] }));
  run(s, 20);
  s.cfg.hazard = 0;
  return s;
};

describe('emergencies', () => {
  it('sealing off a punctured module stops the leak at once but takes the module out of use', () => {
    const s = quiet();
    start(s, 'meteor');
    run(s, 0.5);
    expect(decideEmergency(s, 'isolate')).toBe(true);
    expect(s.emergency).toBeNull();
    expect(hab(s).down).toBe(true);
    const lost = s.stats.emergencyO2Lost!;
    expect(lost).toBeCloseTo(LEAK_O2_KGH.meteor * 0.5, 0);
  });

  it('patching from inside keeps the module in use, at the price of more oxygen', () => {
    const s = quiet();
    start(s, 'leak');
    run(s, 0.25);
    decideEmergency(s, 'patch');
    expect(s.emergency?.choice).toBe('patch');
    run(s, 4);
    expect(s.emergency).toBeNull();
    expect(hab(s).down).toBe(false);
    expect(s.stats.emergencyO2Lost!).toBeGreaterThan(LEAK_O2_KGH.leak * 0.25 + 1);
  });

  it('if nobody decides, the crew seals the module when time runs out, after losing more air', () => {
    const fast = quiet();
    start(fast, 'leak');
    run(fast, 0.2);
    decideEmergency(fast, 'isolate');
    const slow = quiet();
    start(slow, 'leak');
    run(slow, DECIDE_H + 0.2);
    expect(slow.emergency).toBeNull();
    expect(slow.stats.emergencyAuto).toBe(1);
    expect(hab(slow).down).toBe(true);
    expect(slow.stats.emergencyO2Lost!).toBeGreaterThan(5 * fast.stats.emergencyO2Lost!);
  });

  it('emergency canisters hold CO2 down while the scrubbers are broken, but only once', () => {
    const waiting = quiet();
    start(waiting, 'eclss');
    run(waiting, 1.4);
    const canisters = quiet();
    start(canisters, 'eclss');
    expect(emergencyOptions(canisters)).toEqual(['repair', 'backup']);
    decideEmergency(canisters, 'backup');
    run(canisters, 1.4);
    expect(canisters.cabin.co2Kg).toBeLessThan(waiting.cabin.co2Kg);
    run(canisters, LIOH_H);
    expect(canisters.emergency).toBeNull();
    start(canisters, 'eclss');
    expect(emergencyOptions(canisters)).toEqual(['repair']);
  });

  it('a repair brings the scrubbers back', () => {
    const s = quiet();
    start(s, 'eclss');
    decideEmergency(s, 'repair');
    run(s, 3.2);
    expect(s.emergency).toBeNull();
    expect(s.modules.find((m) => m.type === 'eclss')!.down).toBe(false);
  });

  it('scripted emergencies happen in the missions that plan them', () => {
    const s = deployAll('moon-base');
    expect(s.emergencyPlan?.length).toBe(1);
    run(s, 15 * 24, 1 / 6, (st) => {
      if (st.emergency && !st.emergency.choice) decideEmergency(st, 'patch');
      st.shelterOrder = st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
    });
    expect(s.emergencyPlan![0].fired).toBe(true);
    expect(s.stats.emergencies).toBeGreaterThanOrEqual(1);
  });
});
