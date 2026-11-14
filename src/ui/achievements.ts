import { customByCode, dailyMission, missionById, scoreMission, type DailyTwist } from '../sim/missions';
import type { SimState } from '../sim/types';
import { CHAPTERS, medals } from './campaign';
import { addStrings, t } from './strings';

/** Everything a game can check, mid-mission or at the end. */
export interface Progress {
  sim: SimState;
  /** Metres driven in the rover this mission. */
  driven: number;
  /** Longest rock throw this mission, m. */
  longestThrow: number;
  /** Mission over. */
  ended: boolean;
  /** Debrief questions answered right (null until the end). */
  quizRight: number | null;
  quizTotal: number;
}

interface Achievement {
  id: string;
  icon: string;
  test: (p: Progress) => boolean;
}

const success = (p: Progress, id?: string): boolean => p.ended && p.sim.outcome?.result === 'success' && (!id || p.sim.missionId === id);

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'firstSteps', icon: 'rocket', test: (p) => success(p, 'moon-first') },
  { id: 'galileo', icon: 'jump', test: (p) => !!p.sim.flags['exp.drop'] },
  { id: 'pitcher', icon: 'target', test: (p) => p.longestThrow >= 60 },
  { id: 'driver', icon: 'map', test: (p) => p.driven >= 1000 },
  { id: 'expedition', icon: 'star', test: (p) => !!p.sim.flags.expedition },
  { id: 'geologist', icon: 'science', test: (p) => p.sim.stats.samplesCollected >= 5 },
  { id: 'shelter', icon: 'shield', test: (p) => p.sim.stats.speHits > 0 && p.sim.stats.speSheltered === p.sim.stats.speHits && p.sim.crew.every((c) => c.doseSpe < 5) },
  { id: 'coolHead', icon: 'warn', test: (p) => (p.sim.stats.emergencies ?? 0) > 0 && (p.sim.stats.emergencyAuto ?? 0) === 0 && !p.sim.emergency },
  { id: 'farmer', icon: 'leaf', test: (p) => p.sim.stats.harvests >= 3 },
  { id: 'closedLoop', icon: 'water', test: (p) => p.ended && p.sim.stats.waterUsed > 0 && (p.sim.stats.waterRecycled + p.sim.stats.waterMined) / p.sim.stats.waterUsed > 0.85 },
  { id: 'fuel', icon: 'flame', test: (p) => !!p.sim.flags.fuelDone },
  { id: 'year1972', icon: 'rad', test: (p) => success(p, 'moon-1972') },
  { id: 'year2017', icon: 'rad', test: (p) => success(p, 'mars-2017') },
  { id: 'year2018', icon: 'wind', test: (p) => success(p, 'mars-2018') },
  { id: 'year1970', icon: 'o2', test: (p) => success(p, 'moon-1970') },
  { id: 'longHaul', icon: 'hab', test: (p) => success(p, 'mars-long') },
  { id: 'realGround', icon: 'earth', test: (p) => !!missionById(p.sim.missionId).realSite && p.sim.timeH > 24 },
  { id: 'daily', icon: 'sun', test: (p) => success(p) && p.sim.missionId.startsWith('daily-') },
  { id: 'perfect', icon: 'star', test: (p) => success(p) && scoreMission(p.sim).rank === 4 },
  { id: 'scholar', icon: 'book', test: (p) => p.quizRight !== null && p.quizTotal > 0 && p.quizRight === p.quizTotal },
  { id: 'programme', icon: 'rocket', test: () => CHAPTERS.every((id) => (medals()[id] ?? 0) > 0) },
  { id: 'goldProgramme', icon: 'star', test: () => CHAPTERS.every((id) => medals()[id] === 3) },
];

const KEY = 'helios-achievements';
const DAILY_KEY = 'helios-daily';

export function unlocked(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Check every achievement; returns the ids unlocked just now. */
export function check(p: Progress): string[] {
  const have = unlocked();
  const fresh = ACHIEVEMENTS.filter((a) => !have[a.id] && a.test(p)).map((a) => a.id);
  if (!fresh.length) return fresh;
  for (const id of fresh) have[id] = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(have));
  } catch {
    /* storage unavailable: the toast still shows */
  }
  return fresh;
}

/** Best score for each daily code played on this computer. */
export function dailyBest(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(DAILY_KEY) ?? '{}');
    return v && typeof v === 'object' ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Record a daily result; returns the best score for that code (including this one). */
export function recordDaily(code: string, score: number): number {
  const all = dailyBest();
  all[code] = Math.max(all[code] ?? 0, Math.round(score));
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  return all[code];
}

