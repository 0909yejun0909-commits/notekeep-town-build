#!/usr/bin/env python3
"""Draws public/art/tech.png: the computer, laptop, computer desk, TV console and arcade cabinet.

Our own art, so unlike the licensed packs under public/assets it is committed. Run from the repo
root: python3 scripts/draw-tech.py
"""
from PIL import Image

O = (63, 40, 50, 255)        # outline
W1 = (176, 122, 80, 255)     # wood light
W2 = (138, 90, 60, 255)      # wood
W3 = (94, 59, 42, 255)       # wood dark
B1 = (232, 220, 192, 255)    # beige plastic
B2 = (199, 185, 150, 255)    # beige shade
G1 = (185, 180, 194, 255)    # grey
G2 = (140, 134, 152, 255)    # grey dark
K = (107, 99, 114, 255)      # keys
S1 = (43, 74, 94, 255)       # screen
S2 = (79, 143, 168, 255)     # screen mid
S3 = (127, 212, 232, 255)    # screen glint
T1 = (44, 44, 52, 255)       # TV body
T2 = (69, 69, 79, 255)       # TV body light
R1 = (184, 67, 79, 255)      # cabinet red
R2 = (126, 42, 54, 255)      # cabinet red dark
Y = (255, 224, 102, 255)     # marquee yellow
GR = (143, 220, 122, 255)    # green
GR2 = (88, 160, 82, 255)     # green dark
BL = (74, 123, 208, 255)     # blue

img = Image.new('RGBA', (96, 32), (0, 0, 0, 0))
px = img.load()


def dot(x, y, c):
    px[x, y] = c


def fill(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def box(x0, y0, x1, y1, c, edge=O):
    fill(x0, y0, x1, y1, edge)
    if x1 - x0 >= 2 and y1 - y0 >= 2:
        fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, c)


def screen(x0, y0, x1, y1):
    box(x0, y0, x1, y1, S1)
    fill(x0 + 1, y1 - 2, x1 - 1, y1 - 1, S2)
    dot(x0 + 1, y0 + 1, S3)
    dot(x0 + 2, y0 + 1, S3)
    dot(x0 + 1, y0 + 2, S3)


def keys(x0, x1, y, a, b):
    for x in range(x0, x1 + 1):
        dot(x, y, a if (x - x0) % 2 == 0 else b)


# Laptop, (0, 0) 16x16, on the bottom 9 px.
box(2, 7, 13, 13, G1)
screen(3, 8, 12, 12)
box(1, 13, 14, 15, G2)
keys(2, 13, 14, G1, K)

# Desktop computer, (0, 16) 16x16, on the bottom 12 px.
oy = 16
box(2, oy + 3, 13, oy + 12, B1)
screen(4, oy + 4, 11, oy + 10)
fill(3, oy + 11, 12, oy + 11, B2)
dot(11, oy + 11, GR)
box(1, oy + 13, 14, oy + 15, B2)
keys(2, 13, oy + 14, B1, K)

# Arcade cabinet, (16, 0) 16x32, standing on the bottom 16 px.
ox = 16
box(ox + 3, 2, ox + 12, 31, R1)
box(ox + 3, 2, ox + 12, 6, Y)
for x in (5, 6, 8, 10):
    dot(ox + x, 4, R2)
fill(ox + 4, 7, ox + 11, 7, R2)
box(ox + 4, 8, ox + 11, 15, T1)
fill(ox + 5, 9, ox + 10, 14, S1)
fill(ox + 5, 13, ox + 10, 14, GR2)
dot(ox + 7, 11, Y)
dot(ox + 7, 12, Y)
dot(ox + 9, 10, R1)
dot(ox + 5, 9, S3)
box(ox + 2, 16, ox + 13, 19, R2)
fill(ox + 3, 17, ox + 12, 18, R1)
dot(ox + 5, 16, O)
dot(ox + 5, 17, T1)
dot(ox + 8, 17, BL)
dot(ox + 10, 17, Y)
fill(ox + 4, 20, ox + 11, 30, R1)
fill(ox + 11, 20, ox + 11, 30, R2)
box(ox + 6, 23, ox + 9, 26, R2)
fill(ox + 7, 24, ox + 8, 25, Y)
fill(ox + 4, 30, ox + 11, 30, R2)

# Computer desk, (32, 0) 32x32: the desk on the bottom 16 px, monitor and tower above.
ox = 32
box(ox + 4, 2, ox + 19, 13, B1)
screen(ox + 6, 4, ox + 17, 11)
fill(ox + 5, 12, ox + 18, 12, B2)
box(ox + 10, 13, ox + 13, 15, B2)
box(ox + 22, 4, ox + 28, 15, B1)
fill(ox + 27, 5, ox + 27, 14, B2)
fill(ox + 24, 6, ox + 26, 6, K)
fill(ox + 24, 8, ox + 26, 8, K)
dot(ox + 25, 12, GR)
box(ox + 0, 16, ox + 31, 20, W1)
keys(ox + 7, ox + 18, 17, B1, K)
fill(ox + 1, 19, ox + 30, 19, W2)
fill(ox + 0, 20, ox + 31, 20, O)
box(ox + 1, 21, ox + 3, 31, W3)
box(ox + 21, 21, ox + 30, 31, W2)
fill(ox + 22, 26, ox + 29, 26, O)
dot(ox + 25, 23, W3)
dot(ox + 26, 23, W3)
dot(ox + 25, 28, W3)
dot(ox + 26, 28, W3)

# TV and games console, (64, 0) 32x32: a low stand on the bottom 16 px, the TV above.
ox = 64
box(ox + 3, 2, ox + 28, 17, T1)
fill(ox + 4, 16, ox + 27, 16, T2)
box(ox + 5, 4, ox + 26, 14, S1)
fill(ox + 6, 12, ox + 25, 13, GR)
fill(ox + 6, 13, ox + 25, 13, GR2)
fill(ox + 11, 10, ox + 11, 11, Y)
dot(ox + 12, 10, Y)
dot(ox + 20, 11, R1)
dot(ox + 21, 11, R1)
dot(ox + 6, 5, S3)
dot(ox + 7, 5, S3)
dot(ox + 6, 6, S3)
fill(ox + 15, 6, ox + 17, 6, S2)
dot(ox + 25, 16, GR)
box(ox + 13, 17, ox + 18, 19, T2)
box(ox + 0, 19, ox + 31, 31, W1)
fill(ox + 1, 21, ox + 30, 21, W2)
box(ox + 2, 22, ox + 29, 29, W3)
box(ox + 4, 24, ox + 13, 28, G1)
fill(ox + 5, 27, ox + 12, 27, G2)
dot(ox + 11, 25, GR)
box(ox + 16, 26, ox + 20, 28, G2)
dot(ox + 17, 27, R1)
dot(ox + 19, 27, BL)
box(ox + 22, 26, ox + 26, 28, G2)
dot(ox + 23, 27, R1)
dot(ox + 25, 27, BL)
fill(ox + 1, 30, ox + 30, 30, W2)

img.save('public/art/tech.png')
