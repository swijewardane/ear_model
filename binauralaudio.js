import { buildHRIR } from './hrtf.js';
import { defaultEarParams } from './hrtf.js';
import { binauralState } from './app.js';

let ctx, source;

function stopBinaural() {
  if (source) try { source.stop(); } catch (e) {}
  if (ctx) try {ctx.close();} catch (e) {}
}

function bufferToWav(buffer) {
  const numCh = buffer.numberOfChannels, len = buffer.length;
  const bytesPerSample = 2, blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const bufOut = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bufOut);
  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };

  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: numCh }, (_, ch) => buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([bufOut], { type: 'audio/wav' });
}

let lastRendered = null;

async function playBinaural(azDeg, elDeg) {
  stopBinaural();
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const fs = ctx.sampleRate, dur = 2;
  const { hL, hR } = buildHRIR(azDeg, elDeg, defaultEarParams, 1024, fs);

  console.log(hL.slice(0, 50))

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

  lastRendered = rendered; // store for potential download
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

function downloadBinaural() {
  if (!lastRendered) return;
  const blob = bufferToWav(lastRendered);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `binaural_az${binauralState.az}_el${binauralState.el}.wav`;
  a.click();
  URL.revokeObjectURL(url);
}




document.getElementById('play-binaural').onclick = () => playBinaural(binauralState?.az ?? 30, binauralState?.el ?? 0);
document.getElementById('stop-binaural').onclick = stopBinaural;
document.getElementById('download-binaural').onclick = downloadBinaural;