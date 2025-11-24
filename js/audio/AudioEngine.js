import { UI } from '../ui/UI.js';
import { Data } from '../data/Data.js';

export const AudioEngine = {
    ctx: null,
    master: null,
    metalBuffer: null,
    noiseBuffer: null,
    isPlaying: false,
    tempo: 125,
    currentStep: 0,
    nextNoteTime: 0.0,
    scheduleAheadTime: 0.1,
    timerID: null,
    active303: { osc: null, filter: null, gain: null, freq: 0 },

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

            this.active303_1 = null;
            this.active303_2 = null;
            this.nextNoteTime = 0;
            this.currentStep = 0;
            this.tempo = 125;
            this.isPlaying = false;
            this.lookahead = 25.0;
            this.scheduleAheadTime = 0.1;

            // Load Noise Buffer for 909
            const bufferSize = this.ctx.sampleRate * 2;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            this.noiseBuffer = buffer;

            // Load Metal Buffer for 909 Hats
            const mb = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const md = mb.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                md[i] = Math.random() * 2 - 1;
            }
            this.metalBuffer = mb;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    play() {
        if (!this.ctx) this.init();
        if (this.isPlaying) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.isPlaying = true;
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime;
        this.active303_1 = null;
        this.active303_2 = null;
        this.scheduler();
    },

    stop() {
        this.isPlaying = false;
        window.clearTimeout(this.timerID);
        UI.clearPlayhead();
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
        this.currentStep = (this.currentStep + 1) % 16;
    },

    schedule(time) {
        const stepIndex = this.currentStep % 16;

        // 303 Unit 1
        const s3_1 = Data.seq303_1[stepIndex];
        if (s3_1 && s3_1.active) {
            this.voice303(time, s3_1, UI.get303Params(1), 1);
        }

        // 303 Unit 2
        const s3_2 = Data.seq303_2[stepIndex];
        if (s3_2 && s3_2.active) {
            this.voice303(time, s3_2, UI.get303Params(2), 2);
        }

        // 909
        const s9 = Data.seq909;
        if (s9.bd[stepIndex]) this.voice909BD(time);
        if (s9.sd[stepIndex]) this.voice909SD(time);
        if (s9.ch[stepIndex]) this.voice909Hat(time, false);
        if (s9.oh[stepIndex]) this.voice909Hat(time, true);
        if (s9.cp[stepIndex]) this.voice909CP(time);

        // UI Update
        UI.drawPlayhead(stepIndex);
    },

    noteToFreq(note, octave) {
        const noteMap = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const semi = (octave * 12) + noteMap.indexOf(note);
        return 16.35 * Math.pow(2, semi / 12);
    },

    voice303(time, step, P, unitId) {
        let active = unitId === 1 ? this.active303_1 : this.active303_2;

        // Calculate Frequency
        let freq = this.noteToFreq(step.note, step.octave);
        freq *= Math.pow(2, P.tune / 1200);

        // Check Slide
        const prevStep = unitId === 1 ? (this.currentStep === 0 ? Data.seq303_1[15] : Data.seq303_1[this.currentStep - 1]) : (this.currentStep === 0 ? Data.seq303_2[15] : Data.seq303_2[this.currentStep - 1]);
        const isSliding = prevStep && prevStep.active && prevStep.slide && step.active;

        if (isSliding && active && active.osc) {
            // --- SLIDE (Legato) ---
            // Glide Pitch
            active.osc.frequency.cancelScheduledValues(time);
            active.osc.frequency.setValueAtTime(active.freq, time);
            active.osc.frequency.linearRampToValueAtTime(freq, time + 0.1);
            active.freq = freq;

            // Update Filter (Smooth transition)
            const baseCut = 300 + (P.cutoff * 8000) + (step.accent ? 800 : 0);
            active.filter.frequency.cancelScheduledValues(time);
            active.filter.frequency.linearRampToValueAtTime(baseCut, time + 0.1);

            // Update Volume (Accent might change)
            const targetVol = (P.vol * 0.7) * (step.accent ? 1.0 : 0.7);
            active.gain.gain.cancelScheduledValues(time);
            active.gain.gain.linearRampToValueAtTime(targetVol, time + 0.1);

            // Extend Oscillator life
            active.osc.stop(time + 2.0); // Extend safety stop

            // If this step is NOT a slide start for the NEXT step, we need to gate off eventually?
            // But here we are AT the slide step. If THIS step also has slide=true, we keep holding.
            // If THIS step has slide=false, we should gate off at the end of this step.
            if (!step.slide) {
                const gateTime = (60 / this.tempo) * 0.5;
                active.gain.gain.setTargetAtTime(0, time + gateTime, 0.02);
            }

        } else {
            // --- NEW NOTE (Retrigger) ---
            this.kill303(unitId, time);

            if (!step.active) return;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = P.wave;
            osc.frequency.setValueAtTime(freq, time);

            // Filter Setup
            const baseCut = 300 + (P.cutoff * 8000) + (step.accent ? 800 : 0);
            filter.type = 'lowpass';

            // TB-303 Resonance: Extended range for "Acid" character
            // Map 0-15 UI range to Q approx 1.0 to 20.0
            const normReso = P.reso / 15;
            const qVal = 1.0 + (normReso * 19.0);
            filter.Q.value = qVal * (step.accent ? 1.5 : 1.0); // Max approx 30.0
            filter.frequency.setValueAtTime(baseCut, time);

            // Filter Envelope
            const envAmount = (P.env * 5000) + (step.accent ? 2000 : 0);
            const decay = 0.2 + (P.decay / 100) * (step.accent ? 0.5 : 1.0);
            filter.frequency.linearRampToValueAtTime(baseCut + envAmount, time + 0.005);
            filter.frequency.setTargetAtTime(baseCut, time + 0.01, decay / 3);

            // Amp Envelope
            const peakVol = (P.vol * 0.7) * (step.accent ? 1.0 : 0.7);
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(peakVol, time + 0.005);
            gain.gain.setTargetAtTime(0, time + 0.01, decay);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.master);

            // Start Oscillator BEFORE scheduling stop
            osc.start(time);

            // Gate Logic
            if (!step.slide) {
                // Normal Step: Gate Off after 50% duration
                const gateTime = (60 / this.tempo) * 0.5;
                gain.gain.setTargetAtTime(0, time + gateTime, 0.02);
                osc.stop(time + gateTime + 0.2);
            } else {
                // Slide Start: Sustain (Don't gate off immediately)
                osc.stop(time + 2.0); // Safety stop long enough for next step
            }

            const newState = { osc, filter, gain, freq };
            if (unitId === 1) this.active303_1 = newState;
            else this.active303_2 = newState;
        }
    },

    kill303(unitId, time) {
        const active = unitId === 1 ? this.active303_1 : this.active303_2;
        if (active && active.osc) {
            try {
                active.osc.stop(time);
                active.gain.gain.cancelScheduledValues(time);
                active.gain.gain.setValueAtTime(0, time);
            } catch (e) { }
            if (unitId === 1) this.active303_1 = null;
            else this.active303_2 = null;
        }
    },

    voice909BD(time) {
        const P = UI.get909Params('bd');

        const baseFreq = 50 + (P.pitch || 0);
        const tuneDepth = 1 + (P.tuneDepth || 3);
        const pitchEnvMs = 0.03 + (P.p1 * 0.0009);
        const ampDecay = 0.15 + (P.p2 * 0.005);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const startFreq = baseFreq * tuneDepth;
        const endFreq = baseFreq;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, time);
        osc.frequency.exponentialRampToValueAtTime(endFreq, time + pitchEnvMs);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(1.5 * P.vol, time + 0.002); // Boosted BD
        gain.gain.exponentialRampToValueAtTime(0.001, time + ampDecay);

        osc.connect(gain);
        gain.connect(this.master);

        // CLICK
        const click = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        click.type = 'square';
        click.frequency.setValueAtTime(3000, time);
        const clickAmp = 0.5 * (P.p3 / 100) * P.vol;
        clickGain.gain.setValueAtTime(clickAmp, time);
        clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.005);
        click.connect(clickGain);
        clickGain.connect(this.master);

        // (옵션) NOISE 레이어 - 위 5번 코드 참고해서 추가

        osc.start(time);
        osc.stop(time + ampDecay + 0.1);
        click.start(time);
        click.stop(time + 0.03);
    },
    voice909SD(time) {
        const P = UI.get909Params('sd');

        // ---- TUNE: 톤 피치 ----
        const tone = this.ctx.createOscillator();
        const toneGain = this.ctx.createGain();

        const startF = 350 + (P.p1);          // 필요하면 range/taper 조절
        const endF = 180 + (P.p1 * 0.5);

        tone.type = 'triangle';
        tone.frequency.setValueAtTime(startF, time);
        tone.frequency.exponentialRampToValueAtTime(endF, time + 0.03); // 짧은 pitch env

        const toneDecay = 0.15;
        toneGain.gain.setValueAtTime(1.2 * P.vol, time); // Boosted SD Tone
        toneGain.gain.exponentialRampToValueAtTime(0.001, time + toneDecay);

        // ---- NOISE: Tone & Snappy ----
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        noise.loop = true;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';

        const noiseGain = this.ctx.createGain();

        const toneNorm = P.p2 / 100;                  // 0..1
        const snapNorm = P.p3 / 100;

        const snapVol = snapNorm * P.vol * 1.2; // Boosted SD Noise
        const noiseDecay = 0.08 + (1.0 - toneNorm) * 0.20;

        noiseFilter.frequency.setValueAtTime(1000 + toneNorm * 5000, time);

        noiseGain.gain.setValueAtTime(snapVol, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + noiseDecay);

        // ---- 라우팅 ----
        tone.connect(toneGain);
        toneGain.connect(this.master);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.master);

        tone.start(time);
        tone.stop(time + 0.3);

        noise.start(time);
        noise.stop(time + noiseDecay + 0.05);
    },

    voice909Hat(time, isOpen) {
        const P = UI.get909Params(isOpen ? 'oh' : 'ch');
        const src = this.ctx.createBufferSource();
        src.buffer = this.metalBuffer; src.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 8000; bp.Q.value = 0.5;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 7000;
        const gain = this.ctx.createGain();
        const baseDecay = isOpen ? (0.2 + P.p1 * 0.01) : (0.05 + P.p1 * 0.001);
        gain.gain.setValueAtTime(1.5 * P.vol, time); // Boosted Hats
        gain.gain.exponentialRampToValueAtTime(0.001, time + baseDecay);
        src.connect(bp); bp.connect(hp); hp.connect(gain); gain.connect(this.master);
        src.start(time); src.stop(time + baseDecay + 0.1);
    },

    voice909CP(time) {
        const P = UI.get909Params('cp');
        const ctx = this.ctx;

        const voiceGain = ctx.createGain();
        voiceGain.gain.value = P.vol * 1.2; // Boosted Clap
        voiceGain.connect(this.master);

        // 공통 노이즈 + BP 필터
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        noise.loop = false;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1500;
        bp.Q.value = 1.8;

        // 전체 테일 길이
        const decayBase = 0.15;
        const decay = decayBase + P.p1 * 0.003; // 150~450ms

        // ---- 펄스 엔벌로프 (여러 번 손뼉) ----
        const pulseGain = ctx.createGain();
        pulseGain.gain.setValueAtTime(0, time);

        const t0 = time;
        const pulseSpacing = 0.012;
        const pulseCount = 4;

        for (let i = 0; i < pulseCount; i++) {
            const pt = t0 + i * pulseSpacing;
            const amp = 1.0 * (1 - i * 0.15); // 뒤로 갈수록 살짝 감소

            pulseGain.gain.linearRampToValueAtTime(amp, pt);
            pulseGain.gain.exponentialRampToValueAtTime(0.001, pt + 0.015);
        }

        // ---- 리버브 테일 엔벌로프 ----
        const tailGain = ctx.createGain();
        tailGain.gain.setValueAtTime(0.6, time + 0.02);
        tailGain.gain.exponentialRampToValueAtTime(0.001, time + decay);

        // 라우팅
        noise.connect(bp);
        bp.connect(pulseGain);
        bp.connect(tailGain);
        pulseGain.connect(voiceGain);
        tailGain.connect(voiceGain);

        noise.start(time);
        noise.stop(time + decay + 0.05);
    }
};
