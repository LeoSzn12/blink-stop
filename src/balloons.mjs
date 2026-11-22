// Balloon Pop: balloons float up past a ring; a blink pops the one inside it.
// Pure game logic (no DOM, no camera) so it can be tested on its own.
// Positions are fractions of the play area: x 0..1 left to right, y 0 top .. 1 bottom.

export const BALLOON_MISSES = 3;
// A tall zone so a blink anywhere near a balloon pops it. It sits below the score in the
// top corner, so a balloon in the zone is never hidden under it.
export const POP_ZONE = { top: 0.3, bottom: 0.74 };
const ZONE_MIDDLE = (POP_ZONE.top + POP_ZONE.bottom) / 2;
// Every 50 pops the game steps up: the zone shrinks around its middle and balloons rise a
// little faster. The smallest zone still gives a blink about 0.4 s, so it stays playable.
export const STEP_POPS = 50;
export const MIN_ZONE = 0.25;
const ZONE_SHRINK = 0.05;
export function balloonStep(score) { return Math.floor(Math.max(0, score | 0) / STEP_POPS); }
export function zoneFor(score) {
    const half = Math.max(MIN_ZONE, (POP_ZONE.bottom - POP_ZONE.top) - balloonStep(score) * ZONE_SHRINK) / 2;
    return { top: ZONE_MIDDLE - half, bottom: ZONE_MIDDLE + half };
}
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
// Each 50-pop step adds a little speed and trims the gap, up to these limits.
export const TOP_SPEED = 0.63;
export const TOP_GAP_MS = 450;
// A streak this long earns a lost life back, so a long run stays winnable. Later steps
// ask for a longer streak, so a long run does eventually end.
export const LIFE_BACK_STREAK = 15;
export function lifeBackStreak(score) { return Math.min(LIFE_BACK_STREAK + balloonStep(score) * 5, 30); }
export function difficulty(score) {
    const s = Math.max(0, (score | 0) - EASY_POPS);
    const step = balloonStep(score);
    return { speed: Math.min(0.17 + s * 0.022, MAX_SPEED) + Math.min(step * 0.02, TOP_SPEED - MAX_SPEED),
        gapMs: Math.max(Math.max(1500 - s * 60, MIN_GAP_MS) - step * 40, TOP_GAP_MS) };
}
// Special balloons, once the player has got going: a fast golden one worth bonus points,
// and a holiday one (a turkey, an ornament, or a heart) that gives a life back. Missing a
// special costs nothing. They only come from the top of the random range, so a test that
// fixes random() at an ordinary value never sees one.
export const SPECIAL_FROM = 10;
export const GOLD_POINTS = 5;
export const LIFE_POINTS = 2;
const GOLD_CHANCE = 0.07, LIFE_CHANCE = 0.05;
// Level shown to the player: goes up every five pops.
export function balloonLevel(score) { return 1 + Math.floor(Math.max(0, score | 0) / 5); }

