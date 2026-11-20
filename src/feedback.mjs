// Game feel: haptics, confetti and big callouts. Everything is made in code (no images or
// sound files), and every effect respects reduced motion.

const loadNative = () => import('../vendor/native.js');

// Haptics: in the iPhone and Android apps a real tap from the phone's engine; on the web,
// navigator.vibrate where the browser has it (Android). iPhone Safari cannot vibrate.
export const HAPTIC_PATTERNS = { tick: 10, pop: 25, heavy: 60, warn: 50, win: [40, 60, 40, 60, 90], fail: [90, 50, 90] };
export function createHaptics({ win = globalThis.window, nav = globalThis.navigator, load = loadNative } = {}) {
    let enabled = true;
    let native = null;
    const isNative = !!win?.Capacitor?.isNativePlatform?.();
    if (isNative) Promise.resolve().then(load).then(mod => { native = mod; }).catch(() => {});
    function fire(kind) {
        if (!enabled) return false;
        if (isNative && native?.Haptics) {
            const { Haptics, ImpactStyle = {}, NotificationType = {} } = native;
            let call;
            if (kind === 'tick') call = Haptics.impact({ style: ImpactStyle.Light });
            else if (kind === 'pop') call = Haptics.impact({ style: ImpactStyle.Medium });
            else if (kind === 'heavy') call = Haptics.impact({ style: ImpactStyle.Heavy });
            else if (kind === 'win') call = Haptics.notification({ type: NotificationType.Success });
            else if (kind === 'fail') call = Haptics.notification({ type: NotificationType.Error });
            else call = Haptics.notification({ type: NotificationType.Warning });
            Promise.resolve(call).catch(() => {});
            return true;
        }
        try { return !!nav?.vibrate?.(HAPTIC_PATTERNS[kind] ?? 20); } catch { return false; }
    }
    return {
        fire,
        get enabled() { return enabled; },
        set enabled(value) { enabled = !!value; },
        get isNative() { return isNative; },
    };
}

export function prefersReducedMotion(win = globalThis.window) {
    try { return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// Confetti burst on a canvas laid over the whole screen; removes itself when done.
// Reduced motion: nothing moves, so it shows nothing (the crown and text still celebrate).
export function confetti({ doc = globalThis.document, win = globalThis.window, colors = ['#00f3ff', '#ff00ff', '#fff200', '#39ff14', '#ff8a3d'], count = 120, durationMs = 2600 } = {}) {
    if (!doc?.body || prefersReducedMotion(win) || typeof win?.requestAnimationFrame !== 'function') return null;
    const canvas = doc.createElement('canvas');
    canvas.className = 'confetti-layer';
    canvas.setAttribute('aria-hidden', 'true');
    const w = canvas.width = Math.max(1, win.innerWidth || 360);
    const h = canvas.height = Math.max(1, win.innerHeight || 640);
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return null;
    doc.body.appendChild(canvas);
    const bits = Array.from({ length: count }, (_, i) => ({
        x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35,
        vx: (Math.random() - 0.5) * w * 0.9, vy: -h * (0.5 + Math.random() * 0.7),
        size: 5 + Math.random() * 7, spin: Math.random() * Math.PI, color: colors[i % colors.length],
    }));
    let start = null;
    function frame(now) {
        if (start === null) start = now;
        const t = (now - start) / 1000;
        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = Math.max(0, 1 - (now - start) / durationMs);
        for (const b of bits) {
            const x = b.x + b.vx * t, y = b.y + b.vy * t + 0.5 * h * 1.6 * t * t;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(b.spin + t * 6);
            ctx.fillStyle = b.color;
            ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
            ctx.restore();
        }
        if (now - start < durationMs) win.requestAnimationFrame(frame);
        else canvas.remove();
    }
    win.requestAnimationFrame(frame);
    return canvas;
}

// A big word that pops in and fades (LEVEL 2!, 10 IN A ROW!, +1 LIFE), drawn on the game's
// own canvas so it never covers the score or buttons.
export const CALLOUT_MS = 1000;
export function drawCallout(ctx, callout, width, height, now, { reducedMotion = false } = {}) {
    if (!ctx || !callout || !Number.isFinite(callout.at)) return;
    const age = now - callout.at;
    if (age < 0 || age > CALLOUT_MS) return;
    const t = age / CALLOUT_MS;
    const unit = Math.min(width, height);
    const scale = reducedMotion ? 1 : t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15));
    ctx.save();
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    ctx.translate(width / 2, height * 0.2);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(unit * 0.09)}px system-ui, sans-serif`;
    ctx.lineWidth = Math.max(3, unit * 0.012);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeText(callout.text, 0, 0, width * 0.9);
    ctx.fillStyle = callout.color || '#fff200';
    ctx.fillText(callout.text, 0, 0, width * 0.9);
    ctx.restore();
}

// Counts a whole-number score up from zero on the results screen (about 0.7 s).
export function countUp(el, target, { win = globalThis.window, durationMs = 700, format = n => String(n) } = {}) {
    if (!el || !Number.isInteger(target) || target <= 0 || prefersReducedMotion(win) || typeof win?.requestAnimationFrame !== 'function') return false;
    let start = null;
    el.classList?.add('counting');
    function frame(now) {
        if (start === null) start = now;
        const p = Math.min(1, (now - start) / durationMs);
        el.innerText = format(Math.round(target * (1 - (1 - p) ** 3)));
        if (p < 1) win.requestAnimationFrame(frame);
        else el.classList?.remove('counting');
    }
    el.innerText = format(0);
    win.requestAnimationFrame(frame);
    return true;
}
