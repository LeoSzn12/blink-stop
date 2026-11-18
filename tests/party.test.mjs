import test from 'node:test';
import assert from 'node:assert/strict';
import { createVersusMatch, orderFaces, thresholdFrom, largestFace } from '../src/versus.mjs';
import { parseNames, createParty, createDeck, forfeitCards, jokeCards, MAX_PLAYERS } from '../src/party.mjs';
import { reelLayout, REEL_SIZE, REEL_LIMIT } from '../src/reel.mjs';
import { parseChallenge, challengeCode } from '../src/share.mjs';
import { drawSkinOverlay } from '../src/skins.mjs';

// A face centred at cx (normalized image x) with an eye opening ratio of `open`.
function face(cx, open = 0.3) {
    const points = Array.from({ length: 468 }, () => ({ x: cx, y: 0.5, z: 0 }));
    const eye = ([outer, top1, top2, inner, bottom2, bottom1], left) => {
        const x0 = left, w = 0.04, h = open * w;
        points[outer] = { x: x0, y: 0.45, z: 0 };
        points[inner] = { x: x0 + w, y: 0.45, z: 0 };
        points[top1] = { x: x0 + w / 3, y: 0.45 - h / 2, z: 0 };
        points[bottom1] = { x: x0 + w / 3, y: 0.45 + h / 2, z: 0 };
        points[top2] = { x: x0 + 2 * w / 3, y: 0.45 - h / 2, z: 0 };
        points[bottom2] = { x: x0 + 2 * w / 3, y: 0.45 + h / 2, z: 0 };
    };
    eye([33, 160, 158, 133, 153, 144], cx - 0.06);
    eye([362, 385, 387, 263, 373, 380], cx + 0.02);
    points[1] = { x: cx, y: 0.5, z: 0 };
    points[10] = { x: cx, y: 0.3, z: 0 };
    points[152] = { x: cx, y: 0.7, z: 0 };
    points[234] = { x: cx - 0.1, y: 0.5, z: 0 };
    points[454] = { x: cx + 0.1, y: 0.5, z: 0 };
    return points;
}

function calibrate(match, start = 0) {
    let now = start, event;
    for (; now <= start + 4000; now += 50) {
        event = match.observe([face(0.3), face(0.7)], now);
        if (event.started) return now;
    }
    throw new Error(`never started: ${JSON.stringify(event)}`);
}

test('faces are ordered as they appear on the mirrored screen', () => {
    const right = face(0.3), left = face(0.7);
    assert.deepEqual(orderFaces([right, left]), [left, right]);
    assert.deepEqual(orderFaces([null, 'x', right]), [right]);
    assert.equal(thresholdFrom([]), null);
    assert.ok(Math.abs(thresholdFrom([0.3, 0.3, 0.3]).threshold - 0.225) < 1e-9);
});

test('head-to-head waits for two faces, then the first blink loses', () => {
    const match = createVersusMatch();
    assert.equal(match.observe([face(0.5)], 0).status, 'NEED_TWO');
    assert.equal(match.observe([], 50).status, 'NEED_TWO');
    const start = calibrate(match, 100);
    assert.equal(match.phase, 'PLAYING');
    const open = match.observe([face(0.3), face(0.7)], start + 50);
    assert.ok(open.openness.LEFT > 0.9 && open.openness.RIGHT > 0.9);
    // The face at image x 0.3 is on the screen's right; it blinks.
    for (let t = start + 100; t <= start + 300; t += 33) match.observe([face(0.3, 0.05), face(0.7)], t);
    assert.equal(match.phase, 'DONE');
    assert.equal(match.outcome.result, 'WIN');
    assert.equal(match.outcome.loser, 'RIGHT');
    assert.equal(match.outcome.winner, 'LEFT');
    assert.ok(match.outcome.elapsed > 0 && match.outcome.elapsed < 1);
});

test('a shared blink is a dead heat, and a lost face or stall voids the round', () => {
    const tie = createVersusMatch();
    const start = calibrate(tie);
    for (let t = start + 50; t <= start + 300; t += 33) tie.observe([face(0.3, 0.05), face(0.7, 0.05)], t);
    assert.equal(tie.outcome.result, 'TIE');

    const lost = createVersusMatch();
    const s2 = calibrate(lost);
    for (let t = s2 + 50; t <= s2 + 1500; t += 50) lost.observe([face(0.3)], t);
    assert.equal(lost.outcome.result, 'VOID');
    assert.equal(lost.outcome.loser, undefined);

    const stalled = createVersusMatch();
    const s3 = calibrate(stalled);
    assert.equal(stalled.stall(s3 + 2000).result, 'VOID');
});

