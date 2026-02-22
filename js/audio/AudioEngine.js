import { UI } from '../ui/UI.js';
import { Data } from '../data/Data.js';
import { TB303 } from './TB303.js';
import { TR909 } from './TR909.js';

export const AudioEngine = {
    ctx: null,
    master: null,
    analyser: null, // FFT Analyser
    clockNode: null, // AudioWorkletNode
    isInitialized: false,
    initPromise: null,
    hasVisibilityHandler: false,
    isPlaying: false,
    transportCommandId: 0,
    iosSessionBridgeEl: null,
    tempo: 125,
    swing: 50,
    currentStep: 0,
    currentSongIndex: 0,
    queuedPatternId: null,

    // Fallback Scheduler State
    useWorklet: false,
    nextNoteTime: 0.0,
    scheduleAheadTime: 0.1,
    timerID: null,
    workletWatchdogTimer: null,
    awaitingWorkletTick: false,
    workletRecoveryAttempts: 0,

    // Instruments Map
    instruments: new Map(),

    ensureContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.ctx;
    },

    isIOSDevice() {
        const ua = navigator.userAgent || '';
        const platform = navigator.platform || '';
        const touchPoints = navigator.maxTouchPoints || 0;
        return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
    },

    async primeIOSAudioSession() {
        if (!this.isIOSDevice()) return;

        if (!this.iosSessionBridgeEl) {
            const el = document.createElement('audio');
            // Tiny silent WAV used to keep iOS audio session in a playable state.
            el.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
            el.preload = 'auto';
            el.setAttribute('playsinline', 'true');
            el.setAttribute('webkit-playsinline', 'true');
            el.setAttribute('x-webkit-airplay', 'deny');
            this.iosSessionBridgeEl = el;
        }

        try {
            this.iosSessionBridgeEl.currentTime = 0;
            const playPromise = this.iosSessionBridgeEl.play();
            if (playPromise && typeof playPromise.then === 'function') {
                playPromise
                    .then(() => {
                        try {
                            this.iosSessionBridgeEl.pause();
                            this.iosSessionBridgeEl.currentTime = 0;
                        } catch (e) { }
                    })
                    .catch((err) => {
                        console.warn('AudioEngine: iOS media session bridge play failed.', err);
                    });
            }
        } catch (err) {
            console.warn('AudioEngine: iOS media session bridge play failed.', err);
        }
    },

    async resumeContext() {
        const ctx = this.ensureContext();
        if (ctx.state === 'running') {
            this.primeIOSAudioSession();
            return true;
        }
        try {
            await ctx.resume();
            if (ctx.state === 'interrupted') {
                // Some iOS devices get stuck in interrupted state until a suspend/resume cycle.
                await ctx.suspend();
                await ctx.resume();
            }
        } catch (err) {
            console.warn('AudioEngine: AudioContext resume blocked until next user gesture.', err);
        }
        const running = ctx.state === 'running';
        if (running) {
            this.primeIOSAudioSession();
        }
        return running;
    },

    withTimeout(promise, timeoutMs, label = 'operation') {
        let timeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => {
                reject(new Error(`${label} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => {
            if (timeoutId !== null) window.clearTimeout(timeoutId);
        });
    },

    showResumeOverlay() {
        const overlay = document.getElementById('audioResumeOverlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
    },

    hideResumeOverlay() {
        const overlay = document.getElementById('audioResumeOverlay');
        if (!overlay) return;
        overlay.classList.add('hidden');
        overlay.style.display = '';
    },

    async init() {
        this.ensureContext();

        // Resume as early as possible so first touch on Play is not lost
        // behind async buffer/worklet loading.
        await this.resumeContext();
        if (this.isInitialized) {
            await this.resumeContext();
            return;
        }

        if (!this.initPromise) {
            this.initPromise = (async () => {
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
                this.instruments.clear();
                this.addInstrument('tb303_1', new TB303(this.ctx, this.master));
                this.addInstrument('tb303_2', new TB303(this.ctx, this.master));
                const tr909 = new TR909(this.ctx, this.master);
                this.addInstrument('tr909', tr909);

                // Fetch 909 samples
                try {
                    await this.withTimeout(tr909.initBuffers(), 4500, 'TR909 buffer init');
                } catch (err) {
                    console.warn('AudioEngine: TR-909 sample init stalled, continuing without blocking audio startup.', err);
                    try {
                        tr909.initVoices();
                    } catch (voiceErr) {
                        console.error('AudioEngine: Failed to initialize fallback TR-909 voices.', voiceErr);
                    }
                }

                // --- AudioWorklet Setup ---
                if (this.ctx.audioWorklet) {
                    try {
                        await this.withTimeout(
                            this.ctx.audioWorklet.addModule('js/audio/TB303FilterProcessor.js'),
                            3000,
                            'TB303 worklet module load'
                        );
                        await this.withTimeout(
                            this.ctx.audioWorklet.addModule('js/audio/ClockProcessor.js'),
                            3000,
                            'Clock worklet module load'
                        );
                        this.createClockNode();
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

                // --- iOS Safari Background Resume Handler ---
                if (!this.hasVisibilityHandler) {
                    this.setupVisibilityHandler();
                    this.hasVisibilityHandler = true;
                }

                this.isInitialized = true;
            })().finally(() => {
                this.initPromise = null;
            });
        }

        await this.initPromise;
        await this.resumeContext();
    },

    // Handle iOS Safari background resume
    setupVisibilityHandler() {
        const overlay = document.getElementById('audioResumeOverlay');
        if (!overlay) return;

        // Handle visibility change (background -> foreground)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isPlaying && this.ctx) {
                // Check if AudioContext is suspended after returning from background
                if (this.ctx.state !== 'running') {
                    console.log('AudioEngine: AudioContext suspended after background, showing resume overlay');
                    this.showResumeOverlay();
                }
            }
        });

        // Handle overlay tap to resume
        overlay.addEventListener('click', async () => {
            if (!this.ctx) return;
            const resumed = await this.resumeContext();
            if (resumed) {
                console.log('AudioEngine: AudioContext resumed via user tap');
                this.hideResumeOverlay();
            }
        });

        // Also handle touch events for better iOS responsiveness
        overlay.addEventListener('touchend', async (e) => {
            e.preventDefault();
            if (!this.ctx) return;
            const resumed = await this.resumeContext();
            if (resumed) {
                console.log('AudioEngine: AudioContext resumed via user touch');
                this.hideResumeOverlay();
            }
        }, { passive: false });
    },

    addInstrument(id, instance) {
        this.instruments.set(id, instance);
    },

    attachClockNode(node) {
        this.clockNode = node;
        this.clockNode.port.onmessage = (e) => {
            if (e.data.type === 'tick') {
                this.handleTick(e.data);
            }
        };
        this.clockNode.connect(this.ctx.destination);
    },

    createClockNode() {
        if (!this.ctx) return null;
        const node = new AudioWorkletNode(this.ctx, 'clock-processor');
        this.attachClockNode(node);
        return node;
    },

    async recoverWorkletClock() {
        if (!this.ctx || !this.ctx.audioWorklet) return false;
        try {
            if (this.clockNode) {
                try { this.clockNode.port.onmessage = null; } catch (e) { }
                try { this.clockNode.disconnect(); } catch (e) { }
            }

            this.createClockNode();
            if (!this.clockNode) return false;

            if (this.isPlaying) {
                const restartTime = this.ctx.currentTime + 0.005;
                this.nextNoteTime = restartTime;
                this.clockNode.port.postMessage({ type: 'start', startTime: restartTime });
                this.clockNode.port.postMessage({ type: 'tempo', value: this.tempo });
                this.clockNode.port.postMessage({ type: 'swing', value: this.swing });
                this.armWorkletWatchdog();
            }

            return true;
        } catch (err) {
            console.error('AudioEngine: Failed to recover AudioWorklet clock.', err);
            return false;
        }
    },

    clearWorkletWatchdog() {
        if (this.workletWatchdogTimer) {
            window.clearTimeout(this.workletWatchdogTimer);
            this.workletWatchdogTimer = null;
        }
        this.awaitingWorkletTick = false;
    },

    armWorkletWatchdog() {
        if (!this.useWorklet || !this.clockNode) return;
        this.clearWorkletWatchdog();
        this.awaitingWorkletTick = true;
        this.workletWatchdogTimer = window.setTimeout(() => {
            if (!this.isPlaying || !this.awaitingWorkletTick) return;
            this.clearWorkletWatchdog();
            this.workletRecoveryAttempts += 1;

            // Keep worklet clock quality instead of degrading to timer fallback.
            if (this.workletRecoveryAttempts > 1) {
                console.error('AudioEngine: AudioWorklet clock tick missing after recovery, stopping transport.');
                this.stopInternal(false);
                this.showResumeOverlay();
                return;
            }

            console.warn('AudioEngine: No clock tick from AudioWorklet, attempting clock recovery.');
            this.recoverWorkletClock().then((ok) => {
                if (!ok) {
                    this.stopInternal(false);
                    this.showResumeOverlay();
                }
            });
        }, 500);
    },

    queuePatternSwitch(patternId) {
        if (Data.mode !== 'pattern' || !this.isPlaying) return false;
        if (!Number.isInteger(patternId) || patternId < 0 || patternId > 15) return false;

        if (patternId === Data.currentPatternId) {
            this.queuedPatternId = null;
            if (UI.updatePatternButtonsState) UI.updatePatternButtonsState();
            return false;
        }

        this.queuedPatternId = patternId;
        if (UI.updatePatternButtonsState) UI.updatePatternButtonsState();
        return true;
    },

    clearPatternSwitchQueue(updateUI = true) {
        if (this.queuedPatternId === null) return;
        this.queuedPatternId = null;
        if (updateUI && UI.updatePatternButtonsState) UI.updatePatternButtonsState();
    },

    applyQueuedPatternSwitch() {
        if (Data.mode !== 'pattern' || this.queuedPatternId === null) return;
        const nextPatternId = this.queuedPatternId;
        this.queuedPatternId = null;
        Data.selectPattern(nextPatternId);
    },

    async play(restartFromTop = false) {
        const commandId = ++this.transportCommandId;

        // First attempt must happen before heavyweight async init().
        await this.resumeContext();
        if (commandId !== this.transportCommandId) return;
        if (!this.isInitialized) await this.init();
        if (commandId !== this.transportCommandId) return;
        await this.resumeContext();
        if (commandId !== this.transportCommandId) return;

        if (!this.ctx || this.ctx.state !== 'running') {
            this.showResumeOverlay();
            return;
        }

        if (this.isPlaying) {
            if (!restartFromTop) return;
            this.stopInternal(false);
            if (commandId !== this.transportCommandId) return;
        }

        // Check if UI is initialized
        if (!UI.isInitialized) {
            console.warn("UI not initialized yet, adding play to pending callbacks");
            if (!UI.pendingInitCallbacks) {
                UI.pendingInitCallbacks = [];
            }
            UI.pendingInitCallbacks.push(() => {
                console.log("Executing pending play callback after UI initialization");
                this.play(restartFromTop);
            });
            return;
        }

        this.isPlaying = true;
        this.workletRecoveryAttempts = 0;
        this.currentStep = 0;
        this.currentSongIndex = 0;
        this.lastStep = null;
        this.clearPatternSwitchQueue(false);

        // Start from step 0 immediately on transport play/restart.
        const startTime = this.ctx.currentTime + 0.005;
        this.nextNoteTime = startTime; // For fallback scheduler

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
            this.clockNode.port.postMessage({ type: 'start', startTime });
            this.clockNode.port.postMessage({ type: 'tempo', value: this.tempo });
            this.clockNode.port.postMessage({ type: 'swing', value: this.swing });
            this.armWorkletWatchdog();
        } else {
            // Start Fallback Scheduler
            this.scheduler();
        }
    },

    stopInternal(invalidateCommand = true) {
        if (invalidateCommand) this.transportCommandId++;

        this.isPlaying = false;
        this.workletRecoveryAttempts = 0;
        this.currentSongIndex = 0;
        this.lastStep = null;
        this.clearWorkletWatchdog();
        UI.clearPlayhead();
        this.clearPatternSwitchQueue();

        if (this.ctx) {
            this.instruments.forEach(inst => {
                if (inst.stop) inst.stop(this.ctx.currentTime);
                else if (inst.kill) inst.kill(this.ctx.currentTime);
            });
        }

        if (Data.mode === 'song') {
            UI.updateSongTimeline();
        }

        if (this.clockNode) {
            this.clockNode.port.postMessage({ type: 'stop' });
        }
        if (!this.useWorklet) {
            window.clearTimeout(this.timerID);
        }
    },

    stop() {
        this.stopInternal(true);
    },

    setTempo(newTempo) {
        this.tempo = newTempo;
        if (this.useWorklet && this.clockNode) {
            this.clockNode.port.postMessage({ type: 'tempo', value: newTempo });
        }
        if (UI.updateQueuedPatternBlinkTempo) UI.updateQueuedPatternBlinkTempo();
    },

    setSwing(newSwing) {
        this.swing = newSwing;
        if (this.useWorklet && this.clockNode) {
            this.clockNode.port.postMessage({ type: 'swing', value: newSwing });
        }
    },

    // --- Worklet Handler ---
    handleTick(data) {
        if (!this.useWorklet || !this.isPlaying) return;
        if (this.awaitingWorkletTick) {
            this.clearWorkletWatchdog();
        }
        this.workletRecoveryAttempts = 0;

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
            } else if (Data.mode === 'pattern') {
                this.applyQueuedPatternSwitch();
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
            } else if (Data.mode === 'pattern') {
                this.applyQueuedPatternSwitch();
            }
        }
    },

    schedule(time, stepIndex) {
        this.instruments.forEach((inst, id) => {
            const seqData = Data.getSequence(id);
            const params = UI.getParams(id);
            if (seqData && params) {
                if (id === 'tb303_1' || id === 'tb303_2') {
                    const unitId = id === 'tb303_1' ? 1 : 2;
                    const playbackStep = UI.get303PlaybackStep(unitId, stepIndex, seqData);
                    if (playbackStep) {
                        inst.processStep(
                            time,
                            stepIndex,
                            seqData,
                            params,
                            this.tempo,
                            playbackStep.step,
                            playbackStep.prevStep
                        );
                        return;
                    }
                }
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

    voice909(time, type, params) {
        const inst = this.instruments.get('tr909');
        if (inst) {
            if (type === 'bd') inst.playBD(time, params.bd);
            if (type === 'sd') inst.playSD(time, params.sd);
            if (type === 'lt' || type === 'mt' || type === 'ht') inst.playTom(time, type, params[type]);
            if (type === 'ch') inst.playHat(time, false, params.ch);
            if (type === 'oh') inst.playHat(time, true, params.oh);
            if (type === 'cr' || type === 'rd') inst.playCym(time, type, params[type]);
            if (type === 'rs') inst.playRim(time, params.rs);
            if (type === 'cp') inst.playCP(time, params.cp);
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
