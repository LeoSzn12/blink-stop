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

test('eyes only a little narrower than open do not count', () => {
    const tap = createTapBlink();
    // Open eye about 0.3; the close line is 0.2475.
    assert.equal(tap.observe({ minEar: 0.26, ear: 0.27 }, T), false);
});

test('either eye closing counts, so no real blink is missed', () => {
    const tap = createTapBlink();
    assert.equal(tap.observe({ minEar: 0.17, ear: 0.235 }, T), true);
});

test('both eyes clearly closing in one frame counts', () => {
    const tap = createTapBlink();
    assert.equal(tap.observe({ minEar: 0.2, ear: 0.21 }, T), true);
});

test('holding the eyes shut pops only once', () => {
    const tap = createTapBlink();
    assert.equal(tap.observe({ minEar: 0.1 }, T), true);
    for (let i = 0; i < 5; i++) assert.equal(tap.observe({ minEar: 0.1, blinking: true }, T), false);
});

test('the eye has to open properly before the next blink counts', () => {
    const tap = createTapBlink();
    assert.equal(tap.observe({ minEar: 0.2 }, T), true);
    assert.equal(tap.observe({ minEar: 0.255 }, T), false); // between the lines: still closed
    assert.equal(tap.observe({ minEar: 0.2 }, T), false);
    assert.equal(tap.observe({ minEar: 0.27 }, T), false); // properly open
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
