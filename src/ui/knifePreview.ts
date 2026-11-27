import * as THREE from 'three';
import { KNIVES, buildKnife } from '../game/viewmodel';

/**
 * Prévia 3D giratória das facas usando UM renderer WebGL compartilhado
 * (cada quadro é copiado para o canvas 2D de cada card).
 */
export function startKnifePreviews(canvases: HTMLCanvasElement[]): () => void {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return () => {};
  }
  const W = 240;
  const H = 140;
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#f2f5f8', '#3a3530', 2.2));
  const d = new THREE.DirectionalLight('#ffffff', 2.6);
  d.position.set(1, 2, 2);
  scene.add(d);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 10);
  cam.position.set(0, 0.0, 0.34);
  const models = KNIVES.map((k) => {
    const m = buildKnife(k).g;
    // deita a faca na horizontal, centralizada
    const pivot = new THREE.Group();
    m.rotation.y = Math.PI / 2;
    m.position.x = 0.0;
    pivot.add(m);
    const box = new THREE.Box3().setFromObject(pivot);
    const c = box.getCenter(new THREE.Vector3());
    m.position.sub(c);
    return pivot;
  });
  let raf = 0;
  let t0 = performance.now();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const t = (now - t0) / 1000;
    models.forEach((m, i) => {
      const cv = canvases[i];
      if (!cv) return;
      scene.add(m);
      m.rotation.set(0.35 + Math.sin(t * 0.8 + i) * 0.1, t * 0.9 + i, 0.15);
      renderer.render(scene, cam);
      scene.remove(m);
      const g = cv.getContext('2d');
      if (!g) return;
      if (cv.width !== W) {
        cv.width = W;
        cv.height = H;
      }
      g.clearRect(0, 0, W, H);
      g.drawImage(renderer.domElement, 0, 0);
    });
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    t0 = 0;
    models.forEach((m) => m.traverse((o) => (o as THREE.Mesh).geometry?.dispose()));
    renderer.dispose();
  };
}
