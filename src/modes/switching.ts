import { DEG, angleBetween } from '../core/geometry';
import { meanSd } from '../core/flick';
import { Target, type HitPart } from '../game/target';
import { Mode, type AimState } from './base';

/**
 * Target Switching: vários alvos simultâneos em distâncias diferentes.
 * Cada eliminação gera um novo alvo; mede tempo de troca e precisão.
 */
export class SwitchingMode extends Mode {
  private lastKillAt = 0;
  private lastKillAim: AimState = { yaw: 0, pitch: 0 };
  private switchTimes: number[] = [];
  private hitsNeeded = 1;

  protected setup() {
    this.hitsNeeded = this.p('hitsPerTarget', 1);
    const n = this.p('count', 3);
    for (let i = 0; i < n; i++) this.spawn();
    this.lastKillAt = 0;
    this.lastKillAim = { ...this.ctx.aim };
  }

  private spawn() {
    const bY = this.p('boundYaw', 50) * DEG;
    const minP = this.p('boundPitchMin', -6) * DEG;
    const maxP = this.p('boundPitchMax', 18) * DEG;
    const minSep = this.p('minSep', 12) * DEG;
    let yaw = 0;
    let pitch = 0;
    for (let i = 0; i < 20; i++) {
      yaw = this.rng.range(-bY, bY);
      pitch = this.rng.range(minP, maxP);
      if (this.ctx.world.targets.every((t) => {
        const a = this.angTo(t.aimPoint());
        return angleBetween(a.yaw, a.pitch, yaw, pitch) >= minSep;
      })) break;
    }
    const dist = this.rng.range(this.p('minDist', 8), this.p('maxDist', 22));
    // tamanho angular semelhante: raio cresce com a distância, mas alvos distantes ficam menores
    const radius = this.p('radius', 0.2) * Math.sqrt(dist / 12);
    const t = new Target('sphere', this.posAt(yaw, pitch, dist), radius);
    t.spawnTime = this.time;
    t.hp = this.hitsNeeded;
    t.maxHp = this.hitsNeeded;
    this.ctx.world.addTarget(t);
  }

  protected update() {}

  protected onTargetHit(t: Target, _p: HitPart, at: number) {
    this.hits++;
    t.hp--;
    if (t.hp > 0) {
      this.score += 25;
      this.ctx.fb.hit(t, 'sphere', false);
      return;
    }
    const sw = at - this.lastKillAt;
    this.switchTimes.push(sw);
    this.recordFlick(this.lastKillAt, this.lastKillAim, t, true, at);
    this.score += 100 + 60 * Math.max(0, 1 - sw / 1500);
    this.ctx.fb.hit(t, 'sphere', true);
    this.ctx.world.removeTarget(t, true);
    this.lastKillAt = at;
    this.lastKillAim = { ...this.ctx.aim };
    this.spawn();
  }

  protected onMissShot() {
    this.misses++;
    this.score -= this.p('missPenalty', 15);
    this.ctx.fb.miss();
  }

  protected timeStats() {
    return meanSd(this.switchTimes.slice(1)); // primeiro "switch" inclui reação inicial
  }

  hud() {
    const h = super.hud();
    h.extra = `${this.switchTimes.length} eliminados`;
    return h;
  }
}
