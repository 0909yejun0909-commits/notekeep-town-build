'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { House, NoteRef, WorldModel } from '@/lib/types';
import { hash } from '@/lib/types';
import { replaceWorld, useVault } from '@/lib/vault/open';
import { bus } from '@/game/bus';
import type { ShelfLook } from '@/lib/catalog';
import { MIN_WORDS, NOTE_REWARD } from '@/lib/wallet';
import { useWallet } from '@/lib/walletStore';
import Coin from './Coin';
import styles from './Bookshelf.module.css';

type Folder = { name: string; folders: Map<string, Folder>; notes: NoteRef[] };

type Item =
  | { kind: 'folder'; name: string; folder: Folder; count: number }
  | { kind: 'note'; name: string; note: NoteRef }
  | { kind: 'new'; name: string };

const NEW_BOOK: Item = { kind: 'new', name: 'New note' };

const COLORS = [
  '#b4202a', '#3e6fb0', '#3e8948', '#825e80', '#b86f50',
  '#3f886c', '#525f7a', '#fb6b1d', '#0095e9', '#7c963c',
];
const FOLDER_COLORS = ['#6d483b', '#525f7a', '#265c42', '#3f2832', '#5a3e6b'];

const SHELF_INNER = 816 - 2 * 6 - 2 * 12 - 2 * 12 - 2 * 8;
const GAP = 6;

function findHouse(world: WorldModel | undefined, houseId: string): House | undefined {
  if (!world) return undefined;
  for (const region of world.regions) {
    const house = region.houses.find((h) => h.id === houseId);
    if (house) return house;
  }
  return undefined;
}

function buildTree(house: House): Folder {
  const root: Folder = { name: house.name, folders: new Map(), notes: [] };
  const prefix = house.id === '.' ? '' : house.id + '/';
  for (const room of house.rooms) {
    for (const note of room.notes) {
      const rel = note.id.startsWith(prefix) ? note.id.slice(prefix.length) : note.id;
      const segs = rel.split('/');
      let node = root;
      for (const seg of segs.slice(0, -1)) {
        let child = node.folders.get(seg);
        if (!child) node.folders.set(seg, (child = { name: seg, folders: new Map(), notes: [] }));
        node = child;
      }
      node.notes.push(note);
    }
  }
  return root;
}

function countNotes(folder: Folder): number {
  let n = folder.notes.length;
  for (const f of folder.folders.values()) n += countNotes(f);
  return n;
}

function itemsOf(folder: Folder): Item[] {
  const folders: Item[] = [...folder.folders.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({ kind: 'folder', name: f.name, folder: f, count: countNotes(f) }));
  const notes: Item[] = [...folder.notes]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((n) => ({ kind: 'note', name: n.title, note: n }));
  return [...folders, ...notes];
}

function keyOf(item: Item): string {
  return item.kind === 'note' ? item.note.id : item.kind === 'folder' ? 'folder:' + item.name : 'new';
}

function bookStyle(item: Item): React.CSSProperties {
  if (item.kind === 'new') {
    return { ['--w' as string]: '46px', ['--h' as string]: '184px', ['--c' as string]: '#f4e4c1' };
  }
  const key = keyOf(item);
  const h = hash(key);
  if (item.kind === 'folder') {
    return {
      ['--w' as string]: '62px',
      ['--h' as string]: `${192 + (h % 3) * 8}px`,
      ['--c' as string]: FOLDER_COLORS[h % FOLDER_COLORS.length],
    };
  }
  return {
    ['--w' as string]: `${38 + (h % 4) * 4}px`,
    ['--h' as string]: `${168 + ((h >>> 4) % 6) * 8}px`,
    ['--c' as string]: COLORS[(h >>> 8) % COLORS.length],
  };
}

// A fridge holds food and a wardrobe clothes instead of books: each kind is a CSS shape
// (Bookshelf.module.css) whose colours come in as variables. Folders are a tub or a garment
// bag, and the "New note" slot is an empty jar or shirt.
type Good = { shape: string; w: number; h: number; c: string; c2?: string; vars?: Record<string, string> };

