import { bus } from '@/game/bus';
import { preloadSfx, sfx, type Sfx } from '@/game/audio/sfx';

// Most sounds follow events that already cross the bus, so they're wired here in one place
// rather than in every scene and panel. Some actions emit several at once (fast travel closes
// the note and the shelf, then travels; saving an editor commits, then closes), so a burst
// plays only its most important sound, the earliest in this list.
const RANK: Sfx[] = ['doorOpen', 'doorClose', 'place', 'wardrobe', 'talk', 'pageOpen', 'pageClose', 'open', 'close'];

const SOUND_FOR = {
  'enter-house': 'doorOpen',
  'exit-house': 'doorClose',
  'fast-travel': 'doorOpen',
  'open-note': 'pageOpen',
  'close-note': 'pageClose',
  'open-shelf': 'pageOpen',
  'close-shelf': 'pageClose',
  'talk-npc': 'talk',
  'open-wardrobe': 'wardrobe',
  'close-wardrobe': 'close',
  'open-bed-menu': 'open',
  'open-interior-editor': 'open',
  'close-interior-editor': 'close',
  'open-exterior-editor': 'open',
  'close-exterior-editor': 'close',
  'commit-interior-layout': 'place',
  'commit-exterior-variant': 'place',
} as const satisfies Partial<Record<Parameters<typeof bus.on>[0], Sfx>>;

export function attachSoundEvents(): () => void {
  preloadSfx();
  let burst: Sfx | null = null;
  const play = (name: Sfx) => {
    if (burst === null) queueMicrotask(() => {
      sfx(burst!);
      burst = null;
    });
    if (burst === null || RANK.indexOf(name) < RANK.indexOf(burst)) burst = name;
  };
  const entries = Object.entries(SOUND_FOR) as Array<[keyof typeof SOUND_FOR, Sfx]>;
  const handlers = entries.map(([event, name]) => [event, () => play(name)] as const);
  handlers.forEach(([event, cb]) => bus.on(event, cb));
  return () => handlers.forEach(([event, cb]) => bus.off(event, cb));
}
