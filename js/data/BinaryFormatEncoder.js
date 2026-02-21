// BinaryFormatEncoder.js
// Encoder for the AcidBros binary format v4
// UPDATED: MODE_FULL (0x02) now stores per-pattern settings.

export class BinaryFormatEncoder {
    constructor() {
        // Block IDs
        this.BLOCK_END = 0x00;
        this.BLOCK_GLOBAL = 0x01;
        this.BLOCK_UNIT = 0x02;
        this.BLOCK_METADATA = 0x03;
        this.BLOCK_CUSTOM_SYNTH = 0x04;

        // Unit Types
        this.UNIT_TB303 = 0x01;
        this.UNIT_TR909 = 0x02;

        // Share Modes
        this.MODE_PATTERN = 0x00;
        this.MODE_SONG_ONLY = 0x01;
        this.MODE_FULL = 0x02;     // Full Project w/ Per-Pattern Settings
    }

    // Helper to write 16-bit unsigned integer in little-endian
    writeUint16LE(buffer, offset, value) {
        buffer[offset] = value & 0xFF;
        buffer[offset + 1] = (value >> 8) & 0xFF;
    }

    // Helper to write block header
    writeBlockHeader(buffer, offset, blockId, length) {
        buffer[offset] = blockId;
        this.writeUint16LE(buffer, offset + 1, length);
    }

    // Convert Buffer or Base64 String to Base64URL
    toBase64URL(input) {
        let base64;
        if (input instanceof Uint8Array) {
            let binary = '';
            const len = input.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(input[i]);
            }
            base64 = btoa(binary);
        } else {
            base64 = input;
        }
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    // Main encode function
    encode(state) {
        // Determine encoding mode based on input state or request
        // For file saving, we usually want Full Mode
        // For URL sharing logic in Data.js, it might call specific methods.

        // This method assumes 'Full Save' if not specified otherwise
        return this.encodeFull(state);
    }

    // Encode for URL Sharing (Single Pattern)
    encodeForShare(state) {
        return this.encodePattern(state, state.currentPatternId);
    }

    // Encode Full Project (v4 Style: Per-Pattern Settings)
    encodeFull(state) {
        const buffers = [];

        // Global Settings Block
        buffers.push(this.encodeGlobalBlock(state, this.MODE_FULL, 0));

        // All pattern indices
        const allPatterns = Array.from({ length: 16 }, (_, i) => i);

        // TB-303 Unit 1 Block
        buffers.push(this.encodeTB303UnitBlock(state, 0, allPatterns, this.MODE_FULL));

        // TB-303 Unit 2 Block
        buffers.push(this.encodeTB303UnitBlock(state, 1, allPatterns, this.MODE_FULL));

        // TR-909 Unit Block
        buffers.push(this.encodeTR909UnitBlock(state, 0, allPatterns, this.MODE_FULL));

        // Custom Synth patches for TR-909 tracks
        buffers.push(this.encodeTR909CustomSynthBlock(state, allPatterns));

        // Metadata Block
        buffers.push(this.encodeMetadataBlock(state));

        // End Block
        buffers.push(new Uint8Array([this.BLOCK_END, 0x00, 0x00]));

        return this.combineBuffers(buffers);
    }

    // Encode Single Pattern
    encodePattern(state, patternIndex) {
        const buffers = [];

        // Global Block
        buffers.push(this.encodeGlobalBlock(state, this.MODE_PATTERN, patternIndex));

        const patternIndices = [patternIndex];

        // TB-303 Unit 1
        buffers.push(this.encodeTB303UnitBlock(state, 0, patternIndices, this.MODE_PATTERN));

        // TB-303 Unit 2
        buffers.push(this.encodeTB303UnitBlock(state, 1, patternIndices, this.MODE_PATTERN));

        // TR-909 Unit
        buffers.push(this.encodeTR909UnitBlock(state, 0, patternIndices, this.MODE_PATTERN));

        // Custom Synth patches for shared pattern
        buffers.push(this.encodeTR909CustomSynthBlock(state, patternIndices));

        // Metadata Block
        buffers.push(this.encodeMetadataBlock(state));

        // End Block
        buffers.push(new Uint8Array([this.BLOCK_END, 0x00, 0x00]));

        return this.combineBuffers(buffers);
    }

