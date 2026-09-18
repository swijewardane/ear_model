import { totalDB, combinedDB } from './app.js';

let ctx, source;

function designFIR(getGainDB, N, fs) {
  const half = N / 2;
  const mag = new Float64Array(N);
  for (let k = 1; k <= half; k++) {
    const lin = Math.pow(10, getGainDB((k / N) * fs) / 20);
    mag[k] = lin;
    if (k < half) mag[N - k] = lin;
  }
  const h = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    let sum = 0;
    for (let k = 0; k < N; k++) sum += mag[k] * Math.cos((2 * Math.PI * k * n) / N);
    h[n] = sum / N;
  }
  const out = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));
    out[n] = h[(n + half) % N] * w;
  }
  return out;
}

async function playModel(useModel) {
  stopAudio();
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const fs = ctx.sampleRate, dur = 3;
  const noiseBuf = ctx.createBuffer(1, fs * dur, fs);
  const noise = noiseBuf.getChannelData(0);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;

  let outBuf = noiseBuf;
  if (useModel) {
    const taps = designFIR(combinedDB, 1024, fs);
    const irBuf = ctx.createBuffer(1, taps.length, fs);
    irBuf.copyToChannel(taps, 0);
    const offline = new OfflineAudioContext(1, noise.length, fs);
    const src = offline.createBufferSource();
    src.buffer = noiseBuf;
    const conv = offline.createConvolver();
    conv.normalize = false;
    conv.buffer = irBuf;
    src.connect(conv).connect(offline.destination);
    src.start();
    outBuf = await offline.startRendering();
  }
  const ch = outBuf.getChannelData(0);
  const peak = ch.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  for (let i = 0; i < ch.length; i++) ch[i] = (ch[i] / peak) * 0.2;

  source = ctx.createBufferSource();
  source.buffer = outBuf;
  source.connect(ctx.destination);
  source.start();
}
function stopAudio() {
  if (source) try { source.stop(); } catch (e) {}
  if (ctx) try {ctx.close();} catch (e) {}
}

document.getElementById('play-model').onclick = () => playModel(true);
document.getElementById('play-flat').onclick = () => playModel(false);
document.getElementById('stop').onclick = stopAudio;