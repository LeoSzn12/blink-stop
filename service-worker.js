const CACHE_NAME = 'blink-stop-v7';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './privacy.html',
    './tos.html',
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
    './icons/icon-192.png',
    './icons/icon-512.png',
    './src/audioManager.js',
    './vendor/face_mesh/face_mesh.js',
    './vendor/face_mesh/face_mesh.binarypb',
    './vendor/face_mesh/face_mesh_solution_packed_assets.data',
    './vendor/face_mesh/face_mesh_solution_packed_assets_loader.js',
    './vendor/face_mesh/face_mesh_solution_simd_wasm_bin.data',
    './vendor/face_mesh/face_mesh_solution_simd_wasm_bin.js',
    './vendor/face_mesh/face_mesh_solution_simd_wasm_bin.wasm',
    './vendor/face_mesh/face_mesh_solution_wasm_bin.js',
    './vendor/face_mesh/face_mesh_solution_wasm_bin.wasm',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => cache.match(event.request, { ignoreSearch: true }))
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
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
