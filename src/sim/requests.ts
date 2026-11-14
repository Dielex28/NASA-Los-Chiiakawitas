import { Rng } from '../core/rng';
import { addFault } from './faults';
import { WORLDS } from './worlds';
import type { ModuleState, SimState, WorldId } from './types';

/**
 * Mission Control's requests: side missions with a place, a deadline and a reward, as the
 * science teams on Earth asked of every Apollo crew. Deploy a seismometer far from the base's
 * vibrations and level it, as the Apollo crews levelled theirs; set out a laser retroreflector
 * that observatories still range to today; bring back a core from a chosen spot; inspect a
 * module whose readings look odd; photograph Earth or a Martian sunset for the public.
 */
export type RequestKind = 'seismometer' | 'reflector' | 'weather' | 'core' | 'photo' | 'harvest' | 'inspect';
export type InstrumentKind = 'seismometer' | 'reflector' | 'weather';
export type PhotoTarget = 'earth' | 'sunset' | 'base';

export interface Request {
  id: number;
  kind: RequestKind;
  /** Where to go (deploy, core), or the module to inspect. */
  x: number;
  z: number;
  moduleId?: number;
  photo?: PhotoTarget;
  /** Harvest: number of harvests to reach. */
  goal?: number;
  createdH: number;
  dueH: number;
  status: 'open' | 'done' | 'missed';
  /** Science points it is worth. */
  reward: number;
  /** The game moved the spot onto walkable ground. */
  placed?: boolean;
}

export interface Instrument {
  kind: InstrumentKind;
  x: number;
  z: number;
  atH: number;
  /** How well it was levelled or aimed, 0..1 (it scales the science it returns). */
  quality: number;
}

export interface RequestState {
  list: Request[];
  nextId: number;
  plan: Array<{ h: number; kind: RequestKind; fired: boolean }>;
  instruments: Instrument[];
}

type Log = (s: SimState, key: string, sev: 'info' | 'good' | 'warn' | 'bad', params?: Record<string, string | number>, ref?: number) => void;

/** Science each request is worth, and the sols given to do it. */
const REWARD: Record<RequestKind, number> = { seismometer: 6, reflector: 5, weather: 5, core: 8, photo: 3, harvest: 4, inspect: 3 };
const DUE_SOLS: Record<RequestKind, number> = { seismometer: 4, reflector: 4, weather: 4, core: 5, photo: 4, harvest: 9, inspect: 2 };
/** How far from the base, m: a seismometer must be clear of the base's own vibrations. */
const RANGE: Partial<Record<RequestKind, [number, number]>> = {
  seismometer: [110, 170],
  reflector: [50, 95],
  weather: [40, 75],
  core: [200, 340],
};
/** Science per sol an instrument keeps returning, at full quality. */
export const INSTRUMENT_SCIENCE: Record<InstrumentKind, number> = { seismometer: 0.3, reflector: 0.25, weather: 0.25 };
/** A seismometer on the ground turns every later quake or impact into data. */
export const SEISMIC_EVENT_SCIENCE = 2;

const KINDS: Record<WorldId, RequestKind[]> = {
  moon: ['seismometer', 'reflector', 'core', 'photo', 'harvest', 'inspect'],
  mars: ['seismometer', 'weather', 'core', 'photo', 'harvest', 'inspect'],
};

export const initRequests = (): RequestState => ({ list: [], nextId: 1, plan: [], instruments: [] });

/** When Control will ask for what, from the seed (none in training missions or the demo). */
export function planRequests(m: { world: WorldId; durationSols: number; endless: boolean; tutorial: boolean; id: string }, seed: number): RequestState {
  const st = initRequests();
  if (m.tutorial || m.id === 'demo-moon' || m.durationSols < 6) return st;
  const rng = new Rng(seed ^ 0x2e9e57);
  const solH = WORLDS[m.world].solH;
  const end = m.endless ? 200 : m.durationSols - 1.5;
  const bag: RequestKind[] = [];
  let sol = rng.range(1.2, 2);
  while (sol < end) {
    if (!bag.length) {
      // a fresh shuffle each round; instruments are only asked for once
      const kinds = KINDS[m.world].filter((k) => !st.plan.some((p) => p.kind === k && (k === 'seismometer' || k === 'reflector' || k === 'weather')));
      for (const k of kinds) bag.splice(Math.floor(rng.next() * (bag.length + 1)), 0, k);
      if (!bag.length) break;
    }
    st.plan.push({ h: sol * solH, kind: bag.shift()!, fired: false });
    sol += rng.range(3, 5.5);
  }
  return st;
}

const built = (m: ModuleState): boolean => m.built >= 1;

function centre(s: SimState): [number, number] {
  const mods = s.modules.filter(built);
  return [mods.reduce((a, m) => a + m.x, 0) / Math.max(1, mods.length), mods.reduce((a, m) => a + m.z, 0) / Math.max(1, mods.length)];
}

