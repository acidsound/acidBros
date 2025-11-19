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
            this.master.connect(this.ctx.destination);

            const size = this.ctx.sampleRate * 2.0;

            this.metalBuffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
            const data = this.metalBuffer.getChannelData(0);
            const freqs = [263, 400, 421, 474, 587, 845];
            for (let i = 0; i < size; i++) {
                let sample = 0;
                for (let f of freqs) sample += ((i * f * 2 * Math.PI / this.ctx.sampleRate) % (2 * Math.PI) < Math.PI ? 1 : -1);
                data[i] = sample / 6;
            }

            this.noiseBuffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
            const nData = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < size; i++) nData[i] = Math.random() * 2 - 1;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    play() {
        if (!this.ctx) this.init();
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this.scheduler();
    },

    stop() {
        this.isPlaying = false;
        window.cancelAnimationFrame(this.timerID);
        this.kill303(this.ctx.currentTime);
        UI.clearPlayhead();
    },

    scheduler() {
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.currentStep, this.nextNoteTime);
            this.nextNote();
        }
        if (this.isPlaying) this.timerID = requestAnimationFrame(this.scheduler.bind(this));
    },

    nextNote() {
        const secondsPerBeat = 60.0 / this.tempo;
        this.nextNoteTime += 0.25 * secondsPerBeat;
        this.currentStep = (this.currentStep + 1) % 16;
    },

    scheduleNote(step, time) {
        UI.drawPlayhead(step);

        const s303 = Data.seq303[step];
        const prev303 = step === 0 ? Data.seq303[15] : Data.seq303[step - 1];
        this.voice303(time, s303, prev303);

        const t = Data.seq909;
        if (t.bd[step]) this.voice909BD(time);
        if (t.sd[step]) this.voice909SD(time);
        if (t.ch[step]) this.voice909Hat(time, false);
        else if (t.oh[step]) this.voice909Hat(time, true);
        if (t.cp[step]) this.voice909CP(time);
    },

    voice303(time, step, prevStep) {
        if (!step.active && !step.slide) {
            if (this.active303.osc && !prevStep?.slide) this.kill303(time);
            return;
        }
        const P = UI.get303Params();
        const noteMap = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const semi = (step.octave * 12) + noteMap.indexOf(step.note);
        let freq = 16.35 * Math.pow(2, semi / 12);
        freq *= Math.pow(2, P.tune / 1200);
        const isSliding = prevStep && prevStep.active && prevStep.slide && step.active;

        if (isSliding && this.active303.osc) {
            this.active303.osc.frequency.linearRampToValueAtTime(freq, time + 0.1);
            this.active303.freq = freq;
        } else {
            this.kill303(time);
            if (!step.active) return;
            const t = time;
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const vca = this.ctx.createGain();
            const out = this.ctx.createGain();
            osc.type = P.wave;
            osc.frequency.setValueAtTime(freq, t);
            filter.type = 'lowpass';
            filter.Q.value = P.reso * (step.accent ? 1.5 : 1.0);
            const baseCut = 300 + (P.cutoff * 100) + (step.accent ? 800 : 0);
            const envAmt = (P.env * 60) + (step.accent ? 2000 : 0);
            const dec = 0.2 + (P.decay / 100) * (step.accent ? 0.5 : 1.0);
            filter.frequency.setValueAtTime(baseCut, t);
            filter.frequency.linearRampToValueAtTime(baseCut + envAmt, t + 0.005);
            filter.frequency.setTargetAtTime(baseCut, t + 0.01, dec / 3);
            vca.gain.setValueAtTime(0, t);
            const peakVol = step.accent ? 1.0 : 0.7;
            vca.gain.linearRampToValueAtTime(peakVol, t + 0.005);
            vca.gain.setTargetAtTime(0, t + 0.01, dec);
            out.gain.value = P.vol;
            osc.connect(filter);
            filter.connect(vca);
            vca.connect(out);
            out.connect(this.master);
            osc.start(t);
            this.active303 = { osc, filter, gain: vca, freq };
            if (!step.slide) osc.stop(t + (0.5 * (60 / this.tempo)));
            else osc.stop(t + 2.0);
        }
    },

    kill303(time) {
        if (this.active303.osc) {
            try { this.active303.osc.stop(time); this.active303.gain.gain.setTargetAtTime(0, time, 0.005); } catch (e) { }
            this.active303 = { osc: null, filter: null, gain: null, freq: 0 };
        }
    },

    voice909BD(time) {
        const P = UI.get909Params('bd');
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const click = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        const startFreq = 180;
        const endFreq = 40 + (P.p1 * 0.5);
        const decay = 0.1 + (P.p2 * 0.003);
        osc.frequency.setValueAtTime(startFreq, time);
        osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.1);
        gain.gain.setValueAtTime(1.0 * P.vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
        click.frequency.value = 50;
        clickGain.gain.setValueAtTime(0.5 * (P.p3 / 100) * P.vol, time);
        clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.01);
        osc.connect(gain); click.connect(clickGain); gain.connect(this.master); clickGain.connect(this.master);
        osc.start(time); osc.stop(time + 0.5); click.start(time); click.stop(time + 0.02);
    },

    voice909SD(time) {
        const P = UI.get909Params('sd');
        const tone = this.ctx.createOscillator();
        const toneGain = this.ctx.createGain();
        const startF = 350 + (P.p1);
        const endF = 180 + (P.p1 * 0.5);
        tone.frequency.setValueAtTime(startF, time);
        tone.frequency.exponentialRampToValueAtTime(endF, time + 0.1);
        toneGain.gain.setValueAtTime(0.8 * P.vol, time);
        toneGain.gain.exponentialRampToValueAtTime(0.001, time + (0.1 + P.p2 * 0.002));
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer; noise.loop = true;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass'; noiseFilter.frequency.value = 1000;
        const noiseGain = this.ctx.createGain();
        const snapVol = (P.p3 / 100) * P.vol;
        noiseGain.gain.setValueAtTime(snapVol, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
        tone.connect(toneGain); toneGain.connect(this.master);
        noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(this.master);
        tone.start(time); tone.stop(time + 0.3); noise.start(time); noise.stop(time + 0.3);
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
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer; noise.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 1.5;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(1.5 * P.vol, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, time + (0.1 + P.p1 * 0.002));
        noise.connect(bp); bp.connect(gain); gain.connect(this.master);
        noise.start(time); noise.stop(time + 0.4);
    }
};

