import type { Category, ModeId } from '../data/types';
import type { Mode, ModeConfig } from './base';
import { FlickMode } from './flick';
import { HumanoidMode } from './humanoid';
import { ReactionMode } from './reaction';
import { SwitchingMode } from './switching';
import { TrackingMode } from './tracking';

type Params = Record<string, number | string | boolean>;

export interface ModeDef {
  id: ModeId;
  name: string;
  short: string;
  category: Category;
  desc: string;
  bullets: string[];
  params: Params;
  weapon?: string;
  defaultDuration: number;
}

export const MODES: Record<ModeId, ModeDef> = {
  microflick: {
    id: 'microflick', name: 'Micro Flick', short: 'MF', category: 'precision', defaultDuration: 60,
    desc: 'Pequenos movimentos rápidos e precisos.',
    bullets: ['Alvos pequenos (≈0,6°)', 'Distâncias de 3° a 10°', 'Penalidade por erro'],
    params: { minDeg: 3, maxDeg: 10, dist: 10, radius: 0.1, lifetime: 2000, missPenalty: 30, boundYaw: 30, boundPitchMin: -8, boundPitchMax: 16 },
  },
  wideflick: {
    id: 'wideflick', name: 'Wide Flick', short: 'WF', category: 'flick', defaultDuration: 60,
    desc: 'Flicks longos e rápidos pela tela.',
    bullets: ['Distâncias de 20° a 75°', 'Tempo entre alvos', 'Velocidade + precisão'],
    params: { minDeg: 20, maxDeg: 75, dist: 10, radius: 0.22, lifetime: 2600, missPenalty: 15, boundYaw: 75, boundPitchMin: -14, boundPitchMax: 28 },
  },
  tracking: {
    id: 'tracking', name: 'Tracking', short: 'TR', category: 'tracking', defaultDuration: 60,
    desc: 'Acompanhe um alvo com mudanças imprevisíveis de direção. Segure o botão esquerdo.',
    bullets: ['Horizontal, vertical e diagonal', 'Velocidades variadas', '% de tempo no alvo'],
    params: { dist: 12, radius: 0.32, minSpeed: 10, maxSpeed: 36, minSeg: 250, maxSeg: 1100, accel: 260 },
  },
  microadjust: {
    id: 'microadjust', name: 'Micro Adjustment', short: 'MA', category: 'precision', defaultDuration: 60,
    desc: 'Correções finas: alvos minúsculos muito perto da mira.',
    bullets: ['Alvos de ≈0,35°', 'Distâncias de 1° a 4°', 'Overshoot / undershoot'],
    params: { minDeg: 1, maxDeg: 4, dist: 12, radius: 0.075, lifetime: 1800, missPenalty: 30, precisionBonus: true, boundYaw: 20, boundPitchMin: -6, boundPitchMax: 12 },
  },
  switching: {
    id: 'switching', name: 'Target Switching', short: 'TS', category: 'switching', defaultDuration: 60,
    desc: 'Vários alvos simultâneos; elimine em sequência o mais rápido possível.',
    bullets: ['3 alvos ao mesmo tempo', 'Distâncias de 8 a 22 m', 'Tempo de troca'],
    params: { count: 3, minDist: 8, maxDist: 22, radius: 0.2, minSep: 12, boundYaw: 50, missPenalty: 15 },
  },
  reaction: {
    id: 'reaction', name: 'Reaction Time', short: 'RT', category: 'reaction', defaultDuration: 120,
    desc: 'Clique assim que o alvo aparecer. Detecta falsos disparos e antecipações.',
    bullets: ['10 tentativas', 'Atraso aleatório 1,2–3,8 s', 'Resultado em ms'],
    params: { trials: 10, minDelay: 1200, maxDelay: 3800 },
  },
  headshot: {
    id: 'headshot', name: 'Headshot Training', short: 'HS', category: 'headshot', defaultDuration: 60,
    desc: 'Alvos com proporção de agente: cabeça na altura dos olhos. Tiro no corpo não mata.',
    bullets: ['Tamanhos variados', 'Parados e em strafe', 'Mede pré-mira'],
    params: { minDist: 10, maxDist: 25, motion: 'mixed', count: 1, sizeMin: 0.9, sizeMax: 1.1, boundYaw: 35, strafeRange: 1.8 },
  },
};

