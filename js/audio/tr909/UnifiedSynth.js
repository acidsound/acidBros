/**
 * UnifiedSynth - A parameterized drum synthesizer.
 * Designed to exactly reproduce TR909.js playBD, playSD, playTom, playRim, playCP
 * when using FACTORY_PRESETS.
 * 
 * All time values are in SECONDS, frequencies in HZ.
 */
export class UnifiedSynth {
    constructor(ctx, output, sharedNoiseBuffer = null) {
        this.ctx = ctx;
        this.output = output;
        this.noiseBuffer = sharedNoiseBuffer || this._createNoiseBuffer();
        this.activeNodes = [];  // Track active audio nodes for cleanup
    }

    _disconnectNode(node) {
        if (!node) return;
        try {
            node.disconnect();
        } catch (e) { }
    }

    _trackNode(node, duration = 2.0, onExpire = null) {
        const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
        const expiry = this.ctx.currentTime + safeDuration;
        this.activeNodes.push({ node, expiry, onExpire });
    }

    _cleanupNodes() {
        const now = this.ctx.currentTime;
        const keep = [];
        for (const item of this.activeNodes) {
            if (item.expiry > now) {
                keep.push(item);
                continue;
            }
            try {
                if (item.onExpire) item.onExpire();
                else this._disconnectNode(item.node);
            } catch (e) { }
        }
        this.activeNodes = keep;
    }

