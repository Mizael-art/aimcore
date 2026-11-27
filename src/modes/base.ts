import { analyzeFlick, meanSd, type AimSample } from '../core/flick';
import { dirFromYawPitch, spreadDir, yawPitchTo, type V3, v3, DEG } from '../core/geometry';
import { Rng } from '../core/rng';
import type { ModeId, SessionContext, SessionRecord, Trial } from '../data/types';
import { boxHit, type Box, type HitPart, Target } from '../game/target';
import { WEAPONS, WeaponState } from '../game/weapons';

export interface ModeConfig {
  mode: ModeId;
  scenario?: string;
  label: string;
  duration: number; // s
  seed: number;
  context: SessionContext;
  weapon?: string;
  params?: Record<string, number | string | boolean>;
}

export interface WorldApi {
  eye: V3;
  targets: Target[];
  covers: Box[];
  addTarget(t: Target): Target;
  removeTarget(t: Target, killed: boolean): void;
  setCovers(b: Box[]): void;
}

export interface ShotInfo {
  dir: V3;
  /** golpe de faca (true) ou tiro */
  melee?: boolean;
  heavy?: boolean;
  /** distância até o alvo atingido (null = não acertou alvo) */
  hitT: number | null;
  part?: HitPart;
}

export interface Feedback {
  shot(info?: ShotInfo): void;
  reload?(ms: number): void;
  /** troca de arma (id do perfil) */
  equip?(id: string): void;
  /** o inimigo te acertou (cenários de duelo) */
  playerKilled?(by: Target): void;
  hit(t: Target, part: HitPart, kill: boolean): void;
  miss(): void;
  falseStart(): void;
  message(text: string, ms?: number): void;
  setDark?(dark: boolean): void;
}

export interface AimState {
  yaw: number;
  pitch: number;
}

export interface HudInfo {
  timeLeft: number; // s
  score: number;
  accuracy: number;
  extra?: string;
  progress?: number;
}

export interface ModeCtx {
  world: WorldApi;
  aim: AimState;
  fb: Feedback;
}

/** Base de todos os modos: tempo, tiros, raycast, trials e montagem do registro. */
export abstract class Mode {
  ctx!: ModeCtx;
  rng: Rng;
  fxRng: Rng;
  time = 0;
  done = false;
  score = 0;
  shots = 0;
  hits = 0;
  misses = 0;
  headshots = 0;
  bodyshots = 0;
  trials: Trial[] = [];
  segments: number[] = [];
  weapon: WeaponState;
  /** amostras de mira desde o último reset (para análise de flick) */
  samples: AimSample[] = [];
  readonly durationMs: number;
  private segScoreStart = 0;
  private segIdx = 0;
  readonly segCount = 6;
  placementErrs: number[] = [];
  /** velocidade do jogador / velocidade de corrida (atualizado pelo engine) */
  moveRatio = 0;
  /** tiros disparados com imprecisão de movimento (sem counter-strafe) */
  movingShots = 0;
  /** inventário: 1 = primária, 2 = secundária, 3 = faca */
  slots: string[] = [];
  private states = new Map<string, WeaponState>();
  /** golpe atual é forte (faca, botão direito) */
  meleeHeavy = false;
  /** mortes do jogador (duelo) */
  deaths = 0;

  constructor(public cfg: ModeConfig) {
    this.rng = new Rng(cfg.seed);
    this.fxRng = new Rng(cfg.seed ^ 0x5bd1e995);
    this.weapon = new WeaponState(WEAPONS[cfg.weapon ?? 'trainer'] ?? WEAPONS.trainer);
    this.durationMs = cfg.duration * 1000;
    if (this.weapon.w.kind !== 'none') {
      const primary = this.weapon.w.id;
      this.slots = primary === 'sheriff' ? ['sheriff', 'sheriff', 'knife'] : [primary, 'sheriff', 'knife'];
      this.states.set(primary, this.weapon);
    }
  }

  p<T extends number | string | boolean>(k: string, d: T): T {
    const v = this.cfg.params?.[k];
    return (v === undefined ? d : v) as T;
  }

  init(ctx: ModeCtx) {
    this.ctx = ctx;
    this.setup();
  }

