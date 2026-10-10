// One bounded interruption per round; no timer or callback survives an abandoned round.
export function createSurpriseRound(random = Math.random) {
    const sample = Math.max(0, Math.min(1, random()));
    const eventAt = 15000 + sample * 9000;
    let delivered = false;
    return {
        observe(elapsedMs) {
            const complete = elapsedMs >= 30000;
            const active = !complete && elapsedMs >= eventAt && elapsedMs < eventAt + 700;
            const triggered = active && !delivered;
            if (triggered) delivered = true;
            return { active, triggered, complete };
        }
    };
}

export function createRewardedDemo(startedAt) {
    let cancelled = false;
    let claimed = false;
    return {
        observe(now) {
            const remaining = Math.max(0, 5000 - Math.max(0, now - startedAt));
            return { remaining, complete: !cancelled && remaining === 0 };
        },
        cancel() { cancelled = true; },
        claim(now) {
            if (claimed || !this.observe(now).complete) return false;
            claimed = true;
            return true;
        }
    };
}
