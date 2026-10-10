"""Generate Blink Stop launch assets from original vector-like shapes. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
NAVY = (5, 9, 23)
CYAN = (30, 235, 244)
CORAL = (255, 69, 95)


def curve(points, steps=40):
    a, b, c, d = points
    return [((1-t)**3*a[0]+3*(1-t)**2*t*b[0]+3*(1-t)*t*t*c[0]+t**3*d[0],
             (1-t)**3*a[1]+3*(1-t)**2*t*b[1]+3*(1-t)*t*t*c[1]+t**3*d[1])
            for t in (i/steps for i in range(steps+1))]


def eye(size=1024):
    """Transparent emblem: open-eye silhouette, closing eyelid, and stop pupil."""
    s = size / 1024
    img = Image.new('RGBA', (size, size))
    d = ImageDraw.Draw(img)
    pt = lambda xy: [(round(x*s), round(y*s)) for x, y in xy]
    upper = curve([(166, 512), (348, 240), (676, 240), (858, 512)])
    lower = curve([(858, 512), (676, 784), (348, 784), (166, 512)])
    d.polygon(pt(upper+lower), fill=(11, 31, 48, 255))
    d.line(pt(upper), fill=(*CYAN, 255), width=round(37*s), joint='curve')
    d.line(pt(lower), fill=(68, 170, 190, 255), width=round(25*s), joint='curve')
    d.ellipse((round(357*s), round(357*s), round(667*s), round(667*s)), fill=(13, 56, 73, 255), outline=(*CYAN, 255), width=round(17*s))
    d.ellipse((round(407*s), round(407*s), round(617*s), round(617*s)), fill=(*CORAL, 255))
    d.rounded_rectangle((round(462*s), round(432*s), round(562*s), round(592*s)), radius=round(11*s), fill=(*NAVY, 255))
    d.line(pt(curve([(191, 485), (355, 591), (665, 591), (833, 485)])), fill=(255, 139, 151, 255), width=round(13*s), joint='curve')
    return img


def background(size):
    img = Image.new('RGB', (size, size), NAVY)
    d = ImageDraw.Draw(img)
    for y in range(size):
        p = y/size
        d.line((0, y, size, y), fill=(5+round(5*p), 9+round(12*p), 23+round(20*p)))
    return img


def icon(size):
    big = background(1024).convert('RGBA')
    glow = eye(1024).filter(ImageFilter.GaussianBlur(38))
    glow.putalpha(ImageEnhance.Brightness(glow.getchannel('A')).enhance(0.33))
    big.alpha_composite(glow)
    big.alpha_composite(eye())
    return big.convert('RGB').resize((size, size), Image.Resampling.LANCZOS)


def splash(width, height):
    # A restrained centered mark survives both portrait and landscape scaleAspectFill crops.
    base = Image.new('RGB', (width, height), NAVY)
    draw = ImageDraw.Draw(base)
    step = min(width, height)
    mark_size = round(step*.48)
    mark = eye(1024).resize((mark_size, mark_size), Image.Resampling.LANCZOS)
    x, y = (width-mark_size)//2, (height-mark_size)//2-round(step*.045)
    base.paste(mark, (x, y), mark)
    font_path = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
    if Path(font_path).exists():
        font = ImageFont.truetype(font_path, max(14, round(step*.055)))
        draw.text((width//2, y+mark_size-round(step*.035)), 'BLINK  STOP', font=font,
                  fill=CYAN, anchor='mt', stroke_width=0)
    return base


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def main():
    ios = ROOT/'ios/App/App/Assets.xcassets'
    save(icon(1024), ios/'AppIcon.appiconset/AppIcon-512@2x.png')
    for path in (ios/'Splash.imageset').glob('*.png'):
        save(splash(2732, 2732), path)
    res = ROOT/'android/app/src/main/res'
    for density, px in [('mdpi',48), ('hdpi',72), ('xhdpi',96), ('xxhdpi',144), ('xxxhdpi',192)]:
        folder = res/f'mipmap-{density}'
        save(icon(px), folder/'ic_launcher.png')
        round_icon = icon(px).convert('RGBA')
        mask = Image.new('L', (px, px))
        ImageDraw.Draw(mask).ellipse((0, 0, px-1, px-1), fill=255)
        round_icon.putalpha(mask)
        save(round_icon, folder/'ic_launcher_round.png')
        fg_size = round(px*2.25)
        foreground = eye(1024).resize((round(fg_size*.85), round(fg_size*.85)), Image.Resampling.LANCZOS)
        adaptive = Image.new('RGBA', (fg_size, fg_size))
        adaptive.alpha_composite(foreground, ((fg_size-foreground.width)//2, (fg_size-foreground.height)//2))
        save(adaptive, folder/'ic_launcher_foreground.png')
    for path in res.glob('drawable*/splash.png'):
        with Image.open(path) as existing:
            width, height = existing.size
        save(splash(width, height), path)
    save(icon(192), ROOT/'icons/icon-192.png')
    save(icon(512), ROOT/'icons/icon-512.png')


if __name__ == '__main__':
    main()
