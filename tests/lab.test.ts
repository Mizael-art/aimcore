import { describe, expect, it } from 'vitest';
import { analyzeRound, finalize, initialSensList, LAB_EXERCISES, refineSensList, type RoundData } from '../src/lab/analysis';
import { modeConfig } from '../src/modes/catalog';
import { hashSeed } from '../src/core/rng';
import type { ModeId, SessionRecord } from '../src/data/types';
import { runBot } from './sim';

/** jogador simulado com sensibilidade ideal em `ideal` */
function player(ideal: number, sens: number, seed: number) {
  const r = sens / ideal;
  return { sens, overshoot: 1 + 0.35 * (r - 1), durMul: r < 1 ? 1 / r ** 0.9 : 1, noise: 0.05 + 0.15 * Math.abs(r - 1), fireTol: r > 1 ? 0.6 * (1 + 9 * (r - 1)) : 0.6, noiseSeed: seed };
}

function runRound(list: number[], ideal: number, dur = 30): RoundData {
  const data: RoundData = new Map();
  for (const s of list) {
    const m = new Map<ModeId, SessionRecord>();
    for (const ex of LAB_EXERCISES) {
      const res = runBot(modeConfig(ex, { seed: hashSeed('lab-' + ex), duration: dur, context: 'lab' }), player(ideal, s, hashSeed(ex + s)));
      m.set(ex, { ...res.record, id: `${s}-${ex}` });
    }
    data.set(s, m);
  }
  return data;
}

describe('Sensitivity Lab', () => {
  it('faixa inicial do briefing (0.25)', () => {
    expect(initialSensList(0.25, 'hybrid', 'intermediate')).toEqual([0.2, 0.22, 0.24, 0.25, 0.26, 0.28, 0.3]);
    expect(refineSensList(0.24)).toEqual([0.226, 0.235, 0.24, 0.245, 0.254]);
  });
  it('encontra a faixa ideal de um jogador simulado', () => {
    const ideal = 0.24;
    const r1 = analyzeRound(runRound(initialSensList(0.3, 'hybrid', 'intermediate'), ideal), 'balanced');
    const r2 = analyzeRound(runRound(refineSensList(r1.best), ideal), 'balanced');
    const res = finalize({ id: 'x', date: 0, dpi: 800, originalSens: 0.3, style: 'hybrid', experience: 'intermediate', preference: 'balanced', exerciseDuration: 30, rounds: [r1, r2] });
    console.log(r1.candidates.map((c) => `${c.sens}:${c.score}±${c.se} o${c.overRate.toFixed(2)} u${c.underRate.toFixed(2)} t${c.avgTime}`).join(' | '));
    console.log(res.recommended, res.range, res.inconclusive, res.verdicts, res.justification.join('\n'));
    expect(Math.abs(res.recommended - ideal) / ideal).toBeLessThan(0.12);
    expect(res.verdicts.tooHigh.length).toBeGreaterThan(0);
  }, 60000);
  it('jogador indiferente à sens ⇒ inconclusivo', () => {
    const data = runRound(initialSensList(0.3, 'hybrid', 'intermediate'), 0.3);
    // remove o efeito da sens: usa sempre o mesmo comportamento
    const flat: RoundData = new Map();
    const base = [...data.values()][3];
    for (const s of data.keys()) flat.set(s, base);
    const r = analyzeRound(flat, 'balanced');
    const res = finalize({ id: 'y', date: 0, dpi: 800, originalSens: 0.3, style: 'hybrid', experience: 'intermediate', preference: 'balanced', exerciseDuration: 30, rounds: [r] });
    expect(res.inconclusive).toBe(true);
  }, 60000);
});
