#!/usr/bin/env python3
"""Printable Thanksgiving table card with a QR code to the live game.

Writes marketing/thanksgiving-table-card.png and .pdf (5 x 7 in at 300 dpi)
and checks that the QR code decodes back to the play URL.
Needs: pip install qrcode pillow opencv-python-headless
"""
import math
import random
import sys
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont

PLAY_URL = 'https://www.playblinkstop.com/'
DPI = 300
W, H = 5 * DPI, 7 * DPI
OUT = Path(__file__).resolve().parent.parent / 'marketing'

# Thanksgiving skin colors (src/skins.mjs).
BG_TOP, BG_BOTTOM = (59, 26, 8), (138, 52, 16)
PRIMARY, SECONDARY, TEXT, MUTED = (255, 179, 71), (255, 107, 53), (255, 246, 230), (243, 217, 184)
LEAVES = [(217, 130, 43), (181, 69, 27), (242, 193, 78), (139, 58, 26)]

FONT_DIR = Path('/usr/share/fonts/truetype/dejavu')


def font(size, bold=True):
    return ImageFont.truetype(str(FONT_DIR / ('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')), size)


def centered(draw, y, text, size, fill, bold=True):
    f = font(size, bold)
    w = draw.textlength(text, font=f)
    draw.text(((W - w) / 2, y), text, font=f, fill=fill)
    return y + size * 1.25


def leaf(draw, cx, cy, size, angle, color):
    pts = []
    for i in range(24):
        t = i / 24 * 2 * math.pi
        x, y = math.cos(t) * size * 0.45, math.sin(t) * size * (0.9 + 0.15 * math.cos(5 * t))
        pts.append((cx + x * math.cos(angle) - y * math.sin(angle), cy + x * math.sin(angle) + y * math.cos(angle)))
    draw.polygon(pts, fill=color)
    tip = (cx - math.sin(angle) * size * 1.25, cy + math.cos(angle) * size * 1.25)
    draw.line([(cx + math.sin(angle) * size * 0.9, cy - math.cos(angle) * size * 0.9), tip], fill=(90, 40, 15), width=6)


def pilgrim_hat(draw, cx, y, scale):
    brim_w, crown_w, crown_h = 420 * scale, 250 * scale, 230 * scale
    draw.polygon([(cx - crown_w / 2, y + crown_h), (cx - crown_w * 0.42, y), (cx + crown_w * 0.42, y), (cx + crown_w / 2, y + crown_h)], fill=(30, 22, 18))
    draw.rounded_rectangle([cx - brim_w / 2, y + crown_h - 10 * scale, cx + brim_w / 2, y + crown_h + 34 * scale], radius=18 * scale, fill=(30, 22, 18))
    band_y = y + crown_h * 0.62
    draw.rectangle([cx - crown_w * 0.47, band_y, cx + crown_w * 0.47, band_y + 40 * scale], fill=(120, 72, 40))
    draw.rectangle([cx - 34 * scale, band_y - 6 * scale, cx + 34 * scale, band_y + 46 * scale], outline=(242, 193, 78), width=int(12 * scale))


def eye(draw, cx, cy, r):
    draw.ellipse([cx - r * 1.8, cy - r, cx + r * 1.8, cy + r], outline=PRIMARY, width=10)
    draw.ellipse([cx - r * 0.55, cy - r * 0.55, cx + r * 0.55, cy + r * 0.55], fill=PRIMARY)
    draw.ellipse([cx - r * 0.2, cy - r * 0.35, cx + r * 0.05, cy - r * 0.1], fill=TEXT)


def build():
    img = Image.new('RGB', (W, H))
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        draw.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))

    rng = random.Random(1126)
    for _ in range(60):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        if 170 < x < W - 170 and y > 95:
            continue  # leaves stay around the edges, clear of the text
        leaf(draw, x, y, rng.uniform(28, 60), rng.uniform(0, math.pi * 2), rng.choice(LEAVES))

    margin = 70
    draw.rounded_rectangle([margin, margin, W - margin, H - margin], radius=40, outline=PRIMARY, width=10)

    y = 150
    y = centered(draw, y, 'HAPPY THANKSGIVING', 64, SECONDARY)
    pilgrim_hat(draw, W / 2, y + 10, 0.55)
    y += 190
    y = centered(draw, y, 'BLINK STOP', 150, PRIMARY)
    y = centered(draw, y - 10, 'The game you play with your eyes', 52, MUTED, bold=False)

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=20, border=2)
    qr.add_data(PLAY_URL)
    qr.make(fit=True)
    code = qr.make_image(fill_color=(40, 18, 6), back_color=(255, 250, 240)).convert('RGB')
    size = 600
    code = code.resize((size, size), Image.NEAREST)
    qx, qy = (W - size) // 2, int(y + 40)
    draw.rounded_rectangle([qx - 30, qy - 30, qx + size + 30, qy + size + 30], radius=36, fill=(255, 250, 240))
    img.paste(code, (qx, qy))
    y = qy + size + 60
    y = centered(draw, y, 'Scan to play. Free, no app needed.', 50, TEXT)
    y = centered(draw, y, 'playblinkstop.com', 46, PRIMARY, bold=False)

    y += 40
    eye(draw, W / 2, y + 30, 26)
    y += 100
    for title, line in [('ENDURANCE', 'Who can keep their eyes open longest?'),
                        ('PRECISION', 'Blink right on 10 seconds. Closest wins.')]:
        y = centered(draw, y, title, 58, SECONDARY)
        y = centered(draw, y - 6, line, 44, TEXT, bold=False)
        y += 22
    centered(draw, H - margin - 110, 'Pilgrim hat included. Loser does the dishes.', 40, MUTED, bold=False)
    return img


def check(img):
    import cv2
    import numpy as np
    data, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR))
    # Also check a phone-sized copy of the printed card.
    small = img.resize((W // 3, H // 3))
    data_small, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.cvtColor(np.array(small), cv2.COLOR_RGB2BGR))
    return data, data_small


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    card = build()
    decoded, decoded_small = check(card)
    if decoded != PLAY_URL or decoded_small != PLAY_URL:
        sys.exit(f'QR check failed: {decoded!r} / {decoded_small!r}')
    card.save(OUT / 'thanksgiving-table-card.png', dpi=(DPI, DPI))
    card.save(OUT / 'thanksgiving-table-card.pdf', resolution=DPI)
    print(f'QR decodes to {decoded}; wrote {OUT}/thanksgiving-table-card.png and .pdf')