test('party names are trimmed, de-duplicated and capped', () => {
    assert.deepEqual(parseNames(' Mom \nDad, mom,,  Aunt   Jo \n'), ['Mom', 'Dad', 'Aunt Jo']);
    assert.equal(parseNames(Array.from({ length: 12 }, (_, i) => `P${i}`).join('\n')).length, MAX_PLAYERS);
    assert.equal(parseNames('A very long name indeed')[0].length, 12);
    assert.throws(() => createParty(['Solo']), /at least 2/);
});

test('every player takes a turn, the top two meet in the final', () => {
    const party = createParty(['Ana', 'Ben', 'Cy']);
    assert.equal(party.current(), 'Ana');
    party.record(4.2);
    party.record(9.876);
    assert.equal(party.turnNumber(), 3);
    party.record(null); // lost face counts as zero
    assert.equal(party.turnsDone(), true);
    assert.deepEqual(party.standings(), [{ name: 'Ben', score: 9.88 }, { name: 'Ana', score: 4.2 }, { name: 'Cy', score: 0 }]);
    assert.deepEqual(party.finalists(), ['Ben', 'Ana']);
    assert.equal(party.lastPlace(), 'Cy');
    assert.equal(party.champion(), null);
    party.recordFinal('Ana');
    assert.equal(party.champion(), 'Ana');
    assert.equal(party.finalPlayed(), true);
    assert.throws(() => party.record(1), /All turns are done/);

    const skipped = createParty(['X', 'Y']);
    skipped.record(1); skipped.record(2);
    assert.equal(skipped.skipFinal(), 'Y');
    assert.equal(skipped.finalPlayed(), false);
});

test('dare and joke decks are themed and never repeat until used up', () => {
    for (const skin of ['CLASSIC', 'THANKSGIVING', 'CHRISTMAS', 'PARTY']) {
        const dares = forfeitCards(skin), jokes = jokeCards(skin);
        assert.ok(dares.length >= 8 && jokes.length >= 8, skin);
        const deck = createDeck(dares, () => 0.42);
        const seen = new Set(Array.from({ length: dares.length }, () => deck.next()));
        assert.equal(seen.size, new Set(dares).size, skin);
    }
    assert.ok(forfeitCards('THANKSGIVING').some(card => /turkey|thank/i.test(card)));
    assert.ok(forfeitCards('CHRISTMAS').some(card => /santa|elf|jingle|carol/i.test(card)));
});

test('the reel fits up to nine photos inside the picture', () => {
    for (let n = 1; n <= REEL_LIMIT; n++) {
        const cells = reelLayout(n);
        assert.equal(cells.length, n);
        for (const c of cells) {
            assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= REEL_SIZE.width && c.y + c.h <= REEL_SIZE.height, `${n}`);
        }
    }
});

test('distraction challenges round-trip and hats follow up to two faces', () => {
    const code = challengeCode({ mode: 'DISTRACT', score: 12.34, elapsed: 12.34 });
    assert.match(code, /^BS1-J-/);
    assert.equal(parseChallenge(code).mode, 'DISTRACT');

    let hats = 0;
    const ctx = new Proxy({}, { get: (target, key) => key === 'save' ? () => hats++ : (target[key] ?? (() => ({ addColorStop() {} }))), set: (t, k, v) => { t[k] = v; return true; } });
    drawSkinOverlay(ctx, 'PARTY', [face(0.3), face(0.7), face(0.5)], 640, 480, 0);
    const twoFaces = hats;
    hats = 0;
    drawSkinOverlay(ctx, 'PARTY', face(0.5), 640, 480, 0);
    assert.ok(twoFaces > hats, `${twoFaces} vs ${hats}`);
});

test('solo rounds track the closest face when someone leans into the shot', () => {
    const player = face(0.5), onlooker = face(0.2);
    for (const i of [234, 454]) onlooker[i] = { x: onlooker[i].x * 0.5 + 0.1, y: 0.5, z: 0 };
    assert.equal(largestFace([onlooker, player]), player);
    assert.equal(largestFace([player]), player);
    assert.equal(largestFace([]), undefined);
    const opaque = {};
    assert.equal(largestFace([opaque]), opaque);
});
