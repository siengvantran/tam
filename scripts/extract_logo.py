"""Cut the official TAM logo assets out of the original artwork.

The trademark is never redrawn: every asset is a crop of
public/img/tam-logo-original.jpg with the black background made
transparent. Gold pixels keep their original colour; only the dark
anti-aliased edge becomes partly transparent.

    python3 scripts/extract_logo.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public/img/tam-logo-original.jpg"
OUT = ROOT / "public/img"

# Geometry measured from the original (2000 x 1116).
CX, CY, R = 1004, 555, 401          # the circular mark
WORD = (784, 1001, 1226, 1110)      # the "TAM" wordmark
FULL = (470, 0, 1530, 1116)         # everything

LO, HI = 22, 70  # background noise floor -> fully opaque


def transparent(rgb: Image.Image) -> Image.Image:
    a = np.asarray(rgb.convert("RGB")).astype(np.float32)
    lum = a.max(axis=2)
    alpha = np.clip((lum - LO) / (HI - LO), 0, 1) * 255
    rgba = np.dstack([a, alpha]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def save(img: Image.Image, name: str, width: int | None = None) -> None:
    if width and img.width != width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(OUT / name, optimize=True)
    print(f"{name:28} {img.width}x{img.height}  {(OUT / name).stat().st_size // 1024} KB")


def main() -> None:
    src = Image.open(SRC).convert("RGB")

    full = transparent(src.crop(FULL))
    save(full, "tam-logo.png")
    save(full, "tam-logo-640.png", 640)

    save(transparent(src.crop(WORD)), "tam-wordmark.png")
    save(transparent(src.crop(WORD)), "tam-wordmark-160.png", 160)

    # The circular mark alone: a square crop, with anything outside the
    # circle (the arc lettering) cleared.
    pad = 12
    box = (CX - R - pad, CY - R - pad, CX + R + pad + 1, CY + R + pad + 1)
    mark = transparent(src.crop(box))
    yy, xx = np.mgrid[0:mark.height, 0:mark.width]
    inside = ((xx - (R + pad)) ** 2 + (yy - (R + pad)) ** 2) <= (R + pad) ** 2
    px = np.asarray(mark).copy()
    px[..., 3] = np.where(inside, px[..., 3], 0)
    mark = Image.fromarray(px, "RGBA")
    save(mark, "tam-mark.png", 512)
    save(mark, "tam-mark-96.png", 96)
    save(mark, "apple-touch-icon.png", 180)
    save(mark, "favicon-48.png", 48)

    # Social card: the original artwork, as-is, centred on black.
    card = Image.new("RGB", (1200, 630), (0, 0, 0))
    art = src.copy()
    art.thumbnail((1200, 630), Image.LANCZOS)
    card.paste(art, ((1200 - art.width) // 2, (630 - art.height) // 2))
    card.save(OUT / "og.jpg", quality=90)
    print("og.jpg                       1200x630")


if __name__ == "__main__":
    main()
