import { Rng } from '../core/rng';
import { clamp, clamp01 } from '../core/math';
import { MODULES, TUNE } from './catalog';
import type { CrewMember, ModuleState, ModuleType, SimState, WorldId } from './types';

/**
 * Damage you can point at. A catastrophe does not just knock points off a module's condition:
 * it leaves concrete faults — a hole of so many millimetres in a hull, a share of an array's
 * cells shattered, a cable pulled out, a dish knocked off Earth — each with its own effect,
 * its own repair and the spare parts that repair needs.
 */
export type FaultKind = 'breach' | 'cells' | 'wiring' | 'misaligned' | 'electronics' | 'crack' | 'scorch' | 'leak';
export type CatastropheKind = 'impact' | 'quake' | 'fire' | 'runaway' | 'upset';
export type InjuryKind = 'bruise' | 'fracture' | 'burn' | 'smoke';

export interface Fault {
  id: number;
  kind: FaultKind;
  /**
   * breach: hole diameter, mm · cells, scorch: fraction of the module's function lost (0..1) ·
   * misaligned: degrees off · leak: kg of water lost per hour · wiring, electronics, crack: 1.
   */
  size: number;
  /** Where on the module, in its own frame: bearing around it (rad) and height (0 foot … 1 top). */
  az: number;
  hgt: number;
  atH: number;
  cause: CatastropheKind | 'wear';
  /** Crew-hours of repair already put in by the crew. */
  work: number;
}

export interface Injury {
  kind: InjuryKind;
  /** Hours of rest still needed (a medic and first aid shorten it). */
  healH: number;
  atH: number;
  /** First aid given (it can only be given once). */
  treated?: boolean;
}

/** What a catastrophe did, for the alert, the 3D effects and the debrief. */
export interface CatastropheRecord {
  id: number;
  kind: CatastropheKind;
  atH: number;
  /** Impact point, or the module that caught fire / overheated. */
  x: number;
  z: number;
  /** Quake: magnitude · impact: crater diameter, m. */
  mag: number;
  moduleId?: number;
  faults: number;
  injured?: string;
}

export interface PlannedCatastrophe {
  h: number;
  kind: CatastropheKind;
  mag?: number;
  fired: boolean;
}

type Log = (s: SimState, key: string, sev: 'info' | 'good' | 'warn' | 'bad', params?: Record<string, string | number>, ref?: number) => void;

/* ------------------------------------------------------------------ physics */

/**
 * Cabin atmosphere: 70 kPa with 26.5 % oxygen by volume (the ISS pre-EVA "exploration"
 * atmosphere), at 22 °C. Oxygen is 29 % of that air by mass.
 */
export const CABIN_KPA = 70;
const O2_MASS_FRACTION = 0.292;
/** A hole this size or larger empties a module in about an hour: its hatches are shut at once. */
export const MAJOR_BREACH_MM = 25;

/**
 * Air escaping through a sharp-edged hole into vacuum is choked (it leaves at the speed of
 * sound): ṁ = Cd · A · p · √(γ / R T) · (2 / (γ + 1))^((γ + 1) / (2 (γ − 1))), kg/s.
 * A 5 mm hole loses about 7 kg of air an hour; the 2 mm hole found in Soyuz MS-09 in 2018, a bit over 1.
 */
export function breachAirKgH(diamMm: number): number {
  const area = Math.PI * (diamMm / 2000) ** 2;
  const gamma = 1.4;
  const choke = (2 / (gamma + 1)) ** ((gamma + 1) / (2 * (gamma - 1)));
  return 0.61 * area * CABIN_KPA * 1000 * Math.sqrt(gamma / (287 * 295)) * choke * 3600;
}

/** Oxygen the base has to release to replace what a hole lets out, kg/h. */
export const breachO2KgH = (diamMm: number): number => breachAirKgH(diamMm) * O2_MASS_FRACTION;

/* --------------------------------------------------------------- inventory */

/** Spare parts in the lander's own repair kit. */
export const KIT_PARTS = 4;

