// Holiday and party skins. Everything here draws on canvases the game already owns:
// the on-screen camera canvas (display only, never sent to blink detection) and the
// selfie the player chooses to share. No images are fetched and nothing is uploaded.

export const SKINS = {
    CLASSIC: { id: 'CLASSIC', name: 'Classic', icon: '👁️', greeting: 'BLINK STOP', menuLine: '',
        colors: { primary: '#30f2d5', secondary: '#ff3df5', text: '#ffffff', muted: '#bfc7d5', bgTop: '#081520', bgBottom: '#230d35' } },
    THANKSGIVING: { id: 'THANKSGIVING', name: 'Thanksgiving', icon: '🦃', greeting: 'HAPPY THANKSGIVING', menuLine: 'Pilgrim hat on. Keep your eyes open as long as you can!',
        colors: { primary: '#ffb347', secondary: '#ff6b35', text: '#fff6e6', muted: '#f3d9b8', bgTop: '#3b1a08', bgBottom: '#8a3410' } },
    CHRISTMAS: { id: 'CHRISTMAS', name: 'Christmas', icon: '🎄', greeting: 'MERRY CHRISTMAS', menuLine: 'Santa hat on. Whoever blinks first does the dishes.',
        colors: { primary: '#ff4d5e', secondary: '#3ddc84', text: '#ffffff', muted: '#d7f5e3', bgTop: '#0b2a1a', bgBottom: '#5c0a14' } },
    PARTY: { id: 'PARTY', name: 'Party', icon: '🎉', greeting: "DON'T BLINK!", menuLine: 'Party hats for parties, road trips and long lines.',
        colors: { primary: '#ffd23f', secondary: '#ff5fd2', text: '#ffffff', muted: '#e6dcff', bgTop: '#1a0b3d', bgBottom: '#0b3d5c' } },
};
export const SKIN_ORDER = ['CLASSIC', 'THANKSGIVING', 'CHRISTMAS', 'PARTY'];
export const SKIN_STORAGE_KEY = 'blink_skin';

const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

// November defaults to Thanksgiving, December to Christmas, otherwise Classic.
export function seasonalSkin(date = new Date()) {
    const month = date.getMonth();
    if (month === 10) return 'THANKSGIVING';
    if (month === 11) return 'CHRISTMAS';
    return 'CLASSIC';
}

// A picked skin is remembered for the rest of that calendar month only, so a
// Thanksgiving pick never lingers into December.
export function resolveSkin(stored, date = new Date()) {
    const [id, month] = typeof stored === 'string' ? stored.split('@') : [];
    return SKINS[id] && month === monthKey(date) ? id : seasonalSkin(date);
}
export function storedSkinValue(id, date = new Date()) {
    if (!SKINS[id]) throw new Error('Unknown skin');
    return `${id}@${monthKey(date)}`;
}

// Face geometry from MediaPipe Face Mesh landmarks (normalized 0..1).
// 10 = top of forehead, 152 = chin, 234/454 = sides of the face.
export function faceFrame(landmarks, width, height) {
    if (!Array.isArray(landmarks) || landmarks.length < 455 || !(width > 0) || !(height > 0)) return null;
    const point = index => {
        const p = landmarks[index];
        return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x * width, y: p.y * height } : null;
    };
    const top = point(10), chin = point(152), left = point(234), right = point(454);
    if (!top || !chin || !left || !right) return null;
    const faceWidth = Math.hypot(right.x - left.x, right.y - left.y);
    const faceHeight = Math.hypot(chin.x - top.x, chin.y - top.y);
    if (faceWidth < 8 || faceHeight < 8) return null;
    const center = { x: (left.x + right.x + top.x + chin.x) / 4, y: (left.y + right.y + top.y + chin.y) / 4 };
    return { top, chin, left, right, center, width: faceWidth, height: faceHeight,
        angle: Math.atan2(right.y - left.y, right.x - left.x),
        // Forehead distance from the center, in face-width units, for hat placement.
        topOffset: Math.hypot(top.x - center.x, top.y - center.y) / faceWidth };
}

// ---------- Headwear (drawn in face units: origin = face center, 1 unit = face width) ----------

