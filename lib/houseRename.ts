import type { InteriorLayout } from './types';
import { movedPath } from './vault/paths';

// A room layout after its house was renamed: the furniture holding notes points at their new
// paths.
export function movedLayout(layout: InteriorLayout, from: string, to: string): InteriorLayout {
  return {
    ...layout,
    placements: layout.placements.map((p) => (p.noteId ? { ...p, noteId: movedPath(p.noteId, from, to) } : p)),
  };
}

// Room layouts and the house's look are saved by room and house id (lib/interiorStore.ts,
// lib/exteriorStore.ts); a renamed house takes them with it. Where it stands in town is the
// town's own to move (OverworldScene, 'house-renamed').
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
}
