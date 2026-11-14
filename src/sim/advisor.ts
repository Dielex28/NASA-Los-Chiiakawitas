import { CROPS, MODULES, TUNE } from './catalog';
import { isBuilt, isUp, totalDose } from './sim';
import { WORLDS } from './worlds';
import type { ModuleState, SimState } from './types';

export interface Advice {
  /** i18n key under `tip.` */
  key: string;
  params?: Record<string, string | number>;
  sev: 'info' | 'warn' | 'bad';
  /** Module to point the camera at, if any. */
  ref?: number;
  /** Higher = more urgent. */
  weight: number;
}

const count = (s: SimState, type: string, pred: (m: ModuleState) => boolean = () => true): number =>
  s.modules.reduce((n, m) => n + (m.type === type && pred(m) ? 1 : 0), 0);

/**
 * Mission-control style guidance: looks at the state of the outpost and returns
 * the things a flight director would bring up, most urgent first. The wording
 * lives in the UI strings; this only decides *what* is worth saying.
 */
export function advise(s: SimState): Advice[] {
  const out: Advice[] = [];
  const w = WORLDS[s.world];
  const f = s.flows;
  const p = s.power;
  const add = (key: string, sev: Advice['sev'], weight: number, params?: Advice['params'], ref?: number): void => {
    out.push({ key, sev, weight, params, ref });
  };

  // ---- space weather
  const spe = s.schedule.find((e) => e.kind === 'spe' && e.warned && !e.ended);
  if (spe && !s.shelterOrder) add('spe', 'bad', 100, { cls: spe.kind === 'spe' ? spe.cls : 1 });
  if (!spe && s.shelterOrder) add('shelterOver', 'info', 60);
  if (s.playerOutside && s.env.speMsvH > 0.2) add('evaRadiation', 'bad', 110);

  // ---- consumables
  if (f.o2Days < 4) add('o2Low', 'bad', 95, { days: f.o2Days.toFixed(1) });
  else if (f.o2Days < 9 && count(s, 'eclss') + count(s, 'moxie') === 0) add('o2Plan', 'warn', 50, { days: f.o2Days.toFixed(0) });
  if (f.waterDays < 4) add('waterLow', 'bad', 94, { days: f.waterDays.toFixed(1) });
  else if (f.waterDays < 10 && f.recycleFrac < 0.5) add('waterPlan', 'warn', 52, { days: f.waterDays.toFixed(0) });
  const left = s.cfg.endless ? 1e9 : (s.cfg.durationH - s.timeH) / 24;
  if (f.foodDays < 4) add('foodLow', 'bad', 90, { days: f.foodDays.toFixed(1) });
  else if (f.foodDays < left - 1 && f.foodDays < 25) add('foodPlan', 'warn', 45, { days: f.foodDays.toFixed(0) });
  if (f.co2MmHg > 6) add('co2High', 'bad', 96, { mm: f.co2MmHg.toFixed(1) });
  if (s.cabin.tempC < 12) add('cold', 'bad', 93, { c: s.cabin.tempC.toFixed(0) });

  // ---- power
  const generators = s.modules.filter((m) => (m.type === 'solar' || m.type === 'reactor') && isBuilt(m)).length;
  const pendingPower = s.modules.filter((m) => (m.type === 'solar' || m.type === 'reactor') && !isBuilt(m)).length;
  if (generators === 0 && pendingPower === 0 && s.timeH > 1) add('noPower', 'warn', 80);
  if (p.blackout) add('blackout', 'bad', 98);
  else if (p.shed > 0 && s.powerSave === 0) add('brownout', 'warn', 70, { n: p.shed });
  const draw = p.servedKw - p.genKw;
  if (draw > 0.2 && p.storedKwh > 4) {
    const hours = p.storedKwh / draw;
    if (hours < 14) add('batteryLow', hours < 5 ? 'bad' : 'warn', hours < 5 ? 92 : 72, { h: hours.toFixed(0) });
  }
  if (s.world === 'moon' && s.env.sunVisBase > 0.5 && generators > 0) {
    // warn before a long dark period if storage cannot carry the critical loads through it
    const dark = upcomingDarkness(s);
    if (dark && dark.inH < 60 && dark.durationH > 6) {
      const critical = Math.max(2, p.servedKw * 0.75);
      if (p.capacityKwh < critical * dark.durationH * 0.9) add('nightComing', 'warn', 75, { inH: dark.inH.toFixed(0), h: dark.durationH.toFixed(0) });
    }
  }
  if (s.world === 'mars' && generators > 0 && count(s, 'battery') + count(s, 'fuelcell') + count(s, 'reactor') === 0 && s.timeH > 6) add('noStorage', 'warn', 66);
  const storm = s.schedule.find((e) => e.kind === 'storm' && e.warned && !e.ended);
  if (storm && count(s, 'reactor', isBuilt) === 0) add('stormSolar', 'warn', 74);

  // ---- hardware
  for (const m of s.modules) {
    if (!isBuilt(m)) continue;
    if (m.down) add('down', 'bad', 85, { type: m.type }, m.id);
    else if (m.condition < 45 && m.type !== 'pylon') add('worn', 'warn', 40, { type: m.type, pct: m.condition.toFixed(0) }, m.id);
    if (m.type === 'solar' && m.dust > 0.25) add('dusty', 'warn', 55, { pct: (m.dust * 100).toFixed(0) }, m.id);
    if (m.type === 'solar' && m.horizon && s.world === 'moon') {
      const lit = litFraction(s, m);
      if (lit < 0.55) add('shadedArray', 'warn', 42, { pct: (lit * 100).toFixed(0) }, m.id);
    }
    if (m.type === 'icerig' && m.richness < 0.08) add('dryRig', 'warn', 48, undefined, m.id);
    if (m.type === 'greenhouse' && isUp(m) && m.mode !== 'full') add('darkGreenhouse', 'warn', 58, undefined, m.id);
    if (m.type === 'greenhouse' && !s.cfg.endless) {
      const solsLeft = (s.cfg.durationH - s.timeH) / w.solH;
      const need = CROPS[m.crop].cycleSols * (1 - m.growth);
      if (need > solsLeft + 1 && m.growth < 0.9) add('cropTooSlow', 'info', 30, { crop: m.crop }, m.id);
    }
    if (m.type === 'reactor') {
      for (const h of s.modules) {
        if (h.type !== 'hab' && h.type !== 'lander') continue;
        const d = Math.hypot(h.x - m.x, h.z - m.z);
        if (d < TUNE.reactorSafeM && (h.type === 'hab' || count(s, 'hab') === 0)) add('reactorClose', 'warn', 62, { m: d.toFixed(0) }, m.id);
      }
    }
  }

  // ---- crew
  const n = s.crew.length;
  if (n > f.crewCapacity && s.timeH > 2) add('crowded', 'warn', 44);
  const morale = s.crew.reduce((a, c) => a + c.morale, 0) / Math.max(1, n);
  if (morale < 40) add('morale', 'warn', 54, { pct: morale.toFixed(0) });
  const dose = s.crew.reduce((a, c) => Math.max(a, totalDose(c)), 0);
  if (dose > s.cfg.doseLimitMsv * 0.8) add('doseHigh', 'warn', 64, { msv: dose.toFixed(0), limit: s.cfg.doseLimitMsv });
  if (!f.comms && s.timeH > 12) add('noComms', 'info', 35);

  // ---- planning nudges
  const idle = Object.entries(s.inventory).filter(([, v]) => (v ?? 0) > 0);
  if (idle.length && s.timeH > 3) add('cargoWaiting', 'info', 38, { n: idle.reduce((a, [, v]) => a + (v ?? 0), 0) });
  const hab = s.modules.find((m) => m.type === 'hab' && isBuilt(m));
  if (hab && hab.regolith < 40 && count(s, 'rassor', isBuilt) > 0 === false && s.timeH > 48) add('noShield', 'info', 28);
  if (s.samples >= 1 && count(s, 'lab', isBuilt) === 0) add('samplesNoLab', 'info', 26);
  if (!s.cfg.endless && !s.flags.expedition && s.timeH > 30 && !s.playerOutside && !spe) add('expedition', 'info', 22);
  const win = s.resupply.find((r) => !r.locked && !r.delivered);
  if (win && win.cutoffH - s.timeH < 36 && Object.keys(win.manifest).length === 0) add('resupply', 'warn', 68, { h: Math.max(0, win.cutoffH - s.timeH).toFixed(0) });

  out.sort((a, b) => b.weight - a.weight);
  return out;
}

