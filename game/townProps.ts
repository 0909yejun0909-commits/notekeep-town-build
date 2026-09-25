import Phaser from 'phaser';
import { mix } from '@/game/noise';
import type { Entry } from '@/game/tilemap';
import { isFree, key, nearHouse, TILE, type WorldGrid } from '@/game/worldGrid';
import { CANDY_CANE, FIRE_GLOW, FIRE_PIT, FIRE_PIT_ANIM, PRESENTS, XMAS_TREE, XMAS_TREE_ORIGIN } from '@/game/winterArt';
import { AMPHORA, POTTED_CACTUS } from '@/game/desertArt';

const PW = 8;
const PH = 6;

type Plaza = { x: number; y: number };
type Well = { x: number; y: number };

// The town square goes in the region with the most houses, as near the middle of its houses
// as it fits. Plaza tiles join the road network (they are passed to buildRoads as road), and
// the square's bottom-centre is returned as an extra road anchor so paths lead into it. Every
// other region gets a well on the green near its houses.
export function placePlazas(g: WorldGrid): { plazas: Plaza[]; anchors: Entry[]; wells: Well[] } {
  const plazas: Plaza[] = [];
  const anchors: Entry[] = [];
  const wells: Well[] = [];
  const biggest = g.areas.reduce((best, a) => (a.region.houses.length > best.region.houses.length ? a : best), g.areas[0]);

  for (const a of g.areas) {
    const doors = g.houses.filter((h) => a.region.houses.some((rh) => rh.id === h.houseId));
    const cx = doors.length ? doors.reduce((s, h) => s + h.entryGx, 0) / doors.length : a.originGx + a.width / 2;
    const cy = doors.length ? doors.reduce((s, h) => s + h.entryGy, 0) / doors.length + 3 : a.originGy + a.height / 2;
    const [pw, ph] = a === biggest ? [PW, PH] : [2, 2];

    let best: { x: number; y: number; d: number } | null = null;
    for (let y = a.originGy + 1; y + ph < a.originGy + a.height; y++) {
      for (let x = a.originGx + 1; x + pw < a.originGx + a.width; x++) {
        if (!rectClear(g, x, y, pw, ph)) continue;
        const d = Math.hypot(x + pw / 2 - cx, y + ph / 2 - cy);
        if (!best || d < best.d) best = { x, y, d };
      }
    }
    if (!best) continue;

    if (a !== biggest) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          g.blocked.add(key(best.x + dx, best.y + dy));
          g.used.add(key(best.x + dx, best.y + dy));
        }
      }
      wells.push({ x: best.x, y: best.y });
      continue;
    }

    for (let dy = 0; dy < PH; dy++) {
      for (let dx = 0; dx < PW; dx++) g.plaza.add(key(best.x + dx, best.y + dy));
    }
    const solid = [[0, 0], [7, 0], [2, 0], [5, 0], [3, 2], [4, 2], [3, 3], [4, 3], [0, 3], [1, 3], [6, 3], [7, 3]];
    for (const [dx, dy] of solid) {
      g.blocked.add(key(best.x + dx, best.y + dy));
      g.used.add(key(best.x + dx, best.y + dy));
    }
    plazas.push({ x: best.x, y: best.y });
    anchors.push({ gx: best.x + 4, gy: best.y + PH - 1, houseId: '' });
  }
  return { plazas, anchors, wells };
}

function rectClear(g: WorldGrid, x0: number, y0: number, pw: number, ph: number) {
  for (let y = y0 - 1; y <= y0 + ph; y++) {
    for (let x = x0 - 1; x <= x0 + pw; x++) {
      const k = key(x, y);
      if (g.blocked.has(k) || g.keepClear.has(k) || g.plaza.has(k) || g.used.has(k)) return false;
      if (nearHouse(g, x, y, 0, 0, 2)) return false;
    }
  }
  return true;
}

function lampAt(scene: Phaser.Scene, g: WorldGrid, x: number, y: number) {
  scene.add
    .sprite(x * TILE + TILE / 2, (y + 1) * TILE, g.skin('lamp-posts'))
    .setOrigin(0.5, 1)
    .setDepth((y + 1) * TILE - 1)
    .play({ key: g.skinAnim('lamp-flicker'), startFrame: mix(g.seed, x, y) % 6 });
  g.lights.push({ x: x * TILE + TILE / 2 + 1, y: (y + 1) * TILE - 38, scale: 1 });
}

