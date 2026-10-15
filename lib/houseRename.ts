import type { InteriorLayout } from './types';
import { movedPath } from './vault/paths';
import { loadTownEdits, saveTownEdits } from './townEdits';

// A room layout after its house was renamed: the furniture holding notes points at their new
// paths.
export function movedLayout(layout: InteriorLayout, from: string, to: string): InteriorLayout {
  return {
    ...layout,
    placements: layout.placements.map((p) => (p.noteId ? { ...p, noteId: movedPath(p.noteId, from, to) } : p)),
  };
}

// Room layouts, the house's look and where it stands in town are saved by room and house id
// (lib/interiorStore.ts, lib/exteriorStore.ts, lib/townEdits.ts); a renamed house takes them with
// it. A town that's up keeps its own copy of where houses stand: it moves it too, on
// 'house-renamed' (OverworldScene).
export function moveHouseSaves(fingerprint: string, from: string, to: string) {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => !!k);
    for (const kind of ['interior', 'exterior']) {
      const prefix = `${kind}:${fingerprint}:`;
      for (const k of keys) {
        if (!k.startsWith(prefix)) continue;
        const id = k.slice(prefix.length);
        const next = movedPath(id, from, to);
        const raw = localStorage.getItem(k);
        if (next === id || raw === null) continue;
        let value = raw;
        if (kind === 'interior') {
          try {
            value = JSON.stringify(movedLayout(JSON.parse(raw), from, to));
          } catch {
            // Unreadable: moved as it is, and read as no layout like before.
          }
        }
        localStorage.setItem(prefix + next, value);
        localStorage.removeItem(k);
      }
    }
  } catch {
    // Storage unavailable: the house keeps its notes and loses only its saved looks.
  }
  const town = loadTownEdits(fingerprint);
  if (town.houses[from]) {
    town.houses[to] = town.houses[from];
    delete town.houses[from];
    saveTownEdits(fingerprint, town);
  }
}

// A note renamed: furniture holding it, in any saved room, holds it under its new path.
export function moveNoteSaves(fingerprint: string, from: string, to: string) {
  try {
    const prefix = `interior:${fingerprint}:`;
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => !!k?.startsWith(prefix));
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw === null || !raw.includes(JSON.stringify(from).slice(1, -1))) continue;
      try {
        localStorage.setItem(k, JSON.stringify(movedLayout(JSON.parse(raw), from, to)));
      } catch {
        // Unreadable: left as it is, and read as no layout like before.
      }
    }
  } catch {
    // Storage unavailable: the note keeps its words and loses only its spot on the furniture.
  }
}
