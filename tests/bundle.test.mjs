import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Capacitor serves www; browser hosting serves root. Gameplay must not diverge.
test('web and Capacitor gameplay assets are identical', () => {
    for (const file of ['index.html', 'src/main.js', 'src/blinkDetection.js', 'src/gameRules.mjs', 'src/inference.mjs', 'src/leaderboard.mjs', 'src/firebase.js', 'src/style.css', 'service-worker.js']) {
        assert.equal(readFileSync(new URL(`../www/${file}`, import.meta.url), 'utf8'),
            readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), file);
    }
});

test('service worker updates its cache and precaches imported gameplay modules', () => {
    const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
    assert.match(worker, /blink-stop-v2/);
    for (const file of ['gameRules.mjs', 'inference.mjs', 'leaderboard.mjs']) {
        assert.ok(worker.includes(`./src/${file}`), file);
    }
});
