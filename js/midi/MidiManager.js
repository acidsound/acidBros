import { UI } from '../ui/UI.js';

export const MidiManager = {
    midiAccess: null,
    inputs: new Map(),
    // Mappings format: { "key": { targetId: "...", type: "...", source: "midi|keyboard|...", ... } }
    // Key format for MIDI: `midi-${channel}-${messageType}-${data1}` (e.g., "midi-0-noteon-60", "midi-0-cc-74")
    // Key format for Keyboard: `keyboard-${keyCode}-${eventType}` (e.g., "keyboard-65-keydown")
    // This allows flexible mapping from any input source (MIDI, keyboard, OSC, gamepad, etc.)
    mappings: {},
    isLearning: false,
    learningTarget: null, // { id: "...", type: "knob|button|toggle", callback: fn }

    async init() {
        if (navigator.requestMIDIAccess) {
            try {
                const access = await navigator.requestMIDIAccess();
                this.midiAccess = access;

                // Initial inputs
                for (const input of access.inputs.values()) {
                    this.addInput(input);
                }

                // Listen for connection changes
                access.onstatechange = (e) => {
                    const port = e.port;
                    if (port.type === 'input') {
                        if (port.state === 'connected') {
                            this.addInput(port);
                            UI.showToast(`MIDI Device Connected: ${port.name}`);
                        } else {
                            this.removeInput(port);
                            UI.showToast(`MIDI Device Disconnected: ${port.name}`);
                        }
                    }
                };

                console.log('Web MIDI Initialized');
            } catch (err) {
                console.warn('Web MIDI API access failed', err);
            }
        } else {
            console.warn('Web MIDI API not supported in this browser');
        }
    },

    addInput(input) {
        if (!this.inputs.has(input.id)) {
            input.onmidimessage = this.handleMidiMessage.bind(this);
            this.inputs.set(input.id, input);
        }
    },

    removeInput(input) {
        if (this.inputs.has(input.id)) {
            this.inputs.delete(input.id);
        }
    },

    handleMidiMessage(event) {
        const data = event.data;
        const status = data[0];
        const data1 = data[1];
        const data2 = data[2];

        // Parse status byte
        const command = status & 0xF0;
        const channel = status & 0x0F;

        let messageType = '';
        if (command === 0x90 && data2 > 0) messageType = 'noteon';
        else if (command === 0x80 || (command === 0x90 && data2 === 0)) messageType = 'noteoff';
        else if (command === 0xB0) messageType = 'cc';
        else return; // Ignore other messages for now

        // Handle Learn Mode
        if (this.isLearning && this.learningTarget) {
            // Only map Note On or CC
            if (messageType === 'noteon' || messageType === 'cc') {
                this.addMidiMapping(channel, messageType, data1, this.learningTarget);
                this.disableLearnMode();
                UI.showToast(`Mapped to Ch ${channel + 1} ${messageType === 'cc' ? 'CC' : 'Note'} ${data1}`);
                UI.renderMidiMappings(); // Update settings panel if open
                return;
            }
        }

        // Handle Mapped Actions
        const key = `midi-${channel}-${messageType}-${data1}`;
        const mapping = this.mappings[key];

        if (mapping) {
            this.executeAction(mapping, data2);
        }
    },

    addMidiMapping(channel, messageType, data1, target) {
        // Remove any existing mapping for this target to avoid duplicates
        this.removeMappingByTargetId(target.id);

        const key = `midi-${channel}-${messageType}-${data1}`;
        this.mappings[key] = {
            targetId: target.id,
            type: target.type,
            source: 'midi',
            channel: channel,
            messageType: messageType,
            data1: data1
        };
    },

    addKeyboardMapping(keyCode, eventType, target) {
        // Remove any existing mapping for this target to avoid duplicates
        this.removeMappingByTargetId(target.id);

        const key = `keyboard-${keyCode}-${eventType}`;
        this.mappings[key] = {
            targetId: target.id,
            type: target.type,
            source: 'keyboard',
            keyCode: keyCode,
            eventType: eventType
        };
    },

    removeMapping(key) {
        delete this.mappings[key];
    },

    removeMappingByTargetId(targetId) {
        for (const key in this.mappings) {
            if (this.mappings[key].targetId === targetId) {
                delete this.mappings[key];
            }
        }
    },

    clearAllMappings() {
        this.mappings = {};
    },

    executeAction(mapping, value) {
        const element = document.getElementById(mapping.targetId);

        // Special handling for dynamic elements or non-DOM targets could go here
        // But for now we rely on DOM IDs or registered instances

        if (mapping.type === 'knob') {
            // For MIDI: Value is 0-127. Need to map to knob's range.
            // For keyboard: Not applicable (buttons only)
            if (mapping.source === 'midi' && window.knobInstances && window.knobInstances[mapping.targetId]) {
                const knob = window.knobInstances[mapping.targetId];
                // Normalize MIDI 0-127 to 0-1
                const normalized = value / 127;
                // Map to knob range
                const range = knob.max - knob.min;
                const newValue = knob.min + (range * normalized);
                knob.setValue(newValue);

                // Trigger change event manually if needed, but setValue usually handles UI update
                // We might need to trigger the callback
                if (knob.options.onChange) {
                    knob.options.onChange(newValue);
                }
            }
        } else if (mapping.type === 'button') {
            // For buttons (like P1-P16), trigger click
            // MIDI: on Note On or CC > 63
            // Keyboard: on keydown
            if (mapping.source === 'midi') {
                if (mapping.messageType === 'noteon' || (mapping.messageType === 'cc' && value > 63)) {
                    if (element) element.click();
                }
            } else if (mapping.source === 'keyboard') {
                if (mapping.eventType === 'keydown') {
                    if (element) element.click();
                }
            }
        } else if (mapping.type === 'toggle') {
            // For toggles (Accent, Slide, Waveform)
            // MIDI: Note On = Toggle, CC: 0-63 Off, 64-127 On
            // Keyboard: keydown = Toggle

            // Waveform is a special case (radio group)
            if (mapping.targetId.startsWith('wave')) {
                // It's a radio button. 
                if (mapping.source === 'midi') {
                    if (element && (mapping.messageType === 'noteon' || (mapping.messageType === 'cc' && value > 63))) {
                        element.checked = true;
                        element.dispatchEvent(new Event('change'));
                    }
                } else if (mapping.source === 'keyboard') {
                    if (element && mapping.eventType === 'keydown') {
                        element.checked = true;
                        element.dispatchEvent(new Event('change'));
                    }
                }
            } else {
                // Standard checkbox/toggle button
                if (mapping.source === 'midi') {
                    if (mapping.messageType === 'noteon') {
                        if (element) element.click();
                    } else if (mapping.messageType === 'cc') {
                        // Set specific state
                        if (element && element.type === 'checkbox') {
                            const shouldBeOn = value > 63;
                            if (element.checked !== shouldBeOn) {
                                element.click();
                            }
                        } else if (element) {
                            // Generic button toggle (like Accent/Slide in editor might be div/button with .active class)
                            const isActive = element.classList.contains('active');
                            const shouldBeOn = value > 63;
                            if (isActive !== shouldBeOn) {
                                element.click();
                            }
                        }
                    }
                } else if (mapping.source === 'keyboard') {
                    if (mapping.eventType === 'keydown') {
                        if (element) element.click();
                    }
                }
            }
        } else if (mapping.type === 'key') {
            // Piano keys in note editor
            if (element) {
                if (mapping.source === 'midi') {
                    if (mapping.messageType === 'noteon' || (mapping.messageType === 'cc' && value > 63)) {
                        // Simulate mousedown
                        const event = new MouseEvent('mousedown', { bubbles: true });
                        element.dispatchEvent(event);
                    } else if (mapping.messageType === 'noteoff' || (mapping.messageType === 'cc' && value <= 63)) {
                        // Simulate mouseup
                        const event = new MouseEvent('mouseup', { bubbles: true });
                        element.dispatchEvent(event);
                    }
                } else if (mapping.source === 'keyboard') {
                    if (mapping.eventType === 'keydown') {
                        const event = new MouseEvent('mousedown', { bubbles: true });
                        element.dispatchEvent(event);
                    } else if (mapping.eventType === 'keyup') {
                        const event = new MouseEvent('mouseup', { bubbles: true });
                        element.dispatchEvent(event);
                    }
                }
            }
        }
    },

    enableLearnMode(targetId, type) {
        this.isLearning = true;
        this.learningTarget = { id: targetId, type: type };
        UI.showToast('Waiting for input (MIDI or Keyboard)...');

        // Visual feedback
        const el = document.getElementById(targetId);
        if (el) el.classList.add('midi-learning');
    },

    disableLearnMode() {
        if (this.learningTarget) {
            const el = document.getElementById(this.learningTarget.id);
            if (el) el.classList.remove('midi-learning');
        }
        this.isLearning = false;
        this.learningTarget = null;
        UI.updateLearnModeUI(false);
    },

    getMappingsList() {
        return Object.entries(this.mappings).map(([key, value]) => {
            return {
                key: key,
                ...value
            };
        });
    },

    async refreshDevices() {
        await this.init();
        if (this.midiAccess) {
            UI.showToast(`MIDI Devices Refreshed. Found ${this.midiAccess.inputs.size} inputs.`);
        } else {
            UI.showToast('Failed to refresh MIDI devices.');
        }
    },

    handleKeyboardInput(keyCode, type) {
        // type: 'keydown' | 'keyup'

        // Handle Learn Mode
        if (this.isLearning && this.learningTarget) {
            if (type === 'keydown') {
                this.addKeyboardMapping(keyCode, 'keydown', this.learningTarget);
                this.disableLearnMode();
                UI.showToast(`Mapped to Keyboard Key ${keyCode}`);
                UI.renderMidiMappings(); // Update settings panel if open
                return;
            }
        }

        // Handle Mapped Actions
        const key = `keyboard-${keyCode}-${type}`;
        const mapping = this.mappings[key];

        if (mapping) {
            // For keyboard, we don't have a value like MIDI, so pass 127 for keydown, 0 for keyup
            const value = type === 'keydown' ? 127 : 0;
            this.executeAction(mapping, value);
        }
    }
};
