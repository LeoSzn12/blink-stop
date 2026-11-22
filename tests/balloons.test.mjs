import test from 'node:test';
import assert from 'node:assert/strict';
import { createBalloonRound, difficulty, POP_ZONE, BALLOON_MISSES, MAX_SPEED, MIN_GAP_MS, TOP_SPEED, TOP_GAP_MS, MIN_ZONE, STEP_POPS, GOLD_POINTS, zoneFor, lifeBackStreak, balloonColors, drawBalloons } from '../src/balloons.mjs';
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
    assert.equal(difficulty(49).speed, MAX_SPEED);
    assert.equal(difficulty(49).gapMs, MIN_GAP_MS);
    assert.ok(Math.abs(difficulty(1000).speed - TOP_SPEED) < 1e-9);
    assert.equal(difficulty(1000).gapMs, TOP_GAP_MS);
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

test('the first five pops stay at the easy pace, levels go up every five, and a 15 streak wins a life back', async () => {
    const { EASY_POPS, LIFE_BACK_STREAK, balloonLevel } = await import('../src/balloons.mjs');
    assert.equal(difficulty(EASY_POPS).speed, difficulty(0).speed);
    assert.ok(difficulty(EASY_POPS + 1).speed > difficulty(0).speed);
    assert.equal(balloonLevel(0), 1);
    assert.equal(balloonLevel(5), 2);
    const round = createBalloonRound({ random: () => 0.5 });
    // Lose one life on an empty blink (the first stray blink is free).
    round.update(0); round.blink(10); round.blink(400);
    assert.equal(round.misses, 1);
    let t = 500, last = null;
    for (let i = 0; i < LIFE_BACK_STREAK; i++) {
        t = untilInZone(round, t + 300);
        last = round.blink(t);
        assert.equal(last.hit, true);
        if (i === 4) assert.equal(last.levelUp, true);
    }
    assert.equal(last.streak, LIFE_BACK_STREAK);
    assert.equal(last.lifeBack, true);
    assert.equal(round.misses, 0);
});

test('every 50 pops the zone shrinks and balloons speed up, but a blink always gets about 0.4 s', () => {
    const size = score => { const z = zoneFor(score); return z.bottom - z.top; };
    assert.ok(Math.abs(size(0) - (POP_ZONE.bottom - POP_ZONE.top)) < 1e-9);
    assert.equal(size(49), size(0));
    assert.ok(size(50) < size(49));
    assert.ok(size(100) < size(50));
    assert.ok(Math.abs(size(10000) - MIN_ZONE) < 1e-9);
    // The zone stays centred, so balloons still pass through the same part of the screen.
    assert.ok(Math.abs((zoneFor(200).top + zoneFor(200).bottom) - (POP_ZONE.top + POP_ZONE.bottom)) < 1e-9);
    assert.ok(difficulty(50).speed > difficulty(49).speed);
    for (const score of [0, 50, 100, 150, 200, 500, 10000]) assert.ok(size(score) / difficulty(score).speed >= 0.39, `too fast at ${score}`);
    assert.ok(lifeBackStreak(200) > lifeBackStreak(0));
    assert.equal(lifeBackStreak(10000), 30);
});

test('crossing 50 pops says it got harder and the round uses the smaller zone', () => {
    const round = createBalloonRound({ random: () => 0.5 });
    let now = 0, last;
    while (round.score < STEP_POPS) {
        now = untilInZoneOf(round, now);
        last = round.blink(now);
        assert.ok(last?.hit, `missed at ${round.score}`);
        now += 300;
    }
    assert.equal(last.harder, true);
    assert.equal(last.step, 1);
    assert.deepEqual(round.zone, zoneFor(STEP_POPS));
});

function untilInZoneOf(round, now) {
    for (let t = now; t < now + 10000; t += 16) {
        round.update(t);
        const z = round.zone;
        if (round.balloons.some(b => !b.poppedAt && b.y >= z.top && b.y <= z.bottom)) return t;
    }
    throw new Error('no balloon reached the zone');
}

test('a golden balloon is fast and worth 5; a holiday balloon gives a life back; missing either costs nothing', () => {
    // Rolls near 1 make specials; everything else stays ordinary.
    let roll = 0.5;
    const round = createBalloonRound({ random: () => roll });
    let now = 0;
    while (round.score < 10) { now = untilInZoneOf(round, now); round.blink(now); now += 300; }
    // Let a balloon escape so there's a life to win back.
    for (let t = now; round.misses === 0; t += 16) { round.update(t); now = t; }
    roll = 0.99;
    let gold;
    for (let t = now; !gold && t < now + 20000; t += 16) { round.update(t); now = t; gold = round.balloons.find(b => b.kind === 'GOLD' && !b.poppedAt); }
    assert.ok(gold, 'a golden balloon appears');
    roll = 0.5;
    const ordinary = round.balloons.find(b => b.kind === 'NORMAL' && !b.poppedAt);
    if (ordinary) assert.ok(gold.speed > ordinary.speed);
    for (let t = now; !(gold.y >= round.zone.top && gold.y <= round.zone.bottom); t += 16) { round.update(t); now = t; }
    const before = round.score;
    // Pop whatever else is nearer the middle first, until the gold one is the target.
    let hit;
    for (let i = 0; i < 3 && !(hit?.kind === 'GOLD'); i++) { hit = round.blink(now); now += 260; round.update(now); }
    assert.equal(hit.kind, 'GOLD');
    assert.ok(round.score >= before + GOLD_POINTS);
    // A holiday balloon: rolls just under the gold range.
    roll = 0.9;
    let life;
    for (let t = now; !life && t < now + 20000; t += 16) { round.update(t); now = t; life = round.balloons.find(b => b.kind === 'LIFE' && !b.poppedAt); }
    assert.ok(life, 'a holiday balloon appears');
    roll = 0.5;
    // Let it float away: only ordinary balloons that escape cost a life, never the special.
    let events = 0, normalsLost = 0;
    for (let t = now; round.balloons.includes(life) && !round.over; t += 16) {
        const normals = round.balloons.filter(b => b.kind === 'NORMAL' && !b.poppedAt);
        events += round.update(t).length;
        normalsLost += normals.filter(b => !round.balloons.includes(b)).length;
    }
    assert.equal(life.escaped, true);
    assert.equal(events, normalsLost);
});
