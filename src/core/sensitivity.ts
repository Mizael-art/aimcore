/**
 * Matemática de sensibilidade do VALORANT.
 *
 * No VALORANT cada "count" do mouse (unidade bruta enviada pelo sensor) gira a câmera
 * em `sens × 0,07` graus — tanto no eixo horizontal (yaw) quanto no vertical (pitch).
 * Não existe multiplicador próprio do AIMCORE: o treino usa exatamente essa relação.
 */
export const VALORANT_YAW = 0.07; // graus por count com sens = 1
export const CM_PER_INCH = 2.54;
/** FOV horizontal fixo do VALORANT em 16:9. */
export const VALORANT_HFOV_16_9 = 103;

export interface SensConfig {
  dpi: number;
  sens: number;
  /** multiplicador de sensibilidade com zoom (ADS/scope) do VALORANT */
  adsMultiplier: number;
  invertY: boolean;
  /**
   * Fator de calibração do navegador: quantos counts reais do mouse correspondem a
   * 1 unidade de movementX/Y. 1 = entrada bruta (raw) perfeita.
   */
  calibration: number;
}

export const edpi = (dpi: number, sens: number) => dpi * sens;

/** cm/360 = 360 × 2,54 / (DPI × sens × 0,07) */
export function cmPer360(dpi: number, sens: number): number {
  if (dpi <= 0 || sens <= 0) return Infinity;
  return (360 * CM_PER_INCH) / (dpi * sens * VALORANT_YAW);
}

export const inPer360 = (dpi: number, sens: number) => cmPer360(dpi, sens) / CM_PER_INCH;

/** Sensibilidade do VALORANT que gera determinado cm/360 num DPI. */
export function sensFromCm360(dpi: number, cm: number): number {
  return (360 * CM_PER_INCH) / (dpi * cm * VALORANT_YAW);
}

/** Graus de rotação por count do mouse. */
export const degPerCount = (sens: number) => sens * VALORANT_YAW;

/** Converte um delta do navegador (movementX/Y) em radianos de rotação. */
export function deltaToRadians(delta: number, cfg: SensConfig, zoomSensScale = 1): number {
  const counts = delta * cfg.calibration;
  return counts * degPerCount(cfg.sens) * zoomSensScale * (Math.PI / 180);
}

/**
 * Escala de sensibilidade com zoom. Em zoom, a sensibilidade é escalada pela razão das
 * tangentes de FOV (mesmo deslocamento de tela por count) e multiplicada pelo
 * multiplicador de ADS escolhido pelo jogador.
 */
export function zoomSensScale(hfovDeg: number, zoom: number, adsMultiplier: number): number {
  if (zoom <= 1) return 1;
  const h = (hfovDeg * Math.PI) / 360;
  const zoomedHalf = Math.atan(Math.tan(h) / zoom);
  return (Math.tan(zoomedHalf) / Math.tan(h)) * adsMultiplier;
}

/** FOV vertical que o Three.js precisa a partir do FOV horizontal em 16:9 (Hor+). */
export function verticalFovFrom16x9(hfovDeg: number): number {
  const h = (hfovDeg * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(h / 2) / (16 / 9)) * 180) / Math.PI;
}

/** Arredonda sensibilidade a 3 casas (o VALORANT aceita até 3 casas decimais). */
export const roundSens = (s: number) => Math.round(s * 1000) / 1000;

/** Contagem esperada de counts para mover `cm` centímetros num DPI. */
export const countsForCm = (dpi: number, cm: number) => (dpi * cm) / CM_PER_INCH;
