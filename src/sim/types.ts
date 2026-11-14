/**
 * Simulation data model. Everything in here is plain JSON-serialisable data so a
 * mission can be saved, restored and unit-tested without the 3D layer.
 */
export type WorldId = 'moon' | 'mars';

export type ModuleType =
  | 'lander'
  | 'hab'
  | 'eclss'
  | 'solar'
  | 'battery'
  | 'fuelcell'
  | 'reactor'
  | 'greenhouse'
  | 'icerig'
  | 'moxie'
  | 'rassor'
  | 'shelter'
  | 'lab'
  | 'antenna'
  | 'tank'
  | 'pylon';

export type SupplyType = 'food' | 'water' | 'o2';
export type CargoItem = ModuleType | SupplyType;
export type CropId = 'lettuce' | 'radish' | 'tomato' | 'potato' | 'wheat';
export type Category = 'habitat' | 'power' | 'life' | 'food' | 'isru' | 'science' | 'infra';
export type Priority = 1 | 2 | 3;
export type PowerMode = 'full' | 'standby' | 'off';
export type CrewLocation = 'base' | 'shelter' | 'eva';

export interface ModuleDef {
  type: ModuleType;
  category: Category;
  massKg: number;
  /** Operational draw in kW when running at full function. */
  opKw: number;
  /** Keep-alive draw in kW (pumps/avionics) needed to stay in standby. */
  keepKw: number;
  /** Peak heater draw in kW in the coldest environment (scaled by temperature and insulation). */
  heatKw: number;
  /** Rated generation in kW (solar: at 1 AU, normal incidence, clean). */
  genKw: number;
  storageKwh: number;
  maxRateKw: number;
  chargeEff: number;
  dischargeEff: number;
  crewCapacity: number;
  /** Radiation shielding of the pressure shell in g/cm² (areal density). */
  shieldGcm2: number;
  co2ScrubKgDay: number;
  o2CapKg: number;
  waterCapKg: number;
  defaultPriority: Priority;
  /** Crew-hours of assembly work. */
  buildHours: number;
  /** Footprint radius in metres (placement spacing & collision). */
  radius: number;
  /** Maximum ground slope (degrees) the module tolerates. */
  maxSlopeDeg: number;
  /** Condition points lost per sol while operating. */
  wearPerSol: number;
  worlds: WorldId[];
  buildable: boolean;
}

export interface ModuleState {
  id: number;
  type: ModuleType;
  x: number;
  y: number;
  z: number;
  rot: number;
  /** Assembly progress 0..1 (1 = operational). */
  built: number;
  /** 0..100. Below 20 the module is offline until repaired. */
  condition: number;
  enabled: boolean;
  priority: Priority;
  /** Result of the last grid solve. */
  mode: PowerMode;
  /** Energy stored (batteries / fuel cells / lander), kWh. */
  charge: number;
  /** Solar: fraction of the array covered by dust, 0..1. */
  dust: number;
  /** Solar: last computed direct-sun visibility 0..1. */
  sunVis: number;
  /** Terrain horizon elevation (radians) for evenly spaced azimuth bins, sampled at the array height. */
  horizon: number[] | null;
  /** Greenhouse. */
  crop: CropId;
  growth: number;
  cropHealth: number;
  coldH: number;
  /** Ice rig: richness of the deposit under it, 0..1. */
  richness: number;
  /** Regolith overburden added on top of the shell, g/cm². */
  regolith: number;
  /** RASSOR: id of the module being covered (0 = idle). */
  targetId: number;
  /** Last production / consumption figure for the UI (type-specific units). */
  output: number;
  /** Current electrical draw granted, kW (generators: output). */
  kw: number;
  /** Broken down (condition fell below the offline threshold) until repaired. */
  down: boolean;
}

export interface CrewMember {
  id: number;
  name: string;
  role: 'commander' | 'engineer' | 'botanist' | 'geologist' | 'medic' | 'pilot';
  health: number;
  morale: number;
  doseGcr: number;
  doseSpe: number;
  doseReactor: number;
  /** Short-term dose memory (mSv) that decays; drives acute radiation sickness. */
  acute: number;
  location: CrewLocation;
  isPlayer: boolean;
}

export interface SpeEvent {
  kind: 'spe';
  /** Onset of the proton storm at the surface, mission hours. */
  startH: number;
  durationH: number;
  /** Peak unshielded dose-equivalent rate, mSv/h. */
  peak: number;
  cls: 1 | 2 | 3;
  warned: boolean;
  started: boolean;
  ended: boolean;
}

export interface DustStormEvent {
  kind: 'storm';
  startH: number;
  durationH: number;
  peakTau: number;
  warned: boolean;
  started: boolean;
  ended: boolean;
}

export type ScheduledEvent = SpeEvent | DustStormEvent;

export interface ResupplyWindow {
  arrivalH: number;
  cutoffH: number;
  capacityKg: number;
  manifest: Partial<Record<CargoItem, number>>;
  locked: boolean;
  delivered: boolean;
}

export interface EnvState {
  sunAz: number;
  sunEl: number;
  /** Local solar time in hours (0..solH). */
  localH: number;
  /** Fraction of a clean, sun-facing array's 1 AU rating that reaches the cells (before terrain shadowing). */
  solarFactor: number;
  /** Atmospheric dust optical depth (Mars), 0 on the Moon. */
  tau: number;
  /** 0..1 storm intensity for visuals. */
  storm: number;
  outsideC: number;
  /** Unshielded dose-equivalent rates. */
  gcrMsvDay: number;
  speMsvH: number;
  /** Is the Sun above the local terrain horizon at the base? 0..1 */
  sunVisBase: number;
}

