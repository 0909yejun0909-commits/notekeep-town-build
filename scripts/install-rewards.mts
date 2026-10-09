import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { PETS, SKINS } from '../lib/rewards.ts';

// Copies the reward sprites out of the Ninja Adventure pack (CC0) into public/assets, which is
// gitignored. Re-run after changing the catalog in lib/rewards.ts.
const source = process.env.NINJA ?? `${homedir()}/ninja-adventure/Ninja Adventure - Asset Pack`;
const dest = new URL('../public/assets', import.meta.url).pathname;

if (!existsSync(`${source}/Actor`)) {
  throw new Error(`Ninja Adventure pack not found at ${source}. Unzip it there or set NINJA=<folder containing Actor/>.`);
}
mkdirSync(`${dest}/skins`, { recursive: true });
mkdirSync(`${dest}/pets`, { recursive: true });

for (const s of SKINS) copyFileSync(`${source}/Actor/Character/${s.folder}/SpriteSheet.png`, `${dest}/skins/${s.id}.png`);
for (const p of PETS) copyFileSync(`${source}/Actor/Animal/${p.folder}/SpriteSheet.png`, `${dest}/pets/${p.id}.png`);
console.log(`Installed ${SKINS.length} skins and ${PETS.length} pets into ${dest}`);
