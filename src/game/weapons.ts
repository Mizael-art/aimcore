/**
 * Perfis de arma originais, com cadência e dano baseados nos valores públicos aproximados
 * das armas do VALORANT (sem assets). Spread em graus; bloom cresce por tiro e recupera.
 */
export interface WeaponProfile {
  id: string;
  name: string;
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
}

export const WEAPONS: Record<string, WeaponProfile> = {
  trainer: {
    id: 'trainer', name: 'Trainer', auto: false, fireIntervalMs: 0, baseSpread: 0, spreadPerShot: 0, maxSpread: 0,
    recoveryPerSec: 100, headDmg: 150, bodyDmg: 0, zoom: 1, adsSpreadMul: 1,
  },
  sheriff: {
    id: 'sheriff', name: 'Sheriff', auto: false, fireIntervalMs: 250, baseSpread: 0.15, spreadPerShot: 1.2, maxSpread: 3.5,
    recoveryPerSec: 4, headDmg: 159, bodyDmg: 55, zoom: 1.15, adsSpreadMul: 0.8,
  },
  vandal: {
    id: 'vandal', name: 'Vandal', auto: true, fireIntervalMs: 1000 / 9.75, baseSpread: 0.1, spreadPerShot: 0.55, maxSpread: 4,
    recoveryPerSec: 3, headDmg: 160, bodyDmg: 40, zoom: 1.25, adsSpreadMul: 0.75,
  },
  phantom: {
    id: 'phantom', name: 'Phantom', auto: true, fireIntervalMs: 1000 / 11, baseSpread: 0.12, spreadPerShot: 0.45, maxSpread: 3.5,
    recoveryPerSec: 3.5, headDmg: 156, bodyDmg: 39, zoom: 1.25, adsSpreadMul: 0.75,
  },
};

export class WeaponState {
  spread: number;
  lastShot = -Infinity;
  holding = false;
  ads = false;
  constructor(public w: WeaponProfile) {
    this.spread = w.baseSpread;
  }
  canFire(now: number) {
    return now - this.lastShot >= this.w.fireIntervalMs - 0.5;
  }
  currentSpread() {
    return this.spread * (this.ads ? this.w.adsSpreadMul : 1);
  }
  onShot(now: number) {
    this.lastShot = now;
    this.spread = Math.min(this.w.maxSpread, this.spread + this.w.spreadPerShot);
  }
  update(dtSec: number) {
    this.spread = Math.max(this.w.baseSpread, this.spread - this.w.recoveryPerSec * dtSec);
  }
}
