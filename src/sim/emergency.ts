import { Rng } from '../core/rng';
import { HUMAN, TUNE } from './catalog';
import { addFault, injure, recordFire } from './faults';
import type { MissionDef } from './missions';
import type { ModuleState, SimState } from './types';

export type EmergencyKind = 'leak' | 'meteor' | 'eclss' | 'fire';
export type EmergencyChoice = 'isolate' | 'patch' | 'repair' | 'backup' | 'extinguish' | 'vent';
/** Scripted crises of historical scenarios. */
export type CrisisKind = 'o2tank';

/**
 * Something has gone wrong and the commander has a short time to choose how to respond.
 * If nobody decides, the crew acts on its own when the time runs out — with the more
 * conservative option, and after losing more than a quick decision would have.
 */
export interface Emergency {
  kind: EmergencyKind;
  moduleId: number;
  startH: number;
  /** Mission hour at which the crew acts on its own. */
  decideByH: number;
  choice: EmergencyChoice | null;
  /** When the chosen fix is finished (null while undecided, or for fixes that are instant). */
  doneH: number | null;
  /** The crew decided by itself because the time ran out. */
  auto: boolean;
  /** Oxygen lost to space so far, kg. */
  o2Lost: number;
  /** When the crew asked Mission Control, and when the answer arrives (mission hours). */
  askedH?: number;
  answerH?: number;
  /** Control's recommendation, once it has arrived. */
  advice?: EmergencyChoice;
}

/** Hours to decide before the crew acts on its own. */
export const DECIDE_H = 1.5;
/** Oxygen escaping through a puncture or a failed seal, kg/h (cabin at 70 kPa, a few cm² of hole). */
export const LEAK_O2_KGH = { leak: 3.5, meteor: 6 } as const;
/** Fraction of the leak that keeps escaping while the crew works on a patch. */
const PATCH_LEAK = 0.4;
/** How long a patch takes, h. */
const PATCH_H = { leak: 2.5, meteor: 4 } as const;
/** Repairing failed CO₂ scrubbers, h: on the spot, or by a crew left to its own devices. */
const REPAIR_H = 3;
const AUTO_REPAIR_H = 5;
/** Emergency lithium-hydroxide canisters: hours of CO₂ removal for the whole crew. */
export const LIOH_H = 18;

/**
 * Fire. On Mir in February 1997 an oxygen candle burst into flames: the crew put masks on and
 * fought it with extinguishers for about fourteen minutes, in thick smoke. While a fire burns it
 * eats oxygen, fills the cabin with CO₂ and smoke, and damages what is around it; fighting it
 * takes a quarter of an hour, and closing the module and venting it to vacuum puts it out at
 * once, at the cost of the module's air.
 */
export const FIRE = {
  /** Share of the module's function the fire destroys per hour while nobody fights it. */
  scorchPerH: 0.3,
  /** Oxygen burnt, kg/h, and CO₂ released into the cabin, kg/h. */
  o2KgH: 1.5,
  co2KgH: 1.2,
  /** Health lost per hour by everyone breathing through masks in the smoke. */
  smokeHealthH: 2,
  extinguishH: 0.25,
  autoExtinguishH: 0.6,
  /** Air (as oxygen to replace) thrown away when a module is vented to put the fire out, kg. */
  ventO2: 25,
} as const;

/**
 * Engineers on Earth need a while to read the telemetry and test a fix on their copy of the
 * hardware (as the Apollo 13 team did with the CO₂ filter adapter), h.
 */
export const CONTROL_ANALYSIS_H = 0.25;
/** A procedure tested on the ground makes the fix this much quicker. */
const CONTROL_SPEEDUP = 0.6;

/** Hours from asking Control to getting the answer: there and back at light speed, plus the analysis. */
export function controlRoundTripH(s: SimState): number {
  return (2 * (s.cfg.commsDelayMin ?? 0)) / 60 + CONTROL_ANALYSIS_H;
}

/** What Control would recommend right now. */
export function controlAdvice(s: SimState): EmergencyChoice {
  const e = s.emergency!;
  if (e.kind === 'eclss') return !s.flags.liohUsed && s.flows.co2MmHg > 4 ? 'backup' : 'repair';
  if (e.kind === 'fire') {
    const m = s.modules.find((x) => x.id === e.moduleId);
    return (m?.faults?.find((f) => f.kind === 'scorch')?.size ?? 0) > 0.45 ? 'vent' : 'extinguish';
  }
  // with little oxygen left, stop the loss at once; otherwise keep the module in use
  return s.flows.o2Days < 1.5 ? 'isolate' : 'patch';
}

