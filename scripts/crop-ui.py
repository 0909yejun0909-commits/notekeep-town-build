#!/usr/bin/env python3
"""Cut the title screen's UI pieces out of Kenmi's UI sprite sheets.

CSS border-image can't address a sub-rect of a sprite sheet, so each piece
the title menu stretches (components/TitleMenu.tsx) is saved as its own PNG.
Rects are tight bounding boxes measured from the sheets' alpha channel.
"""
import sys
from pathlib import Path
from PIL import Image

INK = (63, 40, 50, 255)

PIECES = [
    # Parchment panel with rivet corners; outlined below, then 9-sliced at 9px.
    ("UI_Frames.png", (1112, 8, 32, 32), "parchment.png", True),
    # Flat banner ribbon; columns 24-39 are identical, so it 3-slices at 24px.
    ("UI_Ribbons.png", (8, 1, 64, 20), "ribbon.png", False),
    # White right-pointing triangle, the menu cursor.
    ("UI_Icons.png", (149, 178, 7, 12), "cursor.png", False),
]

def outline(im):
    """Trace a 1px ink outline around the opaque shape. The parchment art has none of its
    own, and doing it in CSS (a drop-shadow filter) leaves seams between the border-image
    slices, while a box-shadow would square off the art's notched corners."""
    w, h = im.size
    out = Image.new("RGBA", (w + 2, h + 2))
    out.paste(im, (1, 1))
    src = out.copy()
    for y in range(h + 2):
        for x in range(w + 2):
            if src.getpixel((x, y))[3]:
                continue
            near = [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
            if any(0 <= nx < w + 2 and 0 <= ny < h + 2 and src.getpixel((nx, ny))[3] for nx, ny in near):
                out.putpixel((x, y), INK)
    return out

def main():
    src_dir, dst_dir = Path(sys.argv[1]), Path(sys.argv[2])
    for sheet, (x, y, w, h), name, outlined in PIECES:
        piece = Image.open(src_dir / sheet).convert("RGBA").crop((x, y, x + w, y + h))
        (outline(piece) if outlined else piece).save(dst_dir / name)

if __name__ == "__main__":
    main()
