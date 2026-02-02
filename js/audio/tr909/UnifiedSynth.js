/**
 * UnifiedSynth - A parameterized drum synthesizer.
 * Designed to exactly reproduce TR909.js playBD, playSD, playTom, playRim, playCP
 * when using FACTORY_PRESETS.
 * 
 * All time values are in SECONDS, frequencies in HZ.
 */
export class UnifiedSynth {
    constructor(ctx, output) {
        this.ctx = ctx;
        this.output = output;
        this.noiseBuffer = this._createNoiseBuffer();
        this.activeNodes = [];  // Track active audio nodes for cleanup
    }

    // Stop all currently playing sounds (prevents overlap)
    stopAll() {
        const now = this.ctx.currentTime;
        this.activeNodes.forEach(node => {
            try {
                if (node.stop) node.stop(now);
                if (node.gain) node.gain.setValueAtTime(0, now);
            } catch (e) { /* already stopped */ }
        });
        this.activeNodes = [];
    }

    _trackNode(node) {
        this.activeNodes.push(node);
        // Auto-remove after 2 seconds
        setTimeout(() => {
            const idx = this.activeNodes.indexOf(node);
            if (idx > -1) this.activeNodes.splice(idx, 1);
        }, 2000);
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
     * Parameter values are DIRECT (Hz for freq, seconds for decay).
     */
    play(P = {}, time = null) {
        const now = time || this.ctx.currentTime;

        // Only stop all if we are playing "now" (preview/manual)
        // If it's a scheduled playback, stopping all would kill the previous step's tail.
        if (!time) {
            this.stopAll();
        }

        const vol = P.vol !== undefined ? P.vol : 1;

        // Master Gain (can have its own envelope for Tom-style sounds)
        const masterGain = this.ctx.createGain();
        this._trackNode(masterGain);  // Track for cleanup

        if (P.masterEnv) {
            // Tom style: master has the envelope
            masterGain.gain.setValueAtTime(vol * P.masterEnv.level, now);
            masterGain.gain.exponentialRampToValueAtTime(0.001, now + P.masterEnv.decay);
        } else {
            masterGain.gain.setValueAtTime(vol * 1.5, now);
        }

        // Optional HPF (for RS metallic character)
        if (P.masterHPF) {
            const hpf = this.ctx.createBiquadFilter();
            hpf.type = 'highpass';
            hpf.frequency.setValueAtTime(P.masterHPF, now);
            masterGain.connect(hpf);
            hpf.connect(this.output);
        } else {
            masterGain.connect(this.output);
        }

        // Calculate masterDecay for Tom-style sounds
        const masterDecay = P.masterEnv ? P.masterEnv.decay : 1.5;

        // Process Main Oscillator (osc1)
        if (P.osc1 && P.osc1.enabled) {
            this._playMainOsc(P.osc1, now, masterGain, masterDecay);
        }

        // Process Additional Oscillators (osc2, osc3, osc4) - for SD, Tom, RS
        ['osc2', 'osc3', 'osc4'].forEach(id => {
            const cfg = P[id];
            if (cfg && cfg.enabled) {
                this._playOsc(cfg, now, masterGain, masterDecay);
            }
        });

        // Process Click (for BD attack) - Square + Noise burst
        if (P.click && P.click.enabled) {
            this._playClick(P.click, now, masterGain);
        }

        // Process Snap (for RS metallic bite) - Triangle pitch sweep
        if (P.snap && P.snap.enabled) {
            this._playSnap(P.snap, now, masterGain);
        }

        // Process Noise (for SD snappy LPF, CP burst)
        if (P.noise && P.noise.enabled) {
            this._playNoise(P.noise, now, masterGain);
        }

        // Process Noise2 (for SD snappy HPF - parallel path)
        if (P.noise2 && P.noise2.enabled) {
            this._playNoise(P.noise2, now, masterGain);
        }
    }

    // Main oscillator with waveshaper (like BD)
    _playMainOsc(cfg, now, destination, masterDecay = 1.5) {
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();

        // Wave type
        osc.type = this._parseWaveType(cfg.wave);

        // Frequency: startFreq -> freq over p_decay seconds
        const freq = cfg.freq || 48;
        const startFreq = cfg.startFreq || (freq * 6);
        const pDecay = cfg.p_decay || 0.02;

        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(freq, now + pDecay);

        const aDecay = cfg.a_decay || 0.5;
        const level = cfg.level || 1.0;

        if (cfg.staticLevel) {
            // Tom style: static level, master handles decay
            oscGain.gain.setValueAtTime(level, now);
        } else if (cfg.noAttack) {
            // SD style: immediate start, no ramp
            oscGain.gain.setValueAtTime(level, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + aDecay);
        } else {
            // BD style: 2ms attack ramp -> decay
            oscGain.gain.setValueAtTime(0, now);
            oscGain.gain.linearRampToValueAtTime(level, now + 0.002);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + aDecay);
        }

        // Waveshaper (saturation/drive)
        if (cfg.drive && cfg.drive > 0) {
            const shaper = this.ctx.createWaveShaper();
            shaper.curve = this._makeDistortionCurve(cfg.drive);
            osc.connect(shaper);
            shaper.connect(oscGain);
        } else {
            osc.connect(oscGain);
        }

        oscGain.connect(destination);
        osc.start(now);

        // Stop time based on staticLevel
        const stopTime = cfg.staticLevel ? (masterDecay + 0.1) : (aDecay + 0.1);
        osc.stop(now + stopTime);
    }

