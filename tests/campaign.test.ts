import { beforeEach, describe, expect, it } from 'vitest';
import { CHAPTERS, medalFor, medals, nextChapter, recordChapter, unlockedChapters } from '../src/ui/campaign';
import { missionById } from '../src/sim/missions';
import type { SimState } from '../src/sim/types';
import { deployAll } from './helpers';

// a tiny in-memory localStorage for the node test environment
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};

const finished = (id: string, result: 'success' | 'abort'): SimState => {
  const s = deployAll(id);
  s.outcome = { result, reason: result === 'success' ? 'complete' : 'health', atH: s.timeH } as SimState['outcome'];
  return s;
};

describe('campaign', () => {
  beforeEach(() => store.clear());

  it('every chapter is a real mission, and only the first is open at the start', () => {
    for (const id of CHAPTERS) expect(missionById(id).id).toBe(id);
    expect([...unlockedChapters()]).toEqual(['moon-first']);
    expect(nextChapter('moon-first')).toBe('moon-base');
    expect(nextChapter('mars-long')).toBeNull();
  });

  it('completing a chapter earns a medal and opens the next one; failing does not', () => {
    const lost = recordChapter(finished('moon-first', 'abort'))!;
    expect(lost.medal).toBe(0);
    expect(lost.opened).toBeNull();
    expect(unlockedChapters().has('moon-base')).toBe(false);
    const won = recordChapter(finished('moon-first', 'success'))!;
    expect(won.medal).toBeGreaterThan(0);
    expect(won.opened).toBe('moon-base');
    expect(unlockedChapters().has('moon-base')).toBe(true);
    // a worse result later keeps the best medal
    recordChapter(finished('moon-first', 'abort'));
    expect(medals()['moon-first']).toBe(won.best);
  });

  it('medals follow the score: no medal without success', () => {
    expect(medalFor(finished('moon-base', 'abort'))).toBe(0);
    expect(medalFor(finished('moon-base', 'success'))).toBeGreaterThanOrEqual(1);
    expect(recordChapter(finished('moon-sandbox', 'success'))).toBeNull(); // not a chapter
  });
});
