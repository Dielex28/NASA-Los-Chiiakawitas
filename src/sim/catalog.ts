import type { CargoItem, CropId, ModuleDef, ModuleType, SupplyType } from './types';

/**
 * Human consumables per crew member per day (NASA Baseline Values and Assumptions
 * Document, exploration-class habitat).
 */
export const HUMAN = {
  o2KgDay: 0.84,
  co2KgDay: 1.04,
  /** drinking + food rehydration + hygiene (no laundry) */
  waterKgDay: 11,
  /** one "ration" = food for one person for one day (~3000 kcal, 1.8 kg packaged) */
  rationsDay: 1,
  rationKg: 1.8,
};

/** kg of water consumed per kg of O₂ by electrolysis once the Sabatier reactor returns half of it. */
export const WATER_PER_O2 = 0.5625;
/** Habitat free volume per pressurised habitat-class module, m³. */
export const CABIN_M3 = 300;
/** mmHg of CO₂ partial pressure per kg of CO₂ in 300 m³ at 22 °C. */
export const MMHG_PER_KG_CO2 = 1.39;
/** NASA-STD-3001 career limit (2022): 600 mSv. */
export const CAREER_LIMIT_MSV = 600;

const base: Omit<ModuleDef, 'type' | 'category' | 'massKg'> = {
  opKw: 0,
  keepKw: 0,
  heatKw: 0,
  genKw: 0,
  storageKwh: 0,
  maxRateKw: 0,
  chargeEff: 1,
  dischargeEff: 1,
  crewCapacity: 0,
  shieldGcm2: 0,
  co2ScrubKgDay: 0,
  o2CapKg: 0,
  waterCapKg: 0,
  defaultPriority: 2,
  buildHours: 6,
  radius: 4,
  maxSlopeDeg: 14,
  wearPerSol: 0.6,
  worlds: ['moon', 'mars'],
  buildable: true,
};

