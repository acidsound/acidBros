export class TR909 {
    constructor(ctx, output) {
        this.ctx = ctx;
        this.output = output;
        this.noiseBuffer = null;
        this.samples = {};
        this.customSamples = new Map(); // id -> AudioBuffer
        this.customSampleMap = {}; // trackId -> customSampleId
    }

    setCustomSampleMap(map) {
        this.customSampleMap = { ...map };
    }
    // Note: initBuffers should be called and awaited by the engine

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

        // Load Custom Samples from SampleStore
        try {
            const { SampleStore } = await import('../data/SampleStore.js');
            const allCustom = await SampleStore.getAllSamples();
            for (const s of allCustom) {
                const buffer = await this.ctx.decodeAudioData(s.data.slice(0));
                this.customSamples.set(s.id, buffer);
            }
            console.log(`TR-909: Loaded ${allCustom.length} custom samples from store`);
        } catch (err) {
            console.warn('TR-909: Failed to load custom samples', err);
        }

        // Initialize map from Data if available
        const { Data } = await import('../data/Data.js');
        if (Data && Data.customSampleMap) {
            this.customSampleMap = { ...Data.customSampleMap };
        }
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
        const now = time;
        const baseFreq = 48; // Fixed hardware base frequency

        // --- Master Gain (Fixes Level Control) ---
        const masterGain = this.ctx.createGain();
        masterGain.gain.setValueAtTime(P.vol * 1.5, now);
        masterGain.connect(this.output);

        // --- 1. Main Drum Voice (Triangle -> Saturator Simulation) ---
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        const shaper = this.ctx.createWaveShaper();

        osc.type = 'triangle';

        // TUNE: Pitch Envelope Decay (P.p1)
        // Neutral (40) should be a tight thud.
        // Below 40: Very fast envelope (effectively no sweep).
        // Above 40: Increasing decay time for the pitch sweep.
        let pitchDecay;
        if (P.p1 <= 40) {
            pitchDecay = 0.005 + (P.p1 / 40) * 0.015; // 5ms to 20ms (Very tight)
        } else {
            pitchDecay = 0.02 + ((P.p1 - 40) / 60) * 0.150; // 20ms to 170ms
        }

        const startPitch = baseFreq * 6; // Start around 288Hz
        osc.frequency.setValueAtTime(startPitch, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq, now + pitchDecay);

        // Simulated saturate/diode clip (Simple sigmoid)
        function makeDistortionCurve(amount) {
            const k = typeof amount === 'number' ? amount : 50;
            const n_samples = 44100;
            const curve = new Float32Array(n_samples);
            const deg = Math.PI / 180;
            for (let i = 0; i < n_samples; ++i) {
                const x = i * 2 / n_samples - 1;
                curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
            }
            return curve;
        }
        shaper.curve = makeDistortionCurve(10); // Subtle clipping

        // Main Volume Envelope (DECAY: P.p3)
        const decayTime = 0.1 + (P.p3 / 100) * 0.8;
        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.linearRampToValueAtTime(1.0, now + 0.002);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);

        // --- 2. Attack Component (Click: Pulse + Filtered Noise) ---
        // ATTACK (P.p2) controls click volume. Reduced for accuracy.
        const clickOsc = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        clickOsc.type = 'square';
        clickOsc.frequency.setValueAtTime(800, now);

        // Noise for attack click
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        const noiseGain = this.ctx.createGain();

        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(2500, now);

        // Calibrated click level: very short transients (5-8ms)
        const clickLevel = (P.p2 / 100) * 0.4; // Reduced multiplier
        clickGain.gain.setValueAtTime(clickLevel, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.008);
        noiseGain.gain.setValueAtTime(clickLevel * 0.5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.005);

        // Connections
        osc.connect(shaper);
        shaper.connect(oscGain);
        oscGain.connect(masterGain);

        clickOsc.connect(clickGain);
        clickGain.connect(masterGain);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);

        // Start/Stop
        osc.start(now);
        osc.stop(now + decayTime + 0.1);
        clickOsc.start(now);
        clickOsc.stop(now + 0.02);
        noise.start(now);
        noise.stop(now + 0.02);
    }

    playSD(time, P) {
        const now = time;
        // TUNE: VR1 Adjusts the pitch bend depth and base frequencies
        const baseFreq = 180 + (P.p1 / 100) * 60;

        // --- 1. Drum Body (VCO-1 & VCO-2: Triangle) ---
        // Service notes: VCO-1 lower, VCO-2 higher. Ratio ~1:1.6
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const bodyGain = this.ctx.createGain();

        osc1.type = 'triangle';
        osc2.type = 'triangle';

        const f1 = baseFreq;
        const f2 = baseFreq * 1.62; // Hardware-accurate ratio

        // Pitch Bend (IC36 control voltage generator) - approx 20ms
        const bendDepth = 1.5;
        osc1.frequency.setValueAtTime(f1 * bendDepth, now);
        osc1.frequency.exponentialRampToValueAtTime(f1, now + 0.02);
        osc2.frequency.setValueAtTime(f2 * bendDepth, now);
        osc2.frequency.exponentialRampToValueAtTime(f2, now + 0.02);

        // Body (ENV 3)
        bodyGain.gain.setValueAtTime(P.vol * 1.2, now);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        // --- 2. Snappy (Noise through parallel filters) ---
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        // LPF Path (IC39b) - Constant "body" noise
        const snapLPF = this.ctx.createBiquadFilter();
        const snapLPFGain = this.ctx.createGain();
        snapLPF.type = 'lowpass';
        snapLPF.frequency.setValueAtTime(4000 + (P.p2 / 100) * 4000, now);

        // HPF Path (IC39a) - "Articulate" high frequency components
        const snapHPF = this.ctx.createBiquadFilter();
        const snapHPFGain = this.ctx.createGain();
        snapHPF.type = 'highpass';
        snapHPF.frequency.setValueAtTime(1200 + (P.p2 / 100) * 2000, now);

        const snappyLevel = P.p3 / 100;
        // LPF provides the "meat" of the snare snap
        snapLPFGain.gain.setValueAtTime(P.vol * snappyLevel * 1.5, now);
        snapLPFGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        // HPF is the articulate "sizzle", more influenced by Snappy knob
        snapHPFGain.gain.setValueAtTime(P.vol * snappyLevel * 1.0, now);
        snapHPFGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        // Connections
        osc1.connect(bodyGain);
        osc2.connect(bodyGain);
        bodyGain.connect(this.output);

        noise.connect(snapLPF);
        snapLPF.connect(snapLPFGain);
        snapLPFGain.connect(this.output);

        noise.connect(snapHPF);
        snapHPF.connect(snapHPFGain);
        snapHPFGain.connect(this.output);

        // Start/Stop
        osc1.start(now);
        osc2.start(now);
        noise.start(now);

        osc1.stop(now + 0.2);
        osc2.stop(now + 0.2);
        noise.stop(now + 0.5);
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
        if (!P) return;

        const now = time;
        const burstCount = 4;
        const burstInterval = 0.008; // 8ms
        const duration = 0.2 + (P.decay / 100) * 0.6; // Scale duration by decay parameter

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.Q.setValueAtTime(1.0, now);

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0, now);

        // Initial burst effects (multi-hit attack)
        for (let i = 0; i < burstCount; i++) {
            const t = now + i * burstInterval;
            gainNode.gain.exponentialRampToValueAtTime(P.vol * 1.5, t + 0.001);
            gainNode.gain.exponentialRampToValueAtTime(P.vol * 0.2, t + burstInterval);
        }

        // Final decay tail
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.output);

        noise.start(now);
        noise.stop(now + duration + 0.1);
    }

    playTom(time, type, P) {
        const now = time;
        // Tune mappings for LT, MT, HT
        let f1, f2, f3;
        if (type === 'lt') { f1 = 80; f2 = 120; f3 = 160; }
        else if (type === 'mt') { f1 = 120; f2 = 180; f3 = 240; }
        else { f1 = 180; f2 = 270; f3 = 360; }

        const tuneOffset = (P.p1 / 100) * (f1 * 0.5);
        const decayTime = 0.1 + (P.p2 / 100) * 0.8;

        const masterGain = this.ctx.createGain();
        masterGain.gain.setValueAtTime(P.vol * 1.2, now);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);
        masterGain.connect(this.output);

        [f1, f2, f3].forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();

            // VCO-1 (lowest) is usually a bit waveshaped, others cleaner
            osc.type = (i === 0) ? 'triangle' : 'sine';
            const targetFreq = f + tuneOffset;

            osc.frequency.setValueAtTime(targetFreq * 1.3, now);
            osc.frequency.exponentialRampToValueAtTime(targetFreq, now + 0.05);

            // Per-oscillator volume balance
            const gainVal = (i === 0) ? 1.0 : (i === 1 ? 0.6 : 0.4);
            g.gain.setValueAtTime(gainVal, now);

            // Add skin noise to the highest oscillator (VCO-3)
            if (i === 2) {
                const noise = this.ctx.createBufferSource();
                noise.buffer = this.noiseBuffer;
                const filter = this.ctx.createBiquadFilter();
                const nGain = this.ctx.createGain();

                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(targetFreq * 2, now);
                nGain.gain.setValueAtTime(0.3, now);
                nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

                noise.connect(filter);
                filter.connect(nGain);
                nGain.connect(masterGain);
                noise.start(now);
                noise.stop(now + 0.1);
            }

            osc.connect(g);
            g.connect(masterGain);
            osc.start(now);
            osc.stop(now + decayTime + 0.1);
        });
    }

    playRim(time, P) {
        if (!P) return;

        const now = time;
        const masterGain = this.ctx.createGain();
        masterGain.gain.setValueAtTime(P.vol * 1.5, now);

        // 1. Core Resonant Bank (Bridged-T Networks)
        // Exact hardware frequencies: 220, 500, 1000 Hz
        const frequencies = [220, 500, 1000];
        const gains = [0.5, 0.4, 0.3];
        const decays = [0.05, 0.04, 0.035]; // High frequencies decay faster in metallic hits

        frequencies.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.frequency.setValueAtTime(f, now);
            // Subtle pitch decay to simulate the tension release of the ringing circuit
            osc.frequency.exponentialRampToValueAtTime(f * 0.98, now + decays[i]);

            gain.gain.setValueAtTime(gains[i], now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + decays[i]);

            osc.connect(gain);
            gain.connect(masterGain);

            osc.start(now);
            osc.stop(now + decays[i] + 0.01);
        });

        // 2. The "D89 Positive Pulse" (The sharp metallic trigger snap)
        // This provides the 'metallic' bite that sines alone lack.
        const snap = this.ctx.createOscillator();
        const snapGain = this.ctx.createGain();

        snap.type = 'triangle'; // Richer harmonics than sine for the 'hit'
        snap.frequency.setValueAtTime(1800, now);
        snap.frequency.exponentialRampToValueAtTime(400, now + 0.01);

        snapGain.gain.setValueAtTime(0.6, now);
        snapGain.gain.linearRampToValueAtTime(0, now + 0.006);

        snap.connect(snapGain);
        snapGain.connect(masterGain);

        snap.start(now);
        snap.stop(now + 0.01);

        // 3. Final HPF to tighten the sound
        const hpf = this.ctx.createBiquadFilter();
        hpf.type = "highpass";
        hpf.frequency.setValueAtTime(200, now);

        masterGain.connect(hpf);
        hpf.connect(this.output);
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
        // ... (existing factory triggers) ...
        const playOrCustom = (id, factoryMethod, paramArgs) => {
            if (seqData[id] && seqData[id][stepIndex]) {
                const customId = this.customSampleMap[id];
                if (customId && this.customSamples.has(customId)) {
                    this.playSample(time, this.customSamples.get(customId), params[id]);
                } else {
                    factoryMethod.apply(this, [time, ...paramArgs]);
                }
            }
        };

        playOrCustom('bd', this.playBD, [params.bd]);
        playOrCustom('sd', this.playSD, [params.sd]);
        playOrCustom('ch', this.playHat, [false, params.ch]);
        playOrCustom('oh', this.playHat, [true, params.oh]);
        playOrCustom('cp', this.playCP, [params.cp]);
        playOrCustom('lt', this.playTom, ['lt', params.lt]);
        playOrCustom('mt', this.playTom, ['mt', params.mt]);
        playOrCustom('ht', this.playTom, ['ht', params.ht]);
        playOrCustom('rs', this.playRim, [params.rs]);
        playOrCustom('cr', this.playCym, ['cr', params.cr]);
        playOrCustom('rd', this.playCym, ['rd', params.rd]);
    }
}
