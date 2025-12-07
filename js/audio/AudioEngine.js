import { UI } from '../ui/UI.js';
import { Data } from '../data/Data.js';
import { TB303 } from './TB303.js';
import { TR909 } from './TR909.js';

export const AudioEngine = {
    ctx: null,
    master: null,
    analyser: null, // FFT Analyser
    clockNode: null, // AudioWorkletNode
    isPlaying: false,
    tempo: 125,
    swing: 50,
    currentStep: 0,
    currentSongIndex: 0,

    // Fallback Scheduler State
    useWorklet: false,
    nextNoteTime: 0.0,
    scheduleAheadTime: 0.1,
    timerID: null,

    // Instruments Map
    instruments: new Map(),

    async init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();

            // --- FFT Analyser Setup ---
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 2048; // High resolution for visuals

            this.master = this.ctx.createDynamicsCompressor();
            this.master.threshold.value = -8;
            this.master.ratio.value = 12;

            const outGain = this.ctx.createGain();
            outGain.gain.value = 0.8;

            // Chain: Master -> Analyser -> OutGain -> Destination
            this.master.connect(this.analyser);
            this.analyser.connect(outGain);
            outGain.connect(this.ctx.destination);

            // Initialize Instruments
            this.addInstrument('tb303_1', new TB303(this.ctx, this.master));
            this.addInstrument('tb303_2', new TB303(this.ctx, this.master));
            this.addInstrument('tr909', new TR909(this.ctx, this.master));

            // --- AudioWorklet Setup ---
            if (this.ctx.audioWorklet) {
                try {
                    await this.ctx.audioWorklet.addModule('js/audio/ClockProcessor.js');
                    this.clockNode = new AudioWorkletNode(this.ctx, 'clock-processor');

                    this.clockNode.port.onmessage = (e) => {
                        if (e.data.type === 'tick') {
                            this.handleTick(e.data);
                        }
                    };

                    this.clockNode.connect(this.ctx.destination);
                    this.useWorklet = true;
                    console.log("AudioEngine: Using AudioWorklet for timing.");

                } catch (err) {
                    console.warn('AudioEngine: Failed to load AudioWorklet, falling back to setTimeout.', err);
                    this.useWorklet = false;
                }
            } else {
                console.warn('AudioEngine: AudioWorklet not supported (insecure context?), falling back to setTimeout.');
                this.useWorklet = false;
            }
        }
        if (this.ctx.state === 'suspended') await this.ctx.resume();
    },

    addInstrument(id, instance) {
        this.instruments.set(id, instance);
    },

    async play() {
        if (!this.ctx) await this.init();
        if (this.isPlaying) return;
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        // Check if UI is initialized
        if (!UI.isInitialized) {
            console.warn("UI not initialized yet, adding play to pending callbacks");
            if (!UI.pendingInitCallbacks) {
                UI.pendingInitCallbacks = [];
            }
            UI.pendingInitCallbacks.push(() => {
                console.log("Executing pending play callback after UI initialization");
                this.play();
            });
            return;
        }

        this.isPlaying = true;
        this.currentStep = 0;
        this.currentSongIndex = 0;
        this.nextNoteTime = this.ctx.currentTime; // For fallback scheduler

        // Reset all instruments
        this.instruments.forEach(inst => {
            if (inst.stop) inst.stop(this.ctx.currentTime);
            else if (inst.kill) inst.kill(this.ctx.currentTime);
        });

        if (Data.mode === 'song') {
            // Apply Sound Settings for the first pattern in Song Mode
            if (!Data.keepSoundSettings && Data.song.length > 0) {
                const firstPatternId = Data.song[0];
                Data.applyPatternSettings(firstPatternId);
            }
            UI.updateSongTimeline();
        }

        if (this.useWorklet && this.clockNode) {
            // Send Start Message to Worklet
            this.clockNode.port.postMessage({ type: 'start' });
            this.clockNode.port.postMessage({ type: 'tempo', value: this.tempo });
            this.clockNode.port.postMessage({ type: 'swing', value: this.swing });
        } else {
            // Start Fallback Scheduler
            this.scheduler();
        }
    },

    stop() {
        this.isPlaying = false;
        this.currentSongIndex = 0;
        UI.clearPlayhead();

        if (this.ctx) {
            this.instruments.forEach(inst => {
                if (inst.stop) inst.stop(this.ctx.currentTime);
                else if (inst.kill) inst.kill(this.ctx.currentTime);
            });
        }

        if (Data.mode === 'song') {
            UI.updateSongTimeline();
        }

        if (this.useWorklet && this.clockNode) {
            this.clockNode.port.postMessage({ type: 'stop' });
        } else {
            window.clearTimeout(this.timerID);
        }
    },

    setTempo(newTempo) {
        this.tempo = newTempo;
        if (this.useWorklet && this.clockNode) {
            this.clockNode.port.postMessage({ type: 'tempo', value: newTempo });
        }
    },

    setSwing(newSwing) {
        this.swing = newSwing;
        if (this.useWorklet && this.clockNode) {
            this.clockNode.port.postMessage({ type: 'swing', value: newSwing });
        }
    },

    // --- Worklet Handler ---
    handleTick(data) {
        const { time, step } = data;
        this.currentStep = step;

        // Song Mode Logic
        if (this.lastStep === 15 && step === 0) {
            if (Data.mode === 'song') {
                this.currentSongIndex++;
                if (this.currentSongIndex >= Data.song.length) {
                    this.currentSongIndex = 0;
                }

                // Apply Sound Settings for the new pattern in Song Mode
                if (!Data.keepSoundSettings) {
                    const nextPatternId = Data.song[this.currentSongIndex];
                    Data.applyPatternSettings(nextPatternId);
                }

                UI.updateSongTimeline();
                UI.renderAll();
            }
        }
        this.lastStep = step;

        this.schedule(time, step);
    },

    // --- Fallback Scheduler (setTimeout) ---
    scheduler() {
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.schedule(this.nextNoteTime, this.currentStep);
            this.nextNote();
        }
        if (this.isPlaying) this.timerID = window.setTimeout(this.scheduler.bind(this), 25);
    },

    nextNote() {
        const secondsPerBeat = 60.0 / this.tempo;
        const base16th = secondsPerBeat / 4;

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

        if (this.currentStep === 16) {
            this.currentStep = 0;
            // End of Bar Logic
            if (Data.mode === 'song') {
                this.currentSongIndex++;
                if (this.currentSongIndex >= Data.song.length) {
                    this.currentSongIndex = 0; // Loop Song
                }

                // Apply Sound Settings for the new pattern in Song Mode
                if (!Data.keepSoundSettings) {
                    const nextPatternId = Data.song[this.currentSongIndex];
                    Data.applyPatternSettings(nextPatternId);
                }

                UI.updateSongTimeline();
                UI.renderAll();
            }
        }
    },

    schedule(time, stepIndex) {
        this.instruments.forEach((inst, id) => {
            const seqData = Data.getSequence(id);
            const params = UI.getParams(id);
            if (seqData && params) {
                inst.processStep(time, stepIndex, seqData, params, this.tempo);
            }
        });

        // UI Update
        // For fallback, we can draw immediately as timing is less precise anyway,
        // or use the same delay logic.
        const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
        setTimeout(() => {
            UI.drawPlayhead(stepIndex);
        }, delay);
    },

    // Expose kill methods for preview logic in UI
    kill303(unitId, time) {
        const id = `tb303_${unitId}`;
        const inst = this.instruments.get(id);
        if (inst) inst.kill(time);
    },

    // Expose voice method for preview logic in UI
    voice303(time, step, params, unitId) {
        const id = `tb303_${unitId}`;
        const inst = this.instruments.get(id);
        if (inst) {
            inst.playStep(time, step, params, null, this.tempo);
        }
    },

    // FFT Data for Visuals
    getAudioData(dataArray, type = 'frequency') {
        if (!this.analyser) return;
        if (type === 'time') {
            this.analyser.getByteTimeDomainData(dataArray);
        } else {
            this.analyser.getByteFrequencyData(dataArray);
        }
    }
};
