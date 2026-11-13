import { clamp01 } from '../core/math';
import type { Game } from '../game/game';
import { advise, type Advice } from '../sim/advisor';
import { CROPS, CROP_ORDER, MODULES, MODULE_ORDER, TUNE, cargoMass } from '../sim/catalog';
import {
  conditionEff,
  effectiveAllocation,
  isBuilt,
  manifestMass,
  setAllocation,
  setCrop,
  setEnabled,
  setPowerSave,
  setPriority,
  setResupplyItem,
  shieldOf,
  sunForecast,
  totalDose,
} from '../sim/sim';
import { WORLDS } from '../sim/worlds';
import type { Allocation, CargoItem, LogEntry, ModuleState, ModuleType, Priority, SimState } from '../sim/types';
import type { App } from './app';
import { clear, fmt, h, icon, setText } from './dom';
import { MOD_ICON, cargoIcon, cargoName, unitDays } from './screens';
import { has, t } from './strings';

type Sev = 'ok' | 'warn' | 'bad';

interface Vital {
  el: HTMLElement;
  value: HTMLElement;
  fill: HTMLElement;
  bar: HTMLElement;
  subL: HTMLElement;
  subR: HTMLElement;
}

function vital(iconName: string, label: string, barClass = ''): Vital {
  const value = h('span.v', '—');
  const fill = h('i');
  const bar = h(`div.bar${barClass}`, fill);
  const subL = h('span', '');
  const subR = h('span', '');
  const el = h('div.vital', h('div.vh', icon(iconName, 16), h('span.l', label), value), bar, h('div.vs', subL, subR));
  return { el, value, fill, bar, subL, subR };
}

function setSev(el: HTMLElement, sev: Sev): void {
  el.classList.toggle('warn', sev === 'warn');
  el.classList.toggle('bad', sev === 'bad');
}

/** Translate a log entry, resolving module and crop names. */
export function logText(e: LogEntry): string {
  const p: Record<string, string | number> = { ...(e.params ?? {}) };
  if (typeof p.type === 'string' && has(`mod.${p.type}`)) p.type = t(`mod.${p.type}`);
  if (typeof p.crop === 'string' && has(`crop.${p.crop}`)) p.crop = t(`crop.${p.crop}`);
  return t(e.key, p);
}

export function clockText(sim: SimState): { day: string; time: string } {
  const w = WORLDS[sim.world];
  if (sim.world === 'moon') {
    const d = Math.floor(sim.timeH / 24) + 1;
    const hh = sim.timeH % 24;
    return { day: `${t('unit.day.moon')} ${d}`, time: `${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.floor((hh % 1) * 60)).padStart(2, '0')}` };
  }
  const sol = Math.floor(sim.timeH / w.solH);
  const hh = (sim.env.localH / w.solH) * 24;
  return { day: `${t('unit.day.mars')} ${sol}`, time: `${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.floor((hh % 1) * 60)).padStart(2, '0')}` };
}

function duration(hours: number, world: 'moon' | 'mars'): string {
  if (hours < 0) hours = 0;
  if (hours < 48) return `${fmt(hours)} h`;
  return `${fmt(hours / WORLDS[world].solH, 1)} ${unitDays(world)}`;
}

/** In-mission heads-up display. Built once per mission; `update()` only mutates text and widths. */
export class Hud {
  readonly el = h('div.hud');
  private game: Game;
  private app: App;
  private slow = 0;
  private slower = 0;
  private frames = 0;
  // top
  private dayEl = h('div.day', '');
  private timeEl = h('div.time', '');
  private missionFill = h('i');
  private speedBtns: HTMLElement[] = [];
  private evaBtn!: HTMLElement;
  private forecast = h('canvas') as HTMLCanvasElement;
  private sunState = h('span.state', '');
  private dustEl = h('span', '');
  // left
  private vPower = vital('power', t('hud.power'), '.sun');
  private vO2 = vital('o2', t('hud.o2'));
  private vWater = vital('water', t('hud.water'));
  private vFood = vital('food', t('hud.food'));
  private vAir = vital('air', t('hud.air'));
  private vRad = vital('rad', t('hud.rad'), '.violet');
  private vCrew = vital('crew', t('hud.crew'));
  private vSci = vital('science', t('hud.science'));
  private saveBtns: HTMLElement[] = [];
  private healthFill = h('i');
  private moraleFill = h('i');
  // right
  private right!: HTMLElement;
  private inspectorEl!: HTMLElement;
  private tabBody = h('div.tab-body');
  private tabBtns = new Map<string, HTMLElement>();
  private tab = 'goals';
  private tabUpdate: (() => void) | null = null;
  private inspectedId: number | null = -1;
  private cargoDot = h('span.dot.hidden');
  // bottom
  private bottom!: HTMLElement;
  private buildbar = h('div.buildbar.panel');
  private bcards = new Map<ModuleType, { el: HTMLElement; ct: HTMLElement }>();
  private buildinfo = h('div.buildinfo.panel.hidden');
  private tooltip: HTMLElement | null = null;
  // corner
  private corner!: HTMLElement;
  private orbi = h('div.orbi.panel');
  private orbiSay = h('div.say', '');
  private orbiKey = '';
  private mapBtns = new Map<string, HTMLElement>();
  private toasts = h('div.toasts');
  private alert = h('div.alert.panel.hidden');
  private alertKey = '';
  // eva
  private eva = h('div.eva.hidden');
  private prompt = h('div.prompt.panel.hidden');
  private promptText = h('span', '');
  private promptFill = h('i');
  private promptBar = h('div.bar.ok', this.promptFill);
  private suitFill = h('i');
  private jetFill = h('i');
  private geiger = h('div.geiger', h('span.muted', ''), h('span', ''));
  private lockMsg = h('div.eva-lock', t('eva.clickToLook'));
  private evaHint = h('div.eva-hint', t('eva.hint'));
  private touchEl: HTMLElement | null = null;
  private compass = h('div.compass');
  private compassMarks: HTMLElement[] = [];
  private markers = new Map<string, HTMLElement>();
  private markerLayer = h('div');
  private scanpop: HTMLElement | null = null;
  private evaBuild = false;
  private offs: Array<() => void> = [];
  private tutorial = { eva: false, scan: false, sample: false, back: false, shelter: false };

  constructor(app: App) {
    this.app = app;
    this.game = app.game;
    this.buildTop();
    this.buildLeft();
    this.buildRight();
    this.buildBottom();
    this.buildCorner();
    this.buildEva();
    this.el.append(this.alert, this.toasts);
    this.bind();
    this.showTab('goals');
    this.update(1, true);
  }

  dispose(): void {
    for (const off of this.offs) off();
    window.removeEventListener('keydown', this.onKey);
    this.el.remove();
    this.tooltip?.remove();
  }

  private get sim(): SimState {
    return this.game.sim!;
  }

