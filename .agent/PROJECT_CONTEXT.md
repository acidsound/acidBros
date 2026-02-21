# acidBros - Project Context

## Project Overview
Web-based TB-303 and TR-909 synthesizer/sequencer using Web Audio API.
- **Live URL**: https://acidsound.github.io/acidBros/
- **Current Version**: v137
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
  - `TB303.js`: Two independent TB-303 units with resonant ZDF filter and Send/Return Wet Delay effect
  - `TR909.js`: Full TR-909 implementation using modular `DrumVoice` architecture
    - `DrumVoice.js`: Hybrid Synth+Sample engine
    - `UnifiedSynth.js`: Core analog-modeling engine featuring accurate BD drive and click sweeps, noise bursts, etc.
- **Lifecycle Safety (v134-dev)**:
  - TB-303 voices now explicitly disconnect ended `osc/filter/gain` nodes.
  - `TB303FilterProcessor` self-terminates (`return false`) when its upstream source is gone.
  - Delay `AudioParam` automation is only updated on value changes to prevent long-session event queue growth.
  - `UnifiedSynth` now disconnects expired nodes (`masterGain`, HPF, per-voice chains) and TR-909 stop propagation clears active synth state.

### UI System
- **Location**: `js/ui/UI.js`
- **Knob Control**: `js/ui/RotaryKnob.js`
  - **Multi-touch Support**: Global `TouchManager` class handles multiple simultaneous touches
  - **Interaction**: Vertical drag (up/down) changes values
  - **Touch ID Tracking**: Each knob tracks its specific touch identifier
  - **Double-tap**: Resets to default value
- **Overlay Scroll Lock (v134-dev)**:
  - Main page scroll is locked while overlays/popovers are open.
  - Overlay content remains vertically scrollable (`overscroll-behavior: contain`, `touch-action: pan-y`).
  - Centralized control through `UI.showOverlay()`, `UI.hideOverlay()`, and `UI.updateOverlayScrollLock()`.
- **Song Timeline Drag UX (v134-dev)**:
  - Drag ghost now uses transform-based movement with transitions disabled during drag for lower perceived latency on touch devices.
  - A vertical insertion marker (`.song-drop-indicator`) previews drop position between pattern blocks in Song mode.
  - Adjacent timeline blocks at the insertion boundary receive edge glow classes (`drop-neighbor-left`, `drop-neighbor-right`) for occlusion-resistant preview on touch devices.
  - Drop commit now applies FLIP-style position animation so blocks visibly move into final placement after drop.
- **TB-303 Step Micro Controls (v134-dev)**:
  - `DN/UP/AC/SL` mini-buttons now use pointerdown handlers that stop propagation so touching mini-buttons does not trigger the parent step press/toggle.
- **Inline Style Hygiene (v134-dev)**:
  - Static presentation styles were moved from inline HTML/JS to CSS classes (`layout.css`, `overlays.css`, `machines.css`).
  - Dynamic-only styles remain in JS (swing moving dots, drag indicator positioning, overlay scroll lock offset).

#### Creating New Knob-Based UIs (Pattern: TB-303/DrumSynth)

When building new UIs with RotaryKnob, follow this established pattern:

**1. HTML Structure** - Use empty `knob-group` containers:
```html
<div class="my-module" id="my-module">
  <div class="module-controls">
    <select class="my-select" data-param="type">...</select>
    <div class="knob-group" id="my-module-knobs"></div>
  </div>
</div>
```

**2. JavaScript - Define KNOB_DEFS and create knobs dynamically:**
```javascript
import { RotaryKnob } from './RotaryKnob.js';

const MyUI = {
    knobs: {},

    // Define all knobs with their ranges
    KNOB_DEFS: {
        myModule: [
            { id: 'cutoff', label: 'CUT', min: 20, max: 10000, def: 2000 },
            { id: 'resonance', label: 'RES', min: 0, max: 100, def: 30 },
            { id: 'level', label: 'LVL', min: 0, max: 100, def: 80 }
        ]
    },

    init() {
        this.buildKnobs();
    },

    buildKnobs() {
        Object.keys(this.KNOB_DEFS).forEach(modId => {
            const container = document.getElementById(`${modId}-knobs`);
            if (!container) return;

            container.innerHTML = '';
            this.knobs[modId] = {};

            this.KNOB_DEFS[modId].forEach(def => {
                const knobId = `${modId}_${def.id}`;
                // Args: container, label, id, min, max, default, step, size
                const knob = new RotaryKnob(container, def.label, knobId, 
                                           def.min, def.max, def.def, 1, 'small');
                this.knobs[modId][def.id] = knob;
            });
        });
    },

    collectParams() {
        const params = {};
        Object.keys(this.knobs).forEach(modId => {
            params[modId] = {};
            Object.keys(this.knobs[modId]).forEach(param => {
                params[modId][param] = this.knobs[modId][param].value;
            });
        });
        return params;
    }
};
```

