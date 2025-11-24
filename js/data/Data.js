import { UI } from '../ui/UI.js';
import { AudioEngine } from '../audio/AudioEngine.js';

export const Data = {
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

        setK('bd_p1', 10, 60); setK('bd_p2', 30, 80); setK('bd_p3', 60, 100); setK('bd_level', 90, 100);
        setK('sd_p1', 40, 70); setK('sd_p2', 20, 50); setK('sd_p3', 50, 90); setK('sd_level', 90, 100);
        setK('ch_p1', 10, 40); setK('ch_level', 90, 100);
        setK('oh_p1', 40, 80); setK('oh_level', 90, 100);
        setK('cp_p1', 40, 70); setK('cp_level', 90, 100);

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
