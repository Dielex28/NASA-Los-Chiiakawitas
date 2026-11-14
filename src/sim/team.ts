import type { SimState, Stats } from './types';

/**
 * Team mode: a group of students shares one computer and one base. Each student looks after
 * a station for the whole mission, and the seat at the controls rotates every shift. At every
 * change of shift the game stops, shows how each station did and sets the next goals, so the
 * whole group has to talk: the one at the keyboard acts, the others watch their area and advise.
 */
export type Station = 'power' | 'life' | 'health' | 'science' | 'repairs';
export const STATIONS: Station[] = ['power', 'life', 'health', 'science', 'repairs'];

export interface TeamMember {
  name: string;
  stations: Station[];
  /** Shifts this student spent at the controls. */
  shifts: number;
  /** Station goals met and set over the mission (including "command" while at the controls). */
  met: number;
  set: number;
}

export interface ShiftGoal {
  station: Station | 'command';
  /** Index into members of who answers for it. */
  member: number;
  key: string;
  params?: Record<string, string | number>;
  met?: boolean;
}

/** What a shift is judged against: the stats when it started. */
interface Snapshot {
  blackoutH: number;
  hypoxiaH: number;
  thirstH: number;
  hungerH: number;
  co2HighH: number;
  coldH: number;
  emergencyAuto: number;
  science: number;
  speDose: number;
  failures: number;
}

export interface TeamState {
  members: TeamMember[];
  /** Hours per shift. */
  shiftH: number;
  /** Shift number (from 1) and when it started and ends. */
  shift: number;
  startH: number;
  endH: number;
  /** Member at the controls. */
  pilot: number;
  goals: ShiftGoal[];
  snap: Snapshot;
  /** Results of every finished shift, oldest first. */
  history: Array<{ shift: number; pilot: number; goals: ShiftGoal[] }>;
  /** The game is waiting for the group to start the next shift. */
  handover: boolean;
}

/** Spread the stations over the group, so that everybody has at least one. */
export function assignStations(n: number): Station[][] {
  const out: Station[][] = Array.from({ length: n }, () => []);
  STATIONS.forEach((st, i) => out[i % n].push(st));
  return out;
}

const speDose = (s: SimState): number => s.crew.reduce((a, c) => a + c.doseSpe, 0);
const snapshot = (s: SimState): Snapshot => {
  const st: Stats = s.stats;
  return {
    blackoutH: st.blackoutH,
    hypoxiaH: st.hypoxiaH,
    thirstH: st.thirstH,
    hungerH: st.hungerH,
    co2HighH: st.co2HighH,
    coldH: st.coldH,
    emergencyAuto: st.emergencyAuto ?? 0,
    science: s.science,
    speDose: speDose(s),
    failures: st.failures,
  };
};

/** Science a shift should bring in to keep the mission on schedule. */
function scienceTarget(s: SimState, shiftH: number): number {
  if (s.cfg.endless) return 3;
  const left = Math.max(0, s.cfg.scienceGoal - s.science);
  const hoursLeft = Math.max(shiftH, s.cfg.durationH - s.timeH);
  return Math.max(1, Math.ceil((left * shiftH) / hoursLeft));
}

function goalsFor(s: SimState, team: TeamState): ShiftGoal[] {
  const owner = (st: Station): number => team.members.findIndex((m) => m.stations.includes(st));
  return [
    { station: 'command', member: team.pilot, key: 'command' },
    { station: 'power', member: owner('power'), key: 'power' },
    { station: 'life', member: owner('life'), key: 'life' },
    { station: 'health', member: owner('health'), key: 'health' },
    { station: 'science', member: owner('science'), key: 'science', params: { n: scienceTarget(s, team.shiftH) } },
    { station: 'repairs', member: owner('repairs'), key: 'repairs' },
  ];
}

/** Start team mode at the beginning of a mission. */
export function createTeam(s: SimState, names: string[], shiftH: number): TeamState {
  const clean = names.map((n) => n.trim()).filter(Boolean).slice(0, STATIONS.length);
  const stations = assignStations(clean.length);
  const team: TeamState = {
    members: clean.map((name, i) => ({ name, stations: stations[i], shifts: i === 0 ? 1 : 0, met: 0, set: 0 })),
    shiftH,
    shift: 1,
    startH: s.timeH,
    endH: s.timeH + shiftH,
    pilot: 0,
    goals: [],
    snap: snapshot(s),
    history: [],
    handover: false,
  };
  team.goals = goalsFor(s, team);
  s.team = team;
  return team;
}

