'use client';

import { useState } from 'react';
import { setHostShare, startHosting } from '@/lib/multiplayer/host';
import { MAX_NAME, type ShareMode } from '@/lib/multiplayer/protocol';
import { RoomError } from '@/lib/multiplayer/room';
import {
  END_MESSAGES, RELAY_URL, dismissEnd, endSession, loadName, saveName, useSession,
} from '@/lib/multiplayer/session';
import { useVault } from '@/lib/vault/open';

const backToTitle = () => window.location.assign(window.location.pathname);

const SHARE_LABELS: Record<ShareMode, string> = {
  notes: 'Town + notes: guests can open any note and its images',
  town: 'Town only: guests see houses and note titles, not what notes say',
};

function ShareChoice({ value, onChange }: { value: ShareMode; onChange: (s: ShareMode) => void }) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      {(Object.keys(SHARE_LABELS) as ShareMode[]).map((mode) => (
        <label key={mode} className="flex items-start gap-2">
          <input type="radio" name="share" checked={value === mode} onChange={() => onChange(mode)} className="mt-1" />
          {SHARE_LABELS[mode]}
        </label>
      ))}
    </fieldset>
  );
}

export default function RoomPanel() {
  const { vault } = useVault();
  const session = useSession();
  const [setupOpen, setSetupOpen] = useState(false);
  const [name, setName] = useState(loadName);
  const [share, setShare] = useState<ShareMode>('notes');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!RELAY_URL) return null;

  if (session.status === 'ended' && session.end) {
    return (
      <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="flex w-80 flex-col gap-4 rounded bg-black/90 p-6 text-white">
          <p>{END_MESSAGES[session.end]}</p>
          {session.role === 'guest' ? (
            <button className="rounded bg-white px-4 py-2 font-medium text-black" onClick={backToTitle}>
              Back to title
            </button>
          ) : (
            <button className="rounded bg-white px-4 py-2 font-medium text-black" onClick={dismissEnd}>
              Keep studying alone
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!vault) return null;

  if (session.status === 'live' && session.role === 'guest') {
    return (
      <div className="absolute right-4 top-4 z-40 flex items-center gap-3 rounded bg-black/70 px-3 py-2 text-sm text-white">
        <span>Study session · {session.peers.length + 1} here</span>
        <button
          className="rounded border border-white/60 px-2 py-0.5"
          onClick={() => {
            endSession(null);
            backToTitle();
          }}
        >
          Leave
        </button>
      </div>
    );
  }

  if (session.status === 'live') {
    return (
      <div className="absolute right-4 top-4 z-40 flex w-80 flex-col gap-3 rounded bg-black/80 p-4 text-sm text-white">
        <div className="flex gap-2">
          <input readOnly value={session.invite ?? ''} className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1" onFocus={(e) => e.target.select()} />
          <button
            className="rounded bg-white px-3 py-1 font-medium text-black"
            onClick={async () => {
              await navigator.clipboard.writeText(session.invite ?? '');
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <ShareChoice value={session.share} onChange={setHostShare} />
        <div>
          <p className="font-semibold">Here now</p>
          <p>{session.name} (you)</p>
          {session.peers.map((p) => <p key={p.id}>{p.name}</p>)}
        </div>
        <button className="rounded border border-white/60 px-3 py-1" onClick={() => endSession(null)}>
          End session
        </button>
      </div>
    );
  }

  if (!setupOpen) {
    return (
      <button
        className="absolute right-4 top-4 z-40 rounded bg-white px-4 py-2 font-medium text-black"
        onClick={() => setSetupOpen(true)}
      >
        Invite friends
      </button>
    );
  }

  const start = async () => {
    setBusy(true);
    setError(null);
    saveName(name);
    try {
      await startHosting(vault, name, share);
      setSetupOpen(false);
    } catch (err) {
      setError(END_MESSAGES[err instanceof RoomError ? err.reason : 'relay-unreachable']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setSetupOpen(false)}>
      <form
        className="flex w-96 flex-col gap-3 rounded bg-black/90 p-6 text-sm text-white"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && name.trim()) start();
        }}
      >
        <h2 className="text-lg font-semibold">Invite friends to study</h2>
        <label className="flex flex-col gap-1">
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
        <ShareChoice value={share} onChange={setShare} />
        <p className="text-white/70">
          Guests always see your folder names and note titles. Everything is end-to-end encrypted; the relay can&apos;t read it.
        </p>
        <div className="flex gap-2">
          <button type="submit" disabled={busy || !name.trim()} className="flex-1 rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50">
            {busy ? 'Starting…' : 'Start session'}
          </button>
          <button type="button" className="rounded border border-white/60 px-4 py-2" onClick={() => setSetupOpen(false)}>
            Cancel
          </button>
        </div>
        {error && <p className="text-red-300">{error}</p>}
      </form>
    </div>
  );
}
