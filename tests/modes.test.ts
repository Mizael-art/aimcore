import { describe, expect, it } from 'vitest';
import { modeConfig, scenarioConfig, SCENARIOS, MODES } from '../src/modes/catalog';
import type { ModeId } from '../src/data/types';
import { runBot } from './sim';

const ids = Object.keys(MODES) as ModeId[];

describe('todos os modos funcionam com um bot', () => {
  for (const id of ids) {
    it(id, () => {
      const r = runBot(modeConfig(id, { seed: 42, duration: id === 'reaction' ? 120 : 30 }), { sens: 0.3 });
      expect(r.mode.done).toBe(true);
      const rec = r.record;
      if (id === 'reaction') {
        expect(rec.trialsCount).toBe(10);
        expect(rec.avgTime).toBeGreaterThan(100);
      } else if (id === 'tracking') {
        expect(rec.trackingPct!).toBeGreaterThan(0.3);
      } else {
        expect(rec.hits).toBeGreaterThan(5);
        expect(rec.accuracy).toBeGreaterThan(0.5);
      }
      expect(rec.segments.length).toBeGreaterThan(0);
    });
  }
});

describe('todos os cenários VALORANT funcionam', () => {
  for (const s of SCENARIOS) {
    it(s.id, () => {
      const r = runBot(scenarioConfig(s.id, { seed: 7, duration: 40 }), { sens: 0.3, fireTol: 0.4 });
      expect(r.mode.done).toBe(true);
      expect(r.record.hits).toBeGreaterThan(2);
      expect(r.record.headshots).toBeGreaterThan(0);
    });
  }
});

describe('determinismo (Sensitivity Lab)', () => {
  for (const id of ['microflick', 'wideflick', 'microadjust', 'switching'] as ModeId[]) {
    it(`${id}: mesma seed ⇒ mesmos alvos em sensibilidades diferentes`, () => {
      const a = runBot(modeConfig(id, { seed: 99, duration: 20 }), { sens: 0.2 });
      const b = runBot(modeConfig(id, { seed: 99, duration: 20 }), { sens: 0.4 });
      const pa = a.spawns.slice(0, 10);
      const pb = b.spawns.slice(0, 10);
      expect(pa.length).toBe(10);
      if (id === 'switching') expect(pa.slice(0, 3)).toEqual(pb.slice(0, 3));
      else expect(pa).toEqual(pb);
      expect(a.record.trialsCount).toBeGreaterThan(5);
    });
  }
  it('counts necessários escalam inversamente à sens', () => {
    const a = runBot(modeConfig('wideflick', { seed: 5, duration: 15 }), { sens: 0.2 });
    const b = runBot(modeConfig('wideflick', { seed: 5, duration: 15 }), { sens: 0.4 });
    const ka = a.countsX / Math.max(1, a.record.hits);
    const kb = b.countsX / Math.max(1, b.record.hits);
    expect(ka / kb).toBeGreaterThan(1.6);
    expect(ka / kb).toBeLessThan(2.4);
  });
});

describe('overshoot detectado em comportamento do bot', () => {
  it('bot que passa do alvo gera overshoots', () => {
    const r = runBot(modeConfig('wideflick', { seed: 3, duration: 30 }), { sens: 0.3, overshoot: 1.25, gain: 0.6 });
    const clean = runBot(modeConfig('wideflick', { seed: 3, duration: 30 }), { sens: 0.3, overshoot: 1.0, gain: 0.35 });
    expect(r.record.overshoots).toBeGreaterThan(clean.record.overshoots);
  });
});