/** Which faults are fixed from outside (on EVA) and which from inside the module. */
export const OUTSIDE: Record<FaultKind, boolean> = {
  breach: false,
  cells: true,
  wiring: true,
  misaligned: true,
  electronics: false,
  crack: true,
  scorch: false,
  leak: true,
};

/** Spare parts a repair uses. */
export function partsFor(f: Fault): number {
  switch (f.kind) {
    case 'breach':
      return f.size >= MAJOR_BREACH_MM ? 3 : f.size >= 10 ? 2 : 1;
    case 'cells':
    case 'scorch':
      return Math.max(1, Math.ceil(f.size * 4));
    case 'wiring':
    case 'crack':
    case 'leak':
      return 1;
    default:
      return 0;
  }
}

/**
 * Repairs that can be improvised without a spare part, at two and a half times the work: tape and
 * sealant over a small hole (how the 2 mm hole in Soyuz MS-09 was closed in 2018), a cable
 * spliced, a pipe clamped, a plate cut from packaging bolted over a crack. Broken cells and
 * burnt equipment need real parts.
 */
export function canImprovise(f: Fault): boolean {
  return (f.kind === 'breach' && f.size < 10) || f.kind === 'wiring' || f.kind === 'leak' || f.kind === 'crack';
}
export const IMPROVISED_WORK = 2.5;

/** Crew-hours a repair takes when the crew does it (outside work adds suiting up and the airlock). */
export function repairHours(f: Fault): number {
  const base: Record<FaultKind, number> = {
    breach: 2 + f.size / 8,
    cells: 3 + 6 * f.size,
    wiring: 2,
    misaligned: 1.5,
    electronics: 1,
    crack: 3,
    scorch: 4 + 8 * f.size,
    leak: 2,
  };
  return base[f.kind] * (OUTSIDE[f.kind] ? 1.5 : 1);
}

/** Order in which the crew deals with faults: what costs air or power first. */
function urgency(m: ModuleState, f: Fault): number {
  const k: Record<FaultKind, number> = { breach: 100, wiring: 60, electronics: 55, leak: 50, misaligned: 40, cells: 30, scorch: 25, crack: 20 };
  return k[f.kind] + (f.kind === 'breach' ? f.size : 0) + (m.priority === 1 ? 15 : m.priority === 2 ? 5 : 0);
}

/* ----------------------------------------------------------------- effects */

const has = (m: ModuleState, kind: FaultKind): Fault | undefined => m.faults?.find((f) => f.kind === kind);

/** A cut cable, a crashed computer or a hole too big to live with take a module out of service. */
export function blocked(m: ModuleState): boolean {
  if (!m.faults?.length) return false;
  return m.faults.some((f) => f.kind === 'wiring' || f.kind === 'electronics' || (f.kind === 'breach' && f.size >= MAJOR_BREACH_MM));
}

/** Share of a module's function its faults leave: broken cells, fire damage, an array knocked off the Sun. */
export function faultEff(m: ModuleState): number {
  if (!m.faults?.length) return 1;
  let e = 1;
  for (const f of m.faults) {
    if ((f.kind === 'cells' && m.type !== 'battery' && m.type !== 'fuelcell') || f.kind === 'scorch') e *= 1 - clamp01(f.size);
    else if (f.kind === 'misaligned' && m.type === 'solar') e *= Math.max(0, Math.cos((f.size * Math.PI) / 180));
  }
  return e;
}

/** Storage left in a battery or fuel cell after a thermal runaway burnt some of its cells, kWh. */
export function storageCap(m: ModuleState): number {
  const def = MODULES[m.type];
  const burnt = m.type === 'battery' || m.type === 'fuelcell' ? (has(m, 'cells')?.size ?? 0) : 0;
  return def.storageKwh * (1 - clamp01(burnt));
}

/** A dish more than this many degrees off Earth loses the link. */
export const LINK_DEG = 6;

/** The antenna can still hold the link with Earth. */
export function antennaPointed(m: ModuleState): boolean {
  const f = has(m, 'misaligned');
  return !f || f.size < LINK_DEG;
}