export const MODULES: Record<ModuleType, ModuleDef> = {
  lander: {
    ...base,
    type: 'lander',
    category: 'habitat',
    massKg: 0,
    opKw: 1.0,
    heatKw: 0.8,
    genKw: 5,
    storageKwh: 120,
    maxRateKw: 8,
    chargeEff: 0.97,
    dischargeEff: 0.97,
    crewCapacity: 4,
    shieldGcm2: 5,
    co2ScrubKgDay: 6.6,
    o2CapKg: 80,
    waterCapKg: 300,
    defaultPriority: 1,
    buildHours: 0,
    radius: 6.5,
    wearPerSol: 0.25,
    buildable: false,
  },
  hab: {
    ...base,
    type: 'hab',
    category: 'habitat',
    massKg: 3200,
    opKw: 2.2,
    heatKw: 2.5,
    crewCapacity: 4,
    shieldGcm2: 12,
    co2ScrubKgDay: 4.4,
    o2CapKg: 60,
    waterCapKg: 400,
    defaultPriority: 1,
    buildHours: 10,
    radius: 7.5,
    maxSlopeDeg: 10,
    wearPerSol: 0.35,
  },
  eclss: {
    ...base,
    type: 'eclss',
    category: 'life',
    massKg: 1100,
    opKw: 3.0,
    heatKw: 0.3,
    co2ScrubKgDay: 4.4,
    defaultPriority: 1,
    buildHours: 6,
    radius: 4.2,
    wearPerSol: 0.9,
  },
  solar: {
    ...base,
    type: 'solar',
    category: 'power',
    massKg: 350,
    genKw: 10,
    buildHours: 2.5,
    radius: 4.5,
    maxSlopeDeg: 18,
    wearPerSol: 0.3,
  },
  battery: {
    ...base,
    type: 'battery',
    category: 'power',
    massKg: 450,
    storageKwh: 80,
    maxRateKw: 20,
    chargeEff: 0.975,
    dischargeEff: 0.975,
    buildHours: 2,
    radius: 3,
    wearPerSol: 0.3,
  },
  fuelcell: {
    ...base,
    type: 'fuelcell',
    category: 'power',
    massKg: 900,
    storageKwh: 600,
    maxRateKw: 12,
    chargeEff: 0.62,
    dischargeEff: 0.9,
    buildHours: 4,
    radius: 3.6,
    wearPerSol: 0.5,
  },
  reactor: {
    ...base,
    type: 'reactor',
    category: 'power',
    massKg: 1600,
    genKw: 10,
    buildHours: 7,
    radius: 4,
    wearPerSol: 0.15,
  },
  greenhouse: {
    ...base,
    type: 'greenhouse',
    category: 'food',
    massKg: 1400,
    opKw: 10.4,
    keepKw: 0.6,
    heatKw: 3.5,
    defaultPriority: 2,
    buildHours: 7,
    radius: 6.2,
    maxSlopeDeg: 10,
    wearPerSol: 0.6,
  },
  icerig: {
    ...base,
    type: 'icerig',
    category: 'isru',
    massKg: 900,
    opKw: 4.0,
    defaultPriority: 3,
    buildHours: 6,
    radius: 4,
    wearPerSol: 1.1,
  },
  moxie: {
    ...base,
    type: 'moxie',
    category: 'isru',
    massKg: 650,
    opKw: 4.5,
    defaultPriority: 3,
    buildHours: 4,
    radius: 3.2,
    wearPerSol: 0.8,
    worlds: ['mars'],
  },
  rassor: {
    ...base,
    type: 'rassor',
    category: 'infra',
    massKg: 400,
    opKw: 1.5,
    defaultPriority: 3,
    buildHours: 2,
    radius: 3.2,
    wearPerSol: 1.0,
  },
  shelter: {
    ...base,
    type: 'shelter',
    category: 'habitat',
    massKg: 1300,
    opKw: 0.3,
    heatKw: 0.4,
    crewCapacity: 0,
    shieldGcm2: 45,
    defaultPriority: 1,
    buildHours: 4,
    radius: 3.6,
    wearPerSol: 0.15,
  },
  lab: {
    ...base,
    type: 'lab',
    category: 'science',
    massKg: 1200,
    opKw: 2.0,
    heatKw: 1.5,
    defaultPriority: 3,
    buildHours: 6,
    radius: 5,
    maxSlopeDeg: 10,
    wearPerSol: 0.6,
  },
  antenna: {
    ...base,
    type: 'antenna',
    category: 'science',
    massKg: 150,
    opKw: 0.5,
    defaultPriority: 2,
    buildHours: 2,
    radius: 2.6,
    maxSlopeDeg: 18,
    wearPerSol: 0.3,
  },
  tank: {
    ...base,
    type: 'tank',
    category: 'infra',
    massKg: 250,
    o2CapKg: 200,
    waterCapKg: 800,
    buildHours: 2,
    radius: 3,
    wearPerSol: 0.1,
  },
  pylon: {
    ...base,
    type: 'pylon',
    category: 'infra',
    massKg: 20,
    buildHours: 0.5,
    radius: 0.9,
    maxSlopeDeg: 28,
    wearPerSol: 0.02,
  },
};

export const MODULE_ORDER: ModuleType[] = [
  'hab',
  'shelter',
  'eclss',
  'tank',
  'solar',
  'battery',
  'fuelcell',
  'reactor',
  'greenhouse',
  'icerig',
  'moxie',
  'rassor',
  'lab',
  'antenna',
  'pylon',
];

export interface SupplyDef {
  type: SupplyType;
  /** Units added to the store per pack. */
  amount: number;
  /** Landed mass per pack including packaging / tankage, kg. */
  massKg: number;
}

export const SUPPLIES: Record<SupplyType, SupplyDef> = {
  food: { type: 'food', amount: 20, massKg: 36 },
  water: { type: 'water', amount: 100, massKg: 104 },
  o2: { type: 'o2', amount: 20, massKg: 26 },
};

export const isSupply = (item: CargoItem): item is SupplyType => item === 'food' || item === 'water' || item === 'o2';

export const cargoMass = (item: CargoItem): number => (isSupply(item) ? SUPPLIES[item].massKg : MODULES[item].massKg);

