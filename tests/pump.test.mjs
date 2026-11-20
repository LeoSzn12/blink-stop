import test from 'node:test';
import assert from 'node:assert/strict';
import { pumpDollars, pumpMiss, formatDollars, PUMP_TARGET } from '../src/pump.mjs';
import { challengeCode, parseChallenge, formatScore, inviteLine, challengeOutcome, challengeHeadline, LOWER_WINS } from '../src/share.mjs';
import { selfieCaption } from '../src/skins.mjs';

test('the pump counts steadily to $8, then speeds up toward $10', () => {
    assert.equal(pumpDollars(0), 0);
    assert.equal(pumpDollars(-1), 0);
    assert.equal(pumpDollars(NaN), 0);
    assert.equal(pumpDollars(4), 5);
    assert.equal(pumpDollars(6.4), 8);
    const rate = (a, b) => (pumpDollars(b) - pumpDollars(a)) / (b - a);
    assert.ok(rate(7.4, 7.6) > rate(2, 4) * 1.4, 'faster near $10 than at the start');
    assert.ok(pumpDollars(7.6) < PUMP_TARGET && pumpDollars(7.7) > PUMP_TARGET, '$10 lands at about 7.65 seconds');
    for (let t = 0; t < 12; t += 0.013) assert.ok(pumpDollars(t + 0.013) >= pumpDollars(t), 'never runs backwards');
});

test('the miss is whole cents off $10.00, either side', () => {
    assert.equal(pumpMiss(0), 10);
    assert.equal(pumpMiss(6.4), 2);
    assert.equal(pumpMiss(7.65), Math.round(Math.abs(pumpDollars(7.65) - 10) * 100) / 100);
    assert.equal(formatDollars(9.5), '$9.50');
    assert.equal(formatScore('PUMP', 0.03), '$0.03 off');
});

test('a Gas Pump result travels as a friend challenge and smaller misses win', () => {
    assert.ok(LOWER_WINS.includes('PUMP'));
    const code = challengeCode({ mode: 'PUMP', score: 0.07 });
    assert.equal(code, 'BS1-G-0-70');
    assert.deepEqual(parseChallenge(`Beat me ${code}`), { mode: 'PUMP', score: 0.07, target: 0 });
    assert.throws(() => parseChallenge('BS1-G-10-70'), /target/);
    assert.equal(challengeOutcome({ mode: 'PUMP', score: 0.02 }, { mode: 'PUMP', score: 0.07 }), 'CHALLENGE BEATEN! Your friend is up next.');
    assert.match(challengeHeadline({ mode: 'PUMP', score: 0.07 }).line, /gas pump \$0\.07 off \$10\.00/);
    assert.match(inviteLine({ mode: 'PUMP', score: 0.07 }, 'CLASSIC'), /\$0\.07 off \$10\.00/);
    assert.match(inviteLine({ mode: 'PUMP', score: 0 }, 'CLASSIC'), /exactly \$10\.00/);
});

test('the shared photo names the pump amount', () => {
    assert.equal(selfieCaption({ reason: 'BLINK', mode: 'PUMP', elapsed: 6.4, score: 2 }).headline, '$8.00 AT THE PUMP');
    assert.equal(selfieCaption({ reason: 'BLINK', mode: 'PUMP', elapsed: 7.65, score: 0 }).headline, 'EXACTLY $10.00!');
    assert.equal(selfieCaption({ reason: 'DISQUALIFIED', mode: 'PUMP', elapsed: 3, score: 0 }).headline, 'FACE LOST!');
});

test('haptics use the phone engine in the app, vibration on the web, and the toggle turns both off', async () => {
    const { createHaptics, HAPTIC_PATTERNS } = await import('../src/feedback.mjs');
    const calls = [];
    const native = { Haptics: { impact: o => calls.push(['impact', o.style]), notification: o => calls.push(['notify', o.type]) }, ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: { Success: 'SUCCESS', Error: 'ERROR', Warning: 'WARNING' } };
    const app = createHaptics({ win: { Capacitor: { isNativePlatform: () => true } }, nav: {}, load: async () => native });
    await new Promise(resolve => setTimeout(resolve, 0));
    app.fire('pop'); app.fire('win'); app.fire('fail');
    assert.deepEqual(calls, [['impact', 'MEDIUM'], ['notify', 'SUCCESS'], ['notify', 'ERROR']]);
    app.enabled = false;
    assert.equal(app.fire('pop'), false);
    assert.equal(calls.length, 3);

    const buzzes = [];
    const web = createHaptics({ win: {}, nav: { vibrate: p => { buzzes.push(p); return true; } } });
    assert.equal(web.fire('pop'), true);
    assert.deepEqual(buzzes, [HAPTIC_PATTERNS.pop]);
    // iPhone Safari has no vibrate: nothing happens and nothing throws.
    assert.equal(createHaptics({ win: {}, nav: {} }).fire('pop'), false);
});