/** Turn a planned request into an open one (or skip it if the base has nothing it applies to). */
function open(s: SimState, kind: RequestKind, rng: Rng, log: Log): void {
  const st = s.requests!;
  const solH = WORLDS[s.world].solH;
  const r: Request = { id: st.nextId++, kind, x: 0, z: 0, createdH: s.timeH, dueH: s.timeH + DUE_SOLS[kind] * solH, status: 'open', reward: REWARD[kind] };
  const range = RANGE[kind];
  if (range) {
    const [cx, cz] = centre(s);
    const a = rng.range(-Math.PI, Math.PI);
    const d = rng.range(range[0], range[1]);
    r.x = cx + Math.sin(a) * d;
    r.z = cz + Math.cos(a) * d;
  } else if (kind === 'inspect') {
    const pool = s.modules.filter((m) => built(m) && ['hab', 'lab', 'greenhouse', 'shelter'].includes(m.type));
    if (!pool.length) return;
    const m = rng.pick(pool);
    r.moduleId = m.id;
    r.x = m.x;
    r.z = m.z;
  } else if (kind === 'harvest') {
    const farm = s.modules.find((m) => built(m) && m.type === 'greenhouse' && !m.fallow);
    if (!farm) return;
    r.moduleId = farm.id;
    r.goal = s.stats.harvests + 1;
  } else if (kind === 'photo') r.photo = s.world === 'moon' ? 'earth' : 'sunset';
  st.list.push(r);
  log(s, `log.req.new.${kind}`, 'info', { sols: DUE_SOLS[kind], sci: r.reward });
}

/** Open, missed or finished requests, and the instruments' steady return of data. */
export function updateRequests(s: SimState, dtH: number, rng: Rng, log: Log): void {
  const st = (s.requests ??= initRequests());
  for (const p of st.plan) {
    if (!p.fired && s.timeH >= p.h) {
      p.fired = true;
      open(s, p.kind, rng, log);
    }
  }
  for (const r of st.list) {
    if (r.status !== 'open') continue;
    if (r.kind === 'harvest' && r.goal !== undefined && s.stats.harvests >= r.goal) {
      finish(s, r, log);
      continue;
    }
    if (s.timeH >= r.dueH) {
      r.status = 'missed';
      s.stats.requestsMissed = (s.stats.requestsMissed ?? 0) + 1;
      s.flags.requestMissH = s.timeH;
      // an inspection nobody did: the seal Control was worried about lets go
      const m = r.kind === 'inspect' ? s.modules.find((x) => x.id === r.moduleId) : undefined;
      if (m) addFault(s, m, 'breach', rng.range(2, 4), 'wear', rng);
      log(s, `log.req.missed`, 'warn', { what: `req.${r.kind}` });
    }
  }
  const solH = WORLDS[s.world].solH;
  for (const i of st.instruments) s.science += INSTRUMENT_SCIENCE[i.kind] * (0.5 + 0.5 * i.quality) * (dtH / solH);
}

function finish(s: SimState, r: Request, log: Log, quality = 1): void {
  r.status = 'done';
  const sci = r.reward * (0.6 + 0.4 * quality);
  s.science += sci;
  s.stats.requestsDone = (s.stats.requestsDone ?? 0) + 1;
  s.flags.requestDoneH = s.timeH;
  log(s, 'log.req.done', 'good', { what: `req.${r.kind}`, sci: sci.toFixed(1) });
}

/** The open request of a kind, if any. */
export function openRequest(s: SimState, id: number): Request | null {
  return s.requests?.list.find((r) => r.id === id && r.status === 'open') ?? null;
}

export function openRequests(s: SimState): Request[] {
  return s.requests?.list.filter((r) => r.status === 'open') ?? [];
}

/** Set an instrument out on the spot Control chose (the minigame's levelling or aiming is `quality`). */
export function deployInstrument(s: SimState, id: number, quality: number, log: Log): boolean {
  const r = openRequest(s, id);
  if (!r || (r.kind !== 'seismometer' && r.kind !== 'reflector' && r.kind !== 'weather')) return false;
  s.requests!.instruments.push({ kind: r.kind, x: r.x, z: r.z, atH: s.timeH, quality: Math.max(0, Math.min(1, quality)) });
  finish(s, r, log, quality);
  return true;
}

/** A core drilled, a module inspected, a photo taken: the request is met. */
export function completeRequest(s: SimState, id: number, quality: number, log: Log): boolean {
  const r = openRequest(s, id);
  if (!r || r.kind === 'harvest' || r.kind === 'seismometer' || r.kind === 'reflector' || r.kind === 'weather') return false;
  finish(s, r, log, quality);
  return true;
}

/** The base has a weather station out (Mars dust storms are seen coming earlier). */
export const hasInstrument = (s: SimState, kind: InstrumentKind): boolean => !!s.requests?.instruments.some((i) => i.kind === kind);

/** Every quake or impact after a seismometer is on the ground is worth data. */
export function seismicRecord(s: SimState, log: Log): void {
  if (!hasInstrument(s, 'seismometer')) return;
  s.science += SEISMIC_EVENT_SCIENCE;
  log(s, 'log.req.seismic', 'good', { sci: SEISMIC_EVENT_SCIENCE });
}
