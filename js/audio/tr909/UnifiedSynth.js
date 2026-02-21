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

        const vol = P.vol !== undefined ? P.vol : 1;
        const voiceDuration = this._estimateVoiceDuration(P);

        // Master Gain (can have its own envelope for Tom-style sounds)
        const masterGain = this.ctx.createGain();
        let outputNode = masterGain;
        const releaseNodes = [masterGain];

        if (P.masterEnv) {
            // Tom style: master has the envelope
            const decay = Math.max(0.001, P.masterEnv.decay || 0.5);
            masterGain.gain.setValueAtTime(vol * P.masterEnv.level, now);
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
        }
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
        }
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
        }
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
        masterHPF: 200           // 200Hz HPF for metallic character
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
        }
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
        return p;
    }
    return JSON.parse(JSON.stringify(FACTORY_PRESETS.bd));
}
