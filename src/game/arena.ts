import * as THREE from 'three';

/** Ambiente original: sala de treino escura com grade, faixas vermelhas e marcadores de distância. */
function gridTexture(size: number, cells: number, base: string, line: string, accentEvery = 0, accent = '') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
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
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildArena(scene: THREE.Scene) {
  const group = new THREE.Group();
  scene.background = new THREE.Color('#0a0c0f');
  scene.fog = new THREE.Fog('#0a0c0f', 70, 160);

  const floorTex = gridTexture(512, 8, '#15181c', '#1f242a', 4, '#2a3038');
  floorTex.repeat.set(30, 30);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const wallTex = gridTexture(512, 8, '#121519', '#1b1f24', 8, '#242a31');
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
  const mkWall = (w: number, h: number, x: number, z: number, ry: number) => {
    const t = wallTex.clone();
    t.repeat.set(w / 4, h / 4);
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat.clone());
    (m.material as THREE.MeshLambertMaterial).map = t;
    m.position.set(x, h / 2, z);
    m.rotation.y = ry;
    group.add(m);
    // faixa vermelha de destaque
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

  // marcadores de distância no chão (10, 20, 30, 40, 50 m)
  for (const d of [10, 20, 30, 40, 50]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.05), new THREE.MeshBasicMaterial({ color: d % 20 === 0 ? '#3a1f24' : '#2a2e35' }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.005, -d);
    group.add(line);
  }

  // plataforma do jogador
  const pad = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.75, 48), new THREE.MeshBasicMaterial({ color: '#ff4655', transparent: true, opacity: 0.5 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.01;
  group.add(pad);

  const hemi = new THREE.HemisphereLight('#c9d4e0', '#1a1d22', 1.2);
  const dir = new THREE.DirectionalLight('#ffffff', 1.1);
  dir.position.set(10, 30, 15);
  group.add(hemi, dir);
  scene.add(group);
  return group;
}
