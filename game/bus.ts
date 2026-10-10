import type { ShelfLook } from '@/lib/catalog';
import type { InteriorLayout, MaterialId, NoteRef, RoofColor, WallColor } from '@/lib/types';
import type { TownPropId, TownTool } from '@/lib/townEdits';

type BusEvents = {
  'assets-missing': { files: string[] };
  'enter-house': { houseId: string };
  'exit-house': undefined;
  // Jump straight into a house's room from anywhere. With noteId, the player lands at that note's
  // furniture (or the bookshelf, if the note has no furniture) and the note opens.
  'fast-travel': { houseId: string; roomId?: string; noteId?: string };
  'open-note': { note: NoteRef };
  'close-note': undefined;
  'open-shelf': { houseId: string; roomId: string; look: ShelfLook };
  'close-shelf': undefined;
  'talk-npc': { npcId: string; line: string };
  'world-updated': { exteriorChanged: boolean };
  'appearance-changed': undefined;
  'open-wardrobe': undefined;
  'close-wardrobe': undefined;
  'open-study': { houseId: string; mode: 'flashcards' | 'quiz' };
  'close-study': undefined;
  'open-computer': { houseId: string };
  'close-computer': undefined;
  'open-arcade': { houseId: string };
  'close-arcade': undefined;
  // index is the option picked, null if the menu was dismissed.
  'open-choice-menu': { title: string; options: string[] };
  'choice-menu-choice': { index: number | null };
  'open-interior-editor': {
    houseId: string;
    roomId: string;
    layout: InteriorLayout;
    doorsNeeded: number;
    // The entrance's doorways, by room name; empty in other rooms.
    roomNames: string[];
    canAddRooms: boolean;
  };
  'close-interior-editor': undefined;
  'commit-interior-layout': { roomId: string; layout: InteriorLayout };
  'open-exterior-editor': {
    houseId: string;
    currentVariant: number;
    currentMaterial: MaterialId;
    currentWallColor: WallColor;
    currentRoofColor: RoofColor;
    siblingHouses: Array<{ id: string; gx: number; gy: number; variant: number }>;
    gx: number;
    gy: number;
  };
  'close-exterior-editor': undefined;
  // Village building (components/TownEditor.tsx <-> OverworldScene).
  'open-town-editor': undefined;
  'close-town-editor': undefined;
  'town-tool': { tool: TownTool | null };
  'town-message': { text: string };
  'town-edited': { bag: Partial<Record<TownPropId, number>> };
  'commit-exterior-variant': {
    houseId: string;
    variant: number;
    material: MaterialId;
    wallColor: WallColor;
    roofColor: RoofColor;
  };
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
