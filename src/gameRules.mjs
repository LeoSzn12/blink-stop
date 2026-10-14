export function createBlinkDetector(threshold = 0.22, durationMs = 66) {
    let closedSince = null;
    return {
        setThreshold(value) { threshold = value; },
        getThreshold() { return threshold; },
        reset() { closedSince = null; },
        observe(minEar, now) {
            if (!Number.isFinite(minEar) || minEar >= threshold) {
                closedSince = null;
                return false;
            }
            if (closedSince === null || now < closedSince) closedSince = now;
            return now - closedSince >= durationMs;
        }
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
