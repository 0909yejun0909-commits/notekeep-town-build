'use client';

import { useState } from 'react';
import { JoinError, joinRoom, type Invite } from '@/lib/multiplayer/guest';
import { MAX_NAME } from '@/lib/multiplayer/protocol';
import { END_MESSAGES, loadName, saveName } from '@/lib/multiplayer/session';
import type { VaultHandle } from '@/lib/types';

export default function JoinScreen({ invite, onVault }: { invite: Invite; onVault: (v: VaultHandle) => void }) {
  const [name, setName] = useState(loadName);
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canPick = 'showDirectoryPicker' in window;

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

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <form
        className="flex w-80 flex-col gap-3 rounded bg-black/85 p-6 text-white"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && name.trim()) join();
        }}
      >
        <h2 className="text-lg font-semibold">Join a study session</h2>
        <label className="flex flex-col gap-1 text-sm">
          Your name
          <input
            autoFocus
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="rounded bg-white px-2 py-1 text-black"
          />
        </label>
        {canPick && (
          <button type="button" onClick={pick} className="rounded border border-white/60 px-3 py-2 text-left text-sm">
            {dir ? `Reading notes from your copy: ${dir.name}` : 'I have this vault too (optional)'}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded bg-white px-6 py-3 font-medium text-black disabled:opacity-50"
        >
          {busy ? 'Joining…' : 'Join'}
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </form>
    </div>
  );
}