    // Stop all currently playing sounds (prevents overlap)
    stopAll() {
        const now = this.ctx.currentTime;
        this.activeNodes.forEach(item => {
            const node = item.node;
            try {
                if (node.stop) node.stop(now);
                if (node.gain) node.gain.setValueAtTime(0, now);
            } catch (e) { /* already stopped */ }
            try {
                if (item.onExpire) item.onExpire();
                else this._disconnectNode(node);
            } catch (e) { }
        });
        this.activeNodes = [];
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

    _estimateVoiceDuration(P = {}) {
        let maxDuration = 0.2;
        const masterDecay = P.masterEnv ? Math.max(0.001, P.masterEnv.decay || 0.5) : 1.5;

        const updateOscDuration = (osc) => {
            if (!osc || !osc.enabled) return;
            const oscDecay = osc.staticLevel ? masterDecay : Math.max(0.001, osc.a_decay || 0.5);
            maxDuration = Math.max(maxDuration, oscDecay + 0.2);
        };

        updateOscDuration(P.osc1);
        updateOscDuration(P.osc2);
        updateOscDuration(P.osc3);
        updateOscDuration(P.osc4);

        if (P.click && P.click.enabled) {
            maxDuration = Math.max(maxDuration, Math.max(0.001, P.click.decay || 0.005) + 0.05);
        }

        if (P.snap && P.snap.enabled) {
            maxDuration = Math.max(maxDuration, 0.06);
        }

        const updateNoiseDuration = (noiseCfg) => {
            if (!noiseCfg || !noiseCfg.enabled) return;
            const decay = Math.max(0.001, noiseCfg.decay || 0.25);
            const burstCount = noiseCfg.burst_count || 1;
            const burstInterval = noiseCfg.burst_interval || 0.008;
            const burstLength = burstCount > 1 ? burstCount * burstInterval : 0;
            maxDuration = Math.max(maxDuration, burstLength + decay + 0.2);
        };

        updateNoiseDuration(P.noise);
        updateNoiseDuration(P.noise2);

        return maxDuration;
    }

    /**
     * Play a drum sound with the given parameters.
     * Parameter values are DIRECT (Hz for freq, seconds for decay).
     */
    play(P = {}, time = null) {
        const now = time || this.ctx.currentTime;

        // Cleanup expired nodes before starting a new one
        this._cleanupNodes();

        // Only stop all if we are playing "now" (preview/manual)
        // If it's a scheduled playback, stopping all would kill the previous step's tail.
        if (!time) {
            this.stopAll();
        }

        const safeValue = (value, fallback) => Number.isFinite(value) ? value : fallback;
        const vol = safeValue(P.vol, 1);
        const voiceDuration = this._estimateVoiceDuration(P);

        // Master Gain (can have its own envelope for Tom-style sounds)
        const masterGain = this.ctx.createGain();
        let outputNode = masterGain;
        const releaseNodes = [masterGain];

        if (P.masterEnv) {
            // Tom style: master has the envelope
            const decay = Math.max(0.001, safeValue(P.masterEnv.decay, 0.5));
            const envLevel = safeValue(P.masterEnv.level, 1.0);
            masterGain.gain.setValueAtTime(vol * envLevel, now);
            masterGain.gain.exponentialRampToValueAtTime(0.001, now + decay);
        } else {
            masterGain.gain.setValueAtTime(vol * 1.5, now);
        }

        // Optional short trigger mute gate (analog-style unwanted transient suppression).
        if (P.triggerMute && P.triggerMute > 0) {
            const trigGate = this.ctx.createGain();
            trigGate.gain.setValueAtTime(0, now);
            trigGate.gain.linearRampToValueAtTime(1.0, now + Math.max(0.0005, P.triggerMute));
            outputNode.connect(trigGate);
            outputNode = trigGate;
            releaseNodes.push(trigGate);
        }

        // Optional HPF (for RS metallic character)
        if (P.masterHPF) {
            const hpf = this.ctx.createBiquadFilter();
            hpf.type = 'highpass';
            hpf.frequency.setValueAtTime(P.masterHPF, now);
            outputNode.connect(hpf);
            outputNode = hpf;
            releaseNodes.push(hpf);
        }

        // Optional low shelf boost (used for TOM body resonance support).
        if (P.masterLowShelf) {
            const lowShelf = this.ctx.createBiquadFilter();
            lowShelf.type = 'lowshelf';
            lowShelf.frequency.setValueAtTime(P.masterLowShelf.freq || 150, now);
            lowShelf.gain.setValueAtTime(P.masterLowShelf.gain !== undefined ? P.masterLowShelf.gain : 0, now);
            outputNode.connect(lowShelf);
            outputNode = lowShelf;
            releaseNodes.push(lowShelf);
        }

        // Optional peaking resonance boost (used by TOM body shaping).
        if (P.masterPeak) {
            const peak = this.ctx.createBiquadFilter();
            peak.type = 'peaking';
            peak.frequency.setValueAtTime(P.masterPeak.freq || 120, now);
            peak.Q.setValueAtTime(P.masterPeak.Q !== undefined ? P.masterPeak.Q : 1.0, now);
            peak.gain.setValueAtTime(P.masterPeak.gain !== undefined ? P.masterPeak.gain : 0, now);
            outputNode.connect(peak);
            outputNode = peak;
            releaseNodes.push(peak);
        }

        // Backward-compatible low-pass contour support for legacy custom presets.
        if (P.masterLPF) {
            const lpf = this.ctx.createBiquadFilter();
            lpf.type = 'lowpass';
            lpf.frequency.setValueAtTime(P.masterLPF.freq || 1800, now);
            lpf.Q.setValueAtTime(P.masterLPF.Q !== undefined ? P.masterLPF.Q : 0.707, now);
            outputNode.connect(lpf);
            outputNode = lpf;
            releaseNodes.push(lpf);
        }

        // Optional high shelf boost for stick/brightness contour.
        if (P.masterHighShelf) {
            const highShelf = this.ctx.createBiquadFilter();
            highShelf.type = 'highshelf';
            highShelf.frequency.setValueAtTime(P.masterHighShelf.freq || 2400, now);
            highShelf.gain.setValueAtTime(P.masterHighShelf.gain !== undefined ? P.masterHighShelf.gain : 0, now);
            outputNode.connect(highShelf);
            outputNode = highShelf;
            releaseNodes.push(highShelf);
        }

        outputNode.connect(this.output);
        this._trackNode(outputNode, voiceDuration + 0.5, () => {
            releaseNodes.forEach(node => this._disconnectNode(node));
        });

        // Calculate masterDecay for Tom-style sounds
        const masterDecay = P.masterEnv ? Math.max(0.001, P.masterEnv.decay || 0.5) : 1.5;

        const voiceAccent = Number.isFinite(P.accent) ? Math.max(0.5, Math.min(2.0, P.accent)) : 1.0;
        const withAccent = (cfg) => {
            if (!cfg) return cfg;
            return {
                ...cfg,
                accent: (cfg.accent !== undefined ? cfg.accent : 1.0) * voiceAccent
            };
        };

        // Process Main Oscillator (osc1)
        if (P.osc1 && P.osc1.enabled) {
            this._playMainOsc(withAccent(P.osc1), now, masterGain, masterDecay);
        }

        // Process Additional Oscillators (osc2, osc3, osc4) - for SD, Tom, RS
        ['osc2', 'osc3', 'osc4'].forEach(id => {
            const cfg = P[id];
            if (cfg && cfg.enabled) {
                this._playOsc(withAccent(cfg), now, masterGain, masterDecay);
            }
        });

        // Process Click (for BD attack) - Square + Noise burst
        if (P.click && P.click.enabled) {
            this._playClick(withAccent(P.click), now, masterGain);
        }

        // Process Snap (for RS metallic bite) - Triangle pitch sweep
        if (P.snap && P.snap.enabled) {
            this._playSnap(withAccent(P.snap), now, masterGain);
        }

        // Process Noise (for SD snappy LPF, CP burst)
        if (P.noise && P.noise.enabled) {
            this._playNoise(withAccent(P.noise), now, masterGain);
        }

        // Process Noise2 (for SD snappy HPF - parallel path)
        if (P.noise2 && P.noise2.enabled) {
            this._playNoise(withAccent(P.noise2), now, masterGain);
        }
    }

    _safeNumber(value, fallback) {
        return Number.isFinite(value) ? value : fallback;
    }

    _schedulePitch(osc, cfg, now, defaultStartMultiplier = 1.0) {
        const baseFreq = Math.max(1, this._safeNumber(cfg.freq, 48));
        const pitchEnv = cfg.pitchEnv && typeof cfg.pitchEnv === 'object' ? cfg.pitchEnv : null;

        if (pitchEnv) {
            const startMultiplier = Math.max(0.01, this._safeNumber(pitchEnv.startMultiplier, 1.0));
            const cvTargetRatio = Math.max(0.01, this._safeNumber(pitchEnv.cvTargetRatio, 1.0));
            const cvDecay = Math.max(0, this._safeNumber(pitchEnv.cvDecay, 0));
            const hold = Math.max(0, this._safeNumber(pitchEnv.hold, 0));
            const dropDelay = Math.max(0, this._safeNumber(pitchEnv.dropDelay, 0));
            const dropRatio = Math.max(0.01, this._safeNumber(pitchEnv.dropRatio, 1.0));
            const dropTime = Math.max(0, this._safeNumber(pitchEnv.dropTime, 0));

            const startFreq = Math.max(1, baseFreq * startMultiplier);
            const cvTargetFreq = Math.max(1, baseFreq * cvTargetRatio);

            osc.frequency.setValueAtTime(startFreq, now);

            let cursor = now;
            if (cvDecay > 0 && Math.abs(startFreq - cvTargetFreq) > 0.001) {
                cursor = now + cvDecay;
                osc.frequency.exponentialRampToValueAtTime(cvTargetFreq, cursor);
            } else {
                osc.frequency.setValueAtTime(cvTargetFreq, now);
            }

            if (hold > 0) {
                cursor += hold;
                osc.frequency.setValueAtTime(cvTargetFreq, cursor);
            }

            if (Math.abs(dropRatio - 1.0) > 0.0001) {
                const dropStart = Math.max(now + dropDelay, cursor);
                const dropTarget = Math.max(1, baseFreq * dropRatio);
                osc.frequency.setValueAtTime(cvTargetFreq, dropStart);
                if (dropTime > 0) {
                    osc.frequency.exponentialRampToValueAtTime(dropTarget, dropStart + dropTime);
                } else {
                    osc.frequency.setValueAtTime(dropTarget, dropStart);
                }
            }

            return;
        }

        const startFreq = Math.max(
            1,
            this._safeNumber(
                cfg.startFreq,
                baseFreq * defaultStartMultiplier
            )
        );
        const endFreq = Math.max(1, this._safeNumber(cfg.endFreq, baseFreq));
        const pDecay = Math.max(0, this._safeNumber(cfg.p_decay, 0.02));

        osc.frequency.setValueAtTime(startFreq, now);
        if (startFreq !== baseFreq && pDecay > 0) {
            osc.frequency.exponentialRampToValueAtTime(baseFreq, now + pDecay);
        } else if (endFreq !== baseFreq && pDecay > 0) {
            osc.frequency.exponentialRampToValueAtTime(endFreq, now + pDecay);
        } else {
            osc.frequency.setValueAtTime(baseFreq, now);
        }
    }

    // Main oscillator with waveshaper (like BD)
    _playMainOsc(cfg, now, destination, masterDecay = 1.5) {
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        let shaper = null;

        // Wave type
        osc.type = this._parseWaveType(cfg.wave);

        // Frequency (legacy start/end ramp or CV-style pitchEnv)
        this._schedulePitch(osc, cfg, now, 6.0);

        const aDecay = cfg.a_decay || 0.5;
        const accent = Number.isFinite(cfg.accent) ? cfg.accent : 1.0;
        const level = (cfg.level || 1.0) * accent;

        if (cfg.staticLevel) {
            // Tom style: static level, master handles decay
            oscGain.gain.setValueAtTime(level, now);
        } else if (cfg.noAttack) {
            // SD style: immediate start, no ramp
            oscGain.gain.setValueAtTime(level, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.001, aDecay));
        } else {
            // BD style: 2ms attack ramp -> decay
            oscGain.gain.setValueAtTime(0, now);
            oscGain.gain.linearRampToValueAtTime(level, now + 0.002);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.001, aDecay));
        }

        // Waveshaper (saturation/drive)
        if (cfg.drive && cfg.drive > 0) {
            shaper = this.ctx.createWaveShaper();
            shaper.curve = this._makeDistortionCurve(cfg.drive);
            osc.connect(shaper);
            shaper.connect(oscGain);
        } else {
            osc.connect(oscGain);
        }

        oscGain.connect(destination);
        osc.start(now);

        // Stop time based on staticLevel
        const stopTime = cfg.staticLevel ? masterDecay : aDecay;
        osc.stop(now + stopTime + 0.1);
        this._trackNode(osc, stopTime + 0.5, () => {
            this._disconnectNode(osc);
            this._disconnectNode(shaper);
            this._disconnectNode(oscGain);
        });
    }

    // Additional oscillator (for SD/Tom/RS harmonics)
    _playOsc(cfg, now, destination, masterDecay = 1.5) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();

        osc.type = this._parseWaveType(cfg.wave);

        // Frequency (legacy start/end ramp or CV-style pitchEnv)
        this._schedulePitch(osc, cfg, now, 1.0);

        // Amplitude handling
        const accent = Number.isFinite(cfg.accent) ? cfg.accent : 1.0;
        const level = (cfg.level || 1.0) * accent;
        const aDecay = cfg.a_decay || 0.15;

        if (cfg.staticLevel) {
            // Tom style: static level, no envelope (master handles decay)
            g.gain.setValueAtTime(level, now);
        } else {
            // SD/RS style: individual decay envelope
            g.gain.setValueAtTime(level, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.001, aDecay));
        }

        osc.connect(g);
        g.connect(destination);
        osc.start(now);

        // Stop time: staticLevel uses masterDecay, others use aDecay
        const stopTime = cfg.staticLevel ? masterDecay : aDecay;
        osc.stop(now + stopTime + 0.1);
        this._trackNode(osc, stopTime + 0.5, () => {
            this._disconnectNode(osc);
            this._disconnectNode(g);
        });
    }

    // Click component for BD attack (Transient Pulse)
    _playClick(cfg, now, destination) {
        const accent = Number.isFinite(cfg.accent) ? cfg.accent : 1.0;
        const level = (cfg.level || 0.2) * accent;

        const clickOsc = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        const clickFilter = this.ctx.createBiquadFilter();

        // High frequency sine swept down extremely fast to simulate an impulse
        clickOsc.type = 'sine';
        clickOsc.frequency.setValueAtTime(cfg.startFreq || 2000, now);
        clickOsc.frequency.exponentialRampToValueAtTime(cfg.freq || 100, now + 0.002);

        clickGain.gain.setValueAtTime(level, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.001, cfg.decay || 0.005));

        // High-pass filter to remove low-end thud from the click itself
        clickFilter.type = 'highpass';
        clickFilter.frequency.setValueAtTime(cfg.filter_freq || 2000, now);

        clickOsc.connect(clickGain);
        clickGain.connect(clickFilter);
        clickFilter.connect(destination);

        clickOsc.start(now);
        const stopTime = 0.01;
        clickOsc.stop(now + stopTime);
        this._trackNode(clickOsc, stopTime + 0.5, () => {
            this._disconnectNode(clickOsc);
            this._disconnectNode(clickGain);
            this._disconnectNode(clickFilter);
        });
    }

    // Snap component for RS (Triangle with fast pitch sweep)
    _playSnap(cfg, now, destination) {
        const snap = this.ctx.createOscillator();
        const snapGain = this.ctx.createGain();

        snap.type = 'triangle';
        snap.frequency.setValueAtTime(cfg.startFreq || 1800, now);
        snap.frequency.exponentialRampToValueAtTime(cfg.endFreq || 400, now + 0.01);

        const accent = Number.isFinite(cfg.accent) ? cfg.accent : 1.0;
        const level = (cfg.level || 0.6) * accent;
        snapGain.gain.setValueAtTime(level, now);
        snapGain.gain.linearRampToValueAtTime(0, now + 0.006);

        snap.connect(snapGain);
        snapGain.connect(destination);
        snap.start(now);
        const stopTime = 0.01;
        snap.stop(now + stopTime);
        this._trackNode(snap, stopTime + 0.5, () => {
            this._disconnectNode(snap);
            this._disconnectNode(snapGain);
        });
    }

    // Noise generator with filter (for SD snappy, CP burst)
    _playNoise(cfg, now, destination) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        noise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = this._parseFilterType(cfg.filter_type);
        filter.frequency.setValueAtTime(cfg.cutoff || 4000, now);
        filter.Q.setValueAtTime(cfg.Q || 1.0, now);

        const g = this.ctx.createGain();
        const accent = Number.isFinite(cfg.accent) ? cfg.accent : 1.0;
        const level = (cfg.level || 0.5) * accent;
        const decay = Math.max(0.001, cfg.decay || 0.25);

        // Burst Mode (for CLAP)
        const burstCount = cfg.burst_count || 1;
        const burstInterval = cfg.burst_interval || 0.008;

        g.gain.setValueAtTime(0, now);

        if (burstCount > 1) {
            // Multi-hit burst (CLAP style)
            for (let i = 0; i < burstCount; i++) {
                const t = now + i * burstInterval;
                g.gain.exponentialRampToValueAtTime(level, t + 0.001);
                g.gain.exponentialRampToValueAtTime(level * 0.2, t + burstInterval);
            }
            // Final decay tail
            g.gain.exponentialRampToValueAtTime(0.001, now + burstCount * burstInterval + Math.max(0.001, decay));
        } else {
            // Single noise burst
            g.gain.setValueAtTime(level, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.001, decay));
        }

        noise.connect(filter);
        filter.connect(g);
        g.connect(destination);

        noise.start(now);
        const stopTime = (burstCount > 1 ? burstCount * burstInterval : 0) + decay;
        noise.stop(now + stopTime + 0.1);
        this._trackNode(noise, stopTime + 0.5, () => {
            this._disconnectNode(noise);
            this._disconnectNode(filter);
            this._disconnectNode(g);
        });
    }

    _parseWaveType(wave) {
        if (!wave) return 'triangle';
        const w = wave.toLowerCase();
        if (w === 'tri' || w === 'triangle') return 'triangle';
        if (w === 'sqr' || w === 'square') return 'square';
        return 'sine';
    }

    _parseFilterType(type) {
        if (!type) return 'bandpass';
        const t = type.toLowerCase();
        if (t === 'lpf' || t === 'lowpass') return 'lowpass';
        if (t === 'hpf' || t === 'highpass') return 'highpass';
        return 'bandpass';
    }

    _makeDistortionCurve(amount) {
        const k = typeof amount === 'number' ? amount : 10;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < n_samples; ++i) {
            const x = i * 2 / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }
}

