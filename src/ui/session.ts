import { consistencyFromCv, meanSd } from '../core/flick';
import { applySession, levelInfo } from '../data/progression';
import { store, uid } from '../data/store';
import type { SessionRecord } from '../data/types';
import { getEngine, type RunOptions } from '../game/engine';
import type { ModeConfig } from '../modes/base';
import { labelFor } from '../modes/catalog';
import { esc, fmtInt, modal, ms, pct, toast } from './dom';

export interface PlayOutcome {
  record: SessionRecord | null;
  aborted: boolean;
  next: 'again' | 'menu' | 'continue';
}

/** Executa uma sessão no engine, salva o resultado e aplica progressão. */
export async function runAndSave(cfg: ModeConfig, opt: RunOptions = {}): Promise<{ record: SessionRecord | null; aborted: boolean; progress?: ReturnType<typeof applySession> }> {
  const engine = getEngine();
  if (!engine.root.isConnected) engine.mount(document.body);
  const res = await engine.run(cfg, opt);
  if (document.fullscreenElement && !store.settings.fullscreenOnStart) void document.exitFullscreen().catch(() => {});
  if (!res.record) return { record: null, aborted: true };
  const rec = res.record;
  rec.id = uid();
  // sessões muito curtas/abortadas não poluem o histórico
  if (res.aborted && rec.duration < 10) return { record: null, aborted: true };
  store.data.sessions.push(rec);
  const progress = applySession(store.data, rec);
  store.data.sessions.pop();
  store.addSession(rec);
  for (const a of progress.achievements) toast('Conquista desbloqueada', `${a.name} — ${a.desc}`, 5000);
  if (progress.levelAfter > progress.levelBefore) toast('Level up', `Nível ${progress.levelAfter}`, 4000);
  return { record: rec, aborted: res.aborted, progress };
}

export function resultsHtml(r: SessionRecord, extra: { xp?: number; isPB?: boolean; prevBest?: number } = {}) {
  const isTrack = r.mode === 'tracking';
  const isRt = r.mode === 'reaction';
  const segs = meanSd(r.segments);
  const cons = r.segments.length >= 3 ? consistencyFromCv(segs.mean, segs.sd) : 0;
  const cells: [string, string, string?][] = [];
  if (isRt) {
    cells.push(['Reação média', ms(r.avgTime)], ['Desvio', ms(r.sdTime)], ['Tentativas', String(r.trialsCount)], ['Falsos / antecip.', String(r.falseStarts ?? 0)]);
    const best = r.trials?.length ? Math.min(...r.trials.map((t) => t.t)) : 0;
    cells.push(['Melhor', ms(best)], ['Consistência', `${consistencyFromCv(r.avgTime, r.sdTime).toFixed(0)}`]);
  } else if (isTrack) {
    cells.push(['Tempo no alvo', pct(r.trackingPct ?? 0)], ['Precisão (atirando)', pct(r.accuracy)], ['Ticks', `${r.hits}/${r.shots}`], ['Consistência', cons.toFixed(0)]);
  } else {
    cells.push(['Precisão', pct(r.accuracy)], ['Acertos', fmtInt(r.hits)], ['Erros', fmtInt(r.misses)], [r.mode === 'switching' ? 'Tempo de troca' : 'Tempo por alvo', ms(r.avgTime), r.sdTime ? `± ${Math.round(r.sdTime)} ms` : '']);
    if (r.trialsCount) cells.push(['Overshoot', pct(r.overshoots / r.trialsCount, 0), `${r.overshoots} de ${r.trialsCount}`], ['Undershoot', pct(r.undershoots / r.trialsCount, 0), `${r.undershoots} de ${r.trialsCount}`]);
    if (r.mode === 'headshot') cells.push(['Headshot %', pct(r.hits ? r.headshots / r.hits : 0, 0), `${r.headshots} HS · ${r.bodyshots} corpo`]);
    if (r.crosshairPlacement != null) cells.push(['Erro de pré-mira', `${r.crosshairPlacement.toFixed(2)}°`, 'distância da mira à cabeça no spawn']);
    cells.push(['Consistência', cons.toFixed(0), 'variação entre trechos da sessão']);
  }
  return `
    <div class="res-head"><div><div class="kicker">${r.completed ? 'Sessão concluída' : 'Sessão interrompida'}</div>
      <h1 style="font-size:26px">${esc(labelFor(r.mode, r.scenario))}</h1>
      <div class="muted mono" style="font-size:12px;margin-top:6px">${r.duration}s · sens ${r.sens.toFixed(3)} · ${r.dpi} DPI · eDPI ${Math.round(r.dpi * r.sens)}</div></div>
      <div style="text-align:right"><div class="res-score">${fmtInt(r.score)}</div><div class="muted" style="letter-spacing:.2em;font-size:11px">PONTOS</div>
      ${extra.isPB ? `<div class="pb-badge">NOVO RECORDE${extra.prevBest ? ` · +${fmtInt(r.score - extra.prevBest)}` : ''}</div>` : extra.prevBest ? `<div class="muted" style="font-size:12px;margin-top:8px">Recorde: ${fmtInt(extra.prevBest)}</div>` : ''}</div></div>
    <div class="grid g3">${cells.map(([l, v, s]) => `<div class="card flat stat"><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}</div>
    ${extra.xp ? `<p class="muted" style="margin:16px 0 0">+${extra.xp} XP · Nível ${levelInfo(store.profile.xp).level}</p>` : ''}`;
}

/** Fluxo completo do modo livre: joga → mostra resultado → jogar de novo / sair. */
export async function playWithResults(cfg: ModeConfig): Promise<void> {
  for (;;) {
    const out = await runAndSave({ ...cfg, seed: (Math.random() * 2 ** 32) >>> 0 });
    if (!out.record) return;
    const html = resultsHtml(out.record, { xp: out.progress?.xp, isPB: out.progress?.isPB, prevBest: out.progress?.prevBest });
    const again = await new Promise<boolean>((resolve) => {
      modal(`${html}<div class="row-btns" style="margin-top:24px;justify-content:flex-end"><button class="btn ghost" data-act="close">Voltar</button><button class="btn primary" data-act="again">Jogar de novo</button></div>`, (act, _el, close) => {
        close();
        resolve(act === 'again');
      });
    });
    if (!again) return;
  }
}
