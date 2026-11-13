import { Rng } from '../core/rng';
import { clamp, clamp01 } from '../core/math';
import { WORLDS } from './worlds';
import type { CargoItem, ScheduledEvent, SimState, WorldId } from './types';

export interface MissionDef {
  id: string;
  world: WorldId;
  durationSols: number;
  crew: number;
  budgetKg: number;
  scienceGoal: number;
  doseLimitMsv: number;
  startLocalH: number;
  difficulty: 1 | 2 | 3;
  tutorial: boolean;
  endless: boolean;
  seed: number;
  recommended: Partial<Record<CargoItem, number>>;
  /** Solar particle events: window in sols and class (1 minor, 2 moderate, 3 severe). */
  spe: Array<{ sol: [number, number]; cls: 1 | 2 | 3 }>;
  storms: Array<{ sol: [number, number]; durationSols: [number, number]; tau: [number, number] }>;
  resupply: Array<{ sol: number; capacityKg: number }>;
}

export const MISSIONS: MissionDef[] = [
  {
    id: 'moon-first',
    world: 'moon',
    durationSols: 8,
    crew: 2,
    budgetKg: 3600,
    scienceGoal: 18,
    doseLimitMsv: 30,
    startLocalH: 40,
    difficulty: 1,
    tutorial: true,
    endless: false,
    seed: 20261114,
    recommended: { solar: 2, battery: 1, antenna: 1, lab: 1, rassor: 1, pylon: 2, food: 1, water: 2, o2: 1 },
    spe: [{ sol: [5.9, 6.5], cls: 1 }],
    storms: [],
    resupply: [],
  },
  {
    id: 'moon-base',
    world: 'moon',
    durationSols: 30,
    crew: 4,
    budgetKg: 9500,
    scienceGoal: 100,
    doseLimitMsv: 80,
    startLocalH: 30,
    difficulty: 2,
    tutorial: false,
    endless: false,
    seed: 19690720,
    recommended: {
      hab: 1,
      eclss: 1,
      solar: 3,
      battery: 1,
      fuelcell: 1,
      rassor: 1,
      lab: 1,
      antenna: 1,
      pylon: 4,
      food: 6,
      water: 3,
      o2: 2,
    },
    spe: [
      { sol: [5, 8], cls: 2 },
      { sol: [19, 25], cls: 3 },
    ],
    storms: [],
    resupply: [{ sol: 15, capacityKg: 2500 }],
  },
  {
    id: 'mars-first',
    world: 'mars',
    durationSols: 60,
    crew: 4,
    budgetKg: 13500,
    scienceGoal: 200,
    doseLimitMsv: 60,
    startLocalH: 8.5,
    difficulty: 2,
    tutorial: false,
    endless: false,
    seed: 20210218,
    recommended: {
      hab: 1,
      eclss: 1,
      reactor: 2,
      solar: 2,
      battery: 2,
      greenhouse: 1,
      lab: 1,
      antenna: 1,
      rassor: 1,
      pylon: 6,
      food: 12,
      water: 4,
      o2: 3,
    },
    spe: [
      { sol: [9, 15], cls: 2 },
      { sol: [44, 54], cls: 3 },
    ],
    storms: [{ sol: [21, 27], durationSols: [9, 12], tau: [3.2, 4.4] }],
    resupply: [{ sol: 30, capacityKg: 3000 }],
  },
  {
    id: 'mars-long',
    world: 'mars',
    durationSols: 180,
    crew: 6,
    budgetKg: 24500,
    scienceGoal: 800,
    doseLimitMsv: 150,
    startLocalH: 8.5,
    difficulty: 3,
    tutorial: false,
    endless: false,
    seed: 19760720,
    recommended: {
      hab: 2,
      eclss: 2,
      reactor: 3,
      solar: 2,
      battery: 2,
      greenhouse: 2,
      lab: 1,
      antenna: 1,
      rassor: 1,
      shelter: 1,
      icerig: 1,
      tank: 1,
      pylon: 6,
      food: 34,
      water: 6,
      o2: 4,
    },
    spe: [
      { sol: [14, 30], cls: 2 },
      { sol: [60, 85], cls: 3 },
      { sol: [120, 160], cls: 3 },
    ],
    storms: [
      { sol: [35, 50], durationSols: [8, 11], tau: [2.6, 3.6] },
      { sol: [100, 115], durationSols: [22, 30], tau: [5.5, 7.5] },
    ],
    resupply: [{ sol: 90, capacityKg: 5000 }],
  },
  {
    id: 'moon-sandbox',
    world: 'moon',
    durationSols: 100000,
    crew: 4,
    budgetKg: 30000,
    scienceGoal: 0,
    doseLimitMsv: 600,
    startLocalH: 30,
    difficulty: 1,
    tutorial: false,
    endless: true,
    seed: 1,
    recommended: {
      hab: 1,
      eclss: 1,
      solar: 4,
      battery: 2,
      fuelcell: 1,
      reactor: 1,
      greenhouse: 1,
      icerig: 1,
      rassor: 1,
      shelter: 1,
      lab: 1,
      antenna: 1,
      tank: 1,
      pylon: 10,
      food: 12,
      water: 6,
      o2: 4,
    },
    spe: [],
    storms: [],
    resupply: [],
  },
  {
    id: 'mars-sandbox',
    world: 'mars',
    durationSols: 100000,
    crew: 4,
    budgetKg: 30000,
    scienceGoal: 0,
    doseLimitMsv: 600,
    startLocalH: 8.5,
    difficulty: 1,
    tutorial: false,
    endless: true,
    seed: 2,
    recommended: {
      hab: 1,
      eclss: 1,
      solar: 4,
      battery: 2,
      reactor: 2,
      greenhouse: 2,
      icerig: 1,
      moxie: 1,
      rassor: 1,
      shelter: 1,
      lab: 1,
      antenna: 1,
      tank: 1,
      pylon: 10,
      food: 14,
      water: 6,
      o2: 4,
    },
    spe: [],
    storms: [],
    resupply: [],
  },
];

