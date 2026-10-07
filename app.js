import { stages } from './stages.js';
import { reflectorFc, cavityFH, canalModes, pinnaNotch1, pinnaR } from './physics.js';
import { middleEarResponse, middleEarParams, cMag, cPhaseDeg } from './middle_ear.js';
import { buildHRIR, itdSeconds, defaultEarParams } from './hrtf.js';
import { initCanvas, drawAxes, drawCurve, drawLegend, onThemeChange, theme, cssColor } from './plot.js';

// ---------- change notifications (the audio modules subscribe to these) ----------
const listeners = { model: new Set(), binaural: new Set() };
const emit = k => { 
  // console.log('emit', k, 'listeners:', listeners[k].size);
  listeners[k].forEach(fn => fn());
}
export const onModelChange = fn => listeners.model.add(fn);
export const onBinauralChange = fn => listeners.binaural.add(fn);

// ---------- state ----------
const state = {};
stages.forEach(s => { state[s.id] = {}; s.params.forEach(p => state[s.id][p.key] = p.value); });

const xMin = 20, xMax = 20000;
const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const hzTick = f => (f >= 1000 ? `${f / 1000}k` : `${f}`);
const fmtHz = f => (f >= 1000 ? `${+(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`);

const fvec = [];
for (let i = 0; i <= 400; i++) fvec.push(20 * Math.pow(1000, i / 400));

const middleEarRefDB = 20 * Math.log10(cMag(middleEarResponse(1000, middleEarParams).H));

function totalDB(f) {
  return stages.reduce((sum, s) => sum + s.computeDB(f, state[s.id]), 0);
}
function combinedDB(f) {
  const middleDB = 20 * Math.log10(cMag(middleEarResponse(f, middleEarParams).H)) - middleEarRefDB;
  return totalDB(f) + middleDB;
}

// ---------- main magnitude plot ----------
const mainC = initCanvas(document.getElementById('plot'));
let axMain = null, hoverF = null, lockedY = null, lastY = null;

const curves = [
  ...stages.map(s => ({ id: s.id, label: s.label, color: s.color, fn: f => s.computeDB(f, state[s.id]) })),
  { id: 'outerTotal', label: 'Outer (total)', color: 'var(--text)', fn: totalDB },
  { id: 'middleEar', label: 'Middle ear', color: '#a66bd1',
    fn: f => 20 * Math.log10(cMag(middleEarResponse(f, middleEarParams).H)) },
  { id: 'combined', label: 'Combined', color: '#e5533d', fn: combinedDB },
];
const visible = {};
curves.forEach(c => { visible[c.id] = true; });

function updateReadout() {
  const c = state.cavity, k = state.canal, p = state.pinna;
  const modes = canalModes(k.L);
  const r = pinnaR(p.az, p.el, p.rmax);
  document.getElementById('readout').textContent =
    `Reflector corner: ${reflectorFc(state.reflector.a).toFixed(0)} Hz | ` +
    `Cavity: ${cavityFH(c.V, c.ar, c.nl).toFixed(0)} Hz | ` +
    `Canal f1: ${modes[0].toFixed(0)} Hz, f3: ${modes[2].toFixed(0)} Hz | ` +
    `Pinna notch1: ${r > 1e-5 ? pinnaNotch1(r).toFixed(0) + ' Hz' : '-'}`;
}

function drawHover(ax, active, f) {
  const { ctx } = mainC, th = theme();
  const px = ax.x(f);
  ctx.save();
  ctx.strokeStyle = th.dim; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(px, ax.box.t); ctx.lineTo(px, ax.box.t + ax.box.h); ctx.stroke();
  ctx.setLineDash([]);

  const lh = 16, w = 168, h = (active.length + 1) * lh + 8;
  let bx = px + 12;
  if (bx + w > ax.box.l + ax.box.w) bx = px - 12 - w;
  const by = ax.box.t + 6;
  ctx.globalAlpha = 0.94; ctx.fillStyle = th.panel; ctx.fillRect(bx, by, w, h);
  ctx.globalAlpha = 1; ctx.strokeStyle = th.grid; ctx.strokeRect(bx + 0.5, by + 0.5, w, h);

  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = `600 11px ${th.font}`; ctx.fillStyle = th.text;
  ctx.fillText(fmtHz(f), bx + 8, by + 4 + lh / 2);
  ctx.font = `11px ${th.font}`;
  active.forEach((cv, i) => {
    const yy = by + 4 + lh * (i + 1) + lh / 2, v = cv.fn(f);
    ctx.fillStyle = cssColor(cv.color); ctx.fillRect(bx + 8, yy - 3, 8, 6);
    ctx.fillStyle = th.text; ctx.textAlign = 'left'; ctx.fillText(cv.label, bx + 22, yy);
    ctx.textAlign = 'right'; ctx.fillText(`${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`, bx + w - 8, yy);
  });
  ctx.restore();
}

