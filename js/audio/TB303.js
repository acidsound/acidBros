const NOTE_INDEX = Object.freeze({
    C: 0,
    'C#': 1,
    D: 2,
    'D#': 3,
    E: 4,
    F: 5,
    'F#': 6,
    G: 7,
    'G#': 8,
    A: 9,
    'A#': 10,
    B: 11
});

export class TB303 {
    constructor(ctx, output) {
        this.ctx = ctx;
        this.output = output;
        this.activeState = null; // { osc, filter, gain, freq }
        this.lastDelaySettings = null;
        this._didWarnWorkletFallback = false;

        // Delay Effect
        this.delayNode = this.ctx.createDelay(6.0); // Max delay 6s
        this.feedbackGain = this.ctx.createGain();
        this.wetGain = this.ctx.createGain();

        // Delay Connections
        this.delayNode.connect(this.feedbackGain);
        this.feedbackGain.connect(this.delayNode);

        // Wet Output
        this.delayNode.connect(this.wetGain);
        this.wetGain.connect(this.output);

        // Defaults
        this.delayNode.delayTime.value = 0.3;
        this.feedbackGain.gain.value = 0.4;
        this.wetGain.gain.value = 0; // Start muted
    }

    _cleanupState(state) {
        if (!state || state.cleaned) return;
        state.cleaned = true;

        try { if (state.osc) state.osc.onended = null; } catch (e) { }
        try { if (state.osc) state.osc.disconnect(); } catch (e) { }
        try { if (state.filter) state.filter.disconnect(); } catch (e) { }
        try { if (state.gain) state.gain.disconnect(); } catch (e) { }

        if (this.activeState === state) {
            this.activeState = null;
        }
    }

    _applyDelayParams(time, params, tempo) {
        if (!this.delayNode || !this.feedbackGain || !this.wetGain) return;
        if (!params) return;

        if (!Number.isFinite(time) || !Number.isFinite(tempo) || tempo <= 0) {
            return;
        }

        const pDelayTime = (typeof params.delayTime === 'number') ? params.delayTime : 50;
        const pFeedback = (typeof params.delayFeedback === 'number') ? params.delayFeedback : 40;
        const pWet = (typeof params.delayWet === 'number') ? params.delayWet : 50;

        const secondsPerBeat = 60.0 / tempo;
        const wholeNote = secondsPerBeat * 4;

        // Clamp and map UI ranges to safe DSP values.
        const dTime = Math.min(Math.max((pDelayTime / 100) * wholeNote, 0.01), 6.0);
        const dFeed = (pFeedback / 100) * 0.95;
        const wetLevel = pWet / 100;

        if (!Number.isFinite(dTime) || !Number.isFinite(dFeed) || !Number.isFinite(wetLevel)) {
            return;
        }

        const prev = this.lastDelaySettings;
        const hasChanged = !prev ||
            Math.abs(prev.dTime - dTime) > 1e-4 ||
            Math.abs(prev.dFeed - dFeed) > 1e-4 ||
            Math.abs(prev.wetLevel - wetLevel) > 1e-4;

        if (!hasChanged) return;

        this.lastDelaySettings = { dTime, dFeed, wetLevel };

        // Prevent long-running AudioParam automation queue growth.
        this.delayNode.delayTime.cancelScheduledValues(time);
        this.feedbackGain.gain.cancelScheduledValues(time);
        this.wetGain.gain.cancelScheduledValues(time);

        this.delayNode.delayTime.setTargetAtTime(dTime, time, 0.05);
        this.feedbackGain.gain.setTargetAtTime(dFeed, time, 0.02);
        this.wetGain.gain.setTargetAtTime(wetLevel, time, 0.02);
    }

    noteToFreq(note, octave) {
        const noteIndex = NOTE_INDEX[note];
        if (noteIndex === undefined) return NaN;
        const semi = (octave * 12) + noteIndex;
        return 16.35 * Math.pow(2, semi / 12);
    }