export interface CropDef {
  id: CropId;
  /** Sols from planting to harvest in the simulator (real cycles are ~2× longer). */
  cycleSols: number;
  realDays: number;
  /** Rations per sol for the whole 30 m² greenhouse, averaged over a cycle (true-to-life per-day yield). */
  rationsPerSol: number;
  /** kg O₂ released per sol at full canopy. */
  o2PerSol: number;
  /** kg CO₂ absorbed per sol at full canopy. */
  co2PerSol: number;
  /** Net water consumed per sol (most transpired water is condensed and reused). */
  waterPerSol: number;
  /** Multiplier on the lighting power. */
  light: number;
  /** Morale points (fresh food variety). */
  morale: number;
}

export const CROPS: Record<CropId, CropDef> = {
  lettuce: { id: 'lettuce', cycleSols: 15, realDays: 30, rationsPerSol: 0.14, o2PerSol: 0.55, co2PerSol: 0.75, waterPerSol: 2.2, light: 0.75, morale: 10 },
  radish: { id: 'radish', cycleSols: 13, realDays: 27, rationsPerSol: 0.16, o2PerSol: 0.5, co2PerSol: 0.7, waterPerSol: 2.0, light: 0.75, morale: 7 },
  tomato: { id: 'tomato', cycleSols: 40, realDays: 80, rationsPerSol: 0.32, o2PerSol: 1.0, co2PerSol: 1.4, waterPerSol: 3.2, light: 1.0, morale: 12 },
  potato: { id: 'potato', cycleSols: 50, realDays: 100, rationsPerSol: 1.05, o2PerSol: 1.6, co2PerSol: 2.2, waterPerSol: 3.4, light: 1.0, morale: 5 },
  wheat: { id: 'wheat', cycleSols: 42, realDays: 85, rationsPerSol: 1.3, o2PerSol: 1.9, co2PerSol: 2.6, waterPerSol: 3.8, light: 1.3, morale: 2 },
};

export const CROP_ORDER: CropId[] = ['lettuce', 'radish', 'tomato', 'potato', 'wheat'];

/** Tunable gameplay constants (kept in one place for balancing and for the tests). */
export const TUNE = {
  workHours: [6, 8, 11] as const,
  workMoraleDelta: [6, 0, -14] as const,
  /** Condition points restored per crew-hour of maintenance. */
  repairPerHour: 2.4,
  /** Crew-hours a greenhouse needs per sol for a full yield. */
  farmHoursPerGreenhouse: 2.5,
  /** Yield fraction an untended (fully automated) greenhouse still achieves. */
  farmAutomation: 0.35,
  sciencePerHour: 0.5,
  scienceNoLab: 0.25,
  sampleBonus: 2.0,
  sampleHours: 6,
  discoveryScience: 4,
  /** Science credited the first time each physics demonstration is done on EVA. */
  experimentScience: 2,
  /** Science for bringing back the mission's far expedition sample. */
  expeditionScience: 14,
  /** Regolith piled per sol by one RASSOR depot, g/cm². */
  regolithPerSol: 14,
  regolithMax: 300,
  /** Ice rig output at richness 1, kg water per sol. */
  iceKgPerSol: 45,
  moxieKgPerSol: 4,
  eclssO2KgDay: 3.6,
  eclssCrew: 4,
  recycleEff: 0.95,
  /** Days of O₂ the ECLSS tries to keep in the tanks. */
  o2ReserveDays: 12,
  /** Dust deposited on Mars arrays per sol (fraction of output lost). */
  dustPerSol: 0.0028,
  stormDustFactor: 6,
  /** Reactor: extra dose at 30 m, mSv/day, falling with the square of distance. */
  reactorMsvDayAt30m: 0.6,
  reactorSafeM: 90,
  /** Network link range between modules, metres. */
  linkRange: 62,
  /** Module goes offline below this condition, and comes back above `onlineAt`. */
  offlineAt: 20,
  onlineAt: 35,
  horizonBins: 72,
};

/** Fraction of galactic-cosmic-ray dose that gets through `x` g/cm² of shielding. */
export function gcrTransmission(x: number): number {
  return 0.3 + 0.7 * Math.exp(-x / 260);
}

/** Fraction of solar-particle-event dose that gets through `x` g/cm² of shielding. */
export function speTransmission(x: number): number {
  return 0.01 + 0.99 * Math.exp(-x / 15);
}
