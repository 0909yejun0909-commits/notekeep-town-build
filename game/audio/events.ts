import { bus } from '@/game/bus';
import type { ShelfLook } from '@/lib/catalog';
import { preloadSfx, sfx, type Sfx } from '@/game/audio/sfx';

// Most sounds follow events that already cross the bus, so they're wired here in one place
// rather than in every scene and panel. Some actions emit several at once (fast travel closes
// the note and the shelf, then travels; saving an editor commits, then closes), so a burst
// plays only its most important sound, the earliest in this list.
const RANK: Sfx[] = [
  'doorOpen', 'doorClose', 'place', 'wardrobe', 'talk',
  'fridgeOpen', 'fridgeClose', 'wardrobeOpen', 'wardrobeClose', 'pageOpen', 'pageClose', 'open', 'close',
];

// What the room's note store looks like decides what its door sounds like.
const OPEN_SHELF: Record<ShelfLook, Sfx> = { books: 'pageOpen', fridge: 'fridgeOpen', wardrobe: 'wardrobeOpen' };
const CLOSE_SHELF: Record<ShelfLook, Sfx> = { books: 'pageClose', fridge: 'fridgeClose', wardrobe: 'wardrobeClose' };

const SOUND_FOR = {
  'enter-house': 'doorOpen',
  'exit-house': 'doorClose',
  'fast-travel': 'doorOpen',
  'open-note': 'pageOpen',
  'close-note': 'pageClose',
  'talk-npc': 'talk',
  'open-wardrobe': 'wardrobe',
  'close-wardrobe': 'close',
  'open-choice-menu': 'open',
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
  let look: ShelfLook = 'books';
  const onOpenShelf = (e: { look: ShelfLook }) => {
    look = e.look;
    play(OPEN_SHELF[look]);
  };
  const onCloseShelf = () => play(CLOSE_SHELF[look]);
  bus.on('open-shelf', onOpenShelf);
  bus.on('close-shelf', onCloseShelf);
  const entries = Object.entries(SOUND_FOR) as Array<[keyof typeof SOUND_FOR, Sfx]>;
  const handlers = entries.map(([event, name]) => [event, () => play(name)] as const);
  handlers.forEach(([event, cb]) => bus.on(event, cb));
  return () => {
    bus.off('open-shelf', onOpenShelf);
    bus.off('close-shelf', onCloseShelf);
    handlers.forEach(([event, cb]) => bus.off(event, cb));
  };
}
