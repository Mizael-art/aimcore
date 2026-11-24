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
