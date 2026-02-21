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
        ]
    },

    // TR909 style knobs (p1, p2, p3) + LEVEL - same as original 909 UI
    TR909_KNOBS: {
        bd: [
            { id: 'p1', label: 'TUNE', min: 0, max: 100, def: 40 },
            { id: 'p2', label: 'ATTACK', min: 0, max: 100, def: 50 },
            { id: 'p3', label: 'DECAY', min: 0, max: 100, def: 50 },
            { id: 'level', label: 'LEVEL', min: 0, max: 200, def: 100 }
        ],
        sd: [
            { id: 'p1', label: 'TUNE', min: 0, max: 100, def: 50 },
            { id: 'p2', label: 'TONE', min: 0, max: 100, def: 50 },
            { id: 'p3', label: 'SNAPPY', min: 0, max: 100, def: 50 },
            { id: 'level', label: 'LEVEL', min: 0, max: 200, def: 100 }
        ],
        lt: [
            { id: 'p1', label: 'TUNE', min: 0, max: 100, def: 50 },
            { id: 'p2', label: 'DECAY', min: 0, max: 100, def: 50 },
            { id: 'level', label: 'LEVEL', min: 0, max: 200, def: 100 }
        ],
        mt: [
            { id: 'p1', label: 'TUNE', min: 0, max: 100, def: 50 },
            { id: 'p2', label: 'DECAY', min: 0, max: 100, def: 50 },
            { id: 'level', label: 'LEVEL', min: 0, max: 200, def: 100 }
        ],
        ht: [
            { id: 'p1', label: 'TUNE', min: 0, max: 100, def: 50 },
            { id: 'p2', label: 'DECAY', min: 0, max: 100, def: 50 },
            { id: 'level', label: 'LEVEL', min: 0, max: 200, def: 100 }
        ],
        rs: [
            { id: 'level', label: 'LEVEL', min: 0, max: 200, def: 100 }
        ],
        cp: [
            { id: 'decay', label: 'DECAY', min: 0, max: 100, def: 50 },
            { id: 'level', label: 'LEVEL', min: 0, max: 200, def: 100 }
        ]
    },

    liveKnobs: {},  // TR909-style knobs

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

        // Build TR909-style live knobs for this drum
        this.buildLiveKnobs(trackId);

        // Load settings
        this.loadSettings(trackId);
    },

    buildLiveKnobs(trackId) {
        const container = document.getElementById('ds-live-knobs');
        if (!container) return;

        container.innerHTML = '';
        this.liveKnobs = {};

        const knobDefs = this.TR909_KNOBS[trackId] || [];
        if (knobDefs.length === 0) {
            container.innerHTML = '<span class="empty-msg">No 909 knobs for this drum</span>';
            return;
        }

        knobDefs.forEach(def => {
            const knobId = `ds_live_${def.id}`;
            const knob = new RotaryKnob(container, def.label, knobId, def.min, def.max, def.def, 1, 'small');
            this.liveKnobs[def.id] = knob;

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

        // Use live level knob for volume if available
        if (this.liveKnobs && this.liveKnobs.level) {
            params.vol = this.liveKnobs.level.value / 100;
        }

        // Ensure vol has a default
        if (params.vol === undefined) params.vol = 1;

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

        // Use TR909-style preview with live knobs
        this.previewWith909Knobs();
    },

    previewWith909Knobs() {
        if (!this.currentTrackId) return;

        // 1. Get current UI parameters
        const uiParams = this.collectParams();

        // 2. Get factory preset for architectural defaults (masterEnv, noise2, etc.)
        const factory = getFactoryPreset(this.currentTrackId);

        // 3. Merge: UI params over factory
        // We use JSON.parse(JSON.stringify) to ensure deep copy
        const preset = JSON.parse(JSON.stringify({ ...factory, ...uiParams }));

        // 4. Special architectural syncs
        // SD has noise2 (HPF path) which isn't in UI - sync it with noise1 (LPF path)
        if (factory.noise2) {
            preset.noise2 = JSON.parse(JSON.stringify(factory.noise2));
            preset.noise2.enabled = uiParams.noise.enabled;
            // Also sync some knobs if they match
            preset.noise2.decay = uiParams.noise.decay;
        }

        // 5. Collect live 909 knobs
        const P = {};
        Object.keys(this.liveKnobs).forEach(id => {
            P[id] = this.liveKnobs[id].value;
        });

        // 6. Apply 909 knob mappings (TUNE, DECAY, etc.) to the detailed preset
        this._applyKnobParams(preset, P, this.currentTrackId);

        console.log('DrumSynthUI: Preview', preset);
        this.synth.play(preset);
    },



    // Apply TR909 knob values to preset (mirrors DrumVoice._applyKnobParams)
    _applyKnobParams(preset, P, trackId) {
        // Handle Level knob if present
        if (P.level !== undefined) {
            preset.vol = P.level / 100;
        } else {
            preset.vol = P.vol !== undefined ? P.vol : 1;
        }

        const vol = preset.vol;

        switch (trackId) {
            case 'bd':
                if (P.p1 !== undefined) {
                    let pitchDecay;
                    if (P.p1 <= 40) {
                        pitchDecay = 0.005 + (P.p1 / 40) * 0.015;
                    } else {
                        pitchDecay = 0.02 + ((P.p1 - 40) / 60) * 0.150;
                    }
                    preset.osc1.p_decay = pitchDecay;
                }
                if (P.p2 !== undefined && preset.click) {
                    const clickLevel = (P.p2 / 100) * 0.4;
                    preset.click.level = clickLevel;
                    preset.click.noise_level = clickLevel * 0.2;
                }
                if (P.p3 !== undefined) {
                    preset.osc1.a_decay = 0.1 + (P.p3 / 100) * 0.8;
                }
                break;

            case 'sd':
                if (P.p1 !== undefined) {
                    const baseFreq = 180 + (P.p1 / 100) * 60;
                    preset.osc1.freq = baseFreq;
                    preset.osc1.startFreq = baseFreq * 1.5;
                    preset.osc2.freq = baseFreq * 1.62;
                    preset.osc2.startFreq = baseFreq * 1.62 * 1.5;
                }
                if (P.p2 !== undefined) {
                    if (preset.noise) preset.noise.cutoff = 4000 + (P.p2 / 100) * 4000;
                    if (preset.noise2) preset.noise2.cutoff = 1200 + (P.p2 / 100) * 2000;
                }
                if (P.p3 !== undefined) {
                    const snappyLevel = P.p3 / 100;
                    if (preset.noise) preset.noise.level = vol * snappyLevel * 1.5;
                    if (preset.noise2) preset.noise2.level = vol * snappyLevel * 1.0;
                }
                break;

            case 'lt': case 'mt': case 'ht':
                if (P.p1 !== undefined) {
                    const baseFreqs = { lt: [80, 120, 160], mt: [120, 180, 240], ht: [180, 270, 360] };
                    const freqs = baseFreqs[trackId];
                    const tuneOffset = (P.p1 / 100) * (freqs[0] * 0.5);
                    ['osc1', 'osc2', 'osc3'].forEach((osc, i) => {
                        if (preset[osc]) {
                            const targetFreq = freqs[i] + tuneOffset;
                            preset[osc].freq = targetFreq;
                            preset[osc].startFreq = targetFreq * 1.3;
                        }
                    });
                    if (preset.noise) {
                        preset.noise.cutoff = (freqs[2] + tuneOffset) * 2;
                    }
                }
                if (P.p2 !== undefined && preset.masterEnv) {
                    preset.masterEnv.decay = 0.1 + (P.p2 / 100) * 0.8;
                }
                break;

            case 'cp':
                if (P.decay !== undefined && preset.noise) {
                    preset.noise.decay = 0.2 + (P.decay / 100) * 0.6;
                }
                break;
        }
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
