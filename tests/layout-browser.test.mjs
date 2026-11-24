import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// A real isolated Chrome profile; no camera permission/device needed to test error layout.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.env.LAYOUT_URL || new URL('../index.html', import.meta.url).href;
const output = process.env.LAYOUT_SCREENSHOTS;

const cases = [
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'iPhone 14 safe areas', width: 390, height: 844, safeTop: 47, safeBottom: 34 },
  { name: 'iPhone landscape safe areas', width: 844, height: 390, safeTop: 0, safeBottom: 21, safeSide: 47 },
  { name: 'narrow portrait', width: 320, height: 568 },
  { name: 'short landscape', width: 667, height: 375 },
  { name: '200% text', width: 390, height: 844, textZoom: 2 },
];

test('game-over actions remain reachable on narrow and enlarged-text screens', async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    for (const scenario of cases.filter(c => c.name === 'narrow portrait' || c.textZoom)) {
      const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height } });
      try {
        await page.route(/\.js(?:\?|$)/, route => route.abort());
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.evaluate(scenario => {
          if (scenario.textZoom) document.documentElement.style.fontSize = `${scenario.textZoom * 100}%`;
          for (const [side,value] of Object.entries({top:scenario.safeTop,bottom:scenario.safeBottom,left:scenario.safeSide,right:scenario.safeSide})) {
            if(value !== undefined) document.documentElement.style.setProperty(`--safe-${side}`,`${value}px`);
          }
          document.querySelector('#menu-screen').classList.add('hidden');
          document.querySelector('#game-over-screen').classList.remove('hidden');
          document.querySelector('#social-result').classList.remove('hidden');
        }, scenario);
        for (const selector of ['#restart-btn', '#share-open-btn', '#friend-turn-btn', '#menu-btn']) {
          await page.locator(selector).evaluate(el => scrollBy(0, el.getBoundingClientRect().top - 100));
          const box = await page.locator(selector).boundingBox();
          const footerTop = await page.locator('.footer').evaluate(el => el.getBoundingClientRect().top);
          assert.ok(box.x >= 0 && box.x + box.width <= scenario.width && box.y >= 0 && box.y + box.height <= footerTop,
            `${scenario.name} ${selector} clipped: ${JSON.stringify({ box, footerTop })}`);
        }
        // Play Again and Share sit right under the score, above the fold, on a phone.
        if (scenario.name === 'narrow portrait') {
          await page.evaluate(() => scrollTo(0, 0));
          for (const selector of ['#restart-btn', '#share-open-btn']) {
            const box = await page.locator(selector).boundingBox();
            assert.ok(box.y + box.height <= scenario.height, `${selector} should be above the fold: ${JSON.stringify(box)}`);
          }
        }
        // The share sheet's options all fit on screen (scrolling inside the sheet if needed).
        await page.evaluate(() => document.querySelector('#share-sheet').classList.remove('hidden'));
        for (const selector of ['#selfie-btn', '#share-btn', '#share-card-btn', '#save-card-btn', '#share-close-btn']) {
          await page.locator(selector).evaluate(el => el.scrollIntoView({ block: 'center' }));
          const box = await page.locator(selector).boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= scenario.width && box.y >= 0 && box.y + box.height <= scenario.height,
            `${scenario.name} share sheet ${selector} clipped: ${JSON.stringify(box)}`);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(overflow <= 1, `${scenario.name} horizontal overflow: ${overflow}`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
});

