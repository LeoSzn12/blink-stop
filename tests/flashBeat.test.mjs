import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlashRound, FLASH_TRIES, FLASH_TIMEOUT_MS } from '../src/flash.mjs';
import { createBeatRound, judgeOffset, bpmFor, BEAT_LIVES, START_BPM, MAX_BPM, PERFECT_MS, GOOD_MS, LATENCY_MS, LEAD_MS, LIFE_BACK_STREAK } from '../src/beat.mjs';

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

// Runs the round frame by frame until the next live note's time, returning that time.
function nextNoteAt(round, from) {
    let t = from;
    for (; t < from + 10000; t += 10) {
        round.update(t);
        const live = round.visible(t).filter(n => n.state === 'LIVE');
        const near = live.find(n => n.progress >= 0.999);
        if (near) return t;
    }
    throw new Error('no note');
}

test('Blink Beat: timing windows are forgiving and allow for camera delay', () => {
    assert.equal(judgeOffset(0), 'PERFECT');
    assert.equal(judgeOffset(PERFECT_MS), 'PERFECT');
    assert.equal(judgeOffset(-GOOD_MS), 'GOOD');
    assert.equal(judgeOffset(GOOD_MS + 1), null);
    assert.equal(bpmFor(0), START_BPM);
    assert.ok(bpmFor(8) > bpmFor(0));
    assert.equal(bpmFor(10000), MAX_BPM);
    assert.ok(60000 / MAX_BPM >= 500, 'notes never come faster than about two blinks a second');
});

test('Blink Beat: a count-in, then a blink at the line hits, even with camera delay', () => {
    const round = createBeatRound({ random: () => 0 });
    round.update(0);
    assert.equal(round.visible(0).filter(n => n.state === 'LIVE' && n.progress >= 0).length, 0, 'nothing to hit during the count-in');
    const at = nextNoteAt(round, 0);
    assert.ok(at >= LEAD_MS - 20, `first note comes after the count-in (${at})`);
    const hit = round.blink(at + LATENCY_MS);
    assert.equal(hit.kind, 'PERFECT');
    assert.equal(round.score, 1);
    assert.equal(round.combo, 1);
    const next = nextNoteAt(round, at + 50);
    assert.equal(round.blink(next + LATENCY_MS + 200).kind, 'GOOD');
    assert.equal(round.combo, 2);
});

test('Blink Beat: a stray blink breaks the streak but costs no life', () => {
    const round = createBeatRound({ random: () => 0 });
    round.update(0);
    const at = nextNoteAt(round, 0);
    round.blink(at + LATENCY_MS);
    const stray = round.blink(at + 600);
    assert.equal(stray.kind, 'STRAY');
    assert.equal(round.combo, 0);
    assert.equal(round.livesLeft(), BEAT_LIVES);
});

test('Blink Beat: missed notes cost lives and three ends it', () => {
    const round = createBeatRound({ random: () => 0 });
    let t = 0, missed = 0;
    while (!round.over && t < 60000) { missed += round.update(t).missed; t += 20; }
    assert.equal(round.over, true);
    assert.equal(missed, BEAT_LIVES);
    assert.equal(round.score, 0);
    assert.equal(round.blink(t + 1000), null, 'no blinks count after the end');
});

test('Blink Beat: blinking nonstop does not beat the game', () => {
    const round = createBeatRound({ random: () => 0.5 });
    let t = 0;
    while (!round.over && t < 40000) { round.update(t); if (t % 300 === 0) round.blink(t); t += 20; }
    assert.ok(round.bestCombo < 8, `spamming blinks keeps the streak short (${round.bestCombo})`);
});

test('Blink Beat: a long streak wins a lost life back and the beat speeds up', () => {
    const round = createBeatRound({ random: () => 0 });
    let t = 0;
    // Miss the first note, then hit the rest perfectly.
    while (round.update(t).missed === 0) t += 20;
    assert.equal(round.livesLeft(), BEAT_LIVES - 1);
    const startBpm = round.bpm;
    for (let i = 0; i < LIFE_BACK_STREAK; i++) {
        const at = nextNoteAt(round, t + 20);
        const result = round.blink(at + LATENCY_MS);
        assert.equal(result.kind, 'PERFECT');
        t = at;
        if (i === LIFE_BACK_STREAK - 1) assert.equal(result.lifeBack, true);
    }
    assert.equal(round.livesLeft(), BEAT_LIVES);
    assert.ok(round.bpm > startBpm);
});

test('Flash and Blink Beat results share, and challenge codes round-trip', async () => {
    const { sharePayload, parseChallenge, challengeOutcome, formatScore, inviteLine, challengeHeadline } = await import('../src/share.mjs');
    const flash = { mode: 'FLASH', score: 287 };
    assert.equal(formatScore('FLASH', 287), '287 ms');
    assert.match(sharePayload(flash).text, /BS1-F-0-287000/);
    assert.deepEqual(parseChallenge('BS1-F-0-287000'), { mode: 'FLASH', score: 287, target: 0 });
    assert.match(challengeOutcome({ mode: 'FLASH', score: 250 }, { mode: 'FLASH', score: 287 }), /BEATEN/);
    assert.match(inviteLine(flash), /287 ms after the flash/);
    assert.equal(challengeHeadline({ mode: 'FLASH', score: 287 }).title, 'Blink faster than 287 ms');
    const beat = { mode: 'BEAT', score: 4 };
    assert.equal(formatScore('BEAT', 1), '1 note');
    assert.deepEqual(parseChallenge(sharePayload(beat).text), { mode: 'BEAT', score: 4, target: 0 });
    assert.match(challengeOutcome({ mode: 'BEAT', score: 5 }, { mode: 'BEAT', score: 4 }), /BEATEN/);
});