// Tom pitch model derived from TR-909 circuit reverse-engineering notes.
// Frequency ratios are kept constant across tuning to preserve resonance character.
export const TOM_ROOT_FREQUENCIES = Object.freeze({
    // User-calibrated anchors against reference recordings:
    // LT ~ E2, MT ~ A2, HT ~ B2
    lt: 82.41,
    mt: 110.0,
    ht: 123.47
});
export const TOM_HARMONIC_RATIOS = Object.freeze([1.0, 1.5, 2.77]);
export const TOM_START_FREQ_MULTIPLIER = Math.pow(2, 1 / 12); // onset: +1 semitone
export const TOM_PITCH_DROP_RATIO = 1.0; // release lands on root anchor
export const TOM_CV_START_MULTIPLIER = TOM_START_FREQ_MULTIPLIER;
export const TOM_CV_DECAY_TIME = 0.14;
export const TOM_PITCH_DROP_DELAY = 0.0;
export const TOM_PITCH_DROP_TIME = 0.14;
const TOM_TUNE_SCALE_MIN = 0.7;
const TOM_TUNE_SCALE_MAX = 1.3;

export function mapTomTuneToScale(knob = 50) {
    const clamped = Math.max(0, Math.min(100, Number.isFinite(knob) ? knob : 50));
    return TOM_TUNE_SCALE_MIN + (clamped / 100) * (TOM_TUNE_SCALE_MAX - TOM_TUNE_SCALE_MIN);
}

export function getTomFrequencies(trackId = 'mt', tuneKnob = 50) {
    const root = (TOM_ROOT_FREQUENCIES[trackId] || TOM_ROOT_FREQUENCIES.mt) * mapTomTuneToScale(tuneKnob);
    return TOM_HARMONIC_RATIOS.map(ratio => root * ratio);
}

export function createTomPitchEnv() {
    return {
        startMultiplier: TOM_CV_START_MULTIPLIER,
        cvTargetRatio: 1.0,
        cvDecay: TOM_CV_DECAY_TIME,
        dropDelay: TOM_PITCH_DROP_DELAY,
        dropRatio: TOM_PITCH_DROP_RATIO,
        dropTime: TOM_PITCH_DROP_TIME
    };
}

export const DRUM_SHAPER_DEFAULTS = Object.freeze({
    bd: Object.freeze({ enabled: false, pitchMode: 'legacy', drop: 50, ring: 50, bright: 50 }),
    sd: Object.freeze({ enabled: false, pitchMode: 'legacy', drop: 50, ring: 50, bright: 50 }),
    lt: Object.freeze({ enabled: true, pitchMode: 'cv', drop: 100, ring: 100, bright: 100 }),
    mt: Object.freeze({ enabled: true, pitchMode: 'cv', drop: 100, ring: 100, bright: 100 }),
    ht: Object.freeze({ enabled: true, pitchMode: 'cv', drop: 100, ring: 100, bright: 100 }),
    rs: Object.freeze({ enabled: false, pitchMode: 'legacy', drop: 50, ring: 50, bright: 50 }),
    cp: Object.freeze({ enabled: false, pitchMode: 'legacy', drop: 50, ring: 50, bright: 50 }),
    default: Object.freeze({ enabled: false, pitchMode: 'legacy', drop: 50, ring: 50, bright: 50 })
});

export function getDefaultDrumShaper(trackId = 'default') {
    const base = DRUM_SHAPER_DEFAULTS[trackId] || DRUM_SHAPER_DEFAULTS.default;
    return { ...base };
}

export const SNAPPY_DEFAULTS = Object.freeze({
    bd: Object.freeze({ enabled: false, amount: 0, tone: 50, decay: 50 }),
    sd: Object.freeze({ enabled: false, amount: 50, tone: 50, decay: 50 }),
    lt: Object.freeze({ enabled: false, amount: 0, tone: 50, decay: 50 }),
    mt: Object.freeze({ enabled: false, amount: 0, tone: 50, decay: 50 }),
    ht: Object.freeze({ enabled: false, amount: 0, tone: 50, decay: 50 }),
    rs: Object.freeze({ enabled: false, amount: 0, tone: 50, decay: 50 }),
    cp: Object.freeze({ enabled: false, amount: 35, tone: 58, decay: 45 }),
    default: Object.freeze({ enabled: false, amount: 0, tone: 50, decay: 50 })
});

export function getDefaultSnappy(trackId = 'default') {
    const base = SNAPPY_DEFAULTS[trackId] || SNAPPY_DEFAULTS.default;
    return { ...base };
}

const _defaultLevelControl = Object.freeze({
    id: 'level',
    label: 'LEVEL',
    min: 0,
    max: 200,
    def: 100,
    step: 1,
    sourceKeys: Object.freeze(['level', 'vol'])
});

