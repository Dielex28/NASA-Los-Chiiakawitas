import { lessons } from '../sim/advisor';
import { MODULES, MODULE_ORDER, SUPPLIES, cargoMass, isSupply } from '../sim/catalog';
import { QUALITY_LEVELS } from '../render/renderer';
import { CUSTOM_LIMITS, DEFAULT_CUSTOM, clampSpec, encodeCustom, normalizeCode, type CustomSpec } from '../sim/custom';
import { MISSIONS, dailyCode, missionById, scoreMission, type MissionDef } from '../sim/missions';
import { STATIONS, assignStations, type ShiftGoal, type TeamState } from '../sim/team';
import { CHAPTERS, isChapter, medals, nextChapter, recordChapter, unlockedChapters, type Medal } from './campaign';
import { classCsv, classroom, entryFor, missionKey, sendResult, watchClass, type ClassRow } from './classroom';
import { saveFile } from './save';
import { manifestMass, planAutonomy } from '../sim/sim';
import { WORLDS } from '../sim/worlds';
import type { CargoItem, ModuleType, SimState, SupplyType } from '../sim/types';
import type { App } from './app';
import { CODEX, GLOSSARY } from './codexData';
import { pickQuestions, tx } from './quiz';
import { ACHIEVEMENTS, check as checkAchievements, dailyBest, ensureMissionStrings, recordDaily, unlocked } from './achievements';
import { downloadReport, downloadTelemetry, teacherReport, type QuizAnswer } from './report';
import { clear, fmt, h, icon } from './dom';
import { getLang, t, type Lang } from './strings';

export const MOD_ICON: Record<ModuleType, string> = {
  lander: 'rocket',
  hab: 'hab',
  shelter: 'shield',
  eclss: 'water',
  tank: 'cargo',
  solar: 'sun',
  battery: 'battery',
  fuelcell: 'bolt',
  reactor: 'atom',
  greenhouse: 'leaf',
  icerig: 'ice',
  moxie: 'o2',
  propellant: 'flame',
  rassor: 'drill',
  lab: 'science',
  antenna: 'antenna',
  pylon: 'power',
};
const SUPPLY_ICON: Record<SupplyType, string> = { food: 'food', water: 'water', o2: 'o2' };

export const cargoName = (item: CargoItem): string => (isSupply(item) ? t(`supply.${item}`) : t(`mod.${item}`));
export const cargoIcon = (item: CargoItem): string => (isSupply(item) ? SUPPLY_ICON[item] : MOD_ICON[item]);

export function unitDays(world: 'moon' | 'mars'): string {
  return t(`unit.days.${world}`);
}

function sheet(cls: string, title: string, sub: string | null, onClose: (() => void) | null, body: HTMLElement, foot?: HTMLElement): HTMLElement {
  return h(
    'div.screen.modal',
    h(
      `div.sheet.panel${cls}`,
      h(
        'div.sheet-head',
        h('div.grow', h('h2', title), sub ? h('p', sub) : null),
        onClose ? h('button.iconbtn', { onclick: onClose, title: t('menu.close') }, icon('close', 20)) : null,
      ),
      body,
      foot ?? null,
    ),
  );
}

/* ------------------------------------------------------------- main menu */

/** The Sun on the horizon: the game's mark. */
export function sunMark(size = 44): HTMLElement {
  const el = document.createElement('span');
  el.className = 'ico';
  el.innerHTML = `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" aria-hidden="true"><circle cx="24" cy="20" r="9" fill="#f2a93b"/><path d="M4 34h40" stroke="#e6eaee" stroke-width="2"/><path d="M10 40h28" stroke="#5e6873" stroke-width="2"/></svg>`;
  return el;
}

/** One numbered row of a menu. */
function menuRow(n: number, label: string, onclick: () => void, opts: { hint?: string; primary?: boolean; quiet?: boolean } = {}): HTMLElement {
  const cls = opts.primary ? '.primary' : opts.quiet ? '.quiet' : '';
  return h(`button.mrow${cls}`, { onclick }, h('span.idx', String(n).padStart(2, '0')), h('span.lbl', label), opts.hint ? h('small', opts.hint) : null);
}

export function menuScreen(app: App): HTMLElement {
  const save = app.game.saveInfo();
  const hasSave = app.game.hasSave();
  const lang = getLang();
  const langBtn = (l: Lang, label: string): HTMLElement =>
    h('button', { class: l === lang ? 'on' : '', 'aria-pressed': String(l === lang), onclick: () => app.setLanguage(l) }, label);
  let saveLabel = '';
  if (save && hasSave) {
    ensureMissionStrings(save.missionId);
    const m = missionById(save.missionId);
    const day = Math.floor(save.timeH / WORLDS[save.world].solH) + (save.world === 'moon' ? 1 : 0);
    saveLabel = `${t(`mission.${m.id}.name`)} · ${t(`unit.day.${save.world}`).toLowerCase()} ${day}`;
  }
  const rows: HTMLElement[] = [];
  let n = 1;
  if (hasSave) rows.push(menuRow(n++, t('menu.continue'), () => app.continueGame(), { hint: saveLabel, primary: true }));
  rows.push(menuRow(n++, t('menu.campaign'), () => app.openCampaign(), { primary: !hasSave, hint: t('camp.progress', { n: Object.values(medals()).filter((x) => (x ?? 0) > 0).length, total: CHAPTERS.length }) }));
  rows.push(menuRow(n++, t('menu.new'), () => app.openMissions()));
  rows.push(menuRow(n++, t('menu.codex'), () => app.openCodex()));
  rows.push(menuRow(n++, t('menu.achievements'), () => app.openAchievements()));
  rows.push(menuRow(n++, t('menu.help'), () => app.openHelp()));
  rows.push(menuRow(n++, t('menu.settings'), () => app.openSettings()));
  if (app.classOpen) rows.push(menuRow(n++, t('class.title'), () => app.openClass(), { hint: t('class.hint') }));
  rows.push(menuRow(n++, t('menu.demo'), () => app.startDemo(), { quiet: true, hint: t('menu.demo.hint') }));
  if (app.canQuit) rows.push(menuRow(n++, t('menu.exit'), () => app.exitApp(), { quiet: true }));

  const world = app.game.world?.id ?? 'moon';
  const fact = (k: string): HTMLElement => h('div', h('dt', t(`menu.fact.${k}`)), h('dd', t(`menu.fact.${world}.${k}`)));
  return h(
    'div.screen.menu',
    h(
      'div.menu-rail',
      h('div.logo', sunMark(), h('h1', 'HELIOS', h('br'), 'OUTPOST'), h('div.sub', t('app.subtitle')), h('div.tag', t('app.tagline'))),
      h('nav.menu-list', { 'aria-label': t('hud.menu') }, ...rows),
      h('div.menu-foot', h('div.lang', { role: 'group', 'aria-label': t('set.lang') }, langBtn('es', 'ES'), langBtn('en', 'EN')), h('span', t('app.footer'))),
    ),
    h('div.menu-stage', h('dl.menu-facts', fact('site'), fact('sun'), fact('light'), fact('gravity'))),
  );
}

