import * as THREE from 'three';
import type { Box } from './target';

/**
 * Ambientes originais.
 * - "range": campo de treino claro e estilizado (concreto, painéis, faixas de destaque, sol com sombras)
 * - "void": sala escura com grade, sem distrações (estilo aim trainer clássico)
 */
export type ArenaTheme = 'range' | 'void' | 'alley';

export interface Arena {
  group: THREE.Group;
  /** caixas sólidas do cenário (para impactos de bala) */
  solids: Box[];
  dispose(): void;
}

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat: [number, number]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(g: CanvasRenderingContext2D, s: number, amt: number, seed = 7) {
  const img = g.getImageData(0, 0, s, s);
  let x = seed;
  for (let i = 0; i < img.data.length; i += 4) {
    x = (x * 16807) % 2147483647;
    const n = (x / 2147483647 - 0.5) * amt;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function label(text: string, color: string, bg: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = color;
  g.font = 'bold 72px Bahnschrift, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildArena(scene: THREE.Scene, theme: ArenaTheme, shadows: boolean): Arena {
  if (theme === 'alley') return buildAlley(scene, shadows);
  return theme === 'void' ? buildVoid(scene) : buildRange(scene, shadows);
}

// ---------------------------------------------------------------- ALLEY (Beco)
/** Beco estreito de paredes de reboco terracota, para treinos de peek. Ambiente original. */
function buildAlley(scene: THREE.Scene, shadows: boolean): Arena {
  const group = new THREE.Group();
  const solids: Box[] = [];
  scene.background = canvasTex(256, (g, s) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, '#8fb3cf');
    gr.addColorStop(0.6, '#d9e1e4');
    gr.addColorStop(1, '#efe3cf');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }, [1, 1]);
  scene.fog = new THREE.Fog('#e6dccb', 50, 120);

  const plaster = canvasTex(512, (g, s) => {
    g.fillStyle = '#c4805a';
    g.fillRect(0, 0, s, s);
    noise(g, s, 22, 11);
    // manchas de reboco
    let x = 5;
    for (let i = 0; i < 40; i++) {
      x = (x * 16807) % 2147483647;
      const px = (x % s);
      x = (x * 16807) % 2147483647;
      const py = (x % s);
      g.fillStyle = i % 2 ? 'rgba(255,220,190,0.07)' : 'rgba(80,35,20,0.06)';
      g.beginPath();
      g.ellipse(px, py, 30 + (i % 7) * 9, 14 + (i % 5) * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, [1, 1]);
  const stone = canvasTex(512, (g, s) => {
    g.fillStyle = '#8f8a82';
    g.fillRect(0, 0, s, s);
    noise(g, s, 18, 4);
    g.strokeStyle = 'rgba(40,36,32,0.35)';
    g.lineWidth = 3;
    for (let r = 0; r < 4; r++) {
      const y = (r * s) / 4;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(s, y);
      g.stroke();
      for (let c = 0; c < 3; c++) {
        const xx = ((c + (r % 2) * 0.5) * s) / 3;
        g.beginPath();
        g.moveTo(xx, y);
        g.lineTo(xx, y + s / 4);
        g.stroke();
      }
    }
  }, [8, 30]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 120), new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -20;
  floor.receiveShadow = true;
  group.add(floor);

  const wallMat = (w: number, h: number) => {
    const t = plaster.clone();
    t.repeat.set(w / 7, h / 7);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  };
  const trim = new THREE.MeshStandardMaterial({ color: '#e4b88f', roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#3b2a22', roughness: 0.9 });
  const wood = new THREE.MeshStandardMaterial({ color: '#7a5636', roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: '#4f5660', roughness: 0.5, metalness: 0.4 });
  const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, solid = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = shadows;
    group.add(m);
    if (solid) solids.push({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });
    return m;
  };
  // paredes do beco (alturas variadas para recortar o céu)
  const segs: [number, number, number][] = [[4, -8, 7.5], [-8, -20, 9], [-20, -33, 6.5], [-33, -46, 8.5]];
  for (const [z0, z1, h] of segs) {
    block(-7, -5, 0, h, z1, z0, wallMat(Math.abs(z0 - z1), h));
    block(6, 8, 0, h + 1.2, z1, z0, wallMat(Math.abs(z0 - z1), h + 1.2));
    block(-5.15, -5, h - 0.35, h - 0.1, z1, z0, trim, false);
    block(6, 6.15, h + 0.85, h + 1.1, z1, z0, trim, false);
  }
  block(-7, 8, 0, 10, -48, -46, wallMat(15, 10)); // fundo
  block(-7, 8, 0, 8, 4, 6, wallMat(15, 8)); // atrás do jogador
  // portas em arco e janelas (recuos escuros)
  for (const [x, z, side] of [[-5, -14, 1], [6, -24, -1], [-5, -38, 1], [6, -8, -1]] as const) {
    const xx = side > 0 ? x : x - 0.02;
    block(side > 0 ? xx : xx - 0.12, side > 0 ? xx + 0.12 : xx, 0, 2.6, z - 0.9, z + 0.9, dark, false);
    block(side > 0 ? xx : xx - 0.22, side > 0 ? xx + 0.22 : xx, 2.6, 2.85, z - 1.1, z + 1.1, trim, false);
  }
  for (const [x, z, y] of [[-5, -6, 4.2], [6, -16, 5], [-5, -26, 3.8], [6, -31, 4.6], [-5, -42, 5.2]] as const) {
    block(x > 0 ? x - 0.05 : x, x > 0 ? x : x + 0.05, y, y + 1.1, z - 0.55, z + 0.55, dark, false);
    block(x > 0 ? x - 0.18 : x, x > 0 ? x : x + 0.18, y - 0.12, y, z - 0.7, z + 0.7, trim, false);
  }
  // barris e caixotes junto às paredes (decoração sólida)
  const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.1, 14);
  for (const [x, z] of [[-4.4, -4.2], [-4.4, -5.1], [5.4, -27.8], [5.4, -40]] as const) {
    const b = new THREE.Mesh(barrelGeo, wood);
    b.position.set(x, 0.55, z);
    b.castShadow = b.receiveShadow = shadows;
    group.add(b);
    solids.push({ min: { x: x - 0.4, y: 0, z: z - 0.4 }, max: { x: x + 0.4, y: 1.1, z: z + 0.4 } });
  }
  // caixas de cobertura do modo (as mesmas medidas das covers do layout 'alley', só o visual de madeira fica por conta das covers)
  // tubulação e toldo
  block(5.6, 5.8, 0, 7, -12.2, -12, metal, false);
  block(5.2, 6, 3.1, 3.2, -25.5, -22.5, new THREE.MeshStandardMaterial({ color: '#2bb5a6', roughness: 0.7 }), false);
  // torre ao fundo (silhueta)
  block(-2, 3, 10, 22, -60, -56, wallMat(5, 12), false);

  const hemi = new THREE.HemisphereLight('#e9eef3', '#8a6a52', 1.05);
  const sun = new THREE.DirectionalLight('#ffe9cc', 2.4);
  sun.position.set(18, 40, 8);
  sun.target.position.set(0, 0, -20);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -30;
    c.right = 30;
    c.top = 40;
    c.bottom = -40;
    c.near = 1;
    c.far = 120;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
  }
  group.add(hemi, sun, sun.target);
  scene.add(group);
  return { group, solids, dispose: disposer(group, scene) };
}

function disposer(group: THREE.Group, scene: THREE.Scene) {
  return () => {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        (x as THREE.MeshStandardMaterial).map?.dispose();
        x.dispose();
      }
    });
    group.removeFromParent();
    if (scene.background instanceof THREE.Texture) scene.background.dispose();
  };
}

