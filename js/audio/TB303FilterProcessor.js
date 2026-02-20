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
    }

    process(inputs, outputs, parameters) {
        if (inputs.length === 0 || outputs.length === 0) return true;

        const inputBus = inputs[0];
        const outputBus = outputs[0];
        if (inputBus.length === 0 || outputBus.length === 0) return true;

        // Ensure we always read mono/stereo properly
        const inputChannel = inputBus[0];

        // Output channel 0
        const outputChannel0 = outputBus[0];
        // Output channel 1 (if stereo destination)
        const outputChannel1 = outputBus.length > 1 ? outputBus[1] : null;

        const cutoffParam = parameters['cutoff'];
        const resonanceParam = parameters['resonance'];

        // Optimization: Check rate once
        const isCutoffARate = cutoffParam.length > 1;
        const isResonanceARate = resonanceParam.length > 1;

        const frames = inputChannel.length;
        const sampleRate = globalThis.sampleRate || 44100;

        for (let i = 0; i < frames; i++) {
            const cutoff = isCutoffARate ? cutoffParam[i] : cutoffParam[0];
            const resonance = isResonanceARate ? resonanceParam[i] : resonanceParam[0];

            const g = Math.tan(Math.PI * cutoff / sampleRate);
            const G = g / (1.0 + g);
            const K = resonance * 4.0;

            const x = inputChannel[i];

            // ZDF Topology
            const S = (G * G * G * this.s1 + G * G * this.s2 + G * this.s3 + this.s4) / (1.0 + g);
            const u = (x - K * S) / (1.0 + K * G * G * G * G);

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

            outputChannel0[i] = y4;
            if (outputChannel1 !== null) {
                outputChannel1[i] = y4;
            }
        }

        return true;
    }
}

registerProcessor('tb303-filter', TB303FilterProcessor);
