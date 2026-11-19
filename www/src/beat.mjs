// Blink Beat: a rhythm game played with your eyes. Notes slide down a lane in time with
// the beat; blink as each note reaches the line. Perfect and good hits count, a note that
// slides past is a miss and costs a life, and the beat speeds up as you go.
// Pure game logic and drawing (no camera) so it can be tested on its own.

export const BEAT_LIVES = 3;
export const START_BPM = 66;          // about 0.9 s between beats to start
export const MAX_BPM = 108;           // about 0.55 s: still a comfortable blink pace
export const BPM_STEP = 3;            // faster every 8 notes hit
export const PERFECT_MS = 140;
export const GOOD_MS = 280;
// Blinks reach the game a little after the eyes close (camera frame plus face tracking),
// so each blink is judged as if it happened this much earlier.
export const LATENCY_MS = 110;
export const LIFE_BACK_STREAK = 15;   // a streak this long earns a lost life back
export const LEAD_MS = 2600;          // first note reaches the line this long after start
const FALL_START_MS = 2200;           // how long a note takes to slide down at first
const FALL_MIN_MS = 1500;
const BLINK_COOLDOWN_MS = 180;
const FEEDBACK_MS = 550;

// Each bar is four beats; 1 = a note on that beat, 0 = a rest (the beat still plays).
const EASY_BARS = [[1, 0, 1, 0], [1, 0, 1, 0], [1, 1, 1, 0], [1, 0, 1, 1], [1, 0, 0, 0]];
const HARD_BARS = [[1, 1, 1, 1], [1, 1, 0, 1], [1, 0, 1, 1], [1, 1, 1, 0], [0, 1, 1, 1]];

export function bpmFor(hits) {
    return Math.min(MAX_BPM, START_BPM + Math.floor(hits / 8) * BPM_STEP);
}
export function fallMsFor(bpm) {
    const t = (bpm - START_BPM) / (MAX_BPM - START_BPM);
    return Math.round(FALL_START_MS - t * (FALL_START_MS - FALL_MIN_MS));
}
export function judgeOffset(ms) {
    const off = Math.abs(ms);
    return off <= PERFECT_MS ? 'PERFECT' : off <= GOOD_MS ? 'GOOD' : null;
}

export function createBeatRound({ random = Math.random } = {}) {
    let startAt = null, beatAt = null, beatIndex = 0, barNotes = [], notesPlaced = 0;
    let lives = BEAT_LIVES, hits = 0, perfect = 0, good = 0, misses = 0, combo = 0, bestCombo = 0;
    let lastBlink = -Infinity, feedback = null, over = false;
    const notes = [];          // { at, fallMs, state: 'LIVE' | 'HIT' | 'MISS' }
    const beats = [];          // every beat scheduled, notes or rests (for the music)
    let beatsPlayed = 0;

    function bpm() { return bpmFor(hits); }
    // Schedule beats and notes far enough ahead that each note appears at the top in time.
    function scheduleUntil(until) {
        while (beatAt <= until) {
            const step = beatIndex % 4;
            if (step === 0) {
                const bank = hits >= 16 && random() < 0.6 ? HARD_BARS : EASY_BARS;
                barNotes = notesPlaced < 4 ? [1, 0, 1, 0] : bank[Math.floor(random() * bank.length)];
            }
            beats.push(beatAt);
            // The first bar is a count-in: you hear the beat before any note arrives.
            if (beatIndex >= 4 && barNotes[step]) {
                notes.push({ at: beatAt, fallMs: fallMsFor(bpm()), state: 'LIVE' });
                notesPlaced++;
            }
            beatIndex++;
            beatAt += 60000 / bpm();
        }
    }

    return {
        get score() { return hits; },
        get combo() { return combo; },
        get bestCombo() { return bestCombo; },
        get perfect() { return perfect; },
        get good() { return good; },
        get misses() { return misses; },
        get over() { return over; },
        get bpm() { return bpm(); },
        get feedback() { return feedback; },
        livesLeft: () => Math.max(0, lives),
        // Notes on screen: progress 0 at the top of the lane, 1 at the line.
        visible(now) {
            return notes.filter(n => n.state !== 'HIT' || now - n.hitAt < 300)
                .map(n => ({ progress: 1 - (n.at - now) / n.fallMs, state: n.state, hitAt: n.hitAt, kind: n.kind }))
                .filter(n => n.progress >= -0.05 && n.progress <= 1.25);
        },
        // Returns how many beats just played (for the music) and how many notes were missed.
        update(now) {
            if (startAt === null) { startAt = now; beatAt = now + LEAD_MS - 4 * (60000 / START_BPM); }
            if (over) return { beats: 0, missed: 0 };
            scheduleUntil(now + FALL_START_MS + 500);
            let played = 0, missed = 0;
            while (beatsPlayed < beats.length && beats[beatsPlayed] <= now) { beatsPlayed++; played++; }
            for (const n of notes) {
                if (n.state === 'LIVE' && now - n.at > GOOD_MS + LATENCY_MS) {
                    n.state = 'MISS'; misses++; missed++;
                    lives--; combo = 0;
                    feedback = { kind: 'MISS', at: now };
                    if (lives <= 0) { over = true; break; }
                }
            }
            while (notes.length && notes[0].state !== 'LIVE' && now - notes[0].at > 1500) notes.shift();
            if (feedback && now - feedback.at > FEEDBACK_MS) feedback = null;
            return { beats: played, missed };
        },
        // A blink hits the nearest live note in its window. A blink with no note near
        // breaks the streak, so blinking nonstop doesn't win, but costs no life.
        blink(now) {
            if (over || startAt === null || now - lastBlink < BLINK_COOLDOWN_MS) return null;
            lastBlink = now;
            const t = now - LATENCY_MS;
            let best = null;
            for (const n of notes) {
                if (n.state !== 'LIVE') continue;
                const off = t - n.at;
                if (Math.abs(off) <= GOOD_MS && (!best || Math.abs(off) < Math.abs(best.off))) best = { n, off };
            }
            if (!best) {
                const hadStreak = combo > 0;
                combo = 0;
                feedback = { kind: 'STRAY', at: now };
                return { kind: 'STRAY', hadStreak };
            }
            const kind = judgeOffset(best.off);
            best.n.state = 'HIT'; best.n.hitAt = now; best.n.kind = kind;
            hits++; combo++; bestCombo = Math.max(bestCombo, combo);
            if (kind === 'PERFECT') perfect++; else good++;
            let lifeBack = false;
            if (combo % LIFE_BACK_STREAK === 0 && lives < BEAT_LIVES) { lives++; lifeBack = true; }
            feedback = { kind, at: now, combo };
            return { kind, offsetMs: Math.round(best.off), score: hits, combo, lifeBack };
        },
    };
}