/** Oxygen and water escaping through the base's faults right now, kg/h. */
export function faultLosses(s: SimState): { o2: number; water: number } {
  let o2 = 0;
  let water = 0;
  for (const m of s.modules) {
    if (!m.faults) continue;
    for (const f of m.faults) {
      // a module sealed off behind its hatches loses no more of the base's air
      if (f.kind === 'breach' && f.size < MAJOR_BREACH_MM && !m.down) o2 += breachO2KgH(f.size);
      else if (f.kind === 'leak') water += f.size;
    }
  }
  return { o2, water };
}

/** All faults in the base, with their module. */
export function allFaults(s: SimState): Array<{ m: ModuleState; f: Fault }> {
  const out: Array<{ m: ModuleState; f: Fault }> = [];
  for (const m of s.modules) for (const f of m.faults ?? []) out.push({ m, f });
  return out;
}

/** Find a fault by id. */
export function findFault(s: SimState, id: number): { m: ModuleState; f: Fault } | null {
  for (const m of s.modules) {
    const f = m.faults?.find((x) => x.id === id);
    if (f) return { m, f };
  }
  return null;
}

/* ------------------------------------------------------------------- where */

/** Height of each module's main body, m (where faults are placed and drawn). */
const BODY_H: Partial<Record<ModuleType, number>> = {
  hab: 4.2,
  lab: 3.6,
  greenhouse: 3.4,
  shelter: 3.2,
  eclss: 2.6,
  tank: 2.2,
  solar: 7,
  battery: 2,
  fuelcell: 2.4,
  reactor: 3,
  icerig: 4,
  moxie: 1.6,
  propellant: 3,
  rassor: 1.4,
  antenna: 4,
  lander: 5,
  pylon: 3,
};

/** A fault's position relative to its module's origin, in the module's own frame (x, y, z), m. */
export function faultLocal(m: ModuleState, f: Fault): [number, number, number] {
  const r = MODULES[m.type].radius * (m.type === 'solar' ? 0.25 : 0.62);
  const hgt = (BODY_H[m.type] ?? 3) * (0.2 + 0.7 * f.hgt);
  return [Math.sin(f.az) * r, hgt, Math.cos(f.az) * r];
}

/** World position of a fault (module rotated about Y). */
export function faultWorld(m: ModuleState, f: Fault): [number, number, number] {
  const [lx, ly, lz] = faultLocal(m, f);
  const c = Math.cos(m.rot);
  const s = Math.sin(m.rot);
  return [m.x + lx * c + lz * s, m.y + ly, m.z - lx * s + lz * c];
}

/* ------------------------------------------------------------------ create */

/** Add a fault to a module, or worsen the one of the same kind it already has. Returns it. */
export function addFault(s: SimState, m: ModuleState, kind: FaultKind, size: number, cause: Fault['cause'], rng: Rng, faceAz?: number): Fault {
  m.faults ??= [];
  const same = m.faults.find((f) => f.kind === kind);
  if (same) {
    // two holes leak like one bigger hole of the same total area; shares of damage add up
    if (kind === 'breach') same.size = Math.sqrt(same.size ** 2 + size ** 2);
    else if (kind === 'cells' || kind === 'scorch') same.size = clamp(same.size + size * (1 - same.size), 0, 0.95);
    else if (kind === 'misaligned' || kind === 'leak') same.size += size * 0.6;
    same.work = 0;
    return same;
  }
  const f: Fault = {
    id: (s.nextFaultId = (s.nextFaultId ?? 1) + 1),
    kind,
    size,
    az: faceAz !== undefined ? faceAz + rng.range(-0.5, 0.5) : rng.range(-Math.PI, Math.PI),
    hgt: rng.range(0.15, 0.9),
    atH: s.timeH,
    cause,
    work: 0,
  };
  m.faults.push(f);
  return f;
}

function removeFault(m: ModuleState, id: number): void {
  if (!m.faults) return;
  m.faults = m.faults.filter((f) => f.id !== id);
  if (!m.faults.length) delete m.faults;
}

