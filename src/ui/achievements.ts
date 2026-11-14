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
  { id: 'year1973', icon: 'warn', test: (p) => success(p, 'moon-1973') },
  { id: 'year2013', icon: 'star', test: (p) => success(p, 'moon-2013') },
  { id: 'year1997', icon: 'flame', test: (p) => success(p, 'mars-1997') },
  { id: 'handy', icon: 'gear', test: (p) => (p.sim.stats.tasksByPlayer ?? 0) + (p.sim.stats.faultsByPlayer ?? 0) >= 10 },
  { id: 'firefighter', icon: 'flame', test: (p) => !!p.sim.flags.fireByHandDone },
  { id: 'controlFan', icon: 'antenna', test: (p) => (p.sim.stats.requestsDone ?? 0) >= 4 },
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
  // the demo plays itself: nothing it does counts for the player
  if (p.sim.missionId === 'demo-moon') return [];
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

type Four = [string, string, string, string];
const TWIST_TEXT: Record<DailyTwist, Four> = {
  extraSpe: ['dos tormentas solares', 'two solar storms', 'duas tempestades solares', 'deux tempêtes solaires'],
  tightDose: ['límite de dosis estricto', 'a strict dose limit', 'limite de dose rigoroso', 'une limite de dose stricte'],
  extraEmg: ['dos emergencias', 'two emergencies', 'duas emergências', 'deux urgences'],
  noResupply: ['sin reabastecimiento', 'no resupply', 'sem reabastecimento', 'sans ravitaillement'],
  bigFuel: ['mucho combustible que fabricar', 'a lot of fuel to make', 'muito combustível para produzir', 'beaucoup de carburant à produire'],
};

/** Give a teacher's mission its name, site line and a briefing that lists what was chosen. */
function ensureCustomStrings(id: string): void {
  const m = customByCode(id.slice(7));
  const c = m?.custom;
  if (!m || !c) return;
  const code = id.slice(7);
  const moon = c.world === 'moon';
  const parts: Four[] = [];
  const add = (es: string, en: string, pt: string, fr: string): void => void parts.push([es, en, pt, fr]);
  const n = (k: number, one: Four, many: Four): Four => [0, 1, 2, 3].map((i) => `${k} ${k === 1 ? one[i] : many[i]}`) as Four;
  const push = (f: Four): void => void parts.push(f);
  const cls = (['', 'menor|minor|fraca|faible', 'moderada|moderate|moderada|modérée', 'severa|severe|severa|forte'] as const)[c.speClass].split('|');
  add(`${c.days} ${moon ? 'días' : 'soles'}`, `${c.days} ${moon ? 'days' : 'sols'}`, `${c.days} ${moon ? 'dias' : 'sóis'}`, `${c.days} ${moon ? 'jours' : 'sols'}`);
  push(n(c.crew, ['persona', 'crew member', 'tripulante', 'astronaute'], ['personas', 'crew', 'tripulantes', 'astronautes']));
  if (c.spe) {
    const f = n(c.spe, ['tormenta solar', 'solar storm', 'tempestade solar', 'tempête solaire'], ['tormentas solares', 'solar storms', 'tempestades solares', 'tempêtes solaires']);
    push(f.map((x, i) => `${x} (${cls[i]})`) as Four);
  } else add('sin tormentas solares', 'no solar storms', 'sem tempestades solares', 'sans tempête solaire');
  if (!moon && c.storms) push(n(c.storms, ['tormenta de polvo', 'dust storm', 'tempestade de poeira', 'tempête de poussière'], ['tormentas de polvo', 'dust storms', 'tempestades de poeira', 'tempêtes de poussière']));
  if (c.emergencies) push(n(c.emergencies, ['emergencia', 'emergency', 'emergência', 'urgence'], ['emergencias', 'emergencies', 'emergências', 'urgences']));
  else add('sin emergencias', 'no emergencies', 'sem emergências', 'sans urgence');
  if (!moon) add(`radio con ${m.commsDelayMin} min de retraso`, `${m.commsDelayMin}-minute radio delay`, `rádio com ${m.commsDelayMin} min de atraso`, `radio avec ${m.commsDelayMin} min de délai`);
  if (!moon && c.conjunction && c.days >= 20) add('dos semanas de conjunción solar', 'a two-week solar conjunction', 'duas semanas de conjunção solar', 'deux semaines de conjonction solaire');
  if (c.fuelKg) add(`${c.fuelKg} kg de combustible que fabricar`, `${c.fuelKg} kg of fuel to make`, `${c.fuelKg} kg de combustível para produzir`, `${c.fuelKg} kg de carburant à produire`);
  if (c.resupply) push(n(c.resupply, ['reabastecimiento', 'resupply', 'reabastecimento', 'ravitaillement'], ['reabastecimientos', 'resupplies', 'reabastecimentos', 'ravitaillements']));
  else add('sin reabastecimiento', 'no resupply', 'sem reabastecimento', 'sans ravitaillement');
  if (c.terrain) {
    const where = t(`edit.terrain.${c.world}.${c.terrain}`);
    add(`terreno real de la NASA (${where})`, `real NASA terrain (${where})`, `terreno real da NASA (${where})`, `terrain réel de la NASA (${where})`);
  }
  const j = (i: number): string => parts.map((p) => p[i]).join(' · ');
  addStrings({
    [`mission.${id}.name`]: ['Misión del docente', "Teacher's mission", 'Missão do professor', "Mission de l'enseignant"],
    [`mission.${id}.site`]: [`${moon ? 'Luna' : 'Marte'} · código ${code}`, `${moon ? 'Moon' : 'Mars'} · code ${code}`, `${moon ? 'Lua' : 'Marte'} · código ${code}`, `${moon ? 'Lune' : 'Mars'} · code ${code}`],
    [`mission.${id}.brief`]: [
      `${j(0)}. Objetivo: ${c.scienceGoal} puntos de ciencia sin pasar de ${c.doseLimitMsv} mSv.`,
      `${j(1)}. Goal: ${c.scienceGoal} science points without going over ${c.doseLimitMsv} mSv.`,
      `${j(2)}. Meta: ${c.scienceGoal} pontos de ciência sem passar de ${c.doseLimitMsv} mSv.`,
      `${j(3)}. Objectif : ${c.scienceGoal} points de science sans dépasser ${c.doseLimitMsv} mSv.`,
    ],
  });
}