/* --------------------------------------------------------------- loading */

export function loadingScreen(): { el: HTMLElement; set: (fraction: number, stage: string) => void } {
  const fill = h('i');
  const stage = h('div.stage', t('load.terrain'));
  const entry = CODEX[Math.floor(Math.random() * (CODEX.length - 1))];
  const el = h(
    'div.screen.loading',
    h('div.logo', sunMark(40), h('h1', 'HELIOS OUTPOST')),
    h('div.bar', fill),
    stage,
    h('div.fact', t(`codex.${entry.id}.g`)),
  );
  return {
    el,
    set: (fraction, st) => {
      fill.style.width = `${Math.round(fraction * 100)}%`;
      stage.textContent = t(`load.${st}`);
    },
  };
}

/* -------------------------------------------------------- mission select */

export function missionsScreen(app: App): HTMLElement {
  const card = (m: MissionDef): HTMLElement => {
    const dots = h('span.dots');
    for (let i = 1; i <= 3; i++) dots.append(h('i', { class: i <= m.difficulty ? 'on' : '' }));
    return h(
      `div.mcard.${m.world}`,
      { onclick: () => app.openPlanning(m.id) },
      h('span.site', t(`mission.${m.id}.site`)),
      h('h3', t(`mission.${m.id}.name`)),
      m.tutorial ? h('span.badge.train', t('tut.title')) : null,
      m.realSite ? h('span.badge.real', t('mission.realData')) : null,
      m.historic ? h('span.badge.hist', t('mission.historic')) : null,
      h('p', t(`mission.${m.id}.brief`)),
      h(
        'div.meta',
        m.endless ? null : h('span', t('mission.duration'), ' ', h('b', `${m.durationSols} ${unitDays(m.world)}`)),
        h('span', t('mission.crew'), ' ', h('b', String(m.crew))),
        h('span', t('mission.budget'), ' ', h('b', `${fmt(m.budgetKg / 1000, 1)} t`)),
        h('span', t('mission.difficulty'), ' ', dots),
      ),
    );
  };
  // the daily challenge: same code, same mission, for everyone
  const today = dailyCode();
  const codeInput = h('input.code', { type: 'text', inputmode: 'numeric', maxlength: '8', value: today, 'aria-label': t('daily.code') }) as HTMLInputElement;
  const best = dailyBest()[today];
  ensureMissionStrings(`daily-${today}`);
  const daily = h(
    'div.daily',
    h('div.grow', h('span.site', t('daily.title')), h('h3', t(`mission.daily-${today}.name`)), h('p', t(`mission.daily-${today}.brief`)), best ? h('div.best', t('daily.best', { s: best })) : null),
    h(
      'div.dailyplay',
      h('label', t('daily.code'), codeInput),
      h(
        'button.btn.primary',
        {
          onclick: () => {
            const code = /^\d{8}$/.test(codeInput.value.trim()) ? codeInput.value.trim() : today;
            app.openPlanning(`daily-${code}`);
          },
        },
        icon('rocket'),
        t('daily.play'),
      ),
    ),
  );
  // a mission a teacher designed: the code is the whole mission
  const teacherInput = h('input.code.wide', { type: 'text', maxlength: '20', placeholder: 'HXXXX-XXXXX-XXXXX', spellcheck: 'false', autocomplete: 'off', 'aria-label': t('edit.codeIn') }) as HTMLInputElement;
  const teacherMsg = h('span.msg');
  const openCode = (): void => {
    const code = normalizeCode(teacherInput.value);
    if (!code) {
      teacherMsg.textContent = t('edit.badCode');
      teacherInput.focus();
      return;
    }
    app.openPlanning(`custom-${code}`);
  };
  teacherInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') openCode();
  });
  const teacher = h(
    'div.teacherbar',
    h('label', t('edit.codeIn'), h('div.row', teacherInput, h('button.btn', { onclick: openCode }, t('edit.open')))),
    teacherMsg,
    h('div.grow'),
    h('button.btn', { onclick: () => app.openEditor() }, icon('science'), t('edit.title')),
  );
  const body = h('div.sheet-body', daily, teacher, h('div.cards', ...MISSIONS.map(card)));
  return sheet('', t('mission.select'), null, () => app.openMenu(), body);
}

/* ---------------------------------------------------------- mission editor */

/** The teacher's mission editor: every choice is folded into a code the class types in. */
export function editorScreen(app: App, spec: CustomSpec): HTMLElement {
  const sp = clampSpec(spec);
  const moon = sp.world === 'moon';
  const code = encodeCustom(sp);
  const id = `custom-${code}`;
  ensureMissionStrings(id);
  const set = (patch: Partial<CustomSpec>): void => app.openEditor({ ...sp, ...patch });
  const slider = (key: keyof CustomSpec, label: string, fmtV: (v: number) => string, min?: number): HTMLElement => {
    const lim = CUSTOM_LIMITS[key];
    const out = h('b', fmtV(Number(sp[key])));
    const input = h('input', {
      type: 'range',
      min: String(min ?? lim.min),
      max: String(lim.max),
      step: String(lim.step),
      value: String(sp[key]),
      'aria-label': label,
      oninput: (e: Event) => {
        out.textContent = fmtV(Number((e.target as HTMLInputElement).value));
      },
      onchange: (e: Event) => set({ [key]: Number((e.target as HTMLInputElement).value) } as Partial<CustomSpec>),
    });
    return h('div.edrow', h('span', label), input, out);
  };
  const seg = <T extends string | number>(label: string, options: Array<[T, string]>, current: T, on: (v: T) => void): HTMLElement =>
    h(
      'div.edrow',
      h('span', label),
      h('div.seg', ...options.map(([v, l]) => h('button', { class: v === current ? 'on' : '', 'aria-pressed': String(v === current), onclick: () => on(v) }, l))),
      h('b'),
    );
  const days = unitDays(sp.world);
  const kg = (v: number): string => `${fmt(v)} kg`;
  const count = (v: number): string => (v === 0 ? t('edit.none') : String(v));
  const levels = (k: string): Array<[1 | 2 | 3, string]> => [1, 2, 3].map((n) => [n as 1 | 2 | 3, t(`edit.${k}.${n}`)]);
  const controls = h(
    'div.edgrid',
    seg<'moon' | 'mars'>(t('edit.world'), [['moon', t('world.moon')], ['mars', t('world.mars')]], sp.world, (w) => w !== sp.world && app.openEditor({ ...DEFAULT_CUSTOM[w], variant: sp.variant })),
    slider('days', t('mission.duration'), (v) => `${v} ${days}`),
    slider('crew', t('mission.crew'), (v) => String(v)),
    slider('budgetKg', t('mission.budget'), kg),
    slider('scienceGoal', t('edit.science'), (v) => String(v)),
    slider('doseLimitMsv', t('edit.dose'), (v) => `${v} mSv`),
    h('h4.edsec', t('edit.events')),
    slider('spe', t('edit.spe'), count),
    sp.spe ? seg(t('edit.intensity'), levels('spe'), sp.speClass, (v) => set({ speClass: v })) : null,
    moon ? null : slider('storms', t('edit.storms'), count),
    !moon && sp.storms ? seg(t('edit.intensity'), levels('storm'), sp.stormLevel, (v) => set({ stormLevel: v })) : null,
    slider('emergencies', t('edit.emergencies'), count),
    moon ? null : slider('delayMin', t('edit.delay'), (v) => `${v} min`, 3),
    moon ? null : seg<number>(t('edit.conj'), [[0, t('set.off')], [1, t('set.on')]], sp.conjunction ?? 0, (v) => set({ conjunction: v })),
    h('h4.edsec', t('edit.extras')),
    slider('fuelKg', t('edit.fuel'), (v) => (v ? kg(v) : t('edit.none'))),
    slider('resupply', t('edit.resupply'), count),
    seg<number>(
      t('edit.real'),
      (moon ? [0, 1, 2, 3, 4] : [0, 1]).map((v) => [v, t(`edit.terrain.${moon ? 'moon' : 'mars'}.${v}`)] as [number, string]),
      sp.terrain,
      (v) => set({ terrain: v }),
    ),
    h(
      'div.edrow',
      h('span', t('edit.variant')),
      h('div.row', h('code', String(sp.variant)), h('button.btn.small', { onclick: () => set({ variant: Math.floor(Math.random() * 4096) }) }, t('edit.shuffle'))),
      h('b'),
    ),
  );
  const copied = h('span.msg');
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      copied.textContent = t('edit.copied');
    } catch {
      // no clipboard here (some embedded pages): select the code so it can be copied by hand
      const range = document.createRange();
      range.selectNodeContents(codeEl);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      copied.textContent = t('edit.copyHand');
    }
  };
  const codeEl = h('div.bigcode', code);
  const m = missionById(id);
  const side = h(
    'div.edside',
    h('span.site', t('edit.code')),
    codeEl,
    h('div.row', h('button.btn', { onclick: () => void copy() }, t('edit.copy')), copied),
    h('p.brief', t(`mission.${id}.brief`)),
    h('p.note', t('edit.howto')),
    h('div.meta', h('span', t('mission.difficulty'), ' ', h('b', '●'.repeat(m.difficulty) + '○'.repeat(3 - m.difficulty)))),
    h('button.btn.primary', { onclick: () => app.openPlanning(id) }, icon('rocket'), t('edit.play')),
  );
  return sheet('.wide', t('edit.title'), t('edit.sub'), () => app.openMissions(), h('div.sheet-body.editor', controls, side));
}

