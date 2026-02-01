/**
 * UnifiedSynth - A parameterized drum synthesizer.
 * Usage:
 *   const synth = new UnifiedSynth(audioContext, outputNode);
 *   synth.play(params);
 */
export class UnifiedSynth {
    constructor(ctx, output) {
        this.ctx = ctx;
        this.output = output;
        this.noiseBuffer = this._createNoiseBuffer();
    }

    _createNoiseBuffer() {
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    /**
     * Play a drum sound with the given parameters.
     * @param {object} P - Parameters object
     * @param {number} [P.vol=1] - Master volume (0-1)
     * @param {object} [P.osc1] - Oscillator 1 config
     * @param {object} [P.osc2] - Oscillator 2 config
     * @param {object} [P.osc3] - Oscillator 3 config
     * @param {object} [P.osc4] - Oscillator 4 config
     * @param {object} [P.noise] - Noise generator config
     * @param {object} [P.master] - Master output config
     */
    play(P = {}) {
        const now = this.ctx.currentTime;
        const vol = P.vol !== undefined ? P.vol : 1;

        // Master Output Chain
        const masterGain = this.ctx.createGain();
        const masterVol = (P.master?.master_vol || 80) / 100;
        masterGain.gain.setValueAtTime(vol * masterVol * 1.5, now);

        const masterHPF = this.ctx.createBiquadFilter();
        masterHPF.type = 'highpass';
        masterHPF.frequency.setValueAtTime(P.master?.hpf_cutoff || 20, now);
        masterHPF.Q.setValueAtTime((P.master?.hpf_res || 0) / 10, now);

        masterGain.connect(masterHPF);
        masterHPF.connect(this.output);

        // Process 4 Oscillators
        ['osc1', 'osc2', 'osc3', 'osc4'].forEach(id => {
            const cfg = P[id];
            if (!cfg || !cfg.enabled) return;
            this._playOscillator(cfg, now, masterGain, id === 'osc1');
        });

        // Process Noise
        const noiseCfg = P.noise;
        if (noiseCfg && noiseCfg.enabled) {
            this._playNoise(noiseCfg, now, masterGain);
        }
    }

    _playOscillator(cfg, now, destination, allowDrive = false) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();

        // Wave type
        const waveMap = { 'tri': 'triangle', 'sine': 'sine', 'sqr': 'square', 'triangle': 'triangle', 'square': 'square' };
        osc.type = waveMap[(cfg.wave || 'Tri').toLowerCase()] || 'triangle';

        // Frequency
        let freq = 55 * Math.pow(2, (cfg.tune || 0) / 12);
        if (cfg.fine) freq *= Math.pow(2, cfg.fine / 1200);

        // Pitch Envelope
        const pDecay = (cfg.p_decay || 0) / 100 * 0.4;
        const pAmt = (cfg.p_amt || 0) / 100 * 500;
        osc.frequency.setValueAtTime(freq + pAmt, now);
        if (pDecay > 0) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq), now + pDecay);
        }

        // Amplitude Envelope
        const attack = (cfg.a_attack || 0) / 100 * 0.05;
        const decay = (cfg.a_decay || 50) / 100 * 1.5;
        const level = (cfg.level !== undefined ? cfg.level : 100) / 100;

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(level, now + attack + 0.001);
        g.gain.exponentialRampToValueAtTime(0.001, now + attack + decay + 0.01);

        // Drive (Osc 1 only)
        if (allowDrive && cfg.drive > 3) {
            const shaper = this.ctx.createWaveShaper();
            shaper.curve = this._makeDistortionCurve(cfg.drive);
            osc.connect(shaper);
            shaper.connect(g);
        } else {
            osc.connect(g);
        }

        g.connect(destination);
        osc.start(now);
        osc.stop(now + attack + decay + 0.2);
    }

    _playNoise(cfg, now, destination) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;

        const filter = this.ctx.createBiquadFilter();
        const filterMap = { 'lpf': 'lowpass', 'hpf': 'highpass', 'bpf': 'bandpass' };
        filter.type = filterMap[(cfg.filter_type || 'LPF').toLowerCase()] || 'lowpass';
        filter.frequency.setValueAtTime(cfg.cutoff || 2000, now);
        filter.Q.setValueAtTime((cfg.res || 0) / 10, now);

        const g = this.ctx.createGain();
        const attack = (cfg.attack || 0) / 100 * 0.04;
        const decay = (cfg.decay || 30) / 100 * 1.0;
        const level = (cfg.level !== undefined ? cfg.level : 50) / 100;

        // Burst mode for Clap
        const burstCount = parseInt(cfg.burst_count) || 1;
        const burstRate = (cfg.burst_rate || 8) / 1000;

        g.gain.setValueAtTime(0.001, now);
        if (burstCount > 1) {
            for (let i = 0; i < burstCount; i++) {
                const t = now + i * burstRate;
                g.gain.linearRampToValueAtTime(level, t + 0.001);
                g.gain.exponentialRampToValueAtTime(level * 0.1, t + burstRate - 0.001);
            }
        } else {
            g.gain.linearRampToValueAtTime(level, now + attack + 0.001);
        }
        const tailStart = burstCount > 1 ? burstCount * burstRate : attack;
        g.gain.exponentialRampToValueAtTime(0.001, now + tailStart + decay + 0.01);

        src.connect(filter);
        filter.connect(g);
        g.connect(destination);
        src.start(now);
        src.stop(now + tailStart + decay + 0.5);
    }

    _makeDistortionCurve(amount) {
        const k = amount;
        const samples = 44100;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; ++i) {
            const x = i * 2 / samples - 1;
            curve[i] = (3 + k) * x * 20 * (Math.PI / 180) / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }
}