    // Additional oscillator (for SD/Tom/RS harmonics)
    _playOsc(cfg, now, destination, masterDecay = 1.5) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();

        osc.type = this._parseWaveType(cfg.wave);

        // Frequency with optional pitch bend
        const freq = cfg.freq || 180;
        const startFreq = cfg.startFreq || freq;
        const endFreq = cfg.endFreq !== undefined ? cfg.endFreq : freq;
        const pDecay = cfg.p_decay || 0.02;

        osc.frequency.setValueAtTime(startFreq, now);

        // Pitch decay: either startFreq->freq or freq->endFreq
        if (startFreq !== freq && pDecay > 0) {
            // Tom/SD style: pitch sweep down to target
            osc.frequency.exponentialRampToValueAtTime(freq, now + pDecay);
        } else if (endFreq !== freq && pDecay > 0) {
            // RS style: slight pitch decay (freq -> freq * 0.98)
            osc.frequency.exponentialRampToValueAtTime(endFreq, now + pDecay);
        }

        // Amplitude handling
        const level = cfg.level || 1.0;
        const aDecay = cfg.a_decay || 0.15;

        if (cfg.staticLevel) {
            // Tom style: static level, no envelope (master handles decay)
            g.gain.setValueAtTime(level, now);
        } else {
            // SD/RS style: individual decay envelope
            g.gain.setValueAtTime(level, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + aDecay);
        }

        osc.connect(g);
        g.connect(destination);
        osc.start(now);

        // Stop time: staticLevel uses masterDecay, others use aDecay
        const stopTime = cfg.staticLevel ? (masterDecay + 0.1) : (aDecay + 0.1);
        osc.stop(now + stopTime);
    }

    // Click component for BD attack (Square oscillator + filtered noise)
    _playClick(cfg, now, destination) {
        const level = cfg.level || 0.2;

        // Square oscillator click
        const clickOsc = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        clickOsc.type = 'square';
        clickOsc.frequency.setValueAtTime(cfg.freq || 800, now);

        clickGain.gain.setValueAtTime(level, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + (cfg.decay || 0.008));

        clickOsc.connect(clickGain);
        clickGain.connect(destination);
        clickOsc.start(now);
        clickOsc.stop(now + 0.02);

        // Noise component of click
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        const noiseGain = this.ctx.createGain();

        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(cfg.filter_freq || 2500, now);

        const noiseLevel = cfg.noise_level !== undefined ? cfg.noise_level : (level * 0.5);
        noiseGain.gain.setValueAtTime(noiseLevel, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + (cfg.noise_decay || 0.005));

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(destination);
        noise.start(now);
        noise.stop(now + 0.02);
    }

    // Snap component for RS (Triangle with fast pitch sweep)
    _playSnap(cfg, now, destination) {
        const snap = this.ctx.createOscillator();
        const snapGain = this.ctx.createGain();

        snap.type = 'triangle';
        snap.frequency.setValueAtTime(cfg.startFreq || 1800, now);
        snap.frequency.exponentialRampToValueAtTime(cfg.endFreq || 400, now + 0.01);

        const level = cfg.level || 0.6;
        snapGain.gain.setValueAtTime(level, now);
        snapGain.gain.linearRampToValueAtTime(0, now + 0.006);

        snap.connect(snapGain);
        snapGain.connect(destination);
        snap.start(now);
        snap.stop(now + 0.01);
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
        const level = cfg.level || 0.5;
        const decay = cfg.decay || 0.25;

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
            g.gain.exponentialRampToValueAtTime(0.001, now + burstCount * burstInterval + decay);
        } else {
            // Single noise burst
            g.gain.setValueAtTime(level, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + decay);
        }

        noise.connect(filter);
        filter.connect(g);
        g.connect(destination);

        noise.start(now);
        noise.stop(now + (burstCount > 1 ? burstCount * burstInterval : 0) + decay + 0.1);
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

