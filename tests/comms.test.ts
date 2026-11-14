import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { CONTROL_ANALYSIS_H, controlRoundTripH, triggerEmergency } from '../src/sim/emergency';
import { commsDelay, dailyMission, missionById } from '../src/sim/missions';
import { askMissionControl, decideEmergency, isolation, pushLog } from '../src/sim/sim';
import type { SimState } from '../src/sim/types';
import { deployAll, run } from './helpers';

/** A base with everything built, no scripted events and no random breakdowns. */
const quiet = (id: string): SimState => {
  const s = deployAll(id, undefined, undefined, (m) => ({ ...m, spe: [], storms: [], emergencies: [] }));
  s.cfg.hazard = 0;
  // until the antenna (and everything before it) is built
  for (let h = 0; h < 400 && !s.flows.comms; h += 2) run(s, 2);
  run(s, 2);
  return s;
};
const leak = (s: SimState): void => {
  const hab = s.modules.find((m) => m.type === 'hab')!;
  expect(triggerEmergency(s, 'leak', new Rng(1), pushLog, hab)).toBe(true);
};

describe('radio delay to Earth', () => {
  it('is 1.3 s from the Moon and minutes from Mars, as on the real dates', () => {
    expect(commsDelay(missionById('moon-base')) * 60).toBeCloseTo(1.28, 2);
    expect(commsDelay(missionById('mars-first'))).toBeCloseTo(11.4, 1); // Perseverance, 18 Feb 2021
    expect(commsDelay(missionById('mars-2017'))).toBeGreaterThan(18); // just after solar conjunction
    for (let d = 1; d <= 28; d++) {
      const m = dailyMission(`202612${String(d).padStart(2, '0')}`);
      const delay = commsDelay(m);
      if (m.world === 'mars') expect(delay).toBeGreaterThanOrEqual(3);
      if (m.world === 'mars') expect(delay).toBeLessThanOrEqual(22);
    }
  });

  it("Control's answer takes a light round trip plus the analysis", () => {
    const moon = quiet('moon-base');
    expect(controlRoundTripH(moon)).toBeCloseTo(CONTROL_ANALYSIS_H, 2);
    const mars = quiet('mars-first');
    expect(controlRoundTripH(mars) * 60).toBeCloseTo(2 * 11.4 + CONTROL_ANALYSIS_H * 60, 0);
    leak(mars);
    expect(askMissionControl(mars)).toBe(true);
    expect(askMissionControl(mars)).toBe(false); // one question per emergency
    run(mars, controlRoundTripH(mars) - 0.05);
    expect(mars.emergency?.advice).toBeUndefined();
    run(mars, 0.1);
    expect(mars.emergency?.advice).toBe('patch');
  });

  it("following Control's procedure makes the fix quicker, but waiting for it costs air", () => {
    const alone = quiet('mars-first');
    leak(alone);
    decideEmergency(alone, 'patch');
    const aloneLeft = alone.emergency!.doneH! - alone.timeH;
    run(alone, 6);

    const helped = quiet('mars-first');
    leak(helped);
    askMissionControl(helped);
    run(helped, controlRoundTripH(helped) + 0.05);
    decideEmergency(helped, helped.emergency!.advice!);
    expect(helped.emergency!.doneH! - helped.timeH).toBeLessThan(aloneLeft * 0.7);
    expect(helped.stats.controlFollowed).toBe(1);
    run(helped, 6);
    expect(helped.emergency).toBeNull();
    // on Mars, waiting ~40 min with the full leak loses more than the quicker patch saves
    expect(helped.stats.emergencyO2Lost!).toBeGreaterThan(alone.stats.emergencyO2Lost!);
  });

  it('without an antenna there is nobody to ask', () => {
    const s = quiet('moon-base');
    for (const m of s.modules) if (m.type === 'antenna') m.enabled = false;
    run(s, 0.5);
    expect(s.flows.comms).toBe(false);
    leak(s);
    expect(askMissionControl(s)).toBe(false);
    expect(s.log.some((l) => l.key === 'log.control.nolink')).toBe(true);
  });

  it('the distance weighs on morale on Mars, not on the Moon', () => {
    expect(isolation(quiet('moon-base'))).toBe(0);
    const mars = quiet('mars-2017');
    expect(isolation(mars)).toBeGreaterThan(5);
  });
});
