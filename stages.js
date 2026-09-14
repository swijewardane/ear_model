import {
  reflectorFc, reflectorDB,
  cavityFH, cavityDB,
  canalModes, canalDB,
  pinnaNotch1, pinnaDB, pinnaR,
} from './physics.js';

export const stages = [
    {
        id: 'reflector',
        label: 'Reflector',
        color: '#297cb9',
        params: [
            { key: 'a', label: 'Aperture a (cm)', min: 0.2, max: 1.5, step: 0.1, value: 1.0 }],
        computeDB: (f, p) => reflectorDB(f, p.a),
    },
    {
    id: 'cavity', label: 'Cavity', color: '#eb6a33',
    params: [
      { key: 'V',    label: 'Volume (cc)',    min: 0.3, max: 3.0, step: 0.01, value: 1.0 },
      { key: 'ar',   label: 'Aperture r (cm)', min: 0.3, max: 1.2, step: 0.01, value: 0.7 },
      { key: 'nl',   label: 'Neck len (cm)',   min: 0.1, max: 1.0, step: 0.01, value: 0.3 },
      { key: 'Q',    label: 'Q',               min: 1.0, max: 8.0, step: 0.1,  value: 3.0 },
      { key: 'gain', label: 'Peak gain (dB)',  min: 2.0, max: 15,  step: 0.1,  value: 9.0 },
    ],
    computeDB: (f, p) => cavityDB(f, cavityFH(p.V, p.ar, p.nl), p.Q, p.gain),
  },
  {
    id: 'canal', label: 'Canal', color: '#1cb079',
    params: [
      { key: 'L',          label: 'Length (cm)',     min: 1.5, max: 4.0, step: 0.01, value: 2.7 },
      { key: 'Q',          label: 'Q',               min: 1.0, max: 10,  step: 0.1,  value: 4.0 },
      { key: 'peakGain',   label: 'Peak gain (dB)',  min: 2.0, max: 18,  step: 0.1,  value: 9.0 },
      { key: 'notchGain',  label: 'Notch depth (dB)',min: 2.0, max: 18,  step: 0.1,  value: 9.0 },
    ],
    computeDB: (f, p) => canalDB(f, p.L, p.Q, p.peakGain, p.notchGain),
  },
  {
    id: 'pinna', label: 'Pinna', color: '#e87aa3',
    params: [
      { key: 'az',   label: 'Azimuth (deg)',   min: -180, max: 180, step: 1,    value: 90 },
      { key: 'el',   label: 'Elevation (deg)', min: -90,  max: 90,  step: 1,    value: 0 },
      { key: 'rmax', label: 'Path len (cm)',   min: 0.5,  max: 6,   step: 0.01, value: 2.0 },
      { key: 'rho',  label: 'Strength',        min: 0,    max: 0.95,step: 0.01, value: 0.6 },
    ],
    computeDB: (f, p) => pinnaDB(f, pinnaR(p.az, p.el, p.rmax), p.rho),
  },
];