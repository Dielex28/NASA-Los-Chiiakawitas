import { lessons } from '../sim/advisor';
import { MODULES, MODULE_ORDER, SUPPLIES, cargoMass, isSupply } from '../sim/catalog';
import { MISSIONS, missionById, scoreMission, type MissionDef } from '../sim/missions';
import { manifestMass, planAutonomy } from '../sim/sim';
import { WORLDS } from '../sim/worlds';
import type { CargoItem, ModuleType, SimState, SupplyType } from '../sim/types';
import type { App } from './app';
import { CODEX } from './codexData';
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
    const m = missionById(save.missionId);
    const day = Math.floor(save.timeH / WORLDS[save.world].solH) + (save.world === 'moon' ? 1 : 0);
    saveLabel = `${t(`mission.${m.id}.name`)} · ${t(`unit.day.${save.world}`).toLowerCase()} ${day}`;
  }
  const rows: HTMLElement[] = [];
  let n = 1;
  if (hasSave) rows.push(menuRow(n++, t('menu.continue'), () => app.continueGame(), { hint: saveLabel, primary: true }));
  rows.push(menuRow(n++, t('menu.new'), () => app.openMissions(), { primary: !hasSave }));
  rows.push(menuRow(n++, t('menu.codex'), () => app.openCodex()));
  rows.push(menuRow(n++, t('menu.help'), () => app.openHelp()));
  rows.push(menuRow(n++, t('menu.settings'), () => app.openSettings()));
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
  const body = h('div.sheet-body', h('div.cards', ...MISSIONS.map(card)));
  return sheet('', t('mission.select'), null, () => app.openMenu(), body);
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
  for (const q of ['low', 'medium', 'high', 'ultra'] as const) {
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
      menuRow(2, t('menu.codex'), () => app.openCodex()),
      menuRow(3, t('menu.help'), () => app.openHelp()),
      menuRow(4, t('menu.settings'), () => app.openSettings()),
      menuRow(5, t('menu.quit'), () => app.quit(), { quiet: true }),
    ),
  );
  return sheet('.narrow', t('menu.paused'), null, () => app.closeOverlay(), body);
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
    if (id.startsWith('min.')) {
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
  const minerals = ['anorthosite', 'breccia', 'glass', 'basalt', 'iceReg', 'impactMelt', 'agglutinate', 'boulder', 'hematite', 'carbonate', 'sulfate', 'mudstone', 'olivine', 'clay', 'meteorite', 'perchlorate'];
  for (const k of minerals) {
    const got = found.includes(k);
    const b = h('button', { class: got ? '' : 'locked', onclick: () => got && show(`min.${k}`) }, icon(got ? 'star' : 'lock', 16), got ? t(`min.${k}`) : t('codex.locked'));
    buttons.set(`min.${k}`, b);
    nav.append(b);
  }
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
  const sub = ok ? t('end.success.sub') : t(`end.abort.${sim.outcome?.reason ?? 'health'}`);
  const foot = h(
    'div.sheet-foot',
    h('button.btn.ghost', { onclick: () => app.quit() }, icon('home'), t('end.menu')),
    h('button.btn.primary', { onclick: () => app.openPlanning(sim.missionId) }, icon('rocket'), t('end.retry')),
  );
  return sheet('', ok ? t('end.success') : t('end.abort'), sub, null, body, foot);
}