  protected abstract setup(): void;
  protected abstract update(dt: number): void;
  protected abstract onTargetHit(t: Target, part: HitPart, at: number): void;
  protected onMissShot(_at: number) {}
  /** Modos de tracking sobrescrevem. */
  holdFire(_down: boolean) {}
  /** Retorna se o modo usa disparo contínuo (tracking) */
  get continuous() {
    return false;
  }

  tick(dtMs: number) {
    if (this.done) return;
    this.time += dtMs;
    this.weapon.update(dtMs / 1000, this.time);
    if (this.weapon.holding && this.weapon.w.auto && !this.continuous) {
      while (this.weapon.canFire(this.time) && this.weapon.holding) this.fire(this.time);
    }
    this.samples.push({ t: this.time, yaw: this.ctx.aim.yaw, pitch: this.ctx.aim.pitch });
    if (this.samples.length > 4000) this.samples.splice(0, 2000);
    this.update(dtMs);
    // segmentos (consistência intra-sessão)
    const segLen = this.durationMs / this.segCount;
    while (this.segIdx < this.segCount && this.time >= (this.segIdx + 1) * segLen) {
      this.segments.push(this.segmentValue());
      this.segScoreStart = this.score;
      this.segIdx++;
    }
    if (this.time >= this.durationMs || this.isFinished()) this.done = true;
  }

  protected segmentValue(): number {
    return this.score - this.segScoreStart;
  }
  protected isFinished() {
    return false;
  }

  trigger(down: boolean, at: number) {
    if (this.done) return;
    this.weapon.holding = down;
    if (this.continuous) {
      this.holdFire(down);
      return;
    }
    if (down && this.weapon.canFire(at)) this.fire(at);
  }

  /** Troca de arma pelo slot (0 = primária, 1 = secundária, 2 = faca). */
  switchSlot(slot: number): string | null {
    const id = this.slots[slot];
    if (!id || this.done || id === this.weapon.w.id) return null;
    let st = this.states.get(id);
    if (!st) {
      st = new WeaponState(WEAPONS[id]);
      this.states.set(id, st);
    }
    this.weapon.holding = false;
    this.weapon.ads = false;
    st.reloadUntil = 0; // trocar cancela a recarga
    st.holding = false;
    st.equipUntil = this.time + (st.w.equipMs ?? 500);
    this.weapon = st;
    this.ctx.fb.equip?.(id);
    return id;
  }

  /** Golpe forte da faca (botão direito). */
  heavyMelee(at: number) {
    if (this.weapon.w.kind !== 'knife' || this.done || at - this.weapon.lastShot < 950 || at < this.weapon.equipUntil) return;
    this.meleeHeavy = true;
    this.melee(at);
    this.meleeHeavy = false;
  }

  private melee(at: number) {
    this.shots++;
    this.weapon.lastShot = at;
    const dir = dirFromYawPitch(this.ctx.aim.yaw, this.ctx.aim.pitch);
    const res = this.raycast(dir);
    const inRange = res && res.t <= (this.weapon.w.meleeRange ?? 2.5);
    this.ctx.fb.shot({ dir, hitT: inRange ? res!.t : null, part: inRange ? res!.part : undefined, melee: true, heavy: this.meleeHeavy });
    if (inRange) this.onTargetHit(res!.target, res!.part, at);
    else this.onMissShot(at);
  }

  setAds(on: boolean) {
    this.weapon.ads = on && this.weapon.w.zoom > 1;
  }

  /** Dispara um raio do centro da mira (padrão de recuo + spread + imprecisão de movimento). */
  fire(at: number) {
    if (this.weapon.w.kind === 'knife') return this.melee(at);
    this.shots++;
    if (this.weapon.moveErr > 0) this.movingShots++;
    const [rp, ry] = this.weapon.recoil();
    this.weapon.onShot(at);
    const baseYaw = this.ctx.aim.yaw + (ry * DEG) / Math.max(0.2, Math.cos(this.ctx.aim.pitch));
    const basePitch = this.ctx.aim.pitch + rp * DEG;
    const sp = spreadDir(baseYaw, basePitch, this.weaponSpreadForShot(), () => this.fxRng.next());
    const dir = dirFromYawPitch(sp.yaw, sp.pitch);
    const res = this.raycast(dir);
    this.ctx.fb.shot({ dir, hitT: res ? res.t : null, part: res?.part });
    if (res) {
      this.onTargetHit(res.target, res.part, at);
    } else {
      this.onMissShot(at);
    }
  }

