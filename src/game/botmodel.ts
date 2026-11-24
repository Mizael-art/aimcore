import * as THREE from 'three';
import { HUMANOID } from './target';

/**
 * Bot de treino original (silhueta de agente): pernas, tronco blindado, braços, pescoço
 * e cabeça na cor dos alvos com visor. As proporções seguem as hitboxes de HUMANOID.
 */
const geo = {
  leg: new THREE.CapsuleGeometry(0.085, 0.62, 4, 10),
  hip: new THREE.BoxGeometry(0.36, 0.18, 0.22),
  torso: new THREE.BoxGeometry(0.44, 0.5, 0.25),
  chest: new THREE.BoxGeometry(0.36, 0.22, 0.05),
  shoulder: new THREE.SphereGeometry(0.085, 12, 8),
  arm: new THREE.CapsuleGeometry(0.06, 0.42, 4, 8),
  neck: new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10),
  head: new THREE.SphereGeometry(1, 24, 16),
  visor: new THREE.BoxGeometry(1.1, 0.32, 0.6),
  strip: new THREE.BoxGeometry(0.03, 0.42, 0.01),
};

export interface BotMesh {
  group: THREE.Group;
  head: THREE.MeshStandardMaterial;
  body: THREE.MeshStandardMaterial;
  mats: THREE.Material[];
}

export function createBot(color: THREE.ColorRepresentation, shadows: boolean): BotMesh {
  const body = new THREE.MeshStandardMaterial({ color: '#39414d', roughness: 0.65, metalness: 0.15 });
  const plate = new THREE.MeshStandardMaterial({ color: '#59636f', roughness: 0.5, metalness: 0.25 });
  const accent = new THREE.MeshBasicMaterial({ color });
  const head = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: new THREE.Color(color).multiplyScalar(0.25) });
  const visor = new THREE.MeshStandardMaterial({ color: '#111418', roughness: 0.2, metalness: 0.6 });
  const g = new THREE.Group();
  const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rz = 0) => {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    m.castShadow = shadows;
    g.add(m);
    return m;
  };
  add(geo.leg, body, -0.1, 0.4, 0);
  add(geo.leg, body, 0.1, 0.4, 0);
  add(geo.hip, plate, 0, 0.82, 0);
  add(geo.torso, body, 0, 1.14, 0);
  add(geo.chest, plate, 0, 1.2, 0.14);
  add(geo.strip, accent, 0, 1.12, 0.17);
  add(geo.shoulder, plate, -0.27, 1.34, 0);
  add(geo.shoulder, plate, 0.27, 1.34, 0);
  add(geo.arm, body, -0.3, 1.05, 0.02, 0.08);
  add(geo.arm, body, 0.3, 1.05, 0.02, -0.08);
  add(geo.neck, body, 0, 1.44, 0);
  const h = add(geo.head, head, 0, HUMANOID.headY, 0);
  h.scale.setScalar(HUMANOID.headR);
  const v = add(geo.visor, visor, 0, HUMANOID.headY + 0.01, HUMANOID.headR * 0.8);
  v.scale.setScalar(HUMANOID.headR);
  return { group: g, head, body, mats: [body, plate, accent, head, visor] };
}
