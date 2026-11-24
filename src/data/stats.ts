import { consistencyFromCv, meanSd } from '../core/flick';
import { MODES, labelFor } from '../modes/catalog';
import type { Category, ModeId, SessionRecord } from './types';

/** Agregações calculadas exclusivamente a partir das sessões reais registradas. */

export const dayKey = (t: number | Date) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const sessionKey = (s: Pick<SessionRecord, 'mode' | 'scenario' | 'duration'>) => `${s.scenario ?? s.mode}|${s.mode === 'reaction' ? 0 : s.duration}`;

export function totals(sessions: SessionRecord[]) {
  const shots = sessions.reduce((a, s) => a + (s.mode === 'reaction' ? 0 : s.shots), 0);
  const hits = sessions.reduce((a, s) => a + (s.mode === 'reaction' ? 0 : s.hits), 0);
  const hum = sessions.filter((s) => s.mode === 'headshot');
  const hsHits = hum.reduce((a, s) => a + s.hits, 0);
  const hs = hum.reduce((a, s) => a + s.headshots, 0);
  const reactions = sessions.filter((s) => s.mode === 'reaction' && s.avgTime > 0);
  const rt = reactions.length ? reactions.reduce((a, s) => a + s.avgTime * s.trialsCount, 0) / Math.max(1, reactions.reduce((a, s) => a + s.trialsCount, 0)) : 0;
  return {
    sessions: sessions.length,
    shots,
    hits,
    misses: sessions.reduce((a, s) => a + (s.mode === 'reaction' ? 0 : s.misses), 0),
    accuracy: shots ? hits / shots : 0,
    headshotAcc: hsHits ? hs / hsHits : 0,
    headshots: hs,
    reaction: rt,
    timeSec: sessions.reduce((a, s) => a + s.duration, 0),
  };
}

/** Melhor pontuação por chave (modo/cenário + duração), excluindo o Lab. */
export function personalBests(sessions: SessionRecord[]) {
  const m = new Map<string, SessionRecord>();
  for (const s of sessions) {
    if (!s.completed || s.context === 'lab') continue;
    const k = sessionKey(s);
    const cur = m.get(k);
    if (!cur || s.score > cur.score) m.set(k, s);
  }
  return m;
}

export interface ModeSummary {
  key: string;
  label: string;
  mode: ModeId;
  count: number;
  best: number;
  last: number;
  avgLast: number;
  accuracy: number;
  consistency: number; // 0..100
  repeatability: number; // média últimas 5 / recorde
  trend: number; // diferença % entre últimas 5 e 5 anteriores
}

