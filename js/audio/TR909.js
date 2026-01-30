export class TR909 {
    constructor(ctx, output) {
        this.ctx = ctx;
        this.output = output;
        this.noiseBuffer = null;
        this.samples = {};
        // Note: initBuffers should be called and awaited by the engine
    }

    async initBuffers() {
        // Load Noise Buffer (Required for Snare and Clap synthesis)
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;

        // Local Samples (Hats and Cymbals ONLY)
        const BASE_URL = 'assets/samples/tr909/';
        const sampleFiles = {
            ch: 'hh01.wav',
            oh: 'oh01.wav',
            cr: 'cr01.wav',
            rd: 'rd01.wav'
        };

        this.samples = {};
        const loaders = Object.entries(sampleFiles).map(async ([key, file]) => {
            try {
                const response = await fetch(BASE_URL + file);
                const arrayBuffer = await response.arrayBuffer();
                this.samples[key] = await this.ctx.decodeAudioData(arrayBuffer);
            } catch (e) {
                console.error(`Failed to load 909 sample: ${key}`, e);
            }
        });

        await Promise.all(loaders);
        console.log('TR-909 Samples (Hats/Cymbals) loaded');
    }

    playSample(time, buffer, P, playbackRate = 1.0) {
        if (!buffer || !P || isNaN(P.vol)) return;

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.setValueAtTime(playbackRate, time);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(P.vol * 1.5, time); // Baseline boost

        // Apply decay if applicable (for Hats/Cymbals/Toms)
        if (P.decay !== undefined) {
            const decayTime = 0.05 + (P.decay / 100) * 2.0;
            gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
            src.stop(time + decayTime + 0.1);
        }

        src.connect(gain);
        gain.connect(this.output);
        src.start(time);
    }

    playBD(time, P) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Tune: Base freq 40Hz to 80Hz
        const baseFreq = 40 + (P.p1 / 100) * 40;
        osc.frequency.setValueAtTime(baseFreq * 2.5, time); // Start high for "click"
        osc.frequency.exponentialRampToValueAtTime(baseFreq, time + 0.05);

        // Decay: 0.1 to 0.6 seconds
        const decayTime = 0.1 + (P.p3 / 100) * 0.5;

        // Attack (Click)
        const clickOsc = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        clickOsc.type = 'square';
        clickOsc.frequency.setValueAtTime(baseFreq * 8, time);
        clickGain.gain.setValueAtTime(P.vol * 0.3 * (P.p2 / 100), time); // P.p2 = Attack/Click level
        clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.01);

        gain.gain.setValueAtTime(P.vol * 1.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

        osc.connect(gain);
        gain.connect(this.output);
        clickOsc.connect(clickGain);
        clickGain.connect(this.output);

        osc.start(time);
        osc.stop(time + decayTime + 0.1);
        clickOsc.start(time);
        clickOsc.stop(time + 0.02);
    }

    playSD(time, P) {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const noise = this.ctx.createBufferSource();
        const noiseFilter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        const noiseGain = this.ctx.createGain();

        const baseFreq = 150 + (P.p1 / 100) * 150; // Tune
        osc1.frequency.setValueAtTime(baseFreq, time);
        osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, time + 0.1);
        osc2.frequency.setValueAtTime(baseFreq * 1.5, time);
        osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, time + 0.1);

        noise.buffer = this.noiseBuffer;
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.setValueAtTime(1000 + (P.p2 / 100) * 1000, time); // Tone (P.p2)

        const snappiness = P.p3 / 100;
        gain.gain.setValueAtTime(P.vol * (1 - snappiness * 0.5), time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

        noiseGain.gain.setValueAtTime(P.vol * snappiness * 1.5, time); // Snappy (P.p3)
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

        osc1.connect(gain);
        osc2.connect(gain);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);

        gain.connect(this.output);
        noiseGain.connect(this.output);

        osc1.start(time);
        osc2.start(time);
        noise.start(time);
        osc1.stop(time + 0.2);
        osc2.stop(time + 0.2);
        noise.stop(time + 0.3);
    }

    playHat(time, isOpen, P) {
        if (!P) return;
        const buffer = isOpen ? this.samples.oh : this.samples.ch;
        if (!buffer) return;

        // 909 Hats are digital samples. Tuning affects pitch/speed.
        const rate = 0.8 + (P.p2 / 100) * 0.4;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.setValueAtTime(rate, time);

        const gain = this.ctx.createGain();
        const startGain = Math.max(0.001, P.vol * 1.5);
        gain.gain.setValueAtTime(startGain, time);

        // Decay mapping
        const decayVal = isOpen ? P.oh_decay : P.ch_decay;
        const decayTime = isOpen ? (0.1 + (decayVal / 100) * 0.8) : (0.02 + (decayVal / 100) * 0.1);

        gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

        src.connect(gain);
        gain.connect(this.output);
        src.start(time);
        src.stop(time + decayTime + 0.1);
    }

    playCP(time, P) {
        const noise = this.ctx.createBufferSource();
        const noiseFilter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        noise.buffer = this.noiseBuffer;
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(1200, time);
        noiseFilter.Q.setValueAtTime(1, time);

        gain.gain.setValueAtTime(0, time);
        // Multi-stage envelope for "clapping" feel
        [0, 0.01, 0.02, 0.03].forEach(offset => {
            gain.gain.linearRampToValueAtTime(P.vol * 1.2, time + offset);
            gain.gain.linearRampToValueAtTime(P.vol * 0.5, time + offset + 0.005);
        });
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

        noise.connect(noiseFilter);
        noiseFilter.connect(gain);
        gain.connect(this.output);

        noise.start(time);
        noise.stop(time + 0.4);
    }

    playTom(time, type, P) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Tune: 60Hz to 160Hz depending on Tom type
        let baseFreq = 60;
        if (type === 'mt') baseFreq = 90;
        if (type === 'ht') baseFreq = 130;

        const tunedFreq = baseFreq + (P.p1 / 100) * baseFreq;
        osc.frequency.setValueAtTime(tunedFreq * 1.5, time);
        osc.frequency.exponentialRampToValueAtTime(tunedFreq, time + 0.1);

        // Decay
        const decayTime = 0.1 + (P.p2 / 100) * 0.8;
        gain.gain.setValueAtTime(P.vol * 1.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

        osc.connect(gain);
        gain.connect(this.output);
        osc.start(time);
        osc.stop(time + decayTime + 0.1);
    }

    playRim(time, P) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1700, time);

        gain.gain.setValueAtTime(P.vol * 1.2, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1700, time);
        filter.Q.setValueAtTime(10, time);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.output);

        osc.start(time);
        osc.stop(time + 0.1);
    }

    playCym(time, type, P) {
        if (!P) return;
        const buffer = type === 'cr' ? this.samples.cr : this.samples.rd;
        if (!buffer) return;

        // Tune affects playback rate
        const tuneVal = type === 'cr' ? (P.cr_tune || 50) : (P.rd_tune || 50);
        const rate = 0.6 + (tuneVal / 100) * 1.0;

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.setValueAtTime(rate, time);

        const gain = this.ctx.createGain();
        const startGain = Math.max(0.001, P.vol * 1.5);
        gain.gain.setValueAtTime(startGain, time);

        // Decay
        const decayTime = type === 'cr' ? 1.5 : 2.5;
        gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

        src.connect(gain);
        gain.connect(this.output);
        src.start(time);
        src.stop(time + decayTime + 0.1);
    }

    processStep(time, stepIndex, seqData, params, tempo) {
        // seqData is expected to be { bd: [], sd: [], ... }
        // params is expected to be { bd: {}, sd: {}, ... }

        if (seqData.bd && seqData.bd[stepIndex]) this.playBD(time, params.bd);
        if (seqData.sd && seqData.sd[stepIndex]) this.playSD(time, params.sd);
        if (seqData.ch && seqData.ch[stepIndex]) this.playHat(time, false, params.ch);
        if (seqData.oh && seqData.oh[stepIndex]) this.playHat(time, true, params.oh);
        if (seqData.cp && seqData.cp[stepIndex]) this.playCP(time, params.cp);

        // New tracks
        if (seqData.lt && seqData.lt[stepIndex]) this.playTom(time, 'lt', params.lt);
        if (seqData.mt && seqData.mt[stepIndex]) this.playTom(time, 'mt', params.mt);
        if (seqData.ht && seqData.ht[stepIndex]) this.playTom(time, 'ht', params.ht);
        if (seqData.rs && seqData.rs[stepIndex]) this.playRim(time, params.rs);
        if (seqData.cr && seqData.cr[stepIndex]) this.playCym(time, 'cr', params.cr);
        if (seqData.rd && seqData.rd[stepIndex]) this.playCym(time, 'rd', params.rd);
    }
}
