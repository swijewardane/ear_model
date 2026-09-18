
const c0 = 343; // speed of sound, m/s

// ---------- shared resonance shape ----------
function lorentz(f, fn, Q, gain) {
  const ratio = f / fn - fn / f;
  return gain / Math.sqrt(1 + Q * Q * ratio * ratio);
}

// ---------- reflector ----------
function reflectorFc(aCm) {
  const a = aCm / 100;
  return c0 / (16 * a);
}

function reflectorDB(f, aCm) {
  const fc = reflectorFc(aCm);
  if (f <= fc) return 0;
  return Math.min(6 * Math.log2(f / fc), 18);
}
// Default: a = 1.0 cm (matches slide 6's worked example exactly).

// ---------- concha cavity (Helmholtz) ----------
function cavityFH(Vcc, arCm, nlCm) {
  const V = Vcc / 1e6;
  const ar = arCm / 100;
  const A = Math.PI * ar * ar;
  const Leff = nlCm / 100 + 0.6 * ar;
  return (c0 / (2 * Math.PI)) * Math.sqrt(A / (V * Leff));
}
function cavityDB(f, fH, Q, gain) {
  return lorentz(f, fH, Q, gain);
}

// ---------- ear canal ----------
function canalModes(LCm) {
  const L = LCm / 100;
  const f1 = c0 / (4 * L);
  return [f1, 2 * f1, 3 * f1, 4 * f1, 5 * f1];
}
function canalDB(f, LCm, Q, peakGain, notchGain) {
  const m = canalModes(LCm);
  return (
    lorentz(f, m[0], Q, peakGain) +
    lorentz(f, m[2], Q, peakGain * 0.6) +
    lorentz(f, m[4], Q, peakGain * 0.45) -
    lorentz(f, m[1], Q, notchGain) -
    lorentz(f, m[3], Q, notchGain * 0.6)
  );
}
// Default: L = 2.7 cm (matches slide 19 exactly → f1=3.2kHz, f3=9.5kHz).

// ---------- pinna ----------
function pinnaNotch1(rCm) {
  const r = rCm / 100;
  return c0 / (2 * r);
}

function pinnaDB(f, rCm, rho) {
  const r = rCm / 100;
  if (r < 1e-5) return 0;
  const tau = r / c0;
  const magSq = 1 + rho * rho + 2 * rho * Math.cos(2 * Math.PI * f * tau);
  return 10 * Math.log10(Math.max(magSq, 1e-6));
}

// mapping from azimuth/elevation → path length r
function pinnaR(azDeg, elDeg, rmaxCm) {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  // const elR = (40 * Math.PI) / 180; 
  return rmaxCm * (1 - Math.cos(az)) * Math.cos(el);
}

export {
  reflectorFc, reflectorDB,
  cavityFH, cavityDB,
  canalModes, canalDB,
  pinnaNotch1, pinnaDB, pinnaR,
};