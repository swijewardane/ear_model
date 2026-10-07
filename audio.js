import { totalDB, combinedDB , onModelChange} from './app.js';
import { fft } from './fft.js';
import { LiveConvolver } from './engine.js';

const N = 1024;

function designFIR(getGainDB, N, fs) {
  const half = N / 2;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let k = 1; k <= half; k++) {
    const lin = Math.pow(10, getGainDB((k / N) * fs) / 20);
    re[k] = lin;
    if (k < half) re[N - k] = lin;
  }
  re[0] = re[1];
  fft(re, im, true);
  const out = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));
    out[n] = re[(n + half) % N] * w;
  }
  return out;
}

const builders = {
  model: fs => [designFIR(combinedDB, N, fs)],
  flat: fs => [designFIR(() => 0, N, fs)]
};

const engine = new LiveConvolver({channels: 1});
let mode = 'model';

const btn = {
  model: document.getElementById('play-model'),
  flat: document.getElementById('play-flat')
};

function render() {
  Object.entries(btn).forEach(([k,b]) => 
    b.classList.toggle('active', engine.running && mode === k))
};

engine.onStop = render;

async function play(m) {
  mode = m;
  if (!engine.running) await engine.start();
  engine.resetReference();
  engine.request(builders[mode]);
  render();
}


btn.model.onclick = () => play('model');
btn.flat.onclick = () => play('flat');
document.getElementById('stop').onclick = () => engine.stop();

onModelChange (() => {
  // console.log('model listener', 'running:', engine.running, 'mode:', mode);
  if (engine.running && mode === 'model') {
    engine.request(builders.model);
  }
});

export {designFIR};