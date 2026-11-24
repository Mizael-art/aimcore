import type { CrosshairSettings } from '../data/types';

/** Desenha uma mira estilo VALORANT (linhas internas + ponto + contorno) em um elemento. */
export function renderCrosshair(el: HTMLElement, c: CrosshairSettings) {
  el.innerHTML = '';
  el.classList.add('xh');
  const outline = c.outline ? `0 0 0 1px rgba(0,0,0,${c.outlineOpacity})` : 'none';
  const mk = (x: number, y: number, w: number, h: number, op: number) => {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${c.color};opacity:${op};box-shadow:${outline}`;
    el.appendChild(d);
  };
  const t = c.innerThickness;
  const L = c.innerLength;
  const g = c.innerGap;
  const half = Math.floor(t / 2);
  if (c.showInner && L > 0 && t > 0) {
    mk(-half, -g - L, t, L, c.innerOpacity); // cima
    mk(-half, g, t, L, c.innerOpacity); // baixo
    mk(-g - L, -half, L, t, c.innerOpacity); // esquerda
    mk(g, -half, L, t, c.innerOpacity); // direita
  }
  if (c.centerDot) {
    const s = c.dotSize;
    mk(-Math.floor(s / 2), -Math.floor(s / 2), s, s, 1);
  }
}
