import {stages} from './stages.js';
import {reflectorFc, reflectorDB, cavityFH, cavityDB, canalModes, canalDB, pinnaNotch1, pinnaDB, pinnaR} from './physics.js';
import {middleEarResponse, middleEarParams, cMag, cPhaseDeg } from './middle_ear.js';
import { buildHRIR, itdSeconds, defaultEarParams } from './hrtf.js';

const state = {};
stages.forEach(s => {state[s.id] = {}; s.params.forEach(p => state[s.id][p.key] = p.value);});

const fvec = [];
for (let i = 0; i <= 400; i++) {
    fvec.push(20 * Math.pow(1000, i / 400));
}

const middleEarRefDB = 20*Math.log10(cMag(middleEarResponse(1000, middleEarParams).H));

function combinedDB(f) {
  const outer = totalDB(f);
  const middleDB = 20 * Math.log10(cMag(middleEarResponse(f, middleEarParams).H)) - middleEarRefDB;
  return outer + middleDB;
}

const zCanvas = document.getElementById('zplot');
const zCtx = zCanvas.getContext('2d');
const phaseCanvas = document.getElementById('phaseplot');
const phaseCtx = phaseCanvas.getContext('2d');

function drawDetailPlot(ctx, canvas, fn, yLo, yHi, color, label) {
  const yPixD = v => canvas.height - ((v - yLo) / (yHi - yLo)) * canvas.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(f => {
    const x = xPix(f);
    ctx.strokeStyle = '#ddd';
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  fvec.forEach((f, i) => {
    const x = xPix(f), y = yPixD(fn(f));
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.font = '11px sans-serif';
  ctx.fillText(label, 6, 14);
}

function plotMiddleEar() {
  const zinFn = f => 20 * Math.log10(cMag(middleEarResponse(f, middleEarParams).zInput));
  const phaseFn = f => cPhaseDeg(middleEarResponse(f, middleEarParams).H);

  const zVals = fvec.map(zinFn);
  const zLo = Math.min(...zVals) - 3, zHi = Math.max(...zVals) + 3;
  drawDetailPlot(zCtx, zCanvas, zinFn, zLo, zHi, '#9b59b6', 'Middle-ear |Z_in| (dB)');
  drawDetailPlot(phaseCtx, phaseCanvas, phaseFn, -180, 180, '#8e44ad', 'Middle-ear transmission phase (deg)');
}

function totalDB(f) {
    return stages.reduce((sum, s) => sum + s.computeDB(f, state[s.id]), 0);
}

// ---------- canvas plot ----------
const canvas = document.getElementById('plot');
const ctx2d = canvas.getContext('2d');
const xMin = 20, xMax = 20000;
const xPix = f => ((Math.log10(f) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) * canvas.width;




function updateReadout() {
  const c = state.cavity, k = state.canal, p = state.pinna;
  const modes = canalModes(k.L);
  const r = pinnaR(p.az, p.el, p.rmax);
  document.getElementById('readout').textContent =
    `Reflector corner: ${reflectorFc(state.reflector.a).toFixed(0)} Hz | ` +
    `Cavity: ${cavityFH(c.V, c.ar, c.nl).toFixed(0)} Hz | ` +
    `Canal f1: ${modes[0].toFixed(0)} Hz, f3: ${modes[2].toFixed(0)} Hz | ` +
    `Pinna notch1: ${r > 1e-5 ? pinnaNotch1(r).toFixed(0) + ' Hz' : '—'}`;
}

// ---------- slider panel (auto-built from stages) ----------
const panel = document.getElementById('controls');
stages.forEach(s => {
  const group = document.createElement('fieldset');
  group.innerHTML = `<legend style="color:${s.color}">${s.label}</legend>`;
  s.params.forEach(p => {
    const row = document.createElement('label');
    row.style.display = 'block';
    row.innerHTML = `${p.label} <span id="${s.id}-${p.key}-val">${p.value}</span>`;
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: p.min, max: p.max, step: p.step, value: p.value });
    input.oninput = () => {
      state[s.id][p.key] = parseFloat(input.value);
      document.getElementById(`${s.id}-${p.key}-val`).textContent = input.value;
      redraw();
    };
    row.appendChild(document.createElement('br'));
    row.appendChild(input);
    group.appendChild(row);
  });
  panel.appendChild(group);
});

const curves = [
  ...stages.map(s => ({ id: s.id, label: s.label, color: s.color, fn: f => s.computeDB(f, state[s.id]) })),
  { id: 'outerTotal', label: 'Outer (total)', color: '#000', fn: totalDB },
  { id: 'middleEar', label: 'Middle ear', color: '#9b59b6', fn: f => 20 * Math.log10(cMag(middleEarResponse(f, middleEarParams).H))},
  { id: 'combined', label: 'Combined', color: '#c0392b', fn: combinedDB },
];

const visible = {};
curves.forEach(c => { visible[c.id] = true; });

function redraw() {
  const active = curves.filter(c => visible[c.id]);

  // auto-fit y-axis to whatever's actually shown
  let yMin = Infinity, yMax = -Infinity;
  active.forEach(c => fvec.forEach(f => {
    const v = c.fn(f);
    if (v < yMin) yMin = v;
    if (v > yMax) yMax = v;
  }));
  if (!isFinite(yMin)) { yMin = -20; yMax = 40; }
  const pad = (yMax - yMin) * 0.1 || 5;
  yMin -= pad; yMax += pad;

  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  const yPixNow = db => canvas.height - ((db - yMin) / (yMax - yMin)) * canvas.height;

  [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(f => {
    const x = xPix(f);
    ctx2d.strokeStyle = '#ddd';
    ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, canvas.height); ctx2d.stroke();
  });
  ctx2d.strokeStyle = '#000';
  ctx2d.beginPath(); ctx2d.moveTo(0, yPixNow(0)); ctx2d.lineTo(canvas.width, yPixNow(0)); ctx2d.stroke();

  active.forEach(c => {
    ctx2d.beginPath();
    ctx2d.strokeStyle = c.color;
    ctx2d.lineWidth = c.id === 'combined' || c.id === 'outerTotal' ? 2.5 : 1.5;
    fvec.forEach((f, i) => {
      const x = xPix(f), y = yPixNow(c.fn(f));
      i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
    });
    ctx2d.stroke();
  });

  updateReadout();
}

// toggle checkboxes, one per curve
const toggleBar = document.getElementById('toggles');
curves.forEach(c => {
  const label = document.createElement('label');
  label.style.marginRight = '1rem';
  label.style.color = c.color;
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = true;
  cb.onchange = () => { visible[c.id] = cb.checked; redraw(); };
  label.appendChild(cb);
  label.append(' ' + c.label);
  toggleBar.appendChild(label);
});

redraw();
plotMiddleEar();
export { totalDB, fvec, combinedDB, plotMiddleEar };

const binauralState = {az: 30, el: 0};
const N_HRTF = 1024; const fs_HRTF = 44100;

const hrtfCanvas = document.getElementById('hrtfPlot');
const hrtfCtx = hrtfCanvas.getContext('2d');
const ildCanvas = document.getElementById('ildPlot');
const ildCtx = ildCanvas.getContext('2d');
const hrirCanvas = document.getElementById('hrirPlot');
const hrirCtx = hrirCanvas.getContext('2d');

function freqBins(N, fs) {
  // only need k=0..N/2 (positive-frequency half) for these plots
  return Array.from({ length: N/2 + 1 }, (_, k) => (k / N) * fs);
}
const hrtfFreqs = freqBins(N_HRTF, fs_HRTF).slice(1);

function drawTwoCurves(ctx, canvas, freqs, valsA, colorA, labelA, valsB, colorB, labelB, yLo, yHi) {
  const xp = f => ((Math.log10(f) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) * canvas.width;
  const yp = v => canvas.height - ((v - yLo) / (yHi - yLo)) * canvas.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const ticks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  ticks.forEach(f => {
    const x = xp(f);
    ctx.strokeStyle = '#ddd'; ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    ctx.fillStyle = '#999'; ctx.font = '9px sans-serif';
    const label = f >= 1000 ? `${f/1000}k` : `${f}`;
    ctx.fillText(label, x + 2, canvas.height - 3);
  });

  [20,50,100,200,500,1000,2000,5000,10000,20000].forEach(f => {
    ctx.strokeStyle = '#ddd'; ctx.beginPath();
    ctx.moveTo(xp(f), 0); ctx.lineTo(xp(f), canvas.height); ctx.stroke();
  });
  [[valsA, colorA], [valsB, colorB]].forEach(([vals, color]) => {
    if (color === 'transparent') return;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    freqs.forEach((f, i) => {
      const x = xp(f), y = yp(vals[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
  ctx.fillStyle = colorA; ctx.font = '11px sans-serif'; ctx.fillText(labelA, 6, 14);
  if (colorB !== 'transparent') { ctx.fillStyle = colorB; ctx.fillText(labelB, 6, 28); }
}

function drawHRIR(ctx, canvas, hL, hR, fs, windowMs) {
  const nSamples = Math.min(hL.length, Math.round((windowMs / 1000) * fs));
  const allVals = [...hL.slice(0, nSamples), ...hR.slice(0, nSamples)];
  const yMax = Math.max(...allVals.map(Math.abs)) * 1.1 || 1;

  const xp = n => (n / nSamples) * canvas.width;
  const yp = v => canvas.height / 2 - (v / yMax) * (canvas.height / 2);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ddd';
  ctx.beginPath(); ctx.moveTo(0, canvas.height/2); ctx.lineTo(canvas.width, canvas.height/2); ctx.stroke();

  [['#2d5f8a', hL, 'Left'], ['#c0392b', hR, 'Right']].forEach(([color, h, label], idx) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let n = 0; n < nSamples; n++) {
      const x = xp(n), y = yp(h[n]);
      n === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = color; ctx.font = '11px sans-serif';
    ctx.fillText(label, 6, 14 + idx * 14);
  });
  ctx.fillStyle = '#666'; ctx.font = '10px sans-serif';
  ctx.fillText(`0–${windowMs} ms`, canvas.width - 60, canvas.height - 6);
}


function plotBinaural() {
  const {hL, hR, HL, HR} = buildHRIR(binauralState.az, binauralState.el, defaultEarParams, N_HRTF, fs_HRTF);
  const magsL = hrtfFreqs.map((f, i) => 20 * Math.log10(cMag((HL[i + 1]))));
  const magsR = hrtfFreqs.map((f, i) => 20 * Math.log10(cMag((HR[i + 1]))));
  const ild = magsL.map((v, i) => v - magsR[i]);

  const allMags = [...magsL, ...magsR];

  drawTwoCurves(hrtfCtx, hrtfCanvas, hrtfFreqs, magsL, '#2d5f8a', 'Left', magsR, '#c0392b', 'Right',
    Math.min(...allMags) - 3, Math.max(...allMags) + 3);
  drawTwoCurves(ildCtx, ildCanvas, hrtfFreqs, ild, '#9b59b6', 'ILD (L-R, dB)', ild, 'transparent', 'dB',
    -30, 30);
  drawHRIR(hrirCtx, hrirCanvas, hL, hR, fs_HRTF, 3);

  const itdMs = itdSeconds(binauralState.az, defaultEarParams.headRadiusCm) * 1000;
  document.getElementById('binauralReadout').textContent =
    `az=${binauralState.az}° el=${binauralState.el}° | ITD: ${itdMs.toFixed(3)} ms`;
}

['az', 'el'].forEach(key => {
  const input = document.getElementById(`binaural-${key}`);
  input.oninput = () => {
    binauralState[key] = parseFloat(input.value);
    document.getElementById(`binaural-${key}-val`).textContent = input.value;
    plotBinaural();
  };
});

plotBinaural();
export { binauralState, plotBinaural };