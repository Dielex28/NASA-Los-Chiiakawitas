import type { Rng } from '../core/rng';
import { CROPS } from './catalog';
import { treatInjury } from './faults';
import { WORLDS } from './worlds';
import type { ModuleState, ModuleType, SimState } from './types';

/**
 * The day's chores, as on any crewed outpost: on the ISS the crew vacuums filters, checks
 * hatch seals, sends data down and tends the plants. Each sol brings a short list; the
 * commander can do them by hand (a quick minigame) for a bonus, or leave them to the crew,
 * who get to them when they fall due — with hours taken from maintenance.
 */
export type TaskKind = 'filter' | 'seals' | 'download' | 'analyze' | 'plant' | 'harvest' | 'balance' | 'drillbit' | 'valves' | 'clean' | 'firstaid';

export interface Task {
  id: number;
  kind: TaskKind;
  moduleId: number;
  /** First aid: who needs it. */
  crewId?: number;
  createdH: number;
  dueH: number;
  done?: 'player' | 'crew' | 'expired';
  doneH?: number;
}

export interface TaskState {
  list: Task[];
  nextId: number;
  /** When the next day's list is drawn up, mission hours. */
  nextRoundH: number;
  /** Crew-hours owed to chores the crew did for the commander (taken from maintenance). */
  debtH: number;
}

/** Done outside, on EVA (the rest inside a module). */
export const TASK_OUTSIDE: Record<TaskKind, boolean> = {
  filter: false,
  seals: false,
  download: false,
  analyze: false,
  plant: false,
  harvest: false,
  balance: true,
  drillbit: true,
  valves: true,
  clean: true,
  firstaid: false,
};

/** Crew-hours a chore costs when the crew does it instead (0: it lapses). */
const CREW_H: Record<TaskKind, number> = {
  filter: 1,
  seals: 1.5,
  download: 0.5,
  analyze: 0,
  plant: 1,
  harvest: 1,
  balance: 1,
  drillbit: 1.5,
  valves: 1,
  clean: 0,
  firstaid: 0,
};

/** Bonuses last this many sols. */
const BUFF_SOLS = 2.5;

export const initTasks = (): TaskState => ({ list: [], nextId: 1, nextRoundH: 5, debtH: 0 });

const built = (m: ModuleState): boolean => m.built >= 1;
const ofType = (s: SimState, ...types: ModuleType[]): ModuleState[] => s.modules.filter((m) => built(m) && types.includes(m.type));

/** A timed bonus from a chore done by hand is in force. */
export function buffActive(s: SimState, key: string): boolean {
  return (s.flags[`buff.${key}`] ?? 0) > s.timeH;
}

function setBuff(s: SimState, key: string): void {
  s.flags[`buff.${key}`] = s.timeH + BUFF_SOLS * WORLDS[s.world].solH;
}

/** Open chores, oldest first. */
export function openTasks(s: SimState): Task[] {
  return (s.tasks?.list ?? []).filter((t) => !t.done);
}

/** Today's chores done and in total (for the HUD's progress bar). */
export function taskProgress(s: SimState): { done: number; total: number } {
  const today = (s.tasks?.list ?? []).filter((t) => t.createdH > s.timeH - WORLDS[s.world].solH * 1.2 || !t.done);
  return { done: today.filter((t) => t.done === 'player' || t.done === 'crew').length, total: today.length };
}

function add(s: SimState, kind: TaskKind, moduleId: number, dueSols: number, crewId?: number): Task | null {
  const ts = (s.tasks ??= initTasks());
  if (ts.list.some((t) => !t.done && t.kind === kind && t.moduleId === moduleId && t.crewId === crewId)) return null;
  const t: Task = { id: ts.nextId++, kind, moduleId, crewId, createdH: s.timeH, dueH: s.timeH + dueSols * WORLDS[s.world].solH };
  ts.list.push(t);
  return t;
}

/** The pressurised room where indoor chores happen: a habitat if there is one, else the lander. */
function living(s: SimState): ModuleState {
  return ofType(s, 'hab')[0] ?? s.modules[0];
}

/** Draw up the day's list from what the base has. */
function newRound(s: SimState, rng: Rng): void {
  const cands: Array<[TaskKind, number]> = [];
  cands.push(['filter', living(s).id]);
  for (const m of ofType(s, 'hab', 'lab', 'greenhouse', 'shelter')) cands.push(['seals', m.id]);
  if (s.flows.comms) cands.push(['download', s.modules[0].id]);
  for (const m of ofType(s, 'lab')) if (s.samples > 0.5) cands.push(['analyze', m.id]);
  for (const m of ofType(s, 'battery')) cands.push(['balance', m.id]);
  for (const m of ofType(s, 'icerig')) cands.push(['drillbit', m.id]);
  for (const m of ofType(s, 'propellant')) cands.push(['valves', m.id]);
  for (const m of ofType(s, 'solar')) if (m.dust > 0.08) cands.push(['clean', m.id]);
  const n = [2, 3, 4][(s.cfg.level ?? 2) - 1];
  const picked = new Set<string>();
  for (let i = 0; i < n && cands.length; i++) {
    const [kind, id] = cands.splice(Math.floor(rng.next() * cands.length), 1)[0];
    // one of each kind a day
    if (picked.has(kind)) {
      i--;
      continue;
    }
    picked.add(kind);
    add(s, kind, id, 1);
  }
}

/**
 * Advance the chores: a new list each morning, harvests and plantings as the crops ask for
 * them, first aid for the injured, and the crew doing whatever falls due.
 */