  /* ------------------------------------------------------------ top */
  private buildTop(): void {
    const g = this.game;
    const speedIcons = ['pause', 'play', 'ff', 'fff'];
    const speed = h('div.speed');
    speedIcons.forEach((name, i) => {
      const b = h('button', { title: i === 0 ? t('hud.speed.pause') : `×${[0, 1, 4, 12][i]}`, onclick: () => (i === 0 ? g.togglePause() : g.setSpeed(i)) }, icon(name, 16));
      this.speedBtns.push(b);
      speed.append(b);
    });
    this.evaBtn = h('button.btn', { onclick: () => (g.mode === 'eva' ? g.exitEva() : g.enterEva()) }, icon('eva'), h('span', t('hud.eva')));
    const m = g.mission!;
    const span = m.world === 'moon' ? 5 : 3;
    const top = h(
      'div.hud-top',
      h(
        'div.topbox.panel',
        h('button.iconbtn', { onclick: () => this.app.openPause(), title: t('hud.menu') }, icon('menu', 20)),
        h('div.clock', h('div.mission', t(`mission.${m.id}.name`)), this.dayEl),
        h('div.clock', this.timeEl, h('div.bar.missionbar', this.missionFill)),
      ),
      h(
        'div.topbox.panel.forecast',
        h('div.frow', h('span', t('hud.forecast', { n: span, unit: unitDays(m.world) })), this.sunState),
        this.forecast,
        m.world === 'mars' ? h('div.frow', this.dustEl, h('span')) : null,
      ),
      h('span.spacer'),
      h('div.topbox.panel', speed, this.evaBtn),
    );
    this.el.append(top);
  }

  /* ----------------------------------------------------------- left */
  private buildLeft(): void {
    const seg = h('div.seg');
    for (const lvl of [0, 1, 2] as const) {
      const b = h('button', { title: t('hud.powerSave'), onclick: () => setPowerSave(this.sim, lvl) }, t(`hud.powerSave.${lvl}`));
      this.saveBtns.push(b);
      seg.append(b);
    }
    this.vPower.el.append(seg);
    this.vCrew.bar.remove();
    this.vCrew.el.querySelector('.vs')?.remove();
    this.vCrew.el.append(
      h('div.twobars', h('span', t('hud.health')), h('div.bar.ok', this.healthFill), h('span', t('hud.morale')), h('div.bar', this.moraleFill)),
    );
    this.vCrew.el.style.cursor = 'pointer';
    this.vCrew.el.addEventListener('click', () => this.showTab('crew'));
    const left = h('section.hud-left.panel', { 'aria-label': t('hud.status') }, this.vPower.el, this.vO2.el, this.vWater.el, this.vFood.el, this.vAir.el, this.vRad.el, this.vCrew.el);
    if (!this.game.mission!.endless) left.append(this.vSci.el);
    this.el.append(left);
  }

  /* ---------------------------------------------------------- right */
  private buildRight(): void {
    const tabs = h('div.tabs');
    const defs: Array<[string, string, string]> = [
      ['goals', 'target', 'hud.tab.goals'],
      ['module', 'hab', 'hud.tab.module'],
      ['crew', 'crew', 'hud.tab.crew'],
      ['cargo', 'cargo', 'hud.tab.cargo'],
      ['log', 'log', 'hud.tab.log'],
    ];
    for (const [id, ic, key] of defs) {
      const b = h('button', { onclick: () => this.showTab(id) }, icon(ic, 17), t(key));
      if (id === 'cargo') b.append(this.cargoDot);
      this.tabBtns.set(id, b);
      tabs.append(b);
    }
    this.inspectorEl = h('section.inspector.panel', tabs, this.tabBody);
    this.right = h('div.hud-right', this.inspectorEl, this.orbi);
    this.el.append(this.right);
  }

  private showTab(id: string): void {
    this.tab = id;
    for (const [k, b] of this.tabBtns) b.classList.toggle('on', k === id);
    clear(this.tabBody);
    this.tabUpdate = null;
    this.inspectedId = -1;
    if (id === 'goals') this.tabGoals();
    else if (id === 'module') this.tabModule();
    else if (id === 'crew') this.tabCrew();
    else if (id === 'cargo') this.tabCargo();
    else this.tabLog();
    this.refreshTab();
  }

  private refreshTab(): void {
    this.tabUpdate?.();
  }

  private goalsList(): Array<{ text: string; done: boolean }> {
    const s = this.sim;
    const m = this.game.mission!;
    const out: Array<{ text: string; done: boolean }> = [];
    const w = WORLDS[s.world];
    if (m.endless) out.push({ text: t('goal.endless'), done: false });
    else out.push({ text: t('goal.survive', { n: m.durationSols, unit: unitDays(m.world) }) + ` · ${fmt(Math.min(m.durationSols, s.timeH / w.solH), 1)}`, done: s.timeH >= s.cfg.durationH });
    if (s.cfg.scienceGoal > 0) out.push({ text: t('goal.science', { have: fmt(s.science), goal: s.cfg.scienceGoal }), done: s.science >= s.cfg.scienceGoal });
    const dose = s.crew.reduce((a, c) => Math.max(a, totalDose(c)), 0);
    out.push({ text: t('goal.dose', { limit: s.cfg.doseLimitMsv, have: fmt(dose, 1) }), done: dose < s.cfg.doseLimitMsv });
    out.push({ text: t('goal.crew'), done: s.crew.every((c) => c.health > 60) });
    return out;
  }

  private tutorialSteps(): Array<{ key: string; done: boolean }> {
    const s = this.sim;
    const placed = (type: ModuleType): boolean => s.modules.some((m) => m.type === type);
    const built = (type: ModuleType): boolean => s.modules.some((m) => m.type === type && isBuilt(m));
    const tu = this.tutorial;
    const speDone = s.schedule.some((e) => e.kind === 'spe' && e.ended);
    return [
      { key: 'tut.power', done: placed('solar') },
      { key: 'tut.battery', done: placed('battery') },
      { key: 'tut.wait', done: built('solar') },
      { key: 'tut.rest', done: placed('antenna') && placed('lab') && placed('shelter') },
      { key: 'tut.eva', done: tu.eva },
      { key: 'tut.scan', done: tu.scan },
      { key: 'tut.sample', done: tu.sample },
      { key: 'tut.back', done: tu.back },
      { key: 'tut.storm', done: tu.shelter || speDone },
      { key: 'tut.finish', done: s.outcome?.result === 'success' },
    ];
  }

  private tabGoals(): void {
    const goalsEl = h('div.col');
    const tutEl = h('div.col');
    const tipsEl = h('div.col');
    const isTut = this.game.mission!.tutorial;
    this.tabBody.append(goalsEl);
    if (isTut) this.tabBody.append(h('div.section', t('tut.title')), tutEl);
    this.tabBody.append(h('div.section', t('hud.orbi')), tipsEl);
    let sig = '';
    this.tabUpdate = () => {
      const goals = this.goalsList();
      const steps = isTut ? this.tutorialSteps() : [];
      const tips = advise(this.sim).slice(0, 4);
      const next = JSON.stringify([goals, steps, tips.map((x) => [x.key, x.params])]);
      if (next === sig) return;
      sig = next;
      clear(goalsEl);
      for (const g of goals) goalsEl.append(h(`div.goal${g.done ? '.done' : ''}`, h('span.box', g.done ? icon('check', 12) : null), h('span', g.text)));
      clear(tutEl);
      let current = true;
      for (const st of steps) {
        const cls = st.done ? '.done' : current ? '.current' : '';
        if (!st.done) current = false;
        tutEl.append(h(`div.goal${cls}`, h('span.box', st.done ? icon('check', 12) : null), h('span', t(st.key))));
      }
      clear(tipsEl);
      if (!tips.length) tipsEl.append(h('div.tipcard', icon('check', 16), h('span', t('hud.allGood'))));
      for (const tip of tips) tipsEl.append(this.tipCard(tip));
    };
  }