/** Pressurised modules a puncture or a seal can open to vacuum. */
const PRESSURISED = new Set(['hab', 'lab', 'greenhouse', 'shelter']);

export interface PlannedEmergency {
  h: number;
  kind: EmergencyKind;
  fired: boolean;
}

/** Turn a mission's scripted emergencies into hours, reproducibly from the seed. */
export function planEmergencies(m: MissionDef, seed: number, solH: number): PlannedEmergency[] {
  const rng = new Rng(seed ^ 0xe3e7);
  return (m.emergencies ?? []).map((e) => ({ h: rng.range(e.sol[0], e.sol[1]) * solH, kind: e.kind, fired: false }));
}

const built = (m: ModuleState): boolean => m.built >= 1;

/** The module an emergency of this kind would strike, or null if there is none. */
function target(s: SimState, kind: EmergencyKind, rng: Rng): ModuleState | null {
  // without a regenerative system there is nothing to break: the lander's own scrubbers are simple and robust
  if (kind === 'eclss') return s.modules.find((m) => m.type === 'eclss' && built(m) && !m.down) ?? null;
  const shells = s.modules.filter((m) => built(m) && PRESSURISED.has(m.type));
  return shells.length ? rng.pick(shells) : null;
}

type Log = (s: SimState, key: string, sev: 'info' | 'good' | 'warn' | 'bad', params?: Record<string, string | number>, ref?: number) => void;

/** Start an emergency now. Returns false if one is already running or nothing can be struck. */
export function triggerEmergency(s: SimState, kind: EmergencyKind, rng: Rng, log: Log, module?: ModuleState): boolean {
  if (s.emergency) return false;
  const m = module ?? target(s, kind, rng);
  if (!m) return false;
  s.emergency = { kind, moduleId: m.id, startH: s.timeH, decideByH: s.timeH + DECIDE_H, choice: null, doneH: null, auto: false, o2Lost: 0 };
  s.stats.emergencies = (s.stats.emergencies ?? 0) + 1;
  if (kind === 'eclss') {
    // the scrubbers stop: CO₂ starts to climb at once (the lander's own scrubbers fail without
    // taking the whole lander out of service)
    if (m.type !== 'lander') {
      m.condition = Math.min(m.condition, TUNE.offlineAt - 1);
      m.down = true;
    }
  } else if (kind === 'meteor') {
    m.condition = Math.max(5, m.condition - 25);
  } else if (kind === 'fire') {
    addFault(s, m, 'scorch', 0.05, 'fire', rng);
    recordFire(s, m);
  }
  log(s, `log.emg.${kind}`, 'bad', { type: m.type }, m.id);
  return true;
}

/** Which answers make sense right now. */
export function emergencyOptions(s: SimState): EmergencyChoice[] {
  const e = s.emergency;
  if (!e || e.choice) return [];
  if (e.kind === 'eclss') return s.flags.liohUsed ? ['repair'] : ['repair', 'backup'];
  if (e.kind === 'fire') return ['extinguish', 'vent'];
  return ['isolate', 'patch'];
}

/** Ask Control for help. Needs a working antenna, and only one question per emergency. */
export function askControl(s: SimState, log: Log): boolean {
  const e = s.emergency;
  if (!e || e.choice || e.askedH !== undefined) return false;
  if (!s.flows.comms) {
    log(s, 'log.control.nolink', 'warn');
    return false;
  }
  const c = s.cfg.conjunctionH;
  if (c && s.timeH >= c[0] && s.timeH < c[1]) {
    log(s, 'log.control.conjunction', 'warn');
    return false;
  }
  e.askedH = s.timeH;
  e.answerH = s.timeH + controlRoundTripH(s);
  s.stats.controlAsks = (s.stats.controlAsks ?? 0) + 1;
  log(s, 'log.control.asked', 'info', { min: Math.round(controlRoundTripH(s) * 60), d: (s.cfg.commsDelayMin ?? 0).toFixed(s.world === 'moon' ? 2 : 0) });
  return true;
}

