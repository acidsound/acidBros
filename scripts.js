/* 
   ================================================================
   UI UTILITY: ROTARY KNOB CLASS
   ================================================================
*/
/* 
   ================================================================
   UI UTILITY: ROTARY KNOB CLASS
   ================================================================
*/
class RotaryKnob {
    constructor(container, label, id, min, max, value, step = 1, size = 'normal') {
        this.min = min;
        this.max = max;
        this.value = value;
        this.step = step;
        this.id = id;
        this.size = size;

        this.wrapper = document.createElement('div');
        this.wrapper.className = 'knob-wrapper';
        if (size === 'large') this.wrapper.classList.add('large');
        if (size === 'small') this.wrapper.classList.add('small');

        if (label) {
            this.labelEl = document.createElement('div');
            this.labelEl.className = 'knob-label';
            this.labelEl.innerText = label;
            this.wrapper.appendChild(this.labelEl);
        }

        this.knobEl = document.createElement('div');
        this.knobEl.className = 'rotary-knob';
        if (size === 'large') this.knobEl.classList.add('large');
        if (size === 'small') this.knobEl.classList.add('small');

        this.inputEl = document.createElement('input');
        this.inputEl.type = 'range';
        this.inputEl.className = 'knob-input';
        this.inputEl.id = id;
        this.inputEl.min = min;
        this.inputEl.max = max;
        this.inputEl.step = step;
        this.inputEl.value = value;

        this.wrapper.appendChild(this.knobEl);
        this.wrapper.appendChild(this.inputEl);
        container.appendChild(this.wrapper);

        this.isDragging = false;
        this.startY = 0;
        this.startVal = 0;

        this.updateVisuals();

        // Use standard event listeners
        this.knobEl.addEventListener('mousedown', this.startDrag.bind(this));
        this.knobEl.addEventListener('touchstart', this.startDrag.bind(this), { passive: false });

        this.boundMove = this.handleMove.bind(this);
        this.boundEnd = this.endDrag.bind(this);

        if (!window.knobInstances) window.knobInstances = {};
        window.knobInstances[id] = this;
    }

    updateVisuals() {
        const range = this.max - this.min;
        const percent = (this.value - this.min) / range;
        const deg = -150 + (percent * 300);
        this.knobEl.style.transform = `rotate(${deg}deg)`;
        this.inputEl.value = this.value;
        // Trigger input event for listeners
        this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    setValue(val) {
        this.value = Math.min(Math.max(val, this.min), this.max);
        this.updateVisuals();
    }

    startDrag(e) {
        if (e.type === 'touchstart') e.preventDefault();

        this.isDragging = true;
        this.startY = e.clientY || e.touches[0].clientY;
        this.startVal = parseFloat(this.value);

        window.addEventListener('mousemove', this.boundMove);
        window.addEventListener('touchmove', this.boundMove, { passive: false });
        window.addEventListener('mouseup', this.boundEnd);
        window.addEventListener('touchend', this.boundEnd);
    }

    handleMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        const clientY = e.clientY || e.touches[0].clientY;
        const deltaY = this.startY - clientY;
        const range = this.max - this.min;
        const sensitivity = 200;
        const deltaVal = (deltaY / sensitivity) * range;
        let newVal = this.startVal + deltaVal;
        newVal = Math.min(Math.max(newVal, this.min), this.max);
        if (this.step) newVal = Math.round(newVal / this.step) * this.step;

        this.value = newVal;
        this.updateVisuals();
    }

    endDrag() {
        this.isDragging = false;
        window.removeEventListener('mousemove', this.boundMove);
        window.removeEventListener('touchmove', this.boundMove);
        window.removeEventListener('mouseup', this.boundEnd);
        window.removeEventListener('touchend', this.boundEnd);
    }
}

