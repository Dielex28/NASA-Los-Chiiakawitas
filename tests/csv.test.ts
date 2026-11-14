import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, telemetryCsv } from '../src/sim/csv';
import { deployAll, run } from './helpers';

describe('telemetry export', () => {
  const s = deployAll('moon-base');
  run(s, 24 * 5);

  it('one row per telemetry sample, every row with every column', () => {
    for (const lang of ['es', 'en']) {
      const lines = telemetryCsv(s, lang).replace(/^﻿/, '').trim().split('\r\n');
      expect(lines.length).toBe(s.telemetry.t.length + 1);
      const sep = lang === 'es' ? ';' : ',';
      for (const l of lines) expect(l.split(sep).length).toBe(CSV_COLUMNS);
    }
  });

  it('English numbers parse as numbers; Spanish ones use a decimal comma', () => {
    const en = telemetryCsv(s, 'en').trim().split('\r\n');
    const row = en[en.length - 1].split(',').map(Number);
    expect(row.every((v) => Number.isFinite(v))).toBe(true);
    expect(row[0]).toBeCloseTo(s.telemetry.t[s.telemetry.t.length - 1], 1);
    const es = telemetryCsv(s, 'es').trim().split('\r\n');
    expect(es[0]).toContain('Oxígeno (kg)');
    expect(es[es.length - 1]).toMatch(/\d,\d/);
    expect(es[es.length - 1]).not.toMatch(/\d\.\d/);
  });

  it('starts with a byte-order mark so spreadsheets keep the accents', () => {
    expect(telemetryCsv(s, 'es').charCodeAt(0)).toBe(0xfeff);
  });
});
