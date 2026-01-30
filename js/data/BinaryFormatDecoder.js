// BinaryFormatDecoder.js
// Decoder for the AcidBros binary format v4
// UPDATED: MODE_FULL (0x02) now expects per-pattern settings.

export class BinaryFormatDecoder {
    constructor() {
        // Block IDs
        this.BLOCK_END = 0x00;
        this.BLOCK_GLOBAL = 0x01;
        this.BLOCK_UNIT = 0x02;

        // Unit Types
        this.UNIT_TB303 = 0x01;
        this.UNIT_TR909 = 0x02;

        // Share Modes
        this.MODE_PATTERN = 0x00;
        this.MODE_SONG_ONLY = 0x01;
        this.MODE_FULL = 0x02;     // Full Project w/ Per-Pattern Settings

        // MIDI note to name mapping
        this.midiToNote = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    }

    // Read 16-bit unsigned integer in little-endian
    readUint16LE(buffer, offset) {
        return buffer[offset] | (buffer[offset + 1] << 8);
    }

    // Read block header
    readBlockHeader(buffer, offset) {
        if (offset + 2 >= buffer.length) return null;
        return {
            blockId: buffer[offset],
            length: this.readUint16LE(buffer, offset + 1)
        };
    }

    // Convert Base64URL to standard Base64
    fromBase64URL(base64url) {
        let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if needed
        while (base64.length % 4) {
            base64 += '=';
        }
        return base64;
    }

    // Main decode function
    decode(input) {
        // Convert input to buffer
        let buffer;
        if (typeof input === 'string') {
            try {
                // Try Base64URL first, then standard Base64
                const base64 = this.fromBase64URL(input);
                const binaryString = atob(base64);
                buffer = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    buffer[i] = binaryString.charCodeAt(i);
                }
            } catch (e) {
                throw new Error("Invalid base64 string");
            }
        } else {
            buffer = input;
        }

        // Initialize default state with new format
        const state = this.createDefaultState();

        let offset = 0;

        // Parse blocks
        while (offset < buffer.length) {
            const header = this.readBlockHeader(buffer, offset);
            if (!header) break;

            offset += 3;

            switch (header.blockId) {
                case this.BLOCK_GLOBAL:
                    this.parseGlobalBlock(buffer, offset, header.length, state);
                    break;

                case this.BLOCK_UNIT:
                    this.parseUnitBlock(buffer, offset, header.length, state);
                    break;

                case this.BLOCK_END:
                    return state;

                default:
                    console.warn(`Unknown block ID: ${header.blockId}`);
            }

            offset += header.length;
        }