**3. CSS - Use knob-group layout:**
```css
.my-module .knob-group {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.my-module .knob-wrapper.small {
    width: 55px;
}

.my-module .rotary-knob {
    width: 40px;
    height: 40px;
}
```

**Key Points:**
- `knob-group` is a flex container, knobs auto-flow horizontally
- Use `KNOB_DEFS` object to define all parameters in one place
- `RotaryKnob` constructor signature: `(container, label, id, min, max, default, step, size)`
- Size options: `'small'`, `'medium'`, `'large'`
- Access value via `knob.value`, set via `knob.setValue(val)`
- For auto-trigger on change, listen to `#${knobId}-input` input event

- **Oscilloscope**: `js/ui/Oscilloscope.js`
  - **Power Toggle**: Can be enabled/disabled to save performance (CPU/GPU)
  - **LOD Rendering**: Downsamples 2048 points to ~512 for efficiency
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
- **Cache Version**: Currently v94 (increment on each deployment)
- **Strategy**: Cache-first for offline support
- **Assets**: All JS, CSS, HTML, fonts, core 909 samples (CH/OH/CR/RD), and individual SVG icons cached

#### 5. External SVG Icon System (v97)
- **Problem**: Dynamically generated SVG strings in JS were hard to maintain and violated modern architectural guidelines.
- **Solution**: Individual external SVG files
  - **Storage**: All icons stored as separate `.svg` files in `assets/icons/`.
  - **Implementation**: Used CSS `mask-image` for icons that need dynamic coloring (via `currentColor` or `background-color`).
  - **Efficiency**: Reduced JS bundle size and improved template readability.

## File Structure
```
acidBros/
├── index.html              # Main HTML (v127)
├── css/                    # Modular CSS system (v127)
│   ├── base.css            # Root vars, Resets, Typography
│   ├── icons.css           # SVG Icon System (Mask-image)
│   ├── layout.css          # Rack, Top-bar, Responsive
│   ├── components.css      # Knobs, Switches, LED Display
│   ├── machines.css        # TB-303 & TR-909 specifics
│   └── overlays.css        # Modals, Toasts, File Manager
├── sw.js                   # Service worker (cache v98)
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
    ├── DSEG7Classic-Bold.woff2 # 7-segment display font
    └── icons/                 # External SVG icon system
        ├── add.svg
        ├── play.svg
        ├── stop.svg
        └── ... (other icons)
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

## Documentation Maintenance
To ensure project health and consistency, relevant documentation MUST be updated whenever functional or structural changes occur.

| File | Purpose | Update Trigger |
| :--- | :--- | :--- |
| **`.agent/PROJECT_CONTEXT.md`** | Source of truth for agents. | **Required for EVERY change.** Update `Recent Changes` and `Architecture` sections. |
| **`.agent/DESIGN_GUIDE.md`** | UI/UX standards and typography. | Any new component, modal, or styling pattern. **MUST be referenced for all UI work.** |
| **`.qwen/PROJECT_SUMMARY.md`** | High-level technical summary. | Major feature additions or architectural shifts. |
| **`docs/BINARY_FORMAT.md`** | Data structure spec. | Any change to how patterns, settings, or project states are encoded/saved. |
| **`docs/USER_MANUAL.md` / `_ko.md`** | End-user instructions. | UI changes, new controls, or feature workflows. |
| **`docs/LEARNING_GUIDE.md`** | Beginner tutorials. | Changes affecting the "getting started" experience or core concepts. |
| **`docs/SYNTH_ARCHITECTURE.md`**| Detailed audio/logic spec. | Internal logic changes in TR-909 or TB-303 engines. |
| **`README.md`** | Project landing page. | Major version bumps or dependency changes. |


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

## Recent Changes (v57-v125)

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
  - `docs/BINARY_FORMAT.md`: Complete specification document
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
- **Learning Guide**: Created comprehensive `docs/LEARNING_GUIDE.md` with 6 chapters for beginners:
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

### v83: Styles Cleanup
- **CSS Cleanup**: Removed deprecated `#shuffleBtn` styles and specific iPad/Safari hacks that are no longer needed, streamlining the stylesheet.

