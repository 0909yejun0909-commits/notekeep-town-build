import type { Achievement } from './achievementState';

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-page', name: 'First Page', description: 'Read your first note.', secret: false, stat: 'notesRead', target: 1, reward: { kind: 'pet', id: 'cat' } },
  { id: 'bookworm', name: 'Bookworm', description: 'Read 10 different notes.', secret: false, stat: 'notesRead', target: 10, reward: { kind: 'skin', id: 'knight' } },
  { id: 'librarian', name: 'Librarian', description: 'Read 50 different notes.', secret: false, stat: 'notesRead', target: 50, reward: { kind: 'skin', id: 'sorcerer-black' } },
  { id: 'archivist', name: 'Archivist', description: 'Read 150 different notes.', secret: false, stat: 'notesRead', target: 150, reward: { kind: 'skin', id: 'knight-gold' } },
  { id: 'pack-rat', name: 'Pack Rat', description: 'Read 300 different notes.', secret: false, stat: 'notesRead', target: 300, reward: { kind: 'pet', id: 'lion-cub' } },

  { id: 'neighbor', name: 'Good Neighbor', description: 'Visit 3 different houses.', secret: false, stat: 'housesVisited', target: 3, reward: { kind: 'pet', id: 'dog' } },
  { id: 'explorer', name: 'Explorer', description: 'Visit 10 different houses.', secret: false, stat: 'housesVisited', target: 10, reward: { kind: 'skin', id: 'ninja-blue' } },
  { id: 'globetrotter', name: 'Globetrotter', description: 'Visit 30 different houses.', secret: false, stat: 'housesVisited', target: 30, reward: { kind: 'skin', id: 'samurai' } },
  { id: 'census-taker', name: 'Census Taker', description: 'Visit 60 different houses.', secret: false, stat: 'housesVisited', target: 60, reward: { kind: 'skin', id: 'skeleton' } },

  { id: 'pocket-change', name: 'Pocket Change', description: 'Earn 100 coins by writing notes.', secret: false, stat: 'coinsEarned', target: 100, reward: { kind: 'pet', id: 'cat-black' } },
  { id: 'saver', name: 'Saver', description: 'Earn 500 coins by writing notes.', secret: false, stat: 'coinsEarned', target: 500, reward: { kind: 'skin', id: 'sorcerer-orange' } },
  { id: 'tycoon', name: 'Tycoon', description: 'Earn 2000 coins by writing notes.', secret: false, stat: 'coinsEarned', target: 2000, reward: { kind: 'skin', id: 'noble' } },
  { id: 'mogul', name: 'Mogul', description: 'Earn 5000 coins by writing notes.', secret: false, stat: 'coinsEarned', target: 5000, reward: { kind: 'pet', id: 'cat-cyclop' } },

  { id: 'decorator', name: 'Decorator', description: 'Put 4 pieces of furniture in one room.', secret: false, stat: 'roomFurniture', target: 4, reward: { kind: 'pet', id: 'dog2' } },
  { id: 'interior-designer', name: 'Interior Designer', description: 'Put 8 pieces of furniture in one room.', secret: false, stat: 'roomFurniture', target: 8, reward: { kind: 'skin', id: 'gladiator' } },
  { id: 'curator', name: 'Curator', description: 'Put 12 pieces of furniture in one room.', secret: false, stat: 'roomFurniture', target: 12, reward: { kind: 'skin', id: 'princess' } },
  { id: 'hoarder', name: 'Hoarder', description: 'Put 20 pieces of furniture in one room.', secret: false, stat: 'roomFurniture', target: 20, reward: { kind: 'skin', id: 'gold-statue' } },

  { id: 'makeover', name: 'Makeover', description: 'Restyle a house exterior 3 times.', secret: false, stat: 'exteriorsChanged', target: 3, reward: { kind: 'pet', id: 'frog' } },
  { id: 'architect', name: 'Architect', description: 'Restyle a house exterior 10 times.', secret: false, stat: 'exteriorsChanged', target: 10, reward: { kind: 'skin', id: 'ninja-fire' } },

  { id: 'wanderer', name: 'Wanderer', description: 'Walk 500 tiles.', secret: false, stat: 'tilesWalked', target: 500, reward: { kind: 'pet', id: 'racoon' } },
  { id: 'marathon', name: 'Marathon', description: 'Walk 5000 tiles.', secret: false, stat: 'tilesWalked', target: 5000, reward: { kind: 'skin', id: 'ninja-thunder' } },

  { id: 'chameleon', name: 'Chameleon', description: 'Try every town biome.', secret: true, stat: 'biomesTried', target: 3, reward: { kind: 'skin', id: 'vampire' } },
  { id: 'still-life', name: 'Still Life', description: 'Stand perfectly still for a full minute.', secret: true, stat: 'stillMinute', target: 1, reward: { kind: 'skin', id: 'spirit' } },
  { id: 'long-walk', name: 'The Long Walk', description: 'Walk 20000 tiles.', secret: true, stat: 'tilesWalked', target: 20000, reward: { kind: 'skin', id: 'ninja-mage-black' } },
];

export function achievementFor(kind: 'skin' | 'pet', id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.reward.kind === kind && a.reward.id === id);
}
