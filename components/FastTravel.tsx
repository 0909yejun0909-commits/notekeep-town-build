'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NoteRef } from '@/lib/types';
import { useVault } from '@/lib/vault/open';
import { buildIndex, escapeRe, searchIndex, type Destination } from '@/lib/noteSearch';
import { bus } from '@/game/bus';
import styles from './FastTravel.module.css';

const MAX_RESULTS = 8;
const MAX_RECENT = 5;

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.map(escapeRe).join('|')})`, 'ig'));
  return (
    <>
      {parts.map((p, i) =>
        words.some((w) => p.toLowerCase() === w) ? <mark key={i} className={styles.mark}>{p}</mark> : p,
      )}
    </>
  );
}

// A window of the preview around the first matched word, so a hit deep in a note is visible.
function snippet(preview: string, words: string[]): string {
  const lower = preview.toLowerCase();
  const at = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(at) || at < 40) return preview.slice(0, 90);
  return '…' + preview.slice(at - 30, at + 60);
}

function isTypingElsewhere(target: EventTarget | null, own: HTMLInputElement | null) {
  if (!(target instanceof HTMLElement) || target === own) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}

export default function FastTravel() {
  const { vault } = useVault();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [shortcut, setShortcut] = useState('Ctrl K');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const editorOpen = useRef(false);

  const index = useMemo(() => (vault ? buildIndex(vault.world) : []), [vault]);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut('⌘K');
  }, []);

  // Remember notes the player opened, however they got there, for the empty-query list.
  // The editors hold unsaved work, so fast travel stays shut while either is up.
  useEffect(() => {
    const onNote = ({ note }: { note: NoteRef }) =>
      setRecent((r) => [note.id, ...r.filter((id) => id !== note.id)].slice(0, MAX_RECENT));
    const onEditorOpen = () => (editorOpen.current = true);
    const onEditorClose = () => (editorOpen.current = false);
    bus.on('open-note', onNote);
    bus.on('open-interior-editor', onEditorOpen);
    bus.on('open-exterior-editor', onEditorOpen);
    bus.on('close-interior-editor', onEditorClose);
    bus.on('close-exterior-editor', onEditorClose);
    return () => {
      bus.off('open-note', onNote);
      bus.off('open-interior-editor', onEditorOpen);
      bus.off('open-exterior-editor', onEditorOpen);
      bus.off('close-interior-editor', onEditorClose);
      bus.off('close-exterior-editor', onEditorClose);
    };
  }, []);

  const show = () => {
    if (editorOpen.current) return;
    // Travel replaces whatever was open, and closing it here keeps the reader's own Escape
    // handler from also firing while the search box is up.
    bus.emit('close-note', undefined);
    bus.emit('close-shelf', undefined);
    setQuery('');
    setActive(0);
    setOpen(true);
  };

  // Capture phase so the shortcut wins over Phaser and the other overlays.
  useEffect(() => {
    if (!vault) return;
    function onKey(e: KeyboardEvent) {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) return;
      if (isTypingElsewhere(e.target, inputRef.current)) return;
      e.preventDefault();
      e.stopPropagation();
      if (open) setOpen(false);
      else show();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [vault, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const words = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);

  const results = useMemo(() => {
    if (words.length === 0) {
      const byKey = new Map(index.map((d) => [d.key, d]));
      const recents = recent.map((id) => byKey.get('note:' + id)).filter((d): d is Destination => !!d);
      const houses = index.filter((d) => d.kind === 'house');
      return [...recents, ...houses].slice(0, MAX_RESULTS);
    }
    return searchIndex(index, query, MAX_RESULTS);
  }, [index, words, query, recent]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!vault) return null;

  const travel = (d: Destination) => {
    setOpen(false);
    bus.emit('fast-travel', d.kind === 'note' ? { houseId: d.houseId, roomId: d.roomId, noteId: d.note.id } : { houseId: d.houseId });
  };

  if (!open) {
    return (
      <button className={styles.launcher} onClick={show} title="Search your notes and travel there">
        Travel <kbd className={styles.kbd}>{shortcut}</kbd>
      </button>
    );
  }

  const recentCount = words.length === 0 ? results.filter((d) => d.kind === 'note').length : 0;

  return (
    <div className={styles.backdrop} onClick={() => setOpen(false)}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.label}>Travel to</span>
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            placeholder="a note, a topic, a house…"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              // Keep Phaser's window-level key handlers (WASD, arrows, Space) from eating keystrokes.
              e.stopPropagation();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter' && results[active]) {
                e.preventDefault();
                travel(results[active]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
              }
            }}
            onKeyUp={(e) => e.stopPropagation()}
          />
        </div>

        <div ref={listRef} className={styles.list}>
          {results.length === 0 && <div className={styles.empty}>Nothing in town matches “{query}”.</div>}
          {results.map((d, i) => (
            <div key={d.key} style={{ display: 'contents' }}>
              {words.length === 0 && i === 0 && recentCount > 0 && <div className={styles.section}>Recent</div>}
              {words.length === 0 && i === recentCount && <div className={styles.section}>Houses</div>}
              <button
                data-index={i}
                className={`${styles.row} ${i === active ? styles.active : ''}`}
                onMouseMove={() => setActive(i)}
                onClick={() => travel(d)}
              >
                <span className={`${styles.icon} ${d.kind === 'house' ? styles.iconHouse : ''}`} />
                <span className={styles.text}>
                  <span className={styles.title}>
                    <Highlight text={d.title} words={words} />
                  </span>
                  <span className={styles.where}>
                    <Highlight text={d.where} words={words} />
                  </span>
                  {d.kind === 'note' && d.preview && (
                    <span className={styles.preview}>
                      <Highlight text={snippet(d.preview, words)} words={words} />
                    </span>
                  )}
                </span>
                {d.kind === 'house' && <span className={styles.badge}>{d.preview}</span>}
              </button>
            </div>
          ))}
        </div>

        <div className={styles.hint}>↑↓ to choose · Enter to travel · Esc to stay put</div>
      </div>
    </div>
  );
}
