# Redraws Pixelify Sans's digits for the town's UI font (public/fonts/PixelifySans-Town.woff2):
#   pip install fonttools brotli
#   python3 scripts/fonts/pixelify-digits.py PixelifySans-400.woff2 public/fonts/PixelifySans-Town.woff2
# (the regular weight from the @fontsource/pixelify-sans package, latin subset).
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen

# Pixelify Sans's digits, redrawn on its own pixel grid (5 x 7 cells from x = 60, y = -12) so
# they read as plain digits (its 5 is S-shaped and its 2 hooked) with every stroke joined: where
# two cells meet only at a corner, a small square over the corner bridges them.
src, dst = sys.argv[1], sys.argv[2]
DIGITS = {
    '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    '1': ['.##..', '#.#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['.###.', '#...#', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
}
XE = [60 + 91 * i for i in range(6)]
YE = [-12 + 90.4 * j for j in range(8)]
OVER = 5
BRIDGE = 26

f = TTFont(src)
gs = f.getGlyphSet(); glyf = f['glyf']; cmap = f.getBestCmap()
for ch, rows in DIGITS.items():
    on = {(c, 6 - r) for r, row in enumerate(rows) for c, v in enumerate(row) if v == '#'}
    pen = TTGlyphPen(gs)
    def box(x0, y0, x1, y1):
        x0, y0, x1, y1 = (round(v) for v in (x0, y0, x1, y1))
        pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
    for (i, j) in sorted(on):
        box(XE[i] - (OVER if i else 0), YE[j] - (OVER if j else 0), XE[i + 1] + OVER * (2 if i == 4 else 1), YE[j + 1] + OVER * (2 if j == 6 else 1))
    for (i, j) in on:
        for di in (1, -1):
            if (i + di, j + 1) in on and (i + di, j) not in on and (i, j + 1) not in on:
                cx, cy = XE[i + 1] if di == 1 else XE[i], YE[j + 1]
                box(cx - BRIDGE, cy - BRIDGE, cx + BRIDGE, cy + BRIDGE)
    glyf[cmap[ord(ch)]] = pen.glyph()
f.flavor = 'woff2'
f.save(dst)
print('ok')
