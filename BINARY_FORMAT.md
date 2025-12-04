# AcidBros Binary Format Specification

This document specifies the binary format for the AcidBros synthesizer data. This format is designed to be compact and efficient for sharing via URLs.

## Format Overview

The format uses a block-based structure similar to MP3 header formats. Each block contains:
- A 1-byte block ID
- A 2-byte block length (little-endian)
- The block data

## Block Structure

### Header Format
Each block starts with a 3-byte header:
- Byte 0: Block ID (0x00 - 0xFF)
- Bytes 1-2: Block length in bytes (little-endian)

```
[Block ID (1 byte)][Length (2 bytes)][Block Data...]
```

## Block Types

| Block ID | Name | Description |
|----------|------|-------------|
| 0x00 | End of Data | Marks the end of the data stream |
| 0x01 | Global Settings | Tempo, swing, mode, song sequence |
| 0x02 | Unit Block | Complete data for one synth unit (settings + patterns) |

---

### 0x00 - End of Data Block
```
[0x00][0x00 0x00]
```
- Block ID: `0x00`
- Length: `0x0000` (0 bytes)
- Used to mark the end of the data stream

---

### 0x01 - Global Settings Block
```
[0x01][Length (2 bytes)][Tempo][Swing][Mode][Pattern Index][Song Length][Song Sequence...]
```

| Field | Size | Description |
|-------|------|-------------|
| Tempo | 1 byte | BPM (60-200) |
| Swing | 1 byte | Swing amount (0-100%) |
| Mode | 1 byte | Share mode (see below) |
| Pattern Index | 1 byte | Current pattern ID (0-15), used in Pattern mode |
| Song Length | 1 byte | Number of patterns in song (0 if not Song/Full mode) |
| Song Sequence | N bytes | Pattern IDs (0-15), one byte each |

**Mode Values:**

| Value | Mode | Description | Unit Block Contains |
|-------|------|-------------|---------------------|
| 0x00 | Pattern | Single pattern share | Settings + 1 Pattern (at Pattern Index) |
| 0x01 | Song Only | Song arrangement only | No Unit Blocks (sequence only) |
| 0x02 | Full | Complete project | Settings + 16 Patterns + Song |

**Estimated URL Length by Mode:**

| Mode | Binary Size | Base64URL | URL Length |
|------|-------------|-----------|------------|
| Pattern (single) | ~155 bytes | ~207 chars | **~250 chars** |
| Song Only | ~37 bytes | ~50 chars | **~90 chars** |
| Full (16 patterns) | ~1,464 bytes | ~1,952 chars | **~2,000 chars** |

---

## Unit Block Details (0x02)

Each unit (TB-303 or TR-909) is encoded as a single 0x02 block containing both settings and patterns.

### TB-303 Unit Block

```
[0x02][Length][0x01][Unit Order][Settings][Pattern 0]...[Pattern 15]
```

#### TB-303 Settings Section
```
[Waveform (1 byte)][Param Count (1 byte)][Param Values...]
```

| Field | Size | Description |
|-------|------|-------------|
| Waveform | 1 byte | 0x00 = Sawtooth, 0x01 = Square |
| Param Count | 1 byte | Number of parameters (currently 9) |
| Param Values | 1 byte each | Values in fixed order |

**TB-303 Parameter Order:**

| Index | Parameter | Range | Description |
|-------|-----------|-------|-------------|
| 0 | TUNE | 0-240 | Maps to -1200 ~ +1200 cents |
| 1 | CUTOFF | 0-100 | Filter cutoff |
| 2 | RESO | 0-15 | Resonance |
| 3 | ENV | 0-100 | Envelope modulation |
| 4 | DECAY | 0-100 | Envelope decay |
| 5 | ACCENT | 0-100 | Accent amount |
| 6 | VOL | 0-100 | Volume |
| 7 | DELAY TIME | 0-200 | Delay time |
| 8 | DELAY FB | 0-100 | Delay feedback |

#### TB-303 Pattern Section (×16 patterns)
Each pattern: 16 steps × 2 bytes = 32 bytes

