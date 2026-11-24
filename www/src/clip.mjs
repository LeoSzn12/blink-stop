// Blink clip: the last few seconds of the camera view (hats included) around the blink,
// turned into a short portrait video on this phone. Frames are small copies kept in
// memory during a round and dropped after it; the video is made on the device and only
// leaves it if the player chooses Share Clip. Nothing is uploaded.
import { SKINS, drawBrandLockup, brandBanner, brandFooter } from './skins.mjs';

export const CLIP_BEFORE_MS = 2500;
// Long enough after the blink to catch the reaction (the laugh is the funny part).
export const CLIP_AFTER_MS = 1500;
export const CLIP_FPS = 15;
export const CLIP_HOLD_MS = 1200;
export const CLIP_WIDTH = 540;
export const CLIP_HEIGHT = 960;

const CLIP_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

// MP4 first: it is what Instagram, TikTok and the iPhone camera roll take most happily.
export function pickClipType(Recorder) {
    if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return '';
    return CLIP_TYPES.find(type => { try { return Recorder.isTypeSupported(type); } catch { return false; } }) || '';
}

export function clipSupported(win = globalThis) {
    const proto = win.HTMLCanvasElement?.prototype;
    return typeof win.MediaRecorder === 'function' && typeof proto?.captureStream === 'function' && pickClipType(win.MediaRecorder) !== '';
}

export function clipExtension(type) {
    return type.startsWith('video/mp4') ? 'mp4' : 'webm';
}

// Rolling window of small mirrored frames. push() is cheap (one scaled drawImage) and
// is throttled to CLIP_FPS. mark() pins the blink; frames keep coming for CLIP_AFTER_MS.
export function createClipBuffer({ makeCanvas, before = CLIP_BEFORE_MS, after = CLIP_AFTER_MS, fps = CLIP_FPS, maxSide = 400 } = {}) {
    const frames = [], pool = [];
    let lastAt = -Infinity, blinkAt = null, blinkSeconds = 0, ready = false;
    const minGap = 1000 / fps - 3;

    function recycle(frame) { pool.push(frame.canvas); }

    return {
        get frames() { return frames; },
        get blinkAt() { return blinkAt; },
        get blinkSeconds() { return blinkSeconds; },
        get ready() { return ready; },
        get waiting() { return blinkAt !== null && !ready; },
        // mirror: camera frames are flipped to match the selfie view; a frame that is
        // already composed as the player saw it (Balloon Pop) passes mirror: false.
        push(source, now, { mirror = true } = {}) {
            if (ready || !source || !(source.width > 0) || !(source.height > 0)) return false;
            if (now - lastAt < minGap) return false;
            lastAt = now;
            if (blinkAt === null) while (frames.length && frames[0].t < now - before) recycle(frames.shift());
            const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
            const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
            const canvas = pool.pop() || makeCanvas();
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (mirror) ctx.setTransform(-1, 0, 0, 1, w, 0); // mirrored, matching what the player saw
            ctx.drawImage(source, 0, 0, w, h);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            frames.push({ canvas, t: now });
            if (blinkAt !== null && now >= blinkAt + after) ready = true;
            return true;
        },
        // seconds: the round time at the blink, so each frame can show its own time.
        mark(now, seconds = 0) {
            if (blinkAt !== null || !frames.length) return false;
            blinkAt = now;
            blinkSeconds = seconds;
            return true;
        },
        // If the camera stops before the after-blink frames arrive, use what we have.
        finish() {
            if (blinkAt !== null && frames.length) ready = true;
            return ready;
        },
        reset() {
            frames.splice(0).forEach(recycle);
            lastAt = -Infinity; blinkAt = null; blinkSeconds = 0; ready = false;
        },
        // Frees the memory entirely (between rounds the pool can be dropped).
        clear() {
            frames.length = 0; pool.length = 0;
            lastAt = -Infinity; blinkAt = null; blinkSeconds = 0; ready = false;
        },
    };
}

