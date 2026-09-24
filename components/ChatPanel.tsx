'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_CHAT } from '@/lib/multiplayer/protocol';
import { sendChat, useSession } from '@/lib/multiplayer/session';

// A key held down while the input takes focus never gets its keyup through to Phaser,
// so the player would keep walking. Drop every key's held state on focus.
function releaseGameKeys() {
  const game = (window as any).__game;
  game?.scene?.getScenes(true).forEach((s: any) => s.input?.keyboard?.resetKeys());
}

export default function ChatPanel() {
  const session = useSession();
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const live = session.status === 'live';

  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 't' && e.key !== 'T') return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [session.chat]);

  if (!live) return null;

  return (
    <div className="absolute bottom-4 left-4 z-40 flex w-80 flex-col gap-2 rounded bg-black/70 p-2 text-sm text-white">
      <div ref={log} className="max-h-40 overflow-y-auto">
        {session.chat.length === 0 && <p className="text-white/50">Press T to chat.</p>}
        {session.chat.map((line) => (
          <p key={line.id} className="break-words">
            <span className="font-semibold">{line.name}:</span> {line.text}
          </p>
        ))}
      </div>
      <input
        ref={input}
        value={draft}
        maxLength={MAX_CHAT}
        placeholder="Say something… (T)"
        className="rounded bg-white/10 px-2 py-1 outline-none placeholder:text-white/40 focus:bg-white/20"
        onFocus={releaseGameKeys}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Keep Phaser's window-level key handlers (WASD, Space, Enter) from eating keystrokes.
          e.stopPropagation();
          if (e.key === 'Enter') {
            sendChat(draft);
            setDraft('');
          }
          if (e.key === 'Escape') e.currentTarget.blur();
        }}
      />
    </div>
  );
}
