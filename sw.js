const CACHE_NAME = 'acidbros-v56';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './js/main.js',
    './js/ui/RotaryKnob.js',
    './js/audio/AudioEngine.js',
    './js/audio/ClockProcessor.js',
    './js/audio/TB303.js',
    './js/audio/TR909.js',
    './js/data/Data.js',
    './js/ui/UI.js',
    './js/ui/Oscilloscope.js',
    './manifest.json',
    './assets/favicon.png',
    './assets/DSEG7Classic-Bold.woff2'
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
