'use client';

import { useState } from 'react';
import styles from './JoinScreen.module.css';
import pixel from './pixelUi.module.css';
import TitleFrame from './TitleFrame';
import { JoinError, joinRoom, type Invite } from '@/lib/multiplayer/guest';
import { MAX_NAME } from '@/lib/multiplayer/protocol';
import { END_MESSAGES, loadName, saveName } from '@/lib/multiplayer/session';
import type { VaultHandle } from '@/lib/types';

export default function JoinScreen({ invite, onVault }: { invite: Invite; onVault: (v: VaultHandle) => void }) {
  const [name, setName] = useState(loadName);
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which action the cursor points at: Join (what Enter does) or the optional vault pick.
  const [cursor, setCursor] = useState<'join' | 'pick'>('join');
  const canPick = 'showDirectoryPicker' in window;
  const canJoin = !busy && name.trim() !== '';

  const pick = async () => {
    try {
      setDir(await (window as any).showDirectoryPicker({ mode: 'read' }));
    } catch {
      // Picker cancelled.
    }
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    saveName(name);
    try {
      await joinRoom(invite, name, dir, onVault);
    } catch (err) {
      setError(END_MESSAGES[err instanceof JoinError ? err.reason : 'connection-lost']);
      setBusy(false);
    }
  };

  const cursorClass = (at: 'join' | 'pick') => `${pixel.cursor} ${cursor === at && !busy ? '' : pixel.cursorIdle}`;

  return (
    <TitleFrame subtitle="You've been invited to study together" hint="Type your name, then press Enter to join">
      <form
        className={`${pixel.parchment} ${styles.form}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (canJoin) join();
        }}
      >
        <h2 className={styles.heading}>Join a study session</h2>

        <label className={styles.label}>
          Your name
          <input
            autoFocus
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            onFocus={() => setCursor('join')}
            className={pixel.field}
          />
        </label>

        <div className={styles.actions}>
          <button
            type="submit"
            disabled={!canJoin}
            className={`${pixel.item} ${cursor === 'join' ? pixel.current : ''}`}
            onMouseEnter={() => setCursor('join')}
            onFocus={() => setCursor('join')}
          >
            <span className={cursorClass('join')} />
            {busy ? 'Joining...' : 'Join'}
          </button>
          {canPick && (
            <button
              type="button"
              disabled={busy}
              className={`${pixel.item} ${styles.pick} ${cursor === 'pick' ? pixel.current : ''}`}
              onMouseEnter={() => setCursor('pick')}
              onMouseLeave={() => setCursor('join')}
              onFocus={() => setCursor('pick')}
              onClick={pick}
            >
              <span className={cursorClass('pick')} />
              {dir ? `Reading notes from your copy: ${dir.name}` : 'I have this vault too (optional)'}
            </button>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </form>
    </TitleFrame>
  );
}
