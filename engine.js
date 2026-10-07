const NOISE_SECONDS = 8;
const NOISE_RMS = Math.sqrt(1/2);
const OUT_RMS = 0.1;

export class LiveConvolver {
    static active = null;

    constructor({ channels = 1, fadeMs = 25, minIntervalMs = 40} = {}) {
        this.channels = channels;
        this.tau = fadeMs/1000;
        this.minInterval = minIntervalMs;
        this.ctx = null;
        this.voices = [];
        this.refEnergy = null;
        this.onStop = null;
        this._build = null;
        this._queued = false;
        this._last = 0;
    }

    get running() {return this.ctx !== null;}

    async start() {
        if (this.ctx) return;
        if (LiveConvolver.active && LiveConvolver.active !== this) LiveConvolver.active.stop();
        LiveConvolver.active = this;

        const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
        const noise = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1;

        this.src = ctx.createBufferSource();
        this.src.buffer = noise;
        this.src.loop = true;

        this.bus = ctx.createGain();
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -6;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.1;
        this.master = ctx.createGain();
        this.bus.connect(limiter).connect(this.master).connect(ctx.destination);

        this.refEnergy = null;
        this.src.start();
        this.master.gain.setTargetAtTime(1, ctx.currentTime, 0.02);
        if (ctx.state == "suspended") await ctx.resume();
    }

    stop() {
        const ctx = this.ctx;
        if (!ctx) return;
        this.ctx = null;
        if (LiveConvolver.active === this) LiveConvolver.active = null;
        this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        const src = this.src;
        this.voices = [];
        setTimeout(() => {
            try {src.stop();} catch (e) {console.error("Error stopping audio source:", e);}
            ctx.close().catch(() => {});
        }, 250);
        this.onStop?.();
    }

    resetReference() {this.refEnergy = null;}

    request(build) {
        this._build = build;
        if (!this.ctx || this._queued) return;
        this._queued = true;
        const tick = now => {
            if (!this.ctx) {this._queued = false; return;}
            if (now - this._last < this.minInterval) {requestAnimationFrame(tick); return;}
            this._last = now;
            this._queued = false;
            this._apply(this._build(this.ctx.sampleRate));
        };
        requestAnimationFrame(tick);
    }

    _apply(irs) {
        //console.log(irs);
        const ctx = this.ctx, fs = ctx.sampleRate, len = irs[0].length;

        const energy = irs.reduce((s, h) => s + h.reduce((a, v) => a + v * v, 0), 0) / irs.length;
        if (this.refEnergy === null) this.refEnergy = energy || 1;
        const scale = OUT_RMS / (NOISE_RMS * Math.sqrt(this.refEnergy));

        const gain = ctx.createGain();
        gain.gain.value = 0;
        const merger = ctx.createChannelMerger(this.channels);
        const src = this.src;
        const convs = irs.map((h, ch) => {
            const buf = ctx.createBuffer(1, len, fs);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = h[i]*scale;
            const conv = ctx.createConvolver();
            conv.normalize = false;
            conv.buffer = buf;
            src.connect(conv);
            conv.connect(merger, 0, ch);
            return conv;
        });
        merger.connect(gain).connect(this.bus);

        const t = ctx.currentTime + len/fs;
        gain.gain.setTargetAtTime(1, ctx.currentTime, this.tau);
        const old = this.voices;
        old.forEach(v => v.gain.gain.setTargetAtTime(0, t, this.tau));
        this.voices = [{gain, merger, convs, src}];
        setTimeout(() => old.forEach(v => this._dispose(v)), 600);
    }

    _dispose(v) {
        try {
            v.convs.forEach(c => {v.src.disconnect(c); c.disconnect();});
            v.merger.disconnect();
            v.gain.disconnect();

        } catch (e) {
            console.error("Error disposing voice:", e);
        }
    }

}
