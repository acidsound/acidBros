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
| 0x03 | Metadata Block | Track visibility and custom sample mappings |

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

### 1.3 Share Mode (1 Byte)
- `0x00`: **Pattern Mode** (Single Pattern)
- `0x01`: **Song Mode** (Song Sequence + All Patterns, but using current unit settings)
- `0x02`: **Full Project** (Song + Patterns + **Per-Pattern Settings**)
  - *Note: In v4, this mode was updated to store settings for each pattern individually. This is a breaking change from v3.*

---

## 2. Unit Blocks (ID: 0x02)

### 2.3 Unit Data Structure
The structure of the data depends on the **Share Mode** defined in the Global Block.

#### A. Share Mode = 0x00 (Pattern Mode)
Contains data for a **single pattern** (the current one).
- **[Settings]**: Unit-specific settings (11 bytes for TB-303, Varies for TR-909)
- **[Pattern Data]**: Sequence data for 1 pattern (32 bytes for TB-303, Varies for TR-909)

#### B. Share Mode = 0x01 (Song Mode - Legacy Style)
Contains data for **all 16 patterns**, but assumes global unit settings.
- **[Global Settings]**: Unit-specific settings applied to ALL patterns (Header).
- **[Pattern 0 Data]**: Sequence Only
- **[Pattern 1 Data]**: Sequence Only
- ...
- **[Pattern 15 Data]**: Sequence Only

#### C. Share Mode = 0x02 (Full Project - v4 Style)
Contains **settings AND data** for **all 16 patterns**.
- **(No Global Settings in Header)**
- **[Pattern 0 Settings]**: Unit settings for Pattern 0
- **[Pattern 0 Data]**: Sequence for Pattern 0
- **[Pattern 1 Settings]**: Unit settings for Pattern 1
- **[Pattern 1 Data]**: Sequence for Pattern 1
- ...
- **[Pattern 15 Settings]**: Unit settings for Pattern 15
- **[Pattern 15 Data]**: Sequence for Pattern 15

---

### 2.4 TB-303 Data Format

#### Settings Block (11 Bytes)
Used in Pattern Mode (once), Full Mode (per pattern), or Song Mode (Global Header).
1.  **Waveform** (1 Byte): `0x00` (Sawtooth), `0x01` (Square)
2.  **Param Count** (1 Byte): `0x09` (Fixed for now)
3.  **Tuning** (1 Byte): 0-255 (Center 127)
4.  **Cutoff** (1 Byte): 0-127
5.  **Resonance** (1 Byte): 0-127
6.  **Env Mod** (1 Byte): 0-127
7.  **Decay** (1 Byte): 0-127
8.  **Accent** (1 Byte): 0-127
9.  **Volume** (1 Byte): 0-127
10. **Delay Time** (1 Byte): 0-127
11. **Delay Feedback** (1 Byte): 0-127

#### Pattern Data Block (32 Bytes)
- 16 Steps × 2 Bytes per step
- **Byte 1**: MIDI Note (0-127). Example: 36 (C2) to 60 (C4).
- **Byte 2**: Attributes Bitmask
  - `Bit 0` (LSB): Gate (1=Active, 0=Rest)
  - `Bit 1`: Accent (1=On)
  - `Bit 2`: Slide (1=On)
  - `Bit 3-7`: Reserved (0)

---

### 2.5 TR-909 Data Format

#### Settings Block (Varies)
1. **Instrument Count** (1 Byte): `0x05` (BD, SD, CH, OH, CP)
2. **Instrument 0 (BD)**:
   - ID: `0x00`
   - Param Count: `0x04`
   - Params: Tune, Attack, Decay, Level
3. **Instrument 1 (SD)**:
   - ID: `0x01`
   - Param Count: `0x04`
   - Params: Tune, Snappy, Decay, Level
4. **Instrument 2 (CH)**:
   - ID: `0x02`
   - Param Count: `0x02`
   - Params: Decay, Level
... (Same for OH, CP)

#### Pattern Data Block (Varies)
1. **Pattern Instrument Count** (1 Byte): `0x05`
2. **Instrument 0 (BD)**:
   - ID: `0x00`
   - Attr Count: `0x01` (Just Triggers)
   - **Trigger Bits** (2 Bytes): 16 bits for 16 steps (1=Trig, 0=Rest)
