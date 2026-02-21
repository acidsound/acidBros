import {
    UnifiedSynth,
    getFactoryPreset,
    mergePresetWithBase,
    applyTrackPerformanceControls
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
            // Keep sequencer controls (Tune/Decay/Level etc.) active on top of saved patch.
            this._applyKnobParams(customPreset, params);
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

    // Normalize saved patch payload (legacy base metadata stripped in UnifiedSynth helper).
    _mergeWithFactory(customSynth) {
        if (!this.trackId) return JSON.parse(JSON.stringify(customSynth || {}));
        return mergePresetWithBase(this.trackId, customSynth);
    }

    stop() {
        if (this.synth) {
            this.synth.stopAll();
        }
    }

    // Apply TR909 knob values (p1, p2, p3) to preset
    _applyKnobParams(preset, P) {
        if (!this.trackId) return;
        applyTrackPerformanceControls(
            preset,
            this.trackId,
            P || {},
            preset?.previewProfile || null
        );
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
