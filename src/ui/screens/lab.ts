import { hashSeed, randomSeed } from '../../core/rng';
import { cmPer360, edpi, roundSens } from '../../core/sensitivity';
import { analyzeRound, finalize, initialSensList, LAB_EXERCISES, needsAnotherRound, refineSensList, tiedWithBest, type RoundData } from '../../lab/analysis';
import { store, uid } from '../../data/store';
import type { LabProgress, LabResult, LabRound, ModeId, SessionRecord } from '../../data/types';
import { MODES, modeConfig } from '../../modes/catalog';
import { lineChart } from '../charts';
import { esc, fmtDateTime, modal, onAct, pct, toast } from '../dom';
import { runAndSave } from '../session';
import { checkAchievements } from '../../data/progression';

const LETTERS = 'ABCDEFGHIJ';

function roundDataFrom(map: Record<string, Record<string, string>>): RoundData {
  const byId = new Map(store.sessions.map((s) => [s.id, s]));
  const out: RoundData = new Map();
  for (const [sens, exs] of Object.entries(map)) {
    const m = new Map<ModeId, SessionRecord>();
    for (const [ex, id] of Object.entries(exs)) {
      const r = byId.get(id);
      if (r) m.set(ex as ModeId, r);
    }
    out.set(Number(sens), m);
  }
  return out;
}

function roundComplete(p: LabProgress) {
  return p.current.sensList.every((s) => LAB_EXERCISES.every((ex) => p.current.data[s]?.[ex]));
}

