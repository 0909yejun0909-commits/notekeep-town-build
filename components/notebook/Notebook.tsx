'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { House, NoteRef, Region, Room, VaultHandle, WorldModel } from '@/lib/types';
import { replaceWorld, useVault } from '@/lib/vault/open';
import { ROOT_ID } from '@/lib/vault/parse';
import { bus } from '@/game/bus';
import { noteProgress, noteSaved, useWallet } from '@/lib/walletStore';
import { onBeforeViewSwitch, setFocusNote, takeFocusNote } from '@/lib/displayPrefs';
import { moveHouseSaves } from '@/lib/houseRename';
import { renameNote } from '@/lib/noteRename';
import RichNoteEditor, { type RichNoteApi } from '../richNote/RichNoteEditor';
import type { EditorState } from '../richNote/editor';
import { resolveBinary } from '../NoteReader';
import MarkTools from '../MarkTools';
import Coin from '../Coin';
import styles from './Notebook.module.css';

// The town's notes as a plain notes app: folders down the side, the note open beside them.
// Same vault, same files, same coins; the town just isn't drawn (components/NotebookMode.tsx).

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
type Open = { note: NoteRef; text: string; key: number };
type Naming = { kind: 'note' | 'room'; houseId: string; folder: string } | { kind: 'house'; regionId: string } | { kind: 'rename'; houseId: string };

const PAGE_W = 720;
const AUTOSAVE_MS = 1000;

function allNotes(world: WorldModel): NoteRef[] {
  return world.regions.flatMap((r) => r.houses.flatMap((h) => h.rooms.flatMap((rm) => rm.notes)));
}

function findNote(world: WorldModel, id: string): NoteRef | undefined {
  return allNotes(world).find((n) => n.id === id);
}

// Where a new note in a room is written: the room's own folder (the entrance's is the house's).
const roomFolder = (house: House, room: Room) => (house.id === ROOT_ID ? '' : room.id);

const matches = (n: NoteRef, q: string) => n.title.toLowerCase().includes(q) || n.preview.toLowerCase().includes(q) || n.id.toLowerCase().includes(q);

