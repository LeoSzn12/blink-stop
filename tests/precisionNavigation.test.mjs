import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Precision target picker has a named Back control wired to restore mode selection', () => {
    const html = read('index.html');
    const picker = html.match(/<div id="precision-options"[\s\S]*?<\/div>\s*<\/div>/)?.[0];
    assert.ok(picker, 'Precision target picker exists');
    assert.match(picker, /<button\b[^>]*id="precision-back-btn"[^>]*>\s*Back\s*<\/button>/i);
    const js = read('src/main.js');
    assert.match(js, /precisionBackBtn\.addEventListener\('click',\s*\(\)\s*=>\s*\{[\s\S]*?precisionOptions\.classList\.add\('hidden'\);[\s\S]*?modeSelection\.classList\.remove\('hidden'\);[\s\S]*?\}\)/);
});

test('Precision starts in one tap at 10 seconds, and the target can still be changed', () => {
    const html = read('index.html');
    const js = read('src/main.js');
    assert.match(html, /id="precision-target-label">10 seconds</);
    assert.match(html, /<button\b[^>]*id="precision-change-btn"[^>]*>Change target time<\/button>/);
    assert.match(html, /class="[^"]*option-btn active" data-time="10">10 sec</);
    assert.doesNotMatch(html, />\s*(5|10|15)s\s*</, 'no "5s" labels that read like 55');
    assert.match(js, /mode === 'PRECISION'\) \{\s*precisionTarget = precisionChoice;\s*startGame\('PRECISION'\);/);
});

test('first-time players get plain words and a camera line above the games', () => {
    const html = read('index.html');
    const menu = html.slice(html.indexOf('id="menu-screen"'), html.indexOf('class="mode-selection"'));
    assert.match(menu, /id="camera-problem"/, 'camera problems show above the games');
    assert.match(menu, /Uses your camera to see blinks\. Nothing leaves your phone\./);
    for (const phrase of ['Got a challenge?', 'EYE STABILITY', 'Gobble mode']) {
        assert.ok(!html.includes(phrase) && !read('src/skins.mjs').includes(phrase), phrase);
    }
    const js = read('src/main.js');
    assert.doesNotMatch(js, /"DQ"|TOO EARLY\/LATE/);
    assert.match(js, /TAP_GUARD_MS = 450/);
});

test('version 1.0 hides the bonus theme demo but keeps its code', () => {
    const html = read('index.html');
    for (const id of ['demo-menu-btn', 'demo-bonus-btn']) {
        assert.match(html, new RegExp(`<button id="${id}" class="[^"]*\\bhidden\\b[^"]*"[^>]*\\bhidden>`), id);
    }
    assert.doesNotMatch(read('src/main.js'), /demo(Bonus|Menu)Btn?\.(hidden|classList\.remove)/);
    assert.match(read('src/main.js'), /function startDemoAd/);
});
