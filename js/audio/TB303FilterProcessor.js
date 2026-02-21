class OnePoleHighPass {
    constructor(cutoffHz, sampleRate) {
        this.cutoffHz = cutoffHz;
        this.sampleRate = sampleRate;
        this.a = 0;
        this.x1 = 0;
        this.y1 = 0;
        this.update(sampleRate);
    }

    update(sampleRate) {
        this.sampleRate = sampleRate;
        const safeCut = Math.max(0.01, this.cutoffHz);
        this.a = Math.exp((-2.0 * Math.PI * safeCut) / this.sampleRate);
    }

    reset() {
        this.x1 = 0;
        this.y1 = 0;
    }

    process(x) {
        const y = this.a * (this.y1 + x - this.x1);
        this.x1 = x;
        this.y1 = y;
        return y;
    }
}

class TB303FilterProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            {
                name: 'cutoff',
                defaultValue: 1000.0,
                minValue: 20.0,
                maxValue: 20000.0,
                automationRate: 'a-rate'
            },
            {
                name: 'resonance',
                defaultValue: 0.0,
                minValue: 0.0,
                maxValue: 1.0,
                automationRate: 'a-rate'
            }
        ];
    }

    constructor() {
        super();
        this.s1 = 0;
        this.s2 = 0;
        this.s3 = 0;
        this.s4 = 0;

        // diode2-inspired low-frequency coupling networks.
        // Keep these fixed and subtle to preserve existing UI/automation behavior.
        const sr = globalThis.sampleRate || 44100;
        this._sampleRate = sr;
        this._cutoffMax = sr * 0.45;
        this._tanScale = Math.PI / sr;
        this.hpInput = new OnePoleHighPass(15.5, sr);   // section 1
        this.hpFeedback = new OnePoleHighPass(6.1, sr); // section 4
        this.hpSumming = new OnePoleHighPass(0.7, sr);  // section 5
        this.hpOutA = new OnePoleHighPass(3.2, sr);     // section 2
        this.hpOutB = new OnePoleHighPass(1.2, sr);     // section 3

        // TUNABLE: Resonance loudness compensation amount.
        // Higher value keeps more body at high RES, lower value is closer to raw ladder attenuation.
        // Keep UI knob ranges unchanged; this is purely internal gain contour tuning.
        this.resonanceMakeupAmount = 0.75;
    }

    _updateSampleRate(sampleRate) {
        if (sampleRate === this._sampleRate) return;
        this._sampleRate = sampleRate;
        this._cutoffMax = sampleRate * 0.45;
        this._tanScale = Math.PI / sampleRate;
        this.hpInput.update(sampleRate);
        this.hpFeedback.update(sampleRate);
        this.hpSumming.update(sampleRate);
        this.hpOutA.update(sampleRate);
        this.hpOutB.update(sampleRate);
    }

    _resetCoreState() {
        this.s1 = this.s2 = this.s3 = this.s4 = 0;
        this.hpInput.reset();
        this.hpFeedback.reset();
        this.hpSumming.reset();
        this.hpOutA.reset();
        this.hpOutB.reset();
    }

    process(inputs, outputs, parameters) {
        if (outputs.length === 0) return false;

        const outputBus = outputs[0];
        if (!outputBus || outputBus.length === 0) return false;

        const inputBus = inputs[0];
        if (!inputBus || inputBus.length === 0) {
            // No upstream source is connected anymore; allow the processor to terminate.
            this._resetCoreState();
            const out0 = outputBus[0];
            const out1 = outputBus.length > 1 ? outputBus[1] : null;
            if (out0) out0.fill(0);
            if (out1) out1.fill(0);
            return false;
        }

        const inputChannel = inputBus[0];
        if (!inputChannel) return false;
        const outputChannel0 = outputBus[0];
        const outputChannel1 = outputBus.length > 1 ? outputBus[1] : null;

        const cutoffParam = parameters.cutoff;
        const resonanceParam = parameters.resonance;
        const frames = inputChannel.length;
        const hasStereo = outputChannel1 !== null;
        const sampleRate = globalThis.sampleRate || this._sampleRate || 44100;
        this._updateSampleRate(sampleRate);

        const isCutoffARate = cutoffParam.length > 1;
        const isResonanceARate = resonanceParam.length > 1;
        const cutoffMax = this._cutoffMax;
        const tanScale = this._tanScale;
        const resonanceMakeupAmount = this.resonanceMakeupAmount;
        const outGain = 1.06;

        const hpInput = this.hpInput;
        const hpFeedback = this.hpFeedback;
        const hpSumming = this.hpSumming;
        const hpOutA = this.hpOutA;
        const hpOutB = this.hpOutB;

        let s1 = this.s1;
        let s2 = this.s2;
        let s3 = this.s3;
        let s4 = this.s4;

        const resetState = () => {
            s1 = s2 = s3 = s4 = 0;
            hpInput.reset();
            hpFeedback.reset();
            hpSumming.reset();
            hpOutA.reset();
            hpOutB.reset();
        };

        // Hot loop split by automation-rate shape to avoid per-sample branching.
        if (!isCutoffARate && !isResonanceARate) {
            let cutoff = cutoffParam[0];
            let resonance = resonanceParam[0];

            if (cutoff < 20.0) cutoff = 20.0;
            if (cutoff > cutoffMax) cutoff = cutoffMax;
            if (resonance < 0.0) resonance = 0.0;
            if (resonance > 0.99) resonance = 0.99;

            const g = Math.tan(cutoff * tanScale);
            if (!Number.isFinite(g)) {
                outputChannel0.fill(0);
                if (hasStereo) outputChannel1.fill(0);
                resetState();
            } else {
                const onePlusG = 1.0 + g;
                const invOnePlusG = 1.0 / onePlusG;
                const G = g * invOnePlusG;
                const G2 = G * G;
                const G3 = G2 * G;
                const G4 = G2 * G2;
                const K = resonance * 4.0;
                const invDenom = 1.0 / (1.0 + K * G4);
                // TUNABLE: quadratic compensation keeps low/mid RES mostly intact.
                const resonanceMakeup = 1.0 + (resonanceMakeupAmount * resonance * resonance);

                for (let i = 0; i < frames; i++) {
                    const xhp = hpInput.process(inputChannel[i]);
                    const S = (G3 * s1 + G2 * s2 + G * s3 + s4) * invOnePlusG;
                    const shapedFeedback = hpFeedback.process(S);
                    const summed = hpSumming.process(xhp - K * Math.tanh(shapedFeedback));
                    const u = summed * invDenom;

                    const v1 = (u - s1) * G;
                    const y1 = v1 + s1;
                    s1 = y1 + v1;

                    const v2 = (y1 - s2) * G;
                    const y2 = v2 + s2;
                    s2 = y2 + v2;

                    const v3 = (y2 - s3) * G;
                    const y3 = v3 + s3;
                    s3 = y3 + v3;

                    const v4 = (y3 - s4) * G;
                    const y4 = v4 + s4;
                    s4 = y4 + v4;

                    const yOut = outGain * resonanceMakeup * hpOutB.process(hpOutA.process(y4));

                    if (!Number.isFinite(yOut)) {
                        resetState();
                        outputChannel0[i] = 0;
                    } else {
                        outputChannel0[i] = yOut;
                    }

                    if (hasStereo) outputChannel1[i] = outputChannel0[i];
                }
            }
        } else if (!isCutoffARate && isResonanceARate) {
            let cutoff = cutoffParam[0];
            if (cutoff < 20.0) cutoff = 20.0;
            if (cutoff > cutoffMax) cutoff = cutoffMax;

            const g = Math.tan(cutoff * tanScale);
            if (!Number.isFinite(g)) {
                outputChannel0.fill(0);
                if (hasStereo) outputChannel1.fill(0);
                resetState();
            } else {
                const onePlusG = 1.0 + g;
                const invOnePlusG = 1.0 / onePlusG;
                const G = g * invOnePlusG;
                const G2 = G * G;
                const G3 = G2 * G;
                const G4 = G2 * G2;

                for (let i = 0; i < frames; i++) {
                    let resonance = resonanceParam[i];
                    if (resonance < 0.0) resonance = 0.0;
                    if (resonance > 0.99) resonance = 0.99;
                    const K = resonance * 4.0;
                    const invDenom = 1.0 / (1.0 + K * G4);
                    const resonanceMakeup = 1.0 + (resonanceMakeupAmount * resonance * resonance);

                    const xhp = hpInput.process(inputChannel[i]);
                    const S = (G3 * s1 + G2 * s2 + G * s3 + s4) * invOnePlusG;
                    const shapedFeedback = hpFeedback.process(S);
                    const summed = hpSumming.process(xhp - K * Math.tanh(shapedFeedback));
                    const u = summed * invDenom;

                    const v1 = (u - s1) * G;
                    const y1 = v1 + s1;
                    s1 = y1 + v1;

                    const v2 = (y1 - s2) * G;
                    const y2 = v2 + s2;
                    s2 = y2 + v2;

                    const v3 = (y2 - s3) * G;
                    const y3 = v3 + s3;
                    s3 = y3 + v3;

                    const v4 = (y3 - s4) * G;
                    const y4 = v4 + s4;
                    s4 = y4 + v4;

                    const yOut = outGain * resonanceMakeup * hpOutB.process(hpOutA.process(y4));

                    if (!Number.isFinite(yOut)) {
                        resetState();
                        outputChannel0[i] = 0;
                    } else {
                        outputChannel0[i] = yOut;
                    }

                    if (hasStereo) outputChannel1[i] = outputChannel0[i];
                }
            }
        } else if (isCutoffARate && !isResonanceARate) {
            let resonance = resonanceParam[0];
            if (resonance < 0.0) resonance = 0.0;
            if (resonance > 0.99) resonance = 0.99;
            const K = resonance * 4.0;
            const resonanceMakeup = 1.0 + (resonanceMakeupAmount * resonance * resonance);

            for (let i = 0; i < frames; i++) {
                let cutoff = cutoffParam[i];
                if (cutoff < 20.0) cutoff = 20.0;
                if (cutoff > cutoffMax) cutoff = cutoffMax;

                const g = Math.tan(cutoff * tanScale);
                if (!Number.isFinite(g)) {
                    outputChannel0[i] = 0;
                    if (hasStereo) outputChannel1[i] = 0;
                    continue;
                }

                const onePlusG = 1.0 + g;
                const invOnePlusG = 1.0 / onePlusG;
                const G = g * invOnePlusG;
                const G2 = G * G;
                const G3 = G2 * G;
                const G4 = G2 * G2;
                const invDenom = 1.0 / (1.0 + K * G4);

                const xhp = hpInput.process(inputChannel[i]);
                const S = (G3 * s1 + G2 * s2 + G * s3 + s4) * invOnePlusG;
                const shapedFeedback = hpFeedback.process(S);
                const summed = hpSumming.process(xhp - K * Math.tanh(shapedFeedback));
                const u = summed * invDenom;

                const v1 = (u - s1) * G;
                const y1 = v1 + s1;
                s1 = y1 + v1;

                const v2 = (y1 - s2) * G;
                const y2 = v2 + s2;
                s2 = y2 + v2;

                const v3 = (y2 - s3) * G;
                const y3 = v3 + s3;
                s3 = y3 + v3;

                const v4 = (y3 - s4) * G;
                const y4 = v4 + s4;
                s4 = y4 + v4;

                const yOut = outGain * resonanceMakeup * hpOutB.process(hpOutA.process(y4));

                if (!Number.isFinite(yOut)) {
                    resetState();
                    outputChannel0[i] = 0;
                } else {
                    outputChannel0[i] = yOut;
                }

                if (hasStereo) outputChannel1[i] = outputChannel0[i];
            }
        } else {
            for (let i = 0; i < frames; i++) {
                let cutoff = cutoffParam[i];
                let resonance = resonanceParam[i];
                if (cutoff < 20.0) cutoff = 20.0;
                if (cutoff > cutoffMax) cutoff = cutoffMax;
                if (resonance < 0.0) resonance = 0.0;
                if (resonance > 0.99) resonance = 0.99;

                const g = Math.tan(cutoff * tanScale);
                if (!Number.isFinite(g)) {
                    outputChannel0[i] = 0;
                    if (hasStereo) outputChannel1[i] = 0;
                    continue;
                }

                const onePlusG = 1.0 + g;
                const invOnePlusG = 1.0 / onePlusG;
                const G = g * invOnePlusG;
                const G2 = G * G;
                const G3 = G2 * G;
                const G4 = G2 * G2;
                const K = resonance * 4.0;
                const invDenom = 1.0 / (1.0 + K * G4);
                const resonanceMakeup = 1.0 + (resonanceMakeupAmount * resonance * resonance);

                const xhp = hpInput.process(inputChannel[i]);
                const S = (G3 * s1 + G2 * s2 + G * s3 + s4) * invOnePlusG;
                const shapedFeedback = hpFeedback.process(S);
                const summed = hpSumming.process(xhp - K * Math.tanh(shapedFeedback));
                const u = summed * invDenom;

                const v1 = (u - s1) * G;
                const y1 = v1 + s1;
                s1 = y1 + v1;

                const v2 = (y1 - s2) * G;
                const y2 = v2 + s2;
                s2 = y2 + v2;

                const v3 = (y2 - s3) * G;
                const y3 = v3 + s3;
                s3 = y3 + v3;

                const v4 = (y3 - s4) * G;
                const y4 = v4 + s4;
                s4 = y4 + v4;

                const yOut = outGain * resonanceMakeup * hpOutB.process(hpOutA.process(y4));

                if (!Number.isFinite(yOut)) {
                    resetState();
                    outputChannel0[i] = 0;
                } else {
                    outputChannel0[i] = yOut;
                }

                if (hasStereo) outputChannel1[i] = outputChannel0[i];
            }
        }

        this.s1 = s1;
        this.s2 = s2;
        this.s3 = s3;
        this.s4 = s4;

        return true;
    }
}

registerProcessor('tb303-filter', TB303FilterProcessor);