/* ---------------------------------------------------------------- injuries */

const INJURY: Record<InjuryKind, { hit: number; healH: number }> = {
  bruise: { hit: 8, healH: 24 },
  smoke: { hit: 14, healH: 36 },
  burn: { hit: 20, healH: 96 },
  fracture: { hit: 22, healH: 240 },
};

/** Hurt one crew member (not the commander when `spareCommander`). Returns their name. */
export function injure(s: SimState, kind: InjuryKind, rng: Rng, log: Log, spareCommander = false): string | undefined {
  const pool = s.crew.filter((c) => !c.injury && !(spareCommander && c.isPlayer));
  if (!pool.length) return undefined;
  const c = rng.pick(pool);
  const spec = INJURY[kind];
  c.health = Math.max(5, c.health - spec.hit);
  c.injury = { kind, healH: spec.healH, atH: s.timeH };
  s.stats.injuries = (s.stats.injuries ?? 0) + 1;
  log(s, `log.injury.${kind}`, 'bad', { name: c.name });
  return c.name;
}

/** First aid: the medic's kit or the commander's hands halve the rest still needed (once). */
export function treatInjury(s: SimState, crewId: number, quality: number, log: Log): boolean {
  const c = s.crew.find((x) => x.id === crewId);
  if (!c?.injury || c.injury.treated) return false;
  c.injury.treated = true;
  c.injury.healH *= quality >= 0.5 ? 0.5 : 0.75;
  c.health = Math.min(100, c.health + 6);
  log(s, 'log.injury.treated', 'good', { name: c.name });
  return true;
}

/** Work an injured crew member can still do: none with a fracture or a burn, some with a bruise. */
export function injuryWork(c: CrewMember): number {
  if (!c.injury) return 1;
  return c.injury.kind === 'bruise' ? 0.6 : c.injury.kind === 'smoke' ? 0.4 : 0;
}

/* --------------------------------------------------------------- planning */

/** Random catastrophes per sol at the middle level (Mars's air burns up most small meteoroids). */
const RATES: Record<WorldId, Record<'impact' | 'quake' | 'fire' | 'runaway', number>> = {
  moon: { impact: 1 / 28, quake: 1 / 35, fire: 1 / 80, runaway: 1 / 100 },
  mars: { impact: 1 / 250, quake: 1 / 45, fire: 1 / 80, runaway: 1 / 100 },
};

export interface CatastropheSpec {
  sol: [number, number];
  kind: CatastropheKind;
  /** Quake magnitude, or crater diameter in metres for an impact. */
  mag?: [number, number];
}

/**
 * The mission's catastrophes, as mission hours: the scripted ones, plus random ones (a Poisson
 * process from the seed, so a code always brings the same ones). Training missions, the demo
 * and the historical scenarios only get what they script.
 */
export function planCatastrophes(
  m: { world: WorldId; durationSols: number; endless: boolean; tutorial: boolean; historic?: boolean; id: string; catastrophes?: CatastropheSpec[]; calm?: boolean },
  seed: number,
  solH: number,
  hazard: number,
): PlannedCatastrophe[] {
  const rng = new Rng(seed ^ 0xca7a5);
  const out: PlannedCatastrophe[] = (m.catastrophes ?? []).map((c) => ({
    h: rng.range(c.sol[0], c.sol[1]) * solH,
    kind: c.kind,
    mag: c.mag ? rng.range(c.mag[0], c.mag[1]) : undefined,
    fired: false,
  }));
  if (!m.tutorial && !m.historic && !m.calm && m.id !== 'demo-moon') {
    const days = m.endless ? 400 : m.durationSols;
    for (const kind of ['impact', 'quake', 'fire', 'runaway'] as const) {
      const rate = RATES[m.world][kind] * hazard;
      let sol = 3;
      for (;;) {
        sol += -Math.log(1 - rng.next()) / rate;
        if (sol >= days - 1) break;
        out.push({ h: sol * solH, kind, fired: false });
      }
    }
  }
  out.sort((a, b) => a.h - b.h);
  return out;
}

