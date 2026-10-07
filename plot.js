let T = {};
const themeListeners = [];

function readTheme() {
    const s = getComputedStyle(document.documentElement);
    const g = n => s.getPropertyValue(n).trim();
    T = {
        text: g('--text'), dim: g('--text-dim'), grid: g('--grid'),
        axis: g('--axis'), panel: g('--panel'), font: g('--sans') 
    };
}
readTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  readTheme();
  themeListeners.forEach(fn => fn());
});

export const theme = () => T;
export const onThemeChange = fn => themeListeners.push(fn);

// Canvas can't use CSS variables, so resolve 'var(--x)' to its value.
export function cssColor(c) {
  return c.startsWith('var(')
    ? getComputedStyle(document.documentElement).getPropertyValue(c.slice(4, -1)).trim()
    : c;
}

// Keep drawing in the canvas's logical width/height; the backing store is scaled for crisp text.
export function initCanvas(canvas) {
  const W = canvas.width, H = canvas.height, dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas, ctx, W, H };
}

export function niceScale(lo, hi, target = 6) {
  const span = Math.max(hi - lo, 1e-9);
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

// Draws grid, tick labels, axis titles and a plot title. Returns coordinate mappers.
// o: { title, xLabel, yLabel, xMin, xMax, logX, xTicks, xFmt, yMin, yMax, yTicks, yFmt, zeroLine }
export function drawAxes(c, o) {
  const { ctx, W, H } = c;
  const m = { l: 58, r: 16, t: 30, b: 40 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;

  let { yMin, yMax } = o, yTicks = o.yTicks;
  if (!yTicks) {
    const s = niceScale(yMin, yMax);
    yMin = s.lo; yMax = s.hi; yTicks = [];
    for (let v = s.lo; v <= s.hi + s.step * 1e-6; v += s.step) yTicks.push(+v.toFixed(6));
  }
  const lg = Math.log10;
  const x = o.logX
    ? f => m.l + ((lg(f) - lg(o.xMin)) / (lg(o.xMax) - lg(o.xMin))) * pw
    : v => m.l + ((v - o.xMin) / (o.xMax - o.xMin)) * pw;
  const y = v => m.t + ph - ((v - yMin) / (yMax - yMin)) * ph;
  const yFmt = o.yFmt ?? (v => String(+v.toFixed(3)));
  const xFmt = o.xFmt ?? (v => String(v));

  ctx.clearRect(0, 0, W, H);
  ctx.lineWidth = 1;
  ctx.font = `11px ${T.font}`;

  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  yTicks.forEach(v => {
    const py = Math.round(y(v)) + 0.5;
    ctx.strokeStyle = o.zeroLine && Math.abs(v) < 1e-9 ? T.axis : T.grid;
    ctx.beginPath(); ctx.moveTo(m.l, py); ctx.lineTo(m.l + pw, py); ctx.stroke();
    ctx.fillStyle = T.dim; ctx.fillText(yFmt(v), m.l - 8, py);
  });
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  o.xTicks.forEach(v => {
    const px = Math.round(x(v)) + 0.5;
    ctx.strokeStyle = T.grid;
    ctx.beginPath(); ctx.moveTo(px, m.t); ctx.lineTo(px, m.t + ph); ctx.stroke();
    ctx.fillStyle = T.dim; ctx.fillText(xFmt(v), px, m.t + ph + 6);
  });
  ctx.strokeStyle = T.axis;
  ctx.strokeRect(m.l + 0.5, m.t + 0.5, pw, ph);

  ctx.fillStyle = T.text;
  ctx.font = `600 11px ${T.font}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(o.xLabel, m.l + pw / 2, H - 6);
  ctx.save();
  ctx.translate(13, m.t + ph / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(o.yLabel, 0, 0);
  ctx.restore();
  if (o.title) {
    ctx.font = `600 12px ${T.font}`;
    ctx.textAlign = 'left';
    ctx.fillText(o.title, m.l, 16);
  }
  return { x, y, yMin, yMax, box: { l: m.l, t: m.t, w: pw, h: ph } };
}

// breakAbove: lift the pen when consecutive values jump by more than this (phase wraps).
export function drawCurve(c, ax, xs, ys, color, { width = 1.75, breakAbove = Infinity } = {}) {
  const { ctx } = c, { l, t, w, h } = ax.box;
  ctx.save();
  ctx.beginPath(); ctx.rect(l, t, w, h); ctx.clip();
  ctx.strokeStyle = cssColor(color);
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) {
    const px = ax.x(xs[i]), py = ax.y(ys[i]);
    if (i === 0 || Math.abs(ys[i] - ys[i - 1]) > breakAbove) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

// Right-aligned legend in the title row.
export function drawLegend(c, ax, items) {
  const { ctx } = c;
  ctx.font = `11px ${T.font}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  let xr = ax.box.l + ax.box.w;
  [...items].reverse().forEach(({ label, color }) => {
    xr -= ctx.measureText(label).width;
    ctx.fillStyle = T.text; ctx.fillText(label, xr, 14);
    xr -= 20;
    ctx.strokeStyle = cssColor(color); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xr, 14); ctx.lineTo(xr + 14, 14); ctx.stroke();
    xr -= 14;
  });
}