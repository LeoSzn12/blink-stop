import test from 'node:test';
import assert from 'node:assert/strict';
import { sharePayload, shareClipboardText } from '../src/share.mjs';

test('score share has no stale game link or invitation until public candidate is aligned', () => {
    const payload = sharePayload(12.34);
    assert.equal(payload.title, 'Blink Stop');
    assert.match(payload.text, /12\.34s/);
    assert.doesNotMatch(JSON.stringify(payload), /https?:\/\/|play.*now|beat my high score/i);
    assert.equal('url' in payload, false);
});

test('clipboard fallback copies only the score, never stale live build', () => {
    assert.match(shareClipboardText(2.5), /2\.50s/);
    assert.doesNotMatch(shareClipboardText(2.5), /https?:\/\/|play.*now/i);
});
