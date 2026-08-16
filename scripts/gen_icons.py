#!/usr/bin/env python3
"""生成 XCPO 插件图标：深色圆角盾牌 + 白色禁止符（斜杠圆）。"""
import os
from PIL import Image, ImageDraw

SIZES = [16, 32, 48, 128]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")
os.makedirs(OUT, exist_ok=True)

SS = 4  # 超采样倍数


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def make_icon(size):
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 盾牌底色（X 品牌深色 + 蓝色渐变感）
    pad = int(s * 0.06)
    rounded_rect(d, (pad, pad, s - pad, s - pad), int(s * 0.22), (15, 20, 25, 255))
    # 顶部高光
    rounded_rect(d, (pad, pad, s - pad, int(s * 0.34)), int(s * 0.22), (29, 155, 240, 255))
    # 蓝条
    d.rectangle((pad, int(s * 0.30), s - pad, int(s * 0.34)), fill=(29, 155, 240, 255))

    # 白色禁止符：圆 + 斜线
    cx, cy = s / 2, s * 0.58
    r = s * 0.26
    lw = max(int(s * 0.075), 3)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 255, 255, 255), width=lw)
    a = 0.7  # 斜线角度
    dx, dy = r * 0.62, r * 0.62
    d.line((cx - dx, cy - dy, cx + dx, cy + dy), fill=(255, 255, 255, 255), width=lw)

    img = img.resize((size, size), Image.LANCZOS)
    return img


for s in SIZES:
    make_icon(s).save(os.path.join(OUT, f"icon{s}.png"))
    print(f"icons/icon{s}.png ok")