    // Encode Global Block (0x01)
    encodeGlobalBlock(state, shareMode, patternIndex) {
        const songLength = state.song ? state.song.length : 0;
        const dataLength = 5 + songLength;
        const buffer = new Uint8Array(3 + dataLength);

        this.writeBlockHeader(buffer, 0, this.BLOCK_GLOBAL, dataLength);

        buffer[3] = state.bpm;
        buffer[4] = state.swing;
        buffer[5] = shareMode;
        buffer[6] = patternIndex & 0x0F;
        buffer[7] = songLength;

        if (songLength > 0) {
            for (let i = 0; i < songLength; i++) {
                buffer[8 + i] = state.song[i] & 0x0F;
            }
        }

        return buffer;
    }

    // Encode Metadata Block (0x03)
    // Format: [ActiveTracksUint16Bits][CustomMapCount][{TrackIdByte}{SampleIdString...}]
    encodeMetadataBlock(state) {
        const order = ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp', 'ch', 'oh', 'cr', 'rd'];
        let activeBits = 0;
        if (state.active909Tracks) {
            state.active909Tracks.forEach(tid => {
                const idx = order.indexOf(tid);
                if (idx !== -1) activeBits |= (1 << idx);
            });
        } else {
            activeBits = 1; // BD only
        }

        const customMap = state.customSampleMap || {};
        const mapEntries = Object.entries(customMap);

        // Estimate length: 2 (activeBits) + 1 (mapCount) + MapSize
        let mapSize = 0;
        mapEntries.forEach(([tid, sid]) => {
            mapSize += 1; // Track index
            mapSize += 1; // String length byte
            mapSize += sid.length;
        });

        const dataLength = 3 + mapSize;
        const buffer = new Uint8Array(3 + dataLength);
        this.writeBlockHeader(buffer, 0, this.BLOCK_METADATA, dataLength);

        this.writeUint16LE(buffer, 3, activeBits);
        buffer[5] = mapEntries.length;

        let offset = 6;
        mapEntries.forEach(([tid, sid]) => {
            const idx = order.indexOf(tid);
            buffer[offset++] = idx !== -1 ? idx : 0xFF;
            buffer[offset++] = sid.length;
            for (let i = 0; i < sid.length; i++) {
                buffer[offset++] = sid.charCodeAt(i);
            }
        });

        return buffer;
    }

    // Helper to get TB-303 data
    getTB303UnitData(state, unitOrder, patternIdx) {
        const pattern = state.patterns[patternIdx];
        const unitKey = unitOrder === 0 ? 'tb303_1' : 'tb303_2';
        const unit = pattern.units[unitKey];
        return {
            settings: unit.settings,
            sequence: unit.sequence
        };
    }

    // Helper to write TB-303 Settings (12 bytes)
    writeTB303Settings(buffer, offset, settings) {
        const isSquare = settings.waveform === 'square';
        buffer[offset++] = isSquare ? 0x01 : 0x00;
        buffer[offset++] = 0x0A; // Param Count (updated from 9 to 10)

        const mapVal = (val, max = 127) => Math.max(0, Math.min(max, Math.floor(val)));
        const mapTune = (val) => Math.floor(((val + 1200) / 2400) * 240); // -1200..1200 -> 0..240

        buffer[offset++] = mapTune(settings.tune);
        buffer[offset++] = mapVal(settings.cutoff);
        buffer[offset++] = mapVal(settings.reso);
        buffer[offset++] = mapVal(settings.env);
        buffer[offset++] = mapVal(settings.decay);
        buffer[offset++] = mapVal(settings.accent);
        buffer[offset++] = mapVal(settings.volume);
        buffer[offset++] = mapVal(settings.delayTime);
        buffer[offset++] = mapVal(settings.delayFb);
        buffer[offset++] = mapVal(settings.delayWet); // Default 50 if missing

        return offset;
    }

