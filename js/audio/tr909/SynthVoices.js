// --- Unified Drum Engine Presets (909 Factory Defaults) ---
const FACTORY_PRESETS = {
    bd: {
        osc1: { enabled: true, wave: 'Tri', p_decay: 40, p_amt: 60, a_attack: 0, a_decay: 45, drive: 15 },
        noise: { enabled: true, color: 'White', filter_type: 'BPF', cutoff: 2500, res: 5, attack: 0, decay: 5, level: 20 },
        master: { hpf_cutoff: 20, master_vol: 80 }
    },
    sd: {
        osc1: { enabled: true, wave: 'Tri', p_decay: 5, p_amt: 20, a_attack: 0, a_decay: 10, level: 100 },
        osc2: { enabled: true, wave: 'Tri', tune: 8, p_decay: 5, p_amt: 20, a_attack: 0, a_decay: 10, level: 80 },
        noise: { enabled: true, color: 'White', filter_type: 'BPF', cutoff: 5000, res: 10, attack: 0, decay: 25, level: 70 },
        master: { hpf_cutoff: 20, master_vol: 80 }
    },
    tom: {
        osc1: { enabled: true, wave: 'Tri', p_decay: 10, p_amt: 30, a_attack: 0, a_decay: 40, level: 100 },
        osc2: { enabled: true, wave: 'Sine', tune: 7, a_attack: 0, a_decay: 30, level: 60 },
        osc3: { enabled: true, wave: 'Sine', tune: 12, a_attack: 0, a_decay: 20, level: 40 },
        noise: { enabled: true, color: 'White', filter_type: 'BPF', cutoff: 2000, res: 5, attack: 0, decay: 5, level: 30 },
        master: { hpf_cutoff: 20, master_vol: 80 }
    },
    rs: {
        osc1: { enabled: true, wave: 'Sine', tune: 12, a_attack: 0, a_decay: 5, level: 50 },
        osc2: { enabled: true, wave: 'Sine', tune: 24, a_attack: 0, a_decay: 4, level: 40 },
        osc3: { enabled: true, wave: 'Sine', tune: 36, a_attack: 0, a_decay: 3, level: 30 },
        osc4: { enabled: true, wave: 'Tri', tune: 48, p_decay: 2, p_amt: 50, a_attack: 0, a_decay: 2, level: 60 },
        master: { hpf_cutoff: 400, res: 5, master_vol: 80 }
    },
    cp: {
        noise: { enabled: true, color: 'White', filter_type: 'BPF', cutoff: 1200, res: 10, attack: 0, decay: 40, burst_count: 4, burst_rate: 8, level: 100 },
        master: { hpf_cutoff: 20, master_vol: 80 }
    }
};

