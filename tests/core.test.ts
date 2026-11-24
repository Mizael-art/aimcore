import { describe, expect, it } from 'vitest';
import { cmPer360, countsForCm, deltaToRadians, edpi, sensFromCm360, verticalFovFrom16x9, zoomSensScale } from '../src/core/sensitivity';
import { analyzeFlick } from '../src/core/flick';
import { dirFromYawPitch, raySphere, rayCapsuleY, rayAabb, yawPitchTo, DEG } from '../src/core/geometry';
import { Target } from '../src/game/target';

describe('sensibilidade VALORANT', () => {
  it('exemplo do briefing: 800 DPI × 0.25', () => {
    expect(edpi(800, 0.25)).toBe(200);
    expect(cmPer360(800, 0.25)).toBeCloseTo(65.314, 2);
  });
  it('inversa cm/360 → sens', () => {
    expect(sensFromCm360(800, cmPer360(800, 0.31))).toBeCloseTo(0.31, 10);
  });
  it('mover a distância de um cm/360 gira exatamente 360°', () => {
    for (const [dpi, sens] of [[800, 0.25], [400, 0.7], [1600, 0.2], [3200, 0.088]]) {
      const counts = countsForCm(dpi, cmPer360(dpi, sens));
      const rad = deltaToRadians(counts, { dpi, sens, adsMultiplier: 1, invertY: false, calibration: 1 });
      expect((rad * 180) / Math.PI).toBeCloseTo(360, 6);
    }
  });
  it('rotação vertical usa a mesma relação', () => {
    const c = { dpi: 800, sens: 0.4, adsMultiplier: 1, invertY: false, calibration: 1 };
    expect(deltaToRadians(100, c)).toBeCloseTo(100 * 0.4 * 0.07 * DEG, 12);
  });
  it('calibração escala counts', () => {
    const c = { dpi: 800, sens: 0.4, adsMultiplier: 1, invertY: false, calibration: 0.5 };
    expect(deltaToRadians(200, c)).toBeCloseTo(100 * 0.4 * 0.07 * DEG, 12);
  });
  it('FOV vertical de 103° hfov (16:9) ≈ 70.53°', () => {
    expect(verticalFovFrom16x9(103)).toBeCloseTo(70.53, 1);
  });
  it('zoom reduz sensibilidade proporcional ao FOV', () => {
    expect(zoomSensScale(103, 1, 1)).toBe(1);
    const s = zoomSensScale(103, 1.25, 1);
    expect(s).toBeLessThan(1);
    expect(s).toBeCloseTo(0.8, 2);
  });
});

describe('geometria e colisão', () => {
  it('yaw/pitch ↔ direção', () => {
    const d = dirFromYawPitch(0.3, -0.2);
    const a = yawPitchTo({ x: 0, y: 0, z: 0 }, d);
    expect(a.yaw).toBeCloseTo(0.3, 10);
    expect(a.pitch).toBeCloseTo(-0.2, 10);
  });
  it('raio × esfera', () => {
    const o = { x: 0, y: 0, z: 0 };
    expect(raySphere(o, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -10 }, 1)).toBeCloseTo(9);
    expect(raySphere(o, dirFromYawPitch(0.2, 0), { x: 0, y: 0, z: -10 }, 1)).toBe(-1);
  });
  it('raio × cápsula e AABB', () => {
    const o = { x: 0, y: 1, z: 0 };
    expect(rayCapsuleY(o, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -5 }, 0.2, 1.4, 0.25)).toBeCloseTo(4.75, 5);
    expect(rayAabb(o, { x: 0, y: 0, z: -1 }, { x: -1, y: 0, z: -3 }, { x: 1, y: 2, z: -2 })).toBeCloseTo(2);
  });
  it('humanoide: cabeça × corpo', () => {
    const t = new Target('humanoid', { x: 0, y: 0, z: -10 }, 1);
    const eye = { x: 0, y: 1.6, z: 0 };
    const toHead = yawPitchTo(eye, t.aimPoint());
    expect(t.hitTest(eye, dirFromYawPitch(toHead.yaw, toHead.pitch))?.part).toBe('head');
    const toBody = yawPitchTo(eye, { x: 0, y: 1.0, z: -10 });
    expect(t.hitTest(eye, dirFromYawPitch(toBody.yaw, toBody.pitch))?.part).toBe('body');
    const above = yawPitchTo(eye, { x: 0, y: 1.9, z: -10 });
    expect(t.hitTest(eye, dirFromYawPitch(above.yaw, above.pitch))).toBeNull();
  });
});

