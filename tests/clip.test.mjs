import test from 'node:test';
import assert from 'node:assert/strict';
import { createClipBuffer, pickClipType, clipSupported, clipExtension, encodeClip, drawClipFrame, CLIP_BEFORE_MS, CLIP_AFTER_MS } from '../src/clip.mjs';
import { exportNativeClip } from '../src/deviceActions.mjs';

// A 2D context that records calls and returns itself for anything else.
function fakeContext(calls = []) {
    const ctx = new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : (...args) => { calls.push([key, ...args]); return ctx; }),
        set: (target, key, value) => { target[key] = value; return true; },
    });
    return ctx;
}
function fakeCanvas(calls) {
    const ctx = fakeContext(calls);
    return { width: 0, height: 0, style: {}, getContext: () => ctx, setAttribute() {}, remove() { this.removed = true; }, captureStream: () => ({ getTracks: () => [{ stop() {} }] }) };
}
const source = { width: 640, height: 480 };

test('the buffer keeps only the last few seconds, throttled, and frames are small and mirrored', () => {
    const calls = [];
    const made = [];
    const buffer = createClipBuffer({ makeCanvas: () => { const c = fakeCanvas(calls); made.push(c); return c; } });
    for (let t = 0; t <= 10000; t += 20) buffer.push(source, t); // 50 fps in
    const span = buffer.frames.at(-1).t - buffer.frames[0].t;
    assert.ok(span <= CLIP_BEFORE_MS, `kept ${span} ms`);
    assert.ok(buffer.frames.length <= 40 && buffer.frames.length >= 30, `kept ${buffer.frames.length} frames`);
    assert.ok(made.length <= 41, 'old frames are recycled, not reallocated');
    assert.equal(buffer.frames[0].canvas.width, 400);
    assert.equal(buffer.frames[0].canvas.height, 300);
    assert.ok(calls.some(([key, a, , , , e]) => key === 'setTransform' && a === -1 && e === 400), 'drawn mirrored like the preview');
    assert.equal(buffer.push({ width: 0, height: 0 }, 20000), false);
});

test('a blink pins the window; frames keep coming briefly, then the clip is ready', () => {
    const buffer = createClipBuffer({ makeCanvas: () => fakeCanvas() });
    assert.equal(buffer.mark(0, 1), false, 'nothing to clip yet');
    for (let t = 0; t <= 5000; t += 50) buffer.push(source, t);
    assert.equal(buffer.mark(5000, 14.2), true);
    assert.equal(buffer.mark(5100, 15), false, 'one blink per clip');
    assert.equal(buffer.waiting, true);
    for (let t = 5050; t < 5000 + CLIP_AFTER_MS; t += 50) buffer.push(source, t);
    assert.equal(buffer.ready, false);
    buffer.push(source, 5000 + CLIP_AFTER_MS);
    assert.equal(buffer.ready, true);
    assert.equal(buffer.push(source, 6000), false, 'frozen once ready');
    assert.equal(buffer.blinkSeconds, 14.2);
    assert.ok(buffer.frames[0].t >= 5000 - CLIP_BEFORE_MS);
    buffer.reset();
    assert.equal(buffer.frames.length, 0);
    assert.equal(buffer.blinkAt, null);
    // If the camera stops early, finish() uses what is there.
    buffer.push(source, 100); buffer.mark(100, 1);
    assert.equal(buffer.finish(), true);
});

test('MP4 is preferred; no recorder or captureStream means no clip button', () => {
    assert.equal(pickClipType({ isTypeSupported: type => type.startsWith('video/') }), 'video/mp4;codecs=avc1');
    assert.equal(pickClipType({ isTypeSupported: type => type === 'video/webm;codecs=vp8' }), 'video/webm;codecs=vp8');
    assert.equal(pickClipType({ isTypeSupported: () => { throw new Error('old'); } }), '');
    assert.equal(pickClipType(undefined), '');
    function Canvas() {}
    Canvas.prototype.captureStream = () => ({});
    const Recorder = function () {};
    Recorder.isTypeSupported = type => type === 'video/mp4';
    assert.equal(clipSupported({ MediaRecorder: Recorder, HTMLCanvasElement: Canvas }), true);
    assert.equal(clipSupported({ HTMLCanvasElement: Canvas }), false);
    assert.equal(clipSupported({ MediaRecorder: Recorder, HTMLCanvasElement: function () {} }), false);
    assert.equal(clipExtension('video/mp4'), 'mp4');
    assert.equal(clipExtension('video/webm'), 'webm');
});

