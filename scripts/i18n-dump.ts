/**
 * Dump every interface string (key, Spanish, English) as JSON, for translators:
 *   npx vite-node scripts/i18n-dump.ts > strings.json
 * Quiz texts get keys quiz.<id>.q / .o<n> / .why, the same ones the game looks up.
 */
import { allStrings } from '../src/ui/strings';
import '../src/ui/codexData';
import { QUESTIONS } from '../src/ui/quiz';

const out: Record<string, [string, string]> = {};
for (const [k, v] of Object.entries(allStrings())) out[k] = [v[0], v[1]];
for (const q of QUESTIONS) {
  out[`quiz.${q.id}.q`] = q.q;
  q.options.forEach((o, i) => (out[`quiz.${q.id}.o${i}`] = o));
  out[`quiz.${q.id}.why`] = q.why;
}
console.log(JSON.stringify(out, null, 1));
