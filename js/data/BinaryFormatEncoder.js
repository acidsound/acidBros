// BinaryFormatEncoder.js
// Encoder for the AcidBros binary format v2
// Implements BINARY_FORMAT.md specification

export class BinaryFormatEncoder {
    constructor() {
        // Block IDs
        this.BLOCK_END = 0x00;
        this.BLOCK_GLOBAL = 0x01;
        this.BLOCK_UNIT = 0x02;

        // Unit Types
        this.UNIT_TB303 = 0x01;
        this.UNIT_TR909 = 0x02;

        // Share Modes
        this.MODE_PATTERN = 0x00;   // Single pattern share
        this.MODE_SONG_ONLY = 0x01; // Song sequence only
        this.MODE_FULL = 0x02;      // Complete project

        // TR-909 Instrument IDs
        this.TR909_BD = 0x00;
        this.TR909_SD = 0x01;
        this.TR909_CH = 0x02;
        this.TR909_OH = 0x03;
        this.TR909_CP = 0x04;

        // Note name to MIDI offset mapping
        this.noteToMidi = {
            'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
            'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
        };
    }

    // Write 16-bit unsigned integer in little-endian
    writeUint16LE(buffer, offset, value) {
        buffer[offset] = value & 0xFF;
        buffer[offset + 1] = (value >> 8) & 0xFF;
    }

    // Write block header (ID + 2-byte length)
    writeBlockHeader(buffer, offset, blockId, length) {
        buffer[offset] = blockId;
        this.writeUint16LE(buffer, offset + 1, length);
    }

    // Encode for Share button based on current mode
    encodeForShare(state) {
        if (state.mode === 'song') {
            return this.encodeSongOnly(state);
        } else {
            return this.encodePattern(state, state.currentPatternId || 0);
        }
    }

    // Encode Mode 0x00 - Single Pattern
    encodePattern(state, patternIndex) {
        const buffers = [];

        // Global Settings Block
        buffers.push(this.encodeGlobalBlock(state, this.MODE_PATTERN, patternIndex));

        // TB-303 Unit 1 Block (Settings + 1 Pattern)
        buffers.push(this.encodeTB303UnitBlock(state, 0, [patternIndex]));

        // TB-303 Unit 2 Block (Settings + 1 Pattern)
        buffers.push(this.encodeTB303UnitBlock(state, 1, [patternIndex]));

        // TR-909 Unit Block (Settings + 1 Pattern)
        buffers.push(this.encodeTR909UnitBlock(state, 0, [patternIndex]));

        // End Block
        buffers.push(new Uint8Array([this.BLOCK_END, 0x00, 0x00]));

        return this.combineBuffers(buffers);
    }

    // Encode Mode 0x01 - Song Only (sequence only, no patterns)
    encodeSongOnly(state) {
        const buffers = [];

        // Global Settings Block with song sequence
        buffers.push(this.encodeGlobalBlock(state, this.MODE_SONG_ONLY, 0));

        // No Unit Blocks for Song Only mode

        // End Block
        buffers.push(new Uint8Array([this.BLOCK_END, 0x00, 0x00]));

        return this.combineBuffers(buffers);
    }

    // Encode Mode 0x02 - Full (all 16 patterns + song)
    encodeFull(state) {
        const buffers = [];

        // Global Settings Block
        buffers.push(this.encodeGlobalBlock(state, this.MODE_FULL, 0));

        // All pattern indices
        const allPatterns = Array.from({ length: 16 }, (_, i) => i);

        // TB-303 Unit 1 Block (Settings + 16 Patterns)
        buffers.push(this.encodeTB303UnitBlock(state, 0, allPatterns));

        // TB-303 Unit 2 Block (Settings + 16 Patterns)
        buffers.push(this.encodeTB303UnitBlock(state, 1, allPatterns));

        // TR-909 Unit Block (Settings + 16 Patterns)
        buffers.push(this.encodeTR909UnitBlock(state, 0, allPatterns));

        // End Block
        buffers.push(new Uint8Array([this.BLOCK_END, 0x00, 0x00]));

        return this.combineBuffers(buffers);
    }

