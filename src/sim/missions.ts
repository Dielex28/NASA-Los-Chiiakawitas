import type { CrisisKind, EmergencyKind } from './emergency';
import { cargoMass } from './catalog';
import type { RealSiteId } from './sites';
import { decodeCustom, encodeCustom, type CustomSpec } from './custom';
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
  /** Played on measured topography (a NASA / USGS elevation model): true = the world's default site. */
  realSite?: boolean | RealSiteId;
  /** Real lunar sites: the Sun's southern declination this season, degrees (−1.54…+1.54). */
  sunSouthDeg?: number;
  /** Built around a real solar storm (see the mission's briefing and docs/SCIENCE.md). */
  historic?: boolean;
  /** Return propellant to make on site, kg: an optional objective worth extra science. */
  fuelGoalKg?: number;
  /** One-way radio delay to Earth, minutes (Mars: 3–22 depending on where the planets are). */
  commsDelayMin?: number;
  /** Designed by a teacher in the mission editor (the code that rebuilds it). */
  custom?: CustomSpec;
  /**
   * Mars solar conjunction (window in sols): the Sun sits between Earth and Mars and the radio
   * link is lost for about two weeks, as happens every 26 months.
   */
  conjunction?: [number, number];
  /** Scripted crises at a fixed mission hour (historical scenarios). */
  crises?: Array<{ h: number; kind: CrisisKind }>;
  /** Emergencies that will happen in this mission (window in sols), besides random ones. */
  emergencies?: Array<{ sol: [number, number]; kind: EmergencyKind }>;
  seed: number;
  recommended: Partial<Record<CargoItem, number>>;
  /**
   * Solar particle events: window in sols and class (1 minor, 2 moderate, 3 severe). A
   * scenario based on a real event can set its own unshielded total (mSv) and duration (h).
   */
  spe: Array<{ sol: [number, number]; cls: 1 | 2 | 3; total?: number; durationH?: number }>;
  storms: Array<{ sol: [number, number]; durationSols: [number, number]; tau: [number, number] }>;
  resupply: Array<{ sol: number; capacityKg: number }>;
}