export default function Notebook() {
  const { vault, setVault } = useVault();
  const wallet = useWallet();
  const world = vault?.world;
  const [open, setOpen] = useState<Open | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState<Naming | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [richState, setRichState] = useState<EditorState>({ kind: null, inTable: false, page: 0, pages: 1 });
  const [toast, setToast] = useState<string | null>(null);
  const [draftWords, setDraftWords] = useState<ReturnType<typeof noteProgress>>(null);
  const richRef = useRef<RichNoteApi>(null);
  const urls = useRef<string[]>([]);
  const vaultRef = useRef<VaultHandle | null>(vault);
  vaultRef.current = vault;

  // What's typed and not yet written: the note, its text, and the text last written.
  const pending = useRef<{ note: NoteRef; text: string; saved: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writing = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    const v = vaultRef.current;
    if (!p || !v?.writeNote || p.text === p.saved) return;
    const text = p.text;
    setSave('saving');
    const run = writing.current.then(async () => {
      try {
        await v.writeNote!(p.note.id, text);
        noteSaved(p.note.id, text, p.note.title);
        p.saved = text;
        setSaveError(null);
        setSave(p.text === text ? 'saved' : 'dirty');
      } catch (err) {
        setSave('error');
        setSaveError(err instanceof Error ? err.message : 'Could not save');
        throw err;
      }
    });
    writing.current = run.catch(() => undefined);
    await run;
  }, []);

  const edited = (md: string) => {
    const p = pending.current;
    if (!p) return;
    p.text = md;
    setSave(md === p.saved ? 'saved' : 'dirty');
    setDraftWords(noteProgress(p.note.id, md));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush().catch(() => undefined), AUTOSAVE_MS);
  };

  const openNote = useCallback(
    async (note: NoteRef) => {
      const v = vaultRef.current;
      if (!v) return;
      try {
        await flush();
      } catch {
        return; // Not written: the note being edited stays open, with its error showing.
      }
      setLoadError(null);
      try {
        const text = (await v.readNote(note.id)).replace(/\r\n?/g, '\n');
        urls.current.forEach((u) => URL.revokeObjectURL(u));
        urls.current = [];
        pending.current = { note, text, saved: text };
        setSave('saved');
        setSaveError(null);
        setDraftWords(noteProgress(note.id, text));
        setOpen((o) => ({ note, text, key: (o?.key ?? 0) + 1 }));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : `Couldn't open "${note.title}".`);
      }
    },
    [flush],
  );

  // First the note that was open in town, else the first note there is.
  useEffect(() => {
    if (!world || open) return;
    const id = takeFocusNote();
    const note = (id && findNote(world, id)) || allNotes(world)[0];
    if (note) void openNote(note);
    // Only when the notebook first shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saved before the town comes back, and the town shows the same note.
  useEffect(
    () =>
      onBeforeViewSwitch(async () => {
        await flush();
        setFocusNote(pending.current?.note.id ?? null);
      }),
    [flush],
  );

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      const p = pending.current;
      if (!p || p.text === p.saved) return;
      void flush().catch(() => undefined);
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      void flush().catch(() => undefined);
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [flush]);

  // Coins earned show here too: the town's purse is hidden.
  useEffect(() => {
    if (!wallet.notice) return;
    setToast(`+${wallet.notice.amount} ${wallet.notice.text}`);
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [wallet.notice]);

  // The title typed over: saved first, so the renamed file has every word.
  const renameOpen = async (title: string): Promise<boolean> => {
    const p = pending.current;
    const v = vaultRef.current;
    if (!p || !v) return false;
    try {
      await flush();
      const renamed = await renameNote(v, setVault, p.note, title);
      p.note = renamed;
      setOpen((o) => (o ? { ...o, note: renamed } : o));
      return true;
    } catch (err) {
      setSave('error');
      setSaveError(err instanceof Error ? err.message : "Couldn't rename the note.");
      return false;
    }
  };

  const q = query.trim().toLowerCase();
  const results = useMemo(() => (world && q ? allNotes(world).filter((n) => matches(n, q)) : []), [world, q]);

  if (!vault || !world) return null;
  const canWrite = !!vault.writeNote;

  const toggle = (id: string) =>
    setClosed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const newWorld = (next: WorldModel) => {
    setVault({ ...vault, world: next });
    replaceWorld(next);
  };

  const startNaming = (n: Naming, initial = '') => {
    setNaming(n);
    setName(initial);
    setActionError(null);
  };

  const submitName = async () => {
    if (!naming || busy) return;
    const value = name.trim();
    if (!value) return setActionError('Give it a name first.');
    setBusy(true);
    setActionError(null);
    try {
      if (naming.kind === 'note' && vault.createNote) {
        const { world: next, note } = await vault.createNote(naming.folder, value);
        newWorld(next);
        await openNote(note);
      } else if (naming.kind === 'room' && vault.createRoom) {
        const { world: next } = await vault.createRoom(naming.houseId, value);
        newWorld(next);
      } else if (naming.kind === 'house' && vault.createHouse) {
        const { world: next } = await vault.createHouse(naming.regionId, value);
        newWorld(next);
      } else if (naming.kind === 'rename' && vault.renameHouse) {
        await flush();
        const from = naming.houseId;
        const { world: next, houseId: to } = await vault.renameHouse(from, value);
        if (to !== from) {
          bus.emit('house-renamed', { from, to });
          const fingerprint = (window as any).__game?.registry.get('vaultFingerprint') as string | undefined;
          if (fingerprint) moveHouseSaves(fingerprint, from, to);
          newWorld(next);
          // The open note moved with its house.
          const p = pending.current;
          if (p && (p.note.id === from || p.note.id.startsWith(`${from}/`))) {
            const moved = findNote(next, to + p.note.id.slice(from.length));
            if (moved) {
              p.note = moved;
              setOpen((o) => (o ? { ...o, note: moved } : o));
            }
          }
        }
      }
      setNaming(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't do that.");
    } finally {
      setBusy(false);
    }
  };

  const nameField = (placeholder: string) => (
    <form
      className={styles.nameForm}
      onSubmit={(e) => {
        e.preventDefault();
        void submitName();
      }}
    >
      <input
        autoFocus
        className={styles.nameInput}
        value={name}
        placeholder={placeholder}
        maxLength={80}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setNaming(null);
        }}
      />
      <button className={styles.smallBtn} type="submit" disabled={busy}>
        {busy ? '...' : 'Add'}
      </button>
      {actionError && <div className={styles.formError}>{actionError}</div>}
    </form>
  );

  const noteRow = (n: NoteRef, depth: number, where?: string) => (
    <button
      key={n.id}
      className={`${styles.row} ${styles.noteRow} ${open?.note.id === n.id ? styles.current : ''}`}
      style={{ paddingLeft: 12 + depth * 14 }}
      title={n.id}
      onClick={() => void openNote(n)}
    >
      <span className={styles.icon}>▤</span>
      <span className={styles.label}>{n.title || 'Untitled'}</span>
      {where && <span className={styles.where}>{where}</span>}
    </button>
  );

  const folderRow = (id: string, label: string, depth: number, kind: string, actions: React.ReactNode) => (
    <div className={styles.folder} style={{ paddingLeft: 4 + depth * 14 }}>
      <button className={styles.row} onClick={() => toggle(id)} title={kind}>
        <span className={styles.caret}>{closed.has(id) ? '▸' : '▾'}</span>
        <span className={styles.label}>{label}</span>
      </button>
      {canWrite && <span className={styles.actions}>{actions}</span>}
    </div>
  );

  const roomTree = (house: House, room: Room, depth: number, showHeader: boolean) => {
    const id = `room:${room.id}`;
    const body = (
      <>
        {room.notes.map((n) => noteRow(n, depth + (showHeader ? 1 : 0)))}
        {naming?.kind === 'note' && naming.folder === roomFolder(house, room) && naming.houseId === house.id && (
          <div style={{ paddingLeft: 12 + (depth + (showHeader ? 1 : 0)) * 14 }}>{nameField('Note title')}</div>
        )}
        {room.notes.length === 0 && naming?.kind !== 'note' && (
          <div className={styles.empty} style={{ paddingLeft: 12 + (depth + (showHeader ? 1 : 0)) * 14 }}>No notes yet</div>
        )}
      </>
    );
    if (!showHeader) return <div key={id}>{body}</div>;
    return (
      <div key={id}>
        {folderRow(
          id,
          room.name,
          depth,
          'Room',
          <button className={styles.iconBtn} title="New note in this room" onClick={() => startNaming({ kind: 'note', houseId: house.id, folder: roomFolder(house, room) })}>
            +
          </button>,
        )}
        {!closed.has(id) && body}
      </div>
    );
  };

  const houseTree = (house: House, depth: number) => {
    const id = `house:${house.id}`;
    const entrance = house.rooms[0];
    const renamable = !!vault.renameHouse && !!vault.canRenameHouse?.(house.id);
    return (
      <div key={id}>
        {naming?.kind === 'rename' && naming.houseId === house.id ? (
          <div style={{ paddingLeft: 4 + depth * 14 }}>{nameField('House name')}</div>
        ) : (
          folderRow(
            id,
            house.name,
            depth,
            'House',
            <>
              {renamable && (
                <button className={styles.iconBtn} title="Rename this house" onClick={() => startNaming({ kind: 'rename', houseId: house.id }, house.name)}>
                  ✎
                </button>
              )}
              {vault.createRoom && house.id.includes('/') && (
                <button className={styles.iconBtn} title="New room (a folder in this house)" onClick={() => startNaming({ kind: 'room', houseId: house.id, folder: '' })}>
                  ⊞
                </button>
              )}
              {vault.createNote && entrance && (
                <button className={styles.iconBtn} title="New note" onClick={() => startNaming({ kind: 'note', houseId: house.id, folder: roomFolder(house, entrance) })}>
                  +
                </button>
              )}
            </>,
          )
        )}
        {!closed.has(id) && (
          <>
            {naming?.kind === 'room' && naming.houseId === house.id && <div style={{ paddingLeft: 12 + (depth + 1) * 14 }}>{nameField('Room name')}</div>}
            {house.rooms.map((room, i) => roomTree(house, room, depth + 1, i > 0))}
          </>
        )}
      </div>
    );
  };

  const regionTree = (region: Region) => {
    const id = `region:${region.id}`;
    const flat = region.id === ROOT_ID;
    return (
      <div key={id} className={styles.region}>
        {!flat &&
          folderRow(
            id,
            region.name,
            0,
            'Region',
            vault.createHouse && (
              <button className={styles.iconBtn} title="New house (a folder of notes)" onClick={() => startNaming({ kind: 'house', regionId: region.id })}>
                +
              </button>
            ),
          )}
        {!closed.has(id) && (
          <>
            {naming?.kind === 'house' && naming.regionId === region.id && <div style={{ paddingLeft: 26 }}>{nameField('House name')}</div>}
            {region.houses.map((h) => houseTree(h, flat ? 0 : 1))}
          </>
        )}
      </div>
    );
  };

  const where = (n: NoteRef) => n.id.split('/').slice(0, -1).join(' / ');
  const statusText =
    save === 'saving' ? 'Saving...' : save === 'dirty' ? 'Editing' : save === 'error' ? `Not saved: ${saveError ?? 'error'}` : canWrite ? 'Saved' : 'Read only';

  return (
    <div className={styles.shell} data-panel="notebook" onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
      <aside className={styles.side}>
        <div className={styles.vaultName} title={world.name}>
          {world.name}
        </div>
        <input className={styles.search} placeholder="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
        <nav className={styles.tree}>
          {q ? (
            results.length > 0 ? results.map((n) => noteRow(n, 0, where(n))) : <div className={styles.empty}>No notes match</div>
          ) : (
            world.regions.map(regionTree)
          )}
        </nav>
        <div className={styles.foot}>
          {wallet.active && (
            <span className={styles.coins} title="Coins: notes written here earn them just like in town">
              <Coin size={16} />
              {wallet.balance}
            </span>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        {open ? (
          <>
            <div className={styles.top}>
              <span className={styles.crumbs}>{where(open.note) || world.name}</span>
              {canWrite && (
                <MarkTools
                  onHighlight={(c) => richRef.current?.highlight(c)}
                  onBold={() => richRef.current?.format('b')}
                  onUnderline={() => richRef.current?.format('u')}
                  onClear={() => richRef.current?.clearFormatting()}
                />
              )}
              {canWrite && richState.inTable && (
                <div className="note-tools" onMouseDown={(e) => e.preventDefault()}>
                  <span className="note-tools-label" title="Tab: next cell. Shift+Tab: back. Enter: next row (on an empty last row, out of the table).">
                    Table
                  </span>
                  <button className="note-tool note-tool-text" title="Add a row below" onClick={() => richRef.current?.tableOp('row-below')}>+ Row</button>
                  <button className="note-tool note-tool-text" title="Add a column to the right" onClick={() => richRef.current?.tableOp('col-right')}>+ Col</button>
                  <span className="note-tools-sep" />
                  <button className="note-tool note-tool-text" title="Delete this row" onClick={() => richRef.current?.tableOp('del-row')}>− Row</button>
                  <button className="note-tool note-tool-text" title="Delete this column" onClick={() => richRef.current?.tableOp('del-col')}>− Col</button>
                </div>
              )}
              <span className={`${styles.status} ${save === 'error' ? styles.bad : ''}`}>{statusText}</span>
            </div>
            <div className={styles.scroll} data-scroll>
              <div className={styles.page} style={{ maxWidth: PAGE_W }}>
                <RichNoteEditor
                  key={open.key}
                  ref={richRef}
                  layout="scroll"
                  onTitle={vault.renameNote ? renameOpen : undefined}
                  markdown={open.text}
                  title={open.note.title}
                  canWrite={canWrite}
                  onChange={edited}
                  onSave={() => void flush().catch(() => undefined)}
                  onState={setRichState}
                  onSlashOpen={() => undefined}
                  resolveImage={async (target) => {
                    const url = await resolveBinary(vault, open.note.id, target);
                    if (url) urls.current.push(url);
                    return url;
                  }}
                  pagesWidth={PAGE_W}
                  spineGap={0}
                />
              </div>
            </div>
            {draftWords && canWrite && (
              <div className={styles.progress}>
                <Coin size={14} />
                {draftWords.words >= draftWords.needed
                  ? `+${draftWords.reward} coins when this saves`
                  : `${draftWords.words}/${draftWords.needed} words for +${draftWords.reward} coins`}
              </div>
            )}
          </>
        ) : (
          <div className={styles.blank}>{loadError ?? 'Pick a note on the left, or add one with +.'}</div>
        )}
        {loadError && open && <div className={styles.loadError}>{loadError}</div>}
        {toast && (
          <div className={styles.toast} onClick={() => setToast(null)}>
            <Coin size={16} /> {toast}
          </div>
        )}
      </main>
    </div>
  );
}
