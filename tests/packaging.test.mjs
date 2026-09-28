import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('native entrypoint loads locally packaged inference, without ad or Firebase scripts', () => {
    const html = read('www/index.html');
    assert.match(html, /src="vendor\/face_mesh\/face_mesh\.js"/);
    assert.doesNotMatch(html, /cdn\.jsdelivr|adsbygoogle|googlesyndication/);
    assert.match(read('www/src/main.js'), /vendor\/face_mesh/);
    assert.doesNotMatch(read('www/src/main.js'), /cdn\.jsdelivr/);
    for (const file of ['face_mesh.js', 'face_mesh_solution_packed_assets.data', 'face_mesh_solution_simd_wasm_bin.wasm', 'face_mesh_solution_wasm_bin.wasm']) {
        assert.ok(existsSync(new URL(`www/vendor/face_mesh/${file}`, root)), file);
    }
});

test('native saves remain local and privacy description does not falsely promise no score storage', () => {
    assert.doesNotMatch(read('www/src/main.js'), /GlobalLeaderboard\.save\(/);
    assert.equal(existsSync(new URL('www/src/firebase.js', root)), false);
    assert.match(read('www/privacy.html'), /local.*score/i);
});

test('camera failures remain visible in menu without a blocking browser alert', () => {
    assert.match(read('index.html'), /id="camera-error"[^>]*role="alert"/);
    assert.match(read('src/main.js'), /cameraErrorMessage\(err\)/);
    assert.doesNotMatch(read('src/main.js'), /alert\(errorMsg\)/);
});

test('backgrounding the app releases camera and abandons the round', () => {
    const source = read('src/main.js');
    assert.match(source, /visibilitychange/);
    assert.match(source, /document\.hidden/);
});

test('returning to menu hides calibration and endurance overlays', () => {
    const menu = read('src/main.js').split('function showMenu() {')[1].split('function onResults')[0];
    assert.match(menu, /calibrationScreen\.classList\.add\('hidden'\)/);
    assert.match(menu, /enduranceScreen\.classList\.add\('hidden'\)/);
});

test('local personal best is never presented as a world record', () => {
    assert.doesNotMatch(read('index.html'), /WORLD RECORD/);
    assert.doesNotMatch(read('src/main.js'), /Blink Stop World Record/);
});

test('native web assets omit npm manifests and ad inventory', () => {
    for (const file of ['package.json', 'package-lock.json', 'ads.txt']) {
        assert.equal(existsSync(new URL(`www/${file}`, root)), false, file);
    }
});

test('candidate pages and styles contain no remote font fetch or borrowed social image', () => {
    for (const prefix of ['', 'www/']) {
        for (const page of ['index.html', 'privacy.html', 'tos.html', 'how-to-play.html']) {
            assert.doesNotMatch(read(`${prefix}${page}`), /fonts\.googleapis|fonts\.gstatic|raw\.githubusercontent|og:image/i, `${prefix}${page}`);
        }
        assert.doesNotMatch(read(`${prefix}src/style.css`), /fonts\.googleapis|fonts\.gstatic|@import\s+url/i);
    }
});

test('candidate legal and help copy describes local-only scores and no unbuilt theme unlock', () => {
    for (const prefix of ['', 'www/']) {
        const terms = read(`${prefix}tos.html`);
        assert.match(terms, /names and scores.*stored.*on your device/i);
        assert.doesNotMatch(terms, /submit become part of the Game|legal@playblinkstop\.com/i);
        assert.doesNotMatch(read(`${prefix}how-to-play.html`), /unlock exclusive themes/i);
        const privacy = read(`${prefix}privacy.html`);
        assert.doesNotMatch(privacy, /Google Fonts|Optional web fonts/i);
        assert.match(privacy, /system fonts/i);
        assert.match(privacy, /owner approval.*pending/i);
    }
});
