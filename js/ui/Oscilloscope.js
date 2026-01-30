import { AudioEngine } from '../audio/AudioEngine.js';

export const Oscilloscope = {
    canvas: null,
    ctx: null,
    dataArray: null,
    animationId: null,
    isEnabled: true, // Power toggle state
    lod: 4, // Level of Detail (sample every Nth point, e.g., 4 = 1/4 resolution)

    init() {
        this.canvas = document.getElementById('oscilloscope');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d', { alpha: true });

        // Match canvas resolution to display size
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        this.dataArray = new Uint8Array(2048);

        // Visibility listener to save resources
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stop();
            else if (this.isEnabled) this.start();
        });

        this.start();
    },

    toggle(state) {
        this.isEnabled = (state !== undefined) ? state : !this.isEnabled;
        if (this.isEnabled) {
            this.start();
        } else {
            this.stop();
            // Clear canvas when disabled
            if (this.ctx) {
                this.ctx.fillStyle = '#001100';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }
        }
    },

    start() {
        if (!this.isEnabled) return;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.draw();
    },

    stop() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.animationId = null;
    },

    draw() {
        if (!this.isEnabled) return;
        this.animationId = requestAnimationFrame(this.draw.bind(this));

        if (!AudioEngine.analyser) return;

        AudioEngine.getAudioData(this.dataArray, 'time');

        const width = this.canvas.width;
        const height = this.canvas.height;
        const bufferLength = this.dataArray.length;

        // Clear with fade effect (Performance: rgba blend is still cheaper than full sweep if limited)
        this.ctx.fillStyle = 'rgba(0, 17, 0, 0.25)';
        this.ctx.fillRect(0, 0, width, height);

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#00ff00';

        // Performance: Disabled shadowBlur as it's very expensive on some GPUs
        this.ctx.shadowBlur = 0;

        this.ctx.beginPath();

        // Find zero crossing for stabilization (Sync)
        let zeroCross = 0;
        for (let i = 0; i < bufferLength - 1; i++) {
            if (this.dataArray[i] < 128 && this.dataArray[i + 1] >= 128) {
                zeroCross = i;
                break;
            }
        }

        // Downsampled drawing (LOD)
        const sliceWidth = (width * 1.0 / (bufferLength - zeroCross)) * this.lod;
        let x = 0;

        for (let i = zeroCross; i < bufferLength; i += this.lod) {
            const v = this.dataArray[i] / 128.0;
            const y = v * height / 2;

            if (i === zeroCross) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }

            x += sliceWidth;
            if (x > width) break;
        }

        this.ctx.stroke();
    }
};
