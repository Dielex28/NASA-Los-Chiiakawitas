import { TAU } from '../src/core/math';
import { TUNE } from '../src/sim/catalog';
import { missionById, type MissionDef } from '../src/sim/missions';
import { createMission, placeModule, step } from '../src/sim/sim';
import type { CargoItem, ModuleType, SimState, SiteProbe } from '../src/sim/types';

/** Flat ground with one distant massif that hides the low lunar Sun for ~2.5 days per month. */
export const ridgeProbe: SiteProbe = {
  horizon: () => {
    const out: number[] = [];
    for (let i = 0; i < TUNE.horizonBins; i++) {
      const az = (i / TUNE.horizonBins) * TAU;
      const d = Math.abs(((az - 3.4 + Math.PI) % TAU) - Math.PI);
      out.push(d < 0.27 ? 0.2 : 0);
    }
    return out;
  },
  iceRichness: () => 0.7,
};

export const flatProbe: SiteProbe = { horizon: () => null, iceRichness: () => 0.7 };

/** Create a mission and deploy every module of the manifest in a ring around the lander. */
export function deployAll(
  missionId: string,
  manifest?: Partial<Record<CargoItem, number>>,
  probe: SiteProbe = ridgeProbe,
  tweak?: (m: MissionDef) => MissionDef,
): SimState {
  let mission = missionById(missionId);
  if (tweak) mission = tweak({ ...mission });
  const s = createMission(mission, manifest ?? mission.recommended, mission.seed, probe);
  // power first, then life support, then everything else — the order a sensible commander would use
  const order: ModuleType[] = ['reactor', 'solar', 'battery', 'fuelcell', 'hab', 'eclss', 'antenna', 'shelter', 'rassor', 'lab', 'greenhouse', 'tank', 'icerig', 'moxie', 'pylon'];
  let i = 0;
  for (const type of order) {
    while ((s.inventory[type] ?? 0) > 0) {
      const a = i * 0.7;
      const r = type === 'reactor' ? 120 : 20 + i * 4;
      placeModule(s, type, Math.cos(a) * r, 0, Math.sin(a) * r, 0, probe);
      i++;
    }
  }
  return s;
}

export function run(s: SimState, hours: number, dt = 1 / 6, each?: (s: SimState) => void): void {
  const end = s.timeH + hours;
  while (s.timeH < end - 1e-9 && !s.outcome) {
    step(s, Math.min(dt, end - s.timeH));
    each?.(s);
  }
}
