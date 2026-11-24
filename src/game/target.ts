import { raySphere, rayCapsuleY, rayAabb, type V3, v3 } from '../core/geometry';

export type TargetKind = 'sphere' | 'humanoid';
export type HitPart = 'sphere' | 'head' | 'body';

/** Proporções de agente (aprox.) — altura em pé ~1,75 m, cabeça no nível dos olhos. */
export const HUMANOID = {
  height: 1.75,
  headR: 0.115,
  headY: 1.6, // centro da cabeça (= altura dos olhos do jogador)
  bodyR: 0.23,
  bodyTop: 1.42,
  bodyBottom: 0.22,
};

let nextId = 1;

export class Target {
  id = nextId++;
  pos: V3; // esfera: centro; humanoide: posição dos pés
  vel: V3 = v3();
  alive = true;
  hp = 150;
  maxHp = 150;
  spawnTime = 0;
  /** tempo em que o alvo foi efetivamente exibido (ms de jogo) */
  shownAt = 0;
  visible = true;
  /** escala (humanoide: 1 = tamanho de agente; esfera: raio em metros) */
  scale: number;
  /** dados livres para os modos */
  data: Record<string, number> = {};
  hitFlash = 0;

  constructor(
    public kind: TargetKind,
    pos: V3,
    scale: number,
  ) {
    this.pos = { ...pos };
    this.scale = scale;
  }

  get radius(): number {
    return this.kind === 'sphere' ? this.scale : HUMANOID.headR * this.scale;
  }

  /** ponto de mira principal (centro da esfera ou da cabeça) */
  aimPoint(out: V3 = v3()): V3 {
    out.x = this.pos.x;
    out.z = this.pos.z;
    out.y = this.kind === 'sphere' ? this.pos.y : this.pos.y + HUMANOID.headY * this.scale;
    return out;
  }

  hitTest(o: V3, dir: V3): { t: number; part: HitPart } | null {
    if (!this.alive || !this.visible) return null;
    if (this.kind === 'sphere') {
      const t = raySphere(o, dir, this.pos, this.scale);
      return t >= 0 ? { t, part: 'sphere' } : null;
    }
    const s = this.scale;
    const head = { x: this.pos.x, y: this.pos.y + HUMANOID.headY * s, z: this.pos.z };
    const th = raySphere(o, dir, head, HUMANOID.headR * s);
    const r = HUMANOID.bodyR * s;
    // cápsula do corpo: do quadril/pernas (bodyBottom) até os ombros (bodyTop)
    const tb = rayCapsuleY(o, dir, this.pos, this.pos.y + HUMANOID.bodyBottom * s, this.pos.y + HUMANOID.bodyTop * s - r, r);
    if (th >= 0 && (tb < 0 || th <= tb + 0.05)) return { t: th, part: 'head' };
    if (tb >= 0) return { t: tb, part: 'body' };
    return null;
  }
}

export interface Box {
  min: V3;
  max: V3;
}

export const boxHit = (o: V3, dir: V3, b: Box) => rayAabb(o, dir, b.min, b.max);