function _buildTomPreviewProfile(trackId) {
    const [f1Min, f2Min, f3Min] = getTomFrequencies(trackId, 0);
    const [f1Max, f2Max, f3Max] = getTomFrequencies(trackId, 100);
    const [f1Base, f2Base, f3Base] = getTomFrequencies(trackId, 50);

    return {
        mode: 'direct',
        controls: [
            {
                id: 'tune',
                label: 'TUNE',
                min: 0,
                max: 100,
                def: 50,
                step: 1,
                sourceKeys: ['tune', 'p1'],
                targets: [
                    { path: 'osc1.freq', mode: 'mul', outMin: f1Min / f1Base, outMax: f1Max / f1Base },
                    { path: 'osc2.freq', mode: 'mul', outMin: f2Min / f2Base, outMax: f2Max / f2Base },
                    { path: 'osc3.freq', mode: 'mul', outMin: f3Min / f3Base, outMax: f3Max / f3Base },
                    { path: 'osc1.startFreq', mode: 'mul', outMin: f1Min / f1Base, outMax: f1Max / f1Base },
                    { path: 'osc2.startFreq', mode: 'mul', outMin: f2Min / f2Base, outMax: f2Max / f2Base },
                    { path: 'osc3.startFreq', mode: 'mul', outMin: f3Min / f3Base, outMax: f3Max / f3Base },
                    { path: 'osc1.endFreq', mode: 'mul', outMin: f1Min / f1Base, outMax: f1Max / f1Base },
                    { path: 'osc2.endFreq', mode: 'mul', outMin: f2Min / f2Base, outMax: f2Max / f2Base },
                    { path: 'osc3.endFreq', mode: 'mul', outMin: f3Min / f3Base, outMax: f3Max / f3Base },
                    { path: 'osc1.p_decay', value: TOM_PITCH_DROP_TIME },
                    { path: 'osc2.p_decay', value: TOM_PITCH_DROP_TIME },
                    { path: 'osc3.p_decay', value: TOM_PITCH_DROP_TIME },
                    { path: 'osc1.pitchEnv.startMultiplier', value: TOM_CV_START_MULTIPLIER },
                    { path: 'osc1.pitchEnv.cvTargetRatio', value: 1.0 },
                    { path: 'osc1.pitchEnv.cvDecay', value: TOM_CV_DECAY_TIME },
                    { path: 'osc1.pitchEnv.dropDelay', value: TOM_PITCH_DROP_DELAY },
                    { path: 'osc1.pitchEnv.dropRatio', value: TOM_PITCH_DROP_RATIO },
                    { path: 'osc1.pitchEnv.dropTime', value: TOM_PITCH_DROP_TIME },
                    { path: 'osc2.pitchEnv.startMultiplier', value: TOM_CV_START_MULTIPLIER },
                    { path: 'osc2.pitchEnv.cvTargetRatio', value: 1.0 },
                    { path: 'osc2.pitchEnv.cvDecay', value: TOM_CV_DECAY_TIME },
                    { path: 'osc2.pitchEnv.dropDelay', value: TOM_PITCH_DROP_DELAY },
                    { path: 'osc2.pitchEnv.dropRatio', value: TOM_PITCH_DROP_RATIO },
                    { path: 'osc2.pitchEnv.dropTime', value: TOM_PITCH_DROP_TIME },
                    { path: 'osc3.pitchEnv.startMultiplier', value: TOM_CV_START_MULTIPLIER },
                    { path: 'osc3.pitchEnv.cvTargetRatio', value: 1.0 },
                    { path: 'osc3.pitchEnv.cvDecay', value: TOM_CV_DECAY_TIME },
                    { path: 'osc3.pitchEnv.dropDelay', value: TOM_PITCH_DROP_DELAY },
                    { path: 'osc3.pitchEnv.dropRatio', value: TOM_PITCH_DROP_RATIO },
                    { path: 'osc3.pitchEnv.dropTime', value: TOM_PITCH_DROP_TIME },
                    { path: 'masterLowShelf.freq', mode: 'mul', outMin: f1Min / f1Base, outMax: f1Max / f1Base },
                    { path: 'masterPeak.freq', mode: 'mul', outMin: f1Min / f1Base, outMax: f1Max / f1Base },
                    { path: 'masterHighShelf.freq', mode: 'mul', outMin: f3Min / f3Base, outMax: f3Max / f3Base },
                    { path: 'noise.cutoff', mode: 'mul', outMin: f3Min / f3Base, outMax: f3Max / f3Base }
                ]
            },
            {
                id: 'decay',
                label: 'DECAY',
                min: 0,
                max: 100,
                def: 50,
                step: 1,
                sourceKeys: ['decay', 'p2'],
                targets: [
                    { path: 'osc1.staticLevel', value: false },
                    { path: 'osc2.staticLevel', value: false },
                    { path: 'osc3.staticLevel', value: false },
                    { path: 'osc1.noAttack', value: true },
                    { path: 'osc2.noAttack', value: true },
                    { path: 'osc3.noAttack', value: true },
                    { path: 'osc1.a_decay', mode: 'mul', outMin: 0.278, outMax: 2.5 },
                    { path: 'osc2.a_decay', mode: 'mul', outMin: 0.282, outMax: 2.536 },
                    { path: 'osc3.a_decay', mode: 'mul', outMin: 0.277, outMax: 2.492 },
                    { path: 'noise.decay', mode: 'mul', outMin: 0.267, outMax: 1.767 },
                    { path: 'masterEnv.decay', mode: 'mul', outMin: 0.2, outMax: 1.8 }
                ]
            },
            { ..._defaultLevelControl }
        ]
    };
}

function _createLegacyPreviewProfile(trackId = 'default') {
    switch (trackId) {
        case 'bd':
            return {
                mode: 'direct',
                controls: [
                    {
                        id: 'tune',
                        label: 'TUNE',
                        min: 0,
                        max: 100,
                        def: 40,
                        step: 1,
                sourceKeys: ['tune', 'p1'],
                targets: [
                            { path: 'osc1.freq', mode: 'mul', outMin: 0.747664, outMax: 1.214953 },
                            { path: 'osc1.startFreq', mode: 'mul', outMin: 0.747664, outMax: 1.214953 },
                            { path: 'osc1.p_decay', mode: 'mul', points: [[0, 0.090909], [40, 0.363636], [100, 3.090909]] }
                        ]
                    },
                    {
                        id: 'attack',
                        label: 'ATTACK',
                        min: 0,
                        max: 100,
                        def: 50,
                        step: 1,
                        sourceKeys: ['attack', 'p2'],
                        targets: [
                            { path: 'click.level', mode: 'mul', outMin: 0.0, outMax: 1.25 }
                        ]
                    },
                    {
                        id: 'decay',
                        label: 'DECAY',
                        min: 0,
                        max: 100,
                        def: 50,
                        step: 1,
                        sourceKeys: ['decay', 'p3'],
                        targets: [{ path: 'osc1.a_decay', mode: 'mul', outMin: 0.2, outMax: 4.0 }]
                    },
                    { ..._defaultLevelControl }
                ]
            };
        case 'sd':
            return {
                mode: 'direct',
                controls: [
                    {
                        id: 'tune',
                        label: 'TUNE',
                        min: 0,
                        max: 100,
                        def: 50,
                        step: 1,
                sourceKeys: ['tune', 'p1'],
                targets: [
                            { path: 'osc1.freq', mode: 'mul', outMin: 1.0, outMax: 1.333333 },
                            { path: 'osc1.startFreq', mode: 'mul', outMin: 1.0, outMax: 1.333333 },
                            { path: 'osc2.freq', mode: 'mul', outMin: 1.0, outMax: 1.333333 },
                            { path: 'osc2.startFreq', mode: 'mul', outMin: 1.0, outMax: 1.333333 }
                        ]
                    },
                    {
                        id: 'tone',
                        label: 'TONE',
                        min: 0,
                        max: 100,
                        def: 50,
                        step: 1,
                        sourceKeys: ['tone', 'p2'],
                        targets: [
                            { path: 'noise.cutoff', mode: 'mul', outMin: 0.666667, outMax: 1.333333 },
                            { path: 'noise2.cutoff', mode: 'mul', outMin: 0.545455, outMax: 1.454545 }
                        ]
                    },
                    {
                        id: 'snappy',
                        label: 'SNAPPY',
                        min: 0,
                        max: 100,
                        def: 50,
                        step: 1,
                        sourceKeys: ['snappy', 'p3'],
                        targets: [
                            { path: 'noise.level', mode: 'mul', outMin: 0.0, outMax: 2.0 },
                            { path: 'noise2.level', mode: 'mul', outMin: 0.0, outMax: 2.0 }
                        ]
                    },
                    { ..._defaultLevelControl }
                ]
            };
        case 'lt':
        case 'mt':
        case 'ht':
            return _buildTomPreviewProfile(trackId);
        case 'cp':
            return {
                mode: 'direct',
                controls: [
                    {
                        id: 'decay',
                        label: 'DECAY',
                        min: 0,
                        max: 100,
                        def: 50,
                        step: 1,
                        sourceKeys: ['decay', 'p2'],
                        targets: [{ path: 'noise.decay', mode: 'mul', outMin: 0.5, outMax: 2.0 }]
                    },
                    { ..._defaultLevelControl }
                ]
            };
        case 'rs':
            return {
                mode: 'direct',
                controls: [{ ..._defaultLevelControl }]
            };
        default:
            return {
                mode: 'direct',
                controls: [{ ..._defaultLevelControl }]
            };
    }
}