/* ------------------------------------------------------------ catastrophes */

const PRESSURISED = new Set<ModuleType>(['hab', 'lab', 'greenhouse', 'shelter']);
const FLUIDS = new Set<ModuleType>(['tank', 'eclss', 'icerig', 'propellant']);
/** Modules whose control electronics a solar storm can upset. */
const ELECTRONIC = new Set<ModuleType>(['antenna', 'solar', 'battery', 'eclss', 'icerig', 'propellant', 'moxie', 'rassor', 'lab', 'reactor', 'fuelcell']);

const builtNotLander = (s: SimState): ModuleState[] => s.modules.filter((m) => m.built >= 1 && m.type !== 'lander');

function record(s: SimState, rec: Omit<CatastropheRecord, 'id' | 'atH'>): CatastropheRecord {
  s.catastrophes ??= [];
  const r: CatastropheRecord = { id: (s.catastrophes.at(-1)?.id ?? 0) + 1, atH: s.timeH, ...rec };
  s.catastrophes.push(r);
  if (s.catastrophes.length > 24) s.catastrophes.splice(0, s.catastrophes.length - 24);
  s.stats.catastrophes = (s.stats.catastrophes ?? 0) + 1;
  return r;
}

/** Centre of the base (where its modules are). */
function baseCentre(s: SimState): [number, number] {
  const mods = s.modules.filter((m) => m.built >= 1);
  const x = mods.reduce((a, m) => a + m.x, 0) / Math.max(1, mods.length);
  const z = mods.reduce((a, m) => a + m.z, 0) / Math.max(1, mods.length);
  return [x, z];
}

/** Upgrade multipliers (1 without the upgrade). */
const upg = (s: SimState, id: string, k: number): number => (s.upgrades?.includes(id) ? k : 1);

/**
 * A meteoroid strikes near the base. Nothing slows it down on the Moon: it arrives at about
 * 20 km/s, digs a crater and sprays ejecta for tens of metres. On 17 March 2013 one of about
 * 40 kg flashed bright enough to be seen from Earth and left an 18 m crater that the Lunar
 * Reconnaissance Orbiter later photographed. Ejecta, not direct hits, is what damages a base.
 */
export function strikeImpact(s: SimState, rng: Rng, log: Log, diameter?: number, at?: [number, number]): CatastropheRecord {
  const d = diameter ?? rng.range(3, 12);
  const [cx, cz] = baseCentre(s);
  let ix = cx;
  let iz = cz;
  if (at) [ix, iz] = at;
  else {
    // somewhere close enough to matter, never on top of a module
    for (let i = 0; i < 30; i++) {
      const a = rng.range(-Math.PI, Math.PI);
      const r = rng.range(40, 105);
      ix = cx + Math.sin(a) * r;
      iz = cz + Math.cos(a) * r;
      if (s.modules.every((m) => Math.hypot(m.x - ix, m.z - iz) > MODULES[m.type].radius + d * 0.6 + 12)) break;
    }
  }
  const reach = 15 + 5 * d;
  let n = 0;
  const shield = upg(s, 'whipple', 0.5);
  for (const m of builtNotLander(s)) {
    const dist = Math.max(0, Math.hypot(m.x - ix, m.z - iz) - MODULES[m.type].radius);
    if (dist > reach) continue;
    const q = (1 - dist / reach) ** 2;
    if (!rng.chance(0.25 + 0.9 * q)) continue;
    // the side of the module that faces the crater takes the spray
    const face = Math.atan2(ix - m.x, iz - m.z) - m.rot;
    const scale = Math.min(1.6, d / 8);
    if (m.type === 'solar') addFault(s, m, 'cells', clamp((0.08 + 0.5 * q * scale) * shield, 0.04, 0.7), 'impact', rng, face);
    else if (PRESSURISED.has(m.type)) addFault(s, m, 'breach', clamp((1 + 7 * q * scale) * shield, 1, 12), 'impact', rng, face);
    else if (m.type === 'antenna') addFault(s, m, 'misaligned', 3 + 12 * q * scale, 'impact', rng, face);
    else if (m.type === 'pylon') {
      const near = builtNotLander(s)
        .filter((o) => o.type !== 'pylon')
        .sort((a, b) => Math.hypot(a.x - m.x, a.z - m.z) - Math.hypot(b.x - m.x, b.z - m.z))[0];
      if (near) addFault(s, near, 'wiring', 1, 'impact', rng);
    } else if (FLUIDS.has(m.type) && rng.chance(0.5)) addFault(s, m, 'leak', clamp(1 + 6 * q * scale, 1, 8), 'impact', rng, face);
    else addFault(s, m, q > 0.35 ? 'crack' : 'wiring', 1, 'impact', rng, face);
    n++;
  }
  const rec = record(s, { kind: 'impact', x: ix, z: iz, mag: d, faults: n });
  log(s, 'log.cat.impact', 'bad', { d: Math.round(d), m: Math.round(Math.hypot(ix - cx, iz - cz)), n });
  return rec;
}

