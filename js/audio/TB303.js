export class TB303 {
    constructor(ctx, output) {
        this.ctx = ctx;
        this.output = output;
        this.activeState = null; // { osc, filter, gain, freq }

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

    noteToFreq(note, octave) {
        const noteMap = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const semi = (octave * 12) + noteMap.indexOf(note);
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

            const cutoffParam = active.filter.parameters.get('cutoff');
            if (cutoffParam) {
                cutoffParam.cancelScheduledValues(time);
                cutoffParam.linearRampToValueAtTime(baseCut, time + 0.1);
            }

            // Update Volume (Accent might change)
            const targetVol = (P.vol * 0.7) * (step.accent ? 1.2 : 0.8);
            active.gain.gain.cancelScheduledValues(time);
            active.gain.gain.linearRampToValueAtTime(targetVol, time + 0.1);

            // Extend Oscillator life
            active.osc.stop(time + 2.0); // Extend safety stop

            // If this step is NOT a slide start for the NEXT step, we need to gate off eventually?
            // But here we are AT the slide step. If THIS step also has slide=true, we keep holding.
            // If THIS step has slide=false, we should gate off at the end of this step.
            if (!step.slide) {
                const gateTime = (60 / tempo) * 0.5;
                active.gain.gain.setTargetAtTime(0, time + gateTime, 0.02);
            }

        } else {
            // --- NEW NOTE (Retrigger) ---
            this.kill(time);

            if (!step.active) return;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            let filter;

            try {
                filter = new AudioWorkletNode(this.ctx, 'tb303-filter');
            } catch (e) {
                console.warn('TB303FilterProcessor not loaded, falling back to BiquadFilter', e);
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

            if (filter instanceof AudioWorkletNode) {
                const resParam = filter.parameters.get('resonance');
                const cutParam = filter.parameters.get('cutoff');

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
            gain.gain.linearRampToValueAtTime(peakVol, time + 0.005);
            gain.gain.setTargetAtTime(0, time + 0.01, decay);

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
                // Slide Start: Sustain (Don't gate off immediately)
                osc.stop(time + 2.0); // Safety stop long enough for next step
            }

            this.activeState = { osc, filter, gain, freq };
        }
    }

    processStep(time, stepIndex, seqData, params, tempo) {
        // Update Delay Params
        if (this.delayNode && this.feedbackGain && this.wetGain) {
            // Validate Time and Tempo
            if (!Number.isFinite(time) || !Number.isFinite(tempo) || tempo <= 0) {
                return;
            }

            // Calculate Tempo-Synced Delay Time
            const pDelayTime = (typeof params.delayTime === 'number') ? params.delayTime : 50;
            const pFeedback = (typeof params.delayFeedback === 'number') ? params.delayFeedback : 40;
            const pWet = (typeof params.delayWet === 'number') ? params.delayWet : 50;

            const secondsPerBeat = 60.0 / tempo;
            const wholeNote = secondsPerBeat * 4;

            // Calculate target delay time
            let dTime = (pDelayTime / 100) * wholeNote;

            // Clamp to max buffer size (6.0s) and min safe value
            dTime = Math.min(Math.max(dTime, 0.01), 6.0);

            // Feedback: 0-100 -> 0.0 to 0.95
            const dFeed = (pFeedback / 100) * 0.95;

            // Wet Level: 0-100 -> 0.0 to 1.0 (Standard send amount)
            const wetLevel = pWet / 100;

            // Final Safety Check before applying
            if (Number.isFinite(dTime) && Number.isFinite(dFeed) && Number.isFinite(wetLevel)) {
                this.delayNode.delayTime.setTargetAtTime(dTime, time, 0.05);
                this.feedbackGain.gain.setTargetAtTime(dFeed, time, 0.02);
                this.wetGain.gain.setTargetAtTime(wetLevel, time, 0.02);
            }
        }

        const step = seqData[stepIndex];
        const prevStepIndex = (stepIndex === 0) ? 15 : stepIndex - 1;
        const prevStep = seqData[prevStepIndex];

        if (step && step.active) {
            this.playStep(time, step, params, prevStep, tempo);
        } else {
            this.kill(time);
        }
    }

    kill(time) {
        if (this.activeState && this.activeState.osc) {
            try {
                this.activeState.osc.stop(time);
                this.activeState.gain.gain.cancelScheduledValues(time);
                this.activeState.gain.gain.setValueAtTime(0, time);
            } catch (e) { }
            this.activeState = null;
        }
    }

    stop(time) {
        this.kill(time);
        if (this.feedbackGain && this.wetGain) {
            this.feedbackGain.gain.cancelScheduledValues(time);
            this.feedbackGain.gain.setValueAtTime(0, time);

            this.wetGain.gain.cancelScheduledValues(time);
            this.wetGain.gain.setValueAtTime(0, time);
        }
    }
}