    // Helper to write TB-303 Sequence (32 bytes)
    writeTB303Sequence(buffer, offset, sequence) {
        const noteToMidi = (note, oct) => {
            const noteMap = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
            return 12 * (oct + 1) + noteMap[note];
        };

        for (let i = 0; i < 16; i++) {
            const step = sequence[i];
            const midiNote = noteToMidi(step.note, step.octave);

            let attr = 0;
            if (step.active) attr |= 0x01;
            if (step.accent) attr |= 0x02;
            if (step.slide) attr |= 0x04;

            buffer[offset++] = midiNote;
            buffer[offset++] = attr;
        }
        return offset;
    }

    // Encode TB-303 Unit Block (0x02)
    encodeTB303UnitBlock(state, unitOrder, patternIndices, mode) {
        // Mode Logic:
        // MODE_FULL (0x02): No header settings. Each pattern has [Settings][Sequence].
        // MODE_PATTERN (0x00): No header settings (conceptually). The single pattern is [Settings][Sequence].
        // MODE_SONG_ONLY (0x01): Header has Settings. Patterns are [Sequence] only.

        const isPerPatternSettings = (mode === this.MODE_FULL || mode === this.MODE_PATTERN);

        let headerSettingsLength = 0;
        let patternValues = [];

        // Prepare data
        for (const patternIdx of patternIndices) {
            const patternData = this.getTB303UnitData(state, unitOrder, patternIdx);
            patternValues.push(patternData);
        }

        // Calculate Header Settings Length
        if (!isPerPatternSettings) {
            // Song Mode: Header has full settings (11 bytes)
            headerSettingsLength = 11;
        }

        // Calculate Patterns Length
        let patternsLength = 0;
        if (isPerPatternSettings) {
            // Settings(11) + Sequence(32) = 43 bytes per pattern
            patternsLength = patternIndices.length * (11 + 32);
        } else {
            // Sequence(32) per pattern
            patternsLength = patternIndices.length * 32;
        }

        // Total data length
        const dataLength = 2 + headerSettingsLength + patternsLength;
        const buffer = new Uint8Array(3 + dataLength);

        this.writeBlockHeader(buffer, 0, this.BLOCK_UNIT, dataLength);

        let offset = 3;

        // Unit Type and Order
        buffer[offset++] = this.UNIT_TB303;
        buffer[offset++] = unitOrder;

        // Header Settings Section
        if (!isPerPatternSettings) {
            // Write settings of first pattern (or current global) as header
            // For Song Mode, we use the settings of the first pattern in list (usually 0)
            offset = this.writeTB303Settings(buffer, offset, patternValues[0].settings);
        }

        // Pattern Section
        for (const patternData of patternValues) {
            if (isPerPatternSettings) {
                // Write settings before sequence
                offset = this.writeTB303Settings(buffer, offset, patternData.settings);
            }
            // Write Sequence
            offset = this.writeTB303Sequence(buffer, offset, patternData.sequence);
        }

        return buffer;
    }