        return state;
    }

    // Create default state with new format
    createDefaultState() {
        const createEmpty303Sequence = () => {
            const seq = [];
            for (let i = 0; i < 16; i++) {
                seq.push({ active: false, note: 'C', octave: 2, accent: false, slide: false });
            }
            return seq;
        };

        const createEmptyPattern = () => ({
            units: {
                tb303_1: {
                    type: 'tb303',
                    sequence: createEmpty303Sequence(),
                    settings: {
                        waveform: 'sawtooth',
                        tune: 0,
                        cutoff: 50,
                        reso: 8,
                        env: 50,
                        decay: 50,
                        accent: 80,
                        volume: 70,
                        delayTime: 50,
                        delayFb: 30
                    }
                },
                tb303_2: {
                    type: 'tb303',
                    sequence: createEmpty303Sequence(),
                    settings: {
                        waveform: 'sawtooth',
                        tune: 0,
                        cutoff: 50,
                        reso: 8,
                        env: 50,
                        decay: 50,
                        accent: 80,
                        volume: 70,
                        delayTime: 50,
                        delayFb: 30
                    }
                },
                tr909: {
                    type: 'tr909',
                    tracks: {
                        bd: { steps: Array(16).fill(0), tune: 50, level: 100, attack: 50, decay: 50 },
                        sd: { steps: Array(16).fill(0), tune: 50, level: 100, tone: 50, snappy: 50 },
                        lt: { steps: Array(16).fill(0), tune: 50, level: 100, decay: 50 },
                        mt: { steps: Array(16).fill(0), tune: 50, level: 100, decay: 50 },
                        ht: { steps: Array(16).fill(0), tune: 50, level: 100, decay: 50 },
                        rs: { steps: Array(16).fill(0), level: 100 },
                        ch: { steps: Array(16).fill(0), level: 100, ch_decay: 50 },
                        oh: { steps: Array(16).fill(0), level: 100, oh_decay: 50 },
                        cr: { steps: Array(16).fill(0), level: 100, cr_tune: 50 },
                        rd: { steps: Array(16).fill(0), level: 100, rd_tune: 50 },
                        cp: { steps: Array(16).fill(0), level: 100 }
                    }
                }
            }
        });

        return {
            ver: 5,
            bpm: 125,
            swing: 50,
            mode: 'pattern',
            shareMode: this.MODE_PATTERN,
            currentPatternId: 0,
            patterns: Array(16).fill(null).map(() => createEmptyPattern()),
            song: [0]
        };
    }

    // Parse Global Settings Block (0x01)
    parseGlobalBlock(buffer, offset, length, state) {
        if (length < 5) return;

        state.bpm = buffer[offset];
        state.swing = buffer[offset + 1];
        state.shareMode = buffer[offset + 2];
        state.currentPatternId = buffer[offset + 3] & 0x0F;

        const songLength = buffer[offset + 4];

        // Determine mode based on shareMode
        if (state.shareMode === this.MODE_SONG_ONLY || state.shareMode === this.MODE_FULL) {
            state.mode = 'song';
        } else {
            state.mode = 'pattern';
        }

        // Parse song sequence
        if (songLength > 0 && length >= 5 + songLength) {
            state.song = [];
            for (let i = 0; i < songLength; i++) {
                state.song.push(buffer[offset + 5 + i] & 0x0F);
            }
        }
    }

    // Parse Unit Block (0x02)
    parseUnitBlock(buffer, offset, length, state) {
        if (length < 2) return;

        const unitType = buffer[offset];
        const unitOrder = buffer[offset + 1];

        let pos = offset + 2;

        if (unitType === this.UNIT_TB303) {
            pos = this.parseTB303UnitBlock(buffer, pos, offset + length, unitOrder, state);
        } else if (unitType === this.UNIT_TR909) {
            pos = this.parseTR909UnitBlock(buffer, pos, offset + length, unitOrder, state);
        }
    }

    // Helper to read TB-303 Settings
    readTB303Settings(buffer, pos, endOffset) {
        const settings = {
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
            bytesRead: 0
        };

        if (pos >= endOffset) return settings;

        const initialPos = pos;
        const waveform = buffer[pos++];
        settings.waveform = waveform === 0x01 ? 'square' : 'sawtooth';

        if (pos >= endOffset) {
            settings.bytesRead = pos - initialPos;
            return settings;
        }

        const paramCount = buffer[pos++];
        const paramKeys = ['tune', 'cutoff', 'reso', 'env', 'decay', 'accent', 'volume', 'delayTime', 'delayFb'];

        for (let i = 0; i < paramCount && pos < endOffset; i++) {
            const val = buffer[pos++];
            if (i < paramKeys.length) {
                if (paramKeys[i] === 'tune') {
                    settings[paramKeys[i]] = (val / 240) * 2400 - 1200;
                } else {
                    settings[paramKeys[i]] = val;
                }
            }
        }

        settings.bytesRead = pos - initialPos;
        return settings;
    }

    // Parse TB-303 Unit Block
    parseTB303UnitBlock(buffer, pos, endOffset, unitOrder, state) {
        const unitKey = unitOrder === 0 ? 'tb303_1' : 'tb303_2';

        // Per-Pattern Settings logic applies to MODE_FULL and MODE_PATTERN
        const isPerPatternSettings = (state.shareMode === this.MODE_FULL || state.shareMode === this.MODE_PATTERN);

        let globalSettings = null;

        // Parse Header Settings (only if NOT per-pattern settings mode)
        if (!isPerPatternSettings) {
            globalSettings = this.readTB303Settings(buffer, pos, endOffset);
            pos += globalSettings.bytesRead;
        }

        // Pattern Section
        const patternCount = (state.shareMode === this.MODE_FULL) ? 16 :
            state.shareMode === this.MODE_PATTERN ? 1 : 0;

        for (let p = 0; p < patternCount && pos < endOffset; p++) {
            // For MODE_PATTERN, use currentPatternId. For FULL, use index 0-15.
            const patternIdx = state.shareMode === this.MODE_PATTERN ? state.currentPatternId : p;

            // Ensure pattern exists and has units structure
            if (!state.patterns[patternIdx]) {
                state.patterns[patternIdx] = this.createDefaultState().patterns[0];
            }
            if (!state.patterns[patternIdx].units) {
                state.patterns[patternIdx].units = this.createDefaultState().patterns[0].units;
            }

            // Determine settings for this pattern
            if (isPerPatternSettings) {
                // Read per-pattern settings
                const patternSettings = this.readTB303Settings(buffer, pos, endOffset);
                pos += patternSettings.bytesRead;
                state.patterns[patternIdx].units[unitKey].settings = { ...patternSettings };
                delete state.patterns[patternIdx].units[unitKey].settings.bytesRead;
            } else if (globalSettings) {
                // Use global header settings
                state.patterns[patternIdx].units[unitKey].settings = { ...globalSettings };
                delete state.patterns[patternIdx].units[unitKey].settings.bytesRead;
            }

            // Parse sequence
            for (let step = 0; step < 16 && pos + 2 <= endOffset; step++) {
                const midiPitch = buffer[pos++];
                const attr = buffer[pos++];

                const noteIndex = midiPitch % 12;
                const octave = Math.floor(midiPitch / 12) - 1;

                state.patterns[patternIdx].units[unitKey].sequence[step] = {
                    note: this.midiToNote[noteIndex] || 'C',
                    octave: Math.max(0, Math.min(4, octave)),
                    active: !!(attr & 0x01),
                    accent: !!(attr & 0x02),
                    slide: !!(attr & 0x04)
                };
            }
        }

        return pos;
    }

    // Helper to read TR-909 Settings
    readTR909Settings(buffer, pos, endOffset) {
        const trackSettings = {};
        let bytesRead = 0;

        if (pos >= endOffset) return { trackSettings, bytesRead };

        const initialPos = pos;
        const instrumentCount = buffer[pos++];
        const trackKeys = {
            0x00: 'bd', 0x01: 'sd', 0x05: 'lt', 0x06: 'mt', 0x07: 'ht',
            0x08: 'rs', 0x02: 'ch', 0x03: 'oh', 0x09: 'cr', 0x0A: 'rd', 0x04: 'cp'
        };

        for (let i = 0; i < instrumentCount && pos < endOffset; i++) {
            const instrId = buffer[pos++];
            if (pos >= endOffset) break;

            const paramCount = buffer[pos++];

            const trackKey = trackKeys[instrId];
            if (!trackKey) {
                // Skip unknown instrument params
                pos += paramCount;
                continue;
            }

            let paramOrder;
            if (instrId === 0x00) paramOrder = ['tune', 'level', 'attack', 'decay'];
            else if (instrId === 0x01) paramOrder = ['tune', 'level', 'tone', 'snappy'];
            else if (instrId === 0x05 || instrId === 0x06 || instrId === 0x07) paramOrder = ['tune', 'level', 'decay'];
            else if (instrId === 0x08) paramOrder = ['level'];
            else if (instrId === 0x04) paramOrder = ['level'];
            else if (instrId === 0x02) paramOrder = ['level', 'ch_decay'];
            else if (instrId === 0x03) paramOrder = ['level', 'oh_decay'];
            else if (instrId === 0x09) paramOrder = ['level', 'cr_tune'];
            else if (instrId === 0x0A) paramOrder = ['level', 'rd_tune'];
            else paramOrder = [];

            const settings = {};
            for (let j = 0; j < paramCount && pos < endOffset; j++) {
                const val = buffer[pos++];
                if (j < paramOrder.length) {
                    settings[paramOrder[j]] = val;
                }
            }
            trackSettings[trackKey] = settings;
        }

        bytesRead = pos - initialPos;
        return { trackSettings, bytesRead };
    }

    // Parse TR-909 Unit Block
    parseTR909UnitBlock(buffer, pos, endOffset, unitOrder, state) {
        const isPerPatternSettings = (state.shareMode === this.MODE_FULL || state.shareMode === this.MODE_PATTERN);
        const trackKeys = {
            0x00: 'bd', 0x01: 'sd', 0x05: 'lt', 0x06: 'mt', 0x07: 'ht',
            0x08: 'rs', 0x02: 'ch', 0x03: 'oh', 0x09: 'cr', 0x0A: 'rd', 0x04: 'cp'
        };
        let globalTrackSettings = null;

        // Header Settings Section (Only if NOT per-pattern)
        if (!isPerPatternSettings) {
            const result = this.readTR909Settings(buffer, pos, endOffset);
            globalTrackSettings = result.trackSettings;
            pos += result.bytesRead;
        }

        // Pattern Section
        const patternCount = (state.shareMode === this.MODE_FULL) ? 16 :
            state.shareMode === this.MODE_PATTERN ? 1 : 0;

        for (let p = 0; p < patternCount && pos < endOffset; p++) {
            const patternIdx = state.shareMode === this.MODE_PATTERN ? state.currentPatternId : p;

            // Ensure pattern exists
            if (!state.patterns[patternIdx]) {
                state.patterns[patternIdx] = this.createDefaultState().patterns[0];
            }
            if (!state.patterns[patternIdx].units) {
                state.patterns[patternIdx].units = this.createDefaultState().patterns[0].units;
            }

            let currentTrackSettings = globalTrackSettings;

            // Read per-pattern settings
            if (isPerPatternSettings) {
                const result = this.readTR909Settings(buffer, pos, endOffset);
                currentTrackSettings = result.trackSettings;
                pos += result.bytesRead;
            }

            // Apply settings to pattern
            if (currentTrackSettings) {
                for (const [key, settings] of Object.entries(currentTrackSettings)) {
                    if (state.patterns[patternIdx].units.tr909.tracks[key]) {
                        Object.assign(state.patterns[patternIdx].units.tr909.tracks[key], settings);
                    }
                }
            }

            // Read Pattern Sequence Data
            if (pos >= endOffset) break;
            const patternInstrCount = buffer[pos++];

            for (let i = 0; i < patternInstrCount && pos < endOffset; i++) {
                const instrId = buffer[pos++];
                if (pos >= endOffset) break;

                const attrCount = buffer[pos++];
                const trackKey = trackKeys[instrId];

                if (trackKey && attrCount > 0 && pos + 2 <= endOffset) {
                    const triggerBits = this.readUint16LE(buffer, pos);
                    pos += 2;

                    // Convert bitmask to array
                    const steps = [];
                    for (let step = 0; step < 16; step++) {
                        steps[step] = (triggerBits & (1 << step)) ? 1 : 0;
                    }

                    if (state.patterns[patternIdx].units.tr909.tracks[trackKey]) {
                        state.patterns[patternIdx].units.tr909.tracks[trackKey].steps = steps;
                    }

                    // Skip any additional attrs
                    for (let a = 1; a < attrCount && pos + 2 <= endOffset; a++) {
                        pos += 2;
                    }
                }
            }
        }

        return pos;
    }
}