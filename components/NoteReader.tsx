'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { NoteRef, VaultHandle } from '@/lib/types';
import { useVault } from '@/lib/vault/open';
import { bus } from '@/game/bus';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'mov'];

function extOf(path: string): string {
  const clean = path.split('#')[0].split('?')[0];
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase();
}

function isRemote(path: string): boolean {
  return /^(https?:|data:|blob:)/i.test(path);
}

async function resolveBinary(vault: VaultHandle, notePath: string, path: string): Promise<string | null> {
  const dir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/') + 1) : '';
  const candidates = dir ? [dir + path, path] : [path];
  for (const candidate of candidates) {
    try {
      const blob = await vault.readBinary(candidate);
      return URL.createObjectURL(blob);
    } catch {
      continue;
    }
  }
  return null;
}

async function resolveEmbeds(
  raw: string,
  vault: VaultHandle,
  notePath: string
): Promise<{ content: string; urls: string[] }> {
  const wikiRe = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const stdRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  const jobs: { match: string; path: string; alt: string }[] = [];

  for (const m of raw.matchAll(wikiRe)) {
    jobs.push({ match: m[0], path: m[1], alt: m[2] ?? m[1] });
  }
  for (const m of raw.matchAll(stdRe)) {
    if (isRemote(m[2])) continue;
    jobs.push({ match: m[0], path: m[2], alt: m[1] || m[2] });
  }

  const cache = new Map<string, string | null>();
  const urls: string[] = [];

  for (const job of jobs) {
    if (cache.has(job.path)) continue;
    const url = await resolveBinary(vault, notePath, job.path);
    cache.set(job.path, url);
    if (url) urls.push(url);
  }

  let content = raw;
  for (const job of jobs) {
    const url = cache.get(job.path);
    if (!url) continue;
    const replacement = `![${job.alt}](${url} "${job.path}")`;
    content = content.split(job.match).join(replacement);
  }

  return { content, urls };
}

export default function NoteReader({ note }: { note: NoteRef | null }) {
  const { vault } = useVault();
  const [content, setContent] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  useEffect(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    setContent(null);

    if (!note || !vault) return;

    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const raw = await vault.readNote(note.id);
        const { content: resolved, urls } = await resolveEmbeds(raw, vault, note.id);
        if (cancelled) {
          urls.forEach((u) => URL.revokeObjectURL(u));
          return;
        }
        urlsRef.current = urls;
        setContent(resolved);
        setStatus('idle');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [note, vault]);

  useEffect(() => {
    if (!note) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        bus.emit('close-note', undefined);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [note]);

  return (
    <>
      <style>{`
        @font-face {
          font-family: 'CuteFantasy';
          src: url('/assets/ui/cute-fantasy.ttf') format('truetype');
        }
      `}</style>
      {note && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => bus.emit('close-note', undefined)}
        >
          <div
            className="relative flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 896,
              height: 576,
              maxWidth: '92vw',
              maxHeight: '88vh',
              backgroundImage: "url('/assets/ui/book.png')",
              backgroundPosition: '-32px 0px',
              backgroundSize: '6720px 1728px',
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
              padding: '9% 12%',
            }}
          >
            <h2
              style={{
                fontFamily: "'CuteFantasy', monospace",
                fontSize: 20,
                color: '#3f2832',
                marginBottom: 12,
              }}
            >
              {note.title}
            </h2>
            <div
              className="note-body flex-1 overflow-y-auto"
              style={{
                fontFamily:
                  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                fontSize: 15,
                lineHeight: 1.5,
                color: '#2b1d18',
              }}
            >
              {status === 'loading' && <p>Loading…</p>}
              {status === 'error' && <p>Could not read this note.</p>}
              {content && (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  urlTransform={(url) => url}
                  components={{
                    img: (props) => {
                      const { src, alt, title } = props;
                      const ext = extOf(title || alt || '');
                      if (VIDEO_EXT.includes(ext)) {
                        return (
                          <video
                            controls
                            src={src}
                            style={{ maxWidth: '100%', imageRendering: 'pixelated' }}
                          />
                        );
                      }
                      return (
                        <img
                          src={src}
                          alt={alt}
                          style={{ maxWidth: '100%', imageRendering: 'pixelated' }}
                        />
                      );
                    },
                  }}
                >
                  {content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
