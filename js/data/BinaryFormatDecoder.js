// BinaryFormatDecoder.js
// Decoder for the AcidBros binary format v2
// Implements BINARY_FORMAT.md specification

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
        this.MODE_FULL = 0x02;

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

        // Initialize default state
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

    // Create default state
    createDefaultState() {
        return {
            ver: 3,
            bpm: 125,
            swing: 50,
            mode: 'pattern',
            shareMode: this.MODE_PATTERN,
            currentPatternId: 0,
            wave1: 'sawtooth',
            wave2: 'sawtooth',
            k: {},
            patterns: Array(16).fill(null).map(() => ({
                seq303_1: Array(16).fill(null).map(() => ({
                    active: false, note: 'C', octave: 2, accent: false, slide: false
                })),
                seq303_2: Array(16).fill(null).map(() => ({
                    active: false, note: 'C', octave: 2, accent: false, slide: false
                })),
                seq909: {
                    bd: Array(16).fill(0),
                    sd: Array(16).fill(0),
                    ch: Array(16).fill(0),
                    oh: Array(16).fill(0),
                    cp: Array(16).fill(0)
                }
            })),
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

    // Parse TB-303 Unit Block
    parseTB303UnitBlock(buffer, pos, endOffset, unitOrder, state) {
        const suffix = unitOrder === 0 ? '1' : '2';
        const waveKey = unitOrder === 0 ? 'wave1' : 'wave2';
        const seqKey = unitOrder === 0 ? 'seq303_1' : 'seq303_2';

        // Settings Section
        if (pos >= endOffset) return pos;

        const waveform = buffer[pos++];
        state[waveKey] = waveform === 0x01 ? 'square' : 'sawtooth';

        if (pos >= endOffset) return pos;
        const paramCount = buffer[pos++];

        // TB-303 Parameter Order
        const paramKeys = [
            `tune303_${suffix}-input`,
            `cutoff303_${suffix}-input`,
            `reso303_${suffix}-input`,
            `env303_${suffix}-input`,
            `decay303_${suffix}-input`,
            `accent303_${suffix}-input`,
            `vol303_${suffix}-input`,
            `delayTime303_${suffix}-input`,
            `delayFb303_${suffix}-input`
        ];

        for (let i = 0; i < paramCount && pos < endOffset; i++) {
            const val = buffer[pos++];
            if (i < paramKeys.length) {
                // TUNE needs special handling: 0-240 -> -1200 to +1200
                if (paramKeys[i].includes('tune')) {
                    state.k[paramKeys[i]] = (val / 240) * 2400 - 1200;
                } else {
                    state.k[paramKeys[i]] = val;
                }
            }
        }

        // Pattern Section
        // Determine how many patterns based on shareMode
        const patternCount = state.shareMode === this.MODE_FULL ? 16 :
            state.shareMode === this.MODE_PATTERN ? 1 : 0;

        for (let p = 0; p < patternCount && pos + 32 <= endOffset; p++) {
            const patternIdx = state.shareMode === this.MODE_PATTERN ? state.currentPatternId : p;

            for (let step = 0; step < 16; step++) {
                const midiPitch = buffer[pos++];
                const attr = buffer[pos++];

                const noteIndex = midiPitch % 12;
                const octave = Math.floor(midiPitch / 12) - 1;

                state.patterns[patternIdx][seqKey][step] = {
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

    // Parse TR-909 Unit Block
    parseTR909UnitBlock(buffer, pos, endOffset, unitOrder, state) {
        // Settings Section
        if (pos >= endOffset) return pos;

        const instrumentCount = buffer[pos++];
        const trackKeys = ['bd', 'sd', 'ch', 'oh', 'cp'];

        for (let i = 0; i < instrumentCount && pos < endOffset; i++) {
            const instrId = buffer[pos++];
            if (pos >= endOffset) break;

            const paramCount = buffer[pos++];

            // TR-909 Parameter mapping
            const paramPrefixes = {
                0x00: 'bd', 0x01: 'sd', 0x02: 'ch', 0x03: 'oh', 0x04: 'cp'
            };
            const prefix = paramPrefixes[instrId] || 'bd';

            // Parameter suffixes based on instrument
            let paramSuffixes;
            if (instrId <= 0x01) { // BD, SD have 4 params
                paramSuffixes = ['_p1-input', '_p2-input', '_p3-input', '_level-input'];
            } else { // CH, OH, CP have 2 params
                paramSuffixes = ['_p1-input', '_level-input'];
            }

            for (let j = 0; j < paramCount && pos < endOffset; j++) {
                const val = buffer[pos++];
                if (j < paramSuffixes.length) {
                    state.k[prefix + paramSuffixes[j]] = val;
                }
            }
        }

        // Pattern Section
        const patternCount = state.shareMode === this.MODE_FULL ? 16 :
            state.shareMode === this.MODE_PATTERN ? 1 : 0;

        for (let p = 0; p < patternCount && pos < endOffset; p++) {
            const patternIdx = state.shareMode === this.MODE_PATTERN ? state.currentPatternId : p;

            if (pos >= endOffset) break;
            const patternInstrCount = buffer[pos++];

            for (let i = 0; i < patternInstrCount && pos < endOffset; i++) {
                const instrId = buffer[pos++];
                if (pos >= endOffset) break;

                const attrCount = buffer[pos++];
                const trackKey = trackKeys[instrId] || 'bd';

                // Read TRIGGER bitmask (first attr, required)
                if (attrCount > 0 && pos + 2 <= endOffset) {
                    const triggerBits = this.readUint16LE(buffer, pos);
                    pos += 2;

                    // Convert bitmask to array
                    for (let step = 0; step < 16; step++) {
                        state.patterns[patternIdx].seq909[trackKey][step] =
                            (triggerBits & (1 << step)) ? 1 : 0;
                    }

                    // Skip any additional attrs (ACCENT, FLAM)
                    for (let a = 1; a < attrCount && pos + 2 <= endOffset; a++) {
                        pos += 2; // Skip for now
                    }
                }
            }
        }

        return pos;
    }
}