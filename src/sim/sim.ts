import { Rng } from '../core/rng';
import { clamp, clamp01 } from '../core/math';
import {
  CAREER_LIMIT_MSV,
  CROPS,
  HUMAN,
  MMHG_PER_KG_CO2,
  MODULES,
  SUPPLIES,
  TUNE,
  WATER_PER_O2,
  cargoMass,
  gcrTransmission,
  isSupply,
  speTransmission,
} from './catalog';
import { computeEnv, heatFactor, horizonAt, sunPosition, sunVisibility } from './environment';
import { buildSchedule, type MissionDef } from './missions';
import { WORLDS } from './worlds';
import type {
  Allocation,
  CargoItem,
  CrewMember,
  CropId,
  FlowSnapshot,
  LogEntry,
  ModuleState,
  ModuleType,
  PowerSnapshot,
  Priority,
  SimState,
  SiteProbe,
  Stats,
  Telemetry,
} from './types';

export const SIM_VERSION = 3;
/** Largest integration step, hours. Longer frames are sub-stepped. */
export const MAX_STEP_H = 1 / 6;

const CREW_ROSTER: Array<Pick<CrewMember, 'name' | 'role'>> = [
  { name: 'Val Cruz', role: 'commander' },
  { name: 'Tomás Okoye', role: 'engineer' },
  { name: 'Aiko Lindqvist', role: 'botanist' },
  { name: 'Samir Haddad', role: 'geologist' },
  { name: 'Nayeli Torres', role: 'medic' },
  { name: 'Ravi Menon', role: 'pilot' },
];

const emptyStats = (): Stats => ({
  blackoutH: 0,
  brownoutH: 0,
  hypoxiaH: 0,
  co2HighH: 0,
  coldH: 0,
  hungerH: 0,
  thirstH: 0,
  shelterH: 0,
  harvests: 0,
  foodGrown: 0,
  o2Made: 0,
  o2Used: 0,
  waterMined: 0,
  waterRecycled: 0,
  waterUsed: 0,
  foodEaten: 0,
  energyGenKwh: 0,
  energySolarKwh: 0,
  energyNuclearKwh: 0,
  energyCurtailedKwh: 0,
  failures: 0,
  repairsByPlayer: 0,
  samplesCollected: 0,
  speHits: 0,
  speSheltered: 0,
  stormSols: 0,
  minO2Days: 1e9,
  minWaterDays: 1e9,
  minFoodDays: 1e9,
  maxCo2: 0,
  minCabinC: 21,
  moraleSum: 0,
  moraleN: 0,
  massLanded: 0,
  evaH: 0,
});

const emptyTelemetry = (): Telemetry => ({
  stepH: 1,
  t: [],
  gen: [],
  demand: [],
  stored: [],
  o2: [],
  water: [],
  food: [],
  co2: [],
  dose: [],
  health: [],
  morale: [],
  science: [],
  tempC: [],
  sun: [],
});

const emptyPower = (): PowerSnapshot => ({
  solarKw: 0,
  nuclearKw: 0,
  genKw: 0,
  demandKw: 0,
  servedKw: 0,
  storedKwh: 0,
  capacityKwh: 0,
  storageKw: 0,
  curtailedKw: 0,
  shed: 0,
  blackout: false,
});

const emptyFlows = (): FlowSnapshot => ({
  o2ProdDay: 0,
  o2UseDay: 0,
  waterProdDay: 0,
  waterUseDay: 0,
  foodProdDay: 0,
  foodUseDay: 0,
  co2ProdDay: 0,
  co2RemovalCapDay: 0,
  co2MmHg: 0.4,
  o2Days: 0,
  waterDays: 0,
  foodDays: 0,
  recycleFrac: 0,
  scienceDay: 0,
  crewHours: { maintain: 0, science: 0, farm: 0, build: 0 },
  farmSat: 0,
  freshFood: 0,
  comms: false,
  crewCapacity: 0,
  shieldBase: 5,
  shieldShelter: 5,
  doseRateBaseMsvDay: 0,
  doseRateEvaMsvDay: 0,
});

export function newModule(id: number, type: ModuleType, x: number, y: number, z: number, rot: number): ModuleState {
  const def = MODULES[type];
  return {
    id,
    type,
    x,
    y,
    z,
    rot,
    built: def.buildHours <= 0 ? 1 : 0,
    condition: 100,
    enabled: true,
    priority: def.defaultPriority,
    mode: 'off',
    charge: 0,
    dust: 0,
    sunVis: 1,
    horizon: null,
    crop: 'lettuce',
    growth: 0,
    cropHealth: 1,
    coldH: 0,
    richness: 0,
    regolith: 0,
    targetId: 0,
    output: 0,
    kw: 0,
    down: false,
  };
}

/** Height above the ground at which a module "sees" the Sun (array mast, lander deck…). */
export function sunSampleHeight(type: ModuleType, world: 'moon' | 'mars'): number {
  if (type === 'solar') return world === 'moon' ? 10 : 2.5;
  if (type === 'lander') return 5;
  return 2;
}

export function manifestMass(manifest: Partial<Record<CargoItem, number>>): number {
  let kg = 0;
  for (const k of Object.keys(manifest) as CargoItem[]) kg += cargoMass(k) * (manifest[k] ?? 0);
  return kg;
}

function applyCargo(s: SimState, manifest: Partial<Record<CargoItem, number>>): void {
  for (const k of Object.keys(manifest) as CargoItem[]) {
    const n = manifest[k] ?? 0;
    if (n <= 0) continue;
    if (isSupply(k)) s.stores[k] += SUPPLIES[k].amount * n;
    else s.inventory[k] = (s.inventory[k] ?? 0) + n;
    s.stats.massLanded += cargoMass(k) * n;
  }
}

