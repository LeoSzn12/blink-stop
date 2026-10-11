import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraErrorMessage } from '../src/cameraHelp.mjs';

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
