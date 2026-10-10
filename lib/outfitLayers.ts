import { hairAssetPath, hairTextureKey } from './characterCatalog';
import { HAIR_LAYER, SKINS, outfitAssetPath, outfitTextureKey, type SkinId } from './rewards';
import type { Appearance } from './types';

const outfitOf = (skin: SkinId) => SKINS.find((s) => s.id === skin);

// Texture keys for an outfit, bottom to top, ready to draw over the player base.
export function outfitLayerKeys(skin: SkinId, appearance: Appearance): string[] {
  const outfit = outfitOf(skin);
  if (!outfit) return [];
  return outfit.layers.map((layer, i) =>
    layer === HAIR_LAYER ? hairTextureKey(appearance.hairStyle, appearance.hairColor) : outfitTextureKey(skin, i),
  );
}

// The same stack as page URLs, for the wardrobe preview.
export function outfitLayerUrls(skin: SkinId, appearance: Appearance): string[] {
  const outfit = outfitOf(skin);
  if (!outfit) return [];
  return outfit.layers.map((layer, i) =>
    layer === HAIR_LAYER ? `/${hairAssetPath(appearance.hairStyle, appearance.hairColor)}` : `/${outfitAssetPath(skin, i)}`,
  );
}