// The lane runs down the middle of the screen to a hit line near the bottom.
export const HIT_LINE = 0.8;
const LANE_TOP = 0.22;
const COLORS = { CLASSIC: '#00f3ff', THANKSGIVING: '#ff9f43', CHRISTMAS: '#ff4d6d', PARTY: '#ff2bd6' };

export function drawBeat(ctx, round, skin, width, height, now) {
    ctx.clearRect(0, 0, width, height);
    const unit = Math.min(width, height);
    const color = COLORS[skin] || COLORS.CLASSIC;
    const laneW = unit * 0.26, x = width / 2;
    const top = height * LANE_TOP, line = height * HIT_LINE;
    const feedback = round.feedback;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(x - laneW / 2, top, laneW, line - top + unit * 0.08);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = Math.max(1, unit * 0.004);
    ctx.strokeRect(x - laneW / 2, top, laneW, line - top + unit * 0.08);
    // Hit line and target ring; they glow on a hit.
    const glow = feedback && (feedback.kind === 'PERFECT' || feedback.kind === 'GOOD') ? Math.max(0, 1 - (now - feedback.at) / FEEDBACK_MS) : 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, unit * 0.012);
    ctx.globalAlpha = 0.6 + 0.4 * glow;
    ctx.beginPath(); ctx.moveTo(x - laneW * 0.75, line); ctx.lineTo(x + laneW * 0.75, line); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, line, laneW * 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    for (const n of round.visible(now)) {
        const y = top + (line - top) * n.progress;
        const r = laneW * 0.26;
        if (n.state === 'HIT') {
            const t = Math.min(1, (now - n.hitAt) / 300);
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(x, line, r * (1 + t), 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            continue;
        }
        ctx.globalAlpha = n.state === 'MISS' ? 0.3 : 1;
        ctx.fillStyle = n.state === 'MISS' ? '#888888' : color;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        // A closed-eye mark on each note: this is when you blink.
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = Math.max(2, unit * 0.007);
        ctx.beginPath(); ctx.arc(x, y - r * 0.15, r * 0.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
        ctx.globalAlpha = 1;
    }

    if (feedback) {
        const t = Math.min(1, (now - feedback.at) / FEEDBACK_MS);
        const words = { PERFECT: 'PERFECT!', GOOD: 'GOOD', MISS: 'MISS', STRAY: 'NO NOTE' };
        const colors = { PERFECT: '#39ff14', GOOD: color, MISS: '#ff4d4d', STRAY: '#ffcc00' };
        ctx.globalAlpha = 1 - t * 0.8;
        ctx.fillStyle = colors[feedback.kind];
        ctx.font = `bold ${Math.round(unit * 0.075)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(words[feedback.kind], x, line - laneW * 0.45 - t * unit * 0.04);
        ctx.globalAlpha = 1;
    }
    if (round.combo >= 3) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(unit * 0.05)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${round.combo} in a row`, x, line + laneW * 0.4);
    }
    ctx.restore();
}