/* --------------------------------------------------------- class results */

/** The class's results (claude.ai only): the teacher sees everyone's, a student their own. */
export function classScreen(app: App): HTMLElement {
  const es = getLang() === 'es';
  const status = h('p.note', t('class.loading'));
  const pick = h('select.classpick', { 'aria-label': t('class.mission') }) as HTMLSelectElement;
  const table = h('div.classtable');
  const csvBtn = h('button.btn.small', {}, icon('download'), t('class.csv')) as HTMLButtonElement;
  const help = h('p.note', '');
  const body = h('div.sheet-body.classres', help, h('div.row', h('label', t('class.mission'), pick), h('span.grow'), csvBtn), status, table);
  let rows: ClassRow[] = [];
  let named: Array<ClassRow & { name: string }> = [];
  let stop: (() => void) | null = null;
  const missionName = (id: string): string => {
    ensureMissionStrings(id);
    return t(`mission.${id}.name`);
  };
  const render = async (): Promise<void> => {
    const c = await classroom();
    if (!c) return;
    const keys = [...new Set(rows.map((r) => missionKey(r.mission)))];
    // newest mission first in the picker
    keys.sort((a, b) => {
      const la = Math.max(...rows.filter((r) => missionKey(r.mission) === a).map((r) => Date.parse(r.at)));
      const lb = Math.max(...rows.filter((r) => missionKey(r.mission) === b).map((r) => Date.parse(r.at)));
      return lb - la;
    });
    const chosen = keys.includes(pick.value) ? pick.value : keys[0] ?? '';
    clear(pick);
    for (const k of keys) {
      const r = rows.find((x) => missionKey(x.mission) === k)!;
      pick.append(h('option', { value: k, selected: k === chosen ? 'selected' : null }, `${missionName(r.mission)} · ${r.mission.startsWith('custom-') ? r.mission.slice(7) : r.mission.replace('daily-', '')}`));
    }
    pick.value = chosen;
    const shown = rows.filter((r) => missionKey(r.mission) === chosen).sort((a, b) => b.score - a.score);
    const ids = [...new Set(rows.map((r) => r.student))];
    const ps = await c.user.profiles(ids);
    const order = new Map(ids.map((id, i) => [id, i + 1]));
    const nameOf = (id: string): string => ps[id]?.name || `${t('class.student')} ${order.get(id)}`;
    named = rows.map((r) => ({ ...r, name: nameOf(r.student) }));
    clear(table);
    if (!shown.length) {
      table.append(h('p.note', t(c.teacher ? 'class.empty.teacher' : 'class.empty.student')));
      return;
    }
    const fmtD = (iso: string): string => new Date(iso).toLocaleString(es ? 'es-ES' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    table.append(
      h(
        'table',
        h('thead', h('tr', ...['class.col.student', 'class.col.result', 'class.col.score', 'class.col.dose', 'class.col.science', 'class.col.when'].map((k) => h('th', t(k))))),
        h(
          'tbody',
          ...shown.map((r) =>
            h(
              'tr',
              h('td', h('b', nameOf(r.student))),
              h(`td.${r.result === 'success' ? 'ok' : 'bad'}`, r.result === 'success' ? t('end.success') : t('end.abort')),
              h('td.n', String(r.score)),
              h('td.n', `${fmt(r.dose, 1)} mSv`),
              h('td.n', `${r.science} / ${r.scienceGoal}`),
              h('td.n', fmtD(r.at)),
            ),
          ),
        ),
      ),
    );
  };
  pick.onchange = () => void render();
  csvBtn.onclick = () => void saveFile(es ? 'helios-resultados-clase.csv' : 'helios-class-results.csv', classCsv(named, es), 'text/csv');
  void classroom().then((c) => {
    if (!c) {
      status.textContent = t('class.none');
      return;
    }
    help.textContent = t(c.teacher ? 'class.help.teacher' : 'class.help.student');
    csvBtn.classList.toggle('hidden', !c.teacher);
    // the store may not answer at once (or at all, offline): say so after 10 s
    const timer = window.setTimeout(() => (status.textContent = t('class.slow')), 10000);
    stop = watchClass(
      c,
      (next, confirmed) => {
        rows = next;
        if (confirmed) {
          window.clearTimeout(timer);
          status.textContent = '';
        }
        void render();
      },
      () => {
        window.clearTimeout(timer);
        status.textContent = t('class.error');
      },
    );
  });
  return sheet('.mid', t('class.title'), null, () => {
    stop?.();
    app.openMenu();
  }, body);
}

/* -------------------------------------------------------------- campaign */

/** Three medal slots: bronze, silver, gold. */
export function medalRow(m: Medal): HTMLElement {
  // one, two or three stars, all in the colour of the medal won
  return h(`span.medals.m${m}`, { title: m ? t(`camp.medal.${m}`) : t('camp.medal.0') }, ...[1, 2, 3].map((k) => h(`span.medal${m >= k ? '.on' : ''}`, icon('star', 14))));
}

/** The Helios programme: chapters in order, each opened by the one before. */
export function campaignScreen(app: App): HTMLElement {
  const got = medals();
  const open = unlockedChapters(got);
  const rows = CHAPTERS.map((id, i) => {
    const m = missionById(id);
    const locked = !open.has(id);
    const medal = (got[id] ?? 0) as Medal;
    return h(
      `div.chapter${locked ? '.locked' : ''}${medal ? '.done' : ''}.${m.world}`,
      h('span.num', String(i + 1).padStart(2, '0')),
      h(
        'div.grow',
        h('span.site', t(`mission.${id}.site`)),
        h('h3', t(`mission.${id}.name`)),
        h('p.learn', h('b', t('camp.learn')), ' ', t(`camp.${id}`)),
      ),
      h(
        'div.side',
        medalRow(medal),
        locked
          ? h('span.lockmsg', icon('lock', 15), t('camp.locked'))
          : h(`button.btn${medal ? '' : '.primary'}`, { onclick: () => app.openPlanning(id) }, icon('rocket'), medal ? t('camp.replay') : t('camp.play')),
      ),
    );
  });
  const body = h('div.sheet-body.campaign', h('p.lead', t('camp.lead')), ...rows, h('p.note', t('camp.note')));
  return sheet('.mid', t('camp.title'), t('camp.progress', { n: Object.values(got).filter((x) => (x ?? 0) > 0).length, total: CHAPTERS.length }), () => app.openMenu(), body);
}

/* ------------------------------------------------------------- team mode */

export const stationName = (st: string): string => t(`team.st.${st}`);

/** Set up team mode on the planning screen: who plays, and how long each shift lasts. */
function teamPanel(app: App, world: 'moon' | 'mars'): HTMLElement {
  const box = h('div.plan-box.teambox');
  const tm = app.team;
  const dayH = world === 'moon' ? 24 : 24.66;
  const lengths: Array<[number, string]> = [
    [12, t('team.len.half')],
    [dayH, t(`team.len.day.${world}`)],
    [dayH * 3, t(`team.len.three.${world}`)],
  ];
  if (!lengths.some(([v]) => Math.abs(v - tm.shiftH) < 0.5)) tm.shiftH = dayH;
  const render = (): void => {
    clear(box);
    box.append(
      h(
        'div.kv',
        h('h4', t('team.title')),
        h('span'),
        h('button.btn.small', { class: tm.on ? 'on' : '', 'aria-pressed': String(tm.on), onclick: () => ((tm.on = !tm.on), render()) }, tm.on ? t('set.on') : t('set.off')),
      ),
    );
    if (!tm.on) {
      box.append(h('div.note', t('team.pitch')));
      return;
    }
    const stations = assignStations(Math.max(1, tm.names.length));
    tm.names.forEach((name, i) => {
      const input = h('input.name', { type: 'text', maxlength: '16', value: name, placeholder: t('team.name', { n: i + 1 }), 'aria-label': t('team.name', { n: i + 1 }) }) as HTMLInputElement;
      input.addEventListener('input', () => (tm.names[i] = input.value));
      box.append(
        h(
          'div.member',
          input,
          h('span.sts', stations[i].map(stationName).join(' · ')),
          tm.names.length > 2 ? h('button.iconbtn.small', { title: t('team.remove'), onclick: () => (tm.names.splice(i, 1), render()) }, icon('close', 14)) : null,
        ),
      );
    });
    if (tm.names.length < STATIONS.length) box.append(h('button.btn.small.ghost', { onclick: () => (tm.names.push(''), render()) }, t('team.add')));
    box.append(
      h('div.note', t('team.shift')),
      h('div.seg', ...lengths.map(([v, l]) => h('button', { class: Math.abs(v - tm.shiftH) < 0.5 ? 'on' : '', onclick: () => ((tm.shiftH = v), render()) }, l))),
      h('div.note', t('team.how')),
    );
  };
  render();
  return box;
}

const goalLine = (team: TeamState, g: ShiftGoal, done?: boolean): HTMLElement =>
  h(
    `div.goalrow${done === undefined ? '' : done ? '.ok' : '.no'}`,
    done === undefined ? h('span.dot') : icon(done ? 'check' : 'close', 15),
    h('b', team.members[g.member]?.name ?? '—'),
    h('span.st', stationName(g.station)),
    h('span.txt', t(`team.goal.${g.key}`, g.params)),
  );

/** Change of shift: how the last one went, who takes over, and the goals for the next one. */
export function shiftScreen(app: App): HTMLElement {
  const s = app.game.sim!;
  const team = s.team!;
  const last = team.history[team.history.length - 1];
  const pilot = team.members[team.pilot];
  const met = last ? last.goals.filter((g) => g.met).length : 0;
  const body = h(
    'div.sheet-body.shift',
    last
      ? h('div', h('h3.sec', t('team.lastShift', { n: last.shift, name: team.members[last.pilot]?.name ?? '', met, total: last.goals.length })), ...last.goals.map((g) => goalLine(team, g, g.met)))
      : null,
    h('div.pilot', h('span', t('team.atControls')), h('strong', pilot.name), h('small', t('team.duty'))),
    h('h3.sec', t('team.nextGoals', { n: team.shift })),
    ...team.goals.map((g) => goalLine(team, g)),
  );
  const foot = h('div.sheet-foot', h('span.muted', t('team.talk')), h('span.spacer'), h('button.btn.primary', { onclick: () => app.startShift() }, t('team.start', { name: pilot.name })));
  return sheet('.mid', t('team.change', { n: team.shift }), null, null, body, foot);
}

/** The team's results for the debrief. */
export function teamTable(team: TeamState): HTMLElement {
  const rows = team.members.map((m, i) => {
    const pct = m.set ? Math.round((100 * m.met) / m.set) : 0;
    const best = team.history.filter((x) => x.pilot === i && x.goals.every((g) => g.met)).length;
    return h('tr', h('td', h('b', m.name)), h('td', m.stations.map(stationName).join(' · ')), h('td.n', String(m.shifts)), h('td.n', `${m.met} / ${m.set}`), h('td', h('div.bar', h('i', { style: { width: `${pct}%` } }))), h('td.n', String(best)));
  });
  return h(
    'div.teamres',
    h('h3.sec', t('team.results')),
    h('table', h('thead', h('tr', ...['team.col.name', 'team.col.st', 'team.col.shifts', 'team.col.goals', 'team.col.pct', 'team.col.perfect'].map((k) => h('th', t(k))))), h('tbody', ...rows)),
    h('p.note', t('team.resultsNote')),
  );
}

/* -------------------------------------------------------------- planning */

export function planningScreen(app: App, missionId: string): HTMLElement {
  const m = missionById(missionId);
  const manifest: Partial<Record<CargoItem, number>> = { ...m.recommended };
  const world = m.world;
  const missionDays = m.endless ? 30 : (m.durationSols * WORLDS[world].solH) / 24;
  const items: CargoItem[] = [...MODULE_ORDER.filter((k) => MODULES[k].worlds.includes(world)), 'food', 'water', 'o2'];

  const list = h('div.plan-list');
  const side = h('div.plan-side');
  const launch = h('button.btn.primary', { onclick: () => app.launch(m.id, manifest) }, icon('rocket'), t('plan.launch')) as HTMLButtonElement;
  const teamBox = teamPanel(app, world);
  const rows = new Map<CargoItem, { row: HTMLElement; n: HTMLElement }>();

  const change = (item: CargoItem, d: number): void => {
    const next = Math.max(0, Math.min(isSupply(item) ? 99 : 12, (manifest[item] ?? 0) + d));
    if (next === (manifest[item] ?? 0)) return;
    manifest[item] = next;
    app.game.audio.ui('tick');
    refresh();
  };

  const groupHead = (text: string): HTMLElement => h('div.plan-group', text);
  list.append(groupHead(t('plan.modules')));
  for (const item of items) {
    if (item === 'food') list.append(groupHead(t('plan.supplies')));
    const n = h('span.n', '0');
    const desc = isSupply(item) ? '' : t(`desc.${item}`);
    const row = h(
      'div.item',
      h('div.glyph', icon(cargoIcon(item), 20)),
      h('div', h('div.name', cargoName(item)), desc ? h('div.desc', desc) : null),
      h('div.mass', `${fmt(cargoMass(item))} kg`),
      h(
        'div.stepper',
        h('button', { onclick: () => change(item, -1) }, icon('minus', 14)),
        n,
        h('button', { onclick: () => change(item, 1) }, icon('plus', 14)),
      ),
    );
    rows.set(item, { row, n });
    list.append(row);
  }

  const refresh = (): void => {
    for (const [item, r] of rows) {
      const c = manifest[item] ?? 0;
      r.n.textContent = String(c);
      r.row.classList.toggle('has', c > 0);
    }
    const mass = manifestMass(manifest);
    const over = mass > m.budgetKg;
    launch.disabled = over;
    const a = planAutonomy(m.crew, manifest);
    const barRow = (label: string, days: number): HTMLElement => {
      const frac = Math.min(1, days / missionDays);
      const cls = days >= missionDays ? 'ok' : days >= missionDays * 0.6 ? 'warn' : 'bad';
      const shown = days > 900 ? '∞' : fmt(days);
      return h('div.kv', h('span.muted', label), h(`div.bar.thick.${cls}`, h('i', { style: { width: `${frac * 100}%` } })), h('span.v', `${shown} / ${fmt(missionDays)} d`));
    };
    const solar = manifest.solar ?? 0;
    const reactor = manifest.reactor ?? 0;
    const storage = (manifest.battery ?? 0) * 80 + (manifest.fuelcell ?? 0) * 600;
    // average usable generation: on Mars an array averages ~1.1 kW over a sol
    const avgGen = world === 'moon' ? solar * 10 + reactor * 10 + 5 : solar * 1.15 + reactor * 10 + 0.6;
    const tips: Array<[string, boolean]> = [];
    if (solar + reactor === 0) tips.push(['plan.tip.noPower', false]);
    if (a.o2 < missionDays) tips.push(['plan.tip.o2', false]);
    if (a.water < missionDays) tips.push(['plan.tip.water', false]);
    if (a.food < missionDays) tips.push(['plan.tip.food', false]);
    if (world === 'moon' && reactor === 0 && storage < 300 && missionDays >= 12) tips.push(['plan.tip.night', false]);
    if (world === 'mars' && reactor === 0 && solar > 0 && storage < 160) tips.push(['plan.tip.marsSolar', false]);
    if (a.demandKw > avgGen * 1.1 && solar + reactor > 0) tips.push(['plan.tip.power', false]);
    if (!(manifest.shelter ?? 0) && !(manifest.rassor ?? 0)) tips.push(['plan.tip.noShield', false]);
    if (!(manifest.hab ?? 0)) tips.push(['plan.tip.noHab', false]);
    if (!tips.length) tips.push(['plan.tip.ok', true]);

    clear(side);
    if (isChapter(m.id))
      side.append(h('div.chapterbox', h('span.site', t('camp.chapter', { n: CHAPTERS.indexOf(m.id) + 1, total: CHAPTERS.length })), h('p', h('b', t('camp.learn')), ' ', t(`camp.${m.id}`))));
    side.append(
      h('p.brief', t(`mission.${m.id}.brief`)),
      h(
        'div.plan-box',
        h('h4', t('plan.mass')),
        h('div.massline', h('span.big', { style: { color: over ? 'var(--bad-text)' : '' } }, `${fmt(mass)} kg`), h('span.muted', `/ ${fmt(m.budgetKg)} kg`)),
        h(`div.bar.thick.${over ? 'bad' : 'sun'}`, { style: { marginTop: '0.5em' } }, h('i', { style: { width: `${Math.min(100, (mass / m.budgetKg) * 100)}%` } })),
        h('div.note', { style: { marginTop: '0.45em', color: over ? 'var(--bad-text)' : '' } }, over ? t('plan.over', { kg: fmt(mass - m.budgetKg) }) : t('plan.free', { kg: fmt(m.budgetKg - mass) })),
        h('div.note', { style: { marginTop: '0.3em' } }, t('plan.included')),
      ),
      h(
        'div.plan-box',
        h('h4', t('plan.autonomy')),
        barRow(t('plan.o2'), a.o2),
        barRow(t('plan.water'), a.water),
        barRow(t('plan.food'), a.food),
        h('div.kv', h('span.muted', t('plan.power')), h('span'), h('span.v', `${fmt(avgGen, 1)} kW`)),
        h('div.kv', h('span.muted', t('plan.demand')), h('span'), h('span.v', { style: { color: a.demandKw > avgGen * 1.1 ? 'var(--accent)' : '' } }, `${fmt(a.demandKw, 1)} kW`)),
      ),
      h('div.plan-box', h('h4', t('hud.orbi')), h('ul.tips', ...tips.slice(0, 4).map(([k, ok]) => h(`li${ok ? '.ok' : ''}`, icon(ok ? 'check' : 'warn', 16), h('span', t(k)))))),
      teamBox,
    );
  };
  refresh();

  const foot = h(
    'div.sheet-foot',
    h(
      'button.btn.ghost',
      {
        onclick: () => {
          for (const k of Object.keys(manifest) as CargoItem[]) delete manifest[k];
          refresh();
        },
      },
      t('plan.clear'),
    ),
    h(
      'button.btn',
      {
        onclick: () => {
          for (const k of Object.keys(manifest) as CargoItem[]) delete manifest[k];
          Object.assign(manifest, m.recommended);
          refresh();
        },
      },
      t('plan.recommended'),
    ),
    h('span.spacer'),
    launch,
  );
  const title = `${t('plan.title')} · ${t(`mission.${m.id}.name`)}`;
  return sheet('', title, t('plan.lead'), () => app.openMissions(), h('div.sheet-body', h('div.plan', list, side)), foot);
}

/* ------------------------------------------------------------------ help */

export function helpScreen(app: App, onClose: () => void): HTMLElement {
  void app;
  const body = h(
    'div.sheet-body.help',
    h('p', t('help.goal')),
    h('h4', t('help.command')),
    h('p', t('help.command.body')),
    h('h4', t('help.eva')),
    h('p', t('help.eva.body')),
    h('h4', t('help.tips')),
    h('p', t('help.tips.body')),
  );
  return sheet('.mid', t('help.title'), null, onClose, body);
}

/* -------------------------------------------------------------- settings */

export function settingsScreen(app: App, onClose: () => void): HTMLElement {
  const s = app.settings;
  const qual = h('div.seg');
  for (const q of QUALITY_LEVELS) {
    qual.append(
      h(
        'button',
        {
          class: s.quality === q ? 'on' : '',
          onclick: () => {
            s.quality = q;
            app.saveSettings();
            app.rerender();
          },
        },
        t(`set.quality.${q}`),
      ),
    );
  }
  const range = (value: number, on: (v: number) => void): HTMLElement =>
    h('input', {
      type: 'range',
      min: '0',
      max: '100',
      value: String(Math.round(value * 100)),
      oninput: (e: Event) => on(Number((e.target as HTMLInputElement).value) / 100),
    });
  const levels = h('div.seg');
  for (const lv of [1, 2, 3] as const) {
    levels.append(
      h(
        'button',
        {
          class: s.level === lv ? 'on' : '',
          onclick: () => {
            s.level = lv;
            app.saveSettings();
            app.rerender();
          },
        },
        t(`set.level.${lv}`),
      ),
    );
  }
  const textSizes = h('div.seg');
  for (const k of [0.9, 1, 1.15, 1.3, 1.5]) {
    textSizes.append(
      h(
        'button',
        {
          class: Math.abs(s.textScale - k) < 0.01 ? 'on' : '',
          onclick: () => {
            s.textScale = k;
            app.saveSettings();
            app.applyAccessibility();
            app.rerender();
          },
        },
        `${Math.round(k * 100)} %`,
      ),
    );
  }
  const toggle = (on: boolean, set: (v: boolean) => void): HTMLElement =>
    h(
      'button.btn.small',
      {
        class: on ? 'on' : '',
        'aria-pressed': String(on),
        onclick: () => {
          set(!on);
          app.saveSettings();
          app.applyAccessibility();
          app.rerender();
        },
      },
      on ? t('set.on') : t('set.off'),
    );
  const lang = getLang();
  const body = h(
    'div.sheet-body',
    h(
      'div.setrow',
      h('span', t('set.fullscreen')),
      h(
        'div.row',
        h(
          'button.btn.small',
          {
            class: app.isFullscreen() ? 'on' : '',
            onclick: () => {
              app.toggleFullscreen();
              setTimeout(() => app.rerender(), 250);
            },
          },
          app.isFullscreen() ? t('set.fullscreen.on') : t('set.fullscreen.off'),
        ),
        h('span.note', 'F11'),
      ),
    ),
    h('div.setrow', h('span', t('set.quality')), qual),
    h('div.setrow', h('span', t('set.level')), levels),
    h('div.setrow', h('span'), h('span.note', t('set.levelNote'))),
    h('div.setrow', h('span', t('set.text')), textSizes),
    h('div.setrow', h('span', t('set.cb')), toggle(s.colorblind, (v) => (s.colorblind = v))),
    h('div.setrow', h('span', t('set.voice')), toggle(s.voice, (v) => (s.voice = v))),
    h('div.setrow', h('span', t('set.pad')), h('span.note', t('set.padNote'))),
    s.quality !== app.activeQuality
      ? h('div.setrow', h('span'), h('div.row', h('span.note', t('set.qualityNote')), h('button.btn.small', { onclick: () => location.reload() }, t('set.reload'))))
      : null,
    h(
      'div.setrow',
      h('span', t('set.volume')),
      range(s.volume, (v) => {
        s.volume = v;
        app.game.audio.setVolume(v);
        app.saveSettings();
      }),
    ),
    h(
      'div.setrow',
      h('span', t('set.music')),
      range(s.music, (v) => {
        s.music = v;
        app.game.audio.setMusicVolume(v);
        app.saveSettings();
      }),
    ),
    h(
      'div.setrow',
      h('span', t('set.lang')),
      h(
        'div.lang',
        h('button', { class: lang === 'es' ? 'on' : '', onclick: () => app.setLanguage('es') }, 'ES'),
        h('button', { class: lang === 'en' ? 'on' : '', onclick: () => app.setLanguage('en') }, 'EN'),
      ),
    ),
  );
  return sheet('.narrow', t('menu.settings'), null, onClose, body);
}

/* ----------------------------------------------------------------- pause */

export function pauseScreen(app: App): HTMLElement {
  const body = h(
    'div.sheet-body',
    h(
      'nav.menu-list',
      menuRow(1, t('menu.resume'), () => app.closeOverlay(), { primary: true }),
      menuRow(2, t('photo.title'), () => {
        app.closeOverlay();
        app.game.setPhoto(true);
      }, { hint: 'O' }),
      menuRow(3, t('menu.codex'), () => app.openCodex()),
      menuRow(4, t('menu.help'), () => app.openHelp()),
      menuRow(5, t('menu.settings'), () => app.openSettings()),
      menuRow(6, t('end.csv'), () => app.game.sim && downloadTelemetry(app.game.sim), { hint: t('end.csv.hint') }),
      menuRow(7, t('menu.quit'), () => app.quit(), { quiet: true }),
    ),
  );
  return sheet('.narrow', t('menu.paused'), null, () => app.closeOverlay(), body);
}

/* ---------------------------------------------------------- achievements */

export function achievementsScreen(app: App, onClose: () => void): HTMLElement {
  const have = unlocked();
  const n = ACHIEVEMENTS.filter((a) => have[a.id]).length;
  const list = h(
    'div.achlist',
    ...ACHIEVEMENTS.map((a) =>
      h(`div.ach${have[a.id] ? '.on' : ''}`, icon(have[a.id] ? a.icon : 'lock', 20), h('div', h('b', t(`ach.${a.id}`)), h('span', t(`ach.${a.id}.d`)))),
    ),
  );
  const days = Object.entries(dailyBest()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  const daily = days.length
    ? h('div.dailylog', h('h3.sec', t('daily.history')), ...days.map(([code, s]) => h('div', h('span', `${code.slice(6, 8)}/${code.slice(4, 6)}/${code.slice(0, 4)}`), h('b', String(s)))))
    : null;
  void app;
  return sheet('.mid', t('menu.achievements'), t('ach.count', { n, total: ACHIEVEMENTS.length }), onClose, h('div.sheet-body', list, daily));
}

/* ----------------------------------------------------------------- codex */

export function codexScreen(app: App, onClose: () => void, startId?: string): HTMLElement {
  const nav = h('div.codex-nav');
  const art = h('div.codex-art');
  const found = app.discovered();
  const buttons = new Map<string, HTMLElement>();
  const show = (id: string): void => {
    for (const [k, b] of buttons) b.classList.toggle('on', k === id);
    clear(art);
    if (id === 'glossary') {
      const terms = [...GLOSSARY].sort((a, b) => t(`gloss.${a}`).localeCompare(t(`gloss.${b}`)));
      art.append(h('h3', t('gloss.title')), h('dl.gloss', ...terms.flatMap((k) => [h('dt', t(`gloss.${k}`)), h('dd', t(`gloss.${k}.d`))])));
    } else if (id.startsWith('min.')) {
      art.append(h('h3', t(id)), h('p', t(`${id}.b`)));
    } else {
      art.append(h('h3', t(`codex.${id}.t`)), h('p', t(`codex.${id}.b`)), h('div.ingame', h('span.label', t('codex.inGame')), t(`codex.${id}.g`)));
    }
    art.scrollTop = 0;
  };
  let group = '';
  for (const e of CODEX) {
    if (e.group !== group) {
      group = e.group;
      nav.append(h('div.grp', t(`codex.group.${group}`)));
    }
    const b = h('button', { onclick: () => show(e.id) }, icon(e.icon, 16), t(`codex.${e.id}.t`));
    buttons.set(e.id, b);
    nav.append(b);
  }
  nav.append(h('div.grp', `${t('codex.samples')} · ${found.length}/16`));
  const minerals = ['anorthosite', 'breccia', 'glass', 'basalt', 'iceReg', 'impactMelt', 'agglutinate', 'boulder', 'hematite', 'carbonate', 'sulfate', 'mudstone', 'olivine', 'clay', 'meteorite', 'perchlorate', 'freshEjecta', 'deltaRock'];
  for (const k of minerals) {
    const got = found.includes(k);
    const b = h('button', { class: got ? '' : 'locked', onclick: () => got && show(`min.${k}`) }, icon(got ? 'star' : 'lock', 16), got ? t(`min.${k}`) : t('codex.locked'));
    buttons.set(`min.${k}`, b);
    nav.append(b);
  }
  nav.append(h('div.grp', t('codex.group.words')));
  const gb = h('button', { onclick: () => show('glossary') }, icon('info', 16), t('gloss.title'));
  buttons.set('glossary', gb);
  nav.append(gb);
  show(startId ?? CODEX[0].id);
  return sheet('', t('codex.title'), t('codex.lead'), onClose, h('div.sheet-body', h('div.codex', nav, art)));
}

/* --------------------------------------------------------------- debrief */

interface Series {
  data: number[];
  color: string;
  scale?: number;
}

export function drawChart(canvas: HTMLCanvasElement, series: Series[], bands?: number[]): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 320;
  const hh = canvas.clientHeight || 120;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hh * dpr);
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, hh);
  // sunlight band along the bottom
  if (bands && bands.length > 1) {
    for (let i = 0; i < bands.length; i++) {
      g.fillStyle = `rgba(255, 190, 90, ${0.05 + 0.16 * bands[i]})`;
      g.fillRect((i / bands.length) * w, hh - 5, w / bands.length + 1, 5);
    }
  }
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(0, (hh * i) / 4);
    g.lineTo(w, (hh * i) / 4);
    g.stroke();
  }
  for (const s of series) {
    if (s.data.length < 2) continue;
    let max = s.scale ?? 0;
    if (!s.scale) for (const v of s.data) if (v > max) max = v;
    if (max <= 0) max = 1;
    g.beginPath();
    for (let i = 0; i < s.data.length; i++) {
      const x = (i / (s.data.length - 1)) * w;
      const y = hh - 7 - (Math.max(0, s.data[i]) / max) * (hh - 14);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = s.color;
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    g.stroke();
  }
}

