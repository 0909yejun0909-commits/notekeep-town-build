#!/usr/bin/env python3
"""Draws public/art/chill.png: speakers, headphones, earbuds, boombox, record player, white-noise
machine, beanbags and meditation cushions.

Our own art, so unlike the licensed packs under public/assets it is committed. Run from the repo
root: python3 scripts/draw-chill.py
"""
import sys
from PIL import Image

O = (63, 40, 50, 255)        # outline
W1 = (176, 122, 80, 255)     # wood light
W2 = (138, 90, 60, 255)      # wood
W3 = (94, 59, 42, 255)       # wood dark
T1 = (44, 44, 52, 255)       # black body
T2 = (69, 69, 79, 255)       # black body light
T3 = (104, 104, 118, 255)    # black body highlight
G1 = (185, 180, 194, 255)    # grey
G2 = (140, 134, 152, 255)    # grey dark
WH = (244, 238, 226, 255)    # white
WH2 = (214, 206, 192, 255)   # white shade
R1 = (200, 78, 84, 255)      # red
R2 = (140, 46, 58, 255)      # red dark
Y = (255, 224, 102, 255)     # yellow
BL1 = (122, 196, 232, 255)   # glow blue
BL2 = (72, 136, 196, 255)    # glow blue dark
NV1 = (86, 112, 186, 255)    # navy
NV2 = (56, 76, 140, 255)

W, H = 128, 64
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
px = img.load()


def dot(ox, oy, x, y, c):
    px[ox + x, oy + y] = c