test('camera permission error and menu controls remain readable above footer', async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    for (const scenario of cases) {
      const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        // Block camera/face mesh scripts: render the actual HTML+CSS and reproduce the
        // DOM state main.js uses when getUserMedia rejects with NotAllowedError.
        await page.route(/\.js(?:\?|$)/, route => route.abort());
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.evaluate(scenario => {
          if (scenario.textZoom) document.documentElement.style.fontSize = `${scenario.textZoom * 100}%`;
          for (const [side,value] of Object.entries({top:scenario.safeTop,bottom:scenario.safeBottom,left:scenario.safeSide,right:scenario.safeSide})) {
            if(value !== undefined) document.documentElement.style.setProperty(`--safe-${side}`,`${value}px`);
          }
          const error = document.querySelector('#camera-error');
          error.textContent = 'Camera access was denied. Allow camera access in your browser settings, then reload to play. Your video stays on this device.';
          error.classList.remove('hidden');
          document.querySelector('#camera-problem').classList.remove('hidden');
          document.querySelector('#camera-retry-btn').classList.remove('hidden');
          document.querySelector('#loading-msg').classList.add('hidden');
          // The iPhone app banner as an iOS Chrome visitor sees it (main.js is blocked here).
          document.querySelector('#app-banner').classList.remove('hidden');
        }, scenario);
        const initialTitleTop = await page.locator('#menu-screen h1').evaluate(el => el.getBoundingClientRect().top);
        // The app banner fits the width, sits above the game buttons, and its Get and close are full-size taps.
        const appBanner = await page.evaluate(() => {
          const r = s => document.querySelector(s).getBoundingClientRect();
          return { banner: r('#app-banner'), get: r('#app-banner-get'), close: r('#app-banner-close'), menuTop: r('.mode-selection').top, w: innerWidth };
        });
        assert.ok(appBanner.banner.left >= 0 && appBanner.banner.right <= appBanner.w, `app banner overflows: ${scenario.name} ${JSON.stringify(appBanner)}`);
        assert.ok(appBanner.banner.bottom <= appBanner.menuTop, `app banner not above the game buttons: ${scenario.name} ${JSON.stringify(appBanner)}`);
        for (const tap of [appBanner.get, appBanner.close]) assert.ok(tap.height >= 44 && tap.width >= 44, `app banner tap target too small: ${scenario.name} ${JSON.stringify(tap)}`);
        // The problem sits above the game buttons and is in view once scrolled to, as the app does.
        const errorView = await page.evaluate(() => {
          document.querySelector('#camera-problem').scrollIntoView({ block: 'start' });
          const error = document.querySelector('#camera-error').getBoundingClientRect();
          const retry = document.querySelector('#camera-retry-btn').getBoundingClientRect();
          const menu = document.querySelector('.mode-selection').getBoundingClientRect();
          return { top: error.top, bottom: error.bottom, retryBottom: retry.bottom, menuTop: menu.top, viewportHeight: innerHeight };
        });
        assert.ok(errorView.top >= 0 && errorView.top < errorView.viewportHeight / 2, `camera problem not in view: ${scenario.name} ${JSON.stringify(errorView)}`);
        assert.ok(errorView.retryBottom <= errorView.menuTop, `camera problem not above the game buttons: ${scenario.name} ${JSON.stringify(errorView)}`);
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        const geometry = await page.evaluate(() => {
          const box = selector => {
            const { left, right, top, bottom } = document.querySelector(selector).getBoundingClientRect();
            return { left, right, top, bottom };
          };
          return {
            error: box('#camera-error'), footer: box('.footer'),
            menu: box('.mode-selection'), title: box('#menu-screen h1'),
            screen: box('#menu-screen'),
            scrollHeight: document.documentElement.scrollHeight,
            viewportHeight: innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
          };
        });
        if (output) {
          await mkdir(output, { recursive: true });
          await page.screenshot({ path: path.join(output, `${scenario.name.replaceAll(' ', '-')}.png`), fullPage: true });
        }
        const label = `${scenario.name}: ${JSON.stringify(geometry)}`;
        assert.ok(initialTitleTop >= (scenario.safeTop || 0) + 16, `title clipped by safe area: ${label}`);
        assert.ok(geometry.error.bottom + 8 <= geometry.footer.top, `error/footer overlap: ${label}`);
        assert.ok(geometry.scrollWidth <= geometry.viewportWidth + 1, `horizontal overflow: ${label}`);
        for (const button of await page.locator('.mode-btn:visible').all()) {
          await button.evaluate(el => scrollBy(0, el.getBoundingClientRect().top - 96));
          const box = await button.boundingBox();
          assert.ok(box.y >= 0 && box.y + box.height <= geometry.footer.top, `mode button clipped or obscured: ${label}`);
        }
        await page.locator('.mode-btn').first().click();
        await page.locator('a[href="privacy.html"]').click();
        assert.match(page.url(), /privacy\.html$/);
        console.log(`PASS ${label}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
});

// The in-game screen: Home and the score stay at the top, the status line at the bottom,
// the middle stays clear for the face and balloons, nothing overlaps, and the page footer
// is gone while playing.
test('in-game HUD keeps the middle clear and nothing overlaps', async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const modes = ['balloon', 'endurance', 'precision', 'flash'];
  try {
    for (const scenario of cases) {
      for (const mode of modes) {
        const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height } });
        try {
          await page.route(/\.js(?:\?|$)/, route => route.abort());
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await page.evaluate(({ scenario, mode }) => {
            if (scenario.textZoom) document.documentElement.style.fontSize = `${scenario.textZoom * 100}%`;
            for (const [side,value] of Object.entries({top:scenario.safeTop,bottom:scenario.safeBottom,left:scenario.safeSide,right:scenario.safeSide})) {
              if(value !== undefined) document.documentElement.style.setProperty(`--safe-${side}`,`${value}px`);
            }
            const $ = s => document.querySelector(s);
            // The DOM state main.js sets when a round starts.
            $('#menu-screen').classList.add('hidden');
            document.body.classList.add('in-game');
            const hud = $('#game-hud');
            hud.classList.remove('hidden'); hud.classList.add('active');
            $('#face-status').classList.remove('hidden');
            if (mode === 'balloon') {
              hud.classList.add('balloon-mode', 'tap-mode');
              $('#hud-label').innerText = 'POPPED'; $('#score').innerText = '17';
              const lives = $('#lives-display'); lives.classList.remove('hidden');
              lives.innerHTML = '<span class="life">🎈</span><span class="life">🎈</span><span class="life lost">🎈</span>';
              $('#challenge-hud').classList.remove('hidden'); $('#challenge-hud-value').innerText = '52 balloons';
              $('#face-status-text').innerText = 'One got away! 2 lives left';
            } else if (mode === 'endurance') {
              $('#hud-label').innerText = 'TIME'; $('#score').innerText = '128.40s';
              $('#world-record-display').classList.remove('hidden'); $('#wr-value').innerText = '131.20s';
              $('#challenge-hud').classList.remove('hidden'); $('#challenge-hud-value').innerText = '120.00s';
              $('#face-status-text').innerText = 'Keep your eyes open!';
            } else if (mode === 'precision') {
              $('#hud-label').innerText = 'TIME'; $('#score').innerText = '04.20s';
              $('#target-display').classList.remove('hidden');
              $('#face-status-text').innerText = 'Blink at exactly 10 seconds';
            } else {
              hud.classList.add('tap-mode');
              $('#hud-label').innerText = 'TRY'; $('#score').innerText = '3/5';
              $('#face-status-text').innerText = 'Blink the moment it turns green';
            }
          }, { scenario, mode });
          const geometry = await page.evaluate(() => {
            const visible = el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
            const boxes = [...document.querySelectorAll('#home-btn, #game-hud .hud-right > *, #face-status')]
              .filter(visible)
              .map(el => { const { left, right, top, bottom } = el.getBoundingClientRect(); return { id: el.id || el.className, left, right, top, bottom }; });
            const footer = document.querySelector('.footer');
            return { boxes, footerShown: visible(footer), scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight };
          });
          if (output) await page.screenshot({ path: path.join(output, `hud-${mode}-${scenario.name.replaceAll(' ', '-')}.png`) });
          const label = `${scenario.name} ${mode}: ${JSON.stringify(geometry)}`;
          assert.equal(geometry.footerShown, false, `footer shows during a game: ${label}`);
          assert.ok(geometry.scrollWidth <= geometry.w + 1, `horizontal overflow: ${label}`);
          assert.ok(geometry.scrollHeight <= geometry.h + 1, `page scrolls during a game: ${label}`);
          for (const b of geometry.boxes) {
            assert.ok(b.left >= -1 && b.right <= geometry.w + 1 && b.top >= -1 && b.bottom <= geometry.h + 1, `${b.id} off screen: ${label}`);
          }
          for (let i = 0; i < geometry.boxes.length; i++) {
            for (let j = i + 1; j < geometry.boxes.length; j++) {
              const a = geometry.boxes[i], b = geometry.boxes[j];
              const overlap = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
              assert.ok(!overlap, `${a.id} overlaps ${b.id}: ${label}`);
            }
          }
          // On normal-size text, the middle band of the screen holds no HUD at all.
          if (!scenario.textZoom && geometry.h >= 500) {
            const bandTop = geometry.h * 0.4, bandBottom = geometry.h * 0.7;
            for (const b of geometry.boxes) {
              assert.ok(b.bottom <= bandTop || b.top >= bandBottom, `${b.id} covers the middle of the screen: ${label}`);
            }
          }
        } finally { await page.close(); }
      }
    }
  } finally { await browser.close(); }
});
