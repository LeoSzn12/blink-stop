import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

// Root is the web hosting source; Capacitor serves www. Rebuild both from pinned npm assets.
const files = ['index.html', 'privacy.html', 'tos.html', 'support.html', 'notices.html', 'how-to-play.html', 'manifest.json', 'service-worker.js'];
for (const file of files) cpSync(file, `www/${file}`);
for (const file of ['ads.txt', 'package.json', 'package-lock.json', 'capacitor.config.json']) {
    rmSync(`www/${file}`, { force: true });
}
rmSync('www/icons', { recursive: true, force: true });
cpSync('icons', 'www/icons', { recursive: true });
rmSync('www/src', { recursive: true, force: true });
cpSync('src', 'www/src', { recursive: true });
cpSync('licenses', 'www/licenses', { recursive: true });
await build({ entryPoints: ['src/nativeExports.mjs'], outfile: 'vendor/native.js', bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', legalComments: 'inline' });
mkdirSync('www/vendor', { recursive: true });
cpSync('vendor/native.js', 'www/vendor/native.js');
for (const output of ['vendor/face_mesh', 'www/vendor/face_mesh']) {
    rmSync(output, { recursive: true, force: true });
    mkdirSync(output, { recursive: true });
    for (const file of ['face_mesh.js', 'face_mesh.binarypb', 'face_mesh_solution_packed_assets.data',
        'face_mesh_solution_packed_assets_loader.js', 'face_mesh_solution_simd_wasm_bin.data',
        'face_mesh_solution_simd_wasm_bin.js', 'face_mesh_solution_simd_wasm_bin.wasm',
        'face_mesh_solution_wasm_bin.js', 'face_mesh_solution_wasm_bin.wasm']) {
        cpSync(`node_modules/@mediapipe/face_mesh/${file}`, `${output}/${file}`);
    }
}