```
[Pattern 0][Pattern 1]...[Pattern 15]
```

**Per-Pattern Structure:**
```
[Step 0 Note][Step 0 Attr][Step 1 Note][Step 1 Attr]...[Step 15 Note][Step 15 Attr]
```

| Byte | Size | Description |
|------|------|-------------|
| Note | 1 byte | MIDI pitch (0-127, e.g., 36=C2, 60=C4) |
| Attr | 1 byte | Attribute bit field |

**Attribute Byte (Bit Field):**

| Bit | Name | Description |
|-----|------|-------------|
| 0 | GATE | 0 = Off, 1 = On |
| 1 | ACCENT | 0 = Normal, 1 = Accented |
| 2 | SLIDE | 0 = Normal, 1 = Slide |
| 3-7 | Reserved | Set to 0 |

---

### TR-909 Unit Block

```
[0x02][Length][0x02][Unit Order][Settings][Pattern 0]...[Pattern 15]
```

#### TR-909 Settings Section
```
[Instrument Count (1 byte)][Instrument 0 Settings]...[Instrument N Settings]
```

**Per-Instrument Settings:**
```
[Instrument ID (1 byte)][Param Count (1 byte)][Param Values...]
```

| Field | Size | Description |
|-------|------|-------------|
| Instrument ID | 1 byte | 0x00=BD, 0x01=SD, 0x02=CH, 0x03=OH, 0x04=CP |
| Param Count | 1 byte | Number of parameters |
| Param Values | 1 byte each | Values in fixed order per instrument |

**TR-909 Instrument Parameters:**

| ID | Instrument | Params | Param 0 | Param 1 | Param 2 | Param 3 |
|----|------------|--------|---------|---------|---------|---------|
| 0x00 | BD | 4 | Tune | Attack | Decay | Level |
| 0x01 | SD | 4 | Tune | Snappy | Decay | Level |
| 0x02 | CH | 2 | Tune | Level | - | - |
| 0x03 | OH | 2 | Decay | Level | - | - |
| 0x04 | CP | 2 | Decay | Level | - | - |

#### TR-909 Pattern Section (×16 patterns)
Each pattern contains data for all instruments.

```
[Pattern 0][Pattern 1]...[Pattern 15]
```

**Per-Pattern Structure:**
```
[Instrument Count (1 byte)][Instrument 0 Data]...[Instrument N Data]
```

**Per-Instrument Pattern Data:**
```
[Instrument ID (1 byte)][Attr Count (1 byte)][Attr 0 Steps (2 bytes)]...[Attr N Steps (2 bytes)]
```

| Field | Size | Description |
|-------|------|-------------|
| Instrument ID | 1 byte | 0x00=BD, 0x01=SD, 0x02=CH, 0x03=OH, 0x04=CP |
| Attr Count | 1 byte | Number of attribute bitmasks |
| Attr Steps | 2 bytes each | 16-bit bitmask (little-endian) |

**Attribute Order:**

| Index | Attribute | Description |
|-------|-----------|-------------|
| 0 | TRIGGER | Step triggers (required) |
| 1 | ACCENT | Accented steps (optional) |
| 2 | FLAM | Flam effect (optional) |

**Step Bitmask (2 bytes, little-endian):**
- Bit 0 = Step 0, Bit 1 = Step 1, ..., Bit 15 = Step 15

**Example:** BD with triggers on steps 0,4,8,12 and accent on step 0:
```
00          ; Instrument ID: BD
02          ; Attr Count: 2 (TRIGGER + ACCENT)
11 11       ; TRIGGER: 0x1111 (steps 0,4,8,12)
01 00       ; ACCENT: 0x0001 (step 0 only)
```

## Note Encoding

Notes are encoded using MIDI pitch values directly (0-127), where:
- 36: C2 (TB-303 default low)
- 48: C3
- 60: Middle C (C4)
- 72: C5
- etc.

---

## Complete Byte Sequence Example

Here's a complete example of encoded data for a minimal pattern:

