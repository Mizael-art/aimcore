import type { LabResult, Profile, SaveData, SessionRecord, Settings } from './types';

const KEY = 'aimcore.save.v1';
const MAX_SESSIONS = 4000;

export const defaultSettings = (): Settings => ({
  dpi: 800,
  sens: 0.35,
  adsMultiplier: 1,
  invertY: false,
  calibration: 1,
  rawInput: true,
  lowLatencyInput: true,
  pollingRate: 1000,
  hfov: 103,
  renderScale: 1,
  antialias: true,
  showFps: true,
  fullscreenOnStart: false,
  volume: 0.6,
  targetColor: '#ff4655',
  defaultDuration: 60,
  arena: 'range',
  shadows: true,
  showWeapon: true,
  movementAlways: false,
  crosshair: {
    color: '#00ff9c',
    outline: true,
    outlineOpacity: 0.6,
    centerDot: false,
    dotSize: 2,
    innerLength: 5,
    innerThickness: 2,
    innerGap: 3,
    innerOpacity: 1,
    showInner: true,
    showOuter: false,
    outerLength: 2,
    outerThickness: 2,
    outerGap: 10,
    outerOpacity: 0.35,
    firingError: true,
  },
});

const defaultProfile = (): Profile => ({
  name: 'Jogador',
  xp: 0,
  createdAt: Date.now(),
  achievements: {},
  routinesCompleted: 0,
  trainingDays: [],
  totalTimeSec: 0,
});

type Listener = () => void;

/** Persistência local (localStorage) com tolerância a falhas. */
class Store {
  data: SaveData;
  private listeners = new Set<Listener>();
  memoryOnly = false;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as SaveData;
        return {
          version: 1,
          settings: { ...defaultSettings(), ...d.settings, crosshair: { ...defaultSettings().crosshair, ...d.settings?.crosshair } },
          profile: { ...defaultProfile(), ...d.profile },
          sessions: Array.isArray(d.sessions) ? d.sessions : [],
          labResults: Array.isArray(d.labResults) ? d.labResults : [],
          routine: d.routine,
          lab: d.lab,
        };
      }
    } catch {
      this.memoryOnly = typeof localStorage === 'undefined';
    }
    return { version: 1, settings: defaultSettings(), profile: defaultProfile(), sessions: [], labResults: [] };
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // modo privado / quota: tenta reduzir trials detalhados
      try {
        for (const s of this.data.sessions.slice(0, -200)) delete s.trials;
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch {
        this.memoryOnly = true;
      }
    }
    this.listeners.forEach((l) => l());
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  get settings() {
    return this.data.settings;
  }
  get profile() {
    return this.data.profile;
  }
  get sessions() {
    return this.data.sessions;
  }

  updateSettings(p: Partial<Settings>) {
    Object.assign(this.data.settings, p);
    this.save();
  }

  addSession(s: SessionRecord) {
    this.data.sessions.push(s);
    // guarda trials detalhados só nas sessões mais recentes
    if (this.data.sessions.length > 300) delete this.data.sessions[this.data.sessions.length - 301].trials;
    if (this.data.sessions.length > MAX_SESSIONS) this.data.sessions.splice(0, this.data.sessions.length - MAX_SESSIONS);
    this.save();
  }

  addLabResult(r: LabResult) {
    this.data.labResults.push(r);
    this.data.profile.recommendedSens = r.recommended;
    this.save();
  }

  exportJson(): string {
    return JSON.stringify(this.data);
  }

  importJson(json: string) {
    const d = JSON.parse(json) as SaveData;
    if (!d || d.version !== 1 || !d.settings) throw new Error('Arquivo inválido');
    localStorage.setItem(KEY, json);
    this.data = this.load();
    this.save();
  }

  reset() {
    this.data = { version: 1, settings: defaultSettings(), profile: defaultProfile(), sessions: [], labResults: [] };
    this.save();
  }
}

export const store = new Store();
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