### v84: Restored Buy Me A Coffee Button & Responsive Transport
- **Buy Me A Coffee**: Restored the support button in the transport bar with a clean SVG icon.
- **Responsive Transport**: Optimized transport control spacing and button sizes for small screens (max-width: 400px) to prevent layout breaking.
- **UI Update**: Added click handler for the new button to open the support page.

### v85: Styled Support Button
- **Visual Enhancement**: Added specific styling for the "Buy Me A Coffee" button (`.bmc`) with a yellow/gold gradient to make it stand out and match the brand color.
- **Hover Effect**: Added a hover state with inverted gradient for tactile feedback.

### v86: Transport Bar Tweaks
- **Layout Refinement**: Reduced gap between transport controls from 5px to 4px for better fit on extremely narrow mobile screens.

### v87: Song Mode Drag & Drop
- **Timeline Editing**: Improved Song Mode interaction.
  - **Drag Request**: Users can now drag `.song-block` elements to reorder them in the timeline.
  - **Implementation**: Custom drag-and-drop logic in `UI.updateSongTimelineDOM` supporting both mouse and touch events.
  - **Single Click**: Single click/tap still removes the block from the song.
  - **Visuals**: Dragged item appears as a semi-transparent ghost scaling up (1.1x) for better visibility.
- **Documentation**: Updated User Manual (EN/KO) to reflect drag-and-drop functionality.

### v88: Screenshot Automation Fix
- **Stability Improvement**: Fixed GitHub Actions screenshot generation script issue.
  - **Server Polling**: Added 127.0.0.1 binding and explicit polling to wait for server readiness.
  - **UI Sync**: Implemented `waitForSelector` for `.step-303`, `.step-909`, and `.rotary-knob` to ensure UI is fully rendered before capture.
  - **Robustness**: Replaced fixed timeouts with condition-based waiting.

### v89: iOS Safari Background Resume
- **Background Audio Recovery**: Implemented "Tap to Resume" UI pattern for iOS Safari.
  - **Problem**: iOS Safari suspends AudioContext when app goes to background.
  - **Detection**: `visibilitychange` event listener detects foreground return.
  - **Condition**: Only shows overlay when `isPlaying` is true and `ctx.state === 'suspended'`.
  - **UI**: Full-screen overlay with animated play button and instructional text.
  - **Resume**: User tap triggers `ctx.resume()` and hides overlay.
  - **Touch Events**: Both `click` and `touchend` handlers for better iOS responsiveness.
- **New Files/Changes**:
  - `index.html`: Added `#audioResumeOverlay` element.
  - `styles.css`: Added `.audio-resume-*` styles with pulse animation and blur backdrop.
  - `AudioEngine.js`: Added `setupVisibilityHandler()` method.

### v90: Unit Randomization Lock
- **New Feature**: Added a locking mechanism for each unit (TB-303 Unit 1, TB-303 Unit 2, TR-909).
  - **Lock Button**: Added a new SVG lock icon button next to the trash (clear) icon in each machine header.
  - **Functionality**: When locked, the unit is excluded from global randomization (Dice button in top bar).
  - **Visuals**: Locked state is indicated by an orange background and a closed lock icon.
  - **Persistence**: Lock states are saved to `localStorage` and persist across sessions.
- **Implementation Highlights**:
  - `Data.js`: Added `unitLocks` state and updated `randomize()` to respect locks.
  - `UI.js`: Implemented click handlers and `updateLockUI()` for visual state management.
  - `styles.css`: Added styles for `.header-lock-btn` and its `.locked` state.

### v91: UI Refinement & Icon Restoration
- **Trash Icon Restoration**: Reverted the change that toggled clear buttons to dice icons when empty. Buttons now consistently show the trash icon as requested by the user.
- **Button Aesthetic Unification**:
  - Unified size for all machine header buttons (Clear and Lock) to 32x24px.
  - Standardized spacing between buttons to 6px.
  - Slightly increased icon stroke-width (2.5px) for better visibility.
- **Visual Alignment**: Fine-tuned gaps in 303 waveform controls to match the 909 header layout.

