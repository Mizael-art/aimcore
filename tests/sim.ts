import { deltaToRadians, type SensConfig } from '../src/core/sensitivity';
import { wrapAngle } from '../src/core/geometry';
import type { Mode, ModeConfig } from '../src/modes/base';
import { createMode } from '../src/modes/catalog';
import { LogicWorld } from '../src/game/world';
import type { Target } from '../src/game/target';

/**
 * Bot de teste: move o "mouse" em counts inteiros (como um sensor real),
 * convertendo via a mesma função de sensibilidade usada pelo jogo.
 */
export interface BotOpts {
  sens: number;
  dpi?: number;
  /** fração do caminho percorrida por frame */
  gain?: number;
  /** erro proporcional (1.1 = overshoot de 10%) */
  overshoot?: number;
  frameMs?: number;
  /** atira quando erro < x * raio angular */
  fireTol?: number;
  reactionMs?: number;
  /** multiplicador da duração do flick (sens baixa = braço mais lento) */
  durMul?: number;
  /** ruído gaussiano no fator de overshoot de cada flick */
  noise?: number;
  noiseSeed?: number;
}

export function runBot(cfg: ModeConfig, o: BotOpts) {
  const world = new LogicWorld();
  const aim = { yaw: 0, pitch: 0 };
  const scfg: SensConfig = { dpi: o.dpi ?? 800, sens: o.sens, adsMultiplier: 1, invertY: false, calibration: 1 };
  const mode: Mode = createMode(cfg);
  const fbLog: string[] = [];
  const spawns: string[] = [];
  world.onAdd = (t) => spawns.push(`${t.pos.x.toFixed(3)},${t.pos.y.toFixed(3)},${t.pos.z.toFixed(3)}`);
  mode.init({
    world,
    aim,
    fb: { shot() {}, hit: (_t, p, k) => fbLog.push(`hit:${p}:${k}`), miss: () => fbLog.push('miss'), falseStart: () => fbLog.push('fs'), message() {}, setDark() {} },
  });
  const frame = o.frameMs ?? 1000 / 144;
  const gain = o.gain ?? 0.35;
  const over = o.overshoot ?? 1;
  let countsX = 0;
  let countsY = 0;
  let seen: Target | null = null;
  let seenAt = 0;
  let phase = 0;
  let start = { yaw: 0, pitch: 0 };
  let flickOver = 1;
  let ns = o.noiseSeed ?? 1;
  const rnd = () => ((ns = (ns * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
  let holding = false;
  let guard = 0;
  while (!mode.done && guard++ < 200000) {
    mode.tick(frame);
    const t = world.targets[0];
    if (!t) continue;
    if (t !== seen) {
      seen = t;
      seenAt = mode.time;
      phase = 0;
      start = { ...aim };
      flickOver = over + (o.noise ?? 0) * gauss();
    }
    if (mode.time - seenAt < (o.reactionMs ?? 120)) continue;
    const ap = mode.angTo(t.aimPoint());
    const target = { yaw: ap.yaw, pitch: ap.pitch };
    // fase 0: flick com perfil de velocidade mínimo-jerk até (alvo + (over-1)×flick)
    // fase 1: correção proporcional até o alvo
    let cx = 0;
    let cy = 0;
    const degPerCount = scfg.sens * 0.07;
    const toCounts = (rad: number) => (rad * 180) / Math.PI / degPerCount;
    if (phase === 0 && !mode.continuous) {
      const fy = wrapAngle(target.yaw - start.yaw) * flickOver;
      const fp = (target.pitch - start.pitch) * flickOver;
      const D = Math.hypot(fy, fp) * (180 / Math.PI);
      const dur = (120 + 2.2 * D) * (o.durMul ?? 1);
      const tau = Math.min(1, (mode.time - seenAt - (o.reactionMs ?? 120)) / dur);
      const sh = 10 * tau ** 3 - 15 * tau ** 4 + 6 * tau ** 5;
      const gy = start.yaw + fy * sh;
      const gp = start.pitch + fp * sh;
      cx = Math.round(-toCounts(wrapAngle(gy - aim.yaw)));
      cy = Math.round(-toCounts(gp - aim.pitch));
      if (tau >= 1) phase = 1;
    } else {
      cx = Math.round(-toCounts(wrapAngle(target.yaw - aim.yaw)) * gain);
      cy = Math.round(-toCounts(target.pitch - aim.pitch) * gain);
    }
    countsX += Math.abs(cx);
    countsY += Math.abs(cy);
    aim.yaw -= deltaToRadians(cx, scfg);
    aim.pitch -= deltaToRadians(cy, scfg);
    const d = Math.hypot(t.aimPoint().x - world.eye.x, t.aimPoint().y - world.eye.y, t.aimPoint().z - world.eye.z);
    const angR = Math.atan(t.radius / d);
    const err = Math.hypot(wrapAngle(target.yaw - aim.yaw), target.pitch - aim.pitch);
    if (mode.continuous) {
      if (!holding) {
        mode.trigger(true, mode.time);
        holding = true;
      }
    } else if (cfg.mode === 'reaction') {
      mode.trigger(true, mode.time);
    } else if (err < angR * (o.fireTol ?? 0.6) && mode.weapon.currentSpread() <= mode.weapon.w.baseSpread * 1.6 + 0.01) {
      mode.trigger(true, mode.time);
      mode.trigger(false, mode.time);
    }
  }
  return { mode, world, fbLog, spawns, countsX, countsY, record: mode.record({ dpi: scfg.dpi, sens: scfg.sens, completed: true }) };
}