export function renderPlazas(scene: Phaser.Scene, g: WorldGrid, plazas: Plaza[], wells: Well[]) {
  for (const w of wells) {
    const x = (w.x + 1) * TILE;
    const y = (w.y + 2) * TILE;
    if (g.biome === 'snow') {
      // A campfire on the well's 2x2 tiles, glowing all day and brighter at night.
      scene.add.image(x, y - TILE, FIRE_GLOW).setDepth(-400);
      scene.add.sprite(w.x * TILE, w.y * TILE, FIRE_PIT).setOrigin(0, 0).setDepth(y - 1).play(FIRE_PIT_ANIM);
      g.lights.push({ x, y: y - TILE, scale: 1.3 });
      continue;
    }
    scene.add.image(x, y - 1, g.skin('well')).setOrigin(0.5, 47 / 48).setDepth(y - 1);
  }

  for (const p of plazas) {
    const at = (dx: number, dy: number) => ({ x: (p.x + dx) * TILE, y: (p.y + dy) * TILE });

    const base = at(4, 4);
    if (g.biome === 'snow' && scene.textures.exists(XMAS_TREE)) {
      // The town Christmas tree stands where the fountain would, trunk on the same blocked tiles.
      scene.add
        .image(base.x, base.y - 2, XMAS_TREE)
        .setOrigin(...XMAS_TREE_ORIGIN)
        .setDepth(base.y - 1);
    } else {
      scene.add
        .sprite(base.x, base.y - 2, g.skin('fountain'))
        .setOrigin(0.5, 46 / 48)
        .setDepth(base.y - 1)
        .play(g.skinAnim('fountain-flow'));
    }

    for (const dx of [0, 6]) {
      const b = at(dx, 4);
      scene.add.image(b.x, b.y, g.skin('benches'), 1).setOrigin(0, 28 / 32).setDepth(b.y - 1);
    }

    const flags = at(2, 1);
    scene.add
      .sprite(flags.x, flags.y, g.skin('bunting'))
      .setOrigin(0, 1)
      .setDepth(flags.y - 1)
      .play(g.skinAnim('bunting-wave'));

    lampAt(scene, g, p.x, p.y);
    lampAt(scene, g, p.x + 7, p.y);
  }
}

// Potted flowers flank each door, a lamp and a flower barrel stand beside the house, and
// lamps line the roads every few tiles. Runs after roads, so nothing lands on a path.
export function renderYards(scene: Phaser.Scene, g: WorldGrid) {
  const claim = (x: number, y: number) => {
    g.blocked.add(key(x, y));
    g.used.add(key(x, y));
  };

  for (const h of g.houses) {
    const front = h.gy + h.h - 1;
    const r = mix(g.seed, h.gx, h.gy);

    for (const x of [h.entryGx - 2, h.entryGx + 1]) {
      if (!isFree(g, x, front)) continue;
      // >>> not >>: mix() is unsigned, and a signed shift made about half of these frames negative.
      const frame = ((r >>> 3) % 10) * 10 + 5 + ((r >>> 7) + x) % 5;
      // Nudged up against the wall: the sprite's bottom row is mostly empty porch.
      const [texture, lift] =
        g.biome === 'snow' ? [CANDY_CANE, 0] : g.biome === 'desert' ? [POTTED_CACTUS, 4] : ['flowers', 6];
      scene.add
        .image(x * TILE + TILE / 2, (front + 1) * TILE - lift, texture, g.biome === 'forest' ? frame : undefined)
        .setOrigin(0.5, 1)
        .setDepth((front + 1) * TILE - 1);
      claim(x, front);
    }

    const sides = r % 2 === 0 ? [h.gx - 1, h.gx + h.w] : [h.gx + h.w, h.gx - 1];
    let lampDone = false;
    for (const x of sides) {
      if (!isFree(g, x, front)) continue;
      if (!lampDone) {
        lampAt(scene, g, x, front);
        lampDone = true;
      } else {
        const stack = g.biome === 'snow' ? PRESENTS : g.biome === 'desert' ? AMPHORA : null;
        scene.add
          .image(x * TILE + TILE / 2, (front + 1) * TILE, stack ?? 'barrels', stack ? undefined : 7 + ((r >>> 5) % 5))
          .setOrigin(0.5, 1)
          .setDepth((front + 1) * TILE - 1);
      }
      claim(x, front);
    }

    g.lights.push({ x: h.entryGx * TILE + TILE / 2, y: h.entryGy * TILE - 10, scale: 0.8 });
  }

  const lamps: [number, number][] = [];
  const cells = [...g.road].map((k) => k.split(',').map(Number) as [number, number]);
  cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [x, y] of cells) {
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const lx = x + dx, ly = y + dy;
      if (!isFree(g, lx, ly) || nearHouse(g, lx, ly, 1, 0, 1)) continue;
      if (lamps.some(([ax, ay]) => Math.max(Math.abs(ax - lx), Math.abs(ay - ly)) < 9)) continue;
      if (g.lights.some((l) => Math.hypot(l.x / TILE - lx, l.y / TILE - ly) < 6)) continue;
      lampAt(scene, g, lx, ly);
      claim(lx, ly);
      lamps.push([lx, ly]);
      break;
    }
  }
}