export const SynthVoices = {
    // --- Instrument Wrappers ---
    // These merge main 909 knobs into the unified engine
    playBD(ctx, output, time, P, noiseBuffer) {
        const preset = JSON.parse(JSON.stringify(FACTORY_PRESETS.bd));
        preset.osc1.p_decay = P.p1;
        preset.osc1.a_decay = P.p3;
        preset.osc1.drive = 10 + (P.p2 / 100) * 20; // Attack knob maps to drive here
        SynthVoices.playUnifiedSynth(ctx, output, time, { ...P, customSynth: preset }, noiseBuffer);
    },

    playSD(ctx, output, time, P, noiseBuffer) {
        const preset = JSON.parse(JSON.stringify(FACTORY_PRESETS.sd));
        preset.osc1.tune = -5 + (P.p1 / 100) * 10;
        preset.osc2.tune = preset.osc1.tune + 8;
        preset.noise.cutoff = 3000 + (P.p2 / 100) * 5000;
        preset.noise.level = P.p3;
        SynthVoices.playUnifiedSynth(ctx, output, time, { ...P, customSynth: preset }, noiseBuffer);
    },

    playTom(ctx, output, time, type, P, noiseBuffer) {
        const preset = JSON.parse(JSON.stringify(FACTORY_PRESETS.tom));
        let baseTune = 0;
        if (type === 'lt') baseTune = -12;
        if (type === 'ht') baseTune = 12;
        preset.osc1.tune = baseTune + (P.p1 / 100) * 12;
        preset.osc1.a_decay = P.p2;
        SynthVoices.playUnifiedSynth(ctx, output, time, { ...P, customSynth: preset }, noiseBuffer);
    },

    playLowTom(ctx, output, time, P, noiseBuffer) { SynthVoices.playTom(ctx, output, time, 'lt', P, noiseBuffer); },
    playMidTom(ctx, output, time, P, noiseBuffer) { SynthVoices.playTom(ctx, output, time, 'mt', P, noiseBuffer); },
    playHiTom(ctx, output, time, P, noiseBuffer) { SynthVoices.playTom(ctx, output, time, 'ht', P, noiseBuffer); },

    playRim(ctx, output, time, P) {
        const preset = JSON.parse(JSON.stringify(FACTORY_PRESETS.rs));
        SynthVoices.playUnifiedSynth(ctx, output, time, { ...P, customSynth: preset }, null); // No noise needed
    },

    playCP(ctx, output, time, P, noiseBuffer) {
        const preset = JSON.parse(JSON.stringify(FACTORY_PRESETS.cp));
        preset.noise.decay = P.decay;
        SynthVoices.playUnifiedSynth(ctx, output, time, { ...P, customSynth: preset }, noiseBuffer);
    },

    getFactoryPreset(trackId) {
        if (FACTORY_PRESETS[trackId]) return FACTORY_PRESETS[trackId];
        if (['lt', 'mt', 'ht'].includes(trackId)) return FACTORY_PRESETS.tom;
        return FACTORY_PRESETS.bd; // Default fallback
    },

    // --- The Unified Engine Core ---
    playUnifiedSynth(ctx, output, time, P, noiseBuffer) {
        if (!P.customSynth) return;
        const S = P.customSynth;
        const now = time;

        const masterGain = ctx.createGain();
        const masterVol = (S.master?.master_vol || 80) / 100;
        masterGain.gain.setValueAtTime((P.vol !== undefined ? P.vol : 1.0) * masterVol * 1.5, now);

        // Master High Pass Filter (Rim Shot / Crisp)
        const masterHPF = ctx.createBiquadFilter();
        masterHPF.type = 'highpass';
        masterHPF.frequency.setValueAtTime(S.master?.hpf_cutoff || 20, now);
        masterHPF.Q.setValueAtTime((S.master?.hpf_res || 0) / 10, now);

        masterGain.connect(masterHPF);
        masterHPF.connect(output);

        // --- Helper: Distortion Curve ---
        const makeDistortionCurve = (amount) => {
            const k = amount;
            const samples = 44100;
            const curve = new Float32Array(samples);
            for (let i = 0; i < samples; ++i) {
                const x = i * 2 / samples - 1;
                curve[i] = (3 + k) * x * 20 * (Math.PI / 180) / (Math.PI + k * Math.abs(x));
            }
            return curve;
        };

        // --- Process Oscillators 1-4 ---
        ['osc1', 'osc2', 'osc3', 'osc4'].forEach((id, idx) => {
            const cfg = S[id];
            if (!cfg || !cfg.enabled) return;

            const osc = ctx.createOscillator();
            const g = ctx.createGain();

            osc.type = (cfg.wave || 'Sine').toLowerCase();

            // Base Frequency calculation
            let freq = 55; // Default A1
            if (id === 'osc1') {
                freq = 55;
            } else {
                freq = 55 * Math.pow(2, (cfg.tune || 0) / 12);
                if (cfg.fine) freq *= Math.pow(2, cfg.fine / 1200);
            }

            // Pitch Envelope
            const pDecay = (cfg.p_decay || 0) / 100 * 0.4;
            const pAmt = (cfg.p_amt || 0) / 100 * 500;

            osc.frequency.setValueAtTime(freq + pAmt, now);
            if (pDecay > 0) {
                osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq), now + pDecay);
            }

            // Amplitude Envelope
            const attack = (cfg.a_attack || 0) / 100 * 0.05;
            const decay = (cfg.a_decay || 50) / 100 * 1.5;
            const level = (cfg.level !== undefined ? cfg.level : 100) / 100;

            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(level, now + attack + 0.001);
            g.gain.exponentialRampToValueAtTime(0.001, now + attack + decay + 0.002);

            // Saturation (Drive)
            if (cfg.drive > 3) {
                const shaper = ctx.createWaveShaper();
                shaper.curve = makeDistortionCurve(cfg.drive);
                osc.connect(shaper);
                shaper.connect(g);
            } else {
                osc.connect(g);
            }

            g.connect(masterGain);
            osc.start(now);
            osc.stop(now + attack + decay + 0.2);
        });

        // --- Process Noise ---
        const noiseCfg = S.noise;
        if (noiseCfg && noiseCfg.enabled && noiseBuffer) {
            const src = ctx.createBufferSource();
            src.buffer = noiseBuffer;
            const filter = ctx.createBiquadFilter();
            const g = ctx.createGain();

            filter.type = (noiseCfg.filter_type || 'LPF').toLowerCase();
            filter.frequency.setValueAtTime(noiseCfg.cutoff || 2000, now);
            filter.Q.setValueAtTime((noiseCfg.res || 0) / 10, now);

            const attack = (noiseCfg.attack || 0) / 100 * 0.04;
            const decay = (noiseCfg.decay || 30) / 100 * 1.0;
            const level = (noiseCfg.level !== undefined ? noiseCfg.level : 50) / 100;

            g.gain.setValueAtTime(0, now);

            // Handle Burst Mode (CLAP)
            const burstCount = parseInt(noiseCfg.burst_count) || 1;
            const burstRate = (noiseCfg.burst_rate || 8) / 1000; // ms to s

            if (burstCount > 1) {
                for (let i = 0; i < burstCount; i++) {
                    const t = now + i * burstRate;
                    g.gain.exponentialRampToValueAtTime(level, t + 0.001);
                    g.gain.exponentialRampToValueAtTime(level * 0.2, t + burstRate - 0.001);
                }
            } else {
                g.gain.linearRampToValueAtTime(level, now + attack + 0.001);
            }

            // Final decay tail
            g.gain.exponentialRampToValueAtTime(0.001, now + (burstCount > 1 ? (burstCount * burstRate) : attack) + decay);

            src.connect(filter);
            filter.connect(g);
            g.connect(masterGain);

            src.loop = true;
            src.start(now);
            src.stop(now + 1.0);
        }
    }
};
