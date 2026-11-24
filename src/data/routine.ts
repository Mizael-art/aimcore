import { diagnose } from './stats';
import type { ModeId, RoutineBlock, SessionRecord } from './types';

/** Rotina base de 20 minutos do briefing. */
export const BASE_ROUTINE: RoutineBlock[] = [
  { mode: 'microflick', minutes: 3 },
  { mode: 'microadjust', minutes: 3 },
  { mode: 'wideflick', minutes: 4 },
  { mode: 'tracking', minutes: 4 },
  { mode: 'switching', minutes: 3 },
  { mode: 'headshot', minutes: 3 },
];

/**
 * Adapta a rotina às dificuldades detectadas: até 4 minutos migram dos pontos fortes
 * para os 2 pontos mais fracos (mínimo de 2 min por bloco). Escala para 10/20/30 min.
 */
export function buildRoutine(sessions: SessionRecord[], totalMinutes = 20): { blocks: RoutineBlock[]; notes: string[] } {
  const scale = totalMinutes / 20;
  const blocks = BASE_ROUTINE.map((b) => ({ ...b, minutes: b.minutes }));
  const notes: string[] = [];
  const weak = diagnose(sessions).filter((w) => w.hasData && w.severity > 0.25 && w.mode !== 'reaction');
  const strongModes = new Set<ModeId>(diagnose(sessions).filter((w) => w.hasData && w.severity === 0).map((w) => w.mode));
  let budget = 4;
  for (const w of weak.slice(0, 2)) {
    const target = blocks.find((b) => b.mode === w.mode)!;
    const add = w === weak[0] ? Math.min(budget, 3) : Math.min(budget, 1);
    // tira dos blocos mais fortes (ou dos maiores) sem baixar de 2 min
    let taken = 0;
    const donors = blocks
      .filter((b) => b !== target && !weak.slice(0, 2).some((x) => x.mode === b.mode))
      .sort((a, b) => Number(strongModes.has(b.mode)) - Number(strongModes.has(a.mode)) || b.minutes - a.minutes);
    for (const d of donors) {
      while (taken < add && d.minutes > 2) {
        d.minutes--;
        taken++;
      }
    }
    target.minutes += taken;
    budget -= taken;
    if (taken) {
      target.reason = `+${taken} min: ${w.reason}`;
      notes.push(`${labelCat(w.category)} — ${w.reason}`);
    }
  }
  // recomendações extras do briefing
  const micro = blocks.find((b) => b.mode === 'microflick')!;
  if (weak.some((w) => w.category === 'precision') && !micro.reason) micro.reason = 'precisão abaixo da referência';
  if (!weak.length) notes.push(sessions.length ? 'Nenhum ponto fraco claro nas últimas sessões — rotina equilibrada.' : 'Sem histórico ainda: rotina padrão. Ela se adapta conforme você treina.');
  const scaled = blocks.map((b) => ({ ...b, minutes: Math.max(1, Math.round(b.minutes * scale * 2) / 2) }));
  return { blocks: scaled, notes };
}

const labelCat = (c: string) =>
  ({ precision: 'Precisão', flick: 'Flick', tracking: 'Tracking', switching: 'Troca de alvos', headshot: 'Headshot', reaction: 'Reação' })[c] ?? c;