  private tipText(a: Advice): string {
    const p: Record<string, string | number> = { ...(a.params ?? {}) };
    if (typeof p.type === 'string' && has(`mod.${p.type}`)) p.type = t(`mod.${p.type}`);
    if (typeof p.crop === 'string' && has(`crop.${p.crop}`)) p.crop = t(`crop.${p.crop}`);
    return t(`tip.${a.key}`, p);
  }

  private tipCard(a: Advice): HTMLElement {
    const cls = a.sev === 'bad' ? '.bad' : a.sev === 'warn' ? '.warn' : '';
    const el = h(`div.tipcard${cls}${a.ref ? '.click' : ''}`, icon(a.sev === 'info' ? 'info' : 'warn', 16), h('span', this.tipText(a)));
    if (a.ref) el.addEventListener('click', () => this.game.focusModule(a.ref!));
    return el;
  }

  private tabModule(): void {
    const wrap = h('div.col');
    this.tabBody.append(wrap);
    const live: { refresh: (() => void) | null } = { refresh: null };
    this.tabUpdate = () => {
      const m = this.game.selected();
      const id = m ? m.id : null;
      if (id !== this.inspectedId) {
        this.inspectedId = id;
        clear(wrap);
        live.refresh = null;
        if (!m) wrap.append(h('div.muted', t('hud.noSelection')));
        else live.refresh = this.inspector(wrap, m);
      }
      live.refresh?.();
    };
  }

  /** Build the inspector for one module; returns a function that refreshes its live values. */
  private inspector(wrap: HTMLElement, m0: ModuleState): () => void {
    const g = this.game;
    const def = MODULES[m0.type];
    const status = h('span.status', '');
    const condFill = h('i');
    const condBar = h('div.bar.thick', condFill);
    const dl = h('dl.dl');
    const row = (label: string): HTMLElement => {
      const dd = h('dd', '');
      dl.append(h('dt', label), dd);
      return dd;
    };
    wrap.append(h('div.insp-title', icon(MOD_ICON[m0.type], 22), h('h3', t(`mod.${m0.type}`)), status), h('div.note', t(`desc.${m0.type}`)));
    wrap.append(h('div.label', t('insp.condition')), condBar, dl);
    const isLoad = def.opKw + def.keepKw + def.heatKw > 0;
    const draw = isLoad || def.genKw > 0 ? row(def.genKw > 0 && m0.type !== 'lander' ? t('insp.output') : t('insp.draw')) : null;
    const rows: Array<() => void> = [];
    const get = (): ModuleState | undefined => this.sim.modules.find((x) => x.id === m0.id);

    if (m0.type === 'solar' || m0.type === 'lander') {
      const sun = row(t('insp.sun'));
      rows.push(() => setText(sun, `${fmt((get()?.sunVis ?? 0) * 100)} %`));
    }
    if (m0.type === 'solar' && this.sim.world === 'mars') {
      const dust = row(t('insp.dust'));
      rows.push(() => setText(dust, `${fmt((get()?.dust ?? 0) * 100)} %`));
    }
    if (def.storageKwh > 0) {
      const charge = row(t('insp.charge'));
      rows.push(() => setText(charge, `${fmt(get()?.charge ?? 0)} / ${def.storageKwh} kWh`));
    }
    if (m0.type === 'hab' || m0.type === 'shelter') {
      const reg = row(t('insp.regolith'));
      const sh = row(t('insp.shield'));
      rows.push(() => {
        const m = get();
        if (!m) return;
        setText(reg, `${fmt(m.regolith)} / ${TUNE.regolithMax} g/cm²`);
        setText(sh, `${fmt(shieldOf(m))} g/cm²`);
      });
    }
    if (m0.type === 'icerig') {
      const rich = row(t('insp.richness'));
      const out = row(t('insp.output'));
      rows.push(() => {
        const m = get();
        if (!m) return;
        setText(rich, `${fmt(m.richness * 100)} %`);
        setText(out, `${fmt(m.output, 1)} kg/${t(`unit.day.${this.sim.world}`).toLowerCase()}`);
      });
    }
    if (m0.type === 'moxie') {
      const out = row(t('insp.output'));
      rows.push(() => setText(out, `${fmt(get()?.output ?? 0, 1)} kg O₂/sol`));
    }
    if (m0.type === 'rassor') {
      const tg = row(t('insp.target'));
      rows.push(() => {
        const m = get();
        const target = m && m.targetId ? this.sim.modules.find((x) => x.id === m.targetId) : undefined;
        setText(tg, target && m!.output > 0 ? t(`mod.${target.type}`) : t('insp.idle'));
      });
    }
    if (m0.type === 'greenhouse') {
      const growth = row(t('insp.growth'));
      const harvest = h('div.note', '');
      const chips = h('div.chips');
      const chipEls = new Map<string, HTMLElement>();
      for (const c of CROP_ORDER) {
        const chip = h(
          'button.chip',
          {
            onclick: () => {
              setCrop(this.sim, m0.id, c);
              g.audio.ui('click');
            },
          },
          t(`crop.${c}`),
        );
        chipEls.set(c, chip);
        chips.append(chip);
      }
      wrap.append(h('div.label', t('insp.crop')), chips, harvest);
      rows.push(() => {
        const m = get();
        if (!m) return;
        const crop = CROPS[m.crop];
        for (const [k, el] of chipEls) el.classList.toggle('on', k === m.crop);
        setText(growth, `${fmt(m.growth * 100)} %`);
        const rate = m.mode === 'full' ? TUNE.farmAutomation + (1 - TUNE.farmAutomation) * this.sim.flows.farmSat : 0;
        const left = rate > 0 ? (crop.cycleSols * (1 - m.growth)) / rate : Infinity;
        const a = isFinite(left) ? t('insp.harvestIn', { d: fmt(left), unit: unitDays(this.sim.world) }) : t('insp.status.off');
        setText(harvest, `${a} · ${t('insp.cropYield', { r: fmt(crop.rationsPerSol * crop.cycleSols), d: crop.realDays })}`);
      });
    }

    const controls = h('div.row', { style: { flexWrap: 'wrap', marginTop: '0.3em' } });
    const power = h('button.btn.small', { onclick: () => setEnabled(this.sim, m0.id, !(get()?.enabled ?? true)) }, icon('power', 14), t('insp.enabled'));
    controls.append(power);
    const prioBtns: HTMLElement[] = [];
    if (isLoad && m0.type !== 'lander') {
      const seg = h('div.seg', { style: { width: 'auto', margin: '0' } });
      for (const p of [1, 2, 3] as Priority[]) {
        const b = h('button', { onclick: () => setPriority(this.sim, m0.id, p) }, t(`insp.priority.${p}`));
        prioBtns.push(b);
        seg.append(b);
      }
      wrap.append(h('div.label', t('insp.priority')), seg);
    }
    controls.append(h('button.btn.small.ghost', { onclick: () => g.focusModule(m0.id) }, icon('target', 14), t('insp.focus')));
    if (m0.type !== 'lander') controls.append(h('button.btn.small.ghost', { onclick: () => g.dismantle(m0.id) }, icon('cargo', 14), t('insp.store')));
    wrap.append(controls);

    return () => {
      const m = get();
      if (!m) return;
      let st = 'full';
      let label = t('insp.status.full');
      if (!isBuilt(m)) {
        st = 'building';
        label = t('insp.status.building', { pct: fmt(m.built * 100) });
      } else if (m.down) {
        st = 'down';
        label = t('insp.status.down');
      } else if (!m.enabled) {
        st = 'off';
        label = t('insp.status.disabled');
      } else if (m.mode === 'off') {
        st = 'off';
        label = t('insp.status.off');
      } else if (m.mode === 'standby') {
        st = 'standby';
        label = t('insp.status.standby');
      }
      status.className = `status ${st}`;
      setText(status, label);
      condFill.style.width = `${m.condition}%`;
      condBar.className = `bar thick ${m.condition > 70 ? 'ok' : m.condition > 35 ? 'warn' : 'bad'}`;
      if (draw) setText(draw, `${fmt(m.type === 'lander' ? m.kw : m.kw, 1)} kW${conditionEff(m) < 1 ? ` · ${fmt(conditionEff(m) * 100)} %` : ''}`);
      power.classList.toggle('on', m.enabled);
      prioBtns.forEach((b, i) => b.classList.toggle('on', m.priority === i + 1));
      for (const r of rows) r();
    };
  }

