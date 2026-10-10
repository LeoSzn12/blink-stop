import test from 'node:test';
import assert from 'node:assert/strict';
import { exportNativeSelfie, shareNativeScore } from '../src/deviceActions.mjs';
import { clearStoredGameData } from '../src/localData.mjs';

test('native export writes only user-selected JPEG into private cache and shares its URI', async () => {
    const calls = [];
    const load = async () => ({ Directory: { Cache: 'CACHE' },
        Filesystem: { writeFile: async options => { calls.push(options); return { uri: 'file:///cache/blink-stop-selfie.jpg' }; } },
        Share: { share: async options => calls.push(options) } });
    await exportNativeSelfie('data:image/jpeg;base64,YWJj', load);
    assert.deepEqual(calls[0], { path: 'blink-stop-selfie.jpg', directory: 'CACHE', data: 'YWJj' });
    assert.deepEqual(calls[1].files, ['file:///cache/blink-stop-selfie.jpg']);
    assert.equal('url' in calls[1], false);
    assert.equal('text' in calls[1], false);
});
test('cancelled native export removes temporary file and propagates cancellation', async () => {
    let removed;
    const load = async () => ({ Directory: { Cache: 'CACHE' },
        Filesystem: { writeFile: async () => ({ uri: 'file:///cache/selfie.jpg' }), deleteFile: async options => { removed = options; } },
        Share: { share: async () => { throw new Error('cancelled'); } } });
    await assert.rejects(exportNativeSelfie('data:image/jpeg;base64,YWJj', load), /cancelled/);
    assert.equal(removed.directory, 'CACHE');
});
test('invalid selfie does not load a plugin or touch storage', async () => {
    await assert.rejects(exportNativeSelfie('https://example.com/photo.jpg', () => { throw new Error('should not load'); }), /unavailable/);
});
test('native score share includes only supplied result, never camera data', async () => {
    let result;
    await shareNativeScore({ title: 'Blink Stop', text: '12.00s' }, async () => ({ Share: { share: async options => { result = options; } } }));
    assert.equal(result.text, '12.00s');
    assert.equal('files' in result, false);
});
test('clear data removes game-owned keys without deleting unrelated storage', () => {
    const data = new Map([['blink_lb_CLASSIC', 'scores'], ['blink_theme_purple', 'true'], ['another-app', 'keep']]);
    clearStoredGameData({ removeItem: key => data.delete(key) });
    assert.deepEqual([...data], [['another-app', 'keep']]);
});
