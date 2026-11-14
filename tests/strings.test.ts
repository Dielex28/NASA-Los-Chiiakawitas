import { describe, expect, it } from 'vitest';
import { DEMO_MISSION, MISSIONS } from '../src/sim/missions';
import { ACHIEVEMENTS } from '../src/ui/achievements';
import { has } from '../src/ui/strings';
import '../src/ui/codexData';

describe('interface text', () => {
  it('every mission has a name, a site line and a briefing', () => {
    for (const m of [...MISSIONS, DEMO_MISSION]) for (const k of ['name', 'site', 'brief']) expect(has(`mission.${m.id}.${k}`), `${m.id}.${k}`).toBe(true);
  });
  it('every achievement has a title and a description', () => {
    for (const a of ACHIEVEMENTS) {
      expect(has(`ach.${a.id}`), a.id).toBe(true);
      expect(has(`ach.${a.id}.d`), a.id).toBe(true);
    }
  });
});
