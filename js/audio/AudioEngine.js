import { UI } from '../ui/UI.js';
import { Data } from '../data/Data.js';
import { TB303 } from './TB303.js';
import { TR909 } from './TR909.js';

export const AudioEngine = {
    ctx: null,
    master: null,
    isPlaying: false,
    tempo: 125,
    currentStep: 0,
    nextNoteTime: 0.0,
    scheduleAheadTime: 0.1,
    timerID: null,

    // Instruments Map
    instruments: new Map(),

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createDynamicsCompressor();
            this.master.threshold.value = -8;
            this.master.ratio.value = 12;

            const outGain = this.ctx.createGain();
            outGain.gain.value = 0.8;

            this.master.connect(outGain);
            outGain.connect(this.ctx.destination);

            // Initialize Instruments
            this.addInstrument('tb303_1', new TB303(this.ctx, this.master));
            this.addInstrument('tb303_2', new TB303(this.ctx, this.master));
            this.addInstrument('tr909', new TR909(this.ctx, this.master));

            this.nextNoteTime = 0;
            this.currentStep = 0;
            this.currentSongIndex = 0; // Track Song Position (Bar)
            this.tempo = 125;
            this.isPlaying = false;
            this.scheduleAheadTime = 0.1;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    addInstrument(id, instance) {
        this.instruments.set(id, instance);
    },

    play() {
        if (!this.ctx) this.init();
        if (this.isPlaying) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.isPlaying = true;
        this.currentStep = 0;
        this.currentSongIndex = 0; // Reset Song Position
        this.nextNoteTime = this.ctx.currentTime;

        // Reset all instruments
        this.instruments.forEach(inst => {
            if (inst.kill) inst.kill(this.ctx.currentTime);
        });

        this.scheduler();
    },

    stop() {
        this.isPlaying = false;
        this.currentSongIndex = 0; // Reset Song Position
        window.clearTimeout(this.timerID);
        UI.clearPlayhead();
        if (this.ctx) {
            this.instruments.forEach(inst => {
                if (inst.kill) inst.kill(this.ctx.currentTime);
            });
        }
    },

    scheduler() {
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.schedule(this.nextNoteTime);
            this.nextNote();
        }
        if (this.isPlaying) this.timerID = window.setTimeout(this.scheduler.bind(this), 25);
    },

    nextNote() {
        const secondsPerBeat = 60.0 / this.tempo;
        this.nextNoteTime += 0.25 * secondsPerBeat;
        this.currentStep++;

        if (this.currentStep === 16) {
            this.currentStep = 0;
            // End of Bar Logic
            if (Data.mode === 'song') {
                this.currentSongIndex++;
                if (this.currentSongIndex >= Data.song.length) {
                    this.currentSongIndex = 0; // Loop Song
                }
                // Update UI to show progress in Song Timeline
                // We use requestAnimationFrame or just call UI update directly (async safe)
                // Since this is audio thread timing, better to be careful, but UI updates are usually fine.
                // We'll trigger a visual update for the timeline.
                UI.updateSongTimeline();
                // Also need to re-render grid if the pattern changed!
                UI.renderAll();
            }
        }
    },

    schedule(time) {
        const stepIndex = this.currentStep % 16;

        this.instruments.forEach((inst, id) => {
            const seqData = Data.getSequence(id);
            const params = UI.getParams(id);
            if (seqData && params) {
                inst.processStep(time, stepIndex, seqData, params, this.tempo);
            }
        });

        // UI Update
        UI.drawPlayhead(stepIndex);
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
            // For preview, we don't have a "previous step" context usually, so pass null
            // processStep expects seqData array to find prev step, but playStep takes direct args.
            // We call playStep directly here as it is a specific preview action.
            inst.playStep(time, step, params, null, this.tempo);
        }
    }
};
