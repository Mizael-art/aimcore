import * as THREE from 'three';

/**
 * Armas em primeira pessoa (modelos ORIGINAIS feitos de primitivas), renderizadas numa cena
 * própria por cima do mundo: recuo, sway, balanço ao andar, recarga, ADS, saque (equip),
 * inspeção (F) e golpes de faca.
 */
export type VmKind = 'rifle' | 'pistol' | 'knife' | 'none';

export interface KnifeDef {
  id: string;
  name: string;
  desc: string;
  blade: string;
  handle: string;
  accent: string;
}

/** 5 facas originais, de tipos reais genéricos. */
export const KNIVES: KnifeDef[] = [
  { id: 'tactical', name: 'Tática', desc: 'Lâmina reta drop-point, cabo emborrachado', blade: '#cfd6dd', handle: '#22272d', accent: '#ff4655' },
  { id: 'karambit', name: 'Karambit', desc: 'Lâmina curva em garra e anel no cabo', blade: '#b9c2cc', handle: '#3a2a4a', accent: '#c86bff' },
  { id: 'balisong', name: 'Borboleta', desc: 'Dois cabos que giram — inspecione para o flip', blade: '#e2e6ea', handle: '#1e3f52', accent: '#2bd4c0' },
  { id: 'kunai', name: 'Kunai', desc: 'Lâmina em folha, cabo enrolado e argola', blade: '#9aa3ad', handle: '#5a1f22', accent: '#ffb347' },
  { id: 'cleaver', name: 'Cutelo', desc: 'Lâmina larga e pesada com furo', blade: '#d8d2c8', handle: '#4a3322', accent: '#f2d15c' },
];

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

const mats = (accentColor: string) => ({
  accent: new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.25, roughness: 0.4 }),
  dark: new THREE.MeshStandardMaterial({ color: '#363d46', roughness: 0.5, metalness: 0.3 }),
  mid: new THREE.MeshStandardMaterial({ color: '#8b96a3', roughness: 0.45, metalness: 0.2 }),
});

function boxer(g: THREE.Object3D) {
  return (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.rotation.x = rx;
    g.add(b);
    return b;
  };
}

function rifle(accentColor: string) {
  const { accent, dark, mid } = mats(accentColor);
  const g = new THREE.Group();
  const box = boxer(g);
  box(0.06, 0.075, 0.34, mid, 0, 0, 0);
  box(0.052, 0.05, 0.2, dark, 0, 0.005, -0.25);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.44);
  g.add(barrel);
  box(0.04, 0.12, 0.06, dark, 0, -0.085, -0.04, 0.25);
  box(0.035, 0.08, 0.04, dark, 0, -0.07, 0.11, -0.3);
  box(0.05, 0.065, 0.16, mid, 0, -0.01, 0.24);
  box(0.012, 0.03, 0.08, dark, 0, 0.05, -0.02);
  box(0.004, 0.012, 0.3, accent, -0.031, 0.012, 0);
  box(0.004, 0.02, 0.14, accent, -0.027, -0.005, -0.25);
  return { g, muzzle: new THREE.Vector3(0, 0.012, -0.55) };
}

function pistol(accentColor: string) {
  const { accent, dark, mid } = mats(accentColor);
  const g = new THREE.Group();
  const box = boxer(g);
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

/** extruda um contorno 2D (x = ao longo da lâmina, y = largura) em uma lâmina fina apontando para -Z */
function bladeMesh(points: [number, number][], thick: number, mat: THREE.Material) {
  const sh = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.6, bevelSize: 0.002, bevelSegments: 1 });
  geo.translate(0, 0, -thick / 2);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.y = Math.PI / 2;
  return m;
}

