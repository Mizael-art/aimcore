export type ModeId =
  | 'microflick'
  | 'wideflick'
  | 'tracking'
  | 'microadjust'
  | 'switching'
  | 'reaction'
  | 'headshot';

export type Category = 'flick' | 'precision' | 'tracking' | 'switching' | 'reaction' | 'headshot';

export type SessionContext = 'free' | 'routine' | 'lab';

export interface CrosshairSettings {
  color: string;
  outline: boolean;
  outlineOpacity: number;
  centerDot: boolean;
  dotSize: number;
  innerLength: number;
  innerThickness: number;
  innerGap: number;
  innerOpacity: number;
  showInner: boolean;
}

export interface Settings {
  dpi: number;
  sens: number;
  adsMultiplier: number;
  invertY: boolean;
  calibration: number;
  rawInput: boolean;
  lowLatencyInput: boolean;
  pollingRate: number;
  hfov: number;
  renderScale: number; // 0.5..1 (resolução interna)
  antialias: boolean;
  showFps: boolean;
  fullscreenOnStart: boolean;
  volume: number;
  targetColor: string;
  crosshair: CrosshairSettings;
  defaultDuration: number;
}

export interface Trial {
  /** ms até acertar (flick) ou reação */
  t: number;
  /** distância angular inicial (graus) */
  dist: number;
  over: boolean;
  under: boolean;
  /** erro angular no primeiro ponto de parada (graus) */
  stopErr: number;
  hit: boolean;
}

export interface SessionRecord {
  id: string;
  date: number;
  mode: ModeId;
  scenario?: string;
  context: SessionContext;
  duration: number;
  dpi: number;
  sens: number;
  seed: number;
  score: number;
  shots: number;
  hits: number;
  misses: number;
  headshots: number;
  bodyshots: number;
  accuracy: number; // 0..1
  /** tempo médio por alvo / reação (ms) */
  avgTime: number;
  /** desvio padrão do tempo (ms) */
  sdTime: number;
  overshoots: number;
  undershoots: number;
  trialsCount: number;
  trackingPct?: number;
  falseStarts?: number;
  crosshairPlacement?: number; // erro vertical médio (graus) no momento em que o alvo aparece
  /** pontuações por segmento (para consistência intra-sessão) */
  segments: number[];
  trials?: Trial[];
  completed: boolean;
}

export interface LabCandidate {
  sens: number;
  score: number; // composto 0..100
  se: number;
  accuracy: number;
  avgTime: number;
  overRate: number;
  underRate: number;
  consistency: number;
  errors: number;
  perExercise: Record<string, number>;
  sessions: string[];
}

export interface LabRound {
  sensList: number[];
  candidates: LabCandidate[];
  best: number;
}

export interface LabResult {
  id: string;
  date: number;
  dpi: number;
  originalSens: number;
  style: 'wrist' | 'arm' | 'hybrid';
  experience: 'beginner' | 'intermediate' | 'advanced';
  preference: 'precision' | 'speed' | 'balanced';
  exerciseDuration: number;
  rounds: LabRound[];
  recommended: number;
  range: [number, number];
  inconclusive: boolean;
  verdicts: { tooHigh: number[]; tooLow: number[]; mostConsistent: number; bestBalance: number };
  justification: string[];
}

export interface Profile {
  name: string;
  xp: number;
  createdAt: number;
  achievements: Record<string, number>; // id → data desbloqueio
  routinesCompleted: number;
  trainingDays: string[]; // YYYY-MM-DD
  totalTimeSec: number;
  recommendedSens?: number;
}

export interface RoutineBlock {
  mode: ModeId;
  minutes: number;
  reason?: string;
}

export interface RoutineDay {
  date: string; // YYYY-MM-DD
  minutes: number;
  blocks: RoutineBlock[];
  done: string[]; // ids das sessões concluídas (por bloco)
  completed: boolean;
}

export interface LabProgress {
  dpi: number;
  originalSens: number;
  style: 'wrist' | 'arm' | 'hybrid';
  experience: 'beginner' | 'intermediate' | 'advanced';
  preference: 'precision' | 'speed' | 'balanced';
  exerciseDuration: number;
  blind: boolean;
  seedBase: number;
  /** baterias concluídas: sens → exercício → id da sessão */
  rounds: Record<string, Record<string, string>>[];
  current: { sensList: number[]; order: number[]; data: Record<string, Record<string, string>> };
  startedAt: number;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  profile: Profile;
  sessions: SessionRecord[];
  labResults: LabResult[];
  routine?: RoutineDay;
  lab?: LabProgress;
}
