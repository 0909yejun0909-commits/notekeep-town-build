import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { requiredSamples, sampleName, sampleUrl } from '../lib/samples.ts';

// Downloads the FluidR3 soundfont (CC BY 3.0, rendered to mp3 by gleitz/midi-js-soundfonts) and
// keeps only the notes the music and sound effects use, as public/audio/<instrument>/<note>.mp3.
// Re-run after changing lib/tracks.ts or the instruments in lib/samples.ts.

const SOURCE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';
const root = new URL('../public', import.meta.url).pathname;

rmSync(`${root}/audio`, { recursive: true, force: true });
let total = 0;
for (const [instrument, midis] of requiredSamples()) {
  const res = await fetch(`${SOURCE}/${instrument}-mp3.js`);
  if (!res.ok) throw new Error(`${instrument}: HTTP ${res.status}`);
  const notes = new Map([...(await res.text()).matchAll(/"([A-G]b?-?\d)": "data:audio\/mp3;base64,([^"]+)"/g)].map((m) => [m[1], m[2]]));
  mkdirSync(`${root}/audio/${instrument}`, { recursive: true });
  for (const midi of [...midis].sort((a, b) => a - b)) {
    const data = notes.get(sampleName(midi));
    if (!data) throw new Error(`${instrument} has no ${sampleName(midi)}`);
    const bytes = Buffer.from(data, 'base64');
    writeFileSync(root + sampleUrl(instrument, midi), bytes);
    total += bytes.length;
  }
  console.log(`${instrument}: ${midis.size} notes`);
}
console.log(`${(total / 1024 / 1024).toFixed(1)} MB`);
