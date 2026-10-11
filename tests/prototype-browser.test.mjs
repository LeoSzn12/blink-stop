import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serveBuiltWeb } from './helpers/web-server.mjs';

// Synthetic video and landmarks exercise the actual UI/state flow. This does not
// establish physical-camera accuracy, sound comfort, or human reactions to scares.
test('Surprise consent, reward demo, portrait export and friend challenge work together', { timeout: 60000 }, async () => {
    const server = await serveBuiltWeb();
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => requests.push(request.url()));
        await page.addInitScript(() => {
            const dateNow = Date.now.bind(Date);
            window.testTimeOffset = 0;
            window.testBlink = false;
            Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
            Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => {
                window.lastShare = { text: payload.text, name: payload.files?.[0]?.name, type: payload.files?.[0]?.type, size: payload.files?.[0]?.size };
            } });
            Date.now = () => dateNow() + window.testTimeOffset;
            Math.random = () => 0;
        });
        await page.route('**/vendor/face_mesh/face_mesh.js', route => route.fulfill({ contentType: 'text/javascript', body: `
            window.FaceMesh = class {
                setOptions() {} onResults(fn) { this.result = fn; } close() {}
                async send({ image }) {
                    const points = Array.from({ length: 468 }, () => ({ x: 0, y: 0, z: 0 }));
                    for (const eye of [[33,160,158,133,153,144], [362,385,387,263,373,380]]) {
                        const coords = [[.3,.3],[.32,.285],[.38,.285],[.4,.3],[.38,.315],[.32,.315]];
                        eye.forEach((index, i) => { points[index] = { x: coords[i][0], y: window.testBlink ? .3 + (coords[i][1] - .3) / 3 : coords[i][1], z: 0 }; });
                    }
                    this.result({ image, multiFaceLandmarks: [points] });
                }
            };` }));
        await page.goto(server.url);
        await page.locator('[data-mode="SURPRISE"]').click();
        assert.equal(await page.locator('#surprise-sound').isChecked(), false);
        assert.equal(await page.evaluate(() => document.querySelector('.input_video').srcObject), null);
        await page.locator('#surprise-back-btn').click();
        assert.equal(await page.locator('.mode-selection').isVisible(), true);
        await page.locator('[data-mode="SURPRISE"]').click();
        if (process.env.PROTOTYPE_SCREENSHOTS) {
            await mkdir(process.env.PROTOTYPE_SCREENSHOTS, { recursive: true });
            await page.screenshot({ path: `${process.env.PROTOTYPE_SCREENSHOTS}/surprise-options.png`, fullPage: true });
        }
        await page.locator('#surprise-start-btn').click();
        console.log('Prototype: opt-in/start clicked');
        await page.locator('#game-hud').waitFor({ state: 'visible', timeout: 10000 });
        console.log('Prototype: calibrated with synthetic input');
        await page.evaluate(() => { window.testTimeOffset = 15000; });
        await page.locator('#surprise-overlay').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#home-btn').isVisible(), true);
        await page.locator('#surprise-overlay').waitFor({ state: 'hidden' });
        console.log('Prototype: bounded interruption completed');
        await page.evaluate(() => { window.testTimeOffset = 30000; });
        await page.locator('#game-over-screen').waitFor({ state: 'visible' });
        console.log('Prototype: 30-second win');
        assert.equal(await page.locator('#final-score-val').innerText(), '30.00s');
        await page.locator('#player-name-input').fill('TEST');
        await page.locator('#save-score-btn').click();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('blink_lb_SURPRISE'))[0].score), 30);
        await page.locator('#demo-bonus-btn').click();
        assert.equal(await page.evaluate(() => document.querySelector('.input_video').srcObject), null);
        assert.equal(await page.locator('#demo-claim-btn').isEnabled(), false);
        assert.equal(await page.locator('.output_canvas').evaluate(el => getComputedStyle(el).visibility), 'hidden');
        await page.locator('#demo-skip-btn').click();
        assert.equal(await page.locator('#game-over-screen').isVisible(), true);
        assert.equal(await page.evaluate(() => document.body.classList.contains('theme-demo')), false);
        await page.locator('#demo-bonus-btn').click();
        if (process.env.PROTOTYPE_SCREENSHOTS) {
            await page.screenshot({ path: `${process.env.PROTOTYPE_SCREENSHOTS}/reward-demo.png`, fullPage: true });
        }
        await page.waitForFunction(() => !document.querySelector('#demo-claim-btn').disabled);
        await page.locator('#demo-claim-btn').click();
        assert.equal(await page.evaluate(() => document.body.classList.contains('theme-demo')), true);
        assert.equal(await page.evaluate(() => localStorage.getItem('blink_theme_demo')), null);
        assert.equal(await page.locator('#final-score-val').innerText(), '30.00s');
        // Full social loop: card export, friend handoff, malformed input, imported
        // Precision target, actual blink, and comparison. No remote game backend.
        assert.equal(await page.locator('#social-result').isVisible(), true);
        await page.locator('#share-card-btn').click();
        const shared = await page.evaluate(() => window.lastShare);
        assert.equal(shared.name, 'blink-stop-challenge.png');
        assert.equal(shared.type, 'image/png');
        assert.ok(shared.size > 10000);
        assert.match(shared.text, /Surprise: 30.00s/);
        assert.equal(await page.locator('#score-card').evaluate(img => img.naturalWidth), 1080);
        assert.equal(await page.locator('#score-card').evaluate(img => img.naturalHeight), 1920);
        const downloadReady = page.waitForEvent('download');
        await page.locator('#save-card-btn').click();
        assert.equal((await downloadReady).suggestedFilename(), 'blink-stop-challenge.png');
        if (process.env.PROTOTYPE_SCREENSHOTS) {
            const url = await page.locator('#score-card').getAttribute('src');
            await writeFile(`${process.env.PROTOTYPE_SCREENSHOTS}/challenge-card.png`, Buffer.from(url.split(',')[1], 'base64'));
            await page.screenshot({ path: `${process.env.PROTOTYPE_SCREENSHOTS}/social-result.png`, fullPage: true });
        }
        await page.locator('#friend-turn-btn').click();
        assert.equal(await page.locator('#surprise-options').isVisible(), true);
        assert.equal(await page.evaluate(() => document.querySelector('.input_video').srcObject), null);
        assert.equal(await page.locator('#score-card').getAttribute('src'), null);
        await page.locator('#surprise-back-btn').click();
        await page.locator('.challenge-entry summary').click();
        await page.locator('#challenge-input').fill('BS1-E-0-99999999');
        await page.locator('#challenge-form button').click();
        assert.match(await page.locator('#challenge-status').innerText(), /Invalid/);
        assert.equal(await page.evaluate(() => document.querySelector('.input_video').srcObject), null);
        await page.goto(`${server.url}#challenge=garbage`);
        await page.waitForFunction(() => document.querySelector('#challenge-status').textContent.includes('Invalid challenge link'));
        assert.match(await page.locator('#challenge-status').innerText(), /Invalid challenge link/);
        assert.equal(await page.evaluate(() => document.querySelector('.input_video').srcObject), null);
        await page.goto(`${server.url}#challenge=BS1-P-10-5000`);
        await page.waitForFunction(() => document.querySelector('#challenge-input').value === 'BS1-P-10-5000');
        assert.equal(await page.locator('#challenge-input').inputValue(), 'BS1-P-10-5000');
        assert.equal(await page.evaluate(() => document.querySelector('.input_video').srcObject), null);
        await page.locator('#challenge-form button').click();
        await page.locator('#game-hud').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#target-display .digital-text-sm').innerText(), '10.00s');
        await page.evaluate(() => { window.testTimeOffset += 10000; window.testBlink = true; });
        await page.locator('#game-over-screen').waitFor({ state: 'visible' });
        assert.match(await page.locator('#challenge-caption').inputValue(), /Precision: .*s off.*Target 10s/);
        assert.match(await page.locator('#challenge-outcome').innerText(), /CHALLENGE BEATEN/);
        await page.evaluate(() => { window.testBlink = false; });
        await page.locator('#friend-turn-btn').click();
        await page.locator('#game-hud').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#target-display .digital-text-sm').innerText(), '10.00s');
        page.once('dialog', dialog => dialog.accept());
        await page.locator('#home-btn').click();
        assert.equal(await page.evaluate(() => document.querySelector('.input_video').srcObject), null);
        assert.equal(await page.locator('#social-result').isVisible(), false);
        assert.equal(await page.locator('#challenge-caption').inputValue(), '');
        assert.equal(await page.locator('#challenge-input').inputValue(), '');
        assert.equal(requests.every(url => url.startsWith(server.url)), true, 'prototype must not contact an advertiser');
        assert.deepEqual(errors, []);
    } finally {
        if (browser) await browser.close();
        await server.close();
    }
});
