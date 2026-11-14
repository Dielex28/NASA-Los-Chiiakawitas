import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { decideEmergency, isUp, manifestMass, pushLog, setShelterOrder, step } from '../src/sim/sim';
import { FIRE, playerExtinguish, triggerEmergency } from '../src/sim/emergency';
import {
  addFault,
  allFaults,
  blocked,
  breachAirKgH,
  breachO2KgH,
  faultEff,
  planCatastrophes,
  repairFault,
  storageCap,
  strikeImpact,
  strikeQuake,
  strikeRunaway,
  strikeUpset,
} from '../src/sim/faults';
import { MISSIONS, missionById } from '../src/sim/missions';
import { WORLDS } from '../src/sim/worlds';
import { deployAll, run } from './helpers';

const rng = (n = 7): Rng => new Rng(n);

describe('damage you can point at', () => {
  it('air leaks through a hole as a choked jet: about 7 kg/h through 5 mm, four times that through 10 mm', () => {
    expect(breachAirKgH(5)).toBeGreaterThan(6.5);
    expect(breachAirKgH(5)).toBeLessThan(7.6);
    expect(breachAirKgH(10) / breachAirKgH(5)).toBeCloseTo(4, 5);
    // the 2 mm hole in Soyuz MS-09 (2018): a little over 1 kg of air an hour at this cabin pressure
    expect(breachAirKgH(2)).toBeGreaterThan(0.9);
    expect(breachAirKgH(2)).toBeLessThan(1.4);
    // the base replaces the oxygen in that air: 29 % of it by mass
    expect(breachO2KgH(5) / breachAirKgH(5)).toBeCloseTo(0.292, 3);
  });

  it('a meteoroid strike sprays the nearest modules: broken cells cut output, holes cost oxygen', () => {
    const s = deployAll('moon-base');
    run(s, 40);
    const solar = s.modules.find((m) => m.type === 'solar')!;
    // drop it close to an array
    strikeImpact(s, rng(3), pushLog, 14, [solar.x + 12, solar.z]);
    const hit = allFaults(s);
    expect(hit.length).toBeGreaterThan(0);
    expect(s.catastrophes?.at(-1)?.kind).toBe('impact');
    const cells = solar.faults?.find((f) => f.kind === 'cells');
    expect(cells).toBeTruthy();
    expect(faultEff(solar)).toBeCloseTo(1 - cells!.size, 6);
  });

  it('a hull puncture drains the base’s oxygen at the rate the orifice equation gives, until it is mended', () => {
    const s = deployAll('moon-base');
    run(s, 30);
    const hab = s.modules.find((m) => m.type === 'hab')!;
    s.stores.spares = 0;
    s.alloc = { maintain: 0, science: 0.5, farm: 0.25, build: 0.25 };
    addFault(s, hab, 'breach', 6, 'impact', rng());
    const o2 = s.stores.o2;
    const before = s.stats.faultO2Lost ?? 0;
    run(s, 1, 1 / 60);
    expect((s.stats.faultO2Lost ?? 0) - before).toBeCloseTo(breachO2KgH(6), 1);
    expect(s.stores.o2).toBeLessThan(o2);
  });

  it('a quake knocks the dish off Earth (no link), shakes cables loose (module down) and cracks hulls (faster wear)', () => {
    const s = deployAll('moon-base');
    run(s, 30);
    const r = strikeQuake(s, rng(11), pushLog, 5);
    expect(r.faults).toBeGreaterThan(1);
    const antenna = s.modules.find((m) => m.type === 'antenna')!;
    addFault(s, antenna, 'misaligned', 12, 'quake', rng());
    step(s, 0.2);
    expect(s.flows.comms).toBe(false);
    const battery = s.modules.find((m) => m.type === 'battery')!;
    addFault(s, battery, 'wiring', 1, 'quake', rng());
    expect(blocked(battery)).toBe(true);
    expect(isUp(battery)).toBe(false);
  });

  it('the crew mends faults with spare parts; without them it can only improvise the simple ones', () => {
    const s = deployAll('moon-base');
    run(s, 30);
    const solar = s.modules.find((m) => m.type === 'solar')!;
    const hab = s.modules.find((m) => m.type === 'hab')!;
    s.stores.spares = 0;
    addFault(s, solar, 'cells', 0.4, 'impact', rng());
    addFault(s, hab, 'breach', 3, 'impact', rng());
    run(s, 72);
    // the small hole was taped over; the shattered cells wait for parts
    expect(hab.faults?.some((f) => f.kind === 'breach')).toBeFalsy();
    expect(solar.faults?.some((f) => f.kind === 'cells')).toBe(true);
    s.stores.spares = 5;
    run(s, 72);
    expect(solar.faults?.some((f) => f.kind === 'cells')).toBeFalsy();
    expect(s.stores.spares).toBe(3);
  });

  it('a careful repair by hand fixes it at once; a careless one only halves it', () => {
    const s = deployAll('moon-base');
    run(s, 30);
    const solar = s.modules.find((m) => m.type === 'solar')!;
    s.stores.spares = 10;
    const f = addFault(s, solar, 'cells', 0.5, 'impact', rng());
    expect(repairFault(s, f.id, 0.3, pushLog)).toBe('partial');
    expect(f.size).toBeCloseTo(0.25, 6);
    expect(repairFault(s, f.id, 0.9, pushLog)).toBe('fixed');
    expect(solar.faults).toBeUndefined();
    s.stores.spares = 0;
    const g = addFault(s, solar, 'cells', 0.5, 'impact', rng());
    expect(repairFault(s, g.id, 1, pushLog)).toBe('noparts');
  });

  it('a thermal runaway takes part of a battery’s capacity; a solar storm can crash a computer', () => {
    const s = deployAll('moon-base');
    run(s, 30);
    const r = strikeRunaway(s, rng(5), pushLog)!;
    const pack = s.modules.find((m) => m.id === r.moduleId)!;
    expect(storageCap(pack)).toBeLessThan(250);
    expect(blocked(pack)).toBe(true);
    const u = strikeUpset(s, rng(9), pushLog)!;
    expect(blocked(s.modules.find((m) => m.id === u.moduleId)!)).toBe(true);
  });
});

