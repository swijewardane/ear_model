export function fft(re, im, inverse = false) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>=1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const half = len >> 1;
        const ang = ((inverse ? 1 : -1) * 2 * Math.PI / len);
        const wlr = Math.cos(ang);
        const wli = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let wr = 1, wi = 0;
            for (let k = 0; k < half; k++) {
                const a = i + k, b = a + half;
                const vr = re[b]*wr - im[b]*wi;
                const vi = re[b]*wi + im[b]*wr;
                re[b] = re[a] - vr;
                im[b] = im[a] - vi;
                re[a] += vr;
                im[a] += vi;
                const t = wr*wlr - wi*wli;
                wi = wr*wli + wi*wlr;
                wr = t;
            }
        }
    }
    if (inverse) for (let i=0; i<n; i++) {
        re[i] /= n;
        im[i] /= n;
    }
}