/**
 * The ground shakes. The Apollo seismometers recorded 28 shallow moonquakes between 1972 and
 * 1977, some above magnitude 5; the strongest, on 13 March 1973, was centred near the south
 * pole, where young faults cross the Artemis landing regions. A dry, cold Moon rings for many
 * minutes. InSight measured a magnitude-4.7 marsquake on 4 May 2022.
 */
export function strikeQuake(s: SimState, rng: Rng, log: Log, magnitude?: number): CatastropheRecord {
  const mag = magnitude ?? (s.world === 'moon' ? rng.range(2.8, 5) : rng.range(2.8, 4.7));
  const k = clamp01((mag - 2.5) / 2.5) * upg(s, 'seismic', 0.5);
  let n = 0;
  for (const m of builtNotLander(s)) {
    if (m.type === 'antenna' && rng.chance(0.35 + 0.6 * k)) {
      addFault(s, m, 'misaligned', 3 + 12 * k + rng.range(0, 4), 'quake', rng);
      n++;
    } else if (m.type === 'solar' && rng.chance(s.world === 'moon' ? 0.25 + 0.5 * k : 0.1 + 0.3 * k)) {
      // tall masts lean; low Martian trackers barely notice
      addFault(s, m, 'misaligned', (s.world === 'moon' ? 3 + 14 * k : 2 + 6 * k) + rng.range(0, 3), 'quake', rng);
      n++;
    } else if (PRESSURISED.has(m.type) && rng.chance(0.1 + 0.45 * k)) {
      addFault(s, m, 'crack', 1, 'quake', rng);
      n++;
    } else if (FLUIDS.has(m.type) && rng.chance(0.1 + 0.4 * k)) {
      addFault(s, m, 'leak', 1 + 6 * k, 'quake', rng);
      n++;
    }
  }
  // connectors shaken loose
  const pulls = Math.floor(k * 2.4 + rng.next() * 0.6);
  const pool = builtNotLander(s).filter((m) => m.type !== 'pylon' && !has(m, 'wiring'));
  for (let i = 0; i < pulls && pool.length; i++) {
    const m = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    addFault(s, m, 'wiring', 1, 'quake', rng);
    n++;
  }
  let injured: string | undefined;
  if (rng.chance(clamp(0.1 + 0.55 * k, 0, 0.7))) injured = injure(s, k > 0.55 ? 'fracture' : 'bruise', rng, log, s.playerOutside);
  const rec = record(s, { kind: 'quake', x: 0, z: 0, mag, faults: n, injured });
  log(s, s.world === 'moon' ? 'log.cat.moonquake' : 'log.cat.marsquake', 'bad', { m: mag.toFixed(1), n });
  return rec;
}

/**
 * Lithium-ion cells can overheat and set off their neighbours: a thermal runaway. It grounded
 * the Boeing 787 in 2013, and NASA tests every battery for the ISS so that one failed cell
 * cannot spread to the rest. Here part of a battery is lost and its connections burn.
 */
