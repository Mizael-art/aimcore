export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const ms = (x: number) => (x > 0 ? `${Math.round(x)} ms` : '—');
export const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR');
export const fmtDate = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
export const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(Math.floor(sec % 60)).padStart(2, '0')}s`;
}

export function $(sel: string, root: ParentNode = document) {
  return root.querySelector(sel) as HTMLElement;
}
export function $$(sel: string, root: ParentNode = document) {
  return [...root.querySelectorAll(sel)] as HTMLElement[];
}

/** Delegação de eventos de clique por atributo data-act */
export function onAct(root: HTMLElement, handlers: Record<string, (el: HTMLElement, e: Event) => void>) {
  const fn = (e: Event) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (el && root.contains(el) && handlers[el.dataset.act!]) handlers[el.dataset.act!](el, e);
  };
  root.addEventListener('click', fn);
  return () => root.removeEventListener('click', fn);
}

export function toast(title: string, text: string, ms2 = 3500) {
  let box = document.querySelector('.toasts') as HTMLElement;
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
  box.appendChild(t);
  setTimeout(() => t.remove(), ms2);
}

export function modal(html: string, onAction?: (act: string, el: HTMLElement, close: () => void) => void): () => void {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => {
    if (e.target === bg) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (el) onAction?.(el.dataset.act!, el, close);
  });
  return close;
}

export const icon = (name: string) => {
  const p: Record<string, string> = {
    dash: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="1.5"/>',
    lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
    stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    routine: '<rect x="3" y="4" width="18" height="17" rx="1"/><path d="M3 9h18M8 2v4M16 2v4M8 14l2 2 4-4"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p[name] ?? ''}</svg>`;
};