/** Fraction of the coming month an array will be sunlit, from its horizon mask. */
function litFraction(s: SimState, m: ModuleState): number {
  if (!m.horizon) return 1;
  let lit = 0;
  const n = m.horizon.length;
  for (let i = 0; i < n; i++) if (m.horizon[i] < 0.06) lit++;
  return lit / n;
}

/** Next dark period at the base within the coming five days (lunar site). */
export function upcomingDarkness(s: SimState): { inH: number; durationH: number } | null {
  const mask = s.modules[0]?.horizon;
  if (!mask) return null;
  const n = mask.length;
  // the Sun sweeps the azimuth bins at a constant rate
  const hoursPerBin = 708.7 / n;
  const startBin = (s.env.sunAz / (Math.PI * 2)) * n;
  let begin = -1;
  for (let k = 0; k < n * 0.25; k++) {
    const b = Math.floor(startBin + k) % n;
    const blocked = mask[b] > s.env.sunEl - 0.004;
    if (blocked && begin < 0) begin = k;
    if (!blocked && begin >= 0) return { inH: begin * hoursPerBin, durationH: (k - begin) * hoursPerBin };
  }
  return begin >= 0 ? { inH: begin * hoursPerBin, durationH: (n * 0.25 - begin) * hoursPerBin } : null;
}

