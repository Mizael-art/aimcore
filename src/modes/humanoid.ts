import { DEG, rayAabb, wrapAngle } from '../core/geometry';
import { meanSd } from '../core/flick';
import { Rng } from '../core/rng';
import { HUMANOID, Target, type Box, type HitPart } from '../game/target';
import { Mode } from './base';

/**
 * Modo humanoide (Headshot Training + cenários VALORANT).
 * Alvos com proporção de agente, cabeça na altura dos olhos.
 * Parâmetros controlam distância, movimento (parado / strafe ADAD), quantidade simultânea,
 * ondas (entry), peeks atrás de cobertura (defensive) e regra de one-tap.
 */
interface MoveState {
  rng: Rng;
  axisX: number; // eixo lateral (horizontal, perpendicular à linha de visão)
  axisZ: number;
  base: number; // deslocamento lateral central
  off: number; // deslocamento lateral atual
  vel: number;
  tvel: number;
  until: number;
  min: number;
  max: number;
  originX: number;
  originZ: number;
  peekPhase?: 'out' | 'hold' | 'back';
  peekDir?: number;
  peekOut?: number;
  peekHoldUntil?: number;
}

const RUN = 5.4; // m/s (velocidade de corrida de agente)

export class HumanoidMode extends Mode {
  private moves = new Map<Target, MoveState>();
  private nextSpawn = 0;
  private waveStart = 0;
  private waveTimes: number[] = [];
  private escapes = 0;
  private killTimes: number[] = [];
  private edges: { x: number; z: number; dir: number }[] = [];
  /** posições fixas de inimigos segurando ângulo (mapa Beco) */
  private spots: { x: number; z: number }[] = [];
  private lastSpot = -1;
  private invulnUntil = 0;
  /** tempo exposto até cada abate no duelo (ms) */
  exposures: number[] = [];

  protected setup() {
    this.buildCovers();
    this.nextSpawn = 600;
  }

  private buildCovers() {
    const layout = this.p<string>('layout', 'none');
    const covers: Box[] = [];
    this.edges = [];
    if (layout === 'defensive') {
      // duas paredes formando uma "janela" de peek a ~16 m
      const z = -this.p('coverDist', 16);
      covers.push({ min: { x: -9, y: 0, z: z - 0.6 }, max: { x: -1.6, y: 3, z: z + 0.6 } });
      covers.push({ min: { x: 1.6, y: 0, z: z - 0.6 }, max: { x: 9, y: 3, z: z + 0.6 } });
      this.edges.push({ x: -1.6, z: z - 1.4, dir: 1 }, { x: 1.6, z: z - 1.4, dir: -1 });
    } else if (layout === 'alley') {
      // sua cobertura: parede à frente/esquerda; o beco segue para -Z
      covers.push({ min: { x: -5, y: 0, z: -2.6 }, max: { x: 0.4, y: 3.2, z: -1.6 } });
      // caixas encostadas nas paredes do beco
      covers.push({ min: { x: -5, y: 0, z: -11 }, max: { x: -3.6, y: 1.3, z: -9.6 } });
      covers.push({ min: { x: 4.6, y: 0, z: -19 }, max: { x: 6, y: 1.5, z: -17.4 } });
      covers.push({ min: { x: -5, y: 0, z: -29 }, max: { x: -3.4, y: 1.9, z: -27.2 } });
      this.spots = [
        { x: 2.6, z: -13 }, { x: -2.6, z: -17 }, { x: 4.4, z: -22 }, { x: 0.6, z: -26 },
        { x: -2.2, z: -31 }, { x: 3.4, z: -35 }, { x: 5.2, z: -11 }, { x: -0.8, z: -21 },
      ];
    } else if (layout === 'entry') {
      // várias coberturas em ângulos diferentes (site)
      const spots: [number, number, number][] = [
        [-7, -9, 1], [6, -11, -1], [-3, -18, 1], [9, -20, -1], [-11, -15, 1], [2, -24, 1],
      ];
      for (const [x, z, dir] of spots) {
        const w = 1.4;
        covers.push({ min: { x: x - w, y: 0, z: z - 0.7 }, max: { x: x + w, y: 1.9 + (Math.abs(x) % 2) * 0.6, z: z + 0.7 } });
        this.edges.push({ x: x + dir * w, z: z - 1.2, dir });
      }
    }
    this.ctx.world.setCovers(covers);
  }

