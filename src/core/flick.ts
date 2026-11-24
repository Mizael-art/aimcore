import { wrapAngle } from './geometry';

/**
 * Análise de trajetória de um flick (pura, testável).
 * Amostras de mira (yaw/pitch em rad) desde o início do flick até o acerto/fim.
 * Overshoot  = no primeiro ponto de parada a mira passou do alvo ao longo do eixo do flick.
 * Undershoot = no primeiro ponto de parada a mira ficou antes do alvo.
 */
export interface AimSample {
  t: number; // ms
  yaw: number;
  pitch: number;
}

export interface FlickAnalysis {
  dist: number; // graus
  over: boolean;
  under: boolean;
  stopErr: number; // graus
  maxProgress: number; // fração de dist
  valid: boolean;
}

const R2D = 180 / Math.PI;

export function analyzeFlick(
  samples: readonly AimSample[],
  start: { yaw: number; pitch: number },
  target: { yaw: number; pitch: number },
  angRadiusDeg: number,
): FlickAnalysis {
  const cosP = Math.cos(target.pitch);
  const toXY = (s: { yaw: number; pitch: number }) => [wrapAngle(s.yaw - start.yaw) * cosP * R2D, (s.pitch - start.pitch) * R2D];
  const [fx, fy] = toXY(target);
  const D = Math.hypot(fx, fy);
  const res: FlickAnalysis = { dist: D, over: false, under: false, stopErr: 0, maxProgress: 0, valid: false };
  if (samples.length < 3 || D < angRadiusDeg * 1.5) return res;
  const ux = fx / D;
  const uy = fy / D;

  const pts = samples.map((s) => {
    const [x, y] = toXY(s);
    return { t: s.t, x, y, p: x * ux + y * uy };
  });

  // velocidade angular suavizada (janela mínima de 8 ms)
  const speed: number[] = new Array(pts.length).fill(0);
  let j = 0;
  for (let i = 1; i < pts.length; i++) {
    while (j < i - 1 && pts[i].t - pts[j + 1].t >= 8) j++;
    const dt = Math.max(1, pts[i].t - pts[j].t);
    speed[i] = (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) / dt) * 1000;
  }

  let moveStart = pts.findIndex((p) => p.p > 0.1 * D);
  if (moveStart < 0) {
    // nunca chegou a 10% do caminho — undershoot claro
    res.under = true;
    res.valid = true;
    res.stopErr = D;
    return res;
  }
  let peak = 0;
  let peakIdx = moveStart;
  let stopIdx = pts.length - 1;
  let stopped = false;
  for (let i = moveStart; i < pts.length; i++) {
    if (speed[i] > peak) {
      peak = speed[i];
      peakIdx = i;
    }
    if (i > peakIdx && peak > 0 && speed[i] < peak * 0.1) {
      stopIdx = i;
      stopped = true;
      break;
    }
  }
  let maxP = -Infinity;
  for (const p of pts) maxP = Math.max(maxP, p.p);
  const stop = pts[stopIdx];
  res.valid = true;
  res.maxProgress = maxP / D;
  res.stopErr = Math.hypot(stop.x - fx, stop.y - fy);
  res.over = stop.p > D + angRadiusDeg || maxP > D + angRadiusDeg * 2.5;
  // sem ponto de parada (acerto "em movimento"): só conta overshoot real de trajetória
  res.under = stopped && !res.over && stop.p < D - angRadiusDeg;
  if (!stopped) res.over = maxP > D + angRadiusDeg * 2.5;
  return res;
}

/** média / desvio-padrão */
export function meanSd(xs: readonly number[]): { mean: number; sd: number } {
  if (!xs.length) return { mean: 0, sd: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.length > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1) : 0;
  return { mean, sd: Math.sqrt(v) };
}

export const median = (xs: readonly number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Consistência 0..100 a partir do coeficiente de variação. */
export function consistencyFromCv(mean: number, sd: number): number {
  if (mean <= 0) return 0;
  const cv = sd / mean;
  return Math.max(0, Math.min(100, 100 * (1 - cv)));
}
