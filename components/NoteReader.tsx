'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeUrl } from '@/lib/safeUrl';
import type { NoteRef, VaultHandle } from '@/lib/types';
import { useVault } from '@/lib/vault/open';
import { bus } from '@/game/bus';
import { noteProgress, noteSaved } from '@/lib/walletStore';
import Coin from './Coin';

const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'mov'];

// Book art geometry. The panel is the 224x144 book rect scaled 4x; these are the
// text-safe areas inside the two pages' printed ornaments, in panel pixels.
const PANEL_W = 896;
const PANEL_H = 576;
const PAGES_LEFT = 68;
const PAGES_TOP = 76;
const PAGES_W = 754;
const PAGES_H = 400;
const SPINE_GAP = 140;
const PAGE_STRIDE = PAGES_W + SPINE_GAP; // one "turn" = two columns + one gap

const INK = '#3b2a20';
const INK_SOFT = 'rgba(59, 42, 32, 0.6)';
const INK_LINE = 'rgba(59, 42, 32, 0.3)';
const INK_WASH = 'rgba(59, 42, 32, 0.08)';
const BODY_FONT = "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', 'Times New Roman', serif";
const PIXEL_FONT = "'CuteFantasy', monospace";

function extOf(path: string): string {
  const clean = path.split('#')[0].split('?')[0];
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase();
}

function isRemote(path: string): boolean {
  return /^(https?:|data:|blob:)/i.test(path);
}

