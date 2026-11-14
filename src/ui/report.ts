import { scoreMission } from '../sim/missions';
import { lessons } from '../sim/advisor';
import type { SimState } from '../sim/types';
import { tx, type Level, type ShownQuestion } from './quiz';
import { getLang, t } from './strings';

export interface QuizAnswer {
  shown: ShownQuestion;
  /** Index into the question's options, or null if unanswered. */
  chosen: number | null;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * A one-page report a student can hand in: the mission, how it went, what it taught, and the
 * answers to the comprehension questions. Plain HTML with print styles, so it opens anywhere
 * and prints cleanly.
 */
export function teacherReport(sim: SimState, level: Level, answers: QuizAnswer[], student: string): string {
  const score = scoreMission(sim);
  const es = getLang() === 'es';
  const num = (v: number, d = 0): string => v.toLocaleString(es ? 'es-ES' : 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const ok = sim.outcome?.result === 'success';
  const date = new Date().toLocaleString(es ? 'es-ES' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' });
  const right = answers.filter((a) => a.chosen === 0).length;
  const pillars: Array<[string, number]> = [
    [t('end.pillar.crew'), score.crew],
    [t('end.pillar.radiation'), score.radiation],
    [t('end.pillar.science'), score.science],
    [t('end.pillar.power'), score.power],
    [t('end.pillar.sustain'), score.sustain],
  ];
  const st = sim.stats;
  const rows = (pairs: Array<[string, string]>): string => pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  const quiz = answers
    .map((a, i) => {
      const q = a.shown.question;
      const opts = a.shown.order
        .map((o) => {
          const mark = o === 0 ? ' class="right"' : o === a.chosen ? ' class="wrong"' : '';
          const tick = o === a.chosen ? ' ◀' : '';
          return `<li${mark}>${esc(tx(q.options[o]))}${tick}</li>`;
        })
        .join('');
      return `<div class="q"><h4>${i + 1}. ${esc(tx(q.q))}</h4><ol type="a">${opts}</ol><p class="why">${esc(tx(q.why))}</p></div>`;
    })
    .join('');
  const learned = lessons(sim)
    .map((l) => `<li class="${l.good ? 'good' : 'bad'}">${esc(t(`lesson.${l.key}`, l.params))}</li>`)
    .join('');
  const title = es ? 'Informe de misión' : 'Mission report';
  return `<!doctype html>
<html lang="${es ? 'es' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Helios Outpost</title>
<style>
  body { font: 15px/1.5 system-ui, "Segoe UI", sans-serif; color: #16181b; background: #fff; max-width: 820px; margin: 2em auto; padding: 0 1.2em; }
  h1 { font-size: 1.6em; margin: 0 0 0.2em; } h2 { font-size: 1.15em; margin: 1.6em 0 0.5em; border-bottom: 2px solid #16181b; padding-bottom: 0.2em; }
  h4 { margin: 0 0 0.3em; font-size: 1em; }
  .meta { color: #555; margin: 0 0 1em; }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 0.35em 0.6em; border-bottom: 1px solid #ddd; } th { width: 45%; font-weight: 600; }
  .bar { height: 8px; background: #eee; } .bar i { display: block; height: 8px; background: #16181b; }
  .q { margin: 0 0 1.1em; } .q ol { margin: 0.2em 0; } .right { color: #1a7f37; font-weight: 600; } .wrong { color: #b42318; text-decoration: line-through; }
  .why { margin: 0.2em 0 0; color: #444; font-size: 0.93em; }
  ul.lessons li.good::marker { content: "✓  "; color: #1a7f37; } ul.lessons li.bad::marker { content: "!  "; color: #b42318; }
  .sign { margin-top: 2.5em; display: flex; gap: 3em; } .sign div { flex: 1; border-top: 1px solid #16181b; padding-top: 0.3em; color: #555; font-size: 0.9em; }
  @media print { body { margin: 0; } h2 { break-after: avoid; } .q { break-inside: avoid; } }
</style>
</head>
<body>
<h1>${title}: ${esc(t(`mission.${sim.missionId}.name`))}</h1>
<p class="meta">${esc(t(`mission.${sim.missionId}.site`))} · ${esc(date)}${student ? ` · ${esc(student)}` : ''}</p>
<h2>${es ? 'Resultado' : 'Outcome'}</h2>
<table>${rows([
    [es ? 'Resultado' : 'Result', ok ? t('end.success') : t('end.abort')],
    [es ? 'Puntuación' : 'Score', `${num(score.total)} / 100 · ${t(`end.rank.${score.rank}`)}`],
    [es ? 'Nivel' : 'Level', t(`set.level.${level}`)],
    [t('end.stat.dose'), `${num(score.maxDose, 1)} mSv (${es ? 'límite' : 'limit'} ${sim.cfg.doseLimitMsv})`],
    [t('end.stat.samples'), String(st.samplesCollected)],
    [t('end.stat.harvests'), String(st.harvests)],
    [t('end.stat.eva'), num(st.evaH, 1)],
    [es ? 'Expedición' : 'Expedition', sim.flags.expedition ? (es ? 'completada' : 'completed') : es ? 'no realizada' : 'not done'],
  ])}</table>
<table style="margin-top:0.8em">${pillars.map(([k, v]) => `<tr><th>${esc(k)}</th><td><div class="bar"><i style="width:${Math.round(v)}%"></i></div></td><td style="width:3em;text-align:right">${num(v)}</td></tr>`).join('')}</table>
<h2>${esc(t('end.lessons'))}</h2>
<ul class="lessons">${learned}</ul>
<h2>${es ? 'Preguntas de comprensión' : 'Comprehension questions'} · ${right} / ${answers.length}</h2>
${quiz}
<div class="sign"><div>${es ? 'Alumno o alumna' : 'Student'}</div><div>${es ? 'Docente' : 'Teacher'}</div></div>
<p class="meta" style="margin-top:2em">Helios Outpost · NASA Space Apps Challenge 2026 · ${es ? 'Las cifras científicas y sus fuentes están en docs/SCIENCE.md del proyecto.' : 'Scientific figures and their sources are in docs/SCIENCE.md of the project.'}</p>
</body>
</html>`;
}

/** Hand the report to the browser (or the desktop app) as a file to save. */
export function downloadReport(html: string, missionId: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const day = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `helios-${missionId}-${day}.html`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