export interface ScenarioDef {
  id: string;
  name: string;
  mode: ModeId;
  weapon: string;
  desc: string;
  tags: string[];
  params: Params;
  duration: number;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'hs-practice', name: 'Headshot Practice', mode: 'headshot', weapon: 'trainer', duration: 60,
    desc: 'Só a cabeça conta. Mantenha a mira na altura da cabeça entre os alvos.',
    tags: ['Média distância', 'Parado'], params: { minDist: 10, maxDist: 22, motion: 'static', boundYaw: 30 },
  },
  {
    id: 'one-tap', name: 'One Tap', mode: 'headshot', weapon: 'vandal', duration: 60,
    desc: 'Um tiro por alvo. Errou, o alvo some. Precisão do primeiro disparo.',
    tags: ['Vandal', '1 tiro'], params: { minDist: 12, maxDist: 28, motion: 'static', oneTap: true, missPenalty: 0, boundYaw: 35 },
  },
  {
    id: 'sheriff', name: 'Sheriff Training', mode: 'headshot', weapon: 'sheriff', duration: 60,
    desc: 'Cadência de Sheriff (4/s) com bloom forte: espere o recuo assentar.',
    tags: ['Sheriff', 'Taps'], params: { minDist: 14, maxDist: 32, motion: 'mixed', strafeSpeed: 0.6, boundYaw: 30 },
  },
  {
    id: 'vandal', name: 'Vandal Training', mode: 'headshot', weapon: 'vandal', duration: 60,
    desc: 'Vandal automática: cabeça = kill a qualquer distância. Taps e bursts curtos.',
    tags: ['Vandal', 'Longa'], params: { minDist: 18, maxDist: 35, motion: 'mixed', boundYaw: 30, strafeSpeed: 0.8 },
  },
  {
    id: 'phantom', name: 'Phantom Training', mode: 'headshot', weapon: 'phantom', duration: 60,
    desc: 'Phantom em média/curta distância contra alvos em movimento.',
    tags: ['Phantom', 'Média'], params: { minDist: 8, maxDist: 18, motion: 'strafe', boundYaw: 40 },
  },
  {
    id: 'entry', name: 'Entry Frag', mode: 'headshot', weapon: 'vandal', duration: 90,
    desc: 'Entrando no site: 3 inimigos saem de coberturas em ângulos diferentes. Limpe a onda.',
    tags: ['Vandal', 'Ondas', 'WASD'], params: { movement: true, layout: 'entry', peek: true, wave: true, count: 3, peekHoldMin: 600, peekHoldMax: 1400, respawnDelay: 1100 },
  },
  {
    id: 'defensive', name: 'Defensive Aim', mode: 'headshot', weapon: 'vandal', duration: 60,
    desc: 'Segure o ângulo: o inimigo dá peek por uma das bordas e volta. Pré-mira é tudo.',
    tags: ['Vandal', 'Segurar ângulo'], params: { layout: 'defensive', peek: true, count: 1, peekHoldMin: 250, peekHoldMax: 700, peekSpeed: 1, respawnDelay: 700 },
  },
  {
    id: 'close', name: 'Close Range', mode: 'headshot', weapon: 'phantom', duration: 60,
    desc: 'Curta distância, alvos grandes e rápidos. Ajuste vertical e tracking curto.',
    tags: ['Phantom', '4–8 m', 'WASD'], params: { movement: true, minDist: 4, maxDist: 8, motion: 'strafe', strafeSpeed: 1.1, strafeRange: 2.2, boundYaw: 55 },
  },
  {
    id: 'long', name: 'Long Range', mode: 'headshot', weapon: 'vandal', duration: 60,
    desc: 'Cabeças pequenas a 35–50 m. Micro ajustes e paciência no primeiro tiro.',
    tags: ['Vandal', '35–50 m'], params: { minDist: 35, maxDist: 50, motion: 'static', boundYaw: 22 },
  },
  {
    id: 'strafing', name: 'Strafing Enemies', mode: 'headshot', weapon: 'vandal', duration: 60,
    desc: 'Inimigos fazendo ADAD com aceleração e counter-strafe realistas.',
    tags: ['Vandal', 'ADAD', 'WASD'], params: { movement: true, minDist: 12, maxDist: 22, motion: 'strafe', strafeSpeed: 1, strafeRange: 2.2, boundYaw: 35 },
  },
  {
    id: 'peek', name: 'Peek & Duelo', mode: 'headshot', weapon: 'vandal', duration: 90,
    desc: 'Beco estreito: você começa atrás da parede. Dê peek com A/D, pare, mate quem segura o ângulo e volte. Ficou exposto demais? Ele te acerta.',
    tags: ['Vandal', 'WASD', 'Duelo', 'Beco'], params: { movement: true, map: 'alley', layout: 'alley', duel: true, botReaction: 460, count: 1, respawnDelay: 500, startX: -1.3, startZ: 1.1, startYaw: -16, zoneMinX: -2.8, zoneMaxX: 3.6, zoneMinZ: -1.3, zoneMaxZ: 1.4 },
  },
  {
    id: 'peek-hard', name: 'Peek & Duelo — Radiante', mode: 'headshot', weapon: 'vandal', duration: 90,
    desc: 'Mesmo beco, inimigos com reação de ~280 ms e dois ângulos segurados ao mesmo tempo. Só passa quem limpa um ângulo por vez.',
    tags: ['Vandal', 'WASD', 'Duelo', 'Difícil'], params: { movement: true, map: 'alley', layout: 'alley', duel: true, botReaction: 280, swingBonus: 120, count: 2, respawnDelay: 400, startX: -1.3, startZ: 1.1, startYaw: -16, zoneMinX: -2.8, zoneMaxX: 3.6, zoneMinZ: -1.3, zoneMaxZ: 1.4 },
  },
  {
    id: 'counterstrafe', name: 'Counter-Strafe', mode: 'headshot', weapon: 'vandal', duration: 60,
    desc: 'Use A/D: o inimigo só aparece enquanto você se move. Pare com a tecla oposta e atire — tiro correndo é impreciso.',
    tags: ['Vandal', 'WASD', 'Movimento'], params: { movement: true, requireMove: true, minDist: 10, maxDist: 20, motion: 'mixed', strafeSpeed: 0.7, boundYaw: 30, respawnDelay: 350 },
  },
];