    // Helper to write TR-909 Settings
    writeTR909Settings(buffer, offset, tracks) {
        const shaperDefaults = {
            bd: { enabled: false, drop: 50, ring: 50, bright: 50 },
            sd: { enabled: false, drop: 50, ring: 50, bright: 50 },
            lt: { enabled: true, drop: 100, ring: 100, bright: 100 },
            mt: { enabled: true, drop: 100, ring: 100, bright: 100 },
            ht: { enabled: true, drop: 100, ring: 100, bright: 100 },
            rs: { enabled: false, drop: 50, ring: 50, bright: 50 },
            cp: { enabled: false, drop: 50, ring: 50, bright: 50 }
        };
        const instruments = [
            // Synth-voice tracks include DRUM SHAPER bytes.
            { id: 0x00, key: 'bd', params: ['tune', 'level', 'attack', 'decay', 'macro_enabled', 'drop', 'ring', 'bright'] },
            { id: 0x01, key: 'sd', params: ['tune', 'level', 'tone', 'snappy', 'macro_enabled', 'drop', 'ring', 'bright'] },
            { id: 0x05, key: 'lt', params: ['tune', 'level', 'decay', 'macro_enabled', 'drop', 'ring', 'bright'] },
            { id: 0x06, key: 'mt', params: ['tune', 'level', 'decay', 'macro_enabled', 'drop', 'ring', 'bright'] },
            { id: 0x07, key: 'ht', params: ['tune', 'level', 'decay', 'macro_enabled', 'drop', 'ring', 'bright'] },
            { id: 0x08, key: 'rs', params: ['level', 'macro_enabled', 'drop', 'ring', 'bright'] },
            { id: 0x04, key: 'cp', params: ['level', 'macro_enabled', 'drop', 'ring', 'bright'] },
            { id: 0x02, key: 'ch', params: ['level', 'ch_decay'] },
            { id: 0x03, key: 'oh', params: ['level', 'oh_decay'] },
            { id: 0x09, key: 'cr', params: ['level', 'cr_tune'] },
            { id: 0x0A, key: 'rd', params: ['level', 'rd_tune'] }
        ];
        const clampByte = (val, def = 50) => {
            const n = Number.isFinite(val) ? val : def;
            return Math.max(0, Math.min(127, Math.round(n)));
        };

        buffer[offset++] = instruments.length; // 11 instruments

        for (const instr of instruments) {
            const track = tracks[instr.key] || {};
            const shaperBase = track.customSynth?.shaper || track.customSynth?.tomMacros || shaperDefaults[instr.key] || {};
            buffer[offset++] = instr.id;
            buffer[offset++] = instr.params.length;

            for (const param of instr.params) {
                if (param === 'macro_enabled') {
                    buffer[offset++] = shaperBase.enabled === false ? 0 : 1;
                    continue;
                }
                if (param === 'drop' || param === 'ring' || param === 'bright') {
                    buffer[offset++] = clampByte(shaperBase[param], 50);
                    continue;
                }
                buffer[offset++] = clampByte(track[param], 50);
            }
        }
        return offset;
    }

    // Capture TR-909 Settings length
    getTR909SettingsLength() {
        const instruments = [
            ['bd', 8], ['sd', 8], ['lt', 7], ['mt', 7], ['ht', 7],
            ['rs', 5], ['cp', 5], ['ch', 2], ['oh', 2], ['cr', 2], ['rd', 2]
        ];
        const overhead = 1 + instruments.length * 2; // count + (id + pcount)*N
        const params = instruments.reduce((sum, item) => sum + item[1], 0);
        return overhead + params;
    }

    // Helper to write TR-909 Sequence
    writeTR909Sequence(buffer, offset, tracks) {
        const instruments = [
            { id: 0x00, key: 'bd' },
            { id: 0x01, key: 'sd' },
            { id: 0x05, key: 'lt' },
            { id: 0x06, key: 'mt' },
            { id: 0x07, key: 'ht' },
            { id: 0x08, key: 'rs' },
            { id: 0x02, key: 'ch' },
            { id: 0x03, key: 'oh' },
            { id: 0x09, key: 'cr' },
            { id: 0x0A, key: 'rd' },
            { id: 0x04, key: 'cp' }
        ];

        buffer[offset++] = instruments.length;

        for (const instr of instruments) {
            const track = tracks[instr.key];
            buffer[offset++] = instr.id;
            buffer[offset++] = 0x01; // Attr count (Triggers)

            // Trigger Bits
            let bits = 0;
            for (let i = 0; i < 16; i++) {
                if (track.steps[i]) bits |= (1 << i);
            }
            this.writeUint16LE(buffer, offset, bits);
            offset += 2;
        }
        return offset;
    }

    // Helper to get TR-909 Sequence length
    getTR909SequenceLength() {
        // 1 (count) + 11 * (1 (id) + 1 (attr count) + 2 (bits)) = 1 + 11*4 = 45 bytes
        return 45;
    }

