import { consistencyFromCv, meanSd } from '../core/flick';
import { Rng } from '../core/rng';
import { roundSens } from '../core/sensitivity';
import type { LabCandidate, LabResult, LabRound, ModeId, SessionRecord, Trial } from '../data/types';

/**
 * Sensitivity Lab — análise estatística.
 * Cada sensibilidade passa pelos mesmos exercícios, com as mesmas seeds e duração.
 * As métricas são normalizadas em relação à média da bateria usando escalas ABSOLUTAS
 * (ex.: 15 p.p. de precisão), para que diferenças minúsculas não pareçam grandes.
 * O erro-padrão vem de bootstrap dos trials; empates estatísticos viram "faixa estável".
 */

export const LAB_EXERCISES: ModeId[] = ['microflick', 'wideflick', 'switching', 'microadjust'];

export type Preference = 'precision' | 'speed' | 'balanced';
export type Style = 'wrist' | 'arm' | 'hybrid';
export type Experience = 'beginner' | 'intermediate' | 'advanced';

export const WEIGHTS: Record<Preference, { acc: number; cons: number; speed: number; ou: number; err: number }> = {
  precision: { acc: 0.34, cons: 0.28, speed: 0.12, ou: 0.16, err: 0.1 },
  balanced: { acc: 0.3, cons: 0.26, speed: 0.2, ou: 0.14, err: 0.1 },
  speed: { acc: 0.26, cons: 0.24, speed: 0.3, ou: 0.1, err: 0.1 },
};

/** Faixa inicial: offsets percentuais ao redor da sens atual. */
export function initialSensList(sens: number, style: Style, exp: Experience): number[] {
  const width = exp === 'beginner' ? 1.25 : exp === 'advanced' ? 0.8 : 1;
  let offs = [-0.2, -0.12, -0.04, 0, 0.04, 0.12, 0.2];
  if (style === 'arm') offs = [-0.24, -0.15, -0.06, 0, 0.04, 0.1, 0.16];
  if (style === 'wrist') offs = [-0.16, -0.1, -0.04, 0, 0.06, 0.15, 0.24];
  return uniqueSorted(offs.map((o) => roundSens(sens * (1 + o * width))));
}

/** Refinamento ao redor da melhor candidata (±2% e ±6%). */
export function refineSensList(best: number, step = 1): number[] {
  return uniqueSorted([-0.06, -0.02, 0, 0.02, 0.06].map((o) => roundSens(best * (1 + o * step))));
}

function uniqueSorted(xs: number[]) {
  return [...new Set(xs.filter((x) => x > 0))].sort((a, b) => a - b);
}

interface ExMetrics {
  acc: number;
  time: number;
  over: number;
  under: number;
  cons: number;
  err: number; // erros por minuto
  shots: number;
  hits: number;
}

function metricsFrom(rec: SessionRecord, trials: Trial[], accOverride?: number): ExMetrics {
  const hitT = trials.filter((t) => t.hit).map((t) => t.t);
  const ms = meanSd(hitT);
  const n = Math.max(1, trials.length);
  const minutes = Math.max(0.1, rec.duration / 60);
  return {
    acc: accOverride ?? rec.accuracy,
    time: ms.mean || 99999,
    over: trials.filter((t) => t.over).length / n,
    under: trials.filter((t) => t.under).length / n,
    cons: consistencyFromCv(ms.mean, ms.sd),
    err: rec.misses / minutes,
    shots: rec.shots,
    hits: rec.hits,
  };
}

const clamp = (x: number, a = -1, b = 1) => Math.max(a, Math.min(b, x));

/** pontuação 0..100 de uma métrica relativa à média da bateria, com escala absoluta. */
function rel(v: number, mean: number, scale: number, higherBetter: boolean) {
  const d = (v - mean) / scale;
  return 50 + 50 * clamp(higherBetter ? d : -d);
}

function composite(m: ExMetrics, mean: ExMetrics, w: (typeof WEIGHTS)['balanced']) {
  const nAcc = rel(m.acc, mean.acc, 0.12, true);
  const nCons = rel(m.cons, mean.cons, 20, true);
  const nSpeed = rel(m.time, mean.time, Math.max(40, mean.time * 0.22), false);
  const ou = m.over + m.under;
  const nOu = rel(ou, mean.over + mean.under, 0.3, false);
  const nErr = rel(m.err, mean.err, Math.max(3, mean.err * 0.5), false);
  return { score: w.acc * nAcc + w.cons * nCons + w.speed * nSpeed + w.ou * nOu + w.err * nErr, nAcc, nSpeed };
}

