import { store } from '../../data/store';
import { personalBests } from '../../data/stats';
import type { ModeId } from '../../data/types';
import { MODES, SCENARIOS, modeConfig, scenarioConfig } from '../../modes/catalog';
import { WEAPONS } from '../../game/weapons';
import { esc, fmtInt, onAct } from '../dom';
import { playWithResults } from '../session';

const DURATIONS = [30, 60, 90, 120];

export function renderPlay(root: HTMLElement) {
  let dur = store.settings.defaultDuration;

  const draw = () => {
    const pbs = personalBests(store.sessions);
    const pb = (key: string, d: number) => pbs.get(`${key}|${d}`)?.score;
    root.innerHTML = `
      <div class="page-head"><div><div class="kicker">Play</div><h1>Treinamentos</h1></div>
        <div style="text-align:right"><div class="field"><label>Duração</label>
        <div class="seg">${DURATIONS.map((d) => `<button data-act="dur" data-d="${d}" class="${d === dur ? 'on' : ''}">${d}s</button>`).join('')}</div></div></div></div>
      <h2>Modos de treino</h2>
      <div class="grid g4">${(Object.keys(MODES) as ModeId[]).map((id) => {
        const m = MODES[id];
        const d = id === 'reaction' ? m.defaultDuration : dur;
        const best = pb(id, id === 'reaction' ? 0 : d);
        return `<div class="card mode-card" data-act="mode" data-id="${id}"><span class="code">${m.short}</span>
          <div class="kicker">${catName(m.category)}</div><h3>${m.name}</h3><p>${esc(m.desc)}</p>
          <ul>${m.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
          <div class="pb"><span>${id === 'reaction' ? '10 tentativas' : `Recorde ${d}s`}</span><b>${id === 'reaction' ? bestRt() : best != null ? fmtInt(best) : '—'}</b></div></div>`;
      }).join('')}</div>
      <h2 style="margin-top:34px">Cenários VALORANT</h2>
      <p class="muted" style="margin:-6px 0 16px">Alvos com proporção de agente, perfis de arma com cadência e bloom aproximados. Botão direito = ADS (quando a arma tem zoom).</p>
      <div class="grid g4">${SCENARIOS.map((s) => {
        const d = s.mode === 'headshot' && s.id === 'entry' ? Math.max(dur, 60) : dur;
        const best = pb(s.id, d);
        const w = WEAPONS[s.weapon];
        return `<div class="card mode-card" data-act="scen" data-id="${s.id}"><span class="code">${w.name.toUpperCase()}</span>
          <h3>${s.name}</h3><p>${esc(s.desc)}</p><div>${s.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          <div class="pb"><span>Recorde ${d}s</span><b>${best != null ? fmtInt(best) : '—'}</b></div></div>`;
      }).join('')}</div>`;
  };

  const bestRt = () => {
    const r = store.sessions.filter((s) => s.mode === 'reaction' && s.completed && s.avgTime > 0);
    return r.length ? `${Math.min(...r.map((s) => s.avgTime))} ms` : '—';
  };

  draw();
  return onAct(root, {
    dur: (el) => {
      dur = Number(el.dataset.d);
      store.updateSettings({ defaultDuration: dur });
      draw();
    },
    mode: (el) => {
      const id = el.dataset.id as ModeId;
      void playWithResults(modeConfig(id, { duration: id === 'reaction' ? undefined : dur })).then(draw);
    },
    scen: (el) => {
      const id = el.dataset.id!;
      const d = id === 'entry' ? Math.max(dur, 60) : dur;
      void playWithResults(scenarioConfig(id, { duration: d })).then(draw);
    },
  });
}

const catName = (c: string) => ({ precision: 'Precisão', flick: 'Flick', tracking: 'Tracking', switching: 'Switching', reaction: 'Reação', headshot: 'Headshot' })[c] ?? c;
