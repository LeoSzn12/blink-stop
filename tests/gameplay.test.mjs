import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlinkDetector, createFaceLossTracker } from '../src/gameRules.mjs';
import { createSerializedInference } from '../src/inference.mjs';
import { appendScore } from '../src/leaderboard.mjs';

test('a wink sustained across dropped frames counts by elapsed time, not samples', () => {
    const blink = createBlinkDetector(0.22);
    assert.equal(blink.observe(0.1, 1000), false);
    assert.equal(blink.observe(0.1, 1050), false);
    assert.equal(blink.observe(0.1, 1070), true);
    assert.equal(blink.observe(0.3, 1100), false);
    assert.equal(blink.observe(0.1, 1200), false);
    blink.reset();
    assert.equal(blink.observe(0.1, 1300), false);
});

test('face loss expires by elapsed time and resets on reacquisition or retry', () => {
    const loss = createFaceLossTracker();
    assert.equal(loss.observe(false, 1000), false);
    assert.equal(loss.observe(false, 1950), false);
    assert.equal(loss.observe(false, 2000), true);
    assert.equal(loss.observe(true, 2050), false);
    assert.equal(loss.observe(false, 3000), false);
    loss.reset();
    assert.equal(loss.observe(false, 5000), false);
});

test('timeout never admits overlapping inference; settling re-enables it', async () => {
    let resolveSend;
    let calls = 0;
    const inference = createSerializedInference(() => {
        calls++;
        return new Promise(resolve => { resolveSend = resolve; });
    }, () => {});
    const first = inference.send('frame');
    assert.equal(inference.send('next'), false);
    assert.equal(calls, 1);
    resolveSend();
    await first;
    assert.equal(inference.send('third') instanceof Promise, true);
    assert.equal(calls, 2);
    resolveSend();
    await Promise.resolve();
});

test('timeout reports a stalled call but does not unlock until send settles', async () => {
    let resolveSend;
    let timeout;
    const warnings = [];
    const inference = createSerializedInference(() => new Promise(resolve => { resolveSend = resolve; }),
        warning => warnings.push(warning), 80,
        fn => { timeout = fn; return 1; }, () => {});
    const first = inference.send('frame');
    timeout();
    assert.deepEqual(warnings, ['FaceMesh inference exceeded 80ms']);
    assert.equal(inference.send('other'), false);
    resolveSend();
    await first;
    assert.equal(inference.send('now free') instanceof Promise, true);
    resolveSend();
});

test('leaderboard player names are text, never HTML', () => {
    const children = [];
    const document = { createElement: tag => ({ tag, textContent: '', children: [], append(...nodes) { this.children.push(...nodes); } }) };
    const list = { appendChild: node => children.push(node) };
    appendScore(list, { name: '<img src=x onerror=alert(1)>', score: 1.25 }, 0, 'CLASSIC', document);
    assert.equal(children[0].children[0].textContent, '#1 <img src=x onerror=alert(1)>');
    assert.equal(children[0].children[1].textContent, '1.25s');
    assert.equal(children[0].innerHTML, undefined);
});