  private tabCrew(): void {
    const s = this.sim;
    const keys: Array<keyof Allocation> = ['maintain', 'science', 'farm', 'build'];
    const sliders = new Map<keyof Allocation, { input: HTMLInputElement; hrs: HTMLElement }>();
    this.tabBody.append(h('div.label', t('crew.allocation')));
    for (const k of keys) {
      const hrs = h('span.hrs', '');
      const input = h('input', {
        type: 'range',
        min: '0',
        max: '100',
        value: String(Math.round(s.alloc[k] * 100)),
        oninput: (e: Event) => {
          setAllocation(this.sim, k, Number((e.target as HTMLInputElement).value) / 100);
          for (const [kk, sl] of sliders) if (kk !== k) sl.input.value = String(Math.round(this.sim.alloc[kk] * 100));
        },
      }) as HTMLInputElement;
      sliders.set(k, { input, hrs });
      this.tabBody.append(h('div.slider', h('span', t(`crew.${k}`)), input, hrs));
    }
    this.tabBody.append(h('div.note', t('crew.idleNote')));
    const wl = h('div.seg', { style: { margin: '0' } });
    const wlBtns: HTMLElement[] = [];
    for (const lvl of [0, 1, 2] as const) {
      const b = h('button', { onclick: () => (this.sim.workload = lvl) }, t(`crew.workload.${lvl}`));
      wlBtns.push(b);
      wl.append(b);
    }
    this.tabBody.append(h('div.label', t('crew.workload')), wl);
    const shelterBtn = h('button.btn.small.danger', { onclick: () => this.game.orderShelter(!this.sim.shelterOrder) }, icon('shield', 14), h('span', ''));
    const shelterNote = h('div.note', '');
    this.tabBody.append(h('div.row', shelterBtn), shelterNote);
    const list = h('div');
    this.tabBody.append(list);
    const rows = this.sim.crew.map((c) => {
      const hf = h('i');
      const mf = h('i');
      const dose = h('span.dose', '');
      const loc = h('div.rl', '');
      list.append(h('div.crewrow', h('div', h('div.nm', c.name), loc), h('div.bar.ok', { title: t('hud.health') }, hf), h('div.bar.violet', { title: t('hud.morale') }, mf), dose));
      return { hf, mf, dose, loc };
    });
    this.tabUpdate = () => {
      const sim = this.sim;
      const eff = effectiveAllocation(sim);
      const total = sim.flows.crewHours.maintain + sim.flows.crewHours.science + sim.flows.crewHours.farm + sim.flows.crewHours.build;
      for (const [k, sl] of sliders) {
        setText(sl.hrs, t('crew.hours', { h: fmt(sim.shelterOrder ? sim.flows.crewHours[k] : total * eff[k], 1) }));
        if (document.activeElement !== sl.input) sl.input.value = String(Math.round(sim.alloc[k] * 100));
      }
      wlBtns.forEach((b, i) => b.classList.toggle('on', sim.workload === i));
      setText(shelterBtn.lastElementChild!, sim.shelterOrder ? t('crew.shelterEnd') : t('crew.shelter'));
      shelterBtn.classList.toggle('on', sim.shelterOrder);
      setText(shelterNote, sim.shelterOrder ? t('crew.sheltering') : '');
      sim.crew.forEach((c, i) => {
        const r = rows[i];
        r.hf.style.width = `${c.health}%`;
        r.mf.style.width = `${c.morale}%`;
        setText(r.dose, t('crew.dose', { v: fmt(totalDose(c), 1) }));
        setText(r.loc, `${t(`role.${c.role}`)} · ${t(`crew.loc.${c.location}`)}`);
      });
    };
  }

  private tabCargo(): void {
    const inv = h('div.col');
    const resupply = h('div.col');
    this.tabBody.append(h('div.label', t('cargo.inventory')), inv, h('div.label', t('cargo.next')), resupply);
    let sig = '';
    this.tabUpdate = () => {
      const sim = this.sim;
      const win = sim.resupply.find((r) => !r.delivered);
      const idx = win ? sim.resupply.indexOf(win) : -1;
      const next = JSON.stringify([sim.inventory, win ? [win.locked, win.manifest] : null, sim.resupply.length]);
      const head = h('div.note', '');
      if (next !== sig) {
        sig = next;
        clear(inv);
        const have = (Object.keys(sim.inventory) as ModuleType[]).filter((k) => (sim.inventory[k] ?? 0) > 0);
        if (!have.length) inv.append(h('div.muted', t('hud.cargoEmpty')));
        for (const k of have) {
          inv.append(h('div.tipcard.click', { onclick: () => this.game.startBuild(k) }, icon(MOD_ICON[k], 16), h('span.grow', t(`mod.${k}`)), h('span.num', `×${sim.inventory[k]}`)));
        }
        clear(resupply);
        if (!win) resupply.append(h('div.muted', sim.resupply.length ? t('cargo.delivered') : t('cargo.none')));
        else {
          const mass = manifestMass(win.manifest);
          resupply.append(head, h('div.bar.thick.sun', h('i', { style: { width: `${(mass / win.capacityKg) * 100}%` } })), h('div.note', `${fmt(mass)} / ${fmt(win.capacityKg)} kg`));
          if (!win.locked) {
            const items: CargoItem[] = ['food', 'water', 'o2', ...MODULE_ORDER.filter((k) => MODULES[k].worlds.includes(sim.world))];
            for (const item of items) {
              const c = win.manifest[item] ?? 0;
              const step = (d: number): void => {
                if (setResupplyItem(sim, idx, item, c + d)) this.game.audio.ui('tick');
                else this.game.audio.ui('error');
              };
              resupply.append(
                h(
                  'div.row',
                  { style: { fontSize: '0.86em' } },
                  icon(cargoIcon(item), 15),
                  h('span.grow', cargoName(item)),
                  h('span.muted.num', `${fmt(cargoMass(item))} kg`),
                  h('div.stepper', h('button', { onclick: () => step(-1) }, icon('minus', 12)), h('span.n', String(c)), h('button', { onclick: () => step(1) }, icon('plus', 12))),
                ),
              );
            }
          }
        }
      }
      const headEl = resupply.firstElementChild;
      if (win && headEl) {
        const txt = win.locked
          ? `${t('cargo.locked')} · ${t('cargo.arrives', { t: duration(win.arrivalH - sim.timeH, sim.world) })}`
          : `${t('cargo.cutoff', { t: duration(win.cutoffH - sim.timeH, sim.world) })} · ${t('cargo.arrives', { t: duration(win.arrivalH - sim.timeH, sim.world) })}`;
        setText(headEl, txt);
      }
    };
  }

