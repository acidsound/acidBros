# acidBros - Web Audio Acid Studio

**acidBros** is a web‑based synthesizer and sequencer inspired by the legendary Roland TB‑303 Bass Line and TR‑909 Rhythm Composer. It runs directly in your browser using the Web Audio API.

🎹 **[Try it live!](https://acidsound.github.io/acidBros/)**

## Screenshots

### Desktop View
![Desktop View](assets/screenshot-desktop.png)

### Mobile Views
| Landscape | Portrait |
|:---:|:---:|
| ![Mobile Landscape](assets/screenshot-mobile-landscape.png) | ![Mobile Portrait](assets/screenshot-mobile-portrait.png) |

## UI/UX Overview
- **Design Language**: Dark glass‑morphism theme with neon accent colors, modern Google Fonts (Inter) and subtle micro‑animations for button presses, knob turns, and step activation.
- **Transport Bar**: Top bar with RUN, STOP, RANDOMIZE, CLEAR, SHARE URL buttons and a large BPM knob with a 7‑segment LED display. Hover glows and tactile feedback enhance interaction.
- **Pattern Mode**: Row of 16 pattern selectors (P1‑P16) below the transport. Clicking a selector instantly switches the active pattern. Clear/Randomize button sits to the right of the waveform toggle for a compact layout.
- **Song Mode**: Pattern selectors integrated into the song timeline, allowing multi‑pattern arrangements by tapping a selector. Timeline wraps onto multiple rows, eliminating horizontal scrolling.
- **Sequencer Grid**: 16‑step grid for each TB‑303 unit and each TR‑909 drum track. Steps light up with vibrant colors; slide/accent indicators animate with a pulse.
- **Knob Controls**: Glass‑like circular knobs with reflection; vertical drag changes values, rotation animation provides feedback. Double‑tap resets to default.
- **Responsive Design**: Adaptive layout for desktop, tablet, and mobile (portrait/landscape), preserving usability on touch devices.
- **Micro‑Animations**: Hover effects, button depressions, knob rotations, and step activation pulses create a premium, lively feel.

## Features

* **Dual TB‑303 Emulation**:
  * Two independent TB‑303 units for complex basslines and counter‑melodies.
  * Sawtooth & Square waveforms.
  * Classic controls: Tuning, Cutoff, Resonance, Envelope Modulation, Decay, Accent.
  * 16‑step sequencer with Note, Octave, Slide (SL) and Accent (AC) per step.
  * Piano Roll Note Selection: intuitive pop‑over keyboard.
  * Monophonic Logic: authentic slide and gate behavior.
* **TR‑909 Emulation**:
  * Five drum tracks: Bass Drum, Snare Drum, Closed Hat, Open Hat, Clap.
  * Individual parameter controls and Level knobs for each drum sound.
  * 16‑step grid sequencer for each track.
* **Responsive Design**: Optimized for Desktop, Tablet, Mobile (Portrait/Landscape).
* **Global Controls**:
  * Tempo (BPM) with 7‑segment LED.
  * Play, Stop, Clear, Randomize.
  * Share URL to export current pattern state.
* **PWA Support**: Installable as a Progressive Web App for offline use.
* **[User Manual](USER_MANUAL.md)**: Comprehensive guide.

## Usage

1. **Playback**: Press **RUN** to start the sequencer, **STOP** to pause.
2. **Create a Pattern**:
   * **TB‑303 (Unit 1 & 2)**: Click steps to activate notes, adjust knobs, change notes/octaves via LED selectors, toggle AC (Accent) and SL (Slide).
   * **TR‑909**: Click steps on drum tracks, tweak knobs and levels.
3. **Randomize**: Click **RANDOMIZE** for a fresh pattern and sound patch.
4. **Share**: Click **SHARE URL** to copy a link with the current pattern data.

## Installation

Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge). No server required.

## License

MIT License
