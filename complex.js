function cAdd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function cMul(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function cDiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
function cPar(a, b) { return cDiv(cMul(a, b), cAdd(a, b)); } // a‖b = ab/(a+b)
function cMag(a) { return Math.hypot(a.re, a.im); }
function cPhaseDeg(a) { return (Math.atan2(a.im, a.re) * 180) / Math.PI; }

export { cAdd, cMul, cDiv, cPar, cMag, cPhaseDeg };