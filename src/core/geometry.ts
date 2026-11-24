/**
 * Geometria de mira sem dependência de DOM (testável em Node).
 * Convenção: yaw = rotação em torno de Y (0 olha para -Z), pitch = rotação em torno de X.
 */
export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });

export function dirFromYawPitch(yaw: number, pitch: number, out: V3 = v3()): V3 {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

export function yawPitchTo(from: V3, to: V3): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return { yaw, pitch };
}

export const wrapAngle = (a: number) => {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
};

/** Distância angular entre duas direções (yaw/pitch), em radianos. */
export function angleBetween(y1: number, p1: number, y2: number, p2: number): number {
  const a = dirFromYawPitch(y1, p1);
  const b = dirFromYawPitch(y2, p2);
  const d = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  return Math.acos(d);
}

/** Interseção raio × esfera. Retorna distância t ou -1. `dir` deve ser unitário. */
export function raySphere(o: V3, dir: V3, c: V3, r: number): number {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t >= 0 ? t : -1;
}

/** Interseção raio × cápsula vertical (segmento de yA até yB em x,z = c). */
export function rayCapsuleY(o: V3, dir: V3, c: V3, yA: number, yB: number, r: number): number {
  // cilindro infinito em Y
  const ox = o.x - c.x;
  const oz = o.z - c.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  let best = -1;
  if (a > 1e-9) {
    const b = ox * dir.x + oz * dir.z;
    const cc = ox * ox + oz * oz - r * r;
    const disc = b * b - a * cc;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      for (const t of [(-b - s) / a, (-b + s) / a]) {
        if (t < 0) continue;
        const y = o.y + dir.y * t;
        if (y >= yA && y <= yB) {
          best = best < 0 ? t : Math.min(best, t);
          break;
        }
      }
    }
  }
  for (const yy of [yA, yB]) {
    const t = raySphere(o, dir, { x: c.x, y: yy, z: c.z }, r);
    if (t >= 0) best = best < 0 ? t : Math.min(best, t);
  }
  return best;
}

/** Interseção raio × caixa alinhada (AABB). */
export function rayAabb(o: V3, dir: V3, min: V3, max: V3): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = dir[k];
    if (Math.abs(d) < 1e-12) {
      if (o[k] < min[k] || o[k] > max[k]) return -1;
      continue;
    }
    let t1 = (min[k] - o[k]) / d;
    let t2 = (max[k] - o[k]) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : tmax;
}

/** Desvia uma direção aleatoriamente dentro de um cone (spread) de `deg` graus. */
export function spreadDir(yaw: number, pitch: number, deg: number, rand: () => number) {
  if (deg <= 0) return { yaw, pitch };
  const r = Math.sqrt(rand()) * (deg * Math.PI) / 180;
  const th = rand() * Math.PI * 2;
  return { yaw: yaw + (r * Math.cos(th)) / Math.max(0.2, Math.cos(pitch)), pitch: pitch + r * Math.sin(th) };
}

export const DEG = Math.PI / 180;