### v92: TR-909 Synthesis Restoration
- **Synthesis Engine**: Transitioned core 909 instruments (BD, SD, Toms, Rim, Clap) from samples back to real-time synthesis.
- **Improved Randomization**: Musical logic for drum patterns (Fill-in Toms, sparse Cymbals).
- **Asset Cleanup**: Removed ~1MB of redundant WAV samples to streamline PWA cache.

### v93: Oscilloscope Optimization (Performance)
- **Power Toggle**: Optimized the oscilloscope to be toggleable via UI.
- **LOD (Level of Detail)**: Reduced path rendering complexity by 75% through downsampling.
- **GPU Optimization**: Disabled expensive `shadowBlur` effects.
- **Visibility Handling**: Automatically pauses rendering loops when tab is hidden.

### v94: UI Consistency & Bug Fixes
- **Icon Toggles (Restored)**: Re-implemented Trash/Dice icon toggle for both TB-303 and TR-909 based on new user feedback. Empty tracks now correctly show the Dice icon.
- **909 Playhead Fix**: Resolved frame skipping and timing variance in the 909 sequencer visualization.
- **Data Robustness**: Added fallback for missing tracks (Crash/Ride) when loading older pattern versions.

### v96: TR-909 Synthesis Refinement & shared Noise Fix
- **BD Refinement**: Calibrated TUNE knob for pitch decay control (neutral at 40), softened click impact, and fixed master level mapping.
- **SD Refinement**: Implemented dual Triangle VCO (1:1.62 ratio) and 20ms pitch bend for hardware accuracy.
- **Shared Noise Fix**: Investigated and reverted the Shared Noise Bus architecture due to connection accumulation issues; restored per-trigger individual noise sources to prevent leakage.
- **Improved Documentation**: Updated `docs/SYNTH_ARCHITECTURE.md` with detailed 909 synthesis specs and signal flow diagrams.

### v95: TR-909 Refinement & Custom Samples
- **Refined Track Management**:
    - Replaced "Add Track" text with a percussion icon button for better aesthetic fit.
    - Grouped drum selection modal into **Synthesis** and **Factory Samples** categories.
    - Added ability to remove tracks (BD remains locked as primary).
- **Custom Sample Support**:
    - **SampleStore.js**: Implemented IndexedDB storage for persisting custom audio files.
    - **Upload & Mapping**: Users can upload audio files and map them to any 909 track.
    - **Visual Feedback**: Custom tracks are highlighted with a "(CUSTOM)" label and golden accent.
- **Binary Format v5**: Updated encoder/decoder and spec to support **Block 0x03 (Metadata)**, persisting active track visibility and sample mappings across saves.
- **Documentation Guide**: Added explicit guide for mandatory documentation updates in `PROJECT_CONTEXT.md`.

### v113-v125: UI Refresh & Modular CSS System
- **Modular CSS**: Migrated from a single `styles.css` to a modular system in `css/` directory (`base.css`, `layout.css`, `machines.css`, `overlays.css`, `icons.css`, `components.css`).
- **Mobile-First UX**: Replaced all `:hover` states with touch-optimized `:active` states for better mobile responsiveness.
- **File Manager UI**:
  - Restructured to a 2-tier header (Title row + Action buttons row).
  - Unified styling with the Settings modal and enforced via `DESIGN_GUIDE.md`.
  - Removed text labels from action buttons for a cleaner, icon-only aesthetic.
- **Song Mode Enhancements**:
  - Unified `.pat-btn` and `.song-block` styling (size, font, colors).
  - Refined `.song-timeline` layout using CSS Grid (8/16 columns) to match patterns.
  - Simplified timeline visuals by removing background and using a top border divider.
  - Disabled horizontal scrolling on timeline for a more stable grid experience.
- **MIDI Learn Visibility**:
  - Added green/blue dashed outlines and checkmark badges for mappable/mapped elements during Learn mode.
  - Integrated red pulse animation (`midi-blink`) for the element currently undergoing learning.
- **Design Guide**: Updated `.agent/DESIGN_GUIDE.md` with mandatory modal header layout rules and interaction standards.

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
### v129: Sample Sync Fix & Architecture Documentation
- **Sample Sync Fix**: 
  - Synchronized `UnifiedSynth` with the central `AudioEngine` scheduler by implementing a target time (`time`) parameter.
  - Resolved the 1-step delay issue on TR-909 sample-based tracks (CR, RD, CH, OH).
  - Improved `stopAll()` logic to prevent cutting off tails during scheduled playback while maintaining manual preview responsiveness.
