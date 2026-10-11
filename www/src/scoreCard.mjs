import { resultDetails, challengeCode } from './share.mjs';

// A photo-free 9:16 card; no camera/video element is read by this renderer.
export function drawScoreCard(canvas, result) {
    const r = resultDetails(result), code = challengeCode(r);
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1920);
    gradient.addColorStop(0, '#081520'); gradient.addColorStop(1, '#230d35');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1920);
    ctx.strokeStyle = '#30f2d5'; ctx.lineWidth = 4;
    ctx.strokeRect(70, 90, 940, 1740);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const text = (value, y, size, color = '#ffffff') => {
        ctx.fillStyle = color; ctx.font = `bold ${size}px system-ui, sans-serif`;
        ctx.fillText(value, 540, y, 850);
    };
    text('BLINK STOP', 260, 92, '#30f2d5');
    text(`${r.label.toUpperCase()} CHALLENGE`, 385, 38, '#ddc5ff');
    ctx.beginPath(); ctx.ellipse(540, 640, 190, 100, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(540, 640, 58, 0, Math.PI * 2); ctx.fillStyle = '#30f2d5'; ctx.fill();
    text(r.metric, 895, 132);
    text(r.detail, 1035, 34, '#bfc7d5');
    text(r.invitation, 1210, 47, '#30f2d5');
    if (code) {
        text('YOUR TURN', 1390, 35, '#ddc5ff');
        text(code, 1480, 42);
        text('www.playblinkstop.com', 1570, 32, '#bfc7d5');
        text('Paste the code. Play. Send yours back.', 1620, 28, '#bfc7d5');
    } else text('A fresh modifier. Same blink challenge.', 1510, 34, '#bfc7d5');
    text('#BlinkStop', 1735, 40, '#ddc5ff');
    return canvas.toDataURL('image/png');
}
