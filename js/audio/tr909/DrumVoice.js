import { UnifiedSynth, getFactoryPreset } from './UnifiedSynth.js';

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
            this.synth = new UnifiedSynth(this.ctx, this.output);
        }
        return this.synth;
    }

    trigger(time, params) {
        const now = time;

        // 1. Custom Sample (Highest Priority)
        if (this.customBuffer) {
            this.playSampleBuffer(now, this.customBuffer, params);
            if (!this.layerSynthAndSample) return;
        }

        // 2. Custom Synth Patch (from DrumSynth Maker)
        if (params.customSynth && Object.keys(params.customSynth).length > 0) {
            this._getSynth().play(params.customSynth, now);
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

    // Apply TR909 knob values (p1, p2, p3) to preset
    _applyKnobParams(preset, P) {
        if (!this.trackId) return;

        const vol = P.vol !== undefined ? P.vol : 1;
        preset.vol = vol;

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
                    const baseFreqs = { lt: [80, 120, 160], mt: [120, 180, 240], ht: [180, 270, 360] };
                    const freqs = baseFreqs[this.trackId];
                    const tuneOffset = (P.p1 / 100) * (freqs[0] * 0.5);
                    ['osc1', 'osc2', 'osc3'].forEach((osc, i) => {
                        if (preset[osc]) {
                            const targetFreq = freqs[i] + tuneOffset;
                            preset[osc].freq = targetFreq;
                            preset[osc].startFreq = targetFreq * 1.3;
                        }
                    });
                    // Update noise filter to highest freq * 2
                    if (preset.noise) {
                        const highestFreq = (baseFreqs[this.trackId][2] || 240) + tuneOffset;
                        preset.noise.cutoff = highestFreq * 2;
                    }
                }
                if (P.p2 !== undefined) {
                    const decayTime = 0.1 + (P.p2 / 100) * 0.8;
                    // Tom uses masterEnv for decay
                    if (preset.masterEnv) {
                        preset.masterEnv.decay = decayTime;
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
