'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { VaultProvider, useVault, openVault, openDemoVault } from '@/lib/vault/open';
import NoteReader from '@/components/NoteReader';
import Bookshelf from '@/components/Bookshelf';
import CharacterCreator from '@/components/CharacterCreator';
import { bus } from '@/game/bus';
import type { NoteRef } from '@/lib/types';

const PhaserCanvas = dynamic(() => import('@/components/PhaserCanvas'), { ssr: false });

function Game() {
  const { vault, setVault } = useVault();
  const [openNote, setOpenNote] = useState<NoteRef | null>(null);
  const [npcLine, setNpcLine] = useState<string | null>(null);

  useEffect(() => {
    const onOpenNote = ({ note }: { note: NoteRef }) => setOpenNote(note);
    const onCloseNote = () => setOpenNote(null);
    const onTalkNpc = ({ line }: { npcId: string; line: string }) => setNpcLine(line);

    bus.on('open-note', onOpenNote);
    bus.on('close-note', onCloseNote);
    bus.on('talk-npc', onTalkNpc);

    return () => {
      bus.off('open-note', onOpenNote);
      bus.off('close-note', onCloseNote);
      bus.off('talk-npc', onTalkNpc);
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <PhaserCanvas />

      {!vault && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/40">
          <button
            className="rounded bg-white px-6 py-3 font-medium text-black"
            onClick={async () => setVault(await openVault())}
          >
            Open your vault
          </button>
          <button
            className="rounded border border-white px-6 py-3 font-medium text-white"
            onClick={async () => setVault(await openDemoVault())}
          >
            Try the demo town
          </button>
        </div>
      )}

      <CharacterCreator visible={!vault} />
      <Bookshelf />
      <NoteReader note={openNote} />

      {npcLine && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded bg-black/90 px-6 py-4 text-white">
          {npcLine}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <VaultProvider>
      <Game />
    </VaultProvider>
  );
}