function avgMetrics(ms: ExMetrics[]): ExMetrics {
  const k = Math.max(1, ms.length);
  const s = (f: (m: ExMetrics) => number) => ms.reduce((a, m) => a + f(m), 0) / k;
  return { acc: s((m) => m.acc), time: s((m) => m.time), over: s((m) => m.over), under: s((m) => m.under), cons: s((m) => m.cons), err: s((m) => m.err), shots: 0, hits: 0 };
}

/** registros agrupados: sens → exercício → sessão */
export type RoundData = Map<number, Map<ModeId, SessionRecord>>;

export function analyzeRound(data: RoundData, pref: Preference, bootstrap = 300, seed = 1234): LabRound {
  const w = WEIGHTS[pref];
  const sensList = [...data.keys()].sort((a, b) => a - b);
  // médias por exercício (referência da normalização)
  const meanByEx = new Map<ModeId, ExMetrics>();
  for (const ex of LAB_EXERCISES) {
    const ms: ExMetrics[] = [];
    for (const s of sensList) {
      const r = data.get(s)?.get(ex);
      if (r) ms.push(metricsFrom(r, r.trials ?? []));
    }
    if (ms.length) meanByEx.set(ex, avgMetrics(ms));
  }
  const rng = new Rng(seed);
  const candidates: LabCandidate[] = sensList.map((s) => {
    const perEx: Record<string, number> = {};
    const exs = data.get(s)!;
    const exMetrics: ExMetrics[] = [];
    let total = 0;
    let count = 0;
    const boots: number[] = new Array(bootstrap).fill(0);
    for (const ex of LAB_EXERCISES) {
      const r = exs.get(ex);
      const mean = meanByEx.get(ex);
      if (!r || !mean) continue;
      const trials = r.trials ?? [];
      const m = metricsFrom(r, trials);
      exMetrics.push(m);
      const c = composite(m, mean, w).score;
      perEx[ex] = Math.round(c * 10) / 10;
      total += c;
      count++;
      // bootstrap: reamostra trials e precisão (binomial)
      for (let b = 0; b < bootstrap; b++) {
        const bt: Trial[] = [];
        for (let i = 0; i < trials.length; i++) bt.push(trials[Math.floor(rng.next() * trials.length)]);
        let acc = m.acc;
        if (r.shots > 0) {
          const sd = Math.sqrt((m.acc * (1 - m.acc)) / r.shots);
          acc = clamp(m.acc + sd * gauss(rng), 0, 1);
        }
        boots[b] += composite(metricsFrom(r, bt, acc), mean, w).score;
      }
    }
    const score = count ? total / count : 0;
    const bs = boots.map((x) => x / Math.max(1, count));
    const se = meanSd(bs).sd;
    const avg = avgMetrics(exMetrics);
    return {
      sens: s,
      score: Math.round(score * 10) / 10,
      se: Math.round(se * 100) / 100,
      accuracy: avg.acc,
      avgTime: Math.round(avg.time),
      overRate: avg.over,
      underRate: avg.under,
      consistency: Math.round(avg.cons * 10) / 10,
      errors: Math.round(avg.err * 10) / 10,
      perExercise: perEx,
      sessions: [...exs.values()].map((r) => r.id),
    };
  });
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a), candidates[0]);
  return { sensList, candidates, best: best?.sens ?? 0 };
}

