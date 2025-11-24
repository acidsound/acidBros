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
            this.endDrag();
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

        if (e.type === 'touchstart') {
            // Prevent scroll only on drag start
            if (e.cancelable) e.preventDefault();
        }

        this.isDragging = true;
        if (this.tooltip) this.tooltip.classList.add('visible'); // Show tooltip
        this.startY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        this.startVal = parseFloat(this.value);

        window.addEventListener('mousemove', this.boundMove);
        window.addEventListener('touchmove', this.boundMove, { passive: false });
        window.addEventListener('mouseup', this.boundEnd);
        window.addEventListener('touchend', this.boundEnd);
    }

    handleMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        const clientY = e.clientY || e.touches[0].clientY;
        const deltaY = this.startY - clientY;
        const range = this.max - this.min;
        const sensitivity = 200;
        const deltaVal = (deltaY / sensitivity) * range;
        let newVal = this.startVal + deltaVal;
        newVal = Math.min(Math.max(newVal, this.min), this.max);
        if (this.step) newVal = Math.round(newVal / this.step) * this.step;

        this.value = newVal;
        this.updateVisuals();
    }

    endDrag() {
        this.isDragging = false;
        if (this.tooltip) this.tooltip.classList.remove('visible'); // Hide tooltip
        window.removeEventListener('mousemove', this.boundMove);
        window.removeEventListener('touchmove', this.boundMove);
        window.removeEventListener('mouseup', this.boundEnd);
        window.removeEventListener('touchend', this.boundEnd);
    }
}
