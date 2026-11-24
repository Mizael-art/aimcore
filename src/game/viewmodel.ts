import * as THREE from 'three';

/**
 * Arma em primeira pessoa (modelos originais feitos de primitivas), renderizada numa cena
 * própria por cima do mundo: recuo, sway com o mouse, balanço ao andar, recarga, ADS e muzzle flash.
 */
function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,250,220,1)');
  gr.addColorStop(0.3, 'rgba(255,190,90,0.9)');
  gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 12 : 32;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rifle(accent: THREE.Material, dark: THREE.Material, mid: THREE.Material) {
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.rotation.x = rx;
    g.add(b);
    return b;
  };
  box(0.06, 0.075, 0.34, mid, 0, 0, 0); // receiver
  box(0.052, 0.05, 0.2, dark, 0, 0.005, -0.25); // guarda-mão
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.44);
  g.add(barrel);
  box(0.04, 0.12, 0.06, dark, 0, -0.085, -0.04, 0.25); // carregador
  box(0.035, 0.08, 0.04, dark, 0, -0.07, 0.11, -0.3); // empunhadura
  box(0.05, 0.065, 0.16, mid, 0, -0.01, 0.24); // coronha
  box(0.012, 0.03, 0.08, dark, 0, 0.05, -0.02); // mira
  box(0.004, 0.012, 0.3, accent, -0.031, 0.012, 0); // filete lateral
  box(0.004, 0.02, 0.14, accent, -0.027, -0.005, -0.25);
  return { g, muzzle: new THREE.Vector3(0, 0.012, -0.55) };
}

function pistol(accent: THREE.Material, dark: THREE.Material, mid: THREE.Material) {
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.rotation.x = rx;
    g.add(b);
  };
  box(0.045, 0.05, 0.12, mid, 0, 0, 0);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), dark);
  cyl.rotation.x = Math.PI / 2;
  cyl.position.set(0, -0.002, -0.07);
  g.add(cyl);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.16, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.18);
  g.add(barrel);
  box(0.035, 0.1, 0.045, dark, 0, -0.07, 0.05, -0.35);
  box(0.047, 0.006, 0.06, accent, 0, 0.028, 0.02);
  return { g, muzzle: new THREE.Vector3(0, 0.012, -0.27) };
}

export class ViewModel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 10);
  private holder = new THREE.Group();
  private gun: THREE.Group | null = null;
  private muzzle = new THREE.Vector3();
  private flash: THREE.Mesh;
  private flashT = 0;
  private kick = 0;
  private swayX = 0;
  private swayY = 0;
  private bob = 0;
  private reloadT = 0;
  private reloadMs = 0;
  private adsK = 0;
  kind: 'rifle' | 'pistol' | 'none' = 'none';

  constructor() {
    this.scene.add(new THREE.HemisphereLight('#eef3f8', '#5a5246', 2.2));
    const d = new THREE.DirectionalLight('#fff4e0', 2.4);
    d.position.set(-1.5, 2, 1);
    this.scene.add(d);
    this.scene.add(this.holder);
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flash.visible = false;
  }

  setWeapon(kind: 'rifle' | 'pistol' | 'none', accentColor: string) {
    if (this.gun) {
      this.holder.remove(this.gun);
      this.gun.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.kind = kind;
    this.gun = null;
    if (kind === 'none') return;
    const accent = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.25, roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: '#363d46', roughness: 0.5, metalness: 0.3 });
    const mid = new THREE.MeshStandardMaterial({ color: '#8b96a3', roughness: 0.45, metalness: 0.2 });
    const m = kind === 'rifle' ? rifle(accent, dark, mid) : pistol(accent, dark, mid);
    this.gun = m.g;
    this.gun.scale.setScalar(kind === 'rifle' ? 1 : 1.1);
    this.muzzle.copy(m.muzzle);
    this.flash.position.copy(m.muzzle);
    this.gun.add(this.flash);
    this.holder.add(this.gun);
  }

  get visible() {
    return this.kind !== 'none';
  }

  shoot() {
    this.kick = Math.min(1.6, this.kick + 1);
    this.flashT = 45;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
  }

  reload(ms: number) {
    this.reloadT = ms;
    this.reloadMs = ms;
  }

  addSway(dx: number, dy: number) {
    this.swayX = Math.max(-1, Math.min(1, this.swayX + dx * 0.004));
    this.swayY = Math.max(-1, Math.min(1, this.swayY + dy * 0.004));
  }

  update(dtMs: number, speedRatio: number, ads: boolean) {
    const dt = dtMs / 1000;
    this.kick *= Math.exp(-dt * 18);
    this.swayX *= Math.exp(-dt * 10);
    this.swayY *= Math.exp(-dt * 10);
    this.adsK += ((ads ? 1 : 0) - this.adsK) * Math.min(1, dt * 14);
    if (speedRatio > 0.05) this.bob += dt * (6 + 6 * speedRatio);
    const bobA = Math.min(1, speedRatio) * (1 - this.adsK * 0.8);
    this.flashT -= dtMs;
    this.flash.visible = this.flashT > 0;
    let reloadK = 0;
    if (this.reloadT > 0) {
      this.reloadT -= dtMs;
      const p = 1 - Math.max(0, this.reloadT) / this.reloadMs;
      reloadK = Math.sin(Math.min(1, p) * Math.PI);
    }
    const pistolK = this.kind === 'pistol' ? 1 : 0;
    // posição base (quadril) ↔ ADS (mais central)
    const bx = THREE.MathUtils.lerp(0.21 - pistolK * 0.03, 0.0, this.adsK * 0.85);
    const by = THREE.MathUtils.lerp(-0.2 + pistolK * 0.03, -0.11, this.adsK);
    const bz = THREE.MathUtils.lerp(-0.5 + pistolK * 0.12, -0.4, this.adsK);
    this.holder.position.set(
      bx - this.swayX * 0.015 + Math.sin(this.bob) * 0.008 * bobA,
      by + this.swayY * 0.012 - Math.abs(Math.cos(this.bob)) * 0.008 * bobA - reloadK * 0.12,
      bz + this.kick * 0.045,
    );
    this.holder.rotation.set(this.kick * 0.07 + reloadK * 0.5, 0.07 * (1 - this.adsK) - this.swayX * 0.04, reloadK * 0.6 - this.swayX * 0.03 + 0.02 * (1 - this.adsK));
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** posição aproximada do cano em coordenadas da câmera (para tracers) */
  muzzleOffset() {
    return new THREE.Vector3(this.holder.position.x, this.holder.position.y + 0.01, this.holder.position.z - (this.kind === 'rifle' ? 0.55 : 0.3));
  }
}