function gauss(rng: Rng) {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Candidatas estatisticamente empatadas com a melhor (diferença < 1 erro-padrão combinado). */
export function tiedWithBest(round: LabRound): LabCandidate[] {
  const best = round.candidates.find((c) => c.sens === round.best)!;
  return round.candidates.filter((c) => c === best || best.score - c.score < Math.sqrt(best.se ** 2 + c.se ** 2));
}

/** Decide se precisa de mais uma bateria. */
export function needsAnotherRound(rounds: LabRound[], maxRounds = 3): boolean {
  if (rounds.length >= maxRounds) return false;
  if (rounds.length < 2) return true;
  const a = rounds[rounds.length - 2].best;
  const b = rounds[rounds.length - 1].best;
  return Math.abs(b - a) / a > 0.03; // melhor candidata ainda está se movendo
}

export function finalize(
  base: Omit<LabResult, 'recommended' | 'range' | 'inconclusive' | 'verdicts' | 'justification'>,
): LabResult {
  const rounds = base.rounds;
  const last = rounds[rounds.length - 1];
  // junta todos os candidatos das baterias (a última tem prioridade em sens repetidas)
  const all = new Map<number, LabCandidate>();
  for (const r of rounds) for (const c of r.candidates) all.set(c.sens, c);
  const best = last.candidates.find((c) => c.sens === last.best)!;
  const tied = tiedWithBest(last);
  const range: [number, number] = [Math.min(...tied.map((c) => c.sens)), Math.max(...tied.map((c) => c.sens))];
  const scores = last.candidates.map((c) => c.score);
  const spread = Math.max(...scores) - Math.min(...scores);
  const first = rounds[0];
  const firstSpread = Math.max(...first.candidates.map((c) => c.score)) - Math.min(...first.candidates.map((c) => c.score));
  const inconclusive = firstSpread < 4 || tied.length >= Math.ceil(last.candidates.length * 0.8) && spread < 3;

  // recomendação: melhor medida; se empatado, centro (mediana) da faixa estável
  let recommended = best.sens;
  if (tied.length >= 3) {
    const s = tied.map((c) => c.sens).sort((a, b) => a - b);
    recommended = s[Math.floor(s.length / 2)];
  }

  // veredictos a partir da 1ª bateria (faixa larga)
  const fb = first.candidates.find((c) => c.sens === first.best)!;
  const significantlyWorse = (c: LabCandidate) => fb.score - c.score > 1.5 * Math.sqrt(fb.se ** 2 + c.se ** 2) && fb.score - c.score > 3;
  // só conta como alta/baixa demais o que ficou fora da faixa estável final
  const tooHigh = first.candidates.filter((c) => c.sens > Math.max(fb.sens, range[1]) && significantlyWorse(c)).map((c) => c.sens);
  const tooLow = first.candidates.filter((c) => c.sens < Math.min(fb.sens, range[0]) && significantlyWorse(c)).map((c) => c.sens);
  const allC = [...all.values()];
  const mostConsistent = allC.reduce((a, b) => (b.consistency > a.consistency ? b : a)).sens;
  const bestBalance = allC.reduce((a, b) => {
    const sa = a.accuracy * 100 - a.avgTime / 20;
    const sb = b.accuracy * 100 - b.avgTime / 20;
    return sb > sa ? b : a;
  }).sens;

  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const f = (s: number) => s.toFixed(3);
  const j: string[] = [];
  j.push(`${f(best.sens)} obteve a maior pontuação composta na última bateria: ${best.score.toFixed(1)} ± ${best.se.toFixed(1)} (precisão ${pct(best.accuracy)}, ${best.avgTime} ms por alvo, consistência ${best.consistency.toFixed(0)}).`);
  if (tied.length > 1) j.push(`Diferenças dentro da margem de erro para ${tied.filter((c) => c !== best).map((c) => f(c.sens)).join(', ')} → faixa estável ${f(range[0])}–${f(range[1])}.`);
  const hi = first.candidates.filter((c) => tooHigh.includes(c.sens));
  if (hi.length) {
    const h = hi[hi.length - 1];
    j.push(`Acima da faixa (ex.: ${f(h.sens)}), overshoot ${pct(h.overRate)} vs ${pct(fb.overRate)} e precisão ${pct(h.accuracy)} vs ${pct(fb.accuracy)} → sensibilidade alta demais para você.`);
  }
  const lo = first.candidates.filter((c) => tooLow.includes(c.sens));
  if (lo.length) {
    const l = lo[0];
    j.push(`Abaixo da faixa (ex.: ${f(l.sens)}), tempo por alvo ${l.avgTime} ms vs ${fb.avgTime} ms e undershoot ${pct(l.underRate)} vs ${pct(fb.underRate)} → sensibilidade baixa demais.`);
  }
  if (!hi.length && !lo.length) j.push('Nenhuma sensibilidade testada foi significativamente pior que a melhor — seu desempenho é pouco sensível a essa faixa.');
  if (mostConsistent !== best.sens) j.push(`A maior consistência isolada foi em ${f(mostConsistent)}; ela pesou ${pref(base.preference)} na decisão.`);
  if (inconclusive) j.push('Resultado INCONCLUSIVO: as diferenças entre sensibilidades são pequenas em relação à variação natural do seu desempenho. Mantenha a sensibilidade atual ou repita o teste descansado e após aquecimento.');
  j.push('Isto não é uma sensibilidade "matematicamente perfeita": é a melhor candidata nestes testes, nestas condições (cansaço, aquecimento e efeito de aprendizado influenciam).');

  return { ...base, recommended, range, inconclusive, verdicts: { tooHigh, tooLow, mostConsistent, bestBalance }, justification: j };
}

const pref = (p: Preference) => (p === 'precision' ? 'bastante (preferência por precisão)' : p === 'speed' ? 'um pouco menos (preferência por velocidade)' : 'de forma equilibrada');
