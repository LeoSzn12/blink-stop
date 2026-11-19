import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlashRound, FLASH_TRIES, FLASH_TIMEOUT_MS } from '../src/flash.mjs';
import { createBeatRound, makeRhythm, copyMatches, gapMatches, BEAT_LIVES, START_BEATS, SHORT_MS, LONG_MS } from '../src/beat.mjs';

test('Flash: blink after green scores the reaction in ms; best of three is the fastest', () => {
    const round = createFlashRound({ random: () => 0, firstWaitMs: 1000 });
    assert.equal(round.update(0), null);
    assert.equal(round.phase, 'WAIT');
    assert.equal(round.update(1000).kind, 'GO');
    const hit = round.blink(1320);
    assert.deepEqual([hit.kind, hit.ms, hit.tryNumber, hit.over], ['HIT', 320, 1, false]);
    assert.equal(round.phase, 'BETWEEN');
    assert.equal(round.blink(1500), null, 'blinks between tries do nothing');
    assert.equal(round.update(2800).kind, 'READY');
    assert.equal(round.update(2800 + 1500).kind, 'GO'); // random 0 gives the shortest wait
    round.blink(4300 + 250);
    round.update(4550 + 1400);
    round.update(5950 + 1500);
    const last = round.blink(7450 + 410);
    assert.equal(last.over, true);
    assert.deepEqual(round.times, [320, 250, 410]);
    assert.equal(round.best, 250);
    assert.equal(FLASH_TRIES, 3);
});

test('Flash: blinking before green is a false start and the wait starts over', () => {
    const round = createFlashRound({ random: () => 0, firstWaitMs: 1000 });
    round.update(0);
    assert.equal(round.blink(600).kind, 'EARLY');
    assert.equal(round.falseStarts, 1);
    assert.equal(round.update(1000), null, 'the old green time no longer fires');
    assert.equal(round.update(600 + 1500).kind, 'GO');
});

test('Flash: no blink after green times out at the limit', () => {
    const round = createFlashRound({ firstWaitMs: 500 });
    round.update(0); round.update(500);
    const slow = round.update(500 + FLASH_TIMEOUT_MS);
    assert.deepEqual([slow.kind, slow.ms], ['SLOW', FLASH_TIMEOUT_MS]);
});

test('Copy the Beat: rhythms start short and timing is forgiving but not sloppy', () => {
    assert.deepEqual(makeRhythm(3, () => 0.9), [SHORT_MS, LONG_MS]);
    assert.equal(gapMatches(SHORT_MS, SHORT_MS + 200), true);
    assert.equal(gapMatches(SHORT_MS, LONG_MS), false);
    assert.equal(gapMatches(LONG_MS, SHORT_MS), false);
    assert.equal(copyMatches([450, 1000], [0, 500, 1450]), true);
    assert.equal(copyMatches([450, 1000], [0, 500]), false);
});

function play(round, now, gaps) {
    // Runs the show, then blinks the given gaps back. Returns the time after judging.
    let t = now;
    while (round.phase === 'SHOW') { round.update(t); t += 50; }
    assert.equal(round.phase, 'COPY');
    let result = round.blink(t);
    for (const gap of gaps) { t += gap; result = round.blink(t) ?? result; }
    return { t, result };
}

test('Copy the Beat: a right copy adds a beat, a wrong one costs a life, three wrong ends it', () => {
    const round = createBeatRound({ random: () => 0.9 });
    round.update(0);
    assert.equal(round.beats, START_BEATS);
    let { t, result } = play(round, 0, round.gaps);
    assert.equal(result.kind, 'RIGHT');
    assert.equal(round.score, 1);
    assert.equal(round.beats, START_BEATS + 1);
    round.update(t + 1200);
    assert.equal(round.phase, 'SHOW');
    for (let i = 0; i < BEAT_LIVES; i++) {
        ({ t, result } = play(round, t + 1200, round.gaps.map(() => 1500)));
        assert.equal(result.kind, 'WRONG');
        round.update(t + 1200);
    }
    assert.equal(round.over, true);
    assert.equal(round.livesLeft(), 0);
    assert.equal(round.score, 1);
});

test('Copy the Beat: stopping partway, or never starting, is judged as wrong', () => {
    const round = createBeatRound();
    round.update(0);
    let t = 0;
    while (round.phase === 'SHOW') { round.update(t); t += 50; }
    round.blink(t);
    assert.equal(round.update(t + 1000), null);
    assert.equal(round.update(t + 1900).kind, 'WRONG');
    assert.equal(round.livesLeft(), BEAT_LIVES - 1);
    assert.equal(round.blink(t + 1950), null, 'blinks during the result do nothing');
});

test('Flash and Copy the Beat results share, and challenge codes round-trip', async () => {
    const { sharePayload, parseChallenge, challengeOutcome, formatScore, inviteLine, challengeHeadline } = await import('../src/share.mjs');
    const flash = { mode: 'FLASH', score: 287 };
    assert.equal(formatScore('FLASH', 287), '287 ms');
    assert.match(sharePayload(flash).text, /BS1-F-0-287000/);
    assert.deepEqual(parseChallenge('BS1-F-0-287000'), { mode: 'FLASH', score: 287, target: 0 });
    assert.match(challengeOutcome({ mode: 'FLASH', score: 250 }, { mode: 'FLASH', score: 287 }), /BEATEN/);
    assert.match(inviteLine(flash), /287 ms after the flash/);
    assert.equal(challengeHeadline({ mode: 'FLASH', score: 287 }).title, 'Blink faster than 287 ms');
    const beat = { mode: 'BEAT', score: 4 };
    assert.equal(formatScore('BEAT', 1), '1 round');
    assert.deepEqual(parseChallenge(sharePayload(beat).text), { mode: 'BEAT', score: 4, target: 0 });
    assert.match(challengeOutcome({ mode: 'BEAT', score: 5 }, { mode: 'BEAT', score: 4 }), /BEATEN/);
});
