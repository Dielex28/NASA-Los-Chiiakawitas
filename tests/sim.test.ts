import { describe, expect, it } from 'vitest';
import { CROPS, HUMAN, MODULES, gcrTransmission, speTransmission } from '../src/sim/catalog';
import { atmosphereTransmission, speTotal, sunPosition } from '../src/sim/environment';
import { MISSIONS, buildSchedule, missionById, scoreMission } from '../src/sim/missions';
import { createMission, manifestMass, placeModule, setAllocation, setPowerSave, step, totalDose } from '../src/sim/sim';
import type { SimState } from '../src/sim/types';
import { WORLDS } from '../src/sim/worlds';
import type { SpeEvent } from '../src/sim/types';
import { deployAll, flatProbe, ridgeProbe, run } from './helpers';

describe('mission definitions', () => {
  it('recommended cargo fits inside every mass budget', () => {
    for (const m of MISSIONS) expect(manifestMass(m.recommended), m.id).toBeLessThanOrEqual(m.budgetKg);
  });
  it('schedules are reproducible from the seed', () => {
    const m = missionById('mars-first');
    expect(buildSchedule(m, 42)).toEqual(buildSchedule(m, 42));
    expect(buildSchedule(m, 42)).not.toEqual(buildSchedule(m, 43));
  });
});

describe('environment', () => {
  it('Mars has a day and a night; noon Sun is high at 18°N', () => {
    const noon = sunPosition('mars', 0, WORLDS.mars.solH / 2);
    const midnight = sunPosition('mars', 0, 0);
    expect(noon.el).toBeGreaterThan(1.2);
    expect(midnight.el).toBeLessThan(-0.8);
  });
  it('the polar lunar Sun stays within a few degrees of the horizon and circles once a month', () => {
    for (let t = 0; t < 708; t += 20) {
      const s = sunPosition('moon', t, 0);
      expect(s.el).toBeGreaterThan(0.04);
      expect(s.el).toBeLessThan(0.12);
    }
    expect(sunPosition('moon', 708.7, 0).az).toBeCloseTo(sunPosition('moon', 0, 0).az, 3);
  });
  it('dust dims sunlight more when the Sun is low', () => {
    expect(atmosphereTransmission(0.4, 1)).toBeGreaterThan(0.85);
    expect(atmosphereTransmission(4, 1)).toBeLessThan(0.35);
    expect(atmosphereTransmission(4, 0.3)).toBeLessThan(atmosphereTransmission(4, 1));
  });
  it('solar particle events deliver their nominal total dose', () => {
    const ev = buildSchedule(missionById('moon-base'), 7).find((e) => e.kind === 'spe' && e.cls === 3) as SpeEvent;
    expect(speTotal(ev)).toBeGreaterThan(280);
    expect(speTotal(ev)).toBeLessThan(400);
  });
  it('shielding stops solar protons far better than cosmic rays', () => {
    expect(speTransmission(45)).toBeLessThan(0.08);
    expect(gcrTransmission(45)).toBeGreaterThan(0.85);
    expect(gcrTransmission(300)).toBeLessThan(0.55);
  });
});

describe('life support', () => {
  it('an open-loop crew uses up oxygen, water and food at the NASA baseline rates', () => {
    const m = missionById('moon-base');
    const s = createMission(m, { o2: 4, water: 10, food: 5 }, 1, flatProbe);
    const o2 = s.stores.o2;
    const water = s.stores.water;
    const food = s.stores.food;
    run(s, 48);
    expect(o2 - s.stores.o2).toBeCloseTo(4 * HUMAN.o2KgDay * 2, 1);
    expect(water - s.stores.water).toBeCloseTo(4 * HUMAN.waterKgDay * 2, 0);
    expect(food - s.stores.food).toBeCloseTo(8, 1);
  });
  it('a regenerative ECLSS cuts net water use by an order of magnitude', () => {
    const open = deployAll('moon-base', { solar: 3, battery: 2, hab: 1, water: 12, o2: 1, food: 8 }, flatProbe);
    const closed = deployAll('moon-base', { solar: 3, battery: 2, hab: 1, eclss: 1, water: 12, o2: 1, food: 8 }, flatProbe);
    run(open, 240);
    run(closed, 240);
    const usedOpen = open.flows.waterUseDay - open.flows.waterProdDay;
    const usedClosed = closed.flows.waterUseDay - closed.flows.waterProdDay;
    expect(usedClosed).toBeLessThan(usedOpen * 0.2);
    expect(closed.stats.o2Made).toBeGreaterThan(10);
  });
  it('without power the scrubbers stop and CO₂ climbs to dangerous levels', () => {
    const m = missionById('moon-base');
    const s = createMission(m, { o2: 4, water: 10, food: 5 }, 1, flatProbe);
    s.modules[0].enabled = false; // lander switched off: no scrubber, no heater
    run(s, 36);
    expect(s.flows.co2MmHg).toBeGreaterThan(8);
    expect(s.cabin.tempC).toBeLessThan(15);
    expect(s.crew[0].health).toBeLessThan(100);
  });
  it('the crew is evacuated before anyone dies when oxygen runs out', () => {
    const m = missionById('moon-first');
    const s = createMission(m, {}, 1, flatProbe);
    run(s, 24 * 8);
    expect(s.outcome?.result).toBe('abort');
    expect(s.outcome?.reason).toBe('health');
  });
});