function _cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
}

function _normalizePreviewControl(control, fallback = {}) {
    const id = typeof control?.id === 'string' ? control.id.trim() : '';
    if (!id) return null;

    const fallbackMin = Number.isFinite(fallback.min) ? fallback.min : 0;
    const fallbackMax = Number.isFinite(fallback.max) ? fallback.max : 100;
    const min = Number.isFinite(control.min) ? control.min : fallbackMin;
    const max = Number.isFinite(control.max) ? control.max : fallbackMax;
    const step = Number.isFinite(control.step) ? control.step : (Number.isFinite(fallback.step) ? fallback.step : 1);
    const def = Number.isFinite(control.def)
        ? _clamp(control.def, min, max)
        : (Number.isFinite(fallback.def) ? _clamp(fallback.def, min, max) : min);

    const normalized = {
        id,
        label: typeof control.label === 'string' && control.label.trim() ? control.label : id.toUpperCase(),
        min,
        max,
        def,
        step
    };

    if (Array.isArray(control.sourceKeys) && control.sourceKeys.length > 0) {
        normalized.sourceKeys = control.sourceKeys.filter((key) => typeof key === 'string' && key.trim());
    } else if (Array.isArray(fallback.sourceKeys) && fallback.sourceKeys.length > 0) {
        normalized.sourceKeys = [...fallback.sourceKeys];
    }

    if (Array.isArray(control.targets) && control.targets.length > 0) {
        normalized.targets = _cloneDeep(control.targets);
    } else if (control.target !== undefined) {
        normalized.target = _cloneDeep(control.target);
    } else if (Array.isArray(fallback.targets) && fallback.targets.length > 0) {
        normalized.targets = _cloneDeep(fallback.targets);
    } else if (fallback.target !== undefined) {
        normalized.target = _cloneDeep(fallback.target);
    }

    return normalized;
}

function _findLevelControl(profile) {
    if (!profile || !Array.isArray(profile.controls)) return null;
    return profile.controls.find((control) => control.id === 'level') || null;
}

function _normalizePreviewProfile(trackId = 'default', profile = null) {
    const fallback = _cloneDeep(_createLegacyPreviewProfile(trackId));
    const mode = (typeof profile?.mode === 'string' && profile.mode.trim())
        ? profile.mode.trim().toLowerCase()
        : (fallback.mode || 'direct');

    const rawControls = Array.isArray(profile?.controls) && profile.controls.length > 0
        ? profile.controls
        : fallback.controls;

    const controls = [];
    rawControls.forEach((control) => {
        const fallbackControl = fallback.controls.find((item) => item.id === control.id) || {};
        const normalized = _normalizePreviewControl(control, fallbackControl);
        if (normalized) controls.push(normalized);
    });

    if (controls.length === 0) {
        fallback.controls.forEach((control) => {
            const normalized = _normalizePreviewControl(control, control);
            if (normalized) controls.push(normalized);
        });
    }

    if (!_findLevelControl({ controls })) {
        const fallbackLevel = _findLevelControl(fallback) || _defaultLevelControl;
        const normalizedLevel = _normalizePreviewControl(fallbackLevel, fallbackLevel);
        if (normalizedLevel) controls.push(normalizedLevel);
    }

    return { mode, controls };
}

export function getDefaultPreviewProfile(trackId = 'default') {
    return _normalizePreviewProfile(trackId, null);
}

export function resolvePreviewProfile(trackId = 'default', patch = null) {
    const candidate = patch?.previewProfile || patch?.preview?.profile || null;
    return _normalizePreviewProfile(trackId, candidate);
}

function _getControlFallback(control) {
    return Number.isFinite(control.def) ? control.def : control.min;
}

export function getPreviewControlValues(trackId = 'default', params = {}, profile = null) {
    const resolvedProfile = _normalizePreviewProfile(trackId, profile);
    const values = {};

    resolvedProfile.controls.forEach((control) => {
        let value = Number.isFinite(params?.[control.id]) ? params[control.id] : null;

        if (!Number.isFinite(value) && Array.isArray(control.sourceKeys)) {
            for (const sourceKey of control.sourceKeys) {
                if (sourceKey === 'vol' && Number.isFinite(params?.vol)) {
                    value = params.vol * 100;
                    break;
                }
                if (Number.isFinite(params?.[sourceKey])) {
                    value = params[sourceKey];
                    break;
                }
            }
        }

        if (!Number.isFinite(value) && control.id === 'level' && Number.isFinite(params?.vol)) {
            value = params.vol * 100;
        }

        if (!Number.isFinite(value)) {
            value = _getControlFallback(control);
        }

        values[control.id] = _clamp(value, control.min, control.max);
    });

    return values;
}

function _getNestedValue(obj, path) {
    if (!obj || typeof obj !== 'object' || typeof path !== 'string' || !path) return undefined;
    return path.split('.').reduce((cursor, segment) => {
        if (!cursor || typeof cursor !== 'object') return undefined;
        return cursor[segment];
    }, obj);
}

function _setNestedValue(obj, path, value) {
    if (!obj || typeof obj !== 'object' || typeof path !== 'string' || !path) return false;
    const keys = path.split('.');
    let cursor = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
            cursor[key] = {};
        }
        cursor = cursor[key];
    }
    cursor[keys[keys.length - 1]] = value;
    return true;
}

