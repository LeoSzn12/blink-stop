// Copy the Beat: watch a rhythm of flashes, then blink it back. Each round you get right
// adds one more beat. Three lives; a wrong copy costs one and you try a new rhythm.
// Pure game logic (no DOM, no camera) so it can be tested on its own.

export const BEAT_LIVES = 3;
export const START_BEATS = 3;
export const SHORT_MS = 450;
export const LONG_MS = 1000;
export const LIGHT_MS = 220;          // how long each flash stays lit while showing
const LEAD_MS = 900;                  // pause before the first flash
const AFTER_SHOW_MS = 700;            // pause after the last flash before your turn
const FIRST_BLINK_MS = 5000;          // time to start copying
const RESULT_MS = 1100;               // "Nice!" or "Missed it" before the next rhythm
const BLINK_COOLDOWN_MS = 180;

// Gaps between beats, each short or long. The first gap is always short so the start is clear.
export function makeRhythm(beats, random = Math.random) {
    const gaps = [];
    for (let i = 1; i < beats; i++) gaps.push(i === 1 ? SHORT_MS : random() < 0.5 ? SHORT_MS : LONG_MS);
    return gaps;
}

// Forgiving timing: a gap counts if it is within 35% (and at least 230 ms) of the shown gap.
export function gapMatches(expected, actual) {
    return Math.abs(actual - expected) <= Math.max(230, expected * 0.35);
}
export function copyMatches(gaps, blinkTimes) {
    if (blinkTimes.length !== gaps.length + 1) return false;
    return gaps.every((gap, i) => gapMatches(gap, blinkTimes[i + 1] - blinkTimes[i]));
}

export function createBeatRound({ random = Math.random, startBeats = START_BEATS } = {}) {
    let beats = startBeats, gaps = makeRhythm(beats, random), lives = BEAT_LIVES, cleared = 0;
    let phase = 'SHOW', showStart = null, flashTimes = [], taps = [], copyStart = null, resultUntil = null, resultOk = null;
    let shownCount = 0, lastBlink = -Infinity;

    function schedule(now) {
        showStart = now;
        flashTimes = [now + LEAD_MS];
        for (const gap of gaps) flashTimes.push(flashTimes.at(-1) + gap);
        shownCount = 0;
        taps = [];
        resultOk = null;
    }

    function judge(now) {
        resultOk = copyMatches(gaps, taps);
        if (resultOk) { cleared++; beats++; }
        else lives--;
        phase = lives <= 0 ? 'DONE' : 'RESULT';
        resultUntil = now + RESULT_MS;
        return { kind: resultOk ? 'RIGHT' : 'WRONG', cleared, lives, over: phase === 'DONE' };
    }

    return {
        get phase() { return phase; },
        get beats() { return beats; },
        get gaps() { return gaps.slice(); },
        get score() { return cleared; },
        get over() { return phase === 'DONE'; },
        get taps() { return taps.length; },
        get resultOk() { return resultOk; },
        livesLeft: () => Math.max(0, lives),
        // While showing: is a flash lit right now?
        lit(now) { return phase === 'SHOW' && flashTimes.some(t => now >= t && now < t + LIGHT_MS); },
        update(now) {
            if (showStart === null) schedule(now);
            if (phase === 'SHOW') {
                if (shownCount < flashTimes.length && now >= flashTimes[shownCount]) {
                    shownCount++;
                    return { kind: 'FLASH', index: shownCount - 1 };
                }
                if (now >= flashTimes.at(-1) + LIGHT_MS + AFTER_SHOW_MS) { phase = 'COPY'; copyStart = now; return { kind: 'YOUR_TURN' }; }
                return null;
            }
            if (phase === 'COPY') {
                // Waited too long to start, or stopped partway: judge what you blinked.
                const lastAt = taps.at(-1);
                if ((!taps.length && now - copyStart >= FIRST_BLINK_MS) || (lastAt !== undefined && now - lastAt >= LONG_MS * 1.8)) return judge(now);
                return null;
            }
            if (phase === 'RESULT' && now >= resultUntil) {
                gaps = makeRhythm(beats, random);
                phase = 'SHOW';
                schedule(now);
                return { kind: 'NEXT', beats };
            }
            return null;
        },
        // Blinks only count on your turn; blinking while it shows the rhythm is fine.
        blink(now) {
            if (phase !== 'COPY' || now - lastBlink < BLINK_COOLDOWN_MS) return null;
            lastBlink = now;
            taps.push(now);
            if (taps.length >= beats) return judge(now);
            return { kind: 'TAP', count: taps.length };
        },
    };
}