  private spawn() {
    const minD = this.p('minDist', 10);
    const maxD = this.p('maxDist', 25);
    const bY = this.p('boundYaw', 35) * DEG;
    const scale = this.rng.range(this.p('sizeMin', 0.9), this.p('sizeMax', 1.1));
    const motion = this.p<string>('motion', 'static');
    const moving = motion === 'strafe' || (motion === 'mixed' && this.rng.next() < 0.5);
    const e = this.ctx.world.eye;
    let x: number;
    let z: number;
    let peek: { dir: number } | null = null;
    if (this.spots.length) {
      let i = this.rng.int(0, this.spots.length - 1);
      if (i === this.lastSpot) i = (i + 1) % this.spots.length;
      this.lastSpot = i;
      x = this.spots[i].x;
      z = this.spots[i].z;
    } else if (this.edges.length && this.p('peek', true)) {
      const free = this.edges.filter((ed) => ![...this.moves.values()].some((m) => Math.abs(m.originZ - ed.z) < 0.5 && Math.abs(m.originX - (ed.x - ed.dir * 0.6)) < 0.5));
      const edge = this.rng.pick(free.length ? free : this.edges);
      x = edge.x - edge.dir * 0.6; // começa escondido atrás da borda
      z = edge.z;
      peek = { dir: edge.dir };
    } else {
      let yaw = 0;
      for (let i = 0; i < 10; i++) {
        yaw = this.rng.range(-bY, bY);
        const ok = this.ctx.world.targets.every((t) => Math.abs(wrapAngle(this.angTo(t.aimPoint()).yaw - yaw)) > 6 * DEG);
        if (ok) break;
      }
      const d = this.rng.range(minD, maxD);
      x = e.x - Math.sin(yaw) * d;
      z = e.z - Math.cos(yaw) * d;
    }
    const t = new Target('humanoid', { x, y: 0, z }, scale);
    t.spawnTime = this.time;
    t.shownAt = this.time;
    t.hp = 150;
    t.maxHp = 150;
    // eixo lateral
    const lx = z - e.z;
    const lz = -(x - e.x);
    const ll = Math.hypot(lx, lz) || 1;
    const ms: MoveState = {
      rng: new Rng(this.rng.int(1, 2 ** 31)),
      axisX: peek ? 1 : lx / ll,
      axisZ: peek ? 0 : lz / ll,
      base: 0,
      off: 0,
      vel: 0,
      tvel: 0,
      until: 0,
      min: -this.p('strafeRange', 1.8),
      max: this.p('strafeRange', 1.8),
      originX: x,
      originZ: z,
    };
    if (peek) {
      ms.peekPhase = 'out';
      ms.peekDir = peek.dir;
      ms.peekOut = this.rng.range(0.9, 2.2);
      ms.min = -0.2;
      ms.max = ms.peekOut + 0.6;
    } else if (!moving || this.spots.length) {
      ms.min = ms.max = 0;
    }
    this.moves.set(t, ms);
    t.data.startYaw = this.ctx.aim.yaw;
    t.data.startPitch = this.ctx.aim.pitch;
    // pré-mira: erro vertical entre mira e cabeça no instante do spawn
    const hp = this.angTo(t.aimPoint());
    if (!peek) this.placementErrs.push(Math.abs(this.ctx.aim.pitch - hp.pitch) / DEG);
    this.ctx.world.addTarget(t);
  }

