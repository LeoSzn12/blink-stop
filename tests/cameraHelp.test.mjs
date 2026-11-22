import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraErrorMessage, graphicsAvailable, noGraphicsError } from '../src/cameraHelp.mjs';

test('denied camera gives platform-neutral recovery instructions', () => {
    const message = cameraErrorMessage({ name: 'NotAllowedError' });
    assert.match(message, /camera permission/i);
    assert.match(message, /device or site settings/i);
    assert.doesNotMatch(message, /Safari|AA|refresh/i);
});

test('camera missing or occupied has distinct actionable recovery', () => {
    assert.match(cameraErrorMessage({ name: 'NotFoundError' }), /camera found/i);
    assert.match(cameraErrorMessage({ name: 'NotReadableError' }), /another app/i);
});

test('a browser without WebGL gets a plain message, not a raw alert', () => {
    const doc = context => ({ createElement: () => ({ getContext: name => (context === name ? {} : null) }) });
    assert.equal(graphicsAvailable(doc(null)), false);
    assert.equal(graphicsAvailable(doc('webgl')), true);
    assert.equal(graphicsAvailable(doc('webgl2')), true);
    assert.equal(graphicsAvailable({ createElement: () => { throw new Error('no canvas'); } }), false);
    const message = cameraErrorMessage(noGraphicsError());
    assert.match(message, /graphics turned off/i);
    assert.doesNotMatch(message, /WebGL|canvas/i);
});