/*
   ================================================================
   DATA, RANDOMIZER & SHARING
   ================================================================
*/
const Data = {
    seq303: Array(16).fill(null).map(() => ({ active: false, note: 'C', octave: 2, accent: false, slide: false })),
    seq909: { bd: [], sd: [], ch: [], oh: [], cp: [] },

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

        // Set Waveform Radio
        const wave = Math.random() > 0.5 ? 'sawtooth' : 'square';
        if (wave === 'sawtooth') document.getElementById('wave-saw').checked = true;
        else document.getElementById('wave-sq').checked = true;

        setK('tune303', 0, 0);
        setK('cutoff303', 20, 90);
        setK('reso303', 0, 15);
        setK('env303', 30, 90);
        setK('decay303', 30, 80);
        setK('accent303', 50, 100);
        setK('vol303', 70, 90);

        setK('bd_p1', 10, 60); setK('bd_p2', 30, 80); setK('bd_p3', 60, 100); setK('bd_level', 80, 100);
        setK('sd_p1', 40, 70); setK('sd_p2', 20, 50); setK('sd_p3', 50, 90); setK('sd_level', 80, 100);
        setK('ch_p1', 10, 40); setK('ch_level', 80, 100);
        setK('oh_p1', 40, 80); setK('oh_level', 80, 100);
        setK('cp_p1', 40, 70); setK('cp_level', 80, 100);

        const scales = ['C', 'D#', 'F', 'F#', 'G', 'A#'];
        this.seq303.forEach((step) => {
            step.active = Math.random() > 0.35;
            step.note = scales[Math.floor(Math.random() * scales.length)];
            step.octave = Math.floor(Math.random() * 3) + 1;
            step.accent = Math.random() > 0.8;
            step.slide = step.active && (Math.random() > 0.75);
        });

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

        const wave = document.querySelector('input[name="wave303"]:checked').value;

        const state = {
            ver: 1,
            bpm: AudioEngine.tempo,
            wave: wave,
            k: knobs,
            s3: this.seq303,
            s9: this.seq909
        };
        return btoa(JSON.stringify(state));
    },

    importState(encoded) {
        try {
            const state = JSON.parse(atob(encoded));
            AudioEngine.tempo = state.bpm;

            // Update Tempo Knob
            if (window.knobInstances['tempo']) window.knobInstances['tempo'].setValue(state.bpm);
            document.getElementById('tempoVal').innerText = state.bpm;

            // Update Waveform
            if (state.wave === 'sawtooth') document.getElementById('wave-saw').checked = true;
            else document.getElementById('wave-sq').checked = true;

            setTimeout(() => {
                for (const [id, val] of Object.entries(state.k)) {
                    if (window.knobInstances[id]) window.knobInstances[id].setValue(val);
                }
            }, 0);

            this.seq303 = state.s3;
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
        this.render303();
        this.render909();

        // Initialize Tempo Knob
        new RotaryKnob(document.getElementById('tempo-knob-container'), '', 'tempo', 60, 160, 125, 1, 'large');

        document.getElementById('initBtn').onclick = () => { AudioEngine.init(); document.getElementById('initBtn').style.display = 'none'; };
        document.getElementById('playBtn').onclick = () => AudioEngine.play();
        document.getElementById('stopBtn').onclick = () => AudioEngine.stop();
        document.getElementById('randomBtn').onclick = () => Data.randomize();
        document.getElementById('clearBtn').onclick = () => {
            Data.seq303.forEach(s => { s.active = false; s.slide = false; s.accent = false; });
            Object.keys(Data.seq909).forEach(k => Data.seq909[k].fill(0));
            this.renderAll();
        };

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
            Data.init909();
            setTimeout(() => Data.randomize(), 500);
        }
    },

    get303Params() {
        const getV = (id) => parseFloat(document.getElementById(id).value);
        return {
            wave: document.querySelector('input[name="wave303"]:checked').value,
            tune: getV('tune303'),
            cutoff: getV('cutoff303'),
            reso: getV('reso303'),
            env: getV('env303'),
            decay: getV('decay303'),
            accent: getV('accent303'),
            vol: getV('vol303') / 100
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
        this.updateSequencer303();
        this.update909Grid();
    },

    render303() {
        const kContainer = document.getElementById('knobs303');
        kContainer.innerHTML = '';
        const p303 = [
            { l: 'TUNE', id: 'tune303', min: -1200, max: 1200, v: 0 },
            { l: 'CUTOFF', id: 'cutoff303', min: 0, max: 100, v: 40 },
            { l: 'RESO', id: 'reso303', min: 0, max: 100, v: 70 },
            { l: 'ENV MOD', id: 'env303', min: 0, max: 100, v: 60 },
            { l: 'DECAY', id: 'decay303', min: 0, max: 100, v: 40 },
            { l: 'ACCENT', id: 'accent303', min: 0, max: 100, v: 80 },
            { l: 'VOL', id: 'vol303', min: 0, max: 100, v: 80 }
        ];
        p303.forEach(p => new RotaryKnob(kContainer, p.l, p.id, p.min, p.max, p.v));
        this.updateSequencer303();
    },

    updateSequencer303() {
        const grid = document.getElementById('grid303');
        grid.innerHTML = '';
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        Data.seq303.forEach((step, i) => {
            const el = document.createElement('div');
            el.className = 'step-303';
            if (step.active) el.classList.add('active');

            const led = document.createElement('div'); led.className = 'led';
            el.appendChild(led);

            const nSel = document.createElement('select');
            nSel.style.fontSize = '9px';
            notes.forEach(n => {
                const o = document.createElement('option'); o.text = n; o.value = n; if (n === step.note) o.selected = true;
                nSel.add(o);
            });
            nSel.onchange = (e) => step.note = e.target.value;
            el.appendChild(nSel);

            const oSel = document.createElement('select');
            oSel.style.fontSize = '9px';
            [1, 2, 3].forEach(o => {
                const op = document.createElement('option'); op.text = o; op.value = o; if (o === step.octave) op.selected = true;
                oSel.add(op);
            });
            oSel.onchange = (e) => step.octave = parseInt(e.target.value);
            el.appendChild(oSel);

            const mkBtn = (lbl, prop, cls) => {
                const b = document.createElement('div');
                b.innerText = lbl; b.className = 'mini-btn ' + cls;
                if (step[prop]) b.classList.add('active');
                b.onclick = () => {
                    step[prop] = !step[prop];
                    b.classList.toggle('active');
                    if (prop === 'active') el.classList.toggle('active');
                };
                return b;
            }
            el.appendChild(mkBtn('GATE', 'active', ''));
            el.appendChild(mkBtn('ACC', 'accent', 'acc'));
            el.appendChild(mkBtn('SLD', 'slide', 'sld'));
            grid.appendChild(el);
        });
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
        requestAnimationFrame(() => {
            document.querySelectorAll('.step-303').forEach((el, i) => {
                if (i === step) el.classList.add('current'); else el.classList.remove('current');
            });
            document.querySelectorAll('.step-909').forEach((el, i) => {
                if ((i % 16) === step) el.classList.add('current'); else el.classList.remove('current');
            });
        });
    },

    clearPlayhead() {
        document.querySelectorAll('.current').forEach(el => el.classList.remove('current'));
    }
};

UI.init();