... (Repeat for all instruments)

## Note Encoding

Notes are encoded using MIDI pitch values directly (0-127), where:
- 36: C2 (TB-303 default low)
- 48: C3
- 60: Middle C (C4)
- 72: C5
- etc.

---

## Complete Byte Sequence Example
 
 Here's a complete example of encoded data for a project in **Full Mode (v4)**:
 
 ### Example: Full Project with TB-303 and TR-909
 
 **Global Settings Block (0x01):**
 ```
 01          ; Block ID: Global Settings
 05 00       ; Length: 5 bytes
 7D          ; Tempo: 125 BPM
 32          ; Swing: 50%
 02          ; Mode: Full Project (v4)
 00          ; Pattern Index: 0 (current)
 01          ; Song length: 1
 00          ; Song Sequence: Pattern 0
 ```
 
 **Instrument Settings Block (0x02) - TB-303 Unit 1:**
 ```
 02          ; Block ID: Instrument Settings
 XX XX       ; Length: (Settings+Seq) * 16
 01          ; Unit Type: TB-303
 00          ; Unit Order: 0 (first)
 
 ; --- Pattern 0 ---
 ; [Settings]
 00          ; Waveform: Sawtooth
 09          ; Param Count: 9
 78 64 0F 32 32 50 64 64 32 ; Params...
 ; [Sequence]
 24 01       ; Step 0: C2 (36), Gate ON
 26 01       ; Step 1: D2 (38), Gate ON
 ... (14 more steps)
 
 ; --- Pattern 1 ---
 ; [Settings]
 01          ; Waveform: Square
 09          ; Param Count: 9
 ... (Params)
 ; [Sequence]
 ... (Steps)
 
 ; ... (Repeat for Patterns 2-15)
 ```
 
 **Unit Block (0x02) - TR-909:**
 ```
 02          ; Block ID: Unit Block
 XX XX       ; Length: (Settings+Seq) * 16
 02          ; Unit Type: TR-909
 00          ; Unit Order: 0
 
 ; --- Pattern 0 ---
 ; [Settings]
 05          ; Instrument Count
 00 04 32 32 32 64 ; BD Settings
 01 04 32 32 32 64 ; SD Settings
 ... (CH, OH, CP)
 ; [Sequence]
 05          ; Pattern Instr Count
 00 01 11 11 ; BD Triggers
 ... (SD, CH, OH, CP)
 
 ; --- Pattern 1 ---
 ; [Settings]
 ...
 ; [Sequence]
 ...
 
 ; ... (Repeat for Patterns 2-15)
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

| Pattern data | All steps inactive |
| Song sequence | Pattern 0 only |
| Active tracks | BD only |

---

## Metadata Block Details (0x03)

This block stores UI state and metadata that doesn't fit into patterns, such as track visibility and custom sample mappings.

```
[0x03][Length (2 bytes)][ActiveTracks (2 bytes)][MapCount (1 byte)][Mapping 0]...[Mapping N]
```

### Fields

| Field | Size | Description |
| :--- | :--- | :--- |
| **ActiveTracks** | 2 bytes | Bitmask of visible tracks (Little-Endian). Bit 0 = BD, Bit 1 = SD, etc. |
| **MapCount** | 1 byte | Number of custom sample mappings. |
| **Mapping** | Varies | Custom sample mapping entry. |

### ActiveTracks Bitmask Order
1.  Bit 0: BD
2.  Bit 1: SD
3.  Bit 2: LT
4.  Bit 3: MT
5.  Bit 4: HT
6.  Bit 5: RS
7.  Bit 6: CP
8.  Bit 7: CH
9.  Bit 8: OH
10. Bit 9: CR
11. Bit 10: RD

### Mapping Entry Structure
```
[TrackIndex (1 byte)][IDLength (1 byte)][SampleID (N bytes)]
```
- **TrackIndex**: matches the bitmask order (0=BD, 1=SD, etc).
- **IDLength**: Number of characters in the SampleID.
- **SampleID**: Character-based identifier for the sample (used to look up in IndexedDB).

---

## URL Encoding

For URL sharing, the binary data is encoded using Base64URL (RFC 4648):
- Standard Base64 with `-` instead of `+` and `_` instead of `/`
- No padding (`=`) characters
- The resulting string is appended to the URL fragment: `https://example.com/#<base64url-data>`