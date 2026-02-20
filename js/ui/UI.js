import { RotaryKnob } from './RotaryKnob.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { Data } from '../data/Data.js';
import { Oscilloscope } from './Oscilloscope.js';
import { FileManager } from '../data/FileManager.js';
import { MidiManager } from '../midi/MidiManager.js';
import { DrumSynthUI } from './DrumSynthUI.js';

export const UI = {
    isInitialized: false,

    bindFastEvent(el, handler) {
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            el.classList.add('pressed');
            handler(e);

            const cleanup = () => {
                el.classList.remove('pressed');
                document.removeEventListener('pointerup', cleanup);
                document.removeEventListener('pointercancel', cleanup);
            };
            document.addEventListener('pointerup', cleanup);
            document.addEventListener('pointercancel', cleanup);
        });

        el.addEventListener('pointerleave', () => {
            el.classList.remove('pressed');
        });
    },

    svgIcon(id) {
        return `<span class="icon icon-${id}"></span>`;
    },

    init() {
        this.init303Knobs(1);
        this.init303Knobs(2);
        this.init303Piano(1);
        this.init303Piano(2);
        this.render303Grid(1);
        this.render303Grid(2);
        this.render909();

        // Initialize Oscilloscope
        Oscilloscope.init();

        const scopeContainer = document.getElementById('scopeContainer');
        if (scopeContainer) {
            scopeContainer.onclick = () => {
                Oscilloscope.toggle();
                scopeContainer.classList.toggle('disabled', !Oscilloscope.isEnabled);
            };
        }

        this.bindFastEvent(document.getElementById('playBtn'), () => AudioEngine.play());
        this.bindFastEvent(document.getElementById('stopBtn'), () => AudioEngine.stop());
        this.bindFastEvent(document.getElementById('randomBtn'), () => Data.randomize());

        // Mark UI as initialized
        this.isInitialized = true;

        // Execute any pending functions that were waiting for initialization
        if (this.pendingInitCallbacks) {
            this.pendingInitCallbacks.forEach(callback => {
                try {
                    callback();
                } catch (error) {
                    console.error("Error in pending init callback:", error);
                }
            });
            this.pendingInitCallbacks = [];
        }
        this.bindFastEvent(document.getElementById('clearBtn'), () => {
            if (Data.mode === 'song') {
                Data.clearSong();
            } else {
                const s1 = Data.getSequence('tb303_1');
                const s2 = Data.getSequence('tb303_2');
                const s9 = Data.getSequence('tr909');

                [s1, s2].forEach(seq => {
                    seq.forEach(s => {
                        s.active = false;
                        s.accent = false;
                        s.slide = false;
                        s.octave = 2;
                        s.note = 'C';
                    });
                });
                Object.keys(s9).forEach(k => s9[k].fill(0));
                this.renderAll();
            }
        });

        // Clear/Randomize all 909 tracks
        this.bindFastEvent(document.getElementById('clear909Btn'), () => {
            const s9 = Data.getSequence('tr909');
            if (!s9) return;

            const allEmpty = ['bd', 'sd', 'ch', 'oh', 'cp'].every(id =>
                s9[id].every(v => v === 0)
            );

            if (allEmpty) {
                // Randomize all tracks
                ['bd', 'sd', 'ch', 'oh', 'cp'].forEach(id => {
                    for (let i = 0; i < 16; i++) {
                        s9[id][i] = Math.random() > 0.7 ? 1 : 0;
                    }
                });
            } else {
                // Clear all tracks
                Object.keys(s9).forEach(k => s9[k].fill(0));
            }
            this.update909Grid();
            this.update909ClearButtons();
        });

        // Clear/Randomize TB-303 Unit 1
        this.bindFastEvent(document.getElementById('clear303_1'), () => {
            const s1 = Data.getSequence('tb303_1');
            if (!s1) return;

            const isEmpty = s1.every(step => !step.active);
            if (isEmpty) {
                // Randomize
                s1.forEach((step, i) => {
                    step.active = Math.random() > 0.3;
                    step.note = ['C', 'D#', 'F', 'F#', 'G', 'A#'][Math.floor(Math.random() * 6)];
                    step.octave = 1 + Math.floor(Math.random() * 2);
                    step.accent = Math.random() > 0.8;
                    step.slide = step.active && Math.random() > 0.8;
                });
            } else {
                // Clear
                s1.forEach(step => {
                    step.active = false;
                    step.accent = false;
                    step.slide = false;
                    step.octave = 2;
                    step.note = 'C';
                });
            }
            this.render303Grid(1);
            this.update303ClearButtons();
        });

        // Clear/Randomize TB-303 Unit 2
        this.bindFastEvent(document.getElementById('clear303_2'), () => {
            const s2 = Data.getSequence('tb303_2');
            if (!s2) return;

            const isEmpty = s2.every(step => !step.active);
            if (isEmpty) {
                // Randomize
                s2.forEach((step, i) => {
                    step.active = Math.random() > 0.3;
                    step.note = ['C', 'D#', 'F', 'F#', 'G', 'A#'][Math.floor(Math.random() * 6)];
                    step.octave = 2 + Math.floor(Math.random() * 2);
                    step.accent = Math.random() > 0.7;
                    step.slide = step.active && Math.random() > 0.75;
                });
            } else {
                // Clear
                s2.forEach(step => {
                    step.active = false;
                    step.accent = false;
                    step.slide = false;
                    step.octave = 2;
                    step.note = 'C';
                });
            }
            this.render303Grid(2);
            this.update303ClearButtons();
        });

        // Unit Locks
        this.bindFastEvent(document.getElementById('lock303_1'), () => {
            const isLocked = Data.toggleUnitLock('tb303_1');
            this.updateLockUI('tb303_1', isLocked);
        });
        this.bindFastEvent(document.getElementById('lock303_2'), () => {
            const isLocked = Data.toggleUnitLock('tb303_2');
            this.updateLockUI('tb303_2', isLocked);
        });
        this.bindFastEvent(document.getElementById('lock909'), () => {
            const isLocked = Data.toggleUnitLock('tr909');
            this.updateLockUI('tr909', isLocked);
        });

        // Tempo Knob - Initialize with default value, will update after data import
        new RotaryKnob(document.getElementById('tempo-knob-container'), null, 'tempo', 60, 200, 125, 1, 'large');

        // Initialize 7-Segment Display - 초기화
        this.initSevenSegment();
        this.updateSevenSegment(125);

        // Tempo 관련 UI 업데이트 함수 정의
        this.updateTempoUI = function () {
            if (window.knobInstances && window.knobInstances.tempo) {
                window.knobInstances.tempo.setValue(AudioEngine.tempo);
            }
            this.updateSevenSegment(AudioEngine.tempo);
        };

        // Listen for Tempo Knob changes via the hidden input
        document.getElementById('tempo-input').addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (AudioEngine.setTempo) {
                AudioEngine.setTempo(val);
            } else {
                AudioEngine.tempo = val;
            }
            this.updateSevenSegment(val);
        });
        document.getElementById('shareBtn').onclick = () => {
            const code = Data.exportState();
            const url = window.location.origin + window.location.pathname + "#" + code;
            navigator.clipboard.writeText(url).then(() => {
                this.showToast("Link copied! Share your beat.");
            });
        };

        document.getElementById('bmcBtn').onclick = () => {
            window.open('https://www.buymeacoffee.com/spectricki', '_blank');
        };

        // Swing/Shuffle Control
        const shuffleBtn = document.getElementById('shuffleBtn');
        const swingPanel = document.getElementById('swingPanel');
        const ribbonController = document.getElementById('ribbonController');
        const swingDot1 = document.getElementById('swingDot1');
        const swingDot2 = document.getElementById('swingDot2');
        const swingDisplay = document.getElementById('swingDisplay');

        let swingValue = 50; // Default 50%
        let activeHalf = null; // 'left' or 'right'

        // Toggle swing panel
        shuffleBtn.onclick = () => {
            swingPanel.classList.toggle('open');
        };

        // Ribbon controller drag logic
        let isDragging = false;

        const updateSwingVisual = () => {
            // Position formula: moving dots are positioned relative to fixed dots
            // Fixed dot 1 at 0%, Fixed dot 2 at 50%
            // Moving dot 1: 0% + (swing/100) * 50% = swing/2 %
            // Moving dot 2: 50% + (swing/100) * 50% = 50 + swing/2 %
            const pos1 = swingValue / 2;
            const pos2 = 50 + swingValue / 2;

            if (swingDot1) swingDot1.style.left = `${pos1}%`;
            if (swingDot2) swingDot2.style.left = `${pos2}%`;
            swingDisplay.textContent = swingValue;
        };

        const updateSwing = (clientX) => {
            const rect = ribbonController.getBoundingClientRect();
            const x = clientX - rect.left;
            const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

            if (activeHalf === 'left') {
                // Touch in left half (0-50%): swingDot1 should follow touch
                // swingDot1 position = swing/2, so swing = position * 2
                // Clamp position to 0-50 range, then calculate swing
                const clampedPercent = Math.max(0, Math.min(50, percent));
                swingValue = Math.round(clampedPercent * 2);
            } else {
                // Touch in right half (50-100%): swingDot2 should follow touch
                // swingDot2 position = 50 + swing/2, so swing = (position - 50) * 2
                // Clamp position to 50-100 range, then calculate swing
                const clampedPercent = Math.max(50, Math.min(100, percent));
                swingValue = Math.round((clampedPercent - 50) * 2);
            }

            updateSwingVisual();
            AudioEngine.setSwing(swingValue);
        };

        const startDrag = (clientX) => {
            const rect = ribbonController.getBoundingClientRect();
            const x = clientX - rect.left;
            const percent = (x / rect.width) * 100;
            activeHalf = percent < 50 ? 'left' : 'right';
            isDragging = true;
            updateSwing(clientX);
        };

        ribbonController.addEventListener('mousedown', (e) => {
            startDrag(e.clientX);
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                updateSwing(e.clientX);
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            activeHalf = null;
        });

        // Touch support - scoped listeners to avoid blocking Chrome touch emulation scrolling
        const onTouchMove = (e) => {
            if (isDragging) {
                updateSwing(e.touches[0].clientX);
            }
        };
        const onTouchEnd = () => {
            isDragging = false;
            activeHalf = null;
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        };

        ribbonController.addEventListener('touchstart', (e) => {
            startDrag(e.touches[0].clientX);
            e.preventDefault();
            // Only attach during active drag, and as passive (no preventDefault needed)
            document.addEventListener('touchmove', onTouchMove, { passive: true });
            document.addEventListener('touchend', onTouchEnd);
        });

        // Double-click/tap to reset to 50%
        ribbonController.addEventListener('dblclick', () => {
            swingValue = 50;
            updateSwingVisual();
            AudioEngine.setSwing(50);
        });

        // Double-tap support (for mobile)
        let lastTapTime = 0;
        ribbonController.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapGap = currentTime - lastTapTime;

            if (tapGap < 300 && tapGap > 0) {
                // Double tap detected
                swingValue = 50;
                updateSwingVisual();
                AudioEngine.setSwing(50);
                e.preventDefault();
            }

            lastTapTime = currentTime;
        });

        // Collapse/Expand functionality for machines (click on h2 title)
        document.querySelectorAll('.machine-header h2').forEach(title => {
            title.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const machine = title.closest('.machine');
                machine.classList.toggle('collapsed');
            });
        });

        if (window.location.hash && window.location.hash.length > 10) {
            Data.importState(window.location.hash.substring(1));
            this.update303ClearButtons();
            this.update909ClearButtons();
            // Import 후 tempo UI 업데이트
            this.updateTempoUI();
        } else {
            Data.init();
            Data.randomize();
            this.update303ClearButtons();
            this.update909ClearButtons();
        }

        this.initModeControls();
        this.renderModeControls();

        FileManager.init();
        // FileManager.init()에서 파일을 불러왔을 수 있으므로 tempo UI 업데이트
        this.updateTempoUI();
        this.initFileManager();
        MidiManager.init();
        this.initSettingsUI();
        this.updateMappedElementsUI(); // Initial update

        // Sync Lock UI
        this.updateLockUI('tb303_1', Data.unitLocks.tb303_1);
        this.updateLockUI('tb303_2', Data.unitLocks.tb303_2);
        this.updateLockUI('tr909', Data.unitLocks.tr909);

        // --- DrumSynth Editor ---
        DrumSynthUI.init();
    },

    updateMappedElementsUI() {
        // Remove all existing midi-mapped classes
        document.querySelectorAll('.midi-mapped').forEach(el => {
            el.classList.remove('midi-mapped');
        });

        // Get all current mappings
        const mappings = MidiManager.getMappingsList();

        // Add midi-mapped class to all mapped elements
        mappings.forEach(mapping => {
            const element = document.getElementById(mapping.targetId);
            if (element) {
                element.classList.add('midi-mapped');
            }
        });
    },

    updateLockUI(unitId, isLocked) {
        const btnId = unitId === 'tr909' ? 'lock909' : (unitId === 'tb303_1' ? 'lock303_1' : 'lock303_2');
        const btn = document.getElementById(btnId);
        if (!btn) return;

        const unlockedIcon = btn.querySelector('.icon-unlocked');
        const lockedIcon = btn.querySelector('.icon-locked');

        if (unlockedIcon) unlockedIcon.classList.toggle('hidden', isLocked);
        if (lockedIcon) lockedIcon.classList.toggle('hidden', !isLocked);
        btn.classList.toggle('locked', isLocked);
    },

    showToast(message) {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.innerText = message;
            toast.className = 'show';
            setTimeout(() => {
                toast.className = toast.className.replace('show', '');
            }, 3000);
        }
    },

    updateSwingUI() {
        const swingValue = AudioEngine.swing;
        const swingDot1 = document.getElementById('swingDot1');
        const swingDot2 = document.getElementById('swingDot2');
        const swingDisplay = document.getElementById('swingDisplay');

        if (swingDot1 && swingDot2 && swingDisplay) {
            const pos1 = swingValue / 2;
            const pos2 = 50 + swingValue / 2;

            swingDot1.style.left = `${pos1}%`;
            swingDot2.style.left = `${pos2}%`;
            swingDisplay.textContent = Math.round(swingValue);
        }
    },
    initModeControls() {
        // Mode Switch Listeners
        const pInput = document.getElementById('mode_pattern');
        const sInput = document.getElementById('mode_song');

        if (pInput) {
            pInput.onchange = () => {
                const wasSongMode = Data.mode === 'song';

                if (wasSongMode) {
                    if (AudioEngine.isPlaying && Data.song.length > 0) {
                        // If playing, select the currently playing pattern from the song
                        // Skip saving because current UI values reflect the song pattern, not the pattern mode selection
                        const currentSongPatId = Data.song[AudioEngine.currentSongIndex] || 0;
                        Data.selectPattern(currentSongPatId, true); // skipSave=true
                    } else {
                        // If stopped, restore the last pattern selected in Pattern Mode
                        // Skip saving because we're restoring the previous state
                        Data.selectPattern(Data.lastActivePatternId, true); // skipSave=true
                    }
                }

                Data.mode = 'pattern';

                this.updateModeSwitch();
                this.renderAll();
            };
        }

        if (sInput) {
            sInput.onchange = () => {
                Data.mode = 'song';
                this.updateModeSwitch();
                this.renderAll();
            };
        }

        // File Manager Button Listener
        const fileBtn = document.getElementById('fileManagerBtn');
        if (fileBtn) {
            fileBtn.onclick = () => {
                const overlay = document.getElementById('fileManagerOverlay');
                if (overlay.classList.contains('hidden')) {
                    this.renderFileList();
                    overlay.classList.remove('hidden');
                } else {
                    overlay.classList.add('hidden');
                }
            };
        }

        // --- Pattern Mode Controls Listeners ---
        const patContainer = document.getElementById('pattern-controls-container');
        if (patContainer) {
            // Pattern Select Buttons
            patContainer.querySelectorAll('.pat-btn').forEach(btn => {
                this.bindFastEvent(btn, () => {
                    const id = parseInt(btn.dataset.pattern);
                    Data.selectPattern(id);
                });
            });

            // Copy/Paste
            const copyBtn = document.getElementById('copyPatternBtn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    Data.copyPattern();
                    this.showToast("Pattern copied!");
                };
            }

            const pasteBtn = document.getElementById('pastePatternBtn');
            if (pasteBtn) {
                pasteBtn.onclick = () => {
                    Data.pastePattern();
                    this.showToast("Pattern pasted!");
                };
            }
        }

        // --- Song Mode Controls Listeners ---
        const songContainer = document.getElementById('song-controls-container');
        if (songContainer) {
            // Song Pattern Add Buttons
            songContainer.querySelectorAll('.song-pat-btn').forEach(btn => {
                this.bindFastEvent(btn, () => {
                    const id = parseInt(btn.dataset.pattern);
                    Data.selectPattern(id);
                    Data.addToSong(id);
                    this.renderModeControls(); // Update timeline
                });
            });
        }
    },

    renderModeControls() {
        // Update the checked state
        this.updateModeSwitch();

        const patContainer = document.getElementById('pattern-controls-container');
        const songContainer = document.getElementById('song-controls-container');

        if (Data.mode === 'pattern') {
            if (patContainer) patContainer.classList.remove('hidden');
            if (songContainer) songContainer.classList.add('hidden');
            this.updatePatternButtonsState();
        } else {
            if (patContainer) patContainer.classList.add('hidden');
            if (songContainer) songContainer.classList.remove('hidden');
            this.updateSongButtonsState();
            this.updateSongTimeline();
        }
    },

    updatePatternButtonsState() {
        const patContainer = document.getElementById('pattern-controls-container');
        if (!patContainer) return;

        patContainer.querySelectorAll('.pat-btn').forEach(btn => {
            const id = parseInt(btn.dataset.pattern);
            if (id === Data.currentPatternId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },

    updateSongButtonsState() {
        const songContainer = document.getElementById('song-controls-container');
        if (!songContainer) return;

        songContainer.querySelectorAll('.song-pat-btn').forEach(btn => {
            // In Song Mode, we don't show active state on buttons to avoid confusion
            // as the song plays through different patterns.
            btn.classList.remove('active');
        });
    },

    updateModeSwitch() {
        // Update radio button checked state without recreating elements
        const pInput = document.getElementById('mode_pattern');
        const sInput = document.getElementById('mode_song');
        if (pInput) pInput.checked = Data.mode === 'pattern';
        if (sInput) sInput.checked = Data.mode === 'song';
    },

    initFileManager() {
        // Event Listeners for File Manager
        const overlay = document.getElementById('fileManagerOverlay');

        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.classList.add('hidden');
            }
        };

        document.getElementById('fileCloseBtn').onclick = () => {
            overlay.classList.add('hidden');
        };

        document.getElementById('fileNewBtn').onclick = () => {
            if (confirm('Create new file? Unsaved changes will be lost.')) {
                FileManager.newFile();
                this.renderFileList();
                this.update303ClearButtons();
                this.update909ClearButtons();
                this.renderAll();
                this.showToast('New file created');
            }
        };

        document.getElementById('fileSaveBtn').onclick = () => {
            FileManager.save();
            this.renderFileList();
            this.showToast('File saved');
        };

        document.getElementById('fileDeleteAllBtn').onclick = () => {
            if (FileManager.deleteAll()) {
                this.renderFileList();
                this.update303ClearButtons();
                this.update909ClearButtons();
                this.renderAll();
                this.showToast('All files deleted');
            }
        };

        document.getElementById('fileExportBtn').onclick = () => {
            FileManager.exportAll();
        };

        const importInput = document.getElementById('fileImportInput');
        document.getElementById('fileImportBtn').onclick = () => {
            importInput.click();
        };

        importInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (FileManager.importAll(e.target.result)) {
                        this.renderFileList();
                        this.showToast('Files imported');
                    } else {
                        alert('Import failed. Invalid file format.');
                    }
                };
                reader.readAsText(file);
            }
            importInput.value = '';
        };


    },

    initSettingsUI() {
        const overlay = document.getElementById('settingsOverlay');
        const btn = document.getElementById('settingsBtn');
        const closeBtn = document.getElementById('settingsCloseBtn');
        const refreshBtn = document.getElementById('midiRefreshBtn');
        const clearBtn = document.getElementById('midiClearAllBtn');
        const tabBtns = document.querySelectorAll('.settings-tab-btn');
        const tabContents = document.querySelectorAll('.settings-tab-content');

        btn.onclick = () => {
            overlay.classList.remove('hidden');
            this.renderMidiMappings();
            this.renderMidiDevices();
            // Sync checkbox with current setting
            const keepSoundCheckbox = document.getElementById('keepSoundSettingsCheckbox');
            if (keepSoundCheckbox) {
                keepSoundCheckbox.checked = Data.keepSoundSettings;
            }
        };

        // Keep Sound Settings checkbox
        const keepSoundCheckbox = document.getElementById('keepSoundSettingsCheckbox');
        if (keepSoundCheckbox) {
            keepSoundCheckbox.onchange = () => {
                Data.keepSoundSettings = keepSoundCheckbox.checked;
                Data.saveSettings();
                this.showToast(keepSoundCheckbox.checked ?
                    'Sound settings will stay when changing patterns' :
                    'Each pattern will have its own sound settings');
            };
        }

        const closeSettings = () => {
            overlay.classList.add('hidden');
            MidiManager.disableLearnMode();
            document.body.classList.remove('midi-learn-active');
        };

        closeBtn.onclick = closeSettings;

        overlay.onclick = (e) => {
            if (e.target === overlay) closeSettings();
        };

        // Tab Switching
        tabBtns.forEach(tabBtn => {
            tabBtn.onclick = () => {
                // Deactivate all
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => {
                    c.classList.remove('active');
                    c.classList.add('hidden');
                });

                // Activate clicked
                tabBtn.classList.add('active');
                const tabId = tabBtn.dataset.tab;
                const content = document.getElementById(`tab-${tabId}`);
                content.classList.add('active');
                content.classList.remove('hidden');
            };
        });

        refreshBtn.onclick = () => {
            MidiManager.refreshDevices();
        };

        clearBtn.onclick = () => {
            if (confirm('Clear all MIDI mappings?')) {
                MidiManager.clearAllMappings();
                this.renderMidiMappings();
                this.showToast('All MIDI mappings cleared');
            }
        };

        // Keyboard Listener for MIDI Mapping
        document.addEventListener('keydown', (e) => {
            // Only process if Learn Mode is active OR mapped
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (MidiManager.isLearning && MidiManager.learningTarget) {
                if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
                MidiManager.handleKeyboardInput(e.keyCode, 'keydown');
            } else {
                MidiManager.handleKeyboardInput(e.keyCode, 'keydown');
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            MidiManager.handleKeyboardInput(e.keyCode, 'keyup');
        });

        // Global click handler for Learn Mode
        document.addEventListener('click', (e) => {
            // Check if we are in "Selection Mode" (body has class)
            if (!document.body.classList.contains('midi-learn-active')) return;

            // If overlay is open, don't intercept
            if (!overlay.classList.contains('hidden')) return;

            // Find valid target by data-midi-mappable attribute
            const target = e.target.closest('[data-midi-mappable]');

            if (target) {
                e.preventDefault();
                e.stopPropagation();

                const type = target.getAttribute('data-midi-mappable');
                const id = target.id;

                if (id) {
                    MidiManager.enableLearnMode(id, type);
                } else {
                    this.showToast('This control cannot be mapped (No ID)');
                }
            }
        }, true);

        // Exit Learn Mode Banner Button
        const exitLearnModeBtn = document.getElementById('exitLearnModeBtn');
        if (exitLearnModeBtn) {
            exitLearnModeBtn.onclick = () => {
                document.body.classList.remove('midi-learn-active');
                MidiManager.disableLearnMode();
                this.hideLearnModeBanner();
            };
        }
    },

    renderMidiDevices() {
        const list = document.getElementById('midiDeviceList');
        if (!list) return;

        list.innerHTML = '';
        const devices = MidiManager.getDevicesList();

        if (devices.length === 0) {
            const empty = document.createElement('div');
            empty.style.padding = '15px';
            empty.style.textAlign = 'center';
            empty.style.color = '#666';
            empty.style.fontStyle = 'italic';
            empty.innerText = 'No MIDI devices found.';
            list.appendChild(empty);
            return;
        }

        devices.forEach(device => {
            const item = document.createElement('div');
            item.className = 'midi-device-item';

            const info = document.createElement('div');
            info.className = 'midi-device-info';

            const name = document.createElement('div');
            name.className = 'midi-device-name';
            name.innerText = device.name || 'Unknown Device';

            const meta = document.createElement('div');
            meta.className = 'midi-device-meta';
            meta.innerText = `${device.manufacturer || 'Generic'} | ${device.state}`;

            info.appendChild(name);
            info.appendChild(meta);

            const status = document.createElement('div');
            status.className = `midi-device-status ${device.state}`;
            status.title = device.state;

            item.appendChild(info);
            item.appendChild(status);
            list.appendChild(item);
        });
    },

    renderMidiMappings() {
        this.updateMappedElementsUI(); // Update visual indicators
        const list = document.getElementById('midiMappingList');
        list.innerHTML = '';
        const mappings = MidiManager.getMappingsList();

        // Learn Button
        const learnBtn = document.createElement('button');
        learnBtn.className = 'file-action-btn';
        learnBtn.style.width = '100%';
        learnBtn.style.marginBottom = '15px';
        learnBtn.style.justifyContent = 'center';
        learnBtn.style.background = MidiManager.isLearning ? '#ff3333' : 'linear-gradient(to bottom, #444, #333)';
        learnBtn.innerText = document.body.classList.contains('midi-learn-active') ? 'Exit Learn Mode' : 'Start MIDI Learn';

        learnBtn.onclick = () => {
            const overlay = document.getElementById('settingsOverlay');
            if (document.body.classList.contains('midi-learn-active')) {
                document.body.classList.remove('midi-learn-active');
                MidiManager.disableLearnMode();
                this.hideLearnModeBanner();
                learnBtn.innerText = 'Start MIDI Learn';
            } else {
                overlay.classList.add('hidden');
                document.body.classList.add('midi-learn-active');
                this.showLearnModeBanner();
                this.showToast('Select a control to map...');
            }
        };
        list.appendChild(learnBtn);

        if (mappings.length === 0) {
            const empty = document.createElement('div');
            empty.style.padding = '20px';
            empty.style.textAlign = 'center';
            empty.style.color = '#666';
            empty.style.fontStyle = 'italic';
            empty.innerText = 'No MIDI mappings.';
            list.appendChild(empty);
            return;
        }

        mappings.forEach(m => {
            const item = document.createElement('div');
            item.className = 'midi-mapping-item';

            const info = document.createElement('div');
            info.className = 'midi-mapping-info';

            const target = document.createElement('div');
            target.className = 'midi-mapping-target';
            target.innerText = m.targetId;

            const source = document.createElement('div');
            source.className = 'midi-mapping-source';

            // Display format depends on source type
            if (m.source === 'midi') {
                source.innerText = `MIDI Ch ${m.channel + 1} | ${m.messageType.toUpperCase()} ${m.data1}`;
            } else if (m.source === 'keyboard') {
                source.innerText = `Keyboard | Key ${m.keyCode} (${m.eventType})`;
            } else {
                // Future: OSC, gamepad, etc.
                source.innerText = `${m.source.toUpperCase()} | ${m.key}`;
            }

            info.appendChild(target);
            info.appendChild(source);

            const delBtn = document.createElement('button');
            delBtn.className = 'midi-delete-btn';
            delBtn.innerHTML = '×';
            delBtn.title = 'Remove Mapping';
            delBtn.onclick = () => {
                MidiManager.removeMapping(m.key);
                this.renderMidiMappings();
            };

            item.appendChild(info);
            item.appendChild(delBtn);
            list.appendChild(item);
        });
    },

    showLearnModeBanner() {
        const banner = document.getElementById('learnModeExitBanner');
        if (banner) {
            banner.classList.remove('hidden');
        }
    },

    hideLearnModeBanner() {
        const banner = document.getElementById('learnModeExitBanner');
        if (banner) {
            banner.classList.add('hidden');
        }
    },

    updateLearnModeUI(active) {
        // This is called by MidiManager when learn mode state changes
        // We don't need to do anything here anymore since we use the banner
    },

    renderFileList() {
        const list = document.getElementById('fileList');
        list.innerHTML = '';
        const files = FileManager.getFileList();

        if (files.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-msg';
            emptyMsg.innerText = 'No saved files';
            list.appendChild(emptyMsg);
            return;
        }

        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            if (file.id === FileManager.currentFileId) {
                item.classList.add('active');
            }

            const info = document.createElement('div');
            info.className = 'file-info';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'file-name';
            nameDiv.innerText = file.name;

            const dateDiv = document.createElement('div');
            dateDiv.className = 'file-date';
            dateDiv.innerText = new Date(file.modified).toLocaleString();

            info.appendChild(nameDiv);
            info.appendChild(dateDiv);

            // Button container
            const btnContainer = document.createElement('div');
            btnContainer.className = 'file-item-actions';

            // Duplicate button
            const duplicateBtn = document.createElement('button');
            duplicateBtn.className = 'file-action-icon-btn';
            duplicateBtn.title = 'Duplicate';
            duplicateBtn.setAttribute('aria-label', 'Duplicate File');
            duplicateBtn.innerHTML = this.svgIcon('copy');
            duplicateBtn.onclick = (e) => {
                e.stopPropagation();
                FileManager.duplicateFile(file.id);
                this.renderFileList();
                this.showToast('File duplicated');
            };

            // Rename button
            const renameBtn = document.createElement('button');
            renameBtn.className = 'file-action-icon-btn';
            renameBtn.title = 'Rename';
            renameBtn.setAttribute('aria-label', 'Rename File');
            renameBtn.innerHTML = this.svgIcon('edit');
            renameBtn.onclick = (e) => {
                e.stopPropagation();
                const newName = prompt('Enter new name:', file.name);
                if (newName) {
                    FileManager.renameFile(file.id, newName);
                    this.renderFileList();
                }
            };

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'file-action-icon-btn file-delete-icon-btn';
            deleteBtn.title = 'Delete';
            deleteBtn.setAttribute('aria-label', 'Delete File');
            deleteBtn.innerHTML = this.svgIcon('trash');
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                FileManager.deleteFile(file.id);
                this.renderFileList();
                this.update303ClearButtons();
                this.update909ClearButtons();
                this.renderAll();
                this.showToast('File deleted');
            };

            btnContainer.appendChild(duplicateBtn);
            btnContainer.appendChild(renameBtn);
            btnContainer.appendChild(deleteBtn);

            item.appendChild(info);
            item.appendChild(btnContainer);

            item.onclick = () => {
                if (file.id !== FileManager.currentFileId) {
                    if (FileManager.loadFile(file.id)) {
                        this.renderFileList();
                        this.update303ClearButtons();
                        this.update909ClearButtons();
                        this.renderAll();
                        // Import 후 tempo UI 업데이트
                        this.updateTempoUI();
                        this.showToast('File loaded');
                    }
                }
            };

            list.appendChild(item);
        });
    },

    updateSongTimeline() {
        // Called from AudioEngine or Data
        const timeline = document.getElementById('song-timeline');
        if (timeline) this.updateSongTimelineDOM(timeline);
    },

    updateSongTimelineDOM(container) {
        container.innerHTML = '';

        if (Data.song.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'song-empty-msg';
            emptyMsg.innerText = 'Click pattern buttons above to build your song...';
            container.appendChild(emptyMsg);
            return;
        }

        Data.song.forEach((patId, idx) => {
            const block = document.createElement('div');
            block.className = 'song-block';
            block.innerText = `P${patId + 1}`;
            block.dataset.index = idx;
            block.title = 'Click to remove, Drag to reorder';
            block.style.cursor = 'pointer';
            block.style.touchAction = 'none'; // Prevent scrolling while dragging

            // Highlight current playing block
            if (AudioEngine.isPlaying && AudioEngine.currentSongIndex === idx) {
                block.classList.add('playing');
            }

            // Drag and Drop Logic
            let startX = 0;
            let startY = 0;
            let isDragging = false;
            let ghost = null;
            const dragIndex = idx;

            const onStart = (e) => {
                const point = e.touches ? e.touches[0] : e;
                startX = point.clientX;
                startY = point.clientY;
                isDragging = false;

                // Bind window events
                window.addEventListener('mousemove', onMove, { passive: false });
                window.addEventListener('touchmove', onMove, { passive: false });
                window.addEventListener('mouseup', onEnd);
                window.addEventListener('touchend', onEnd);
            };

            const onMove = (e) => {
                const point = e.touches ? e.touches[0] : e;
                const dx = point.clientX - startX;
                const dy = point.clientY - startY;

                if (!isDragging) {
                    // Threshold check
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                        isDragging = true;

                        // Create Ghost
                        ghost = block.cloneNode(true);
                        ghost.style.position = 'fixed';
                        ghost.style.zIndex = '9999';
                        ghost.style.opacity = '0.9';
                        ghost.style.pointerEvents = 'none';
                        ghost.style.width = block.offsetWidth + 'px';
                        ghost.style.height = block.offsetHeight + 'px';
                        ghost.style.transform = 'scale(1.1)';
                        ghost.style.boxShadow = '0 5px 15px rgba(0,0,0,0.5)';
                        document.body.appendChild(ghost);

                        block.style.opacity = '0.2';
                    }
                }

                if (isDragging && ghost) {
                    if (e.cancelable) e.preventDefault(); // Prevent scroll
                    ghost.style.left = (point.clientX - ghost.offsetWidth / 2) + 'px';
                    ghost.style.top = (point.clientY - ghost.offsetHeight / 2) + 'px';
                }
            };

            const onEnd = (e) => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('touchmove', onMove);
                window.removeEventListener('mouseup', onEnd);
                window.removeEventListener('touchend', onEnd);

                if (isDragging) {
                    // Cleanup ghost
                    if (ghost) ghost.remove();
                    block.style.opacity = '1';

                    // Find drop target
                    const point = e.changedTouches ? e.changedTouches[0] : e;
                    const elemBelow = document.elementFromPoint(point.clientX, point.clientY);
                    const targetBlock = elemBelow ? elemBelow.closest('.song-block') : null;

                    if (targetBlock && targetBlock !== block) {
                        const targetIndex = parseInt(targetBlock.dataset.index);
                        const item = Data.song[dragIndex];

                        // Remove current
                        Data.song.splice(dragIndex, 1);
                        // Insert at new (adjusting for removal if target is after)
                        // Actually splice(dragIndex, 1) shifts indices.
                        // If dragIndex < targetIndex, targetIndex decreases by 1
                        // But targetBlock.dataset.index has the OLD index.
                        // So if we are moving from 0 to 2:
                        // [A, B, C] -> remove A -> [B, C]. Insert at 2? -> [B, C, A]. Correct.
                        // If we are moving from 2 to 0:
                        // [A, B, C] -> remove C -> [A, B]. Insert at 0 -> [C, A, B]. Correct.

                        // We must be careful about "insert after" vs "insert before".
                        // Simply inserting at the target index usually works as a "swap" or "place before".
                        // To be precise: "Place before target".
                        // If I drop on B (index 1), I want to be at index 1.
                        // [A, B, C] -> drag A -> drop on B.
                        // remove A (idx 0). List [B, C]. Drop at idx 1 (B's old idx). -> [B, A, C].
                        // Wait, A was 0. B is 1. OLD indices.
                        // remove 0. [B, C]. insert at 1? -> B is at 0 now. C is 1.
                        // inserting at 1 -> [B, A, C]. So A moved after B.
                        // User expectation might be 'insert before B'.
                        // If I want [A, B, C] -> drop C on A -> [C, A, B].
                        // C (2), A (0). remove 2 -> [A, B]. insert at 0 -> [C, A, B].

                        // Let's refine:
                        // We remove the item first.
                        // Then we insert at `targetIndex`.
                        // BUT if `dragIndex < targetIndex`, the removal shifted the indices of items after `dragIndex` down by 1.
                        // So `targetIndex` (which is the OLD index from dataset) is now actually `targetIndex - 1` in the new array.
                        // So we should insert at `targetIndex - 1`.
                        // IF `dragIndex > targetIndex`, indices before `dragIndex` are unaffected. So `targetIndex` is valid.

                        let insertIndex = targetIndex;
                        // Logic check:
                        // [0:A, 1:B, 2:C]
                        // Drag A(0) to B(1).
                        // targetIndex = 1. dragIndex = 0.
                        // Remove A -> [B, C].
                        // If(0 < 1) insertIndex = 1 - 0 = 1? No.. ?
                        // Visual drop on B means "Put me where B is". -> [A, B, C] (No change? or swap?)
                        // If I drag A slightly past B, I hit B.
                        // Usually DnD means "insert before".
                        // If I drop on B, I want to be before B.
                        // [A, B, C] -> drop A on B. -> [A, B, C].
                        // [A, B, C] -> drop C on B. -> [A, C, B].
                        // remove C(2). [A, B]. target B(1). insert at 1. [A, C, B]. Correct.

                        // So the rule "Insert at targetIndex" works IF target is NOT shifted.
                        // If `dragIndex < targetIndex`:
                        // [A, B, C]. Drag A(0) drop on C(2).
                        // remove A -> [B, C].
                        // target C was 2. But now C is at index 1.
                        // If we insert at 2: [B, C, A]. A became last.
                        // Goal: [B, A, C]? Drop on C means before C?
                        // If drop on C means before C, result should be [B, A, C].
                        // current array [B, C]. C is at index 1.
                        // We want insert at index 1.
                        // targetIndex was 2.
                        // So `insertIndex = targetIndex - 1`.

                        if (dragIndex < targetIndex) {
                            insertIndex = targetIndex; // If we drop "on" it, maybe insert *after* it if dragging forward?
                            // Standard behavior: dropping "past" the center usually determines.
                            // But here we just get the element.
                            // Let's stick to "Insert Before".
                            insertIndex = targetIndex - 1;
                            // Wait, if I drop A(0) on B(1).
                            // Remove A. [B, C].
                            // targetIndex=1. insertIndex=0.
                            // Result [A, B, C]. No change.

                            // To move A after B, I must drop on C?
                            // This is the limitation of "ElementFromPoint" without coordinate logic.

                            // Let's improve: Calculate if mouse is on left or right half of target.
                            const rect = targetBlock.getBoundingClientRect();
                            const relX = point.clientX - rect.left;
                            if (relX > rect.width / 2) {
                                // Right side: Insert After
                                // If A(0) -> B(1) right side.
                                // Remove A. [B, C].
                                // targetIndex=1. Insert after -> index 1 (since B is at 0) + 1 = 2?
                                // No, B is at 0. Insert at 1. -> [B, A, C].

                                // DragIndex(0) < TargetIndex(1).
                                // Remove 0. Array shifted.
                                // Target(1) is now at 0.
                                // Insert After (index 0 + 1) = 1.
                                // [B, A, C].

                                insertIndex = targetIndex; // Effectively targetIndex because of shift -1 and +1 (after)
                            } else {
                                // Left side: Insert Before
                                // If A(0) -> B(1) left side.
                                // Remove 0. [B, C].
                                // Target(1) is at 0.
                                // Insert at 0. -> [A, B, C].
                                insertIndex = targetIndex - 1;
                            }
                        } else {
                            // DragIndex(2) > TargetIndex(1). C -> B.
                            // Remove C(2). [A, B].
                            // Target B(1) is still at 1.

                            // Check side
                            const rect = targetBlock.getBoundingClientRect();
                            const relX = point.clientX - rect.left;
                            if (relX > rect.width / 2) {
                                // Insert After B.
                                // Insert at 1 + 1 = 2.
                                // [A, B, C].
                                insertIndex = targetIndex + 1;
                            } else {
                                // Insert Before B.
                                // Insert at 1.
                                // [A, C, B].
                                insertIndex = targetIndex;
                            }
                        }

                        // Safety clamp
                        if (insertIndex < 0) insertIndex = 0;
                        if (insertIndex > Data.song.length) insertIndex = Data.song.length;

                        Data.song.splice(insertIndex, 0, item);
                        this.renderModeControls();
                    } else {
                        // Dropped on self or nothing -> Rerender to restore opacity
                        this.renderModeControls();
                    }
                }
            };

            // Use onclick for deletion to avoid conflict with drag logic
            block.onclick = () => {
                if (!isDragging) {
                    Data.song.splice(idx, 1);
                    this.renderModeControls();
                }
            };

            block.addEventListener('mousedown', onStart);
            block.addEventListener('touchstart', onStart, { passive: false });

            container.appendChild(block);
        });
    },

    initSevenSegment() {
        ['digit-100', 'digit-10', 'digit-1'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = '';
            ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach(seg => {
                const s = document.createElement('div');
                s.className = `segment ${seg}`;
                el.appendChild(s);
            });
        });
    },

    updateSevenSegment(val) {
        const s = val.toString().padStart(3, '0');
        const map = {
            '0': ['a', 'b', 'c', 'd', 'e', 'f'],
            '1': ['b', 'c'],
            '2': ['a', 'b', 'd', 'e', 'g'],
            '3': ['a', 'b', 'c', 'd', 'g'],
            '4': ['b', 'c', 'f', 'g'],
            '5': ['a', 'c', 'd', 'f', 'g'],
            '6': ['a', 'c', 'd', 'e', 'f', 'g'],
            '7': ['a', 'b', 'c'],
            '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
            '9': ['a', 'b', 'c', 'd', 'f', 'g']
        };

        const updateDigit = (id, char) => {
            const el = document.getElementById(id);
            if (!el) return;
            const activeSegs = map[char] || [];
            Array.from(el.children).forEach(seg => {
                const segClass = seg.className.split(' ')[1]; // 'a', 'b', etc.
                if (activeSegs.includes(segClass)) seg.classList.add('on');
                else seg.classList.remove('on');
            });
        };

        updateDigit('digit-100', s[0]);
        updateDigit('digit-10', s[1]);
        updateDigit('digit-1', s[2]);
    },

    // Expose voice method for preview logic in UI
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

    get303Params(unitId) {
        const getV = (id) => {
            const inputId = id + '-input';
            const el = document.getElementById(inputId);
            const value = el ? parseFloat(el.value) : 0;
            return isNaN(value) ? 0 : value;
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
            vol: getV(`vol303_${unitId}`) / 100,
            delayTime: getV(`delayTime303_${unitId}`),
            delayFeedback: getV(`delayFb303_${unitId}`),
            delayWet: getV(`delayWet303_${unitId}`)
        };
    },

    get909Params(track) {
        const getV = (id) => {
            const inputId = id + '-input';
            const el = document.getElementById(inputId);
            const value = el ? parseFloat(el.value) : 0;
            return isNaN(value) ? 0 : value;
        };
        const lvl = (id) => getV(id) / 100;

        let params = {};
        if (track === 'bd') params = { p1: getV('bd_p1'), vol: lvl('bd_level'), p2: getV('bd_p2'), p3: getV('bd_p3') };
        else if (track === 'sd') params = { p1: getV('sd_p1'), vol: lvl('sd_level'), p2: getV('sd_p2'), p3: getV('sd_p3') };
        else if (track === 'lt') params = { p1: getV('lt_p1'), vol: lvl('lt_level'), p2: getV('lt_p2') };
        else if (track === 'mt') params = { p1: getV('mt_p1'), vol: lvl('mt_level'), p2: getV('mt_p2') };
        else if (track === 'ht') params = { p1: getV('ht_p1'), vol: lvl('ht_level'), p2: getV('ht_p2') };
        else if (track === 'rs') params = { vol: lvl('rs_level') };
        else if (track === 'cp') params = { vol: lvl('cp_level'), decay: getV('cp_decay') };
        else if (track === 'ch') params = { vol: lvl('ch_level'), ch_decay: getV('ch_decay'), p2: getV('ch_tune') };
        else if (track === 'oh') params = { vol: lvl('oh_level'), oh_decay: getV('oh_decay'), p2: getV('oh_tune') };
        else if (track === 'cr') params = { vol: lvl('cr_level'), cr_tune: getV('cr_tune') };
        else if (track === 'rd') params = { vol: lvl('rd_level'), rd_tune: getV('rd_tune') };

        // Attach custom synth if present in Data
        const tr909Settings = Data.getUnitSettings('tr909');
        if (tr909Settings && tr909Settings[track] && tr909Settings[track].customSynth) {
            params.customSynth = tr909Settings[track].customSynth;
        }

        return params;
    },

    getParams(id) {
        if (id === 'tb303_1') return this.get303Params(1);
        if (id === 'tb303_2') return this.get303Params(2);
        if (id === 'tr909') {
            return {
                bd: this.get909Params('bd'),
                sd: this.get909Params('sd'),
                lt: this.get909Params('lt'),
                mt: this.get909Params('mt'),
                ht: this.get909Params('ht'),
                rs: this.get909Params('rs'),
                cp: this.get909Params('cp'),
                ch: this.get909Params('ch'),
                oh: this.get909Params('oh'),
                cr: this.get909Params('cr'),
                rd: this.get909Params('rd')
            };
        }
        return null;
    },

    renderAll() {
        this.render303Grid(1);
        this.render303Grid(2);
        this.render909();
        this.renderModeControls(); // Refresh mode controls (buttons, timeline)
    },

    init303Piano(unitId) {
        const toggleBtn = document.getElementById(`pianoToggle303_${unitId}`);
        const sequencer = document.getElementById(`grid303_${unitId}`);
        const noteEditor = document.getElementById(`noteEditor303_${unitId}`);
        const prevBtn = noteEditor.querySelector('.prev-btn');
        const nextBtn = noteEditor.querySelector('.next-btn');
        const stepInd = noteEditor.querySelector('.step-indicator');
        const previewBtn = noteEditor.querySelector('.preview-toggle-btn');
        const restBtn = noteEditor.querySelector('.rest-btn');
        const octBtns = noteEditor.querySelectorAll('.octave-btn');
        const modBtns = noteEditor.querySelectorAll('.mod-btn');
        const pianoKeysWrapper = document.getElementById(`pianoKeys303_${unitId}`);

        let currentStepIndex = 0;
        let previewEnabled = true;

        const updateEditorState = () => {
            const seq = Data.getSequence(`tb303_${unitId}`);
            if (!seq || seq.length === 0) return;
            const step = seq[currentStepIndex];

            stepInd.innerText = (currentStepIndex + 1).toString().padStart(2, '0');

            // Update Control Buttons UI
            octBtns.forEach(b => {
                const bVal = parseInt(b.dataset.val);
                b.classList.toggle('active', step.octave === bVal);
            });
            modBtns.forEach(b => {
                if (b.classList.contains('accent-btn')) {
                    b.classList.toggle('active', step.accent);
                } else if (b.classList.contains('slide-btn')) {
                    b.classList.toggle('active', step.slide);
                }
            });
            restBtn.classList.toggle('active', !step.active);

            // Update Piano Keys UI
            const allKeys = pianoKeysWrapper.querySelectorAll('.piano-key');
            allKeys.forEach(k => {
                const isNoteMatch = k.dataset.note === step.note;
                const isOctMatch = parseInt(k.dataset.oct) === step.octave;
                k.classList.toggle('active', isNoteMatch && isOctMatch && step.active);
            });

            // Re-render sequence grid immediately
            this.render303Grid(unitId);
        };

        const goNext = () => {
            currentStepIndex = (currentStepIndex + 1) % 16;
            updateEditorState();
        };

        const goPrev = () => {
            currentStepIndex = (currentStepIndex - 1 + 16) % 16;
            updateEditorState();
        };

        const playPreview = async (step) => {
            if (!previewEnabled) return;
            if (!AudioEngine.ctx) await AudioEngine.init();
            if (AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') await AudioEngine.ctx.resume();

            if (!AudioEngine.ctx) return;

            const instId = `tb303_${unitId}`;
            const params = this.getParams(instId);
            AudioEngine.voice303(AudioEngine.ctx.currentTime, step, params, unitId);
        };

        // Pointerdown for fast interactions (连打 / Mash mapping)
        const bindFastEvent = (el, handler) => {
            el.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                handler(e);
            });
        };

        bindFastEvent(toggleBtn, () => {
            const isEditing = !noteEditor.classList.contains('hidden');
            if (isEditing) {
                noteEditor.classList.add('hidden');
                sequencer.classList.remove('hidden');
            } else {
                noteEditor.classList.remove('hidden');
                sequencer.classList.add('hidden');
                updateEditorState();
            }

            // Toggle icon visual
            const iconSpan = toggleBtn.querySelector('.icon');
            if (isEditing) {
                // Switching back to Sequencer mode (so show Piano icon for access)
                iconSpan.classList.remove('icon-step');
                iconSpan.classList.add('icon-piano');
            } else {
                // Switching to Piano mode (so show Step icon to go back)
                iconSpan.classList.remove('icon-piano');
                iconSpan.classList.add('icon-step');
                updateEditorState();
            }
        });

        bindFastEvent(prevBtn, goPrev);
        bindFastEvent(nextBtn, goNext);

        bindFastEvent(previewBtn, () => {
            previewEnabled = !previewEnabled;
            previewBtn.classList.toggle('active', previewEnabled);
        });

        bindFastEvent(restBtn, () => {
            const seq = Data.getSequence(`tb303_${unitId}`);
            seq[currentStepIndex].active = false;
            goNext();
        });

        octBtns.forEach(btn => {
            bindFastEvent(btn, () => {
                const seq = Data.getSequence(`tb303_${unitId}`);
                const targetOct = parseInt(btn.dataset.val);
                // Toggle target -> normal(2)
                seq[currentStepIndex].octave = seq[currentStepIndex].octave === targetOct ? 2 : targetOct;
                updateEditorState();
            });
        });

        modBtns.forEach(btn => {
            bindFastEvent(btn, () => {
                const seq = Data.getSequence(`tb303_${unitId}`);
                const isAcc = btn.classList.contains('accent-btn');
                if (isAcc) {
                    seq[currentStepIndex].accent = !seq[currentStepIndex].accent;
                } else {
                    seq[currentStepIndex].slide = !seq[currentStepIndex].slide;
                }
                updateEditorState();
            });
        });

        // Initialize Piano Keys
        const keys = [
            { n: 'C', type: 'white' }, { n: 'C#', type: 'black' },
            { n: 'D', type: 'white' }, { n: 'D#', type: 'black' },
            { n: 'E', type: 'white' }, { n: 'F', type: 'white' },
            { n: 'F#', type: 'black' }, { n: 'G', type: 'white' },
            { n: 'G#', type: 'black' }, { n: 'A', type: 'white' },
            { n: 'A#', type: 'black' }, { n: 'B', type: 'white' }
        ];

        // For responsiveness, render 3 octaves but CSS hides the overflow on mobile, or we render 3 octaves tightly.
        // Actually, CSS width percentage is best if we assume 3 octaves = 36 keys.
        // Wait, the user said 1 octave on mobile portrait, 3 octaves on landscape.
        // If we generate 3 octaves (36 keys) and use min-width / flex to show horizontal scroll, or just change width%.
        // Let's generate 3 octaves.
        const totalOctaves = 3;
        const totalWhiteKeys = 7 * totalOctaves;
        let whiteIndex = 0;

        for (let oct = 1; oct <= totalOctaves; oct++) {
            keys.forEach(k => {
                const div = document.createElement('div');
                div.className = `piano-key ${k.type}`;
                div.dataset.note = k.n;
                div.dataset.oct = oct;

                if (k.type === 'white') {
                    div.style.setProperty('--white-index', whiteIndex);
                    whiteIndex++;
                } else {
                    // Position black keys based on the previous white key index
                    div.style.setProperty('--white-index', whiteIndex);
                }

                bindFastEvent(div, () => {
                    const seq = Data.getSequence(`tb303_${unitId}`);
                    const step = seq[currentStepIndex];
                    step.note = k.n;
                    step.active = true;
                    // If desktop (3 octaves clicked), override tb303 octave setting
                    const octaveGroup = noteEditor.querySelector('.octave-selector-group');
                    const is3OctaveMode = octaveGroup && getComputedStyle(octaveGroup).display === 'none';
                    if (is3OctaveMode) {
                        step.octave = oct; // 1 = Dn, 2 = Normal, 3 = Up
                    }

                    if (previewEnabled) playPreview(step);
                    goNext();
                });

                pianoKeysWrapper.appendChild(div);
            });
        }

        // Save the external setStep function for Note Editor
        this[`openNoteEditor303_${unitId}`] = (stepIndex) => {
            currentStepIndex = stepIndex;
            noteEditor.classList.remove('hidden');
            sequencer.classList.add('hidden');
            updateEditorState();
        };
    },

    init303Knobs(unitId) {
        const container = document.getElementById(`knobs303_${unitId}`);
        container.innerHTML = '';

        // Synth Section
        const synthSection = document.createElement('div');
        synthSection.className = 'knob-group-section';
        synthSection.dataset.label = 'SYNTH';

        const synthParams = [
            { l: 'TUNE', id: `tune303_${unitId}`, min: -1200, max: 1200, v: 0 },
            { l: 'CUTOFF', id: `cutoff303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'RESO', id: `reso303_${unitId}`, min: 0, max: 15, v: 0, step: 0.1 },
            { l: 'ENV MOD', id: `env303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'DECAY', id: `decay303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'ACCENT', id: `accent303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'VOLUME', id: `vol303_${unitId}`, min: 0, max: 100, v: 60 }
        ];
        synthParams.forEach(p => {
            new RotaryKnob(synthSection, p.l, p.id, p.min, p.max, p.v, p.step || 1);
        });
        container.appendChild(synthSection);

        // Delay Section
        const delaySection = document.createElement('div');
        delaySection.className = 'knob-group-section';
        delaySection.dataset.label = 'DELAY';

        const delayParams = [
            { l: 'TIME', id: `delayTime303_${unitId}`, min: 0, max: 200, v: 0 },
            { l: 'FEEDBACK', id: `delayFb303_${unitId}`, min: 0, max: 100, v: 0 },
            { l: 'WET', id: `delayWet303_${unitId}`, min: 0, max: 100, v: 0 }
        ];
        delayParams.forEach(p => {
            new RotaryKnob(delaySection, p.l, p.id, p.min, p.max, p.v);
        });
        container.appendChild(delaySection);
    },

    render303Grid(unitId) {
        const grid = document.getElementById(`grid303_${unitId}`);
        grid.innerHTML = '';
        const seq = Data.getSequence(`tb303_${unitId}`);
        if (!seq) return;

        seq.forEach((step, i) => {
            const el = document.createElement('div');
            el.className = `step-303 ${step.active ? 'active' : ''}`;
            this.bindFastEvent(el, () => {
                step.active = !step.active;
                el.classList.toggle('active');
                this.update303ClearButtons();
            });

            const led = document.createElement('div'); led.className = 'led';

            const noteDisplay = document.createElement('div');
            noteDisplay.className = 'note-display';
            noteDisplay.innerText = step.note;
            // Removed noteDisplay.onclick to prevent opening editor on step click

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

    allTracks: [
        { id: 'bd', name: 'BD', params: [{ l: 'TUNE', id: 'bd_p1', v: 50 }, { l: 'LEVEL', id: 'bd_level', v: 100 }, { l: 'ATTACK', id: 'bd_p2', v: 80 }, { l: 'DECAY', id: 'bd_p3', v: 50 }] },
        { id: 'sd', name: 'SD', params: [{ l: 'TUNE', id: 'sd_p1', v: 50 }, { l: 'LEVEL', id: 'sd_level', v: 100 }, { l: 'TONE', id: 'sd_p2', v: 30 }, { l: 'SNAPPY', id: 'sd_p3', v: 70 }] },
        { id: 'lt', name: 'LT', params: [{ l: 'TUNE', id: 'lt_p1', v: 50 }, { l: 'LEVEL', id: 'lt_level', v: 100 }, { l: 'DECAY', id: 'lt_p2', v: 50 }] },
        { id: 'mt', name: 'MT', params: [{ l: 'TUNE', id: 'mt_p1', v: 50 }, { l: 'LEVEL', id: 'mt_level', v: 100 }, { l: 'DECAY', id: 'mt_p2', v: 50 }] },
        { id: 'ht', name: 'HT', params: [{ l: 'TUNE', id: 'ht_p1', v: 50 }, { l: 'LEVEL', id: 'ht_level', v: 100 }, { l: 'DECAY', id: 'ht_p2', v: 50 }] },
        { id: 'rs', name: 'RS', params: [{ l: 'LEVEL', id: 'rs_level', v: 100 }] },
        { id: 'cp', name: 'CP', params: [{ l: 'LEVEL', id: 'cp_level', v: 100 }, { l: 'DECAY', id: 'cp_decay', v: 50 }] },
        { id: 'ch', name: 'CH', params: [{ l: 'LEVEL', id: 'ch_level', v: 100 }, { l: 'DECAY', id: 'ch_decay', v: 20 }, { l: 'TUNE', id: 'ch_tune', v: 50 }] },
        { id: 'oh', name: 'OH', params: [{ l: 'LEVEL', id: 'oh_level', v: 100 }, { l: 'DECAY', id: 'oh_decay', v: 60 }, { l: 'TUNE', id: 'oh_tune', v: 50 }] },
        { id: 'cr', name: 'CR', params: [{ l: 'LEVEL', id: 'cr_level', v: 100 }, { l: 'TUNE', id: 'cr_tune', v: 50 }] },
        { id: 'rd', name: 'RD', params: [{ l: 'LEVEL', id: 'rd_level', v: 100 }, { l: 'TUNE', id: 'rd_tune', v: 50 }] },
    ],

    render909() {
        const container = document.getElementById('tracks909');
        if (!container) return;
        container.innerHTML = '';

        // Filter tracks based on Data.active909Tracks
        const tracks = this.allTracks.filter(t => Data.active909Tracks.includes(t.id));

        tracks.forEach(t => {
            const isCustom = Data.customSampleMap && Data.customSampleMap[t.id];
            const row = document.createElement('div'); row.className = 'drum-track-row' + (isCustom ? ' custom-track' : '');
            const hdr = document.createElement('div'); hdr.className = 'track-header';
            const knobDiv = document.createElement('div'); knobDiv.className = 'track-knobs';

            // Adjust name if custom
            let displayName = t.name;
            if (isCustom) {
                displayName += ' (CUSTOM)';
            }

            t.params.forEach(p => {
                let val = p.v;
                if (window.knobInstances && window.knobInstances[p.id]) {
                    val = window.knobInstances[p.id].value;
                }
                const k = new RotaryKnob(knobDiv, p.l, p.id, 0, 100, val, 1, 'small');
                k.defaultVal = p.v;
            });

            const name = document.createElement('div');
            name.className = 'track-name';
            name.innerText = displayName;

            const clearBtn = document.createElement('div');
            clearBtn.className = 'mini-btn icon-btn';
            clearBtn.id = `clear-${t.id}`;
            clearBtn.title = 'Clear Track';
            clearBtn.onclick = () => {
                const s9 = Data.getSequence('tr909');
                if (!s9 || !s9[t.id]) return;

                const isEmpty = s9[t.id].every(v => v === 0);
                if (isEmpty) {
                    // Randomize
                    for (let i = 0; i < 16; i++) {
                        s9[t.id][i] = Math.random() > 0.7 ? 1 : 0;
                    }
                } else {
                    // Clear
                    s9[t.id].fill(0);
                }
                this.update909Grid();
                this.update909ClearButtons();
            };

            const nameContainer = document.createElement('div');
            nameContainer.className = 'track-controls';
            nameContainer.appendChild(name);
            nameContainer.appendChild(clearBtn);

            hdr.appendChild(knobDiv); hdr.appendChild(nameContainer); row.appendChild(hdr);
            const seqDiv = document.createElement('div'); seqDiv.className = 'sequencer-909'; seqDiv.id = `seq909_${t.id}`;
            const s9 = Data.getSequence('tr909');
            if (s9) {
                for (let i = 0; i < 16; i++) {
                    const s = document.createElement('div'); s.className = 'step-909';
                    this.bindFastEvent(s, () => {
                        s9[t.id][i] = s9[t.id][i] ? 0 : 1;
                        s.classList.toggle('active');
                        this.update909ClearButtons();
                    });
                    seqDiv.appendChild(s);
                }
            }
            row.appendChild(seqDiv); container.appendChild(row);
        });

        // Manage Tracks Button
        const manageRow = document.createElement('div');
        manageRow.className = 'drum-track-row';
        const manageBtn = document.createElement('div');
        manageBtn.className = 'manage-909-track-btn';
        manageBtn.innerHTML = this.svgIcon('sd') + '<span>MANAGE TRACKS</span>';
        manageBtn.title = 'Manage Drum Tracks';
        manageBtn.onclick = () => {
            this.showAddTrackPopover();
        };
        manageRow.appendChild(manageBtn);
        container.appendChild(manageRow);

        this.update909Grid();
        this.update909ClearButtons();
    },

    update909ClearButtons() {
        const s9 = Data.getSequence('tr909');
        if (!s9) return;

        const trashIcon = this.svgIcon('trash');
        const diceIcon = this.svgIcon('dice');

        let allEmpty = true;
        ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp', 'ch', 'oh', 'cr', 'rd'].forEach(id => {
            const btn = document.getElementById(`clear-${id}`);
            if (!btn) return;

            const isEmpty = s9[id].every(v => v === 0);
            if (!isEmpty) allEmpty = false;

            btn.innerHTML = isEmpty ? diceIcon : trashIcon;
            btn.title = isEmpty ? 'Randomize Track' : 'Clear Track';
        });

        // Update header clear button
        const headerBtn = document.getElementById('clear909Btn');
        if (headerBtn) {
            headerBtn.innerHTML = allEmpty ? diceIcon : trashIcon;
            headerBtn.title = allEmpty ? 'Randomize All Tracks' : 'Clear All Tracks';
        }
    },

    update303ClearButtons() {
        const trashIcon = this.svgIcon('trash');
        const diceIcon = this.svgIcon('dice');

        // Update Unit 1
        const s1 = Data.getSequence('tb303_1');
        if (s1) {
            const btn1 = document.getElementById('clear303_1');
            if (btn1) {
                const isEmpty1 = s1.every(step => !step.active);
                btn1.innerHTML = isEmpty1 ? diceIcon : trashIcon;
                btn1.title = isEmpty1 ? 'Randomize Sequence' : 'Clear Sequence';
            }
        }

        // Update Unit 2
        const s2 = Data.getSequence('tb303_2');
        if (s2) {
            const btn2 = document.getElementById('clear303_2');
            if (btn2) {
                const isEmpty2 = s2.every(step => !step.active);
                btn2.innerHTML = isEmpty2 ? diceIcon : trashIcon;
                btn2.title = isEmpty2 ? 'Randomize Sequence' : 'Clear Sequence';
            }
        }
    },

    update909Grid() {
        const s9 = Data.getSequence('tr909');
        if (!s9) return;
        ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp', 'ch', 'oh', 'cr', 'rd'].forEach(id => {
            const div = document.getElementById(`seq909_${id}`);
            if (!div) return;
            Array.from(div.children).forEach((child, i) => {
                if (s9[id][i]) child.classList.add('active');
                else child.classList.remove('active');
            });
        });
    },

    drawPlayhead(step) {
        if (this.lastPlayheadStep === step) return;
        this.clearPlayhead();

        const s1 = document.getElementById(`grid303_1`);
        if (s1 && s1.children[step]) s1.children[step].classList.add('current');

        const s2 = document.getElementById(`grid303_2`);
        if (s2 && s2.children[step]) s2.children[step].classList.add('current');

        const s9 = document.querySelectorAll('.sequencer-909');
        s9.forEach(seq => {
            if (seq.children[step]) seq.children[step].classList.add('current');
        });

        this.lastPlayheadStep = step;
    },

    showAddTrackPopover(x, y) {
        const existing = document.getElementById('add-track-popover-overlay');
        if (existing) existing.remove();

        // Template state: copy current active tracks
        let selectedIds = [...Data.active909Tracks];

        const overlay = document.createElement('div');
        overlay.id = 'add-track-popover-overlay';
        overlay.className = 'piano-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal add-track-modal';

        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = '<span class="modal-title">MANAGE DRUM TRACKS</span><button class="close-btn">&times;</button>';
        header.querySelector('.close-btn').onclick = () => overlay.remove();
        modal.appendChild(header);

        const content = document.createElement('div');
        content.className = 'modal-body';

        const list = document.createElement('div');
        list.className = 'add-track-list';

        const allTracks = [
            { id: 'bd', name: 'BD' }, { id: 'sd', name: 'SD' },
            { id: 'lt', name: 'LT' }, { id: 'mt', name: 'MT' }, { id: 'ht', name: 'HT' },
            { id: 'rs', name: 'RS' }, { id: 'cp', name: 'CP' },
            { id: 'ch', name: 'CH' }, { id: 'oh', name: 'OH' },
            { id: 'cr', name: 'CR' }, { id: 'rd', name: 'RD' }
        ];

        const synthIds = ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp'];
        const sampleIds = ['ch', 'oh', 'cr', 'rd'];

        const renderItems = (title, ids) => {
            const secHdr = document.createElement('div');
            secHdr.className = 'add-track-section-header';
            secHdr.innerText = title;
            list.appendChild(secHdr);

            ids.forEach(id => {
                const track = allTracks.find(t => t.id === id);

                // Wrapper for row (Item container)
                const row = document.createElement('div');
                row.className = 'add-track-row';

                // Main Toggle Item
                const item = document.createElement('div');
                item.className = 'add-track-item' + (selectedIds.includes(id) ? ' active' : '');
                if (id === 'bd') item.classList.add('locked');

                item.innerHTML = `
                    <div class="track-check">${selectedIds.includes(id) ? '●' : '○'}</div>
                    <div class="track-icon">${this.svgIcon(id)}</div>
                    <div class="track-label">${track.name}</div>
                `;

                item.onclick = () => {
                    if (id === 'bd') return; // Cannot toggle BD
                    if (selectedIds.includes(id)) {
                        selectedIds = selectedIds.filter(idx => idx !== id);
                        item.classList.remove('active');
                        item.querySelector('.track-check').innerText = '○';
                    } else {
                        selectedIds.push(id);
                        item.classList.add('active');
                        item.querySelector('.track-check').innerText = '●';
                    }
                };

                // Edit Button (Now inside item)
                if (synthIds.includes(id)) {
                    const editBtn = document.createElement('button');
                    editBtn.innerHTML = this.svgIcon('cog');
                    editBtn.className = 'track-edit-btn-side';
                    editBtn.title = 'Edit Drum Synth';

                    editBtn.onclick = (e) => {
                        e.stopPropagation(); // Don't trigger the track selection
                        DrumSynthUI.open(id);
                    };

                    item.appendChild(editBtn);
                }

                row.appendChild(item);
                list.appendChild(row);
            });
        };

        renderItems('SYNTHESIS', synthIds);
        renderItems('FACTORY SAMPLES', sampleIds);



        content.appendChild(list);
        modal.appendChild(content);

        // Footer Actions
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        const applyBtn = document.createElement('button');
        applyBtn.className = 'apply-btn';
        applyBtn.innerText = 'APPLY';
        applyBtn.onclick = () => {
            // Sort selectedIds according to standard 909 order
            const order = ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp', 'ch', 'oh', 'cr', 'rd'];
            Data.active909Tracks = selectedIds.sort((a, b) => order.indexOf(a) - order.indexOf(b));

            // Cleanup custom mappings for removed tracks
            Object.keys(Data.customSampleMap).forEach(tid => {
                if (!Data.active909Tracks.includes(tid)) {
                    delete Data.customSampleMap[tid];
                    const tr909 = AudioEngine.instruments.get('tr909');
                    if (tr909) delete tr909.customSampleMap[tid];
                }
            });

            Data.saveSettings();
            this.render909();
            overlay.remove();
        };
        footer.appendChild(applyBtn);
        modal.appendChild(footer);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
    },

    add909Track(id, source = 'factory', sampleId = null) {
        if (!Data.active909Tracks.includes(id)) {
            Data.active909Tracks.push(id);
            // Sorting
            const order = ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp', 'ch', 'oh', 'cr', 'rd'];
            Data.active909Tracks.sort((a, b) => order.indexOf(a) - order.indexOf(b));

            // Metadata extension could go here if we expand Data.js further
            // For now we persist just the list.

            Data.saveSettings();
            this.render909();
        }
    },

    clearPlayhead() {
        const currentElements = document.getElementsByClassName('current');
        while (currentElements.length > 0) {
            currentElements[0].classList.remove('current');
        }
    },

    highlightStep(step) {
        this.drawPlayhead(step);
    }
};
