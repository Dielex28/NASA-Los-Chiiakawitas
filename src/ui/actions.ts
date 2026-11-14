import { Rng } from '../core/rng';
import { playerExtinguish } from '../sim/emergency';
import { OUTSIDE, canImprovise, findFault, partsFor, repairFault, type Fault } from '../sim/faults';
import { completeRequest, deployInstrument, openRequest, type Request } from '../sim/requests';
import { pushLog } from '../sim/sim';
import { TASK_OUTSIDE, completeTask, type Task } from '../sim/tasks';
import type { ModuleState, SimState } from '../sim/types';
import type { App } from './app';
import type { GameId } from './minigames';
import { t } from './strings';

/**
 * What the commander does by hand: pick the minigame that matches a fault, a task or a request,
 * play it over the paused mission, and hand its quality to the simulation.
 */
type Pick = { id: GameId; ctx?: string };

export function faultGame(m: ModuleState, f: Fault): Pick {
  switch (f.kind) {
    case 'breach':
      return { id: 'patch' };
    case 'cells':
      return { id: 'cells', ctx: m.type === 'battery' || m.type === 'fuelcell' ? 'battery' : 'cells' };
    case 'wiring':
      return { id: 'wires', ctx: 'wires' };
    case 'misaligned':
      return { id: 'align', ctx: m.type === 'antenna' ? 'antenna' : 'solar' };
    case 'electronics':
      return { id: 'reboot' };
    case 'crack':
      return { id: 'bolts' };
    case 'scorch':
      return { id: 'wires', ctx: 'scorch' };
    default:
      return { id: 'valves', ctx: 'leak' };
  }
}

export function taskGame(task: Task): Pick {
  switch (task.kind) {
    case 'filter':
      return { id: 'wipe', ctx: 'filter' };
    case 'seals':
      return { id: 'bolts' };
    case 'download':
      return { id: 'download' };
    case 'analyze':
      return { id: 'microscope' };
    case 'plant':
      return { id: 'plant' };
    case 'harvest':
      return { id: 'harvest' };
    case 'balance':
      return { id: 'valves', ctx: 'battery' };
    case 'drillbit':
      return { id: 'drill' };
    case 'valves':
      return { id: 'valves' };
    case 'clean':
      return { id: 'wipe', ctx: 'clean' };
    default:
      return { id: 'firstaid' };
  }
}

export function requestGame(r: Request): Pick | null {
  switch (r.kind) {
    case 'seismometer':
      return { id: 'level' };
    case 'weather':
      return { id: 'level', ctx: 'weather' };
    case 'reflector':
      return { id: 'align', ctx: 'reflector' };
    case 'core':
      return { id: 'drill', ctx: 'core' };
    case 'inspect':
      return { id: 'locate' };
    default:
      return null;
  }
}

/** Done from outside (on EVA) rather than from inside the base. */
export const faultOutside = (f: Fault): boolean => OUTSIDE[f.kind];
export const taskOutside = (task: Task): boolean => TASK_OUTSIDE[task.kind];

const toast = (app: App, key: string, sev: 'info' | 'good' | 'warn' | 'bad', params?: Record<string, string | number>): void =>
  app.game.events.emit('toast', { key, params, sev });

const lvl = (s: SimState): 1 | 2 | 3 => s.cfg.level ?? 2;

/** Repair a fault by hand. */
export async function doFault(app: App, id: number): Promise<void> {
  const s = app.game.sim;
  const hit = s && findFault(s, id);
  if (!s || !hit) return;
  const { m, f } = hit;
  if (partsFor(f) > (s.stores.spares ?? 0) && !canImprovise(f)) {
    toast(app, 'toast.noparts', 'warn');
    return;
  }
  const what = t(`fault.${f.kind}`);
  const q = await app.openMinigame({ ...faultGame(m, f), title: `${what} · ${t(`mod.${m.type}`)}`, level: lvl(s) });
  if (q === null || app.game.sim !== s) return;
  const r = repairFault(s, id, q, pushLog);
  if (r === 'fixed') toast(app, 'toast.fixed', 'good', { what });
  else if (r === 'partial') toast(app, 'toast.partial', 'warn', { what });
  else if (r === 'noparts') toast(app, 'toast.noparts', 'warn');
}

/** Do one of the day's tasks by hand. */
export async function doTask(app: App, id: number): Promise<void> {
  const s = app.game.sim;
  const task = s?.tasks?.list.find((x) => x.id === id && !x.done);
  const m = task && s?.modules.find((x) => x.id === task.moduleId);
  if (!s || !task || !m) return;
  if (task.kind === 'download' && !s.flows.comms) {
    toast(app, 'toast.nolink', 'warn');
    return;
  }
  const crew = task.crewId !== undefined ? s.crew.find((c) => c.id === task.crewId) : undefined;
  const minerals = app.game.collectedKinds();
  const what = t(`task.${task.kind}`);
  const q = await app.openMinigame({
    ...taskGame(task),
    title: crew ? `${what} · ${crew.name}` : `${what} · ${t(`mod.${m.type}`)}`,
    level: lvl(s),
    data: {
      crop: m.crop,
      world: s.world,
      mineral: minerals.length ? minerals[minerals.length - 1] : '',
      injury: crew?.injury?.kind ?? 'bruise',
      name: crew?.name ?? '',
    },
  });
  if (q === null || app.game.sim !== s) return;
  const r = completeTask(s, id, q, pushLog);
  if (r.ok) toast(app, 'toast.taskDone', 'good', { what });
  else if (r.why === 'nolink') toast(app, 'toast.nolink', 'warn');
}

/** Carry out one of Mission Control's requests on the spot. */
export async function doRequest(app: App, id: number): Promise<void> {
  const s = app.game.sim;
  const r = s && openRequest(s, id);
  const pick = r && requestGame(r);
  if (!s || !r || !pick) return;
  const what = t(`req.${r.kind}`);
  const q = await app.openMinigame({ ...pick, title: what, level: lvl(s) });
  if (q === null || app.game.sim !== s) return;
  const ok = r.kind === 'seismometer' || r.kind === 'reflector' || r.kind === 'weather' ? deployInstrument(s, id, q, pushLog) : completeRequest(s, id, q, pushLog);
  if (ok) {
    toast(app, 'toast.reqDone', 'good', { what });
    if (r.kind === 'seismometer' || r.kind === 'reflector' || r.kind === 'weather') app.game.placeInstrument(r.kind, r.x, r.z);
  }
}

/** Grab the extinguisher yourself. */
export async function doExtinguish(app: App): Promise<void> {
  const s = app.game.sim;
  const e = s?.emergency;
  const m = e && s?.modules.find((x) => x.id === e.moduleId);
  if (!s || !e || e.kind !== 'fire' || !m) return;
  const q = await app.openMinigame({ id: 'extinguish', title: t('emg.fire.title', { what: t(`mod.${m.type}`) }), level: lvl(s) });
  if (q === null || app.game.sim !== s) return;
  playerExtinguish(s, q, new Rng((s.rng ^ 0x5eed) >>> 0), pushLog);
}