// [[Note]], [[Note#Heading]], [[Note|alias]] -> markdown links. Embeds (![[...]]) are left alone.
function wikilinksToMarkdown(md: string): string {
  return md.replace(
    /(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
    (_m, target: string, alias?: string) =>
      `[${(alias ?? target).trim()}](wikilink:${encodeURIComponent(target.trim())})`,
  );
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
  notePath: string,
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

const READER_CSS = `
  @font-face {
    font-family: 'CuteFantasy';
    src: url('/assets/ui/cute-fantasy.ttf') format('truetype');
  }
  @keyframes note-open {
    from { opacity: 0; transform: translateY(10px) scale(0.985); }
    to   { opacity: 1; transform: none; }
  }
  .note-book { animation: note-open 160ms ease-out; }

  .note-pages {
    column-count: 2; column-gap: ${SPINE_GAP}px; column-fill: auto;
    height: 100%; overflow: hidden;
  }
  .note-prose { font-family: ${BODY_FONT}; font-size: 16px; line-height: 25px; color: ${INK}; word-wrap: break-word; }
  .note-prose > :first-child { margin-top: 0; }
  .note-prose p { margin: 0 0 11px; }
  .note-prose h1, .note-prose h2, .note-prose h3, .note-prose h4 {
    font-family: ${BODY_FONT}; font-weight: 700; color: ${INK}; margin: 16px 0 8px; line-height: 1.25; break-after: avoid;
  }
  .note-prose h1 { font-size: 23px; border-bottom: 2px solid ${INK_LINE}; padding-bottom: 4px; }
  .note-prose h2 { font-size: 20px; border-bottom: 1px dashed ${INK_LINE}; padding-bottom: 3px; }
  .note-prose h3 { font-size: 18px; }
  .note-prose h4 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; }
  .note-prose strong { font-weight: 700; color: #2a1a12; }
  .note-prose ul, .note-prose ol { margin: 0 0 11px; padding-left: 24px; }
  .note-prose ul { list-style: disc; }
  .note-prose ol { list-style: decimal; }
  .note-prose li { margin: 2px 0; break-inside: avoid; }
  .note-prose li::marker { color: ${INK_SOFT}; }
  .note-prose ul.contains-task-list { list-style: none; padding-left: 2px; }
  .note-prose li.task-list-item { display: flex; align-items: baseline; gap: 8px; }
  .note-prose li.task-list-item input[type=checkbox] {
    appearance: none; width: 14px; height: 14px; flex: none; margin: 0; position: relative; top: 2px;
    border: 2px solid ${INK}; border-radius: 3px; background: transparent;
  }
  .note-prose li.task-list-item input[type=checkbox]:checked { background: ${INK}; box-shadow: inset 0 0 0 2px #f3dfbf; }
  .note-prose li.task-list-item:has(input:checked) { text-decoration: line-through; color: ${INK_SOFT}; }
  .note-prose a { color: #8a3b12; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; }
  .note-prose a[href^="wikilink:"]::before { content: '[['; opacity: 0.45; }
  .note-prose a[href^="wikilink:"]::after  { content: ']]'; opacity: 0.45; }
  .note-prose code {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 13px;
    background: ${INK_WASH}; border-radius: 4px; padding: 1px 5px; color: #2a1a12;
  }
  .note-prose pre {
    margin: 4px 0 12px; padding: 8px 12px; overflow-x: auto; line-height: 1.5; break-inside: avoid;
    background: ${INK_WASH}; border: 1px dashed ${INK_LINE}; border-radius: 6px;
  }
  .note-prose pre code { background: none; padding: 0; border-radius: 0; }
  .note-prose blockquote {
    margin: 4px 0 12px; padding: 2px 12px; border-left: 3px solid ${INK_LINE}; color: ${INK_SOFT}; font-style: italic; break-inside: avoid;
  }
  .note-prose table { border-collapse: collapse; margin: 4px 0 12px; font-size: 14px; line-height: 1.4; break-inside: avoid; max-width: 100%; }
  .note-prose th, .note-prose td { border: 1px solid ${INK_LINE}; padding: 3px 8px; text-align: left; vertical-align: top; }
  .note-prose th { background: ${INK_WASH}; font-weight: 700; }
  .note-prose hr { border: 0; border-top: 2px dashed ${INK_LINE}; margin: 12px 0; }
  .note-prose img, .note-prose video {
    display: block; max-width: 100%; max-height: 240px; margin: 4px 0 12px; break-inside: avoid;
    border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.25); image-rendering: pixelated;
  }
  .note-title {
    font-family: ${PIXEL_FONT}; font-size: 27px; line-height: 36px; color: ${INK};
    margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid ${INK_LINE}; word-break: break-word;
  }

  .note-editor {
    width: 100%; height: 100%; resize: none; outline: none; border: 0; background: transparent;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 13.5px; line-height: 21px; color: ${INK};
    caret-color: #8a3b12; padding: 0; margin: 0; overflow-y: auto; tab-size: 2;
  }
  .note-editor::selection { background: rgba(138, 59, 18, 0.25); }
  .note-scroll { height: 100%; overflow-y: auto; padding-right: 6px; }
  .note-scroll::-webkit-scrollbar, .note-editor::-webkit-scrollbar { width: 6px; }
  .note-scroll::-webkit-scrollbar-thumb, .note-editor::-webkit-scrollbar-thumb { background: ${INK_LINE}; border-radius: 3px; }

  .note-btn {
    font-family: ${PIXEL_FONT}; font-size: 9px; letter-spacing: 1px; text-transform: uppercase;
    color: ${INK}; background: rgba(255, 248, 232, 0.65); border: 2px solid ${INK_LINE}; border-radius: 4px;
    padding: 5px 9px; cursor: pointer; line-height: 1;
  }
  .note-btn:hover { background: rgba(255, 248, 232, 0.95); border-color: ${INK}; }
  .note-btn:disabled { opacity: 0.4; cursor: default; }
  .note-btn.primary { background: ${INK}; color: #f6e7c8; border-color: ${INK}; }
  .note-btn.primary:hover { background: #2a1a12; }
  .note-hint { font-family: ${PIXEL_FONT}; font-size: 9px; letter-spacing: 1px; color: ${INK_SOFT}; text-transform: uppercase; }
`;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function NoteReader({ note }: { note: NoteRef | null }) {
  const { vault } = useVault();
  const [raw, setRaw] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);

  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [draft, setDraft] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const pagesRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const canWrite = !!vault?.writeNote;

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const display = useCallback(
    async (text: string, cancelled: () => boolean) => {
      if (!note || !vault) return;
      const { content: resolved, urls } = await resolveEmbeds(text, vault, note.id);
      if (cancelled()) {
        urls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = urls;
      setContent(wikilinksToMarkdown(resolved));
    },
    [note, vault],
  );

  useEffect(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    setContent(null);
    setRaw(null);
    setEditing(false);
    editingRef.current = false;
    setSaveState('idle');
    setSaveError(null);
    setErrorText(null);
    setPage(0);
    setPageCount(1);

    if (!note || !vault) return;

    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const text = await vault.readNote(note.id);
        if (cancelled) return;
        setRaw(text);
        await display(text, () => cancelled);
        if (cancelled) return;
        setStatus('idle');
        // A blank page (a note just added from the bookshelf) opens ready to write in.
        if (text.trim() === '' && vault.writeNote) {
          setDraft(text);
          setEditing(true);
          editingRef.current = true;
          requestAnimationFrame(() => textareaRef.current?.focus());
        }
      } catch (err) {
        if (cancelled) return;
        setErrorText(err instanceof Error && err.cause === 'host' ? err.message : null);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [note, vault, display]);

  useLayoutEffect(() => {
    const el = pagesRef.current;
    if (!el || editing) return;
    const count = Math.max(1, Math.ceil((el.scrollWidth - 1) / PAGE_STRIDE));
    setPageCount(count);
    const p = Math.min(page, count - 1);
    if (p !== page) setPage(p);
    el.scrollLeft = p * PAGE_STRIDE;
  }, [content, page, editing]);

  const startEdit = useCallback(() => {
    if (raw === null) return;
    setDraft(raw);
    setSaveState('idle');
    setSaveError(null);
    setEditing(true);
    editingRef.current = true;
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [raw]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    editingRef.current = false;
  }, []);

  const save = useCallback(async () => {
    if (!note || !vault?.writeNote) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      await vault.writeNote(note.id, draft);
      noteSaved(note.id, draft, note.title);
      setRaw(draft);
      await display(draft, () => false);
      setSaveState('saved');
      setEditing(false);
      editingRef.current = false;
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'Could not save');
    }
  }, [note, vault, draft, display]);

  // Capture phase so Escape closes the book before anything else sees it (Track C's convention).
  useEffect(() => {
    if (!note) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (editingRef.current) cancelEdit();
        else bus.emit('close-note', undefined);
        return;
      }
      if (editingRef.current) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPage((p) => Math.min(p + 1, pageCount - 1));
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPage((p) => Math.max(p - 1, 0));
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [note, pageCount, cancelEdit]);

  const components = {
    h1: ({ children }: { children?: React.ReactNode }) =>
      note && String(children).trim() === note.title.trim() ? null : <h1>{children}</h1>,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const wiki = href?.startsWith('wikilink:');
      return (
        <a
          href={href}
          title={wiki ? decodeURIComponent(href!.slice(9)) : href}
          target={wiki ? undefined : '_blank'}
          rel={wiki ? undefined : 'noreferrer'}
          onClick={(e) => {
            if (wiki) e.preventDefault();
          }}
        >
          {children}
        </a>
      );
    },
    img: (props: { src?: string | Blob; alt?: string; title?: string }) => {
      const { src, alt, title } = props;
      const url = typeof src === 'string' ? src : undefined;
      const ext = extOf(title || alt || '');
      if (VIDEO_EXT.includes(ext)) return <video controls src={url} />;
      return <img src={url} alt={alt} />;
    },
  };

  if (!note) return <style>{READER_CSS}</style>;

  const progress = editing && canWrite ? noteProgress(note.id, draft) : null;

  const stopKeys = (e: React.KeyboardEvent) => {
    // Keep Phaser's window-level key handlers (WASD, arrows, Space) from eating keystrokes.
    e.stopPropagation();
  };

  return (
    <>
      <style>{READER_CSS}</style>
      <div
        className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
        onClick={() => {
          if (!editingRef.current) bus.emit('close-note', undefined);
        }}
      >
        <div
          className="note-book relative"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: PANEL_W,
            height: PANEL_H,
            backgroundImage: "url('/assets/ui/book.png')",
            backgroundPosition: '-32px 0px',
            backgroundSize: '6720px 1728px',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.45))',
          }}
        >
          {/* Text area spanning both pages */}
          <div style={{ position: 'absolute', left: PAGES_LEFT, top: PAGES_TOP, width: PAGES_W, height: PAGES_H }}>
            {!editing && (
              <div ref={pagesRef} className="note-pages note-prose">
                <h2 className="note-title">{note.title}</h2>
                {status === 'loading' && <p style={{ color: INK_SOFT }}>Opening…</p>}
                {status === 'error' && <p style={{ color: INK_SOFT }}>{errorText ?? 'Could not read this note.'}</p>}
                {content && (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUrl} components={components}>
                    {content}
                  </ReactMarkdown>
                )}
              </div>
            )}

            {editing && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  columnGap: SPINE_GAP,
                  height: '100%',
                }}
              >
                <textarea
                  ref={textareaRef}
                  className="note-editor"
                  value={draft}
                  spellCheck={false}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    stopKeys(e);
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                      e.preventDefault();
                      void save();
                    }
                  }}
                  onKeyUp={stopKeys}
                  onKeyPress={stopKeys}
                />
                <div className="note-scroll note-prose">
                  <h2 className="note-title">{note.title}</h2>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUrl} components={components}>
                    {wikilinksToMarkdown(draft)}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* Controls in the page margins */}
          <div
            style={{
              position: 'absolute',
              left: PAGES_LEFT,
              right: PANEL_W - PAGES_LEFT - PAGES_W,
              top: PAGES_TOP + PAGES_H + 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            {!editing ? (
              <>
                <button className="note-btn" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  ‹ Prev
                </button>
                <span className="note-hint">
                  Page {page + 1} / {pageCount}
                  {saveState === 'saved' ? ' · Saved' : ''}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="note-btn"
                    disabled={raw === null}
                    onClick={startEdit}
                    title={canWrite ? 'Edit this note' : 'Edit (read-only vault, changes will not be saved)'}
                  >
                    Edit
                  </button>
                  <button
                    className="note-btn"
                    disabled={page >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  >
                    Next ›
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="note-hint">
                  {saveState === 'saving'
                    ? 'Saving…'
                    : saveState === 'error'
                      ? `Could not save: ${saveError ?? ''}`
                      : canWrite
                        ? 'Editing · ⌘S / Ctrl+S to save · Esc to cancel'
                        : 'Read-only vault · changes cannot be saved'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {progress && (
                    <span className="note-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#9a5b00' }}>
                      <Coin size={10} />
                      {progress.words >= progress.needed
                        ? `Save to earn +${progress.reward}`
                        : `${progress.words}/${progress.needed} words for +${progress.reward}`}
                    </span>
                  )}
                  <button className="note-btn" onClick={cancelEdit}>
                    Cancel
                  </button>
                  <button
                    className="note-btn primary"
                    disabled={!canWrite || saveState === 'saving'}
                    onClick={() => void save()}
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
