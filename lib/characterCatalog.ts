import type { Appearance, ClothColor, HairColor, HairStyle } from './types';

// Every combo below ships as a real installed asset (public/assets/character) — no filtering
// function is needed the way houseCatalog.ts needs availableWallColors, since hair style/color
// and shirt/pants/shoes color are all fully independent axes with complete coverage.
export const HAIR_STYLES: readonly HairStyle[] = [1, 2, 3, 4, 5, 6];
export const HAIR_COLORS: readonly HairColor[] = ['black', 'blonde', 'brown', 'ginger', 'grey'];
export const CLOTH_COLORS: readonly ClothColor[] = [
  'black', 'blue', 'brown', 'green', 'orange', 'pink', 'purple', 'red',
];

// The character's original fixed outfit, from before customisation was added — unchanged
// default so a player who never opens the picker looks exactly as they always did.
export const DEFAULT_APPEARANCE: Appearance = {
  hairStyle: 1,
  hairColor: 'brown',
  shirtColor: 'red',
  pantsColor: 'brown',
  shoesColor: 'black',
};

export function hairAssetPath(style: HairStyle, color: HairColor): string {
  return `assets/character/hair/${style}_${color}.png`;
}
export function shirtAssetPath(color: ClothColor): string {
  return `assets/character/shirt/${color}.png`;
}
export function pantsAssetPath(color: ClothColor): string {
  return `assets/character/pants/${color}.png`;
}
export function shoesAssetPath(color: ClothColor): string {
  return `assets/character/shoes/${color}.png`;
}

export function hairTextureKey(style: HairStyle, color: HairColor): string {
  return `player-hair-${style}-${color}`;
}
export function shirtTextureKey(color: ClothColor): string {
  return `player-shirt-${color}`;
}
export function pantsTextureKey(color: ClothColor): string {
  return `player-pants-${color}`;
}
export function shoesTextureKey(color: ClothColor): string {
  return `player-shoes-${color}`;
}
