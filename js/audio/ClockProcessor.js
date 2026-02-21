class ClockProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isPlaying = false;
        this.tempo = 125;
        this.currentStep = 0;
        this.nextNoteTime = 0;
        this.samplesPerBeat = 0;
        this.sampleRate = 44100; // Will be updated in process if needed, but usually fixed

        this.swing = 50; // 50% = straight, 66% = triplet, 75% = hard swing

        this.port.onmessage = (e) => {
            if (e.data.type === 'start') {
                this.isPlaying = true;
                this.currentStep = 0;
                const requestedStart = Number(e.data.startTime);
                this.nextNoteTime = Number.isFinite(requestedStart)
                    ? Math.max(requestedStart, currentTime)
                    : currentTime; // currentTime is global in Worklet scope
            } else if (e.data.type === 'stop') {
                this.isPlaying = false;
            } else if (e.data.type === 'tempo') {
                this.tempo = e.data.value;
            } else if (e.data.type === 'swing') {
                this.swing = e.data.value;
            }
        };
    }

    process(inputs, outputs, parameters) {
        // We don't process audio, just time
        if (!this.isPlaying) return true;

        // Calculate lookahead time (e.g. 0.1s ahead)
        // We want to schedule notes slightly in the future
        const lookahead = 0.1;

        // Calculate seconds per beat
        const secondsPerBeat = 60.0 / this.tempo;
        const base16th = secondsPerBeat / 4;

        // Check if we need to schedule the next note
        // We use a loop to handle cases where the thread might wake up late (though unlikely in Worklet)
        // or if tempo is very fast.
        while (this.nextNoteTime < currentTime + lookahead) {
            this.port.postMessage({
                type: 'tick',
                time: this.nextNoteTime,
                step: this.currentStep
            });

            // Calculate duration of current step based on swing
            let duration;
            if (this.currentStep % 2 === 0) {
                // Even step (0, 2, 4...) -> Duration determined by swing
                duration = base16th * 2 * (this.swing / 100);
            } else {
                // Odd step (1, 3, 5...) -> Remainder
                duration = base16th * 2 * ((100 - this.swing) / 100);
            }

            this.nextNoteTime += duration;
            this.currentStep++;
            if (this.currentStep >= 16) {
                this.currentStep = 0;
            }
        }

        return true;
    }
}

registerProcessor('clock-processor', ClockProcessor);
