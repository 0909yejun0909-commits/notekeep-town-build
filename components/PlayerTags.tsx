'use client';

import { useEffect, useRef, useState } from 'react';
import { avatarAnchors } from '@/game/anchors';
import { useSession } from '@/lib/multiplayer/session';

const BUBBLE_MS = 5000;

export default function PlayerTags() {
  const session = useSession();
  const tags = useRef(new Map<string, HTMLDivElement>());
  const [, rerender] = useState(0);
  const live = session.status === 'live';

  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const place = () => {
      const seen = new Set<string>();
      for (const a of avatarAnchors()) {
        const el = tags.current.get(a.id);
        if (!el) continue;
        seen.add(a.id);
        el.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) translate(-50%, -100%)`;
        el.style.visibility = 'visible';
      }
      for (const [id, el] of tags.current) if (!seen.has(id)) el.style.visibility = 'hidden';
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [live]);

  // Re-render when the next speech bubble should disappear.
  useEffect(() => {
    const now = Date.now();
    const expiries = session.chat.map((l) => l.at + BUBBLE_MS).filter((t) => t > now);
    if (expiries.length === 0) return;
    const timer = setTimeout(() => rerender((n) => n + 1), Math.min(...expiries) - now + 20);
    return () => clearTimeout(timer);
  });

  if (!live || !session.selfId) return null;

  const now = Date.now();
  const bubbles = new Map<string, string>();
  for (const line of session.chat) if (now - line.at < BUBBLE_MS) bubbles.set(line.from, line.text);
  const people = [{ id: session.selfId, name: session.name }, ...session.peers];

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {people.map((p) => (
        <div
          key={p.id}
          ref={(el) => {
            if (el) tags.current.set(p.id, el);
            else tags.current.delete(p.id);
          }}
          className="absolute left-0 top-0 flex flex-col items-center"
          style={{ visibility: 'hidden' }}
        >
          {bubbles.has(p.id) && (
            <div className="mb-1 max-w-56 break-words rounded bg-white px-2 py-1 text-xs text-black shadow">
              {bubbles.get(p.id)}
            </div>
          )}
          <div className="whitespace-nowrap rounded bg-black/70 px-1.5 text-[11px] leading-4 text-white">{p.name}</div>
        </div>
      ))}
    </div>
  );
}
