import { v3, type V3 } from '../core/geometry';
import type { WorldApi } from '../modes/base';
import type { Box, Target } from './target';

/** Estado lógico do mundo (sem renderização). O engine 3D observa os hooks. */
export class LogicWorld implements WorldApi {
  eye: V3 = v3(0, 1.6, 0);
  targets: Target[] = [];
  covers: Box[] = [];
  onAdd?: (t: Target) => void;
  onRemove?: (t: Target, killed: boolean) => void;
  onCovers?: (b: Box[]) => void;

  addTarget(t: Target) {
    this.targets.push(t);
    this.onAdd?.(t);
    return t;
  }
  removeTarget(t: Target, killed: boolean) {
    const i = this.targets.indexOf(t);
    if (i < 0) return;
    t.alive = false;
    this.targets.splice(i, 1);
    this.onRemove?.(t, killed);
  }
  setCovers(b: Box[]) {
    this.covers = b;
    this.onCovers?.(b);
  }
  clear() {
    for (const t of [...this.targets]) this.removeTarget(t, false);
    this.setCovers([]);
  }
}