export function createMission(
  mission: MissionDef,
  manifest: Partial<Record<CargoItem, number>>,
  seed: number,
  probe: SiteProbe | null,
  landerY = 0,
  opts: { level?: 1 | 2 | 3 } = {},
): SimState {
  const w = WORLDS[mission.world];
  const crew: CrewMember[] = [];
  for (let i = 0; i < mission.crew; i++) {
    const r = CREW_ROSTER[i % CREW_ROSTER.length];
    crew.push({
      id: i + 1,
      name: r.name,
      role: r.role,
      health: 100,
      morale: 78,
      doseGcr: 0,
      doseSpe: 0,
      doseReactor: 0,
      acute: 0,
      location: 'base',
      isPlayer: i === 0,
    });
  }
  const lander = newModule(1, 'lander', 0, landerY, 0, 0);
  lander.charge = MODULES.lander.storageKwh * 0.85;
  lander.horizon = probe ? probe.horizon(0, 0, sunSampleHeight('lander', mission.world)) : null;
  const s: SimState = {
    version: SIM_VERSION,
    world: mission.world,
    missionId: mission.id,
    cfg: {
      durationH: mission.durationSols * w.solH,
      startLocalH: mission.startLocalH,
      scienceGoal: mission.scienceGoal,
      doseLimitMsv: mission.doseLimitMsv,
      budgetKg: mission.budgetKg,
      endless: mission.endless,
      level: opts.level ?? 2,
      hazard: [0.5, 1, 1.35][(opts.level ?? 2) - 1],
    },
    seed,
    rng: seed ^ 0xa11ce,
    timeH: 0,
    crew,
    modules: [lander],
    nextId: 2,
    inventory: {},
    // emergency reserve carried in the lander: about three days for the crew
    stores: {
      o2: mission.crew * HUMAN.o2KgDay * 3,
      water: mission.crew * HUMAN.waterKgDay * 3,
      food: mission.crew * 3,
    },
    caps: { o2: 0, water: 0 },
    cabin: { co2Kg: 0.06, tempC: 21 },
    alloc: { maintain: 0.25, science: 0.3, farm: 0.15, build: 0.3 },
    workload: 1,
    shelterOrder: false,
    powerSave: 0,
    playerOutside: false,
    schedule: buildSchedule(mission, seed),
    resupply: mission.resupply.map((r) => ({
      arrivalH: r.sol * w.solH,
      cutoffH: (r.sol - (mission.world === 'moon' ? 3 : 2)) * w.solH,
      capacityKg: r.capacityKg,
      manifest: {},
      locked: false,
      delivered: false,
    })),
    science: 0,
    samples: 0,
    discoveries: [],
    env: computeEnv(mission.world, 0, mission.startLocalH, [], lander.horizon, null, 0),
    power: emptyPower(),
    flows: emptyFlows(),
    stats: emptyStats(),
    log: [],
    telemetry: emptyTelemetry(),
    outcome: null,
    flags: {},
    lastBlackoutH: -1e9,
  };
  applyCargo(s, manifest);
  recomputeCaps(s);
  pushLog(s, 'log.landed', 'good');
  // one short step so every gauge has a real reading on the first frame
  stepOnce(s, 1 / 120);
  return s;
}

export function pushLog(
  s: SimState,
  key: string,
  sev: LogEntry['sev'] = 'info',
  params?: Record<string, string | number>,
  ref?: number,
): void {
  s.log.push({ t: s.timeH, key, sev, params, ref });
  if (s.log.length > 240) s.log.splice(0, s.log.length - 240);
}

export const isBuilt = (m: ModuleState): boolean => m.built >= 1;
/** Built, switched on and not broken down. */
export const isUp = (m: ModuleState): boolean => m.built >= 1 && m.enabled && !m.down;
/** Performance factor from wear: full above 70 % condition, tapering to 45 % at the offline threshold. */
export const conditionEff = (m: ModuleState): number =>
  m.condition >= 70 ? 1 : clamp(0.45 + (0.55 * (m.condition - TUNE.offlineAt)) / (70 - TUNE.offlineAt), 0.2, 1);
export const insulation = (m: ModuleState): number => 0.7 * clamp01(m.regolith / 120);
export const shieldOf = (m: ModuleState): number => MODULES[m.type].shieldGcm2 + m.regolith;

export function recomputeCaps(s: SimState): void {
  let o2 = 0;
  let water = 0;
  for (const m of s.modules) {
    if (!isBuilt(m)) continue;
    const d = MODULES[m.type];
    o2 += d.o2CapKg;
    water += d.waterCapKg;
  }
  s.caps.o2 = o2;
  s.caps.water = water;
}

/* ------------------------------------------------------------------ actions */

export function canPlace(s: SimState, type: ModuleType): boolean {
  return (s.inventory[type] ?? 0) > 0;
}

export function placeModule(
  s: SimState,
  type: ModuleType,
  x: number,
  y: number,
  z: number,
  rot: number,
  probe: SiteProbe | null,
): ModuleState | null {
  if (!canPlace(s, type)) return null;
  s.inventory[type] = (s.inventory[type] ?? 0) - 1;
  const m = newModule(s.nextId++, type, x, y, z, rot);
  if (probe) {
    if (type === 'solar') m.horizon = probe.horizon(x, z, sunSampleHeight(type, s.world));
    if (type === 'icerig') m.richness = probe.iceRichness(x, z);
  }
  if (type === 'greenhouse') m.crop = suggestCrop(s);
  s.modules.push(m);
  if (isBuilt(m)) recomputeCaps(s);
  return m;
}

/** The most nourishing crop that can still be harvested before the mission ends. */
export function suggestCrop(s: SimState): CropId {
  const left = s.cfg.endless ? 1e9 : (s.cfg.durationH - s.timeH) / WORLDS[s.world].solH;
  let best: CropId = 'lettuce';
  let bestYield = 0;
  for (const id of Object.keys(CROPS) as CropId[]) {
    const c = CROPS[id];
    if (c.cycleSols * 1.15 > left) continue;
    if (c.rationsPerSol > bestYield) {
      bestYield = c.rationsPerSol;
      best = id;
    }
  }
  return best;
}

/** Take a module back into cargo (it can be redeployed elsewhere). The lander cannot be moved. */
export function removeModule(s: SimState, id: number): boolean {
  const i = s.modules.findIndex((m) => m.id === id);
  if (i < 0) return false;
  const m = s.modules[i];
  if (m.type === 'lander') return false;
  s.modules.splice(i, 1);
  s.inventory[m.type] = (s.inventory[m.type] ?? 0) + 1;
  for (const o of s.modules) if (o.targetId === id) o.targetId = 0;
  recomputeCaps(s);
  return true;
}

export function setAllocation(s: SimState, key: keyof Allocation, value: number): void {
  // keep the four shares summing to 1 by rescaling the others proportionally
  const v = clamp01(value);
  const others = (Object.keys(s.alloc) as Array<keyof Allocation>).filter((k) => k !== key);
  const rest = others.reduce((a, k) => a + s.alloc[k], 0);
  s.alloc[key] = v;
  const remaining = 1 - v;
  for (const k of others) s.alloc[k] = rest > 1e-6 ? (s.alloc[k] / rest) * remaining : remaining / others.length;
}

export function setCrop(s: SimState, id: number, crop: CropId): void {
  const m = s.modules.find((x) => x.id === id);
  if (!m || m.type !== 'greenhouse' || m.crop === crop) return;
  m.crop = crop;
  m.growth = 0;
  m.cropHealth = 1;
}

export function setPriority(s: SimState, id: number, p: Priority): void {
  const m = s.modules.find((x) => x.id === id);
  if (m) m.priority = p;
}

export function setEnabled(s: SimState, id: number, on: boolean): void {
  const m = s.modules.find((x) => x.id === id);
  if (m) m.enabled = on;
}

/** Hands-on repair by the player during an EVA. Returns the condition gained. */
export function playerRepair(s: SimState, id: number, points: number): number {
  const m = s.modules.find((x) => x.id === id);
  if (!m || !isBuilt(m)) return 0;
  const before = m.condition;
  m.condition = Math.min(100, m.condition + points);
  if (m.down && m.condition >= TUNE.onlineAt) {
    m.down = false;
    s.stats.repairsByPlayer++;
    pushLog(s, 'log.repaired', 'good', { type: m.type }, m.id);
  }
  return m.condition - before;
}

