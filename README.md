# acidBros - Web Audio Acid Studio

**acidBros** is a web-based synthesizer and sequencer inspired by the legendary Roland TB-303 Bass Line and TR-909 Rhythm Composer. It runs directly in your browser using the Web Audio API.

🎹 **[Try it live!](https://acidsound.github.io/acidBros/)**

## Screenshots

### Desktop View
![Desktop View](assets/screenshot-desktop.png)

### Mobile Views
| Landscape | Portrait |
|:---:|:---:|
| ![Mobile Landscape](assets/screenshot-mobile-landscape.png) | ![Mobile Portrait](assets/screenshot-mobile-portrait.png) |

## Features

*   **Dual TB-303 Emulation**:
    *   **Two independent TB-303 units** for complex basslines and counter-melodies.
    *   Sawtooth & Square waveforms.
    *   Classic controls: Tuning, Cutoff, Resonance, Envelope Modulation, Decay, Accent.
    *   16-step sequencer with Note, Octave, Slide (SL), and Accent (AC) controls per step.
    *   **Piano Roll Note Selection**: Intuitive popover keyboard for selecting notes.
    *   **Monophonic Logic**: Authentic slide and gate behavior.
*   **TR-909 Emulation**:
    *   5 Drum Tracks: Bass Drum, Snare Drum, Closed Hat, Open Hat, Clap.
    *   Individual parameter controls and **Level** knobs for each drum sound.
    *   16-step grid sequencer for each track.
*   **Responsive Design**: Optimized layouts for Desktop, Tablet, and Mobile (Portrait/Landscape).
*   **Global Controls**:
    *   Tempo control (BPM) with 7-segment LED display.
    *   Play, Stop, Clear, and Randomize functions.
    *   **Share URL**: Export your current pattern state to a URL to share with others.

## Usage

1.  **Playback**: Press **RUN** to start the sequencer and **STOP** to pause. The audio engine initializes automatically.
2.  **Create a Pattern**:
    *   **TB-303 (Unit 1 & 2)**: Click steps on the grid to activate notes. Adjust knobs to shape the sound. Use the LED-style selectors to change notes and octaves. Toggle **AC** (Accent) and **SL** (Slide) for expressive sequences.
    *   **TR-909**: Click steps on the drum tracks to create a beat. Tweak the knobs and levels for each drum sound.
3.  **Randomize**: Click **RANDOMIZE** to generate a fresh random pattern and sound patch for both 303s and the 909.
4.  **Share**: Click **SHARE URL** to copy a link to your clipboard that contains your current pattern data.

## Installation

Simply open `index.html` in a modern web browser (Chrome, Firefox, Safari, Edge). No server or installation required.

## License

MIT License
