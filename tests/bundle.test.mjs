import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Capacitor serves www; browser hosting serves root. Gameplay must not diverge.
test('web and Capacitor gameplay assets are identical', () => {
    for (const file of ['index.html', 'privacy.html', 'tos.html', 'how-to-play.html', 'src/main.js', 'src/blinkDetection.js', 'src/gameRules.mjs', 'src/inference.mjs', 'src/leaderboard.mjs', 'src/cameraHelp.mjs', 'src/roundLifecycle.mjs', 'src/share.mjs', 'src/style.css', 'service-worker.js']) {
        assert.equal(readFileSync(new URL(`../www/${file}`, import.meta.url), 'utf8'),
            readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), file);
    }
});

test('service worker updates its cache and precaches imported gameplay modules', () => {
    const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
    assert.match(worker, /blink-stop-v5/);
    for (const page of ['index.html', 'privacy.html', 'tos.html', 'how-to-play.html']) {
        assert.ok(worker.includes(`./${page}`), page);
    }
    for (const file of ['gameRules.mjs', 'inference.mjs', 'leaderboard.mjs', 'roundLifecycle.mjs', 'share.mjs']) {
        assert.ok(worker.includes(`./src/${file}`), file);
    }
});
