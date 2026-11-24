import type { CrosshairSettings } from '../data/types';

/**
 * Mira no estilo do VALORANT: linhas internas, linhas externas, ponto central e contorno.
 * `errorPx` afasta as linhas (erro de disparo/movimento).
 */
export function renderCrosshair(el: HTMLElement, c: CrosshairSettings, errorPx = 0) {
  el.innerHTML = '';
  el.classList.add('xh');
  const outline = c.outline ? `0 0 0 1px rgba(0,0,0,${c.outlineOpacity})` : 'none';
  const mk = (x: number, y: number, w: number, h: number, op: number) => {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${c.color};opacity:${op};box-shadow:${outline}`;
    el.appendChild(d);
  };
  const lines = (L: number, t: number, g: number, op: number) => {
    if (L <= 0 || t <= 0) return;
    const half = Math.floor(t / 2);
    mk(-half, -g - L, t, L, op);
    mk(-half, g, t, L, op);
    mk(-g - L, -half, L, t, op);
    mk(g, -half, L, t, op);
  };
  const err = c.firingError ? Math.round(errorPx) : 0;
  if (c.showInner) lines(c.innerLength, c.innerThickness, c.innerGap + err, c.innerOpacity);
  if (c.showOuter) lines(c.outerLength, c.outerThickness, c.outerGap + err, c.outerOpacity);
  if (c.centerDot) {
    const s = c.dotSize;
    mk(-Math.floor(s / 2), -Math.floor(s / 2), s, s, 1);
  }
}

const VALORANT_COLORS = ['#ffffff', '#00ff00', '#7fff00', '#dfff00', '#ffff00', '#00ffff', '#ff00ff', '#ff0000'];

/**
 * Importa um código de mira do VALORANT (ex.: "0;P;c;5;h;0;0l;4;0o;2;0a;1;0f;0;1b;0").
 * Lê o perfil principal (P). Valores ausentes usam os padrões do jogo.
 */
export function parseValorantCode(code: string, base: CrosshairSettings): CrosshairSettings {
  const parts = code.trim().split(';');
  if (parts.length < 2 || parts[0] !== '0') throw new Error('Código inválido: deve começar com "0;"');
  const kv = new Map<string, string>();
  let section = '';
  for (let i = 1; i < parts.length; i++) {
    const k = parts[i];
    if (k === 'P' || k === 'A' || k === 'S') {
      section = k;
      continue;
    }
    if (section === 'P' || section === '') kv.set(k, parts[i + 1] ?? '');
    i++;
  }
  const n = (k: string, d: number) => (kv.has(k) && kv.get(k) !== '' && Number.isFinite(Number(kv.get(k))) ? Number(kv.get(k)) : d);
  const b = (k: string, d: boolean) => (kv.has(k) ? kv.get(k) === '1' : d);
  let color = VALORANT_COLORS[n('c', 0)] ?? '#ffffff';
  if (n('c', 0) === 8 && kv.get('u')) color = '#' + kv.get('u')!.slice(0, 6).toLowerCase();
  return {
    ...base,
    color,
    outline: b('h', true),
    outlineOpacity: n('o', 0.5),
    centerDot: b('d', false),
    dotSize: Math.max(1, n('z', 2)),
    showInner: b('0b', true),
    innerThickness: n('0t', 2),
    innerLength: n('0l', 6),
    innerGap: n('0o', 3),
    innerOpacity: n('0a', 0.8),
    showOuter: b('1b', true),
    outerThickness: n('1t', 2),
    outerLength: n('1l', 2),
    outerGap: n('1o', 10),
    outerOpacity: n('1a', 0.35),
    firingError: b('0f', true) || b('0m', false),
  };
}

/** Gera um código no formato do VALORANT a partir das configurações (perfil principal). */
export function toValorantCode(c: CrosshairSettings): string {
  const idx = VALORANT_COLORS.indexOf(c.color.toLowerCase());
  const parts = ['0', 'P'];
  if (idx >= 0) parts.push('c', String(idx));
  else parts.push('c', '8', 'u', c.color.replace('#', '').toUpperCase() + 'FF');
  parts.push('h', c.outline ? '1' : '0', 'o', String(c.outlineOpacity), 'd', c.centerDot ? '1' : '0', 'z', String(c.dotSize));
  parts.push('0b', c.showInner ? '1' : '0', '0t', String(c.innerThickness), '0l', String(c.innerLength), '0o', String(c.innerGap), '0a', String(c.innerOpacity), '0f', c.firingError ? '1' : '0');
  parts.push('1b', c.showOuter ? '1' : '0', '1t', String(c.outerThickness), '1l', String(c.outerLength), '1o', String(c.outerGap), '1a', String(c.outerOpacity));
  return parts.join(';');
}
