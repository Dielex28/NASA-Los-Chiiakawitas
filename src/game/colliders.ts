import type { ModuleType } from '../sim/types';

/** Walk-blocking circles per module, in module-local coordinates: [x, z, radius]. */
export const COLLIDERS: Record<ModuleType, Array<[number, number, number]>> = {
  lander: [[0, 0, 3.5]],
  hab: [
    [-3.2, 0, 2.8],
    [0, 0, 2.8],
    [3.2, 0, 2.8],
    [6.2, 0, 1.4],
  ],
  eclss: [
    [0.2, 0, 1.9],
    [-2.3, 0, 1.0],
  ],
  solar: [[0, 0, 0.9]],
  battery: [
    [-0.75, 0, 1.05],
    [0.75, 0, 1.05],
  ],
  fuelcell: [
    [-1.35, 0, 1.25],
    [1.2, 0, 1.1],
  ],
  reactor: [[0, 0, 1.7]],
  greenhouse: [
    [-2.9, 0, 3.0],
    [0, 0, 3.0],
    [2.9, 0, 3.0],
  ],
  icerig: [[0, 0, 2.5]],
  moxie: [[0, 0, 1.5]],
  rassor: [[0, -0.3, 1.3]],
  shelter: [
    [0, 0, 2.9],
    [0, 3.2, 1.0],
  ],
  lab: [
    [0, 0, 2.9],
    [0, 3.2, 0.9],
  ],
  antenna: [[0, 0, 1.1]],
  tank: [
    [-0.9, 0, 1.15],
    [0.9, 0, 1.15],
  ],
  pylon: [[0, 0, 0.28]],
};

/** Local-space spot (x, z) in front of a module's airlock, where the crew step outside. */
export const AIRLOCK: Partial<Record<ModuleType, [number, number]>> = {
  lander: [0, 5.6],
  hab: [9.4, 0],
};
