import { checkAchievements } from '../../data/progression';
import { buildRoutine } from '../../data/routine';
import { store } from '../../data/store';
import { dayKey, streak } from '../../data/stats';
import type { RoutineDay } from '../../data/types';
import { MODES, modeConfig } from '../../modes/catalog';
import { esc, fmtInt, modal, onAct, pct, toast } from '../dom';
import { resultsHtml, runAndSave } from '../session';

function today(minutes?: number): RoutineDay {
  const d = store.data.routine;
  const key = dayKey(Date.now());
  if (d && d.date === key && (minutes == null || minutes === d.minutes)) return d;
  const mins = minutes ?? d?.minutes ?? 20;
  // não refaz uma rotina já iniciada hoje
  if (d && d.date === key && d.done.length && minutes != null) return d;
  const r = buildRoutine(store.sessions, mins);
  const day: RoutineDay = { date: key, minutes: mins, blocks: r.blocks, done: [], completed: false };
  store.data.routine = day;
  store.save();
  return day;
}

export function renderRoutine(root: HTMLElement) {
  let running = false;
  const draw = () => {
    const day = today();
    const notes = buildRoutine(store.sessions, day.minutes).notes;
    const byId = new Map(store.sessions.map((s) => [s.id, s]));
    const total = day.blocks.reduce((a, b) => a + b.minutes, 0);
    const doneMin = day.blocks.slice(0, day.done.length).reduce((a, b) => a + b.minutes, 0);
    root.innerHTML = `
      <div class="page-head"><div><div class="kicker">Rotina de hoje · ${day.date.split('-').reverse().join('/')}</div><h1>Rotina diária</h1></div>
        <div class="seg">${[10, 20, 30].map((m) => `<button data-act="len" data-m="${m}" class="${m === day.minutes ? 'on' : ''}" ${day.done.length ? 'disabled' : ''}>${m} min</button>`).join('')}</div></div>
      <div class="grid g3">
        <div class="card span2"><div class="card-head"><h2>Blocos</h2><span class="mono muted">${doneMin}/${total} min</span></div>
          <div class="bar" style="margin-bottom:10px"><i style="width:${(doneMin / total) * 100}%"></i></div>
          ${day.blocks.map((b, i) => {
            const rec = day.done[i] ? byId.get(day.done[i]) : null;
            const cur = i === day.done.length && !day.completed;
            return `<div class="list-line" style="${cur ? 'background:var(--redbg);margin:0 -20px;padding:12px 20px' : ''}">
              <div style="display:flex;gap:14px;align-items:center"><span class="mono ${rec ? 'up' : cur ? '' : 'dim'}" style="width:22px">${rec ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <div><div style="font-weight:600">${MODES[b.mode].name} <span class="muted mono" style="font-weight:400">${b.minutes} min</span></div>
              ${b.reason ? `<div style="font-size:12px;color:var(--red)">${esc(b.reason)}</div>` : `<div class="dim" style="font-size:12px">${esc(MODES[b.mode].desc)}</div>`}</div></div>
              <div class="mono">${rec ? `${fmtInt(rec.score)} <span class="dim">${rec.mode === 'tracking' ? pct(rec.trackingPct ?? 0, 0) : pct(rec.accuracy, 0)}</span>` : ''}</div></div>`;
          }).join('')}
          <div class="row-btns" style="justify-content:flex-start;margin-top:18px">
            ${day.completed ? '<span class="tag green">Rotina concluída hoje</span><button class="btn" data-act="redo">Treinar de novo</button>' : `<button class="btn primary big" data-act="go">${day.done.length ? 'Continuar rotina' : 'Iniciar rotina'}</button>`}</div></div>
        <div class="card"><h2>Adaptação</h2>${notes.map((n) => `<p class="note" style="margin:0 0 10px">${esc(n)}</p>`).join('')}
          <p class="muted" style="font-size:12.5px">Regras: dificuldade de precisão → mais Micro Flick; de acompanhar inimigos → mais Tracking; de alternar alvos → mais Target Switching. A rotina é recalculada a cada novo dia com base nas últimas 5 sessões de cada modo.</p>
          <div class="grid g2" style="margin-top:14px"><div class="stat"><div class="v">${store.profile.routinesCompleted}</div><div class="l">Rotinas concluídas</div></div>
          <div class="stat"><div class="v">${streak(store.profile.trainingDays)}</div><div class="l">Dias seguidos</div></div></div></div>
      </div>`;
  };

  const go = async () => {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const day = today();
        if (day.completed) break;
        const i = day.done.length;
        const b = day.blocks[i];
        const cfg = modeConfig(b.mode, { duration: b.mode === 'reaction' ? undefined : Math.round(b.minutes * 60), context: 'routine' });
        cfg.label = `${MODES[b.mode].name} · bloco ${i + 1}/${day.blocks.length}`;
        const out = await runAndSave(cfg);
        if (!out.record || out.aborted) break;
        day.done.push(out.record.id);
        if (day.done.length >= day.blocks.length) {
          day.completed = true;
          store.profile.routinesCompleted++;
          store.profile.xp += 150;
          for (const a of checkAchievements(store.data)) toast('Conquista desbloqueada', `${a.name} — ${a.desc}`, 5000);
          toast('Rotina concluída', '+150 XP de bônus');
        }
        store.save();
        if (day.completed) {
          draw();
          break;
        }
        const next = day.blocks[day.done.length];
        const cont = await new Promise<boolean>((res) =>
          modal(`${resultsHtml(out.record!, { xp: out.progress?.xp, isPB: out.progress?.isPB, prevBest: out.progress?.prevBest })}
            <div class="row-btns" style="margin-top:22px;justify-content:space-between"><span class="muted">Próximo: <b style="color:var(--text)">${MODES[next.mode].name}</b> · ${next.minutes} min</span>
            <span><button class="btn ghost" data-act="stop">Pausar rotina</button> <button class="btn primary" data-act="next">Próximo bloco</button></span></div>`, (a, _e, close) => {
            close();
            res(a === 'next');
          }),
        );
        if (!cont) break;
      }
    } finally {
      running = false;
      draw();
    }
  };

  draw();
  return onAct(root, {
    len: (el) => {
      today(Number(el.dataset.m));
      draw();
    },
    go: () => void go(),
    redo: () => {
      const d = store.data.routine!;
      store.data.routine = { ...d, blocks: buildRoutine(store.sessions, d.minutes).blocks, done: [], completed: false };
      store.save();
      draw();
    },
  });
}
