import { OUTSIDE, breachO2KgH, canImprovise, faultWorld, partsFor, repairHours, MAJOR_BREACH_MM, LINK_DEG, type Fault } from '../sim/faults';
import { openRequests, type Request } from '../sim/requests';
import { pushLog } from '../sim/sim';
import { TASK_OUTSIDE, openTasks, taskProgress, type Task } from '../sim/tasks';
import { chooseUpgrade, type UpgradeId } from '../sim/upgrades';
import { WORLDS } from '../sim/worlds';
import type { ModuleState, SimState } from '../sim/types';
import { doFault, doRequest, doTask } from './actions';
import type { App } from './app';
import { clear, h, icon } from './dom';
import { t } from './strings';

/** Rooms you can step into: an indoor job there starts with the camera inside. */
const ROOMS = new Set(['hab', 'lab', 'greenhouse', 'lander']);

const fmt = (v: number, d = 0): string => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

/** Do an indoor job: step into the room first when there is one, then play. */
function inside(app: App, moduleId: number, run: () => void): void {
  const g = app.game;
  const m = g.sim?.modules.find((x) => x.id === moduleId);
  if (m && ROOMS.has(m.type) && g.interiorId() !== moduleId) {
    g.enterInterior(moduleId);
    window.setTimeout(run, 650);
  } else run();
}

/** One line describing a fault's size in plain terms. */
export function faultSize(m: ModuleState, f: Fault): string {
  switch (f.kind) {
    case 'breach':
      return f.size >= MAJOR_BREACH_MM ? t('fault.size.major', { mm: fmt(f.size) }) : t('fault.size.breach', { mm: fmt(f.size, 1), kg: fmt(breachO2KgH(f.size), 1) });
    case 'cells':
      return m.type === 'battery' || m.type === 'fuelcell' ? t('fault.size.cap', { pct: fmt(f.size * 100) }) : t('fault.size.share', { pct: fmt(f.size * 100) });
    case 'scorch':
      return t('fault.size.share', { pct: fmt(f.size * 100) });
    case 'misaligned':
      return m.type === 'antenna' && f.size >= LINK_DEG ? t('fault.size.link', { deg: fmt(f.size) }) : t('fault.size.deg', { deg: fmt(f.size) });
    case 'leak':
      return t('fault.size.leak', { kg: fmt(f.size, 1) });
    case 'crack':
      return t('fault.size.crack');
    default:
      return t('fault.size.off');
  }
}

/** Parts line: how many a repair takes, and whether it can be improvised without them. */
function partsLine(s: SimState, f: Fault): string {
  const need = partsFor(f);
  if (need === 0) return '';
  const have = s.stores.spares ?? 0;
  if (need <= have) return t('fault.parts', { n: need });
  return `${t('fault.parts', { n: need })} · ${canImprovise(f) ? t('fault.improvise') : t('fault.needparts')}`;
}

/** The damage section of a module's inspector. */
export function faultsPanel(app: App, moduleId: number): { el: HTMLElement; update: () => void } {
  const el = h('div.faults');
  let sig = '';
  const update = (): void => {
    const s = app.game.sim;
    const m = s?.modules.find((x) => x.id === moduleId);
    if (!s || !m) return;
    const faults = m.faults ?? [];
    const next = `${faults.map((f) => `${f.id}:${f.size.toFixed(2)}:${Math.round((f.work / repairHours(f)) * 20)}`).join('|')}:${s.stores.spares ?? 0}:${app.game.mode}`;
    if (next === sig) return;
    sig = next;
    clear(el);
    if (!faults.length) return;
    el.append(h('div.label', icon('warn', 13), ' ', t('fault.title'), h('span.spares', t('spares.have', { n: s.stores.spares ?? 0 }))));
    for (const f of faults) {
      const outside = OUTSIDE[f.kind];
      const crew = f.work > 0 ? t('fault.crew', { pct: fmt((100 * f.work) / repairHours(f)) }) : '';
      const btn = outside
        ? h('button.btn.small.ghost', { onclick: () => {
              const [x, , z] = faultWorld(m, f);
              app.game.guideTo(x, z);
            } }, icon('eva', 13), t('jobs.go'))
        : h('button.btn.small', { onclick: () => inside(app, m.id, () => void doFault(app, f.id)), disabled: app.game.mode === 'eva', title: app.game.mode === 'eva' ? t('jobs.goInside') : '' }, icon('gear', 13), t('fault.repair'));
      el.append(
        h(
          'div.fault',
          h('div.grow', h('b', t(`fault.${f.kind}`)), h('span', faultSize(m, f)), h('small', [partsLine(s, f), crew, outside ? t('fault.outside') : ''].filter(Boolean).join(' · '))),
          btn,
        ),
      );
    }
    el.append(h('div.note', t('fault.help')));
  };
  return { el, update };
}