  private tabLog(): void {
    const list = h('div');
    this.tabBody.append(list);
    let n = -1;
    this.tabUpdate = () => {
      const log = this.sim.log;
      const stamp = log.length ? log[log.length - 1].t : 0;
      if (stamp === n) return;
      n = stamp;
      clear(list);
      const w = WORLDS[this.sim.world];
      for (let i = log.length - 1; i >= Math.max(0, log.length - 50); i--) {
        const e = log[i];
        const d = this.sim.world === 'moon' ? Math.floor(e.t / 24) + 1 : Math.floor(e.t / w.solH);
        list.append(h(`div.logline.${e.sev}`, h('span.tm', `${t(`unit.day.${this.sim.world}`)} ${d}`), h('span.tx', logText(e))));
      }
    };
  }

  /* --------------------------------------------------------- bottom */
  private buildBottom(): void {
    const world = this.game.mission!.world;
    for (const type of MODULE_ORDER) {
      if (!MODULES[type].worlds.includes(world)) continue;
      const ct = h('span.ct', '0');
      const el = h('button.bcard', { onclick: () => this.pickBuild(type) }, icon(MOD_ICON[type], 22), h('span.nm', t(`mod.${type}`)), ct);
      el.addEventListener('mouseenter', () => this.showTooltip(type, el));
      el.addEventListener('mouseleave', () => this.hideTooltip());
      this.bcards.set(type, { el, ct });
      this.buildbar.append(el);
    }
    this.bottom = h('div.hud-bottom', this.buildinfo, this.buildbar);
    this.el.append(this.bottom);
  }

  private pickBuild(type: ModuleType): void {
    const g = this.game;
    if (g.build?.active === type) g.cancelBuild();
    else g.startBuild(type);
    if (g.mode === 'eva' && g.build?.active) {
      this.evaBuild = false;
      g.input.lock();
    }
  }