export function strikeRunaway(s: SimState, rng: Rng, log: Log): CatastropheRecord | null {
  const packs = s.modules.filter((m) => m.built >= 1 && (m.type === 'battery' || m.type === 'fuelcell') && !has(m, 'cells'));
  if (!packs.length) return null;
  const m = rng.pick(packs);
  addFault(s, m, 'cells', rng.range(0.3, 0.6) * upg(s, 'cellguard', 0.5), 'runaway', rng);
  addFault(s, m, 'wiring', 1, 'runaway', rng);
  m.charge = Math.min(m.charge, storageCap(m));
  const rec = record(s, { kind: 'runaway', x: m.x, z: m.z, mag: 0, moduleId: m.id, faults: 2 });
  log(s, 'log.cat.runaway', 'bad', { type: m.type }, m.id);
  return rec;
}

/**
 * A solar proton can flip a bit in a computer (a single-event upset) and crash it. Modules
 * buried under regolith are shielded; the rest may need a reboot during a strong storm.
 */
export function strikeUpset(s: SimState, rng: Rng, log: Log): CatastropheRecord | null {
  const pool = builtNotLander(s).filter((m) => ELECTRONIC.has(m.type) && m.regolith < 60 && !has(m, 'electronics'));
  if (!pool.length) return null;
  const m = rng.pick(pool);
  addFault(s, m, 'electronics', 1, 'upset', rng);
  const rec = record(s, { kind: 'upset', x: m.x, z: m.z, mag: 0, moduleId: m.id, faults: 1 });
  log(s, 'log.cat.upset', 'warn', { type: m.type }, m.id);
  return rec;
}

/** Fire in a pressurised module (handled as an emergency: see emergency.ts). Returns the module. */
export function fireTarget(s: SimState, rng: Rng): ModuleState | null {
  const pool = s.modules.filter((m) => m.built >= 1 && PRESSURISED.has(m.type) && !m.down);
  return pool.length ? rng.pick(pool) : null;
}

/** Record a fire for the 3D effects and the debrief. */
export function recordFire(s: SimState, m: ModuleState): CatastropheRecord {
  return record(s, { kind: 'fire', x: m.x, z: m.z, mag: 0, moduleId: m.id, faults: 1 });
}

/* ------------------------------------------------------------------ update */

/**
 * Advance the faults: air and water escape, cracks grow, the injured rest. The crew spends
 * `crewH` hours of maintenance on the most urgent faults first and returns the hours left.
 */
