import {
    UnifiedSynth,
    getFactoryPreset,
    getTomFrequencies,
    TOM_START_FREQ_MULTIPLIER,
    TOM_PITCH_DROP_RATIO,
    TOM_PITCH_DROP_TIME,
    createTomPitchEnv
} from './UnifiedSynth.js';

export class DrumVoice {
    constructor(ctx, output, noiseBuffer) {
        this.ctx = ctx;
        this.output = output;
        this.noiseBuffer = noiseBuffer;

        this.synthType = null; // e.g. 'playBD', 'playSD', etc.
        this.trackId = null;   // e.g. 'bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp'
        this.sampleBuffer = null; // Factory sample
        this.customBuffer = null; // User sample
        this.type = 'standard'; // 'standard', 'hat', 'cymbal'

        // Unified Synth instance (lazy init)
        this.synth = null;

        // Hybrid Configuration
        this.layerSynthAndSample = false;
    }

    setSynth(type) {
        this.synthType = type;
        // Map synthType to trackId
        const typeToId = {
            'playBD': 'bd', 'playSD': 'sd',
            'playLowTom': 'lt', 'playMidTom': 'mt', 'playHiTom': 'ht',
            'playRim': 'rs', 'playCP': 'cp'
        };
        this.trackId = typeToId[type] || null;
    }

    setSample(buffer) {
        this.sampleBuffer = buffer;
    }

    setCustomSample(buffer) {
        this.customBuffer = buffer;
    }

    _getSynth() {
        if (!this.synth) {
            this.synth = new UnifiedSynth(this.ctx, this.output, this.noiseBuffer);
        }
        return this.synth;
    }

    _resolveAccentGain(accent) {
        if (accent === undefined || accent === null) return 1.0;
        if (typeof accent === 'boolean') return accent ? 1.35 : 1.0;
        const n = Number(accent);
        if (!Number.isFinite(n)) return 1.0;
        if (n <= 1.0) return 1.0 + Math.max(0, n) * 0.35;
        return Math.max(0.5, Math.min(2.0, n));
    }

    trigger(time, params) {
        const now = time;
        params = params || {};

        // 1. Custom Sample (Highest Priority)
        if (this.customBuffer) {
            this.playSampleBuffer(now, this.customBuffer, params);
            if (!this.layerSynthAndSample) return;
        }

        // 2. Custom Synth Patch (from DrumSynth Maker)
        if (params.customSynth && Object.keys(params.customSynth).length > 0) {
            const customPreset = this._mergeWithFactory(params.customSynth);
            if (params.accent !== undefined) {
                customPreset.accent = this._resolveAccentGain(params.accent);
            }
            this._getSynth().play(customPreset, now);
            if (!this.layerSynthAndSample) return;
        }

        // 3. Factory Synth (use preset from UnifiedSynth)
        if (this.trackId) {
            const preset = getFactoryPreset(this.trackId);
            // Merge TR909 knob params into preset
            this._applyKnobParams(preset, params);
            this._getSynth().play(preset, now);
            return;
        }

        // 4. Factory Sample (for CH/OH/CR/RD)
        if (this.sampleBuffer) {
            this.playSampleBuffer(now, this.sampleBuffer, params);
        }
    }

    // Backward-compatible merge: if customSynth is partial, fill missing fields from factory.
    _mergeWithFactory(customSynth) {
        if (!this.trackId) return JSON.parse(JSON.stringify(customSynth || {}));

        const base = getFactoryPreset(this.trackId) || {};
        const merged = JSON.parse(JSON.stringify(base));
        const patch = (customSynth && typeof customSynth === 'object')
            ? JSON.parse(JSON.stringify(customSynth))
            : {};

        for (const [key, value] of Object.entries(patch)) {
            const isObj = value && typeof value === 'object' && !Array.isArray(value);
            const baseVal = merged[key];
            const isBaseObj = baseVal && typeof baseVal === 'object' && !Array.isArray(baseVal);

            if (isObj && isBaseObj) {
                merged[key] = { ...baseVal, ...value };
            } else {
                merged[key] = value;
            }
        }

        return merged;
    }

    stop() {
        if (this.synth) {
            this.synth.stopAll();
        }
    }

