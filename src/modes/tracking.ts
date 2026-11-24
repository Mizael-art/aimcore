import { DEG, dirFromYawPitch } from '../core/geometry';
import { Target, type HitPart } from '../game/target';
import { Mode } from './base';

/**
 * Tracking: alvo em movimento com trechos horizontais, verticais e diagonais,
 * velocidades variadas e mudanças imprevisíveis de direção.
 * Segure o botão esquerdo para "atirar"; amostragem a 20 ticks/s para estatística.
 */
export class TrackingMode extends Mode {
  private t!: Target;
  // posição do alvo em espaço angular (rad) a uma distância fixa
  private ay = 0;
  private ap = 0;
  private vy = 0;
  private vp = 0;
  private tvy = 0;
  private tvp = 0;
  private segEnd = 0;
  private firing = false;
  private tickAcc = 0;
  onTargetMs = 0;
  firingMs = 0;
  onAimMs = 0; // tempo com mira sobre o alvo, atirando ou não

  get continuous() {
    return true;
  }

  protected setup() {
    const dist = this.p('dist', 12);
    this.t = new Target('sphere', this.posAt(0, 0.05, dist), this.p('radius', 0.32));
    this.ctx.world.addTarget(this.t);
    this.ay = 0;
    this.ap = 0.05;
    this.newSegment();
  }

  private newSegment() {
    const kinds = ['h', 'h', 'v', 'd', 'd'] as const;
    const k = this.rng.pick(kinds);
    const minS = this.p('minSpeed', 10) * DEG;
    const maxS = this.p('maxSpeed', 34) * DEG;
    const s = this.rng.range(minS, maxS);
    const sx = this.rng.sign();
    const sy = this.rng.sign();
    if (k === 'h') {
      this.tvy = s * sx;
      this.tvp = 0;
    } else if (k === 'v') {
      this.tvy = 0;
      this.tvp = s * 0.6 * sy;
    } else {
      this.tvy = s * 0.75 * sx;
      this.tvp = s * 0.5 * sy;
    }
    this.segEnd = this.time + this.rng.range(this.p('minSeg', 250), this.p('maxSeg', 1100));
  }

  holdFire(down: boolean) {
    this.firing = down;
  }

  protected update(dt: number) {
    const dts = dt / 1000;
    if (this.time >= this.segEnd) this.newSegment();
    // aceleração finita (mudança brusca, mas não teleporte)
    const acc = this.p('accel', 260) * DEG * dts;
    this.vy += Math.max(-acc, Math.min(acc, this.tvy - this.vy));
    this.vp += Math.max(-acc, Math.min(acc, this.tvp - this.vp));
    this.ay += this.vy * dts;
    this.ap += this.vp * dts;
    const bY = this.p('boundYaw', 40) * DEG;
    const bPmin = this.p('boundPitchMin', -8) * DEG;
    const bPmax = this.p('boundPitchMax', 20) * DEG;
    if (this.ay > bY || this.ay < -bY) {
      this.ay = Math.max(-bY, Math.min(bY, this.ay));
      this.tvy = -this.tvy;
      this.vy = -this.vy * 0.5;
    }
    if (this.ap > bPmax || this.ap < bPmin) {
      this.ap = Math.max(bPmin, Math.min(bPmax, this.ap));
      this.tvp = -this.tvp;
      this.vp = -this.vp * 0.5;
    }
    const d = dirFromYawPitch(this.ay, this.ap);
    const dist = this.p('dist', 12);
    const e = this.ctx.world.eye;
    this.t.pos.x = e.x + d.x * dist;
    this.t.pos.y = e.y + d.y * dist;
    this.t.pos.z = e.z + d.z * dist;

    const onTarget = !!this.raycast(dirFromYawPitch(this.ctx.aim.yaw, this.ctx.aim.pitch));
    if (onTarget) this.onAimMs += dt;
    if (this.firing) {
      this.firingMs += dt;
      if (onTarget) {
        this.onTargetMs += dt;
        this.score += dt / 10; // 100 pts por segundo no alvo
        this.t.hitFlash = 1;
      }
      // ticks de 50 ms contam como "tiros" para precisão
      this.tickAcc += dt;
      while (this.tickAcc >= 50) {
        this.tickAcc -= 50;
        this.shots++;
        if (onTarget) this.hits++;
        else this.misses++;
      }
    }
  }

  protected onTargetHit(_t: Target, _p: HitPart) {}

  hud() {
    const h = super.hud();
    h.accuracy = this.firingMs ? this.onTargetMs / this.firingMs : 0;
    h.extra = `${Math.round((this.onTargetMs / Math.max(1, this.time)) * 100)}% no alvo`;
    return h;
  }

  protected timeStats() {
    return { mean: 0, sd: 0 };
  }

  protected extraRecord() {
    return {
      trackingPct: this.time ? this.onTargetMs / this.time : 0,
      accuracy: this.firingMs ? this.onTargetMs / this.firingMs : 0,
    };
  }
}