  private moveTarget(t: Target, ms: MoveState, dts: number) {
    const accel = 32; // m/s²
    if (ms.peekPhase) {
      const dir = ms.peekDir!;
      if (ms.peekPhase === 'out') {
        ms.tvel = RUN * this.p('peekSpeed', 1);
        if (!t.data.revealed && ms.off >= 0.25) {
          // momento em que o inimigo fica visível: mede pré-mira e inicia o cronômetro
          t.data.revealed = 1;
          t.shownAt = this.time;
          t.data.startYaw = this.ctx.aim.yaw;
          t.data.startPitch = this.ctx.aim.pitch;
          const hp = this.angTo(t.aimPoint());
          this.placementErrs.push(Math.hypot(wrapAngle(this.ctx.aim.yaw - hp.yaw) * Math.cos(hp.pitch), this.ctx.aim.pitch - hp.pitch) / DEG);
        }
        if (ms.off >= ms.peekOut!) {
          ms.peekPhase = 'hold';
          ms.peekHoldUntil = this.time + ms.rng.range(this.p('peekHoldMin', 350), this.p('peekHoldMax', 900));
        }
      } else if (ms.peekPhase === 'hold') {
        ms.tvel = 0;
        if (this.time >= ms.peekHoldUntil!) ms.peekPhase = 'back';
      } else {
        ms.tvel = -RUN;
        if (ms.off <= -0.15) {
          // voltou para trás da cobertura: escapou
          this.escape(t);
          return;
        }
      }
      ms.vel += Math.max(-accel * dts, Math.min(accel * dts, ms.tvel - ms.vel));
      ms.off += ms.vel * dts;
      t.pos.x = ms.originX + dir * (ms.off + 0.6);
      t.pos.z = ms.originZ;
      return;
    }
    if (ms.max === ms.min) return;
    if (this.time >= ms.until) {
      // ADAD: escolhe direção e duração; às vezes para (counter-strafe)
      const r = ms.rng.next();
      const speed = RUN * this.p('strafeSpeed', 1);
      ms.tvel = r < 0.15 ? 0 : (ms.off > 0 ? -1 : 1) * (ms.rng.next() < 0.7 ? 1 : -1) * speed;
      ms.until = this.time + ms.rng.range(180, 750);
    }
    ms.vel += Math.max(-accel * dts, Math.min(accel * dts, ms.tvel - ms.vel));
    ms.off += ms.vel * dts;
    if (ms.off > ms.max || ms.off < ms.min) {
      ms.off = Math.max(ms.min, Math.min(ms.max, ms.off));
      ms.tvel = -ms.tvel;
      ms.vel = 0;
    }
    t.pos.x = ms.originX + ms.axisX * ms.off;
    t.pos.z = ms.originZ + ms.axisZ * ms.off;
  }

  private escape(t: Target) {
    this.escapes++;
    this.misses++;
    this.score -= 30;
    this.recordFlick(t.shownAt, { yaw: t.data.startYaw, pitch: t.data.startPitch }, t, false, this.time);
    this.remove(t, false);
    this.ctx.fb.miss();
  }

  private remove(t: Target, killed: boolean) {
    this.moves.delete(t);
    this.ctx.world.removeTarget(t, killed);
    if (this.p('wave', false) && this.ctx.world.targets.length === 0) {
      this.waveTimes.push(this.time - this.waveStart);
      this.nextSpawn = this.time + this.p('respawnDelay', 900);
    } else if (!this.p('wave', false)) {
      this.nextSpawn = Math.min(this.nextSpawn, this.time + this.p('respawnDelay', 250));
    }
  }

  protected update(dt: number) {
    const dts = dt / 1000;
    const wave = this.p('wave', false);
    const count = this.p('count', 1);
    if (this.time >= this.nextSpawn) {
      if (wave) {
        if (this.ctx.world.targets.length === 0) {
          for (let i = 0; i < count; i++) this.spawn();
          this.waveStart = this.time;
        }
        this.nextSpawn = Infinity;
      } else if (!this.p('requireMove', false) || this.moveRatio > 0.55) {
        // counter-strafe drill: o inimigo só aparece enquanto você está em movimento
        while (this.ctx.world.targets.length < count) this.spawn();
        this.nextSpawn = Infinity;
      }
    }
    if (this.p('duel', false)) this.duel(dt);
    const life = this.p('lifetime', 0);
    for (const t of [...this.ctx.world.targets]) {
      const ms = this.moves.get(t);
      if (ms) this.moveTarget(t, ms, dts);
      if (life > 0 && t.alive && this.time - t.spawnTime > life && !ms?.peekPhase) this.escape(t);
    }
  }

  /** linha de visão entre a cabeça do inimigo e seus olhos (bloqueada por coberturas) */
  private lineOfSight(t: Target) {
    const h = t.aimPoint();
    const e = this.ctx.world.eye;
    const dx = e.x - h.x;
    const dy = e.y - h.y;
    const dz = e.z - h.z;
    const len = Math.hypot(dx, dy, dz);
    const d = { x: dx / len, y: dy / len, z: dz / len };
    for (const b of this.ctx.world.covers) {
      const tb = rayAabb(h, d, b.min, b.max);
      if (tb >= 0 && tb < len) return false;
    }
    return true;
  }

