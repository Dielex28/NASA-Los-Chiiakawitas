import { describe, expect, it } from 'vitest';
import { ROVER, Vehicle, stoppingDistance, type VehicleEnv, type VehicleInput } from '../src/game/vehicle';
import { WORLDS } from '../src/sim/worlds';

const flat = (gravity: number): VehicleEnv => ({ gravity, ground: () => 0, normal: () => [0, 1, 0] });
const idle: VehicleInput = { throttle: 0, steer: 0, brake: 0 };
const run = (v: Vehicle, seconds: number, input: VehicleInput, env: VehicleEnv): void => {
  for (let i = 0; i < seconds * 60; i++) v.step(1 / 60, input, env);
};
const finite = (v: Vehicle): boolean => [...v.pos, ...v.vel, ...v.q, ...v.w].every(Number.isFinite);

describe('suspension', () => {
  for (const world of ['moon', 'mars'] as const) {
    it(`settles on its springs with the designed sag on ${world}`, () => {
      const env = flat(WORLDS[world].gravity);
      const v = new Vehicle();
      v.place(0, 0, 0, env);
      v.pos[1] += 0.4; // dropped from a little height
      run(v, 6, idle, env);
      expect(Math.abs(v.vel[1])).toBeLessThan(0.01);
      for (const w of v.wheels) {
        expect(w.contact).toBe(true);
        expect(w.compression).toBeCloseTo(ROVER.staticSag, 2);
        expect(w.load).toBeCloseTo((ROVER.mass * env.gravity) / 4, -1);
      }
      expect(v.up[1]).toBeGreaterThan(0.999);
    });
  }

  it('stays upright and above ground over rough terrain', () => {
    const ground = (x: number, z: number): number => 0.35 * Math.sin(x * 0.35) * Math.cos(z * 0.27) + 0.12 * Math.sin(x * 1.3 + z * 0.9);
    const env: VehicleEnv = {
      gravity: WORLDS.moon.gravity,
      ground,
      normal: (x, z) => {
        const e = 0.05;
        const dx = (ground(x + e, z) - ground(x - e, z)) / (2 * e);
        const dz = (ground(x, z + e) - ground(x, z - e)) / (2 * e);
        const l = Math.hypot(dx, 1, dz);
        return [-dx / l, 1 / l, -dz / l];
      },
    };
    const v = new Vehicle();
    v.place(0, 0, 0.4, env);
    for (let i = 0; i < 40 * 60; i++) {
      v.step(1 / 60, { throttle: 0.8, steer: Math.sin(i / 200) * 0.5, brake: 0 }, env);
      expect(finite(v)).toBe(true);
      expect(v.pos[1]).toBeGreaterThan(ground(v.pos[0], v.pos[2]));
    }
    expect(v.up[1]).toBeGreaterThan(0.5);
    expect(Math.hypot(v.pos[0], v.pos[2])).toBeGreaterThan(20);
  });
});

describe('driving', () => {
  it('accelerates forward and levels off near its top speed', () => {
    const env = flat(WORLDS.mars.gravity);
    const v = new Vehicle();
    v.place(0, 0, 0, env);
    run(v, 4, { throttle: 1, steer: 0, brake: 0 }, env);
    expect(v.speed).toBeGreaterThan(2);
    run(v, 40, { throttle: 1, steer: 0, brake: 0 }, env);
    expect(v.speed).toBeGreaterThan(ROVER.topSpeed * 0.75);
    expect(v.speed).toBeLessThan(ROVER.topSpeed * 1.02);
    expect(v.pos[2]).toBeGreaterThan(100);
    expect(Math.abs(v.pos[0])).toBeLessThan(0.5);
  });

  it('reverses', () => {
    const env = flat(WORLDS.mars.gravity);
    const v = new Vehicle();
    v.place(0, 0, 0, env);
    run(v, 4, { throttle: -1, steer: 0, brake: 0 }, env);
    expect(v.speed).toBeLessThan(-1);
  });

  it('turns toward the side it is steered to', () => {
    const env = flat(WORLDS.mars.gravity);
    const right = new Vehicle();
    right.place(0, 0, 0, env);
    run(right, 6, { throttle: 0.6, steer: 1, brake: 0 }, env);
    expect(right.yaw).toBeGreaterThan(0.3);
    expect(right.pos[0]).toBeGreaterThan(1);
    const left = new Vehicle();
    left.place(0, 0, 0, env);
    run(left, 6, { throttle: 0.6, steer: -1, brake: 0 }, env);
    expect(left.yaw).toBeLessThan(-0.3);
  });

  it('has less traction in low gravity: slower off the line on the Moon', () => {
    const distance = (g: number): number => {
      const env = flat(g);
      const v = new Vehicle();
      v.place(0, 0, 0, env);
      run(v, 3, { throttle: 1, steer: 0, brake: 0 }, env);
      return v.pos[2];
    };
    expect(distance(WORLDS.moon.gravity)).toBeLessThan(distance(WORLDS.mars.gravity) * 0.75);
  });

  it('needs v²/(2·μ·g) to stop, so far longer on the Moon', () => {
    const stop = (g: number): number => {
      const env = flat(g);
      const v = new Vehicle();
      v.place(0, 0, 0, env);
      v.vel = [0, 0, 6];
      const z0 = v.pos[2];
      for (let i = 0; i < 60 * 60 && v.speed > 0.05; i++) v.step(1 / 60, { throttle: 0, steer: 0, brake: 1 }, env);
      return v.pos[2] - z0;
    };
    const moon = stop(WORLDS.moon.gravity);
    const mars = stop(WORLDS.mars.gravity);
    expect(moon).toBeGreaterThan(mars * 1.9);
    // within 20 % of the textbook figure (the wheels also feel rolling resistance and weight transfer)
    expect(moon).toBeGreaterThan(stoppingDistance(6, ROVER.grip, WORLDS.moon.gravity) * 0.8);
    expect(moon).toBeLessThan(stoppingDistance(6, ROVER.grip, WORLDS.moon.gravity) * 1.2);
  });
});

describe('slopes and obstacles', () => {
  const slope = (deg: number, gravity: number): VehicleEnv => {
    const t = Math.tan((deg * Math.PI) / 180);
    const l = Math.hypot(t, 1);
    return { gravity, ground: (_x, z) => -t * z, normal: () => [0, 1 / l, t / l] };
  };

  it('holds on a 15° slope when parked and rolls down a 35° one', () => {
    const gentle = slope(15, WORLDS.moon.gravity);
    const v = new Vehicle();
    v.place(0, 0, 0, gentle);
    run(v, 8, idle, gentle);
    expect(Math.abs(v.speed)).toBeLessThan(0.05);
    const steep = slope(35, WORLDS.moon.gravity);
    const u = new Vehicle();
    u.place(0, 0, 0, steep);
    run(u, 6, idle, steep);
    expect(u.pos[2]).toBeGreaterThan(1);
  });

  it('does not drive through an upright obstacle', () => {
    const env: VehicleEnv = { ...flat(WORLDS.mars.gravity), colliders: [[0, 20, 2]] };
    const v = new Vehicle();
    v.place(0, 0, 0, env);
    run(v, 15, { throttle: 1, steer: 0, brake: 0 }, env);
    expect(v.pos[2]).toBeLessThan(20 - 2 - 1.2);
    expect(finite(v)).toBe(true);
  });
});
