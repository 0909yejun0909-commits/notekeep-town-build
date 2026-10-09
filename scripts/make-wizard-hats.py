#!/usr/bin/env python3
"""Generate pointed wizard hats from Kenmi's Farmer hat layer.

The Farmer hat sheet is already aligned to the player's head in every animation frame, so each
wizard hat is that sheet with the straw recolored into a hat colour (the three yellow shades map
to light/mid/dark) and a cone drawn above each frame's brim, in the sheet's own outline colour.
Usage: make-wizard-hats.py <Farmer_Hat_1.png> <out-dir>   (writes wizard-hat-<colour>.png)
"""
import sys
from pathlib import Path
from PIL import Image

CELL = 64
OUTLINE = (14, 7, 27, 255)
STRAW = {(254, 231, 97, 255): 0, (255, 200, 37, 255): 1, (255, 162, 20, 255): 2}
# light, mid, dark
PALETTES = {
    'purple': [(176, 140, 230, 255), (130, 92, 196, 255), (92, 58, 150, 255)],
    'blue': [(130, 190, 240, 255), (70, 130, 210, 255), (40, 86, 160, 255)],
    'black': [(110, 110, 134, 255), (66, 66, 88, 255), (40, 40, 58, 255)],
    'red': [(240, 134, 122, 255), (205, 72, 72, 255), (150, 40, 52, 255)],
}
CONE_HEIGHT = 12


def half_width(k):
    return 4 - k // 4  # 4,4,4,4,3,3,3,3,2,2,2,2


def tip_shift(k):
    return 0 if k < 7 else (1 if k < 10 else 2)  # the tip leans over


def make(src, palette):
    out = Image.new('RGBA', src.size, (0, 0, 0, 0))
    for r in range(src.height // CELL):
        for c in range(src.width // CELL):
            box = (c * CELL, r * CELL, c * CELL + CELL, r * CELL + CELL)
            cell = src.crop(box)
            bbox = cell.getbbox()
            if not bbox:
                continue
            px = cell.load()
            for y in range(CELL):
                for x in range(CELL):
                    if px[x, y] in STRAW:
                        px[x, y] = palette[STRAW[px[x, y]]]
            x0, y0, x1, _ = bbox
            cx = (x0 + x1 - 1) // 2
            body = set()
            for k in range(CONE_HEIGHT):
                y = y0 - 1 - k
                if y < 1:
                    break
                hw = half_width(k)
                for x in range(cx - hw + tip_shift(k), cx + hw + tip_shift(k) + 1):
                    body.add((x, y))
            for (x, y) in body:
                span = [bx for (bx, by) in body if by == y]
                lo, hi = min(span), max(span)
                third = (hi - lo + 1) / 3
                shade = 0 if x < lo + third else (2 if x > hi - third else 1)
                if 0 <= x < CELL:
                    px[x, y] = palette[shade]
            for (x, y) in body:
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1)):
                    if (nx, ny) not in body and 0 <= nx < CELL and 0 <= ny < CELL and px[nx, ny][3] == 0:
                        px[nx, ny] = OUTLINE
            out.paste(cell, box[:2])
    return out


def main():
    src = Image.open(sys.argv[1]).convert('RGBA')
    dest = Path(sys.argv[2])
    dest.mkdir(parents=True, exist_ok=True)
    for name, palette in PALETTES.items():
        make(src, palette).save(dest / f'wizard-hat-{name}.png')
    print(f'wrote {len(PALETTES)} wizard hats to {dest}')


if __name__ == '__main__':
    main()
