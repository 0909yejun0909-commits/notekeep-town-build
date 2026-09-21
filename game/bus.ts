import type { InteriorLayout, NoteRef } from '@/lib/types';

type BusEvents = {
  'enter-house': { houseId: string };
  'exit-house': undefined;
  'open-note': { note: NoteRef };
  'close-note': undefined;
  'open-shelf': { houseId: string };
  'close-shelf': undefined;
  'talk-npc': { npcId: string; line: string };
  'open-interior-editor': { houseId: string; layout: InteriorLayout };
  'close-interior-editor': undefined;
  'commit-interior-layout': { houseId: string; layout: InteriorLayout };
};

type Callback<K extends keyof BusEvents> = (payload: BusEvents[K]) => void;

const listeners = new Map<keyof BusEvents, Set<Callback<any>>>();

function on<K extends keyof BusEvents>(event: K, cb: Callback<K>) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(cb);
}

function off<K extends keyof BusEvents>(event: K, cb: Callback<K>) {
  listeners.get(event)?.delete(cb);
}

function emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]) {
  listeners.get(event)?.forEach((cb) => cb(payload));
}

export const bus = { on, off, emit };