const FOODS: Good[] = [
  { shape: 'squeeze', w: 52, h: 204, c: '#c4262e', vars: { hl: '#ec6a70', sh: '#8e1a22', cap: '#f4f4f4', capSh: '#c9c9c9', lbg: '#f4f4f4', lfg: '#8e1a22' } },
  { shape: 'squeeze', w: 52, h: 196, c: '#f0c419', vars: { hl: '#fbe57a', sh: '#c29411', cap: '#c4262e', capSh: '#8e1a22' } },
  { shape: 'carton', w: 62, h: 204, c: '#f4f4f4', c2: '#3e6fb0', vars: { lbg: '#3e6fb0', lfg: '#f4f4f4' } },
  { shape: 'carton', w: 62, h: 196, c: '#fb8f2d', c2: '#3e8948' },
  { shape: 'glass', w: 52, h: 216, c: '#3e8948', vars: { glass: '#d3ead7' } },
  { shape: 'glass', w: 52, h: 208, c: '#6b3415', vars: { glass: '#efdcc0' } },
  { shape: 'jam', w: 64, h: 178, c: '#7a2048', c2: '#e0708a', vars: { cloth: '#c4262e' } },
  { shape: 'pickles', w: 66, h: 184, c: '#c9dc86', c2: '#4d7a2c', vars: { glass: '#eef5dc' } },
];
const PLAID = (a: string, b: string) =>
  `repeating-linear-gradient(90deg, ${a} 0 6px, transparent 6px 14px), repeating-linear-gradient(${a} 0 6px, transparent 6px 14px), repeating-linear-gradient(90deg, transparent 0 9px, ${b} 9px 10px, transparent 10px 14px)`;
const CLOTHES: Good[] = [
  { shape: 'tee', w: 88, h: 160, c: '#f4f4f4', vars: { sh: '#c9c9c9', pat: 'repeating-linear-gradient(transparent 0 8px, #2b3f6c 8px 12px)', lfg: '#b4202a', lsh: '2px 0 0 #f4f4f4' } },
  { shape: 'tee', w: 88, h: 160, c: '#3e8948', vars: { sh: '#265c42' } },
  { shape: 'shirt', w: 92, h: 184, c: '#a9c6e8', vars: { sh: '#7b9cc4', hl: '#d6e6f6', btn: '#f4f4f4', lfg: '#2b3f6c', lsh: 'none' } },
  { shape: 'shirt', w: 92, h: 184, c: '#b4202a', vars: { sh: '#6e1219', hl: '#b4202a', collar: '#b4202a', btn: '#f4e4c1', pat: PLAID('#1f141859', '#f4e4c180') } },
  { shape: 'hoodie', w: 96, h: 184, c: '#8b8f96', vars: { sh: '#61656c', cord: '#f4f4f4', pat: 'repeating-linear-gradient(45deg, #ffffff12 0 2px, transparent 2px 5px)' } },
  { shape: 'hoodie', w: 96, h: 184, c: '#2b3f6c', vars: { sh: '#1b2848', cord: '#f4e4c1' } },
  { shape: 'sweater', w: 94, h: 172, c: '#e8dcc0', vars: { sh: '#b8a784', hl: '#fff6e2', lfg: '#6d483b', lsh: 'none' } },
  { shape: 'sweater', w: 94, h: 172, c: '#7a2048', vars: { sh: '#4c1430', hl: '#a2406c' } },
  { shape: 'pants', w: 74, h: 190, c: '#33508a', vars: { sh: '#22365e', cuff: '#6f8fc4', btn: '#c8a46a', stitch: '#e0a050', pat: 'repeating-linear-gradient(-60deg, #ffffff14 0 2px, transparent 2px 4px)' } },
  { shape: 'pants', w: 74, h: 190, c: '#c9b089', vars: { sh: '#9a8462', cuff: '#c9b089', btn: '#6d483b', stitch: '#9a8462', lfg: '#4a3631', lsh: 'none' } },
  { shape: 'coat', w: 100, h: 204, c: '#c49a5c', vars: { sh: '#8f6c3c', hl: '#d8b47a', inner: '#b4202a', btn: '#4a3631', belt: 'linear-gradient(90deg, transparent 43%, #3f2832 43% 46%, #8f6c3c 46% 54%, #3f2832 54% 57%, transparent 57%) 50% 69% / 70% 7% no-repeat, linear-gradient(#8f6c3c, #8f6c3c) 50% 69% / 70% 5% no-repeat', lsh: '2px 0 0 #4a3631' } },
  { shape: 'coat', w: 100, h: 204, c: '#25304a', vars: { sh: '#161d2e', hl: '#35425f', inner: '#e8dcc0', btn: '#c8a46a' } },
];

