'use client';

import { useEffect } from 'react';
import { bus } from '@/game/bus';
import { track, trackDistinct, trackMax } from '@/lib/achievementStore';
import type { InteriorLayout, NoteRef } from '@/lib/types';

// Translates game events into achievement stats; renders nothing.
export default function AchievementTracker() {
  useEffect(() => {
    const onNote = ({ note }: { note: NoteRef }) => trackDistinct('notesRead', note.id);
    const onHouse = ({ houseId }: { houseId: string }) => trackDistinct('housesVisited', houseId);
    const onLayout = ({ layout }: { roomId: string; layout: InteriorLayout }) =>
      trackMax('roomFurniture', layout.placements.length);
    const onExterior = () => track('exteriorsChanged');

    bus.on('open-note', onNote);
    bus.on('enter-house', onHouse);
    bus.on('fast-travel', onHouse);
    bus.on('commit-interior-layout', onLayout);
    bus.on('commit-exterior-variant', onExterior);
    return () => {
      bus.off('open-note', onNote);
      bus.off('enter-house', onHouse);
      bus.off('fast-travel', onHouse);
      bus.off('commit-interior-layout', onLayout);
      bus.off('commit-exterior-variant', onExterior);
    };
  }, []);

  return null;
}