def fill(ox, oy, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[ox + x, oy + y] = c


def box(ox, oy, x0, y0, x1, y1, c, edge=O):
    fill(ox, oy, x0, y0, x1, y1, edge)
    fill(ox, oy, x0 + 1, y0 + 1, x1 - 1, y1 - 1, c)


def disc(ox, oy, cx, cy, r, c, edge=O):
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d <= r + 0.5:
                px[ox + x, oy + y] = edge if d > r - 0.6 else c


def blob(ox, oy, cx, cy, rx, ry, c, light, dark, edge=O):
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if d <= 1.0:
                if d > 0.78:
                    col = edge
                elif x < cx - rx * 0.3 and y < cy - ry * 0.1:
                    col = light
                elif y > cy + ry * 0.35 or x > cx + rx * 0.45:
                    col = dark
                else:
                    col = c
                px[ox + x, oy + y] = col


def speaker(ox, oy, body, hi, cone):
    box(ox, oy, 2, 1, 13, 31, body)
    fill(ox, oy, 3, 2, 3, 29, hi)
    disc(ox, oy, 7.5, 8, 2.5, cone, O)
    dot(ox, oy, 7, 7, hi)
    disc(ox, oy, 7.5, 21, 5, cone, O)
    disc(ox, oy, 7.5, 21, 2, O, O)
    dot(ox, oy, 5, 18, hi)
    dot(ox, oy, 6, 17, hi)
    fill(ox, oy, 4, 29, 11, 29, O)


def headphones(ox, oy, cup, cup_dark):
    # stand
    box(ox, oy, 3, 28, 12, 31, W2)
    fill(ox, oy, 4, 28, 11, 28, W1)
    fill(ox, oy, 7, 18, 8, 28, O)
    fill(ox, oy, 7, 19, 7, 27, W1)
    box(ox, oy, 5, 15, 10, 18, W2)
    # band: an arch from cup to cup, grey inside a dark outline
    import math
    for i in range(0, 181, 4):
        a = math.radians(i)
        x, y = 7.5 + 6.2 * math.cos(a), 8.5 - 7.2 * math.sin(a)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                dot(ox, oy, int(round(x)) + dx, int(round(y)) + dy, O)
    for i in range(0, 181, 4):
        a = math.radians(i)
        x, y = 7.5 + 6.2 * math.cos(a), 8.5 - 7.2 * math.sin(a)
        dot(ox, oy, int(round(x)), int(round(y)), G1)
    # cups
    box(ox, oy, 0, 7, 4, 15, cup)
    fill(ox, oy, 1, 8, 1, 13, cup_dark)
    dot(ox, oy, 2, 9, G1)
    fill(ox, oy, 3, 8, 3, 14, cup_dark)
    box(ox, oy, 11, 7, 15, 15, cup)
    fill(ox, oy, 14, 8, 14, 13, cup_dark)
    dot(ox, oy, 13, 9, G1)
    fill(ox, oy, 12, 8, 12, 14, cup_dark)


def earbuds(ox, oy, case, shade):
    # round side table
    fill(ox, oy, 3, 8, 12, 9, O)
    fill(ox, oy, 4, 8, 11, 8, W1)
    fill(ox, oy, 4, 9, 11, 9, W2)
    fill(ox, oy, 7, 10, 8, 14, O)
    fill(ox, oy, 7, 10, 7, 13, W2)
    fill(ox, oy, 4, 15, 11, 15, O)
    # open charging case with two buds
    box(ox, oy, 4, 4, 11, 7, case)
    fill(ox, oy, 5, 7, 10, 7, shade)
    fill(ox, oy, 5, 5, 10, 5, shade)
    disc(ox, oy, 5.5, 2.5, 1.6, WH, O)
    disc(ox, oy, 10.5, 2.5, 1.6, WH, O)
    dot(ox, oy, 5, 2, WH2)
    dot(ox, oy, 10, 2, WH2)
    dot(ox, oy, 7, 6, BL1)


def boombox(ox, oy, body, dark):
    fill(ox, oy, 4, 1, 11, 1, O)
    fill(ox, oy, 4, 2, 4, 3, O)
    fill(ox, oy, 11, 2, 11, 3, O)
    box(ox, oy, 1, 3, 14, 13, body)
    fill(ox, oy, 2, 4, 13, 4, G1)
    disc(ox, oy, 4.5, 8.5, 2.6, dark, O)
    dot(ox, oy, 4, 8, G2)
    disc(ox, oy, 11.5, 8.5, 2.6, dark, O)
    dot(ox, oy, 11, 8, G2)
    box(ox, oy, 6, 6, 9, 8, T1)
    fill(ox, oy, 7, 7, 8, 7, BL1)
    dot(ox, oy, 6, 10, Y)
    dot(ox, oy, 8, 10, G1)
    dot(ox, oy, 9, 10, G1)
    fill(ox, oy, 2, 14, 13, 14, O)


def record_player(ox, oy):
    box(ox, oy, 1, 5, 14, 14, W2)
    fill(ox, oy, 2, 6, 13, 6, W1)
    disc(ox, oy, 7, 10, 4, T1, O)
    disc(ox, oy, 7, 10, 2, R1, O)
    dot(ox, oy, 7, 10, Y)
    dot(ox, oy, 5, 8, T3)
    # tonearm
    fill(ox, oy, 12, 6, 12, 8, G1)
    fill(ox, oy, 11, 9, 11, 10, G1)
    dot(ox, oy, 10, 11, O)
    dot(ox, oy, 12, 6, G2)
    fill(ox, oy, 2, 13, 13, 13, W3)


def noise_machine(ox, oy, body, shade, glow):
    for y in range(3, 14):
        t = (y - 3) / 10
        half = 5.5 - (0.0 if 0.15 < t < 0.85 else 1.5 if t <= 0.15 else 1.0)
        x0, x1 = int(8 - half), int(7 + half)
        fill(ox, oy, x0, y, x1, y, O)
        fill(ox, oy, x0 + 1, y, x1 - 1, y, body)
        dot(ox, oy, x1 - 1, y, shade)
    fill(ox, oy, 5, 5, 6, 5, WH)
    # sound waves
    for x, ys in [(5, (8, 9)), (7, (7, 10)), (9, (6, 11)), (11, (8, 9))]:
        for y in range(ys[0], ys[1] + 1):
            dot(ox, oy, x, y, glow)
    fill(ox, oy, 4, 14, 11, 14, O)


def beanbag(ox, oy, c, light, dark):
    blob(ox, oy, 8, 9, 7.5, 6, c, light, dark)
    # seam and a slump in the top
    for y in range(5, 9):
        dot(ox, oy, 8, y, dark)
    for x, y in [(5, 8), (6, 9), (10, 9), (11, 8)]:
        dot(ox, oy, x, y, dark)
    fill(ox, oy, 3, 15, 12, 15, O)


def zafu(ox, oy, c, light, dark):
    blob(ox, oy, 8, 10, 6.4, 4, c, light, dark)
    dot(ox, oy, 8, 8, dark)
    dot(ox, oy, 7, 8, dark)
    dot(ox, oy, 9, 8, dark)
    fill(ox, oy, 3, 14, 12, 14, O)


speaker(0, 0, T1, T3, T2)
speaker(16, 0, W2, W1, W3)
headphones(32, 0, R1, R2)
headphones(48, 0, WH, WH2)
headphones(64, 0, NV1, NV2)

boombox(0, 32, T2, T1)
boombox(16, 32, R1, R2)
record_player(32, 32)
earbuds(48, 32, WH, WH2)
earbuds(64, 32, (232, 168, 196, 255), (190, 120, 156, 255))
noise_machine(80, 32, WH, WH2, BL2)
noise_machine(96, 32, (150, 190, 160, 255), (106, 148, 120, 255), WH)

beanbag(0, 48, (96, 140, 210, 255), (146, 184, 240, 255), (62, 96, 168, 255))
beanbag(16, 48, (232, 130, 160, 255), (250, 176, 198, 255), (176, 84, 116, 255))
beanbag(32, 48, (112, 178, 108, 255), (162, 216, 150, 255), (72, 130, 78, 255))
beanbag(48, 48, (236, 160, 80, 255), (252, 202, 130, 255), (184, 112, 52, 255))
zafu(64, 48, (150, 110, 200, 255), (190, 156, 230, 255), (104, 70, 156, 255))
zafu(80, 48, (96, 168, 150, 255), (146, 210, 192, 255), (60, 120, 108, 255))
zafu(96, 48, (220, 120, 110, 255), (246, 168, 158, 255), (160, 78, 78, 255))

img.save('public/art/chill.png')
if len(sys.argv) > 1:
    img.resize((W * 8, H * 8), Image.NEAREST).save(sys.argv[1])
