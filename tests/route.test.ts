import { describe, expect, it } from 'vitest';
import { NOMINAL_W, RESERVE, SUIT_S, WALK_MS, planRoute, verdict } from '../src/sim/route';

const flat = (): number => 0;
const moonG = 1.62;

describe('EVA route planner', () => {
  it('a loop on flat ground costs exactly the suit time the game would drain', () => {
    const p = planRoute({ x: 0, z: 0 }, [{ x: 300, z: 0 }], flat, moonG, 0);
    expect(p.outbound).toBeCloseTo(300, 6);
    expect(p.total).toBeCloseTo(600, 6);
    expect(p.climb).toBe(0);
    expect(p.suitWalk).toBeCloseTo(600 / WALK_MS / SUIT_S, 6);
    expect(verdict(p, false)).toBe('ok');
  });

  it('a long walk eats the reserve; the rover goes further on the same suit', () => {
    const far = planRoute({ x: 0, z: 0 }, [{ x: 800, z: 0 }], flat, moonG);
    expect(far.suitWalk).toBeGreaterThan(1 - RESERVE);
    expect(verdict(far, false)).toBe('bad');
    expect(far.suitRover).toBeLessThan(far.suitWalk / 2);
    expect(far.battery).toBeGreaterThan(0);
    expect(far.battery).toBeLessThan(0.6);
  });

  it('climbing costs suit time on top of the distance, more where gravity is stronger', () => {
    const ramp = (x: number): number => x * 0.2; // 11° uphill on the way out
    const flatLoop = planRoute({ x: 0, z: 0 }, [{ x: 200, z: 0 }], flat, moonG, 0);
    const hill = planRoute({ x: 0, z: 0 }, [{ x: 200, z: 0 }], ramp, moonG, 0);
    const marsHill = planRoute({ x: 0, z: 0 }, [{ x: 200, z: 0 }], ramp, 3.71, 0);
    expect(hill.climb).toBeCloseTo(40, 3);
    expect(hill.maxSlope).toBeCloseTo(11.3, 1);
    expect(hill.suitWalk).toBeGreaterThan(flatLoop.suitWalk);
    expect(marsHill.suitWalk).toBeGreaterThan(hill.suitWalk);
    // the extra is the work of lifting 165 kg by 40 m at 25 % muscle efficiency
    expect((hill.suitWalk - flatLoop.suitWalk) * SUIT_S * NOMINAL_W).toBeCloseTo((165 * moonG * 40) / 0.25, 0);
  });

  it('flags slopes too steep to walk safely', () => {
    const cliff = (x: number): number => (x > 100 && x < 140 ? (x - 100) * 0.7 : x >= 140 ? 28 : 0);
    const p = planRoute({ x: 0, z: 0 }, [{ x: 200, z: 0 }], cliff, moonG);
    expect(p.maxSlope).toBeGreaterThan(30);
    expect(p.tooSteepM).toBeGreaterThan(30);
    expect(verdict(p, false)).toBe('bad');
  });

  it('the walkback limit: the rover may not take the crew further than they could walk home', () => {
    const near = planRoute({ x: 0, z: 0 }, [{ x: 500, z: 0 }], flat, moonG);
    expect(near.walkbackOk).toBe(true);
    const tooFar = planRoute({ x: 0, z: 0 }, [{ x: 1500, z: 0 }], flat, moonG);
    expect(tooFar.walkbackOk).toBe(false);
    expect(verdict(tooFar, true)).toBe('bad');
  });
});
