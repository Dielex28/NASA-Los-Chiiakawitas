import { WORLDS } from './worlds';
import type { SimState, Telemetry } from './types';

type Col = { key: Exclude<keyof Telemetry, 'stepH' | 't'>; es: string; en: string; digits: number };

/** The columns of the export, in order, with headers a spreadsheet can show as they are. */
const COLUMNS: Col[] = [
  { key: 'gen', es: 'Energía generada (kW)', en: 'Power generated (kW)', digits: 2 },
  { key: 'demand', es: 'Demanda (kW)', en: 'Demand (kW)', digits: 2 },
  { key: 'stored', es: 'Energía almacenada (kWh)', en: 'Energy stored (kWh)', digits: 1 },
  { key: 'o2', es: 'Oxígeno (kg)', en: 'Oxygen (kg)', digits: 1 },
  { key: 'water', es: 'Agua (kg)', en: 'Water (kg)', digits: 1 },
  { key: 'food', es: 'Comida (raciones)', en: 'Food (rations)', digits: 1 },
  { key: 'co2', es: 'CO2 en cabina (mmHg)', en: 'Cabin CO2 (mmHg)', digits: 2 },
  { key: 'dose', es: 'Dosis media (mSv)', en: 'Mean dose (mSv)', digits: 2 },
  { key: 'health', es: 'Salud media (%)', en: 'Mean health (%)', digits: 1 },
  { key: 'morale', es: 'Ánimo medio (%)', en: 'Mean morale (%)', digits: 1 },
  { key: 'science', es: 'Ciencia (puntos)', en: 'Science (points)', digits: 1 },
  { key: 'tempC', es: 'Temperatura de cabina (°C)', en: 'Cabin temperature (°C)', digits: 1 },
  { key: 'sun', es: 'Luz solar (0 a 1)', en: 'Sunlight (0 to 1)', digits: 2 },
];

/**
 * The mission's telemetry as a CSV table, one row per sample (every few mission hours), ready for a
 * spreadsheet. Spanish uses the separators Spanish-language spreadsheets expect (semicolon,
 * decimal comma); English uses comma and decimal point. A byte-order mark keeps accents intact
 * when the file is opened in Excel.
 */
export function telemetryCsv(s: SimState, lang: 'es' | 'en' | string): string {
  const es = lang === 'es';
  const sep = es ? ';' : ',';
  const num = (v: number, d: number): string => {
    const txt = Number.isFinite(v) ? v.toFixed(d) : '';
    return es ? txt.replace('.', ',') : txt;
  };
  const solH = WORLDS[s.world].solH;
  const dayName = s.world === 'moon' ? (es ? 'Día' : 'Day') : 'Sol';
  const head = [es ? 'Hora de misión' : 'Mission hour', dayName, ...COLUMNS.map((c) => (es ? c.es : c.en))];
  const t = s.telemetry;
  const rows = t.t.map((h, i) => {
    const day = s.world === 'moon' ? Math.floor(h / 24) + 1 : Math.floor(h / solH);
    return [num(h, 1), String(day), ...COLUMNS.map((c) => num(t[c.key][i], c.digits))].join(sep);
  });
  const quote = (x: string): string => (x.includes(sep) || x.includes('"') ? `"${x.replace(/"/g, '""')}"` : x);
  return '﻿' + [head.map(quote).join(sep), ...rows].join('\r\n') + '\r\n';
}

export const CSV_COLUMNS = COLUMNS.length + 2;
