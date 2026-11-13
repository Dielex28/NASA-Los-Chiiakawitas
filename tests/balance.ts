/* Balance probe: `npx tsx tests/balance.ts` prints how each recommended loadout fares. */
import { scoreMission } from '../src/sim/missions';
import { totalDose } from '../src/sim/sim';
import { WORLDS } from '../src/sim/worlds';
import { deployAll, run } from './helpers';

for (const id of ['moon-first', 'moon-base', 'mars-first', 'mars-long']) {
  const s = deployAll(id);
  const solH = WORLDS[s.world].solH;
  console.log(`\n=== ${id} ===`);
  let nextPrint = 0;
  run(s, s.cfg.durationH + 1, 1 / 6, (st) => {
    // naive autopilot: shelter during solar storms
    const spe = st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
    st.shelterOrder = spe;
    if (st.timeH >= nextPrint) {
      nextPrint += solH * Math.max(1, Math.round(st.cfg.durationH / solH / 15));
      const p = st.power;
      console.log(
        `sol ${(st.timeH / solH).toFixed(0).padStart(3)} | gen ${p.genKw.toFixed(1).padStart(5)} dem ${p.demandKw.toFixed(1).padStart(5)} srv ${p.servedKw.toFixed(1).padStart(5)} bat ${p.storedKwh.toFixed(0).padStart(4)}/${p.capacityKwh} shed ${p.shed} | O2 ${st.stores.o2.toFixed(0).padStart(4)} W ${st.stores.water.toFixed(0).padStart(5)} F ${st.stores.food.toFixed(0).padStart(4)} CO2 ${st.flows.co2MmHg.toFixed(1)} T ${st.cabin.tempC.toFixed(0)} | hp ${st.crew.map((c) => c.health.toFixed(0)).join(',')} mor ${st.crew[0].morale.toFixed(0)} dose ${totalDose(st.crew[1] ?? st.crew[0]).toFixed(1)} sci ${st.science.toFixed(0)} | built ${st.modules.filter((m) => m.built >= 1).length}/${st.modules.length}`,
      );
    }
  });
  const sc = scoreMission(s);
  console.log('outcome', s.outcome, 'score', JSON.stringify(Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, Math.round(v as number)]))));
  console.log('stats', JSON.stringify(Object.fromEntries(Object.entries(s.stats).map(([k, v]) => [k, Math.round((v as number) * 10) / 10]))));
  console.log(s.log.filter((l) => l.sev !== 'info').slice(-25).map((l) => `${(l.t / solH).toFixed(1)}:${l.key}${l.params ? JSON.stringify(l.params) : ''}`).join(' | '));
}
