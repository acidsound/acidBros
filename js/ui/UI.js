import { RotaryKnob } from './RotaryKnob.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { Data } from '../data/Data.js';
import { Oscilloscope } from './Oscilloscope.js';
import { FileManager } from '../data/FileManager.js';
import { MidiManager } from '../midi/MidiManager.js';

export const UI = {
    isInitialized: false,

    init() {
        this.init303Knobs(1);
        this.init303Knobs(2);
        this.render303Grid(1);
        this.render303Grid(2);
        this.render909();

        // Initialize Oscilloscope
        Oscilloscope.init();

        document.getElementById('playBtn').onclick = () => AudioEngine.play();
        document.getElementById('stopBtn').onclick = () => AudioEngine.stop();
        document.getElementById('randomBtn').onclick = () => Data.randomize();

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
        document.getElementById('clearBtn').onclick = () => {
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
        };

        // Clear/Randomize all 909 tracks
        document.getElementById('clear909Btn').onclick = () => {
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
        };

        // Clear/Randomize TB-303 Unit 1
        document.getElementById('clear303_1').onclick = () => {
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
        };

        // Clear/Randomize TB-303 Unit 2
        document.getElementById('clear303_2').onclick = () => {
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
        };

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

        // Touch support
        ribbonController.addEventListener('touchstart', (e) => {
            startDrag(e.touches[0].clientX);
            e.preventDefault();
        });

        document.addEventListener('touchmove', (e) => {
            if (isDragging) {
                updateSwing(e.touches[0].clientX);
            }
        }, { passive: false });

        document.addEventListener('touchend', () => {
            isDragging = false;
            activeHalf = null;
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
                if (overlay.style.display === 'none') {
                    this.renderFileList();
                    overlay.style.display = 'flex';
                } else {
                    overlay.style.display = 'none';
                }
            };
        }

        // --- Pattern Mode Controls Listeners ---
        const patContainer = document.getElementById('pattern-controls-container');
        if (patContainer) {
            // Pattern Select Buttons
            patContainer.querySelectorAll('.pat-btn').forEach(btn => {
                btn.onclick = () => {
                    const id = parseInt(btn.dataset.pattern);
                    Data.selectPattern(id);
                };
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
                btn.onclick = () => {
                    const id = parseInt(btn.dataset.pattern);
                    Data.selectPattern(id);
                    Data.addToSong(id);
                    this.renderModeControls(); // Update timeline
                };
            });
        }
    },

    renderModeControls() {
        // Update the checked state
        this.updateModeSwitch();

        const patContainer = document.getElementById('pattern-controls-container');
        const songContainer = document.getElementById('song-controls-container');

        if (Data.mode === 'pattern') {
            if (patContainer) patContainer.style.display = 'block';
            if (songContainer) songContainer.style.display = 'none';
            this.updatePatternButtonsState();
        } else {
            if (patContainer) patContainer.style.display = 'none';
            if (songContainer) songContainer.style.display = 'block';
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
                overlay.style.display = 'none';
            }
        };

        document.getElementById('fileCloseBtn').onclick = () => {
            overlay.style.display = 'none';
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
            overlay.style.display = 'flex';
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
            overlay.style.display = 'none';
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
                    c.style.display = 'none';
                });

                // Activate clicked
                tabBtn.classList.add('active');
                const tabId = tabBtn.dataset.tab;
                const content = document.getElementById(`tab-${tabId}`);
                content.classList.add('active');
                content.style.display = 'block';
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
            if (overlay.style.display !== 'none') return;

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
                overlay.style.display = 'none';
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
            banner.style.display = 'block';
        }
    },

    hideLearnModeBanner() {
        const banner = document.getElementById('learnModeExitBanner');
        if (banner) {
            banner.style.display = 'none';
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
            emptyMsg.className = 'empty-file-list';
            emptyMsg.innerText = 'No saved files';
            emptyMsg.style.padding = '20px';
            emptyMsg.style.textAlign = 'center';
            emptyMsg.style.color = '#666';
            emptyMsg.style.fontStyle = 'italic';
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
            duplicateBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
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
            renameBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
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
            deleteBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
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
            emptyMsg.style.color = '#666';
            emptyMsg.style.fontSize = '0.9em';
            emptyMsg.style.fontStyle = 'italic';
            emptyMsg.innerText = 'Click pattern buttons above to build your song...';
            container.appendChild(emptyMsg);
            return;
        }

        Data.song.forEach((patId, idx) => {
            const block = document.createElement('div');
            block.className = 'song-block';
            block.innerText = `P${patId + 1}`;
            block.title = 'Click to remove';
            block.style.cursor = 'pointer';

            // Highlight current playing block
            if (AudioEngine.isPlaying && AudioEngine.currentSongIndex === idx) {
                block.classList.add('playing');
            }

            // Click to remove
            block.onclick = () => {
                Data.song.splice(idx, 1);
                this.renderModeControls(); // Refresh timeline
            };

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
            delayFeedback: getV(`delayFb303_${unitId}`)
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

        if (track === 'bd') return { p1: getV('bd_p1'), p2: getV('bd_p2'), p3: getV('bd_p3'), vol: lvl('bd_level') };
        if (track === 'sd') return { p1: getV('sd_p1'), p2: getV('sd_p2'), p3: getV('sd_p3'), vol: lvl('sd_level') };
        if (track === 'ch') return { p1: getV('ch_p1'), vol: lvl('ch_level') };
        if (track === 'oh') return { p1: getV('oh_p1'), vol: lvl('oh_level') };
        if (track === 'cp') return { p1: getV('cp_p1'), vol: lvl('cp_level') };
        return {};
    },

    getParams(id) {
        if (id === 'tb303_1') return this.get303Params(1);
        if (id === 'tb303_2') return this.get303Params(2);
        if (id === 'tr909') {
            return {
                bd: this.get909Params('bd'),
                sd: this.get909Params('sd'),
                ch: this.get909Params('ch'),
                oh: this.get909Params('oh'),
                cp: this.get909Params('cp')
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
            { l: 'RESO', id: `reso303_${unitId}`, min: 0, max: 15, v: 0 },
            { l: 'ENV MOD', id: `env303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'DECAY', id: `decay303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'ACCENT', id: `accent303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'VOLUME', id: `vol303_${unitId}`, min: 0, max: 100, v: 60 }
        ];
        synthParams.forEach(p => {
            new RotaryKnob(synthSection, p.l, p.id, p.min, p.max, p.v);
        });
        container.appendChild(synthSection);

        // Delay Section
        const delaySection = document.createElement('div');
        delaySection.className = 'knob-group-section';
        delaySection.dataset.label = 'DELAY';

        const delayParams = [
            { l: 'TIME', id: `delayTime303_${unitId}`, min: 0, max: 200, v: 0 },
            { l: 'FEEDBACK', id: `delayFb303_${unitId}`, min: 0, max: 100, v: 0 }
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
            el.onclick = () => {
                step.active = !step.active;
                this.render303Grid(unitId);
                this.update303ClearButtons();
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
        const seq = Data.getSequence(`tb303_${unitId}`);
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
        const getCurrentStep = () => {
            // Re-fetch sequence in case it changed (though popover usually blocks interaction)
            const s = Data.getSequence(`tb303_${unitId}`);
            return s[currentIndex];
        };

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
                // Highlight key if it matches note
                if (el.innerText === s.note) {
                    el.classList.add('active');
                    // If gate is OFF (s.active is false), add disabled style
                    if (!s.active) el.classList.add('disabled');
                    else el.classList.remove('disabled');
                } else {
                    el.classList.remove('active', 'disabled');
                }
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
            name.innerText = t.id.toUpperCase();

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
                    s.onclick = () => {
                        s9[t.id][i] = s9[t.id][i] ? 0 : 1;
                        s.classList.toggle('active');
                        this.update909ClearButtons();
                    }
                    seqDiv.appendChild(s);
                }
            }
            row.appendChild(seqDiv); container.appendChild(row);
        });
        this.update909Grid();
        this.update909ClearButtons();
    },

    update909ClearButtons() {
        const s9 = Data.getSequence('tr909');
        if (!s9) return;

        const trashIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        const diceIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1"></circle><circle cx="15.5" cy="8.5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="8.5" cy="15.5" r="1"></circle><circle cx="15.5" cy="15.5" r="1"></circle></svg>';

        let allEmpty = true;
        ['bd', 'sd', 'ch', 'oh', 'cp'].forEach(id => {
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
        const trashIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        const diceIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1"></circle><circle cx="15.5" cy="8.5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="8.5" cy="15.5" r="1"></circle><circle cx="15.5" cy="15.5" r="1"></circle></svg>';

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
        ['bd', 'sd', 'ch', 'oh', 'cp'].forEach(id => {
            const div = document.getElementById(`seq909_${id}`);
            if (!div) return;
            Array.from(div.children).forEach((child, i) => {
                if (s9[id][i]) child.classList.add('active');
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