/** Monta uma faca original. Cabo na origem, lâmina para -Z. */
export function buildKnife(def: KnifeDef) {
  const g = new THREE.Group();
  const blade = new THREE.MeshStandardMaterial({ color: def.blade, metalness: 0.35, roughness: 0.28, emissive: def.blade, emissiveIntensity: 0.08 });
  const handle = new THREE.MeshStandardMaterial({ color: def.handle, roughness: 0.6, metalness: 0.1 });
  const accent = new THREE.MeshStandardMaterial({ color: def.accent, emissive: def.accent, emissiveIntensity: 0.35, roughness: 0.4 });
  const box = boxer(g);
  const parts: { a?: THREE.Object3D; b?: THREE.Object3D } = {};
  switch (def.id) {
    case 'tactical': {
      box(0.026, 0.03, 0.11, handle, 0, 0, 0.055);
      box(0.028, 0.006, 0.07, accent, 0, -0.005, 0.07);
      box(0.034, 0.04, 0.01, accent, 0, 0.003, -0.004);
      const b = bladeMesh([[0, -0.012], [0.11, -0.014], [0.165, 0.002], [0.13, 0.016], [0, 0.016]], 0.004, blade);
      b.position.set(0, 0.002, -0.01);
      g.add(b);
      break;
    }
    case 'karambit': {
      box(0.024, 0.028, 0.09, handle, 0, 0, 0.045);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 20), accent);
      ring.position.set(0, -0.004, 0.11);
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.03, -0.09), new THREE.Vector3(0, -0.035, -0.13));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.009, 6, false), blade);
      tube.scale.set(0.45, 1, 1);
      g.add(tube);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 6), blade);
      tip.position.set(0, -0.045, -0.13);
      tip.rotation.x = Math.PI * 1.15;
      tip.scale.set(0.45, 1, 1);
      g.add(tip);
      break;
    }
    case 'balisong': {
      const b = bladeMesh([[0, -0.009], [0.12, -0.009], [0.15, 0.003], [0.12, 0.011], [0, 0.011]], 0.0035, blade);
      b.position.set(0, 0, -0.005);
      g.add(b);
      const mkHandle = (side: number) => {
        const piv = new THREE.Group();
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.024, 0.12), handle);
        h.position.set(side * 0.006, 0, 0.06);
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.0095, 0.006, 0.1), accent);
        line.position.set(side * 0.006, 0, 0.06);
        piv.add(h, line);
        g.add(piv);
        return piv;
      };
      parts.a = mkHandle(1);
      parts.b = mkHandle(-1);
      break;
    }
    case 'kunai': {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 10), handle);
      grip.rotation.x = Math.PI / 2;
      grip.position.z = 0.05;
      g.add(grip);
      for (let i = 0; i < 5; i++) box(0.024, 0.024, 0.004, accent, 0, 0, 0.012 + i * 0.02);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 8, 18), blade);
      ring.position.z = 0.118;
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
      g.add(bladeMesh([[0, -0.008], [0.05, -0.02], [0.13, 0], [0.05, 0.02], [0, 0.008]], 0.005, blade));
      break;
    }
    default: {
      // cutelo
      box(0.024, 0.026, 0.1, handle, 0, -0.004, 0.05);
      box(0.027, 0.005, 0.06, accent, 0, -0.004, 0.06);
      const b = bladeMesh([[0, -0.01], [0.13, -0.01], [0.135, 0.055], [0, 0.05]], 0.004, blade);
      b.position.set(0, 0, -0.005);
      g.add(b);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 12), new THREE.MeshBasicMaterial({ color: '#111' }));
      hole.rotation.z = Math.PI / 2;
      hole.position.set(0, 0.04, -0.11);
      g.add(hole);
    }
  }
  return { g, parts };
}

