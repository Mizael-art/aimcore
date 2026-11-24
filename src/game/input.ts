/**
 * Entrada de mouse relativa (Pointer Lock). Nunca usa a posição absoluta do cursor:
 * apenas movementX/movementY, aplicados imediatamente a cada evento (menor latência).
 */
export interface InputHandlers {
  onMove(dx: number, dy: number, t: number): void;
  onDown(button: number, t: number): void;
  onUp(button: number, t: number): void;
  onLockChange(locked: boolean): void;
}

export class MouseInput {
  locked = false;
  rawActive = false;
  private moveEvent: 'pointerrawupdate' | 'mousemove' = 'mousemove';
  private events = 0;
  private eventWindowStart = performance.now();
  /** taxa de eventos de movimento recebidos (Hz) — limitada pelo navegador */
  eventRate = 0;
  lastLockError = '';

  constructor(
    private el: HTMLElement,
    private h: InputHandlers,
    private opts: { raw: boolean; lowLatency: boolean },
  ) {
    this.moveEvent = opts.lowLatency && 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'mousemove';
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    document.addEventListener(this.moveEvent, this.onMove as EventListener, { passive: true });
    document.addEventListener('mousedown', this.onDown);
    document.addEventListener('mouseup', this.onUp);
    document.addEventListener('contextmenu', this.onContext);
  }

  async lock(): Promise<boolean> {
    this.lastLockError = '';
    const el = this.el as HTMLElement & { requestPointerLock(o?: unknown): Promise<void> | void };
    try {
      if (this.opts.raw) {
        try {
          const r = el.requestPointerLock({ unadjustedMovement: true });
          if (r && typeof (r as Promise<void>).then === 'function') {
            await r;
            this.rawActive = true; // Chromium: entrada bruta (sem aceleração do SO)
            return true;
          }
          // navegadores que não retornam Promise ignoram a opção (sem garantia de raw)
          this.rawActive = false;
          return true;
        } catch {
          // navegador sem suporte a entrada bruta: cai para o modo padrão
        }
      }
      this.rawActive = false;
      await el.requestPointerLock();
      return true;
    } catch (e) {
      this.lastLockError = String((e as Error)?.message || e);
      return false;
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.el;
    this.h.onLockChange(this.locked);
  };
  private onLockError = () => {
    this.lastLockError = 'Pointer Lock recusado pelo navegador';
    this.h.onLockChange(false);
  };

  private onMove = (e: PointerEvent | MouseEvent) => {
    if (!this.locked) return;
    const dx = e.movementX;
    const dy = e.movementY;
    if (dx === 0 && dy === 0) return;
    // filtra saltos espúrios conhecidos de alguns navegadores ao travar o ponteiro
    if (Math.abs(dx) > 3000 || Math.abs(dy) > 3000) return;
    this.events++;
    const now = performance.now();
    if (now - this.eventWindowStart >= 500) {
      this.eventRate = (this.events * 1000) / (now - this.eventWindowStart);
      this.events = 0;
      this.eventWindowStart = now;
    }
    this.h.onMove(dx, dy, now);
  };
  private onDown = (e: MouseEvent) => {
    if (!this.locked) return;
    e.preventDefault();
    // timeStamp do evento (mesmo relógio de performance.now) = instante real do clique
    const t = e.timeStamp > 0 && e.timeStamp <= performance.now() ? e.timeStamp : performance.now();
    this.h.onDown(e.button, t);
  };
  private onUp = (e: MouseEvent) => {
    if (!this.locked) return;
    this.h.onUp(e.button, performance.now());
  };
  private onContext = (e: Event) => {
    if (this.locked) e.preventDefault();
  };

  dispose() {
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    document.removeEventListener(this.moveEvent, this.onMove as EventListener);
    document.removeEventListener('mousedown', this.onDown);
    document.removeEventListener('mouseup', this.onUp);
    document.removeEventListener('contextmenu', this.onContext);
    this.unlock();
  }
}
