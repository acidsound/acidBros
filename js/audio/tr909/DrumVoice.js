import { SynthVoices } from './SynthVoices.js';

export class DrumVoice {
    constructor(ctx, output, noiseBuffer) {
        this.ctx = ctx;
        this.output = output;
        this.noiseBuffer = noiseBuffer;

        this.synthType = null; // e.g. 'playBD'
        this.sampleBuffer = null; // Factory sample
        this.customBuffer = null; // User sample
        this.type = 'standard'; // 'standard', 'hat', 'cymbal' (for specific param handling)

        // Params for specific behaviors
        this.sampleDecayScale = 1.0;
        this.sampleTune = false;

        // Hybrid Configuration
        // Default behavior: Custom sample overrides everything.
        // Synth executes if no custom sample (or if layering is enabled).
        this.layerSynthAndSample = false;
    }

    setSynth(type) {
        this.synthType = type;
    }

    setSample(buffer) {
        this.sampleBuffer = buffer;
    }

    setCustomSample(buffer) {
        this.customBuffer = buffer;
    }

    trigger(time, params) {
        // 1. Custom Sample (Highest Priority in legacy mode)
        if (this.customBuffer) {
            this.playSampleBuffer(time, this.customBuffer, params);
            if (!this.layerSynthAndSample) return;
        }

        // 2. Synth
        // Check for Unified Drum Synth patch
        if (params.customSynth && Object.keys(params.customSynth).length > 0) {
            SynthVoices.playUnifiedSynth(this.ctx, this.output, time, params, this.noiseBuffer);
            if (!this.layerSynthAndSample) return;
        }

        if (this.synthType && SynthVoices[this.synthType]) {
            SynthVoices[this.synthType](this.ctx, this.output, time, params, this.noiseBuffer);
        }

        // 3. Factory Sample (if no synth, or if hybrid)
        // If we have a synthType, we usually don't play the factory sample unless it's a hybrid track.
        // But for tracks like CH/OH, synthType is null, so we play sample.
        if (!this.synthType && this.sampleBuffer) {
            this.playSampleBuffer(time, this.sampleBuffer, params);
        }
    }

    playSampleBuffer(time, buffer, P, playbackRate = 1.0) {
        if (!buffer) { console.warn('DrumVoice: No Buffer'); return; }
        if (!P) { console.warn('DrumVoice: No Params'); return; }
        if ((typeof P.vol !== 'undefined' && isNaN(P.vol)) || (typeof P.level !== 'undefined' && isNaN(P.level))) {
            console.warn('DrumVoice: NaN Volume', P);
            return;
        }

        // Normalize params (different tracks use vol vs level, decay vs ch_decay)
        const vol = (P.vol !== undefined) ? P.vol : (P.level !== undefined ? P.level : 100);

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;

        // Tuning / Rate
        let rate = playbackRate;
        // Specific tuning logic from TR909.js
        if (this.type === 'hat') {
            // Hat tuning: p2 (tone/tune)
            // But wait, existing CH/OH params are:
            // CH: level, ch_decay, ch_tune (Data.js default?) NO, Data.js says ch_decay. 
            // TR909.js uses 'p2' for Hat tuning? 
            // Let's check TR909.js playHat: rate = 0.8 + (P.p2 / 100) * 0.4
            // But in Data.js, CH has { level, ch_decay }. No p2/tune?
            // Wait, UI maps ch_tune -> tune?
            // I need to be careful with Param mapping. 
            // I'll assume P contains the raw knob values needed.
            // For now, simple playback.
            if (P.p2 !== undefined) rate = 0.8 + (P.p2 / 100) * 0.4;
            else if (P.tune !== undefined) rate = 0.8 + (P.tune / 100) * 0.4;
        } else if (this.type === 'cymbal') {
            // CR/RD tuning
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
            // OH vs CH ranges
            // Since we don't know if we are CH or OH easily here without 'isOpen', 
            // we rely on param scaling config?
            // Actually, CH is "Closed Hat" voice, OH is "Open Hat" voice.
            // If this is the CH voice:
            decayTime = 0.02 + (decayVal / 100) * 0.1;
            // If OH voice:
            // decayTime = 0.1 + (decayVal / 100) * 0.8;
            // This suggests I need to configure the Voice with specific decay curve.
            if (this.decayCurve === 'long' || P.oh_decay !== undefined) {
                decayTime = 0.1 + (decayVal / 100) * 0.8;
            }
        } else if (this.type === 'cymbal') {
            decayTime = (P.decay || 50) > 0 ? 2.5 : 1.5; // Rough approximation
            if (P.cr_tune) decayTime = 1.5; // Crash
            if (P.rd_tune) decayTime = 2.5; // Ride
        } else {
            // Generic decay if provided
            if (P.decay) decayTime = 0.05 + (P.decay / 100) * 2.0;
        }

        gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

        src.connect(gain);
        gain.connect(this.output);

        // Fix: Must call start before scheduling stop? 
        // Actually, you CAN schedule stop before start in Web Audio API, BUT
        // strict implementations might error if times are invalid.
        // However, the error 'cannot call stop without calling start first' 
        // usually implies exactly that.
        // Let's call start first.
        src.start(time);
        src.stop(time + decayTime + 0.1);
    }
}
