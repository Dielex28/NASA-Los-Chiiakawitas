import { Rng } from '../core/rng';
import { HUMAN, TUNE } from './catalog';
import type { MissionDef } from './missions';
import type { ModuleState, SimState } from './types';

export type EmergencyKind = 'leak' | 'meteor' | 'eclss';
export type EmergencyChoice = 'isolate' | 'patch' | 'repair' | 'backup';

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
    // the scrubbers stop: CO₂ starts to climb at once
    m.condition = Math.min(m.condition, TUNE.offlineAt - 1);
    m.down = true;
  } else if (kind === 'meteor') {
    m.condition = Math.max(5, m.condition - 25);
  }
  log(s, `log.emg.${kind}`, 'bad', { type: m.type }, m.id);
  return true;
}

/** Which answers make sense right now. */
export function emergencyOptions(s: SimState): EmergencyChoice[] {
  const e = s.emergency;
  if (!e || e.choice) return [];
  if (e.kind === 'eclss') return s.flags.liohUsed ? ['repair'] : ['repair', 'backup'];
  return ['isolate', 'patch'];
}

/** The commander's answer. */
export function chooseEmergency(s: SimState, choice: EmergencyChoice, log: Log, auto = false): boolean {
  const e = s.emergency;
  if (!e || e.choice || !emergencyOptions(s).includes(choice)) return false;
  const m = s.modules.find((x) => x.id === e.moduleId);
  e.choice = choice;
  e.auto = auto;
  if (auto) s.stats.emergencyAuto = (s.stats.emergencyAuto ?? 0) + 1;
  if (choice === 'isolate') {
    // close the hatches: no more air lost, but the module is out of use until someone repairs it outside
    if (m) {
      m.condition = Math.min(m.condition, TUNE.offlineAt - 1);
      m.down = true;
    }
    finish(s, log);
  } else if (choice === 'patch') {
    e.doneH = s.timeH + PATCH_H[e.kind as 'leak' | 'meteor'];
  } else if (choice === 'repair') {
    e.doneH = s.timeH + (auto ? AUTO_REPAIR_H : REPAIR_H);
  } else if (choice === 'backup') {
    s.flags.liohUsed = 1;
    s.flags.liohUntilH = s.timeH + LIOH_H;
    e.doneH = s.timeH + LIOH_H;
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

/** Advance the running emergency (and fire scripted or random ones). */
export function updateEmergency(s: SimState, dtH: number, rng: Rng, log: Log): void {
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
  }
  if (!e.choice && s.timeH >= e.decideByH) chooseEmergency(s, e.kind === 'eclss' ? 'repair' : 'isolate', log, true);
  if (!s.emergency || e.doneH === null || s.timeH < e.doneH) return;
  if (m && e.choice === 'patch') m.condition = Math.max(TUNE.onlineAt + 1, m.condition - 8);
  if (m && e.choice === 'repair') {
    m.condition = Math.max(m.condition, 70);
    m.down = false;
  }
  finish(s, log);
}