// One frame of the finished clip: the Blink Stop logo, holiday frame, the camera view,
// a ticking time, and a BLINK! stamp from the blink onwards.
export function drawClipFrame(ctx, frame, { skinId, seconds, blinked, stamp, caption, logo = null, width = CLIP_WIDTH, height = CLIP_HEIGHT }) {
    const skin = SKINS[skinId] || SKINS.CLASSIC, c = skin.colors;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, c.bgTop); gradient.addColorStop(1, c.bgBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const px = 30, py = 120, pw = width - 60, ph = Math.round((width - 60) * 4 / 3);
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
    ctx.fillStyle = '#000'; ctx.fillRect(px, py, pw, ph);
    if (frame && frame.width > 0 && frame.height > 0) {
        const scale = Math.max(pw / frame.width, ph / frame.height);
        const cw = pw / scale, ch = ph / scale;
        ctx.drawImage(frame, (frame.width - cw) / 2, (frame.height - ch) / 2, cw, ch, px, py, pw, ph);
    }
    if (blinked) { ctx.fillStyle = 'rgba(255, 0, 0, 0.18)'; ctx.fillRect(px, py, pw, ph); }
    ctx.restore();
    ctx.lineWidth = 6; ctx.strokeStyle = c.primary; ctx.strokeRect(px, py, pw, ph);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const font = size => `bold ${size}px system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
    drawBrandLockup(ctx, logo, { x: width / 2, y: 40, size: 50, color: c.text });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = c.primary; ctx.font = font(24);
    ctx.fillText(brandBanner(skin.id), width / 2, 94, width - 40);

    // Ticking round time over the top of the picture.
    if (Number.isFinite(seconds)) {
        ctx.font = font(48);
        ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        const label = caption?.timeLabel ? caption.timeLabel(seconds) : `${Math.max(0, seconds).toFixed(2)}s`;
        ctx.strokeText(label, width / 2, py + 44);
        ctx.fillStyle = blinked ? '#ff4d4d' : '#ffffff';
        ctx.fillText(label, width / 2, py + 44);
    }
    if (blinked) {
        ctx.save();
        ctx.translate(width / 2, py + ph * 0.78);
        ctx.rotate(-0.08);
        ctx.scale(stamp ? 1.1 : 1, stamp ? 1.1 : 1);
        ctx.font = font(96);
        ctx.lineWidth = 12; ctx.strokeStyle = '#000';
        const stampText = caption?.stamp || 'BLINK!';
        ctx.strokeText(stampText, 0, 0, width - 60);
        ctx.fillStyle = c.secondary; ctx.fillText(stampText, 0, 0, width - 60);
        ctx.restore();
    }

    const below = py + ph;
    ctx.fillStyle = c.text; ctx.font = font(40);
    ctx.fillText(blinked ? (caption?.headline || 'CAUGHT BLINKING!') : (caption?.before || "DON'T BLINK..."), width / 2, below + 56, width - 40);
    ctx.fillStyle = c.muted; ctx.font = font(24);
    if (blinked && caption?.detail) ctx.fillText(caption.detail, width / 2, below + 104, width - 40);
    ctx.fillStyle = c.secondary; ctx.font = font(22);
    ctx.fillText(brandFooter(skin.id), width / 2, height - 34, width - 40);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Replays the buffered frames onto a portrait canvas while MediaRecorder records it.
// Takes about as long as the clip itself. Resolves to a video Blob.
export async function encodeClip(buffer, { skinId, caption, logo = null, doc = globalThis.document, Recorder = globalThis.MediaRecorder, type = pickClipType(Recorder), wait = sleep, holdMs = CLIP_HOLD_MS, cancelled = () => false } = {}) {
    const frames = buffer.frames.slice();
    if (!frames.length || buffer.blinkAt === null) throw new Error('No clip to make');
    if (!type) throw new Error('Video recording is not available here');
    const canvas = doc.createElement('canvas');
    canvas.width = CLIP_WIDTH; canvas.height = CLIP_HEIGHT;
    // Some browsers only capture canvases that are in the page; keep it invisible.
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';
    doc.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const secondsAt = t => buffer.blinkSeconds - (buffer.blinkAt - t) / 1000;
    const blinkIndex = Math.max(0, frames.findIndex(f => f.t >= buffer.blinkAt));
    const draw = (i, stamp = false) => drawClipFrame(ctx, frames[i].canvas, {
        skinId, caption, stamp, logo,
        blinked: frames[i].t >= buffer.blinkAt,
        seconds: frames[i].t >= buffer.blinkAt ? buffer.blinkSeconds : secondsAt(frames[i].t),
    });
    draw(0);
    const stream = canvas.captureStream(CLIP_FPS);
    const chunks = [];
    try {
        const recorder = new Recorder(stream, { mimeType: type, videoBitsPerSecond: 2500000 });
        const stopped = new Promise((resolve, reject) => {
            recorder.onstop = resolve;
            recorder.onerror = event => reject(event?.error || new Error('Clip recording failed'));
        });
        recorder.ondataavailable = event => { if (event.data && event.data.size) chunks.push(event.data); };
        recorder.start(250);
        // A new round stops the encode at once, so it never competes with the eye tracker.
        const stopIfCancelled = async () => {
            if (!cancelled()) return;
            recorder.stop();
            await stopped.catch(() => {});
            throw new Error('Clip cancelled');
        };
        for (let i = 0; i < frames.length; i++) {
            await stopIfCancelled();
            draw(i);
            const next = frames[i + 1];
            await wait(next ? Math.min(200, Math.max(10, next.t - frames[i].t)) : 1000 / CLIP_FPS);
        }
        // Freeze on the blink so everyone sees the moment.
        const steps = Math.max(1, Math.round(holdMs / (1000 / CLIP_FPS)));
        for (let s = 0; s < steps; s++) { await stopIfCancelled(); draw(blinkIndex, s % 6 < 3); await wait(1000 / CLIP_FPS); }
        recorder.stop();
        await stopped;
    } finally {
        stream.getTracks().forEach(track => track.stop());
        canvas.remove();
    }
    const blob = new Blob(chunks, { type: type.split(';')[0] });
    if (!blob.size) throw new Error('Clip came out empty');
    return blob;
}