/** The commander's answer. */
export function chooseEmergency(s: SimState, choice: EmergencyChoice, log: Log, auto = false): boolean {
  const e = s.emergency;
  if (!e || e.choice || !emergencyOptions(s).includes(choice)) return false;
  const m = s.modules.find((x) => x.id === e.moduleId);
  e.choice = choice;
  e.auto = auto;
  if (e.advice === choice) s.stats.controlFollowed = (s.stats.controlFollowed ?? 0) + 1;
  if (auto) s.stats.emergencyAuto = (s.stats.emergencyAuto ?? 0) + 1;
  if (choice === 'isolate') {
    // close the hatches: no more air lost, but the module is out of use until someone repairs it outside
    if (m) {
      m.condition = Math.min(m.condition, TUNE.offlineAt - 1);
      m.down = true;
    }
    finish(s, log);
  } else if (choice === 'patch') {
    e.doneH = s.timeH + PATCH_H[e.kind as 'leak' | 'meteor'] * (e.advice === 'patch' ? CONTROL_SPEEDUP : 1);
  } else if (choice === 'repair') {
    e.doneH = s.timeH + (auto ? AUTO_REPAIR_H : REPAIR_H) * (e.advice === 'repair' ? CONTROL_SPEEDUP : 1);
  } else if (choice === 'backup') {
    s.flags.liohUsed = 1;
    s.flags.liohUntilH = s.timeH + LIOH_H;
    e.doneH = s.timeH + LIOH_H;
  } else if (choice === 'extinguish') {
    e.doneH = s.timeH + (auto ? FIRE.autoExtinguishH : FIRE.extinguishH) * (e.advice === 'extinguish' ? CONTROL_SPEEDUP : 1);
  } else if (choice === 'vent') {
    // hatches shut and the module's air dumped to vacuum: the fire dies at once
    const lost = Math.min(s.stores.o2, FIRE.ventO2);
    s.stores.o2 -= lost;
    e.o2Lost += lost;
    if (m) {
      m.condition = Math.min(m.condition, TUNE.offlineAt - 1);
      m.down = true;
      if (m.type === 'greenhouse' && (m.growth > 0 || m.ripe)) {
        m.growth = 0;
        m.ripe = false;
        m.fallow = true;
        log(s, 'log.croplost', 'bad', { crop: m.crop }, m.id);
      }
    }
    log(s, `log.emg.chose.${choice}`, auto ? 'warn' : 'info', { type: m?.type ?? 'hab' }, e.moduleId);
    finish(s, log);
    return true;
  }
  log(s, `log.emg.chose.${choice}`, auto ? 'warn' : 'info', { type: m?.type ?? 'hab' }, e.moduleId);
  return true;
}

function finish(s: SimState, log: Log): void {
  const e = s.emergency!;
  s.stats.emergencyO2Lost = (s.stats.emergencyO2Lost ?? 0) + e.o2Lost;
  log(s, 'log.emg.over', 'good', { kg: e.o2Lost.toFixed(0) }, e.moduleId);
  s.emergency = null;
}

/** The CO₂ scrubber loop is stopped by a life-support emergency that has not been fixed yet. */
export function scrubbersFailed(s: SimState): boolean {
  return s.emergency?.kind === 'eclss';
}

/** CO₂ removal from the emergency canisters while they last, kg/day. */
export function liohScrub(s: SimState): number {
  return (s.flags.liohUntilH ?? 0) > s.timeH ? s.crew.length * HUMAN.co2KgDay * 1.3 : 0;
}

/**
 * Apollo 13's accident, on the surface: an oxygen tank bursts. Most of the stored oxygen is gone,
 * the fuel cells it fed die, and the scrubbers fail with the shock: power down, use the backup
 * canisters, repair, and make the rest last.
 */
function fireCrisis(s: SimState, kind: CrisisKind, rng: Rng, log: Log): void {
  if (kind === 'o2tank') {
    s.stores.o2 *= 0.35;
    for (const m of s.modules) {
      if (m.type === 'fuelcell' && built(m)) {
        m.condition = 5;
        m.down = true;
      }
    }
    s.stats.crises = (s.stats.crises ?? 0) + 1;
    log(s, 'log.crisis.o2tank', 'bad');
    if (s.emergency) return;
    const eclss = s.modules.find((m) => m.type === 'eclss' && built(m) && !m.down);
    triggerEmergency(s, 'eclss', rng, log, eclss ?? s.modules[0]);
  }
}

