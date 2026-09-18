import { cDiv } from './complex.js';

const c0 = 343;

function itdSeconds(azDeg, headradiusCm) {
    const a = headradiusCm / 100; // convert to meters
    const az = azDeg * Math.PI / 180;
    const absAz = Math.min(Math.abs(az), Math.PI);
    const t = absAz <= Math.PI/2
    ? (a / c0) * (absAz + Math.sin(absAz))
    : (a / c0) * (Math.PI - absAz + Math.sin(absAz));
    return Math.sign(azDeg || 1) * t;

}

function headShadow(f, azDeg, earAngleDeg, headradiusCm) {
    const a = headradiusCm / 100; // convert to meters
    const f0 = c0 / ( 2 * Math.PI * a);
    const thetaRel = ((azDeg - earAngleDeg) * Math.PI / 180); 
    const alpha = 1.05 + 0.95 * Math.cos(thetaRel);
    const num = { re: 1, im: (alpha * f / (2 * f0))};
    const den = { re: 1, im: f / (2 * f0)};
    return cDiv(num, den);
}

function pinnaComplex(f, r, rho) {
    if (r < 1e-5) return { re: 1, im: 0 };
    const tau = r / c0;
    const theta = -2 * Math.PI * f * tau;
    return {re: 1 + rho*Math.cos(theta), im: rho*Math.sin(theta)};
}

function complexResonance(f, fn, Q, gain) {
    const ratio = f/fn - fn/f;
    return cDiv({re: gain, im: 0}, {re: 1, im: Q*ratio});
}

import { reflectorFc, reflectorDB, cavityFH, cavityDB, canalModes, canalDB, pinnaNotch1, pinnaDB, pinnaR} from "./physics.js";

import { cAdd, cMul, cPar, cMag, cPhaseDeg } from './complex.js';

function reflectorComplex(f, aCm) {
    return {re: Math.pow(10, reflectorDB(f, aCm)/20), im: 0};
}

function nonDirectional(f, p) {
    const m = canalModes(p.canal.L);
    const peaks = cMul(cMul(
        complexResonance(f, m[0], p.canal.Q, p.canal.peakGain),
        complexResonance(f, m[2], p.canal.Q, p.canal.peakGain*0.6)),
        complexResonance(f, m[4], p.canal.Q, p.canal.peakGain*0.45));
    const notches = cMul(
        complexResonance(f, m[1], p.canal.Q, p.canal.notchGain),
        complexResonance(f, m[3], p.canal.Q, p.canal.notchGain*0.6));
    const canalC = cDiv(peaks, notches);
    const cavC = complexResonance(f, cavityFH(p.cavity.V, p.cavity.ar, p.cavity.nl), p.cavity.Q, p.cavity.gain);
    return cMul(cMul(canalC, cavC), reflectorComplex(f, p.reflector.a));
}

function makeHRTF(f, azDeg, elDeg, p) {
    const nonDir = nonDirectional(f, p);
    const shadowL = headShadow(f, azDeg, -90, p.headRadiusCm);
    const shadowR = headShadow(f, azDeg, 90, p.headRadiusCm);
    const pinnaL = pinnaComplex(f, pinnaR(azDeg, elDeg, p.pinna.rmax), p.pinna.rho);
    const pinnaRc = pinnaComplex(f, pinnaR(-azDeg, elDeg, p.pinna.rmax), p.pinna.rho);
    const itd = itdSeconds(azDeg, p.headRadiusCm);
    const preDelay = 0.001;
    const delayLSeconds = preDelay + itd/2;
    const delayRSeconds = preDelay - itd/2;
    const delayL = {re: Math.cos(-2*Math.PI*f*delayLSeconds), im: Math.sin(-2*Math.PI*f*delayLSeconds)};
    const delayR = {re: Math.cos(-2*Math.PI*f*delayRSeconds), im: Math.sin(-2*Math.PI*f*delayRSeconds)};
    return {
        HL: cMul(cMul(cMul(nonDir, shadowL), pinnaL), delayL),
        HR: cMul(cMul(cMul(nonDir, shadowR), pinnaRc), delayR)
    };
}



function ifftreal(H) {
    const N = H.length, h = new Float32Array(N);
    for (let n = 0; n < N; n++) {
        let re = 0;
        for (let k = 0; k < N; k++) {
            const th = (2 * Math.PI * k * n) / N;
            re += H[k].re * Math.cos(th) - H[k].im * Math.sin(th);
        }
        h[n] = re / N;
    }
    return h;
}

function buildHRIR(azDeg, elDeg, p, N, fs) {
    const HL = [], HR = [];
    for (let k = 0; k < N; k++) {
        const f = k < N/2 ? (k/N)*fs : ((k-N)/N)*fs;
        const {HL: hl, HR: hr} = makeHRTF(f === 0 ? 1e-6 : f, azDeg, elDeg, p);
        HL.push(hl);
        HR.push(hr);
    }
    
    return {hL: ifftreal(HL), hR: ifftreal(HR), HL, HR};
}

const defaultEarParams = {
    headRadiusCm: 8.75,
    reflector: {a: 1.0},
    cavity: {V: 1.0, ar: 0.7, nl: 0.3, Q: 3.0, gain: 9.0},
    canal: {L: 2.7, Q: 4.0, peakGain: 9.0, notchGain: 9.0},
    pinna: {rmax: 2.0, rho: 0.6}
}

export {makeHRTF, itdSeconds, headShadow, defaultEarParams, buildHRIR, ifftreal};