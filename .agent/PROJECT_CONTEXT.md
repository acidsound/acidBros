# acidBros - Project Context

## Project Overview
Web-based TB-303 and TR-909 synthesizer/sequencer using Web Audio API.
- **Live URL**: https://acidsound.github.io/acidBros/
- **Current Version**: v82
- **Repository**: https://github.com/acidsound/acidBros

## Architecture

### Audio Engine
- **Location**: `js/audio/AudioEngine.js`
- **Timing System**: 
  - Primary: AudioWorklet (`ClockProcessor.js`) for precise timing
  - Fallback: `setTimeout` scheduler for insecure contexts (HTTP/local network)
  - Lookahead: 100ms for scheduling
- **Signal Chain**: `Instruments → Master Compressor → Analyser → Output`
- **Instruments**:
  - `TB303.js`: Two independent TB-303 units with delay effect
  - `TR909.js`: Five drum tracks (BD, SD, CH, OH, Clap)

### UI System
- **Location**: `js/ui/UI.js`
- **Knob Control**: `js/ui/RotaryKnob.js`
  - **Multi-touch Support**: Global `TouchManager` class handles multiple simultaneous touches
  - **Interaction**: Vertical drag (up/down) changes values
  - **Touch ID Tracking**: Each knob tracks its specific touch identifier
  - **Double-tap**: Resets to default value
- **Oscilloscope**: `js/ui/Oscilloscope.js` handles real-time waveform visualization
- **Data Management**: 
  - `js/data/Data.js`: Handles patterns and song mode
  - `js/data/FileManager.js`: Persistent file storage using localStorage

### MIDI System (New)
- **Location**: `js/midi/MidiManager.js`
- **Functionality**:
  - Web MIDI API integration
  - MIDI Learn mode for dynamic mapping
  - Keyboard mapping support (PC/Bluetooth)
  - Device management and connection monitoring
  - Persistent mapping storage

### Key Design Decisions

#### 1. AudioWorklet Migration (v44-45)
- **Why**: Precise timing, better than setTimeout
- **Fallback**: Detects `audioWorklet` availability, falls back to setTimeout if unavailable
- **Implementation**: `ClockProcessor.js` sends tick messages with lookahead time

#### 2. Multi-touch Support (v45)
- **Problem**: Multiple knobs couldn't be controlled simultaneously
- **Solution**: Global `TouchManager` class
  - Maps `touchId` → knob instance
  - Single global event listener distributes events to correct knobs
  - Each knob only processes its own touch

#### 3. Mobile Touch Handling (v45-46)
- **Vertical Drag**: Knobs use vertical drag for value changes
- **Touch Action**: `touch-action: none` on knobs to prevent browser interference
- **Pinch Zoom Prevention** (v46):
  - Gesture events blocked (`gesturestart`, `gesturechange`, `gestureend`)
  - Double-tap zoom blocked (300ms threshold)
  - Ctrl+wheel zoom blocked on desktop

#### 4. Service Worker & PWA
- **Cache Version**: Currently v70 (increment on each deployment)
- **Strategy**: Cache-first for offline support
- **Assets**: All JS, CSS, HTML, fonts cached

## File Structure
```
acidBros/
├── index.html              # Main HTML, includes anti-zoom scripts
├── styles.css              # All styling, responsive design
├── sw.js                   # Service worker (cache v70)
├── manifest.json           # PWA manifest
├── js/
│   ├── main.js            # Entry point
│   ├── audio/
│   │   ├── AudioEngine.js # Main audio engine with worklet/fallback
│   │   ├── ClockProcessor.js # AudioWorklet processor
│   │   ├── TB303.js       # TB-303 synth voice
│   │   └── TR909.js       # TR-909 drum machine
│   ├── ui/
│   │   ├── UI.js          # Main UI controller
│   │   ├── RotaryKnob.js  # Knob component with TouchManager
│   │   └── Oscilloscope.js # Real-time waveform visualizer
│   ├── data/
│   │   ├── Data.js        # Pattern/song data management
│   │   └── FileManager.js # Persistent file storage
│   └── midi/
│       └── MidiManager.js # MIDI & Keyboard mapping logic
└── assets/
    ├── favicon.png
    └── DSEG7Classic-Bold.woff2 # 7-segment display font
```

## Common Issues & Solutions

### Issue: Knobs not working on mobile
- **Check**: `TouchManager` properly initialized
- **Check**: `touch-action: none` on `.rotary-knob`
- **Check**: Event listeners use `{ passive: false }`

