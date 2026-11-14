import { describe, expect, it } from 'vitest';
import { pushLog, recomputeCaps, step } from '../src/sim/sim';
import type { SimState } from '../src/sim/types';
import { buffActive, completeTask, openTasks } from '../src/sim/tasks';
import { completeRequest, deployInstrument, openRequests, planRequests, hasInstrument } from '../src/sim/requests';
import { chooseUpgrade, TRIPLE_JUNCTION, type UpgradeId } from '../src/sim/upgrades';
import { missionById } from '../src/sim/missions';
import { WORLDS } from '../src/sim/worlds';
import { deployAll as deploy, run } from './helpers';

/** The base of a mission with every module already assembled. */
function deployAll(id: string): SimState {
  const s = deploy(id);
  for (const m of s.modules) m.built = 1;
  recomputeCaps(s);
  return s;
}

describe('daily tasks', () => {
  it('each morning brings a short list; done by hand they give their bonus, left alone the crew does them', () => {
    const s = deployAll('moon-base');
    run(s, 7);
    const open = openTasks(s);
    expect(open.length).toBeGreaterThanOrEqual(2);
    const filter = open.find((t) => t.kind === 'filter') ?? open[0];
    const r = completeTask(s, filter.id, 1, pushLog);
    expect(r.ok).toBe(true);
    expect(s.stats.tasksByPlayer).toBe(1);
    if (filter.kind === 'filter') expect(buffActive(s, 'filter')).toBe(true);
    // a day later the rest fell due: the crew did them, and owes the hours
    run(s, WORLDS.moon.solH + 1);
    expect(s.stats.tasksByCrew ?? 0).toBeGreaterThan(0);
  });

  it('a ripe crop waits for the harvest, and a careful harvest brings in more food', () => {
    const grow = (hand: boolean): number => {
      const s = deployAll('mars-first');
      const gh = s.modules.find((m) => m.type === 'greenhouse')!;
      run(s, 12);
      gh.growth = 0.999;
      let got = 0;
      for (let i = 0; i < 200 && !got; i++) {
        step(s, 0.1);
        const t = openTasks(s).find((x) => x.kind === 'harvest');
        if (t && hand) got = (completeTask(s, t.id, 1, pushLog) as { rations?: number }).rations ?? 0;
        else if (!gh.ripe && s.stats.harvests > 0) got = s.stats.foodGrown;
      }
      if (!hand) run(s, WORLDS.mars.solH);
      return hand ? got : s.stats.foodGrown;
    };
    const byHand = grow(true);
    const byCrew = grow(false);
    expect(byHand).toBeGreaterThan(byCrew * 1.1);
  });

  it('after a harvest the trays stay empty until someone sows them', () => {
    const s = deployAll('mars-first');
    const gh = s.modules.find((m) => m.type === 'greenhouse')!;
    run(s, 12);
    gh.growth = 0.999;
    run(s, 3);
    expect(gh.ripe).toBe(true);
    const h = openTasks(s).find((t) => t.kind === 'harvest')!;
    completeTask(s, h.id, 1, pushLog);
    expect(gh.fallow).toBe(true);
    run(s, 1);
    expect(gh.growth).toBe(0);
    const p = openTasks(s).find((t) => t.kind === 'plant')!;
    completeTask(s, p.id, 1, pushLog);
    expect(gh.fallow).toBe(false);
    run(s, 24);
    expect(gh.growth).toBeGreaterThan(0.03);
  });
});

describe('Mission Control requests', () => {
  it('come on a schedule from the seed, never in training', () => {
    expect(planRequests(missionById('moon-first'), 1).plan).toEqual([]);
    const plan = planRequests(missionById('moon-base'), 19690720).plan;
    expect(plan.length).toBeGreaterThan(3);
    expect(plan.filter((p) => p.kind === 'seismometer').length).toBeLessThanOrEqual(1);
  });

  it('an instrument set out pays science at once and keeps paying; a missed inspection lets a seal go', () => {
    const s = deployAll('moon-base');
    const solH = WORLDS.moon.solH;
    let req = null as ReturnType<typeof openRequests>[number] | null;
    for (let i = 0; i < 30 * 24 && !req; i++) {
      step(s, 1);
      req = openRequests(s).find((r) => r.kind === 'seismometer' || r.kind === 'reflector') ?? null;
    }
    expect(req).toBeTruthy();
    const sci = s.science;
    expect(deployInstrument(s, req!.id, 1, pushLog)).toBe(true);
    expect(s.science - sci).toBeGreaterThan(4);
    expect(hasInstrument(s, req!.kind as 'seismometer')).toBe(true);
    const after = s.science;
    run(s, solH);
    expect(s.science).toBeGreaterThan(after);
    // an inspection request left to expire
    const s2 = deployAll('moon-base');
    let insp = null as ReturnType<typeof openRequests>[number] | null;
    for (let i = 0; i < 30 * 24 && !insp; i++) {
      step(s2, 1);
      insp = openRequests(s2).find((r) => r.kind === 'inspect') ?? null;
    }
    if (insp) {
      const m = s2.modules.find((x) => x.id === insp!.moduleId)!;
      s2.stores.spares = 0;
      s2.alloc = { maintain: 0, science: 0.6, farm: 0.2, build: 0.2 };
      run(s2, insp.dueH - s2.timeH + 0.5, 1 / 6);
      expect(insp.status).toBe('missed');
      expect(m.faults?.some((f) => f.kind === 'breach') || (s2.stats.faultsFixed ?? 0) > 0).toBe(true);
      expect(completeRequest(s2, insp.id, 1, pushLog)).toBe(false);
    }
  });
});

describe('technology upgrades', () => {
  it('a science milestone offers three; triple-junction cells raise solar output by a quarter', () => {
    const s = deployAll('moon-base');
    run(s, 30);
    s.science = s.cfg.scienceGoal * 0.3;
    step(s, 0.1);
    expect(s.upgradeOffer?.length).toBe(3);
    const solar = s.modules.find((m) => m.type === 'solar')!;
    step(s, 0.05);
    const before = solar.output;
    // whatever was offered, put the cells on the table for the check
    s.upgradeOffer = ['triplejunction', ...s.upgradeOffer!.filter((x) => x !== 'triplejunction')].slice(0, 3) as UpgradeId[];
    expect(chooseUpgrade(s, 'triplejunction', pushLog)).toBe(true);
    step(s, 0.05);
    if (before > 0.5) expect(solar.output / before).toBeCloseTo(TRIPLE_JUNCTION, 1);
    expect(s.upgrades).toContain('triplejunction');
    expect(s.upgradeOffer).toBeNull();
  });

  it('the 3D printer makes a spare part every two sols while the lab runs', () => {
    const s = deployAll('moon-base');
    run(s, 30);
    s.upgradeOffer = ['printer'];
    chooseUpgrade(s, 'printer', pushLog);
    const before = s.stores.spares ?? 0;
    const used = s.stats.partsUsed ?? 0;
    run(s, 4 * 24 + 1);
    expect((s.stores.spares ?? 0) + ((s.stats.partsUsed ?? 0) - used) - before).toBeGreaterThanOrEqual(2);
  });
});
