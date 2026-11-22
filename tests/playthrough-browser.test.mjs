import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { serveBuiltWeb } from './helpers/web-server.mjs';

// Plays every game a player can reach from the home screen, in every skin, on a phone-sized
// screen, through the real camera loop, blink detector and game code. Only the face tracker
// is replaced: it reports synthetic eyes whose openness the test controls (1 = open,
// small = a blink, in between = a squint or laugh). Screenshots go to LAYOUT_SCREENSHOTS/play.
// This does not prove accuracy on a real face; it proves the games play through without
// errors, stuck screens or missed and doubled blinks on a steady camera.
const shots = process.env.LAYOUT_SCREENSHOTS ? path.join(process.env.LAYOUT_SCREENSHOTS, 'play') : null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('every game plays through in every skin on a phone screen', { timeout: 420000 }, async () => {
    const server = await serveBuiltWeb();
    if (shots) await mkdir(shots, { recursive: true });
    let browser;
    const failures = [], notes = [], errors = [], consoleErrors = [];
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block', hasTouch: true });
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        page.on('dialog', dialog => dialog.accept());
        await page.addInitScript(() => {
            const dateNow = Date.now.bind(Date);
            window.testTimeOffset = 0;
            window.testEye = 1;      // face 1 openness
            window.testEye2 = 1;     // face 2 openness (Stare-down)
            window.testFaces = 1;    // 0 = nobody in view
            window.testSends = 0;
            Date.now = () => dateNow() + window.testTimeOffset;
        });
        await page.route('**/vendor/face_mesh/face_mesh.js', route => route.fulfill({ contentType: 'text/javascript', body: `
            window.FaceMesh = class {
                setOptions() {} onResults(fn) { this.result = fn; } close() {}
                async send({ image }) {
                    window.testSends++;
                    const face = (dx, open) => {
                        const points = Array.from({ length: 468 }, () => ({ x: .35 + dx, y: .4, z: 0 }));
                        // Face outline so the skins draw their hats: forehead, chin, sides.
                        points[10] = { x: .35 + dx, y: .14, z: 0 }; points[152] = { x: .35 + dx, y: .66, z: 0 };
                        points[234] = { x: .18 + dx, y: .38, z: 0 }; points[454] = { x: .52 + dx, y: .38, z: 0 };
                        [[33,160,158,133,153,144], [362,385,387,263,373,380]].forEach((eye, side) => {
                            const x0 = side ? .37 : .23;
                            const coords = [[0,.3],[.02,.285],[.08,.285],[.1,.3],[.08,.315],[.02,.315]];
                            eye.forEach((index, i) => { points[index] = { x: x0 + coords[i][0] + dx, y: .3 + (coords[i][1] - .3) * open, z: 0 }; });
                        });
                        return points;
                    };
                    const faces = window.testFaces === 0 ? [] : window.testFaces === 2 ? [face(-.17, window.testEye), face(.3, window.testEye2)] : [face(0, window.testEye)];
                    this.result({ image, multiFaceLandmarks: faces });
                }
            };` }));

        const set = values => page.evaluate(v => Object.assign(window, v), values);
        const shot = async name => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
        const visible = selector => page.locator(selector).isVisible();
        const state = () => page.evaluate(() => ({
            screens: [...document.querySelectorAll('.screen')].filter(s => !s.classList.contains('hidden')).map(s => s.id),
            hud: document.querySelector('#hud-label')?.innerText, score: document.querySelector('#score')?.innerText,
            status: document.querySelector('#calibration-status')?.innerText, eyeLight: document.querySelector('#eye-light')?.innerText,
            face: document.querySelector('#face-status-text')?.innerText, final: document.querySelector('#final-score-val')?.innerText,
            sends: window.testSends, body: document.body.className,
        }));
        async function blink(ms = 160, key = 'testEye') {
            await set({ [key]: 0.12 });
            await sleep(ms);
            await set({ [key]: 1 });
            await sleep(120);
        }
        async function step(name, fn) {
            const before = errors.length;
            try {
                await fn();
                if (errors.length > before) throw new Error(`page errors: ${errors.slice(before).join(' | ')}`);
                console.log(`PLAY ok: ${name}`);
            } catch (error) {
                failures.push(`${name}: ${error.message.split('\n')[0]} ${JSON.stringify(await state().catch(() => ({})))}`);
                console.log(`PLAY FAIL: ${name}: ${error.message}`);
                await shot(`FAIL-${name}`).catch(() => {});
                await set({ testEye: 1, testEye2: 1, testFaces: 1, testTimeOffset: 0 }).catch(() => {});
                await page.goto(server.url).catch(() => {});
                await sleep(500);
            }
        }
        async function home() {
            await set({ testEye: 1, testEye2: 1, testFaces: 1 });
            if (await visible('#menu-btn')) await page.locator('#menu-btn').click();
            else if (!(await visible('#menu-screen'))) await page.goto(server.url);
            await page.locator('#menu-screen').waitFor({ state: 'visible' });
            await sleep(500); // menu tap guard
        }
        // Pick your look, then calibrate. The very first round also asks for one blink.
        async function pickAndCalibrate(skin, name) {
            await page.locator('#skin-pick-screen').waitFor({ state: 'visible' });
            await page.locator(`#skin-pick-screen [data-skin="${skin}"]`).click();
            await sleep(300);
            await shot(`${name}-1-pick-${skin.toLowerCase()}`);
            await page.locator('#skin-pick-play').click();
            await calibrate(name);
        }
        async function calibrate(name) {
            await page.waitForFunction(() => {
                const s = document.querySelector('#calibration-status')?.innerText || '';
                const playing = !document.querySelector('#game-hud').classList.contains('hidden') || !document.querySelector('#endurance-screen')?.classList.contains('hidden');
                return s.includes('BLINK ONCE') || playing;
            }, null, { timeout: 15000 });
            if ((await page.locator('#calibration-status').innerText()).includes('BLINK ONCE')) {
                await shot(`${name}-2-blink-check`);
                await sleep(400);
                await blink(200);
                await page.waitForFunction(() => document.querySelector('#calibration-status').innerText.includes('GOT IT'), null, { timeout: 4000 });
                await shot(`${name}-3-blink-seen`);
            }
            await page.locator('#game-hud').waitFor({ state: 'visible', timeout: 8000 });
        }
        async function gameOver(timeout = 12000) {
            await page.locator('#game-over-screen').waitFor({ state: 'visible', timeout });
            return page.locator('#final-score-val').innerText();
        }

        await page.goto(server.url);
        await page.locator('#menu-screen').waitFor({ state: 'visible' });
        await shot('00-home');

        await step('dont-blink-thanksgiving', async () => {
            await page.locator('[data-mode="CLASSIC"]').click();
            await pickAndCalibrate('THANKSGIVING', 'dont-blink');
            await sleep(1500);
            assert.equal(await visible('#game-over-screen'), false, 'round ended with eyes open');
            await shot('dont-blink-4-playing');
            await blink();
            const score = await gameOver(5000);
            await shot('dont-blink-5-result');
            assert.match(score, /\d+\.\d+s/);
            notes.push(`Don't Blink ended on a blink at ${score}`);
        });

        // A laugh narrows the eyes without closing them. Find which squints end a round.
        await step('dont-blink-squints', async () => {
            for (const open of [0.85, 0.75, 0.65, 0.55]) {
                await page.locator('#restart-btn').click();
                await calibrate('squint');
                await sleep(800);
                await set({ testEye: open });
                await sleep(1500);
                const ended = await visible('#game-over-screen');
                await set({ testEye: 1 });
                notes.push(`Eyes at ${Math.round(open * 100)}% open for 1.5 s: ${ended ? 'counted as a blink' : 'kept playing'}`);
                if (!ended) { await sleep(300); await blink(); await gameOver(5000); }
            }
        });

        await step('come-back-pause', async () => {
            await page.locator('#restart-btn').click();
            await calibrate('come-back');
            await sleep(800);
            await set({ testFaces: 0 });
            await page.locator('#come-back').waitFor({ state: 'visible', timeout: 4000 });
            await shot('come-back-1-away');
            await set({ testFaces: 1 });
            await page.locator('#come-back').waitFor({ state: 'hidden', timeout: 4000 });
            assert.equal(await visible('#game-over-screen'), false, 'round ended after coming back');
            await blink();
            await gameOver(5000);
        });

        await step('precision-5s-christmas', async () => {
            await home();
            await page.locator('[data-mode="PRECISION"]').click();
            await sleep(500);
            await shot('precision-0-options');
            await page.locator('.option-btn[data-time="5"]').click();
            await pickAndCalibrate('CHRISTMAS', 'precision');
            await sleep(1000);
            await shot('precision-4-playing');
            await set({ testTimeOffset: 4000 });
            await sleep(100);
            await blink();
            const score = await gameOver(5000);
            await shot('precision-5-result');
            notes.push(`Precision 5 s blink at about 5 s scored ${score}`);
            await set({ testTimeOffset: 0 });
        });

        await step('gas-pump-party', async () => {
            await home();
            await page.locator('[data-mode="PRECISION"]').click();
            await sleep(500);
            await page.locator('#pump-start-btn').click();
            await pickAndCalibrate('PARTY', 'pump');
            await sleep(2500);
            await shot('pump-4-playing');
            await blink();
            const score = await gameOver(5000);
            await shot('pump-5-result');
            notes.push(`Gas Pump stopped at ${score}`);
        });

        await step('balloon-pop-party', async () => {
            await home();
            await page.locator('[data-mode="BALLOON"]').click();
            await pickAndCalibrate('PARTY', 'balloon');
            let shotTaken = false;
            const until = Date.now() + 14000;
            while (Date.now() < until && !(await visible('#game-over-screen'))) {
                await blink(140);
                await sleep(400);
                if (!shotTaken) { await shot('balloon-4-playing'); shotTaken = true; }
            }
            const popped = Number(await page.locator('#score').innerText().catch(() => '0')) || 0;
            await shot('balloon-5-mid');
            // Stop blinking: balloons get away until the lives run out.
            const score = await gameOver(60000);
            await shot('balloon-6-result');
            notes.push(`Balloon Pop: ${popped} popped while blinking about twice a second; final ${score}`);
            assert.ok(popped > 0, 'no balloon popped');
        });

        await step('family-scoreboard', async () => {
            // Save the Balloon Pop score from the results with a name, then find it on the menu's scoreboard.
            await page.locator('#game-over-screen').waitFor({ state: 'visible' });
            await page.locator('#top-scores > summary').click();
            await page.locator('#player-name-input').fill('Tester');
            await page.locator('#save-score-btn').click();
            assert.match(await page.locator('#leaderboard-list').innerText(), /TESTER/);
            await home();
            // Pass the Phone sits below the other games now.
            const order = await page.evaluate(() => [...document.querySelectorAll('.mode-selection button')].map(b => b.dataset.mode || b.id));
            assert.ok(order.indexOf('PARTY') > order.indexOf('OLYMPICS'), `menu order ${order.join(',')}`);
            await page.locator('#scoreboard-btn').click();
            await page.locator('#scoreboard-options').waitFor({ state: 'visible' });
            const board = await page.locator('#scoreboard-list').innerText();
            assert.match(board, /Balloon Pop[\s\S]*TESTER/);
            await shot('scoreboard-1-menu');
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            assert.ok(overflow <= 1, `scoreboard overflows sideways by ${overflow}px`);
            // The page-wide dialog handler accepts the "Clear every score?" confirm.
            await page.locator('#scoreboard-clear-btn').click();
            await page.waitForFunction(() => /No scores yet/.test(document.querySelector('#scoreboard-list').innerText));
            notes.push('Family scoreboard: saved a Balloon Pop score, saw it from the menu, cleared it');
            await page.locator('#scoreboard-back-btn').click();
            await page.locator('.mode-selection').waitFor({ state: 'visible' });
        });

        await step('flash-classic', async () => {
            await home();
            await page.locator('[data-mode="OLYMPICS"]').click();
            await sleep(500);
            await shot('more-games');
            await page.locator('[data-mode="FLASH"]').click();
            await pickAndCalibrate('CLASSIC', 'flash');
            for (let i = 0; i < 3; i++) {
                await page.locator('#quick-stage.go').waitFor({ timeout: 8000 });
                if (i === 0) await shot('flash-4-green');
                await sleep(250);
                await blink();
                if (i < 2) await page.locator('#quick-stage.go').waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});
            }
            const score = await gameOver(8000);
            await shot('flash-5-result');
            notes.push(`Flash best ${score}`);
            assert.match(score, /\d+\s*ms/i);
        });

        await step('blink-beat-thanksgiving', async () => {
            await home();
            await page.locator('[data-mode="OLYMPICS"]').click();
            await sleep(500);
            await page.locator('[data-mode="BEAT"]').click();
            await pickAndCalibrate('THANKSGIVING', 'beat');
            await sleep(2500);
            await shot('beat-4-playing');
            const score = await gameOver(60000);
            await shot('beat-5-result');
            notes.push(`Blink Beat with no blinks ended at ${score}`);
        });

        await step('jokes-christmas', async () => {
            await home();
            await page.locator('[data-mode="OLYMPICS"]').click();
            await sleep(500);
            await page.locator('[data-mode="DISTRACT"]').click();
            await pickAndCalibrate('CHRISTMAS', 'jokes');
            await set({ testTimeOffset: 6000 });
            await page.locator('#joke-card').waitFor({ state: 'visible', timeout: 10000 });
            await shot('jokes-4-joke');
            await set({ testEye: 0.8 });
            await sleep(1500);
            notes.push(`Jokes, a smile (80% open): ${(await visible('#game-over-screen')) ? 'ended the round' : 'kept playing'}`);
            await set({ testEye: 1 });
            if (!(await visible('#game-over-screen'))) { await sleep(300); await blink(); }
            await gameOver(5000);
            await shot('jokes-5-result');
            assert.equal(await visible('#joke-card'), false, 'joke left on the results screen');
            await set({ testTimeOffset: 0 });
        });

        await step('stare-down-party', async () => {
            await home();
            await set({ testFaces: 2 });
            await page.locator('[data-mode="OLYMPICS"]').click();
            await sleep(500);
            await page.locator('[data-mode="VERSUS"]').click();
            await pickAndCalibrate('PARTY', 'stare');
            await sleep(1500);
            await shot('stare-4-playing');
            await blink(200, 'testEye2');
            await gameOver(6000);
            await shot('stare-5-result');
            notes.push(`Stare-Down: ${(await page.locator('#final-score-val').innerText())} / ${(await page.locator('#final-score-label').innerText().catch(() => ''))}`);
            await set({ testFaces: 1 });
        });

        await step('pass-the-phone', async () => {
            await home();
            await page.locator('[data-mode="PARTY"]').click();
            await sleep(500);
            await page.locator('input[name="party-game"][value="CLASSIC"]').check();
            await page.locator('#party-names').fill('Ana\nBen');
            await shot('party-0-setup');
            await page.locator('#party-start-btn').click();
            for (const [i, who] of ['Ana', 'Ben'].entries()) {
                await page.locator('#party-screen').waitFor({ state: 'visible' });
                if (i === 0) await shot('party-1-turn');
                await page.locator('#party-go-btn').click();
                await calibrate(`party-${who}`);
                await sleep(800 + i * 1200);
                await blink();
                await gameOver(5000);
                if (i === 0) await shot('party-2-turn-result');
                await page.locator('#party-next-btn').click();
            }
            await page.locator('#party-screen').waitFor({ state: 'visible' });
            await shot('party-3-final');
            const skip = page.locator('#party-skip-btn');
            if (await skip.isVisible()) await skip.click();
            await sleep(800);
            await shot('party-4-champion');
            notes.push(`Pass the Phone: ${(await page.locator('#party-title').innerText())} ${(await page.locator('#party-message').innerText())}`);
            await page.locator('#party-end-btn').click();
        });

        await step('how-to-play', async () => {
            for (const width of [390, 320]) {
                await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
                await page.goto(`${server.url}how-to-play.html`);
                if (shots) await page.screenshot({ path: path.join(shots, `how-to-play-${width}.png`), fullPage: true });
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
                assert.ok(overflow <= 1, `How to Play overflows sideways by ${overflow}px at ${width}`);
            }
        });
    } finally {
        console.log('PLAY notes:\n  ' + notes.join('\n  '));
        if (consoleErrors.length) console.log('PLAY console errors:\n  ' + [...new Set(consoleErrors)].slice(0, 20).join('\n  '));
        if (browser) await browser.close();
        await server.close();
    }
    assert.deepEqual(failures, []);
    assert.deepEqual(errors, []);
});