/** Give a daily challenge or a teacher's mission its name, site line and briefing in every language. */
export function ensureMissionStrings(id: string): void {
  if (id.startsWith('custom-')) return ensureCustomStrings(id);
  if (!id.startsWith('daily-')) return;
  const code = id.slice(6);
  const m = dailyMission(code);
  const date = `${code.slice(6, 8)}/${code.slice(4, 6)}/${code.slice(0, 4)}`;
  const moon = m.world === 'moon';
  const tw = (i: number): string => m.twists.map((x) => TWIST_TEXT[x][i]).join(' + ');
  addStrings({
    [`mission.${id}.name`]: [`Reto del día · ${date}`, `Daily challenge · ${date}`, `Desafio do dia · ${date}`, `Défi du jour · ${date}`],
    [`mission.${id}.site`]: [`${moon ? 'Luna' : 'Marte'} · código ${code}`, `${moon ? 'Moon' : 'Mars'} · code ${code}`, `${moon ? 'Lua' : 'Marte'} · código ${code}`, `${moon ? 'Lune' : 'Mars'} · code ${code}`],
    [`mission.${id}.brief`]: [
      `${m.durationSols} ${moon ? 'días' : 'soles'}: ${tw(0)}. Quien juegue con el código ${code} tendrá exactamente los mismos sucesos: comparad la puntuación.`,
      `${m.durationSols} ${moon ? 'days' : 'sols'}: ${tw(1)}. Anyone who plays code ${code} gets exactly the same events: compare your scores.`,
      `${m.durationSols} ${moon ? 'dias' : 'sóis'}: ${tw(2)}. Quem jogar com o código ${code} terá exatamente os mesmos eventos: comparem a pontuação.`,
      `${m.durationSols} ${moon ? 'jours' : 'sols'} : ${tw(3)}. Tous ceux qui jouent le code ${code} ont exactement les mêmes événements : comparez vos scores.`,
    ],
  });
}
