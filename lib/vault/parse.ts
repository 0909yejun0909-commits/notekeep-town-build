import type { House, NoteRef, Region, Room, WorldModel } from '@/lib/types';
import { BIOMES, FOOTPRINT, FURNITURE, hash } from '@/lib/types';
import {
  HOUSE_FOOTPRINT,
  REGION_MARGIN,
  HOUSE_GAP,
  DEFAULT_MATERIAL,
  DEFAULT_WALL_COLOR,
  DEFAULT_ROOF_COLOR,
} from '@/lib/houseCatalog';

export const MAX_NOTES_PER_ROOM = 30;

const ROOT_ID = '.';
const MAIN = 'Main';
const ROOM_CLEAR_ROWS = 3;
const NOTE_EXT = /\.md$/i;
const SKIP_NOTE = /\.excalidraw\.md$/i;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function baseName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function titleOf(path: string) {
  return baseName(path).replace(NOTE_EXT, '');
}

// Locale-independent so the same vault builds the same town on every machine.
function comparePaths(a: string, b: string) {
  const al = a.toLowerCase(), bl = b.toLowerCase();
  if (al !== bl) return al < bl ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isNotePath(path: string): boolean {
  if (!NOTE_EXT.test(path) || SKIP_NOTE.test(path)) return false;
  return !path.split('/').some((seg) => seg.startsWith('.'));
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
};

export function plainPreview(md: string): string {
  let s = md.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|>~=$%])/g, (_m, c: string) => `\uE000${String.fromCharCode(0xe100 + c.charCodeAt(0))}`);
  s = s.replace(/^---\n[\s\S]*?\n(---|\.\.\.)\n?/, '');
  s = s.replace(/%%[\s\S]*?(%%|$)/g, ' ');
  s = s.replace(/<!--[\s\S]*?(-->|$)/g, ' ');
  s = s.replace(/^(```|~~~)[^\n]*\n[\s\S]*?(^\1[^\n]*$|$(?![\s\S]))/gm, ' ');
  s = s.replace(/\$\$[\s\S]*?\$\$/g, ' ');
  s = s.replace(/(^|[^\\$])\$(?!\s)[^$\n]*?[^\s\\$]\$(?!\d)/g, '$1 ');
  s = s.replace(/!\[\[[^\]]*\]\]/g, ' ');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  s = s.replace(/\[\[([^\]|#]*)(#[^\]|]*)?(\|([^\]]*))?\]\]/g, (_m, target: string, _h, _p, alias?: string) =>
    (alias ?? target).trim() || target.trim());
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[\^[^\]]*\]:?/g, '');
  s = s.replace(/<[^>\n]+>/g, ' ');
  s = s.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? ' ');
  s = s.replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, ' ');
  s = s.replace(/^\s{0,3}>\s*\[![\w-]+\][+-]?\s*/gm, '');
  s = s.replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX/-]\]\s*)?|\d+[.)]\s+|[-*_]{3,}\s*$)/gm, '');
  s = s.replace(/\s\^[\w-]+$/gm, '');
  s = s.replace(/==([^=\n]+)==/g, '$1');
  s = s.replace(/[|]/g, ' ');
  s = s.replace(/(\*{1,3}|_{1,3}|~~|`{1,3})(?=\S)([^*_~`\n]*?)(?<=\S)\1/g, '$2');
  s = s.replace(/[*_~`]+/g, '');
  s = s.replace(/\uE000([\uE100-\uE1FF])/g, (_m, c: string) => String.fromCharCode(c.charCodeAt(0) - 0xe100));
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, 200).replace(/\uFFFD+$/, '').trimEnd();
}

// Layout contract shared with Track C:
//   roomSize(room) = [cols, rows] of the whole room. Column 0, column cols-1,
//   row 0 and row rows-1 are the wall ring; the exit door sits on row rows-1 and
//   doors to sibling rooms sit on row 0.
//   note.gx/gy = 0-indexed top-left of the piece's FOOTPRINT. Furniture never
//   touches the ring, never uses row 1 (so row-0 doors stay reachable), and the
//   two floor rows above the exit door are always clear.
const ROOM_LEFT = 1;
const ROOM_TOP = 2;

