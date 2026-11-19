import test from 'node:test';
import assert from 'node:assert/strict';
import { createTapBlink } from '../src/gameRules.mjs';

const T = 0.225;

test('a blink seen in a single frame counts once', () => {
    const tap = createTapBlink();
    assert.equal(tap.observe({ minEar: 0.3 }, T), false);
    assert.equal(tap.observe({ minEar: 0.22 }, T), true);
    assert.equal(tap.observe({ minEar: 0.3 }, T), false);
});

test('a partly closed eye just above the strict line still counts', () => {
    const tap = createTapBlink();
    assert.equal(tap.observe({ minEar: 0.245 }, T), true);
});

test('holding the eyes shut pops only once', () => {
    const tap = createTapBlink();
    assert.equal(tap.observe({ minEar: 0.1 }, T), true);
    for (let i = 0; i < 5; i++) assert.equal(tap.observe({ minEar: 0.1, blinking: true }, T), false);
});

test('the eye has to open properly before the next blink counts', () => {
    const tap = createTapBlink();
    assert.equal(tap.observe({ minEar: 0.2 }, T), true);
    assert.equal(tap.observe({ minEar: 0.26 }, T), false); // between the lines: still closed
    assert.equal(tap.observe({ minEar: 0.2 }, T), false);
    assert.equal(tap.observe({ minEar: 0.29 }, T), false); // properly open
    assert.equal(tap.observe({ minEar: 0.2 }, T), true);
});

test('the detector flag alone counts as a blink', () => {
    const tap = createTapBlink();
    assert.equal(tap.observe({ minEar: 0.3, blinking: true }, T), true);
});

test('bad readings never count and reset clears a held blink', () => {
    const tap = createTapBlink();
    assert.equal(tap.observe(null, T), false);
    assert.equal(tap.observe({ minEar: NaN }, T), false);
    assert.equal(tap.observe({ minEar: 0.1 }, 0), false);
    assert.equal(tap.observe({ minEar: 0.1 }, T), true);
    tap.reset();
    assert.equal(tap.closed, false);
    assert.equal(tap.observe({ minEar: 0.1 }, T), true);
});