  private showTooltip(type: ModuleType, anchor: HTMLElement): void {
    this.hideTooltip();
    const d = MODULES[type];
    const specs = h('div.specs', h('span', h('b', `${fmt(d.massKg)} kg`)));
    if (d.genKw) specs.append(h('span', '+', h('b', `${d.genKw} kW`)));
    if (d.opKw + d.keepKw) specs.append(h('span', '−', h('b', `${fmt(d.opKw + d.keepKw, 1)} kW`)));
    if (d.storageKwh) specs.append(h('span', h('b', `${d.storageKwh} kWh`)));
    if (d.crewCapacity) specs.append(h('span', h('b', `${d.crewCapacity}`), ' ', t('mission.crew').toLowerCase()));
    specs.append(h('span', h('b', `${d.buildHours} h`), ' ', t('crew.build').toLowerCase()));
    const tip = h('div.tooltip.panel', h('h5', t(`mod.${type}`)), h('p', t(`desc.${type}`)), specs);
    this.app.root.append(tip);
    const r = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2))}px`;
    tip.style.top = `${r.top - tip.offsetHeight - 10}px`;
    this.tooltip = tip;
  }

  private hideTooltip(): void {
    this.tooltip?.remove();
    this.tooltip = null;
  }

  /* --------------------------------------------------------- corner */
  private buildCorner(): void {
    this.orbi.append(h('div.face'), h('div.grow', h('div.who', t('hud.orbi')), this.orbiSay));
    const seg = h('div.seg');
    for (const kind of ['none', 'illum', 'ice'] as const) {
      const b = h('button', { onclick: () => this.game.setOverlay(kind) }, t(`hud.overlay.${kind}`));
      this.mapBtns.set(kind, b);
      seg.append(b);
    }
    this.corner = h('div.hud-corner', h('div.mapsw.panel', icon('map', 16), seg));
    this.el.append(this.corner);
  }

  /* ------------------------------------------------------------ eva */
  private buildEva(): void {
    for (let i = 0; i < 12; i++) {
      const m = h('span', '');
      this.compassMarks.push(m);
      this.compass.append(m);
    }
    this.prompt.append(this.promptText, this.promptBar);
    const meters = h(
      'div.eva-meters.panel',
      h('div.meter', h('span.lb', t('eva.suit')), h('div.bar.ok', this.suitFill), h('span.vl')),
      h('div.meter', h('span.lb', t('eva.jet')), h('div.bar', this.jetFill), h('span.vl')),
      this.geiger,
      h('div.note', t('eva.timeNote')),
    );
    this.eva.append(this.compass, h('div.crosshair'), this.prompt, meters, this.markerLayer, this.lockMsg, this.evaHint, this.touchLayer());
    this.el.append(this.eva);
  }

  /** On-screen stick and buttons for touch devices (shown after the first touch). */
  private touchLayer(): HTMLElement {
    const input = this.game.input;
    const knob = h('i');
    const stick = h('div.stick', knob);
    const move = (e: TouchEvent): void => {
      e.preventDefault();
      const r = stick.getBoundingClientRect();
      const t = e.targetTouches[0];
      if (!t) return;
      let x = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      input.stickX = x;
      input.stickY = -y;
      knob.style.transform = `translate(${x * 2.4}em, ${y * 2.4}em)`;
    };
    const stop = (e: TouchEvent): void => {
      e.preventDefault();
      input.stickX = 0;
      input.stickY = 0;
      knob.style.transform = '';
    };
    stick.addEventListener('touchstart', move, { passive: false });
    stick.addEventListener('touchmove', move, { passive: false });
    stick.addEventListener('touchend', stop, { passive: false });
    stick.addEventListener('touchcancel', stop, { passive: false });
    const key = (label: string, code: string): HTMLElement => {
      const b = h('button', label);
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        input.press(code);
      }, { passive: false });
      const up = (e: Event): void => {
        e.preventDefault();
        input.release(code);
      };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      return b;
    };
    this.touchEl = h('div.touch.hidden', stick, h('div.tbtns', key('E', 'KeyE'), key('▲', 'Space'), key('F', 'KeyF'), key('⇄', 'Tab')));
    return this.touchEl;
  }

  /* --------------------------------------------------------- events */
  private onKey = (e: KeyboardEvent): void => {
    const g = this.game;
    if (g.phase !== 'playing' || this.app.overlayOpen) return;
    if (e.code === 'KeyB' && g.mode === 'eva') {
      this.evaBuild = !this.evaBuild;
      if (this.evaBuild) g.input.unlock();
      else g.input.lock();
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (e.code === 'Escape' && (g.build?.active || g.selectedId !== null || this.evaBuild)) {
        this.evaBuild = false;
        return;
      }
      this.app.openPause();
    }
    if (e.code === 'KeyM') g.setOverlay(g.overlay === 'none' ? 'illum' : g.overlay === 'illum' ? 'ice' : 'none');
  };

  private bind(): void {
    const g = this.game;
    window.addEventListener('keydown', this.onKey);
    this.offs.push(
      g.events.on('log', (e) => {
        if (e.key === 'log.shelter.on') this.tutorial.shelter = true;
        this.toast(logText(e), e.sev);
      }),
      g.events.on('toast', (e) => this.toast(t(e.key, e.params), e.sev)),
      g.events.on('placed', (type) => this.toast(t('toast.placed', { what: t(`mod.${type}`) }), 'info')),
      g.events.on('select', (id) => {
        if (id !== null) this.showTab('module');
      }),
      g.events.on('mode', (mode) => {
        if (mode === 'eva') this.tutorial.eva = true;
        else if (this.tutorial.eva) this.tutorial.back = true;
        this.evaBuild = false;
        this.syncMode();
      }),
      g.events.on('scan', (r) => {
        this.tutorial.scan = true;
        this.showScan(r.ice, r.illum, r.found);
        if (g.overlay === 'ice') g.setOverlay('ice');
      }),
      g.events.on('discovery', (d) => {
        this.tutorial.sample = true;
        this.app.rememberDiscovery(d.kind);
        this.showDiscovery(d.kind);
      }),
    );
    this.syncMode();
  }

  private syncMode(): void {
    const evaMode = this.game.mode === 'eva';
    this.eva.classList.toggle('hidden', !evaMode);
    this.inspectorEl.classList.toggle('hidden', evaMode);
    this.corner.classList.toggle('hidden', evaMode);
    setText(this.evaBtn.lastElementChild!, evaMode ? t('hud.evaBack') : t('hud.eva'));
    this.evaBtn.classList.toggle('on', evaMode);
  }

  toast(text: string, sev: 'info' | 'good' | 'warn' | 'bad'): void {
    const el = h(`div.toast.${sev}`, icon(sev === 'good' ? 'check' : sev === 'info' ? 'info' : 'warn', 15), h('span', text));
    this.toasts.prepend(el);
    while (this.toasts.children.length > 5) this.toasts.lastElementChild?.remove();
    setTimeout(() => el.classList.add('out'), sev === 'bad' ? 9000 : 6000);
    setTimeout(() => el.remove(), sev === 'bad' ? 9500 : 6500);
  }

  private showScan(ice: number, illum: number, found: number): void {
    this.scanpop?.remove();
    const pop = h(
      'div.scanpop.panel',
      h('h5', t('scan.result')),
      h('div', ice > 0.04 ? t('scan.ice', { pct: fmt(ice * 100) }) : t('scan.noIce')),
      h('div', t('scan.illum', { pct: fmt(illum * 100) })),
      found > 0 ? h('div', { style: { color: 'var(--info)' } }, t('scan.found', { n: found })) : null,
    );
    this.eva.append(pop);
    this.scanpop = pop;
    setTimeout(() => pop.remove(), 4200);
  }

  private showDiscovery(kind: string): void {
    const card = h(
      'div.discovery.panel',
      h('span.label', t('discovery.title')),
      h('h3', t(`min.${kind}`)),
      h('p', t(`min.${kind}.b`)),
      h('div.sci', t('discovery.science', { n: TUNE.discoveryScience })),
    );
    card.addEventListener('click', () => card.remove());
    this.el.append(card);
    setTimeout(() => card.remove(), 11000);
  }

  showTitleCard(): void {
    const m = this.game.mission!;
    const s = this.sim;
    const card = h('div.titlecard', h('div.a', t(`mission.${m.id}.site`)), h('div.b', clockText(s).day.toUpperCase()), h('div.c', t(`mission.${m.id}.name`)));
    this.el.append(card);
    setTimeout(() => card.remove(), 5300);
  }

  /* --------------------------------------------------------- update */
  update(dt: number, force = false): void {
    const g = this.game;
    const s = g.sim;
    if (!s) return;
    this.slow += dt;
    this.slower += dt;
    if (g.mode === 'eva') this.updateEva();
    if (this.slow > 0.16 || force) {
      this.slow = 0;
      this.updateFast(s);
      this.tabUpdate?.();
    }
    // the first few frames run before layout has settled, so refresh eagerly then
    this.frames++;
    if (this.slower > 1 || force || this.frames < 12) {
      this.slower = 0;
      this.drawForecast(s);
      this.updateOrbi(s);
    }
  }

  private updateFast(s: SimState): void {
    const g = this.game;
    const ck = clockText(s);
    setText(this.dayEl, ck.day);
    setText(this.timeEl, ck.time);
    this.missionFill.style.width = s.cfg.endless ? '0%' : `${clamp01(s.timeH / s.cfg.durationH) * 100}%`;
    const eva = g.mode === 'eva';
    this.speedBtns.forEach((b, i) => {
      b.classList.toggle('on', !eva && g.speed === i);
      b.classList.toggle('paused', i === 0);
      (b as HTMLButtonElement).disabled = eva;
    });

    // ---- power
    const p = s.power;
    const net = p.genKw - p.servedKw;
    setText(this.vPower.value, `${net >= 0 ? '+' : ''}${fmt(net, 1)} kW`);
    this.vPower.fill.style.width = `${p.capacityKwh > 0 ? (p.storedKwh / p.capacityKwh) * 100 : 0}%`;
    setText(this.vPower.subL, `${t('hud.gen')} ${fmt(p.genKw, 1)} · ${t('hud.use')} ${fmt(p.servedKw, 1)}`);
    setText(this.vPower.subR, `${fmt(p.storedKwh)}/${fmt(p.capacityKwh)} kWh`);
    setSev(this.vPower.el, p.blackout ? 'bad' : p.shed > 0 || (p.capacityKwh > 0 && p.storedKwh / p.capacityKwh < 0.15 && net < 0) ? 'warn' : 'ok');
    this.saveBtns.forEach((b, i) => b.classList.toggle('on', s.powerSave === i));

    // ---- consumables
    const f = s.flows;
    const days = (d: number): string => (d > 30 ? t('hud.daysPlus') : t('hud.days', { d: fmt(d, d < 10 ? 1 : 0) }));
    const consumable = (v: Vital, amount: string, d: number, prod: number, use: number, unit: string): void => {
      setText(v.value, amount);
      v.fill.style.width = `${clamp01(d / 30) * 100}%`;
      v.bar.className = `bar ${d < 4 ? 'bad' : d < 9 ? 'warn' : 'ok'}`;
      setText(v.subL, days(d));
      setText(v.subR, `+${fmt(prod, 1)} / −${fmt(use, 1)} ${unit}`);
      setSev(v.el, d < 4 ? 'bad' : d < 9 ? 'warn' : 'ok');
    };
    consumable(this.vO2, `${fmt(s.stores.o2)} kg`, f.o2Days, f.o2ProdDay, f.o2UseDay, 'kg/d');
    consumable(this.vWater, `${fmt(s.stores.water)} kg`, f.waterDays, f.waterProdDay, f.waterUseDay, 'kg/d');
    consumable(this.vFood, `${fmt(s.stores.food)} ${t('unit.rations')}`, f.foodDays, f.foodProdDay, f.foodUseDay, '/d');

    // ---- air
    setText(this.vAir.value, `${fmt(f.co2MmHg, 1)} mmHg`);
    this.vAir.fill.style.width = `${clamp01(f.co2MmHg / 12) * 100}%`;
    const airSev: Sev = f.co2MmHg > 6 || s.cabin.tempC < 8 ? 'bad' : f.co2MmHg > 4 || s.cabin.tempC < 14 ? 'warn' : 'ok';
    this.vAir.bar.className = `bar ${airSev}`;
    setText(this.vAir.subL, 'CO₂');
    setText(this.vAir.subR, `${fmt(s.cabin.tempC)} °C · ${fmt(s.env.outsideC)} °C ${t('hud.outside')}`);
    setSev(this.vAir.el, airSev);

    // ---- radiation
    const dose = s.crew.reduce((a, c) => Math.max(a, totalDose(c)), 0);
    setText(this.vRad.value, `${fmt(f.doseRateBaseMsvDay, 2)} mSv/d`);
    this.vRad.fill.style.width = `${clamp01(dose / s.cfg.doseLimitMsv) * 100}%`;
    setText(this.vRad.subL, t('hud.shield', { g: fmt(s.shelterOrder ? f.shieldShelter : f.shieldBase) }));
    setText(this.vRad.subR, `${fmt(dose, 1)} / ${s.cfg.doseLimitMsv} mSv`);
    const speActive = s.env.speMsvH > 0.05;
    setSev(this.vRad.el, speActive && !s.shelterOrder ? 'bad' : speActive || dose > s.cfg.doseLimitMsv * 0.8 ? 'warn' : 'ok');

    // ---- crew + science
    const n = Math.max(1, s.crew.length);
    const health = s.crew.reduce((a, c) => a + c.health, 0) / n;
    const morale = s.crew.reduce((a, c) => a + c.morale, 0) / n;
    setText(this.vCrew.value, `${s.crew.length}`);
    this.healthFill.style.width = `${health}%`;
    this.moraleFill.style.width = `${morale}%`;
    setSev(this.vCrew.el, health < 45 ? 'bad' : health < 75 || morale < 40 ? 'warn' : 'ok');
    setText(this.vSci.value, s.cfg.scienceGoal > 0 ? `${fmt(s.science)} / ${s.cfg.scienceGoal}` : fmt(s.science));
    this.vSci.fill.style.width = `${s.cfg.scienceGoal > 0 ? clamp01(s.science / s.cfg.scienceGoal) * 100 : 0}%`;
    setText(this.vSci.subL, `+${fmt(f.scienceDay, 1)} /d`);
    setText(this.vSci.subR, s.samples >= 1 ? `${fmt(Math.floor(s.samples))} ◆` : '');

    // ---- sun state
    const lit = s.env.sunVisBase > 0.5 && (s.world === 'moon' || s.env.sunEl > 0);
    setText(this.sunState, lit ? t('hud.sunNow') : s.world === 'mars' && s.env.sunEl <= 0 ? t('hud.sunNight') : t('hud.sunDark'));
    this.sunState.classList.toggle('dark', !lit);
    if (s.world === 'mars') setText(this.dustEl, t('hud.dust', { tau: fmt(s.env.tau, 1) }));

    // ---- build bar
    const active = g.build?.active ?? null;
    let cargo = 0;
    for (const [type, c] of this.bcards) {
      const n2 = s.inventory[type] ?? 0;
      cargo += n2;
      setText(c.ct, String(n2));
      c.el.classList.toggle('none', n2 <= 0);
      c.el.classList.toggle('on', active === type);
    }
    this.cargoDot.classList.toggle('hidden', !s.resupply.some((r) => !r.locked && !r.delivered));
    this.buildbar.classList.toggle('hidden', g.mode === 'eva' && !this.evaBuild && !active);
    void cargo;
    this.updateBuildInfo();
    for (const [k, b] of this.mapBtns) b.classList.toggle('on', g.overlay === k);
    this.updateAlert(s);
  }

  private updateBuildInfo(): void {
    const g = this.game;
    const b = g.build;
    if (!b || !b.active) {
      this.buildinfo.classList.add('hidden');
      return;
    }
    this.buildinfo.classList.remove('hidden');
    const p = b.placement;
    const parts: HTMLElement[] = [h('b', t(`mod.${b.active}`))];
    if (p) {
      if (!p.valid) parts.push(h('span.bad', t(`build.issue.${p.issue}`)));
      parts.push(h(`span.${p.issue === 'slope' ? 'bad' : 'ok'}`, t('build.slope', { deg: fmt(p.slopeDeg) })));
      if (b.active === 'solar') {
        parts.push(h(`span.${p.illum < 0.6 ? 'wn' : 'ok'}`, t('build.illum', { pct: fmt(p.illum * 100) })));
        if (p.illum < 0.6) parts.push(h('span.wn', t('build.warn.shade')));
      }
      if (b.active === 'icerig') {
        if (p.ice < 0) parts.push(h('span.wn', t('build.iceUnknown')));
        else parts.push(h(`span.${p.ice < 0.1 ? 'wn' : 'ok'}`, p.ice < 0.1 ? t('build.warn.noIce') : t('build.ice', { pct: fmt(p.ice * 100) })));
      }
      if (b.active === 'reactor' && isFinite(p.crewDist)) {
        parts.push(h(`span.${p.crewDist < TUNE.reactorSafeM ? 'wn' : 'ok'}`, t('build.crewDist', { m: fmt(p.crewDist) })));
        if (p.crewDist < TUNE.reactorSafeM) parts.push(h('span.wn', t('build.warn.reactor')));
      }
    }
    parts.push(h('span.muted', `${t('build.rotate')} · ${g.mode === 'eva' ? t('build.placeEva') : t('build.place')} · ${t('build.cancel')}`));
    const sig = parts.map((x) => x.textContent).join('|');
    if (this.buildinfo.dataset.sig !== sig) {
      this.buildinfo.dataset.sig = sig;
      clear(this.buildinfo);
      this.buildinfo.append(...parts);
    }
  }

  private updateAlert(s: SimState): void {
    const g = this.game;
    const spe = s.schedule.find((e) => e.kind === 'spe' && e.warned && !e.ended);
    let key = '';
    let build: (() => void) | null = null;
    const set = (cls: string, iconName: string, title: string, body: string, actions: HTMLElement[]): void => {
      clear(this.alert);
      this.alert.className = `alert panel ${cls}`;
      this.alert.append(icon(iconName, 26), h('div.grow', h('h4', title), body ? h('p', body) : null), h('div.acts', ...actions));
    };
    const shelterBtn = (): HTMLElement =>
      s.shelterOrder
        ? h('button.btn.small.ghost', { onclick: () => g.orderShelter(false) }, t('crew.shelterEnd'))
        : h('button.btn.small.danger', { onclick: () => g.orderShelter(true) }, icon('shield', 14), t('alert.shelter'));
    if (spe && spe.kind === 'spe') {
      const started = spe.started;
      const hrs = Math.max(0, spe.startH - s.timeH);
      const rate = s.env.speMsvH;
      key = `spe:${started}:${s.shelterOrder}`;
      build = () => {
        if (!started) set('', 'rad', t('alert.spe.title'), t('alert.spe.body', { h: fmt(hrs, 1), cls: spe.cls }), [shelterBtn()]);
        else set(s.shelterOrder ? 'info' : '', 'rad', t('alert.spe.active', { rate: fmt(rate, 1) }), s.shelterOrder ? t('alert.spe.safe') : t('alert.spe.exposed'), [shelterBtn()]);
      };
      // keep the countdown fresh
      if (this.alertKey === key) {
        const pEl = this.alert.querySelector('p');
        const hEl = this.alert.querySelector('h4');
        if (!started && pEl) setText(pEl, t('alert.spe.body', { h: fmt(hrs, 1), cls: spe.cls }));
        if (started && hEl) setText(hEl, t('alert.spe.active', { rate: fmt(rate, 1) }));
      }
    } else if (s.shelterOrder) {
      key = 'shelter';
      build = () => set('info', 'shield', t('alert.spe.safe'), t('crew.sheltering'), [shelterBtn()]);
    } else if (s.power.blackout) {
      key = `blackout:${s.powerSave}`;
      build = () =>
        set('', 'power', t('alert.blackout'), '', s.powerSave < 2 ? [h('button.btn.small.danger', { onclick: () => setPowerSave(s, 2) }, t('alert.saver'))] : []);
    } else if (s.env.storm > 0.15) {
      const pct = Math.round(100 * Math.exp(-0.3 * (s.env.tau - 0.45)));
      key = `storm:${Math.round(pct / 5)}`;
      build = () => set('info', 'wind', t('alert.storm', { pct }), '', []);
    }
    if (key !== this.alertKey) {
      this.alertKey = key;
      if (!key) this.alert.className = 'alert panel hidden';
      else build?.();
    }
  }

  private updateOrbi(s: SimState): void {
    let text = '';
    let sev = '';
    let key = '';
    const tips = advise(s);
    const urgent = tips.find((x) => x.sev !== 'info');
    if (this.game.mission!.tutorial && !urgent) {
      const step = this.tutorialSteps().find((x) => !x.done);
      if (step) {
        text = t(step.key);
        key = step.key;
      }
    }
    if (!text && tips.length) {
      const tip = urgent ?? tips[0];
      text = this.tipText(tip);
      sev = tip.sev === 'info' ? '' : tip.sev;
      key = tip.key;
    }
    if (!text) text = t('hud.allGood');
    setText(this.orbiSay, text);
    this.orbi.className = `orbi panel ${sev}`;
    if (key !== this.orbiKey) {
      this.orbiKey = key;
      if (sev === 'bad' || sev === 'warn') this.game.audio.ui('tick');
    }
  }

  private drawForecast(s: SimState): void {
    const c = this.forecast;
    const w = c.clientWidth || 300;
    const hh = c.clientHeight || 24;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(hh * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const world = WORLDS[s.world];
    const span = (s.world === 'moon' ? 5 : 3) * world.solH;
    const n = 120;
    const data = sunForecast(s, span, n);
    for (let i = 0; i < n; i++) {
      const v = data[i];
      // night blue → caution amber, the same pair the rest of the interface uses
      const r = Math.round(27 + 215 * v);
      const gg = Math.round(42 + 127 * v);
      const b = Math.round(74 - 15 * v);
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect((i / n) * w, 0, w / n + 1, hh);
    }
    const mark = (tH: number, color: string, width = 2): void => {
      const x = ((tH - s.timeH) / span) * w;
      if (x < 0 || x > w) return;
      g.fillStyle = color;
      g.fillRect(x - width / 2, 0, width, hh);
    };
    for (const e of s.schedule) {
      if (!e.warned || e.ended) continue;
      if (e.kind === 'spe') {
        const x0 = Math.max(0, ((e.startH - s.timeH) / span) * w);
        const x1 = Math.min(w, ((e.startH + e.durationH - s.timeH) / span) * w);
        g.fillStyle = 'rgba(255, 60, 50, 0.55)';
        g.fillRect(x0, 0, Math.max(2, x1 - x0), hh);
      } else {
        const x0 = Math.max(0, ((e.startH - s.timeH) / span) * w);
        const x1 = Math.min(w, ((e.startH + e.durationH - s.timeH) / span) * w);
        g.fillStyle = 'rgba(120, 70, 30, 0.6)';
        g.fillRect(x0, hh * 0.55, Math.max(2, x1 - x0), hh * 0.45);
      }
    }
    for (const r of s.resupply) if (!r.delivered) mark(r.arrivalH, '#5bc8e8', 3);
    if (!s.cfg.endless) mark(s.cfg.durationH, '#ffffff', 3);
    // day ticks
    g.fillStyle = 'rgba(0,0,0,0.45)';
    const first = Math.ceil(s.timeH / world.solH) * world.solH;
    for (let tt = first; tt < s.timeH + span; tt += world.solH) g.fillRect(((tt - s.timeH) / span) * w, hh - 4, 1, 4);
  }

  private updateEva(): void {
    const g = this.game;
    const s = this.sim;
    // prompt
    const p = g.prompt;
    if (p && !g.build?.active) {
      this.prompt.classList.remove('hidden');
      const what = has(`mod.${p.subject}`) ? t(`mod.${p.subject}`) : has(`min.${p.subject}`) ? t(`min.${p.subject}`) : p.subject;
      setText(this.promptText, t(`prompt.${p.kind}`, { what }));
      this.promptBar.classList.toggle('hidden', !p.hold);
      this.promptFill.style.width = `${p.progress * 100}%`;
    } else this.prompt.classList.add('hidden');
    this.suitFill.style.width = `${g.suit * 100}%`;
    (this.suitFill.parentElement as HTMLElement).className = `bar ${g.suit < 0.2 ? 'bad' : g.suit < 0.4 ? 'warn' : 'ok'}`;
    this.jetFill.style.width = `${g.jetFuel() * 100}%`;
    const rate = (s.flows.doseRateEvaMsvDay / 24) * 1000;
    setText(this.geiger.firstElementChild!, t('hud.rad'));
    setText(this.geiger.lastElementChild!, t('eva.dose', { v: fmt(rate, rate < 100 ? 0 : 0) }));
    this.geiger.classList.toggle('hot', s.env.speMsvH > 0.2);
    const touch = g.input.touch;
    this.lockMsg.classList.toggle('hidden', touch || g.input.locked || this.evaBuild || !!this.app.overlayOpen);
    this.touchEl?.classList.toggle('hidden', !touch);
    this.evaHint.classList.toggle('hidden', touch);

    // compass: heading the camera looks toward
    const yaw = g.cameraYaw();
    // the camera looks along −(sin yaw, cos yaw); bearing is clockwise from north (−z)
    const heading = (((-yaw * 180) / Math.PI) % 360 + 360) % 360;
    const names = ['N', '30', '60', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];
    for (let i = 0; i < 12; i++) {
      let d = i * 30 - heading;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      const el = this.compassMarks[i];
      el.style.left = `${50 + (d / 90) * 50}%`;
      setText(el, names[i]);
      el.className = i % 3 === 0 ? 'card' : '';
      el.style.display = Math.abs(d) > 95 ? 'none' : '';
    }

    // waypoints
    const seen = new Set<string>();
    for (const m of g.markers) {
      const pr = g.project(m.x, m.y, m.z);
      let el = this.markers.get(m.id);
      if (!pr) {
        if (el) el.style.display = 'none';
        seen.add(m.id);
        continue;
      }
      if (!el) {
        el = h(`div.marker.${m.kind}`, h('i'), h('span', ''));
        this.markers.set(m.id, el);
        this.markerLayer.append(el);
      }
      seen.add(m.id);
      el.style.display = '';
      el.style.left = `${Math.max(20, Math.min(window.innerWidth - 20, pr.x))}px`;
      el.style.top = `${Math.max(90, Math.min(window.innerHeight - 60, pr.y))}px`;
      setText(el.lastElementChild!, `${fmt(pr.dist)} m`);
    }
    for (const [id, el] of this.markers) {
      if (!seen.has(id)) {
        el.remove();
        this.markers.delete(id);
      }
    }
  }
}
