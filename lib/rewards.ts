export const SKIN_CLASSES = ['knight', 'wizard', 'royalty', 'folk'] as const;
export type SkinClass = (typeof SKIN_CLASSES)[number];

export const SKIN_CLASS_LABEL: Record<SkinClass, string> = {
  knight: 'Knights',
  wizard: 'Wizards',
  royalty: 'Royalty',
  folk: 'Villagers',
};

// An outfit is a stack of Kenmi layers drawn over the player base, bottom to top, exactly like the
// hair/shirt/pants/shoes pickers do. Layers are paths inside the pack's Cute_Fantasy/Player folder,
// plus two markers: HAIR_LAYER (the player's own hair goes here) and '@gen/<name>' (a sheet made by
// scripts/make-wizard-hats.py). Kenmi ships "Royal_Pantst_1_Red.png" with that typo.
export const HAIR_LAYER = '@hair';

const shoes = 'Feet/Shoes_1_Brown.png';
const plate = (metal: string, helmet = `Head/Plate_Helmet_1/Plate_Helmet_1_${metal}.png`) =>
  [shoes, `Legs/Plate_Legs/Plate_Legs_${metal}.png`, `Chest/Plate_Chest/Plate_Chest_${metal}.png`, helmet] as const;

export const SKINS = [
  { id: 'knight-iron', cls: 'knight', name: 'Iron Knight', layers: plate('Iron') },
  { id: 'knight-bronze', cls: 'knight', name: 'Bronze Knight', layers: plate('Bronze') },
  { id: 'knight-gold', cls: 'knight', name: 'Gold Knight', layers: plate('Gold') },
  { id: 'knight-blue', cls: 'knight', name: 'Blue Knight', layers: plate('Blue') },
  { id: 'knight-red', cls: 'knight', name: 'Red Knight', layers: plate('Red') },
  { id: 'knight-green', cls: 'knight', name: 'Green Knight', layers: plate('Green') },
  {
    id: 'knight-heavy-gold', cls: 'knight', name: 'Heavy Gold Knight',
    layers: plate('Gold', 'Head/Plate_Helmet_2/Heavy_Plate_Helmet_1_Gold.png'),
  },
  {
    id: 'wizard-purple', cls: 'wizard', name: 'Purple Wizard',
    layers: [shoes, 'Legs/Royal_Pants/Royal_Pants_1_Purple.png', 'Chest/Royal_Shirt/Royal_Shirt_1_Purple.png', HAIR_LAYER, '@gen/wizard-hat-purple'],
  },
  {
    id: 'wizard-blue', cls: 'wizard', name: 'Blue Wizard',
    layers: [shoes, 'Legs/Royal_Pants/Royal_Pants_1_Blue.png', 'Chest/Royal_Shirt/Royal_Shirt_1_Blue.png', HAIR_LAYER, '@gen/wizard-hat-blue'],
  },
  {
    id: 'wizard-black', cls: 'wizard', name: 'Shadow Wizard',
    layers: [shoes, 'Legs/Royal_Pants/Royal_Pants_1_Black.png', 'Chest/Royal_Shirt/Royal_Shirt_1_Black.png', HAIR_LAYER, '@gen/wizard-hat-black'],
  },
  {
    id: 'wizard-red', cls: 'wizard', name: 'Red Wizard',
    layers: [shoes, 'Legs/Royal_Pants/Royal_Pantst_1_Red.png', 'Chest/Royal_Shirt/Royal_Shirt_1_Red.png', HAIR_LAYER, '@gen/wizard-hat-red'],
  },
  {
    id: 'royal-purple', cls: 'royalty', name: 'Royal Purple',
    layers: ['Feet/Shoes_1_White.png', 'Legs/Royal_Pants/Royal_Pants_1_Purple.png', 'Chest/Royal_Shirt/Royal_Shirt_1_Purple.png', HAIR_LAYER],
  },
  {
    id: 'royal-blue', cls: 'royalty', name: 'Royal Blue',
    layers: ['Feet/Shoes_1_White.png', 'Legs/Royal_Pants/Royal_Pants_1_Blue.png', 'Chest/Royal_Shirt/Royal_Shirt_1_Blue.png', HAIR_LAYER],
  },
  {
    id: 'royal-red', cls: 'royalty', name: 'Royal Red',
    layers: ['Feet/Shoes_1_White.png', 'Legs/Royal_Pants/Royal_Pantst_1_Red.png', 'Chest/Royal_Shirt/Royal_Shirt_1_Red.png', HAIR_LAYER],
  },
  {
    id: 'lumberjack', cls: 'folk', name: 'Lumberjack',
    layers: [shoes, 'Legs/Farmer_Pants/Farmer_Pants_1_Blue.png', 'Chest/Lumberjack_Shirt/Lumberjack_Shirt_1_Red.png', HAIR_LAYER],
  },
  {
    id: 'farmer', cls: 'folk', name: 'Farmer',
    layers: [shoes, 'Legs/Farmer_Pants/Farmer_Pants_1_Blue.png', 'Chest/Farmer_Shirt/Farmer_Shirt_1_Green.png', 'Accessories/Farmer_Hat_1.png'],
  },
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

export const outfitAssetPath = (id: SkinId, layer: number) => `assets/outfits/${id}/${layer}.png`;
export const outfitTextureKey = (id: SkinId, layer: number) => `outfit-${id}-${layer}`;
export const petAssetPath = (id: PetId) => `assets/pets/${id}.png`;
export const petTextureKey = (id: PetId) => `pet-${id}`;

export function rewardName(kind: 'skin' | 'pet', id: string): string {
  const list: readonly { id: string; name: string }[] = kind === 'skin' ? SKINS : PETS;
  return list.find((e) => e.id === id)?.name ?? id;
}
