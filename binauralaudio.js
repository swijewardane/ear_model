import { buildHRIR } from './hrtf.js';
import { defaultEarParams } from './hrtf.js';
import { binauralState } from './app.js';

let ctx, source;

function stopBinaural() {
  if (source) try { source.stop(); } catch (e) {}
  if (ctx) ctx.close();
}

async function playBinaural(azDeg, elDeg) {
  stopBinaural();
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const fs = ctx.sampleRate, dur = 2;
  const { hL, hR } = buildHRIR(azDeg, elDeg, defaultEarParams, 1024, fs);

  const noiseBuf = ctx.createBuffer(1, fs * dur, fs);
  const noise = noiseBuf.getChannelData(0);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;

  const offline = new OfflineAudioContext(2, fs * (dur + 1), fs);
  const src = offline.createBufferSource();
  src.buffer = noiseBuf;

  const irL = offline.createBuffer(1, hL.length, fs); irL.copyToChannel(new Float32Array(hL), 0);
  const irR = offline.createBuffer(1, hR.length, fs); irR.copyToChannel(new Float32Array(hR), 0);
  const convL = offline.createConvolver(); convL.normalize = false; convL.buffer = irL;
  const convR = offline.createConvolver(); convR.normalize = false; convR.buffer = irR;

  const merger = offline.createChannelMerger(2);
  src.connect(convL).connect(merger, 0, 0); // left channel
  src.connect(convR).connect(merger, 0, 1); // right channel
  merger.connect(offline.destination);
  src.start();

  const rendered = await offline.startRendering();
  // peak-normalize across both channels together, so ILD is preserved
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) {
    const data = rendered.getChannelData(ch);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  for (let ch = 0; ch < 2; ch++) {
    const data = rendered.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] = (data[i] / (peak || 1)) * 0.2;
  }

  source = ctx.createBufferSource();
  source.buffer = rendered;
  source.connect(ctx.destination);
  source.start();
}

document.getElementById('play-binaural').onclick = () => playBinaural(binauralState?.az ?? 30, binauralState?.el ?? 0);
document.getElementById('stop-binaural').onclick = stopBinaural;