function taskTitle(s: SimState, task: Task): string {
  const m = s.modules.find((x) => x.id === task.moduleId);
  const who = task.crewId !== undefined ? s.crew.find((c) => c.id === task.crewId)?.name : undefined;
  return `${t(`task.${task.kind}`)}${who ? ` · ${who}` : m ? ` · ${t(`mod.${m.type}`)}` : ''}`;
}

function taskDesc(s: SimState, task: Task): string {
  const who = task.crewId !== undefined ? s.crew.find((c) => c.id === task.crewId)?.name : undefined;
  return t(`task.${task.kind}.d`, { name: who ?? '' });
}

/** A button that does a task: inside (from the console), or go outside to it. */
function taskButton(app: App, task: Task): HTMLElement {
  const s = app.game.sim!;
  const m = s.modules.find((x) => x.id === task.moduleId);
  if (TASK_OUTSIDE[task.kind])
    return h('button.btn.small.ghost', { onclick: () => m && app.game.guideTo(m.x, m.z), title: t('tasks.eva') }, icon('eva', 13), t('jobs.go'));
  const eva = app.game.mode === 'eva';
  return h('button.btn.small', { onclick: () => inside(app, task.moduleId, () => void doTask(app, task.id)), disabled: eva, title: eva ? t('jobs.goInside') : '' }, t('tasks.do'));
}

function requestLine(app: App, r: Request): HTMLElement {
  const s = app.game.sim!;
  const solH = WORLDS[s.world].solH;
  const left = Math.max(0, (r.dueH - s.timeH) / solH);
  const m = r.moduleId !== undefined ? s.modules.find((x) => x.id === r.moduleId) : undefined;
  const desc =
    r.kind === 'photo' ? t(`req.photo.d.${r.photo ?? 'base'}`) : r.kind === 'inspect' ? t('req.inspect.d', { type: m ? t(`mod.${m.type}`) : '' }) : t(`req.${r.kind}.d`);
  const meta = `${t('req.due', { n: fmt(left, 1), unit: t(`unit.days.${s.world}`) })} · ${t('req.reward', { sci: r.reward })}`;
  const out = r.kind !== 'photo' && r.kind !== 'harvest';
  const x = m ? m.x : r.x;
  const z = m ? m.z : r.z;
  return h(
    'div.job.req',
    icon('antenna', 15),
    h('div.grow', h('b', t(`req.${r.kind}`)), h('span', desc), h('small', meta)),
    out ? h('button.btn.small.ghost', { onclick: () => app.game.guideTo(x, z) }, icon('eva', 13), t('jobs.go')) : null,
  );
}

