import test from 'node:test';
import assert from 'node:assert/strict';
import { createBalloonRound, difficulty, POP_ZONE, BALLOON_MISSES, MAX_SPEED, MIN_GAP_MS, balloonColors, drawBalloons } from '../src/balloons.mjs';
import { resultDetails, challengeCode, parseChallenge, inviteLine, formatScore, challengeOutcome } from '../src/share.mjs';
import { selfieCaption } from '../src/skins.mjs';

// Runs the round in 16 ms steps until the first balloon is inside the pop zone.
function untilInZone(round, now) {
    for (let t = now; t < now + 10000; t += 16) {
        round.update(t);
        if (round.balloons.some(b => !b.poppedAt && b.y >= POP_ZONE.top && b.y <= POP_ZONE.bottom)) return t;
    }
    throw new Error('no balloon reached the zone');
}

test('a blink pops the balloon in the zone and scores it', () => {
    const round = createBalloonRound({ random: () => 0.5 });
    const t = untilInZone(round, 0);
    const result = round.blink(t);
    assert.equal(result.hit, true);
    assert.equal(round.score, 1);
    assert.equal(round.misses, 0);
    // Holding a blink or blinking again instantly cannot double-pop.
    assert.equal(round.blink(t + 50), null);
});

test('blinking too early or letting balloons escape costs a miss; three misses end the round', () => {
    const early = createBalloonRound({ random: () => 0.5 });
    early.update(0);
    early.update(800); // a balloon is rising but still below the zone
    // The first stray blink for this balloon is free; the next one costs a life.
    assert.equal(early.blink(800).kind, 'FREE');
    assert.equal(early.livesLeft(), BALLOON_MISSES);
    assert.equal(early.blink(1200).kind, 'EMPTY');
    assert.equal(early.livesLeft(), BALLOON_MISSES - 1);

    const lazy = createBalloonRound({ random: () => 0.3 });
    let t = 0;
    while (!lazy.over && t < 60000) { lazy.update(t); t += 50; }
    assert.equal(lazy.over, true);
    assert.equal(lazy.misses, BALLOON_MISSES);
    assert.equal(lazy.score, 0);
    assert.equal(lazy.blink(t), null);
});

test('balloons speed up and come faster as the score grows, within limits', () => {
    assert.ok(difficulty(10).speed > difficulty(0).speed);
    assert.ok(difficulty(10).gapMs < difficulty(0).gapMs);
    assert.equal(difficulty(1000).speed, MAX_SPEED);
    assert.equal(difficulty(1000).gapMs, MIN_GAP_MS);
    // Starts gentle: the first balloon takes over a second to cross the pop zone.
    assert.ok((POP_ZONE.bottom - POP_ZONE.top) / difficulty(0).speed > 1.4);
    // Gets harder: by 20 pops it crosses the tall zone in under a second.
    assert.ok((POP_ZONE.bottom - POP_ZONE.top) / difficulty(20).speed < 0.95);
    // The zone is tall enough that a blink near a balloon still counts.
    assert.ok(POP_ZONE.bottom - POP_ZONE.top >= 0.4);
    assert.equal(BALLOON_MISSES, 3);
    for (const skin of ['CLASSIC', 'THANKSGIVING', 'CHRISTMAS', 'PARTY', 'UNKNOWN']) assert.equal(balloonColors(skin).length, 4);
});

test('a skilled player keeps popping and never has more than two balloons up', () => {
    const round = createBalloonRound({ random: (() => { let i = 0; return () => [0.2, 0.7, 0.4, 0.9][i++ % 4]; })() });
    let t = 0;
    while (round.score < 12 && t < 120000) {
        round.update(t);
        assert.ok(round.balloons.filter(b => !b.poppedAt).length <= 2);
        const ready = round.balloons.find(b => !b.poppedAt && b.y <= 0.45 && b.y >= POP_ZONE.top);
        if (ready) round.blink(t);
        t += 16;
    }
    assert.equal(round.score, 12);
    assert.equal(round.over, false);
});

test('drawing the round does not throw with popped and rising balloons', () => {
    const calls = [];
    const ctx = new Proxy({}, { get: (target, key) => (key in target ? target[key] : (...args) => calls.push(key)), set: (t, k, v) => { t[k] = v; return true; } });
    const round = createBalloonRound({ random: () => 0.5 });
    const t = untilInZone(round, 0);
    drawBalloons(ctx, round, 'CHRISTMAS', 720, 1280, t);
    round.blink(t);
    drawBalloons(ctx, round, 'CHRISTMAS', 720, 1280, t + 100);
    assert.ok(calls.includes('ellipse') && calls.includes('fillText'));
});

test('balloon results share, challenge and caption as counts, not seconds', () => {
    const r = resultDetails({ mode: 'BALLOON', score: 7, elapsed: 41 });
    assert.equal(r.metric, '7 balloons popped');
    assert.equal(formatScore('BALLOON', 1), '1 balloon popped');
    assert.throws(() => resultDetails({ mode: 'BALLOON', score: 2.5, elapsed: 3 }));
    const code = challengeCode(r);
    assert.equal(code, 'BS1-B-0-7000');
    assert.deepEqual(parseChallenge(code), { mode: 'BALLOON', score: 7, target: 0 });
    assert.match(challengeOutcome({ mode: 'BALLOON', score: 9 }, { mode: 'BALLOON', score: 7 }), /BEATEN/);
    assert.match(inviteLine({ mode: 'BALLOON', score: 7, elapsed: 41 }), /^I popped 7 balloons just by blinking/);
    assert.match(inviteLine({ mode: 'CLASSIC', score: 12.3, elapsed: 12.3 }), /12\.30s/);
    assert.match(inviteLine(null), /beat me/);
    assert.equal(selfieCaption({ mode: 'BALLOON', score: 1 }).headline, '1 BALLOON POPPED!');
});