function _interpolatePoints(points = [], input) {
    if (!Array.isArray(points) || points.length === 0) return input;
    const normalized = points
        .filter((pair) => Array.isArray(pair) && Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
        .map((pair) => [pair[0], pair[1]])
        .sort((a, b) => a[0] - b[0]);
    if (normalized.length === 0) return input;
    if (normalized.length === 1) return normalized[0][1];
    if (input <= normalized[0][0]) return normalized[0][1];
    const last = normalized[normalized.length - 1];
    if (input >= last[0]) return last[1];

    for (let i = 0; i < normalized.length - 1; i++) {
        const a = normalized[i];
        const b = normalized[i + 1];
        if (input < a[0] || input > b[0]) continue;
        const span = b[0] - a[0];
        if (span <= 0) return b[1];
        const t = (input - a[0]) / span;
        return a[1] + t * (b[1] - a[1]);
    }
    return input;
}

function _mapControlToTarget(control, target, rawValue, preset) {
    const t = (target && typeof target === 'object' && !Array.isArray(target)) ? target : {};
    if (Object.prototype.hasOwnProperty.call(t, 'value')) {
        return t.value;
    }

    let input = rawValue;
    if (typeof t.fromPath === 'string' && t.fromPath) {
        const source = _getNestedValue(preset, t.fromPath);
        if (Number.isFinite(source)) {
            input = source;
        }
    }

    let value = input;
    const inMin = Number.isFinite(t.inMin) ? t.inMin : (Number.isFinite(control.min) ? control.min : 0);
    const inMax = Number.isFinite(t.inMax) ? t.inMax : (Number.isFinite(control.max) ? control.max : 100);
    const inSpan = Math.max(0.000001, inMax - inMin);
    const normalized = _clamp((input - inMin) / inSpan, 0, 1);

    if (Array.isArray(t.points) && t.points.length > 0) {
        value = _interpolatePoints(t.points, input);
    } else if (Number.isFinite(t.outMin) && Number.isFinite(t.outMax)) {
        value = t.outMin + normalized * (t.outMax - t.outMin);
    } else {
        if (Number.isFinite(t.scale)) value *= t.scale;
        if (Number.isFinite(t.offset)) value += t.offset;
    }

    if (typeof t.mulPath === 'string' && t.mulPath) {
        const mul = _getNestedValue(preset, t.mulPath);
        if (Number.isFinite(mul)) {
            value *= mul;
        }
    }

    if (typeof t.addPath === 'string' && t.addPath) {
        const add = _getNestedValue(preset, t.addPath);
        if (Number.isFinite(add)) {
            value += add;
        }
    }

    if (Number.isFinite(t.min) || Number.isFinite(t.max)) {
        value = _clamp(
            value,
            Number.isFinite(t.min) ? t.min : value,
            Number.isFinite(t.max) ? t.max : value
        );
    }
    return value;
}

function _applyDirectPreviewProfile(preset, values, profile) {
    profile.controls.forEach((control) => {
        const raw = Number.isFinite(values[control.id]) ? values[control.id] : _getControlFallback(control);
        const targets = Array.isArray(control.targets)
            ? control.targets
            : (control.target !== undefined ? [control.target] : []);

        targets.forEach((target) => {
            const descriptor = typeof target === 'string' ? { path: target } : target;
            if (!descriptor || typeof descriptor.path !== 'string' || !descriptor.path) return;

            const mapped = _mapControlToTarget(control, descriptor, raw, preset);
            if (descriptor.mode === 'add') {
                const current = _getNestedValue(preset, descriptor.path);
                const base = Number.isFinite(current) ? current : 0;
                _setNestedValue(preset, descriptor.path, base + mapped);
                return;
            }
            if (descriptor.mode === 'mul') {
                const current = _getNestedValue(preset, descriptor.path);
                const base = Number.isFinite(current) ? current : 1;
                _setNestedValue(preset, descriptor.path, base * mapped);
                return;
            }
            _setNestedValue(preset, descriptor.path, mapped);
        });
    });
}

export function resolveVoiceAccentGain(accent) {
    if (accent === undefined || accent === null) return 1.0;
    if (typeof accent === 'boolean') return accent ? 1.35 : 1.0;
    const n = Number(accent);
    if (!Number.isFinite(n)) return 1.0;
    if (n <= 1.0) return 1.0 + Math.max(0, n) * 0.35;
    return Math.max(0.5, Math.min(2.0, n));
}

export function applyTrackPerformanceControls(preset, trackId, params = {}, profile = null) {
    if (!preset || typeof preset !== 'object') return preset;

    const resolvedProfile = _normalizePreviewProfile(trackId, profile);
    const values = getPreviewControlValues(trackId, params, resolvedProfile);
    const level = Number.isFinite(values.level) ? values.level : 100;
    preset.vol = level / 100;
    preset.accent = resolveVoiceAccentGain(params.accent);
    _applyDirectPreviewProfile(preset, values, resolvedProfile);

    const shaper = (preset.shaper && typeof preset.shaper === 'object')
        ? preset.shaper
        : ((preset.tomMacros && typeof preset.tomMacros === 'object') ? preset.tomMacros : null);
    if (shaper) {
        applyShaperControls(preset, shaper);
    }

    return preset;
}

export function mergePresetWithBase(trackId, customPatch) {
    const patch = (customPatch && typeof customPatch === 'object')
        ? _cloneDeep(customPatch)
        : null;

    if (!patch || Object.keys(patch).length === 0) {
        return getFactoryPreset(trackId);
    }

    if (patch.tomMacros && !patch.shaper) {
        patch.shaper = { ...patch.tomMacros };
    }
    delete patch.basePreset;
    delete patch.base;
    delete patch.inheritFactory;
    if (patch.meta && typeof patch.meta === 'object') {
        delete patch.meta.basePreset;
        delete patch.meta.base;
    }

    return patch;
}

function _clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}

function _normMacro(value, fallback = 50) {
    const v = Number.isFinite(value) ? value : fallback;
    const clamped = _clamp(v, 0, 100);
    return {
        raw: clamped,
        norm: (clamped - 50) / 50
    };
}

function _safeMul(base, factor, min = 0.001, max = 10) {
    const b = Number.isFinite(base) ? base : min;
    return _clamp(b * factor, min, max);
}

// Apply DRUM SHAPER controls:
// - drop: pitch sweep contour
// - ring: body resonance/decay
// - bright: high-frequency attack/air
export function applyShaperControls(preset, shaper = {}) {
    if (!preset || typeof preset !== 'object') {
        return preset;
    }
    const safeNumber = (value, fallback) => Number.isFinite(value) ? value : fallback;

    const drop = _normMacro(shaper.drop, 50);
    const ring = _normMacro(shaper.ring, 50);
    const bright = _normMacro(shaper.bright, 50);
    const enabled = shaper.enabled !== false;

    const pitchMode = (typeof shaper.pitchMode === 'string' && shaper.pitchMode.toLowerCase() === 'cv')
        ? 'cv'
        : 'legacy';

    const normalized = {
        enabled,
        pitchMode,
        drop: drop.raw,
        ring: ring.raw,
        bright: bright.raw
    };

    if (!enabled) {
        preset.shaper = normalized;
        preset.tomMacros = { ...normalized };
        return preset;
    }

    // Keep DROP center (50) neutral for all instruments.
    const useCvPitch = pitchMode === 'cv';
    const dropSemitone = _clamp(drop.norm * 2.0, -2.0, 2.0);
    const dropPitchMul = Math.pow(2, dropSemitone / 12);

    let refHighFreq = null;
    ['osc1', 'osc2', 'osc3', 'osc4'].forEach((oscId, index) => {
        const osc = preset[oscId];
        if (!osc || osc.enabled === false) return;

        const basePDecay = _clamp(safeNumber(osc.p_decay, 0.08), 0.003, 0.5);
        const oscDropTime = _clamp(basePDecay * (1 + drop.norm * (useCvPitch ? 0.9 : 0.6)), 0.003, 0.5);
        const freq = Number.isFinite(osc.freq) ? osc.freq : null;
        let baseStartFreq = null;
        if (freq && freq > 0) {
            baseStartFreq = Number.isFinite(osc.startFreq) ? osc.startFreq : freq;
            osc.startFreq = _clamp(baseStartFreq * dropPitchMul, 1, 20000);
            if (useCvPitch) {
                osc.endFreq = freq;
            }
            osc.p_decay = oscDropTime;
            refHighFreq = Math.max(refHighFreq || 0, freq);
        }

        if (useCvPitch) {
            const basePitchEnv = (osc.pitchEnv && typeof osc.pitchEnv === 'object') ? osc.pitchEnv : {};
            const fallbackStartMul = (freq && Number.isFinite(baseStartFreq))
                ? _clamp(baseStartFreq / freq, 0.5, 3.0)
                : 1.0;
            const baseStartMul = _clamp(safeNumber(basePitchEnv.startMultiplier, fallbackStartMul), 0.5, 3.0);
            const baseCvDecay = _clamp(safeNumber(basePitchEnv.cvDecay, basePDecay), 0.003, 0.5);

            osc.pitchEnv = {
                startMultiplier: _clamp(baseStartMul * dropPitchMul, 0.5, 3.0),
                cvTargetRatio: _clamp(safeNumber(basePitchEnv.cvTargetRatio, 1.0), 0.25, 4.0),
                cvDecay: _clamp(baseCvDecay * (1 + drop.norm * 0.5), 0.003, 0.5),
                dropDelay: Math.max(0, safeNumber(basePitchEnv.dropDelay, 0.0)),
                dropRatio: _clamp(safeNumber(basePitchEnv.dropRatio, 1.0), 0.25, 4.0),
                dropTime: oscDropTime
            };
        }

        if (Number.isFinite(osc.a_decay)) {
            const ringDecayScale = 1 + ring.norm * (index === 0 ? 0.55 : index === 1 ? 0.35 : 0.24);
            const brightDecayScale = 1 + bright.norm * (index === 0 ? 0.12 : 0.22);
            osc.a_decay = _safeMul(osc.a_decay, ringDecayScale * brightDecayScale, 0.003, 3.0);
        }
        if (Number.isFinite(osc.level)) {
            const ringLevelScale = 1 + ring.norm * (index === 0 ? 0.12 : 0.07);
            const brightLevelScale = 1 + bright.norm * (index === 0 ? 0.1 : 0.35);
            osc.level = _safeMul(osc.level, ringLevelScale * brightLevelScale, 0.005, 2.5);
        }
        if (Number.isFinite(osc.drive)) {
            osc.drive = _safeMul(osc.drive, 1 + ring.norm * 0.2 + bright.norm * 0.12, 0, 40);
        }
    });

    const refBaseFreq = Number.isFinite(preset.osc1?.freq) ? preset.osc1.freq : null;
    const refFreq = refHighFreq || refBaseFreq;
    const airScale = 1 + bright.norm * 0.7;

    if (preset.masterLowShelf && Number.isFinite(preset.masterLowShelf.gain)) {
        preset.masterLowShelf.gain = _clamp(preset.masterLowShelf.gain + ring.norm * 1.8 - bright.norm * 0.6, -6, 10);
    }
    if (preset.masterPeak) {
        if (Number.isFinite(preset.masterPeak.gain)) {
            preset.masterPeak.gain = _clamp(preset.masterPeak.gain + ring.norm * 1.3, -6, 10);
        }
        if (Number.isFinite(preset.masterPeak.Q)) {
            preset.masterPeak.Q = _clamp(preset.masterPeak.Q + ring.norm * 0.2, 0.5, 1.6);
        }
    }
    if (preset.masterHighShelf) {
        if (Number.isFinite(preset.masterHighShelf.gain)) {
            preset.masterHighShelf.gain = _clamp(preset.masterHighShelf.gain + bright.norm * 2.6, -6, 10);
        }
        if (Number.isFinite(preset.masterHighShelf.freq)) {
            preset.masterHighShelf.freq = _safeMul(preset.masterHighShelf.freq, 1 + bright.norm * 0.2, 300, 12000);
        } else if (refFreq) {
            preset.masterHighShelf.freq = refFreq * (1.7 + (bright.raw / 100) * 0.7);
        }
    }

    ['noise', 'noise2'].forEach((noiseId) => {
        const noise = preset[noiseId];
        if (!noise || noise.enabled === false) return;

        if (refFreq && Number.isFinite(noise.cutoff)) {
            const baseMul = noiseId === 'noise2' ? 1.7 : 2.2;
            const brightMul = noiseId === 'noise2' ? 1.0 : 1.4;
            noise.cutoff = refFreq * (baseMul + (bright.raw / 100) * brightMul);
        }
        if (Number.isFinite(noise.Q)) {
            noise.Q = _clamp(noise.Q + bright.norm * 0.3 + ring.norm * 0.08, 0.3, 2.0);
        }
        if (Number.isFinite(noise.level)) {
            noise.level = _safeMul(noise.level, airScale, 0.002, 3.0);
        }
        if (Number.isFinite(noise.decay)) {
            const noiseScale = 1 + ring.norm * 0.35 + bright.norm * 0.15;
            noise.decay = _safeMul(noise.decay, noiseScale, 0.001, 2.0);
        }
    });

    if (preset.click) {
        if (Number.isFinite(preset.click.level)) {
            const clickScale = 1 + bright.norm * 0.5 + ring.norm * 0.1;
            preset.click.level = _safeMul(preset.click.level, clickScale, 0.001, 1.2);
        }
        if (Number.isFinite(preset.click.decay)) {
            preset.click.decay = _safeMul(preset.click.decay, 1 + ring.norm * 0.2, 0.001, 0.08);
        }
        if (Number.isFinite(preset.click.filter_freq)) {
            preset.click.filter_freq = _safeMul(preset.click.filter_freq, 1 + bright.norm * 0.25, 120, 12000);
        }
    }

    if (preset.snap) {
        if (Number.isFinite(preset.snap.level)) {
            preset.snap.level = _safeMul(preset.snap.level, 1 + bright.norm * 0.35, 0.001, 1.5);
        }
        if (Number.isFinite(preset.snap.startFreq)) {
            preset.snap.startFreq = _safeMul(preset.snap.startFreq, 1 + bright.norm * 0.2, 60, 6000);
        }
    }

    preset.shaper = normalized;
    // Legacy compatibility for saved patches created before rename.
    preset.tomMacros = { ...normalized };
    return preset;
}

