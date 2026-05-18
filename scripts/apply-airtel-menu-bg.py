#!/usr/bin/env python3
"""Recolor native menu / mission-result backgrounds from blue to Airtel orange."""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "game-data" / "files" / "assets"

# Airtel shell gradient: #ff6b00 → #e60000 → #b71c1c
GRADIENT_TOP = (255, 180, 120)
GRADIENT_MID = (255, 107, 0)
GRADIENT_BOTTOM = (183, 28, 28)

LABEL_BLUE = (0, 93, 170)
LABEL_ORANGE = (200, 55, 0)


def write_orange_gradient(path: Path) -> None:
    h = 12
    im = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(h - 1, 1)
        if t < 0.5:
            u = t / 0.5
            r = int(GRADIENT_TOP[0] + (GRADIENT_MID[0] - GRADIENT_TOP[0]) * u)
            g = int(GRADIENT_TOP[1] + (GRADIENT_MID[1] - GRADIENT_TOP[1]) * u)
            b = int(GRADIENT_TOP[2] + (GRADIENT_MID[2] - GRADIENT_TOP[2]) * u)
        else:
            u = (t - 0.5) / 0.5
            r = int(GRADIENT_MID[0] + (GRADIENT_BOTTOM[0] - GRADIENT_MID[0]) * u)
            g = int(GRADIENT_MID[1] + (GRADIENT_BOTTOM[1] - GRADIENT_MID[1]) * u)
            b = int(GRADIENT_MID[2] + (GRADIENT_BOTTOM[2] - GRADIENT_MID[2]) * u)
        im.putpixel((0, y), (r, g, b))
    im.save(path, optimize=True)
    print("wrote", path.relative_to(ROOT))


def copy_orange_pattern(dest: Path) -> None:
    src = ASSETS / "45190477" / "1" / "BG_Menu_default_Pattern.png"
    shutil.copy2(src, dest)
    print("copied orange pattern →", dest.relative_to(ROOT))


def recolor_blue_ui(path: Path, tolerance: int = 80) -> None:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            if b > r + 20 and b > g + 10 and b > 60:
                # Blue UI → warm orange / red (preserve luminance roughly)
                px[x, y] = (
                    min(255, int(r * 0.3 + 200)),
                    min(255, int(g * 0.4 + 50)),
                    min(255, int(b * 0.15 + 20)),
                    a,
                )
    im.save(path, optimize=True)
    print("recolored", path.relative_to(ROOT))


def main() -> None:
    write_orange_gradient(ASSETS / "45191285" / "1" / "BG_Menu_default_Gradient.png")
    copy_orange_pattern(ASSETS / "45191281" / "1" / "BG_Menu_default_Pattern.png")
    label = ASSETS / "45191976" / "1" / "Label_DarkBlue.png"
    if label.exists():
        recolor_blue_ui(label)
    print("\nDone. Hard-refresh the game (Cmd+Shift+R).")


if __name__ == "__main__":
    main()
