export class TR909 {
    constructor(ctx, output) {
        this.ctx = ctx;
        this.output = output;
        this.noiseBuffer = null;
        this.metalBuffer = null;
        this.initBuffers();
    }

    initBuffers() {
        // Load Noise Buffer for 909
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;

        // Load Metal Buffer for 909 Hats
        const mb = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const md = mb.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            md[i] = Math.random() * 2 - 1;
        }
        this.metalBuffer = mb;
    }

    playBD(time, P) {
        // Validate Parameters
        if (!P ||
            isNaN(P.vol) || isNaN(P.p1) || isNaN(P.p2) || isNaN(P.p3)) {
            return;
        }

        const baseFreq = 50 + (P.pitch || 0);
        const tuneDepth = 1 + (P.tuneDepth || 3);
        const pitchEnvMs = 0.03 + (P.p1 * 0.0009);
        const ampDecay = 0.15 + (P.p2 * 0.005);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const startFreq = baseFreq * tuneDepth;
        const endFreq = baseFreq;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, time);
        osc.frequency.exponentialRampToValueAtTime(endFreq, time + pitchEnvMs);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(1.5 * P.vol, time + 0.002); // Boosted BD
        gain.gain.exponentialRampToValueAtTime(0.001, time + ampDecay);

        osc.connect(gain);
        gain.connect(this.output);

        // CLICK
        const click = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        click.type = 'square';
        click.frequency.setValueAtTime(3000, time);
        const clickAmp = 0.5 * (P.p3 / 100) * P.vol;
        clickGain.gain.setValueAtTime(clickAmp, time);
        clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.005);
        click.connect(clickGain);
        clickGain.connect(this.output);

        osc.start(time);
        osc.stop(time + ampDecay + 0.1);
        click.start(time);
        click.stop(time + 0.03);
    }

    playSD(time, P) {
        // Validate Parameters
        if (!P ||
            isNaN(P.vol) || isNaN(P.p1) || isNaN(P.p2) || isNaN(P.p3)) {
            return;
        }

        // ---- TUNE: 톤 피치 ----
        const tone = this.ctx.createOscillator();
        const toneGain = this.ctx.createGain();

        const startF = 350 + (P.p1);          // 필요하면 range/taper 조절
        const endF = 180 + (P.p1 * 0.5);

        tone.type = 'triangle';
        tone.frequency.setValueAtTime(startF, time);
        tone.frequency.exponentialRampToValueAtTime(endF, time + 0.03); // 짧은 pitch env

        const toneDecay = 0.15;
        toneGain.gain.setValueAtTime(1.2 * P.vol, time); // Boosted SD Tone
        toneGain.gain.exponentialRampToValueAtTime(0.001, time + toneDecay);

        // ---- NOISE: Tone & Snappy ----
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        noise.loop = true;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';

        const noiseGain = this.ctx.createGain();

        const toneNorm = P.p2 / 100;                  // 0..1
        const snapNorm = P.p3 / 100;

        const snapVol = snapNorm * P.vol * 1.2; // Boosted SD Noise
        const noiseDecay = 0.08 + (1.0 - toneNorm) * 0.20;

        noiseFilter.frequency.setValueAtTime(1000 + toneNorm * 5000, time);

        noiseGain.gain.setValueAtTime(snapVol, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + noiseDecay);

        // ---- 라우팅 ----
        tone.connect(toneGain);
        toneGain.connect(this.output);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.output);

        tone.start(time);
        tone.stop(time + 0.3);

        noise.start(time);
        noise.stop(time + noiseDecay + 0.05);
    }

    playHat(time, isOpen, P) {
        // Validate Parameters
        if (!P ||
            isNaN(P.vol) || isNaN(P.p1)) {
            return;
        }

        const src = this.ctx.createBufferSource();
        src.buffer = this.metalBuffer; src.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 8000; bp.Q.value = 0.5;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 7000;
        const gain = this.ctx.createGain();
        const baseDecay = isOpen ? (0.2 + P.p1 * 0.01) : (0.05 + P.p1 * 0.001);
        gain.gain.setValueAtTime(1.5 * P.vol, time); // Boosted Hats
        gain.gain.exponentialRampToValueAtTime(0.001, time + baseDecay);
        src.connect(bp); bp.connect(hp); hp.connect(gain); gain.connect(this.output);
        src.start(time); src.stop(time + baseDecay + 0.1);
    }

    playCP(time, P) {
        // Validate Parameters
        if (!P ||
            isNaN(P.vol) || isNaN(P.p1)) {
            return;
        }

        const ctx = this.ctx;

        const voiceGain = ctx.createGain();
        voiceGain.gain.value = P.vol * 1.2; // Boosted Clap
        voiceGain.connect(this.output);

        // 공통 노이즈 + BP 필터
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        noise.loop = false;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1500;
        bp.Q.value = 1.8;

        // 전체 테일 길이
        const decayBase = 0.15;
        const decay = decayBase + P.p1 * 0.003; // 150~450ms

        // ---- 펄스 엔벌로프 (여러 번 손뼉) ----
        const pulseGain = ctx.createGain();
        pulseGain.gain.setValueAtTime(0, time);

        const t0 = time;
        const pulseSpacing = 0.012;
        const pulseCount = 4;

        for (let i = 0; i < pulseCount; i++) {
            const pt = t0 + i * pulseSpacing;
            const amp = 1.0 * (1 - i * 0.15); // 뒤로 갈수록 살짝 감소

            pulseGain.gain.linearRampToValueAtTime(amp, pt);
            pulseGain.gain.exponentialRampToValueAtTime(0.001, pt + 0.015);
        }

        // ---- 리버브 테일 엔벌로프 ----
        const tailGain = ctx.createGain();
        tailGain.gain.setValueAtTime(0.6, time + 0.02);
        tailGain.gain.exponentialRampToValueAtTime(0.001, time + decay);

        // 라우팅
        noise.connect(bp);
        bp.connect(pulseGain);
        bp.connect(tailGain);
        pulseGain.connect(voiceGain);
        tailGain.connect(voiceGain);

        noise.start(time);
        noise.stop(time + decay + 0.05);
    }

    processStep(time, stepIndex, seqData, params, tempo) {
        // seqData is expected to be { bd: [], sd: [], ... }
        // params is expected to be { bd: {}, sd: {}, ... }

        if (seqData.bd[stepIndex]) this.playBD(time, params.bd);
        if (seqData.sd[stepIndex]) this.playSD(time, params.sd);
        if (seqData.ch[stepIndex]) this.playHat(time, false, params.ch);
        if (seqData.oh[stepIndex]) this.playHat(time, true, params.oh);
        if (seqData.cp[stepIndex]) this.playCP(time, params.cp);
    }
}
