import { describe, expect, it } from 'vitest';
import { lessons } from '../src/sim/advisor';
import { deconditioning, rehabMonths, step } from '../src/sim/sim';
import type { SimState } from '../src/sim/types';
import { deployAll, run } from './helpers';

const calm = (id: string, exercise: 0 | 1 | 2): SimState => {
  const s = deployAll(id, undefined, undefined, (m) => ({ ...m, spe: [], storms: [], emergencies: [] }));
  s.exercise = exercise;
  return s;
};
const avg = (s: SimState, k: 'bone' | 'muscle'): number => s.crew.reduce((a, c) => a + (c[k] ?? 100), 0) / s.crew.length;

describe('long-term health in low gravity', () => {
  it('the Moon takes more than Mars (less gravity), and exercise holds most of it back', () => {
    const moon = calm('moon-base', 0);
    const mars = calm('mars-first', 0);
    expect(deconditioning(moon).bone).toBeGreaterThan(deconditioning(mars).bone);
    // ISS-like 1.5 %/month scaled by the missing gravity: 1.25 %/month on the Moon
    expect(deconditioning(moon).bone * 30).toBeCloseTo(1.5 * (1 - 1.62 / 9.81), 2);
    moon.exercise = 2;
    expect(deconditioning(moon).bone * 30).toBeLessThan(0.2);
  });

  it('a month on the Moon without exercise leaves the crew weaker; two hours a day keep them fit', () => {
    const lazy = calm('moon-base', 0);
    const fit = calm('moon-base', 2);
    run(lazy, 30 * 24, 1 / 3);
    run(fit, 30 * 24, 1 / 3);
    expect(avg(lazy, 'muscle')).toBeLessThan(93);
    expect(avg(lazy, 'bone')).toBeLessThan(99);
    expect(avg(fit, 'muscle')).toBeGreaterThan(99);
    expect(avg(fit, 'bone')).toBeGreaterThan(99.8);
    expect(rehabMonths(lazy.crew[0])).toBeGreaterThan(rehabMonths(fit.crew[0]));
    expect(lessons(lazy).some((l) => l.key === 'deconditioned')).toBe(true);
    expect(lessons(fit).some((l) => l.key === 'fit')).toBe(true);
  });

  it('exercise costs work hours', () => {
    const hours = (exercise: 0 | 2): number => {
      const s = calm('moon-base', exercise);
      step(s, 1);
      const h = s.flows.crewHours;
      return h.maintain + h.science + h.farm + h.build;
    };
    expect(hours(2)).toBeLessThan(hours(0) * 0.85);
  });
});
