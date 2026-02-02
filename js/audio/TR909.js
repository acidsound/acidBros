import { DrumVoice } from './tr909/DrumVoice.js';

export class TR909 {
    constructor(ctx, output) {
        this.ctx = ctx;
        this.output = output;
        this.noiseBuffer = null;
        this.samples = {};
        this.customSamples = new Map(); // id -> AudioBuffer
        this.customSampleMap = {}; // trackId -> customSampleId

        // New Architecture: Map of DrumVoices
        this.voices = new Map();

        // Default Track Configuration
        // This structure allows for easy addition of new tracks in the future
        this.trackConfig = {
            bd: { synth: 'playBD' },
            sd: { synth: 'playSD' },
            lt: { synth: 'playLowTom' },
            mt: { synth: 'playMidTom' },
            ht: { synth: 'playHiTom' },
            rs: { synth: 'playRim' },
            cp: { synth: 'playCP' },
            ch: { sample: 'ch', type: 'hat' },
            oh: { sample: 'oh', type: 'hat' },
            cr: { sample: 'cr', type: 'cymbal' },
            rd: { sample: 'rd', type: 'cymbal' }
        };
    }

    setCustomSampleMap(map) {
        this.customSampleMap = { ...map };
        this.refreshCustomSamples();
    }

    refreshCustomSamples() {
        // Update all voices with their assigned custom sample
        for (const [trackId, voice] of this.voices) {
            const customId = this.customSampleMap[trackId];
            if (customId && this.customSamples.has(customId)) {
                voice.setCustomSample(this.customSamples.get(customId));
            } else {
                voice.setCustomSample(null);
            }
        }
    }

    async initBuffers() {
        // Load Noise Buffer (Required for Snare and Clap synthesizers)
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

        // Initialize Drum Voices
        this.initVoices();

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

        // Apply loaded custom samples to voices
        this.refreshCustomSamples();
    }

    initVoices() {
        this.voices.clear();
        for (const [trackId, config] of Object.entries(this.trackConfig)) {
            const voice = new DrumVoice(this.ctx, this.output, this.noiseBuffer);

            if (config.synth) {
                voice.setSynth(config.synth);
            }

            if (config.sample && this.samples[config.sample]) {
                voice.setSample(this.samples[config.sample]);
            }

            if (config.type) {
                voice.type = config.type;
            }

            this.voices.set(trackId, voice);
        }
    }

    // --- Compatible Play Methods (Delegates to DrumVoice) ---
    // These are kept to maintain compatibility with AudioEngine.js preview calls

    playBD(time, P) { this.voices.get('bd')?.trigger(time, P); }
    playSD(time, P) { this.voices.get('sd')?.trigger(time, P); }
    playTom(time, type, P) { this.voices.get(type)?.trigger(time, P); }
    playRim(time, P) { this.voices.get('rs')?.trigger(time, P); }
    playCP(time, P) { this.voices.get('cp')?.trigger(time, P); }

    // Note: isOpen logic for Hats is implicitly handled by having separate 'ch' and 'oh' voices
    // AudioEngine calls playHat(time, isOpen, params)
    playHat(time, isOpen, P) {
        const id = isOpen ? 'oh' : 'ch';
        this.voices.get(id)?.trigger(time, P);
    }

    // AudioEngine calls playCym(time, type, params) where type is 'cr' or 'rd'
    playCym(time, type, P) {
        this.voices.get(type)?.trigger(time, P);
    }

    // Generic direct playback wrapper (if needed)
    playSample(time, buffer, P, playbackRate = 1.0) {
        // Create a temporary voice for generic playback? 
        // Or just use a raw utility. 
        // Existing TR909.js had this method used by playOrCustom wrapper.
        // With new architecture, we shouldn't need this externally, 
        // but if legacy code calls it...
        const v = new DrumVoice(this.ctx, this.output, this.noiseBuffer);
        v.type = 'standard';
        v.playSampleBuffer(time, buffer, P, playbackRate);
    }

    processStep(time, stepIndex, seqData, params, tempo) {
        // Iterate over all configured voices
        for (const [id, voice] of this.voices) {
            // Check if this track has a trig for this step
            if (seqData[id] && seqData[id][stepIndex]) {
                // Trigger the voice
                // params[id] contains the knob values for this track
                voice.trigger(time, params[id] || {});
            }
        }
    }
}

