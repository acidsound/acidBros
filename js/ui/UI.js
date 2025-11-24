import { RotaryKnob } from './RotaryKnob.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { Data } from '../data/Data.js';

export const UI = {
    init() {
        this.init303Knobs(1);
        this.init303Knobs(2);
        this.render303Grid(1);
        this.render303Grid(2);
        this.render909();

        document.getElementById('playBtn').onclick = () => AudioEngine.play();
        document.getElementById('stopBtn').onclick = () => AudioEngine.stop();
        document.getElementById('randomBtn').onclick = () => Data.randomize();
        document.getElementById('clearBtn').onclick = () => {
            [Data.seq303_1, Data.seq303_2].forEach(seq => {
                seq.forEach(s => {
                    s.active = false;
                    s.accent = false;
                    s.slide = false;
                    s.octave = 2;
                    s.note = 'C';
                });
            });
            Object.keys(Data.seq909).forEach(k => Data.seq909[k].fill(0));
            this.renderAll();
        };

        // Tempo Knob
        new RotaryKnob(document.getElementById('tempo-knob-container'), null, 'tempo', 60, 200, 125, 1, 'large');

        // Initialize 7-Segment Display
        this.initSevenSegment();
        this.updateSevenSegment(125);

        // Listen for Tempo Knob changes via the hidden input
        document.getElementById('tempo').addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            AudioEngine.tempo = val;
            this.updateSevenSegment(val);
        });
        document.getElementById('shareBtn').onclick = () => {
            const code = Data.exportState();
            const url = window.location.origin + window.location.pathname + "#" + code;
            navigator.clipboard.writeText(url).then(() => {
                const toast = document.getElementById('toast');
                toast.innerText = "Link copied! Share your beat.";
                toast.className = "show";
                setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
            });
        };

        if (window.location.hash && window.location.hash.length > 10) {
            Data.importState(window.location.hash.substring(1));
        } else {
            Data.init();
            setTimeout(() => Data.randomize(), 500);
        }
    },

    initSevenSegment() {
        ['digit-100', 'digit-10', 'digit-1'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = '';
            ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach(seg => {
                const s = document.createElement('div');
                s.className = `segment ${seg}`;
                el.appendChild(s);
            });
        });
    },

    updateSevenSegment(val) {
        const s = val.toString().padStart(3, '0');
        const map = {
            '0': ['a', 'b', 'c', 'd', 'e', 'f'],
            '1': ['b', 'c'],
            '2': ['a', 'b', 'd', 'e', 'g'],
            '3': ['a', 'b', 'c', 'd', 'g'],
            '4': ['b', 'c', 'f', 'g'],
            '5': ['a', 'c', 'd', 'f', 'g'],
            '6': ['a', 'c', 'd', 'e', 'f', 'g'],
            '7': ['a', 'b', 'c'],
            '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
            '9': ['a', 'b', 'c', 'd', 'f', 'g']
        };

        const updateDigit = (id, char) => {
            const el = document.getElementById(id);
            if (!el) return;
            const activeSegs = map[char] || [];
            Array.from(el.children).forEach(seg => {
                const segClass = seg.className.split(' ')[1]; // 'a', 'b', etc.
                if (activeSegs.includes(segClass)) seg.classList.add('on');
                else seg.classList.remove('on');
            });
        };

        updateDigit('digit-100', s[0]);
        updateDigit('digit-10', s[1]);
        updateDigit('digit-1', s[2]);
    },

    get303Params(unitId) {
        const getV = (id) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) : 0;
        };
        const waveEl = document.querySelector(`input[name="wave303_${unitId}"]:checked`);
        const wave = waveEl ? waveEl.value : 'sawtooth';

        return {
            wave: wave,
            tune: getV(`tune303_${unitId}`),
            cutoff: getV(`cutoff303_${unitId}`) / 100,
            reso: getV(`reso303_${unitId}`),
            env: getV(`env303_${unitId}`) / 100,
            decay: getV(`decay303_${unitId}`),
            accent: getV(`accent303_${unitId}`) / 100,
            vol: getV(`vol303_${unitId}`) / 100
        };
    },

    get909Params(track) {
        const getV = (id) => parseFloat(document.getElementById(id).value);
        const lvl = (id) => getV(id) / 100;
        if (track === 'bd') return { p1: getV('bd_p1'), p2: getV('bd_p2'), p3: getV('bd_p3'), vol: lvl('bd_level') };
        if (track === 'sd') return { p1: getV('sd_p1'), p2: getV('sd_p2'), p3: getV('sd_p3'), vol: lvl('sd_level') };
        if (track === 'ch') return { p1: getV('ch_p1'), vol: lvl('ch_level') };
        if (track === 'oh') return { p1: getV('oh_p1'), vol: lvl('oh_level') };
        if (track === 'cp') return { p1: getV('cp_p1'), vol: lvl('cp_level') };
        return {};
    },

    getParams(id) {
        if (id === 'tb303_1') return this.get303Params(1);
        if (id === 'tb303_2') return this.get303Params(2);
        if (id === 'tr909') {
            return {
                bd: this.get909Params('bd'),
                sd: this.get909Params('sd'),
                ch: this.get909Params('ch'),
                oh: this.get909Params('oh'),
                cp: this.get909Params('cp')
            };
        }
        return null;
    },

    renderAll() {
        this.render303Grid(1);
        this.render303Grid(2);
        this.render909();
    },

    init303Knobs(unitId) {
        const container = document.getElementById(`knobs303_${unitId}`);
        container.innerHTML = '';
        const params = [
            { l: 'TUNE', id: `tune303_${unitId}`, min: -1200, max: 1200, v: 0 },
            { l: 'CUTOFF', id: `cutoff303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'RESO', id: `reso303_${unitId}`, min: 0, max: 15, v: 0 },
            { l: 'ENV MOD', id: `env303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'DECAY', id: `decay303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'ACCENT', id: `accent303_${unitId}`, min: 0, max: 100, v: 50 },
            { l: 'VOLUME', id: `vol303_${unitId}`, min: 0, max: 100, v: 80 }
        ];
        params.forEach(p => {
            new RotaryKnob(container, p.l, p.id, p.min, p.max, p.v);
        });
    },

    render303Grid(unitId) {
        const grid = document.getElementById(`grid303_${unitId}`);
        grid.innerHTML = '';
        const seq = unitId === 1 ? Data.seq303_1 : Data.seq303_2;

        seq.forEach((step, i) => {
            const el = document.createElement('div');
            el.className = `step-303 ${step.active ? 'active' : ''}`;
            el.onclick = () => {
                step.active = !step.active;
                this.render303Grid(unitId);
            };

            const led = document.createElement('div'); led.className = 'led';

            const noteDisplay = document.createElement('div');
            noteDisplay.className = 'note-display';
            noteDisplay.innerText = step.note;
            noteDisplay.onclick = (e) => {
                e.stopPropagation();
                this.showNotePopover(e.clientX, e.clientY, step, unitId);
            };

            const octCtrls = document.createElement('div');
            octCtrls.className = 'step-ctrls'; // Reuse step-ctrls for layout

            const mkOctBtn = (lbl, targetOct) => {
                const b = document.createElement('div');
                b.innerText = lbl;
                b.className = 'mini-btn oct';
                // Active if current octave matches target
                if (step.octave === targetOct) b.classList.add('active');

                b.onclick = (e) => {
                    e.stopPropagation();
                    if (step.octave === targetOct) {
                        // Toggle OFF -> Return to neutral (2)
                        step.octave = 2;
                    } else {
                        // Toggle ON -> Set to target
                        step.octave = targetOct;
                    }
                    this.render303Grid(unitId);
                };
                return b;
            };

            octCtrls.appendChild(mkOctBtn('DN', 1));
            octCtrls.appendChild(mkOctBtn('UP', 3));

            const ctrls = document.createElement('div'); ctrls.className = 'step-ctrls';

            const mkBtn = (lbl, prop, cls) => {
                const b = document.createElement('div');
                b.innerText = lbl; b.className = 'mini-btn ' + cls;
                if (step[prop]) b.classList.add('active');
                b.onclick = (e) => {
                    e.stopPropagation();
                    step[prop] = !step[prop];
                    this.render303Grid(unitId);
                };
                return b;
            }

            ctrls.appendChild(mkBtn('AC', 'accent', 'acc'));
            ctrls.appendChild(mkBtn('SL', 'slide', 'sld'));

            el.appendChild(led); el.appendChild(noteDisplay); el.appendChild(octCtrls); el.appendChild(ctrls);
            grid.appendChild(el);
        });
    },

    showNotePopover(x, y, step, unitId) {
        // Remove existing popover if any
        const existing = document.getElementById('piano-popover-overlay');
        if (existing) existing.remove();

        // Find index of current step
        const seq = unitId === 1 ? Data.seq303_1 : Data.seq303_2;
        let currentIndex = seq.indexOf(step);

        // Create Overlay
        const overlay = document.createElement('div');
        overlay.id = 'piano-popover-overlay';
        overlay.className = 'piano-overlay';

        // Editor Container
        const editor = document.createElement('div');
        editor.className = 'note-editor';

        // --- Header ---
        const header = document.createElement('div');
        header.className = 'editor-header';

        const nav = document.createElement('div');
        nav.className = 'step-nav';

        const prevBtn = document.createElement('button');
        prevBtn.innerText = '<';

        const stepDisplay = document.createElement('div');
        stepDisplay.className = 'step-indicator';

        const nextBtn = document.createElement('button');
        nextBtn.innerText = '>';

        nav.appendChild(prevBtn);
        nav.appendChild(stepDisplay);
        nav.appendChild(nextBtn);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.innerHTML = '&times;';

        header.appendChild(nav);
        header.appendChild(closeBtn);
        editor.appendChild(header);

        // --- Controls ---
        const controls = document.createElement('div');
        controls.className = 'editor-controls';

        // Row 1: Octave & Toggles
        const row1 = document.createElement('div');
        row1.className = 'control-row';

        // Octave Group
        const octGroup = document.createElement('div');
        octGroup.className = 'control-group';
        const octLabel = document.createElement('div');
        octLabel.className = 'control-label';
        octLabel.innerText = 'Octave';

        const octSel = document.createElement('div');
        octSel.className = 'octave-selector';
        const octBtns = [];

        const mkOctBtn = (lbl, targetOct) => {
            const b = document.createElement('button');
            b.className = 'octave-btn';
            b.innerText = lbl;
            b.onclick = () => {
                const s = getCurrentStep();
                // Toggle logic: if already on target, go to 2 (neutral), else go to target
                const newVal = s.octave === targetOct ? 2 : targetOct;
                updateStep({ octave: newVal });
            };
            octBtns.push({ val: targetOct, el: b });
            octSel.appendChild(b);
        };

        mkOctBtn('DN', 1);
        mkOctBtn('UP', 3);

        octGroup.appendChild(octLabel);
        octGroup.appendChild(octSel);

        // Toggles Group
        const toggleGroup = document.createElement('div');
        toggleGroup.className = 'control-group';
        const toggleLabel = document.createElement('div');
        toggleLabel.className = 'control-label';
        toggleLabel.innerText = 'Modifiers';

        const toggleRow = document.createElement('div');
        toggleRow.className = 'toggle-row';

        const accBtn = document.createElement('div');
        accBtn.className = 'toggle-btn accent';
        accBtn.innerHTML = '<span>AC</span>';
        accBtn.onclick = () => updateStep({ accent: !getCurrentStep().accent });

        const slideBtn = document.createElement('div');
        slideBtn.className = 'toggle-btn slide';
        slideBtn.innerHTML = '<span>SL</span>';
        slideBtn.onclick = () => updateStep({ slide: !getCurrentStep().slide });

        toggleRow.appendChild(accBtn);
        toggleRow.appendChild(slideBtn);
        toggleGroup.appendChild(toggleLabel);
        toggleGroup.appendChild(toggleRow);

        row1.appendChild(octGroup);
        row1.appendChild(toggleGroup);

        // Row 2: Preview Toggle
        const row2 = document.createElement('div');
        const previewDiv = document.createElement('div');
        previewDiv.className = 'preview-toggle';
        const previewCheck = document.createElement('input');
        previewCheck.type = 'checkbox';
        previewCheck.className = 'preview-checkbox';
        previewCheck.checked = true;
        const previewLabel = document.createElement('span');
        previewLabel.innerText = 'Preview Sound';
        previewDiv.appendChild(previewCheck);
        previewDiv.appendChild(previewLabel);
        previewDiv.onclick = (e) => {
            if (e.target !== previewCheck) previewCheck.checked = !previewCheck.checked;
        };
        row2.appendChild(previewDiv);

        controls.appendChild(row1);
        controls.appendChild(row2);
        editor.appendChild(controls);

        // --- Mute Button ---
        const muteBtn = document.createElement('button');
        muteBtn.className = 'mute-btn';
        muteBtn.innerText = 'GATE OFF (REST)';
        muteBtn.onclick = () => {
            updateStep({ active: false });
            // User requested: "Input gate off state... note exists".
            // We keep the note value but set active false.
            // Usually we don't auto-advance on mute unless requested, but for pattern entry it's faster.
            // Let's auto-advance to keep flow.
            nextStep();
        };
        editor.appendChild(muteBtn);

        // --- Piano Roll ---
        const pianoContainer = document.createElement('div');
        pianoContainer.className = 'piano-container';

        const keys = [
            { n: 'C', type: 'white' },
            { n: 'C#', type: 'black' },
            { n: 'D', type: 'white' },
            { n: 'D#', type: 'black' },
            { n: 'E', type: 'white' },
            { n: 'F', type: 'white' },
            { n: 'F#', type: 'black' },
            { n: 'G', type: 'white' },
            { n: 'G#', type: 'black' },
            { n: 'A', type: 'white' },
            { n: 'A#', type: 'black' },
            { n: 'B', type: 'white' }
        ];

        // Helper to position keys
        const whiteKeys = keys.filter(k => k.type === 'white');
        const whiteWidth = 100 / whiteKeys.length;
        let whiteCount = 0;

        keys.forEach((k) => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `piano-key-new ${k.type}`;
            keyDiv.innerText = k.n;

            if (k.type === 'white') {
                keyDiv.style.width = `${whiteWidth}%`;
                keyDiv.style.left = `${whiteCount * whiteWidth}%`;
                whiteCount++;
            } else {
                keyDiv.style.width = `${whiteWidth * 0.7}%`;
                // Position black key centered on the line between current white count-1 and count
                // Actually, C# is between C (0) and D (1). So at 1 * width - half black width
                keyDiv.style.left = `${(whiteCount * whiteWidth) - (whiteWidth * 0.35)}%`;
            }

            keyDiv.onclick = (e) => {
                e.stopPropagation();
                const s = getCurrentStep();
                // Set note and ensure gate is ON
                updateStep({ note: k.n, active: true });
                if (previewCheck.checked) {
                    playPreview(s);
                }
                nextStep();
            };
            pianoContainer.appendChild(keyDiv);
        });

        editor.appendChild(pianoContainer);
        overlay.appendChild(editor);
        document.body.appendChild(overlay);

        // --- Logic ---
        const getCurrentStep = () => seq[currentIndex];

        const updateUI = () => {
            const s = getCurrentStep();
            stepDisplay.innerText = (currentIndex + 1).toString().padStart(2, '0');

            // Octave
            octBtns.forEach(b => {
                if (b.val === s.octave) b.el.classList.add('active');
                else b.el.classList.remove('active');
            });

            // Toggles
            if (s.accent) accBtn.classList.add('active'); else accBtn.classList.remove('active');
            if (s.slide) slideBtn.classList.add('active'); else slideBtn.classList.remove('active');

            // Mute
            if (!s.active) muteBtn.classList.add('active'); else muteBtn.classList.remove('active');

            // Keys
            document.querySelectorAll('.piano-key-new').forEach(el => {
                // Highlight key if it matches note
                if (el.innerText === s.note) {
                    el.classList.add('active');
                    // If gate is OFF (s.active is false), add disabled style
                    if (!s.active) el.classList.add('disabled');
                    else el.classList.remove('disabled');
                } else {
                    el.classList.remove('active', 'disabled');
                }
            });

            // Update Main Grid Background
            this.render303Grid(unitId);
        };

        const updateStep = (changes) => {
            const s = getCurrentStep();
            Object.assign(s, changes);
            updateUI();
        };

        const nextStep = () => {
            currentIndex = (currentIndex + 1) % 16;
            updateUI();
        };

        const prevStep = () => {
            currentIndex = (currentIndex - 1 + 16) % 16;
            updateUI();
        };

        const playPreview = (step) => {
            if (!AudioEngine.ctx) AudioEngine.init();
            const now = AudioEngine.ctx.currentTime;
            // Get params but maybe slightly modified for preview?
            // Actually using current params is best for "Preview"
            const params = UI.get303Params(unitId);

            // We need to trigger a voice. 
            // Note: voice303 uses 'active303' state which might interfere with playback if running.
            // But usually preview is done while stopped or it just overrides.
            AudioEngine.voice303(now, step, params, unitId);

            // Schedule a kill shortly after to make it a "preview" blip
            // Calculate duration based on decay or fixed?
            // Fixed short duration for preview is usually better.
            const duration = 0.2;

            // We need to manually stop it because voice303 expects the scheduler to handle length
            // or it sustains if slide is on.
            // For preview, we force stop.
            setTimeout(() => {
                AudioEngine.kill303(unitId, AudioEngine.ctx.currentTime);
            }, duration * 1000);
        };

        // Bind Events
        prevBtn.onclick = prevStep;
        nextBtn.onclick = nextStep;
        closeBtn.onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        updateUI();
    },

    render909() {
        const container = document.getElementById('tracks909');
        container.innerHTML = '';
        const tracks = [
            { id: 'bd', name: 'BASS DRUM', params: [{ l: 'TUNE', id: 'bd_p1', v: 50 }, { l: 'DECAY', id: 'bd_p2', v: 50 }, { l: 'ATTACK', id: 'bd_p3', v: 80 }, { l: 'LEVEL', id: 'bd_level', v: 100 }] },
            { id: 'sd', name: 'SNARE DRUM', params: [{ l: 'TUNE', id: 'sd_p1', v: 50 }, { l: 'TONE', id: 'sd_p2', v: 30 }, { l: 'SNAPPY', id: 'sd_p3', v: 70 }, { l: 'LEVEL', id: 'sd_level', v: 100 }] },
            { id: 'ch', name: 'CLOSED HAT', params: [{ l: 'DECAY', id: 'ch_p1', v: 20 }, { l: 'LEVEL', id: 'ch_level', v: 100 }] },
            { id: 'oh', name: 'OPEN HAT', params: [{ l: 'DECAY', id: 'oh_p1', v: 60 }, { l: 'LEVEL', id: 'oh_level', v: 100 }] },
            { id: 'cp', name: 'CLAP', params: [{ l: 'DECAY', id: 'cp_p1', v: 50 }, { l: 'LEVEL', id: 'cp_level', v: 100 }] },
        ];
        tracks.forEach(t => {
            const row = document.createElement('div'); row.className = 'drum-track-row';
            const hdr = document.createElement('div'); hdr.className = 'track-header';
            const knobDiv = document.createElement('div'); knobDiv.className = 'track-knobs';
            t.params.forEach(p => { new RotaryKnob(knobDiv, p.l, p.id, 0, 100, p.v, 1, 'small'); });
            const name = document.createElement('div'); name.className = 'track-name'; name.innerText = t.id.toUpperCase();
            hdr.appendChild(knobDiv); hdr.appendChild(name); row.appendChild(hdr);
            const seqDiv = document.createElement('div'); seqDiv.className = 'sequencer-909'; seqDiv.id = `seq909_${t.id}`;
            for (let i = 0; i < 16; i++) {
                const s = document.createElement('div'); s.className = 'step-909';
                s.onclick = () => { Data.seq909[t.id][i] = Data.seq909[t.id][i] ? 0 : 1; s.classList.toggle('active'); }
                seqDiv.appendChild(s);
            }
            row.appendChild(seqDiv); container.appendChild(row);
        });
        this.update909Grid();
    },

    update909Grid() {
        ['bd', 'sd', 'ch', 'oh', 'cp'].forEach(id => {
            const div = document.getElementById(`seq909_${id}`);
            if (!div) return;
            Array.from(div.children).forEach((child, i) => {
                if (Data.seq909[id][i]) child.classList.add('active');
                else child.classList.remove('active');
            });
        });
    },

    drawPlayhead(step) {
        this.clearPlayhead();
        const s1 = document.getElementById(`grid303_1`).children[step];
        if (s1) s1.classList.add('current');
        const s2 = document.getElementById(`grid303_2`).children[step];
        if (s2) s2.classList.add('current');

        const s9 = document.querySelectorAll('.sequencer-909');
        s9.forEach(seq => {
            if (seq.children[step]) seq.children[step].classList.add('current');
        });
    },

    clearPlayhead() {
        document.querySelectorAll('.current').forEach(el => el.classList.remove('current'));
    },

    highlightStep(step) {
        this.drawPlayhead(step);
    }
};
