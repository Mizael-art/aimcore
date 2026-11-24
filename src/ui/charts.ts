/** Gráficos leves em canvas (sem dependências), nítidos em telas HiDPI. */

export interface Series {
  name: string;
  values: (number | null)[];
  color: string;
  dashed?: boolean;
  fill?: boolean;
}

interface Opts {
  labels: string[];
  yFmt?: (v: number) => string;
  yMin?: number;
  yMax?: number;
  highlight?: number; // índice destacado
  bands?: { from: number; to: number; color: string }[]; // faixas no eixo X (índices)
  errors?: number[]; // barras de erro (±) para a 1ª série
}

const C = { grid: '#242a32', text: '#8b939e', textDim: '#5d6570' };

function setup(canvas: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || 220;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.font = '11px Bahnschrift, "Segoe UI", system-ui, sans-serif';
  return { g, w, h };
}

function niceRange(min: number, max: number) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const m = [1, 2, 2.5, 5, 10].find((k) => span / (k * step) <= 5) ?? 10;
  const st = m * step;
  return { min: Math.floor(min / st) * st, max: Math.ceil(max / st) * st, step: st };
}

function axes(g: CanvasRenderingContext2D, w: number, h: number, o: Opts, lo: number, hi: number, pad: { l: number; r: number; t: number; b: number }) {
  const r = niceRange(lo, hi);
  const fmt = o.yFmt ?? ((v: number) => String(Math.round(v * 100) / 100));
  g.strokeStyle = C.grid;
  g.lineWidth = 1;
  g.fillStyle = C.text;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  const ys = (v: number) => pad.t + (1 - (v - r.min) / (r.max - r.min)) * (h - pad.t - pad.b);
  for (let v = r.min; v <= r.max + 1e-9; v += r.step) {
    const y = Math.round(ys(v)) + 0.5;
    g.beginPath();
    g.moveTo(pad.l, y);
    g.lineTo(w - pad.r, y);
    g.stroke();
    g.fillText(fmt(v), pad.l - 8, y);
  }
  return { ys, r };
}

export function lineChart(canvas: HTMLCanvasElement, series: Series[], o: Opts) {
  const { g, w, h } = setup(canvas);
  const pad = { l: 48, r: 14, t: 14, b: 26 };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (!all.length) {
    g.fillStyle = C.textDim;
    g.textAlign = 'center';
    g.fillText('Sem dados suficientes ainda', w / 2, h / 2);
    return;
  }
  const errs = o.errors ?? [];
  let lo = o.yMin ?? Math.min(...all.map((v, i) => v - (errs[i] ?? 0)));
  let hi = o.yMax ?? Math.max(...all.map((v, i) => v + (errs[i] ?? 0)));
  if (o.yMin == null) lo -= (hi - lo) * 0.08;
  if (o.yMax == null) hi += (hi - lo) * 0.08;
  const { ys } = axes(g, w, h, o, lo, hi, pad);
  const n = o.labels.length;
  const xs = (i: number) => (n <= 1 ? (pad.l + w - pad.r) / 2 : pad.l + (i / (n - 1)) * (w - pad.l - pad.r));
  // faixas
  for (const b of o.bands ?? []) {
    g.fillStyle = b.color;
    const x1 = xs(b.from) - (n > 1 ? (w - pad.l - pad.r) / (n - 1) / 2 : 20);
    const x2 = xs(b.to) + (n > 1 ? (w - pad.l - pad.r) / (n - 1) / 2 : 20);
    g.fillRect(Math.max(pad.l, x1), pad.t, Math.min(w - pad.r, x2) - Math.max(pad.l, x1), h - pad.t - pad.b);
  }
  // rótulos X (até ~10)
  g.fillStyle = C.text;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  const every = Math.max(1, Math.ceil(n / 10));
  o.labels.forEach((l, i) => {
    if (i % every === 0 || i === n - 1) {
      g.fillStyle = i === o.highlight ? '#ff4655' : C.text;
      g.fillText(l, xs(i), h - pad.b + 8);
    }
  });
  series.forEach((s, si) => {
    g.strokeStyle = s.color;
    g.lineWidth = 2;
    g.setLineDash(s.dashed ? [5, 4] : []);
    // erro
    if (si === 0 && errs.length) {
      g.lineWidth = 1;
      s.values.forEach((v, i) => {
        if (v == null || !errs[i]) return;
        const x = xs(i);
        g.beginPath();
        g.moveTo(x, ys(v - errs[i]));
        g.lineTo(x, ys(v + errs[i]));
        g.moveTo(x - 4, ys(v - errs[i]));
        g.lineTo(x + 4, ys(v - errs[i]));
        g.moveTo(x - 4, ys(v + errs[i]));
        g.lineTo(x + 4, ys(v + errs[i]));
        g.stroke();
      });
      g.lineWidth = 2;
    }
    g.beginPath();
    let started = false;
    s.values.forEach((v, i) => {
      if (v == null) return;
      if (!started) g.moveTo(xs(i), ys(v));
      else g.lineTo(xs(i), ys(v));
      started = true;
    });
    g.stroke();
    if (s.fill) {
      const grad = g.createLinearGradient(0, pad.t, 0, h - pad.b);
      grad.addColorStop(0, s.color + '33');
      grad.addColorStop(1, s.color + '00');
      g.lineTo(xs(s.values.length - 1), h - pad.b);
      g.lineTo(xs(s.values.findIndex((v) => v != null)), h - pad.b);
      g.fillStyle = grad;
      g.fill();
    }
    g.setLineDash([]);
    s.values.forEach((v, i) => {
      if (v == null) return;
      g.fillStyle = i === o.highlight ? '#fff' : s.color;
      g.beginPath();
      g.arc(xs(i), ys(v), i === o.highlight ? 4.5 : 2.8, 0, Math.PI * 2);
      g.fill();
    });
  });
  // legenda
  if (series.length > 1) {
    let x = pad.l + 4;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (const s of series) {
      g.fillStyle = s.color;
      g.fillRect(x, pad.t + 2, 10, 3);
      g.fillStyle = C.text;
      g.fillText(s.name, x + 14, pad.t + 4);
      x += g.measureText(s.name).width + 32;
    }
  }
}

export function barChart(canvas: HTMLCanvasElement, values: number[], o: Opts & { color?: string; colors?: string[] }) {
  const { g, w, h } = setup(canvas);
  const pad = { l: 48, r: 14, t: 14, b: 26 };
  if (!values.length) {
    g.fillStyle = C.textDim;
    g.textAlign = 'center';
    g.fillText('Sem dados suficientes ainda', w / 2, h / 2);
    return;
  }
  const lo = o.yMin ?? 0;
  const hi = o.yMax ?? (Math.max(...values) * 1.1 || 1);
  const { ys } = axes(g, w, h, o, lo, hi, pad);
  const n = values.length;
  const slot = (w - pad.l - pad.r) / n;
  const bw = Math.min(46, slot * 0.62);
  values.forEach((v, i) => {
    const x = pad.l + slot * i + (slot - bw) / 2;
    g.fillStyle = o.colors?.[i] ?? o.color ?? '#ff4655';
    const y = ys(Math.max(lo, v));
    g.fillRect(x, y, bw, h - pad.b - y);
  });
  g.fillStyle = C.text;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  const every = Math.max(1, Math.ceil(n / 12));
  o.labels.forEach((l, i) => {
    if (i % every === 0) g.fillText(l, pad.l + slot * i + slot / 2, h - pad.b + 8);
  });
}
