import { ACHIEVEMENTS } from '../../data/progression';
import { store } from '../../data/store';
import { accuracyByMode, diagnose, evolution, modeSummaries, overallConsistency, personalBests, totals, type Bucket } from '../../data/stats';
import { labelFor } from '../../modes/catalog';
import { barChart, lineChart } from '../charts';
import { esc, fmtDate, fmtDuration, fmtInt, ms, onAct, pct } from '../dom';

export function renderStats(root: HTMLElement) {
  let bucket: Bucket = 'day';
  const draw = () => {
    const ss = store.sessions;
    const free = ss.filter((s) => s.context !== 'lab');
    const t = totals(free);
    const sums = modeSummaries(ss);
    const cons = overallConsistency(sums);
    const byMode = accuracyByMode(ss);
    const pbs = [...personalBests(ss).values()].sort((a, b) => b.date - a.date);
    const weak = diagnose(ss);
    const evo = evolution(ss, bucket).slice(-30);
    const last10 = free.filter((s) => s.completed).slice(-10);
    const prev10 = free.filter((s) => s.completed).slice(-20, -10);
    const accOf = (a: typeof ss) => {
      const sh = a.reduce((x, s) => x + (s.mode === 'reaction' ? 0 : s.shots), 0);
      return sh ? a.reduce((x, s) => x + (s.mode === 'reaction' ? 0 : s.hits), 0) / sh : 0;
    };
    const dAcc = prev10.length ? accOf(last10) - accOf(prev10) : 0;
    const unlocked = ACHIEVEMENTS.filter((a) => store.profile.achievements[a.id]);

    root.innerHTML = `
      <div class="page-head"><div><div class="kicker">Desempenho</div><h1>Estatísticas</h1></div></div>
      ${!ss.length ? '<div class="empty"><b>Sem dados ainda</b>Todas as estatísticas são calculadas a partir das suas sessões reais. Jogue qualquer modo para começar.</div>' : ''}
      <div class="grid g6">
        ${stat(t.shots ? pct(t.accuracy) : '—', 'Precisão geral', prev10.length ? `<span class="${dAcc >= 0 ? 'up' : 'down'}">${dAcc >= 0 ? '▲' : '▼'} ${(Math.abs(dAcc) * 100).toFixed(1)} pp</span> últ. 10` : '')}
        ${stat(t.headshots ? pct(t.headshotAcc) : '—', 'Headshot accuracy', `${fmtInt(t.headshots)} headshots`)}
        ${stat(ms(t.reaction), 'Reação média', 'modo Reaction Time')}
        ${stat(fmtInt(t.hits), 'Alvos acertados', '')}
        ${stat(fmtInt(t.misses), 'Alvos errados', 'tiros errados + expirados')}
        ${stat(cons != null ? cons.toFixed(0) : '—', 'Consistência', cons != null ? 'repetição do desempenho' : 'mín. 3 sessões no modo')}
      </div>
      <div class="grid g3" style="margin-top:16px">
        <div class="card span2"><div class="card-head"><h2>Evolução</h2>
          <div class="seg">${(['day', 'week', 'month'] as Bucket[]).map((b) => `<button data-act="bucket" data-b="${b}" class="${b === bucket ? 'on' : ''}">${{ day: 'Diária', week: 'Semanal', month: 'Mensal' }[b]}</button>`).join('')}</div></div>
          <canvas class="chart tall" id="s-evo"></canvas>
          <p class="muted" style="font-size:12px;margin:8px 0 0">Índice: cada sessão vale (pontuação ÷ seu recorde naquele modo/duração) × 100. Permite comparar modos diferentes.</p></div>
        <div class="card"><h2>Precisão por exercício</h2><canvas class="chart tall" id="s-acc"></canvas></div>
      </div>
      <div class="grid g3" style="margin-top:16px">
        <div class="card span2"><h2>Consistência por modo</h2>
          ${sums.length ? `<table><thead><tr><th>Modo</th><th class="num">Sessões</th><th class="num">Recorde</th><th class="num">Média últ. 10</th><th class="num">Repetição</th><th class="num">Consistência</th><th class="num">Tendência</th></tr></thead><tbody>
          ${sums.map((m) => `<tr><td>${esc(m.label)}</td><td class="num">${m.count}</td><td class="num">${fmtInt(m.best)}</td><td class="num">${fmtInt(m.avgLast)}</td>
            <td class="num">${m.count >= 2 ? pct(m.repeatability, 0) : '—'}</td><td class="num">${m.count >= 3 ? m.consistency.toFixed(0) : '—'}</td>
            <td class="num ${m.trend > 0 ? 'up' : m.trend < 0 ? 'down' : ''}">${m.count >= 10 ? `${m.trend >= 0 ? '+' : ''}${(m.trend * 100).toFixed(1)}%` : '—'}</td></tr>`).join('')}</tbody></table>
          <p class="muted" style="font-size:12px">Repetição = média das últimas 5 ÷ recorde. Uma pontuação alta isolada não sobe a consistência: ela mede quão perto você fica do seu nível sessão após sessão.</p>` : '<div class="empty">Complete sessões para ver a consistência.</div>'}</div>
        <div class="card"><h2>Pontos a melhorar</h2>${weak.map((w) => `<div class="list-line"><div><div>${esc(labelFor(w.mode))}</div><div class="dim" style="font-size:11.5px">${esc(w.reason)}</div></div>${w.hasData ? `<span class="tag ${w.severity > 0.25 ? 'red' : 'green'}">${w.severity > 0.25 ? 'foco' : 'ok'}</span>` : '<span class="tag">sem dados</span>'}</div>`).join('')}</div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h2>Recordes pessoais</h2>${pbs.length ? pbs.slice(0, 12).map((s) => `<div class="list-line"><div>${esc(labelFor(s.mode, s.scenario))} <span class="dim">${s.mode === 'reaction' ? '' : s.duration + 's'}</span></div><div><b class="mono">${s.mode === 'reaction' ? ms(s.avgTime) : fmtInt(s.score)}</b> <span class="dim">${fmtDate(s.date)}</span></div></div>`).join('') : '<div class="empty">Nenhum recorde ainda.</div>'}</div>
        <div class="card"><div class="card-head"><h2>Conquistas</h2><span class="mono muted">${unlocked.length}/${ACHIEVEMENTS.length}</span></div>
          <div class="grid g2">${ACHIEVEMENTS.map((a) => {
            const on = store.profile.achievements[a.id];
            return `<div style="opacity:${on ? 1 : 0.38};display:flex;gap:10px;align-items:flex-start"><span style="color:${on ? 'var(--red)' : 'var(--dim)'};font-size:16px">${on ? '◆' : '◇'}</span><div><div style="font-weight:600">${esc(a.name)}</div><div class="dim" style="font-size:11.5px">${esc(a.desc)}</div></div></div>`;
          }).join('')}</div></div>
      </div>
      <p class="muted" style="font-size:12px;margin-top:16px">Tempo total: ${fmtDuration(store.profile.totalTimeSec)} · ${ss.length} sessões (${ss.length - free.length} do Sensitivity Lab, excluídas das médias)</p>`;

    const fmtK = (k: string) => (bucket === 'month' ? k.split('-').reverse().join('/') : k.slice(5).split('-').reverse().join('/'));
    lineChart(root.querySelector('#s-evo') as HTMLCanvasElement, [
      { name: 'Índice', values: evo.map((e) => e.index), color: '#ff4655', fill: true },
      { name: 'Precisão %', values: evo.map((e) => (e.accuracy ? e.accuracy * 100 : null)), color: '#ece8e1', dashed: true },
    ], { labels: evo.map((e) => fmtK(e.key)), yMin: 0, yMax: 100, yFmt: (v) => v.toFixed(0) });
    barChart(root.querySelector('#s-acc') as HTMLCanvasElement, byMode.map((m) => m.accuracy * 100), {
      labels: byMode.map((m) => m.label.split(' ').map((w) => w[0]).join('')), yMin: 0, yMax: 100, yFmt: (v) => `${v.toFixed(0)}%`, color: '#ff4655',
    });
  };
  draw();
  return onAct(root, {
    bucket: (el) => {
      bucket = el.dataset.b as Bucket;
      draw();
    },
  });
}

const stat = (v: string, l: string, s: string) => `<div class="card stat"><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
