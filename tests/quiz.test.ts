import { describe, expect, it } from 'vitest';
import { QUESTIONS, pickQuestions } from '../src/ui/quiz';

describe('classroom questions', () => {
  it('every question has an explanation and at least three options in both languages', () => {
    for (const q of QUESTIONS) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(3);
      for (const text of [q.q, q.why, ...q.options]) {
        expect(text[0].length, q.id).toBeGreaterThan(0);
        expect(text[1].length, q.id).toBeGreaterThan(0);
      }
    }
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
  });

  it('picks four questions for the right world and never above the level', () => {
    for (const world of ['moon', 'mars'] as const) {
      for (const level of [1, 2, 3] as const) {
        const shown = pickQuestions(world, level);
        expect(shown.length).toBe(4);
        expect(new Set(shown.map((s) => s.question.id)).size).toBe(4);
        for (const s of shown) {
          expect(s.question.level).toBeLessThanOrEqual(level);
          expect(['any', world]).toContain(s.question.world);
          expect([...s.order].sort()).toEqual(s.question.options.map((_, i) => i));
        }
      }
    }
  });
});