### Example: Simple Pattern with TB-303 and TR-909

**Global Settings Block (0x01):**
```
01          ; Block ID: Global Settings
05 00       ; Length: 5 bytes
7D          ; Tempo: 125 BPM
32          ; Swing: 50%
00          ; Mode: Pattern
00          ; Song length: 0 (pattern mode)
```

**Instrument Settings Block (0x02) - TB-303 Unit 1:**
```
02          ; Block ID: Instrument Settings
0D 00       ; Length: 13 bytes
01          ; Unit Type: TB-303
00          ; Unit Order: 0 (first)
; --- Settings Section ---
00          ; Waveform: Sawtooth
09          ; Param Count: 9
78          ; TUNE: 120 (maps to 0 cents)
64          ; CUTOFF: 100
0F          ; RESO: 15
32          ; ENV: 50
32          ; DECAY: 50
50          ; ACCENT: 80
64          ; VOL: 100
64          ; DELAY TIME: 100
32          ; DELAY FB: 50
; --- Pattern Section (16 patterns × 32 bytes each) ---
; Pattern 0:
24 01       ; Step 0: C2 (36), Gate ON
26 01       ; Step 1: D2 (38), Gate ON
00 00       ; Step 2: rest
28 03       ; Step 3: E2 (40), Gate ON + Accent
... (remaining 12 steps of pattern 0)
... (patterns 1-15, each 32 bytes)
```

**Unit Block (0x02) - TR-909:**
```
02          ; Block ID: Unit Block
XX XX       ; Length: (variable)
02          ; Unit Type: TR-909
00          ; Unit Order: 0
; --- Settings Section ---
05          ; Instrument Count: 5
; BD Settings:
00          ; Instrument ID: BD
04          ; Param Count: 4
32 32 32 64 ; Tune, Attack, Decay, Level
; SD Settings:
01          ; Instrument ID: SD
04          ; Param Count: 4
32 32 32 64 ; Tune, Snappy, Decay, Level
; CH Settings:
02          ; Instrument ID: CH
02          ; Param Count: 2
32 64       ; Tune, Level
; OH Settings:
03          ; Instrument ID: OH
02          ; Param Count: 2
32 64       ; Decay, Level
; CP Settings:
04          ; Instrument ID: CP
02          ; Param Count: 2
32 64       ; Decay, Level
; --- Pattern Section (16 patterns) ---
; Pattern 0:
05          ; Instrument Count: 5
00 01 11 11 ; BD: ID, AttrCount=1, TRIGGER steps 0,4,8,12
01 01 44 44 ; SD: ID, AttrCount=1, TRIGGER steps 2,6,10,14
02 01 AA AA ; CH: ID, AttrCount=1, TRIGGER steps 1,3,5,7,9,11,13,15
03 01 00 00 ; OH: ID, AttrCount=1, no triggers
04 01 00 00 ; CP: ID, AttrCount=1, no triggers
... (patterns 1-15)
```

**End of Data Block (0x00):**
```
00          ; Block ID: End of Data
00 00       ; Length: 0
```

---

## Decoding Strategy

When decoding:
1. Read blocks sequentially until end-of-data block (0x00) is encountered
2. For each block, read the 3-byte header (ID + Length)
3. Parse block data according to block type
4. If a required block is missing, apply default values
5. Apply decoded values to the synth state

---

## Default Values

If blocks are missing during decoding:
| Setting | Default Value |
|---------|---------------|
| Tempo | 125 BPM |
| Swing | 50% |
| Mode | Pattern mode |
| TB-303 Waveform | Sawtooth (0x00) |
| TB-303 Parameters | Application defaults |
| TR-909 Parameters | Application defaults |
| Pattern data | All steps inactive |
| Song sequence | Pattern 0 only |

---

## URL Encoding

For URL sharing, the binary data is encoded using Base64URL (RFC 4648):
- Standard Base64 with `-` instead of `+` and `_` instead of `/`
- No padding (`=`) characters
- The resulting string is appended to the URL fragment: `https://example.com/#<base64url-data>`