export function playerClean(s: SimState, id: number, amount: number): number {
  const m = s.modules.find((x) => x.id === id);
  if (!m || m.type !== 'solar') return 0;
  const before = m.dust;
  m.dust = Math.max(0, m.dust - amount);
  return before - m.dust;
}

/** Hands-on assembly by the player: `hours` of crew-equivalent work. */
export function playerBuild(s: SimState, id: number, hours: number): void {
  const m = s.modules.find((x) => x.id === id);
  if (!m || isBuilt(m)) return;
  advanceBuild(s, m, hours);
}

/**
 * A physics demonstration carried out on EVA. Each kind earns science once per mission:
 * repeating it teaches the player something, but not mission control.
 */
export function recordExperiment(s: SimState, kind: string): boolean {
  const key = `exp.${kind}`;
  if (s.flags[key]) return false;
  s.flags[key] = 1;
  s.science += TUNE.experimentScience;
  pushLog(s, 'log.experiment', 'good', { kind });
  return true;
}

/** `expedition` marks the far target of the mission, which is worth more. */
export function collectSample(s: SimState, discoveryId: string, expedition = false): boolean {
  if (s.discoveries.includes(discoveryId)) return false;
  s.discoveries.push(discoveryId);
  s.samples += 1;
  s.science += expedition ? TUNE.expeditionScience : TUNE.discoveryScience;
  if (expedition) {
    s.flags.expedition = 1;
    pushLog(s, 'log.expedition', 'good');
  }
  s.stats.samplesCollected++;
  s.flags.lastDiscoveryH = s.timeH;
  pushLog(s, 'log.sample', 'good', { id: discoveryId });
  return true;
}

export function setPowerSave(s: SimState, level: 0 | 1 | 2): void {
  if (s.powerSave === level) return;
  s.powerSave = level;
  pushLog(s, `log.powersave.${level}`, 'info');
}

export function setShelterOrder(s: SimState, on: boolean): void {
  if (s.shelterOrder === on) return;
  s.shelterOrder = on;
  pushLog(s, on ? 'log.shelter.on' : 'log.shelter.off', on ? 'warn' : 'info');
}

export function setResupplyItem(s: SimState, index: number, item: CargoItem, count: number): boolean {
  const win = s.resupply[index];
  if (!win || win.locked) return false;
  const next = { ...win.manifest, [item]: Math.max(0, Math.round(count)) };
  if (manifestMass(next) > win.capacityKg + 1e-6) return false;
  win.manifest = next;
  return true;
}

function advanceBuild(s: SimState, m: ModuleState, hours: number): number {
  const def = MODULES[m.type];
  const need = (1 - m.built) * def.buildHours;
  const used = Math.min(need, hours);
  m.built = def.buildHours > 0 ? Math.min(1, m.built + used / def.buildHours) : 1;
  if (m.built >= 1 - 1e-9) {
    m.built = 1;
    if (def.storageKwh > 0) m.charge = def.storageKwh * 0.5;
    recomputeCaps(s);
    pushLog(s, 'log.built', 'good', { type: m.type }, m.id);
  }
  return used;
}

/* -------------------------------------------------------------------- step */

interface Load {
  m: ModuleState;
  kw: number;
  rank: number;
  op: boolean;
  granted: boolean;
}

function opDraw(s: SimState, m: ModuleState): number {
  const def = MODULES[m.type];
  switch (m.type) {
    case 'greenhouse':
      return 0.4 + 10 * CROPS[m.crop].light;
    case 'rassor':
      return rassorTarget(s, m) ? def.opKw : 0;
    case 'icerig':
      return m.richness > 0.02 && s.stores.water < s.caps.water - 0.5 ? def.opKw : 0;
    case 'moxie':
      return s.stores.o2 < s.caps.o2 - 0.2 ? def.opKw : 0;
    default:
      return def.opKw;
  }
}

