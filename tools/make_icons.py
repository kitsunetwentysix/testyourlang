"""Рисует иконки приложения: символ § на тёмно-зелёном фоне."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BG = (31, 92, 74)
GOLD = (226, 196, 128)
FONT = "C:/Windows/Fonts/georgiab.ttf"


def make(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    pad = size * 0.09
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=size * 0.12,
                        outline=GOLD, width=max(2, size // 60))
    font = ImageFont.truetype(FONT, int(size * 0.6))
    d.text((size / 2, size / 2 + size * 0.02), "§", font=font, fill=GOLD, anchor="mm")
    return img


for s in (180, 192, 512):
    make(s).save(ROOT / f"icon-{s}.png")
print("ok")
