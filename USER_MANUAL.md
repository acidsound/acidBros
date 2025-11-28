# AcidBros User Manual 🎹

Welcome to **AcidBros**, your web‑based acid techno studio! This manual guides you through the interface and helps you start making beats instantly.

---

## 1. Transport & Global Controls
The top bar provides the main playback and project controls.

![Transport Controls](assets/manual-transport.png)

- **RUN / STOP** – Start or pause the sequencer.
- **RANDOMIZE** – Generate a fresh random pattern and sound patch for all units.
- **CLEAR** – Reset all patterns (303 notes and 909 drums) to a blank state.
- **SHARE URL** – Export the current pattern and settings as a shareable link. A toast notification confirms the link is copied.
- **SWING/SHUFFLE (💃)** – Toggle the swing control panel. Adjust groove timing from 0% (straight) to 100% (maximum shuffle). 50% is the default straight timing. Double-click/tap the ribbon controller to reset to 50%.
- **Buy Me a Coffee** – (☕ icon) Support the developer by opening the Buy Me a Coffee page in a new tab.
- **Oscilloscope** – Real-time visual feedback of the audio waveform (green CRT style), located next to the tempo controls.
- **TEMPO (BPM)** – Large knob with a 7‑segment LED display (60-200 BPM). Drag vertically to adjust, double‑tap to reset to 125 BPM.

---

## 2. Mode Switch & Pattern Management

![Mode Switch](assets/manual-mode-switch.png)

### Mode Switch
Toggle between **Pattern Mode** and **Song Mode** using the animated switch. The handle slides smoothly between modes.

### Pattern Mode
- **Pattern Selectors (P1-P16)** – Click to switch between 16 independent patterns.
- **COPY Button** (📋 icon) – Copy the current pattern. Toast notification confirms "Pattern copied!"
- **PASTE Button** (📄 icon) – Paste the copied pattern. Toast notification confirms "Pattern pasted!"

![Copy/Paste Buttons](assets/manual-copy-paste.png)

### Song Mode
- **Pattern Timeline** – Click pattern buttons (P1-P16) to add them to your song arrangement.
- **Timeline Blocks** – Click any block in the timeline to remove it from the song.
- **Multi-Row Layout** – Timeline wraps automatically, eliminating horizontal scrolling.

---

## 3. TB‑303 Bassline Units
AcidBros features **two independent TB‑303 units** (Unit 1 & 2). Each unit offers classic acid‑style synthesis.

![TB‑303 Unit](assets/manual-tb303.png)

### Sound Controls (Knobs & Switches)

#### SYNTH Section
- **WAVEFORM** – Animated toggle between Sawtooth and Square waveforms.
- **TUNE** – Fine‑tune the pitch (-1200 to +1200 cents).
- **CUTOFF** – Filter brightness control (0-100%).
- **RESO** – Resonance/squelch character (0-15).
- **ENV MOD** – Envelope modulation amount on the filter (0-100%).
- **DECAY** – Note tail length (0-100%).
- **ACCENT** – Boost level for accented steps (0-100%).
- **VOLUME** – Output level (0-100%, default 60%).

#### DELAY Section
- **TIME** – Delay time as percentage of tempo (0-200%, tempo-synced).
- **FEEDBACK** – Delay feedback amount (0-100%).

*Double‑tap any knob to reset to its default value.*

### Sequencer Grid
Each unit has a 16‑step grid. Steps light up when active.

#### Step Controls
- **LED** – Lights up red when step is active.
- **Note Display** – Shows current note (e.g., "C"). Click to open piano roll.
- **DN/UP Buttons** – Quick octave down/up (octave 1-3, default 2).
- **AC Button** – Toggle accent (red when active).
- **SL Button** – Toggle slide (green when active).

### Piano Roll Pop‑over

![Piano Roll Popover](assets/manual-pianoroll.png)

Click any note display to open the advanced note editor:

- **Step Navigation (< >)** – Move between steps with wrap-around.
- **Step Indicator** – Shows current step number (01-16).
- **Piano Keys** – Click to select pitch (C to B with sharps/flats).
- **Octave Controls (DN/UP)** – Select octave (1, 2, or 3).
- **Modifiers**:
  - **AC** – Accent toggle (red when active).
  - **SL** – Slide toggle (green when active).
- **Preview Sound** – Checkbox to hear notes before committing.
- **GATE OFF (REST)** – Mute the step while keeping note value.
- **Close (×)** – Close the editor.

*Pressing a piano key automatically advances to the next step for fast pattern entry.*

---

## 4. TR‑909 Rhythm Composer
The drum section provides classic 909 sounds.

