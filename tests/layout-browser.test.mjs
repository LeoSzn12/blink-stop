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
  { name: 'narrow portrait', width: 320, height: 568 },
  { name: 'short landscape', width: 667, height: 375 },
  { name: '200% text', width: 390, height: 844, textZoom: 2 },
];

test('game-over actions remain reachable on narrow and enlarged-text screens', async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    for (const scenario of [cases[1], cases[3]]) {
      const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height } });
      try {
        await page.route(/\.js(?:\?|$)/, route => route.abort());
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.evaluate(zoom => {
          if (zoom) document.documentElement.style.fontSize = `${zoom * 100}%`;
          document.querySelector('#menu-screen').classList.add('hidden');
          document.querySelector('#game-over-screen').classList.remove('hidden');
        }, scenario.textZoom || null);
        for (const selector of ['#restart-btn', '#share-btn', '#selfie-btn', '#menu-btn']) {
          await page.locator(selector).evaluate(el => scrollBy(0, el.getBoundingClientRect().top - 100));
          const box = await page.locator(selector).boundingBox();
          const footerTop = await page.locator('.footer').evaluate(el => el.getBoundingClientRect().top);
          assert.ok(box.x >= 0 && box.x + box.width <= scenario.width && box.y >= 0 && box.y + box.height <= footerTop,
            `${scenario.name} ${selector} clipped: ${JSON.stringify({ box, footerTop })}`);
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
        await page.evaluate(zoom => {
          if (zoom) document.documentElement.style.fontSize = `${zoom * 100}%`;
          const error = document.querySelector('#camera-error');
          error.textContent = 'Camera access was denied. Allow camera access in your browser settings, then reload to play. Your video stays on this device.';
          error.classList.remove('hidden');
          document.querySelector('#loading-msg').classList.add('hidden');
        }, scenario.textZoom || null);
        const initialTitleTop = await page.locator('#menu-screen h1').evaluate(el => el.getBoundingClientRect().top);
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
        assert.ok(initialTitleTop >= 0, `title clipped initially: ${label}`);
        assert.ok(geometry.error.top >= 0 && geometry.error.bottom + 8 <= geometry.footer.top, `error/footer overlap: ${label}`);
        assert.ok(geometry.scrollWidth <= geometry.viewportWidth + 1, `horizontal overflow: ${label}`);
        for (const button of await page.locator('.mode-btn').all()) {
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
