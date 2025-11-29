import { UI } from '../ui/UI.js';
import { AudioEngine } from '../audio/AudioEngine.js';

export const Data = {
    mode: 'pattern', // 'pattern' | 'song'
    currentPatternId: 0, // 0-15
    song: [], // Array of pattern IDs: [0, 0, 1, 2, ...]

    // Pattern Bank (16 Patterns)
    patterns: [],

    init() {
        // Initialize 16 Patterns
        for (let i = 0; i < 16; i++) {
            this.patterns.push(this.createEmptyPattern());
        }
        // Default Song
        this.song = [0];
    },

    createEmptyPattern() {
        const p = {
            seq303_1: [],
            seq303_2: [],
            seq909: { bd: [], sd: [], ch: [], oh: [], cp: [] }
        };
        // Init 303s
        for (let i = 0; i < 16; i++) {
            p.seq303_1.push({ active: false, note: 'C', octave: 2, accent: false, slide: false });
            p.seq303_2.push({ active: false, note: 'C', octave: 2, accent: false, slide: false });
        }
        // Init 909
        ['bd', 'sd', 'ch', 'oh', 'cp'].forEach(k => p.seq909[k] = Array(16).fill(0));
        return p;
    },

    getSequence(id) {
        let patternId = this.currentPatternId;

        if (this.mode === 'song' && AudioEngine.isPlaying) {
            // In Song Mode, AudioEngine tells us which pattern to play via currentSongIndex
            // But AudioEngine logic needs to handle the song index.
            // Actually, AudioEngine should ask Data "what is the sequence for the current moment?"
            // Let's rely on AudioEngine to track song position, but it needs to ask Data for the pattern ID at that position.
            const songIdx = AudioEngine.currentSongIndex;
            if (this.song.length > 0) {
                patternId = this.song[songIdx % this.song.length];
            }
        }

        const p = this.patterns[patternId];
        if (!p) return null;

        if (id === 'tb303_1') return p.seq303_1;
        if (id === 'tb303_2') return p.seq303_2;
        if (id === 'tr909') return p.seq909;
        return null;
    },

    // --- Pattern Management ---
    selectPattern(id) {
        if (id < 0 || id > 15) return;
        this.currentPatternId = id;
        UI.renderAll();
    },

    // --- Song Management ---
    addToSong(patternId) {
        this.song.push(patternId);
        UI.updateSongTimeline();
    },

    removeFromSong() {
        this.song.pop();
        UI.updateSongTimeline();
    },

    clearSong() {
        this.song = [];
        UI.updateSongTimeline();
    },

    // --- Clipboard ---
    clipboard: null,
    copyPattern() {
        this.clipboard = JSON.parse(JSON.stringify(this.patterns[this.currentPatternId]));
        // Show toast instead of alert
        const toast = document.getElementById('toast');
        if (toast) {
            toast.innerText = 'Pattern copied!';
            toast.className = 'show';
            setTimeout(() => {
                toast.className = toast.className.replace('show', '');
            }, 3000);
        }
    },
    pastePattern() {
        if (!this.clipboard) return;
        this.patterns[this.currentPatternId] = JSON.parse(JSON.stringify(this.clipboard));
        UI.renderAll();
    },

    randomize() {
        const setK = (id, min, max) => {
            if (window.knobInstances[id]) {
                const val = Math.floor(Math.random() * (max - min + 1)) + min;
                window.knobInstances[id].setValue(val);
            }
        };

        // Knobs are Global - Randomize them
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

        // Randomize Sequence Data for CURRENT Pattern
        const p = this.patterns[this.currentPatternId];

        // 12반음 기준 전체 노트 정의
        const ALL_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F',
            'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // 기존 스케일 (C blues 계열)
        const SCALE = ['C', 'D#', 'F', 'F#', 'G', 'A#'];

        // 베이스가 강박에서 주로 잡을 음 (루트/서브돔/도미넌트 느낌)
        const BASS_STRONG_NOTES = ['C', 'F', 'G']; // SCALE의 부분집합

        // 협화 간격(반음 수): 유니즌, m3, M3, P5, m6, M6
        const CONSONANT_INTERVALS = [0, 3, 4, 7, 8, 9];
        const STRONG_MELODY_INTERVALS = [3, 4, 8, 9]; // m3, M3, m6, M6
        const WEAK_MELODY_INTERVALS = [0, 3, 4, 7, 8, 9];

        const noteToIndex = (note) => ALL_NOTES.indexOf(note);

        // ---------- 베이스 라인 생성 ----------
        const randBassSeq = (seq) => {
            seq.forEach((step, i) => {
                const isStrongBeat = (i % 4 === 0);
                step.active = Math.random() > (isStrongBeat ? 0.1 : 0.5);
                let note;
                if (isStrongBeat) {
                    note = BASS_STRONG_NOTES[Math.floor(Math.random() * BASS_STRONG_NOTES.length)];
                } else {
                    const prev = i > 0 ? seq[i - 1].note : null;
                    if (prev && Math.random() > 0.5) note = prev;
                    else note = SCALE[Math.floor(Math.random() * SCALE.length)];
                }
                step.note = note || 'C';
                step.octave = 1 + Math.floor(Math.random() * 1);
                step.accent = Math.random() > 0.85;
                step.slide = step.active && (Math.random() > 0.8);
            });
        };

        // ---------- 멜로디(상성부) 생성 ----------
        const pickMelodyNoteFromBass = (bassNote, isStrongBeat) => {
            const bassIndex = noteToIndex(bassNote);
            if (bassIndex === -1) return SCALE[Math.floor(Math.random() * SCALE.length)];
            const allowedIntervals = isStrongBeat ? STRONG_MELODY_INTERVALS : WEAK_MELODY_INTERVALS;
            const candidates = SCALE.filter((note) => {
                const idx = noteToIndex(note);
                if (idx === -1) return false;
                const diff = (idx - bassIndex + 12) % 12;
                return allowedIntervals.includes(diff);
            });
            return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : SCALE[Math.floor(Math.random() * SCALE.length)];
        };

        const randMelodySeq = (seq, bassSeq) => {
            seq.forEach((step, i) => {
                const isStrongBeat = (i % 4 === 0);
                const bassStep = bassSeq[i];
                step.active = Math.random() > 0.2;
                let note;
                if (bassStep && bassStep.note) note = pickMelodyNoteFromBass(bassStep.note, isStrongBeat);
                else note = SCALE[Math.floor(Math.random() * SCALE.length)];
                step.note = note;
                step.octave = 2 + Math.floor(Math.random() * 2);
                step.accent = Math.random() > 0.7;
                step.slide = step.active && (Math.random() > 0.75);
            });
        };

        randBassSeq(p.seq303_2);
        randMelodySeq(p.seq303_1, p.seq303_2);

        // Randomize 909
        const t = p.seq909;
        // Reset
        ['bd', 'sd', 'ch', 'oh', 'cp'].forEach(k => t[k].fill(0));

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
            ver: 3,
            bpm: AudioEngine.tempo,
            swing: AudioEngine.swing,
            wave1: document.querySelector('input[name="wave303_1"]:checked').value,
            wave2: document.querySelector('input[name="wave303_2"]:checked').value,
            k: knobs,
            patterns: this.patterns,
            song: this.song
        };
        return btoa(JSON.stringify(state));
    },

    importState(code) {
        try {
            const state = JSON.parse(atob(code));
            if (state.bpm) AudioEngine.tempo = state.bpm;
            if (state.swing !== undefined) AudioEngine.swing = state.swing;

            if (state.k) {
                Object.keys(state.k).forEach(id => {
                    if (window.knobInstances[id]) window.knobInstances[id].setValue(state.k[id]);
                });
            }

            if (state.ver === 3) {
                this.patterns = state.patterns;
                this.song = state.song || [0];
            } else {
                // Initialize patterns array if it's empty or not properly set up
                if (!this.patterns || this.patterns.length === 0) {
                    this.patterns = [];
                    for (let i = 0; i < 16; i++) {
                        this.patterns.push(this.createEmptyPattern());
                    }
                }

                // Migrate v2 to v3 (Single pattern to Pattern 0)
                // Ensure proper structure for v2 data
                const defaultStep = { active: false, note: 'C', octave: 2, accent: false, slide: false };

                // Migrate 303_1 sequence
                if (state.s3_1) {
                    // Make sure pattern 0 exists and has the seq303_1 property
                    if (!this.patterns[0].seq303_1) {
                        this.patterns[0].seq303_1 = [];
                        for (let i = 0; i < 16; i++) {
                            this.patterns[0].seq303_1.push({ ...defaultStep });
                        }
                    }

                    for (let i = 0; i < 16; i++) {
                        if (state.s3_1[i]) {
                            // Copy the existing step data if it exists
                            let stepData = { ...defaultStep, ...state.s3_1[i] };

                            // If the note is null or undefined, set to default C2
                            if (stepData.note === null || stepData.note === undefined) {
                                stepData.note = 'C';
                                stepData.octave = 2;
                            }

                            this.patterns[0].seq303_1[i] = stepData;
                        } else {
                            // Use default step if no data exists for this position
                            this.patterns[0].seq303_1[i] = { ...defaultStep };
                        }
                    }
                }

                // Migrate 303_2 sequence
                if (state.s3_2) {
                    // Make sure pattern 0 exists and has the seq303_2 property
                    if (!this.patterns[0].seq303_2) {
                        this.patterns[0].seq303_2 = [];
                        for (let i = 0; i < 16; i++) {
                            this.patterns[0].seq303_2.push({ ...defaultStep });
                        }
                    }

                    for (let i = 0; i < 16; i++) {
                        if (state.s3_2[i]) {
                            // Copy the existing step data if it exists
                            let stepData = { ...defaultStep, ...state.s3_2[i] };

                            // If the note is null or undefined, set to default C2
                            if (stepData.note === null || stepData.note === undefined) {
                                stepData.note = 'C';
                                stepData.octave = 2;
                            }

                            this.patterns[0].seq303_2[i] = stepData;
                        } else {
                            // Use default step if no data exists for this position
                            this.patterns[0].seq303_2[i] = { ...defaultStep };
                        }
                    }
                }

                // Migrate 909 sequence (if exists)
                if (state.s9) {
                    // Make sure pattern 0 exists and has the seq909 property
                    if (!this.patterns[0].seq909) {
                        this.patterns[0].seq909 = { bd: [], sd: [], ch: [], oh: [], cp: [] };
                        // Initialize with 16 steps of 0s for each track
                        ['bd', 'sd', 'ch', 'oh', 'cp'].forEach(track => {
                            this.patterns[0].seq909[track] = Array(16).fill(0);
                        });
                    }

                    // Copy each track's data, ensuring it has 16 steps
                    ['bd', 'sd', 'ch', 'oh', 'cp'].forEach(track => {
                        if (state.s9[track]) {
                            const trackData = state.s9[track];
                            for (let i = 0; i < 16; i++) {
                                this.patterns[0].seq909[track][i] = trackData[i] || 0;
                            }
                        }
                    });
                }
            }

            UI.renderAll();
            UI.updateSwingUI();
            UI.updateSevenSegment(AudioEngine.tempo);
        } catch (e) {
            console.error("Invalid state data", e);
            this.randomize();
        }
    }
};
