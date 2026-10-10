import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurpriseRound, createRewardedDemo } from '../src/surprise.mjs';

test('Surprise presents one short interruption, then completes at 30 seconds', () => {
    const round = createSurpriseRound(() => 0);
    assert.deepEqual(round.observe(14999), { active: false, triggered: false, complete: false });
    assert.deepEqual(round.observe(15000), { active: true, triggered: true, complete: false });
    assert.equal(round.observe(15100).triggered, false);
    assert.equal(round.observe(15700).active, false);
    assert.deepEqual(round.observe(30000), { active: false, triggered: false, complete: true });
});
test('timing varies within bounds and a delayed frame never replays an old interruption', () => {
    const late = createSurpriseRound(() => 1);
    assert.equal(late.observe(23999).active, false);
    assert.equal(late.observe(24000).triggered, true);
    const skipped = createSurpriseRound(() => 0);
    assert.equal(skipped.observe(22000).active, false);
    assert.equal(skipped.observe(30000).complete, true);
});
test('a fresh retry has its own event, without inheriting the previous delivery', () => {
    const first = createSurpriseRound(() => 0);
    first.observe(15000);
    assert.equal(createSurpriseRound(() => 0).observe(15000).triggered, true);
});
test('demo reward requires visible completion and can only be claimed once', () => {
    const demo = createRewardedDemo(100);
    assert.equal(demo.claim(5099), false);
    assert.equal(demo.observe(5100).complete, true);
    assert.equal(demo.claim(5100), true);
    assert.equal(demo.claim(6000), false);
});
test('a skipped or backgrounded demo never awards its theme later', () => {
    const demo = createRewardedDemo(100);
    demo.cancel();
    assert.equal(demo.observe(10000).complete, false);
    assert.equal(demo.claim(10000), false);
});
