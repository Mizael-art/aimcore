/**
 * Perfis de arma originais, inspirados no comportamento das armas do VALORANT
 * (cadência, dano, munição, padrão de spray e imprecisão em movimento aproximados; sem assets).
 * Ângulos em graus.
 */
export interface WeaponProfile {
  id: string;
  name: string;
  kind: 'rifle' | 'pistol' | 'none';
  auto: boolean;
  fireIntervalMs: number;
  baseSpread: number;
  spreadPerShot: number;
  maxSpread: number;
  recoveryPerSec: number;
  headDmg: number;
  bodyDmg: number;
  zoom: number; // zoom do ADS (1 = sem ADS)
  adsSpreadMul: number;
  mag: number; // 0 = infinito
  reloadMs: number;
  /** padrão de recuo: [pitch para cima, yaw] por tiro consecutivo */
  pattern: [number, number][];
  /** tiros/s recuperados do padrão quando para de atirar */
  patternRecovery: number;
  /** imprecisão extra correndo (velocidade máxima) */
  moveSpread: number;
  /** imprecisão extra andando (shift) */
  walkSpread: number;
}

/** gera um padrão: sobe nos primeiros tiros e depois oscila na horizontal */
function pattern(climb: number[], swayAmp: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const pitch = i < climb.length ? climb[i] : climb[climb.length - 1] + (i - climb.length + 1) * 0.04;
    const t = Math.max(0, i - climb.length + 3);
    const yaw = t > 0 ? swayAmp * Math.sin(t * 0.55) * Math.min(1, t / 4) : 0;
    out.push([pitch, yaw]);
  }
  return out;
}

export const WEAPONS: Record<string, WeaponProfile> = {
  trainer: {
    id: 'trainer', name: 'Trainer', kind: 'none', auto: false, fireIntervalMs: 0, baseSpread: 0, spreadPerShot: 0, maxSpread: 0,
    recoveryPerSec: 100, headDmg: 150, bodyDmg: 0, zoom: 1, adsSpreadMul: 1, mag: 0, reloadMs: 0, pattern: [[0, 0]], patternRecovery: 100,
    moveSpread: 0, walkSpread: 0,
  },
  sheriff: {
    id: 'sheriff', name: 'Sheriff', kind: 'pistol', auto: false, fireIntervalMs: 250, baseSpread: 0.15, spreadPerShot: 0.5, maxSpread: 3,
    recoveryPerSec: 3, headDmg: 159, bodyDmg: 55, zoom: 1.15, adsSpreadMul: 0.8, mag: 6, reloadMs: 2250,
    pattern: pattern([0, 1.1, 2.0, 2.7, 3.2, 3.5], 0.8, 6), patternRecovery: 4, moveSpread: 2.5, walkSpread: 1.0,
  },
  vandal: {
    id: 'vandal', name: 'Vandal', kind: 'rifle', auto: true, fireIntervalMs: 1000 / 9.75, baseSpread: 0.1, spreadPerShot: 0.18, maxSpread: 1.6,
    recoveryPerSec: 2.5, headDmg: 160, bodyDmg: 40, zoom: 1.25, adsSpreadMul: 0.75, mag: 25, reloadMs: 2500,
    pattern: pattern([0, 0.15, 0.45, 0.85, 1.35, 1.85, 2.3, 2.65, 2.9, 3.05], 0.9, 25), patternRecovery: 10, moveSpread: 4.5, walkSpread: 1.8,
  },
  phantom: {
    id: 'phantom', name: 'Phantom', kind: 'rifle', auto: true, fireIntervalMs: 1000 / 11, baseSpread: 0.12, spreadPerShot: 0.15, maxSpread: 1.4,
    recoveryPerSec: 2.8, headDmg: 156, bodyDmg: 39, zoom: 1.25, adsSpreadMul: 0.75, mag: 30, reloadMs: 2500,
    pattern: pattern([0, 0.1, 0.35, 0.7, 1.1, 1.5, 1.85, 2.15, 2.35, 2.5], 0.7, 30), patternRecovery: 11, moveSpread: 4.0, walkSpread: 1.6,
  },
};

/** fração da velocidade máxima abaixo da qual não há imprecisão de movimento (counter-strafe) */
export const ACCURATE_SPEED = 0.27;

export class WeaponState {
  spread: number;
  lastShot = -Infinity;
  holding = false;
  ads = false;
  ammo: number;
  reloadUntil = 0;
  /** índice (contínuo) no padrão de spray */
  shotIdx = 0;
  /** última imprecisão de movimento aplicada (graus) */
  moveErr = 0;

  constructor(public w: WeaponProfile) {
    this.spread = w.baseSpread;
    this.ammo = w.mag;
  }
  get reloading() {
    return this.reloadUntil > 0;
  }
  canFire(now: number) {
    if (this.reloadUntil > 0) return false;
    if (this.w.mag > 0 && this.ammo <= 0) return false;
    return now - this.lastShot >= this.w.fireIntervalMs - 0.5;
  }
  currentSpread() {
    return (this.spread + this.moveErr) * (this.ads ? this.w.adsSpreadMul : 1);
  }
  /** deslocamento do padrão de recuo para o próximo tiro (graus) */
  recoil(): [number, number] {
    const p = this.w.pattern;
    const i = Math.min(p.length - 1, Math.floor(this.shotIdx));
    const s = this.ads ? 0.85 : 1;
    return [p[i][0] * s, p[i][1] * s];
  }
  onShot(now: number) {
    this.lastShot = now;
    this.spread = Math.min(this.w.maxSpread, this.spread + this.w.spreadPerShot);
    this.shotIdx = Math.min(this.w.pattern.length - 1, Math.floor(this.shotIdx) + 1);
    if (this.w.mag > 0) this.ammo--;
  }
  startReload(now: number) {
    if (this.w.mag <= 0 || this.reloadUntil > 0 || this.ammo >= this.w.mag) return false;
    this.reloadUntil = now + this.w.reloadMs;
    this.holding = false;
    return true;
  }
  /** movimento: speedRatio = |v| / velocidade de corrida; walking = shift */
  setMovement(speedRatio: number, walking: boolean) {
    if (speedRatio <= ACCURATE_SPEED) this.moveErr = 0;
    else {
      const k = (speedRatio - ACCURATE_SPEED) / (1 - ACCURATE_SPEED);
      this.moveErr = (walking ? this.w.walkSpread : this.w.moveSpread) * Math.min(1, k);
    }
  }
  update(dtSec: number, now: number) {
    this.spread = Math.max(this.w.baseSpread, this.spread - this.w.recoveryPerSec * dtSec);
    const since = now - this.lastShot;
    if (since > this.w.fireIntervalMs * 1.5) this.shotIdx = Math.max(0, this.shotIdx - this.w.patternRecovery * dtSec);
    if (this.reloadUntil > 0 && now >= this.reloadUntil) {
      this.reloadUntil = 0;
      this.ammo = this.w.mag;
      this.shotIdx = 0;
    }
    if (this.w.mag > 0 && this.ammo <= 0 && this.reloadUntil === 0) this.startReload(now);
  }
}
