import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, SKIN_ORDER, seasonalSkin, resolveSkin, storedSkinValue, faceFrame, drawSkinOverlay, drawHeadwear, selfieCaption, composeSelfie, drawBrandLockup, tableChallenge, brandBanner, brandFooter, mediaShareText } from '../src/skins.mjs';
import { drawScoreCard } from '../src/scoreCard.mjs';

// Records every 2D call; any method returns the context so gradients work too.
function recorder() {
    const calls = [];
    const ctx = new Proxy({}, { get: (t, key) => key in t ? t[key] : (...args) => { calls.push([key, ...args]); return ctx; },
        set: (t, key, value) => { t[key] = value; return true; } });
    return { ctx, calls };
}
function landmarks() {
    const points = Array.from({ length: 468 }, () => ({ x: .5, y: .5, z: 0 }));
    points[10] = { x: .5, y: .25 }; points[152] = { x: .5, y: .8 }; points[234] = { x: .35, y: .5 }; points[454] = { x: .65, y: .5 };
    return points;
}

test('seasonal default: Thanksgiving in November, Christmas in December, Classic otherwise', () => {
    assert.equal(seasonalSkin(new Date(2026, 10, 26)), 'THANKSGIVING');
    assert.equal(seasonalSkin(new Date(2026, 11, 24)), 'CHRISTMAS');
    assert.equal(seasonalSkin(new Date(2027, 6, 4)), 'CLASSIC');
    assert.deepEqual(SKIN_ORDER.filter(id => SKINS[id]), SKIN_ORDER);
});

test('a picked skin lasts for its month only; junk falls back to the season', () => {
    const nov = new Date(2026, 10, 18), dec = new Date(2026, 11, 2);
    const stored = storedSkinValue('PARTY', nov);
    assert.equal(stored, 'PARTY@2026-11');
    assert.equal(resolveSkin(stored, nov), 'PARTY');
    assert.equal(resolveSkin(stored, dec), 'CHRISTMAS');
    for (const junk of [null, '', 'PARTY', 'HACK@2026-11', '<img>@2026-11', 42]) assert.equal(resolveSkin(junk, nov), 'THANKSGIVING');
    assert.throws(() => storedSkinValue('NOPE', nov));
});

test('face frame needs real landmarks and a sized canvas', () => {
    assert.equal(faceFrame({}, 640, 480), null);
    assert.equal(faceFrame(Array(468).fill({ x: 0, y: 0 }), 640, 480), null);
    assert.equal(faceFrame(landmarks(), 0, 480), null);
    const f = faceFrame(landmarks(), 640, 480);
    assert.ok(Math.abs(f.width - 192) < 1e-9);
    assert.ok(Math.abs(f.angle) < 1e-9);
    assert.ok(f.topOffset > 0);
});

test('Classic draws nothing; holiday skins draw headwear only when a face is found', () => {
    const classic = recorder();
    drawSkinOverlay(classic.ctx, 'CLASSIC', landmarks(), 640, 480, 1000);
    assert.equal(classic.calls.length, 0);
    for (const id of ['THANKSGIVING', 'CHRISTMAS', 'PARTY']) {
        assert.equal(drawHeadwear(recorder().ctx, id, landmarks(), 640, 480), true, id);
        assert.equal(drawHeadwear(recorder().ctx, id, null, 640, 480), false, id);
        const { ctx, calls } = recorder();
        drawSkinOverlay(ctx, id, undefined, 640, 480, 1000);
        assert.ok(calls.some(([name]) => name === 'fill'), `${id} ambient`);
        const saves = calls.filter(([name]) => name === 'save').length, restores = calls.filter(([name]) => name === 'restore').length;
        assert.equal(saves, restores, `${id} balanced save/restore`);
    }
});

test('photo caption matches the round outcome', () => {
    assert.deepEqual(selfieCaption({ reason: 'BLINK', mode: 'CLASSIC', elapsed: 12.345 }), { headline: 'CAUGHT BLINKING!', detail: 'Lasted 12.35s without blinking' });
    assert.match(selfieCaption({ reason: 'BLINK', mode: 'PRECISION', elapsed: 9.8, target: 10 }).detail, /9\.80s · target 10s/);
    assert.equal(selfieCaption({ reason: 'WIN_ENDURANCE', mode: 'ENDURANCE', elapsed: 30.01 }).headline, 'EYES OF STEEL');
    assert.equal(selfieCaption({ reason: 'DISQUALIFIED', mode: 'CLASSIC', elapsed: 3 }).headline, 'FACE LOST!');
});