    // Apply TR909 knob values (p1, p2, p3) to preset
    _applyKnobParams(preset, P) {
        if (!this.trackId) return;

        const vol = P.vol !== undefined ? P.vol : 1;
        preset.vol = vol;
        preset.accent = this._resolveAccentGain(P.accent);

        switch (this.trackId) {
            case 'bd':
                // p1 = TUNE (base freq + pitch decay), p2 = ATTACK (click level), p3 = DECAY (extended)
                if (P.p1 !== undefined) {
                    // TUNE adjusts both the base pitch and the sweep depth
                    // 0 = Low pitch (40Hz), 100 = High pitch (65Hz)
                    const baseFreq = 40 + (P.p1 / 100) * 25;
                    preset.osc1.freq = baseFreq;
                    preset.osc1.startFreq = baseFreq * 5; // maintain 5x sweep ratio

                    let pitchDecay;
                    if (P.p1 <= 40) {
                        pitchDecay = 0.005 + (P.p1 / 40) * 0.015;
                    } else {
                        pitchDecay = 0.02 + ((P.p1 - 40) / 60) * 0.150;
                    }
                    preset.osc1.p_decay = pitchDecay;
                }
                if (P.p2 !== undefined && preset.click) {
                    preset.click.enabled = true;
                    // Maximum click level is 0.5 for a sharp punch
                    preset.click.level = (P.p2 / 100) * 0.5;
                }
                if (P.p3 !== undefined) {
                    // Extended Decay Mod: 0.1s to 2.0s
                    preset.osc1.a_decay = 0.1 + (P.p3 / 100) * 1.9;
                }
                break;

            case 'sd':
                // p1 = TUNE, p2 = TONE (filter freqs), p3 = SNAPPY (noise level)
                if (P.p1 !== undefined) {
                    const baseFreq = 180 + (P.p1 / 100) * 60;
                    preset.osc1.freq = baseFreq;
                    preset.osc1.startFreq = baseFreq * 1.5;
                    preset.osc2.freq = baseFreq * 1.62;
                    preset.osc2.startFreq = baseFreq * 1.62 * 1.5;
                }
                if (P.p2 !== undefined) {
                    // LPF path
                    if (preset.noise) {
                        preset.noise.cutoff = 4000 + (P.p2 / 100) * 4000;
                    }
                    // HPF path
                    if (preset.noise2) {
                        preset.noise2.cutoff = 1200 + (P.p2 / 100) * 2000;
                    }
                }
                if (P.p3 !== undefined) {
                    const snappyLevel = P.p3 / 100;
                    if (preset.noise) {
                        preset.noise.level = vol * snappyLevel * 1.5;
                    }
                    if (preset.noise2) {
                        preset.noise2.level = vol * snappyLevel * 1.0;
                    }
                }
                break;

            case 'lt': case 'mt': case 'ht':
                // p1 = TUNE, p2 = DECAY
                if (P.p1 !== undefined) {
                    const [f1, f2, f3] = getTomFrequencies(this.trackId, P.p1);
                    const freqs = [f1, f2, f3];
                    ['osc1', 'osc2', 'osc3'].forEach((osc, i) => {
                        if (preset[osc]) {
                            const targetFreq = freqs[i];
                            preset[osc].freq = targetFreq;
                            preset[osc].startFreq = targetFreq * TOM_START_FREQ_MULTIPLIER;
                            preset[osc].endFreq = targetFreq * TOM_PITCH_DROP_RATIO;
                            preset[osc].p_decay = TOM_PITCH_DROP_TIME;
                            preset[osc].pitchEnv = createTomPitchEnv();
                        }
                    });
                    if (preset.masterLowShelf) {
                        preset.masterLowShelf.freq = f1 * 1.6;
                    }
                    if (preset.masterPeak) {
                        preset.masterPeak.freq = f1;
                    }
                    if (preset.masterHighShelf) {
                        preset.masterHighShelf.freq = f3 * 1.9;
                    }
                    // Track noise brightness with the highest oscillator.
                    if (preset.noise) {
                        preset.noise.cutoff = f3 * 2.6;
                    }
                }
                if (P.p2 !== undefined) {
                    const bodyDecay = 0.1 + (P.p2 / 100) * 0.8;
                    // Fundamental longest, upper harmonics shorter.
                    const o1 = bodyDecay * 1.25;
                    const o2 = bodyDecay * 0.62;
                    const o3 = bodyDecay * 0.36;
                    const noiseDecay = 0.008 + (P.p2 / 100) * 0.045;

                    if (preset.osc1) {
                        preset.osc1.staticLevel = false;
                        preset.osc1.noAttack = true;
                        preset.osc1.a_decay = o1;
                    }
                    if (preset.osc2) {
                        preset.osc2.staticLevel = false;
                        preset.osc2.noAttack = true;
                        preset.osc2.a_decay = o2;
                    }
                    if (preset.osc3) {
                        preset.osc3.staticLevel = false;
                        preset.osc3.noAttack = true;
                        preset.osc3.a_decay = o3;
                    }
                    if (preset.noise) {
                        preset.noise.decay = noiseDecay;
                    }
                    // Keep compatibility with legacy custom presets that still depend on masterEnv.
                    if (preset.masterEnv) {
                        preset.masterEnv.decay = bodyDecay;
                    }
                }
                break;

            case 'cp':
                // decay param
                if (P.decay !== undefined && preset.noise) {
                    preset.noise.decay = 0.2 + (P.decay / 100) * 0.6;
                }
                break;

            // rs doesn't have knob mappings in original TR909.js
        }
    }

    playSampleBuffer(time, buffer, P, playbackRate = 1.0) {
        if (!buffer) return;
        if (!P) return;

        const vol = (P.vol !== undefined) ? P.vol : (P.level !== undefined ? P.level / 100 : 1);

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;

        // Tuning / Rate
        let rate = playbackRate;
        if (this.type === 'hat') {
            if (P.p2 !== undefined) rate = 0.8 + (P.p2 / 100) * 0.4;
            else if (P.tune !== undefined) rate = 0.8 + (P.tune / 100) * 0.4;
        } else if (this.type === 'cymbal') {
            const tuneVal = P.cr_tune || P.rd_tune || P.tune || 50;
            rate = 0.6 + (tuneVal / 100) * 1.0;
        }

        src.playbackRate.setValueAtTime(rate, time);

        const gain = this.ctx.createGain();
        const startGain = Math.max(0.001, vol * 1.5);
        gain.gain.setValueAtTime(startGain, time);

        // Decay
        let decayTime = 0.5;
        if (this.type === 'hat') {
            const decayVal = P.ch_decay || P.oh_decay || P.decay || 50;
            decayTime = 0.02 + (decayVal / 100) * 0.1;
            if (this.decayCurve === 'long' || P.oh_decay !== undefined) {
                decayTime = 0.1 + (decayVal / 100) * 0.8;
            }
        } else if (this.type === 'cymbal') {
            decayTime = P.cr_tune ? 1.5 : 2.5;
        } else {
            if (P.decay) decayTime = 0.05 + (P.decay / 100) * 2.0;
        }

        gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

        src.connect(gain);
        gain.connect(this.output);
        src.start(time);
        src.stop(time + decayTime + 0.1);
    }
}
