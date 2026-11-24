import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowAppBanner, isPlainIosSafari, APP_STORE_URL } from '../src/appBanner.mjs';

const UA = {
    iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
    iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
    iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.0',
    ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
};

test('iPhone Safari is left to Apple\'s Smart App Banner', () => {
    assert.equal(isPlainIosSafari(UA.iphoneSafari), true);
    assert.equal(shouldShowAppBanner({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 }), false);
});

test('other iPhone browsers and in-app browsers get the in-page banner', () => {
    for (const userAgent of [UA.iphoneChrome, UA.iphoneFirefox, UA.iphoneInstagram]) {
        assert.equal(shouldShowAppBanner({ userAgent, maxTouchPoints: 5 }), true, userAgent);
    }
});

test('the home-screen web app gets the banner, since Safari shows none there', () => {
    assert.equal(shouldShowAppBanner({ userAgent: UA.iphoneSafari, maxTouchPoints: 5, standalone: true }), true);
});

test('never inside the Blink Stop app, never after Not now, never off Apple touch devices', () => {
    assert.equal(shouldShowAppBanner({ userAgent: UA.iphoneChrome, maxTouchPoints: 5, isNative: true }), false);
    assert.equal(shouldShowAppBanner({ userAgent: UA.iphoneChrome, maxTouchPoints: 5, dismissed: true }), false);
    assert.equal(shouldShowAppBanner({ userAgent: UA.macChrome, maxTouchPoints: 0 }), false);
    assert.equal(shouldShowAppBanner({ userAgent: UA.android, maxTouchPoints: 5 }), false);
});

test('an iPad asking for the desktop site is still treated as an iPad', () => {
    assert.equal(shouldShowAppBanner({ userAgent: UA.ipadDesktop, maxTouchPoints: 5 }), false); // Safari: Apple's banner
    assert.equal(shouldShowAppBanner({ userAgent: UA.ipadDesktop, maxTouchPoints: 5, standalone: true }), true);
});

test('the banner and the meta tag point to the same App Store listing', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const id = APP_STORE_URL.match(/id(\d+)$/)[1];
    assert.match(html, new RegExp(`<meta name="apple-itunes-app" content="app-id=${id}">`));
    assert.ok(html.includes(`href="${APP_STORE_URL}"`));
});