// ---------------------------------------------------------------- RANGE
function buildRange(scene: THREE.Scene, shadows: boolean): Arena {
  const group = new THREE.Group();
  const solids: Box[] = [];
  scene.background = canvasTex(256, (g, s) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, '#6f8fb0');
    gr.addColorStop(0.55, '#b9c7d4');
    gr.addColorStop(1, '#e6e0d4');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }, [1, 1]);
  scene.fog = new THREE.Fog('#d8d6cf', 80, 190);

  const floorTex = canvasTex(512, (g, s) => {
    g.fillStyle = '#a9a398';
    g.fillRect(0, 0, s, s);
    noise(g, s, 14);
    g.strokeStyle = 'rgba(60,55,48,0.35)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, s - 2, s - 2);
    g.strokeStyle = 'rgba(60,55,48,0.12)';
    g.beginPath();
    g.moveTo(s / 2, 0);
    g.lineTo(s / 2, s);
    g.moveTo(0, s / 2);
    g.lineTo(s, s / 2);
    g.stroke();
  }, [60, 60]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const lane = new THREE.Mesh(new THREE.PlaneGeometry(36, 60), new THREE.MeshStandardMaterial({ color: '#8d877c', roughness: 0.95 }));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.004, -30);
  lane.receiveShadow = true;
  group.add(lane);
  for (const d of [5, 10, 15, 20, 25, 30, 40, 50]) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(36, 0.06), new THREE.MeshBasicMaterial({ color: d % 10 === 0 ? '#f2efe8' : '#c9c4ba' }));
    ln.rotation.x = -Math.PI / 2;
    ln.position.set(0, 0.008, -d);
    group.add(ln);
    if (d % 10 === 0) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ map: label(`${d}M`, '#1d2127', '#ece8e1') }));
      sign.position.set(-18.5, 0.6, -d);
      sign.rotation.y = Math.PI / 5;
      group.add(sign);
    }
  }

  const wallTex = canvasTex(512, (g, s) => {
    g.fillStyle = '#d9d3c7';
    g.fillRect(0, 0, s, s);
    noise(g, s, 8, 3);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, 0, 3, s);
    g.fillRect(0, s - 3, s, 3);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(3, 0, 2, s);
  }, [1, 1]);
  const mkWall = (w: number, h: number, x: number, z: number, ry: number) => {
    const t = wallTex.clone();
    t.repeat.set(w / 6, h / 6);
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
    m.position.set(x, h / 2, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    group.add(m);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.4), new THREE.MeshStandardMaterial({ color: '#3a4049', roughness: 0.7 }));
    base.position.set(x, 0.7, z);
    base.rotation.y = ry;
    base.translateZ(0.02);
    group.add(base);
    for (const [y, c] of [[1.48, '#ff4655'], [1.62, '#2bb5a6']] as const) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.08), new THREE.MeshBasicMaterial({ color: c }));
      st.position.set(x, y, z);
      st.rotation.y = ry;
      st.translateZ(0.03);
      group.add(st);
    }
  };
  mkWall(120, 16, 0, -62, 0);
  mkWall(124, 16, -60, 0, Math.PI / 2);
  mkWall(124, 16, 60, 0, -Math.PI / 2);
  mkWall(120, 16, 0, 62, Math.PI);

  const crateMat = new THREE.MeshStandardMaterial({ color: '#8a6f4e', roughness: 0.8 });
  const metalMat = new THREE.MeshStandardMaterial({ color: '#58606b', roughness: 0.55, metalness: 0.3 });
  const props: [number, number, number, number, number, number, THREE.Material][] = [
    [-24, 0, -14, 2.2, 2.2, 2.2, crateMat], [-24, 2.2, -14, 1.6, 1.6, 1.6, crateMat], [26, 0, -22, 2.4, 2.4, 2.4, crateMat],
    [-30, 0, -44, 6, 5, 2, metalMat], [32, 0, -48, 4, 7, 4, metalMat], [22, 0, -8, 1.6, 1.6, 1.6, crateMat],
  ];
  for (const [x, y, z, w, h, d, mat] of props) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    solids.push({ min: { x: x - w / 2, y, z: z - d / 2 }, max: { x: x + w / 2, y: y + h, z: z + d / 2 } });
  }
  const pad = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 5), new THREE.MeshStandardMaterial({ color: '#9a9488', roughness: 0.8 }));
  pad.position.set(0, 0.03, 0);
  pad.receiveShadow = true;
  group.add(pad);
  const padLine = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.08), new THREE.MeshBasicMaterial({ color: '#ff4655' }));
  padLine.rotation.x = -Math.PI / 2;
  padLine.position.set(0, 0.07, -2.5);
  group.add(padLine);

  const hemi = new THREE.HemisphereLight('#dfe8f2', '#8a7f6e', 1.15);
  const sun = new THREE.DirectionalLight('#fff3df', 2.1);
  sun.position.set(-25, 45, 20);
  sun.target.position.set(0, 0, -25);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -45;
    c.right = 45;
    c.top = 45;
    c.bottom = -45;
    c.near = 1;
    c.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
  }
  group.add(hemi, sun, sun.target);
  scene.add(group);
  return { group, solids, dispose: disposer(group, scene) };
}

