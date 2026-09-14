
import { cAdd, cMul, cDiv, cPar, cMag, cPhaseDeg } from './complex.js';


function Z_R(R) { return { re: R, im: 0 }; }
function Z_L(omega, L) { return { re: 0, im: omega * L }; }
function Z_C(omega, C) { return { re: 0, im: -1 / (omega * C) }; }

function Z_cavity(omega, p) {
  const top = cAdd(cAdd(Z_C(omega, p.Cp), Z_L(omega, p.La)), Z_R(p.Ra)); // Cp+La+Ra
  const bot = cAdd(Z_R(p.Rm), Z_C(omega, p.Ct));                        // Rm+Ct
  return cPar(top, bot);
}


function Z_eardrumLosses(omega, p) {
  const rd2cd2 = cAdd(Z_R(p.Rd2), Z_C(omega, p.Cd2));   // Rd2+Cd2, series
  const mid = cPar(rd2cd2, Z_L(omega, p.Ld));           // that ‖ Ld
  return cAdd(cAdd(Z_C(omega, p.Cd1), mid), Z_R(p.Rd1));
}

function Z_ossicles(omega, p) {
  return cAdd(cAdd(Z_C(omega, p.Co), Z_L(omega, p.Lo)), Z_R(p.Ro)); // Co+Lo+Ro, series
}


function Z_joint(omega, p) {
  return cAdd(Z_C(omega, p.Cs), Z_R(p.Rs));
}

function Z_cochlea(omega, p) {
  return cPar(Z_C(omega, p.Cc), cAdd(Z_L(omega, p.Lc), Z_R(p.Rc))); // Cc ‖ (Lc+Rc)
}

function middleEarResponse(f, p) {
  const omega = 2 * Math.PI * f;

  const zFar = cPar(Z_joint(omega, p), Z_cochlea(omega, p)); // node C to ground
  const zOssicles = Z_ossicles(omega, p);
  const zAfterOssicles = cAdd(zOssicles, zFar);              // B -> C -> ground

  const zEar = Z_eardrumLosses(omega, p);
  const zAtB = cPar(zEar, zAfterOssicles);                   // node B to ground

  const zInput = cAdd(Z_cavity(omega, p), zAtB);             // full input impedance

  // Transfer function: unit input pressure at node A
  const Ia = cDiv({ re: 1, im: 0 }, zInput);
  const Vb = cMul(Ia, zAtB);
  const I2 = cDiv(Vb, zAfterOssicles);
  const Vc = cMul(I2, zFar);
  const Icochlea = cDiv(Vc, Z_cochlea(omega, p)); // ~ stapes velocity, per the paper's convention

  return { zInput, H: Icochlea };
}

// Table 1, "Value used to obtain loci in Figure 8" column — this is the
// pre-adjustment Zwislocki circuit, chosen specifically because it's the
// one WITHOUT Rd3/Cd3, matching the simpler topology drawn in your slides.
const middleEarParams = {
  La: 14e-3, Lo: 40e-3, Ld: 15e-3, Lc: 20e-3,                    // H
  Ra: 10, Rm: 390, Ro: 70, Rd1: 40, Rd2: 220, Rs: 3000, Rc: 600, // Ω
  Cp: 5.1e-6, Ct: 0.35e-6, Co: 1.4e-6, Cd1: 0.23e-6, Cd2: 0.4e-6,
  Cs: 0.25e-6, Cc: 0.6e-6,                                       // F
};

export { middleEarResponse, middleEarParams, cMag, cPhaseDeg };