/** Today's tasks and Control's requests, for the goals tab. */
export function jobsPanel(app: App): { el: HTMLElement; update: () => void } {
  const el = h('div.jobs');
  let sig = '';
  const update = (): void => {
    const s = app.game.sim;
    if (!s) return;
    const tasks = openTasks(s);
    const reqs = openRequests(s);
    const prog = taskProgress(s);
    const next = JSON.stringify([tasks.map((x) => x.id), reqs.map((r) => [r.id, Math.round(((r.dueH - s.timeH) / WORLDS[s.world].solH) * 10)]), prog, app.game.mode, s.upgrades?.length ?? 0]);
    if (next === sig) return;
    sig = next;
    clear(el);
    if (prog.total > 0 || tasks.length) {
      const bar = h('div.bar.ok', h('i', { style: { width: `${prog.total ? (100 * prog.done) / prog.total : 0}%` } }));
      el.append(h('div.section', t('tasks.title'), h('span.count', t('tasks.progress', { done: prog.done, total: prog.total }))), bar);
      if (!tasks.length) el.append(h('div.muted', t('tasks.none')));
      for (const task of tasks) {
        const left = Math.max(0, task.dueH - s.timeH);
        el.append(
          h(
            `div.job${TASK_OUTSIDE[task.kind] ? '.out' : ''}`,
            icon(TASK_OUTSIDE[task.kind] ? 'eva' : 'gear', 15),
            h('div.grow', h('b', taskTitle(s, task)), h('span', taskDesc(s, task)), h('small', t('tasks.left', { h: fmt(left) }))),
            taskButton(app, task),
          ),
        );
      }
      el.append(h('div.note', t('tasks.help')));
    }
    if (reqs.length) {
      el.append(h('div.section', t('req.title')));
      for (const r of reqs) el.append(requestLine(app, r));
    }
    if (s.upgrades?.length) el.append(h('div.section', t('upg.have')), h('div.chips', ...s.upgrades.map((u) => h('span.chip.on', { title: t(`upg.${u}.d`) }, t(`upg.${u}`)))));
  };
  return { el, update };
}

/** Indoor jobs in the room the commander is standing in (for the interior bar). */
export function insideJobs(app: App, moduleId: number): HTMLElement | null {
  const s = app.game.sim;
  const m = s?.modules.find((x) => x.id === moduleId);
  if (!s || !m) return null;
  const btns: HTMLElement[] = [];
  for (const f of m.faults ?? []) if (!OUTSIDE[f.kind]) btns.push(h('button.btn.small', { onclick: () => void doFault(app, f.id) }, icon('gear', 13), `${t('fault.repair')}: ${t(`fault.${f.kind}`)}`));
  for (const task of openTasks(s)) if (task.moduleId === moduleId && !TASK_OUTSIDE[task.kind]) btns.push(h('button.btn.small', { onclick: () => void doTask(app, task.id) }, t('tasks.do'), ': ', taskTitle(s, task)));
  if (!btns.length) return null;
  return h('div.insidejobs', h('span.muted', t('inside.jobs')), ...btns);
}

/** The choice of technology at a science milestone. */
export function upgradeScreen(app: App): HTMLElement {
  const s = app.game.sim!;
  const offer = (s.upgradeOffer ?? []) as UpgradeId[];
  const pick = (id: UpgradeId): void => {
    if (chooseUpgrade(s, id, pushLog)) app.game.audio.ui('good');
    app.closeOverlay();
  };
  return h(
    'div.screen.modal',
    h(
      'div.sheet.panel.mid',
      h('div.sheet-head', h('div.grow', h('h2', t('upg.title')), h('p', t('upg.lead'))), h('button.iconbtn', { onclick: () => app.closeOverlay(), title: t('upg.later') }, icon('close', 20))),
      h(
        'div.sheet-body',
        h(
          'div.upgrades',
          ...offer.map((id) => h('div.upg.panel', h('h3', t(`upg.${id}`)), h('p', t(`upg.${id}.d`)), h('button.btn.primary', { onclick: () => pick(id) }, icon('check', 15), t('upg.pick')))),
        ),
      ),
      h('div.sheet-foot', h('button.btn.ghost', { onclick: () => app.closeOverlay() }, t('upg.later'))),
    ),
  );
}

/** Size of the module's interior-visible damage, as a short label (for the crew tab and others). */
export const injuryLine = (kind: string, healH: number): string => t('crew.injured', { what: t(`injury.${kind}`), h: fmt(healH) });