export function updateFaults(s: SimState, dtH: number, crewH: number, engineer: number, medic: number, rng: Rng, log: Log): number {
  // ---- what escapes
  const loss = faultLosses(s);
  if (loss.o2 > 0) {
    const lost = Math.min(s.stores.o2, loss.o2 * dtH);
    s.stores.o2 -= lost;
    s.stats.faultO2Lost = (s.stats.faultO2Lost ?? 0) + lost;
  }
  if (loss.water > 0) {
    const lost = Math.min(s.stores.water, loss.water * dtH);
    s.stores.water -= lost;
    s.stats.faultWaterLost = (s.stats.faultWaterLost ?? 0) + lost;
  }
  // ---- cracks open up into holes if nobody bolts a plate over them (about 1 in 8 per sol)
  const solH = s.world === 'moon' ? 24 : 24.66;
  for (const m of s.modules) {
    const c = has(m, 'crack');
    if (!c || !PRESSURISED.has(m.type)) continue;
    if (rng.chance((0.13 * dtH) / solH)) {
      addFault(s, m, 'breach', rng.range(2, 6), c.cause, rng, c.az);
      log(s, 'log.fault.crackOpened', 'bad', { type: m.type }, m.id);
    }
  }
  // ---- the injured recover (faster with a medic)
  for (const c of s.crew) {
    if (!c.injury) continue;
    c.injury.healH -= dtH * medic;
    if (c.injury.healH <= 0) {
      log(s, 'log.injury.healed', 'good', { name: c.name });
      delete c.injury;
    }
  }
  // ---- with oxygen running out, the crew shuts the hatches on a leaking module rather than lose more
  if (loss.o2 > 0 && s.flows.o2Days < 2) {
    for (const m of s.modules) {
      if (m.down || !m.faults?.some((f) => f.kind === 'breach')) continue;
      m.down = true;
      m.condition = Math.min(m.condition, TUNE.offlineAt - 1);
      log(s, 'log.fault.sealed', 'bad', { type: m.type }, m.id);
    }
  }
  // ---- repairs by the crew
  let left = crewH;
  if (left <= 0) return 0;
  const queue = allFaults(s).sort((a, b) => urgency(b.m, b.f) - urgency(a.m, a.f));
  for (const { m, f } of queue) {
    if (left <= 1e-9) break;
    const need = partsFor(f);
    const short = need > (s.stores.spares ?? 0);
    if (short && !canImprovise(f)) {
      if (!s.flags[`noparts.${f.id}`]) {
        s.flags[`noparts.${f.id}`] = 1;
        log(s, 'log.fault.noparts', 'warn', { type: m.type, n: need }, m.id);
      }
      continue;
    }
    const hours = repairHours(f) * (short ? IMPROVISED_WORK : 1);
    const put = Math.min(left, (hours - f.work) / engineer);
    f.work += put * engineer;
    left -= put;
    if (f.work >= hours - 1e-6) {
      if (!short) {
        s.stores.spares = (s.stores.spares ?? 0) - need;
        s.stats.partsUsed = (s.stats.partsUsed ?? 0) + need;
      }
      s.stats.faultsFixed = (s.stats.faultsFixed ?? 0) + 1;
      removeFault(m, f.id);
      delete s.flags[`noparts.${f.id}`];
      // a sealed-off module comes back once its hole is closed
      if (f.kind === 'breach' && m.down && !m.faults?.some((x) => x.kind === 'breach')) m.condition = Math.max(m.condition, TUNE.onlineAt + 5);
      log(s, short ? 'log.fault.improvised' : 'log.fault.fixed', 'good', { type: m.type, what: `fault.${f.kind}` }, m.id);
    }
  }
  return left;
}

export type RepairResult = 'fixed' | 'partial' | 'noparts' | 'gone';

/**
 * The commander repairs a fault by hand (the minigame's `quality`, 0..1). A careless job only
 * halves the damage; parts are used either way.
 */
export function repairFault(s: SimState, faultId: number, quality: number, log: Log): RepairResult {
  const hit = findFault(s, faultId);
  if (!hit) return 'gone';
  const { m, f } = hit;
  const need = partsFor(f);
  const short = need > (s.stores.spares ?? 0);
  if (short && !canImprovise(f)) return 'noparts';
  if (!short) {
    s.stores.spares = (s.stores.spares ?? 0) - need;
    s.stats.partsUsed = (s.stats.partsUsed ?? 0) + need;
  }
  if (quality < 0.5 && f.kind !== 'wiring' && f.kind !== 'electronics') {
    f.size *= f.kind === 'misaligned' ? 0.3 : 0.5;
    f.work = 0;
    log(s, 'log.fault.partial', 'warn', { type: m.type, what: `fault.${f.kind}` }, m.id);
    return 'partial';
  }
  removeFault(m, f.id);
  if (f.kind === 'breach' && m.down && !m.faults?.some((x) => x.kind === 'breach')) m.condition = Math.max(m.condition, TUNE.onlineAt + 5);
  s.stats.faultsFixed = (s.stats.faultsFixed ?? 0) + 1;
  s.stats.faultsByPlayer = (s.stats.faultsByPlayer ?? 0) + 1;
  log(s, 'log.fault.fixedByYou', 'good', { type: m.type, what: `fault.${f.kind}` }, m.id);
  return 'fixed';
}

/** Fire the planned catastrophes that are due (fires go through the emergency system). */
export function dueCatastrophes(s: SimState): PlannedCatastrophe[] {
  return (s.catastrophePlan ?? []).filter((p) => !p.fired && s.timeH >= p.h);
}
