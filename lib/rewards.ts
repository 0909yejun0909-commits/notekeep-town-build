export const SKIN_CLASSES = ['knight', 'wizard', 'ninja', 'samurai', 'royalty', 'spooky'] as const;
export type SkinClass = (typeof SKIN_CLASSES)[number];

export const SKIN_CLASS_LABEL: Record<SkinClass, string> = {
  knight: 'Knights',
  wizard: 'Wizards',
  ninja: 'Ninjas',
  samurai: 'Samurai',
  royalty: 'Royalty',
  spooky: 'Spooky',
};

// Ninja Adventure (CC0) Actor/Character folders. 16x16 frames, 4 columns (down, up, left, right)
// by 7 rows; rows 0-3 are the walk cycle, so frame 0..3 is each direction's idle.
export const SKINS = [
  { id: 'knight', folder: 'Knight', cls: 'knight', name: 'Knight' },
  { id: 'knight-gold', folder: 'KnightGold', cls: 'knight', name: 'Gold Knight' },
  { id: 'gladiator', folder: 'GladiatorBlue', cls: 'knight', name: 'Gladiator' },
  { id: 'sorcerer-black', folder: 'SorcererBlack', cls: 'wizard', name: 'Dark Sorcerer' },
  { id: 'sorcerer-orange', folder: 'SorcererOrange', cls: 'wizard', name: 'Ember Sorcerer' },
  { id: 'ninja-mage-black', folder: 'NinjaMageBlack', cls: 'wizard', name: 'Shadow Mage' },
  { id: 'ninja-blue', folder: 'NinjaBlue', cls: 'ninja', name: 'Blue Ninja' },
  { id: 'ninja-fire', folder: 'NinjaFire', cls: 'ninja', name: 'Fire Ninja' },
  { id: 'ninja-thunder', folder: 'NinjaThunder', cls: 'ninja', name: 'Thunder Ninja' },
  { id: 'samurai', folder: 'Samurai', cls: 'samurai', name: 'Samurai' },
  { id: 'princess', folder: 'Princess', cls: 'royalty', name: 'Princess' },
  { id: 'noble', folder: 'Noble', cls: 'royalty', name: 'Noble' },
  { id: 'vampire', folder: 'Vampire', cls: 'spooky', name: 'Vampire' },
  { id: 'skeleton', folder: 'Skeleton', cls: 'spooky', name: 'Skeleton' },
  { id: 'spirit', folder: 'Spirit', cls: 'spooky', name: 'Spirit' },
  { id: 'gold-statue', folder: 'GoldStatue', cls: 'spooky', name: 'Golden Statue' },
] as const;

// Ninja Adventure Actor/Animal folders whose SpriteSheet.png is 32x16: two 16x16 frames.
export const PETS = [
  { id: 'cat', folder: 'Cat', name: 'Tabby Cat' },
  { id: 'cat-black', folder: 'CatBlack', name: 'Black Cat' },
  { id: 'cat-cyclop', folder: 'CatCyclop', name: 'Cyclops Cat' },
  { id: 'dog', folder: 'Dog', name: 'Dog' },
  { id: 'dog2', folder: 'Dog2', name: 'Pup' },
  { id: 'frog', folder: 'Frog', name: 'Frog' },
  { id: 'lion-cub', folder: 'LionCub', name: 'Lion Cub' },
  { id: 'racoon', folder: 'Racoon', name: 'Racoon' },
] as const;

export type SkinId = (typeof SKINS)[number]['id'];
export type PetId = (typeof PETS)[number]['id'];

export const skinAssetPath = (id: SkinId) => `assets/skins/${id}.png`;
export const skinTextureKey = (id: SkinId) => `skin-${id}`;
export const petAssetPath = (id: PetId) => `assets/pets/${id}.png`;
export const petTextureKey = (id: PetId) => `pet-${id}`;

export function rewardName(kind: 'skin' | 'pet', id: string): string {
  const list: readonly { id: string; name: string }[] = kind === 'skin' ? SKINS : PETS;
  return list.find((e) => e.id === id)?.name ?? id;
}