function goodOf(item: Item, look: Exclude<ShelfLook, 'books'>): Good {
  const fridge = look === 'fridge';
  if (item.kind === 'new') return fridge ? { shape: 'empty', w: 64, h: 178, c: '' } : { shape: 'tee', w: 88, h: 160, c: '' };
  const h = hash(keyOf(item));
  const c = FOLDER_COLORS[h % FOLDER_COLORS.length];
  if (item.kind === 'folder') return fridge ? { shape: 'tub', w: 84, h: 150, c } : { shape: 'bag', w: 70, h: 192, c };
  if (fridge) return FOODS[h % FOODS.length];
  return CLOTHES[h % CLOTHES.length];
}

function goodStyle(good: Good): React.CSSProperties {
  return {
    ['--w' as string]: `${good.w}px`,
    ['--h' as string]: `${good.h}px`,
    ['--c' as string]: good.c,
    ['--c2' as string]: good.c2,
    ...Object.fromEntries(Object.entries(good.vars ?? {}).map(([k, v]) => [`--${k}`, v])),
  };
}

function widthOf(item: Item, look: ShelfLook): number {
  return (look === 'books' ? parseInt(String(bookStyle(item)['--w' as keyof React.CSSProperties]), 10) : goodOf(item, look).w) + 6;
}

const HINTS: Record<ShelfLook, string> = {
  books: 'Click a folder to open it. Click a book to read. Esc goes back.',
  fridge: 'Click a tub to open it. Click any food to read. Esc goes back.',
  wardrobe: 'Click a garment bag to open it. Click any clothes to read. Esc goes back.',
};

function packRows(items: Item[], look: ShelfLook): Item[][] {
  const rows: Item[][] = [];
  let row: Item[] = [];
  let used = 0;
  for (const item of items) {
    const w = widthOf(item, look) + GAP;
    if (row.length > 0 && used + w > SHELF_INNER) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(item);
    used += w;
  }
  if (row.length > 0) rows.push(row);
  while (rows.length < 2) rows.push([]);
  return rows;
}