describe('fire aboard', () => {
  it('left alone it eats the module; venting puts it out at once but costs the module’s air', () => {
    const s = deployAll('moon-base');
    run(s, 30);
    const hab = s.modules.find((m) => m.type === 'hab')!;
    triggerEmergency(s, 'fire', rng(), pushLog, hab);
    run(s, 1, 1 / 30);
    const scorch = hab.faults!.find((f) => f.kind === 'scorch')!;
    expect(scorch.size).toBeGreaterThan(0.05 + FIRE.scorchPerH * 0.9);
    const o2 = s.stores.o2;
    decideEmergency(s, 'vent');
    expect(s.emergency).toBeNull();
    expect(hab.down).toBe(true);
    expect(o2 - s.stores.o2).toBeCloseTo(Math.min(o2, FIRE.ventO2), 3);
  });

  it('put out by hand at once, nobody is hurt', () => {
    const s = deployAll('moon-base');
    run(s, 30);
    const lab = s.modules.find((m) => m.type === 'lab')!;
    triggerEmergency(s, 'fire', rng(), pushLog, lab);
    run(s, 0.1, 1 / 60);
    playerExtinguish(s, 0.9, rng(), pushLog);
    expect(s.emergency).toBeNull();
    expect(s.crew.every((c) => !c.injury)).toBe(true);
    expect(s.flags.fireByHandDone).toBe(1);
  });
});

describe('catastrophe schedule', () => {
  it('is the same for the same seed, absent in training, and scripted only in historical scenarios', () => {
    const m = missionById('moon-base');
    const a = planCatastrophes(m, m.seed, 24, 1);
    const b = planCatastrophes(m, m.seed, 24, 1);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(planCatastrophes(missionById('moon-first'), 1, 24, 1)).toEqual([]);
    const q = planCatastrophes(missionById('moon-1973'), 19730313, 24, 1);
    expect(q.map((p) => p.kind)).toEqual(['quake', 'quake']);
    // the youngest players get fewer
    const mars = missionById('mars-long');
    expect(planCatastrophes(mars, 3, 24.66, 0.5).length).toBeLessThan(planCatastrophes(mars, 3, 24.66, 1.35).length);
  });

  for (const id of ['moon-1973', 'moon-2013', 'mars-1997']) {
    it(`${id} can be won with its recommended cargo and a commander who answers emergencies`, () => {
      const s = deployAll(id);
      const solH = WORLDS[s.world].solH;
      run(s, missionById(id).durationSols * solH + 1, 1 / 6, (st) => {
        setShelterOrder(st, st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended));
        if (st.emergency && !st.emergency.choice) decideEmergency(st, st.emergency.kind === 'fire' ? 'extinguish' : st.emergency.kind === 'eclss' ? 'repair' : 'patch');
      });
      expect(s.outcome?.result).toBe('success');
      expect(s.stats.catastrophes ?? 0).toBeGreaterThan(0);
    });
  }

  it('every mission’s suggested cargo still fits its budget with the spare parts', () => {
    for (const m of MISSIONS) expect(manifestMass(m.recommended), m.id).toBeLessThanOrEqual(m.budgetKg);
  });
});
