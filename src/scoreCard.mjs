import { resultDetails, challengeCode } from './share.mjs';
import { SKINS, drawAmbient } from './skins.mjs';

// A photo-free 9:16 card; no camera/video element is read by this renderer.
export function drawScoreCard(canvas, result, skinId = 'CLASSIC') {
    const r = resultDetails(result), code = challengeCode(r);
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    const skin = SKINS[skinId] || SKINS.CLASSIC, c = skin.colors, holiday = skin.id !== 'CLASSIC';
    const primary = holiday ? c.primary : '#30f2d5', accent = holiday ? c.secondary : '#ddc5ff', muted = holiday ? c.muted : '#bfc7d5';
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1920);
    gradient.addColorStop(0, c.bgTop); gradient.addColorStop(1, c.bgBottom);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1920);
    if (holiday) drawAmbient(ctx, skin.id, 1080, 1920, 4200);
    ctx.strokeStyle = primary; ctx.lineWidth = 4;
    ctx.strokeRect(70, 90, 940, 1740);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const text = (value, y, size, color = '#ffffff') => {
        ctx.fillStyle = color; ctx.font = `bold ${size}px system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
        ctx.fillText(value, 540, y, 850);
    };
    if (holiday) text(`${skin.icon} ${skin.greeting} ${skin.icon}`, 175, 44, accent);
    text('BLINK STOP', 260, 92, primary);
    text(`${r.label.toUpperCase()} CHALLENGE`, 385, 38, accent);
    ctx.beginPath(); ctx.ellipse(540, 640, 190, 100, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(540, 640, 58, 0, Math.PI * 2); ctx.fillStyle = primary; ctx.fill();
    text(r.metric, 895, 132);
    text(r.detail, 1035, 34, muted);
    text(r.invitation, 1210, 47, primary);
    if (code) {
        text('YOUR TURN', 1390, 35, accent);
        text(code, 1480, 42);
        text('www.playblinkstop.com', 1570, 32, muted);
        text('Paste the code. Play. Send yours back.', 1620, 28, muted);
    } else text('A fresh modifier. Same blink challenge.', 1510, 34, muted);
    text('#BlinkStop', 1735, 40, accent);
    return canvas.toDataURL('image/png');
}
