import { DEG, wrapAngle } from '../core/geometry';
import type { HitPart } from '../game/target';
import { Target } from '../game/target';
import { Mode, type AimState } from './base';

/**
 * Micro Flick / Wide Flick / Micro Adjustment.
 * A sequência de posições é gerada a partir da posição do alvo ANTERIOR (não da mira),
 * então a mesma seed produz exatamente o mesmo cenário em qualquer sensibilidade.
 */
export class FlickMode extends Mode {
  private cur: Target | null = null;
  private trialStart = 0;
  private startAim: AimState = { yaw: 0, pitch: 0 };
  private anchor = { yaw: 0, pitch: 0 };
  private nextSpawnAt = 0;
  private gaps: number[] = [];
  private lastKill = -1;
  expired = 0;
  precisionSum = 0;

  protected setup() {
    this.anchor = { yaw: 0, pitch: 0 };
    this.nextSpawnAt = 0;
  }

  private spawn() {
    const minD = this.p('minDeg', 3) * DEG;
    const maxD = this.p('maxDeg', 10) * DEG;
    const bY = this.p('boundYaw', 35) * DEG;
    const bPmin = this.p('boundPitchMin', -10) * DEG;
    const bPmax = this.p('boundPitchMax', 18) * DEG;
    const dist = this.p('dist', 10);
    const radius = this.p('radius', 0.1);
    let yaw = 0;
    let pitch = 0;
    for (let i = 0; i < 12; i++) {
      const th = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(minD, maxD);
      yaw = this.anchor.yaw + (d * Math.cos(th)) / Math.cos(this.anchor.pitch);
      pitch = this.anchor.pitch + d * Math.sin(th);
      if (Math.abs(yaw) <= bY && pitch >= bPmin && pitch <= bPmax) break;
      // reflete na direção oposta se estourar o limite
      yaw = this.anchor.yaw - (d * Math.cos(th)) / Math.cos(this.anchor.pitch);
      pitch = this.anchor.pitch - d * Math.sin(th);
      if (Math.abs(yaw) <= bY && pitch >= bPmin && pitch <= bPmax) break;
    }
    yaw = Math.max(-bY, Math.min(bY, yaw));
    pitch = Math.max(bPmin, Math.min(bPmax, pitch));
    const t = new Target('sphere', this.posAt(yaw, pitch, dist), radius);
    t.spawnTime = this.time;
    this.ctx.world.addTarget(t);
    this.cur = t;
    this.anchor = { yaw, pitch };
    this.trialStart = this.time;
    this.startAim = { ...this.ctx.aim };
  }

  protected update() {
    if (!this.cur && this.time >= this.nextSpawnAt) this.spawn();
    const life = this.p('lifetime', 2500);
    if (this.cur && this.time - this.cur.spawnTime > life) {
      // alvo expirou: conta como erro
      this.recordFlick(this.trialStart, this.startAim, this.cur, false, this.time);
      this.ctx.world.removeTarget(this.cur, false);
      this.cur = null;
      this.expired++;
      this.misses++;
      this.score -= this.p('missPenalty', 20);
      this.ctx.fb.miss();
    }
  }

  protected onTargetHit(t: Target, _part: HitPart, at: number) {
    this.hits++;
    const ttk = at - this.trialStart;
    const life = this.p('lifetime', 2500);
    let pts = 100 + 60 * Math.max(0, 1 - ttk / life);
    if (this.p('precisionBonus', false)) {
      // bônus por acertar perto do centro
      const ap = this.angTo(t.aimPoint());
      const off = Math.hypot(wrapAngle(this.ctx.aim.yaw - ap.yaw) * Math.cos(ap.pitch), this.ctx.aim.pitch - ap.pitch);
      const d = Math.hypot(t.pos.x - this.ctx.world.eye.x, t.pos.y - this.ctx.world.eye.y, t.pos.z - this.ctx.world.eye.z);
      const angR = Math.atan(t.radius / d);
      const prec = Math.max(0, 1 - off / angR);
      this.precisionSum += prec;
      pts += 50 * prec;
    }
    this.score += pts;
    this.recordFlick(this.trialStart, this.startAim, t, true, at);
    if (this.lastKill >= 0) this.gaps.push(at - this.lastKill);
    this.lastKill = at;
    this.ctx.fb.hit(t, 'sphere', true);
    this.ctx.world.removeTarget(t, true);
    this.cur = null;
    this.nextSpawnAt = this.time + this.p('spawnDelay', 0);
  }

  protected onMissShot() {
    this.misses++;
    this.score -= this.p('missPenalty', 20);
    this.ctx.fb.miss();
  }

  hud() {
    const h = super.hud();
    const kills = this.trials.filter((t) => t.hit).length;
    h.extra = `${kills} alvos`;
    return h;
  }

  protected extraRecord() {
    return {};
  }

  /** tempo médio entre alvos (ms) */
  get avgGap() {
    return this.gaps.length ? this.gaps.reduce((a, b) => a + b, 0) / this.gaps.length : 0;
  }
}
