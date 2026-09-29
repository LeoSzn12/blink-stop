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
    return {
        reset() { samples = []; },
        observe(ear, now) {
            if (Number.isFinite(ear) && ear >= 0.22 && ear <= 0.6) {
                samples.push({ ear, now });
            }
        },
        ready(now) {
            return samples.length >= 10 &&
                samples.at(-1).now - samples[0].now >= 1000 &&
                now >= samples.at(-1).now && now - samples.at(-1).now < 500;
        },
        values() { return samples.map(sample => sample.ear); }
    };
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