describe('power', () => {
  it('batteries carry the base through the lunar dark only if loads are managed', () => {
    const lazy = deployAll('moon-base');
    run(lazy, 30 * 24);
    const careful = deployAll('moon-base');
    run(careful, 30 * 24, 1 / 6, (s) => setPowerSave(s, s.env.sunVisBase < 0.5 ? 2 : 0));
    expect(lazy.stats.blackoutH).toBeGreaterThan(1);
    expect(careful.stats.blackoutH).toBeLessThan(0.5);
  });
  it('critical loads are served before low-priority ones', () => {
    const s = deployAll('moon-base', { hab: 1, eclss: 1, lab: 1, greenhouse: 1, food: 6, water: 4, o2: 3 }, flatProbe);
    for (const m of s.modules) m.built = 1;
    run(s, 2);
    const mode = (t: string) => s.modules.find((m) => m.type === t)!.mode;
    // only the lander's 5 kW array is available: life support wins, the greenhouse lamps lose
    expect(mode('hab')).toBe('full');
    expect(mode('greenhouse')).not.toBe('full');
  });
  it('a Martian dust storm cuts solar output but not the reactor', () => {
    const s = deployAll('mars-first');
    let clear = 0;
    let stormy = 0;
    let nuclearMin = 99;
    run(s, 40 * WORLDS.mars.solH, 1 / 6, (st) => {
      if (st.timeH < 10 * WORLDS.mars.solH) return;
      if (Math.abs(st.env.localH - WORLDS.mars.solH / 2) > 0.2) return;
      if (st.env.storm > 0.6) stormy = Math.max(stormy, st.power.solarKw);
      else if (st.env.storm < 0.01) clear = Math.max(clear, st.power.solarKw);
      nuclearMin = Math.min(nuclearMin, st.power.nuclearKw);
    });
    expect(clear).toBeGreaterThan(0);
    expect(stormy).toBeLessThan(clear * 0.5);
    expect(nuclearMin).toBeGreaterThan(15);
  });
});

describe('radiation', () => {
  it('sheltering during a severe solar storm saves most of the dose', () => {
    const exposed = deployAll('moon-base', { ...missionById('moon-base').recommended, shelter: 1, rassor: 0 });
    const safe = deployAll('moon-base', { ...missionById('moon-base').recommended, shelter: 1, rassor: 0 });
    run(exposed, 30 * 24);
    run(safe, 30 * 24, 1 / 6, (s) => {
      s.shelterOrder = s.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
    });
    const dose = (s: typeof safe) => s.crew[1].doseSpe;
    expect(dose(exposed)).toBeGreaterThan(100);
    expect(dose(safe)).toBeLessThan(dose(exposed) * 0.25);
  });
  it('regolith cover lowers the everyday cosmic-ray dose', () => {
    const bare = deployAll('moon-base', { ...missionById('moon-base').recommended, rassor: 0 }, flatProbe, (m) => ({ ...m, spe: [] }));
    const buried = deployAll('moon-base', missionById('moon-base').recommended, flatProbe, (m) => ({ ...m, spe: [] }));
    run(bare, 30 * 24);
    run(buried, 30 * 24);
    expect(totalDose(buried.crew[1])).toBeLessThan(totalDose(bare.crew[1]) * 0.93);
    expect(buried.modules.find((m) => m.type === 'hab')!.regolith).toBeGreaterThan(150);
  });
  it('a reactor parked next to the habitat irradiates the crew', () => {
    const m = missionById('mars-first');
    const near = createMission(m, { hab: 1, reactor: 1, food: 12, water: 20, o2: 10 }, 5, flatProbe);
    const far = createMission(m, { hab: 1, reactor: 1, food: 12, water: 20, o2: 10 }, 5, flatProbe);
    placeModule(near, 'hab', 20, 0, 0, 0, flatProbe);
    placeModule(near, 'reactor', 38, 0, 0, 0, flatProbe);
    placeModule(far, 'hab', 20, 0, 0, 0, flatProbe);
    placeModule(far, 'reactor', 140, 0, 0, 0, flatProbe);
    for (const s of [near, far]) for (const mod of s.modules) mod.built = 1;
    run(near, 240);
    run(far, 240);
    expect(near.crew[1].doseReactor).toBeGreaterThan(5);
    expect(far.crew[1].doseReactor).toBe(0);
  });
});