export function debriefScreen(app: App, sim: SimState): HTMLElement {
  const score = scoreMission(sim);
  const ok = sim.outcome?.result === 'success';
  const stars = h('div.stars');
  for (let i = 0; i < 5; i++) stars.append(h(`span${i <= score.rank ? '.on' : ''}`, icon('star', 26)));
  const pillar = (key: keyof typeof score, color: string): HTMLElement => {
    const v = score[key] as number;
    return h('div.pillar', h('span', t(`end.pillar.${key}`)), h('div.bar.thick', h('i', { style: { width: `${v}%`, background: color } })), h('span.pv', fmt(v)));
  };
  const st = sim.stats;
  const stat = (label: string, value: string): HTMLElement => h('div.stat', h('b', value), h('span', label));
  const tele = sim.telemetry;
  const chart = (title: string, series: Series[], legend: Array<[string, string]>): HTMLElement => {
    const c = h('canvas') as HTMLCanvasElement;
    requestAnimationFrame(() => drawChart(c, series, tele.sun));
    return h('div.chart', h('h5', title), c, h('div.legend', ...legend.map(([name, col]) => h('span', h('i', { style: { background: col } }), name))));
  };
  const ls = lessons(sim);
  const body = h(
    'div.sheet-body',
    h(
      'div.debrief-top',
      h(
        'div.rankbox',
        h('div.label', t('end.score')),
        h('div.score', fmt(score.total)),
        stars,
        h('div.label', t('end.rank')),
        h('div.rank', t(`end.rank.${score.rank}`)),
      ),
      h(
        'div',
        pillar('crew', 'var(--ok)'),
        pillar('radiation', 'var(--rad)'),
        pillar('science', 'var(--info)'),
        pillar('power', 'var(--accent)'),
        pillar('sustain', '#a8d86f'),
        h(
          'div.statgrid',
          stat(t('end.stat.mass'), `${fmt(st.massLanded / 1000, 1)} t`),
          stat(t('end.stat.energy'), `${fmt(st.energyGenKwh / 1000, 1)} MWh`),
          stat(t('end.stat.dose'), `${fmt(score.maxDose, 1)} mSv`),
          stat(t('end.stat.samples'), String(st.samplesCollected)),
          stat(t('end.stat.harvests'), String(st.harvests)),
          stat(t('end.stat.eva'), fmt(st.evaH, 1)),
        ),
      ),
    ),
    h('h3.sec', t('end.lessons')),
    h('div.lessons', ...ls.map((l) => h(`div.lesson${l.good ? '.good' : ''}`, icon(l.good ? 'check' : 'warn', 18), h('span', t(`lesson.${l.key}`, l.params))))),
    h('h3.sec', t('end.charts')),
    h(
      'div.charts',
      chart(
        t('end.chart.power'),
        [
          { data: tele.gen, color: '#f2a93b' },
          { data: tele.demand, color: '#ff6b5e' },
          { data: tele.stored, color: '#5bc8e8' },
        ],
        [
          [t('hud.gen'), '#f2a93b'],
          [t('hud.use'), '#ff6b5e'],
          [t('insp.charge'), '#5bc8e8'],
        ],
      ),
      chart(
        t('end.chart.life'),
        [
          { data: tele.o2, color: '#7bd88f' },
          { data: tele.water, color: '#5bc8e8' },
          { data: tele.food, color: '#f2a93b' },
        ],
        [
          [t('hud.o2'), '#7bd88f'],
          [t('hud.water'), '#5bc8e8'],
          [t('hud.food'), '#f2a93b'],
        ],
      ),
      chart(
        t('end.chart.crew'),
        [
          { data: tele.health, color: '#7bd88f', scale: 100 },
          { data: tele.morale, color: '#c9a6ff', scale: 100 },
        ],
        [
          [t('hud.health'), '#7bd88f'],
          [t('hud.morale'), '#c9a6ff'],
        ],
      ),
      chart(t('end.chart.dose'), [{ data: tele.dose, color: '#c9a6ff' }], [[t('hud.rad'), '#c9a6ff']]),
    ),
  );
  // ---- for the classroom: comprehension questions and a report to hand in
  const level = sim.cfg.level ?? app.settings.level;
  const answers: QuizAnswer[] = pickQuestions(sim.world, level).map((shown) => ({ shown, chosen: null }));
  const tally = h('span.tally', '');
  const updateTally = (): void => {
    const done = answers.filter((a) => a.chosen !== null).length;
    tally.textContent = done ? `${answers.filter((a) => a.chosen === 0).length} / ${done}` : '';
  };
  const quiz = h(
    'div.quiz',
    ...answers.map((a, qi) => {
      const q = a.shown.question;
      const why = h('p.why.hidden', tx(q.why));
      const opts = h('div.qopts');
      const buttons = a.shown.order.map((o) =>
        h(
          'button',
          {
            onclick: () => {
              if (a.chosen !== null) return;
              a.chosen = o;
              a.shown.order.forEach((oo, i) => {
                const b = buttons[i];
                b.disabled = true;
                if (oo === 0) b.classList.add('right');
                else if (oo === o) b.classList.add('wrong');
              });
              why.classList.remove('hidden');
              app.game.audio.ui(o === 0 ? 'good' : 'error');
              updateTally();
            },
          },
          tx(q.options[o]),
        ) as HTMLButtonElement,
      );
      opts.append(...buttons);
      return h('div.qcard', h('h4', `${qi + 1}. ${tx(q.q)}`), opts, why);
    }),
  );
  const student = h('input.student', { type: 'text', placeholder: t('end.student'), maxlength: '60' }) as HTMLInputElement;
  const classroomRow = h('div');
  const classroomBox = h(
    'div',
    h('h3.sec', t('end.quiz'), tally),
    h('p.note', t('end.quiz.lead')),
    quiz,
    h(
      'div.report',
      student,
      h('button.btn', { onclick: () => downloadReport(teacherReport(sim, level, answers, student.value.trim()), sim.missionId) }, icon('download'), t('end.report')),
      h('button.btn.ghost', { onclick: () => downloadTelemetry(sim), title: t('end.csv.d') }, icon('download'), t('end.csv')),
      h('span.note', t('end.report.note')),
    ),
    classroomRow,
  );
  // inside claude.ai with a class database: send this result to the teacher
  if (sim.missionId !== 'demo-moon')
    void classroom().then((c) => {
      if (!c || !c.me) return;
      const msg = h('span.note', '');
      const btn = h('button.btn.primary', {}, icon('crew'), t('class.send')) as HTMLButtonElement;
      btn.onclick = async () => {
        btn.disabled = true;
        const r = await sendResult(c, entryFor(sim, level));
        msg.textContent = t(`class.sent.${r}`);
        btn.disabled = r === 'sent' || r === 'kept';
      };
      classroomRow.append(h('div.classsend', btn, msg));
    });
  body.insertBefore(classroomBox, body.querySelector('h3.sec'));

  // achievements unlocked by this mission, and the daily challenge result
  const earned = h('div.achlist');
  const progress = (): Parameters<typeof checkAchievements>[0] => ({
    sim,
    driven: app.game.roverOdo,
    longestThrow: app.game.longestThrow,
    ended: true,
    quizRight: answers.every((a) => a.chosen !== null) ? answers.filter((a) => a.chosen === 0).length : null,
    quizTotal: answers.length,
  });
  const showEarned = (ids: string[]): void => {
    for (const id of ids) {
      const a = ACHIEVEMENTS.find((x) => x.id === id)!;
      earned.append(h('div.ach.on', icon(a.icon, 20), h('div', h('b', t(`ach.${id}`)), h('span', t(`ach.${id}.d`)))));
    }
    earnedSec.classList.toggle('hidden', earned.childElementCount === 0);
  };
  const earnedSec = h('div.hidden', h('h3.sec', t('end.ach')), earned);
  body.insertBefore(earnedSec, classroomBox);
  if (sim.team) body.insertBefore(teamTable(sim.team), earnedSec);
  const chapter = recordChapter(sim);
  const next = nextChapter(sim.missionId);
  if (chapter) {
    body.insertBefore(
      h(
        'div.chapterres',
        medalRow(chapter.medal),
        h(
          'div.grow',
          h('b', chapter.medal ? t(`camp.medal.${chapter.medal}`) : t('camp.medal.0')),
          h('span', chapter.opened ? t('camp.opened', { name: t(`mission.${chapter.opened}.name`) }) : chapter.medal ? t('camp.best', { m: t(`camp.medal.${chapter.best}`) }) : t('camp.retry')),
        ),
        chapter.medal && next ? h('button.btn.primary', { onclick: () => app.openPlanning(next) }, t('camp.next')) : null,
      ),
      body.firstChild,
    );
  }
  showEarned(checkAchievements(progress()));
  quiz.addEventListener('click', () => setTimeout(() => showEarned(checkAchievements(progress())), 0));
  if (sim.missionId.startsWith('daily-')) {
    const code = sim.missionId.slice(6);
    const bestNow = recordDaily(code, ok ? score.total : 0);
    body.insertBefore(h('div.dailyres', icon('sun', 18), t('end.daily', { code, s: fmt(ok ? score.total : 0), best: bestNow })), earnedSec);
  }

  const sub = ok ? t('end.success.sub') : t(`end.abort.${sim.outcome?.reason ?? 'health'}`);
  const foot = h(
    'div.sheet-foot',
    h('button.btn.ghost', { onclick: () => app.quit() }, icon('home'), t('end.menu')),
    h('button.btn.primary', { onclick: () => app.openPlanning(sim.missionId) }, icon('rocket'), t('end.retry')),
  );
  return sheet('', ok ? t('end.success') : t('end.abort'), sub, null, body, foot);
}
