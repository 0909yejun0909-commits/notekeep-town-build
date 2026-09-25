// Deterministic noise for world generation. Every guest in a study session builds the
// same town from the same WorldModel, so anything that affects walkability must come from
// these functions (seeded from vault names), never from Math.random.

export function mix(seed: number, x: number, y: number): number {
  let h = seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function rand01(seed: number, x: number, y: number): number {
  return mix(seed, x, y) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

// Value noise on a lattice `scale` tiles apart, in [0, 1).
export function noise2(seed: number, x: number, y: number, scale: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const a = rand01(seed, x0, y0);
  const b = rand01(seed, x0 + 1, y0);
  const c = rand01(seed, x0, y0 + 1);
  const d = rand01(seed, x0 + 1, y0 + 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

// Three octaves; the upper two run on rotated coordinates so blobs don't square off along
// the tile grid.
export function fbm(seed: number, x: number, y: number, scale: number): number {
  const rx = x * 0.8 - y * 0.6;
  const ry = x * 0.6 + y * 0.8;
  return (
    noise2(seed, x, y, scale) * 0.55 +
    noise2(seed ^ 0x9e3779b9, rx, ry, scale / 2.3) * 0.3 +
    noise2(seed ^ 0x7f4a7c15, ry, -rx, scale / 5) * 0.15
  );
}

export function pick<T>(items: readonly T[], seed: number, x: number, y: number): T {
  return items[mix(seed, x, y) % items.length];
}