export function updateTasks(s: SimState, rng: Rng, log: Log): void {
  const ts = (s.tasks ??= initTasks());
  const solH = WORLDS[s.world].solH;
  if (s.timeH >= ts.nextRoundH) {
    ts.nextRoundH += solH;
    // forget what was dealt with more than a day ago
    ts.list = ts.list.filter((t) => !t.done || (t.doneH ?? 0) > s.timeH - solH);
    newRound(s, rng);
    log(s, 'log.tasks.new', 'info', { n: openTasks(s).length });
  }
  for (const m of s.modules) {
    if (m.type !== 'greenhouse' || !built(m)) continue;
    if (m.ripe) add(s, 'harvest', m.id, 0.5);
    else if (m.fallow) add(s, 'plant', m.id, 0.5);
  }
  for (const c of s.crew) if (c.injury && !c.injury.treated) add(s, 'firstaid', living(s).id, 1, c.id);
  for (const t of ts.list) {
    if (t.done) continue;
    const m = s.modules.find((x) => x.id === t.moduleId);
    // chores whose reason has gone away simply lapse
    const moot =
      !m ||
      (t.kind === 'harvest' && !m.ripe) ||
      (t.kind === 'plant' && !m.fallow) ||
      (t.kind === 'firstaid' && !s.crew.find((c) => c.id === t.crewId)?.injury);
    if (moot) {
      t.done = 'expired';
      t.doneH = s.timeH;
      continue;
    }
    if (s.timeH < t.dueH) continue;
    crewDoes(s, t, m, log);
  }
}

type Log = (s: SimState, key: string, sev: 'info' | 'good' | 'warn' | 'bad', params?: Record<string, string | number>, ref?: number) => void;

function crewDoes(s: SimState, t: Task, m: ModuleState, log: Log): void {
  const ts = s.tasks!;
  const cost = CREW_H[t.kind];
  t.done = cost > 0 ? 'crew' : 'expired';
  t.doneH = s.timeH;
  ts.debtH += cost;
  if (cost > 0) s.stats.tasksByCrew = (s.stats.tasksByCrew ?? 0) + 1;
  if (t.kind === 'harvest') harvest(s, m, 0, log);
  else if (t.kind === 'plant') plant(s, m, 0.5);
  else if (t.kind === 'download') s.science += 1;
}

/** Hours of chores the crew still owes, taken from up to `available` maintenance hours. */
export function payTaskDebt(s: SimState, available: number): number {
  const ts = s.tasks;
  if (!ts || ts.debtH <= 0) return 0;
  const paid = Math.min(ts.debtH, available);
  ts.debtH -= paid;
  return paid;
}

/** Bring in a ripe crop: `bonus` is the extra share a careful harvest saves (0..0.15). */
export function harvest(s: SimState, m: ModuleState, bonus: number, log: Log): number {
  const crop = CROPS[m.crop];
  const rations = crop.rationsPerSol * crop.cycleSols * m.cropHealth * (1 + bonus);
  s.stores.food += rations;
  s.stats.foodGrown += rations;
  s.stats.harvests++;
  s.flags.lastHarvestH = s.timeH;
  log(s, 'log.harvest', 'good', { crop: m.crop, rations: Math.round(rations) }, m.id);
  m.ripe = false;
  m.growth = 0;
  m.cropHealth = 1;
  m.fallow = true;
  return rations;
}

/** Sow the next crop: a careful planting gets the seedlings off to a head start. */
export function plant(s: SimState, m: ModuleState, quality: number): void {
  m.fallow = false;
  m.growth = 0.03 * quality;
  m.cropHealth = 1;
}

export type TaskResult = { ok: true; science?: number; rations?: number } | { ok: false; why: 'gone' | 'nolink' };

/** The commander does a chore by hand; `quality` (0..1) comes from the minigame. */
export function completeTask(s: SimState, id: number, quality: number, log: Log): TaskResult {
  const t = s.tasks?.list.find((x) => x.id === id);
  const m = t && s.modules.find((x) => x.id === t.moduleId);
  if (!t || t.done || !m) return { ok: false, why: 'gone' };
  const q = Math.max(0, Math.min(1, quality));
  let science = 0;
  let rations = 0;
  switch (t.kind) {
    case 'filter':
      setBuff(s, 'filter');
      break;
    case 'seals':
      setBuff(s, `seals.${m.id}`);
      break;
    case 'download':
      if (!s.flows.comms) return { ok: false, why: 'nolink' };
      science = 1 + 1.5 * q;
      break;
    case 'analyze':
      s.samples = Math.max(0, s.samples - 1);
      science = 2.5 + 2 * q;
      break;
    case 'harvest':
      rations = harvest(s, m, 0.15 * q, log);
      break;
    case 'plant':
      plant(s, m, 0.5 + 0.5 * q);
      break;
    case 'balance':
      m.condition = Math.min(100, m.condition + 8 + 8 * q);
      break;
    case 'drillbit':
      setBuff(s, `drill.${m.id}`);
      break;
    case 'valves':
      setBuff(s, `valves.${m.id}`);
      break;
    case 'clean':
      m.dust = Math.max(0, m.dust * (1 - (0.7 + 0.3 * q)));
      break;
    case 'firstaid':
      if (t.crewId !== undefined) treatInjury(s, t.crewId, q, log);
      break;
  }
  s.science += science;
  t.done = 'player';
  t.doneH = s.timeH;
  s.stats.tasksByPlayer = (s.stats.tasksByPlayer ?? 0) + 1;
  log(s, 'log.tasks.done', 'good', { what: `task.${t.kind}`, type: m.type }, m.id);
  return { ok: true, science, rations };
}