- **Documentation Overhaul**:
  - Entirely rewrote `docs/SYNTH_ARCHITECTURE.md` to reflect the `UnifiedSynth` engine.
  - Added detailed Mermaid diagrams for internal signal flow (OSC 1-4, Click, Snap, Noise/Filter).
  - Defined explicit parameter mappings between UI knobs and internal engine variables for all original TR-909 instruments.
  - Added technical specs for sample-based Hi-Hats and Cymbals, including choke and tuning logic.
- **Versioning**: Incremented PWA cache and UI version to v129.

### v131: Detailed UI Refinements & Cymbal Aesthetics
- **Physical Cymbal Icons**: Redesigned SVG vectors for CH, OH, and CR to accurately depict physical cymbal shapes (stacked ellipses, gaps for open hi-hats, 25-degree angles for crash).
- **Track Menu Refinement**: Restructured the Add Track modal. Moved inline styles to class objects (`.add-track-row`, `.track-edit-btn-side`) and ordered DOM elements logically (Check -> Icon -> Label -> Setting).
- **Module Standardization**: Stripped redundant wrappers from `Noise`, `Click`, and `Snap` modules so they share the exact same simple tree structure (`ds-module` > `module-controls` > `knob-group`) as OSC 1-4.
- **Scroll & Overflow Fixes**: 
  - Resolved Chrome Emulator blocking touch by making `UI.js` touchmove listener passive and scoped to dragging context.
  - Allowed `ds-footer` to overflow vertically so negative-margin knob tooltips are never clipped.
  - Eliminated arbitrary `translateY` animations via JS on the Arcade button, handing it purely to CSS `:active` rules for zero color-flash.

### v130: Retro Synth Aesthetics
- **Visual Overhaul**: Redesigned core UI components to mimic physical, retro hardware (inspired by Sankei TCR-3000).
- **Sequencer Keys**: Transformed the TB-303 and overlay piano step buttons into tactile hardware keys with aged plastic textures (warm gold/yellow for white keys, textured black for black keys).
- **Material Textures**: 
  - Updated the Manage Drum Track button to resemble a physical red console button.
  - Applied textured dark plastic gradients and significant drop shadows to modal overlays (Editor, Add Track, File Manager).
- **Design Guidelines**: Formally documented the new color palette and physical styling approaches in `.agent/DESIGN_GUIDE.md`.

### v132: TB-303 Filter Upgrade
- **Audio Engine**: Ported the TB-303 synthesis engine from `FlacidLive` (Dart/WAJuce) to `acidBros` (Web Audio API JavaScript).
- **ZDF Diode-Ladder Filter**: Replaced the basic `BiquadFilterNode` with a custom `AudioWorkletNode` implementing a Zero-Delay Feedback (ZDF) diode-ladder filter, significantly improving the authentic "squelchy" resonance characteristic.
- **Exponential Slide**: Implemented exponential pitch slides (`exponentialRampToValueAtTime`) replacing linear slides for a more natural, analog-feeling glide.
- **Envelope & Accent Refinement**: Adjusted amplitude envelopes and accent scaling logic to match the hardware response more closely.
- **Documentation**: Updated `docs/SYNTH_ARCHITECTURE.md` to detail the new ZDF filter and slide logic.

### v134-dev: Audio Timing Drift / Dropout Stability Fix
- **Issue Signature**: Long playback sessions could gradually drift in timing and eventually drop audio output without visible UI or console errors.
- **Root Cause Pattern**: Web Audio graph/resource accumulation from non-disconnected nodes and repeatedly scheduled automation events.
- **TB-303 Fixes**:
  - Added explicit voice teardown (`osc/filter/gain` disconnect on `onended`).
  - Prevented delay automation queue bloat by applying `delayTime/feedback/wet` updates only when values change and canceling future events before re-scheduling.
- **TB-303 Filter Worklet Fixes**:
  - `TB303FilterProcessor` now terminates orphan processors when input bus is detached (`return false`).
  - Added additional finite-value guards (`g`, output sample checks) to avoid unstable DSP state propagation.
- **TR-909 / UnifiedSynth Fixes**:
  - Replaced passive expiry tracking with actual disconnect callbacks for expired nodes.
  - Added `DrumVoice.stop()` and `TR909.stop()` propagation so transport stop clears active synth chains immediately.