function pilgrimHat(ctx, f) {
    const y = -f.topOffset + 0.04;
    // Turkey tail feathers fan out behind the head.
    const feathers = ['#7a2e0e', '#d9822b', '#f2c14e', '#b5451b', '#e2572b', '#8b5a2b', '#f2c14e', '#d9822b', '#7a2e0e'];
    feathers.forEach((color, i) => {
        // Upper arc only, pivoting near the forehead, so feathers frame the face instead of covering it.
        const a = -Math.PI * 0.95 + (i + 0.5) * (Math.PI * 0.9 / feathers.length);
        ctx.save();
        ctx.translate(Math.cos(a) * 0.78, y - 0.05 + Math.sin(a) * 0.62);
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath(); ctx.ellipse(0, 0, 0.13, 0.36, 0, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, -0.2, 0.06, 0.08, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#3b1a08'; ctx.fill();
        ctx.restore();
    });
    // Black buckle hat.
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath(); ctx.ellipse(0, y, 0.8, 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.44, y); ctx.lineTo(-0.37, y - 0.78); ctx.lineTo(0.37, y - 0.78); ctx.lineTo(0.44, y);
    ctx.closePath(); ctx.fillStyle = '#262626'; ctx.fill();
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(-0.42, y - 0.3, 0.84, 0.16);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 0.045;
    ctx.strokeRect(-0.12, y - 0.33, 0.24, 0.22);
}

function santaHat(ctx, f) {
    const y = -f.topOffset + 0.06;
    ctx.beginPath();
    ctx.moveTo(-0.56, y - 0.05);
    ctx.quadraticCurveTo(-0.36, y - 0.98, 0.22, y - 1.02);
    ctx.quadraticCurveTo(0.62, y - 0.98, 0.74, y - 0.5);
    ctx.lineTo(0.56, y - 0.05);
    ctx.closePath();
    ctx.fillStyle = '#d62828'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.1, y - 0.9); ctx.quadraticCurveTo(0.5, y - 0.85, 0.62, y - 0.52);
    ctx.lineWidth = 0.05; ctx.strokeStyle = '#a61b1b'; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, -0.64, y - 0.16, 1.28, 0.24, 0.12); ctx.fill();
    ctx.beginPath(); ctx.arc(0.74, y - 0.48, 0.14, 0, Math.PI * 2); ctx.fill();
}

function partyHat(ctx, f) {
    const y = -f.topOffset + 0.02;
    ctx.save();
    ctx.translate(0.08, y + 0.04);
    ctx.rotate(0.14);
    ctx.beginPath(); ctx.moveTo(-0.32, 0); ctx.lineTo(0, -0.95); ctx.lineTo(0.32, 0); ctx.closePath();
    ctx.fillStyle = '#7b5cff'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(-0.6, -0.12 - i * 0.2); ctx.lineTo(0.6, -0.32 - i * 0.2);
        ctx.lineTo(0.6, -0.4 - i * 0.2); ctx.lineTo(-0.6, -0.2 - i * 0.2); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#ff5fd2';
    ctx.beginPath(); ctx.arc(0, -0.98, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

const HEADWEAR = { THANKSGIVING: pilgrimHat, CHRISTMAS: santaHat, PARTY: partyHat };

export function drawHeadwear(ctx, skinId, landmarks, width, height) {
    const draw = HEADWEAR[skinId];
    const f = draw && faceFrame(landmarks, width, height);
    if (!f) return false;
    ctx.save();
    ctx.translate(f.center.x, f.center.y);
    ctx.rotate(f.angle);
    ctx.scale(f.width, f.width);
    draw(ctx, f);
    ctx.restore();
    return true;
}

// ---------- Falling leaves, snow and confetti ----------

const seeded = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const PARTICLES = {
    THANKSGIVING: { count: 18, colors: ['#d9822b', '#b5451b', '#f2c14e', '#8b3a1a'], speed: 0.05, shape: 'leaf' },
    CHRISTMAS: { count: 36, colors: ['#ffffff'], speed: 0.07, shape: 'snow' },
    PARTY: { count: 30, colors: ['#ffd23f', '#ff5fd2', '#30f2d5', '#7b5cff'], speed: 0.09, shape: 'confetti' },
};

export function drawAmbient(ctx, skinId, width, height, timeMs = 0, area = null) {
    const p = PARTICLES[skinId];
    if (!p || !(width > 0) || !(height > 0)) return false;
    const unit = Math.min(width, height) / 100;
    const t = timeMs / 1000;
    ctx.save();
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < p.count; i++) {
        const x = ((seeded(i) + Math.sin(t * 0.6 + i) * 0.02) % 1) * width;
        const y = ((seeded(i + 99) + t * p.speed * (0.6 + seeded(i + 7))) % 1) * height;
        if (area && !area(x, y)) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * (1 + seeded(i + 3)) + i);
        ctx.fillStyle = p.colors[i % p.colors.length];
        const size = unit * (1.2 + seeded(i + 11) * 1.4);
        ctx.beginPath();
        if (p.shape === 'snow') ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2);
        else if (p.shape === 'leaf') ctx.ellipse(0, 0, size * 1.3, size * 0.6, 0, 0, Math.PI * 2);
        else ctx.rect(-size * 0.7, -size * 0.35, size * 1.4, size * 0.7);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
    return true;
}