test('framed photo is a 4:5 JPEG drawn from the camera canvas with the skin greeting', () => {
    const { ctx, calls } = recorder();
    const out = { getContext: () => ctx, toDataURL: (type, quality) => `data:${type};base64,AAAA` };
    const doc = { createElement: () => out };
    const source = { width: 640, height: 480 };
    const url = composeSelfie(source, 'THANKSGIVING', selfieCaption({ reason: 'BLINK', mode: 'CLASSIC', elapsed: 4 }), doc);
    assert.equal(url, 'data:image/jpeg;base64,AAAA');
    assert.deepEqual([out.width, out.height], [1080, 1350]);
    assert.ok(calls.some(([name, image]) => name === 'drawImage' && image === source));
    const texts = calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    assert.ok(texts.some(text => text.includes('THANKSGIVING TABLE CHALLENGE')));
    assert.ok(texts.includes('CAUGHT BLINKING!'));
    assert.ok(texts.includes('BLINK STOP'), 'the name is on the photo even before the logo loads');
    assert.ok(texts.some(text => text.startsWith('Who blinks first at your table?')));
});

test('the Blink Stop logo goes on the photo when it has loaded', () => {
    const { ctx, calls } = recorder();
    const out = { getContext: () => ctx, toDataURL: type => `data:${type};base64,AAAA` };
    const logo = { complete: true, naturalWidth: 192 };
    composeSelfie({ width: 640, height: 480 }, 'CHRISTMAS', { headline: 'X WINS!', detail: 'Y blinked first after 3.00s' }, { createElement: () => out }, logo);
    assert.ok(calls.some(([name, image]) => name === 'drawImage' && image === logo));
    const texts = calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    assert.ok(texts.some(text => text.includes('MERRY CHRISTMAS')), 'other skins keep their greeting');
    assert.ok(texts.some(text => text.startsWith('Your turn! Play free at playblinkstop.com')));
    // A logo that failed to load is skipped, never drawn broken.
    const { ctx: ctx2, calls: calls2 } = recorder();
    drawBrandLockup(ctx2, { complete: true, naturalWidth: 0 }, { x: 100, y: 50, size: 40, color: '#fff' });
    assert.equal(calls2.some(([name]) => name === 'drawImage'), false);
    assert.ok(calls2.some(([name, text]) => name === 'fillText' && text === 'BLINK STOP'));
});

test('Thanksgiving turns shared photos and clips into a table challenge; other skins stay as they were', () => {
    assert.equal(tableChallenge('CLASSIC'), null);
    assert.equal(tableChallenge('THANKSGIVING').banner, '🦃 THANKSGIVING TABLE CHALLENGE 🦃');
    assert.equal(brandBanner('CLASSIC'), "👁️ DON'T BLINK CHALLENGE 👁️", 'Classic does not repeat the name under the logo');
    assert.equal(brandBanner('PARTY'), "🎉 DON'T BLINK! 🎉");
    assert.match(brandFooter('THANKSGIVING'), /^Who blinks first at your table\? playblinkstop\.com/);
    assert.equal(mediaShareText('THANKSGIVING', 'Ana won!', 'https://playblinkstop.com/'), 'Ana won! Who blinks first at your table? Play free: https://playblinkstop.com/ #BlinkStop #ThanksgivingChallenge');
    assert.equal(mediaShareText('CLASSIC', 'Beat me?', 'https://playblinkstop.com/'), 'Beat me? Play free: https://playblinkstop.com/ #BlinkStop');
});

test('holiday score card stays photo-free and keeps the challenge code', () => {
    const { ctx, calls } = recorder();
    const canvas = { getContext: () => ctx, toDataURL: () => 'data:image/png;base64,AAAA' };
    drawScoreCard(canvas, { mode: 'CLASSIC', score: 12.345, elapsed: 12.345 }, 'CHRISTMAS');
    assert.equal(calls.some(([name]) => name === 'drawImage'), false);
    const texts = calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    assert.ok(texts.includes('BS1-C-0-12345'));
    assert.ok(texts.some(text => text.includes('MERRY CHRISTMAS')));
});
