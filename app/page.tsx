'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { VaultProvider, useVault } from '@/lib/vault/open';
import NoteReader from '@/components/NoteReader';
import Bookshelf from '@/components/Bookshelf';
import TitleMenu from '@/components/TitleMenu';
import InteriorEditor from '@/components/InteriorEditor';
import ExteriorEditor from '@/components/ExteriorEditor';
import RoomPanel from '@/components/RoomPanel';
import JoinScreen from '@/components/JoinScreen';
import ChatPanel from '@/components/ChatPanel';
import PlayerTags from '@/components/PlayerTags';
import BiomePicker from '@/components/BiomePicker';
import MissingArtBanner from '@/components/MissingArtBanner';
import { bus } from '@/game/bus';
import { readInvite, type Invite } from '@/lib/multiplayer/guest';
import { RELAY_URL } from '@/lib/multiplayer/session';
import type { NoteRef } from '@/lib/types';

const PhaserCanvas = dynamic(() => import('@/components/PhaserCanvas'), { ssr: false });

function Game() {
  const { vault, setVault } = useVault();
  const [openNote, setOpenNote] = useState<NoteRef | null>(null);
  const [npcLine, setNpcLine] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);

  useEffect(() => {
    if (RELAY_URL) setInvite(readInvite());
  }, []);

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

      {!vault && !invite && <TitleMenu onVault={setVault} />}
      {!vault && invite && <JoinScreen invite={invite} onVault={setVault} />}

      <Bookshelf />
      <NoteReader note={openNote} />
      <InteriorEditor />
      <ExteriorEditor />
      <PlayerTags />
      <ChatPanel />
      <RoomPanel />
      <BiomePicker />
      <MissingArtBanner />

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
