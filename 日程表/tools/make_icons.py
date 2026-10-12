# 生成应用图标：深蓝紫渐变 + 对勾 + 星光
from PIL import Image, ImageDraw
import math, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(OUT, exist_ok=True)

C1 = (109, 94, 252)    # #6d5efc
C2 = (167, 139, 250)   # #a78bfa
C3 = (79, 70, 229)     # #4f46e5


def gradient(size):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x / size * 0.45 + y / size * 0.55)
            if t < 0.55:
                k = t / 0.55
                c = tuple(int(C3[i] + (C1[i] - C3[i]) * k) for i in range(3))
            else:
                k = (t - 0.55) / 0.45
                c = tuple(int(C1[i] + (C2[i] - C1[i]) * k) for i in range(3))
            px[x, y] = c
    return img


def rounded_mask(size, radius, scale=1.0):
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    inset = (size - size * scale) / 2
    d.rounded_rectangle([inset, inset, size - inset, size - inset], radius=radius * scale, fill=255)
    return m


def sparkle(d, cx, cy, r, fill):
    pts = []
    for i in range(8):
        a = math.pi * 2 * i / 8
        rr = r if i % 2 == 0 else r * 0.30
        pts.append((cx + math.cos(a - math.pi / 2) * rr, cy + math.sin(a - math.pi / 2) * rr))
    d.polygon(pts, fill=fill)


def make(size, scale=1.0, maskable=False):
    base = gradient(size)
    img = base.convert('RGBA')
    s = int(size * scale)

    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # 半透明白色圆角卡片，让对勾更清晰
    pad = (size - s) / 2
    d.rounded_rectangle([pad, pad, pad + s, pad + s], radius=s * 0.26, fill=(255, 255, 255, 46))

    # 对勾
    w = max(6, int(s * 0.108))
    p1 = (pad + s * 0.24, pad + s * 0.53)
    p2 = (pad + s * 0.43, pad + s * 0.71)
    p3 = (pad + s * 0.78, pad + s * 0.30)
    d.line([p1, p2], fill=(255, 255, 255, 255), width=w, joint='curve')
    d.line([p2, p3], fill=(255, 255, 255, 255), width=w, joint='curve')
    for p in (p1, p2, p3):
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=(255, 255, 255, 255))

    # 星光
    sparkle(d, pad + s * 0.80, pad + s * 0.71, s * 0.085, (255, 255, 255, 235))
    sparkle(d, pad + s * 0.19, pad + s * 0.24, s * 0.05, (255, 255, 255, 170))

    img = Image.alpha_composite(img, layer)

    if maskable:
        # 可遮罩图标：整块渐变铺满，内容留在安全区内
        full = gradient(size).convert('RGBA')
        img = Image.alpha_composite(full, layer)
        return img.convert('RGB')
    mask = rounded_mask(size, size * 0.23, scale)
    out = Image.new('RGB', (size, size), (15, 16, 32))
    out.paste(img.convert('RGB'), (0, 0), mask)
    return out


targets = [
    ('icon-192.png', 192, 1.0, False),
    ('icon-512.png', 512, 1.0, False),
    ('icon-180.png', 180, 1.0, False),
    ('icon-maskable-512.png', 512, 0.66, True),
    ('icon-32.png', 32, 1.0, False),
]
for name, size, scale, maskable in targets:
    im = make(size, scale, maskable)
    path = os.path.join(OUT, name)
    im.save(path, 'PNG', optimize=True)
    print('saved', name, im.size)
