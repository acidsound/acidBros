# acidBros Design Guide

This document defines the visual and interaction design standards for the acidBros application. All new features and UI components **MUST** adhere to these guidelines.

---

## 1. Typography

### Font Family
- **Primary Font**: `'Arial Narrow', 'Helvetica Neue', Arial, sans-serif`
- **LCD Display Font**: `'DSEG7Classic'` (7-segment only)

### Font Rules
- **Do NOT use multiple font families** within the same view or modal.
- **Do NOT use inline styles for typography**. All text styles must be defined in `styles.css`.
- Consistent font-size hierarchy:
  | Element | Size | Weight | Use Case |
  | :--- | :--- | :--- | :--- |
  | Modal Title | 14px | Bold | `.modal-title` |
  | Section Header | 10-11px | Bold | `.section-header` |
  | Body / Labels | 12-14px | Normal/Bold | General text |
  | Small Text | 10px | Bold | Labels, annotations |

---

## 2. Colors

### Core Palette (Retro Synth Aesthetic)
| Name | Variable | Hex | Usage |
| :--- | :--- | :--- | :--- |
| Background Main | `--bg-main` | `#111` | Page background |
| 303 Panel (Retro Gold) | `--panel-303` | `linear-gradient(#dcb670, #b89450)` | TB-303 chassis |
| 909 Panel (Vintage White) | `--panel-909` | `#e6e2d6` | TR-909 chassis |
| Piano Key White | `--key-white` | `linear-gradient(#fde4a9, #d8bb78)` | Sequencer Steps (White keys) |
| Piano Key Black | `--key-black` | `linear-gradient(#333, #111)` | Sequencer Steps (Black keys) |
| Hardware Plastic | - | `#1f1f1f` to `#151515` | Modal backgrounds |
| Accent Gold / Active | - | `#ffcc00` | Highlights, active text |
| Text Primary | - | `#ddd` | Main text |
| Border Dark | - | `#333`, `#444` | Dividers, modal borders |

### State Colors & Textures
| State | Styling Approach | Application |
| :--- | :--- | :--- |
| Active/Pressed | `translateY(3px)` + tighter inner & drop shadow | Physical buttons, synth keys |
| Physical Button | Rich gradient (`#d85c2e` to `#a33e1c`), `0 4px 0` bottom shadow | Manage drum track button, toggles |
| Modal Surface | Textured dark plastic gradient (`#1f1f1f` to `#151515`) | Overlays, note editors |
| Locked/Disabled | `opacity: 0.5` | Non-interactive elements |

---

## 3. Component Standards

### 3.1 Modal / Popover
- **Structure**:
  ```
  .piano-overlay (backdrop)
    └── .modal (or .add-track-modal, .note-editor, etc.)
          ├── .modal-header
          ├── .modal-body
          └── .modal-footer (optional)
  ```
- **Header Class**: `.modal-header` (defined below)
- **Background**: `#222`
- **Border**: `1px solid #444`
- **Border Radius**: `8px`
- **Box Shadow**: `0 20px 50px rgba(0,0,0,0.9)`

#### 3.2.1 Mandatory Header Layout
- **Structure**: Always place the title first as a block element (`<h3>` or `.modal-title`), followed by the close button.
- **Close Button Positioning**: **MUST** use `position: absolute; top: 5px; right: 5px;`. Do NOT use flexbox `justify-content` to position the close button.
- **Visuals**: Maintain the established background (`#333`) and padding. Do not add decorative sub-containers or background changes unless explicitly defined in the guide.

### 3.2 Modal Header (`.modal-header`)
```css
.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 15px;
    background: #333;
    border-bottom: 1px solid #444;
}

.modal-header .modal-title {
    margin: 0;
    color: #ddd;
    font-size: 14px;
    font-weight: bold;
    letter-spacing: 1px;
}
```

### 3.3 Close Button (`.close-btn`)
```css
.close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 20px;
    cursor: pointer;
    transition: color 0.2s;
}

.close-btn:hover {
    color: #fff;
}
```

### 3.4 Apply / Action Button (`.apply-btn`)
```css
.apply-btn {
    width: 100%;
    padding: 12px;
    background: #ffcc00;
    border: none;
    border-radius: 4px;
    color: #000;
    font-weight: bold;
    font-size: 13px;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all 0.2s;
}

.apply-btn:hover {
    background: #ffdb4d;
    box-shadow: 0 4px 15px rgba(255, 204, 0, 0.3);
}
```

