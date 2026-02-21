import { RotaryKnob } from './RotaryKnob.js';
import { Data } from '../data/Data.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { UI } from './UI.js';
import {
    UnifiedSynth,
    mergePresetWithBase,
    resolvePreviewProfile,
    getPreviewControlValues,
    applyTrackPerformanceControls
} from '../audio/tr909/UnifiedSynth.js';

/**
 * DrumSynthUI - Controller for the DrumSynth Maker Overlay
 * Uses the same knob-group pattern as TB-303
 */
export const DrumSynthUI = {
    isOpen: false,
    currentTrackId: null,
    synth: null,
    knobs: {},
    previewProfile: null,
    SHAPER_TRACKS: ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp'],

    // Knob definitions matching UnifiedSynth parameters
    // freq in Hz, decay times in seconds (displayed as ms in UI)
    KNOB_DEFS: {
        osc1: [
            { id: 'freq', label: 'FREQ', min: 20, max: 500, def: 48, step: 1 },
            { id: 'startFreq', label: 'START', min: 50, max: 1000, def: 288, step: 1 },
            { id: 'p_decay', label: 'P.DEC', min: 0.005, max: 0.2, def: 0.02, step: 0.001 },
            { id: 'a_decay', label: 'DEC', min: 0.1, max: 1.5, def: 0.5, step: 0.01 },
            { id: 'drive', label: 'DRIVE', min: 0, max: 50, def: 10, step: 1 },
            { id: 'level', label: 'LVL', min: 0, max: 1.5, def: 1.0, step: 0.01 }
        ],
        osc2: [
            { id: 'freq', label: 'FREQ', min: 50, max: 1000, def: 180, step: 1 },
            { id: 'startFreq', label: 'START', min: 50, max: 1500, def: 270, step: 1 },
            { id: 'p_decay', label: 'P.DEC', min: 0.005, max: 0.1, def: 0.02, step: 0.001 },
            { id: 'a_decay', label: 'DEC', min: 0.05, max: 1.0, def: 0.15, step: 0.01 },
            { id: 'level', label: 'LVL', min: 0, max: 1.5, def: 1.0, step: 0.01 }
        ],
        osc3: [
            { id: 'freq', label: 'FREQ', min: 50, max: 2000, def: 240, step: 1 },
            { id: 'a_decay', label: 'DEC', min: 0.02, max: 1.0, def: 0.15, step: 0.01 },
            { id: 'level', label: 'LVL', min: 0, max: 1.0, def: 0.6, step: 0.01 }
        ],
        osc4: [
            { id: 'freq', label: 'FREQ', min: 100, max: 2000, def: 500, step: 1 },
            { id: 'a_decay', label: 'DEC', min: 0.02, max: 0.5, def: 0.1, step: 0.01 },
            { id: 'level', label: 'LVL', min: 0, max: 1.0, def: 0.4, step: 0.01 }
        ],
        click: [
            { id: 'freq', label: 'FREQ', min: 200, max: 2000, def: 800, step: 10 },
            { id: 'decay', label: 'DEC', min: 0.002, max: 0.02, def: 0.008, step: 0.001 },
            { id: 'filter_freq', label: 'FILT', min: 500, max: 8000, def: 2500, step: 50 },
            { id: 'level', label: 'LVL', min: 0, max: 0.5, def: 0.2, step: 0.01 }
        ],
        snap: [
            { id: 'startFreq', label: 'START', min: 500, max: 3000, def: 1800, step: 50 },
            { id: 'endFreq', label: 'END', min: 100, max: 1000, def: 400, step: 10 },
            { id: 'level', label: 'LVL', min: 0, max: 1.0, def: 0.6, step: 0.01 }
        ],
        noise: [
            { id: 'cutoff', label: 'CUT', min: 200, max: 10000, def: 4000, step: 100 },
            { id: 'Q', label: 'Q', min: 0.1, max: 10, def: 1.0, step: 0.1 },
            { id: 'decay', label: 'DEC', min: 0.05, max: 1.0, def: 0.25, step: 0.01 },
            { id: 'burst_count', label: 'BRST', min: 1, max: 8, def: 1, step: 1 },
            { id: 'burst_interval', label: 'INT', min: 0.002, max: 0.02, def: 0.008, step: 0.001 },
            { id: 'level', label: 'LVL', min: 0, max: 1.5, def: 0.5, step: 0.01 }
        ],
        noise2: [
            { id: 'cutoff', label: 'CUT', min: 200, max: 10000, def: 2200, step: 100 },
            { id: 'Q', label: 'Q', min: 0.1, max: 10, def: 1.0, step: 0.1 },
            { id: 'decay', label: 'DEC', min: 0.02, max: 1.0, def: 0.15, step: 0.01 },
            { id: 'burst_count', label: 'BRST', min: 1, max: 8, def: 1, step: 1 },
            { id: 'burst_interval', label: 'INT', min: 0.002, max: 0.02, def: 0.008, step: 0.001 },
            { id: 'level', label: 'LVL', min: 0, max: 1.5, def: 0.5, step: 0.01 }
        ],
        shaper: [
            { id: 'drop', label: 'DROP', min: 0, max: 100, def: 50, step: 1 },
            { id: 'ring', label: 'RING', min: 0, max: 100, def: 50, step: 1 },
            { id: 'bright', label: 'BRIGHT', min: 0, max: 100, def: 50, step: 1 }
        ]
    },

    liveKnobs: {},
    liveKnobDefs: [],

    init() {
        console.log('DrumSynthUI: Initializing...');
        this.overlay = document.getElementById('drumSynthOverlay');
        this.voiceLabel = document.getElementById('ds-voice-label');

        // Buttons
        document.getElementById('ds-close-btn').onclick = () => this.close();
        document.getElementById('ds-reset-btn').onclick = () => this.resetToFactory();
        document.getElementById('ds-apply-btn').onclick = () => this.apply();

        // Arcade Preview Button - Use pointerdown for immediate tactile playback
        const previewBtn = document.getElementById('ds-preview-btn');
        if (previewBtn) {
            previewBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault(); // Prevent default touch behavior
                this.preview();
                // CSS :active pseudo-class handles the animation now.
            });
        }

        // Build knobs dynamically (like TB-303)
        this.buildKnobs();
    },

    buildKnobs() {
        Object.keys(this.KNOB_DEFS).forEach(modId => {
            const container = document.getElementById(`ds-${modId}-knobs`);
            if (!container) {
                console.warn(`DrumSynthUI: Container not found for ds-${modId}-knobs`);
                return;
            }

            // Clear any existing content
            container.innerHTML = '';
            this.knobs[modId] = {};

            // Create each knob
            this.KNOB_DEFS[modId].forEach(def => {
                const knobId = `ds_${modId}_${def.id}`;
                const step = def.step || 1;
                const knob = new RotaryKnob(container, def.label, knobId, def.min, def.max, def.def, step, 'small');
                this.knobs[modId][def.id] = knob;
            });
        });
    },

    open(trackId) {
        console.log('DrumSynthUI: Opening for', trackId);
        this.currentTrackId = trackId;
        this.isOpen = true;
        this.overlay.classList.remove('hidden');
        UI.updateOverlayScrollLock();

        // Close Manage Tracks modal if open
        const manageOverlay = document.getElementById('manageTracksOverlay');
        if (manageOverlay) manageOverlay.classList.add('hidden');

        // Update labels
        const trackDef = UI.allTracks?.find(t => t.id === trackId);
        const displayName = trackDef ? trackDef.name : trackId.toUpperCase();
        if (this.voiceLabel) this.voiceLabel.innerText = `${displayName} (Drum Synth)`;
        const footerLabel = document.getElementById('ds-voice-label-footer');
        if (footerLabel) footerLabel.innerText = displayName;

        const shaperModule = document.getElementById('ds-shaper');
        if (shaperModule) {
            const hasShaper = this.SHAPER_TRACKS.includes(trackId);
            shaperModule.classList.toggle('hidden', !hasShaper);
        }

        // Load settings (includes dynamic preview macro knob build)
        this.loadSettings(trackId);
    },

    buildLiveKnobs(trackId, profile = null) {
        const container = document.getElementById('ds-live-knobs');
        if (!container) return;

        container.innerHTML = '';
        this.liveKnobs = {};
        this.liveKnobDefs = [];

        const resolved = profile || resolvePreviewProfile(trackId, null);
        const knobDefs = Array.isArray(resolved?.controls) ? resolved.controls : [];
        if (knobDefs.length === 0) {
            container.innerHTML = '<span class="empty-msg">No preview macros configured</span>';
            return;
        }

        knobDefs.forEach(def => {
            const knobId = `ds_live_${def.id}`;
            const step = Number.isFinite(def.step) ? def.step : 1;
            const knob = new RotaryKnob(container, def.label, knobId, def.min, def.max, def.def, step, 'small');
            this.liveKnobs[def.id] = knob;
            this.liveKnobDefs.push(def);

            // Auto-trig removed - manual preview only via Arcade button
        });
    },

    close() {
        this.isOpen = false;
        this.overlay.classList.add('hidden');
        UI.updateOverlayScrollLock();
        this.currentTrackId = null;
    },

    loadSettings(trackId) {
        const saved = Data.getUnitSettings('tr909')?.[trackId]?.customSynth;
        const preset = this._mergePresetWithFactory(trackId, saved);
        if (!preset) return;
        this.previewProfile = resolvePreviewProfile(trackId, saved || preset);
        this.buildLiveKnobs(trackId, this.previewProfile);

        // Apply preset values to knobs
        Object.keys(this.knobs).forEach(modId => {
            const modCfg = preset[modId] || {};
            const modEl = document.getElementById(`ds-${modId}`);

            // Knobs
            Object.keys(this.knobs[modId]).forEach(param => {
                const knob = this.knobs[modId][param];
                const val = modCfg[param] !== undefined ? modCfg[param] : knob.defaultVal;
                knob.setValue(val);
            });

            // Select (wave, filter_type)
            // Apply settings to UI (Radio Buttons: Wave/Filter)
            if (modEl) {
                modEl.querySelectorAll('.ds-radio-group').forEach(group => {
                    const param = group.getAttribute('data-param');
                    if (param && modCfg[param]) {
                        let val = modCfg[param];
                        if (param === 'wave') {
                            const waveMap = { 'triangle': 'Tri', 'sine': 'Sine', 'square': 'Sqr' };
                            val = waveMap[val.toLowerCase()] || val;
                        } else if (param === 'filter_type') {
                            const filterMap = { 'lowpass': 'LPF', 'highpass': 'HPF', 'bandpass': 'BPF' };
                            val = filterMap[val.toLowerCase()] || val;
                        }
                        const radio = group.querySelector(`input[value="${val}"]`);
                        if (radio) radio.checked = true;
                    }
                });

                // Enabled Toggle (ds-switch)
                const onRadio = modEl.querySelector('.ds-switch input[value="true"]');
                const offRadio = modEl.querySelector('.ds-switch input[value="false"]');
                if (onRadio && offRadio) {
                    const enabled = (preset[modId] && preset[modId].enabled === true);
                    onRadio.checked = enabled;
                    offRadio.checked = !enabled;
                }
            }
        });

        // Sync live preview macros to current track settings.
        const tr909Track = Data.getUnitSettings('tr909')?.[trackId] || {};
        const controlValues = getPreviewControlValues(trackId, tr909Track, this.previewProfile);
        Object.keys(this.liveKnobs || {}).forEach((id) => {
            const knob = this.liveKnobs[id];
            if (!knob) return;
            if (Number.isFinite(controlValues[id])) {
                knob.setValue(controlValues[id]);
            }
        });
    },

    collectParams() {
        const params = {};

        Object.keys(this.KNOB_DEFS).forEach(modId => {
            const modEl = document.getElementById(`ds-${modId}`);

            if (modId === 'master') {
                // Master params go to top level
                if (this.knobs[modId]) {
                    Object.keys(this.knobs[modId]).forEach(param => {
                        params[param] = this.knobs[modId][param].value;
                    });
                }
                return;
            }

            params[modId] = {};

            // Enabled state
            if (modEl) {
                // Enabled state (ds-switch)
                const onRadio = modEl.querySelector('.ds-switch input[value="true"]');
                params[modId].enabled = onRadio ? onRadio.checked : false;

                // Radio Params (wave, filter_type)
                modEl.querySelectorAll('.ds-radio-group').forEach(group => {
                    const checked = group.querySelector('input:checked');
                    if (checked && group.dataset.param) {
                        params[modId][group.dataset.param] = checked.value;
                    }
                });
            }

            // Knob values
            if (this.knobs[modId]) {
                Object.keys(this.knobs[modId]).forEach(param => {
                    params[modId][param] = this.knobs[modId][param].value;
                });
            }
        });

        const controlValues = {};
        Object.keys(this.liveKnobs || {}).forEach((id) => {
            const knob = this.liveKnobs[id];
            if (!knob) return;
            controlValues[id] = knob.value;
        });

        if (Number.isFinite(controlValues.level)) {
            params.vol = controlValues.level / 100;
        }

        if (!this.SHAPER_TRACKS.includes(this.currentTrackId)) {
            delete params.shaper;
        }

        params.previewProfile = JSON.parse(JSON.stringify(
            this.previewProfile || resolvePreviewProfile(this.currentTrackId, null)
        ));
        params.schemaVersion = 2;

        // Ensure vol has a default
        if (params.vol === undefined) params.vol = 1;

        return params;
    },

    async preview() {
        // Always bootstrap the shared engine first.
        await AudioEngine.init();

        const tr909 = AudioEngine.instruments?.get('tr909');
        const sharedNoiseBuffer = tr909?.noiseBuffer || null;

        if (
            !this.synth ||
            this.synth.ctx !== AudioEngine.ctx ||
            (sharedNoiseBuffer && this.synth.noiseBuffer !== sharedNoiseBuffer)
        ) {
            this.synth = new UnifiedSynth(
                AudioEngine.ctx,
                AudioEngine.master || AudioEngine.ctx.destination,
                sharedNoiseBuffer,
            );
        }

        // Use preview macro profile
        this.previewWith909Knobs();
    },

    previewWith909Knobs() {
        if (!this.currentTrackId) return;

        // 1. Get current UI parameters
        const uiParams = this.collectParams();

        // 2. Build playable preset
        const preset = this._mergePresetWithFactory(this.currentTrackId, uiParams);

        // 3. Collect live macro controls
        const controls = {};
        Object.keys(this.liveKnobs).forEach(id => {
            controls[id] = this.liveKnobs[id].value;
        });

        // 4. Apply preview profile macro mappings to the detailed preset
        applyTrackPerformanceControls(
            preset,
            this.currentTrackId,
            controls,
            this.previewProfile
        );

        console.log('DrumSynthUI: Preview', preset);
        this.synth.play(preset);
    },

    // Normalize editor patch for preview/playback.
    _mergePresetWithFactory(trackId, overridePreset) {
        return mergePresetWithBase(trackId, overridePreset);
    },

    resetToFactory() {
        if (!this.currentTrackId) return;
        // Clear saved custom synth and reload factory
        const trackId = this.currentTrackId;
        Data.saveCustomSynth(trackId, null);
        this.loadSettings(trackId);
        UI.showToast?.(`Reset to 909 Factory: ${trackId.toUpperCase()}`);
    },

    apply() {
        if (!this.currentTrackId) return;
        const trackId = this.currentTrackId;
        const params = this.collectParams();
        Data.saveCustomSynth(trackId, params);
        this.close();
        UI.showToast?.(`Applied custom synth to ${trackId.toUpperCase()}`);
    }
};
