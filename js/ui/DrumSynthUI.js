import { RotaryKnob } from './RotaryKnob.js';
import { Data } from '../data/Data.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { UI } from './UI.js';
import { UnifiedSynth, getFactoryPreset } from '../audio/tr909/UnifiedSynth.js';

/**
 * DrumSynthUI - Controller for the DrumSynth Maker Overlay
 * Uses the same knob-group pattern as TB-303
 */
export const DrumSynthUI = {
    isOpen: false,
    currentTrackId: null,
    synth: null,
    knobs: {},

    // Knob definitions for each module (like TB-303 uses)
    KNOB_DEFS: {
        osc1: [
            { id: 'drive', label: 'DRIVE', min: 0, max: 50, def: 10 },
            { id: 'p_decay', label: 'P.DEC', min: 0, max: 100, def: 40 },
            { id: 'p_amt', label: 'P.AMT', min: 0, max: 100, def: 60 },
            { id: 'a_attack', label: 'ATK', min: 0, max: 100, def: 0 },
            { id: 'a_decay', label: 'DEC', min: 0, max: 100, def: 45 }
        ],
        osc2: [
            { id: 'tune', label: 'TUNE', min: -24, max: 24, def: 0 },
            { id: 'fine', label: 'FINE', min: -100, max: 100, def: 0 },
            { id: 'a_decay', label: 'DEC', min: 0, max: 100, def: 30 },
            { id: 'level', label: 'LVL', min: 0, max: 100, def: 80 }
        ],
        osc3: [
            { id: 'tune', label: 'TUNE', min: -24, max: 24, def: 0 },
            { id: 'a_decay', label: 'DEC', min: 0, max: 100, def: 30 },
            { id: 'level', label: 'LVL', min: 0, max: 100, def: 60 }
        ],
        osc4: [
            { id: 'tune', label: 'TUNE', min: -24, max: 24, def: 0 },
            { id: 'a_decay', label: 'DEC', min: 0, max: 100, def: 30 },
            { id: 'level', label: 'LVL', min: 0, max: 100, def: 40 }
        ],
        noise: [
            { id: 'cutoff', label: 'CUT', min: 20, max: 10000, def: 2000 },
            { id: 'res', label: 'RES', min: 0, max: 100, def: 10 },
            { id: 'attack', label: 'ATK', min: 0, max: 100, def: 0 },
            { id: 'decay', label: 'DEC', min: 0, max: 100, def: 30 },
            { id: 'burst_count', label: 'BRST', min: 1, max: 8, def: 1 },
            { id: 'burst_rate', label: 'RATE', min: 2, max: 50, def: 8 },
            { id: 'level', label: 'MIX', min: 0, max: 100, def: 50 }
        ],
        master: [
            { id: 'hpf_cutoff', label: 'HPF', min: 20, max: 2000, def: 20 },
            { id: 'hpf_res', label: 'Q', min: 0, max: 100, def: 0 },
            { id: 'master_vol', label: 'VOL', min: 0, max: 100, def: 80 }
        ]
    },

    init() {
        console.log('DrumSynthUI: Initializing...');
        this.overlay = document.getElementById('drumSynthOverlay');
        this.voiceLabel = document.getElementById('ds-voice-label');

        // Buttons
        document.getElementById('ds-close-btn').onclick = () => this.close();
        document.getElementById('ds-reset-btn').onclick = () => this.resetToFactory();
        document.getElementById('ds-apply-btn').onclick = () => this.apply();
        document.getElementById('ds-preview-btn').onclick = () => this.preview();

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
                const knob = new RotaryKnob(container, def.label, knobId, def.min, def.max, def.def, 1, 'small');
                this.knobs[modId][def.id] = knob;

                // Auto-trig on change
                const inputEl = document.getElementById(`${knobId}-input`);
                if (inputEl) {
                    inputEl.addEventListener('input', () => {
                        if (document.getElementById('ds-auto-trig')?.checked) {
                            this.preview();
                        }
                    });
                }
            });
        });

        // Setup select change listeners
        document.querySelectorAll('#drumSynthOverlay .ds-select').forEach(select => {
            select.addEventListener('change', () => {
                if (document.getElementById('ds-auto-trig')?.checked) {
                    this.preview();
                }
            });
        });

        // Setup checkbox change listeners
        document.querySelectorAll('#drumSynthOverlay .toggle-switch input').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (document.getElementById('ds-auto-trig')?.checked) {
                    this.preview();
                }
            });
        });
    },

    open(trackId) {
        console.log('DrumSynthUI: Opening for', trackId);
        this.currentTrackId = trackId;
        this.isOpen = true;
        this.overlay.style.display = 'block';

        // Close Manage Tracks modal if open
        const manageOverlay = document.getElementById('manageTracksOverlay');
        if (manageOverlay) manageOverlay.style.display = 'none';

        // Update labels
        const trackDef = UI.allTracks?.find(t => t.id === trackId);
        const displayName = trackDef ? trackDef.name : trackId.toUpperCase();
        if (this.voiceLabel) this.voiceLabel.innerText = `${displayName} (Drum Synth)`;
        const footerLabel = document.getElementById('ds-voice-label-footer');
        if (footerLabel) footerLabel.innerText = displayName;

        // Load settings
        this.loadSettings(trackId);
    },

    close() {
        this.isOpen = false;
        this.overlay.style.display = 'none';
        this.currentTrackId = null;
    },

    loadSettings(trackId) {
        const saved = Data.getUnitSettings('tr909')?.[trackId]?.customSynth;
        const preset = (saved && Object.keys(saved).length > 0) ? saved : getFactoryPreset(trackId);
        if (!preset) return;

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
            if (modEl) {
                modEl.querySelectorAll('.ds-select').forEach(select => {
                    const param = select.getAttribute('data-param');
                    if (param && modCfg[param]) {
                        select.value = modCfg[param];
                    }
                });

                // Checkbox (enabled state)
                const checkbox = modEl.querySelector('.toggle-switch input');
                if (checkbox) {
                    checkbox.checked = modCfg.enabled !== undefined ? modCfg.enabled : (modId === 'osc1' || modId === 'noise');
                }
            }
        });
    },

    collectParams() {
        const params = { vol: 1 };

        Object.keys(this.KNOB_DEFS).forEach(modId => {
            const modEl = document.getElementById(`ds-${modId}`);
            params[modId] = {};

            // Enabled state
            if (modEl) {
                const checkbox = modEl.querySelector('.toggle-switch input');
                params[modId].enabled = checkbox ? checkbox.checked : (modId === 'master');

                // Selects
                modEl.querySelectorAll('.ds-select').forEach(select => {
                    const param = select.getAttribute('data-param');
                    if (param) params[modId][param] = select.value;
                });
            }

            // Knob values
            if (this.knobs[modId]) {
                Object.keys(this.knobs[modId]).forEach(param => {
                    params[modId][param] = this.knobs[modId][param].value;
                });
            }
        });

        return params;
    },

    async preview() {
        // Ensure AudioContext exists and is resumed
        if (!AudioEngine.ctx) {
            console.log('DrumSynthUI: Creating AudioContext...');
            AudioEngine.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (AudioEngine.ctx.state === 'suspended') {
            await AudioEngine.ctx.resume();
        }

        if (!this.synth) {
            console.log('DrumSynthUI: Creating UnifiedSynth...');
            this.synth = new UnifiedSynth(AudioEngine.ctx, AudioEngine.ctx.destination);
        }

        const params = this.collectParams();
        console.log('DrumSynthUI: Preview', params);
        this.synth.play(params);
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