/** The commander grabs the extinguisher (the minigame's `quality`): a good job puts it out at once, with nobody hurt. */
export function playerExtinguish(s: SimState, quality: number, rng: Rng, log: Log): boolean {
  const e = s.emergency;
  if (!e || e.kind !== 'fire' || (e.choice && e.choice !== 'extinguish')) return false;
  if (!e.choice) chooseEmergency(s, 'extinguish', log);
  if (quality < 0.5) {
    // the fire is knocked down but not out: the crew finishes the job
    e.doneH = Math.min(e.doneH ?? s.timeH, s.timeH + FIRE.extinguishH * 0.5);
    return true;
  }
  e.doneH = s.timeH;
  s.flags.fireByHand = 1;
  updateEmergency(s, 0, rng, log);
  return true;
}

/** Advance the running emergency (and fire scripted or random ones). */
export function updateEmergency(s: SimState, dtH: number, rng: Rng, log: Log): void {
  for (const c of s.crisisPlan ?? []) {
    if (!c.fired && s.timeH >= c.h) {
      c.fired = true;
      fireCrisis(s, c.kind, rng, log);
    }
  }
  // scripted emergencies wait until there is something to strike, and until the last one is over
  for (const p of s.emergencyPlan ?? []) {
    if (!p.fired && s.timeH >= p.h && !s.emergency) {
      if (triggerEmergency(s, p.kind, rng, log)) p.fired = true;
      else p.h = s.timeH + 6;
    }
  }
  const e = s.emergency;
  if (!e) return;
  const m = s.modules.find((x) => x.id === e.moduleId);
  if (e.kind === 'leak' || e.kind === 'meteor') {
    const rate = LEAK_O2_KGH[e.kind] * (e.choice === 'patch' ? PATCH_LEAK : e.choice ? 0 : 1);
    const lost = Math.min(s.stores.o2, rate * dtH);
    s.stores.o2 -= lost;
    e.o2Lost += lost;
  } else if (e.kind === 'fire' && m) {
    // fought, it spreads more slowly; left alone, it eats the module
    const fought = e.choice === 'extinguish';
    const scorch = m.faults?.find((f) => f.kind === 'scorch');
    if (scorch) scorch.size = Math.min(0.85, scorch.size + FIRE.scorchPerH * (fought ? 0.35 : 1) * dtH);
    const burnt = Math.min(s.stores.o2, FIRE.o2KgH * dtH);
    s.stores.o2 -= burnt;
    e.o2Lost += burnt;
    s.cabin.co2Kg += FIRE.co2KgH * dtH;
    for (const c of s.crew) if (!(c.isPlayer && s.playerOutside)) c.health = Math.max(5, c.health - FIRE.smokeHealthH * dtH);
  }
  if (e.answerH !== undefined && !e.advice && s.timeH >= e.answerH) {
    e.advice = controlAdvice(s);
    s.stats.controlWaitH = (s.stats.controlWaitH ?? 0) + (e.answerH - (e.askedH ?? e.answerH));
    log(s, e.choice ? 'log.control.late' : 'log.control.answer', e.choice ? 'info' : 'good', { opt: `emg.opt.${e.advice}` }, e.moduleId);
  }
  if (!e.choice && s.timeH >= e.decideByH) chooseEmergency(s, e.kind === 'eclss' ? 'repair' : e.kind === 'fire' ? 'extinguish' : 'isolate', log, true);
  if (!s.emergency || e.doneH === null || s.timeH < e.doneH) return;
  if (m && e.choice === 'patch') m.condition = Math.max(TUNE.onlineAt + 1, m.condition - 8);
  if (m && e.choice === 'repair') {
    m.condition = Math.max(m.condition, 70);
    m.down = false;
  }
  if (m && e.choice === 'extinguish') {
    // smoke and burns: likelier the longer it burnt, and when nobody took charge
    const scorch = m.faults?.find((f) => f.kind === 'scorch')?.size ?? 0;
    const p = s.flags.fireByHand ? 0 : e.auto ? 0.7 : 0.15 + 0.6 * scorch;
    if (s.flags.fireByHand) s.flags.fireByHandDone = 1;
    if (rng.chance(p)) injure(s, scorch > 0.5 ? 'burn' : 'smoke', rng, log, s.playerOutside);
    delete s.flags.fireByHand;
    log(s, 'log.fire.out', 'good', { type: m.type, pct: Math.round(scorch * 100) }, m.id);
  }
  finish(s, log);
}