    playStep(time, step, P, prevStep, tempo) {
        // Validate Parameters
        if (!P ||
            isNaN(P.tune) || isNaN(P.cutoff) || isNaN(P.reso) ||
            isNaN(P.env) || isNaN(P.decay) || isNaN(P.vol) ||
            typeof P.wave !== 'string') {
            return;
        }

        // Validate Step
        if (!step || typeof step.note !== 'string' || typeof step.octave !== 'number' || step.octave < 0) {
            return;
        }

        let active = this.activeState;

        // Calculate Frequency
        let freq = this.noteToFreq(step.note, step.octave);
        if (!isFinite(freq)) {
            return;
        }
        freq *= Math.pow(2, P.tune / 1200);

        // Check Slide
        // Slide condition: Previous step was active, had slide on, and current step is active.
        const isSliding = prevStep && prevStep.active && prevStep.slide && step.active;

        if (isSliding && active && active.osc && active.filter) {
            // --- SLIDE (Legato) ---
            // Glide Pitch
            active.osc.frequency.cancelScheduledValues(time);
            active.osc.frequency.setValueAtTime(active.freq, time);
            active.osc.frequency.exponentialRampToValueAtTime(freq, time + 0.1);
            active.freq = freq;

            // Update Filter (Smooth transition)
            const baseCut = 300 + (P.cutoff * 8000) + (step.accent ? 1000 : 0);

            if (active.isWorkletFilter && active.cutParam) {
                active.cutParam.cancelScheduledValues(time);
                active.cutParam.linearRampToValueAtTime(baseCut, time + 0.1);
            } else if (!active.isWorkletFilter && active.filter && active.filter.frequency) {
                active.filter.frequency.cancelScheduledValues(time);
                active.filter.frequency.linearRampToValueAtTime(baseCut, time + 0.1);
            }

            // Update Volume (Accent might change)
            const targetVol = (P.vol * 0.7) * (step.accent ? 1.2 : 0.8);
            active.gain.gain.cancelScheduledValues(time);
            active.gain.gain.linearRampToValueAtTime(Math.max(0.001, targetVol), time + 0.1);

            // If this step is NOT a slide start for the NEXT step, we need to gate off eventually?
            // But here we are AT the slide step. If THIS step also has slide=true, we keep holding.
            // If THIS step has slide=false, we should gate off at the end of this step.
            if (!step.slide) {
                const gateTime = (60 / tempo) * 0.5;
                active.gain.gain.setTargetAtTime(0, time + gateTime, 0.02);
                try {
                    active.osc.stop(time + gateTime + 0.2);
                } catch (e) { }
            }

        } else {
            // --- NEW NOTE (Retrigger) ---
            this.kill(time);

            if (!step.active) return;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            let filter;
            let isWorkletFilter = false;
            let resParam = null;
            let cutParam = null;

            try {
                filter = new AudioWorkletNode(this.ctx, 'tb303-filter');
                isWorkletFilter = true;
            } catch (e) {
                if (!this._didWarnWorkletFallback) {
                    console.warn('TB303FilterProcessor not loaded, falling back to BiquadFilter', e);
                    this._didWarnWorkletFallback = true;
                }
                filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
            }

            osc.type = P.wave;
            osc.frequency.setValueAtTime(freq, time);

            // Filter Setup
            const baseCut = 300 + (P.cutoff * 8000) + (step.accent ? 1000 : 0);
            const normReso = P.reso / 15; // 0..1

            // Filter Envelope params
            const envAmount = (P.env * 5000) + (step.accent ? 2500 : 0);
            const decay = 0.1 + (P.decay / 100 * 0.9) * (step.accent ? 0.5 : 1.0);

            if (isWorkletFilter) {
                resParam = filter.parameters.get('resonance');
                cutParam = filter.parameters.get('cutoff');

                if (resParam) resParam.setValueAtTime(normReso, time);
                if (cutParam) cutParam.setValueAtTime(baseCut, time);

                if (cutParam) {
                    cutParam.linearRampToValueAtTime(baseCut + envAmount, time + 0.01);
                    cutParam.setTargetAtTime(baseCut, time + 0.02, decay / 3);
                }
            } else {
                // Fallback Biquad Setup
                const qVal = 1.0 + (normReso * 19.0);
                filter.Q.value = qVal * (step.accent ? 1.5 : 1.0);
                filter.frequency.setValueAtTime(baseCut, time);

                filter.frequency.linearRampToValueAtTime(baseCut + envAmount, time + 0.01);
                filter.frequency.setTargetAtTime(baseCut, time + 0.02, decay / 3);
            }

            // Amp Envelope
            const peakVol = (P.vol * 0.7) * (step.accent ? 1.2 : 0.8);
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(Math.max(0.001, peakVol), time + 0.005);
            gain.gain.setTargetAtTime(0, time + 0.01, Math.max(0.001, decay));

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.output);

            // Connect to Delay
            gain.connect(this.delayNode);

            // Start Oscillator BEFORE scheduling stop
            osc.start(time);

            // Gate Logic
            if (!step.slide) {
                // Normal Step: Gate Off after 50% duration
                const gateTime = (60 / tempo) * 0.5;
                gain.gain.setTargetAtTime(0, time + gateTime, 0.02);
                osc.stop(time + gateTime + 0.2);
            } else {
                // Slide Start: Sustain (Don't gate off immediately).
                // Oscillator will be stopped by a later non-slide gate, retrigger, or global stop.
            }
            const state = {
                osc,
                filter,
                gain,
                freq,
                isWorkletFilter,
                cutParam,
                resParam,
                cleaned: false
            };
            osc.onended = () => {
                this._cleanupState(state);
            };
            this.activeState = state;
        }
    }

    processStep(time, stepIndex, seqData, params, tempo, liveStep = null, livePrevStep = null) {
        this._applyDelayParams(time, params, tempo);

        const step = liveStep || seqData[stepIndex];
        const prevStepIndex = (stepIndex === 0) ? 15 : stepIndex - 1;
        const prevStep = livePrevStep || seqData[prevStepIndex];

        if (step && step.active) {
            this.playStep(time, step, params, prevStep, tempo);
        } else {
            this.kill(time);
        }
    }

    kill(time) {
        const state = this.activeState;
        if (state && state.osc) {
            const stopAt = Number.isFinite(time) ? Math.max(time, this.ctx.currentTime) : this.ctx.currentTime;
            try {
                state.gain.gain.cancelScheduledValues(stopAt);
                state.gain.gain.setValueAtTime(0, stopAt);
            } catch (e) { }
            try {
                state.osc.stop(stopAt + 0.005);
            } catch (e) { }
        }
    }

    stop(time) {
        const stopAt = Number.isFinite(time) ? time : this.ctx.currentTime;
        this.kill(stopAt);
        if (this.feedbackGain && this.wetGain) {
            this.feedbackGain.gain.cancelScheduledValues(stopAt);
            this.feedbackGain.gain.setValueAtTime(0, stopAt);

            this.wetGain.gain.cancelScheduledValues(stopAt);
            this.wetGain.gain.setValueAtTime(0, stopAt);
        }
        this.lastDelaySettings = null;
    }
}
