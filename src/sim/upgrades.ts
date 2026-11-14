import { Rng } from '../core/rng';
import { WORLDS } from './worlds';
import type { SimState, WorldId } from './types';

/**
 * Technologies Control can send up the next time the base reaches a science milestone: each
 * is a real piece of hardware being flown or tested today. The crew picks one of three.
 */
export type UpgradeId =
  | 'triplejunction'
  | 'water98'
  | 'waterwall'
  | 'printer'
  | 'suit'
  | 'led'
  | 'camras'
  | 'dustshield'
  | 'seismic'
  | 'whipple'
  | 'cellguard'
  | 'wheels';

export const UPGRADES: Array<{ id: UpgradeId; worlds?: WorldId[] }> = [
  { id: 'triplejunction' },
  { id: 'water98' },
  { id: 'waterwall' },
  { id: 'printer' },
  { id: 'suit' },
  { id: 'led' },
  { id: 'camras' },
  { id: 'dustshield', worlds: ['mars'] },
  { id: 'seismic' },
  { id: 'whipple', worlds: ['moon'] },
  { id: 'cellguard' },
  { id: 'wheels' },
];

/** Solar output with triple-junction cells (about 30 % efficient instead of about 22 %). */
export const TRIPLE_JUNCTION = 1.25;
/** Water recovered with the Brine Processor Assembly (the ISS reached 98 % in 2023). */
export const WATER98 = 0.98;
/** Extra shielding round the bunks from water walls, g/cm². */
export const WATER_WALL_GCM2 = 15;
/** Sols between spare parts printed from recycled plastic (the ISS Refabricator, 2019). */
export const PRINTER_SOLS = 2;
/** Suit consumables last this much longer with the xEMU's backpack. */
export const SUIT_GAIN = 1.25;
/** Greenhouse lighting power with tuned red and blue LEDs. */
export const LED_POWER = 0.75;
/** CO₂ removal with the amine swing beds flown on Orion (CAMRAS). */
export const CAMRAS = 1.2;
/** Dust settling on arrays with an electrodynamic dust shield (it worked on the Moon in 2025). */
export const DUST_SHIELD = 0.4;

export const hasUpgrade = (s: SimState, id: UpgradeId): boolean => !!s.upgrades?.includes(id);

/** Science milestones, as fractions of the goal (endless play: every 40 points). */
const MILESTONES = [0.25, 0.5, 0.75];

/** Check the milestones and put a choice of three on the table when one is reached. */
export function updateUpgrades(s: SimState, log: (s: SimState, key: string, sev: 'info' | 'good' | 'warn' | 'bad', params?: Record<string, string | number>) => void): void {
  const goal = s.cfg.scienceGoal;
  const reached = goal > 0 ? MILESTONES.filter((f) => s.science >= f * goal).length : Math.floor(s.science / 40);
  const given = s.flags.upgradeMilestones ?? 0;
  if (reached <= given) return;
  s.flags.upgradeMilestones = reached;
  s.flags.upgradeQueue = (s.flags.upgradeQueue ?? 0) + (reached - given);
  if (!s.upgradeOffer) offer(s, log);
}

function offer(s: SimState, log: (s: SimState, key: string, sev: 'info' | 'good' | 'warn' | 'bad', params?: Record<string, string | number>) => void): void {
  if ((s.flags.upgradeQueue ?? 0) <= 0) return;
  const pool = UPGRADES.filter((u) => (!u.worlds || u.worlds.includes(s.world)) && !s.upgrades?.includes(u.id)).map((u) => u.id);
  if (pool.length === 0) {
    s.flags.upgradeQueue = 0;
    return;
  }
  const rng = new Rng((s.seed ^ 0x09c4) + (s.upgrades?.length ?? 0) * 7919);
  const pick: UpgradeId[] = [];
  while (pick.length < Math.min(3, pool.length)) {
    const id = pool[Math.floor(rng.next() * pool.length)];
    if (!pick.includes(id)) pick.push(id);
  }
  s.upgradeOffer = pick;
  s.flags.upgradeQueue = (s.flags.upgradeQueue ?? 1) - 1;
  log(s, 'log.upgrade.offer', 'good');
}

/** The crew's choice. */
export function chooseUpgrade(
  s: SimState,
  id: UpgradeId,
  log: (s: SimState, key: string, sev: 'info' | 'good' | 'warn' | 'bad', params?: Record<string, string | number>) => void,
): boolean {
  if (!s.upgradeOffer?.includes(id)) return false;
  (s.upgrades ??= []).push(id);
  s.upgradeOffer = null;
  if (id === 'printer') s.flags.printedAtH = s.timeH;
  log(s, 'log.upgrade.chosen', 'good', { what: `upg.${id}` });
  offer(s, log);
  return true;
}

/** The printer turns packaging and broken plastic parts into spare parts, one every two sols. */
export function updatePrinter(s: SimState, labUp: boolean): void {
  if (!hasUpgrade(s, 'printer') || !labUp) return;
  const every = PRINTER_SOLS * WORLDS[s.world].solH;
  const last = s.flags.printedAtH ?? s.timeH;
  if (s.timeH - last >= every) {
    s.flags.printedAtH = last + every;
    s.stores.spares = (s.stores.spares ?? 0) + 1;
    s.stats.partsPrinted = (s.stats.partsPrinted ?? 0) + 1;
  }
}
