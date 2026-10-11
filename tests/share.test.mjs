import test from 'node:test';
import assert from 'node:assert/strict';
import { sharePayload, shareClipboardText, challengeCode, parseChallenge, challengeOutcome } from '../src/share.mjs';

test('share invitation includes mode and portable challenge but no stale public URL', () => {
    const payload = sharePayload({ mode: 'CLASSIC', score: 12.34, elapsed: 12.34 });
    assert.equal(payload.title, 'Blink Stop');
    assert.match(payload.text, /Classic: 12\.34s/);
    assert.match(payload.text, /Can you beat my time/);
    assert.equal('url' in payload, false);
    assert.doesNotMatch(JSON.stringify(payload), /https?:\/\//);
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