describe('food', () => {
  it('a powered, tended greenhouse brings in harvests; an abandoned one loses the crop', () => {
    const s = deployAll('mars-first', { reactor: 3, hab: 1, eclss: 1, greenhouse: 1, food: 14, water: 8, o2: 4 }, flatProbe);
    for (const m of s.modules) m.built = 1;
    const gh = s.modules.find((m) => m.type === 'greenhouse')!;
    gh.crop = 'radish';
    setAllocation(s, 'farm', 0.3);
    run(s, (CROPS.radish.cycleSols + 3) * WORLDS.mars.solH);
    expect(s.stats.harvests).toBeGreaterThanOrEqual(1);
    expect(s.stats.foodGrown).toBeCloseTo(CROPS.radish.rationsPerSol * CROPS.radish.cycleSols, 0);
    gh.enabled = false;
    run(s, 60);
    expect(s.log.some((l) => l.key === 'log.croplost')).toBe(true);
  });
  it('lighting 30 m² of crops costs more power than keeping four people alive', () => {
    expect(MODULES.greenhouse.opKw).toBeGreaterThan(MODULES.hab.opKw + MODULES.eclss.opKw);
  });
});

describe('whole missions', () => {
  it('the recommended lunar loadout completes 30 days when the commander manages power and storms', () => {
    const s = deployAll('moon-base');
    run(s, 31 * 24, 1 / 6, (st) => {
      st.shelterOrder = st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
      setPowerSave(st, st.env.sunVisBase < 0.5 ? 1 : 0);
    });
    expect(s.outcome?.result).toBe('success');
    const score = scoreMission(s);
    expect(score.total).toBeGreaterThan(70);
    expect(score.maxDose).toBeLessThan(s.cfg.doseLimitMsv);
  });
  it('the recommended Mars loadout survives 60 sols including the dust storm', () => {
    const s = deployAll('mars-first');
    run(s, 61 * WORLDS.mars.solH, 1 / 6, (st) => {
      st.shelterOrder = st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
    });
    expect(s.outcome?.result).toBe('success');
    expect(Math.min(...s.crew.map((c) => c.health))).toBeGreaterThan(80);
  });
  it('August 1972 on the Moon: sheltering keeps the crew under the limit, staying out does not', () => {
    const shelter = (st: SimState): void => {
      st.shelterOrder = st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
    };
    const safe = deployAll('moon-1972');
    run(safe, 11 * 24, 1 / 6, shelter);
    expect(safe.outcome?.result).toBe('success');
    expect(scoreMission(safe).maxDose).toBeLessThan(safe.cfg.doseLimitMsv);
    const careless = deployAll('moon-1972');
    run(careless, 11 * 24, 1 / 6);
    expect(scoreMission(careless).maxDose).toBeGreaterThan(careless.cfg.doseLimitMsv);
  });
  it('September 2017 on Mars: the recommended loadout rides out the storm', () => {
    const s = deployAll('mars-2017');
    run(s, 25 * WORLDS.mars.solH, 1 / 6, (st) => {
      st.shelterOrder = st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
    });
    expect(s.outcome?.result).toBe('success');
    expect(scoreMission(s).maxDose).toBeLessThan(s.cfg.doseLimitMsv);
  });
  it('state survives a JSON round trip (save games)', () => {
    const s = deployAll('mars-first');
    run(s, 100);
    const copy = JSON.parse(JSON.stringify(s));
    step(s, 5);
    step(copy, 5);
    expect(copy.stores).toEqual(s.stores);
    expect(copy.power.storedKwh).toBeCloseTo(s.power.storedKwh, 6);
  });
});