function redraw() {
  const active = curves.filter(c => visible[c.id]);
  const data = active.map(c => ({ c, ys: fvec.map(c.fn) }));   // each curve evaluated once

  let lo = Infinity, hi = -Infinity;
  data.forEach(({ ys }) => ys.forEach(v => { if (v < lo) lo = v; if (v > hi) hi = v; }));
  if (lockedY) { lo = lockedY.lo; hi = lockedY.hi; }
  else if (!isFinite(lo)) { lo = -20; hi = 40; }
  else { const pad = (hi - lo) * 0.08 || 5; lo -= pad; hi += pad; }

  axMain = drawAxes(mainC, {
    title: 'Magnitude response',
    xLabel: 'Frequency (Hz)', yLabel: 'Gain (dB)',
    xMin, xMax, logX: true, xTicks: FREQ_TICKS, xFmt: hzTick,
    yMin: lo, yMax: hi, zeroLine: true,
  });
  lastY = { lo: axMain.yMin, hi: axMain.yMax };

  data.forEach(({ c, ys }) => {
    const bold = c.id === 'combined' || c.id === 'outerTotal';
    drawCurve(mainC, axMain, fvec, ys, c.color, { width: bold ? 2.5 : 1.5 });
  });
  if (hoverF) drawHover(axMain, active, hoverF);
  updateReadout();
}

mainC.canvas.addEventListener('mousemove', e => {
  if (!axMain) return;
  const r = mainC.canvas.getBoundingClientRect();
  const px = ((e.clientX - r.left) / r.width) * mainC.W;
  const { l, w } = axMain.box;
  hoverF = px >= l && px <= l + w
    ? Math.pow(10, Math.log10(xMin) + ((px - l) / w) * (Math.log10(xMax) - Math.log10(xMin)))
    : null;
  redraw();
});
mainC.canvas.addEventListener('mouseleave', () => { hoverF = null; redraw(); });

// ---------- toggles ----------
const toggleBar = document.getElementById('toggles');
curves.forEach(c => {
  const label = document.createElement('label');
  label.style.color = c.color;
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = true;
  cb.onchange = () => { visible[c.id] = cb.checked; redraw(); };
  label.append(cb, ' ' + c.label);
  toggleBar.appendChild(label);
});
const lock = document.createElement('label');
lock.className = 'lock';
const lockCb = document.createElement('input');
lockCb.type = 'checkbox';
lockCb.onchange = () => { lockedY = lockCb.checked ? lastY : null; redraw(); };
lock.append(lockCb, ' Lock Y-axis');
toggleBar.appendChild(lock);

// ---------- slider panel (auto-built from stages) ----------
const decimals = s => (String(s).split('.')[1] || '').length;
const panel = document.getElementById('controls');
stages.forEach(s => {
  const group = document.createElement('fieldset');
  group.innerHTML = `<legend style="color:${s.color}">${s.label}</legend>`;
  s.params.forEach(p => {
    const dp = decimals(p.step);
    const row = document.createElement('label');
    row.innerHTML = `${p.label} <span id="${s.id}-${p.key}-val">${p.value.toFixed(dp)}</span>`;
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: p.min, max: p.max, step: p.step, value: p.value });
    input.title = 'Double-click to reset';
    input.oninput = () => {
      state[s.id][p.key] = parseFloat(input.value);
      document.getElementById(`${s.id}-${p.key}-val`).textContent = Number(input.value).toFixed(dp);
      redraw();
      emit('model');
    };
    input.ondblclick = () => { input.value = p.value; input.oninput(); };
    row.appendChild(document.createElement('br'));
    row.appendChild(input);
    group.appendChild(row);
  });
  panel.appendChild(group);
});

// ---------- middle ear detail plots ----------
const zC = initCanvas(document.getElementById('zplot'));
const phaseC = initCanvas(document.getElementById('phaseplot'));
const meResp = fvec.map(f => middleEarResponse(f, middleEarParams));   // params are constant: compute once
const meZ = meResp.map(r => 20 * Math.log10(cMag(r.zInput)));
const mePhase = meResp.map(r => cPhaseDeg(r.H));