  /**
   * Duelo: o inimigo segura o ângulo. Se você ficar visível por mais tempo que a reação dele,
   * ele acerta você. Peek rápido (swing) aumenta a reação dele, como a vantagem de quem dá peek.
   */
  private duel(dt: number) {
    for (const t of [...this.ctx.world.targets]) {
      const vis = this.lineOfSight(t);
      if (!vis) {
        t.data.exposed = Math.max(0, (t.data.exposed ?? 0) - dt * 2);
        continue;
      }
      if (!t.data.seen) {
        // primeira vez que se veem: inicia cronômetro e define a reação do bot
        t.data.seen = 1;
        t.shownAt = this.time;
        t.data.startYaw = this.ctx.aim.yaw;
        t.data.startPitch = this.ctx.aim.pitch;
        const swing = this.moveRatio > 0.6 ? this.p('swingBonus', 140) : 0;
        t.data.reaction = this.p('botReaction', 420) + swing + this.rng.range(-70, 90);
        const hp = this.angTo(t.aimPoint());
        this.placementErrs.push(Math.hypot(wrapAngle(this.ctx.aim.yaw - hp.yaw) * Math.cos(hp.pitch), this.ctx.aim.pitch - hp.pitch) / DEG);
      }
      t.data.exposed = (t.data.exposed ?? 0) + dt;
      if (t.data.exposed >= t.data.reaction && this.time >= this.invulnUntil) {
        this.deaths++;
        this.score -= 150;
        this.invulnUntil = this.time + 900;
        this.ctx.fb.playerKilled?.(t);
        for (const o of this.ctx.world.targets) o.data.exposed = 0;
        // o inimigo troca de posição para o próximo duelo
        this.moves.delete(t);
        this.ctx.world.removeTarget(t, false);
        this.nextSpawn = this.time + this.p('respawnDelay', 600);
        return;
      }
    }
  }

  protected onTargetHit(t: Target, part: HitPart, at: number) {
    const w = this.weapon.w;
    const knife = w.kind === 'knife';
    const dmg = knife && this.meleeHeavy ? w.heavyDmg ?? w.bodyDmg : part === 'head' ? w.headDmg : w.bodyDmg;
    if (part === 'head') {
      this.hits++;
      this.headshots++;
      t.hp -= dmg;
    } else {
      this.hits++;
      this.bodyshots++;
      t.hp -= dmg;
      this.score += w.bodyDmg > 0 ? 5 : -10;
    }
    const kill = t.hp <= 0;
    this.ctx.fb.hit(t, part, kill);
    if (kill) {
      const ttk = at - t.shownAt;
      this.killTimes.push(ttk);
      if (this.p('duel', false)) this.exposures.push(t.data.exposed ?? 0);
      this.score += 100 + (part === 'head' ? 50 : 0) + 50 * Math.max(0, 1 - ttk / 1500);
      this.recordFlick(t.shownAt, { yaw: t.data.startYaw, pitch: t.data.startPitch }, t, true, at);
      this.remove(t, true);
    } else if (this.p('oneTap', false)) {
      this.escape(t);
      this.misses--; // foi acerto (corpo), não erro
    }
  }

  protected onMissShot() {
    this.misses++;
    this.score -= this.p('missPenalty', 10);
    this.ctx.fb.miss();
    if (this.p('oneTap', false)) {
      // one tap: cada alvo permite um único tiro; o mais próximo da mira some
      const t = this.closestTarget();
      if (t) this.escape(t);
      this.misses--; // o tiro já foi contado
    }
  }

  private closestTarget(): Target | null {
    let best: Target | null = null;
    let bd = Infinity;
    for (const t of this.ctx.world.targets) {
      const a = this.angTo(t.aimPoint());
      const d = Math.hypot(wrapAngle(a.yaw - this.ctx.aim.yaw), a.pitch - this.ctx.aim.pitch);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  protected timeStats() {
    return meanSd(this.p('wave', false) ? this.waveTimes : this.killTimes);
  }

  hud() {
    const h = super.hud();
    const hs = this.hits ? Math.round((this.headshots / this.hits) * 100) : 0;
    h.extra = `${this.killTimes.length} kills · HS ${hs}%${this.p('duel', false) ? ` · ${this.deaths} mortes` : ''}`;
    return h;
  }

  protected extraRecord() {
    return {};
  }
}

export { HUMANOID };
