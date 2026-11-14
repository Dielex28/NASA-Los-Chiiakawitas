import type { WorldId } from './types';

/**
 * A mission a teacher designs: every number a class needs to play the same mission, packed
 * into a 15-character code (three groups of five) that can be written on a board, read aloud
 * or pasted into a message. Nothing goes to a server: the code *is* the mission.
 */
export interface CustomSpec {
  world: WorldId;
  /** Mission length in days (Moon) or sols (Mars). */
  days: number;
  crew: number;
  budgetKg: number;
  scienceGoal: number;
  doseLimitMsv: number;
  /** Solar particle events and their class (1 minor, 2 moderate, 3 severe). */
  spe: number;
  speClass: 1 | 2 | 3;
  /** Dust storms (Mars only) and how dark they get (1 light, 2 strong, 3 global). */
  storms: number;
  stormLevel: 1 | 2 | 3;
  emergencies: number;
  /** Return propellant to make on site, kg (0 = no fuel objective). */
  fuelKg: number;
  resupply: number;
  /** Ground: 0 designed site; real NASA topography 1 Shackleton (Moon) or Jezero (Mars), 2 connecting ridge, 3 Nobile, 4 Malapert. */
  terrain: number;
  /** One-way radio delay to Earth, minutes (Mars only: 3–22 in reality; 0 = use today's typical 12). */
  delayMin: number;
  /** Picks when events happen: two codes that differ only here are the same mission, reshuffled. */
  variant: number;
}

/** Each field as a range of whole steps, in the order they are packed. */
const FIELDS: Array<{ key: keyof CustomSpec; min: number; max: number; step: number }> = [
  { key: 'days', min: 3, max: 120, step: 1 },
  { key: 'crew', min: 1, max: 6, step: 1 },
  { key: 'budgetKg', min: 3000, max: 20000, step: 250 },
  { key: 'scienceGoal', min: 0, max: 400, step: 5 },
  { key: 'doseLimitMsv', min: 10, max: 300, step: 5 },
  { key: 'spe', min: 0, max: 3, step: 1 },
  { key: 'speClass', min: 1, max: 3, step: 1 },
  { key: 'storms', min: 0, max: 3, step: 1 },
  { key: 'stormLevel', min: 1, max: 3, step: 1 },
  { key: 'emergencies', min: 0, max: 3, step: 1 },
  { key: 'fuelKg', min: 0, max: 4000, step: 100 },
  { key: 'resupply', min: 0, max: 2, step: 1 },
  { key: 'delayMin', min: 0, max: 22, step: 1 },
  { key: 'variant', min: 0, max: 4095, step: 1 },
  { key: 'terrain', min: 0, max: 4, step: 1 },
];

export const CUSTOM_LIMITS: Record<string, { min: number; max: number; step: number }> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

export const DEFAULT_CUSTOM: Record<WorldId, CustomSpec> = {
  moon: {
    world: 'moon',
    days: 20,
    crew: 3,
    budgetKg: 9500,
    scienceGoal: 60,
    doseLimitMsv: 60,
    spe: 1,
    speClass: 2,
    storms: 0,
    stormLevel: 2,
    emergencies: 1,
    fuelKg: 0,
    resupply: 1,
    terrain: 0,
    delayMin: 0,
    variant: 1,
  },
  mars: {
    world: 'mars',
    days: 40,
    crew: 4,
    budgetKg: 13500,
    scienceGoal: 140,
    doseLimitMsv: 60,
    spe: 1,
    speClass: 2,
    storms: 1,
    stormLevel: 2,
    emergencies: 1,
    fuelKg: 0,
    resupply: 1,
    terrain: 0,
    delayMin: 12,
    variant: 1,
  },
};

// Crockford base 32: no I, L, O or U, so a code survives being read aloud or copied by hand
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const VERSION = 'H';
const PAYLOAD = 13;

const steps = (f: (typeof FIELDS)[number]): number => Math.round((f.max - f.min) / f.step) + 1;

/** Snap a spec into its allowed ranges (the editor's sliders already do; codes always do). */
export function clampSpec(s: CustomSpec): CustomSpec {
  const out = { ...s };
  for (const f of FIELDS) {
    const v = Number(out[f.key]);
    const i = Math.min(steps(f) - 1, Math.max(0, Math.round(((Number.isFinite(v) ? v : f.min) - f.min) / f.step)));
    (out as Record<string, unknown>)[f.key] = f.min + i * f.step;
  }
  if (out.world === 'moon') {
    out.storms = 0;
    out.delayMin = 0;
  } else {
    out.terrain = Math.min(out.terrain, 1);
  }
  return out;
}

// odd weights are coprime with 32, so changing any single character always changes the sum
const checksum = (digits: number[]): number => digits.reduce((a, d, i) => (a + d * (2 * i + 1)) % 32, 7);

/** Multiply a little-endian base-32 number by `m` and add `a`, in place. */
function mulAdd(n: number[], m: number, a: number): void {
  let carry = a;
  for (let i = 0; i < n.length; i++) {
    const v = n[i] * m + carry;
    n[i] = v % 32;
    carry = Math.floor(v / 32);
  }
  while (carry > 0) {
    n.push(carry % 32);
    carry = Math.floor(carry / 32);
  }
}

/** Divide a little-endian base-32 number by `d` in place; returns the remainder. */
function divMod(n: number[], d: number): number {
  let rem = 0;
  for (let i = n.length - 1; i >= 0; i--) {
    const v = rem * 32 + n[i];
    n[i] = Math.floor(v / d);
    rem = v % d;
  }
  return rem;
}

/** The shareable code for a mission, e.g. "H1A2B-3C4D5-E6F7G". */
export function encodeCustom(spec: CustomSpec): string {
  const s = clampSpec(spec);
  const n = [0];
  // flags first, then the fields from last to first, so decoding reads them in order
  for (let i = FIELDS.length - 1; i >= 0; i--) {
    const f = FIELDS[i];
    mulAdd(n, steps(f), Math.round((Number(s[f.key]) - f.min) / f.step));
  }
  mulAdd(n, 2, s.world === 'mars' ? 1 : 0);
  while (n.length < PAYLOAD) n.push(0);
  const digits = n.slice(0, PAYLOAD).reverse();
  const body = VERSION + digits.map((d) => ALPHABET[d]).join('') + ALPHABET[checksum(digits)];
  return `${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}`;
}

/** Read a code back; null if it is mistyped (the last character is a check digit). */
export function decodeCustom(code: string): CustomSpec | null {
  const clean = code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (clean.length !== PAYLOAD + 2 || clean[0] !== VERSION) return null;
  const digits: number[] = [];
  for (const ch of clean.slice(1)) {
    const d = ALPHABET.indexOf(ch);
    if (d < 0) return null;
    digits.push(d);
  }
  const check = digits.pop()!;
  if (checksum(digits) !== check) return null;
  const n = digits.slice().reverse();
  const mars = divMod(n, 2) === 1;
  const out: Record<string, unknown> = { world: mars ? 'mars' : 'moon' };
  for (const f of FIELDS) out[f.key] = f.min + divMod(n, steps(f)) * f.step;
  if (n.some((d) => d !== 0)) return null;
  return clampSpec(out as unknown as CustomSpec);
}

/** The canonical form of a code (as encodeCustom writes it), or null if it is not a valid one. */
export function normalizeCode(code: string): string | null {
  const spec = decodeCustom(code);
  return spec ? encodeCustom(spec) : null;
}