### Issue: AudioWorklet not loading
- **Cause**: Insecure context (HTTP instead of HTTPS)
- **Solution**: Automatic fallback to setTimeout scheduler
- **Check**: Console for "AudioWorklet not supported" warning

### Issue: Multi-touch not working
- **Cause**: Multiple knobs sharing same event handlers
- **Solution**: Global `TouchManager` distributes events by `touchId`
- **Check**: Each knob has unique `touchId` when dragging

### Issue: Service Worker not updating
- **Solution**: Increment `CACHE_NAME` in `sw.js`
- **Solution**: Hard refresh (Cmd+Shift+R) or clear cache
- **Check**: Version display in transport controls

## Deployment Workflow
1. Make changes
2. Update version in 3 places:
   - `sw.js`: `CACHE_NAME = 'acidbros-vXX'`
   - `index.html`: `<div class="version-display">vXX</div>`
3. Commit with descriptive message
4. Push to `main` branch
5. GitHub Pages auto-deploys in ~1-2 minutes

## Development Notes

### Testing Multi-touch
- **Desktop**: Cannot test (single mouse pointer)
- **Mobile**: Use two fingers on different knobs simultaneously
- **Expected**: Both knobs move independently

### Audio Context Resume
- **Requirement**: User gesture needed to start audio
- **Implementation**: Play button calls `ctx.resume()`
- **Check**: `ctx.state === 'running'` after play

### Pattern/Song Mode
- **Pattern Mode**: 16 independent patterns (P1-P16)
- **Song Mode**: Arrange patterns in timeline
- **Storage**: LocalStorage for persistence
- **Share**: URL encoding for pattern sharing

## Recent Changes (v57-v82)

### v57: File Manager
- **File Management System**: Complete file save/load functionality
  - **FileManager.js**: New module for persistent storage using localStorage
  - **Auto-save**: Every 5 seconds with timestamp-based naming (yyyy-MM-ddhhmmss)
  - **File Operations**: New, Load, Duplicate, Rename, Delete, Delete All
  - **Import/Export**: JSON-based backup/restore for all files
  - **UI**: Popover interface matching piano-overlay design
    - Overlay backdrop with blur effect
    - File list with active state highlighting
    - Per-file action buttons (Duplicate, Rename, Delete)
    - Header actions (New, Import, Export, Delete All)
- **Layout Improvements**:
  - Mode controls restructured with static HTML
  - File Manager button added next to Mode Switch
  - Consistent styling with mode-switch (rectangular, not round)
  - Proper z-index for toast notifications (2100)
- **UX Enhancements**:
  - File Manager button positioned on right with FILE label
  - Delete/Duplicate moved from header to individual file items
  - Active file properly highlighted on first open
  - Close button positioned absolutely in top-right corner

### v61-v63: SEO & Accessibility
- **Meta Tags**: Added OpenGraph, Twitter Cards, and comprehensive SEO metadata
- **Accessibility**: Improved ARIA labels and semantic HTML structure
- **Performance**: Optimized asset loading and caching strategies

### v64: MIDI & Keyboard Mapping
- **Settings Panel**: New interface for managing mappings
- **MIDI Learn**: Dynamic mapping of MIDI controllers to UI elements
- **Keyboard Support**: Map PC/Bluetooth keyboard keys to controls
- **Persistence**: Mappings saved to localStorage

### v65: MIDI Device Management & UX Improvements
- **Device Management**: View connected MIDI devices and their status in Settings
- **Enhanced Learn Mode**:
  - **Transport Control**: Play/Stop buttons are now mappable
  - **Waveform Switching**: TB-303 waveform toggles are mappable
  - **Mobile UX**: Improved Learn Mode banner positioning (inside rack, not fixed)
- **Visual Feedback**: Green/Red status indicators for MIDI devices

### v66-v67: UI Parameter Initialization & Audio Engine Fixes
- **Parameter Initialization**: Fixed issue where UI parameters were not properly initialized, causing NaN values in audio engine
  - Modified `get303Params` and `get909Params` to use correct input element IDs with `-input` suffix
  - Added UI initialization check in `AudioEngine.play()` to ensure UI is ready before starting audio
  - Added `Data.randomize()` call in `Data.init()` to ensure parameters are initialized with valid values
- **Audio Engine Validation**: Added parameter validation in TB303 and TR909 play functions to prevent NaN values from causing audio glitches
- **TR909 Parameter Adjustments**: Updated parameter validation in TR909 `playBD` function to match UI controls

### v68: UI Reorganization & Swing Visualization
- **External Links Removed**: Removed buymeacoffee button per publisher requirements
- **Transport Bar Reorganization**:
  - File Manager button moved to transport bar (first position)
  - Settings button moved to transport bar (after Share)
