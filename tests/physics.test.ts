import { describe, expect, it } from 'vitest';
import { AIR_DENSITY, EARTH_GRAVITY, FEATHER, HAMMER, PhysicsWorld, ROCK, fallTime, metabolicWatts, vacuumRange, type PhysEnv } from '../src/game/physics';
import { WORLDS } from '../src/sim/worlds';

const flat = (gravity: number, airDensity: number, windX = 0): PhysEnv => ({
  gravity,
  airDensity,
  windX,
  windZ: 0,
  ground: () => 0,
  normal: () => [0, 1, 0],
});

describe('free fall', () => {
  it('matches t = sqrt(2h/g) on the Moon', () => {
    const g = WORLDS.moon.gravity;
    const t = fallTime(HAMMER, 1.6, g, AIR_DENSITY.moon);
    expect(t).toBeCloseTo(Math.sqrt((2 * 1.6) / g), 2);
  });

  it('drops a hammer and a feather together where there is no air', () => {
    const g = WORLDS.moon.gravity;
    expect(fallTime(FEATHER, 1.6, g, 0)).toBeCloseTo(fallTime(HAMMER, 1.6, g, 0), 6);
  });

  it('barely separates them in the thin air of Mars', () => {
    const g = WORLDS.mars.gravity;
    const hammer = fallTime(HAMMER, 1.6, g, AIR_DENSITY.mars);
    const feather = fallTime(FEATHER, 1.6, g, AIR_DENSITY.mars);
    expect(feather).toBeGreaterThan(hammer);
    expect(feather - hammer).toBeLessThan(0.02);
  });

  it('separates them clearly in air as dense as Earth\'s', () => {
    const hammer = fallTime(HAMMER, 1.6, EARTH_GRAVITY, AIR_DENSITY.earth);
    const feather = fallTime(FEATHER, 1.6, EARTH_GRAVITY, AIR_DENSITY.earth);
    expect(feather - hammer).toBeGreaterThan(0.02);
    // and many times more than on Mars
    const mars = fallTime(FEATHER, 1.6, WORLDS.mars.gravity, AIR_DENSITY.mars) - fallTime(HAMMER, 1.6, WORLDS.mars.gravity, AIR_DENSITY.mars);
    expect(feather - hammer).toBeGreaterThan(5 * mars);
  });

  it('approaches terminal velocity sqrt(2mg / (rho Cd A)) on a long fall', () => {
    const w = new PhysicsWorld();
    const b = w.add(FEATHER, 0, 5000, 0);
    const env = flat(EARTH_GRAVITY, AIR_DENSITY.earth);
    for (let i = 0; i < 600; i++) w.step(1 / 60, env);
    const vt = Math.sqrt((2 * FEATHER.mass * EARTH_GRAVITY) / (AIR_DENSITY.earth * FEATHER.cd * FEATHER.area));
    expect(-b.vy).toBeCloseTo(vt, 1);
  });
});

describe('projectiles', () => {
  it('follows the vacuum range formula on the Moon', () => {
    const g = WORLDS.moon.gravity;
    const w = new PhysicsWorld();
    const speed = 12;
    const el = Math.PI / 4;
    const b = w.add(ROCK, 0, ROCK.radius, 0, speed * Math.cos(el), speed * Math.sin(el), 0);
    const env = flat(g, 0);
    for (let i = 0; i < 2000 && b.landedAt === null; i++) w.step(1 / 60, env);
    expect(b.landedAt).not.toBeNull();
    expect(b.landX).toBeCloseTo(vacuumRange(speed, el, g), 0);
    expect(b.apex).toBeCloseTo((speed * Math.sin(el)) ** 2 / (2 * g), 1);
  });

  it('throws about six times farther on the Moon than on Earth', () => {
    const ratio = vacuumRange(12, 0.6, WORLDS.moon.gravity) / vacuumRange(12, 0.6, EARTH_GRAVITY);
    expect(ratio).toBeCloseTo(EARTH_GRAVITY / WORLDS.moon.gravity, 5);
  });

  it('lets wind carry a feather but not a hammer on Mars', () => {
    const env = flat(WORLDS.mars.gravity, AIR_DENSITY.mars, 18);
    const w = new PhysicsWorld();
    const hammer = w.add(HAMMER, 0, 1.6, 0);
    const feather = w.add(FEATHER, 0, 1.6, 0);
    for (let i = 0; i < 400; i++) w.step(1 / 60, env);
    expect(feather.landX).toBeGreaterThan(0.2);
    expect(Math.abs(hammer.landX)).toBeLessThan(0.02);
  });
});

describe('contact', () => {
  it('loses energy at every bounce and comes to rest', () => {
    const w = new PhysicsWorld();
    const b = w.add(ROCK, 0, 3, 0, 2, 0, 0);
    const env = flat(WORLDS.mars.gravity, AIR_DENSITY.mars);
    let rested = false;
    for (let i = 0; i < 3000 && !rested; i++) rested = w.step(1 / 60, env).some((e) => e.type === 'rest');
    expect(rested).toBe(true);
    expect(b.bounces).toBeGreaterThan(0);
    expect(b.y).toBeCloseTo(ROCK.radius, 3);
    expect(Number.isFinite(b.x)).toBe(true);
  });

  it('keeps a rock rolling on a slope steeper than its friction angle', () => {
    const slope = 0.9; // rise over run: about 42°, steeper than atan(0.65)
    const len = Math.hypot(1, slope);
    const env: PhysEnv = { gravity: WORLDS.moon.gravity, airDensity: 0, windX: 0, windZ: 0, ground: (x) => -slope * x, normal: () => [slope / len, 1 / len, 0] };
    const w = new PhysicsWorld();
    const b = w.add(ROCK, 0, ROCK.radius + 0.01, 0);
    for (let i = 0; i < 600; i++) w.step(1 / 60, env);
    expect(b.resting).toBe(false);
    expect(b.x).toBeGreaterThan(1);
  });

  it('bounces off an upright obstacle instead of passing through it', () => {
    const env: PhysEnv = { ...flat(WORLDS.moon.gravity, 0), colliders: [[5, 0, 1]] };
    const w = new PhysicsWorld();
    const b = w.add(ROCK, 0, 0.5, 0, 6, 1, 0);
    for (let i = 0; i < 900; i++) w.step(1 / 60, env);
    expect(b.x).toBeLessThan(4.1);
  });
});

describe('metabolic rate', () => {
  it('sits in the range measured on Apollo surface EVAs', () => {
    expect(metabolicWatts(0, 0, 0)).toBeGreaterThan(100);
    expect(metabolicWatts(1.2, 0, 0)).toBeGreaterThan(180);
    expect(metabolicWatts(1.2, 0, 0)).toBeLessThan(320);
    expect(metabolicWatts(5.8, 0, 0)).toBeGreaterThan(500);
  });
});