function shuffle(n: number, seed: number) {
  const a = [...Array(n).keys()];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function renderLab(root: HTMLElement) {
  let viewResult: LabResult | null = null;
  let running = false;

  const draw = () => {
    const p = store.data.lab;
    if (viewResult) return drawFinal(viewResult);
    if (!p) return drawSetup();
    return drawProgress(p);
  };

  // ---------- Etapa 1 ----------
  const drawSetup = () => {
    const s = store.settings;
    const prev = store.data.labResults;
    root.innerHTML = `
      <div class="page-head"><div><div class="kicker">Descoberta de sensibilidade</div><h1>Sensitivity Lab</h1></div></div>
      ${steps(1)}
      <div class="grid g3">
        <div class="card span2"><h2>Configuração inicial</h2>
          <div class="grid g2">
            <div class="field"><label>DPI atual</label><input type="number" id="l-dpi" value="${s.dpi}" min="100" max="32000" step="50"></div>
            <div class="field"><label>Sensibilidade atual (VALORANT)</label><input type="number" id="l-sens" value="${s.sens}" min="0.01" max="10" step="0.001"></div>
            <div class="field"><label>Estilo de mira</label><select id="l-style"><option value="wrist">Pulso</option><option value="hybrid" selected>Misto</option><option value="arm">Braço</option></select><div class="help">Desloca a faixa de testes: braço testa mais valores baixos, pulso mais altos.</div></div>
            <div class="field"><label>Experiência</label><select id="l-exp"><option value="beginner">Iniciante</option><option value="intermediate" selected>Intermediário</option><option value="advanced">Avançado</option></select><div class="help">Iniciantes testam uma faixa mais larga; avançados, mais estreita.</div></div>
            <div class="field"><label>Prioridade</label><select id="l-pref"><option value="precision">Precisão</option><option value="balanced" selected>Equilíbrio</option><option value="speed">Velocidade</option></select><div class="help">Ajusta os pesos. Precisão e consistência sempre pesam mais que velocidade.</div></div>
            <div class="field"><label>Duração por exercício</label><select id="l-dur"><option value="20">20 s</option><option value="30" selected>30 s</option><option value="45">45 s</option></select></div>
          </div>
          <label class="check" style="margin-top:16px"><input type="checkbox" id="l-blind" checked> Teste cego (oculta o valor da sensibilidade durante os testes, evita viés)</label>
        </div>
        <div class="card accent" id="l-preview"></div>
      </div>
      <div class="card" style="margin-top:16px"><h2>Como funciona</h2>
        <div class="grid g4" style="font-size:13px">
          <div><div class="kicker">01</div><p class="muted">Cada sensibilidade joga <b>Micro Flick, Wide Flick, Target Switching e Micro Adjustment</b> com a mesma seed, dificuldade e duração.</p></div>
          <div><div class="kicker">02</div><p class="muted">A ordem das sensibilidades é embaralhada para diluir aprendizado e cansaço.</p></div>
          <div><div class="kicker">03</div><p class="muted">Pontuação composta: precisão, consistência, over/undershoot, erros e velocidade, com margem de erro por bootstrap.</p></div>
          <div><div class="kicker">04</div><p class="muted">Uma 2ª bateria refina ao redor da melhor. Empates estatísticos viram uma faixa estável ou um resultado inconclusivo.</p></div>
        </div>
        <p class="note" style="margin-top:14px">Aqueça 5 minutos antes (ex.: rotina ou modos livres). Resultados de quem está frio ou cansado são menos confiáveis.</p>
      </div>
      ${prev.length ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>Testes anteriores</h2></div>
        <canvas class="chart" id="l-hist" style="height:180px"></canvas>
        ${prev.slice().reverse().map((r) => `<div class="list-line"><div>${fmtDateTime(r.date)} · ${r.dpi} DPI · original ${r.originalSens.toFixed(3)}</div><div><b class="mono">${r.recommended.toFixed(3)}</b> ${r.inconclusive ? '<span class="tag amber">inconclusivo</span>' : ''} <button class="btn sm" data-act="view" data-id="${r.id}">Ver</button></div></div>`).join('')}</div>` : ''}`;
    const upd = () => {
      const dpi = Number((root.querySelector('#l-dpi') as HTMLInputElement).value) || 800;
      const sens = Number((root.querySelector('#l-sens') as HTMLInputElement).value) || 0.3;
      const list = initialSensList(sens, val('l-style') as never, val('l-exp') as never);
      const dur = Number(val('l-dur'));
      const mins = (list.length * LAB_EXERCISES.length * (dur + 6)) / 60;
      (root.querySelector('#l-preview') as HTMLElement).innerHTML = `<h2>Cálculo</h2>
        <div class="grid g2"><div class="stat"><div class="v">${Math.round(edpi(dpi, sens))}</div><div class="l">eDPI</div></div>
        <div class="stat"><div class="v">${cmPer360(dpi, sens).toFixed(1)}<small>cm</small></div><div class="l">cm/360</div></div></div>
        <h3 style="margin-top:18px">Faixa inicial de testes</h3><div>${list.map((x) => `<span class="tag ${x === roundSens(sens) ? 'red' : ''}">${x.toFixed(3)}</span>`).join('')}</div>
        <p class="muted" style="font-size:12.5px">${list.length} sensibilidades × 4 exercícios · ~${Math.round(mins)} min na 1ª bateria + ~${Math.round((5 * 4 * (dur + 6)) / 60)} min por refinamento.</p>
        <button class="btn primary" data-act="begin" style="width:100%;margin-top:6px">Iniciar testes</button>`;
    };
    const val = (id: string) => (root.querySelector('#' + id) as HTMLSelectElement).value;
    root.querySelectorAll('input,select').forEach((e) => e.addEventListener('input', upd));
    upd();
    if (prev.length) {
      lineChart(root.querySelector('#l-hist') as HTMLCanvasElement, [
        { name: 'Recomendada', values: prev.map((r) => r.recommended), color: '#ff4655' },
        { name: 'Original', values: prev.map((r) => r.originalSens), color: '#8b939e', dashed: true },
      ], { labels: prev.map((r) => fmtDateTime(r.date).slice(0, 5)), yFmt: (v) => v.toFixed(3) });
    }
  };

  const begin = () => {
    const g = (id: string) => (root.querySelector('#' + id) as HTMLInputElement).value;
    const dpi = Number(g('l-dpi'));
    const sens = Number(g('l-sens'));
    if (!(dpi > 0) || !(sens > 0)) return toast('Dados inválidos', 'Informe DPI e sensibilidade válidos.');
    const seedBase = randomSeed();
    const list = initialSensList(sens, g('l-style') as never, g('l-exp') as never);
    store.data.lab = {
      dpi, originalSens: roundSens(sens), style: g('l-style') as never, experience: g('l-exp') as never, preference: g('l-pref') as never,
      exerciseDuration: Number(g('l-dur')), blind: (root.querySelector('#l-blind') as HTMLInputElement).checked, seedBase,
      rounds: [], current: { sensList: list, order: shuffle(list.length, seedBase), data: {} }, startedAt: Date.now(),
    };
    store.save();
    draw();
  };

  // ---------- Etapas 2–4 ----------
  const analyzed = (p: LabProgress): LabRound[] => p.rounds.map((r) => analyzeRound(roundDataFrom(r), p.preference));

  const drawProgress = (p: LabProgress) => {
    const done = roundComplete(p);
    const roundNo = p.rounds.length + 1;
    const prevRounds = analyzed(p);
    const cur = done ? analyzeRound(roundDataFrom(p.current.data), p.preference) : null;
    const total = p.current.sensList.length * LAB_EXERCISES.length;
    const doneCount = p.current.sensList.reduce((a, s) => a + LAB_EXERCISES.filter((ex) => p.current.data[s]?.[ex]).length, 0);
    const label = (s: number) => (p.blind && !done ? `Sens ${LETTERS[p.current.order.indexOf(p.current.sensList.indexOf(s))]}` : s.toFixed(3));
    const ordered = p.current.order.map((i) => p.current.sensList[i]);
    root.innerHTML = `
      <div class="page-head"><div><div class="kicker">Sensitivity Lab · bateria ${roundNo}${roundNo > 1 ? ' (refinamento)' : ''}</div><h1>${done ? 'Análise da bateria' : 'Testes de sensibilidade'}</h1></div>
        <button class="btn ghost" data-act="cancel">Cancelar teste</button></div>
      ${steps(done ? 3 : roundNo > 1 ? 4 : 2)}
      ${done && cur ? roundView(cur, prevRounds, p) : `
      <div class="grid g3">
        <div class="card span2"><div class="card-head"><h2>Progresso</h2><span class="mono muted">${doneCount}/${total}</span></div>
          <div class="bar" style="margin-bottom:16px"><i style="width:${(doneCount / total) * 100}%"></i></div>
          <table><thead><tr><th>Ordem</th><th>Sensibilidade</th>${LAB_EXERCISES.map((e) => `<th>${MODES[e].short}</th>`).join('')}</tr></thead><tbody>
          ${ordered.map((s, i) => `<tr><td class="mono">${i + 1}</td><td class="mono">${label(s)}</td>${LAB_EXERCISES.map((ex) => {
            const id = p.current.data[s]?.[ex];
            const r = id ? store.sessions.find((x) => x.id === id) : null;
            return `<td>${r ? `<span class="tag green">${pct(r.accuracy, 0)}</span>` : '<span class="dim">—</span>'}</td>`;
          }).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="card accent"><h2>Próximo teste</h2>${nextInfo(p, label)}
          <button class="btn primary big" data-act="run" style="width:100%;margin-top:12px">${doneCount ? 'Continuar bateria' : 'Iniciar bateria'}</button>
          <p class="muted" style="font-size:12.5px">Os testes rodam em sequência; cada um pede um clique para capturar o mouse. ESC pausa, Q interrompe — o progresso fica salvo.</p></div>
      </div>`}`;
    if (done && cur) drawRoundChart(cur, prevRounds);
  };

  const nextInfo = (p: LabProgress, label: (s: number) => string) => {
    const n = nextTest(p);
    if (!n) return '';
    return `<div class="big-num" style="font-size:38px;margin:6px 0">${label(n.sens)}</div><div class="muted">${MODES[n.ex].name} · ${p.exerciseDuration}s</div>`;
  };

  const nextTest = (p: LabProgress) => {
    for (const i of p.current.order) {
      const s = p.current.sensList[i];
      for (const ex of LAB_EXERCISES) if (!p.current.data[s]?.[ex]) return { sens: s, ex };
    }
    return null;
  };

  const runBattery = async () => {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const p = store.data.lab;
        if (!p) break;
        const n = nextTest(p);
        if (!n) break;
        const letter = LETTERS[p.current.order.indexOf(p.current.sensList.indexOf(n.sens))];
        const cfg = modeConfig(n.ex, { duration: p.exerciseDuration, context: 'lab', seed: hashSeed(`${p.seedBase}-${p.rounds.length}-${n.ex}`) });
        cfg.label = `${MODES[n.ex].name}`;
        const out = await runAndSave(cfg, { sens: n.sens, blind: p.blind, subtitle: p.blind ? `Sens ${letter}` : `Lab ${n.sens.toFixed(3)}` });
        if (!out.record || out.aborted) break; // interrompido: não conta (mesma duração para todas)
        (p.current.data[n.sens] ??= {})[n.ex] = out.record.id;
        store.save();
      }
    } finally {
      running = false;
      draw();
    }
  };

  const roundView = (cur: LabRound, prev: LabRound[], p: LabProgress) => {
    const tied = tiedWithBest(cur);
    const more = needsAnotherRound([...prev, cur]);
    return `<div class="grid g3">
      <div class="card span2"><div class="card-head"><h2>Desempenho por sensibilidade</h2><span class="muted" style="font-size:12px">pontuação composta ± erro-padrão</span></div><canvas class="chart tall" id="l-chart"></canvas></div>
      <div class="card accent"><h2>Melhor desta bateria</h2><div class="big-num">${cur.best.toFixed(3)}</div>
        <p class="muted">Faixa estatisticamente empatada: ${tied.map((c) => c.sens.toFixed(3)).join(', ')}</p>
        ${more ? `<p class="note">A melhor candidata ainda está se movendo — próximo passo: refinamento com ${refineSensList(cur.best).map((x) => x.toFixed(3)).join(' · ')}.</p>` : '<p class="note">Faixa estável encontrada.</p>'}
        <div class="row-btns" style="justify-content:flex-start;margin-top:14px">
          ${more ? '<button class="btn primary" data-act="refine">Iniciar refinamento</button>' : ''}
          <button class="btn ${more ? '' : 'primary'}" data-act="final">${more ? 'Finalizar agora' : 'Ver resultado final'}</button></div></div>
    </div>
    <div class="card" style="margin-top:16px"><h2>Detalhes</h2>${candTable(cur)}</div>
    <p class="muted" style="font-size:12px">Bateria ${p.rounds.length + 1} · prioridade ${p.preference} · ${p.exerciseDuration}s por exercício</p>`;
  };

  const drawRoundChart = (cur: LabRound, prev: LabRound[]) => {
    const all = [...new Set([...prev.flatMap((r) => r.sensList), ...cur.sensList])].sort((a, b) => a - b);
    const byS = (r: LabRound) => all.map((s) => r.candidates.find((c) => c.sens === s)?.score ?? null);
    const series = [{ name: 'Bateria atual', values: byS(cur), color: '#ff4655' }, ...prev.map((r, i) => ({ name: `Bateria ${i + 1}`, values: byS(r), color: ['#8b939e', '#59a8ff'][i % 2], dashed: true }))];
    lineChart(root.querySelector('#l-chart') as HTMLCanvasElement, series, {
      labels: all.map((s) => s.toFixed(3)), highlight: all.indexOf(cur.best), errors: all.map((s) => cur.candidates.find((c) => c.sens === s)?.se ?? 0), yFmt: (v) => v.toFixed(0),
    });
  };

  const candTable = (r: LabRound) => `<div class="cand head"><span>Sens</span><span>Pontuação</span><span class="num">Precisão</span><span class="num">Tempo</span><span class="num">Over</span><span class="num">Under</span><span class="num">Consist.</span></div>
    ${r.candidates.map((c) => `<div class="cand ${c.sens === r.best ? 'best' : ''}"><span class="mono">${c.sens.toFixed(3)}</span>
      <span><div class="bar"><i style="width:${c.score}%"></i></div><span class="mono dim" style="font-size:11px">${c.score.toFixed(1)} ± ${c.se.toFixed(1)}</span></span>
      <span class="num">${pct(c.accuracy, 1)}</span><span class="num">${c.avgTime} ms</span><span class="num">${pct(c.overRate, 0)}</span><span class="num">${pct(c.underRate, 0)}</span><span class="num">${c.consistency.toFixed(0)}</span></div>`).join('')}`;

  const advance = (final: boolean) => {
    const p = store.data.lab!;
    const cur = analyzeRound(roundDataFrom(p.current.data), p.preference);
    p.rounds.push(p.current.data);
    if (!final) {
      const list = refineSensList(cur.best);
      p.current = { sensList: list, order: shuffle(list.length, p.seedBase + p.rounds.length), data: {} };
      store.save();
      draw();
      return;
    }
    const rounds = analyzed(p);
    const res = finalize({ id: uid(), date: Date.now(), dpi: p.dpi, originalSens: p.originalSens, style: p.style, experience: p.experience, preference: p.preference, exerciseDuration: p.exerciseDuration, rounds });
    delete store.data.lab;
    store.addLabResult(res);
    for (const a of checkAchievements(store.data)) toast('Conquista desbloqueada', `${a.name} — ${a.desc}`, 5000);
    store.save();
    viewResult = res;
    draw();
  };

  // ---------- Etapa 5 ----------
  const drawFinal = (r: LabResult) => {
    const diff = (r.recommended - r.originalSens) / r.originalSens;
    const xs = [...new Set(r.rounds.flatMap((rd) => rd.sensList))].sort((a, b) => a - b);
    root.innerHTML = `
      <div class="page-head"><div><div class="kicker">Sensitivity Lab · ${fmtDateTime(r.date)}</div><h1>Resultado final</h1></div>
        <div class="row-btns"><button class="btn ghost" data-act="back">Voltar</button><button class="btn primary" data-act="apply">Aplicar ${r.recommended.toFixed(3)}</button></div></div>
      ${steps(5)}
      ${r.inconclusive ? '<div class="card" style="border-color:var(--amber);margin-bottom:16px"><b style="color:var(--amber);letter-spacing:.14em">RESULTADO INCONCLUSIVO</b><p class="muted" style="margin:6px 0 0">As diferenças medidas estão dentro da variação natural. A sensibilidade abaixo é só a melhor candidata — não há evidência forte para mudar.</p></div>' : ''}
      <div class="grid g6">
        ${[['Sensibilidade atual', r.originalSens.toFixed(3)], ['Recomendada', r.recommended.toFixed(3)], ['DPI', String(r.dpi)], ['eDPI', String(Math.round(edpi(r.dpi, r.recommended)))], ['cm/360', cmPer360(r.dpi, r.recommended).toFixed(1)], ['Diferença', `${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(1)}%`]]
          .map(([l, v], i) => `<div class="card ${i === 1 ? 'accent' : ''} stat"><div class="v" ${i === 1 ? 'style="color:var(--red)"' : ''}>${v}</div><div class="l">${l}</div></div>`).join('')}
      </div>
      <div class="grid g3" style="margin-top:16px">
        <div class="card span2"><div class="card-head"><h2>Desempenho por sensibilidade</h2><span class="muted" style="font-size:12px">faixa estável ${r.range[0].toFixed(3)}–${r.range[1].toFixed(3)}</span></div><canvas class="chart tall" id="f-chart"></canvas></div>
        <div class="card"><h2>Diagnóstico</h2>
          <div class="list-line"><span class="muted">Alta demais</span><span class="mono">${r.verdicts.tooHigh.map((x) => x.toFixed(3)).join(', ') || '—'}</span></div>
          <div class="list-line"><span class="muted">Baixa demais</span><span class="mono">${r.verdicts.tooLow.map((x) => x.toFixed(3)).join(', ') || '—'}</span></div>
          <div class="list-line"><span class="muted">Melhor equilíbrio</span><span class="mono">${r.verdicts.bestBalance.toFixed(3)}</span></div>
          <div class="list-line"><span class="muted">Mais consistente</span><span class="mono">${r.verdicts.mostConsistent.toFixed(3)}</span></div>
          <div class="list-line"><span class="muted">cm/360 atual → novo</span><span class="mono">${cmPer360(r.dpi, r.originalSens).toFixed(1)} → ${cmPer360(r.dpi, r.recommended).toFixed(1)}</span></div></div>
      </div>
      <div class="card" style="margin-top:16px"><h2>Justificativa</h2>${r.justification.map((j) => `<p class="note" style="margin:0 0 10px">${esc(j)}</p>`).join('')}</div>
      ${r.rounds.map((rd, i) => `<div class="card" style="margin-top:16px"><h2>Bateria ${i + 1}</h2>${candTable(rd)}</div>`).join('')}`;
    // cada bateria é normalizada pela própria média: uma série por bateria
    const colors = ['#8b939e', '#ff4655', '#59a8ff'];
    const last = r.rounds.length - 1;
    lineChart(root.querySelector('#f-chart') as HTMLCanvasElement, r.rounds.map((rd, i) => ({
      name: `Bateria ${i + 1}`, values: xs.map((x) => rd.candidates.find((c) => c.sens === x)?.score ?? null), color: i === last ? '#ff4655' : colors[i % 3 === 1 ? 0 : i % 3], dashed: i !== last,
    })), {
      labels: xs.map((x) => x.toFixed(3)), highlight: xs.indexOf(r.recommended), errors: xs.map((x) => r.rounds[0].candidates.find((c) => c.sens === x)?.se ?? 0), yFmt: (v) => v.toFixed(0),
      bands: [{ from: xs.indexOf(r.range[0]), to: xs.indexOf(r.range[1]), color: 'rgba(255,70,85,0.08)' }].filter((b) => b.from >= 0 && b.to >= 0),
    });
  };

  draw();
  return onAct(root, {
    begin,
    run: () => void runBattery(),
    refine: () => advance(false),
    final: () => advance(true),
    cancel: () =>
      modal('<h2>Cancelar o teste?</h2><p class="muted">O progresso desta bateria será descartado (as sessões continuam no histórico).</p><div class="row-btns" style="justify-content:flex-end"><button class="btn ghost" data-act="no">Não</button><button class="btn primary" data-act="yes">Cancelar teste</button></div>', (a, _e, close) => {
        close();
        if (a === 'yes') {
          delete store.data.lab;
          store.save();
          draw();
        }
      }),
    view: (el) => {
      viewResult = store.data.labResults.find((r) => r.id === el.dataset.id) ?? null;
      draw();
    },
    back: () => {
      viewResult = null;
      draw();
    },
    apply: () => {
      if (!viewResult) return;
      store.updateSettings({ sens: viewResult.recommended, dpi: viewResult.dpi });
      toast('Sensibilidade aplicada', `${viewResult.recommended.toFixed(3)} @ ${viewResult.dpi} DPI — lembre de usar o mesmo valor no VALORANT.`);
    },
  });
}

function steps(on: number) {
  const names = ['Configuração', 'Testes', 'Análise', 'Refinamento', 'Resultado'];
  return `<div class="lab-steps">${names.map((n, i) => `<div class="${i + 1 === on ? 'on' : i + 1 < on ? 'done' : ''}"><span>0${i + 1}</span>${n}</div>`).join('')}</div>`;
}
