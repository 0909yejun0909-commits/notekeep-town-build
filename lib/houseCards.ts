import type { House, VaultHandle, WorldModel } from './types';
import { extractCards, type Card } from './flashcards';

export function findHouse(world: WorldModel, houseId: string): House | undefined {
  for (const region of world.regions) {
    const house = region.houses.find((h) => h.id === houseId);
    if (house) return house;
  }
  return undefined;
}

// Read fresh every time a desk, computer or console opens, so an edit made a minute ago counts.
export async function loadHouseCards(vault: VaultHandle, houseId: string): Promise<{ house: House; cards: Card[] } | null> {
  const house = findHouse(vault.world, houseId);
  if (!house) return null;
  const notes = house.rooms.flatMap((room) => room.notes.map((note) => ({ note, roomId: room.id })));
  const texts = await Promise.all(notes.map(({ note }) => vault.readNote(note.id).catch(() => '')));
  const seen = new Set<string>();
  const cards: Card[] = [];
  notes.forEach(({ note, roomId }, i) => {
    for (const card of extractCards({ id: note.id, title: note.title, roomId }, texts[i])) {
      const key = card.front.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(card);
    }
  });
  return { house, cards };
}
