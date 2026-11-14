import { WORLDS } from './worlds';
import type { SimState, Telemetry } from './types';

type Col = { key: Exclude<keyof Telemetry, 'stepH' | 't'>; es: string; en: string; pt: string; fr: string; digits: number };

/** The columns of the export, in order, with headers a spreadsheet can show as they are. */
const COLUMNS: Col[] = [
  { key: 'gen', es: 'Energía generada (kW)', en: 'Power generated (kW)', pt: 'Energia gerada (kW)', fr: 'Puissance produite (kW)', digits: 2 },
  { key: 'demand', es: 'Demanda (kW)', en: 'Demand (kW)', pt: 'Demanda (kW)', fr: 'Demande (kW)', digits: 2 },
  { key: 'stored', es: 'Energía almacenada (kWh)', en: 'Energy stored (kWh)', pt: 'Energia armazenada (kWh)', fr: 'Énergie stockée (kWh)', digits: 1 },
  { key: 'o2', es: 'Oxígeno (kg)', en: 'Oxygen (kg)', pt: 'Oxigênio (kg)', fr: 'Oxygène (kg)', digits: 1 },
  { key: 'water', es: 'Agua (kg)', en: 'Water (kg)', pt: 'Água (kg)', fr: 'Eau (kg)', digits: 1 },
  { key: 'food', es: 'Comida (raciones)', en: 'Food (rations)', pt: 'Comida (rações)', fr: 'Nourriture (rations)', digits: 1 },
  { key: 'co2', es: 'CO2 en cabina (mmHg)', en: 'Cabin CO2 (mmHg)', pt: 'CO2 na cabine (mmHg)', fr: 'CO2 en cabine (mmHg)', digits: 2 },
  { key: 'dose', es: 'Dosis media (mSv)', en: 'Mean dose (mSv)', pt: 'Dose média (mSv)', fr: 'Dose moyenne (mSv)', digits: 2 },
  { key: 'health', es: 'Salud media (%)', en: 'Mean health (%)', pt: 'Saúde média (%)', fr: 'Santé moyenne (%)', digits: 1 },
  { key: 'morale', es: 'Ánimo medio (%)', en: 'Mean morale (%)', pt: 'Moral média (%)', fr: 'Moral moyen (%)', digits: 1 },
  { key: 'science', es: 'Ciencia (puntos)', en: 'Science (points)', pt: 'Ciência (pontos)', fr: 'Science (points)', digits: 1 },
  { key: 'tempC', es: 'Temperatura de cabina (°C)', en: 'Cabin temperature (°C)', pt: 'Temperatura da cabine (°C)', fr: 'Température de cabine (°C)', digits: 1 },
  { key: 'sun', es: 'Luz solar (0 a 1)', en: 'Sunlight (0 to 1)', pt: 'Luz solar (0 a 1)', fr: 'Ensoleillement (0 à 1)', digits: 2 },
];

/**
 * The mission's telemetry as a CSV table, one row per sample (every few mission hours), ready for a
 * spreadsheet. Spanish uses the separators Spanish-language spreadsheets expect (semicolon,
 * decimal comma); English uses comma and decimal point. A byte-order mark keeps accents intact
 * when the file is opened in Excel.
 */
export function telemetryCsv(s: SimState, lang: 'es' | 'en' | 'pt' | 'fr' | string): string {
  // Spanish, Portuguese and French spreadsheets expect a decimal comma, so a semicolon separates
  const es = lang !== 'en';
  const sep = es ? ';' : ',';
  const pick = (c: { es: string; en: string; pt: string; fr: string }): string => (lang === 'es' ? c.es : lang === 'pt' ? c.pt : lang === 'fr' ? c.fr : c.en);
  const num = (v: number, d: number): string => {
    const txt = Number.isFinite(v) ? v.toFixed(d) : '';
    return es ? txt.replace('.', ',') : txt;
  };
  const solH = WORLDS[s.world].solH;
  const dayName = s.world === 'moon' ? pick({ es: 'Día', en: 'Day', pt: 'Dia', fr: 'Jour' }) : 'Sol';
  const head = [pick({ es: 'Hora de misión', en: 'Mission hour', pt: 'Hora da missão', fr: 'Heure de mission' }), dayName, ...COLUMNS.map(pick)];
  const t = s.telemetry;
  const rows = t.t.map((h, i) => {
    const day = s.world === 'moon' ? Math.floor(h / 24) + 1 : Math.floor(h / solH);
    return [num(h, 1), String(day), ...COLUMNS.map((c) => num(t[c.key][i], c.digits))].join(sep);
  });
  const quote = (x: string): string => (x.includes(sep) || x.includes('"') ? `"${x.replace(/"/g, '""')}"` : x);
  return '﻿' + [head.map(quote).join(sep), ...rows].join('\r\n') + '\r\n';
}

export const CSV_COLUMNS = COLUMNS.length + 2;
