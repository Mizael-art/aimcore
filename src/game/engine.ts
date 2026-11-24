import * as THREE from 'three';
import { deltaToRadians, verticalFovFrom16x9, zoomSensScale, type SensConfig } from '../core/sensitivity';
import { store } from '../data/store';
import type { SessionRecord, Settings } from '../data/types';
import type { Mode, ModeConfig } from '../modes/base';
import { createMode } from '../modes/catalog';
import { ReactionMode } from '../modes/reaction';
import { buildArena } from './arena';
import { sfx } from './audio';
import { renderCrosshair } from './crosshair';
import { MouseInput } from './input';
import { HUMANOID, type Box, type HitPart, Target } from './target';
import { LogicWorld } from './world';

export interface RunOptions {
  /** sensibilidade usada nesta sessão (Sensitivity Lab) */
  sens?: number;
  /** esconde o valor de sens no HUD (teste cego) */
  blind?: boolean;
  subtitle?: string;
}

export interface RunResult {
  record: SessionRecord | null;
  aborted: boolean;
}

const MAX_PITCH = (89 * Math.PI) / 180;

/**
 * Engine 3D: renderização (Three.js), entrada relativa e ciclo de jogo.
 * O renderer é criado uma vez e reaproveitado entre sessões.
 */
export class Engine {
  readonly root: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 300);
  private world = new LogicWorld();
  private meshes = new Map<Target, THREE.Object3D>();
  private coverMeshes: THREE.Mesh[] = [];
  private fx: { mesh: THREE.Mesh; t: number }[] = [];
  private input: MouseInput | null = null;
  private mode: Mode | null = null;
  private aim = { yaw: 0, pitch: 0 };
  private settings!: Settings;
  private sensCfg!: SensConfig;
  private ads = false;
  private state: 'idle' | 'await' | 'countdown' | 'running' | 'paused' | 'done' = 'idle';
  private countdownEnd = 0;
  private startPerf = 0;
  private pausedAt = 0;
  private pausedTotal = 0;
  private lastFrame = 0;
  private raf = 0;
  private resolve: ((r: RunResult) => void) | null = null;
  private fpsFrames = 0;
  private fpsT = 0;
  private fps = 0;
  private reactionPending = false;
  private antialias = true;
  private vfov = 70;
  // geometrias/materiais compartilhados
  private sphereGeo = new THREE.SphereGeometry(1, 32, 20);
  private headGeo = new THREE.SphereGeometry(1, 24, 16);
  private bodyGeo = new THREE.CapsuleGeometry(HUMANOID.bodyR, HUMANOID.bodyTop - HUMANOID.bodyBottom - HUMANOID.bodyR * 2 + HUMANOID.bodyR, 6, 14);
  private bodyMat = new THREE.MeshLambertMaterial({ color: '#3b4250' });
  private coverMat = new THREE.MeshLambertMaterial({ color: '#2b3038' });
  private ringGeo = new THREE.RingGeometry(0.8, 1, 32);
  // HUD
  private hud!: Record<string, HTMLElement>;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'engine';
    this.root.innerHTML = `
      <div class="engine-canvas"></div>
      <div class="dark-overlay"></div>
      <div class="hud">
        <div class="hud-top"><div class="hud-stat"><b data-h="score">0</b><span>PONTOS</span></div>
          <div class="hud-time" data-h="time">0:00</div>
          <div class="hud-stat"><b data-h="acc">—</b><span>PRECISÃO</span></div></div>
        <div class="hud-bar"><i data-h="bar"></i></div>
        <div class="hud-extra" data-h="extra"></div>
        <div class="hud-corner" data-h="corner"></div>
        <div class="hud-fps" data-h="fps"></div>
      </div>
      <div class="xh-wrap"><div data-h="xh"></div><div class="hitmarker" data-h="hm"></div></div>
      <div class="hud-msg" data-h="msg"></div>
      <div class="hud-count" data-h="count"></div>
      <div class="overlay" data-h="overlay"></div>`;
    this.hud = {};
    this.root.querySelectorAll<HTMLElement>('[data-h]').forEach((e) => (this.hud[e.dataset.h!] = e));
    this.createRenderer(store.settings.antialias);
    buildArena(this.scene);
    this.camera.rotation.order = 'YXZ';
    this.world.onAdd = (t) => this.addMesh(t);
    this.world.onRemove = (t, k) => this.removeMesh(t, k);
    this.world.onCovers = (b) => this.setCovers(b);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('fullscreenchange', this.onResize);
    this.renderer.setAnimationLoop(null);
  }

  private createRenderer(aa: boolean) {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.antialias = aa;
    this.renderer = new THREE.WebGLRenderer({ antialias: aa, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.root.querySelector('.engine-canvas')!.appendChild(this.renderer.domElement);
  }

  private onResize = () => {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const scale = this.settings?.renderScale ?? 1;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * scale);
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.applyFov();
  };

  private applyFov() {
    const zoom = this.ads && this.mode ? this.mode.weapon.w.zoom : 1;
    const v = this.vfov * (Math.PI / 180);
    this.camera.fov = ((2 * Math.atan(Math.tan(v / 2) / zoom)) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
  }

  // ---------- meshes ----------
  private addMesh(t: Target) {
    const color = new THREE.Color(this.settings?.targetColor ?? '#ff4655');
    let obj: THREE.Object3D;
    if (t.kind === 'sphere') {
      const m = new THREE.Mesh(this.sphereGeo, new THREE.MeshLambertMaterial({ color, emissive: color.clone().multiplyScalar(0.35) }));
      m.scale.setScalar(t.scale);
      obj = m;
    } else {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
      const bodyLen = HUMANOID.bodyTop - HUMANOID.bodyBottom;
      body.position.y = HUMANOID.bodyBottom + bodyLen / 2 - HUMANOID.bodyR / 2;
      const head = new THREE.Mesh(this.headGeo, new THREE.MeshLambertMaterial({ color, emissive: color.clone().multiplyScalar(0.35) }));
      head.scale.setScalar(HUMANOID.headR);
      head.position.y = HUMANOID.headY;
      g.add(body, head);
      g.scale.setScalar(t.scale);
      obj = g;
    }
    obj.userData.target = t;
    this.syncMesh(t, obj);
    this.scene.add(obj);
    this.meshes.set(t, obj);
  }

  private syncMesh(t: Target, obj: THREE.Object3D) {
    obj.position.set(t.pos.x, t.pos.y, t.pos.z);
    obj.visible = t.visible;
    if (t.kind === 'sphere') {
      const m = obj as THREE.Mesh;
      const mat = m.material as THREE.MeshLambertMaterial;
      if (t.hitFlash > 0) {
        mat.emissive.setRGB(0.9 * t.hitFlash, 0.9 * t.hitFlash, 0.9 * t.hitFlash);
        t.hitFlash = Math.max(0, t.hitFlash - 0.25);
      } else mat.emissive.copy(mat.color).multiplyScalar(0.35);
      // animação de entrada
      const age = (this.mode?.time ?? 0) - t.spawnTime;
      const k = Math.min(1, age / 60);
      m.scale.setScalar(t.scale * (0.6 + 0.4 * k));
    } else {
      // humanoide olha para o jogador
      obj.rotation.y = Math.atan2(this.world.eye.x - t.pos.x, this.world.eye.z - t.pos.z);
    }
  }

  private removeMesh(t: Target, killed: boolean) {
    const obj = this.meshes.get(t);
    if (!obj) return;
    this.meshes.delete(t);
    this.scene.remove(obj);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.material && m.material !== this.bodyMat) (m.material as THREE.Material).dispose();
    });
    if (killed) {
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      const p = t.aimPoint();
      ring.position.set(p.x, p.y, p.z);
      ring.lookAt(this.camera.position);
      ring.scale.setScalar(t.radius);
      ring.userData.base = t.radius;
      this.scene.add(ring);
      this.fx.push({ mesh: ring, t: 0 });
    }
  }

  private setCovers(boxes: Box[]) {
    for (const m of this.coverMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.coverMeshes = boxes.map((b) => {
      const w = b.max.x - b.min.x;
      const h = b.max.y - b.min.y;
      const d = b.max.z - b.min.z;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.coverMat);
      m.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      this.scene.add(m);
      return m;
    });
  }

  // ---------- sessão ----------
  mount(parent: HTMLElement) {
    parent.appendChild(this.root);
    this.onResize();
  }

  run(cfg: ModeConfig, opt: RunOptions = {}): Promise<RunResult> {
    this.settings = store.settings;
    sfx.volume = this.settings.volume;
    if (this.settings.antialias !== this.antialias) this.createRenderer(this.settings.antialias);
    this.vfov = verticalFovFrom16x9(this.settings.hfov);
    this.sensCfg = {
      dpi: this.settings.dpi,
      sens: opt.sens ?? this.settings.sens,
      adsMultiplier: this.settings.adsMultiplier,
      invertY: this.settings.invertY,
      calibration: this.settings.calibration,
    };
    renderCrosshair(this.hud.xh, this.settings.crosshair);
    this.hud.fps.style.display = this.settings.showFps ? '' : 'none';
    this.hud.corner.textContent = `${cfg.label}${opt.subtitle ? ' · ' + opt.subtitle : ''} · ${opt.blind ? 'sens oculta' : 'sens ' + this.sensCfg.sens.toFixed(3)} · ${this.sensCfg.dpi} DPI`;
    this.world.clear();
    this.aim.yaw = 0;
    this.aim.pitch = 0;
    this.ads = false;
    this.mode = createMode(cfg);
    this.mode.init({
      world: this.world,
      aim: this.aim,
      fb: {
        shot: () => sfx.shot(),
        hit: (t, part, kill) => this.onHit(t, part, kill),
        miss: () => sfx.miss(),
        falseStart: () => sfx.falseStart(),
        message: (txt, ms) => this.message(txt, ms),
        setDark: (d) => this.root.classList.toggle('dark', d),
      },
    });
    this.root.classList.add('active');
    this.onResize();
    this.input?.dispose();
    this.input = new MouseInput(this.renderer.domElement, {
      onMove: this.onMove,
      onDown: this.onDown,
      onUp: this.onUp,
      onLockChange: this.onLock,
    }, { raw: this.settings.rawInput, lowLatency: this.settings.lowLatencyInput });
    this.state = 'await';
    this.showOverlay('start');
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
    return new Promise((res) => (this.resolve = res));
  }

  private gameNow(perf: number) {
    return perf - this.startPerf - this.pausedTotal;
  }

  private async requestLock() {
    sfx.unlock();
    if (this.settings.fullscreenOnStart && !document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        /* ignora */
      }
    }
    const ok = await this.input!.lock();
    if (!ok) this.showOverlay('lockfail');
  }

  private onLock = (locked: boolean) => {
    if (locked) {
      this.hideOverlay();
      if (this.state === 'await') {
        this.state = 'countdown';
        this.countdownEnd = performance.now() + 3000;
      } else if (this.state === 'paused') {
        this.pausedTotal += performance.now() - this.pausedAt;
        this.state = 'running';
      }
    } else if (this.state === 'running' || this.state === 'countdown') {
      if (this.state === 'countdown') {
        this.state = 'await';
        this.showOverlay('start');
        return;
      }
      this.state = 'paused';
      this.pausedAt = performance.now();
      this.mode?.trigger(false, this.gameNow(this.pausedAt));
      this.showOverlay('pause');
    }
  };

  private onMove = (dx: number, dy: number) => {
    if (this.state !== 'running' && this.state !== 'countdown') return;
    const zs = this.ads ? zoomSensScale(this.settings.hfov, this.mode!.weapon.w.zoom, this.sensCfg.adsMultiplier) : 1;
    this.aim.yaw -= deltaToRadians(dx, this.sensCfg, zs);
    this.aim.pitch -= deltaToRadians(dy, this.sensCfg, zs) * (this.sensCfg.invertY ? -1 : 1);
    if (this.aim.pitch > MAX_PITCH) this.aim.pitch = MAX_PITCH;
    if (this.aim.pitch < -MAX_PITCH) this.aim.pitch = -MAX_PITCH;
    this.aim.yaw = ((this.aim.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  };

  private onDown = (button: number, t: number) => {
    if (this.state !== 'running' || !this.mode) return;
    if (button === 0) this.mode.trigger(true, this.gameNow(t));
    else if (button === 2 && this.mode.weapon.w.zoom > 1) {
      this.ads = true;
      this.mode.setAds(true);
      this.applyFov();
      this.root.classList.add('ads');
    }
  };

  private onUp = (button: number, t: number) => {
    if (!this.mode) return;
    if (button === 0) this.mode.trigger(false, this.gameNow(t));
    else if (button === 2 && this.ads) {
      this.ads = false;
      this.mode.setAds(false);
      this.applyFov();
      this.root.classList.remove('ads');
    }
  };

  private onKey = (e: KeyboardEvent) => {
    if (this.state === 'paused' || this.state === 'await') {
      if (e.code === 'KeyR' && this.state === 'paused' && this.mode) {
        const cfg = this.mode.cfg;
        const res = this.resolve;
        this.resolve = null;
        this.finish(false, true);
        void this.run({ ...cfg, seed: cfg.context === 'lab' ? cfg.seed : (Math.random() * 2 ** 32) >>> 0 }, { sens: this.sensCfg.sens }).then((r) => res?.(r));
      } else if (e.code === 'KeyQ' || e.code === 'Backspace') {
        this.abort();
      }
    }
  };

  private onHit(t: Target, part: HitPart, kill: boolean) {
    if (part === 'head') sfx.headshot();
    else if (part === 'body') sfx.body();
    else sfx.hit();
    t.hitFlash = 1;
    const hm = this.hud.hm;
    hm.className = 'hitmarker show' + (part === 'head' ? ' head' : '') + (kill ? ' kill' : '');
    void hm.offsetWidth;
    hm.classList.add('anim');
  }

  private msgTimer = 0;
  private message(text: string, ms = 800) {
    this.hud.msg.textContent = text;
    this.hud.msg.classList.add('show');
    clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => this.hud.msg.classList.remove('show'), ms);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(50, now - this.lastFrame);
    this.lastFrame = now;
    // FPS
    this.fpsFrames++;
    if (now - this.fpsT >= 500) {
      this.fps = (this.fpsFrames * 1000) / (now - this.fpsT);
      this.fpsFrames = 0;
      this.fpsT = now;
      if (this.settings.showFps) this.hud.fps.textContent = `${Math.round(this.fps)} FPS · ${Math.round(this.input?.eventRate ?? 0)} Hz${this.input?.rawActive ? ' · RAW' : ''}`;
    }
    const m = this.mode;
    if (m) {
      if (this.state === 'countdown') {
        const left = this.countdownEnd - now;
        const n = Math.ceil(left / 1000);
        const txt = left > 0 ? String(n) : '';
        if (this.hud.count.textContent !== txt) {
          this.hud.count.textContent = txt;
          if (txt) sfx.countdown(false);
        }
        if (left <= 0) {
          sfx.countdown(true);
          this.state = 'running';
          this.startPerf = now;
          this.pausedTotal = 0;
          this.lastFrame = now;
        }
      } else if (this.state === 'running') {
        // alvo de reação: o instante de exibição é o início do frame seguinte ao que o desenhou
        if (this.reactionPending && m instanceof ReactionMode) {
          m.presentedAt = this.gameNow(now);
          this.reactionPending = false;
        }
        const before = this.world.targets.length;
        // tempo de jogo segue o relógio real (mesma base dos timestamps de clique)
        m.tick(Math.max(0, this.gameNow(now) - m.time));
        if (m instanceof ReactionMode && this.world.targets.length > before) this.reactionPending = true;
        this.updateHud();
        if (m.done) {
          this.finish(true);
          return;
        }
      }
      for (const [t, o] of this.meshes) this.syncMesh(t, o);
    }
    // efeitos de abate
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const k = f.t / 220;
      f.mesh.scale.setScalar(f.mesh.userData.base * (1 + k * 1.8));
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      if (k >= 1) {
        this.scene.remove(f.mesh);
        (f.mesh.material as THREE.Material).dispose();
        this.fx.splice(i, 1);
      }
    }
    this.camera.position.set(this.world.eye.x, this.world.eye.y, this.world.eye.z);
    this.camera.rotation.set(this.aim.pitch, this.aim.yaw, 0);
    this.renderer.render(this.scene, this.camera);
  };

  private lastHud = '';
  private updateHud() {
    const h = this.mode!.hud();
    const tl = Math.ceil(h.timeLeft);
    const key = `${tl}|${h.score}|${Math.round(h.accuracy * 1000)}|${h.extra}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.hud.time.textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
    this.hud.score.textContent = String(h.score);
    this.hud.acc.textContent = this.mode!.shots ? `${(h.accuracy * 100).toFixed(1)}%` : '—';
    this.hud.extra.textContent = h.extra ?? '';
    const prog = h.progress ?? 1 - h.timeLeft / (this.mode!.durationMs / 1000);
    (this.hud.bar as HTMLElement).style.transform = `scaleX(${Math.min(1, Math.max(0, prog))})`;
  }

  private finish(completed: boolean, silent = false) {
    const m = this.mode;
    this.state = 'done';
    cancelAnimationFrame(this.raf);
    this.input?.dispose();
    this.input = null;
    this.root.classList.remove('active', 'dark', 'ads');
    this.hud.count.textContent = '';
    this.hideOverlay();
    if (!silent) sfx.end();
    let record: SessionRecord | null = null;
    if (m && m.time > 0) record = m.record({ dpi: this.sensCfg.dpi, sens: this.sensCfg.sens, completed });
    this.world.clear();
    this.mode = null;
    const r = this.resolve;
    this.resolve = null;
    r?.({ record, aborted: !completed });
  }

  abort() {
    if (this.state === 'idle' || this.state === 'done') return;
    this.finish(false, true);
  }

  // ---------- overlays ----------
  private showOverlay(kind: 'start' | 'pause' | 'lockfail') {
    const o = this.hud.overlay;
    o.classList.add('show');
    const mode = this.mode!;
    if (kind === 'start') {
      o.innerHTML = `<div class="ov-card"><div class="ov-kicker">${mode.cfg.context === 'lab' ? 'SENSITIVITY LAB' : 'TREINO'}</div>
        <h2>${mode.cfg.label}</h2><p>${this.hud.corner.textContent}</p>
        <button class="btn primary big" data-a="go">Clique para começar</button>
        <p class="hint">ESC pausa · R reinicia (pausado) · Q sai</p></div>`;
    } else if (kind === 'pause') {
      o.innerHTML = `<div class="ov-card"><div class="ov-kicker">PAUSADO</div><h2>${mode.cfg.label}</h2>
        <div class="row-btns"><button class="btn primary" data-a="go">Continuar</button>
        ${mode.cfg.context === 'lab' ? '' : '<button class="btn" data-a="restart">Reiniciar (R)</button>'}
        <button class="btn ghost" data-a="quit">Sair (Q)</button></div></div>`;
    } else {
      o.innerHTML = `<div class="ov-card"><div class="ov-kicker">POINTER LOCK</div><h2>Não foi possível capturar o mouse</h2>
        <p>${this.input?.lastLockError || ''}</p><p>Se o AIMCORE estiver dentro de uma janela incorporada, abra-o em uma aba própria. Clique novamente para tentar.</p>
        <div class="row-btns"><button class="btn primary" data-a="go">Tentar de novo</button><button class="btn ghost" data-a="quit">Sair</button></div></div>`;
    }
    o.onclick = (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'go') void this.requestLock();
      else if (a === 'quit') this.abort();
      else if (a === 'restart') this.onKey(new KeyboardEvent('keydown', { code: 'KeyR' }));
    };
  }

  private hideOverlay() {
    this.hud.overlay.classList.remove('show');
    this.hud.overlay.innerHTML = '';
  }

  get busy() {
    return this.state !== 'idle' && this.state !== 'done';
  }
}

let _engine: Engine | null = null;
export const getEngine = () => (_engine ??= new Engine());
