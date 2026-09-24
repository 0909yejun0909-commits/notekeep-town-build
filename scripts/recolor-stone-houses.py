#!/usr/bin/env python3
"""Recolor a Stone house sprite's plaster gable to match its stone foundation.

Kenmi's Stone house art draws a half-timber look: gray stone foundation,
colored plaster gable above it (tan/green/red — one of the "wall color"
options). We only install the Base wall color for Stone (see
lib/houseCatalog.ts's availableWallColors), but Base's gable is still tan
plaster, not stone — this recolors it in place so Stone renders as a single
uniform material, matching Limestone.

The colored-plaster pixels are found by diffing the Green and Red source
variants (whichever pixels differ between them are exactly the wall-color
area — door/window/roof/trim never change with wall color, so this never
touches them), then those positions are remapped in the installed Base file
from the tan palette to the gray palette already used on the foundation.
Both palettes are fixed across the whole Kenmi Stone house set (verified
against every shape/roof combo), so the mapping needs no per-image lookup.
"""
import sys
from pathlib import Path
from PIL import Image

TAN_TO_GRAY = {
    (145, 83, 59, 255): (124, 111, 106, 255),
    (116, 63, 57, 255): (92, 88, 87, 255),
    (184, 111, 80, 255): (162, 135, 124, 255),
}

def main():
    src_dir, dst_path, shape, roof = sys.argv[1:5]
    src_dir = Path(src_dir)
    dst_path = Path(dst_path)

    green_path = src_dir / f"House_{shape}_Stone_Green_{roof}.png"
    red_path = src_dir / f"House_{shape}_Stone_Red_{roof}.png"
    if not (green_path.exists() and red_path.exists()):
        # This shape has no colored plaster variant in the source pack — its
        # Base art is already uniformly stone (e.g. shape index 3). Nothing to do.
        return

    green = Image.open(green_path).convert("RGBA")
    red = Image.open(red_path).convert("RGBA")
    out = Image.open(dst_path).convert("RGBA")
    assert green.size == red.size == out.size, f"size mismatch for {dst_path}"

    gp, rp, op = green.load(), red.load(), out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            if gp[x, y] != rp[x, y]:
                mapped = TAN_TO_GRAY.get(op[x, y])
                if mapped is not None:
                    op[x, y] = mapped

    out.save(dst_path)

if __name__ == "__main__":
    main()