function plotMiddleEar() {
  const base = { xLabel: 'Frequency (Hz)', xMin, xMax, logX: true, xTicks: FREQ_TICKS, xFmt: hzTick };
  const a1 = drawAxes(zC, { ...base, title: 'Middle-ear input impedance',
    yLabel: '|Z_in| (dB re 1 \u03A9)', yMin: Math.min(...meZ), yMax: Math.max(...meZ) });
  drawCurve(zC, a1, fvec, meZ, '#a66bd1', { width: 2 });

  const a2 = drawAxes(phaseC, { ...base, title: 'Middle-ear transmission phase',
    yLabel: 'Phase (\u00B0)', yMin: -180, yMax: 180,
    yTicks: [-180, -90, 0, 90, 180], yFmt: v => `${v}\u00B0`, zeroLine: true });
  drawCurve(phaseC, a2, fvec, mePhase, '#a66bd1', { width: 2, breakAbove: 180 });
}

// ---------- binaural plots ----------
const binauralState = { az: 30, el: 0 };
const N_HRTF = 1024, fs_HRTF = 44100;
const hrtfC = initCanvas(document.getElementById('hrtfPlot'));
const ildC = initCanvas(document.getElementById('ildPlot'));
const hrirC = initCanvas(document.getElementById('hrirPlot'));

const hrtfFreqs = Array.from({ length: N_HRTF / 2 + 1 }, (_, k) => (k / N_HRTF) * fs_HRTF).slice(1);
const L_COL = '#3b8fd6', R_COL = '#e0533d';

function plotBinaural() {
  const { hL, hR, HL, HR } = buildHRIR(binauralState.az, binauralState.el, defaultEarParams, N_HRTF, fs_HRTF);
  const magsL = hrtfFreqs.map((f, i) => 20 * Math.log10(cMag(HL[i + 1])));
  const magsR = hrtfFreqs.map((f, i) => 20 * Math.log10(cMag(HR[i + 1])));
  const ild = magsL.map((v, i) => v - magsR[i]);
  const all = [...magsL, ...magsR];
  const base = { xLabel: 'Frequency (Hz)', xMin, xMax, logX: true, xTicks: FREQ_TICKS, xFmt: hzTick };

  const a1 = drawAxes(hrtfC, { ...base, title: 'HRTF magnitude', yLabel: 'Magnitude (dB)',
    yMin: Math.min(...all), yMax: Math.max(...all) });
  drawCurve(hrtfC, a1, hrtfFreqs, magsL, L_COL, { width: 2 });
  drawCurve(hrtfC, a1, hrtfFreqs, magsR, R_COL, { width: 2 });
  drawLegend(hrtfC, a1, [{ label: 'Left ear', color: L_COL }, { label: 'Right ear', color: R_COL }]);

  const a2 = drawAxes(ildC, { ...base, title: 'Interaural level difference (L \u2212 R)',
    yLabel: 'ILD (dB)', yMin: -30, yMax: 30, yTicks: [-30, -20, -10, 0, 10, 20, 30], zeroLine: true });
  drawCurve(ildC, a2, hrtfFreqs, ild, '#a66bd1', { width: 2 });

  const nS = Math.min(hL.length, Math.round(0.003 * fs_HRTF));
  const ts = Array.from({ length: nS }, (_, n) => (n / fs_HRTF) * 1000);
  let pk = 0;
  for (let n = 0; n < nS; n++) pk = Math.max(pk, Math.abs(hL[n]), Math.abs(hR[n]));
  pk = pk * 1.1 || 1;
  const a3 = drawAxes(hrirC, { title: 'Head-related impulse response (first 3 ms)',
    xLabel: 'Time (ms)', yLabel: 'Amplitude (linear)',
    xMin: 0, xMax: 3, logX: false, xTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3],
    yMin: -pk, yMax: pk, zeroLine: true });
  drawCurve(hrirC, a3, ts, hL.subarray(0, nS), L_COL, { width: 1.5 });
  drawCurve(hrirC, a3, ts, hR.subarray(0, nS), R_COL, { width: 1.5 });
  drawLegend(hrirC, a3, [{ label: 'Left', color: L_COL }, { label: 'Right', color: R_COL }]);

  const itdMs = itdSeconds(binauralState.az, defaultEarParams.headRadiusCm) * 1000;
  document.getElementById('binauralReadout').textContent =
    `az=${binauralState.az}\u00B0 el=${binauralState.el}\u00B0 | ITD: ${itdMs.toFixed(3)} ms`;
}

['az', 'el'].forEach(key => {
  const input = document.getElementById(`binaural-${key}`);
  input.oninput = () => {
    binauralState[key] = parseFloat(input.value);
    document.getElementById(`binaural-${key}-val`).textContent = input.value;
    plotBinaural();
    emit('binaural');
  };
});

onThemeChange(() => { redraw(); plotMiddleEar(); plotBinaural(); });

redraw();
plotMiddleEar();
plotBinaural();

export { totalDB, fvec, combinedDB, plotMiddleEar, binauralState, plotBinaural };