/** Lessons for the debrief, derived from what actually happened. Keys under `lesson.`. */
export function lessons(s: SimState): Array<{ key: string; good: boolean; params?: Record<string, string | number> }> {
  const out: Array<{ key: string; good: boolean; params?: Record<string, string | number> }> = [];
  const st = s.stats;
  const add = (key: string, good: boolean, params?: Record<string, string | number>): void => {
    out.push({ key, good, params });
  };
  if (st.blackoutH > 2) add('blackout', false, { h: st.blackoutH.toFixed(0) });
  else if (s.timeH > 48) add('powerOk', true);
  if (st.energyGenKwh > 0 && st.energyCurtailedKwh / st.energyGenKwh > 0.45) add('curtailed', false, { pct: ((100 * st.energyCurtailedKwh) / st.energyGenKwh).toFixed(0) });
  if (st.energyNuclearKwh > st.energySolarKwh && s.world === 'mars') add('nuclearMars', true);
  if (st.hypoxiaH > 0) add('hypoxia', false);
  if (st.co2HighH > 1) add('co2', false, { mm: st.maxCo2.toFixed(0) });
  if (st.thirstH > 0) add('thirst', false);
  if (st.hungerH > 0) add('hunger', false);
  if (st.coldH > 2) add('cold', false, { c: st.minCabinC.toFixed(0) });
  if (st.waterUsed > 0) {
    const frac = (st.waterRecycled + st.waterMined) / st.waterUsed;
    if (frac > 0.7) add('closedLoop', true, { pct: (frac * 100).toFixed(0) });
    else if (s.timeH > 24 * 20) add('openLoop', false, { kg: (st.waterUsed - st.waterRecycled).toFixed(0) });
  }
  if (st.waterMined > 20) add('isru', true, { kg: st.waterMined.toFixed(0) });
  if (st.harvests > 0) add('harvest', true, { n: st.harvests, r: st.foodGrown.toFixed(0) });
  const gh = s.modules.find((m) => m.type === 'greenhouse');
  if (gh && st.harvests === 0) add('noHarvest', false);
  const spe = s.crew.reduce((a, c) => Math.max(a, c.doseSpe), 0);
  const gcr = s.crew.reduce((a, c) => Math.max(a, c.doseGcr), 0);
  if (st.speHits > 0 && spe < 15) add('sheltered', true, { msv: spe.toFixed(0) });
  if (spe > 40) add('speDose', false, { msv: spe.toFixed(0) });
  const hab = s.modules.find((m) => m.type === 'hab');
  if (hab && hab.regolith > 100) add('regolith', true, { g: hab.regolith.toFixed(0) });
  else if (gcr > 20 && s.timeH > 24 * 15) add('gcr', false, { msv: gcr.toFixed(0) });
  if (s.crew.some((c) => c.doseReactor > 2)) add('reactor', false);
  if (st.failures > 3 && st.repairsByPlayer === 0) add('maintenance', false, { n: st.failures });
  if (st.samplesCollected >= 3) add('fieldwork', true, { n: st.samplesCollected });
  const morale = st.moraleN > 0 ? st.moraleSum / st.moraleN : 60;
  if (morale > 74) add('morale', true);
  else if (morale < 50) add('lowMorale', false);
  void MODULES;
  return out;
}