/**
 * FACTORY_PRESETS - Exact values from TR909.js playBD, playSD, playTom, playRim, playCP
 * All time values in SECONDS, frequencies in HZ.
 * These represent default knob positions (p1=40, p2=50, p3=50)
 */
export const FACTORY_PRESETS = {
    bd: {
        // TR909 playBD: Triangle 48Hz, pitch 288Hz->48Hz in 20ms, decay 500ms, drive=10
        // Click: Square 800Hz 8ms, Noise BPF 2500Hz 5ms
        osc1: {
            enabled: true,
            wave: 'triangle',
            freq: 48,
            startFreq: 288,      // 48 * 6
            p_decay: 0.02,       // 20ms pitch envelope (at p1=40)
            a_decay: 0.5,        // 500ms amplitude decay (at p3=50: 0.1 + 0.5*0.8)
            drive: 10,
            level: 1.0
        },
        click: {
            enabled: true,
            freq: 800,
            decay: 0.008,        // 8ms
            filter_freq: 2500,
            level: 0.15,         // Reduced from 0.2
            noise_level: 0.03,   // Reduced from 0.1
            noise_decay: 0.003   // Reduced from 0.005
        }
    },
    sd: {
        // TR909 playSD: 2 Triangles (1:1.62 ratio), pitch bend 1.5x in 20ms
        // Body: immediate gain (no ramp), 150ms decay
        // Noise: parallel LPF (250ms) + HPF (150ms)
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
        // TR909 playTom (MT): masterEnv has the decay, oscillators have static levels
        // 3 oscillators (tri + sine + sine), pitch 1.3x in 50ms
        // Noise only on OSC3 (short 50ms burst)
        masterEnv: {
            level: 1.2,          // P.vol * 1.2
            decay: 0.5           // decayTime at p2=50: 0.1 + 0.5*0.8
        },
        osc1: {
            enabled: true,
            wave: 'triangle',
            freq: 120,
            startFreq: 156,      // 120 * 1.3
            p_decay: 0.05,       // 50ms pitch envelope
            level: 1.0,          // static level (no envelope)
            staticLevel: true
        },
        osc2: {
            enabled: true,
            wave: 'sine',
            freq: 180,
            startFreq: 234,
            p_decay: 0.05,
            level: 0.6,
            staticLevel: true
        },
        osc3: {
            enabled: true,
            wave: 'sine',
            freq: 240,
            startFreq: 312,
            p_decay: 0.05,
            level: 0.4,
            staticLevel: true
        },
        noise: {
            enabled: true,
            filter_type: 'bandpass',
            cutoff: 480,         // targetFreq * 2 (highest osc freq)
            Q: 1.0,
            decay: 0.05,         // short 50ms burst
            level: 0.3
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
        // Adjust frequencies for LT/HT (from original playTom)
        if (trackId === 'lt') {
            p.osc1.freq = 80; p.osc1.startFreq = 104;
            p.osc2.freq = 120; p.osc2.startFreq = 156;
            p.osc3.freq = 160; p.osc3.startFreq = 208;
            p.noise.cutoff = 320;
        } else if (trackId === 'ht') {
            p.osc1.freq = 180; p.osc1.startFreq = 234;
            p.osc2.freq = 270; p.osc2.startFreq = 351;
            p.osc3.freq = 360; p.osc3.startFreq = 468;
            p.noise.cutoff = 720;
        }
        return p;
    }
    return JSON.parse(JSON.stringify(FACTORY_PRESETS.bd));
}