    // Encode Global Settings Block (0x01)
    encodeGlobalBlock(state, mode, patternIndex) {
        const song = state.song || [];
        const songLength = (mode === this.MODE_SONG_ONLY || mode === this.MODE_FULL) ? song.length : 0;

        // Data: Tempo(1) + Swing(1) + Mode(1) + PatternIndex(1) + SongLength(1) + Song(N)
        const dataLength = 5 + songLength;
        const buffer = new Uint8Array(3 + dataLength);

        this.writeBlockHeader(buffer, 0, this.BLOCK_GLOBAL, dataLength);

        buffer[3] = Math.min(200, Math.max(60, Math.round(state.bpm || 125)));
        buffer[4] = Math.min(100, Math.max(0, Math.round(state.swing || 50)));
        buffer[5] = mode;
        buffer[6] = patternIndex & 0x0F;
        buffer[7] = songLength;

        for (let i = 0; i < songLength; i++) {
            buffer[8 + i] = song[i] & 0x0F;
        }

        return buffer;
    }

    // Encode TB-303 Unit Block (0x02)
    encodeTB303UnitBlock(state, unitOrder, patternIndices) {
        const suffix = unitOrder === 0 ? '1' : '2';
        const waveKey = unitOrder === 0 ? 'wave1' : 'wave2';

        // Get settings
        const waveform = state[waveKey] === 'square' ? 0x01 : 0x00;
        const knobs = state.k || {};

        // TB-303 Parameter Order (fixed sequence)
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

        const paramValues = paramKeys.map(key => {
            const val = knobs[key];
            if (val === undefined) return 50; // Default
            // TUNE needs special handling: -1200 to +1200 -> 0-240
            if (key.includes('tune')) {
                return Math.round(((val + 1200) / 2400) * 240);
            }
            return Math.round(val);
        });

        // Settings: Waveform(1) + ParamCount(1) + Params(9)
        const settingsLength = 2 + paramValues.length;

        // Patterns: 32 bytes each (16 steps × 2 bytes)
        const patternsLength = patternIndices.length * 32;

        // Total data length: UnitType(1) + UnitOrder(1) + Settings + Patterns
        const dataLength = 2 + settingsLength + patternsLength;
        const buffer = new Uint8Array(3 + dataLength);

        this.writeBlockHeader(buffer, 0, this.BLOCK_UNIT, dataLength);

        let offset = 3;

        // Unit Type and Order
        buffer[offset++] = this.UNIT_TB303;
        buffer[offset++] = unitOrder;

        // Settings Section
        buffer[offset++] = waveform;
        buffer[offset++] = paramValues.length;
        for (const val of paramValues) {
            buffer[offset++] = Math.min(255, Math.max(0, val));
        }

        // Pattern Section
        const seqKey = unitOrder === 0 ? 'seq303_1' : 'seq303_2';
        for (const patternIdx of patternIndices) {
            const pattern = state.patterns?.[patternIdx];
            const seq = pattern?.[seqKey] || [];

            for (let step = 0; step < 16; step++) {
                const s = seq[step] || { active: false, note: 'C', octave: 2, accent: false, slide: false };

                // Note byte: MIDI pitch
                const noteOffset = this.noteToMidi[s.note] || 0;
                const midiPitch = 12 * (s.octave + 1) + noteOffset;
                buffer[offset++] = Math.min(127, Math.max(0, midiPitch));

                // Attr byte: GATE(0) | ACCENT(1) | SLIDE(2)
                let attr = 0;
                if (s.active) attr |= 0x01;
                if (s.accent) attr |= 0x02;
                if (s.slide) attr |= 0x04;
                buffer[offset++] = attr;
            }
        }

        return buffer;
    }

