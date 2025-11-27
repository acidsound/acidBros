class ClockProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isPlaying = false;
        this.tempo = 125;
        this.currentStep = 0;
        this.nextNoteTime = 0;
        this.samplesPerBeat = 0;
        this.sampleRate = 44100; // Will be updated in process if needed, but usually fixed

        this.port.onmessage = (e) => {
            if (e.data.type === 'start') {
                this.isPlaying = true;
                this.currentStep = 0;
                this.nextNoteTime = currentTime; // currentTime is global in Worklet scope
            } else if (e.data.type === 'stop') {
                this.isPlaying = false;
            } else if (e.data.type === 'tempo') {
                this.tempo = e.data.value;
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
        const secondsPer16th = secondsPerBeat / 4;

        // Check if we need to schedule the next note
        // We use a loop to handle cases where the thread might wake up late (though unlikely in Worklet)
        // or if tempo is very fast.
        while (this.nextNoteTime < currentTime + lookahead) {
            this.port.postMessage({
                type: 'tick',
                time: this.nextNoteTime,
                step: this.currentStep
            });

            this.nextNoteTime += secondsPer16th;
            this.currentStep++;
            if (this.currentStep >= 16) {
                this.currentStep = 0;
            }
        }

        return true;
    }
}

registerProcessor('clock-processor', ClockProcessor);
