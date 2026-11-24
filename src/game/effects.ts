import * as THREE from 'three';

/** Efeitos de mundo: tracers, marcas de impacto, faíscas, anel de abate e queda de bots. */
interface Fx {
  obj: THREE.Object3D;
  t: number;
  life: number;
  tick(k: number, o: THREE.Object3D): void;
  done?(): void;
}

const MAX_DECALS = 80;

export class Effects {
  private list: Fx[] = [];
  private decals: THREE.Mesh[] = [];
  private decalGeo = new THREE.CircleGeometry(0.035, 10);
  private decalMat = new THREE.MeshBasicMaterial({ color: '#1b1612', transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  private ringGeo = new THREE.RingGeometry(0.8, 1, 32);
  private sparkGeo = new THREE.BufferGeometry();
  private up = new THREE.Vector3(0, 0, 1);

  constructor(private scene: THREE.Scene) {
    const pts = new Float32Array(8 * 3);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3) {
    const geom = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geom, mat);
    this.scene.add(line);
    this.list.push({
      obj: line, t: 0, life: 70,
      tick: (k) => (mat.opacity = 0.9 * (1 - k)),
      done: () => {
        geom.dispose();
        mat.dispose();
      },
    });
  }

  impact(p: THREE.Vector3, n: THREE.Vector3) {
    const d = new THREE.Mesh(this.decalGeo, this.decalMat);
    d.position.copy(p).addScaledVector(n, 0.01);
    d.quaternion.setFromUnitVectors(this.up, n);
    this.scene.add(d);
    this.decals.push(d);
    if (this.decals.length > MAX_DECALS) this.scene.remove(this.decals.shift()!);
    // faíscas
    const pos = new Float32Array(8 * 3);
    const vel: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
      pos.set([p.x, p.y, p.z], i * 3);
      vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).multiplyScalar(2.2).addScaledVector(n, 1.5));
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: '#ffd08a', size: 0.05, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geom, mat);
    this.scene.add(pts);
    let last = 0;
    this.list.push({
      obj: pts, t: 0, life: 180,
      tick: (k) => {
        const dt = (k - last) * 0.18;
        last = k;
        const a = geom.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < 8; i++) a.setXYZ(i, a.getX(i) + vel[i].x * dt, a.getY(i) + vel[i].y * dt - k * 0.01, a.getZ(i) + vel[i].z * dt);
        a.needsUpdate = true;
        mat.opacity = 1 - k;
      },
      done: () => {
        geom.dispose();
        mat.dispose();
      },
    });
  }

  killRing(p: THREE.Vector3, r: number, camera: THREE.Camera, color = '#ffffff') {
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.copy(p);
    ring.lookAt(camera.position);
    this.scene.add(ring);
    this.list.push({
      obj: ring, t: 0, life: 220,
      tick: (k, o) => {
        o.scale.setScalar(r * (1 + k * 1.8));
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      },
      done: () => (ring.material as THREE.Material).dispose(),
    });
  }

  /** queda do bot abatido: tomba para trás, afunda e some */
  death(obj: THREE.Object3D, onDone: () => void) {
    const mats: THREE.Material[] = [];
    obj.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !mats.includes(m)) {
        m.transparent = true;
        mats.push(m);
      }
      o.castShadow = false;
    });
    const y0 = obj.position.y;
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.list.push({
      obj, t: 0, life: 520,
      tick: (k, o) => {
        const e = 1 - (1 - Math.min(1, k * 1.6)) ** 2;
        o.rotation.x = -e * 1.35;
        o.rotation.z = e * 0.25 * dir;
        o.position.y = y0 - Math.max(0, k - 0.5) * 0.8;
        const op = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
        for (const m of mats) (m as THREE.MeshStandardMaterial).opacity = op;
      },
      done: onDone,
    });
    // os objetos de morte já estão na cena: não adiciona de novo
  }

  update(dtMs: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dtMs;
      const k = Math.min(1, f.t / f.life);
      f.tick(k, f.obj);
      if (k >= 1) {
        this.scene.remove(f.obj);
        f.done?.();
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const f of this.list) {
      this.scene.remove(f.obj);
      f.done?.();
    }
    this.list = [];
    for (const d of this.decals) this.scene.remove(d);
    this.decals = [];
  }
}