export class ViewModel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 10);
  private holder = new THREE.Group();
  private gun: THREE.Group | null = null;
  private flash: THREE.Mesh;
  private flashT = 0;
  private kick = 0;
  private swayX = 0;
  private swayY = 0;
  private bob = 0;
  private reloadT = 0;
  private reloadMs = 0;
  private adsK = 0;
  private equipT = 0;
  private equipMs = 1;
  private inspectT = 0;
  private slashT = 0;
  private slashHeavy = false;
  private slashSide = 1;
  private knifeParts: { a?: THREE.Object3D; b?: THREE.Object3D } = {};
  private knifeId = 'tactical';
  kind: VmKind = 'none';

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

  setWeapon(kind: VmKind, accentColor: string, knifeId = this.knifeId, equipMs = 0) {
    if (this.gun) {
      this.gun.remove(this.flash);
      this.holder.remove(this.gun);
      this.gun.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.kind = kind;
    this.gun = null;
    this.knifeParts = {};
    this.inspectT = 0;
    this.slashT = 0;
    this.reloadT = 0;
    this.equipMs = Math.max(1, equipMs);
    this.equipT = equipMs;
    if (kind === 'none') return;
    if (kind === 'knife') {
      this.knifeId = knifeId;
      const def = KNIVES.find((k) => k.id === knifeId) ?? KNIVES[0];
      const k = buildKnife(def);
      this.gun = k.g;
      this.knifeParts = k.parts;
      this.gun.scale.setScalar(0.9);
    } else {
      const m = kind === 'rifle' ? rifle(accentColor) : pistol(accentColor);
      this.gun = m.g;
      this.gun.scale.setScalar(kind === 'rifle' ? 1 : 1.1);
      this.flash.position.copy(m.muzzle);
      this.gun.add(this.flash);
    }
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
    this.inspectT = 0;
  }

  slash(heavy: boolean) {
    this.slashHeavy = heavy;
    this.slashT = heavy ? 520 : 320;
    this.slashSide = -this.slashSide;
    this.inspectT = 0;
  }

  inspect() {
    if (this.kind === 'none' || this.equipT > 0) return;
    this.inspectT = this.kind === 'knife' ? 2600 : 2200;
  }

  reload(ms: number) {
    this.reloadT = ms;
    this.reloadMs = ms;
    this.inspectT = 0;
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
    const bobA = Math.min(1, speedRatio) * (1 - this.adsK * 0.8) * (this.kind === 'knife' ? 1.6 : 1);
    this.flashT -= dtMs;
    this.flash.visible = this.flashT > 0;
    let reloadK = 0;
    if (this.reloadT > 0) {
      this.reloadT -= dtMs;
      const p = 1 - Math.max(0, this.reloadT) / this.reloadMs;
      reloadK = Math.sin(Math.min(1, p) * Math.PI);
    }
    let eqK = 0;
    if (this.equipT > 0) {
      this.equipT -= dtMs;
      eqK = Math.max(0, this.equipT) / this.equipMs;
      eqK *= eqK;
    }
    const swX = -this.swayX * 0.015;
    const swY = this.swayY * 0.012;
    const bobX = Math.sin(this.bob) * 0.008 * bobA;
    const bobY = -Math.abs(Math.cos(this.bob)) * 0.008 * bobA;

    if (this.kind === 'knife') {
      let px = 0.15;
      let py = -0.13;
      let pz = -0.38;
      let rx = 0.15;
      let ry = 1.05;
      let rz = 0.3;
      if (this.slashT > 0) {
        this.slashT -= dtMs;
        const dur = this.slashHeavy ? 520 : 320;
        const p = Math.min(1, 1 - Math.max(0, this.slashT) / dur);
        const swing = Math.sin(p * Math.PI);
        if (this.slashHeavy) {
          // estocada: recua e avança
          pz += p < 0.35 ? 0.06 * (p / 0.35) : -0.16 * swing;
          py += 0.04 * swing;
          rx -= 0.7 * swing;
          rz -= 0.4 * swing;
        } else {
          // corte em arco, alternando o lado
          const s = this.slashSide;
          px += -0.18 * swing * s;
          py += 0.06 * swing;
          ry += 0.9 * swing * s;
          rz += -1.4 * swing * s;
          rx -= 0.3 * swing;
        }
      }
      let spin = 0;
      if (this.inspectT > 0) {
        this.inspectT -= dtMs;
        const p = 1 - Math.max(0, this.inspectT) / 2600;
        const lift = Math.sin(Math.min(1, p) * Math.PI);
        px -= 0.06 * lift;
        py += 0.05 * lift;
        pz += 0.06 * lift;
        rx -= 0.4 * lift;
        ry -= 0.9 * lift;
        spin = p < 0.85 ? (p / 0.85) * Math.PI * (this.knifeId === 'karambit' ? 4 : 2) : 0;
      }
      if (this.knifeParts.a && this.knifeParts.b) {
        const open = this.inspectT > 0 ? Math.abs(Math.sin(spin)) : 0;
        this.knifeParts.a.rotation.y = open * Math.PI;
        this.knifeParts.b.rotation.y = -open * Math.PI;
      }
      this.holder.position.set(px + swX + bobX, py + swY + bobY - eqK * 0.25, pz);
      this.holder.rotation.set(rx + eqK * 1.2, ry - this.swayX * 0.05, rz + (this.knifeParts.a ? 0 : spin));
      return;
    }

    let inspK = 0;
    if (this.inspectT > 0) {
      this.inspectT -= dtMs;
      const p = 1 - Math.max(0, this.inspectT) / 2200;
      inspK = Math.sin(Math.min(1, p) * Math.PI);
    }
    const pistolK = this.kind === 'pistol' ? 1 : 0;
    const bx = THREE.MathUtils.lerp(0.21 - pistolK * 0.03, 0.0, this.adsK * 0.85);
    const by = THREE.MathUtils.lerp(-0.2 + pistolK * 0.03, -0.11, this.adsK);
    const bz = THREE.MathUtils.lerp(-0.5 + pistolK * 0.12, -0.4, this.adsK);
    this.holder.position.set(
      bx + swX + bobX - inspK * 0.08,
      by + swY + bobY - reloadK * 0.12 - eqK * 0.3 + inspK * 0.04,
      bz + this.kick * 0.045 + inspK * 0.08,
    );
    this.holder.rotation.set(
      this.kick * 0.07 + reloadK * 0.5 + eqK * 0.9,
      0.07 * (1 - this.adsK) - this.swayX * 0.04 - inspK * 1.0,
      reloadK * 0.6 - this.swayX * 0.03 + 0.02 * (1 - this.adsK) + inspK * 0.5,
    );
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