export interface PowerSnapshot {
  solarKw: number;
  nuclearKw: number;
  genKw: number;
  demandKw: number;
  servedKw: number;
  storedKwh: number;
  capacityKwh: number;
  /** + charging, − discharging. */
  storageKw: number;
  curtailedKw: number;
  shed: number;
  /** Any priority-1 load unserved. */
  blackout: boolean;
}

export interface FlowSnapshot {
  o2ProdDay: number;
  o2UseDay: number;
  waterProdDay: number;
  waterUseDay: number;
  foodProdDay: number;
  foodUseDay: number;
  co2ProdDay: number;
  co2RemovalCapDay: number;
  co2MmHg: number;
  o2Days: number;
  waterDays: number;
  foodDays: number;
  recycleFrac: number;
  scienceDay: number;
  crewHours: { maintain: number; science: number; farm: number; build: number };
  farmSat: number;
  freshFood: number;
  comms: boolean;
  crewCapacity: number;
  /** Shielding (g/cm²) of where the crew currently sleeps / shelters. */
  shieldBase: number;
  shieldShelter: number;
  doseRateBaseMsvDay: number;
  doseRateEvaMsvDay: number;
}

export interface Allocation {
  maintain: number;
  science: number;
  farm: number;
  build: number;
}

export interface LogEntry {
  t: number;
  /** i18n key */
  key: string;
  params?: Record<string, string | number>;
  sev: 'info' | 'good' | 'warn' | 'bad';
  /** optional module id to focus */
  ref?: number;
}

export interface Stats {
  blackoutH: number;
  brownoutH: number;
  hypoxiaH: number;
  co2HighH: number;
  coldH: number;
  hungerH: number;
  thirstH: number;
  shelterH: number;
  harvests: number;
  foodGrown: number;
  o2Made: number;
  o2Used: number;
  waterMined: number;
  waterRecycled: number;
  waterUsed: number;
  foodEaten: number;
  energyGenKwh: number;
  energySolarKwh: number;
  energyNuclearKwh: number;
  energyCurtailedKwh: number;
  failures: number;
  repairsByPlayer: number;
  samplesCollected: number;
  speHits: number;
  speSheltered: number;
  stormSols: number;
  minO2Days: number;
  minWaterDays: number;
  minFoodDays: number;
  maxCo2: number;
  minCabinC: number;
  moraleSum: number;
  moraleN: number;
  massLanded: number;
  evaH: number;
}

export interface Telemetry {
  /** hours between samples */
  stepH: number;
  t: number[];
  gen: number[];
  demand: number[];
  stored: number[];
  o2: number[];
  water: number[];
  food: number[];
  co2: number[];
  dose: number[];
  health: number[];
  morale: number[];
  science: number[];
  tempC: number[];
  sun: number[];
}

export type AbortReason = 'health' | 'dose' | 'morale';

export interface Outcome {
  result: 'success' | 'abort';
  reason?: AbortReason;
  atH: number;
}

export interface MissionConfig {
  durationH: number;
  /** Moon: phase offset within the synodic month (h). Mars: local solar time at landing (h). */
  startLocalH: number;
  scienceGoal: number;
  /** Mission dose guideline per crew member (ALARA target), mSv. */
  doseLimitMsv: number;
  budgetKg: number;
  endless: boolean;
  /** Player level: 1 = 8–11 years, 2 = 12–14, 3 = 15+ (absent in old saves: 2). */
  level?: 1 | 2 | 3;
  /** Multiplier on wear, breakdowns and micrometeorite hits for that level. */
  hazard?: number;
}

export interface SimState {
  version: number;
  world: WorldId;
  missionId: string;
  cfg: MissionConfig;
  seed: number;
  rng: number;
  timeH: number;
  crew: CrewMember[];
  modules: ModuleState[];
  nextId: number;
  inventory: Partial<Record<ModuleType, number>>;
  stores: { o2: number; water: number; food: number };
  caps: { o2: number; water: number };
  cabin: { co2Kg: number; tempC: number };
  alloc: Allocation;
  /** 0 light, 1 normal, 2 intense */
  workload: 0 | 1 | 2;
  shelterOrder: boolean;
  /** 0 normal · 1 shed low-priority loads · 2 critical systems only. */
  powerSave: 0 | 1 | 2;
  playerOutside: boolean;
  schedule: ScheduledEvent[];
  resupply: ResupplyWindow[];
  science: number;
  samples: number;
  discoveries: string[];
  env: EnvState;
  power: PowerSnapshot;
  flows: FlowSnapshot;
  stats: Stats;
  log: LogEntry[];
  telemetry: Telemetry;
  outcome: Outcome | null;
  /** Advisor / codex bookkeeping. */
  flags: Record<string, number>;
  /** Last hour a brownout touched a critical load (for morale). */
  lastBlackoutH: number;
}

/** Terrain knowledge the simulation needs, supplied by the world layer. */
export interface SiteProbe {
  /** Horizon elevation angles (radians) for `bins` azimuths starting at north, clockwise. */
  horizon(x: number, z: number, heightAboveGround: number): number[] | null;
  iceRichness(x: number, z: number): number;
}