export const MISSIONS: MissionDef[] = [
  {
    id: 'moon-first',
    world: 'moon',
    durationSols: 8,
    crew: 2,
    budgetKg: 4300,
    scienceGoal: 18,
    doseLimitMsv: 30,
    startLocalH: 40,
    difficulty: 1,
    tutorial: true,
    endless: false,
    seed: 20261114,
    recommended: { solar: 2, battery: 1, antenna: 1, lab: 1, shelter: 1, pylon: 2, food: 1, water: 2, o2: 1 },
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
    emergencies: [{ sol: [10, 14], kind: 'meteor' }],
    fuelGoalKg: 300,
    storms: [],
    resupply: [{ sol: 15, capacityKg: 2500 }],
  },
  {
    id: 'mars-first',
    // Perseverance landed on 18 Feb 2021 with a one-way delay of 11 min 22 s
    commsDelayMin: 11.4,
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
    emergencies: [{ sol: [16, 19], kind: 'eclss' }],
    fuelGoalKg: 1500,
    storms: [{ sol: [21, 27], durationSols: [9, 12], tau: [3.2, 4.4] }],
    resupply: [{ sol: 30, capacityKg: 3000 }],
  },
  {
    id: 'mars-long',
    // a typical delay for a long stay
    commsDelayMin: 16,
    // halfway through, Mars passes behind the Sun: two weeks without Earth
    conjunction: [88, 102],
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
    emergencies: [
      { sol: [35, 45], kind: 'leak' },
      { sol: [100, 120], kind: 'eclss' },
    ],
    fuelGoalKg: 6000,
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
    // the average one-way delay
    commsDelayMin: 12,
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

// Scenarios built around real solar storms. Totals and durations are game values of the
// right order of magnitude, not reconstructions of the measured events (see docs/SCIENCE.md).
MISSIONS.push(
  {
    id: 'moon-1972',
    world: 'moon',
    durationSols: 10,
    crew: 2,
    budgetKg: 5600,
    scienceGoal: 30,
    doseLimitMsv: 50,
    startLocalH: 40,
    difficulty: 2,
    tutorial: false,
    endless: false,
    historic: true,
    seed: 19720804,
    recommended: { solar: 2, battery: 1, antenna: 1, lab: 1, shelter: 1, pylon: 2, food: 2, water: 2, o2: 1 },
    spe: [{ sol: [3.2, 4.0], cls: 3, total: 450, durationH: 40 }],
    storms: [],
    resupply: [],
  },
  {
    id: 'mars-2017',
    // September 2017: Mars had just passed behind the Sun (conjunction, 27 July)
    commsDelayMin: 20,
    world: 'mars',
    durationSols: 24,
    crew: 4,
    budgetKg: 12000,
    scienceGoal: 80,
    doseLimitMsv: 40,
    startLocalH: 8.5,
    difficulty: 2,
    tutorial: false,
    endless: false,
    historic: true,
    seed: 20170910,
    recommended: { hab: 1, eclss: 1, reactor: 2, solar: 2, battery: 2, lab: 1, antenna: 1, rassor: 1, pylon: 6, food: 6, water: 3, o2: 2 },
    spe: [{ sol: [8, 10], cls: 2, total: 120, durationH: 48 }],
    storms: [],
    resupply: [],
  },
  {
    // June 2018: the planet-encircling dust storm that ended Opportunity's mission. Optical depth
    // reached 10.8 over the rover, the highest ever measured on Mars; nuclear-powered Curiosity
    // worked on. Mars was near opposition (closest approach 31 July): radio took under 4 minutes.
    id: 'mars-2018',
    commsDelayMin: 3.7,
    world: 'mars',
    durationSols: 40,
    crew: 4,
    budgetKg: 14000,
    scienceGoal: 90,
    doseLimitMsv: 60,
    startLocalH: 8.5,
    difficulty: 3,
    tutorial: false,
    endless: false,
    historic: true,
    seed: 20180610,
    recommended: { hab: 1, eclss: 1, reactor: 2, solar: 2, battery: 2, lab: 1, antenna: 1, rassor: 1, pylon: 6, food: 8, water: 3, o2: 2 },
    spe: [],
    storms: [{ sol: [4, 6], durationSols: [34, 38], tau: [9.5, 10.8] }],
    resupply: [],
  },
  {
    // April 1970, retold on the surface: 55 h 55 min into Apollo 13 an oxygen tank exploded. Fuel
    // cells died, the crew of three lived in a lander built for two and improvised CO2 filters.
    id: 'moon-1970',
    world: 'moon',
    durationSols: 7,
    crew: 3,
    budgetKg: 5600,
    scienceGoal: 20,
    doseLimitMsv: 40,
    startLocalH: 40,
    difficulty: 3,
    tutorial: false,
    endless: false,
    historic: true,
    seed: 19700413,
    recommended: { eclss: 1, fuelcell: 1, solar: 2, battery: 1, antenna: 1, lab: 1, pylon: 2, food: 3, water: 3, o2: 2 },
    crises: [{ h: 55.9, kind: 'o2tank' }],
    spe: [],
    storms: [],
    resupply: [],
  },
);

// Free play on measured topography: the same rules as the sandboxes, on the real shape of the land.
for (const [base, id, seed] of [
  ['moon-sandbox', 'moon-real', 11],
  ['mars-sandbox', 'mars-real', 12],
] as const) {
  MISSIONS.push({ ...MISSIONS.find((m) => m.id === base)!, id, seed, realSite: true });
}

// Missions on measured south-pole topography, each lit by the Sun as it really moves there
// (see sites.ts): the closer to the pole, the shorter the lunar night.
MISSIONS.push(
  {
    // LOLA Site01: the ridge between Shackleton and de Gerlache, 70 km from the pole
    ...MISSIONS.find((m) => m.id === 'moon-base')!,
    id: 'moon-ridge',
    realSite: 'ridge',
    seed: 20260221,
    difficulty: 2,
  },
  {
    // LOLA Site23: Malapert massif, 4° from the pole. Land at sunrise: 17 days of light, then 12 of night
    id: 'moon-malapert',
    world: 'moon',
    realSite: 'malapert',
    durationSols: 15,
    crew: 2,
    budgetKg: 7000,
    scienceGoal: 55,
    doseLimitMsv: 60,
    // just after sunrise (the Sun rises at about 253° of its monthly turn)
    startLocalH: 505,
    difficulty: 2,
    tutorial: false,
    endless: false,
    seed: 20260602,
    recommended: { hab: 1, solar: 3, battery: 1, lab: 1, antenna: 1, pylon: 3, food: 2, water: 3, o2: 2 },
    spe: [{ sol: [4, 11], cls: 2 }],
    storms: [],
    emergencies: [{ sol: [6, 12], kind: 'meteor' }],
    resupply: [],
  },
  {
    // LOLA Site06: Nobile rim, 4.7° from the pole: a twelve-day night in the middle of the mission
    id: 'moon-nobile',
    world: 'moon',
    realSite: 'nobile',
    durationSols: 30,
    crew: 3,
    budgetKg: 11000,
    scienceGoal: 90,
    doseLimitMsv: 80,
    startLocalH: 0,
    difficulty: 3,
    tutorial: false,
    endless: false,
    seed: 20261012,
    recommended: { hab: 1, eclss: 1, reactor: 1, solar: 3, battery: 2, lab: 1, antenna: 1, rassor: 1, pylon: 4, food: 5, water: 3, o2: 2 },
    spe: [{ sol: [12, 24], cls: 2 }],
    storms: [],
    emergencies: [{ sol: [10, 20], kind: 'eclss' }],
    resupply: [],
  },
);

// order on the mission screen: training, then each world from short to long, then free play
const ORDER = [
  'moon-first',
  'moon-base',
  'moon-1970',
  'moon-1972',
  'moon-ridge',
  'moon-malapert',
  'moon-nobile',
  'mars-first',
  'mars-2017',
  'mars-2018',
  'mars-long',
  'moon-sandbox',
  'moon-real',
  'mars-sandbox',
  'mars-real',
];
MISSIONS.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

/** Things that make each day's challenge different. */
export type DailyTwist = 'extraSpe' | 'tightDose' | 'extraEmg' | 'noResupply' | 'bigFuel';
const TWISTS: DailyTwist[] = ['extraSpe', 'tightDose', 'extraEmg', 'noResupply', 'bigFuel'];

/** Today's code, YYYYMMDD in local time: everyone who plays on the same day gets the same challenge. */
export function dailyCode(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The daily challenge for a code (YYYYMMDD): a short mission whose world, events and two twists
 * all follow from the code, so a whole class — or two classes in different schools — play
 * exactly the same mission and can compare scores.
 */
export function dailyMission(code: string): MissionDef & { twists: DailyTwist[] } {
  const seed = Number.parseInt(code, 10) || 20260101;
  const rng = new Rng(seed ^ 0xda11);
  const moon = rng.next() < 0.5;
  const base = MISSIONS.find((m) => m.id === (moon ? 'moon-base' : 'mars-first'))!;
  const pool = [...TWISTS];
  const twists: DailyTwist[] = [];
  while (twists.length < 2) twists.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  const days = moon ? 14 : 20;
  const kinds = ['leak', 'meteor', 'eclss'] as const;
  const m: MissionDef & { twists: DailyTwist[] } = {
    ...base,
    id: `daily-${code}`,
    durationSols: days,
    scienceGoal: moon ? 45 : 65,
    seed,
    doseLimitMsv: Math.round(base.doseLimitMsv * (twists.includes('tightDose') ? 0.6 : 0.85)),
    spe: [{ sol: [2, days * 0.6], cls: rng.next() < 0.4 ? 3 : 2 }],
    storms: moon ? [] : [{ sol: [5, 10], durationSols: [3, 6], tau: [2.6, 3.8] }],
    emergencies: [{ sol: [3, days - 3], kind: kinds[Math.floor(rng.next() * 3)] }],
    resupply: twists.includes('noResupply') ? [] : [{ sol: Math.round(days / 2), capacityKg: 1500 }],
    fuelGoalKg: twists.includes('bigFuel') ? (moon ? 500 : 1500) : moon ? 200 : 600,
    commsDelayMin: moon ? undefined : Math.round(4 + rng.next() * 18),
    twists,
  };
  if (twists.includes('extraSpe')) m.spe.push({ sol: [days * 0.65, days - 1], cls: 2 });
  if (twists.includes('extraEmg')) m.emergencies!.push({ sol: [days * 0.5, days - 1], kind: kinds[Math.floor(rng.next() * 3)] });
  return m;
}

/**
 * A mission from the teacher's editor. The suggested cargo starts from the matching base
 * mission, with supplies scaled to crew × days, then trimmed until it fits the budget: the
 * class still has to plan, but they start from something that can launch.
 */
export function customMission(spec: CustomSpec): MissionDef {
  const code = encodeCustom(spec);
  const moon = spec.world === 'moon';
  const base = MISSIONS.find((m) => m.id === (moon ? 'moon-base' : 'mars-first'))!;
  const d = spec.days;
  const rng = new Rng(spec.variant * 7919 + 17);
  const k = (spec.crew * d) / (base.crew * base.durationSols);
  const rec: Partial<Record<CargoItem, number>> = { ...base.recommended };
  for (const sup of ['food', 'water', 'o2'] as const) rec[sup] = Math.max(1, Math.round((base.recommended[sup] ?? 1) * k));
  const mass = (): number => (Object.keys(rec) as CargoItem[]).reduce((a, i) => a + cargoMass(i) * (rec[i] ?? 0), 0);
  // trim the least essential cargo first
  const drop: CargoItem[] = ['pylon', 'rassor', 'greenhouse', 'fuelcell', 'battery', 'solar', 'reactor', 'lab', 'antenna', 'food', 'water', 'o2', 'eclss', 'hab'];
  for (let guard = 0; mass() > spec.budgetKg && guard < 200; guard++) {
    const item = drop.find((i) => (rec[i] ?? 0) > (['food', 'water', 'o2', 'solar', 'reactor'].includes(i) ? 1 : 0));
    if (!item) break;
    rec[item] = (rec[item] ?? 0) - 1;
    if (!rec[item]) delete rec[item];
  }
  const spread = (n: number, from: number, to: number): Array<[number, number]> =>
    Array.from({ length: n }, (_, i) => {
      const a = from + ((to - from) * i) / n;
      const b = from + ((to - from) * (i + 1)) / n;
      return [a + (b - a) * 0.1, b - (b - a) * 0.1];
    });
  const kinds: EmergencyKind[] = ['leak', 'meteor', 'eclss'];
  const tau = { 1: [1.5, 2.5], 2: [2.5, 4], 3: [4, 6] }[spec.stormLevel] as [number, number];
  const hard = spec.spe * spec.speClass + spec.storms * spec.stormLevel + spec.emergencies * 2 + (spec.doseLimitMsv < 40 ? 2 : 0);
  return {
    id: `custom-${code}`,
    world: spec.world,
    durationSols: d,
    crew: spec.crew,
    budgetKg: spec.budgetKg,
    scienceGoal: spec.scienceGoal,
    doseLimitMsv: spec.doseLimitMsv,
    startLocalH: base.startLocalH,
    difficulty: hard <= 3 ? 1 : hard <= 8 ? 2 : 3,
    tutorial: false,
    endless: false,
    realSite: spec.terrain ? (moon ? (['shackleton', 'ridge', 'nobile', 'malapert'] as const)[spec.terrain - 1] : true) : undefined,
    fuelGoalKg: spec.fuelKg > 0 ? spec.fuelKg : undefined,
    commsDelayMin: moon ? undefined : spec.delayMin || 12,
    conjunction: !moon && spec.conjunction && d >= 20 ? [Math.round(d * 0.45), Math.round(d * 0.45) + 14] : undefined,
    custom: spec,
    seed: 0xc0de0000 + spec.variant,
    recommended: rec,
    spe: spread(spec.spe, Math.min(2, d * 0.2), d - 0.5).map((sol) => ({ sol, cls: spec.speClass })),
    storms: moon ? [] : spread(spec.storms, 3, d - 2).map((sol) => ({ sol, durationSols: [2, Math.max(3, Math.min(10, d / 6))] as [number, number], tau })),
    emergencies: spread(spec.emergencies, 2, d - 1).map((sol) => ({ sol, kind: kinds[Math.floor(rng.next() * kinds.length)] })),
    resupply: Array.from({ length: spec.resupply }, (_, i) => ({ sol: Math.max(1, Math.round((d * (i + 1)) / (spec.resupply + 1))), capacityKg: 1500 })),
  };
}

/** The mission a code opens, if it is a valid editor code. */
export const customByCode = (code: string): MissionDef | null => {
  const spec = decodeCustom(code);
  return spec ? customMission(spec) : null;
};

export const missionById = (id: string): MissionDef => {
  if (id.startsWith('daily-')) return dailyMission(id.slice(6));
  if (id.startsWith('custom-')) return customByCode(id.slice(7)) ?? MISSIONS[0];
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
};

/** One-way light time to Earth for a mission, minutes: 1.3 s for the Moon, 3–22 min for Mars. */
export function commsDelay(m: MissionDef): number {
  return m.world === 'moon' ? 1.28 / 60 : (m.commsDelayMin ?? 12);
}

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
    const durationH = spec.durationH ?? c.durationH;
    out.push({
      kind: 'spe',
      startH: rng.range(spec.sol[0], spec.sol[1]) * solH,
      durationH,
      peak: spePeakFor(spec.total ?? c.total, durationH),
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
