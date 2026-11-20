// Endurance rounds end on a real blink, and a missed blink feels broken. Phones run the eye
// tracker at roughly 10 to 30 frames a second, so the closed part of a blink lands on only
// one to three frames. A blink counts when two frames in a row fall under the line, or when
// a single frame falls well under it (a full closure the camera caught once). The line
// also rises a little with the player's open eyes during the round, so a wide-eyed stare
// after a relaxed calibration still catches the blink.
export const DEEP_CLOSE = 0.86;     // one frame this far under the line is a blink by itself
export const FOLLOW_OPEN = 0.72;    // the line follows 72% of the eyes' recent open level...
export const FOLLOW_CAP = 1.1;      // ...but never more than 10% above the calibrated line
export function createBlinkDetector(threshold = 0.22) {
    let below = 0;
    let open = null;
    function line() {
        if (open === null) return threshold;
        return Math.max(threshold, Math.min(open * FOLLOW_OPEN, threshold * FOLLOW_CAP));
    }
    return {
        setThreshold(value) { threshold = value; open = null; below = 0; },
        getThreshold() { return threshold; },
        line,
        reset() { below = 0; },
        observe(minEar) {
            if (!Number.isFinite(minEar) || minEar <= 0) { below = 0; return false; }
            const current = line();
            if (minEar >= current) {
                below = 0;
                // Only clearly open frames teach the open level, slowly (about a second).
                if (minEar >= threshold * 1.15) open = open === null ? minEar : open + (minEar - open) * 0.1;
                return false;
            }
            below++;
            return below >= 2 || minEar < current * DEEP_CLOSE;
        }
    };
}

// The quick blink test at the end of calibration: the player blinks once and the line is
// set halfway between their open eyes and how far that blink closed them, kept within a
// safe band. No blink seen means the usual 78% line.
export const DEFAULT_LINE = 0.78;
export function blinkLineFor(openEar, blinkMin) {
    if (!(openEar > 0)) return null;
    if (!(blinkMin > 0) || blinkMin >= openEar * 0.85) return openEar * DEFAULT_LINE;
    const ratio = (openEar + blinkMin) / 2 / openEar;
    return openEar * Math.min(0.8, Math.max(0.7, ratio));
}
export function createBlinkTest() {
    let low = Infinity, closed = false, done = false;
    return {
        reset() { low = Infinity; closed = false; done = false; },
        get done() { return done; },
        get low() { return Number.isFinite(low) ? low : null; },
        // Done once the eyes close well under their open level and open again.
        observe(minEar, openEar) {
            if (done || !(minEar > 0) || !(openEar > 0)) return done;
            if (minEar < openEar * 0.85) { closed = true; low = Math.min(low, minEar); }
            else if (closed && minEar >= openEar * 0.9) done = true;
            return done;
        },
    };
}

export function createCalibrationTracker() {
    let samples = [];
    let latestOpen = false;
    function prune(now) {
        samples = samples.filter(sample => now >= sample.now && now - sample.now <= 6000);
    }
    return {
        reset() { samples = []; latestOpen = false; },
        observe(ear, now) {
            prune(now);
            // Keep slower cameras' progress, but never bridge a tracking interruption.
            if (samples.length && now - samples.at(-1).now >= 1000) samples = [];
            latestOpen = Number.isFinite(ear) && ear >= 0.14 && ear <= 0.6;
            if (latestOpen) {
                samples.push({ ear, now });
            }
        },
        ready(now) {
            prune(now);
            return latestOpen && samples.length >= 10 &&
                samples.at(-1).now - samples[0].now >= 1000 &&
                now >= samples.at(-1).now && now - samples.at(-1).now < 500;
        },
        progress(now) {
            prune(now);
            if (!samples.length || now - samples.at(-1).now >= 1000) return 0;
            return Math.min(samples.length / 10, (samples.at(-1).now - samples[0].now) / 1000, 1);
        },
        values() { return samples.map(sample => sample.ear); }
    };
}

// Landmark x/y values use different image dimensions. Measure in image pixels so
// the same eye has the same ratio in portrait and landscape camera frames.
export function measureEyeOpenness(landmarks, width = 1, height = 1) {
    if (!(width > 0 && height > 0)) return null;
    const ratio = indices => {
        const points = indices.map(i => landmarks?.[i]);
        if (points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
            p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return NaN;
        const distance = (a, b) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
        const horizontal = distance(points[0], points[3]);
        return horizontal > 0 ? (distance(points[1], points[5]) + distance(points[2], points[4])) / (2 * horizontal) : NaN;
    };
    const left = ratio([33, 160, 158, 133, 153, 144]);
    const right = ratio([362, 385, 387, 263, 373, 380]);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    return { ear: (left + right) / 2, minEar: Math.min(left, right) };
}

export function createTrackingFreshness(durationMs = 1000) {
    let lastValid = null;
    return {
        reset(now = null) { lastValid = now; },
        observe(now) {
            if (lastValid === null || this.stale(now)) return false;
            lastValid = now;
            return true;
        },
        stale(now) { return lastValid === null || now < lastValid || now - lastValid >= durationMs; }
    };
}

export function createFaceLossTracker(durationMs = 1000) {
    let missingSince = null;
    return {
        reset() { missingSince = null; },
        observe(hasFace, now) {
            if (hasFace) {
                missingSince = null;
                return false;
            }
            if (missingSince === null || now < missingSince) missingSince = now;
            return now - missingSince >= durationMs;
        }
    };
}

// Tap games (Balloon Pop, Flash, Blink Beat) want every deliberate blink, even a quick one
// the camera sees in a single frame. Endurance keeps the stricter sustained-closure detector
// so a flicker never ends a round. One blink fires once; the eyes must reopen past a slightly
// higher line before the next blink can count.
// Catching every real blink matters more than ignoring a laugh, so the line sits a little
// above the player's blink line and either eye closing counts. The detector's own blink
// flag always counts too.
export const TAP_CLOSE = 1.1;
export const TAP_REOPEN = 1.17;
export function createTapBlink({ close = TAP_CLOSE, reopen = TAP_REOPEN } = {}) {
    let closed = false;
    return {
        reset() { closed = false; },
        get closed() { return closed; },
        // Returns true only on the frame the eyes close.
        observe(eye, threshold) {
            const minEar = eye?.minEar;
            if (!Number.isFinite(minEar) || minEar <= 0 || !Number.isFinite(threshold) || threshold <= 0) return false;
            const shut = !!eye.blinking || minEar < threshold * close;
            if (shut && !closed) { closed = true; return true; }
            if (!shut && minEar >= threshold * reopen) closed = false;
            return false;
        },
    };
}
