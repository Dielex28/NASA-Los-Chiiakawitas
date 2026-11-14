import { scoreMission } from '../sim/missions';
import type { SimState } from '../sim/types';

/**
 * The Helios programme: the missions in an order that teaches one idea at a time, from a first
 * night in the lander to a year-long stay on Mars. Each chapter opens when the previous one is
 * completed; free play keeps every mission open as before.
 */
export const CHAPTERS = ['moon-first', 'moon-base', 'moon-1972', 'moon-malapert', 'moon-ridge', 'moon-nobile', 'mars-first', 'mars-2017', 'mars-long'] as const;
export type ChapterId = (typeof CHAPTERS)[number];

/** 1 bronze (mission completed), 2 silver (score ≥ 65), 3 gold (score ≥ 80). */
export type Medal = 0 | 1 | 2 | 3;

const KEY = 'helios-campaign';

export function medals(): Partial<Record<ChapterId, Medal>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<ChapterId, Medal>>;
  } catch {
    return {};
  }
}

export function medalFor(sim: SimState): Medal {
  if (sim.outcome?.result !== 'success') return 0;
  const total = scoreMission(sim).total;
  return total >= 80 ? 3 : total >= 65 ? 2 : 1;
}

export const isChapter = (id: string): id is ChapterId => (CHAPTERS as readonly string[]).includes(id);

/** A chapter is open when it is the first, or the one before it has a medal. */
export function unlockedChapters(m = medals()): Set<ChapterId> {
  const out = new Set<ChapterId>();
  CHAPTERS.forEach((id, i) => {
    if (i === 0 || (m[CHAPTERS[i - 1]] ?? 0) > 0) out.add(id);
  });
  return out;
}

/**
 * Record the result of a campaign mission (keeping the best medal). Returns the medal earned, the
 * best so far and the chapter this result has just opened, if any.
 */
export function recordChapter(sim: SimState): { medal: Medal; best: Medal; opened: ChapterId | null } | null {
  if (!isChapter(sim.missionId)) return null;
  const all = medals();
  const before = unlockedChapters(all);
  const medal = medalFor(sim);
  const best = Math.max(all[sim.missionId] ?? 0, medal) as Medal;
  all[sim.missionId] = best;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode: the result just is not remembered */
  }
  const after = unlockedChapters(all);
  const opened = CHAPTERS.find((id) => after.has(id) && !before.has(id)) ?? null;
  return { medal, best, opened };
}

/** The next chapter after this one, if any. */
export function nextChapter(id: string): ChapterId | null {
  const i = (CHAPTERS as readonly string[]).indexOf(id);
  return i >= 0 && i < CHAPTERS.length - 1 ? CHAPTERS[i + 1] : null;
}
