import { store } from '../../data/store';
import type { ModeId } from '../../data/types';
import { MODES, labelFor } from '../../modes/catalog';
import { esc, fmtDateTime, fmtInt, modal, ms, onAct, pct } from '../dom';
import { resultsHtml } from '../session';

const PAGE = 40;

export function renderHistory(root: HTMLElement) {
  let mode: ModeId | 'all' = 'all';
  let ctx: 'all' | 'free' | 'routine' | 'lab' = 'all';
  let page = 0;
  const draw = () => {
    const list = store.sessions.filter((s) => (mode === 'all' || s.mode === mode) && (ctx === 'all' || s.context === ctx)).slice().reverse();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    page = Math.min(page, pages - 1);
    const rows = list.slice(page * PAGE, page * PAGE + PAGE);
    root.innerHTML = `
      <div class="page-head"><div><div class="kicker">Registro</div><h1>Histórico</h1></div>
        <div style="display:flex;gap:10px">
          <select id="h-mode" style="width:200px"><option value="all">Todos os modos</option>${(Object.keys(MODES) as ModeId[]).map((m) => `<option value="${m}" ${m === mode ? 'selected' : ''}>${MODES[m].name}</option>`).join('')}</select>
          <select id="h-ctx" style="width:160px">${[['all', 'Todos'], ['free', 'Livre'], ['routine', 'Rotina'], ['lab', 'Sensitivity Lab']].map(([v, l]) => `<option value="${v}" ${v === ctx ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="card">${rows.length ? `<table><thead><tr><th>Data</th><th>Treino</th><th>Origem</th><th class="num">Duração</th><th class="num">Sens</th><th class="num">Pontos</th><th class="num">Precisão</th><th class="num">Tempo</th><th></th></tr></thead><tbody>
        ${rows.map((s) => `<tr><td>${fmtDateTime(s.date)}</td><td>${esc(labelFor(s.mode, s.scenario))}${s.completed ? '' : ' <span class="tag amber">incompleta</span>'}</td>
          <td><span class="tag">${{ free: 'Livre', routine: 'Rotina', lab: 'Lab' }[s.context]}</span></td><td class="num">${s.duration}s</td><td class="num">${s.sens.toFixed(3)}</td>
          <td class="num">${fmtInt(s.score)}</td><td class="num">${s.mode === 'tracking' ? pct(s.trackingPct ?? 0, 1) : pct(s.accuracy, 1)}</td><td class="num">${ms(s.avgTime)}</td>
          <td><button class="btn sm" data-act="open" data-id="${s.id}">Ver</button></td></tr>`).join('')}</tbody></table>
        <div class="row-btns" style="justify-content:space-between;margin-top:14px"><span class="muted">${list.length} sessões</span>
          <span><button class="btn sm" data-act="prev" ${page === 0 ? 'disabled' : ''}>‹</button> <span class="mono muted">${page + 1}/${pages}</span> <button class="btn sm" data-act="next" ${page >= pages - 1 ? 'disabled' : ''}>›</button></span></div>`
        : '<div class="empty"><b>Nenhuma sessão</b>Seu histórico aparece aqui.</div>'}</div>`;
    root.querySelector('#h-mode')!.addEventListener('change', (e) => {
      mode = (e.target as HTMLSelectElement).value as never;
      page = 0;
      draw();
    });
    root.querySelector('#h-ctx')!.addEventListener('change', (e) => {
      ctx = (e.target as HTMLSelectElement).value as never;
      page = 0;
      draw();
    });
  };
  draw();
  return onAct(root, {
    prev: () => {
      page--;
      draw();
    },
    next: () => {
      page++;
      draw();
    },
    open: (el) => {
      const s = store.sessions.find((x) => x.id === el.dataset.id);
      if (!s) return;
      modal(`${resultsHtml(s)}<div class="row-btns" style="margin-top:22px;justify-content:space-between"><button class="btn ghost" data-act="del">Excluir sessão</button><button class="btn primary" data-act="close">Fechar</button></div>`, (a, _e, close) => {
        if (a === 'del') {
          store.data.sessions = store.sessions.filter((x) => x.id !== s.id);
          store.save();
          draw();
        }
        close();
      });
    },
  });
}