// ---------------------------------------------------------------- VOID
function grid(size: number, cells: number, base: string, line: string, accentEvery: number, accent: string, repeat: [number, number]) {
  return canvasTex(size, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    const step = size / cells;
    for (let i = 0; i <= cells; i++) {
      const major = accentEvery && i % accentEvery === 0;
      g.strokeStyle = major ? accent : line;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(i * step + 0.5, 0);
      g.lineTo(i * step + 0.5, size);
      g.moveTo(0, i * step + 0.5);
      g.lineTo(size, i * step + 0.5);
      g.stroke();
    }
  }, repeat);
}

function buildVoid(scene: THREE.Scene): Arena {
  const group = new THREE.Group();
  scene.background = new THREE.Color('#0a0c0f');
  scene.fog = new THREE.Fog('#0a0c0f', 70, 160);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ map: grid(512, 8, '#15181c', '#1f242a', 4, '#2a3038', [30, 30]) }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const mkWall = (w: number, h: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: grid(512, 8, '#121519', '#1b1f24', 8, '#242a31', [w / 4, h / 4]) }));
    m.position.set(x, h / 2, z);
    m.rotation.y = ry;
    group.add(m);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.12), new THREE.MeshBasicMaterial({ color: '#ff4655' }));
    strip.position.set(x, 0.45, z);
    strip.rotation.y = ry;
    strip.translateZ(0.01);
    group.add(strip);
  };
  mkWall(120, 24, 0, -62, 0);
  mkWall(124, 24, -60, 0, Math.PI / 2);
  mkWall(124, 24, 60, 0, -Math.PI / 2);
  mkWall(120, 24, 0, 62, Math.PI);
  const pad = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.75, 48), new THREE.MeshBasicMaterial({ color: '#ff4655', transparent: true, opacity: 0.5 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.01;
  group.add(pad);
  const hemi = new THREE.HemisphereLight('#c9d4e0', '#1a1d22', 1.2);
  const dir = new THREE.DirectionalLight('#ffffff', 1.1);
  dir.position.set(10, 30, 15);
  group.add(hemi, dir);
  scene.add(group);
  return { group, solids: [], dispose: disposer(group, scene) };
}

/** Raio × cenário fixo (chão e paredes). Retorna distância e normal. */
export function rayEnvironment(o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }) {
  let best = Infinity;
  let n = { x: 0, y: 1, z: 0 };
  const tryPlane = (t: number, nn: { x: number; y: number; z: number }) => {
    if (t > 0.01 && t < best) {
      best = t;
      n = nn;
    }
  };
  if (d.y < 0) tryPlane(-o.y / d.y, { x: 0, y: 1, z: 0 });
  if (d.z < 0) tryPlane((-62 - o.z) / d.z, { x: 0, y: 0, z: 1 });
  if (d.z > 0) tryPlane((62 - o.z) / d.z, { x: 0, y: 0, z: -1 });
  if (d.x < 0) tryPlane((-60 - o.x) / d.x, { x: 1, y: 0, z: 0 });
  if (d.x > 0) tryPlane((60 - o.x) / d.x, { x: -1, y: 0, z: 0 });
  return { t: best, n };
}