- **Mode Controls Reorganization**:
  - Shuffle button moved to mode controls section (right side)
  - New SVG icon for Shuffle (visualizing beat pattern: ⚫️ ⚪️⚫️)
- **Swing Controller Enhancement**:
  - Replaced ribbon fill bars with dot-based visualization
  - Fixed dots represent strong beats, moving dots represent weak beats
  - Guide lines indicate straight beat position (50% swing)
  - Visual feedback shows how much swing is applied
  - Fixed overflow issue for swing values > 75%
- **CSS Improvements**:
  - Added `-webkit-tap-highlight-color: transparent` to prevent flash on touch
  - Updated `.file-manager-btn` with light gradient background

### v69: Swing Controller Interaction Improvement
- **Position-aware Swing Control**:
  - Restored 4-dot visualization (2 fixed + 2 moving) for better beat perception
  - Drag starting in left half (0-50%) controls swingDot1
  - Drag starting in right half (50-100%) controls swingDot2
  - Moving dot directly follows touch/mouse position for intuitive control
  - Both dots always reflect the same swing value (synchronized)

### v70: Tempo Knob Bug Fix
- **Bug Fix**: Fixed tempo knob not updating AudioEngine tempo
  - Changed event listener to use correct element ID (`tempo-input` instead of `tempo`)
  - RotaryKnob uses `-input` suffix for hidden input elements since v67

### v71: Binary Format for Sharing
- **New Feature**: Compact binary format for URL sharing
  - `BINARY_FORMAT.md`: Complete specification document
  - `BinaryFormatEncoder.js`: Encode synth state to compact binary
  - `BinaryFormatDecoder.js`: Decode binary back to synth state
  - Base64URL encoding (URL-safe, no percent-encoding needed)
- **Share Modes**:
  - Pattern Mode (0x00): Single pattern (~250 chars URL)
  - Song Only Mode (0x01): Just song sequence (~90 chars URL)
  - Full Mode (0x02): All 16 patterns + song (for file save)
- **File Format Migration**:
  - Auto-detects old JSON format files in localStorage
  - Converts to new binary format on load
  - User confirmation before clearing corrupted storage

### v72: Pattern Import from URL
- **Pattern Paste Enhancement**:
  - **One-click Import**: Pasting a shared URL into a pattern slot automatically decodes and imports it
  - **Clipboard Integration**: Automatically detects if system clipboard contains a valid AcidBros URL
  - **Hash Decoding**: Extracts and decodes the pattern data from URL hash
- **Song Sharing Workflow**:
  - Defined comprehensive workflow for sharing complete songs (Song URL + individual Pattern URLs)
  - Added detailed guides in User Manual for both simple import and advanced song sharing

### v74: TR-909 Knob Persistence Fix & File Load Fix
- **Global Parameter Persistence**: Fixed issue where TR-909 knobs (Tune, Level, Decay) would reset to default when switching patterns. Now they correctly maintain their values across pattern changes, matching TB-303 behavior.
- **Double-click Reset**: Fixed side effect where double-clicking a knob would sometimes reset to the previous value instead of the default value. Now consistently resets to factory default.
- **Knob Value Restoration**: Fixed bug where knob values (both TB-303 and TR-909) were not being restored when loading saved files. The issue was caused by a key mismatch between encoder/decoder (`-input` suffix) and knob instances.

### v75: Waveform Toggle MIDI/Keyboard Mapping & Learning Guide
- **Unified Waveform Toggle**: Waveform switches now support single-key/MIDI-note toggle mapping. Previously, sawtooth and square had separate mappings. Now mapped to `.waveform-switch` container, a single press toggles between the two waveforms.
- **New Mapping Type**: Added `waveform-toggle` type in MidiManager.js for this behavior.
- **HTML Changes**: Added `id="waveform-switch-1"` and `id="waveform-switch-2"` with `data-midi-mappable="waveform-toggle"` attribute.
- **Learning Guide**: Created comprehensive `LEARNING_GUIDE.md` with 6 chapters for beginners:
  - Chapter 1: Getting Started (interface, first sound)
  - Chapter 2: Creating Rhythms (sequencer, drums, bass patterns)
  - Chapter 3: Shaping Sound (filter, envelope, accent, slide)
  - Chapter 4: Multi-Track Production (dual 303, patterns, song mode)
  - Chapter 5: Saving and Sharing (file manager, URL sharing, clipboard permission)
  - Chapter 6: Advanced Techniques (MIDI, keyboard mapping, delay, live performance, PWA)