/** Judge one goal at the end of a shift. */
function judge(s: SimState, g: ShiftGoal, snap: Snapshot): boolean {
  const st = s.stats;
  const f = s.flows;
  switch (g.key) {
    case 'command':
      // no emergency left for the crew to sort out alone, and nobody badly hurt
      return (st.emergencyAuto ?? 0) === snap.emergencyAuto && s.crew.every((c) => c.health >= 50);
    case 'power':
      return st.blackoutH - snap.blackoutH < 0.05 && (s.power.capacityKwh <= 0 || s.power.storedKwh / s.power.capacityKwh >= 0.25);
    case 'life':
      return st.hypoxiaH === snap.hypoxiaH && st.thirstH === snap.thirstH && st.hungerH === snap.hungerH && f.o2Days >= 3 && f.waterDays >= 3;
    case 'health':
      return st.co2HighH - snap.co2HighH < 0.05 && st.coldH - snap.coldH < 0.05 && speDose(s) - snap.speDose < 2 * s.crew.length;
    case 'science':
      return s.science - snap.science >= Number(g.params?.n ?? 1);
    case 'repairs':
      return !s.modules.some((m) => m.built >= 1 && m.down && m.type !== 'lander');
    default:
      return false;
  }
}

/** True when the current shift is over and the group should hand over (call every frame). */
export function shiftDue(s: SimState): boolean {
  const team = s.team;
  if (!team || team.handover || s.outcome) return false;
  if (s.timeH < team.endH) return false;
  judgeShift(s, team);
  advance(s, team);
  team.handover = true;
  return true;
}

/** Judge the shift that just ended and add it to the history. */
function judgeShift(s: SimState, team: TeamState): void {
  for (const g of team.goals) {
    g.met = judge(s, g, team.snap);
    const m = team.members[g.member];
    if (m) {
      m.set++;
      if (g.met) m.met++;
    }
  }
  team.history.push({ shift: team.shift, pilot: team.pilot, goals: team.goals.map((g) => ({ ...g })) });
}

/** Set up the next shift: next student at the controls, new goals (the clock waits for the group). */
function advance(s: SimState, team: TeamState): void {
  team.shift++;
  team.pilot = (team.pilot + 1) % team.members.length;
  team.members[team.pilot].shifts++;
  team.startH = s.timeH;
  team.endH = s.timeH + team.shiftH;
  team.snap = snapshot(s);
  team.goals = goalsFor(s, team);
}

/** The group is ready: the clock runs again. */
export function startNextShift(s: SimState): void {
  if (s.team) s.team.handover = false;
}

/** Judge the last, unfinished shift when the mission ends, so it counts in the debrief. */
export function closeTeam(s: SimState): void {
  const team = s.team;
  if (!team || team.handover || s.timeH - team.startH < team.shiftH * 0.25) return;
  if (team.history.some((x) => x.shift === team.shift)) return;
  judgeShift(s, team);
}

/** Which station a message belongs to, so it can be addressed to the student who holds it. */
const BY_KEY: Array<[RegExp, Station | 'command']> = [
  [/^(log|tip)\.(blackout|brownout|powersave|batteryLow|nightComing|noStorage|noPower|stormSolar|shadedArray|dusty)/, 'power'],
  [/^(log|tip)\.(water|food|o2|dryRig|cropTooSlow|darkGreenhouse|croplost|harvest)/, 'life'],
  [/^(log|tip)\.(co2|cold|spe|shelter|evaRadiation|doseHigh|noShield|regolith|crowded|morale|reactorClose)/, 'health'],
  [/^(log|tip)\.(sample|experiment|expedition|samplesNoLab|fuel)/, 'science'],
  [/^(log|tip)\.(failure|repaired|offline|down|worn|meteor|buried|built|cargoWaiting)/, 'repairs'],
  [/^(log|tip)\.(emg|control|storm|resupply|noComms|abort)/, 'command'],
];

export function stationOf(key: string): Station | 'command' | null {
  for (const [re, st] of BY_KEY) if (re.test(key)) return st;
  return null;
}

/** The student a message is for: the station holder, or whoever is at the controls. */
export function addressee(team: TeamState, key: string): TeamMember | null {
  const st = stationOf(key);
  if (!st) return null;
  if (st === 'command') return team.members[team.pilot] ?? null;
  return team.members.find((m) => m.stations.includes(st)) ?? null;
}