export default function Bookshelf() {
  const { vault, setVault } = useVault();
  const wallet = useWallet();
  const [houseId, setHouseId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [look, setLook] = useState<ShelfLook>('books');
  const [path, setPath] = useState<string[]>([]);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const noteOpen = useRef(false);

  useEffect(() => {
    const onOpen = ({ houseId, roomId, look }: { houseId: string; roomId: string; look: ShelfLook }) => {
      setHouseId(houseId);
      setRoomId(roomId);
      setLook(look);
      setPath([]);
      setNaming(false);
    };
    const onClose = () => {
      setHouseId(null);
      setNaming(false);
    };
    const onNoteOpen = () => { noteOpen.current = true; };
    const onNoteClose = () => { noteOpen.current = false; };
    bus.on('open-shelf', onOpen);
    bus.on('close-shelf', onClose);
    bus.on('open-note', onNoteOpen);
    bus.on('close-note', onNoteClose);
    return () => {
      bus.off('open-shelf', onOpen);
      bus.off('close-shelf', onClose);
      bus.off('open-note', onNoteOpen);
      bus.off('close-note', onNoteClose);
    };
  }, []);

  useEffect(() => {
    if (!houseId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || noteOpen.current) return;
      if (path.length > 0) setPath((p) => p.slice(0, -1));
      else bus.emit('close-shelf', undefined);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [houseId, path.length]);

  const house = useMemo(() => (houseId ? findHouse(vault?.world, houseId) : undefined), [vault, houseId]);
  const tree = useMemo(() => (house ? buildTree(house) : null), [house]);

  if (!houseId || !tree) return null;

  // A room's shelf holds only its own folder (maybe still empty); the entrance's holds the whole house.
  const roomFolder = house && roomId && roomId !== house.id ? roomId.slice(house.id.length + 1) : null;
  const root: Folder = roomFolder
    ? (tree.folders.get(roomFolder) ?? { name: roomFolder, folders: new Map(), notes: [] })
    : tree;
  let folder: Folder = root;
  for (const seg of path) {
    const next = folder.folders.get(seg);
    if (!next) break;
    folder = next;
  }
  const canCreate = !!vault?.createNote;
  const rows = packRows(canCreate ? [...itemsOf(folder), NEW_BOOK] : itemsOf(folder), look);

  const close = () => bus.emit('close-shelf', undefined);

  const startNaming = () => {
    setTitle('');
    setCreateError(null);
    setNaming(true);
  };

  const create = async () => {
    if (!vault?.createNote || !house || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const folderPath = [house.id === '.' ? '' : house.id, ...(roomFolder ? [roomFolder] : []), ...path].filter(Boolean).join('/');
      const { world, note } = await vault.createNote(folderPath, title);
      setVault({ ...vault, world });
      replaceWorld(world);
      setNaming(false);
      bus.emit('open-note', { note });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the note.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={`${styles.panel} ${look === 'books' ? '' : styles[look]}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <button className={styles.btn} disabled={path.length === 0} onClick={() => setPath((p) => p.slice(0, -1))}>
            &lt; Back
          </button>
          <div className={styles.crumbs}>
            {path.length === 0 ? (
              <span className={styles.crumbCurrent}>{root.name}</span>
            ) : (
              <button className={styles.crumb} onClick={() => setPath([])}>{root.name}</button>
            )}
            {path.map((seg, i) => (
              <span key={i} style={{ display: 'contents' }}>
                <span className={styles.sep}>/</span>
                {i === path.length - 1 ? (
                  <span className={styles.crumbCurrent}>{seg}</span>
                ) : (
                  <button className={styles.crumb} onClick={() => setPath(path.slice(0, i + 1))}>{seg}</button>
                )}
              </span>
            ))}
          </div>
          <button className={styles.btn} onClick={close}>X</button>
        </div>

        <div className={styles.shelves}>
          {rows.map((row, ri) => (
            <div key={ri} className={styles.row}>
              {row.map((item) => {
                const good = look === 'books' ? null : goodOf(item, look);
                return (
                  <button
                    key={keyOf(item)}
                    className={
                      good
                        ? `${styles.good} ${styles[good.shape]} ${item.kind === 'new' ? styles.ghost : ''}`
                        : `${styles.book} ${item.kind === 'folder' ? styles.folder : ''} ${item.kind === 'new' ? styles.newBook : ''}`
                    }
                    style={good ? goodStyle(good) : bookStyle(item)}
                    title={
                      item.kind === 'note'
                        ? item.note.preview || item.name
                        : item.kind === 'folder'
                          ? `${item.name} (${item.count})`
                          : 'Write a new note here'
                    }
                    onClick={() => {
                      if (item.kind === 'folder') setPath((p) => [...p, item.name]);
                      else if (item.kind === 'note') bus.emit('open-note', { note: item.note });
                      else startNaming();
                    }}
                  >
                    {good ? (
                      <>
                        {look === 'wardrobe' && <span className={styles.hanger} />}
                        <span className={styles.outline}>
                          <span className={styles.shape}>
                            <span className={styles.detail} />
                          </span>
                        </span>
                        <span className={styles.label}>{item.kind === 'new' ? `+ ${item.name}` : item.name}</span>
                      </>
                    ) : (
                      <>
                        <span className={styles.band} />
                        {item.kind === 'new' && <span className={styles.plus}>+</span>}
                        <span className={styles.title}>{item.name}</span>
                        <span className={styles.bandBottom} />
                      </>
                    )}
                    {item.kind === 'folder' && <span className={styles.count}>{item.count}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className={styles.hint}>{HINTS[look]}</div>

        {naming && (
          <div className={styles.namerBackdrop} onClick={() => setNaming(false)}>
            <form
              className={styles.namer}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <div className={styles.namerTitle}>New note in {path.length ? path[path.length - 1] : root.name}</div>
              <input
                className={styles.input}
                autoFocus
                value={title}
                maxLength={120}
                placeholder="Title"
                spellCheck={false}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  // Keep Phaser's and the shelf's window-level key handlers out of the text box.
                  e.stopPropagation();
                  if (e.key === 'Escape') setNaming(false);
                }}
                onKeyUp={(e) => e.stopPropagation()}
              />
              {createError && <div className={styles.namerError}>{createError}</div>}
              {wallet.active && (
                <div className={styles.namerReward}>
                  <Coin size={18} /> Write {MIN_WORDS}+ words in it to earn {NOTE_REWARD} coins.
                </div>
              )}
              <div className={styles.namerActions}>
                <button type="button" className={styles.btn} onClick={() => setNaming(false)}>Cancel</button>
                <button type="submit" className={styles.btn} disabled={creating || !title.trim()}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
