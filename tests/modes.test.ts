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
  for (const s of SCENARIOS.filter((x) => !x.params.duel)) {
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

describe('Peek & Duelo', () => {
  it('peek rápido mata o inimigo; ficar exposto faz você morrer', () => {
    // jogador rápido: aparece, mira e atira antes da reação do bot
    const fast = runBot(scenarioConfig('peek', { seed: 11, duration: 60 }), { sens: 0.3, reactionMs: 60, fireTol: 0.5, peek: { startX: -1.3, peekX: 3.4 } });
    expect(fast.record.hits).toBeGreaterThan(5);
    expect(fast.record.headshots).toBeGreaterThan(0);
    // jogador lento (reação 900 ms): o bot acerta primeiro
    const slow = runBot(scenarioConfig('peek', { seed: 11, duration: 60 }), { sens: 0.3, reactionMs: 900, peek: { startX: -1.3, peekX: 3.4 } });
    expect(slow.record.deaths!).toBeGreaterThan(fast.record.deaths!);
    expect(slow.record.deaths!).toBeGreaterThan(3);
  });
  it('atrás da parede o inimigo não te vê', () => {
    const hidden = runBot(scenarioConfig('peek', { seed: 3, duration: 30 }), { sens: 0.3, reactionMs: 99999, peek: { startX: -2.5, peekX: -2.5 } });
    expect(hidden.record.deaths).toBe(0);
  });
});

describe('faca', () => {
  it('golpe só acerta de perto', async () => {
    const { WEAPONS } = await import('../src/game/weapons');
    expect(WEAPONS.knife.meleeRange).toBeLessThan(3);
  });
});

import { createMode } from '../src/modes/catalog';
import { LogicWorld } from '../src/game/world';
import { Target } from '../src/game/target';
import { dirFromYawPitch, yawPitchTo } from '../src/core/geometry';

describe('inventário e faca', () => {
  const setup = () => {
    const world = new LogicWorld();
    const aim = { yaw: 0, pitch: 0 };
    const log: string[] = [];
    const m = createMode(scenarioConfig('close', { seed: 1, duration: 30 }));
    m.init({ world, aim, fb: { shot: (i) => log.push(i?.melee ? 'melee' : 'shot'), hit: (_t, p, k) => log.push(`hit:${p}:${k}`), miss() {}, falseStart() {}, message() {}, equip: (id) => log.push('equip:' + id) } });
    return { world, aim, log, m };
  };
  it('1/2/3 trocam arma, com tempo de saque', () => {
    const { m, log } = setup();
    expect(m.slots).toEqual(['phantom', 'sheriff', 'knife']);
    m.switchSlot(2);
    expect(m.weapon.w.id).toBe('knife');
    expect(log).toContain('equip:knife');
    expect(m.weapon.canFire(m.time)).toBe(false); // ainda sacando
    expect(m.weapon.canFire(m.time + 400)).toBe(true);
  });
  it('faca: acerta a 2 m, erra a 5 m; estocada causa mais dano', () => {
    const { m, world, aim, log } = setup();
    world.clear();
    m.switchSlot(2);
    m.tick(500);
    const near = new Target('humanoid', { x: 0, y: 0, z: -2 }, 1);
    world.addTarget(near);
    const a = yawPitchTo(world.eye, { x: 0, y: 1.0, z: -2 });
    aim.yaw = a.yaw;
    aim.pitch = a.pitch;
    m.trigger(true, m.time);
    m.trigger(false, m.time);
    expect(near.hp).toBe(100); // 50 de dano (corpo)
    m.tick(1000);
    m.heavyMelee(m.time);
    expect(near.hp).toBe(25); // +75 da estocada
    world.removeTarget(near, false);
    const far = new Target('humanoid', { x: 0, y: 0, z: -5 }, 1);
    world.addTarget(far);
    const b = yawPitchTo(world.eye, { x: 0, y: 1.0, z: -5 });
    aim.yaw = b.yaw;
    aim.pitch = b.pitch;
    m.tick(500);
    m.trigger(true, m.time);
    expect(far.hp).toBe(150);
    expect(log.filter((x) => x === 'melee').length).toBe(3);
    void dirFromYawPitch;
  });
});
