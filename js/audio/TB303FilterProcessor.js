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

    process(inputs, outputs, parameters) {
        if (outputs.length === 0) return false;

        const outputBus = outputs[0];
        if (!outputBus || outputBus.length === 0) return false;

        const inputBus = inputs[0];
        if (!inputBus || inputBus.length === 0) {
            // No upstream source is connected anymore; allow the processor to terminate.
            this.s1 = this.s2 = this.s3 = this.s4 = 0;
            this.hpInput.reset();
            this.hpFeedback.reset();
            this.hpSumming.reset();
            this.hpOutA.reset();
            this.hpOutB.reset();
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

        const cutoffParam = parameters['cutoff'];
        const resonanceParam = parameters['resonance'];

        const isCutoffARate = cutoffParam.length > 1;
        const isResonanceARate = resonanceParam.length > 1;

        const frames = inputChannel.length;
        const sampleRate = globalThis.sampleRate || 44100;
        if (sampleRate !== this._sampleRate) {
            this._sampleRate = sampleRate;
            this.hpInput.update(sampleRate);
            this.hpFeedback.update(sampleRate);
            this.hpSumming.update(sampleRate);
            this.hpOutA.update(sampleRate);
            this.hpOutB.update(sampleRate);
        }

        for (let i = 0; i < frames; i++) {
            // Clamp parameters to safe ranges
            let cutoff = isCutoffARate ? cutoffParam[i] : cutoffParam[0];
            let resonance = isResonanceARate ? resonanceParam[i] : resonanceParam[0];

            cutoff = Math.max(20.0, Math.min(cutoff, sampleRate * 0.45));
            resonance = Math.max(0.0, Math.min(resonance, 0.99)); // Avoid total self-oscillation crash

            const g = Math.tan(Math.PI * cutoff / sampleRate);
            if (!Number.isFinite(g)) {
                outputChannel0[i] = 0;
                if (outputChannel1 !== null) outputChannel1[i] = 0;
                continue;
            }
            const G = g / (1.0 + g);
            const K = resonance * 4.0;

            const x = inputChannel[i];
            const xhp = this.hpInput.process(x);

            // ZDF topology with diode2-inspired loop HP shaping and soft clipping.
            const S = (G * G * G * this.s1 + G * G * this.s2 + G * this.s3 + this.s4) / (1.0 + g);
            const shapedFeedback = this.hpFeedback.process(S);

            const summed = this.hpSumming.process(xhp - K * Math.tanh(shapedFeedback));
            const u = summed / (1.0 + K * G * G * G * G);

            // Stage 1
            const v1 = (u - this.s1) * G;
            const y1 = v1 + this.s1;
            this.s1 = y1 + v1;

            // Stage 2
            const v2 = (y1 - this.s2) * G;
            const y2 = v2 + this.s2;
            this.s2 = y2 + v2;

            // Stage 3
            const v3 = (y2 - this.s3) * G;
            const y3 = v3 + this.s3;
            this.s3 = y3 + v3;

            // Stage 4
            const v4 = (y3 - this.s4) * G;
            const y4 = v4 + this.s4;
            this.s4 = y4 + v4;
            // TUNABLE: quadratic compensation curve for high resonance attenuation.
            // resonance^2 keeps low/mid RES mostly untouched and focuses correction near the top end.
            const resonanceMakeup = 1.0 + (this.resonanceMakeupAmount * resonance * resonance);
            const yOut = 1.06 * resonanceMakeup * this.hpOutB.process(this.hpOutA.process(y4));

            // NaN Safety check
            if (!Number.isFinite(yOut)) {
                this.s1 = this.s2 = this.s3 = this.s4 = 0;
                this.hpInput.reset();
                this.hpFeedback.reset();
                this.hpSumming.reset();
                this.hpOutA.reset();
                this.hpOutB.reset();
                outputChannel0[i] = 0;
            } else {
                outputChannel0[i] = yOut;
            }

            if (outputChannel1 !== null) {
                outputChannel1[i] = outputChannel0[i];
            }
        }

        return true;
    }
}

registerProcessor('tb303-filter', TB303FilterProcessor);
