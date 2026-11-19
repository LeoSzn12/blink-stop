// Flash: wait for the light to turn green, then blink as fast as you can.
// Best of three tries; the score is your fastest reaction in milliseconds (lower is better).
// Pure game logic (no DOM, no camera) so it can be tested on its own.

export const FLASH_TRIES = 3;
export const FLASH_WAIT = { min: 1500, max: 4000 };
export const FLASH_TIMEOUT_MS = 2000;
const BETWEEN_MS = 1400;

export function createFlashRound({ random = Math.random, tries = FLASH_TRIES, firstWaitMs = null } = {}) {
    let phase = 'WAIT', times = [], goAt = null, betweenUntil = null, started = false, falseStarts = 0, last = null;
    const waitFor = () => FLASH_WAIT.min + random() * (FLASH_WAIT.max - FLASH_WAIT.min);

    function finishTry(ms, now, kind) {
        times.push(ms);
        last = { kind, ms };
        goAt = null;
        if (times.length >= tries) phase = 'DONE';
        else { phase = 'BETWEEN'; betweenUntil = now + BETWEEN_MS; }
        return { kind, ms, tryNumber: times.length, over: phase === 'DONE' };
    }

    return {
        get phase() { return phase; },
        get times() { return times.slice(); },
        get tries() { return tries; },
        get falseStarts() { return falseStarts; },
        get over() { return phase === 'DONE'; },
        get last() { return last; },
        // Fastest real reaction; a try that timed out counts as the timeout.
        get best() { return times.length ? Math.min(...times) : null; },
        tryNumber: () => Math.min(times.length + 1, tries),
        update(now) {
            if (!started) { started = true; goAt = now + (firstWaitMs ?? waitFor()); }
            if (phase === 'WAIT' && now >= goAt) { phase = 'GO'; return { kind: 'GO' }; }
            if (phase === 'GO' && now - goAt >= FLASH_TIMEOUT_MS) return finishTry(FLASH_TIMEOUT_MS, now, 'SLOW');
            if (phase === 'BETWEEN' && now >= betweenUntil) { phase = 'WAIT'; goAt = now + waitFor(); return { kind: 'READY' }; }
            return null;
        },
        // A blink before green is a false start: that try starts over with a new wait.
        blink(now) {
            if (!started) return null;
            if (phase === 'WAIT') {
                falseStarts++;
                goAt = now + waitFor();
                last = { kind: 'EARLY' };
                return { kind: 'EARLY' };
            }
            if (phase === 'GO') return finishTry(Math.max(0, Math.round(now - goAt)), now, 'HIT');
            return null;
        },
    };
}