// Called for every camera frame on the display canvas. Accepts one face's
// landmarks or Face Mesh's list of faces (head-to-head puts a hat on everyone).
export function drawSkinOverlay(ctx, skinId, faces, width, height, timeMs) {
    if (!HEADWEAR[skinId]) return;
    drawAmbient(ctx, skinId, width, height, timeMs);
    const list = Array.isArray(faces) && Array.isArray(faces[0]) ? faces : [faces];
    for (const landmarks of list.slice(0, 2)) drawHeadwear(ctx, skinId, landmarks, width, height);
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Words for the shareable photo, from the round's outcome.
export function selfieCaption({ reason, mode, elapsed, target, score }) {
    const time = Number.isFinite(elapsed) ? `${Math.max(0, elapsed).toFixed(2)}s` : '';
    if (mode === 'FLASH') {
        const ms = Number.isFinite(score) ? Math.round(score) : 0;
        return { headline: `${ms} MS!`, detail: 'Fastest blink after the flash. Your turn?' };
    }
    if (mode === 'BEAT') {
        const n = Number.isFinite(score) ? score : 0;
        return { headline: `${n} NOTE${n === 1 ? '' : 'S'} HIT!`, detail: 'Hit the beat just by blinking. Your turn?' };
    }
    if (mode === 'BALLOON') {
        const n = Number.isFinite(score) ? score : 0;
        return { headline: `${n} BALLOON${n === 1 ? '' : 'S'} POPPED!`, detail: 'Popped just by blinking. Your turn?' };
    }
    if (reason === 'DISQUALIFIED') return { headline: 'FACE LOST!', detail: 'Stay in frame next time' };
    if (reason === 'WIN_ENDURANCE' || reason === 'WIN_SURPRISE') return { headline: 'EYES OF STEEL', detail: 'Survived all 30 seconds without blinking' };
    if (mode === 'PRECISION' && Number.isFinite(target)) return { headline: 'CAUGHT BLINKING!', detail: `Blinked at ${time} · target ${target}s` };
    return { headline: 'CAUGHT BLINKING!', detail: `Lasted ${time} without blinking` };
}

// Builds the 4:5 photo players share: their mirrored camera frame (as they saw it,
// headwear included) inside a holiday frame with the result. JPEG data URL.
export function composeSelfie(source, skinId, caption, doc = globalThis.document) {
    const skin = SKINS[skinId] || SKINS.CLASSIC, c = skin.colors;
    const W = 1080, H = 1350;
    const out = doc.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, W, H);
    gradient.addColorStop(0, c.bgTop); gradient.addColorStop(1, c.bgBottom);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);

    const px = 70, py = 190, pw = 940, ph = 860;
    const sw = source?.width, sh = source?.height;
    ctx.save();
    roundRect(ctx, px, py, pw, ph, 36); ctx.clip();
    ctx.fillStyle = '#000'; ctx.fillRect(px, py, pw, ph);
    if (sw > 0 && sh > 0) {
        const scale = Math.max(pw / sw, ph / sh);
        const cw = pw / scale, ch = ph / scale;
        ctx.translate(px + pw, py);
        ctx.scale(-1, 1); // Mirror, matching the preview players saw.
        ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, pw, ph);
    }
    ctx.restore();
    ctx.lineWidth = 10; ctx.strokeStyle = c.primary;
    roundRect(ctx, px, py, pw, ph, 36); ctx.stroke();

    // Decorations around the frame only, never over faces.
    drawAmbient(ctx, skinId, W, H, 4200, (x, y) => y < py - 10 || y > py + ph + 10 || x < px - 10 || x > px + pw + 10);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const text = (value, y, size, color) => {
        ctx.fillStyle = color; ctx.font = `bold ${size}px system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
        ctx.fillText(value, W / 2, y, W - 120);
    };
    text(`${skin.icon} ${skin.greeting} ${skin.icon}`, 105, 64, c.primary);
    text(caption?.headline || 'CAUGHT BLINKING!', 1125, 76, c.text);
    text(caption?.detail || '', 1200, 40, c.muted);
    text('Your turn! Play free at playblinkstop.com  #BlinkStop', 1278, 32, c.secondary);
    return out.toDataURL('image/jpeg', 0.88);
}
