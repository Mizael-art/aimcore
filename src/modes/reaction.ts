import { meanSd, median } from '../core/flick';
import { Target, type HitPart } from '../game/target';
import { Mode } from './base';

/**
 * Reaction Time: tela vazia, alvo surge no centro em momento aleatório.
 * - clique antes do alvo = falso disparo (reinicia a espera)
 * - reação < 100 ms = antecipação (descartada)
 * O instante de exibição é o timestamp do frame em que o alvo foi desenhado.
 */
export const ANTICIPATION_MS = 100;

export class ReactionMode extends Mode {
  private state: 'wait' | 'shown' | 'cooldown' = 'wait';
  private showAt = 0;
  private target: Target | null = null;
  private cooldownEnd = 0;
  times: number[] = [];
  falseStarts = 0;
  anticipations = 0;
  /** preenchido pelo engine: instante (tempo de jogo) do frame que exibiu o alvo */
  presentedAt = -1;

  protected setup() {
    this.ctx.fb.setDark?.(true);
    this.scheduleNext();
  }

  private scheduleNext() {
    this.state = 'wait';
    this.showAt = this.time + this.rng.range(this.p('minDelay', 1200), this.p('maxDelay', 3800));
    this.presentedAt = -1;
  }

  get trialsTarget() {
    return this.p('trials', 10);
  }

  protected isFinished() {
    return this.times.length >= this.trialsTarget;
  }

  protected update() {
    if (this.state === 'wait' && this.time >= this.showAt) {
      // alvo grande centralizado à frente da mira atual
      const ap = this.posAt(this.ctx.aim.yaw, this.ctx.aim.pitch, 8);
      this.target = new Target('sphere', { x: ap.x, y: ap.y, z: ap.z }, 1.1);
      this.target.spawnTime = this.time;
      this.ctx.world.addTarget(this.target);
      this.ctx.fb.setDark?.(false);
      this.state = 'shown';
    } else if (this.state === 'cooldown' && this.time >= this.cooldownEnd) {
      this.ctx.fb.setDark?.(true);
      this.scheduleNext();
    }
  }

  /** Reação: qualquer clique conta (não exige mirar). */
  trigger(down: boolean, at: number) {
    if (!down || this.done) return;
    this.shots++;
    if (this.state === 'wait') {
      this.falseStarts++;
      this.ctx.fb.falseStart();
      this.ctx.fb.message('Falso disparo — espere o alvo', 900);
      this.scheduleNext();
      return;
    }
    if (this.state !== 'shown' || !this.target) return;
    const shown = this.presentedAt >= 0 ? this.presentedAt : this.target.spawnTime;
    const rt = at - shown;
    if (rt < ANTICIPATION_MS) {
      this.anticipations++;
      this.ctx.fb.falseStart();
      this.ctx.fb.message(`Antecipação (${Math.round(rt)} ms) — descartado`, 1000);
    } else {
      this.hits++;
      this.times.push(rt);
      this.trials.push({ t: rt, dist: 0, over: false, under: false, stopErr: 0, hit: true });
      this.score = this.times.length ? 100000 / median(this.times) : 0;
      this.ctx.fb.hit(this.target, 'sphere', true);
      this.ctx.fb.message(`${Math.round(rt)} ms`, 700);
    }
    this.ctx.world.removeTarget(this.target, true);
    this.target = null;
    this.state = 'cooldown';
    this.cooldownEnd = this.time + 700;
  }

  protected onTargetHit(_t: Target, _p: HitPart) {}

  hud() {
    const h = super.hud();
    const m = meanSd(this.times).mean;
    h.timeLeft = Math.max(0, (this.durationMs - this.time) / 1000);
    h.extra = `${this.times.length}/${this.trialsTarget} · média ${m ? Math.round(m) + ' ms' : '—'}`;
    h.progress = this.times.length / this.trialsTarget;
    return h;
  }

  protected timeStats() {
    return meanSd(this.times);
  }

  protected extraRecord() {
    this.ctx.fb.setDark?.(false);
    return {
      falseStarts: this.falseStarts + this.anticipations,
      misses: this.falseStarts + this.anticipations,
      accuracy: this.shots ? this.times.length / this.shots : 0,
    };
  }
}
