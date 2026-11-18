import test from 'node:test';
import assert from 'node:assert/strict';
import { sharePayload, shareClipboardText, challengeCode, parseChallenge, challengeOutcome } from '../src/share.mjs';

test('share invitation includes mode and portable challenge and the approved public launch URL', () => {
    const payload = sharePayload({ mode: 'CLASSIC', score: 12.34, elapsed: 12.34 });
    assert.equal(payload.title, 'Blink Stop');
    assert.match(payload.text, /Endurance: 12\.34s/);
    assert.match(payload.text, /Can you beat my time/);
    assert.equal(payload.url, 'https://www.playblinkstop.com/#challenge=BS1-C-0-12340');
    assert.doesNotMatch(JSON.stringify(payload), /vercel\.app|github\.com/);
    assert.equal(parseChallenge(payload.text).score, 12.34);
    assert.match(shareClipboardText(2.5), /2\.50s/);
});
test('Precision sharing identifies error, elapsed time and target instead of calling error survival', () => {
    const r = { mode: 'PRECISION', score: .085, elapsed: 9.915, target: 10 };
    assert.match(sharePayload(r).text, /Precision: 0\.085s off.*Target 10s · blinked at 9\.91s/);
    assert.deepEqual(parseChallenge(challengeCode(r)), { mode: 'PRECISION', score: .085, target: 10 });
});
test('challenge comparison handles lower Precision error, higher survival, ties and target mismatch', () => {
    assert.match(challengeOutcome({ mode: 'PRECISION', score: .1, target: 5 }, { mode: 'PRECISION', score: .2, target: 5 }), /BEATEN/);
    assert.equal(challengeOutcome({ mode: 'PRECISION', score: .1, target: 10 }, { mode: 'PRECISION', score: .2, target: 5 }), '');
    assert.match(challengeOutcome({ mode: 'CLASSIC', score: 4 }, { mode: 'CLASSIC', score: 5 }), /FRIEND TAKES/);
    assert.match(challengeOutcome({ mode: 'SURPRISE', score: 30 }, { mode: 'SURPRISE', score: 30 }), /TIE/);
});
test('codes reject invalid targets, over-limit scores, ambiguous and oversized input', () => {
    for (const input of ['BS1-P-0-1', 'BS1-C-10-100', 'BS1-E-0-30001', 'BS1-S-0-99999999', 'BS1-C-0-86400001', 'BS1-C-0-1 BS1-P-5-2', '<script>alert(1)</script>', 'x'.repeat(1001)]) {
        assert.throws(() => parseChallenge(input), undefined, input);
    }
    assert.equal(parseChallenge('bs1-c-0-0').score, 0);
    assert.equal(challengeCode({ mode: 'DAILY', score: 12, elapsed: 12 }), null);
});

test('a repeated code in a caption and link is one challenge, while distinct challenges are rejected', () => {
    assert.equal(parseChallenge('BS1-C-0-12340 https://www.playblinkstop.com/#challenge=BS1-C-0-12340').score, 12.34);
    assert.throws(() => parseChallenge('BS1-C-0-12340 https://www.playblinkstop.com/#challenge=BS1-C-0-56780'));
    const daily = sharePayload({ mode: 'DAILY', score: 5, elapsed: 5 });
    assert.equal(daily.url, 'https://www.playblinkstop.com/');
});

test('challenge links carry the skin, open on the score to beat, and brag in the skin', async () => {
    const { challengeUrl, parseChallengeLink, challengeHeadline, inviteLine, skinPersona } = await import('../src/share.mjs');
    const turkey = { mode: 'CLASSIC', score: 14, elapsed: 14 };
    assert.equal(challengeUrl(turkey, 'THANKSGIVING'), 'https://www.playblinkstop.com/#challenge=BS1-C-0-14000&skin=thanksgiving');
    assert.equal(challengeUrl(turkey, 'CLASSIC'), 'https://www.playblinkstop.com/#challenge=BS1-C-0-14000');
    assert.equal(challengeUrl({ mode: 'DAILY', score: 5, elapsed: 5 }, 'PARTY'), 'https://www.playblinkstop.com/');
    assert.equal(challengeUrl(null, 'PARTY'), 'https://www.playblinkstop.com/');

    const link = parseChallengeLink('#challenge=BS1-C-0-14000&skin=thanksgiving');
    assert.deepEqual(link, { code: 'BS1-C-0-14000', skin: 'THANKSGIVING', challenge: { mode: 'CLASSIC', score: 14, target: 0 } });
    assert.equal(parseChallengeLink('#challenge=BS1-C-0-14000&skin=<script>').skin, null, 'unknown skins are ignored');
    assert.equal(parseChallengeLink('#challenge=BS1-C-0-14000').skin, null);
    assert.equal(parseChallengeLink('#other'), null);
    assert.throws(() => parseChallengeLink('#challenge=garbage&skin=party'));

    assert.equal(inviteLine(turkey, 'THANKSGIVING'), 'I kept my eyes open for 14.00s as a turkey 🦃 Can you beat me?');
    assert.equal(inviteLine(turkey), 'I kept my eyes open for 14.00s 👀 Can you beat me?');
    assert.match(inviteLine({ mode: 'BALLOON', score: 7, elapsed: 30 }, 'CHRISTMAS'), /^I popped 7 balloons just by blinking, in a Santa hat 🎅/);
    assert.match(inviteLine({ mode: 'PRECISION', score: 0.05, elapsed: 9.95, target: 10 }, 'PARTY'), /0\.050s off the 10-second mark in a party hat 🎉/);
    assert.equal(skinPersona('CLASSIC'), '');

    assert.deepEqual(challengeHeadline({ mode: 'CLASSIC', score: 14 }, 'THANKSGIVING'), { title: 'Beat 14.00s', line: 'Your friend kept their eyes open for 14.00s in Endurance as a turkey 🦃. Your turn.' });
    assert.equal(challengeHeadline({ mode: 'PRECISION', score: 0.05, target: 10 }, 'CLASSIC').title, 'Beat 0.050s off 10s');
    assert.equal(challengeHeadline({ mode: 'BALLOON', score: 7 }).title, 'Pop more than 7');

    const payload = sharePayload(turkey, 'THANKSGIVING');
    assert.match(payload.text, /^I kept my eyes open for 14\.00s as a turkey/);
    assert.equal(payload.url, 'https://www.playblinkstop.com/#challenge=BS1-C-0-14000&skin=thanksgiving');
    assert.equal(parseChallenge(payload.text).score, 14, 'the caption still pastes as one challenge');
});