function layoutRoom(notes: NoteRef[]): { cols: number; rows: number; pos: [number, number][] } {
  let area = 0;
  for (const n of notes) {
    const [w, h] = FOOTPRINT[n.furniture];
    area += (w + 1) * (h + 1);
  }
  const inner = clamp(Math.ceil(Math.sqrt(area * 1.6)), 8, 22);
  const cols = inner + 2;
  const pos: [number, number][] = [];
  let x = ROOM_LEFT, y = ROOM_TOP, rowH = 0;
  for (const n of notes) {
    const [w, h] = FOOTPRINT[n.furniture];
    if (x + w > cols - 1 && x > ROOM_LEFT) {
      x = ROOM_LEFT;
      y += rowH + 1;
      rowH = 0;
    }
    pos.push([x, y]);
    x += w + 1;
    rowH = Math.max(rowH, h);
  }
  const rows = Math.max(8, y + rowH + ROOM_CLEAR_ROWS);
  return { cols, rows, pos };
}

export function roomSize(room: Room): [number, number] {
  const l = layoutRoom(room.notes);
  let cols = l.cols, rows = l.rows;
  for (const n of room.notes) {
    const [w, h] = FOOTPRINT[n.furniture];
    cols = Math.max(cols, n.gx + w + 1);
    rows = Math.max(rows, n.gy + h + ROOM_CLEAR_ROWS);
  }
  return [cols, rows];
}

// Layout contract shared with Track B:
//   regionSize(region) = [cols, rows] of the region in tiles.
//   house.gx/gy = 0-indexed top-left of the house sprite (HOUSE_FOOTPRINT[variant]).
//   Houses are separated by HOUSE_GAP walkable tiles and REGION_MARGIN tiles from the edge.
function layoutRegion(houses: House[]): { cols: number; rows: number; pos: [number, number][] } {
  let area = 0;
  for (const h of houses) {
    const [w, hh] = HOUSE_FOOTPRINT[h.variant];
    area += (w + HOUSE_GAP) * (hh + HOUSE_GAP);
  }
  const cols = clamp(Math.ceil(Math.sqrt(area * 1.5)) + REGION_MARGIN * 2, 24, 64);
  const pos: [number, number][] = [];
  let x = REGION_MARGIN, y = REGION_MARGIN, rowH = 0;
  for (const h of houses) {
    const [w, hh] = HOUSE_FOOTPRINT[h.variant];
    if (x + w > cols - REGION_MARGIN && x > REGION_MARGIN) {
      x = REGION_MARGIN;
      y += rowH + HOUSE_GAP;
      rowH = 0;
    }
    pos.push([x, y]);
    x += w + HOUSE_GAP;
    rowH = Math.max(rowH, hh);
  }
  const rows = Math.max(16, y + rowH + REGION_MARGIN + 1);
  return { cols, rows, pos };
}

export function regionSize(region: Region): [number, number] {
  const l = layoutRegion(region.houses);
  let cols = l.cols, rows = l.rows;
  for (const h of region.houses) {
    const [w, hh] = HOUSE_FOOTPRINT[h.variant];
    cols = Math.max(cols, h.gx + w + REGION_MARGIN);
    rows = Math.max(rows, h.gy + hh + REGION_MARGIN + 1);
  }
  return [cols, rows];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

// Obsidian-style link resolution: exact vault path first, then by file name
// (with or without .md), preferring the candidate whose path ends with the link
// and, among ties, the shortest path — the same rule Obsidian uses.
export type LinkResolver = (link: string) => string | null;

export function makeLinkResolver(paths: string[]): LinkResolver {
  const exact = new Set(paths);
  const byBase = new Map<string, string[]>();
  const byStem = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, p: string) => {
    const arr = m.get(k);
    if (arr) arr.push(p); else m.set(k, [p]);
  };
  for (const p of paths) {
    const base = baseName(p).toLowerCase();
    push(byBase, base, p);
    if (NOTE_EXT.test(base)) push(byStem, base.replace(NOTE_EXT, ''), p);
  }
  const shortest = (arr: string[]) =>
    arr.slice().sort((a, b) => a.length - b.length || comparePaths(a, b))[0];

  return (link) => {
    let target = link.split('|')[0].split('#')[0].trim();
    try { target = decodeURIComponent(target); } catch { /* keep raw */ }
    target = target.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '');
    if (!target) return null;
    if (exact.has(target)) return target;
    if (exact.has(`${target}.md`)) return `${target}.md`;
    const lower = target.toLowerCase();
    const base = lower.slice(lower.lastIndexOf('/') + 1);
    const cands = byBase.get(base) ?? byStem.get(base) ?? [];
    if (cands.length === 0) return null;
    const suffix = cands.filter((p) => {
      const pl = p.toLowerCase();
      return pl === lower || pl.endsWith(`/${lower}`) || pl === `${lower}.md` || pl.endsWith(`/${lower}.md`);
    });
    return shortest(suffix.length ? suffix : cands);
  };
}

