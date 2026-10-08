import type { NoteRef, WorldModel } from './types';

export type Destination =
  | { kind: 'note'; key: string; houseId: string; roomId: string; note: NoteRef; title: string; where: string; preview: string }
  | { kind: 'house'; key: string; houseId: string; title: string; where: string; preview: string };

export function buildIndex(world: WorldModel): Destination[] {
  const out: Destination[] = [];
  for (const region of world.regions) {
    for (const house of region.houses) {
      const count = house.rooms.reduce((n, r) => n + r.notes.length, 0);
      out.push({
        kind: 'house',
        key: 'house:' + house.id,
        houseId: house.id,
        title: house.name,
        where: region.name,
        preview: `${count} note${count === 1 ? '' : 's'}`,
      });
      for (const room of house.rooms) {
        for (const note of room.notes) {
          // "Main" is the default room for notes loose in the house folder; it isn't a real place.
          const crumbs = [region.name, house.name, room.name !== 'Main' ? room.name : null].filter(Boolean);
          out.push({
            kind: 'note',
            key: 'note:' + note.id,
            houseId: house.id,
            roomId: room.id,
            note,
            title: note.title,
            where: crumbs.join(' › '),
            // Most notes open with a `# Title` heading, which the preview repeats verbatim.
            preview: note.preview.startsWith(note.title) ? note.preview.slice(note.title.length).trim() : note.preview,
          });
        }
      }
    }
  }
  return out;
}

// Every word has to hit somewhere; hits in the title count far more than hits in the path or
// the preview text, so typing a note's name always puts that note first.
function score(d: Destination, words: string[]): number {
  const title = d.title.toLowerCase();
  const where = d.where.toLowerCase();
  const preview = d.preview.toLowerCase();
  let total = 0;
  for (const w of words) {
    if (title === w) total += 100;
    else if (title.startsWith(w)) total += 60;
    else if (new RegExp(`\\b${escapeRe(w)}`).test(title)) total += 40;
    else if (title.includes(w)) total += 25;
    else if (where.includes(w)) total += 10;
    else if (preview.includes(w)) total += 3;
    else return 0;
  }
  // Notes beat houses on a tie: a note is the more specific place to land.
  return total + (d.kind === 'note' ? 1 : 0);
}

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchIndex(index: Destination[], query: string, max: number): Destination[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return index
    .map((d) => ({ d, s: score(d, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.d.title.length - b.d.title.length)
    .slice(0, max)
    .map((x) => x.d);
}