describe('análise de flick', () => {
  const mk = (path: [number, number][]) => path.map(([y, p], i) => ({ t: i * 7, yaw: y * DEG, pitch: p * DEG }));
  // flick para a esquerda: yaw positivo
  const target = { yaw: 20 * DEG, pitch: 0 };
  it('detecta overshoot', () => {
    const path: [number, number][] = [[0, 0], [2, 0], [8, 0], [16, 0], [22, 0], [24, 0], [24.3, 0], [24.4, 0], [24.4, 0], [22, 0], [20, 0]];
    const a = analyzeFlick(mk(path), { yaw: 0, pitch: 0 }, target, 0.6);
    expect(a.over).toBe(true);
    expect(a.under).toBe(false);
  });
  it('detecta undershoot', () => {
    const path: [number, number][] = [[0, 0], [3, 0], [9, 0], [14, 0], [16, 0], [16.3, 0], [16.4, 0], [16.4, 0], [18, 0], [20, 0]];
    const a = analyzeFlick(mk(path), { yaw: 0, pitch: 0 }, target, 0.6);
    expect(a.under).toBe(true);
    expect(a.over).toBe(false);
  });
  it('flick limpo', () => {
    const path: [number, number][] = [[0, 0], [3, 0], [10, 0], [17, 0], [19.6, 0], [19.9, 0], [20, 0], [20, 0]];
    const a = analyzeFlick(mk(path), { yaw: 0, pitch: 0 }, target, 0.6);
    expect(a.over || a.under).toBe(false);
  });
});

import { Player, RUN_SPEED } from '../src/game/player';
import { WEAPONS, WeaponState, ACCURATE_SPEED } from '../src/game/weapons';

describe('movimento e armas estilo VALORANT', () => {
  it('counter-strafe para mais rápido que soltar a tecla', () => {
    const run = (counter: boolean) => {
      const p = new Player();
      p.zone = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
      p.keys.add('KeyD');
      for (let i = 0; i < 60; i++) p.update(1 / 120, 0);
      expect(p.speed).toBeCloseTo(RUN_SPEED, 3);
      p.keys.clear();
      if (counter) p.keys.add('KeyA');
      let t = 0;
      while (p.speedRatio > ACCURATE_SPEED && t < 2) {
        p.update(1 / 120, 0);
        t += 1 / 120;
      }
      return t;
    };
    const release = run(false);
    const counter = run(true);
    expect(counter).toBeLessThan(release);
    expect(counter).toBeLessThan(0.1);
  });
  it('imprecisão some abaixo do limiar de velocidade', () => {
    const w = new WeaponState(WEAPONS.vandal);
    w.setMovement(1, false);
    expect(w.moveErr).toBeCloseTo(WEAPONS.vandal.moveSpread);
    w.setMovement(ACCURATE_SPEED - 0.01, false);
    expect(w.moveErr).toBe(0);
  });
  it('spray sobe e reseta; munição acaba e recarrega', () => {
    const w = new WeaponState(WEAPONS.vandal);
    let t = 0;
    expect(w.recoil()[0]).toBe(0); // primeiro tiro preciso
    for (let i = 0; i < 8; i++) {
      w.onShot(t);
      t += WEAPONS.vandal.fireIntervalMs;
      w.update(WEAPONS.vandal.fireIntervalMs / 1000, t);
    }
    expect(w.recoil()[0]).toBeGreaterThan(2);
    for (let i = 0; i < 100; i++) {
      t += 16;
      w.update(0.016, t);
    }
    expect(w.recoil()[0]).toBe(0);
    while (w.ammo > 0) w.onShot(t);
    w.update(0.016, t);
    expect(w.reloading).toBe(true);
    w.update(0.016, t + WEAPONS.vandal.reloadMs + 1);
    expect(w.ammo).toBe(25);
  });
});

import { parseValorantCode, toValorantCode } from '../src/game/crosshair';
import { defaultSettings } from '../src/data/store';

describe('código de mira do VALORANT', () => {
  it('importa e exporta ida-e-volta', () => {
    const c = parseValorantCode('0;P;c;5;h;0;d;1;z;3;0l;4;0o;2;0a;1;0f;0;1b;0', defaultSettings().crosshair);
    expect(c.color).toBe('#00ffff');
    expect(c.outline).toBe(false);
    expect(c.centerDot).toBe(true);
    expect(c.innerLength).toBe(4);
    expect(c.showOuter).toBe(false);
    expect(c.firingError).toBe(false);
    const back = parseValorantCode(toValorantCode(c), defaultSettings().crosshair);
    expect(back).toEqual(c);
  });
  it('rejeita código inválido', () => {
    expect(() => parseValorantCode('abc', defaultSettings().crosshair)).toThrow();
  });
});
