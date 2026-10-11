import { HOUSE_DOOR, HOUSE_FOOTPRINT } from '@/lib/houseCatalog';
import { inBounds, key, nearHouse, ringDistance, type WorldGrid } from '@/game/worldGrid';

// Where a house the player is placing may go: on town ground (bought land included), clear of
// the square, other houses (with a tile's gap), doorsteps and what the player put down
// themselves (`fixed`: decorations and painted water), with its door and the tile in front of
// it free too. The town's own trees, ponds, roads and lamps don't count: they're laid out
// round the houses each time the town is drawn.
export function houseFits(g: WorldGrid, variant: number, gx: number, gy: number, fixed: Set<string>): boolean {
  const [w, h] = HOUSE_FOOTPRINT[variant] ?? HOUSE_FOOTPRINT[0];
  const [dx, dy] = HOUSE_DOOR[variant] ?? HOUSE_DOOR[0];
  const cells: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push([gx + x, gy + y]);
  cells.push([gx + dx, gy + dy + 2]);
  return cells.every(([x, y]) => {
    const k = key(x, y);
    if (!inBounds(g, x, y) || (ringDistance(g, x, y) < 0 && !g.open.has(k))) return false;
    if (g.plaza.has(k) || g.keepClear.has(k) || fixed.has(k)) return false;
    return !nearHouse(g, x, y, 1, 1, 1);
  });
}