    // Encode TR-909 Unit Block (0x02)
    encodeTR909UnitBlock(state, unitOrder, patternIndices) {
        const knobs = state.k || {};

        // TR-909 Instruments and their parameters
        const instruments = [
            { id: this.TR909_BD, params: ['bd_p1-input', 'bd_p2-input', 'bd_p3-input', 'bd_level-input'] },
            { id: this.TR909_SD, params: ['sd_p1-input', 'sd_p2-input', 'sd_p3-input', 'sd_level-input'] },
            { id: this.TR909_CH, params: ['ch_p1-input', 'ch_level-input'] },
            { id: this.TR909_OH, params: ['oh_p1-input', 'oh_level-input'] },
            { id: this.TR909_CP, params: ['cp_p1-input', 'cp_level-input'] }
        ];

        // Calculate settings length
        // InstrumentCount(1) + per instrument: ID(1) + ParamCount(1) + Params
        let settingsLength = 1;
        for (const instr of instruments) {
            settingsLength += 2 + instr.params.length;
        }

        // Calculate patterns length
        // Per pattern: InstrumentCount(1) + per instrument: ID(1) + AttrCount(1) + Attrs(2 bytes each)
        // Assuming only TRIGGER attr for now
        const patternDataPerPattern = 1 + instruments.length * (1 + 1 + 2);
        const patternsLength = patternIndices.length * patternDataPerPattern;

        // Total data length
        const dataLength = 2 + settingsLength + patternsLength;
        const buffer = new Uint8Array(3 + dataLength);

        this.writeBlockHeader(buffer, 0, this.BLOCK_UNIT, dataLength);

        let offset = 3;

        // Unit Type and Order
        buffer[offset++] = this.UNIT_TR909;
        buffer[offset++] = unitOrder;

        // Settings Section
        buffer[offset++] = instruments.length;
        for (const instr of instruments) {
            buffer[offset++] = instr.id;
            buffer[offset++] = instr.params.length;
            for (const paramKey of instr.params) {
                const val = knobs[paramKey] ?? 50;
                buffer[offset++] = Math.min(100, Math.max(0, Math.round(val)));
            }
        }

        // Pattern Section
        const trackKeys = ['bd', 'sd', 'ch', 'oh', 'cp'];
        for (const patternIdx of patternIndices) {
            const pattern = state.patterns?.[patternIdx];
            const seq909 = pattern?.seq909 || {};

            buffer[offset++] = instruments.length;

            for (let i = 0; i < instruments.length; i++) {
                const trackKey = trackKeys[i];
                const track = seq909[trackKey] || Array(16).fill(0);

                buffer[offset++] = instruments[i].id;
                buffer[offset++] = 1; // AttrCount: only TRIGGER

                // TRIGGER bitmask (16 bits, little-endian)
                let triggerBits = 0;
                for (let step = 0; step < 16; step++) {
                    if (track[step] > 0) {
                        triggerBits |= (1 << step);
                    }
                }
                this.writeUint16LE(buffer, offset, triggerBits);
                offset += 2;
            }
        }

        return buffer;
    }

    // Combine multiple buffers into one
    combineBuffers(buffers) {
        const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const buf of buffers) {
            result.set(buf, offset);
            offset += buf.length;
        }
        return result;
    }

    // Convert to Base64URL (RFC 4648)
    toBase64URL(binaryData) {
        let binary = '';
        for (let i = 0; i < binaryData.length; i++) {
            binary += String.fromCharCode(binaryData[i]);
        }
        // Standard Base64
        let base64 = btoa(binary);
        // Convert to Base64URL
        base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return base64;
    }

    // Legacy method for compatibility
    toBase64(binaryData) {
        return this.toBase64URL(binaryData);
    }

    // Main encode function (for file save - Full mode)
    encode(state) {
        return this.encodeFull(state);
    }
}