// Factory Presets for 909 sounds
export const FACTORY_PRESETS = {
    bd: {
        osc1: { enabled: true, wave: 'Tri', tune: 0, p_decay: 40, p_amt: 60, a_attack: 0, a_decay: 45, drive: 15, level: 100 },
        noise: { enabled: true, filter_type: 'BPF', cutoff: 2500, res: 5, attack: 0, decay: 5, level: 20 },
        master: { hpf_cutoff: 20, master_vol: 80 }
    },
    sd: {
        osc1: { enabled: true, wave: 'Tri', tune: 0, p_decay: 5, p_amt: 20, a_attack: 0, a_decay: 10, level: 100 },
        osc2: { enabled: true, wave: 'Tri', tune: 8, p_decay: 5, p_amt: 20, a_attack: 0, a_decay: 10, level: 80 },
        noise: { enabled: true, filter_type: 'BPF', cutoff: 5000, res: 10, attack: 0, decay: 25, level: 70 },
        master: { hpf_cutoff: 20, master_vol: 80 }
    },
    tom: {
        osc1: { enabled: true, wave: 'Tri', tune: 0, p_decay: 10, p_amt: 30, a_attack: 0, a_decay: 40, level: 100 },
        osc2: { enabled: true, wave: 'Sine', tune: 7, a_attack: 0, a_decay: 30, level: 60 },
        noise: { enabled: true, filter_type: 'BPF', cutoff: 2000, res: 5, attack: 0, decay: 5, level: 30 },
        master: { hpf_cutoff: 20, master_vol: 80 }
    },
    rs: {
        osc1: { enabled: true, wave: 'Sine', tune: 12, a_attack: 0, a_decay: 5, level: 50 },
        osc2: { enabled: true, wave: 'Sine', tune: 24, a_attack: 0, a_decay: 4, level: 40 },
        osc3: { enabled: true, wave: 'Sine', tune: 36, a_attack: 0, a_decay: 3, level: 30 },
        osc4: { enabled: true, wave: 'Tri', tune: 48, p_decay: 2, p_amt: 50, a_decay: 2, level: 60 },
        master: { hpf_cutoff: 400, hpf_res: 5, master_vol: 80 }
    },
    cp: {
        noise: { enabled: true, filter_type: 'BPF', cutoff: 1200, res: 10, attack: 0, decay: 40, burst_count: 4, burst_rate: 8, level: 100 },
        master: { hpf_cutoff: 20, master_vol: 80 }
    }
};

export function getFactoryPreset(trackId) {
    if (FACTORY_PRESETS[trackId]) return JSON.parse(JSON.stringify(FACTORY_PRESETS[trackId]));
    if (['lt', 'mt', 'ht'].includes(trackId)) {
        const p = JSON.parse(JSON.stringify(FACTORY_PRESETS.tom));
        if (trackId === 'lt') p.osc1.tune = -12;
        if (trackId === 'ht') p.osc1.tune = 12;
        return p;
    }
    return JSON.parse(JSON.stringify(FACTORY_PRESETS.bd));
}
