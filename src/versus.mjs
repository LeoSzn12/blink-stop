// Head-to-head: two faces in one camera frame, first to blink loses.
// Pure logic so it can be tested without a camera. Landmarks are normalized
// MediaPipe Face Mesh points; players are named as they appear on the
// mirrored screen (LEFT/RIGHT), which is also how the shared photo is mirrored.
import { createBlinkDetector, createCalibrationTracker, createFaceLossTracker, measureEyeOpenness } from './gameRules.mjs';

export const SIDES = ['LEFT', 'RIGHT'];

// Trimmed open-eye average, and a blink threshold relative to it, as in solo calibration.
export function thresholdFrom(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const trim = Math.floor(sorted.length * 0.1);
    const kept = sorted.length - 2 * trim > 0 ? sorted.slice(trim, sorted.length - trim) : sorted;
    const baseline = kept.reduce((sum, v) => sum + v, 0) / kept.length;
    return { baseline, threshold: Math.min(baseline * 0.75, 0.35) };
}

function faceX(face) {
    const nose = face?.[1];
    if (nose && Number.isFinite(nose.x)) return nose.x;
    const a = face?.[234], b = face?.[454];
    return a && b && Number.isFinite(a.x) && Number.isFinite(b.x) ? (a.x + b.x) / 2 : NaN;
}

// The camera image is mirrored on screen, so a larger image x is further left on screen.
export function orderFaces(faces) {
    if (!Array.isArray(faces)) return [];
    return faces.filter(Array.isArray).map(face => ({ face, x: faceX(face) }))
        .filter(item => Number.isFinite(item.x)).sort((a, b) => b.x - a.x).map(item => item.face);
}

export function createVersusMatch({ warmupMs = 2500, faceLossMs = 1000 } = {}) {
    let phase = 'CALIBRATING', calibrationStart = null, startedAt = null, outcome = null;
    const calibration = Object.fromEntries(SIDES.map(side => [side, createCalibrationTracker()]));
    const detectors = {}, baselines = {}, thresholds = {};
    const missing = createFaceLossTracker(faceLossMs);

    function finish(result, now, extra = {}) {
        phase = 'DONE';
        outcome = { result, elapsed: startedAt === null ? 0 : Math.max(0, (now - startedAt) / 1000), ...extra };
        return { phase, outcome };
    }

    return {
        get phase() { return phase; },
        get outcome() { return outcome; },
        get startedAt() { return startedAt; },
        observe(faces, now, width = 1, height = 1) {
            if (phase === 'DONE') return { phase, outcome };
            const ordered = orderFaces(faces).slice(0, 2);
            const eyes = ordered.map(face => measureEyeOpenness(face, width, height));
            const both = ordered.length === 2 && eyes.every(Boolean);

            if (phase === 'CALIBRATING') {
                if (calibrationStart === null) calibrationStart = now;
                if (!both) {
                    SIDES.forEach(side => calibration[side].observe(NaN, now));
                    return { phase, status: ordered.length < 2 ? 'NEED_TWO' : 'EYES', progress: 0, faces: ordered.length };
                }
                SIDES.forEach((side, i) => calibration[side].observe(eyes[i].minEar, now));
                const progress = Math.min(...SIDES.map(side => calibration[side].progress(now)));
                if (now - calibrationStart >= warmupMs && SIDES.every(side => calibration[side].ready(now))) {
                    for (const side of SIDES) {
                        const fit = thresholdFrom(calibration[side].values());
                        baselines[side] = fit.baseline;
                        thresholds[side] = fit.threshold;
                        detectors[side] = createBlinkDetector(fit.threshold);
                    }
                    phase = 'PLAYING';
                    startedAt = now;
                    missing.reset();
                    return { phase, started: true };
                }
                return { phase, status: 'HOLD', progress, faces: 2 };
            }

            // PLAYING: both faces must stay in view; a lost face voids the round instead of picking a loser.
            if (!both) {
                SIDES.forEach(side => detectors[side].reset());
                return missing.observe(false, now) ? finish('VOID', now) : { phase, faces: ordered.length };
            }
            missing.observe(true, now);
            const blinked = SIDES.filter((side, i) => detectors[side].observe(eyes[i].minEar, now));
            if (blinked.length === 2) return finish('TIE', now);
            if (blinked.length === 1) {
                const loser = blinked[0];
                return finish('WIN', now, { loser, winner: loser === 'LEFT' ? 'RIGHT' : 'LEFT' });
            }
            const openness = Object.fromEntries(SIDES.map((side, i) => {
                const span = baselines[side] - thresholds[side];
                return [side, span > 0 ? Math.max(0, Math.min(1, (eyes[i].minEar - thresholds[side]) / span)) : 1];
            }));
            return { phase, openness };
        },
        // Tracking stopped arriving altogether (camera stall): void, never guess a loser.
        stall(now) { return phase === 'PLAYING' ? finish('VOID', now).outcome : outcome; },
    };
}

// Solo rounds: when someone leans into the shot, keep tracking the player,
// who is the biggest face (closest to the phone). Unmeasurable input passes through.
export function largestFace(faces) {
    if (!Array.isArray(faces) || !faces.length) return undefined;
    let best = faces[0], bestWidth = -1;
    for (const face of faces) {
        const a = face?.[234], b = face?.[454];
        const width = a && b && Number.isFinite(a.x) && Number.isFinite(b.x) ? Math.abs(a.x - b.x) : -1;
        if (width > bestWidth) { best = face; bestWidth = width; }
    }
    return best;
}