export const missionById = (id: string): MissionDef => MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];

const SPE_CLASS = {
  1: { total: 12, durationH: 12 },
  2: { total: 60, durationH: 20 },
  3: { total: 340, durationH: 30 },
} as const;

/** Peak rate (mSv/h) that yields roughly `total` mSv over the event's profile. */
export function spePeakFor(total: number, durationH: number): number {
  return total / (0.75 + durationH / 4);
}

export function buildSchedule(m: MissionDef, seed: number): ScheduledEvent[] {
  const rng = new Rng(seed ^ 0x5eed);
  const solH = WORLDS[m.world].solH;
  const out: ScheduledEvent[] = [];
  for (const spec of m.spe) {
    const c = SPE_CLASS[spec.cls];
    out.push({
      kind: 'spe',
      startH: rng.range(spec.sol[0], spec.sol[1]) * solH,
      durationH: c.durationH,
      peak: spePeakFor(c.total, c.durationH),
      cls: spec.cls,
      warned: false,
      started: false,
      ended: false,
    });
  }
  for (const spec of m.storms) {
    out.push({
      kind: 'storm',
      startH: rng.range(spec.sol[0], spec.sol[1]) * solH,
      durationH: rng.range(spec.durationSols[0], spec.durationSols[1]) * solH,
      peakTau: rng.range(spec.tau[0], spec.tau[1]),
      warned: false,
      started: false,
      ended: false,
    });
  }
  if (m.endless) {
    // endless play: a rolling season of random space weather
    let t = 6 * solH;
    while (t < 600 * solH) {
      t += rng.range(9, 26) * solH;
      const cls = (rng.chance(0.25) ? 3 : rng.chance(0.5) ? 2 : 1) as 1 | 2 | 3;
      const c = SPE_CLASS[cls];
      out.push({ kind: 'spe', startH: t, durationH: c.durationH, peak: spePeakFor(c.total, c.durationH), cls, warned: false, started: false, ended: false });
    }
    if (m.world === 'mars') {
      let ts = 25 * solH;
      while (ts < 600 * solH) {
        const dur = rng.range(6, 18) * solH;
        out.push({ kind: 'storm', startH: ts, durationH: dur, peakTau: rng.range(2, 6), warned: false, started: false, ended: false });
        ts += dur + rng.range(30, 70) * solH;
      }
    }
  }
  out.sort((a, b) => a.startH - b.startH);
  return out;
}

export interface Score {
  crew: number;
  radiation: number;
  science: number;
  power: number;
  sustain: number;
  total: number;
  /** 0..4 index into rank titles */
  rank: number;
  maxDose: number;
}

/** Five-pillar mission score, each 0..100. */
export function scoreMission(s: SimState): Score {
  const n = Math.max(1, s.crew.length);
  const healthAvg = s.crew.reduce((a, c) => a + c.health, 0) / n;
  const healthMin = s.crew.reduce((a, c) => Math.min(a, c.health), 100);
  const moraleAvg = s.stats.moraleN > 0 ? s.stats.moraleSum / s.stats.moraleN : 60;
  const crew = clamp(0.4 * healthAvg + 0.25 * healthMin + 0.35 * moraleAvg, 0, 100);

  const maxDose = s.crew.reduce((a, c) => Math.max(a, c.doseGcr + c.doseSpe + c.doseReactor), 0);
  // within the mission guideline you keep at least 40 points; ALARA (as low as reasonably achievable) earns the rest
  const frac = maxDose / Math.max(1, s.cfg.doseLimitMsv);
  const radiation = frac <= 0.4 ? 100 : frac <= 1 ? 100 - (60 * (frac - 0.4)) / 0.6 : clamp(40 - 80 * (frac - 1), 0, 40);

  const science = s.cfg.scienceGoal > 0 ? clamp((100 * s.science) / s.cfg.scienceGoal, 0, 100) : clamp(s.science / 3, 0, 100);

  const hours = Math.max(1, s.timeH);
  const power = clamp(100 * (1 - (4 * s.stats.blackoutH + 0.35 * s.stats.brownoutH) / hours), 0, 100);

  const o2Self = s.stats.o2Used > 0 ? clamp01(s.stats.o2Made / s.stats.o2Used) : 0;
  const waterSelf = s.stats.waterUsed > 0 ? clamp01((s.stats.waterRecycled + s.stats.waterMined) / s.stats.waterUsed) : 0;
  const foodSelf = s.stats.foodEaten > 0 ? clamp01(s.stats.foodGrown / s.stats.foodEaten) : 0;
  const scarcity = clamp01((s.stats.hypoxiaH + s.stats.thirstH + s.stats.hungerH) / 24);
  const sustain = clamp(100 * (0.4 * waterSelf + 0.3 * o2Self + 0.3 * Math.min(1, foodSelf * 2.5)) * (1 - 0.5 * scarcity), 0, 100);

  let total = 0.28 * crew + 0.2 * radiation + 0.22 * science + 0.15 * power + 0.15 * sustain;
  if (s.outcome?.result === 'abort') total *= 0.45;
  const rank = total >= 88 ? 4 : total >= 76 ? 3 : total >= 62 ? 2 : total >= 45 ? 1 : 0;
  return { crew, radiation, science, power, sustain, total, rank, maxDose };
}