// Backward-compatible alias.
export function applyTomMacroControls(preset, macros = {}, trackId = '') {
    return applyShaperControls(preset, macros);
}

export function applySnappyControls(preset, snappy = {}) {
    if (!preset || typeof preset !== 'object') return preset;

    const amount = _normMacro(snappy.amount, 0);
    const tone = _normMacro(snappy.tone, 50);
    const decay = _normMacro(snappy.decay, 50);
    const enabled = snappy.enabled === true || amount.raw > 0;

    const normalized = {
        enabled,
        amount: amount.raw,
        tone: tone.raw,
        decay: decay.raw
    };
    if (!enabled) {
        preset.macros = { ...(preset.macros || {}), snappy: normalized };
        return preset;
    }

    const amt = amount.raw / 100;
    const toneNorm = tone.norm;
    const decayNorm = decay.norm;

    if (preset.noise) {
        preset.noise.enabled = true;
        if (Number.isFinite(preset.noise.level)) {
            preset.noise.level = _safeMul(preset.noise.level, 1 + amt * 1.2, 0.001, 3.0);
        }
        if (Number.isFinite(preset.noise.cutoff)) {
            preset.noise.cutoff = _safeMul(preset.noise.cutoff, 1 + toneNorm * 0.35 + amt * 0.2, 120, 12000);
        }
        if (Number.isFinite(preset.noise.decay)) {
            preset.noise.decay = _safeMul(preset.noise.decay, 1 + decayNorm * 0.5 + amt * 0.35, 0.002, 2.0);
        }
    }

    // Build/strengthen HPF snappy path if absent.
    if (!preset.noise2 && preset.noise) {
        preset.noise2 = {
            ...preset.noise,
            filter_type: 'highpass',
            cutoff: Math.min(12000, Math.max(200, (preset.noise.cutoff || 2000) * 0.45)),
            level: (preset.noise.level || 0.3) * 0.55,
            decay: Math.max(0.002, (preset.noise.decay || 0.15) * 0.7),
            enabled: true
        };
    }
    if (preset.noise2) {
        preset.noise2.enabled = true;
        if (Number.isFinite(preset.noise2.level)) {
            preset.noise2.level = _safeMul(preset.noise2.level, 1 + amt * 1.4, 0.001, 3.0);
        }
        if (Number.isFinite(preset.noise2.cutoff)) {
            preset.noise2.cutoff = _safeMul(preset.noise2.cutoff, 1 + toneNorm * 0.5 + amt * 0.15, 120, 12000);
        }
        if (Number.isFinite(preset.noise2.decay)) {
            preset.noise2.decay = _safeMul(preset.noise2.decay, 1 + decayNorm * 0.6 + amt * 0.25, 0.002, 2.0);
        }
    }

    preset.macros = { ...(preset.macros || {}), snappy: normalized };
    return preset;
}

export function applyMacroControls(preset, macros = {}) {
    if (!preset || typeof preset !== 'object') return preset;

    // Backward compatibility for legacy patch shape.
    const shaper = macros.shaper || preset.shaper || preset.tomMacros || null;
    if (shaper) {
        applyShaperControls(preset, shaper);
    }

    const snappy = macros.snappy || null;
    if (snappy) {
        applySnappyControls(preset, snappy);
    }

    if (shaper || snappy) {
        preset.macros = {
            ...(preset.macros || {}),
            ...(shaper ? { shaper: preset.shaper || shaper } : {}),
            ...(snappy ? { snappy: preset.macros?.snappy || snappy } : {})
        };
    }
    return preset;
}

const [MT_OSC1_FREQ, MT_OSC2_FREQ, MT_OSC3_FREQ] = getTomFrequencies('mt', 50);

/**
 * FACTORY_PRESETS - Exact values from TR909.js playBD, playSD, playTom, playRim, playCP
 * All time values in SECONDS, frequencies in HZ.
 * These represent default knob positions (p1=40, p2=50, p3=50)
 */
