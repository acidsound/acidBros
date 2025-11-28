import { AudioEngine } from '../audio/AudioEngine.js';

export const Oscilloscope = {
    canvas: null,
    ctx: null,
    dataArray: null,
    animationId: null,

    init() {
        this.canvas = document.getElementById('oscilloscope');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');

        // Match canvas resolution to display size
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        // Initialize data array
        // FFT Size is 2048, so we need a buffer of that size
        this.dataArray = new Uint8Array(2048);

        this.start();
    },

    start() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.draw();
    },

    stop() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.animationId = null;
    },

    draw() {
        this.animationId = requestAnimationFrame(this.draw.bind(this));

        if (!AudioEngine.analyser) return;

        // Get Time Domain Data
        AudioEngine.getAudioData(this.dataArray, 'time');

        const width = this.canvas.width;
        const height = this.canvas.height;
        const bufferLength = this.dataArray.length;

        // Clear with fade effect for CRT look
        this.ctx.fillStyle = 'rgba(0, 17, 0, 0.2)';
        this.ctx.fillRect(0, 0, width, height);

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowColor = '#00ff00';
        this.ctx.beginPath();

        const sliceWidth = width * 1.0 / bufferLength;
        let x = 0;

        // Find zero crossing for stabilization
        let zeroCross = 0;
        for (let i = 0; i < bufferLength - 1; i++) {
            if (this.dataArray[i] < 128 && this.dataArray[i + 1] >= 128) {
                zeroCross = i;
                break;
            }
        }

        for (let i = zeroCross; i < bufferLength; i++) {
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
