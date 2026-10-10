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