export const FACTORY_PRESETS = {
    bd: {
        // TR909 playBD (Schematic updated): Sine ~53Hz, pitch ~265Hz->53Hz in 55ms (Tune ~54)
        // Click: Sine sweep impulse through 2000Hz HPF
        osc1: {
            enabled: true,
            wave: 'sine',
            freq: 53.5,          // 40 + (54 / 100) * 25
            startFreq: 267.5,    // freq * 5
            p_decay: 0.055,      // 0.02 + ((54 - 40) / 60) * 0.150 = 0.055
            a_decay: 0.5,        // 500ms amplitude decay (at p3=50)
            drive: 4,            // Increased drive for harmonics and loudness
            level: 1.5           // Boosted base level
        },
        click: {
            enabled: true,
            startFreq: 2000,
            freq: 100,
            decay: 0.005,        // 5ms
            filter_freq: 2000,
            level: 0.4           // Boosted base click level
        },
        shaper: getDefaultDrumShaper('bd')
    },
    sd: {
        // TR909 playSD: 2 Triangles (1:1.62 ratio), pitch bend 1.5x in 20ms
        // Body: immediate gain (no ramp), 150ms decay
        // Noise: parallel LPF (250ms) + HPF (150ms)
        triggerMute: 0.001,
        osc1: {
            enabled: true,
            wave: 'triangle',
            freq: 180,
            startFreq: 270,      // 180 * 1.5
            p_decay: 0.02,       // 20ms pitch envelope
            a_decay: 0.15,       // 150ms body decay
            level: 1.2,          // P.vol * 1.2
            noAttack: true       // immediate start, no ramp
        },
        osc2: {
            enabled: true,
            wave: 'triangle',
            freq: 292,           // 180 * 1.62
            startFreq: 438,      // 292 * 1.5
            p_decay: 0.02,
            a_decay: 0.15,
            level: 1.2,
            noAttack: true
        },
        noise: {
            enabled: true,
            filter_type: 'lowpass',
            cutoff: 6000,        // 4000 + (p2=50)*40
            Q: 1.0,
            decay: 0.25,         // LPF path: 250ms
            level: 0.75          // snappyLevel * 1.5 at p3=50
        },
        noise2: {
            enabled: true,
            filter_type: 'highpass',
            cutoff: 2200,        // 1200 + (p2=50)*20
            Q: 1.0,
            decay: 0.15,         // HPF path: 150ms
            level: 0.5           // snappyLevel * 1.0 at p3=50
        },
        shaper: getDefaultDrumShaper('sd')
    },
    tom: {
        // TR909 playTom (MT): 3 oscillators (tri + sine + sine), pitch 1.3x in 50ms.
        // Harmonic ratios are fixed at 1 : 1.5 : 2.77.
        // Stage-1 analog alignment: independent oscillator/noise decays (no shared masterEnv gate).
        triggerMute: 0.0012,
        masterLowShelf: {
            freq: MT_OSC1_FREQ * 1.6,
            gain: 3.2
        },
        masterPeak: {
            freq: MT_OSC1_FREQ,
            Q: 0.95,
            gain: 3.4
        },
        masterHighShelf: {
            freq: MT_OSC3_FREQ * 1.9,
            gain: 1.8
        },
        osc1: {
            enabled: true,
            wave: 'triangle',
            freq: MT_OSC1_FREQ,
            startFreq: MT_OSC1_FREQ * TOM_START_FREQ_MULTIPLIER,
            endFreq: MT_OSC1_FREQ * TOM_PITCH_DROP_RATIO,
            p_decay: TOM_PITCH_DROP_TIME,
            pitchEnv: createTomPitchEnv(),
            // Keep fundamental longest to stabilize perceived pitch near root note.
            a_decay: 0.45,
            level: 1.0,          // static level (no envelope)
            drive: 1.5,
            noAttack: true
        },
        osc2: {
            enabled: true,
            wave: 'sine',
            freq: MT_OSC2_FREQ,
            startFreq: MT_OSC2_FREQ * TOM_START_FREQ_MULTIPLIER,
            endFreq: MT_OSC2_FREQ * TOM_PITCH_DROP_RATIO,
            p_decay: TOM_PITCH_DROP_TIME,
            pitchEnv: createTomPitchEnv(),
            // Upper partial decays faster than osc1.
            a_decay: 0.22,
            level: 0.42,
            noAttack: true
        },
        osc3: {
            enabled: true,
            wave: 'sine',
            freq: MT_OSC3_FREQ,
            startFreq: MT_OSC3_FREQ * TOM_START_FREQ_MULTIPLIER,
            endFreq: MT_OSC3_FREQ * TOM_PITCH_DROP_RATIO,
            p_decay: TOM_PITCH_DROP_TIME,
            pitchEnv: createTomPitchEnv(),
            // Highest partial should be shortest to avoid octave-up pitch dominance.
            a_decay: 0.13,
            level: 0.16,
            noAttack: true
        },
        noise: {
            enabled: true,
            filter_type: 'bandpass',
            cutoff: MT_OSC3_FREQ * 2.6,
            Q: 0.85,
            decay: 0.03,         // short stick/transient component
            level: 0.13
        },
        shaper: getDefaultDrumShaper('mt')
    },
    rs: {
        // TR909 playRim: 3 Sines (220, 500, 1000 Hz)
        // Each has different decay times (50ms, 40ms, 35ms)
        // Slight pitch decay (freq * 0.98)
        // Snap: Triangle 1800Hz->400Hz in 10ms
        // No separate noise, but HPF at 200Hz handled by snap routing
        osc1: {
            enabled: true,
            wave: 'sine',
            freq: 220,
            startFreq: 220,
            endFreq: 215.6,      // 220 * 0.98
            p_decay: 0.05,
            a_decay: 0.05,
            level: 0.5
        },
        osc2: {
            enabled: true,
            wave: 'sine',
            freq: 500,
            startFreq: 500,
            endFreq: 490,        // 500 * 0.98
            p_decay: 0.04,
            a_decay: 0.04,
            level: 0.4
        },
        osc3: {
            enabled: true,
            wave: 'sine',
            freq: 1000,
            startFreq: 1000,
            endFreq: 980,        // 1000 * 0.98
            p_decay: 0.035,
            a_decay: 0.035,
            level: 0.3
        },
        snap: {
            enabled: true,
            startFreq: 1800,
            endFreq: 400,
            level: 0.6
        },
        masterHPF: 200,          // 200Hz HPF for metallic character
        shaper: getDefaultDrumShaper('rs')
    },
    cp: {
        // TR909 playCP: Noise BPF 1200Hz, 4 bursts at 8ms intervals
        // Duration: 0.2 + decay * 0.6
        noise: {
            enabled: true,
            filter_type: 'bandpass',
            cutoff: 1000,           // Slightly lower freq for warmer clap
            Q: 0.8,                 // Softer Q
            burst_count: 4,
            burst_interval: 0.008,  // 8ms
            decay: 0.4,             // 400ms tail
            level: 1.2              // Slightly higher level
        },
        shaper: getDefaultDrumShaper('cp')
    }
};

export function getFactoryPreset(trackId) {
    if (FACTORY_PRESETS[trackId]) {
        return JSON.parse(JSON.stringify(FACTORY_PRESETS[trackId]));
    }
    if (['lt', 'mt', 'ht'].includes(trackId)) {
        const p = JSON.parse(JSON.stringify(FACTORY_PRESETS.tom));
        const [f1, f2, f3] = getTomFrequencies(trackId, 50);
        p.osc1.freq = f1; p.osc1.startFreq = f1 * TOM_START_FREQ_MULTIPLIER;
        p.osc1.endFreq = f1 * TOM_PITCH_DROP_RATIO;
        p.osc1.p_decay = TOM_PITCH_DROP_TIME;
        p.osc1.pitchEnv = createTomPitchEnv();
        p.osc2.freq = f2; p.osc2.startFreq = f2 * TOM_START_FREQ_MULTIPLIER;
        p.osc2.endFreq = f2 * TOM_PITCH_DROP_RATIO;
        p.osc2.p_decay = TOM_PITCH_DROP_TIME;
        p.osc2.pitchEnv = createTomPitchEnv();
        p.osc3.freq = f3; p.osc3.startFreq = f3 * TOM_START_FREQ_MULTIPLIER;
        p.osc3.endFreq = f3 * TOM_PITCH_DROP_RATIO;
        p.osc3.p_decay = TOM_PITCH_DROP_TIME;
        p.osc3.pitchEnv = createTomPitchEnv();
        if (p.masterLowShelf) {
            p.masterLowShelf.freq = f1 * 1.6;
        }
        if (p.masterPeak) {
            p.masterPeak.freq = f1;
        }
        if (p.masterHighShelf) {
            p.masterHighShelf.freq = f3 * 1.9;
        }
        p.noise.cutoff = f3 * 2.6;
        p.shaper = getDefaultDrumShaper(trackId);
        return p;
    }
    return JSON.parse(JSON.stringify(FACTORY_PRESETS.bd));
}