export function modeSummaries(sessions: SessionRecord[]): ModeSummary[] {
  const groups = new Map<string, SessionRecord[]>();
  for (const s of sessions) {
    if (!s.completed || s.context === 'lab') continue;
    const k = sessionKey(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  const out: ModeSummary[] = [];
  for (const [k, arr] of groups) {
    arr.sort((a, b) => a.date - b.date);
    const scores = arr.map((s) => s.score);
    const last10 = scores.slice(-10);
    const ms = meanSd(last10);
    const best = Math.max(...scores);
    const l5 = meanSd(scores.slice(-5)).mean;
    const p5 = scores.length >= 10 ? meanSd(scores.slice(-10, -5)).mean : 0;
    const shots = arr.reduce((a, s) => a + s.shots, 0);
    const hits = arr.reduce((a, s) => a + s.hits, 0);
    out.push({
      key: k,
      label: labelFor(arr[0].mode, arr[0].scenario) + ` · ${arr[0].duration}s`,
      mode: arr[0].mode,
      count: arr.length,
      best,
      last: scores[scores.length - 1],
      avgLast: ms.mean,
      accuracy: shots ? hits / shots : 0,
      consistency: last10.length >= 3 ? consistencyFromCv(ms.mean, ms.sd) : 0,
      repeatability: best > 0 ? l5 / best : 0,
      trend: p5 > 0 ? (l5 - p5) / p5 : 0,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Consistência geral: média ponderada das consistências por modo (mín. 3 sessões). */
export function overallConsistency(sums: ModeSummary[]) {
  const valid = sums.filter((s) => s.count >= 3);
  if (!valid.length) return null;
  const w = valid.reduce((a, s) => a + Math.min(10, s.count), 0);
  return valid.reduce((a, s) => a + s.consistency * Math.min(10, s.count), 0) / w;
}

export type Bucket = 'day' | 'week' | 'month';

function bucketKey(t: number, b: Bucket) {
  const d = new Date(t);
  if (b === 'day') return dayKey(d);
  if (b === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  // semana ISO simplificada: segunda-feira da semana
  const day = (d.getDay() + 6) % 7;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return dayKey(mon);
}

export interface EvoPoint {
  key: string;
  accuracy: number;
  sessions: number;
  minutes: number;
  /** pontuação normalizada: média de (score / recorde da chave) × 100 */
  index: number;
  reaction: number;
}

/** Evolução por dia/semana/mês. O índice normaliza cada sessão pelo recorde do próprio modo. */
export function evolution(sessions: SessionRecord[], b: Bucket): EvoPoint[] {
  const pbs = personalBests(sessions);
  const m = new Map<string, SessionRecord[]>();
  for (const s of sessions) {
    if (s.context === 'lab' || !s.completed) continue;
    const k = bucketKey(s.date, b);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(s);
  }
  return [...m.entries()]
    .sort((a, b2) => (a[0] < b2[0] ? -1 : 1))
    .map(([key, arr]) => {
      const t = totals(arr);
      const idx = arr.map((s) => {
        const pb = pbs.get(sessionKey(s))?.score ?? 0;
        return pb > 0 ? (s.score / pb) * 100 : 0;
      });
      return { key, accuracy: t.accuracy, sessions: arr.length, minutes: t.timeSec / 60, index: meanSd(idx).mean, reaction: t.reaction };
    });
}

export function accuracyByMode(sessions: SessionRecord[]) {
  const out: { mode: ModeId; label: string; accuracy: number; sessions: number }[] = [];
  for (const id of Object.keys(MODES) as ModeId[]) {
    const arr = sessions.filter((s) => s.mode === id && s.context !== 'lab');
    if (!arr.length) continue;
    const shots = arr.reduce((a, s) => a + s.shots, 0);
    const hits = arr.reduce((a, s) => a + s.hits, 0);
    out.push({ mode: id, label: MODES[id].name, accuracy: shots ? hits / shots : 0, sessions: arr.length });
  }
  return out;
}

export function streak(days: string[], today = new Date()): number {
  const set = new Set(days);
  let n = 0;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1); // ainda pode treinar hoje
  while (set.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Diagnóstico de pontos fracos por categoria (últimas sessões de cada modo). */
export interface Weakness {
  category: Category;
  mode: ModeId;
  severity: number; // 0 = ok, >0 = fraco
  reason: string;
  hasData: boolean;
}

export function diagnose(sessions: SessionRecord[]): Weakness[] {
  const recent = (mode: ModeId) => sessions.filter((s) => s.mode === mode && s.completed && s.context !== 'lab').slice(-5);
  const out: Weakness[] = [];
  const accOf = (arr: SessionRecord[]) => {
    const sh = arr.reduce((a, s) => a + s.shots, 0);
    return sh ? arr.reduce((a, s) => a + s.hits, 0) / sh : 0;
  };
  const avg = (arr: SessionRecord[], f: (s: SessionRecord) => number) => (arr.length ? arr.reduce((a, s) => a + f(s), 0) / arr.length : 0);

  const mf = [...recent('microflick'), ...recent('microadjust')];
  if (mf.length) {
    const acc = accOf(mf);
    const ou = avg(mf, (s) => (s.trialsCount ? (s.overshoots + s.undershoots) / s.trialsCount : 0));
    const sev = Math.max(0, (0.75 - acc) / 0.15) + Math.max(0, (ou - 0.35) / 0.3);
    out.push({ category: 'precision', mode: 'microflick', severity: sev, hasData: true, reason: `precisão ${(acc * 100).toFixed(0)}% em micro (ref. ≥75%), ${(ou * 100).toFixed(0)}% de over/undershoot` });
  } else out.push({ category: 'precision', mode: 'microflick', severity: 0.6, hasData: false, reason: 'sem dados de precisão ainda' });

  const wf = recent('wideflick');
  if (wf.length) {
    const acc = accOf(wf);
    const t = avg(wf, (s) => s.avgTime);
    const sev = Math.max(0, (0.7 - acc) / 0.15) + Math.max(0, (t - 650) / 250);
    out.push({ category: 'flick', mode: 'wideflick', severity: sev, hasData: true, reason: `${Math.round(t)} ms por alvo (ref. ≤650 ms), precisão ${(acc * 100).toFixed(0)}%` });
  } else out.push({ category: 'flick', mode: 'wideflick', severity: 0.5, hasData: false, reason: 'sem dados de flick ainda' });

  const tr = recent('tracking');
  if (tr.length) {
    const p = avg(tr, (s) => s.trackingPct ?? 0);
    out.push({ category: 'tracking', mode: 'tracking', severity: Math.max(0, (0.55 - p) / 0.15), hasData: true, reason: `${(p * 100).toFixed(0)}% do tempo no alvo (ref. ≥55%)` });
  } else out.push({ category: 'tracking', mode: 'tracking', severity: 0.5, hasData: false, reason: 'sem dados de tracking ainda' });

  const sw = recent('switching');
  if (sw.length) {
    const t = avg(sw, (s) => s.avgTime);
    const acc = accOf(sw);
    out.push({ category: 'switching', mode: 'switching', severity: Math.max(0, (t - 700) / 250) + Math.max(0, (0.7 - acc) / 0.15), hasData: true, reason: `troca em ${Math.round(t)} ms (ref. ≤700 ms), precisão ${(acc * 100).toFixed(0)}%` });
  } else out.push({ category: 'switching', mode: 'switching', severity: 0.5, hasData: false, reason: 'sem dados de switching ainda' });

  const hs = recent('headshot');
  if (hs.length) {
    const hits = hs.reduce((a, s) => a + s.hits, 0);
    const r = hits ? hs.reduce((a, s) => a + s.headshots, 0) / hits : 0;
    out.push({ category: 'headshot', mode: 'headshot', severity: Math.max(0, (0.6 - r) / 0.2), hasData: true, reason: `${(r * 100).toFixed(0)}% dos acertos na cabeça (ref. ≥60%)` });
  } else out.push({ category: 'headshot', mode: 'headshot', severity: 0.5, hasData: false, reason: 'sem dados de headshot ainda' });

  const rt = recent('reaction');
  if (rt.length) {
    const t = avg(rt, (s) => s.avgTime);
    out.push({ category: 'reaction', mode: 'reaction', severity: Math.max(0, (t - 260) / 60), hasData: true, reason: `reação média ${Math.round(t)} ms (ref. ≤260 ms, inclui latência do monitor)` });
  }
  return out.sort((a, b) => b.severity - a.severity);
}
