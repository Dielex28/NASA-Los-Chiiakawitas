import { describe, expect, it } from 'vitest';
import { STATIONS, addressee, assignStations, closeTeam, createTeam, shiftDue, startNextShift } from '../src/sim/team';
import { WORLDS } from '../src/sim/worlds';
import { decideEmergency } from '../src/sim/sim';
import { deployAll, run } from './helpers';

describe('team mode', () => {
  it('every station has an owner and every student a station, for 2 to 5 students', () => {
    for (let n = 2; n <= 5; n++) {
      const st = assignStations(n);
      expect(st.length).toBe(n);
      expect(st.every((x) => x.length > 0)).toBe(true);
      expect(st.flat().sort()).toEqual([...STATIONS].sort());
    }
  });

  it('warnings go to whoever holds the station; emergencies to whoever is at the controls', () => {
    const s = deployAll('moon-base');
    const team = createTeam(s, ['Ana', 'Bruno', 'Carla'], 24);
    const power = team.members.find((m) => m.stations.includes('power'))!;
    const health = team.members.find((m) => m.stations.includes('health'))!;
    expect(addressee(team, 'log.blackout')?.name).toBe(power.name);
    expect(addressee(team, 'tip.co2High')?.name).toBe(health.name);
    expect(addressee(team, 'log.emg.leak')?.name).toBe('Ana');
    expect(addressee(team, 'log.landed')).toBeNull();
  });

  it('the controls rotate every shift, and each shift is judged once', () => {
    const s = deployAll('moon-base');
    const names = ['Ana', 'Bruno', 'Carla'];
    createTeam(s, names, 24);
    const pilots: string[] = [];
    let handovers = 0;
    const days = 30;
    run(s, days * WORLDS.moon.solH, 1 / 6, (st) => {
      st.shelterOrder = st.schedule.some((e) => e.kind === 'spe' && e.warned && !e.ended);
      if (st.emergency && !st.emergency.choice) decideEmergency(st, 'patch');
      if (shiftDue(st)) {
        handovers++;
        expect(st.team!.handover).toBe(true);
        pilots.push(st.team!.members[st.team!.pilot].name);
        startNextShift(st);
      }
    });
    closeTeam(s);
    const team = s.team!;
    expect(handovers).toBeGreaterThanOrEqual(days - 1);
    // Ana started, then Bruno, Carla, Ana…
    expect(pilots.slice(0, 4)).toEqual(['Bruno', 'Carla', 'Ana', 'Bruno']);
    expect(team.history.length).toBeGreaterThanOrEqual(handovers);
    expect(new Set(team.history.map((x) => x.shift)).size).toBe(team.history.length);
    // six goals a shift, all credited to someone
    const set = team.members.reduce((a, m) => a + m.set, 0);
    expect(set).toBe(team.history.length * 6);
    const met = team.members.reduce((a, m) => a + m.met, 0);
    // a well-run base meets most of its goals
    expect(met / set).toBeGreaterThan(0.6);
    expect(team.members.reduce((a, m) => a + m.shifts, 0)).toBe(team.shift);
  });

  it('the clock waits during a handover until the group starts the next shift', () => {
    const s = deployAll('moon-base');
    createTeam(s, ['Ana', 'Bruno'], 12);
    run(s, 12.2);
    expect(shiftDue(s)).toBe(true);
    expect(shiftDue(s)).toBe(false); // already waiting
    startNextShift(s);
    expect(s.team!.endH).toBeCloseTo(s.timeH + 12, 5);
  });
});
