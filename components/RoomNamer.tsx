'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import { othersInTown } from '@/lib/multiplayer/session';
import { replaceWorld, useVault } from '@/lib/vault/open';
import shelf from './Bookshelf.module.css';
import styles from './RoomNamer.module.css';

const CROWDED = "You can't add rooms while friends are in your town.";

type Target = { houseId: string; houseName: string };

// Walking into the entrance's [+] doorway (InteriorScene) names a new room, which becomes a
// real folder in the vault. Refused while anyone else is in the town.
export default function RoomNamer() {
  const { vault, setVault } = useVault();
  const [target, setTarget] = useState<Target | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onOpen = ({ houseId, houseName, blocked }: Target & { blocked: boolean }) => {
      setTarget({ houseId, houseName });
      setBlocked(blocked);
      setName('');
      setError(null);
    };
    bus.on('open-room-namer', onOpen);
    return () => bus.off('open-room-namer', onOpen);
  }, []);

  const close = (roomId?: string) => {
    setTarget(null);
    bus.emit('close-room-namer', { roomId });
  };

  // Escape with focus outside the form (the form handles its own keys).
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target]);

  if (!target) return null;

  const create = async () => {
    if (!vault?.createRoom || creating) return;
    // Someone may have joined while the prompt was open.
    if (othersInTown()) {
      setBlocked(true);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { world, room } = await vault.createRoom(target.houseId, name);
      setVault({ ...vault, world });
      replaceWorld(world);
      close(room.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the room.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.screen} onClick={() => close()}>
      <form
        className={shelf.namer}
        onClick={(e) => e.stopPropagation()}
        // Keep typed keys (and the Enter that submits) away from Phaser's window listeners.
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
        }}
        onKeyUp={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (blocked) close();
          else void create();
        }}
      >
        {blocked ? (
          <>
            <div className={shelf.namerTitle}>Not right now</div>
            <div>{CROWDED}</div>
            <div className={shelf.namerActions}>
              <button type="submit" className={shelf.btn} autoFocus>OK</button>
            </div>
          </>
        ) : (
          <>
            <div className={shelf.namerTitle}>New room in {target.houseName}</div>
            <input
              className={shelf.input}
              autoFocus
              value={name}
              maxLength={60}
              placeholder="Room name"
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
            {error && <div className={shelf.namerError}>{error}</div>}
            <div className={shelf.namerActions}>
              <button type="button" className={shelf.btn} onClick={() => close()}>Cancel</button>
              <button type="submit" className={shelf.btn} disabled={creating || !name.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
