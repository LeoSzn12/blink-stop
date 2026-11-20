// Balloon Pop: balloons float up past a ring; a blink pops the one inside it.
// Pure game logic (no DOM, no camera) so it can be tested on its own.
// Positions are fractions of the play area: x 0..1 left to right, y 0 top .. 1 bottom.

export const BALLOON_MISSES = 3;
// A tall zone so a blink anywhere near a balloon pops it. It sits below the score in the
// top corner, so a balloon in the zone is never hidden under it.
export const POP_ZONE = { top: 0.3, bottom: 0.74 };
const ZONE_MIDDLE = (POP_ZONE.top + POP_ZONE.bottom) / 2;
const POP_ANIMATION_MS = 450;
const BLINK_COOLDOWN_MS = 250;

const PALETTES = {
    CLASSIC: ['#00f3ff', '#ff00ff', '#fff200', '#39ff14'],
    THANKSGIVING: ['#e8742a', '#c0392b', '#f4b63f', '#8d5524'],
    CHRISTMAS: ['#d62828', '#2a9d4b', '#f2c94c', '#f8f9fa'],
    PARTY: ['#ff4fa3', '#3d8bff', '#ffd23f', '#9b5de5'],
};

export function balloonColors(skinId) {
    return PALETTES[skinId] || PALETTES.CLASSIC;
}

// Rising speed (play heights per second) and gap between balloons both ramp with the score.
// The first five pops stay at the easy starting pace so everyone (kids, grandparents) gets
// going; then it climbs, and by about 20 pops a balloon crosses the zone in under a second.
export const MAX_SPEED = 0.55;
export const MIN_GAP_MS = 600;
export const EASY_POPS = 5;
// A streak this long earns a lost life back, so a long run stays winnable.
export const LIFE_BACK_STREAK = 15;
export function difficulty(score) {
    const s = Math.max(0, (score | 0) - EASY_POPS);
    return { speed: Math.min(0.17 + s * 0.022, MAX_SPEED), gapMs: Math.max(1500 - s * 60, MIN_GAP_MS) };
}
// Level shown to the player: goes up every five pops.
export function balloonLevel(score) { return 1 + Math.floor(Math.max(0, score | 0) / 5); }

export function createBalloonRound({ random = Math.random, firstBalloonMs = 600 } = {}) {
    let balloons = [], score = 0, misses = 0, over = false, streak = 0;
    let started = null, last = null, nextSpawn = null, lastBlink = -Infinity, nextId = 1;
    // Everyone blinks without meaning to: one stray blink per balloon is free.
    let freeStray = true;

    const live = () => balloons.filter(b => !b.poppedAt && !b.escaped);
    const inZone = b => b.y >= POP_ZONE.top && b.y <= POP_ZONE.bottom;

    function miss(now, kind) {
        misses++;
        streak = 0;
        if (misses >= BALLOON_MISSES) over = true;
        return { hit: false, kind, misses, over, now };
    }

    function spawn(now) {
        // Keep new balloons away from the previous one so a pop is never ambiguous.
        const previous = balloons.at(-1);
        let x = 0.18 + random() * 0.64;
        if (previous && Math.abs(previous.x - x) < 0.2) x = x > 0.5 ? x - 0.25 : x + 0.25;
        const { speed } = difficulty(score);
        freeStray = true;
        balloons.push({ id: nextId++, x, y: 1.12, speed, color: Math.floor(random() * 4), wobble: random() * Math.PI * 2, bornAt: now });
    }

    return {
        get score() { return score; },
        get misses() { return misses; },
        get streak() { return streak; },
        get over() { return over; },
        get balloons() { return balloons; },
        livesLeft: () => Math.max(0, BALLOON_MISSES - misses),
        update(now) {
            if (started === null) { started = now; last = now; nextSpawn = now + firstBalloonMs; }
            const dt = Math.max(0, Math.min(now - last, 100)) / 1000;
            last = now;
            const events = [];
            if (over) return events;
            for (const b of live()) {
                b.y -= b.speed * dt;
                if (b.y < -0.12) {
                    b.escaped = true;
                    events.push(miss(now, 'ESCAPED'));
                    if (over) break;
                }
            }
            balloons = balloons.filter(b => !b.escaped && !(b.poppedAt && now - b.poppedAt > POP_ANIMATION_MS));
            // At most two balloons in the air, so there is always one clear target.
            if (!over && now >= nextSpawn && live().length < 2) {
                spawn(now);
                nextSpawn = now + difficulty(score).gapMs;
            }
            return events;
        },
        blink(now) {
            if (over || now - lastBlink < BLINK_COOLDOWN_MS) return null;
            lastBlink = now;
            const target = live().filter(inZone).sort((a, b) => Math.abs(a.y - ZONE_MIDDLE) - Math.abs(b.y - ZONE_MIDDLE))[0];
            if (!target) {
                if (freeStray) { freeStray = false; return { hit: false, kind: 'FREE', misses, over, now }; }
                return miss(now, 'EMPTY');
            }
            target.poppedAt = now;
            score++;
            streak++;
            let lifeBack = false;
            if (streak % LIFE_BACK_STREAK === 0 && misses > 0) { misses--; lifeBack = true; }
            return { hit: true, balloon: target, score, streak, lifeBack, levelUp: score % 5 === 0 };
        },
        elapsed: now => (started === null ? 0 : Math.max(0, (now - started) / 1000)),
    };
}