function rassorTarget(s: SimState, r: ModuleState): ModuleState | null {
  let t = r.targetId ? s.modules.find((m) => m.id === r.targetId) : undefined;
  if (t && (!isBuilt(t) || t.regolith >= TUNE.regolithMax - 0.01)) t = undefined;
  if (!t) {
    // auto-assign: nearest habitat or shelter that still needs cover
    let best: ModuleState | undefined;
    let bestD = 140 * 140;
    for (const m of s.modules) {
      if ((m.type !== 'hab' && m.type !== 'shelter') || !isBuilt(m) || m.regolith >= TUNE.regolithMax - 0.01) continue;
      const d = (m.x - r.x) ** 2 + (m.z - r.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    t = best;
    r.targetId = t ? t.id : 0;
  }
  return t ?? null;
}

function solvePower(s: SimState, dtH: number): void {
  const env = s.env;
  const w = WORLDS[s.world];
  const p = emptyPower();
  const hf = heatFactor(env.outsideC);
  const loads: Load[] = [];
  const stores: ModuleState[] = [];
  const savedIds = new Set<number>();

  for (const m of s.modules) {
    const def = MODULES[m.type];
    m.kw = 0;
    if (!isUp(m)) {
      m.mode = 'off';
      if (m.type === 'solar') m.sunVis = sunVisibility(env.sunEl, horizonAt(m.horizon, env.sunAz), w.sunAngularRadius);
      continue;
    }
    const eff = conditionEff(m);
    if (def.genKw > 0) {
      let g: number;
      if (m.type === 'reactor') {
        g = def.genKw * eff;
        p.nuclearKw += g;
      } else {
        m.sunVis = sunVisibility(env.sunEl, horizonAt(m.horizon, env.sunAz), w.sunAngularRadius);
        g = def.genKw * env.solarFactor * m.sunVis * (1 - m.dust) * eff;
        p.solarKw += g;
      }
      m.output = g;
      if (m.type !== 'lander') {
        m.mode = 'full';
        m.kw = g;
      }
    }
    if (def.storageKwh > 0) {
      stores.push(m);
      p.capacityKwh += def.storageKwh;
      if (m.type !== 'lander') m.mode = 'full';
    }
    const heat = def.heatKw * hf * (1 - insulation(m));
    const keep = def.keepKw + heat;
    // power-save: the commander can drop low-priority work to stretch the batteries
    const saved =
      def.genKw <= 0 &&
      def.storageKwh <= 0 &&
      def.opKw > 0 &&
      ((s.powerSave === 1 && m.priority === 3) || (s.powerSave === 2 && m.priority >= 2));
    const op = saved ? 0 : opDraw(s, m);
    if (saved) savedIds.add(m.id);
    if (saved && keep <= 0) m.mode = 'standby';
    if (keep > 0 || op > 0) {
      if (keep > 0) loads.push({ m, kw: keep, rank: m.priority * 2, op: false, granted: false });
      if (op > 0) loads.push({ m, kw: op, rank: m.priority * 2 + 1, op: true, granted: false });
    } else if (def.genKw <= 0 && def.storageKwh <= 0 && !saved) {
      m.mode = m.type === 'rassor' || m.type === 'icerig' || m.type === 'moxie' ? 'standby' : 'full';
    }
  }
  p.genKw = p.solarKw + p.nuclearKw;

  let discharge = 0;
  for (const st of stores) {
    const def = MODULES[st.type];
    discharge += Math.min(def.maxRateKw, (st.charge * def.dischargeEff) / dtH);
  }
  let remaining = p.genKw + discharge;
  loads.sort((a, b) => a.rank - b.rank || a.m.id - b.m.id);
  const keepOk = new Map<number, boolean>();
  for (const l of loads) {
    p.demandKw += l.kw;
    if (l.op && keepOk.get(l.m.id) === false) continue;
    if (remaining + 1e-9 >= l.kw) {
      l.granted = true;
      remaining -= l.kw;
      p.servedKw += l.kw;
      l.m.kw += l.kw;
      if (!l.op) keepOk.set(l.m.id, true);
    } else if (!l.op) keepOk.set(l.m.id, false);
  }
  // resolve modes
  const byModule = new Map<number, { keep?: Load; op?: Load }>();
  for (const l of loads) {
    const e = byModule.get(l.m.id) ?? {};
    if (l.op) e.op = l;
    else e.keep = l;
    byModule.set(l.m.id, e);
  }
  for (const [, e] of byModule) {
    const m = (e.keep ?? e.op)!.m;
    const keepGranted = e.keep ? e.keep.granted : true;
    const opGranted = e.op ? e.op.granted : true;
    const wantsOp = e.op !== undefined || !savedIds.has(m.id);
    if (!keepGranted) m.mode = 'off';
    else if (!wantsOp || (e.op && !opGranted)) m.mode = 'standby';
    else m.mode = 'full';
    const missed = (e.keep && !e.keep.granted) || (e.op && !e.op.granted);
    if (missed) {
      p.shed++;
      if (m.priority === 1) p.blackout = true;
    }
  }

  let net = p.genKw - p.servedKw;
  if (net >= 0) {
    const order = [...stores].sort((a, b) => MODULES[b.type].chargeEff - MODULES[a.type].chargeEff);
    for (const st of order) {
      const def = MODULES[st.type];
      const room = (def.storageKwh - st.charge) / (def.chargeEff * dtH);
      const accept = Math.max(0, Math.min(net, def.maxRateKw, room));
      st.charge = Math.min(def.storageKwh, st.charge + accept * def.chargeEff * dtH);
      net -= accept;
      p.storageKw += accept;
      if (st.type !== 'lander') st.output = accept;
    }
    p.curtailedKw = Math.max(0, net);
  } else {
    let deficit = -net;
    const order = [...stores].sort((a, b) => MODULES[b.type].dischargeEff - MODULES[a.type].dischargeEff);
    for (const st of order) {
      const def = MODULES[st.type];
      const give = Math.max(0, Math.min(deficit, def.maxRateKw, (st.charge * def.dischargeEff) / dtH));
      st.charge = Math.max(0, st.charge - (give * dtH) / def.dischargeEff);
      deficit -= give;
      p.storageKw -= give;
      if (st.type !== 'lander') st.output = -give;
    }
  }
  for (const st of stores) p.storedKwh += st.charge;
  s.power = p;

  s.stats.energyGenKwh += p.genKw * dtH;
  s.stats.energySolarKwh += p.solarKw * dtH;
  s.stats.energyNuclearKwh += p.nuclearKw * dtH;
  s.stats.energyCurtailedKwh += p.curtailedKw * dtH;
  if (p.blackout) {
    s.stats.blackoutH += dtH;
    s.lastBlackoutH = s.timeH;
    if (!s.flags.blackout) {
      s.flags.blackout = 1;
      pushLog(s, 'log.blackout', 'bad');
    }
  } else if (s.flags.blackout && s.timeH - s.lastBlackoutH > 1) {
    s.flags.blackout = 0;
    pushLog(s, 'log.blackout.end', 'good');
  }
  if (p.shed > 0) s.stats.brownoutH += dtH;
}

/** Shares of crew time after idle categories hand their hours to the busy ones. */
export function effectiveAllocation(s: SimState): Allocation {
  let farms = false;
  let sites = false;
  for (const m of s.modules) {
    if (m.type === 'greenhouse' && isBuilt(m)) farms = true;
    if (!isBuilt(m)) sites = true;
  }
  const a: Allocation = {
    maintain: s.alloc.maintain,
    science: s.alloc.science,
    farm: farms ? s.alloc.farm : 0,
    build: sites ? s.alloc.build : 0,
  };
  const sum = a.maintain + a.science + a.farm + a.build;
  if (sum < 1e-6) return { maintain: 0.5, science: 0.5, farm: 0, build: 0 };
  a.maintain /= sum;
  a.science /= sum;
  a.farm /= sum;
  a.build /= sum;
  return a;
}

function updateCrewHours(s: SimState): { maintain: number; science: number; farm: number; build: number } {
  const workH = TUNE.workHours[s.workload];
  let total = 0;
  for (const c of s.crew) total += workH * (0.4 + (0.6 * c.health) / 100) * (0.5 + (0.5 * c.morale) / 100);
  const sh = s.shelterOrder;
  const a = effectiveAllocation(s);
  return {
    maintain: total * a.maintain * (sh ? 0.3 : 1),
    science: sh ? 0 : total * a.science,
    farm: sh ? 0 : total * a.farm,
    build: sh ? 0 : total * a.build,
  };
}

function lifeSupport(s: SimState, dtH: number, hours: FlowSnapshot['crewHours'], rng: Rng): void {
  const w = WORLDS[s.world];
  const dtD = dtH / 24;
  const dtSol = dtH / w.solH;
  const n = s.crew.length;
  const f = emptyFlows();
  f.crewHours = hours;

  let scrub = 0;
  let recycleCrew = 0;
  let o2GenCap = 0;
  let habs = 0;
  let cabinVol = 0;
  let greenhouses = 0;
  let labUp = false;
  let comms = false;
  for (const m of s.modules) {
    if (!isBuilt(m)) continue;
    const def = MODULES[m.type];
    if (m.type === 'hab') {
      habs++;
      cabinVol += 300;
    } else if (m.type === 'lander') cabinVol += 60;
    if (m.type === 'greenhouse') greenhouses++;
    if (m.mode !== 'full' || !isUp(m)) continue;
    const eff = conditionEff(m);
    scrub += def.co2ScrubKgDay * eff;
    f.crewCapacity += def.crewCapacity;
    if (m.type === 'eclss') {
      recycleCrew += TUNE.eclssCrew * eff;
      o2GenCap += TUNE.eclssO2KgDay * eff;
    }
    if (m.type === 'lab') labUp = true;
    if (m.type === 'antenna') comms = true;
  }
  f.comms = comms;

  // ---- greenhouses
  const farmNeed = greenhouses * TUNE.farmHoursPerGreenhouse;
  f.farmSat = farmNeed > 0 ? clamp01(hours.farm / farmNeed) : 0;
  let o2Plants = 0;
  let co2Plants = 0;
  let waterPlants = 0;
  let fresh = 0;
  for (const m of s.modules) {
    if (m.type !== 'greenhouse' || !isBuilt(m)) continue;
    const crop = CROPS[m.crop];
    m.output = 0;
    if (m.mode === 'full' && isUp(m)) {
      m.coldH = Math.max(0, m.coldH - dtH * 2);
      const canopy = 0.25 + 0.75 * m.growth;
      const care = TUNE.farmAutomation + (1 - TUNE.farmAutomation) * f.farmSat;
      const waterNeed = crop.waterPerSol * canopy * dtSol;
      const watered = s.stores.water > waterNeed + n * 3.5 * 0.5;
      if (watered) {
        waterPlants += waterNeed;
        m.cropHealth = Math.min(1, m.cropHealth + dtSol * 0.05);
      } else m.cropHealth = Math.max(0, m.cropHealth - dtSol * 0.25);
      m.growth += (dtSol / crop.cycleSols) * care * conditionEff(m) * (watered ? 1 : 0.2);
      o2Plants += crop.o2PerSol * canopy * dtSol;
      co2Plants += crop.co2PerSol * canopy * dtSol;
      fresh += crop.morale * (0.4 + 0.6 * m.growth) * m.cropHealth;
      m.output = crop.rationsPerSol * care * m.cropHealth;
      if (m.growth >= 1) {
        const yieldRations = crop.rationsPerSol * crop.cycleSols * m.cropHealth;
        s.stores.food += yieldRations;
        s.stats.foodGrown += yieldRations;
        s.stats.harvests++;
        s.flags.lastHarvestH = s.timeH;
        pushLog(s, 'log.harvest', 'good', { crop: m.crop, rations: Math.round(yieldRations) }, m.id);
        m.growth = 0;
        m.cropHealth = 1;
      }
    } else if (m.mode === 'standby' && isUp(m)) {
      m.coldH = Math.max(0, m.coldH - dtH);
      fresh += crop.morale * 0.3 * m.cropHealth;
    } else if (m.growth > 0) {
      // unpowered: the crop chills. After a grace period it starts to die.
      m.coldH += dtH * (0.3 + 0.7 * heatFactor(s.env.outsideC));
      if (m.coldH > 8) {
        m.cropHealth -= dtH * 0.1;
        if (m.cropHealth <= 0) {
          pushLog(s, 'log.croplost', 'bad', { crop: m.crop }, m.id);
          m.growth = 0;
          m.cropHealth = 1;
          m.coldH = 0;
        }
      }
    }
  }
  f.freshFood = Math.min(15, fresh);

  // ---- water
  const waterUse = n * HUMAN.waterKgDay * dtD;
  f.recycleFrac = n > 0 ? Math.min(1, recycleCrew / n) * TUNE.recycleEff : 0;
  const recycled = waterUse * f.recycleFrac;
  s.stats.waterRecycled += recycled;
  s.stats.waterUsed += waterUse;
  let waterOut = waterUse - recycled + waterPlants;
  let waterIn = 0;
  for (const m of s.modules) {
    if (m.type !== 'icerig') continue;
    m.output = 0;
    if (m.mode === 'full' && isUp(m)) {
      const room = Math.max(0, s.caps.water - s.stores.water);
      const made = Math.min(room, m.richness * TUNE.iceKgPerSol * conditionEff(m) * dtSol);
      waterIn += made;
      s.stats.waterMined += made;
      m.output = dtSol > 0 ? made / dtSol : 0;
    }
  }

  // ---- oxygen
  const o2Use = n * HUMAN.o2KgDay * dtD;
  s.stats.o2Used += o2Use;
  let o2In = o2Plants;
  for (const m of s.modules) {
    if (m.type !== 'moxie') continue;
    m.output = 0;
    if (m.mode === 'full' && isUp(m)) {
      const made = TUNE.moxieKgPerSol * conditionEff(m) * dtSol;
      o2In += made;
      m.output = TUNE.moxieKgPerSol * conditionEff(m);
    }
  }
  const target = Math.min(s.caps.o2, n * HUMAN.o2KgDay * TUNE.o2ReserveDays);
  const drinkReserve = n * 3.5 * 2;
  let electro = 0;
  if (o2GenCap > 0 && s.stores.o2 + o2In - o2Use < target) {
    const waterAvail = Math.max(0, s.stores.water + waterIn - waterOut - drinkReserve);
    electro = Math.max(0, Math.min(o2GenCap * dtD, target - (s.stores.o2 + o2In - o2Use), waterAvail / WATER_PER_O2));
    waterOut += electro * WATER_PER_O2;
    o2In += electro;
  }
  s.stats.o2Made += o2In;

  let hypoxia = 0;
  s.stores.o2 += o2In - o2Use;
  if (s.stores.o2 < 0) {
    hypoxia = clamp01(-s.stores.o2 / Math.max(1e-9, o2Use));
    s.stores.o2 = 0;
  }
  if (s.stores.o2 > s.caps.o2 && o2In > o2Use) s.stores.o2 = Math.max(s.caps.o2, s.stores.o2 - (o2In - o2Use));

  let thirst = 0;
  s.stores.water += waterIn - waterOut;
  if (s.stores.water < 0) {
    thirst = clamp01(-s.stores.water / Math.max(1e-9, waterUse));
    s.stores.water = 0;
  }

  // ---- food
  const foodUse = n * HUMAN.rationsDay * dtD;
  let hunger = 0;
  s.stores.food -= foodUse;
  s.stats.foodEaten += foodUse;
  if (s.stores.food < 0) {
    hunger = clamp01(-s.stores.food / Math.max(1e-9, foodUse));
    s.stats.foodEaten += s.stores.food;
    s.stores.food = 0;
  }

  // ---- carbon dioxide
  const co2Prod = n * HUMAN.co2KgDay * dtD;
  const floor = 0.3 * Math.max(0.2, cabinVol / 300);
  s.cabin.co2Kg += co2Prod;
  const removable = Math.max(0, s.cabin.co2Kg - floor);
  s.cabin.co2Kg -= Math.min(removable, scrub * dtD + co2Plants);
  const mmHg = (s.cabin.co2Kg * MMHG_PER_KG_CO2 * 300) / Math.max(60, cabinVol);

  // ---- cabin temperature
  let heated = false;
  for (const m of s.modules) if ((m.type === 'hab' || m.type === 'lander') && isUp(m) && m.mode === 'full') heated = true;
  if (heated) s.cabin.tempC += (21 - s.cabin.tempC) * (1 - Math.exp(-dtH / 3));
  else s.cabin.tempC += (s.env.outsideC - s.cabin.tempC) * (1 - Math.exp(-dtH / w.thermalTauH));

  // ---- science
  let sciRate = hours.science * TUNE.sciencePerHour * (labUp ? 1 : TUNE.scienceNoLab);
  if (labUp && s.samples > 0 && hours.science > 0) {
    sciRate *= TUNE.sampleBonus;
    s.samples = Math.max(0, s.samples - (hours.science * dtD) / TUNE.sampleHours);
  }
  s.science += sciRate * dtD;

  // ---- flows for the UI (per day)
  const perDay = dtD > 0 ? 1 / dtD : 0;
  f.o2ProdDay = o2In * perDay;
  f.o2UseDay = o2Use * perDay;
  f.waterProdDay = (waterIn + recycled) * perDay;
  f.waterUseDay = (waterOut + recycled) * perDay;
  f.foodUseDay = foodUse * perDay;
  f.co2ProdDay = co2Prod * perDay;
  f.co2RemovalCapDay = scrub + (co2Plants * perDay);
  f.co2MmHg = mmHg;
  f.scienceDay = sciRate;
  let foodProd = 0;
  for (const m of s.modules) if (m.type === 'greenhouse' && m.mode === 'full') foodProd += m.output;
  f.foodProdDay = foodProd;
  const o2Net = f.o2UseDay - f.o2ProdDay;
  const waterNet = (waterOut - waterIn) * perDay;
  f.o2Days = o2Net > 1e-6 ? s.stores.o2 / o2Net : 999;
  f.waterDays = waterNet > 1e-6 ? s.stores.water / waterNet : 999;
  f.foodDays = f.foodUseDay > 1e-6 ? s.stores.food / f.foodUseDay : 999;

  // ---- radiation + health + morale
  let baseShield = MODULES.lander.shieldGcm2;
  let bestShield = MODULES.lander.shieldGcm2;
  let habShieldSum = 0;
  let habReg = 0;
  let outdoorWork = false;
  for (const m of s.modules) {
    if (!isBuilt(m)) {
      outdoorWork = true;
      continue;
    }
    if (m.type === 'hab') {
      habShieldSum += shieldOf(m);
      habReg += m.regolith;
      bestShield = Math.max(bestShield, shieldOf(m));
    } else if (m.type === 'shelter') bestShield = Math.max(bestShield, shieldOf(m));
  }
  if (habs > 0) baseShield = habShieldSum / habs;
  f.shieldBase = baseShield;
  f.shieldShelter = Math.max(bestShield, baseShield);

  // reactor too close to where people sleep
  let reactorRate = 0;
  for (const r of s.modules) {
    if (r.type !== 'reactor' || !isUp(r)) continue;
    let d = Infinity;
    for (const h of s.modules) {
      if ((h.type !== 'hab' && h.type !== 'lander') || !isBuilt(h)) continue;
      if (h.type === 'lander' && habs > 0) continue;
      d = Math.min(d, Math.hypot(h.x - r.x, h.z - r.z));
    }
    if (d < TUNE.reactorSafeM) reactorRate += TUNE.reactorMsvDayAt30m * (30 / Math.max(12, d)) ** 2;
  }
  reactorRate *= Math.exp(-(habs > 0 ? habReg / habs : 0) / 80);

  const env = s.env;
  const workH = TUNE.workHours[s.workload];
  const eff = effectiveAllocation(s);
  const evaShare = s.shelterOrder ? 0 : (eff.build + 0.25 * eff.science) * (workH / 24);
  void outdoorWork;
  const gcrIn = env.gcrMsvDay * gcrTransmission(s.shelterOrder ? f.shieldShelter : baseShield);
  const gcrOut = env.gcrMsvDay * gcrTransmission(1);
  const speIn = env.speMsvH * speTransmission(s.shelterOrder ? f.shieldShelter : baseShield);
  const speOut = env.speMsvH * speTransmission(1);
  f.doseRateBaseMsvDay = gcrIn + speIn * 24 + reactorRate;
  f.doseRateEvaMsvDay = gcrOut + speOut * 24;

  const crowded = n > f.crewCapacity;
  const cold = s.cabin.tempC < 12;
  const co2High = mmHg > 6;
  const recentBlackout = s.timeH - s.lastBlackoutH < 24;
  const recentHarvest = s.timeH - (s.flags.lastHarvestH ?? -1e9) < 48;
  const recentDiscovery = s.timeH - (s.flags.lastDiscoveryH ?? -1e9) < 48;
  let moraleTarget =
    68 +
    f.freshFood +
    (comms ? 8 : -8) +
    TUNE.workMoraleDelta[s.workload] +
    (crowded ? -15 : 0) +
    (habs === 0 ? -8 : 0) +
    (recentBlackout ? -12 : 0) +
    (co2High ? -10 : 0) +
    (cold ? -12 : 0) +
    (hunger > 0 ? -25 : 0) +
    (thirst > 0 ? -20 : 0) +
    (s.shelterOrder ? -6 : 0) +
    (sciRate > 0.5 ? 4 : 0) +
    (recentHarvest ? 5 : 0) +
    (recentDiscovery ? 4 : 0);

  let moraleAvg = 0;
  for (const c of s.crew) {
    let eva = evaShare;
    if (c.isPlayer) eva = s.playerOutside ? 1 : s.shelterOrder ? 0 : eva * 0.5;
    c.location = c.isPlayer && s.playerOutside ? 'eva' : s.shelterOrder ? 'shelter' : 'base';
    const dGcr = (eva * gcrOut + (1 - eva) * gcrIn) * dtD;
    const dSpe = (eva * speOut + (1 - eva) * speIn) * dtH;
    const dReactor = reactorRate * (1 - eva) * dtD;
    c.doseGcr += dGcr;
    c.doseSpe += dSpe;
    c.doseReactor += dReactor;
    c.acute = c.acute * Math.exp(-dtH / 72) + dSpe + dReactor;

    let d = 4;
    if (hypoxia > 0) d -= 70 * hypoxia;
    if (mmHg > 6) d -= (mmHg - 6) * 2.5;
    if (mmHg > 15) d -= 40;
    if (thirst > 0) d -= 35 * thirst;
    if (hunger > 0) d -= 9 * hunger;
    if (cold) d -= (12 - s.cabin.tempC) * 0.9;
    if (c.acute > 100) d -= (c.acute - 100) * 0.12;
    if (crowded) d -= 1.5;
    c.health = clamp(c.health + d * dtD, 0, 100);

    const target = clamp(moraleTarget - (c.health < 50 ? 10 : 0), 0, 100);
    c.morale += (target - c.morale) * (1 - Math.exp(-dtD * 0.9));
    moraleAvg += c.morale;
  }
  moraleAvg /= Math.max(1, n);
  s.stats.moraleSum += moraleAvg * dtH;
  s.stats.moraleN += dtH;
  if (s.playerOutside) s.stats.evaH += dtH;

  // ---- stats
  if (hypoxia > 0) s.stats.hypoxiaH += dtH;
  if (thirst > 0) s.stats.thirstH += dtH;
  if (hunger > 0) s.stats.hungerH += dtH;
  if (co2High) s.stats.co2HighH += dtH;
  if (cold) s.stats.coldH += dtH;
  if (s.shelterOrder) s.stats.shelterH += dtH;
  s.stats.maxCo2 = Math.max(s.stats.maxCo2, mmHg);
  s.stats.minCabinC = Math.min(s.stats.minCabinC, s.cabin.tempC);
  if (s.timeH > 2) {
    s.stats.minO2Days = Math.min(s.stats.minO2Days, f.o2Days);
    s.stats.minWaterDays = Math.min(s.stats.minWaterDays, f.waterDays);
    s.stats.minFoodDays = Math.min(s.stats.minFoodDays, f.foodDays);
  }
  edge(s, 'hypoxia', hypoxia > 0, 'log.hypoxia', 'bad');
  edge(s, 'thirst', thirst > 0, 'log.thirst', 'bad');
  edge(s, 'hunger', hunger > 0, 'log.hunger', 'bad');
  edge(s, 'co2', mmHg > 6, 'log.co2', 'warn');
  edge(s, 'cold', cold, 'log.cold', 'warn');
  s.flows = f;
  void rng;
}

/** Log a message once when a condition becomes true; re-arm when it clears. */
function edge(s: SimState, flag: string, on: boolean, key: string, sev: LogEntry['sev']): void {
  if (on && !s.flags[flag]) {
    s.flags[flag] = 1;
    pushLog(s, key, sev);
  } else if (!on && s.flags[flag]) s.flags[flag] = 0;
}

function upkeep(s: SimState, dtH: number, hours: FlowSnapshot['crewHours'], rng: Rng): void {
  const w = WORLDS[s.world];
  const dtSol = dtH / w.solH;
  const dtD = dtH / 24;

  // ---- construction
  let build = hours.build * dtD;
  for (const m of s.modules) {
    if (build <= 0) break;
    if (isBuilt(m)) continue;
    build -= advanceBuild(s, m, build);
  }

  // ---- regolith robots
  for (const r of s.modules) {
    if (r.type !== 'rassor') continue;
    r.output = 0;
    if (!isUp(r) || r.mode !== 'full') continue;
    const t = rassorTarget(s, r);
    if (!t) continue;
    const add = TUNE.regolithPerSol * conditionEff(r) * dtSol;
    const before = t.regolith;
    t.regolith = Math.min(TUNE.regolithMax, t.regolith + add);
    r.output = TUNE.regolithPerSol * conditionEff(r);
    if (before < TUNE.regolithMax && t.regolith >= TUNE.regolithMax) pushLog(s, 'log.buried', 'good', { type: t.type }, t.id);
    for (const mark of [60, 150]) {
      if (before < mark && t.regolith >= mark) pushLog(s, 'log.regolith', 'good', { type: t.type, g: mark }, t.id);
    }
  }

  // ---- wear, dust, random failures (fewer for the youngest players)
  const storm = s.env.storm;
  const hazard = s.cfg.hazard ?? 1;
  for (const m of s.modules) {
    if (!isBuilt(m)) continue;
    const def = MODULES[m.type];
    const running = m.mode === 'full' || def.genKw > 0;
    m.condition = Math.max(0, m.condition - def.wearPerSol * w.wearFactor * hazard * dtSol * (running ? 1 : 0.4));
    if (s.world === 'mars' && m.type === 'solar') {
      m.dust = Math.min(0.85, m.dust + TUNE.dustPerSol * (1 + TUNE.stormDustFactor * storm) * dtSol);
    }
    if (m.type !== 'pylon' && m.type !== 'tank') {
      const p = (0.0035 + 0.06 * (1 - m.condition / 100) ** 2) * hazard * dtSol;
      if (rng.chance(p)) {
        m.condition = Math.max(4, m.condition - rng.range(18, 38));
        s.stats.failures++;
        pushLog(s, 'log.failure', 'warn', { type: m.type }, m.id);
      }
    }
  }
  if (s.world === 'moon' && rng.chance(0.012 * hazard * dtSol)) {
    const victims = s.modules.filter((m) => isBuilt(m) && m.type !== 'pylon' && m.type !== 'lander');
    if (victims.length) {
      const v = rng.pick(victims);
      v.condition = Math.max(5, v.condition - 30);
      pushLog(s, 'log.meteor', 'warn', { type: v.type }, v.id);
    }
  }
  if (s.world === 'mars' && storm < 0.05 && rng.chance(0.03 * dtSol)) {
    let cleaned = false;
    for (const m of s.modules) {
      if (m.type === 'solar' && m.dust > 0.05) {
        m.dust *= 0.35;
        cleaned = true;
      }
    }
    if (cleaned) pushLog(s, 'log.dustdevil', 'good');
  }

  // ---- maintenance: worst module first; a share of the time goes to brushing dust off arrays
  let maint = hours.maintain * dtD;
  let dustiest: ModuleState | null = null;
  for (const m of s.modules) if (m.type === 'solar' && isBuilt(m) && (!dustiest || m.dust > dustiest.dust)) dustiest = m;
  if (dustiest && dustiest.dust > 0.04) {
    const t = maint * 0.3;
    dustiest.dust = Math.max(0, dustiest.dust - t * 0.05);
    maint -= t;
  }
  let points = maint * TUNE.repairPerHour;
  const worst = s.modules.filter((m) => isBuilt(m) && m.condition < 97).sort((a, b) => a.condition - b.condition);
  for (const m of worst) {
    if (points <= 0) break;
    const add = Math.min(points, 100 - m.condition);
    m.condition += add;
    points -= add;
  }
  for (const m of s.modules) {
    if (!isBuilt(m)) continue;
    if (!m.down && m.condition < TUNE.offlineAt) {
      m.down = true;
      pushLog(s, 'log.offline', 'bad', { type: m.type }, m.id);
    } else if (m.down && m.condition >= TUNE.onlineAt) {
      m.down = false;
      pushLog(s, 'log.repaired', 'good', { type: m.type }, m.id);
    }
  }
}

function processEvents(s: SimState): void {
  const w = WORLDS[s.world];
  const comms = s.flows.comms;
  for (const ev of s.schedule) {
    if (ev.ended) continue;
    if (ev.kind === 'spe') {
      const lead = comms ? 2.5 : 0.4;
      if (!ev.warned && s.timeH >= ev.startH - lead) {
        ev.warned = true;
        pushLog(s, 'log.spe.warn', 'bad', { cls: ev.cls, h: Math.max(0, ev.startH - s.timeH).toFixed(1) });
      }
      if (!ev.started && s.timeH >= ev.startH) {
        ev.started = true;
        s.flags.speDose0 = avgSpeDose(s);
        s.flags.speShelter = s.shelterOrder ? 1 : 0;
        pushLog(s, 'log.spe.start', 'bad', { cls: ev.cls });
      }
      if (ev.started && s.timeH >= ev.startH + ev.durationH) {
        ev.ended = true;
        const got = avgSpeDose(s) - (s.flags.speDose0 ?? 0);
        s.stats.speHits++;
        if (s.flags.speShelter) s.stats.speSheltered++;
        pushLog(s, 'log.spe.end', got > 20 ? 'warn' : 'good', { dose: got.toFixed(1) });
      }
    } else {
      const lead = comms ? 2 * w.solH : 0.25 * w.solH;
      if (!ev.warned && s.timeH >= ev.startH - lead) {
        ev.warned = true;
        pushLog(s, 'log.storm.warn', 'warn', { sols: Math.round(ev.durationH / w.solH), h: Math.max(0, ev.startH - s.timeH).toFixed(0) });
      }
      if (!ev.started && s.timeH >= ev.startH) {
        ev.started = true;
        pushLog(s, 'log.storm.start', 'bad');
      }
      if (ev.started && s.timeH >= ev.startH + ev.durationH) {
        ev.ended = true;
        s.stats.stormSols += ev.durationH / w.solH;
        pushLog(s, 'log.storm.end', 'good');
      }
    }
  }
  for (const win of s.resupply) {
    if (win.delivered) continue;
    if (!win.locked && s.timeH >= win.cutoffH) {
      win.locked = true;
      pushLog(s, 'log.resupply.locked', 'info', { kg: Math.round(manifestMass(win.manifest)) });
    }
    if (s.timeH >= win.arrivalH) {
      win.delivered = true;
      applyCargo(s, win.manifest);
      pushLog(s, 'log.resupply.arrived', 'good', { kg: Math.round(manifestMass(win.manifest)) });
    }
  }
}

const avgSpeDose = (s: SimState): number => s.crew.reduce((a, c) => a + c.doseSpe, 0) / Math.max(1, s.crew.length);

export const totalDose = (c: CrewMember): number => c.doseGcr + c.doseSpe + c.doseReactor;

function recordTelemetry(s: SimState): void {
  const t = s.telemetry;
  const last = t.t.length ? t.t[t.t.length - 1] : -1e9;
  if (s.timeH - last < t.stepH) return;
  const n = Math.max(1, s.crew.length);
  t.t.push(s.timeH);
  t.gen.push(s.power.genKw);
  t.demand.push(s.power.demandKw);
  t.stored.push(s.power.storedKwh);
  t.o2.push(s.stores.o2);
  t.water.push(s.stores.water);
  t.food.push(s.stores.food);
  t.co2.push(s.flows.co2MmHg);
  t.dose.push(s.crew.reduce((a, c) => a + totalDose(c), 0) / n);
  t.health.push(s.crew.reduce((a, c) => a + c.health, 0) / n);
  t.morale.push(s.crew.reduce((a, c) => a + c.morale, 0) / n);
  t.science.push(s.science);
  t.tempC.push(s.cabin.tempC);
  t.sun.push(s.env.sunVisBase * (s.world === 'mars' ? clamp01(Math.sin(s.env.sunEl) * 3) : 1));
  if (t.t.length > 1600) {
    // halve the resolution so very long missions still fit in a save
    const keys = Object.keys(t).filter((k) => k !== 'stepH') as Array<Exclude<keyof Telemetry, 'stepH'>>;
    for (const k of keys) t[k] = t[k].filter((_, i) => i % 2 === 0);
    t.stepH *= 2;
  }
}

function checkOutcome(s: SimState): void {
  for (const c of s.crew) {
    if (c.health <= 0.01) {
      s.outcome = { result: 'abort', reason: 'health', atH: s.timeH };
      pushLog(s, 'log.abort.health', 'bad', { name: c.name });
      return;
    }
    if (totalDose(c) >= CAREER_LIMIT_MSV) {
      s.outcome = { result: 'abort', reason: 'dose', atH: s.timeH };
      pushLog(s, 'log.abort.dose', 'bad', { name: c.name });
      return;
    }
  }
  if (!s.cfg.endless && s.timeH >= s.cfg.durationH) {
    s.outcome = { result: 'success', atH: s.timeH };
    pushLog(s, 'log.success', 'good');
  }
}

/** Advance the mission by `dtH` hours (sub-stepped). */
export function step(s: SimState, dtH: number): void {
  let left = dtH;
  while (left > 1e-9 && !s.outcome) {
    const h = Math.min(left, MAX_STEP_H);
    left -= h;
    stepOnce(s, h);
  }
}

function stepOnce(s: SimState, dtH: number): void {
  const rng = new Rng(s.rng);
  s.timeH += dtH;
  const lander = s.modules[0];
  s.env = computeEnv(s.world, s.timeH, s.cfg.startLocalH, s.schedule, lander?.horizon ?? null, s.env, dtH);
  processEvents(s);
  const hours = updateCrewHours(s);
  upkeep(s, dtH, hours, rng);
  solvePower(s, dtH);
  lifeSupport(s, dtH, hours, rng);
  recordTelemetry(s);
  checkOutcome(s);
  s.rng = rng.state;
}

/** Sun visibility at the lander for the next `hours`, for the forecast strip in the HUD. */
export function sunForecast(s: SimState, hours: number, samples: number): number[] {
  const w = WORLDS[s.world];
  const out: number[] = [];
  const mask = s.modules[0]?.horizon ?? null;
  for (let i = 0; i < samples; i++) {
    const t = s.timeH + (hours * i) / (samples - 1);
    const sun = sunPosition(s.world, t, s.cfg.startLocalH);
    let v = sunVisibility(sun.el, horizonAt(mask, sun.az), w.sunAngularRadius);
    if (s.world === 'mars') v *= clamp01(Math.sin(sun.el) * 2.5);
    out.push(v);
  }
  return out;
}

/** Simple planning estimate used by the cargo screen: days each consumable lasts. */
export function planAutonomy(
  crew: number,
  manifest: Partial<Record<CargoItem, number>>,
): { o2: number; water: number; food: number; powerKw: number; demandKw: number } {
  const n = crew;
  const eclss = manifest.eclss ?? 0;
  const recycle = Math.min(1, (eclss * TUNE.eclssCrew) / n) * TUNE.recycleEff;
  const o2Store = n * HUMAN.o2KgDay * 3 + (manifest.o2 ?? 0) * SUPPLIES.o2.amount;
  const waterStore = n * HUMAN.waterKgDay * 3 + (manifest.water ?? 0) * SUPPLIES.water.amount;
  const foodStore = n * 3 + (manifest.food ?? 0) * SUPPLIES.food.amount;
  const o2Made = Math.min(eclss * TUNE.eclssO2KgDay, n * HUMAN.o2KgDay) + (manifest.moxie ?? 0) * TUNE.moxieKgPerSol;
  const o2Net = Math.max(0, n * HUMAN.o2KgDay - o2Made);
  const waterNet = n * HUMAN.waterKgDay * (1 - recycle) + Math.min(eclss * TUNE.eclssO2KgDay, n * HUMAN.o2KgDay) * WATER_PER_O2;
  let demand = MODULES.lander.opKw;
  let gen = 0;
  for (const k of Object.keys(manifest) as CargoItem[]) {
    if (isSupply(k)) continue;
    const d = MODULES[k];
    const c = manifest[k] ?? 0;
    demand += (d.opKw + d.keepKw + d.heatKw * 0.3) * c;
    gen += d.genKw * c;
  }
  return {
    o2: o2Net > 1e-6 ? o2Store / o2Net : 999,
    water: waterNet > 1e-6 ? waterStore / waterNet : 999,
    food: foodStore / n,
    powerKw: gen,
    demandKw: demand,
  };
}
