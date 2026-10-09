import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { HAIR_LAYER, PETS, SKINS } from '../lib/rewards.ts';

// Outfits are stacks of layers from the Kenmi player kit (the same pack scripts/install-assets.sh
// uses), plus wizard hats generated from its Farmer hat by scripts/make-wizard-hats.py (needs
// Python 3 with Pillow). Pets come from the Ninja Adventure pack (CC0). Everything lands in
// public/assets, which is gitignored. Re-run after changing the catalog in lib/rewards.ts.
const kenmi = process.env.KENMI ?? `${homedir()}/kenmi-art`;
const player = `${kenmi}/Cute_Fantasy/Player`;
const ninja = process.env.NINJA ?? `${homedir()}/ninja-adventure/Ninja Adventure - Asset Pack`;
const dest = new URL('../public/assets', import.meta.url).pathname;

if (!existsSync(`${player}/Player_Base`)) throw new Error(`Kenmi player kit not found at ${player}. Set KENMI=<folder containing Cute_Fantasy/>.`);
if (!existsSync(`${ninja}/Actor`)) throw new Error(`Ninja Adventure pack not found at ${ninja}. Unzip it there or set NINJA=<folder containing Actor/>.`);

rmSync(`${dest}/outfits`, { recursive: true, force: true });
rmSync(`${dest}/skins`, { recursive: true, force: true });
const generated = `${dest}/outfits/_generated`;
mkdirSync(generated, { recursive: true });
execFileSync('python3', [fileURLToPath(new URL('./make-wizard-hats.py', import.meta.url)), `${player}/Accessories/Farmer_Hat_1.png`, generated], { stdio: 'inherit' });

let layers = 0;
for (const outfit of SKINS) {
  mkdirSync(`${dest}/outfits/${outfit.id}`, { recursive: true });
  outfit.layers.forEach((layer, i) => {
    if (layer === HAIR_LAYER) return;
    const source = layer.startsWith('@gen/') ? `${generated}/${layer.slice(5)}.png` : `${player}/${layer}`;
    copyFileSync(source, `${dest}/outfits/${outfit.id}/${i}.png`);
    layers += 1;
  });
}

mkdirSync(`${dest}/pets`, { recursive: true });
for (const p of PETS) copyFileSync(`${ninja}/Actor/Animal/${p.folder}/SpriteSheet.png`, `${dest}/pets/${p.id}.png`);
console.log(`Installed ${SKINS.length} outfits (${layers} layers) and ${PETS.length} pets into ${dest}`);
