// Blink reel: one shareable collage of everyone's caught-blinking photos from a party.
import { SKINS } from './skins.mjs';

export const REEL_LIMIT = 9;
export const REEL_SIZE = { width: 1080, height: 1500 };

// Grid that keeps each 4:5 photo whole: 1 photo large, up to 4 in 2 columns, then 3 columns.
export function reelLayout(count) {
    const n = Math.max(0, Math.min(REEL_LIMIT, count));
    if (!n) return [];
    const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const top = 160, bottom = 90, gap = 18, side = 50;
    const areaW = REEL_SIZE.width - side * 2, areaH = REEL_SIZE.height - top - bottom;
    let w = (areaW - gap * (cols - 1)) / cols;
    let h = w * 1.25;
    if (h * rows + gap * (rows - 1) > areaH) { h = (areaH - gap * (rows - 1)) / rows; w = h / 1.25; }
    const gridW = w * cols + gap * (cols - 1), gridH = h * rows + gap * (rows - 1);
    const x0 = (REEL_SIZE.width - gridW) / 2, y0 = top + (areaH - gridH) / 2;
    return Array.from({ length: n }, (_, i) => {
        const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols);
        const rowOffset = (gridW - (w * inRow + gap * (inRow - 1))) / 2; // centre a short last row
        return { x: x0 + rowOffset + (i % cols) * (w + gap), y: y0 + row * (h + gap), w, h };
    });
}

// photos: [{ image, name }] where image is any drawable (loaded Image or canvas).
export function drawReel(photos, skinId, { champion = null, doc = globalThis.document } = {}) {
    const skin = SKINS[skinId] || SKINS.CLASSIC, c = skin.colors;
    const out = doc.createElement('canvas');
    out.width = REEL_SIZE.width; out.height = REEL_SIZE.height;
    const ctx = out.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, out.width, out.height);
    gradient.addColorStop(0, c.bgTop); gradient.addColorStop(1, c.bgBottom);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, out.width, out.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const font = size => `bold ${size}px system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
    ctx.fillStyle = c.primary; ctx.font = font(62);
    ctx.fillText(`${skin.icon} BLINK REEL ${skin.icon}`, out.width / 2, 70, out.width - 80);
    ctx.fillStyle = c.text; ctx.font = font(34);
    ctx.fillText(champion ? `Champion: ${champion}` : 'Caught blinking, every one of us', out.width / 2, 125, out.width - 80);
    const list = photos.slice(0, REEL_LIMIT);
    reelLayout(list.length).forEach((box, i) => {
        const { image, name } = list[i];
        if (image) ctx.drawImage(image, box.x, box.y, box.w, box.h);
        ctx.lineWidth = 6; ctx.strokeStyle = name && name === champion ? c.primary : c.secondary;
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        if (name) {
            const size = Math.max(22, Math.round(box.w / 9));
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(box.x, box.y, box.w, size * 1.6);
            ctx.fillStyle = '#ffffff'; ctx.font = font(size);
            ctx.fillText(name === champion ? `👑 ${name}` : name, box.x + box.w / 2, box.y + size * 0.8, box.w - 16);
        }
    });
    ctx.fillStyle = c.secondary; ctx.font = font(32);
    ctx.fillText('playblinkstop.com  #BlinkStop', out.width / 2, out.height - 45, out.width - 80);
    return out.toDataURL('image/jpeg', 0.86);
}