// Draws the ring, the balloons and pop bursts on an unmirrored overlay canvas.
export function drawBalloons(ctx, round, skinId, width, height, now) {
    const colors = balloonColors(skinId);
    ctx.clearRect(0, 0, width, height);
    const unit = Math.min(width, height);
    const r = unit * 0.075;
    const zoneTop = POP_ZONE.top * height, zoneBottom = POP_ZONE.bottom * height;
    const ready = round.balloons.some(b => !b.poppedAt && b.y >= POP_ZONE.top && b.y <= POP_ZONE.bottom);

    ctx.save();
    ctx.fillStyle = ready ? 'rgba(57, 255, 20, 0.12)' : 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, zoneTop, width, zoneBottom - zoneTop);
    ctx.setLineDash([unit * 0.03, unit * 0.02]);
    ctx.lineWidth = Math.max(2, unit * 0.006);
    ctx.strokeStyle = ready ? '#39ff14' : 'rgba(255, 255, 255, 0.55)';
    for (const y of [zoneTop, zoneBottom]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.fillStyle = ready ? '#39ff14' : 'rgba(255, 255, 255, 0.8)';
    ctx.font = `bold ${Math.round(unit * 0.04)}px system-ui, sans-serif`;
    // Under the zone on the left, clear of the score in the top right.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(ready ? 'BLINK!' : 'POP ZONE', unit * 0.03, zoneBottom + unit * 0.01);
    ctx.restore();

    for (const b of round.balloons) {
        const x = (b.x + Math.sin(now / 600 + b.wobble) * 0.015) * width, y = b.y * height;
        const color = colors[b.color % colors.length];
        ctx.save();
        if (b.poppedAt) {
            const t = Math.min(1, (now - b.poppedAt) / 450);
            // Bits of balloon fly out and fall (fixed per balloon, so it looks the same each frame).
            ctx.fillStyle = color;
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2 + b.wobble;
                const dist = r * (0.6 + t * (1.8 + (i % 3) * 0.5));
                const px = x + Math.cos(a) * dist, py = y + Math.sin(a) * dist + t * t * r * 1.5;
                ctx.globalAlpha = 1 - t;
                ctx.beginPath(); ctx.arc(px, py, r * 0.12 * (1 - t * 0.5), 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1 - t;
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(2, unit * 0.008);
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                const inner = r * (0.4 + t), outer = r * (0.9 + t * 1.4);
                ctx.beginPath();
                ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
                ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
                ctx.stroke();
            }
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.round(unit * 0.06)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('+1', x, y - r * (1 + t));
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = Math.max(1, unit * 0.003);
            ctx.beginPath();
            ctx.moveTo(x, y + r * 1.2);
            ctx.quadraticCurveTo(x - r * 0.3, y + r * 1.8, x, y + r * 2.4);
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(x, y, r * 0.85, r * 1.05, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x - r * 0.15, y + r * 1.2);
            ctx.lineTo(x + r * 0.15, y + r * 1.2);
            ctx.lineTo(x, y + r * 1.0);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.beginPath();
            ctx.ellipse(x - r * 0.3, y - r * 0.4, r * 0.18, r * 0.3, -0.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}