---

## 4. Icon Guidelines

### 4.1 General
- **External Files**: All SVG icons MUST be stored as separate files in the `assets/icons/` directory.
- **No Dynamic Generation**: Icons should NOT be generated as strings in JavaScript (e.g., `UI.svgIcon()`).
- **Implementation**: Use CSS `mask-image` or `<svg><use xlink:href="..." /></svg>` for icons that require dynamic coloring (e.g., `currentColor`).
- Standard sizes: `18x18`, `22x22`, `32x32` pixels.
- Stroke-based icons should use `stroke-width: 2`.
- Color should be controllable via CSS (usually via `currentColor`).

### 4.2 Drum Kit Icons
Use recognizable, instrument-specific line-art icons.

| ID | Instrument | Icon Description |
| :--- | :--- | :--- |
| `bd` | Bass Drum | Front view of circular drum with support legs and kick pedal. |
| `sd` | Snare Drum | Drum with stick hitting the center of the head. |
| `lt` | Low Tom | Floor tom drum. |
| `mt` | Mid Tom | Medium rack tom. |
| `ht` | High Tom | Small rack tom. |
| `rs` | Rim Shot | Snare drum with drumstick lying across the rim diagonally. |
| `cp` | Hand Clap | Clapping hands emoji (OpenMoji black variant). |
| `ch` | Closed Hi-Hat | Two cymbals closed on a stand, with overlapping opaque bodies. |
| `oh` | Open Hi-Hat | Two cymbals open on a stand, with the top one partially covering the bottom. |
| `cr` | Crash Cymbal | Angled cymbal on a stand, side/angled view. |
| `rd` | Ride Cymbal | Angled cymbal on a stand with a bell, being hit by a stick. |

---

## 5. Spacing & Layout

### Grid and List Items
- Use `gap: 1px` with a darker background (`#333`) for grid borders.
- Item padding: `12px 15px` standard.
- Section headers: `padding: 12px 15px`, `background: #1a1a1a`.

### Row Consistency
- All rows in a list (e.g., drum tracks, settings) should use the same class for consistent spacing.
- Example: `.drum-track-row`, `.add-track-row` should share layout rules.

---

## 6. Interaction States

### Toggle / Checkbox Items
- **Inactive**: Default background, text `#ddd`, checkmark `○`.
- **Active**: Background `rgba(255, 204, 0, 0.05)`, text `#ffcc00`, checkmark `●`.
- **Locked**: `opacity: 0.5`, `cursor: default`.

### Buttons
- **Default**: Background `#444`, border `#555`, text `#ddd`.
- **Hover**: Background `#555`, border `#ffcc00`, text `#ffcc00`.
- **Active/Pressed**: Slight inward shadow or scale.

---

## 7. Mobile-First Interaction

### No Hover Effects
- **Do NOT rely on `:hover` for visual feedback**. Hover is not available on touch devices.
- Use `:active` for press/tap feedback instead.
- If hover is used on desktop, ensure the element is fully functional without it on mobile.

### Touch Considerations
- Minimum touch target size: `44x44px` (per Apple HIG / Material guidelines).
- Use `touch-action: manipulation` to eliminate 300ms tap delay.
- Avoid gestures that conflict with browser native gestures (e.g., horizontal swipe on song timeline).

---

## 8. Avoiding Common Mistakes

| ❌ Don't | ✅ Do |
| :--- | :--- |
| Use inline styles (`style="..."`) | Define in `styles.css` |
| Mix multiple font families | Stick to `Arial Narrow` |
| Use hardcoded colors | Use CSS variables or constants |
| Create new one-off header classes | Reuse `.modal-header` |
| Leave unrelated button margins | Ensure component self-containment |
| Use `:hover` for essential feedback | Use `:active` for touch feedback |

---

## 9. File Reference

| File | Purpose |
| :--- | :--- |
| `styles.css` | All component and utility styles |
| `.agent/DESIGN_GUIDE.md` | This document (source of truth) |
| `.agent/PROJECT_CONTEXT.md` | Architecture and feature context |

---

*Last Updated: 2026-02-02*
