/**
 * Movimento do jogador estilo VALORANT: corrida 6,75 m/s, andar (Shift) 4,05 m/s,
 * aceleração rápida e counter-strafe (tecla oposta freia mais rápido que soltar).
 * A imprecisão das armas some abaixo de ~27% da velocidade de corrida.
 */
export const RUN_SPEED = 6.75;
export const WALK_SPEED = 4.05;
const ACCEL = 48; // m/s²
const FRICTION = 30; // m/s² sem tecla
const COUNTER = ACCEL + FRICTION; // tecla oposta

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
  keys = new Set<string>();
  walking = false;
  zone: Zone = { minX: -4, maxX: 4, minZ: -2, maxZ: 2 };

  reset(x = 0, z = 0) {
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.keys.clear();
    this.walking = false;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }
  /** velocidade relativa à corrida (0..1) */
  get speedRatio() {
    return this.speed / RUN_SPEED;
  }

  update(dt: number, yaw: number) {
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    // frente = -Z girado por yaw; direita = +X girado
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let wx = fx * f + rx * r;
    let wz = fz * f + rz * r;
    const wl = Math.hypot(wx, wz);
    const max = this.walking ? WALK_SPEED : RUN_SPEED;
    if (wl > 0) {
      wx /= wl;
      wz /= wl;
    }
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
  }
}
