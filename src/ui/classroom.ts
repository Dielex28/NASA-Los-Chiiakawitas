import { missionById, scoreMission } from '../sim/missions';
import type { SimState } from '../sim/types';

/**
 * Class results, where the page runs inside claude.ai with its shared database: each student
 * sends a mission's result to their own document (`results/<their id>`), which only they can
 * write; the teacher (the page's owner or an editor) reads everyone's, a student only their own.
 * Anywhere else — the desktop program, the file opened from disk — there is no database and the
 * feature simply does not appear.
 */

/** One result as stored: numbers and mission ids only, never a name. */
export interface ClassEntry {
  mission: string;
  world: string;
  result: 'success' | 'abort';
  score: number;
  rank: number;
  dose: number;
  science: number;
  scienceGoal: number;
  days: number;
  level: number;
  team: number;
  at: string;
}

interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { fromCache: boolean };
}
interface Db {
  doc(path: string): { get(): Promise<DocSnap>; set(data: Record<string, unknown>): Promise<void> };
  collection(path: string): { onSnapshot(next: (s: { docs: DocSnap[]; metadata: { fromCache: boolean } }) => void, error?: (e: { code: string }) => void): () => void };
}
interface User {
  id(): Promise<string | null>;
  isOwner(): Promise<boolean>;
  canEdit(): Promise<boolean>;
  profiles(ids: string[]): Promise<Record<string, { name: string }>>;
}
interface Bridge {
  use(name: string): Promise<unknown>;
}

export interface Classroom {
  db: Db;
  user: User;
  /** This viewer's id (null: no identity here, so nothing can be sent). */
  me: string | null;
  /** Owner or editor: sees the whole class. */
  teacher: boolean;
}

let conn: Promise<Classroom | null> | null = null;

/** The class database, if this view has one (resolved once; null everywhere else). */
export function classroom(): Promise<Classroom | null> {
  if (!conn) {
    conn = (async (): Promise<Classroom | null> => {
      const bridge = (window as unknown as { claude?: Bridge }).claude;
      if (!bridge?.use) return null;
      const [db, user] = (await Promise.all([bridge.use('db'), bridge.use('user')])) as [Db | null, User | null];
      if (!db || !user) return null;
      const [me, owner, editor] = await Promise.all([user.id(), user.isOwner(), user.canEdit()]);
      return { db, user, me, teacher: owner || editor };
    })().catch(() => null);
  }
  return conn;
}

/** A key for the mission that groups the class's results: the same code, the same mission. */
export const missionKey = (id: string): string => id.replace(/[^A-Za-z0-9_-]/g, '_');

export function entryFor(sim: SimState, level: number): ClassEntry {
  const score = scoreMission(sim);
  const m = missionById(sim.missionId);
  return {
    mission: sim.missionId,
    world: sim.world,
    result: sim.outcome?.result === 'success' ? 'success' : 'abort',
    score: Math.round(score.total),
    rank: score.rank,
    dose: Math.round(score.maxDose * 10) / 10,
    science: Math.round(sim.science),
    scienceGoal: m.scienceGoal,
    days: Math.round((sim.timeH / (sim.world === 'moon' ? 24 : 24.66)) * 10) / 10,
    level,
    team: sim.team?.members.length ?? 1,
    at: new Date().toISOString(),
  };
}

/**
 * Send a result. Keeps the student's best score per mission (a later, worse attempt does not
 * overwrite a better one). Resolves 'sent', 'kept' (an earlier result was better) or an error code.
 */
export async function sendResult(c: Classroom, entry: ClassEntry): Promise<'sent' | 'kept' | 'denied' | 'error'> {
  if (!c.me) return 'denied';
  const ref = c.db.doc(`results/${c.me}`);
  try {
    const snap = await ref.get();
    const body = (snap.exists ? snap.data() : undefined) ?? {};
    const entries = { ...((body.entries as Record<string, ClassEntry> | undefined) ?? {}) };
    const key = missionKey(entry.mission);
    const old = entries[key];
    if (old && old.score >= entry.score && old.result === 'success') return 'kept';
    entries[key] = entry;
    await ref.set({ entries, updatedAt: entry.at });
    return 'sent';
  } catch (e) {
    return (e as { code?: string })?.code === 'invalid_argument' ? 'denied' : 'error';
  }
}

export interface ClassRow extends ClassEntry {
  student: string;
}

/** Follow the class's results live. Returns the unsubscribe function. */
export function watchClass(c: Classroom, next: (rows: ClassRow[], confirmed: boolean) => void, fail: (code: string) => void): () => void {
  return c.db.collection('results').onSnapshot(
    (snap) => {
      const rows: ClassRow[] = [];
      for (const d of snap.docs) {
        const entries = (d.data()?.entries as Record<string, ClassEntry> | undefined) ?? {};
        for (const e of Object.values(entries)) rows.push({ ...e, student: d.id });
      }
      next(rows, !snap.metadata.fromCache);
    },
    (e) => fail(e.code),
  );
}

/** The class table as CSV (teacher's export). */
export function classCsv(rows: Array<ClassRow & { name: string }>, es: boolean): string {
  const sep = es ? ';' : ',';
  const n = (v: number): string => (es ? String(v).replace('.', ',') : String(v));
  const head = es
    ? ['Estudiante', 'Misión', 'Resultado', 'Puntos', 'Dosis máxima (mSv)', 'Ciencia', 'Objetivo de ciencia', 'Días', 'Nivel', 'Equipo', 'Fecha']
    : ['Student', 'Mission', 'Result', 'Score', 'Peak dose (mSv)', 'Science', 'Science goal', 'Days', 'Level', 'Team', 'Date'];
  const q = (x: string): string => (/[;,"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
  const lines = rows.map((r) =>
    [q(r.name), q(r.mission), r.result, n(r.score), n(r.dose), n(r.science), n(r.scienceGoal), n(r.days), n(r.level), n(r.team), r.at.slice(0, 16).replace('T', ' ')].join(sep),
  );
  return '﻿' + [head.join(sep), ...lines].join('\r\n') + '\r\n';
}
