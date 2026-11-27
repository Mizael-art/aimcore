/**
 * Movimento do jogador inspirado no VALORANT: corrida 6,75 m/s, andar (Shift) 4,05 m/s,
 * agachado ~2,6 m/s, pulo de ~1 m, aceleração rápida e counter-strafe
 * (tecla oposta freia mais rápido que soltar). A imprecisão das armas some abaixo
 * de ~27% da velocidade de corrida, e é máxima no ar.
 */
export const RUN_SPEED = 6.75;
export const WALK_SPEED = 4.05;
export const CROUCH_SPEED = 2.6;
export const EYE_STAND = 1.6;
export const EYE_CROUCH = 1.15;
const ACCEL = 48; // m/s²
const FRICTION = 30; // m/s² sem tecla
const COUNTER = ACCEL + FRICTION; // tecla oposta
const AIR_ACCEL = 6;
const GRAVITY = 15;
const JUMP_V = 5.4;
const STEP_DIST = 2.1; // metros entre passos (sons)

export interface Zone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class Player {
  x = 0;
  z = 0;
  vx = 0;
  vz = 0;
  /** altura dos pés acima do chão */
  y = 0;
  vy = 0;
  keys = new Set<string>();
  walking = false;
  crouching = false;
  /** 0 em pé … 1 agachado (suavizado) */
  crouchK = 0;
  zone: Zone = { minX: -4, maxX: 4, minZ: -2, maxZ: 2 };
  private stepAcc = 0;
  private jumpQueued = false;

  reset(x = 0, z = 0) {
    this.x = x;
    this.z = z;
    this.vx = this.vz = this.vy = this.y = 0;
    this.keys.clear();
    this.walking = this.crouching = false;
    this.crouchK = 0;
    this.stepAcc = 0;
    this.jumpQueued = false;
  }

  get onGround() {
    return this.y <= 0.0001;
  }
  get speed() {
    return Math.hypot(this.vx, this.vz);
  }
  /** velocidade horizontal relativa à corrida (0..1) */
  get speedRatio() {
    return this.speed / RUN_SPEED;
  }
  /** altura dos olhos */
  get eyeY() {
    return this.y + EYE_STAND + (EYE_CROUCH - EYE_STAND) * this.crouchK;
  }

  jump() {
    this.jumpQueued = true;
  }

  /** Avança a simulação. Retorna eventos de som. */
  update(dt: number, yaw: number): { step: boolean; land: boolean; jumped: boolean } {
    const ev = { step: false, land: false, jumped: false };
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let wx = fx * f + rx * r;
    let wz = fz * f + rz * r;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) {
      wx /= wl;
      wz /= wl;
    }
    this.crouchK += ((this.crouching ? 1 : 0) - this.crouchK) * Math.min(1, dt * 14);
    const max = this.crouching ? CROUCH_SPEED : this.walking ? WALK_SPEED : RUN_SPEED;
    const ground = this.onGround;
    if (ground) {
      const tx = wx * max;
      const tz = wz * max;
      const step = (v: number, t: number, wish: number) => {
        const d = t - v;
        let rate = FRICTION;
        if (wish !== 0) rate = Math.sign(wish) !== Math.sign(v) && Math.abs(v) > 0.05 ? COUNTER : ACCEL;
        const m = rate * dt;
        return Math.abs(d) <= m ? t : v + Math.sign(d) * m;
      };
      this.vx = step(this.vx, tx, wx);
      this.vz = step(this.vz, tz, wz);
      if (this.jumpQueued && !this.crouching) {
        this.vy = JUMP_V;
        ev.jumped = true;
      }
    } else {
      // controle aéreo limitado
      this.vx += wx * AIR_ACCEL * dt;
      this.vz += wz * AIR_ACCEL * dt;
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > RUN_SPEED) {
        this.vx *= RUN_SPEED / sp;
        this.vz *= RUN_SPEED / sp;
      }
    }
    this.jumpQueued = false;
    // vertical
    if (!ground || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        ev.land = true;
      }
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.x < this.zone.minX || this.x > this.zone.maxX) {
      this.x = Math.max(this.zone.minX, Math.min(this.zone.maxX, this.x));
      this.vx = 0;
    }
    if (this.z < this.zone.minZ || this.z > this.zone.maxZ) {
      this.z = Math.max(this.zone.minZ, Math.min(this.zone.maxZ, this.z));
      this.vz = 0;
    }
    // passos audíveis só correndo (andar/agachar é silencioso, como no jogo)
    if (this.onGround && !this.walking && !this.crouching && this.speedRatio > 0.55) {
      this.stepAcc += this.speed * dt;
      if (this.stepAcc >= STEP_DIST) {
        this.stepAcc -= STEP_DIST;
        ev.step = true;
      }
    } else this.stepAcc = Math.min(this.stepAcc, STEP_DIST * 0.6);
    return ev;
  }
}