/*
   ================================================================
   AUDIO SYSTEM ENGINE
   ================================================================
*/
const AudioEngine = {
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
            const targetVol = P.vol * (step.accent ? 1.0 : 0.7);
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
            const peakVol = P.vol * (step.accent ? 1.0 : 0.7);
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
        gain.gain.linearRampToValueAtTime(1.0 * P.vol, time + 0.002);
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
        toneGain.gain.setValueAtTime(0.8 * P.vol, time);
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

        const snapVol = snapNorm * P.vol;
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
        gain.gain.setValueAtTime(1.2 * P.vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + baseDecay);
        src.connect(bp); bp.connect(hp); hp.connect(gain); gain.connect(this.master);
        src.start(time); src.stop(time + baseDecay + 0.1);
    },

    voice909CP(time) {
        const P = UI.get909Params('cp');
        const ctx = this.ctx;

        const voiceGain = ctx.createGain();
        voiceGain.gain.value = P.vol;
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

/*
   ================================================================
   DATA, RANDOMIZER & SHARING
   ================================================================
*/
const Data = {
    seq303_1: [],
    seq303_2: [],
    seq909: { bd: [], sd: [], ch: [], oh: [], cp: [] },

    init() {
        this.init303(1);
        this.init303(2);
        this.init909();
    },

    init303(unitId) {
        const seq = [];
        for (let i = 0; i < 16; i++) {
            seq.push({ active: false, note: 'C', octave: 2, accent: false, slide: false });
        }
        if (unitId === 1) this.seq303_1 = seq;
        else this.seq303_2 = seq;
    },

    init909() {
        ['bd', 'sd', 'ch', 'oh', 'cp'].forEach(k => this.seq909[k] = Array(16).fill(0));
    },

    randomize() {
        const setK = (id, min, max) => {
            if (window.knobInstances[id]) {
                const val = Math.floor(Math.random() * (max - min + 1)) + min;
                window.knobInstances[id].setValue(val);
            }
        };

        // Randomize 303 Unit 1
        const wave1 = Math.random() > 0.5 ? 'sawtooth' : 'square';
        document.getElementById(wave1 === 'sawtooth' ? 'wave-saw-1' : 'wave-sq-1').checked = true;
        setK('tune303_1', 0, 0); setK('cutoff303_1', 20, 90); setK('reso303_1', 0, 15);
        setK('env303_1', 30, 90); setK('decay303_1', 30, 80); setK('accent303_1', 50, 100); setK('vol303_1', 70, 90);

        // Randomize 303 Unit 2
        const wave2 = Math.random() > 0.5 ? 'sawtooth' : 'square';
        document.getElementById(wave2 === 'sawtooth' ? 'wave-saw-2' : 'wave-sq-2').checked = true;
        setK('tune303_2', 0, 0); setK('cutoff303_2', 20, 90); setK('reso303_2', 0, 15);
        setK('env303_2', 30, 90); setK('decay303_2', 30, 80); setK('accent303_2', 50, 100); setK('vol303_2', 70, 90);

        setK('bd_p1', 10, 60); setK('bd_p2', 30, 80); setK('bd_p3', 60, 100); setK('bd_level', 80, 100);
        setK('sd_p1', 40, 70); setK('sd_p2', 20, 50); setK('sd_p3', 50, 90); setK('sd_level', 80, 100);
        setK('ch_p1', 10, 40); setK('ch_level', 80, 100);
        setK('oh_p1', 40, 80); setK('oh_level', 80, 100);
        setK('cp_p1', 40, 70); setK('cp_level', 80, 100);

        // 12반음 기준 전체 노트 정의
        const ALL_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F',
            'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // 기존 스케일 (C blues 계열)
        const SCALE = ['C', 'D#', 'F', 'F#', 'G', 'A#'];

        // 베이스가 강박에서 주로 잡을 음 (루트/서브돔/도미넌트 느낌)
        const BASS_STRONG_NOTES = ['C', 'F', 'G']; // SCALE의 부분집합

        // 협화 간격(반음 수): 유니즌, m3, M3, P5, m6, M6
        // 0, 3, 4, 7, 8, 9 semitones
        const CONSONANT_INTERVALS = [0, 3, 4, 7, 8, 9];

        // 강박에서 더 엄격하게: 3도/6도 위주
        const STRONG_MELODY_INTERVALS = [3, 4, 8, 9]; // m3, M3, m6, M6
        // 약박: 위 + 유니즌/5도 허용
        const WEAK_MELODY_INTERVALS = [0, 3, 4, 7, 8, 9];

        const noteToIndex = (note) => ALL_NOTES.indexOf(note);


        // ---------- 베이스 라인 생성 ----------
        const randBassSeq = (seq) => {
            seq.forEach((step, i) => {
                const isStrongBeat = (i % 4 === 0); // 0,4,8,12를 강박으로 가정

                // 베이스는 강박에서 더 자주 울리게
                step.active = Math.random() > (isStrongBeat ? 0.1 : 0.5);

                let note;
                if (isStrongBeat) {
                    // 강박: 루트/서브돔/도미넌트 위주
                    note = BASS_STRONG_NOTES[Math.floor(Math.random() * BASS_STRONG_NOTES.length)];
                } else {
                    // 약박: 직전 음을 유지하거나, 스케일 내에서 한 번 점프
                    // Note: inactive steps now also get a note, so we can look at previous step's note safely
                    const prev = i > 0 ? seq[i - 1].note : null;
                    if (prev && Math.random() > 0.5) {
                        note = prev;
                    } else {
                        note = SCALE[Math.floor(Math.random() * SCALE.length)];
                    }
                }
                step.note = note || 'C'; // Fallback to C if something goes wrong
                step.octave = 1 + Math.floor(Math.random() * 1); // 주로 1옥타브
                step.accent = Math.random() > 0.85;
                step.slide = step.active && (Math.random() > 0.8);
            });
        };


        // ---------- 멜로디(상성부) 생성 ----------
        const pickMelodyNoteFromBass = (bassNote, isStrongBeat) => {
            const bassIndex = noteToIndex(bassNote);
            if (bassIndex === -1) {
                return SCALE[Math.floor(Math.random() * SCALE.length)];
            }

            const allowedIntervals = isStrongBeat
                ? STRONG_MELODY_INTERVALS
                : WEAK_MELODY_INTERVALS;

            const candidates = SCALE.filter((note) => {
                const idx = noteToIndex(note);
                if (idx === -1) return false;
                const diff = (idx - bassIndex + 12) % 12;
                return allowedIntervals.includes(diff);
            });

            if (candidates.length > 0) {
                return candidates[Math.floor(Math.random() * candidates.length)];
            } else {
                return SCALE[Math.floor(Math.random() * SCALE.length)];
            }
        };

        const randMelodySeq = (seq, bassSeq) => {
            seq.forEach((step, i) => {
                const isStrongBeat = (i % 4 === 0);
                const bassStep = bassSeq[i];

                step.active = Math.random() > 0.2;

                let note;
                // Even if bass step is inactive, it has a note now, so we can harmonize
                if (bassStep && bassStep.note) {
                    note = pickMelodyNoteFromBass(bassStep.note, isStrongBeat);
                } else {
                    note = SCALE[Math.floor(Math.random() * SCALE.length)];
                }

                step.note = note;
                step.octave = 2 + Math.floor(Math.random() * 2); // 2~3옥타브
                step.accent = Math.random() > 0.7;
                step.slide = step.active && (Math.random() > 0.75);
            });
        };


        // ---------- 호출 예시 ----------

        // this.seq303_2 = 베이스, this.seq303_1 = 멜로디
        randBassSeq(this.seq303_2);                  // 먼저 베이스 생성
        randMelodySeq(this.seq303_1, this.seq303_2); // 베이스를 기준으로 멜로디 생성

        this.init909();
        const t = this.seq909;
        [0, 4, 8, 12].forEach(i => t.bd[i] = 1);
        if (Math.random() > 0.6) t.bd[14] = 1;
        if (Math.random() > 0.85) t.bd[7] = 1;
        [4, 12].forEach(i => { if (Math.random() > 0.5) t.sd[i] = 1; else t.cp[i] = 1; });
        if (Math.random() > 0.7) t.sd[15] = 1;
        if (Math.random() > 0.7) t.sd[6] = 1;
        for (let i = 0; i < 16; i++) {
            if (i % 4 === 2) t.oh[i] = 1;
            else if (Math.random() > 0.3) t.ch[i] = 1;
        }

        UI.renderAll();
    },

    exportState() {
        const knobs = {};
        document.querySelectorAll('.knob-input').forEach(el => {
            knobs[el.id] = parseFloat(el.value);
        });

        const state = {
            ver: 2,
            bpm: AudioEngine.tempo,
            wave1: document.querySelector('input[name="wave303_1"]:checked').value,
            wave2: document.querySelector('input[name="wave303_2"]:checked').value,
            k: knobs,
            s3_1: this.seq303_1,
            s3_2: this.seq303_2,
            s9: this.seq909
        };
        return btoa(JSON.stringify(state));
    },

    importState(code) {
        try {
            const state = JSON.parse(atob(code));
            if (state.bpm) AudioEngine.tempo = state.bpm;

            if (state.k) {
                Object.keys(state.k).forEach(id => {
                    if (window.knobInstances[id]) window.knobInstances[id].setValue(state.k[id]);
                });
            }

            if (state.s3_1) this.seq303_1 = state.s3_1;
            if (state.s3_2) this.seq303_2 = state.s3_2;
            // Backwards compatibility for v1
            if (state.s3) this.seq303_1 = state.s3;

            if (state.s9) this.seq909 = state.s9;

            // Update Tempo Knob
            this.seq909 = state.s9;

            UI.renderAll();
        } catch (e) {
            console.error("Invalid state data", e);
            this.randomize();
        }
    }
};

/*
   ================================================================
   UI CONTROLLER
   ================================================================
*/
const UI = {
    init() {
        this.init303Knobs(1);
        this.init303Knobs(2);
        this.render303Grid(1);
        this.render303Grid(2);
        this.render909();

        document.getElementById('playBtn').onclick = () => AudioEngine.play();
        document.getElementById('stopBtn').onclick = () => AudioEngine.stop();
        document.getElementById('randomBtn').onclick = () => Data.randomize();
        document.getElementById('clearBtn').onclick = () => {
            Data.seq303_1.forEach(s => { s.active = false; s.slide = false; s.accent = false; });
            Data.seq303_2.forEach(s => { s.active = false; s.slide = false; s.accent = false; });
            Object.keys(Data.seq909).forEach(k => Data.seq909[k].fill(0));
            this.renderAll();
        };

        // Tempo Knob
        new RotaryKnob(document.getElementById('tempo-knob-container'), 'TEMPO', 'tempo', 60, 200, 125, 1, 'large');
        // Listen for Tempo Knob changes via the hidden input
        document.getElementById('tempo').addEventListener('input', (e) => {
            AudioEngine.tempo = parseInt(e.target.value);
            document.getElementById('tempoVal').innerText = e.target.value;
        });

        document.getElementById('shareBtn').onclick = () => {
            const code = Data.exportState();
            const url = window.location.origin + window.location.pathname + "#" + code;
            navigator.clipboard.writeText(url).then(() => {
                const toast = document.getElementById('toast');
                toast.innerText = "Link copied! Share your beat.";
                toast.className = "show";
                setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
            });
        };

        if (window.location.hash && window.location.hash.length > 10) {
            Data.importState(window.location.hash.substring(1));
        } else {
            Data.init();
            setTimeout(() => Data.randomize(), 500);
        }
    },

    get303Params(unitId) {
        const getV = (id) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) : 0;
        };
        const waveEl = document.querySelector(`input[name="wave303_${unitId}"]:checked`);
        const wave = waveEl ? waveEl.value : 'sawtooth';

        return {
            wave: wave,
            tune: getV(`tune303_${unitId}`),
            cutoff: getV(`cutoff303_${unitId}`) / 100,
            reso: getV(`reso303_${unitId}`),
            env: getV(`env303_${unitId}`) / 100,
            decay: getV(`decay303_${unitId}`),
            accent: getV(`accent303_${unitId}`) / 100,
            vol: getV(`vol303_${unitId}`) / 100
        };
    },

    get909Params(track) {
        const getV = (id) => parseFloat(document.getElementById(id).value);
        const lvl = (id) => getV(id) / 100;
        if (track === 'bd') return { p1: getV('bd_p1'), p2: getV('bd_p2'), p3: getV('bd_p3'), vol: lvl('bd_level') };
        if (track === 'sd') return { p1: getV('sd_p1'), p2: getV('sd_p2'), p3: getV('sd_p3'), vol: lvl('sd_level') };
        if (track === 'ch') return { p1: getV('ch_p1'), vol: lvl('ch_level') };
        if (track === 'oh') return { p1: getV('oh_p1'), vol: lvl('oh_level') };
        if (track === 'cp') return { p1: getV('cp_p1'), vol: lvl('cp_level') };
        return {};
    },

    renderAll() {
        this.render303Grid(1);
        this.render303Grid(2);
        this.render909();
    },

    init303Knobs(unitId) {
        const container = document.getElementById(`knobs303_${unitId}`);
        container.innerHTML = '';
        const params = [
            { l: 'TUNE', id: `tune303_${unitId}`, min: -1200, max: 1200, v: 0 },
            { l: 'CUTOFF', id: `cutoff303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'RESO', id: `reso303_${unitId}`, min: 0, max: 15, v: 0 },
            { l: 'ENV MOD', id: `env303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'DECAY', id: `decay303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'ACCENT', id: `accent303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'VOLUME', id: `vol303_${unitId}`, min: 0, max: 100, v: 80 }
        ];
        params.forEach(p => {
            new RotaryKnob(container, p.l, p.id, p.min, p.max, p.v);
        });
    },

    render303Grid(unitId) {
        const grid = document.getElementById(`grid303_${unitId}`);
        grid.innerHTML = '';
        const seq = unitId === 1 ? Data.seq303_1 : Data.seq303_2;

        seq.forEach((step, i) => {
            const el = document.createElement('div');
            el.className = `step-303 ${step.active ? 'active' : ''}`;
            el.onclick = () => {
                step.active = !step.active;
                this.render303Grid(unitId);
            };

            const led = document.createElement('div'); led.className = 'led';

            const noteDisplay = document.createElement('div');
            noteDisplay.className = 'note-display';
            noteDisplay.innerText = step.note;
            noteDisplay.onclick = (e) => {
                e.stopPropagation();
                this.showNotePopover(e.clientX, e.clientY, step, unitId);
            };

            const octCtrls = document.createElement('div');
            octCtrls.className = 'step-ctrls'; // Reuse step-ctrls for layout

            const mkOctBtn = (lbl, targetOct) => {
                const b = document.createElement('div');
                b.innerText = lbl;
                b.className = 'mini-btn oct';
                // Active if current octave matches target
                if (step.octave === targetOct) b.classList.add('active');

                b.onclick = (e) => {
                    e.stopPropagation();
                    if (step.octave === targetOct) {
                        // Toggle OFF -> Return to neutral (2)
                        step.octave = 2;
                    } else {
                        // Toggle ON -> Set to target
                        step.octave = targetOct;
                    }
                    this.render303Grid(unitId);
                };
                return b;
            };

            octCtrls.appendChild(mkOctBtn('DN', 1));
            octCtrls.appendChild(mkOctBtn('UP', 3));

            const ctrls = document.createElement('div'); ctrls.className = 'step-ctrls';

            const mkBtn = (lbl, prop, cls) => {
                const b = document.createElement('div');
                b.innerText = lbl; b.className = 'mini-btn ' + cls;
                if (step[prop]) b.classList.add('active');
                b.onclick = (e) => {
                    e.stopPropagation();
                    step[prop] = !step[prop];
                    this.render303Grid(unitId);
                };
                return b;
            }

            ctrls.appendChild(mkBtn('AC', 'accent', 'acc'));
            ctrls.appendChild(mkBtn('SL', 'slide', 'sld'));

            el.appendChild(led); el.appendChild(noteDisplay); el.appendChild(octCtrls); el.appendChild(ctrls);
            grid.appendChild(el);
        });
    },

    showNotePopover(x, y, step, unitId) {
        // Remove existing popover if any
        const existing = document.getElementById('piano-popover-overlay');
        if (existing) existing.remove();

        // Find index of current step
        const seq = unitId === 1 ? Data.seq303_1 : Data.seq303_2;
        let currentIndex = seq.indexOf(step);

        // Create Overlay
        const overlay = document.createElement('div');
        overlay.id = 'piano-popover-overlay';
        overlay.className = 'piano-overlay';

        // Editor Container
        const editor = document.createElement('div');
        editor.className = 'note-editor';

        // --- Header ---
        const header = document.createElement('div');
        header.className = 'editor-header';

        const nav = document.createElement('div');
        nav.className = 'step-nav';

        const prevBtn = document.createElement('button');
        prevBtn.innerText = '<';

        const stepDisplay = document.createElement('div');
        stepDisplay.className = 'step-indicator';

        const nextBtn = document.createElement('button');
        nextBtn.innerText = '>';

        nav.appendChild(prevBtn);
        nav.appendChild(stepDisplay);
        nav.appendChild(nextBtn);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.innerHTML = '&times;';

        header.appendChild(nav);
        header.appendChild(closeBtn);
        editor.appendChild(header);

        // --- Controls ---
        const controls = document.createElement('div');
        controls.className = 'editor-controls';

        // Row 1: Octave & Toggles
        const row1 = document.createElement('div');
        row1.className = 'control-row';

        // Octave Group
        const octGroup = document.createElement('div');
        octGroup.className = 'control-group';
        const octLabel = document.createElement('div');
        octLabel.className = 'control-label';
        octLabel.innerText = 'Octave';

        const octSel = document.createElement('div');
        octSel.className = 'octave-selector';
        const octBtns = [];

        const mkOctBtn = (lbl, targetOct) => {
            const b = document.createElement('button');
            b.className = 'octave-btn';
            b.innerText = lbl;
            b.onclick = () => {
                const s = getCurrentStep();
                // Toggle logic: if already on target, go to 2 (neutral), else go to target
                const newVal = s.octave === targetOct ? 2 : targetOct;
                updateStep({ octave: newVal });
            };
            octBtns.push({ val: targetOct, el: b });
            octSel.appendChild(b);
        };

        mkOctBtn('DN', 1);
        mkOctBtn('UP', 3);

        octGroup.appendChild(octLabel);
        octGroup.appendChild(octSel);

        // Toggles Group
        const toggleGroup = document.createElement('div');
        toggleGroup.className = 'control-group';
        const toggleLabel = document.createElement('div');
        toggleLabel.className = 'control-label';
        toggleLabel.innerText = 'Modifiers';

        const toggleRow = document.createElement('div');
        toggleRow.className = 'toggle-row';

        const accBtn = document.createElement('div');
        accBtn.className = 'toggle-btn accent';
        accBtn.innerHTML = '<span>AC</span>';
        accBtn.onclick = () => updateStep({ accent: !getCurrentStep().accent });

        const slideBtn = document.createElement('div');
        slideBtn.className = 'toggle-btn slide';
        slideBtn.innerHTML = '<span>SL</span>';
        slideBtn.onclick = () => updateStep({ slide: !getCurrentStep().slide });

        toggleRow.appendChild(accBtn);
        toggleRow.appendChild(slideBtn);
        toggleGroup.appendChild(toggleLabel);
        toggleGroup.appendChild(toggleRow);

        row1.appendChild(octGroup);
        row1.appendChild(toggleGroup);

        // Row 2: Preview Toggle
        const row2 = document.createElement('div');
        const previewDiv = document.createElement('div');
        previewDiv.className = 'preview-toggle';
        const previewCheck = document.createElement('input');
        previewCheck.type = 'checkbox';
        previewCheck.className = 'preview-checkbox';
        previewCheck.checked = true;
        const previewLabel = document.createElement('span');
        previewLabel.innerText = 'Preview Sound';
        previewDiv.appendChild(previewCheck);
        previewDiv.appendChild(previewLabel);
        previewDiv.onclick = (e) => {
            if (e.target !== previewCheck) previewCheck.checked = !previewCheck.checked;
        };
        row2.appendChild(previewDiv);

        controls.appendChild(row1);
        controls.appendChild(row2);
        editor.appendChild(controls);

        // --- Mute Button ---
        const muteBtn = document.createElement('button');
        muteBtn.className = 'mute-btn';
        muteBtn.innerText = 'GATE OFF (REST)';
        muteBtn.onclick = () => {
            updateStep({ active: false });
            // User requested: "Input gate off state... note exists".
            // We keep the note value but set active false.
            // Usually we don't auto-advance on mute unless requested, but for pattern entry it's faster.
            // Let's auto-advance to keep flow.
            nextStep();
        };
        editor.appendChild(muteBtn);

        // --- Piano Roll ---
        const pianoContainer = document.createElement('div');
        pianoContainer.className = 'piano-container';

        const keys = [
            { n: 'C', type: 'white' },
            { n: 'C#', type: 'black' },
            { n: 'D', type: 'white' },
            { n: 'D#', type: 'black' },
            { n: 'E', type: 'white' },
            { n: 'F', type: 'white' },
            { n: 'F#', type: 'black' },
            { n: 'G', type: 'white' },
            { n: 'G#', type: 'black' },
            { n: 'A', type: 'white' },
            { n: 'A#', type: 'black' },
            { n: 'B', type: 'white' }
        ];

        // Helper to position keys
        const whiteKeys = keys.filter(k => k.type === 'white');
        const whiteWidth = 100 / whiteKeys.length;
        let whiteCount = 0;

        keys.forEach((k) => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `piano-key-new ${k.type}`;
            keyDiv.innerText = k.n;

            if (k.type === 'white') {
                keyDiv.style.width = `${whiteWidth}%`;
                keyDiv.style.left = `${whiteCount * whiteWidth}%`;
                whiteCount++;
            } else {
                keyDiv.style.width = `${whiteWidth * 0.7}%`;
                // Position black key centered on the line between current white count-1 and count
                // Actually, C# is between C (0) and D (1). So at 1 * width - half black width
                keyDiv.style.left = `${(whiteCount * whiteWidth) - (whiteWidth * 0.35)}%`;
            }

            keyDiv.onclick = (e) => {
                e.stopPropagation();
                const s = getCurrentStep();
                // Set note and ensure gate is ON
                updateStep({ note: k.n, active: true });
                if (previewCheck.checked) {
                    playPreview(s);
                }
                nextStep();
            };
            pianoContainer.appendChild(keyDiv);
        });

        editor.appendChild(pianoContainer);
        overlay.appendChild(editor);
        document.body.appendChild(overlay);

        // --- Logic ---
        const getCurrentStep = () => seq[currentIndex];

        const updateUI = () => {
            const s = getCurrentStep();
            stepDisplay.innerText = (currentIndex + 1).toString().padStart(2, '0');

            // Octave
            octBtns.forEach(b => {
                if (b.val === s.octave) b.el.classList.add('active');
                else b.el.classList.remove('active');
            });

            // Toggles
            if (s.accent) accBtn.classList.add('active'); else accBtn.classList.remove('active');
            if (s.slide) slideBtn.classList.add('active'); else slideBtn.classList.remove('active');

            // Mute
            if (!s.active) muteBtn.classList.add('active'); else muteBtn.classList.remove('active');

            // Keys
            document.querySelectorAll('.piano-key-new').forEach(el => {
                // Highlight key if it matches note (even if gate is off, we show the pitch)
                if (el.innerText === s.note) el.classList.add('active');
                else el.classList.remove('active');
            });

            // Update Main Grid Background
            this.render303Grid(unitId);
        };

        const updateStep = (changes) => {
            const s = getCurrentStep();
            Object.assign(s, changes);
            updateUI();
        };

        const nextStep = () => {
            currentIndex = (currentIndex + 1) % 16;
            updateUI();
        };

        const prevStep = () => {
            currentIndex = (currentIndex - 1 + 16) % 16;
            updateUI();
        };

        const playPreview = (step) => {
            if (!AudioEngine.ctx) AudioEngine.init();
            const now = AudioEngine.ctx.currentTime;
            // Get params but maybe slightly modified for preview?
            // Actually using current params is best for "Preview"
            const params = UI.get303Params(unitId);

            // We need to trigger a voice. 
            // Note: voice303 uses 'active303' state which might interfere with playback if running.
            // But usually preview is done while stopped or it just overrides.
            AudioEngine.voice303(now, step, params, unitId);

            // Schedule a kill shortly after to make it a "preview" blip
            // Calculate duration based on decay or fixed?
            // Fixed short duration for preview is usually better.
            const duration = 0.2;

            // We need to manually stop it because voice303 expects the scheduler to handle length
            // or it sustains if slide is on.
            // For preview, we force stop.
            setTimeout(() => {
                AudioEngine.kill303(unitId, AudioEngine.ctx.currentTime);
            }, duration * 1000);
        };

        // Bind Events
        prevBtn.onclick = prevStep;
        nextBtn.onclick = nextStep;
        closeBtn.onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        updateUI();
    },

    render909() {
        const container = document.getElementById('tracks909');
        container.innerHTML = '';
        const tracks = [
            { id: 'bd', name: 'BASS DRUM', params: [{ l: 'TUNE', id: 'bd_p1', v: 50 }, { l: 'DECAY', id: 'bd_p2', v: 50 }, { l: 'ATTACK', id: 'bd_p3', v: 80 }, { l: 'LEVEL', id: 'bd_level', v: 100 }] },
            { id: 'sd', name: 'SNARE DRUM', params: [{ l: 'TUNE', id: 'sd_p1', v: 50 }, { l: 'TONE', id: 'sd_p2', v: 30 }, { l: 'SNAPPY', id: 'sd_p3', v: 70 }, { l: 'LEVEL', id: 'sd_level', v: 100 }] },
            { id: 'ch', name: 'CLOSED HAT', params: [{ l: 'DECAY', id: 'ch_p1', v: 20 }, { l: 'LEVEL', id: 'ch_level', v: 100 }] },
            { id: 'oh', name: 'OPEN HAT', params: [{ l: 'DECAY', id: 'oh_p1', v: 60 }, { l: 'LEVEL', id: 'oh_level', v: 100 }] },
            { id: 'cp', name: 'CLAP', params: [{ l: 'DECAY', id: 'cp_p1', v: 50 }, { l: 'LEVEL', id: 'cp_level', v: 100 }] },
        ];
        tracks.forEach(t => {
            const row = document.createElement('div'); row.className = 'drum-track-row';
            const hdr = document.createElement('div'); hdr.className = 'track-header';
            const knobDiv = document.createElement('div'); knobDiv.className = 'track-knobs';
            t.params.forEach(p => { new RotaryKnob(knobDiv, p.l, p.id, 0, 100, p.v, 1, 'small'); });
            const name = document.createElement('div'); name.className = 'track-name'; name.innerText = t.id.toUpperCase();
            hdr.appendChild(knobDiv); hdr.appendChild(name); row.appendChild(hdr);
            const seqDiv = document.createElement('div'); seqDiv.className = 'sequencer-909'; seqDiv.id = `seq909_${t.id}`;
            for (let i = 0; i < 16; i++) {
                const s = document.createElement('div'); s.className = 'step-909';
                s.onclick = () => { Data.seq909[t.id][i] = Data.seq909[t.id][i] ? 0 : 1; s.classList.toggle('active'); }
                seqDiv.appendChild(s);
            }
            row.appendChild(seqDiv); container.appendChild(row);
        });
        this.update909Grid();
    },

    update909Grid() {
        ['bd', 'sd', 'ch', 'oh', 'cp'].forEach(id => {
            const div = document.getElementById(`seq909_${id}`);
            if (!div) return;
            Array.from(div.children).forEach((child, i) => {
                if (Data.seq909[id][i]) child.classList.add('active');
                else child.classList.remove('active');
            });
        });
    },

    drawPlayhead(step) {
        this.clearPlayhead();
        const s1 = document.getElementById(`grid303_1`).children[step];
        if (s1) s1.classList.add('current');
        const s2 = document.getElementById(`grid303_2`).children[step];
        if (s2) s2.classList.add('current');

        const s9 = document.querySelectorAll('.sequencer-909');
        s9.forEach(seq => {
            if (seq.children[step]) seq.children[step].classList.add('current');
        });
    },

    clearPlayhead() {
        document.querySelectorAll('.current').forEach(el => el.classList.remove('current'));
    },

    highlightStep(step) {
        this.drawPlayhead(step);
    }
};

UI.init();