### v134-dev: Popover Scroll Lock Fix
- **Issue Signature**: While popovers/modals were open, background page could still scroll, causing interaction conflicts on mobile.
- **UI Scroll Lock**:
  - Added body-level fixed scroll lock class (`overlay-scroll-lock`) with saved scroll position restore.
  - Introduced centralized overlay helpers in `UI.js` for open/close and lock synchronization.
- **Overlay Behavior**:
  - Applied vertical scrolling + overscroll containment on overlay backdrops so modal/popover content scrolls while the main page stays locked.
  - Hooked File Manager, Settings, Drum Synth overlay, and Add Track popover into the unified lock lifecycle.

### v134-dev: Song Drag Preview & 303 Step Touch Precision
- **TB-303 Touch Precision**:
  - Fixed mobile issue where tapping `DN/UP/AC/SL` mini-buttons could press/toggle the entire 303 step.
  - Mini-buttons now intercept pointerdown and prevent bubbling to the parent `.step-303`.
- **Song Mode Drag Responsiveness**:
  - Reduced drag lag by removing all-property transition coupling from `.song-block` and disabling transitions on drag ghost.
  - Drag ghost now follows pointer via `translate3d(...)` for smoother updates.
- **Song Mode Drop Preview**:
  - Added a vertical insertion bar in timeline (`.song-drop-indicator`) that previews where the dragged pattern will be inserted.
  - Added gradient edge glow on the adjacent left/right blocks (`drop-neighbor-left`, `drop-neighbor-right`) so insertion target remains visible when finger occludes the bar.
  - Added drop commit motion feedback: neighboring timeline blocks animate into new positions, while the dragged block only nudges from the drop point into its final slot and is briefly emphasized (`song-drop-landed`).

### v134-dev: Inline Style Cleanup (HTML/JS -> CSS Classes)
- **index.html**:
  - Removed all inline `style="..."` usage from Swing guides/dots and Mode spacer.
  - Replaced with semantic classes (`swing-guide-25`, `swing-guide-75`, `swing-dot-0`, `swing-dot-50`, `mode-switch-spacer`).
- **UI.js**:
  - Replaced static `element.style.*` assignments (MIDI empty states, MIDI learn button base layout, song drag ghost base style) with class-based styling.
  - Kept runtime/dynamic style writes only for values that change by interaction (`left/top/height/transform`).
- **Piano Keys**:
  - Removed per-key inline CSS var injection (`--white-index`) and switched to generated index classes (`white-index-0`..`white-index-20`) mapped in `machines.css`.

### v136: TB-303 Resonance Body Compensation (Tunable)
- **Audio Engine**:
  - Added resonance-dependent makeup gain in `TB303FilterProcessor` to reduce perceived loudness loss at high `RES`.
  - Exposed internal tuning constant (`resonanceMakeupAmount`) with inline comments so tone can be adjusted without changing UI ranges.
- **Synthesis Docs**:
  - Updated `docs/SYNTH_ARCHITECTURE.md` to document that resonance makeup is an intentionally tunable DSP calibration.
  - Clarified that this tuning does not alter `CUTOFF/RESO` knob ranges or saved pattern data mapping.
- **Versioning**:
  - Bumped deployed version markers to `v136` (`sw.js` cache name and `index.html` version display).

### v137: Transport Queue UX + 303 DSP Hot-Path Optimization
- **Transport / Pattern Flow**:
  - `RUN` now restarts immediately from step 1 (step index 0) for deterministic playback starts.
  - In Pattern mode during playback, selecting another pattern queues the switch to the next 16-step boundary.
  - Added BPM-synced queued glow blink for pending pattern change indication.
  - Added the same queued blink affordance for Song mode timeline (next block preview), and improved drag-time visibility with lower drag ghost opacity.
- **TB-303 Performance**:
  - Optimized `TB303FilterProcessor` hot path by splitting `a-rate/k-rate` loop variants and hoisting `k-rate` coefficient math outside the per-sample loop.
  - Added cached sample-rate derived constants and local state caching (`s1..s4`, HP stages) to reduce repeated property access in `AudioWorklet`.
  - Kept scheduling semantics unchanged (no transport timing logic modifications) to avoid play/stop timing side effects.
  - Minor `TB303.js` optimizations: note-index lookup table reuse and worklet parameter handle reuse in slide path.
- **Versioning**:
  - Bumped deployed version markers to `v137` (`sw.js` cache name and `index.html` version display).
