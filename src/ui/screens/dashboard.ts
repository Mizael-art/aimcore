import { cmPer360, edpi } from '../../core/sensitivity';
import { levelInfo } from '../../data/progression';
import { store } from '../../data/store';
import { dayKey, diagnose, evolution, modeSummaries, overallConsistency, streak, totals } from '../../data/stats';
import { MODES, labelFor, modeConfig } from '../../modes/catalog';
import { lineChart } from '../charts';
import { esc, fmtDateTime, fmtDuration, fmtInt, onAct, pct } from '../dom';
import { playWithResults } from '../session';

export function renderDashboard(root: HTMLElement) {
  const d = store.data;
  const s = d.settings;
  const sessions = d.sessions;
  const t = totals(sessions.filter((x) => x.context !== 'lab'));
  const last = sessions[sessions.length - 1];
  const weak = diagnose(sessions)[0];
  const recMode = weak?.mode ?? 'microflick';
  const routineDone = d.routine?.date === dayKey(Date.now()) && d.routine.completed;
  const evo = evolution(sessions, 'day').slice(-21);
  const cons = overallConsistency(modeSummaries(sessions));
  const li = levelInfo(d.profile.xp);
  const lab = d.labResults[d.labResults.length - 1];

  root.innerHTML = `
    <div class="page-head"><div><div class="kicker">Bem-vindo de volta, ${esc(d.profile.name)}</div><h1>Dashboard</h1></div>
      <button class="btn primary big" data-act="start">▶ Começar a treinar</button></div>
    <div class="grid g3">
      <div class="card accent span2">
        <div class="kicker">Treino recomendado</div>
        <h2 style="font-size:24px;margin:8px 0 6px;letter-spacing:.06em">${routineDone ? MODES[recMode].name : 'Rotina diária adaptativa'}</h2>
        <p class="muted" style="margin:0 0 16px">${routineDone ? `Rotina de hoje concluída. Reforço sugerido: ${esc(weak?.reason ?? '')}.` : weak?.hasData ? `Foco atual: ${esc(MODES[recMode].name)} — ${esc(weak.reason)}.` : 'Sem histórico suficiente: comece pela rotina padrão de 20 minutos. Ela se adapta às suas dificuldades.'}</p>
        <div class="row-btns" style="justify-content:flex-start">
          ${routineDone ? `<button class="btn primary" data-act="mode" data-mode="${recMode}">Treinar ${esc(MODES[recMode].name)}</button>` : '<a class="btn primary" href="#routine">Abrir rotina</a>'}
          <a class="btn" href="#lab">Sensitivity Lab</a></div>
      </div>
      <div class="card"><div class="kicker">Sensibilidade configurada</div>
        <div class="big-num" style="margin-top:10px">${s.sens.toFixed(3)}</div>
        <div class="mono muted" style="margin-top:10px;line-height:1.7">${s.dpi} DPI · eDPI ${Math.round(edpi(s.dpi, s.sens))}<br>${cmPer360(s.dpi, s.sens).toFixed(2)} cm/360 · FOV ${s.hfov}°</div>
        ${lab ? `<div class="note" style="margin-top:12px">Lab recomendou <b>${lab.recommended.toFixed(3)}</b>${lab.inconclusive ? ' (inconclusivo)' : ''}</div>` : ''}
        <a class="btn sm" href="#config" style="margin-top:14px">Ajustar</a></div>
    </div>
    <div class="grid g4" style="margin-top:16px">
      <div class="card stat"><div class="v">${last ? fmtInt(last.score) : '—'}</div><div class="l">Última pontuação</div><div class="s">${last ? `${esc(labelFor(last.mode, last.scenario))} · ${fmtDateTime(last.date)}` : 'nenhuma sessão'}</div></div>
      <div class="card stat"><div class="v">${t.shots ? pct(t.accuracy) : '—'}</div><div class="l">Precisão geral</div><div class="s">${fmtInt(t.hits)} acertos · ${fmtInt(t.misses)} erros</div></div>
      <div class="card stat"><div class="v">${fmtDuration(d.profile.totalTimeSec)}</div><div class="l">Tempo total de treino</div><div class="s">${t.sessions} sessões</div></div>
      <div class="card stat"><div class="v">${streak(d.profile.trainingDays)}<small>dias</small></div><div class="l">Sequência</div><div class="s">Nível ${li.level} · ${cons != null ? `consistência ${cons.toFixed(0)}` : 'consistência após 3 sessões'}</div></div>
    </div>
    <div class="grid g3" style="margin-top:16px">
      <div class="card span2"><div class="card-head"><h2>Evolução</h2><span class="muted" style="font-size:12px">índice = % do seu recorde em cada modo · últimos dias</span></div><canvas class="chart" id="evo"></canvas></div>
      <div class="card"><h2>Sessões recentes</h2>${
        sessions.length
          ? sessions.slice(-6).reverse().map((x) => `<div class="list-line"><div><div>${esc(labelFor(x.mode, x.scenario))}</div><div class="dim" style="font-size:11.5px">${fmtDateTime(x.date)} · ${x.context === 'lab' ? 'Lab' : x.context === 'routine' ? 'Rotina' : 'Livre'}</div></div><b class="mono">${fmtInt(x.score)}</b></div>`).join('')
          : '<div class="empty"><b>Nada ainda</b>Jogue um modo para ver resultados aqui.</div>'
      }</div>
    </div>`;

  lineChart(root.querySelector('#evo') as HTMLCanvasElement, [
    { name: 'Índice', values: evo.map((e) => e.index), color: '#ff4655', fill: true },
    { name: 'Precisão %', values: evo.map((e) => (e.accuracy ? e.accuracy * 100 : null)), color: '#8b939e', dashed: true },
  ], { labels: evo.map((e) => e.key.slice(5).split('-').reverse().join('/')), yMin: 0, yMax: 100, yFmt: (v) => v.toFixed(0) });

  return onAct(root, {
    start: () => (location.hash = routineDone ? '#play' : '#routine'),
    mode: (el) => void playWithResults(modeConfig(el.dataset.mode as never, { duration: s.defaultDuration })).then(() => renderDashboard(root)),
  });
}
