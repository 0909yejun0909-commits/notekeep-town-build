'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { bus } from '@/game/bus';
import { sfx } from '@/game/audio/sfx';
import { useVault } from '@/lib/vault/open';
import { buildIndex, searchIndex, type Destination } from '@/lib/noteSearch';
import { DEFAULT_BLOCKLIST, ENGINES, blockedBy, normalizeDomain, parseTarget, type Engine } from '@/lib/blocklist';
import { readPref, writePref } from '@/lib/vaultPrefs';
import styles from './Computer.module.css';

const MAX_HITS = 6;
const PREF = 'blocklist';
const stopKeys = (e: React.KeyboardEvent) => e.stopPropagation();

type Screen = { kind: 'browser' } | { kind: 'blocked'; site: string } | { kind: 'settings' };

// Opened from a computer (InteriorScene): search your notes first, the web second, and never
// the sites on the blocklist. Web pages open in a new tab (Google refuses to load in a frame).
export default function Computer() {
  const { vault } = useVault();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [screen, setScreen] = useState<Screen>({ kind: 'browser' });
  const [list, setList] = useState<string[]>(DEFAULT_BLOCKLIST);
  const [adding, setAdding] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setQuery('');
      setActive(0);
      setScreen({ kind: 'browser' });
      setList(readPref(PREF, DEFAULT_BLOCKLIST));
      sfx('open');
    };
    bus.on('open-computer', onOpen);
    return () => bus.off('open-computer', onOpen);
  }, []);

  useEffect(() => { if (open && screen.kind === 'browser') inputRef.current?.focus(); }, [open, screen]);

  const index = useMemo(() => (vault ? buildIndex(vault.world) : []), [vault]);
  const hits = useMemo(() => searchIndex(index, query, MAX_HITS).filter((d) => d.kind === 'note'), [index, query]);

  const close = () => {
    setOpen(false);
    sfx('close');
    bus.emit('close-computer', undefined);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (screen.kind !== 'browser') setScreen({ kind: 'browser' });
      else close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const saveList = (next: string[]) => {
    setList(next);
    writePref(PREF, next);
  };

  // Checks the typed text and the page it would open, so a blocked engine is blocked too.
  const go = (url: string, typed: string) => {
    const target = parseTarget(typed);
    const site = (target && blockedBy(target, list)) || blockedBy({ kind: 'url', url, host: new URL(url).hostname }, list);
    if (site) {
      sfx('error');
      setScreen({ kind: 'blocked', site });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const searchWeb = (engine: Engine = 'google') => {
    const text = query.trim();
    if (!text) {
      go(ENGINES[engine].home, '');
      return;
    }
    const target = parseTarget(text);
    if (engine === 'google' && target?.kind === 'url') go(target.url, text);
    else go(ENGINES[engine].search(text), text);
  };

  const travel = (d: Destination) => {
    if (d.kind !== 'note') return;
    setOpen(false);
    bus.emit('close-computer', undefined);
    bus.emit('fast-travel', { houseId: d.houseId, roomId: d.roomId, noteId: d.note.id });
  };

  if (!open) return null;

  return (
    <div className={styles.screen} onClick={close}>
      <div className={styles.monitor} onClick={(e) => e.stopPropagation()}>
        <div className={styles.glass}>
          {screen.kind === 'blocked' ? (
            <div className={styles.blocked}>
              <p className={styles.big}>Back to work!</p>
              <p>{screen.site} is on your blocklist.</p>
              <button className={styles.button} onClick={() => setScreen({ kind: 'browser' })}>Back to the desktop</button>
            </div>
          ) : screen.kind === 'settings' ? (
            <div className={styles.settings}>
              <p className={styles.big}>Blocked sites</p>
              <p className={styles.note}>The computer won&rsquo;t open these. It can&rsquo;t block them elsewhere in your browser.</p>
              <ul className={styles.sites}>
                {list.map((d) => (
                  <li key={d}>
                    <span>{d}</span>
                    <button className={styles.small} onClick={() => saveList(list.filter((x) => x !== d))}>Remove</button>
                  </li>
                ))}
              </ul>
              <form
                className={styles.row}
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = normalizeDomain(adding);
                  if (d && !list.includes(d)) saveList([...list, d]);
                  setAdding('');
                }}
              >
                <input className={styles.input} placeholder="site.com" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={stopKeys} onKeyUp={stopKeys} />
                <button className={styles.button} type="submit">Block</button>
              </form>
              <div className={styles.row}>
                <button className={styles.small} onClick={() => saveList(DEFAULT_BLOCKLIST)}>Reset to defaults</button>
                <button className={styles.button} onClick={() => setScreen({ kind: 'browser' })}>Done</button>
              </div>
            </div>
          ) : (
            <div className={styles.browser}>
              <div className={styles.titlebar}>
                <span>NoteNet</span>
                <span className={styles.icons}>
                  <button className={styles.small} onClick={() => setScreen({ kind: 'settings' })}>⚙ Blocklist</button>
                  <button className={styles.small} onClick={close} aria-label="Close">×</button>
                </span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (hits[active]) travel(hits[active]);
                  else searchWeb('google');
                }}
              >
                <input
                  ref={inputRef}
                  className={styles.search}
                  placeholder="Search your notes or the web"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                  onKeyDown={(e) => {
                    stopKeys(e);
                    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length)); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  }}
                  onKeyUp={stopKeys}
                />
              </form>
              <div className={styles.bookmarks}>
                {(Object.keys(ENGINES) as Engine[]).map((e) => (
                  <button key={e} className={styles.bookmark} onClick={() => searchWeb(e)}>{ENGINES[e].name}</button>
                ))}
              </div>
              {query.trim() && (
                <ul className={styles.results}>
                  {hits.map((d, i) => (
                    <li key={d.key}>
                      <button className={`${styles.result} ${i === active ? styles.active : ''}`} onMouseEnter={() => setActive(i)} onClick={() => travel(d)}>
                        <span className={styles.resultTitle}>{d.title}</span>
                        <span className={styles.where}>{d.where}</span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button className={`${styles.result} ${active === hits.length ? styles.active : ''}`} onMouseEnter={() => setActive(hits.length)} onClick={() => searchWeb('google')}>
                      Search Google for &ldquo;{query.trim()}&rdquo;
                    </button>
                  </li>
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