### v76: Swing Dot Performance Improvement
- **CSS Optimization**: Removed unnecessary `transition` property from `.swing-dot` for smoother real-time performance during swing control manipulation.

### v77: URL Share & Import Bug Fixes
- **Pattern Paste Fix**: Fixed bug where pasting a shared URL pattern resulted in empty pattern data. The issue was using wrong source pattern index (`patterns[0]` instead of `patterns[currentPatternId]`).
- **Song Mode Share Fix**: Fixed bug where shared Song Mode URL would show only one pattern in timeline. The issue was FileManager.init() loading last saved file and overwriting the URL import. Now skips file loading when URL hash is present.
- **Deployment Workflow Update**: Added Korean documentation sync step (`*_ko.md` files) to deployment workflow.

### v78: Per-Pattern Sound Settings & Refactoring
- **v78**: Refactored pattern storage structure.
  - Introduced `units` hierarchy in pattern data for per-pattern settings.
  - Updated `MODE_FULL` (0x02) in binary format to include per-pattern settings (Breaking Change: v3 files may not load correctly).
  - Song Mode now respects pattern-specific sound settings unless "Keep Sound Settings" is enabled.
  - Simplified format spec by removing `MODE_EXTENDED` proposal.
  - Fixed URL share/import for new structure. This ensures that pasting a shared URL pattern now applies both the sequence AND the sound settings (Knobs, Waveforms) saved with that pattern, allowing each pattern to have distinct sound characteristics.
- **Keep Sound Settings Option**: Added a toggle in Settings > General to "Keep sound settings when changing patterns".
  - **Enabled**: Behaves like traditional hardware (Global knobs), useful for live performance continuity.
  - **Disabled (Default)**: Loads each pattern's unique sound settings.
- **Migration System**: Implemented backward compatibility layer to migrate old pattern data (`seq303_1`, etc.) to the new `units` structure on-the-fly.

### v79: Bug Fix for Pattern Mode Parameter Saving
- **Song Mode to Pattern Mode Parameter Issue**: Fixed issue where switching from Song Mode back to Pattern Mode would incorrectly save the current UI parameters (from the pattern currently playing in the song) to the pattern that was active when entering song mode.
- **Root Cause**: When switching back to Pattern Mode, `selectPattern` was called which would save the current UI settings to the existing `currentPatternId` before updating it to the new ID, causing parameters from the song pattern to be saved to the wrong pattern in the pattern bank.
- **Solution**: Modified `Data.selectPattern` to accept an optional `skipSave` parameter, and updated the UI mode switching logic to call `selectPattern` with `skipSave=true` when switching from song mode back to pattern mode.
- **Result**: Song Mode patterns no longer incorrectly modify Pattern Mode data when switching between modes.

### v80: Improved Mode Transition Handling
- **Enhanced Mode Switching Logic**: Refined the mode transition behavior to ensure proper state management when switching between Pattern and Song modes.
- **User Experience**: Ensured that the correct parameters are displayed when switching between modes, regardless of which pattern was active in each mode.

### v81: Tempo UI & Waveform Icons
- **Tempo UI**: Adjusted tempo knob label alignment for better readability.
- **Waveform Icons**: Initial refinement of waveform icons (Sawtooth/Square) for better visual clarity.
- **Project Structure**: Created `PROJECT_SUMMARY.md` for high-level overview.

### v82: Sawtooth Icon Fix
- **Sawtooth Waveform**: Further refined the sawtooth waveform icon to accurately depict a sawtooth shape (vertical drop) rather than a triangle.

## Next Session Quick Start
1. Check current version in `sw.js` and `index.html`
2. Review recent commits: `git log --oneline -5`
3. Check for any console errors in browser
4. Verify multi-touch works on mobile device
5. Test AudioWorklet vs setTimeout fallback

## Important Constants
- **Tempo Range**: 60-200 BPM
- **Steps**: 16 per pattern
- **Patterns**: 16 total (P1-P16)
- **Lookahead**: 100ms (0.1s)
- **Sensitivity**: 200px for full knob range
- **Double-tap Threshold**: 400ms

## Operational Guidelines
1. **Deployment & Testing Confirmation**:
   - **ALWAYS** ask for explicit user confirmation before:
     - Deploying the application (pushing to main/gh-pages).
     - Running browser automation tests (browser_subagent).
   - Do **NOT** auto-run these actions even if they seem safe or part of a standard workflow.
   - Present the intended action and wait for the user's "Go ahead" or similar approval.