export function createMode(cfg: ModeConfig): Mode {
  switch (cfg.mode) {
    case 'microflick':
    case 'wideflick':
    case 'microadjust':
      return new FlickMode(cfg);
    case 'tracking':
      return new TrackingMode(cfg);
    case 'switching':
      return new SwitchingMode(cfg);
    case 'reaction':
      return new ReactionMode(cfg);
    case 'headshot':
      return new HumanoidMode(cfg);
  }
}

export function modeConfig(id: ModeId, o: Partial<ModeConfig> = {}): ModeConfig {
  const d = MODES[id];
  return {
    mode: id,
    label: d.name,
    duration: o.duration ?? d.defaultDuration,
    seed: o.seed ?? ((Math.random() * 2 ** 32) >>> 0),
    context: o.context ?? 'free',
    weapon: o.weapon ?? d.weapon,
    params: { ...d.params, ...(o.params ?? {}) },
    scenario: o.scenario,
  };
}

export function scenarioConfig(id: string, o: Partial<ModeConfig> = {}): ModeConfig {
  const s = SCENARIOS.find((x) => x.id === id)!;
  return {
    mode: s.mode,
    scenario: s.id,
    label: s.name,
    duration: o.duration ?? s.duration,
    seed: o.seed ?? ((Math.random() * 2 ** 32) >>> 0),
    context: o.context ?? 'free',
    weapon: s.weapon,
    params: { ...MODES[s.mode].params, ...s.params, ...(o.params ?? {}) },
  };
}

export const labelFor = (mode: ModeId, scenario?: string) =>
  scenario ? SCENARIOS.find((s) => s.id === scenario)?.name ?? scenario : MODES[mode].name;