const TWIST_TEXT: Record<DailyTwist, [string, string]> = {
  extraSpe: ['dos tormentas solares', 'two solar storms'],
  tightDose: ['límite de dosis estricto', 'a strict dose limit'],
  extraEmg: ['dos emergencias', 'two emergencies'],
  noResupply: ['sin reabastecimiento', 'no resupply'],
  bigFuel: ['mucho combustible que fabricar', 'a lot of fuel to make'],
};

/** Give a teacher's mission its name, site line and a briefing that lists what was chosen. */
function ensureCustomStrings(id: string): void {
  const m = customByCode(id.slice(7));
  const c = m?.custom;
  if (!m || !c) return;
  const code = id.slice(7);
  const moon = c.world === 'moon';
  const cls = (['', 'menor', 'moderada', 'severa'] as const)[c.speClass];
  const clsEn = (['', 'minor', 'moderate', 'severe'] as const)[c.speClass];
  const es: string[] = [`${c.days} ${moon ? 'días' : 'soles'}`, `${c.crew} ${c.crew === 1 ? 'persona' : 'personas'}`];
  const en: string[] = [`${c.days} ${moon ? 'days' : 'sols'}`, `crew of ${c.crew}`];
  const n = (k: number, one: string, many: string): string => `${k} ${k === 1 ? one : many}`;
  es.push(c.spe ? `${n(c.spe, 'tormenta solar', 'tormentas solares')} (${cls})` : 'sin tormentas solares');
  en.push(c.spe ? `${n(c.spe, 'solar storm', 'solar storms')} (${clsEn})` : 'no solar storms');
  if (!moon && c.storms) {
    es.push(n(c.storms, 'tormenta de polvo', 'tormentas de polvo'));
    en.push(n(c.storms, 'dust storm', 'dust storms'));
  }
  es.push(c.emergencies ? n(c.emergencies, 'emergencia', 'emergencias') : 'sin emergencias');
  en.push(c.emergencies ? n(c.emergencies, 'emergency', 'emergencies') : 'no emergencies');
  if (!moon) {
    es.push(`radio con ${m.commsDelayMin} min de retraso`);
    en.push(`${m.commsDelayMin}-minute radio delay`);
  }
  if (c.fuelKg) {
    es.push(`${c.fuelKg} kg de combustible que fabricar`);
    en.push(`${c.fuelKg} kg of fuel to make`);
  }
  es.push(c.resupply ? n(c.resupply, 'reabastecimiento', 'reabastecimientos') : 'sin reabastecimiento');
  en.push(c.resupply ? n(c.resupply, 'resupply', 'resupplies') : 'no resupply');
  if (c.terrain) {
    const where = t(`edit.terrain.${c.world}.${c.terrain}`);
    es.push(`terreno real de la NASA (${where})`);
    en.push(`real NASA terrain (${where})`);
  }
  addStrings({
    [`mission.${id}.name`]: ['Misión del docente', "Teacher's mission"],
    [`mission.${id}.site`]: [`${moon ? 'Luna' : 'Marte'} · código ${code}`, `${moon ? 'Moon' : 'Mars'} · code ${code}`],
    [`mission.${id}.brief`]: [
      `${es.join(' · ')}. Objetivo: ${c.scienceGoal} puntos de ciencia sin pasar de ${c.doseLimitMsv} mSv.`,
      `${en.join(' · ')}. Goal: ${c.scienceGoal} science points without going over ${c.doseLimitMsv} mSv.`,
    ],
  });
}

/** Give a daily challenge or a teacher's mission its name, site line and briefing in both languages. */
export function ensureMissionStrings(id: string): void {
  if (id.startsWith('custom-')) return ensureCustomStrings(id);
  if (!id.startsWith('daily-')) return;
  const code = id.slice(6);
  const m = dailyMission(code);
  const date = `${code.slice(6, 8)}/${code.slice(4, 6)}/${code.slice(0, 4)}`;
  const moon = m.world === 'moon';
  const tw = (i: 0 | 1): string => m.twists.map((x) => TWIST_TEXT[x][i]).join(' + ');
  addStrings({
    [`mission.${id}.name`]: [`Reto del día · ${date}`, `Daily challenge · ${date}`],
    [`mission.${id}.site`]: [`${moon ? 'Luna' : 'Marte'} · código ${code}`, `${moon ? 'Moon' : 'Mars'} · code ${code}`],
    [`mission.${id}.brief`]: [
      `${m.durationSols} ${moon ? 'días' : 'soles'} con ${tw(0)}. Quien juegue con el código ${code} tendrá exactamente los mismos sucesos: comparad la puntuación.`,
      `${m.durationSols} ${moon ? 'days' : 'sols'} with ${tw(1)}. Anyone who plays code ${code} gets exactly the same events: compare your scores.`,
    ],
  });
}
