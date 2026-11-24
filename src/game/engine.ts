import * as THREE from 'three';
import { deltaToRadians, verticalFovFrom16x9, zoomSensScale, type SensConfig } from '../core/sensitivity';
import { rayAabb } from '../core/geometry';
import { store } from '../data/store';
import type { SessionRecord, Settings } from '../data/types';
import type { Mode, ModeConfig, ShotInfo } from '../modes/base';
import { createMode } from '../modes/catalog';
import { ReactionMode } from '../modes/reaction';
import { buildArena, rayEnvironment, type Arena } from './arena';
import { sfx } from './audio';
import { createBot, type BotMesh } from './botmodel';
import { renderCrosshair } from './crosshair';
import { Effects } from './effects';
import { MouseInput } from './input';
import { Player } from './player';
import { type Box, type HitPart, Target } from './target';
import { ViewModel } from './viewmodel';
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
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

/**
 * Engine 3D: renderização (Three.js), entrada relativa, movimento e ciclo de jogo.
 * O renderer é criado uma vez e reaproveitado entre sessões.
 */
export class Engine {
  readonly root: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 300);
  private world = new LogicWorld();
  private meshes = new Map<Target, THREE.Object3D>();
  private bots = new Map<Target, BotMesh>();
  private coverMeshes: THREE.Mesh[] = [];
  private arena: Arena | null = null;
  private arenaKey = '';
  private effects: Effects;
  private vm = new ViewModel();
  private player = new Player();
  private movement = false;
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
  private lastErrPx = -1;
  private kills = 0;
  private killStreakT = 0;
  private sphereGeo = new THREE.SphereGeometry(1, 32, 20);
  private coverMat = new THREE.MeshStandardMaterial({ color: '#4d5560', roughness: 0.75 });
  private tmpV = new THREE.Vector3();
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
        <div class="killfeed" data-h="feed"></div>
        <div class="hud-weapon" data-h="weapon"><div class="hw-name" data-h="wname"></div><div class="hw-ammo"><b data-h="ammo">0</b><span data-h="reserve">/ ∞</span></div><div class="hw-reload" data-h="reload"><i></i></div></div>
        <div class="hud-move" data-h="move"><span>MOV</span><i data-h="movebar"></i></div>
        <div class="streak" data-h="streak"></div>
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
    this.effects = new Effects(this.scene);
    this.camera.rotation.order = 'YXZ';
    this.world.onAdd = (t) => this.addMesh(t);
    this.world.onRemove = (t, k) => this.removeMesh(t, k);
    this.world.onCovers = (b) => this.setCovers(b);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('fullscreenchange', this.onResize);
  }

  private createRenderer(aa: boolean) {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.antialias = aa;
    this.renderer = new THREE.WebGLRenderer({ antialias: aa, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.root.querySelector('.engine-canvas')!.appendChild(this.renderer.domElement);
  }

  private ensureArena() {
    const key = `${this.settings.arena}|${this.settings.shadows}`;
    if (key === this.arenaKey && this.arena) return;
    this.arena?.dispose();
    this.arena = buildArena(this.scene, this.settings.arena, this.settings.shadows);
    this.renderer.shadowMap.enabled = this.settings.shadows && this.settings.arena === 'range';
    this.renderer.shadowMap.needsUpdate = true;
    this.arenaKey = key;
  }

  private onResize = () => {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const scale = this.settings?.renderScale ?? 1;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * scale);
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.vm.resize(w / h);
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
      const m = new THREE.Mesh(this.sphereGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color.clone().multiplyScalar(0.35) }));
      m.scale.setScalar(t.scale);
      m.castShadow = this.settings.shadows;
      obj = m;
    } else {
      const bot = createBot(color, this.settings.shadows);
      bot.group.scale.setScalar(t.scale);
      bot.group.rotation.order = 'YXZ';
      this.bots.set(t, bot);
      obj = bot.group;
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
      const mat = m.material as THREE.MeshStandardMaterial;
      if (t.hitFlash > 0) {
        mat.emissive.setRGB(0.9 * t.hitFlash, 0.9 * t.hitFlash, 0.9 * t.hitFlash);
        t.hitFlash = Math.max(0, t.hitFlash - 0.25);
      } else mat.emissive.copy(mat.color).multiplyScalar(0.35);
      const age = (this.mode?.time ?? 0) - t.spawnTime;
      m.scale.setScalar(t.scale * (0.6 + 0.4 * Math.min(1, age / 60)));
    } else {
      obj.rotation.y = Math.atan2(this.world.eye.x - t.pos.x, this.world.eye.z - t.pos.z);
      const bot = this.bots.get(t);
      if (bot) {
        const f = t.hitFlash;
        bot.body.emissive.setRGB(f * 0.8, f * 0.15, f * 0.15);
        if (f > 0) t.hitFlash = Math.max(0, f - 0.12);
      }
    }
  }

  private removeMesh(t: Target, killed: boolean) {
    const obj = this.meshes.get(t);
    if (!obj) return;
    this.meshes.delete(t);
    const bot = this.bots.get(t);
    this.bots.delete(t);
    const disposeObj = () => {
      this.scene.remove(obj);
      if (bot) bot.mats.forEach((m) => m.dispose());
      else ((obj as THREE.Mesh).material as THREE.Material).dispose();
    };
    if (killed && bot) {
      this.effects.death(obj, disposeObj);
      return;
    }
    disposeObj();
    if (killed) this.effects.killRing(this.tmpV.set(t.aimPoint().x, t.aimPoint().y, t.aimPoint().z).clone(), t.radius, this.camera);
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
      m.castShadow = m.receiveShadow = this.settings.shadows;
      this.scene.add(m);
      return m;
    });
  }

  // ---------- sessão ----------
  mount(parent: HTMLElement) {
    parent.appendChild(this.root);
  }

  run(cfg: ModeConfig, opt: RunOptions = {}): Promise<RunResult> {
    this.settings = store.settings;
    sfx.volume = this.settings.volume;
    if (this.settings.antialias !== this.antialias) {
      this.createRenderer(this.settings.antialias);
      this.arenaKey = '';
    }
    this.ensureArena();
    this.vfov = verticalFovFrom16x9(this.settings.hfov);
    this.sensCfg = {
      dpi: this.settings.dpi,
      sens: opt.sens ?? this.settings.sens,
      adsMultiplier: this.settings.adsMultiplier,
      invertY: this.settings.invertY,
      calibration: this.settings.calibration,
    };
    this.lastErrPx = -1;
    renderCrosshair(this.hud.xh, this.settings.crosshair);
    this.hud.fps.style.display = this.settings.showFps ? '' : 'none';
    this.effects.clear();
    this.world.clear();
    this.player.reset();
    this.world.eye.x = 0;
    this.world.eye.z = 0;
    this.aim.yaw = 0;
    this.aim.pitch = 0;
    this.ads = false;
    this.kills = 0;
    this.hud.feed.innerHTML = '';
    this.hud.streak.innerHTML = '';
    this.mode = createMode(cfg);
    const w = this.mode.weapon.w;
    const isWeapon = w.kind !== 'none';
    this.movement = !!cfg.params?.movement || (isWeapon && this.settings.movementAlways);
    this.vm.setWeapon(isWeapon && this.settings.showWeapon ? w.kind : 'none', this.settings.targetColor);
    this.root.classList.toggle('has-weapon', isWeapon);
    this.root.classList.toggle('has-move', this.movement);
    this.hud.wname.textContent = w.name.toUpperCase();
    this.hud.corner.textContent = `${cfg.label}${opt.subtitle ? ' · ' + opt.subtitle : ''} · ${opt.blind ? 'sens oculta' : 'sens ' + this.sensCfg.sens.toFixed(3)} · ${this.sensCfg.dpi} DPI${this.movement ? ' · WASD/Shift · R recarrega' : isWeapon ? ' · R recarrega' : ''}`;
    this.mode.init({
      world: this.world,
      aim: this.aim,
      fb: {
        shot: (info) => this.onShot(info),
        reload: (ms) => {
          this.vm.reload(ms);
          sfx.reload();
        },
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
      this.player.keys.clear();
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
    this.aim.yaw = (((this.aim.yaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.vm.addSway(dx, dy);
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
    if (this.state === 'running' || this.state === 'countdown') {
      if (MOVE_KEYS.has(e.code) && this.movement) {
        this.player.keys.add(e.code);
        e.preventDefault();
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.player.walking = true;
      else if (e.code === 'KeyR' && this.state === 'running') this.mode?.reload();
      return;
    }
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

  private onKeyUp = (e: KeyboardEvent) => {
    if (MOVE_KEYS.has(e.code)) this.player.keys.delete(e.code);
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.player.walking = false;
  };

  private onShot(info?: ShotInfo) {
    if (this.mode?.weapon.w.kind === 'none') {
      sfx.shot();
      return;
    }
    sfx.gun(this.mode!.weapon.w.kind);
    this.vm.shoot();
    if (!info) return;
    const e = this.world.eye;
    const o = { x: e.x, y: e.y, z: e.z };
    let t = info.hitT ?? Infinity;
    let n = { x: 0, y: 1, z: 0 };
    let env = false;
    if (info.hitT == null) {
      const r = rayEnvironment(o, info.dir);
      t = r.t;
      n = r.n;
      env = true;
    }
    for (const b of [...this.world.covers, ...(this.arena?.solids ?? [])]) {
      const tb = rayAabb(o, info.dir, b.min, b.max);
      if (tb >= 0 && tb < t) {
        t = tb;
        env = true;
        const p = { x: o.x + info.dir.x * tb, y: o.y + info.dir.y * tb, z: o.z + info.dir.z * tb };
        const eps = 0.02;
        n = Math.abs(p.x - b.min.x) < eps ? { x: -1, y: 0, z: 0 } : Math.abs(p.x - b.max.x) < eps ? { x: 1, y: 0, z: 0 }
          : Math.abs(p.z - b.min.z) < eps ? { x: 0, y: 0, z: -1 } : Math.abs(p.z - b.max.z) < eps ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
      }
    }
    if (!Number.isFinite(t)) t = 120;
    const end = new THREE.Vector3(o.x + info.dir.x * t, o.y + info.dir.y * t, o.z + info.dir.z * t);
    // tracer a partir do cano (posição da arma convertida para o mundo)
    const from = this.vm.visible ? this.vm.muzzleOffset().applyQuaternion(this.camera.quaternion).add(this.camera.position) : this.camera.position.clone().add(new THREE.Vector3(0, -0.15, 0));
    this.effects.tracer(from, end);
    if (env) this.effects.impact(end, new THREE.Vector3(n.x, n.y, n.z));
  }

  private onHit(t: Target, part: HitPart, kill: boolean) {
    if (part === 'head') sfx.headshot();
    else if (part === 'body') sfx.body();
    else sfx.hit();
    t.hitFlash = 1;
    const hm = this.hud.hm;
    hm.className = 'hitmarker show' + (part === 'head' ? ' head' : '') + (kill ? ' kill' : '');
    void hm.offsetWidth;
    hm.classList.add('anim');
    if (kill && t.kind === 'humanoid') this.addKill(part === 'head');
  }

  private addKill(head: boolean) {
    this.kills++;
    const now = performance.now();
    const streak = now - this.killStreakT < 2600 ? Number(this.hud.streak.dataset.n || 0) + 1 : 1;
    this.killStreakT = now;
    // kill feed
    const row = document.createElement('div');
    row.className = 'kf-row';
    row.innerHTML = `<span class="kf-me">VOCÊ</span><span class="kf-gun">${this.mode!.weapon.w.name}</span>${head ? '<span class="kf-hs" title="headshot">◎</span>' : ''}<span class="kf-bot">BOT-${String(this.kills).padStart(2, '0')}</span>`;
    this.hud.feed.prepend(row);
    while (this.hud.feed.children.length > 5) this.hud.feed.lastElementChild!.remove();
    setTimeout(() => row.classList.add('out'), 3800);
    setTimeout(() => row.remove(), 4300);
    // contador de abates em sequência
    this.hud.streak.dataset.n = String(streak);
    this.hud.streak.innerHTML = `<div class="st-pips">${Array.from({ length: Math.min(5, streak) }, (_, i) => `<i class="${i === Math.min(5, streak) - 1 ? 'new' : ''}"></i>`).join('')}</div>${streak >= 2 ? `<b>${['', '', 'DOUBLE', 'TRIPLE', 'QUADRA', 'ACE'][Math.min(5, streak)]}</b>` : ''}`;
    this.hud.streak.classList.remove('show');
    void this.hud.streak.offsetWidth;
    this.hud.streak.classList.add('show');
    if (streak >= 2) sfx.streak(streak);
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
    this.fpsFrames++;
    if (now - this.fpsT >= 500) {
      this.fps = (this.fpsFrames * 1000) / (now - this.fpsT);
      this.fpsFrames = 0;
      this.fpsT = now;
      if (this.settings.showFps) this.hud.fps.textContent = `${Math.round(this.fps)} FPS · ${Math.round(this.input?.eventRate ?? 0)} Hz${this.input?.rawActive ? ' · RAW' : ''}`;
    }
    const m = this.mode;
    if (m) {
      if (this.state === 'running' || this.state === 'countdown') {
        if (this.movement) {
          this.player.update(dt / 1000, this.aim.yaw);
          this.world.eye.x = this.player.x;
          this.world.eye.z = this.player.z;
        }
        const ratio = this.movement ? this.player.speedRatio : 0;
        m.moveRatio = ratio;
        m.weapon.setMovement(ratio, this.player.walking);
      }
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
        }
      } else if (this.state === 'running') {
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
      this.updateCrosshairError();
    }
    this.effects.update(dt);
    this.vm.update(dt, this.movement ? this.player.speedRatio : 0, this.ads);
    this.camera.position.set(this.world.eye.x, this.world.eye.y, this.world.eye.z);
    this.camera.rotation.set(this.aim.pitch, this.aim.yaw, 0);
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    if (this.vm.visible && !this.root.classList.contains('dark')) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.vm.scene, this.vm.camera);
    }
  };

  /** afasta as linhas da mira conforme o erro de disparo/movimento atual */
  private updateCrosshairError() {
    const w = this.mode!.weapon;
    if (w.w.kind === 'none' || !this.settings.crosshair.firingError) return;
    const extra = Math.max(0, w.currentSpread() - w.w.baseSpread);
    const h = this.root.clientHeight || window.innerHeight;
    const px = (Math.tan((extra * Math.PI) / 180) / Math.tan((this.camera.fov * Math.PI) / 360)) * (h / 2);
    const r = Math.min(60, Math.round(px));
    if (r !== this.lastErrPx) {
      this.lastErrPx = r;
      renderCrosshair(this.hud.xh, this.settings.crosshair, r);
    }
  }

  private lastHud = '';
  private updateHud() {
    const m = this.mode!;
    const h = m.hud();
    const w = m.weapon;
    const tl = Math.ceil(h.timeLeft);
    const ammo = w.w.mag > 0 ? (w.reloading ? '…' : String(w.ammo)) : '∞';
    const mv = this.movement ? Math.round(Math.min(1, this.player.speedRatio) * 20) : 0;
    const key = `${tl}|${h.score}|${Math.round(h.accuracy * 1000)}|${h.extra}|${ammo}|${mv}|${w.moveErr > 0}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.hud.time.textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
    this.hud.score.textContent = String(h.score);
    this.hud.acc.textContent = m.shots ? `${(h.accuracy * 100).toFixed(1)}%` : '—';
    this.hud.extra.textContent = h.extra ?? '';
    this.hud.ammo.textContent = ammo;
    this.hud.ammo.classList.toggle('low', w.w.mag > 0 && w.ammo <= Math.ceil(w.w.mag * 0.2));
    this.hud.reserve.textContent = w.w.mag > 0 ? `/ ${w.w.mag}` : '';
    this.hud.weapon.classList.toggle('reloading', w.reloading);
    (this.hud.reload.firstElementChild as HTMLElement).style.animationDuration = `${w.w.reloadMs}ms`;
    (this.hud.movebar as HTMLElement).style.transform = `scaleX(${mv / 20})`;
    this.hud.move.classList.toggle('inacc', w.moveErr > 0);
    const prog = h.progress ?? 1 - h.timeLeft / (m.durationMs / 1000);
    (this.hud.bar as HTMLElement).style.transform = `scaleX(${Math.min(1, Math.max(0, prog))})`;
  }

  private finish(completed: boolean, silent = false) {
    const m = this.mode;
    this.state = 'done';
    cancelAnimationFrame(this.raf);
    this.input?.dispose();
    this.input = null;
    this.player.keys.clear();
    this.root.classList.remove('active', 'dark', 'ads');
    this.hud.count.textContent = '';
    this.hideOverlay();
    if (!silent) sfx.end();
    let record: SessionRecord | null = null;
    if (m && m.time > 0) record = m.record({ dpi: this.sensCfg.dpi, sens: this.sensCfg.sens, completed });
    this.world.clear();
    this.effects.clear();
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
        ${this.movement ? '<p class="ov-tip">Mova com <b>WASD</b>, ande com <b>Shift</b>. Atirar correndo é impreciso: solte ou aperte a tecla oposta (counter-strafe) antes de atirar.</p>' : ''}
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
