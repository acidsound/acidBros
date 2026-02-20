import { UI } from '../ui/UI.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { MidiManager } from '../midi/MidiManager.js';
import { BinaryFormatEncoder } from './BinaryFormatEncoder.js';
import { BinaryFormatDecoder } from './BinaryFormatDecoder.js';

export const Data = {
    mode: 'pattern', // 'pattern' | 'song'
    currentPatternId: 0, // 0-15
    lastActivePatternId: 0, // Track last pattern selected in Pattern Mode
    song: [], // Array of pattern IDs: [0, 0, 1, 2, ...]

    // Settings
    keepSoundSettings: false, // If true, don't change knobs when switching patterns
    unitLocks: {
        tb303_1: false,
        tb303_2: false,
        tr909: false
    },
    active909Tracks: ['bd'], // Default list of visible 909 tracks
    customSampleMap: {}, // trackId -> customSampleId (saved globally)

    // Pattern Bank (16 Patterns)
    patterns: [],

    // Default settings for each unit type
    getDefaultTB303Settings() {
        return {
            waveform: 'sawtooth',
            tune: 0,
            cutoff: 50,
            reso: 8,
            env: 50,
            decay: 50,
            accent: 80,
            volume: 70,
            delayTime: 50,
            delayFb: 30,
            delayWet: 50
        };
    },

    getDefaultTR909Settings() {
        return {
            bd: { tune: 50, level: 100, attack: 50, decay: 50 },
            sd: { tune: 50, level: 100, tone: 50, snappy: 50 },
            lt: { tune: 50, level: 100, decay: 50 },
            mt: { tune: 50, level: 100, decay: 50 },
            ht: { tune: 50, level: 100, decay: 50 },
            rs: { level: 100 },
            cp: { level: 100, decay: 50 },
            ch: { level: 100, ch_decay: 50 },
            oh: { level: 100, oh_decay: 50 },
            cr: { level: 100, cr_tune: 50 },
            rd: { level: 100, rd_tune: 50 }
        };
    },

    init() {
        // Load settings from localStorage
        this.loadSettings();

        // Initialize 16 Patterns
        this.patterns = [];
        for (let i = 0; i < 16; i++) {
            this.patterns.push(this.createEmptyPattern());
        }
        // Default Song
        this.song = [0];

        // Randomize initial values after initialization
        this.randomize();
    },

    loadSettings() {
        try {
            const settings = localStorage.getItem('acidbros-settings');
            if (settings) {
                const parsed = JSON.parse(settings);
                this.keepSoundSettings = parsed.keepSoundSettings || false;
                if (parsed.unitLocks) {
                    this.unitLocks = { ...this.unitLocks, ...parsed.unitLocks };
                }
                if (parsed.active909Tracks) {
                    this.active909Tracks = parsed.active909Tracks;
                }
                if (parsed.customSampleMap) {
                    this.customSampleMap = parsed.customSampleMap;
                }
            }
        } catch (e) {
            console.warn('Failed to load settings:', e);
        }
    },

    saveSettings() {
        try {
            localStorage.setItem('acidbros-settings', JSON.stringify({
                keepSoundSettings: this.keepSoundSettings,
                unitLocks: this.unitLocks,
                active909Tracks: this.active909Tracks,
                customSampleMap: this.customSampleMap
            }));
        } catch (e) {
            console.warn('Failed to save settings:', e);
        }
    },

    createEmptyPattern() {
        return {
            units: {
                tb303_1: {
                    type: 'tb303',
                    sequence: this.createEmpty303Sequence(),
                    settings: this.getDefaultTB303Settings()
                },
                tb303_2: {
                    type: 'tb303',
                    sequence: this.createEmpty303Sequence(),
                    settings: this.getDefaultTB303Settings()
                },
                tr909: {
                    type: 'tr909',
                    tracks: {
                        bd: { steps: Array(16).fill(0), ...this.getDefaultTR909Settings().bd, customSynth: {} },
                        sd: { steps: Array(16).fill(0), ...this.getDefaultTR909Settings().sd, customSynth: {} },
                        lt: { steps: Array(16).fill(0), ...this.getDefaultTR909Settings().lt, customSynth: {} },
                        mt: { steps: Array(16).fill(0), ...this.getDefaultTR909Settings().mt, customSynth: {} },
                        ht: { steps: Array(16).fill(0), ...this.getDefaultTR909Settings().ht, customSynth: {} },
                        rs: { steps: Array(16).fill(0), ...this.getDefaultTR909Settings().rs, customSynth: {} },
                        cp: { steps: Array(16).fill(0), ...this.getDefaultTR909Settings().cp, customSynth: {} },
                        ch: { steps: Array(16).fill(0), ...this.getDefaultTR909Settings().ch, customSynth: {} },
                        oh: { steps: Array(16).fill(0), ...this.getDefaultTR909Settings().oh, customSynth: {} },
                        cr: { steps: Array(16).fill(0), ...this.getDefaultTR909Settings().cr, customSynth: {} },
                        rd: { steps: Array(16).fill(0), ...this.getDefaultTR909Settings().rd, customSynth: {} }
                    }
                }
            },
            // Metadata for tracks (source, custom sample ID)
            tr909Meta: {}
        };
    },

    createEmpty303Sequence() {
        const seq = [];
        for (let i = 0; i < 16; i++) {
            seq.push({ active: false, note: 'C', octave: 2, accent: false, slide: false });
        }
        return seq;
    },

    // --- Compatibility Layer ---
    // These methods provide backward compatibility with old code expecting seq303_1, seq303_2, seq909

    getSequence(id) {
        let patternId = this.currentPatternId;

        if (this.mode === 'song' && AudioEngine.isPlaying) {
            const songIdx = AudioEngine.currentSongIndex;
            if (this.song.length > 0) {
                patternId = this.song[songIdx % this.song.length];
            }
        }

        const p = this.patterns[patternId];
        if (!p) return null;

        // Support both old and new structure during migration
        if (p.units) {
            if (id === 'tb303_1') return p.units.tb303_1.sequence;
            if (id === 'tb303_2') return p.units.tb303_2.sequence;
            if (id === 'tr909') {
                const tracks = p.units.tr909.tracks;
                const getSteps = (tid) => (tracks[tid] && tracks[tid].steps) ? tracks[tid].steps : Array(16).fill(0);
                return {
                    bd: getSteps('bd'), sd: getSteps('sd'), lt: getSteps('lt'),
                    mt: getSteps('mt'), ht: getSteps('ht'), rs: getSteps('rs'),
                    cp: getSteps('cp'), ch: getSteps('ch'), oh: getSteps('oh'),
                    cr: getSteps('cr'), rd: getSteps('rd')
                };
            }
        } else {
            if (id === 'tb303_1') return p.seq303_1 || Array(16).fill(null);
            if (id === 'tb303_2') return p.seq303_2 || Array(16).fill(null);
            if (id === 'tr909') {
                const seq = p.seq909 || {};
                const getSteps = (tid) => seq[tid] || Array(16).fill(0);
                return {
                    bd: getSteps('bd'), sd: getSteps('sd'), lt: getSteps('lt'),
                    mt: getSteps('mt'), ht: getSteps('ht'), rs: getSteps('rs'),
                    cp: getSteps('cp'), ch: getSteps('ch'), oh: getSteps('oh'),
                    cr: getSteps('cr'), rd: getSteps('rd')
                };
            }
        }
        return null;
    },

    getUnitSettings(unitId) {
        const p = this.patterns[this.currentPatternId];
        if (!p || !p.units) return null;

        if (unitId === 'tb303_1' || unitId === 'tb303_2') {
            return p.units[unitId]?.settings;
        }
        if (unitId === 'tr909') {
            return p.units.tr909?.tracks;
        }
        return null;
    },

    saveCustomSynth(trackId, preset) {
        const p = this.patterns[this.currentPatternId];
        if (!p || !p.units || !p.units.tr909) return;

        if (!p.units.tr909.tracks[trackId]) {
            const defaults = this.getDefaultTR909Settings()[trackId];
            p.units.tr909.tracks[trackId] = { steps: Array(16).fill(0), ...defaults, customSynth: {} };
        }

        p.units.tr909.tracks[trackId].customSynth = JSON.parse(JSON.stringify(preset));
        console.log(`Data: Saved custom synth for ${trackId}`, preset);
    },

    // --- Pattern Management ---
    selectPattern(id, skipSave = false) {
        if (id < 0 || id > 15) return;

        // Save current UI settings to the current pattern before switching (unless explicitly skipped)
        if (!skipSave) {
            this.saveCurrentSettingsToPattern();
        }

        const previousPatternId = this.currentPatternId;
        this.currentPatternId = id;

        // Track last active pattern in Pattern Mode
        if (this.mode !== 'song') {
            this.lastActivePatternId = id;
        }

        // Apply settings from new pattern unless keepSoundSettings is true
        if (!this.keepSoundSettings && previousPatternId !== id) {
            this.applyPatternSettings(id);
        }

        UI.renderAll();
    },

    applyPatternSettings(patternId) {
        const pattern = this.patterns[patternId];
        if (!pattern || !pattern.units) return;

        // Apply TB-303 Unit 1 settings
        const tb303_1 = pattern.units.tb303_1;
        if (tb303_1 && tb303_1.settings) {
            this.applyTB303Settings(1, tb303_1.settings);
        }

        // Apply TB-303 Unit 2 settings
        const tb303_2 = pattern.units.tb303_2;
        if (tb303_2 && tb303_2.settings) {
            this.applyTB303Settings(2, tb303_2.settings);
        }

        // Apply TR-909 settings
        const tr909 = pattern.units.tr909;
        if (tr909 && tr909.tracks) {
            this.applyTR909Settings(tr909.tracks);
        }
    },

    applyTB303Settings(unitNum, settings) {
        const suffix = unitNum;

        // Waveform
        if (settings.waveform) {
            const radioId = settings.waveform === 'sawtooth' ? `wave-saw-${suffix}` : `wave-sq-${suffix}`;
            const radio = document.getElementById(radioId);
            if (radio) radio.checked = true;
        }

        // Knobs
        const knobMap = {
            tune: `tune303_${suffix}`,
            cutoff: `cutoff303_${suffix}`,
            reso: `reso303_${suffix}`,
            env: `env303_${suffix}`,
            decay: `decay303_${suffix}`,
            accent: `accent303_${suffix}`,
            volume: `vol303_${suffix}`,
            delayTime: `delayTime303_${suffix}`,
            delayFb: `delayFb303_${suffix}`,
            delayWet: `delayWet303_${suffix}`
        };

        for (const [key, knobId] of Object.entries(knobMap)) {
            if (settings[key] !== undefined && window.knobInstances[knobId]) {
                window.knobInstances[knobId].setValue(settings[key]);
            }
        }
    },

    applyTR909Settings(tracks) {
        const knobMap = {
            bd: { tune: 'bd_p1', level: 'bd_level', attack: 'bd_p2', decay: 'bd_p3' },
            sd: { tune: 'sd_p1', level: 'sd_level', tone: 'sd_p2', snappy: 'sd_p3' },
            lt: { tune: 'lt_p1', level: 'lt_level', decay: 'lt_p2' },
            mt: { tune: 'mt_p1', level: 'mt_level', decay: 'mt_p2' },
            ht: { tune: 'ht_p1', level: 'ht_level', decay: 'ht_p2' },
            rs: { level: 'rs_level' },
            cp: { level: 'cp_level' },
            ch: { level: 'ch_level', ch_decay: 'ch_decay' },
            oh: { level: 'oh_level', oh_decay: 'oh_decay' },
            cr: { level: 'cr_level', cr_tune: 'cr_tune' },
            rd: { level: 'rd_level', rd_tune: 'rd_tune' }
        };

        for (const [trackId, params] of Object.entries(knobMap)) {
            const track = tracks[trackId];
            if (!track) continue;

            for (const [paramKey, knobId] of Object.entries(params)) {
                if (track[paramKey] !== undefined && window.knobInstances[knobId]) {
                    window.knobInstances[knobId].setValue(track[paramKey]);
                }
            }
        }
    },

    // Save current knob values to the current pattern
    saveCurrentSettingsToPattern() {
        // Prevent saving settings to pattern while in Song Mode
        if (this.mode === 'song') return;

        const pattern = this.patterns[this.currentPatternId];
        if (!pattern || !pattern.units) return;

        // Save TB-303 Unit 1
        this.saveTB303Settings(1, pattern.units.tb303_1.settings);

        // Save TB-303 Unit 2
        this.saveTB303Settings(2, pattern.units.tb303_2.settings);

        // Save TR-909
        this.saveTR909Settings(pattern.units.tr909.tracks);
    },

    saveTB303Settings(unitNum, settings) {
        const suffix = unitNum;

        // Waveform
        const waveEl = document.querySelector(`input[name="wave303_${suffix}"]:checked`);
        settings.waveform = waveEl?.value || 'sawtooth';

        // Knobs
        const knobMap = {
            tune: `tune303_${suffix}-input`,
            cutoff: `cutoff303_${suffix}-input`,
            reso: `reso303_${suffix}-input`,
            env: `env303_${suffix}-input`,
            decay: `decay303_${suffix}-input`,
            accent: `accent303_${suffix}-input`,
            volume: `vol303_${suffix}-input`,
            delayTime: `delayTime303_${suffix}-input`,
            delayFb: `delayFb303_${suffix}-input`,
            delayWet: `delayWet303_${suffix}-input`
        };

        for (const [key, inputId] of Object.entries(knobMap)) {
            const input = document.getElementById(inputId);
            if (input) {
                settings[key] = parseFloat(input.value);
            }
        }
    },

    saveTR909Settings(tracks) {
        const knobMap = {
            bd: { tune: 'bd_p1-input', level: 'bd_level-input', attack: 'bd_p2-input', decay: 'bd_p3-input' },
            sd: { tune: 'sd_p1-input', level: 'sd_level-input', tone: 'sd_p2-input', snappy: 'sd_p3-input' },
            lt: { tune: 'lt_p1-input', level: 'lt_level-input', decay: 'lt_p2-input' },
            mt: { tune: 'mt_p1-input', level: 'mt_level-input', decay: 'mt_p2-input' },
            ht: { tune: 'ht_p1-input', level: 'ht_level-input', decay: 'ht_p2-input' },
            rs: { level: 'rs_level-input' },
            cp: { level: 'cp_level-input' },
            ch: { level: 'ch_level-input', ch_decay: 'ch_decay-input' },
            oh: { level: 'oh_level-input', oh_decay: 'oh_decay-input' },
            cr: { level: 'cr_level-input', cr_tune: 'cr_tune-input' },
            rd: { level: 'rd_level-input', rd_tune: 'rd_tune-input' }
        };

        // Ensure all tracks exist in the pattern before saving
        for (const tid of ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp', 'ch', 'oh', 'cr', 'rd']) {
            if (!tracks[tid]) {
                const defaults = this.getDefaultTR909Settings()[tid];
                tracks[tid] = { steps: Array(16).fill(0), ...defaults };
            }
        }

        for (const [trackId, params] of Object.entries(knobMap)) {
            const track = tracks[trackId];
            if (!track) continue;

            for (const [paramKey, inputId] of Object.entries(params)) {
                const input = document.getElementById(inputId);
                if (input) {
                    track[paramKey] = parseFloat(input.value);
                }
            }
        }
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
        // Save current settings before copying
        this.saveCurrentSettingsToPattern();
        this.clipboard = JSON.parse(JSON.stringify(this.patterns[this.currentPatternId]));

        const toast = document.getElementById('toast');
        if (toast) {
            toast.innerText = 'Pattern copied!';
            toast.className = 'show';
            setTimeout(() => {
                toast.className = toast.className.replace('show', '');
            }, 3000);
        }
    },

    async pastePattern() {
        // First, try to read from system clipboard for URL-based import
        try {
            const clipboardText = await navigator.clipboard.readText();

            // Check if clipboard contains a URL with hash
            if (clipboardText && clipboardText.includes('#') &&
                (clipboardText.startsWith('http://') || clipboardText.startsWith('https://'))) {

                // Extract hash from URL
                const hashIndex = clipboardText.indexOf('#');
                const hashData = clipboardText.substring(hashIndex + 1);

                if (hashData && hashData.length > 0) {
                    try {
                        // Decode the hash using BinaryFormatDecoder
                        const decoder = new BinaryFormatDecoder();
                        const importedState = decoder.decode(hashData);

                        // Import the pattern from the decoded state
                        if (importedState && importedState.patterns) {
                            const sourcePatternId = importedState.currentPatternId || 0;
                            const sourcePattern = importedState.patterns[sourcePatternId];

                            if (sourcePattern) {
                                // Migrate if old format
                                const migratedPattern = this.migratePatternIfNeeded(sourcePattern, importedState);
                                this.patterns[this.currentPatternId] = JSON.parse(JSON.stringify(migratedPattern));

                                // Apply the settings from imported pattern
                                this.applyPatternSettings(this.currentPatternId);
                                UI.renderAll();

                                const toast = document.getElementById('toast');
                                if (toast) {
                                    toast.innerText = 'Pattern imported from URL!';
                                    toast.className = 'show';
                                    setTimeout(() => {
                                        toast.className = toast.className.replace('show', '');
                                    }, 3000);
                                }
                                return;
                            }
                        }
                    } catch (decodeError) {
                        console.warn('Failed to decode URL hash, falling back to internal clipboard:', decodeError);
                    }
                }
            }
        } catch (clipboardError) {
            console.warn('Clipboard read failed, using internal clipboard:', clipboardError);
        }

        // Fall back to internal clipboard
        if (!this.clipboard) {
            const toast = document.getElementById('toast');
            if (toast) {
                toast.innerText = 'No pattern to paste';
                toast.className = 'show';
                setTimeout(() => {
                    toast.className = toast.className.replace('show', '');
                }, 3000);
            }
            return;
        }

        this.patterns[this.currentPatternId] = JSON.parse(JSON.stringify(this.clipboard));

        // Apply settings from pasted pattern
        this.applyPatternSettings(this.currentPatternId);
        UI.renderAll();

        const toast = document.getElementById('toast');
        if (toast) {
            toast.innerText = 'Pattern pasted!';
            toast.className = 'show';
            setTimeout(() => {
                toast.className = toast.className.replace('show', '');
            }, 3000);
        }
    },

    // Migrate old pattern format to new format
    migratePatternIfNeeded(pattern, state) {
        // If already new format, return as-is
        if (pattern.units) {
            return pattern;
        }

        // Convert old format to new format
        const newPattern = this.createEmptyPattern();

        // Migrate TB-303 sequences
        if (pattern.seq303_1) {
            newPattern.units.tb303_1.sequence = JSON.parse(JSON.stringify(pattern.seq303_1));
        }
        if (pattern.seq303_2) {
            newPattern.units.tb303_2.sequence = JSON.parse(JSON.stringify(pattern.seq303_2));
        }

        // Migrate TR-909 sequence
        if (pattern.seq909) {
            for (const track of ['bd', 'sd', 'ch', 'oh', 'cp']) {
                if (pattern.seq909[track]) {
                    newPattern.units.tr909.tracks[track].steps = JSON.parse(JSON.stringify(pattern.seq909[track]));
                }
            }
        }

        // Migrate settings from state (old format stored settings globally)
        if (state) {
            // Waveforms
            if (state.wave1) {
                newPattern.units.tb303_1.settings.waveform = state.wave1;
            }
            if (state.wave2) {
                newPattern.units.tb303_2.settings.waveform = state.wave2;
            }

            // Knobs from state.k
            if (state.k) {
                this.migrateKnobsToPattern(state.k, newPattern);
            }
        }

        return newPattern;
    },

    migrateKnobsToPattern(knobs, pattern) {
        // TB-303 Unit 1
        const tb303_1_map = {
            'tune303_1-input': 'tune',
            'cutoff303_1-input': 'cutoff',
            'reso303_1-input': 'reso',
            'env303_1-input': 'env',
            'decay303_1-input': 'decay',
            'accent303_1-input': 'accent',
            'vol303_1-input': 'volume',
            'delayTime303_1-input': 'delayTime',
            'delayFb303_1-input': 'delayFb',
            'delayWet303_1-input': 'delayWet'
        };

        for (const [knobId, settingKey] of Object.entries(tb303_1_map)) {
            if (knobs[knobId] !== undefined) {
                pattern.units.tb303_1.settings[settingKey] = knobs[knobId];
            }
        }

        // TB-303 Unit 2
        const tb303_2_map = {
            'tune303_2-input': 'tune',
            'cutoff303_2-input': 'cutoff',
            'reso303_2-input': 'reso',
            'env303_2-input': 'env',
            'decay303_2-input': 'decay',
            'accent303_2-input': 'accent',
            'vol303_2-input': 'volume',
            'delayTime303_2-input': 'delayTime',
            'delayFb303_2-input': 'delayFb',
            'delayWet303_2-input': 'delayWet'
        };

        for (const [knobId, settingKey] of Object.entries(tb303_2_map)) {
            if (knobs[knobId] !== undefined) {
                pattern.units.tb303_2.settings[settingKey] = knobs[knobId];
            }
        }

        // TR-909
        const tr909_map = {
            bd: { 'bd_p1-input': 'tune', 'bd_p2-input': 'attack', 'bd_p3-input': 'decay', 'bd_level-input': 'level' },
            sd: { 'sd_p1-input': 'tune', 'sd_p2-input': 'snappy', 'sd_p3-input': 'decay', 'sd_level-input': 'level' },
            ch: { 'ch_decay-input': 'decay', 'ch_level-input': 'level', 'ch_tune-input': 'tune' },
            oh: { 'oh_decay-input': 'decay', 'oh_level-input': 'level', 'oh_tune-input': 'tune' },
            cp: { 'cp_decay-input': 'decay', 'cp_level-input': 'level' }
        };

        for (const [trackId, params] of Object.entries(tr909_map)) {
            for (const [knobId, settingKey] of Object.entries(params)) {
                if (knobs[knobId] !== undefined) {
                    pattern.units.tr909.tracks[trackId][settingKey] = knobs[knobId];
                }
            }
        }
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
    },

    toggleUnitLock(unitId) {
        if (this.unitLocks[unitId] !== undefined) {
            this.unitLocks[unitId] = !this.unitLocks[unitId];
            this.saveSettings();
            return this.unitLocks[unitId];
        }
        return false;
    },

    randomize() {
        const setK = (id, min, max) => {
            if (window.knobInstances[id]) {
                const val = Math.floor(Math.random() * (max - min + 1)) + min;
                window.knobInstances[id].setValue(val);
            }
        };

        // Randomize 303 Unit 1
        if (!this.unitLocks.tb303_1) {
            const wave1 = Math.random() > 0.5 ? 'sawtooth' : 'square';
            document.getElementById(wave1 === 'sawtooth' ? 'wave-saw-1' : 'wave-sq-1').checked = true;
            setK('tune303_1', 0, 0); setK('cutoff303_1', 20, 90); setK('reso303_1', 0, 15);
            setK('env303_1', 30, 90); setK('decay303_1', 30, 80); setK('accent303_1', 50, 100); setK('vol303_1', 70, 90);
        }

        // Randomize 303 Unit 2
        if (!this.unitLocks.tb303_2) {
            const wave2 = Math.random() > 0.5 ? 'sawtooth' : 'square';
            document.getElementById(wave2 === 'sawtooth' ? 'wave-saw-2' : 'wave-sq-2').checked = true;
            setK('tune303_2', 0, 0); setK('cutoff303_2', 20, 90); setK('reso303_2', 0, 15);
            setK('env303_2', 30, 90); setK('decay303_2', 30, 80); setK('accent303_2', 50, 100); setK('vol303_2', 70, 90);
        }

        if (!this.unitLocks.tr909) {
            this.active909Tracks.forEach(tid => {
                const knobMap = {
                    bd: [['bd_p1', 30, 60], ['bd_level', 90, 100], ['bd_p2', 30, 80], ['bd_p3', 40, 70]],
                    sd: [['sd_p1', 40, 70], ['sd_level', 90, 100], ['sd_p2', 40, 60], ['sd_p3', 50, 90]],
                    lt: [['lt_p1', 30, 70], ['lt_level', 90, 100], ['lt_p2', 30, 70]],
                    mt: [['mt_p1', 30, 70], ['mt_level', 90, 100], ['mt_p2', 30, 70]],
                    ht: [['ht_p1', 30, 70], ['ht_level', 90, 100], ['ht_p2', 30, 70]],
                    rs: [['rs_level', 80, 100]],
                    cp: [['cp_level', 80, 100]],
                    ch: [['ch_level', 90, 100], ['ch_decay', 10, 40], ['ch_tune', 30, 70]],
                    oh: [['oh_level', 90, 100], ['oh_decay', 40, 80], ['oh_tune', 30, 70]],
                    cr: [['cr_level', 90, 100], ['cr_tune', 40, 60]],
                    rd: [['rd_level', 90, 100], ['rd_tune', 40, 60]]
                };
                if (knobMap[tid]) {
                    knobMap[tid].forEach(k => setK(k[0], k[1], k[2]));
                }
            });
        }

        // Save randomized settings to current pattern
        this.saveCurrentSettingsToPattern();

        // Randomize Sequence Data for CURRENT Pattern
        const p = this.patterns[this.currentPatternId];
        const seq1 = p.units ? p.units.tb303_1.sequence : p.seq303_1;
        const seq2 = p.units ? p.units.tb303_2.sequence : p.seq303_2;

        const ALL_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const SCALE = ['C', 'D#', 'F', 'F#', 'G', 'A#'];
        const BASS_STRONG_NOTES = ['C', 'F', 'G'];
        const STRONG_MELODY_INTERVALS = [3, 4, 8, 9];
        const WEAK_MELODY_INTERVALS = [0, 3, 4, 7, 8, 9];

        const noteToIndex = (note) => ALL_NOTES.indexOf(note);

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

        if (!this.unitLocks.tb303_2) randBassSeq(seq2);
        if (!this.unitLocks.tb303_1) randMelodySeq(seq1, seq2);

        // Randomize 909
        if (!this.unitLocks.tr909) {
            const t = p.units ? {
                bd: p.units.tr909.tracks.bd.steps,
                sd: p.units.tr909.tracks.sd.steps,
                lt: p.units.tr909.tracks.lt.steps,
                mt: p.units.tr909.tracks.mt.steps,
                ht: p.units.tr909.tracks.ht.steps,
                rs: p.units.tr909.tracks.rs.steps,
                cp: p.units.tr909.tracks.cp.steps,
                ch: p.units.tr909.tracks.ch.steps,
                oh: p.units.tr909.tracks.oh.steps,
                cr: p.units.tr909.tracks.cr.steps,
                rd: p.units.tr909.tracks.rd.steps
            } : p.seq909;

            ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp', 'ch', 'oh', 'cr', 'rd'].forEach(k => {
                if (t[k]) t[k].fill(0);
            });

            // BD: 4-on-the-floor (Always randomized if in activeTracks, though BD is usually always there)
            if (this.active909Tracks.includes('bd')) {
                [0, 4, 8, 12].forEach(i => t.bd[i] = 1);
                if (Math.random() > 0.6) t.bd[14] = 1;
                if (Math.random() > 0.85) t.bd[7] = 1;
            }

            // SD/CP: Backbeat
            if (this.active909Tracks.includes('sd') || this.active909Tracks.includes('cp')) {
                [4, 12].forEach(i => {
                    if (this.active909Tracks.includes('sd') && Math.random() > 0.6) t.sd[i] = 1;
                    else if (this.active909Tracks.includes('cp') && Math.random() > 0.4) t.cp[i] = 1;
                });
                if (this.active909Tracks.includes('sd') && Math.random() > 0.8) t.sd[15] = 1;
                if (this.active909Tracks.includes('cp') && Math.random() > 0.9) t.cp[11] = 1;
            }

            // Hats
            if (this.active909Tracks.includes('oh') || this.active909Tracks.includes('ch')) {
                for (let i = 0; i < 16; i++) {
                    if (this.active909Tracks.includes('oh') && i % 4 === 2) t.oh[i] = 1;
                    else if (this.active909Tracks.includes('ch') && Math.random() > 0.4) t.ch[i] = 1;
                }
            }

            // RS & CP (Extra Texture)
            for (let i = 0; i < 16; i++) {
                if (this.active909Tracks.includes('rs') && Math.random() > 0.9) t.rs[i] = 1;
                if (this.active909Tracks.includes('cp') && Math.random() > 0.92) t.cp[i] = 1;
            }

            // Toms (Fill-ins)
            const availableToms = ['lt', 'mt', 'ht'].filter(tid => this.active909Tracks.includes(tid));
            if (availableToms.length > 0 && Math.random() > 0.7) {
                const tomTrack = availableToms[Math.floor(Math.random() * availableToms.length)];
                [11, 12, 13, 14, 15].forEach(i => {
                    if (Math.random() > 0.4) t[tomTrack][i] = 1;
                });
            }

            // Cymbals (Scene transitions): Determine if we have cymbals
            if (Math.random() > 0.8) {
                const cym = Math.random() > 0.5 ? 'cr' : 'rd';
                t[cym][0] = 1; // Start of pattern
                // Very rare extra hit
                if (Math.random() > 0.9) t[cym][12] = 1;
            }
        }

        UI.renderAll();
    },

    exportState() {
        // Save current settings to pattern before export
        this.saveCurrentSettingsToPattern();

        const state = {
            ver: 4,  // New version for new format
            bpm: AudioEngine.tempo,
            swing: AudioEngine.swing,
            mode: this.mode,
            currentPatternId: this.currentPatternId,
            patterns: this.patterns,
            song: this.song,
            midi: MidiManager.mappings,
            active909Tracks: this.active909Tracks,
            customSampleMap: this.customSampleMap
        };

        const encoder = new BinaryFormatEncoder();
        const binaryData = encoder.encodeForShare(state);
        return encoder.toBase64URL(binaryData);
    },

    exportFullState() {
        // Save current settings to pattern before export
        this.saveCurrentSettingsToPattern();

        const state = {
            ver: 5,
            bpm: AudioEngine.tempo,
            swing: AudioEngine.swing,
            mode: this.mode,
            currentPatternId: this.currentPatternId,
            patterns: this.patterns,
            song: this.song,
            midi: MidiManager.mappings,
            active909Tracks: this.active909Tracks,
            customSampleMap: this.customSampleMap
        };

        const encoder = new BinaryFormatEncoder();
        const binaryData = encoder.encodeFull(state);
        return encoder.toBase64URL(binaryData);
    },

    importState(code) {
        if (!code || code.length === 0) {
            this.init();
            this.randomize();
            return;
        }

        try {
            let state;

            // Try to decode as binary first
            try {
                const decoder = new BinaryFormatDecoder();
                state = decoder.decode(code);
            } catch (binaryError) {
                // If binary decoding fails, try legacy JSON format
                try {
                    state = JSON.parse(atob(code));
                } catch (jsonError) {
                    console.error("Invalid state data - neither binary nor JSON format", binaryError, jsonError);
                    this.init();
                    this.randomize();
                    return;
                }
            }

            if (state.bpm) AudioEngine.tempo = state.bpm;
            if (state.swing !== undefined) AudioEngine.swing = state.swing;
            if (state.mode) this.mode = state.mode;

            if (state.midi) {
                MidiManager.mappings = state.midi;
            } else {
                MidiManager.clearAllMappings();
            }

            // Handle patterns
            if (state.patterns) {
                this.patterns = [];
                for (let i = 0; i < 16; i++) {
                    if (state.patterns[i]) {
                        const migratedPattern = this.migratePatternIfNeeded(state.patterns[i], state);
                        this.patterns.push(migratedPattern);
                    } else {
                        this.patterns.push(this.createEmptyPattern());
                    }
                }
            }

            // Handle song
            this.song = state.song || [0];

            // Handle metadata
            if (state.active909Tracks) this.active909Tracks = state.active909Tracks;
            if (state.customSampleMap) {
                this.customSampleMap = state.customSampleMap;
                const tr909 = AudioEngine.instruments.get('tr909');
                if (tr909) tr909.setCustomSampleMap(this.customSampleMap);
            }

            // Apply settings from current pattern
            this.applyPatternSettings(this.currentPatternId);

            UI.renderAll();
            UI.updateSwingUI();
            UI.updateSevenSegment(AudioEngine.tempo);
        } catch (e) {
            console.error("Invalid state data", e);
            this.randomize();
        }
    }
};