export function createBalloonRound({ random = Math.random, firstBalloonMs = 600 } = {}) {
    let balloons = [], score = 0, misses = 0, over = false, streak = 0, zone = zoneFor(0);
    let started = null, last = null, nextSpawn = null, lastBlink = -Infinity, nextId = 1;
    // Everyone blinks without meaning to: one stray blink per balloon is free.
    let freeStray = true;

    const live = () => balloons.filter(b => !b.poppedAt && !b.escaped);
    const inZone = b => b.y >= zone.top && b.y <= zone.bottom;

    function miss(now, kind) {
        misses++;
        streak = 0;
        if (misses >= BALLOON_MISSES) over = true;
        return { hit: false, kind, misses, over, now };
    }

    function spawn(now) {
        // Keep new balloons away from the previous one so a pop is never ambiguous.
        const previous = balloons[balloons.length - 1];
        let x = 0.18 + random() * 0.64;
        if (previous && Math.abs(previous.x - x) < 0.2) x = x > 0.5 ? x - 0.25 : x + 0.25;
        const { speed } = difficulty(score);
        freeStray = true;
        // At most one special in the air at a time.
        let kind = 'NORMAL';
        if (score >= SPECIAL_FROM && !live().some(b => b.kind !== 'NORMAL')) {
            const roll = random();
            if (roll > 1 - GOLD_CHANCE) kind = 'GOLD';
            else if (roll > 1 - GOLD_CHANCE - LIFE_CHANCE) kind = 'LIFE';
        }
        balloons.push({ id: nextId++, x, y: 1.12, speed: kind === 'GOLD' ? speed * 1.45 : speed, kind,
            color: Math.floor(random() * 4), wobble: random() * Math.PI * 2, bornAt: now });
    }

    return {
        get score() { return score; },
        get misses() { return misses; },
        get streak() { return streak; },
        get over() { return over; },
        get balloons() { return balloons; },
        get zone() { return zone; },
        get step() { return balloonStep(score); },
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
                    if (b.kind !== 'NORMAL') continue; // a missed special costs nothing
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
            const before = score;
            const points = target.kind === 'GOLD' ? GOLD_POINTS : target.kind === 'LIFE' ? LIFE_POINTS : 1;
            target.points = points;
            score += points;
            streak++;
            let lifeBack = false;
            if (target.kind === 'LIFE' && misses > 0) { misses--; lifeBack = true; }
            else if (streak % lifeBackStreak(before) === 0 && misses > 0) { misses--; lifeBack = true; }
            const harder = balloonStep(score) > balloonStep(before);
            zone = zoneFor(score);
            return { hit: true, balloon: target, kind: target.kind, points, score, streak, lifeBack, harder, step: balloonStep(score),
                levelUp: balloonLevel(score) > balloonLevel(before) };
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
    const zone = round.zone || POP_ZONE;
    const zoneTop = zone.top * height, zoneBottom = zone.bottom * height;
    const ready = round.balloons.some(b => !b.poppedAt && b.y >= zone.top && b.y <= zone.bottom);

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
        const color = b.kind === 'GOLD' ? '#ffd23f' : b.kind === 'LIFE' ? SPECIAL_COLORS[skinId] || SPECIAL_COLORS.CLASSIC : colors[b.color % colors.length];
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
            ctx.fillText(b.kind === 'LIFE' ? '+❤' : `+${b.points || 1}`, x, y - r * (1 + t));
        } else if (b.kind === 'LIFE') {
            drawLifeBalloon(ctx, skinId, x, y, r, now);
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
            if (b.kind === 'GOLD') {
                // A glint that sweeps round and a "×5" so it reads as worth chasing.
                ctx.strokeStyle = '#fff6c2';
                ctx.lineWidth = Math.max(2, unit * 0.006);
                ctx.beginPath(); ctx.ellipse(x, y, r * 0.95, r * 1.15, 0, 0, Math.PI * 2); ctx.stroke();
                const a = now / 220;
                ctx.fillStyle = '#ffffff';
                drawSparkle(ctx, x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.35, r * 0.28);
                ctx.fillStyle = '#5a3d00';
                ctx.font = `900 ${Math.round(r * 0.7)}px system-ui, sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(`×${GOLD_POINTS}`, x, y + r * 0.1);
            }
        }
        ctx.restore();
    }
}

const SPECIAL_COLORS = { THANKSGIVING: '#a0522d', CHRISTMAS: '#d62828', CLASSIC: '#ff4f7b', PARTY: '#ff4f7b' };

function drawSparkle(ctx, x, y, size) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, d = i % 2 ? size * 0.3 : size;
        ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath(); ctx.fill();
}

// The extra-life balloon, drawn in code: a turkey at Thanksgiving, an ornament at Christmas,
// otherwise a heart. It gently pulses so it stands out from the normal balloons.
function drawLifeBalloon(ctx, skinId, x, y, r, now) {
    const pulse = 1 + Math.sin(now / 160) * 0.05;
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    if (skinId === 'THANKSGIVING') {
        ['#7a2e0e', '#d9822b', '#f2c14e', '#b5451b', '#e2572b', '#f2c14e', '#d9822b'].forEach((c, i, all) => {
            const a = -Math.PI * 0.95 + (i + 0.5) * (Math.PI * 0.9 / all.length);
            ctx.save(); ctx.rotate(a + Math.PI / 2); ctx.translate(0, -r * 0.75);
            ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.28, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        });
        ctx.fillStyle = '#8b5a2b'; ctx.beginPath(); ctx.ellipse(0, r * 0.15, r * 0.62, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a0522d'; ctx.beginPath(); ctx.arc(0, -r * 0.45, r * 0.32, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.moveTo(-r * 0.08, -r * 0.42); ctx.lineTo(r * 0.08, -r * 0.42); ctx.lineTo(0, -r * 0.28); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d62828'; ctx.beginPath(); ctx.ellipse(r * 0.1, -r * 0.3, r * 0.06, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; for (const dx of [-0.1, 0.1]) { ctx.beginPath(); ctx.arc(dx * r, -r * 0.52, r * 0.05, 0, Math.PI * 2); ctx.fill(); }
    } else if (skinId === 'CHRISTMAS') {
        ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = Math.max(2, r * 0.06);
        ctx.beginPath(); ctx.arc(0, -r * 1.22, r * 0.14, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#f2c94c'; ctx.fillRect(-r * 0.22, -r * 1.12, r * 0.44, r * 0.22);
        ctx.fillStyle = '#d62828'; ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a9d4b'; ctx.fillRect(-r * 0.95, -r * 0.14, r * 1.9, r * 0.28);
        ctx.fillStyle = '#f8f9fa'; for (const dx of [-0.55, 0, 0.55]) { ctx.beginPath(); ctx.arc(dx * r, 0, r * 0.08, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.45, r * 0.16, r * 0.26, -0.5, 0, Math.PI * 2); ctx.fill();
    } else {
        ctx.fillStyle = SPECIAL_COLORS[skinId] || SPECIAL_COLORS.CLASSIC;
        ctx.beginPath();
        ctx.moveTo(0, r * 0.95);
        ctx.bezierCurveTo(-r * 1.4, r * 0.05, -r * 0.75, -r * 1.15, 0, -r * 0.45);
        ctx.bezierCurveTo(r * 0.75, -r * 1.15, r * 1.4, r * 0.05, 0, r * 0.95);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.4, r * 0.14, r * 0.22, -0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(r * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+1 LIFE', 0, r * 1.45);
}
