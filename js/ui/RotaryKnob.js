// Global Touch Manager for handling multi-touch across multiple knobs
class TouchManager {
    constructor() {
        this.activeKnobs = new Map(); // touchId -> knob instance
        this.isListening = false;
        this.boundMove = this.handleGlobalMove.bind(this);
        this.boundEnd = this.handleGlobalEnd.bind(this);
    }

    registerTouch(touchId, knob) {
        this.activeKnobs.set(touchId, knob);

        if (!this.isListening) {
            window.addEventListener('touchmove', this.boundMove, { passive: false });
            window.addEventListener('touchend', this.boundEnd);
            window.addEventListener('touchcancel', this.boundEnd);
            window.addEventListener('mousemove', this.boundMove);
            window.addEventListener('mouseup', this.boundEnd);
            this.isListening = true;
        }
    }

    unregisterTouch(touchId) {
        this.activeKnobs.delete(touchId);

        if (this.activeKnobs.size === 0 && this.isListening) {
            window.removeEventListener('touchmove', this.boundMove);
            window.removeEventListener('touchend', this.boundEnd);
            window.removeEventListener('touchcancel', this.boundEnd);
            window.removeEventListener('mousemove', this.boundMove);
            window.removeEventListener('mouseup', this.boundEnd);
            this.isListening = false;
        }
    }

    handleGlobalMove(e) {
        if (e.type === 'touchmove') {
            // Process each active touch
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                const knob = this.activeKnobs.get(touch.identifier);
                if (knob) {
                    knob.handleMove(e, touch);
                }
            }
        } else {
            // Mouse move - find the knob with 'mouse' as touchId
            const knob = this.activeKnobs.get('mouse');
            if (knob) {
                knob.handleMove(e, null);
            }
        }
    }

    handleGlobalEnd(e) {
        if (e.type === 'touchend' || e.type === 'touchcancel') {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const knob = this.activeKnobs.get(touch.identifier);
                if (knob) {
                    knob.endDrag(touch.identifier);
                }
            }
        } else {
            // Mouse up
            const knob = this.activeKnobs.get('mouse');
            if (knob) {
                knob.endDrag('mouse');
            }
        }
    }
}

// Create global instance
const globalTouchManager = new TouchManager();

export class RotaryKnob {
    constructor(container, label, id, min, max, value, step = 1, size = 'normal') {
        this.min = min;
        this.max = max;
        this.value = value;
        this.defaultVal = value;
        this.step = step;
        this.id = id;
        this.size = size;

        this.wrapper = document.createElement('div');
        this.wrapper.className = 'knob-wrapper';
        if (size === 'large') this.wrapper.classList.add('large');
        if (size === 'small') this.wrapper.classList.add('small');

        if (label) {
            this.labelEl = document.createElement('div');
            this.labelEl.className = 'knob-label';
            this.labelEl.innerText = label;
            this.wrapper.appendChild(this.labelEl);
        }

        this.knobEl = document.createElement('div');
        this.knobEl.className = 'rotary-knob';
        this.knobEl.id = id; // Set ID on the knob element for MIDI mapping
        this.knobEl.setAttribute('data-midi-mappable', 'knob'); // Mark as MIDI mappable
        if (size === 'large') this.knobEl.classList.add('large');
        if (size === 'small') this.knobEl.classList.add('small');

        this.inputEl = document.createElement('input');
        this.inputEl.type = 'range';
        this.inputEl.className = 'knob-input';
        this.inputEl.id = id + '-input'; // Use different ID for hidden input
        this.inputEl.min = min;
        this.inputEl.max = max;
        this.inputEl.step = step;
        this.inputEl.value = value;

        this.wrapper.appendChild(this.knobEl);
        this.wrapper.appendChild(this.inputEl);

        if (id !== 'tempo') {
            this.tooltip = document.createElement('div');
            this.tooltip.className = 'knob-tooltip';
            this.wrapper.appendChild(this.tooltip);
        }

        container.appendChild(this.wrapper);

        this.isDragging = false;
        this.touchId = null;
        this.startY = 0;
        this.startX = 0;
        this.startVal = 0;
        this.inputType = null;

        this.updateVisuals();

        this.knobEl.addEventListener('mousedown', this.startDrag.bind(this));
        this.knobEl.addEventListener('touchstart', this.startDrag.bind(this), { passive: false });

        if (!window.knobInstances) window.knobInstances = {};
        window.knobInstances[id] = this;

        this.lastTap = 0;
    }

    updateVisuals() {
        const range = this.max - this.min;
        const percent = (this.value - this.min) / range;
        const deg = -150 + (percent * 300);
        this.knobEl.style.transform = `rotate(${deg}deg)`;
        this.inputEl.value = this.value;

        if (this.tooltip) {
            this.tooltip.innerText = Math.round(this.value);
        }

        this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    setValue(val) {
        this.value = Math.min(Math.max(val, this.min), this.max);
        this.updateVisuals();
    }

    startDrag(e) {
        if (this.isDragging) {
            this.endDrag(this.touchId);
        }

        const now = new Date().getTime();
        const isDouble = (now - this.lastTap < 400);

        if (isDouble) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();

            this.setValue(this.defaultVal);

            if (this.tooltip) {
                this.tooltip.classList.add('visible');
                setTimeout(() => this.tooltip.classList.remove('visible'), 500);
            }

            this.lastTap = 0;
            return;
        }

        this.lastTap = now;

        if (e.type === 'mousedown') {
            e.preventDefault();
        }

        this.isDragging = true;
        this.inputType = e.type;

        if (this.tooltip) this.tooltip.classList.add('visible');

        if (e.type === 'touchstart') {
            const touch = e.changedTouches[0];
            this.touchId = touch.identifier;
            this.startY = touch.clientY;
            this.startX = touch.clientX;
        } else {
            this.touchId = 'mouse';
            this.startY = e.clientY;
            this.startX = e.clientX;
        }

        this.startVal = parseFloat(this.value);

        // Register with global touch manager
        globalTouchManager.registerTouch(this.touchId, this);
    }

    handleMove(e, touch) {
        if (!this.isDragging) return;

        let clientY;

        if (this.inputType === 'touchstart') {
            if (!touch) return;

            if (e.cancelable) e.preventDefault();

            clientY = touch.clientY;
            const delta = this.startY - clientY;

            const range = this.max - this.min;
            const sensitivity = 200;
            const deltaVal = (delta / sensitivity) * range;
            let newVal = this.startVal + deltaVal;
            newVal = Math.min(Math.max(newVal, this.min), this.max);
            if (this.step) newVal = Math.round(newVal / this.step) * this.step;

            this.value = newVal;
            this.updateVisuals();

        } else {
            e.preventDefault();
            clientY = e.clientY;
            const delta = this.startY - clientY;

            const range = this.max - this.min;
            const sensitivity = 200;
            const deltaVal = (delta / sensitivity) * range;
            let newVal = this.startVal + deltaVal;
            newVal = Math.min(Math.max(newVal, this.min), this.max);
            if (this.step) newVal = Math.round(newVal / this.step) * this.step;

            this.value = newVal;
            this.updateVisuals();
        }
    }

    endDrag(touchId) {
        if (!this.isDragging || touchId !== this.touchId) return;

        this.isDragging = false;
        if (this.tooltip) this.tooltip.classList.remove('visible');

        // Unregister from global touch manager
        globalTouchManager.unregisterTouch(this.touchId);
        this.touchId = null;
    }
}
