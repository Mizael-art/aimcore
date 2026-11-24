import { MODES, SCENARIOS } from '../modes/catalog';
import { dayKey, personalBests, sessionKey, streak, totals } from './stats';
import type { Profile, SaveData, SessionRecord } from './types';

/** XP, níveis, conquistas e recordes — tudo derivado das sessões reais. */

export const xpForLevel = (lvl: number) => Math.round(120 * Math.pow(lvl, 1.55));

export function levelInfo(xp: number) {
  let lvl = 1;
  let acc = 0;
  while (xp >= acc + xpForLevel(lvl)) {
    acc += xpForLevel(lvl);
    lvl++;
  }
  const need = xpForLevel(lvl);
  return { level: lvl, into: xp - acc, need, pct: (xp - acc) / need };
}

export function sessionXp(s: SessionRecord): number {
  if (s.duration < 5) return 0;
  const base = s.duration * 1.2;
  const quality = s.mode === 'tracking' ? (s.trackingPct ?? 0) * 60 : s.mode === 'reaction' ? Math.max(0, 400 - s.avgTime) / 4 : s.accuracy * 60;
  return Math.round(base + quality + (s.completed ? 20 : 0));
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  test: (d: SaveData) => boolean;
}

const done = (d: SaveData) => d.sessions.filter((s) => s.completed);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', name: 'Primeiro disparo', desc: 'Complete sua primeira sessão', test: (d) => done(d).length >= 1 },
  { id: 's10', name: 'Rotina formada', desc: 'Complete 10 sessões', test: (d) => done(d).length >= 10 },
  { id: 's50', name: 'Dedicado', desc: 'Complete 50 sessões', test: (d) => done(d).length >= 50 },
  { id: 's200', name: 'Grinder', desc: 'Complete 200 sessões', test: (d) => done(d).length >= 200 },
  { id: 'acc90', name: 'Cirúrgico', desc: '≥90% de precisão em Micro Flick (60 s)', test: (d) => done(d).some((s) => s.mode === 'microflick' && s.duration >= 55 && s.accuracy >= 0.9 && s.hits >= 20) },
  { id: 'wide100', name: 'Flick largo', desc: '100 alvos em uma sessão de Wide Flick', test: (d) => done(d).some((s) => s.mode === 'wideflick' && s.hits >= 100) },
  { id: 'track70', name: 'Grudado', desc: '≥70% de tempo no alvo em Tracking', test: (d) => done(d).some((s) => s.mode === 'tracking' && (s.trackingPct ?? 0) >= 0.7) },
  { id: 'rt200', name: 'Reflexo', desc: 'Média de reação abaixo de 200 ms', test: (d) => done(d).some((s) => s.mode === 'reaction' && s.trialsCount >= 10 && s.avgTime > 0 && s.avgTime < 200) },
  { id: 'hs100', name: 'Caçador de cabeças', desc: '100 headshots no total', test: (d) => totals(d.sessions).headshots >= 100 },
  { id: 'hs1000', name: 'Só HS', desc: '1.000 headshots no total', test: (d) => totals(d.sessions).headshots >= 1000 },
  { id: 'onetap', name: 'One Tap', desc: '≥80% de precisão no cenário One Tap', test: (d) => done(d).some((s) => s.scenario === 'one-tap' && s.shots >= 15 && s.accuracy >= 0.8) },
  { id: 'allmodes', name: 'Completo', desc: 'Jogue todos os 7 modos', test: (d) => Object.keys(MODES).every((m) => done(d).some((s) => s.mode === m && !s.scenario)) },
  { id: 'allscen', name: 'Arsenal', desc: 'Jogue todos os 10 cenários', test: (d) => SCENARIOS.every((c) => done(d).some((s) => s.scenario === c.id)) },
  { id: 'streak3', name: 'Constância', desc: '3 dias seguidos treinando', test: (d) => streak(d.profile.trainingDays) >= 3 },
  { id: 'streak7', name: 'Semana cheia', desc: '7 dias seguidos treinando', test: (d) => streak(d.profile.trainingDays) >= 7 },
  { id: 'streak30', name: 'Disciplina', desc: '30 dias seguidos treinando', test: (d) => streak(d.profile.trainingDays) >= 30 },
  { id: 'routine1', name: 'Plano em ação', desc: 'Conclua uma rotina diária', test: (d) => d.profile.routinesCompleted >= 1 },
  { id: 'routine10', name: 'Hábito', desc: 'Conclua 10 rotinas diárias', test: (d) => d.profile.routinesCompleted >= 10 },
  { id: 'lab', name: 'Cientista', desc: 'Conclua o Sensitivity Lab', test: (d) => d.labResults.length >= 1 },
  { id: 'h1', name: 'Primeira hora', desc: '1 hora de treino', test: (d) => d.profile.totalTimeSec >= 3600 },
  { id: 'h10', name: '10 horas', desc: '10 horas de treino', test: (d) => d.profile.totalTimeSec >= 36000 },
];

export interface Progress {
  xp: number;
  levelBefore: number;
  levelAfter: number;
  isPB: boolean;
  prevBest: number;
  achievements: AchievementDef[];
}

/** Aplica uma sessão ao perfil (XP, dias, tempo) e retorna o que mudou. */
export function applySession(d: SaveData, s: SessionRecord): Progress {
  const p: Profile = d.profile;
  const levelBefore = levelInfo(p.xp).level;
  const prev = personalBests(d.sessions.filter((x) => x.id !== s.id)).get(sessionKey(s));
  const xp = sessionXp(s);
  p.xp += xp;
  p.totalTimeSec += s.duration;
  const dk = dayKey(s.date);
  if (!p.trainingDays.includes(dk) && s.duration >= 10) p.trainingDays.push(dk);
  const achievements = checkAchievements(d);
  return {
    xp,
    levelBefore,
    levelAfter: levelInfo(p.xp).level,
    isPB: s.completed && s.context !== 'lab' && (!prev || s.score > prev.score) && s.score > 0,
    prevBest: prev?.score ?? 0,
    achievements,
  };
}

export function checkAchievements(d: SaveData): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (d.profile.achievements[a.id]) continue;
    if (a.test(d)) {
      d.profile.achievements[a.id] = Date.now();
      out.push(a);
    }
  }
  return out;
}
