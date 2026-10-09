import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Exercise the deployed payload with real service-worker caching and MediaPipe WASM.
// No camera permission or real camera frames are used.
test('offline reload loads versioned scripts, styles, policies, and the inference model', { timeout: 60000 }, async () => {
    const types = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
        json: 'application/json', wasm: 'application/wasm', png: 'image/png' };
    const server = createServer(async (req, res) => {
        try {
            const pathname = new URL(req.url, 'http://localhost').pathname;
            const file = pathname === '/' ? 'index.html' : pathname.slice(1);
            if (file.includes('..')) throw new Error('Invalid path');
            const body = await readFile(new URL(`../www/${file}`, import.meta.url));
            res.writeHead(200, { 'Content-Type': types[file.split('.').at(-1)] || 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404); res.end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const url = `http://127.0.0.1:${server.address().port}/`;
        await page.goto(url);
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
        await page.reload();
        assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);
        await context.setOffline(true);
        await page.reload();
        assert.equal(await page.locator('.mode-btn').count(), 4);
        assert.equal(await page.locator('.mode-selection').evaluate(el => getComputedStyle(el).display), 'flex');
        // Back must respond: this proves main.js and its imports actually executed offline.
        await page.locator('[data-mode="PRECISION"]').click();
        await page.locator('#precision-back-btn').click();
        assert.equal(await page.locator('.mode-selection').isVisible(), true);
        const result = await page.evaluate(async () => {
            const mesh = new FaceMesh({ locateFile: file => `vendor/face_mesh/${file}` });
            mesh.setOptions({ maxNumFaces: 1, refineLandmarks: false });
            let received = false;
            mesh.onResults(() => { received = true; });
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 64;
            canvas.getContext('2d').fillRect(0, 0, 64, 64);
            await mesh.send({ image: canvas });
            await mesh.close();
            return received;
        });
        assert.equal(result, true, 'bundled inference graph and WASM must run offline');
        await page.locator('a[href="privacy.html"]').click();
        await page.waitForURL('**/privacy.html');
        assert.equal(await page.locator('h1').innerText(), 'Privacy Policy');
        assert.deepEqual(errors, []);
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