  reload() {
    if (this.weapon.startReload(this.time)) this.ctx.fb.reload?.(this.weapon.w.reloadMs);
  }

  protected weaponSpreadForShot() {
    return this.weapon.currentSpread();
  }

  raycast(dir: V3): { target: Target; part: HitPart; t: number } | null {
    const eye = this.ctx.world.eye;
    let best: { target: Target; part: HitPart; t: number } | null = null;
    for (const t of this.ctx.world.targets) {
      const h = t.hitTest(eye, dir);
      if (h && (!best || h.t < best.t)) best = { target: t, part: h.part, t: h.t };
    }
    if (best) {
      for (const b of this.ctx.world.covers) {
        const tb = boxHit(eye, dir, b);
        if (tb >= 0 && tb < best.t) return null;
      }
    }
    return best;
  }

  /** Direção (yaw/pitch) do olho até um ponto */
  angTo(p: V3) {
    return yawPitchTo(this.ctx.world.eye, p);
  }

  /** Posição a partir de ângulos e distância. */
  posAt(yaw: number, pitch: number, dist: number): V3 {
    const d = dirFromYawPitch(yaw, pitch);
    const e = this.ctx.world.eye;
    return v3(e.x + d.x * dist, e.y + d.y * dist, e.z + d.z * dist);
  }

  /** Registra um trial de flick usando as amostras desde `startTime`. */
  recordFlick(startTime: number, startAim: AimState, target: Target, hit: boolean, endTime: number) {
    const ap = this.angTo(target.aimPoint());
    const dist = Math.hypot(target.aimPoint().x - this.ctx.world.eye.x, target.aimPoint().y - this.ctx.world.eye.y, target.aimPoint().z - this.ctx.world.eye.z);
    const angR = Math.atan(target.radius / dist) / DEG;
    const samples = this.samples.filter((s) => s.t >= startTime && s.t <= endTime);
    const a = analyzeFlick(samples, startAim, ap, angR);
    const trial: Trial = { t: endTime - startTime, dist: a.dist, over: a.valid && a.over, under: a.valid && a.under, stopErr: a.stopErr, hit };
    this.trials.push(trial);
    return trial;
  }

  hud(): HudInfo {
    return { timeLeft: Math.max(0, (this.durationMs - this.time) / 1000), score: Math.round(this.score), accuracy: this.shots ? this.hits / this.shots : 0 };
  }

  /** Tempo médio relevante do modo (ms) */
  protected timeStats(): { mean: number; sd: number } {
    return meanSd(this.trials.filter((t) => t.hit).map((t) => t.t));
  }

  protected extraRecord(): Partial<SessionRecord> {
    return {};
  }

  record(meta: { dpi: number; sens: number; completed: boolean }): SessionRecord {
    if (this.segments.length < this.segCount && this.time > 0) {
      // sessão interrompida: fecha segmento parcial
      this.segments.push(this.segmentValue());
    }
    const ts = this.timeStats();
    return {
      id: '',
      date: Date.now(),
      mode: this.cfg.mode,
      scenario: this.cfg.scenario,
      context: this.cfg.context,
      duration: Math.round(this.time / 1000),
      dpi: meta.dpi,
      sens: meta.sens,
      seed: this.cfg.seed,
      score: Math.max(0, Math.round(this.score)),
      shots: this.shots,
      hits: this.hits,
      misses: this.misses,
      headshots: this.headshots,
      bodyshots: this.bodyshots,
      accuracy: this.shots ? this.hits / this.shots : 0,
      avgTime: Math.round(ts.mean),
      sdTime: Math.round(ts.sd),
      overshoots: this.trials.filter((t) => t.over).length,
      undershoots: this.trials.filter((t) => t.under).length,
      trialsCount: this.trials.length,
      segments: this.segments.map((s) => Math.round(s * 100) / 100),
      trials: this.trials.map((t) => ({ ...t, t: Math.round(t.t), dist: Math.round(t.dist * 100) / 100, stopErr: Math.round(t.stopErr * 100) / 100 })),
      crosshairPlacement: this.placementErrs.length ? meanSd(this.placementErrs).mean : undefined,
      completed: meta.completed,
      movingShots: this.slots.length ? this.movingShots : undefined,
      deaths: this.cfg.params?.duel ? this.deaths : undefined,
      ...this.extraRecord(),
    };
  }
}
