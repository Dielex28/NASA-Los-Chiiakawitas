import { describe, expect, it } from 'vitest';
import { DEMO_MISSION, MISSIONS } from '../src/sim/missions';
import { ACHIEVEMENTS } from '../src/ui/achievements';
import { allStrings, has } from '../src/ui/strings';
import { PT } from '../src/ui/i18n/pt';
import { FR } from '../src/ui/i18n/fr';
import { QUESTIONS } from '../src/ui/quiz';
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

describe('Portuguese and French', () => {
  const english: Record<string, string> = {};
  for (const [k, v] of Object.entries(allStrings())) if (v.length === 2) english[k] = v[1];
  for (const q of QUESTIONS) {
    english[`quiz.${q.id}.q`] = q.q[1];
    q.options.forEach((o, i) => (english[`quiz.${q.id}.o${i}`] = o[1]));
    english[`quiz.${q.id}.why`] = q.why[1];
  }
  const holes = (s: string): string => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(',');
  for (const [name, table] of [['pt', PT], ['fr', FR]] as const) {
    it(`${name} translates every interface string`, () => {
      const missing = Object.keys(english).filter((k) => !table[k]?.trim());
      expect(missing, missing.slice(0, 10).join(' ')).toEqual([]);
    });
    it(`${name} keeps the same {placeholders} as English`, () => {
      const bad = Object.keys(english).filter((k) => table[k] !== undefined && holes(table[k]) !== holes(english[k]));
      expect(bad).toEqual([]);
    });
    it(`${name} has no keys the game does not use`, () => {
      expect(Object.keys(table).filter((k) => !(k in english))).toEqual([]);
    });
  }
});
