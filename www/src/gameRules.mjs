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
