import { buildHRIR } from './hrtf.js';
import { defaultEarParams } from './hrtf.js';
import { binauralState, onBinauralChange } from './app.js';
import { LiveConvolver } from './engine.js';

const N = 1024;
const engine = new LiveConvolver({channels: 2});
const playBtn = document.getElementById('play-binaural');

const build = fs => {
  const { hL, hR } = buildHRIR(binauralState.az, binauralState.el, defaultEarParams, N, fs);
  return [ hL, hR ];
};

const render = () => playBtn.classList.toggle('active', engine.running);
engine.onStop = render;

playBtn.onclick = async () => {
  if (!engine.running) await engine.start();
  engine.resetReference();
  engine.request(build);
  render();
};
document.getElementById('stop-binaural').onclick = () => engine.stop();

onBinauralChange(() => { if (engine.running) engine.request(build);});


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

async function renderBinaural(azDeg, elDeg, fs=44100, dur=2) {
  const { hL, hR } = buildHRIR(azDeg, elDeg, defaultEarParams, N, fs);
  const offline = new OfflineAudioContext(2, fs * (dur + 1), fs);

  const noiseBuf = offline.createBuffer(1, fs * dur, fs);
  const noise = noiseBuf.getChannelData(0);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;

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
// Peak-normalize the rendered audio
  let peak = 0;
  for (let ch=0; ch<2; ch++) {
    const data = rendered.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
  }
  for (let ch=0; ch<2; ch++) {
    const data = rendered.getChannelData(ch);
    for (let i = 0; i<data.length; i++) {
      data[i] = (data[i] / (peak || 1)) * 0.2;  
    }
  }
  return rendered;
}

document.getElementById('download-binaural').onclick = async () => {
  const {az, el} = binauralState;
  const blob = bufferToWav(await renderBinaural(az, el));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `binaural_az${az}_el${el}.wav`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};