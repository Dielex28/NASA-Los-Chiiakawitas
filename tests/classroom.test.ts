import { describe, expect, it } from 'vitest';
import { classCsv, entryFor, missionKey, sendResult, watchClass, type Classroom } from '../src/ui/classroom';
import type { SimState } from '../src/sim/types';
import { deployAll } from './helpers';

/** An in-memory stand-in for the page's shared database. */
function fakeClass(me: string | null, teacher = false): Classroom & { store: Map<string, Record<string, unknown>> } {
  const store = new Map<string, Record<string, unknown>>();
  const listeners: Array<() => void> = [];
  const db = {
    doc: (path: string) => ({
      get: async () => ({ id: path.split('/')[1], exists: store.has(path), data: () => store.get(path), metadata: { fromCache: false } }),
      set: async (data: Record<string, unknown>) => {
        if (!path.endsWith(`/${me}`)) throw { code: 'invalid_argument' };
        store.set(path, JSON.parse(JSON.stringify(data)));
        listeners.forEach((l) => l());
      },
    }),
    collection: () => ({
      onSnapshot: (next: (s: unknown) => void) => {
        const fire = (): void =>
          next({ docs: [...store].map(([p, d]) => ({ id: p.split('/')[1], exists: true, data: () => d, metadata: { fromCache: false } })), metadata: { fromCache: false } });
        listeners.push(fire);
        fire();
        return () => undefined;
      },
    }),
  };
  const user = { id: async () => me, isOwner: async () => teacher, canEdit: async () => teacher, profiles: async () => ({}) };
  return { db, user, me, teacher, store } as never;
}

const finished = (result: 'success' | 'abort'): SimState => {
  const s = deployAll('moon-first');
  s.timeH = 100;
  s.outcome = { result, reason: result === 'success' ? undefined : 'health', atH: 100 } as SimState['outcome'];
  return s;
};

describe('class results', () => {
  it('a result holds numbers and ids only, keyed by mission', () => {
    const e = entryFor(finished('success'), 2);
    expect(e.mission).toBe('moon-first');
    expect(e.result).toBe('success');
    expect(Object.values(e).every((v) => typeof v === 'number' || typeof v === 'string')).toBe(true);
    expect(missionKey('custom-H0022-EA4QK-BM0DN')).toBe('custom-H0022-EA4QK-BM0DN');
    expect(missionKey('a/b')).toBe('a_b');
  });

  it('each student writes their own document and keeps their best attempt', async () => {
    const c = fakeClass('u_ana');
    const good = { ...entryFor(finished('success'), 2), score: 80 };
    expect(await sendResult(c, good)).toBe('sent');
    expect(await sendResult(c, { ...good, score: 60 })).toBe('kept');
    expect(await sendResult(c, { ...good, score: 90 })).toBe('sent');
    const doc = c.store.get('results/u_ana') as { entries: Record<string, { score: number }> };
    expect(doc.entries['moon-first'].score).toBe(90);
  });

  it('no identity or no permission: nothing is written', async () => {
    expect(await sendResult(fakeClass(null), entryFor(finished('success'), 2))).toBe('denied');
  });

  it('the teacher sees every student, and the table exports to CSV', async () => {
    const c = fakeClass('u_ana', true);
    await sendResult(c, { ...entryFor(finished('success'), 2), score: 77 });
    c.store.set('results/u_bruno', { entries: { 'moon-first': { ...entryFor(finished('abort'), 2), score: 30 } } });
    let rows: Array<{ student: string; score: number }> = [];
    watchClass(c, (r) => (rows = r), () => undefined);
    await sendResult(c, { ...entryFor(finished('success'), 2), score: 78 });
    expect(rows.map((r) => r.student).sort()).toEqual(['u_ana', 'u_bruno']);
    const csv = classCsv(rows.map((r) => ({ ...(r as object), name: r.student === 'u_ana' ? 'Ana' : 'Bruno' }) as never), 'es');
    const lines = csv.trim().split('\r\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('Estudiante;Misión');
  });
});
