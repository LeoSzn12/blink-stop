const CACHE_NAME = 'blink-stop-v15';
// The 10+ MB face model rarely changes, so it lives in its own cache: app updates
// re-download only the small files, not the model. Bump only when vendor/face_mesh changes.
const MODEL_CACHE = 'blink-stop-model-v1';
const MODEL_ASSETS = [
    './vendor/face_mesh/face_mesh.js',
    './vendor/face_mesh/face_mesh.binarypb',
    './vendor/face_mesh/face_mesh_solution_packed_assets.data',
    './vendor/face_mesh/face_mesh_solution_packed_assets_loader.js',
    './vendor/face_mesh/face_mesh_solution_simd_wasm_bin.data',
    './vendor/face_mesh/face_mesh_solution_simd_wasm_bin.js',
    './vendor/face_mesh/face_mesh_solution_simd_wasm_bin.wasm',
    './vendor/face_mesh/face_mesh_solution_wasm_bin.js',
    './vendor/face_mesh/face_mesh_solution_wasm_bin.wasm'
];
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './privacy.html',
    './tos.html',
    './support.html',
    './notices.html',
    './licenses/MediaPipe.txt',
    './licenses/Capacitor.txt',
    './licenses/Filesystem.txt',
    './licenses/Share.txt',
    './licenses/Synapse.txt',
    './how-to-play.html',
    './src/style.css',
    './src/main.js',
    './src/blinkDetection.js',
    './src/gameRules.mjs',
    './src/inference.mjs',
    './src/leaderboard.mjs',
    './src/cameraHelp.mjs',
    './src/roundLifecycle.mjs',
    './src/share.mjs',
    './src/social.mjs',
    './src/scoreCard.mjs',
    './src/skins.mjs',
    './src/versus.mjs',
    './src/party.mjs',
    './src/reel.mjs',
    './src/balloons.mjs',
    './src/surprise.mjs',
    './src/deviceActions.mjs',
    './src/clearData.mjs',
    './src/localData.mjs',
    './vendor/native.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './src/audioManager.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(Promise.all([
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)),
        // Fetch only model files this device doesn't already have.
        caches.open(MODEL_CACHE).then(async cache => {
            const missing = [];
            for (const url of MODEL_ASSETS) if (!(await cache.match(url))) missing.push(url);
            return cache.addAll(missing);
        }),
    ]));
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => cache.match(event.request, { ignoreSearch: true }))
            .then(response => response || caches.open(MODEL_CACHE).then(cache => cache.match(event.request, { ignoreSearch: true })))
            .then(response => response || fetch(event.request))
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME, MODEL_CACHE];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
