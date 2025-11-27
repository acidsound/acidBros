# acidBros - Project Context

## Project Overview
Web-based TB-303 and TR-909 synthesizer/sequencer using Web Audio API.
- **Live URL**: https://acidsound.github.io/acidBros/
- **Current Version**: v46
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
- **Data Management**: `js/data/Data.js` handles patterns and song mode

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
- **Cache Version**: Currently v46 (increment on each deployment)
- **Strategy**: Cache-first for offline support
- **Assets**: All JS, CSS, HTML, fonts cached

## File Structure
```
acidBros/
├── index.html              # Main HTML, includes anti-zoom scripts
├── styles.css              # All styling, responsive design
├── sw.js                   # Service worker (cache v46)
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
│   │   └── RotaryKnob.js  # Knob component with TouchManager
│   └── data/
│       └── Data.js        # Pattern/song data management
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

## Recent Changes (v44-v46)

### v44: AudioWorklet Migration
- Added `ClockProcessor.js`
- Migrated timing from setTimeout to AudioWorklet
- Added fallback for insecure contexts

### v45: Multi-touch & Mobile Improvements
- Implemented global `TouchManager`
- Fixed multi-touch knob control
- Added version display in transport
- Updated service worker cache

### v46: Pinch Zoom Prevention
- Added gesture event blocking
- Added double-tap zoom prevention
- Added CSS touch-action properties
- Added ctrl+wheel zoom blocking

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