    // Encode TR-909 Unit Block
    encodeTR909UnitBlock(state, unitOrder, patternIndices, mode) {
        const isPerPatternSettings = (mode === this.MODE_FULL || mode === this.MODE_PATTERN);

        let headerSettingsLength = 0;
        let patternValues = [];

        for (const patternIdx of patternIndices) {
            const pattern = state.patterns[patternIdx];
            patternValues.push(pattern.units.tr909.tracks);
        }

        const settingsLen = this.getTR909SettingsLength();
        const seqLen = this.getTR909SequenceLength();

        if (!isPerPatternSettings) {
            headerSettingsLength = settingsLen;
        }

        let patternsLength = 0;
        if (isPerPatternSettings) {
            patternsLength = patternIndices.length * (settingsLen + seqLen);
        } else {
            patternsLength = patternIndices.length * seqLen;
        }

        const dataLength = 2 + headerSettingsLength + patternsLength;
        const buffer = new Uint8Array(3 + dataLength);

        this.writeBlockHeader(buffer, 0, this.BLOCK_UNIT, dataLength);

        let offset = 3;

        // Unit Type and Order
        buffer[offset++] = this.UNIT_TR909;
        buffer[offset++] = unitOrder; // 0 usually

        // Header Settings
        if (!isPerPatternSettings) {
            offset = this.writeTR909Settings(buffer, offset, patternValues[0]);
        }

        // Patterns
        for (const tracks of patternValues) {
            if (isPerPatternSettings) {
                offset = this.writeTR909Settings(buffer, offset, tracks);
            }
            offset = this.writeTR909Sequence(buffer, offset, tracks);
        }

        return buffer;
    }

    encodeTR909CustomSynthBlock(state, patternIndices) {
        const trackMap = [
            { key: 'bd', id: 0x00 }, { key: 'sd', id: 0x01 },
            { key: 'lt', id: 0x05 }, { key: 'mt', id: 0x06 }, { key: 'ht', id: 0x07 },
            { key: 'rs', id: 0x08 }, { key: 'cp', id: 0x04 },
            { key: 'ch', id: 0x02 }, { key: 'oh', id: 0x03 },
            { key: 'cr', id: 0x09 }, { key: 'rd', id: 0x0A }
        ];
        const encoder = new TextEncoder();
        const patterns = [];

        for (const patternIdx of patternIndices) {
            const pattern = state.patterns?.[patternIdx];
            const tracks = pattern?.units?.tr909?.tracks;
            if (!tracks || typeof tracks !== 'object') continue;

            const entries = [];
            for (const track of trackMap) {
                const patch = tracks[track.key]?.customSynth;
                if (!patch || typeof patch !== 'object' || Object.keys(patch).length === 0) continue;
                let json;
                try {
                    json = JSON.stringify(patch);
                } catch (e) {
                    continue;
                }
                if (!json) continue;
                const bytes = encoder.encode(json);
                if (bytes.length > 0xFFFF) continue;
                entries.push({ id: track.id, bytes });
            }

            if (entries.length > 0) {
                patterns.push({ patternIdx, entries });
            }
        }

        if (patterns.length === 0) {
            return new Uint8Array(0);
        }

        let dataLength = 3; // unit type + unit order + pattern count
        for (const pattern of patterns) {
            dataLength += 2; // pattern index + track patch count
            for (const entry of pattern.entries) {
                dataLength += 1 + 2 + entry.bytes.length; // track id + json length + payload
            }
        }

        const buffer = new Uint8Array(3 + dataLength);
        this.writeBlockHeader(buffer, 0, this.BLOCK_CUSTOM_SYNTH, dataLength);

        let offset = 3;
        buffer[offset++] = this.UNIT_TR909;
        buffer[offset++] = 0x00;
        buffer[offset++] = patterns.length;

        for (const pattern of patterns) {
            buffer[offset++] = pattern.patternIdx & 0x0F;
            buffer[offset++] = pattern.entries.length;
            for (const entry of pattern.entries) {
                buffer[offset++] = entry.id;
                this.writeUint16LE(buffer, offset, entry.bytes.length);
                offset += 2;
                buffer.set(entry.bytes, offset);
                offset += entry.bytes.length;
            }
        }

        return buffer;
    }

    combineBuffers(buffers) {
        let totalLength = 0;
        for (const b of buffers) totalLength += b.length;

        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const b of buffers) {
            combined.set(b, offset);
            offset += b.length;
        }
        return combined;
    }
}