function splitRoom(id: string, name: string, notes: NoteRef[]): Room[] {
  if (notes.length <= MAX_NOTES_PER_ROOM) return [{ id, name, notes }];
  const parts = Math.ceil(notes.length / MAX_NOTES_PER_ROOM);
  const size = Math.ceil(notes.length / parts);
  const rooms: Room[] = [];
  for (let i = 0; i < parts; i++) {
    rooms.push({
      id: `${id}#${i + 1}`,
      name: `${name} (${i + 1} of ${parts})`,
      notes: notes.slice(i * size, (i + 1) * size),
    });
  }
  return rooms;
}

// Folder → world mapping:
//   depth 1 folder -> Region, depth 2 -> House, depth 3+ -> Room (deeper flattens),
//   loose .md at depth 2 -> room "Main"; loose .md above that -> house/region "Main".
//   Rooms holding more than MAX_NOTES_PER_ROOM notes split into numbered rooms.
export async function parseVault(
  name: string,
  paths: string[],
  readHead: (path: string) => Promise<string>,
): Promise<WorldModel> {
  const notePaths = paths.filter(isNotePath).sort(comparePaths);
  const heads = await mapLimit(notePaths, 16, async (p) => {
    try { return await readHead(p); } catch { return ''; }
  });

  type RoomAcc = { id: string; name: string; notes: NoteRef[] };
  type HouseAcc = { id: string; name: string; rooms: Map<string, RoomAcc> };
  type RegionAcc = { id: string; name: string; houses: Map<string, HouseAcc> };
  const regions = new Map<string, RegionAcc>();

  notePaths.forEach((path, i) => {
    const segs = path.split('/');
    const regionId = segs.length >= 2 ? segs[0] : ROOT_ID;
    const regionName = segs.length >= 2 ? segs[0] : name;
    const houseId = segs.length >= 3 ? segs.slice(0, 2).join('/') : regionId;
    const houseName = segs.length >= 3 ? segs[1] : MAIN;
    const roomId = segs.length >= 4 ? segs.slice(0, 3).join('/') : houseId;
    const roomName = segs.length >= 4 ? segs[2] : MAIN;

    let region = regions.get(regionId);
    if (!region) regions.set(regionId, (region = { id: regionId, name: regionName, houses: new Map() }));
    let house = region.houses.get(houseId);
    if (!house) region.houses.set(houseId, (house = { id: houseId, name: houseName, rooms: new Map() }));
    let room = house.rooms.get(roomId);
    if (!room) house.rooms.set(roomId, (room = { id: roomId, name: roomName, notes: [] }));

    room.notes.push({
      id: path,
      title: titleOf(path),
      furniture: FURNITURE[hash(path) % FURNITURE.length],
      gx: 0, gy: 0,
      preview: plainPreview(heads[i]),
    });
  });

  const world: WorldModel = { name, regions: [] };
  for (const r of regions.values()) {
    const houses: House[] = [];
    for (const h of r.houses.values()) {
      const rooms: Room[] = [];
      for (const rm of h.rooms.values()) {
        for (const part of splitRoom(rm.id, rm.name, rm.notes)) {
          const { pos } = layoutRoom(part.notes);
          part.notes.forEach((n, i) => { n.gx = pos[i][0]; n.gy = pos[i][1]; });
          rooms.push(part);
        }
      }
      const variant = hash(h.name) % 5;
      houses.push({
        id: h.id, name: h.name, gx: 0, gy: 0, variant,
        material: DEFAULT_MATERIAL[variant],
        wallColor: DEFAULT_WALL_COLOR[variant],
        roofColor: DEFAULT_ROOF_COLOR[variant],
        rooms,
      });
    }
    const { pos } = layoutRegion(houses);
    houses.forEach((h, i) => { h.gx = pos[i][0]; h.gy = pos[i][1]; });
    world.regions.push({ id: r.id, name: r.name, biome: BIOMES[hash(r.name) % BIOMES.length], houses });
  }
  return world;
}
