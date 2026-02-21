const CACHE_NAME = 'acidbros-v136';
const ASSETS = [
    './',
    './index.html',
    './css/base.css',
    './css/icons.css',
    './css/layout.css',
    './css/components.css',
    './css/machines.css',
    './css/overlays.css',
    './js/main.js',
    './js/ui/RotaryKnob.js',
    './js/audio/AudioEngine.js',
    './js/audio/ClockProcessor.js',
    './js/audio/TB303.js',
    './js/audio/TR909.js',
    './js/data/Data.js',
    './js/data/FileManager.js',
    './js/data/BinaryFormatEncoder.js',
    './js/data/BinaryFormatDecoder.js',
    './js/ui/UI.js',
    './js/ui/DrumSynthUI.js',
    './js/audio/tr909/DrumVoice.js',
    './js/audio/tr909/UnifiedSynth.js',
    './js/ui/Oscilloscope.js',
    './js/midi/MidiManager.js',
    './manifest.json',
    './assets/favicon.png',
    './assets/DSEG7Classic-Bold.woff2',
    './assets/samples/tr909/hh01.wav',
    './assets/samples/tr909/oh01.wav',
    './assets/samples/tr909/cr01.wav',
    './assets/samples/tr909/rd01.wav',
    './assets/icons/add.svg',
    './assets/icons/settings.svg',
    './assets/icons/bd.svg',
    './assets/icons/sd.svg',
    './assets/icons/lt.svg',
    './assets/icons/mt.svg',
    './assets/icons/ht.svg',
    './assets/icons/rs.svg',
    './assets/icons/cp.svg',
    './assets/icons/ch.svg',
    './assets/icons/oh.svg',
    './assets/icons/cr.svg',
    './assets/icons/rd.svg',
    './assets/icons/folder.svg',
    './assets/icons/play.svg',
    './assets/icons/stop.svg',
    './assets/icons/dice.svg',
    './assets/icons/trash.svg',
    './assets/icons/share.svg',
    './assets/icons/cog.svg',
    './assets/icons/coffee.svg',
    './assets/icons/shuffle.svg',
    './assets/icons/copy.svg',
    './assets/icons/paste.svg',
    './assets/icons/file-new.svg',
    './assets/icons/file-save.svg',
    './assets/icons/file-import.svg',
    './assets/icons/file-export.svg',
    './assets/icons/file-delete-all.svg',
    './assets/icons/close.svg',
    './assets/icons/refresh.svg',
    './assets/icons/unlocked.svg',
    './assets/icons/locked.svg',
    './assets/icons/saw.svg',
    './assets/icons/sq.svg',
    './assets/icons/pattern.svg',
    './assets/icons/song.svg',
    './assets/icons/edit.svg'
];

self.addEventListener('install', (e) => {
    self.skipWaiting(); // Force waiting service worker to become active
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Immediately control all clients
    );
});