test('encoding replays every frame, holds on the blink, and returns a video', async () => {
    const buffer = createClipBuffer({ makeCanvas: () => fakeCanvas() });
    for (let t = 0; t <= 3000; t += 67) buffer.push(source, t);
    buffer.mark(3000, 9.5);
    for (let t = 3067; t <= 4600; t += 67) buffer.push(source, t);
    assert.equal(buffer.ready, true);
    const drawCalls = [];
    const out = fakeCanvas(drawCalls);
    const appended = [];
    const doc = { createElement: () => out, body: { appendChild: el => appended.push(el) } };
    let recorder;
    class Recorder {
        constructor(stream, options) { this.options = options; recorder = this; }
        start(slice) { this.slice = slice; }
        stop() { this.ondataavailable({ data: new Blob(['abc']) }); this.ondataavailable({ data: new Blob([]) }); this.onstop(); }
    }
    const waits = [];
    const blob = await encodeClip(buffer, { skinId: 'THANKSGIVING', caption: { headline: 'CAUGHT BLINKING!', detail: 'Lasted 9.50s' }, doc, Recorder, type: 'video/mp4', wait: async ms => { waits.push(ms); } });
    assert.equal(blob.type, 'video/mp4');
    assert.equal(blob.size, 3);
    assert.equal(recorder.options.mimeType, 'video/mp4');
    assert.equal(appended.length, 1);
    assert.equal(out.removed, true, 'the helper canvas leaves the page');
    assert.ok(waits.length > buffer.frames.length, 'frames, then a hold on the blink');
    const texts = drawCalls.filter(([key]) => key === 'fillText').map(([, text]) => text);
    assert.ok(texts.includes("DON'T BLINK..."));
    assert.ok(texts.includes('BLINK!'));
    assert.ok(texts.includes('CAUGHT BLINKING!'));
    assert.ok(texts.includes('9.50s'));
    assert.ok(texts.some(text => /^[0-9.]+s$/.test(text) && Number.parseFloat(text) < 9.5), 'time ticks up before the blink');
    await assert.rejects(encodeClip(createClipBuffer({ makeCanvas: () => fakeCanvas() }), { doc, Recorder, type: 'video/mp4' }), /No clip/);
    await assert.rejects(encodeClip(buffer, { doc, Recorder, type: '' }), /not available/);
    // A new round cancels the encode: the recorder stops and the helper canvas goes.
    const out2 = fakeCanvas();
    const doc2 = { createElement: () => out2, body: { appendChild() {} } };
    let frames = 0, stops = 0;
    class Recorder2 extends Recorder { stop() { stops++; super.stop(); } }
    await assert.rejects(encodeClip(buffer, { doc: doc2, Recorder: Recorder2, type: 'video/mp4', wait: async () => { frames++; }, cancelled: () => frames >= 3 }), /cancelled/);
    assert.equal(frames, 3);
    assert.equal(stops, 1);
    assert.equal(out2.removed, true);
});

test('every skin draws a clip frame without throwing', () => {
    for (const skinId of ['CLASSIC', 'THANKSGIVING', 'CHRISTMAS', 'PARTY', 'NOPE']) {
        drawClipFrame(fakeContext(), { width: 300, height: 400 }, { skinId, seconds: 3, blinked: true, stamp: true, caption: { headline: 'X', detail: 'Y' } });
        drawClipFrame(fakeContext(), null, { skinId, seconds: NaN, blinked: false });
    }
});

test('the app shares one cached clip file and only accepts its own video', async () => {
    const writes = [], shares = [], deletes = [];
    const load = async () => ({
        Directory: { Cache: 'CACHE' },
        Filesystem: { writeFile: async file => { writes.push(file); return { uri: 'file:///cache/clip.mp4' }; }, deleteFile: async file => { deletes.push(file); } },
        Share: { share: async options => { shares.push(options); } },
    });
    const blob = new Blob(['abc'], { type: 'video/mp4' });
    await exportNativeClip(blob, 'blink-stop-clip.mp4', 'I kept my eyes open', load, async () => 'YWJj');
    assert.deepEqual(writes, [{ path: 'blink-stop-clip.mp4', directory: 'CACHE', data: 'YWJj' }]);
    assert.deepEqual(shares[0].files, ['file:///cache/clip.mp4']);
    assert.equal(shares[0].text, 'I kept my eyes open');
    await assert.rejects(exportNativeClip(new Blob(['x'], { type: 'text/html' }), 'blink-stop-clip.mp4', '', load), /unavailable/);
    await assert.rejects(exportNativeClip(blob, '../evil.mp4', '', load), /unavailable/);
    const failing = async () => ({ ...(await load()), Share: { share: async () => { throw new Error('cancelled'); } } });
    await assert.rejects(exportNativeClip(blob, 'blink-stop-clip.mp4', '', failing, async () => 'YWJj'), /cancelled/);
    assert.equal(deletes.length, 1, 'a cancelled share cleans up its file');
});