![TR‑909 Unit](assets/manual-tr909.png)

### Drum Tracks
Each track has dedicated parameter knobs and a level control:

- **BASS DRUM (BD)** – Kick with Tune, Decay, Attack, Level.
- **SNARE DRUM (SD)** – Snare with Tune, Tone, Snappy, Level.
- **CLOSED HAT (CH)** – Short hat with Decay, Level.
- **OPEN HAT (OH)** – Long hat with Decay, Level.
- **CLAP (CP)** – Hand clap with Decay, Level.

### Sequencer Grid
Each track has its own 16‑step grid. Active steps glow orange/yellow; inactive steps remain dark.

### Clear/Randomize Button
The 909 section has a dedicated clear/randomize toggle:
- **Empty patterns** → Click to randomize all drum tracks.
- **Filled patterns** → Click to clear all drum tracks.

---

## 5. UI/UX Features

### Visual Feedback
- **Toast Notifications** – Appear at the bottom for copy, paste, and share actions.
- **Hover Effects** – Buttons and knobs glow on hover.
- **Active States** – Current pattern, playing step, and active controls are highlighted.
- **Smooth Animations** – Mode switch, button presses, and transitions are animated.
- **Oscilloscope** – Visualizes the master audio output in real-time.

### Live Performance Mode
- **Collapse/Expand** – Click the header of any machine (TB-303 or TR-909) to collapse its sequencer section.
- **Focus on Knobs** – This hides the grid and allows you to focus purely on sound manipulation (knobs) during a live performance.
- **Visual Indicator** – The arrow next to the machine title indicates the current state (▼ expanded, ◄ collapsed).

### Responsive Design
- **Desktop** – Full layout with all controls visible.
- **Tablet** – Optimized spacing and touch targets.
- **Mobile Portrait** – Stacked layout with sequencer grid adapting to 4 or 8 columns.
- **Mobile Landscape** – Horizontal layout optimized for wider screens.

### Common Interactions
- **Adjust Knobs** – Click (or touch) and drag vertically.
- **Reset Knobs** – Double‑tap to revert to default.
- **Toggle Buttons** – Single tap to activate/deactivate.
- **Prevent Zoom** – Mobile UI locks zoom to allow rapid tapping on sequencer steps.

---

## 6. Quick Start Guide

1. Press **RANDOMIZE** for a starting point.
2. Press **RUN** to hear the beat.
3. Switch to **Pattern Mode** if not already there.
4. Tweak **CUTOFF** and **RESONANCE** on the TB‑303 units while playing.
5. Click steps in the sequencer to create your own pattern.
6. Use **COPY** and **PASTE** to duplicate patterns across P1-P16.
7. Switch to **Song Mode** to arrange multiple patterns.
8. Click **SHARE URL** to copy a shareable link.

Happy Acid Making! 🚀

---

## 7. Advanced Tips

### TB-303 Tips
- Use **SLIDE** on consecutive notes for classic acid glide effects.
- Combine high **RESONANCE** with moderate **CUTOFF** for squelchy sounds.
- **ACCENT** adds punch to specific steps—use sparingly for impact.
- The **DELAY** effect is tempo-synced—try 50% for eighth-note delays or 100% for quarter-note delays.

### TR-909 Tips
- Layer **BD** and **SD** on different steps for classic house patterns.
- Use **CH** and **OH** together, but avoid triggering both on the same step (909 behavior).
- The **CLAP** sounds great on beats 2 and 4 for a classic backbeat.

### Pattern Management
- Create variations by copying a pattern and making small changes.
- Use different patterns for verse, chorus, and breakdown sections.
- In Song Mode, repeat patterns to create longer arrangements.

### Performance Tips
- Adjust knobs in real-time while playing for live tweaking.
- Use the **RANDOMIZE** button for instant inspiration.
- The **CLEAR** button in Pattern Mode clears all units; in Song Mode it clears the timeline.

---

## 8. Keyboard Shortcuts

Currently, all interactions are mouse/touch-based. Keyboard shortcuts may be added in future updates.

---

## 9. Browser Compatibility

AcidBros works best in modern browsers:
- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari (desktop and iOS)

*Note: Some older browsers may not support all Web Audio API features.*

---

## 10. Installation

### Web Browser
Simply open `index.html` in any modern browser. No installation required.

### Local Development
```bash
python3 -m http.server 8080
```
Then open `http://localhost:8080` in your browser.

### Progressive Web App (PWA)
On supported browsers, you can install AcidBros as a standalone app:
1. Click the install icon in your browser's address bar.
2. Follow the prompts to add to your home screen or applications.
3. Launch AcidBros like a native app with offline support.

---

## License
MIT License
