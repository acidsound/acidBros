export class RotaryKnob {
    constructor(container, label, id, min, max, value, step = 1, size = 'normal') {
        this.min = min;
        this.max = max;
        this.value = value;
        this.defaultVal = value; // Store initial value as default
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
        if (size === 'large') this.knobEl.classList.add('large');
        if (size === 'small') this.knobEl.classList.add('small');

        this.inputEl = document.createElement('input');
        this.inputEl.type = 'range';
        this.inputEl.className = 'knob-input';
        this.inputEl.id = id;
        this.inputEl.min = min;
        this.inputEl.max = max;
        this.inputEl.step = step;
        this.inputEl.value = value;

        this.wrapper.appendChild(this.knobEl);
        this.wrapper.appendChild(this.inputEl);

        // Tooltip (Skip for Tempo as it has its own display)
        if (id !== 'tempo') {
            this.tooltip = document.createElement('div');
            this.tooltip.className = 'knob-tooltip';
            this.wrapper.appendChild(this.tooltip);
        }

        container.appendChild(this.wrapper);

        this.isDragging = false;
        this.startY = 0;
        this.startVal = 0;

        this.updateVisuals();

        // Use standard event listeners
        this.knobEl.addEventListener('mousedown', this.startDrag.bind(this));
        this.knobEl.addEventListener('touchstart', this.startDrag.bind(this), { passive: false });

        this.boundMove = this.handleMove.bind(this);
        this.boundEnd = this.endDrag.bind(this);

        if (!window.knobInstances) window.knobInstances = {};
        window.knobInstances[id] = this;

        // Removed dblclick listener to handle it manually in startDrag
        this.lastTap = 0;
    }

    updateVisuals() {
        const range = this.max - this.min;
        const percent = (this.value - this.min) / range;
        const deg = -150 + (percent * 300);
        this.knobEl.style.transform = `rotate(${deg}deg)`;
        this.inputEl.value = this.value;

        // Update Tooltip
        if (this.tooltip) {
            this.tooltip.innerText = Math.round(this.value);
        }

        // Trigger input event for listeners
        this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    setValue(val) {
        this.value = Math.min(Math.max(val, this.min), this.max);
        this.updateVisuals();
    }

    startDrag(e) {
        // Safety: Ensure any previous drag is cleaned up
        if (this.isDragging) {
            this.endDrag(e);
        }

        const now = new Date().getTime();
        const isDouble = (now - this.lastTap < 400); // Increased threshold to 400ms

        if (isDouble) {
            if (e.cancelable) e.preventDefault(); // Prevent default only if cancelable
            e.stopPropagation(); // Stop event propagation

            this.setValue(this.defaultVal);

            // Briefly show tooltip on reset then hide
            if (this.tooltip) {
                this.tooltip.classList.add('visible');
                setTimeout(() => this.tooltip.classList.remove('visible'), 500);
            }

            this.lastTap = 0; // Reset tap timer
            return; // Do not start drag
        }

        this.lastTap = now;

        // For touch, we DO NOT prevent default here to allow scrolling to start.
        // We only prevent default in handleMove if we are actively dragging horizontally.
        if (e.type === 'mousedown') {
            e.preventDefault();
        }

        this.isDragging = true;
        this.inputType = e.type; // 'mousedown' or 'touchstart'
        this.touchId = null;

        if (this.tooltip) this.tooltip.classList.add('visible'); // Show tooltip

        if (e.type === 'touchstart') {
            // Use changedTouches to find the new touch that started this event
            const touch = e.changedTouches[0];
            this.touchId = touch.identifier;
            this.startY = touch.clientY;
            this.startX = touch.clientX;
        } else {
            this.startY = e.clientY;
            this.startX = e.clientX; // For mouse, capture X as well, though not used in current mouse logic
        }

        this.startVal = parseFloat(this.value);

        window.addEventListener('mousemove', this.boundMove);
        window.addEventListener('touchmove', this.boundMove, { passive: false });
        window.addEventListener('mouseup', this.boundEnd);
        window.addEventListener('touchend', this.boundEnd);
        window.addEventListener('touchcancel', this.boundEnd);
    }

    handleMove(e) {
        if (!this.isDragging) return;

        let clientX, clientY;

        if (this.inputType === 'touchstart') {
            // Find the specific touch that started this drag
            let touch = null;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.touchId) {
                    touch = e.changedTouches[i];
                    break;
                }
            }

            // If the touch that started this drag hasn't moved, check active touches just in case
            if (!touch) {
                for (let i = 0; i < e.touches.length; i++) {
                    if (e.touches[i].identifier === this.touchId) {
                        touch = e.touches[i];
                        break;
                    }
                }
            }

            if (!touch) return; // This event is for another finger

            clientX = touch.clientX;
            clientY = touch.clientY;

            const deltaX = clientX - this.startX;
            const deltaY = clientY - this.startY;

            // Check if movement is predominantly vertical (scrolling)
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
                // It's a scroll! Let the browser handle it.
                return;
            }

            // It's a horizontal drag (knob turn)
            if (e.cancelable) e.preventDefault();

            const range = this.max - this.min;
            const sensitivity = 200;
            const deltaVal = (deltaX / sensitivity) * range;
            let newVal = this.startVal + deltaVal;
            newVal = Math.min(Math.max(newVal, this.min), this.max);
            if (this.step) newVal = Math.round(newVal / this.step) * this.step;

            this.value = newVal;
            this.updateVisuals();
        } else {
            // Mouse: Vertical Drag (Standard)
            e.preventDefault();
            clientY = e.clientY;
            const delta = this.startY - clientY; // Up is positive

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

    endDrag(e) {
        if (!this.isDragging) return;

        // For touch, ensure the ending touch is the one we are tracking
        if (this.inputType === 'touchstart' && e) {
            let touchFound = false;
            // Check changedTouches (touchend/cancel)
            if (e.changedTouches) {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === this.touchId) {
                        touchFound = true;
                        break;
                    }
                }
            }
            // If the event doesn't contain our touch, it might be another finger lifting.
            // We should only stop dragging if OUR finger lifted.
            if (!touchFound && e.type !== 'touchcancel') {
                return;
            }
        }

        this.isDragging = false;
        this.touchId = null;
        if (this.tooltip) this.tooltip.classList.remove('visible'); // Hide tooltip
        window.removeEventListener('mousemove', this.boundMove);
        window.removeEventListener('touchmove', this.boundMove);
        window.removeEventListener('mouseup', this.boundEnd);
        window.removeEventListener('touchend', this.boundEnd);
        window.removeEventListener('touchcancel', this.boundEnd);
    }
}
