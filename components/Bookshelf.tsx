'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { House, NoteRef, WorldModel } from '@/lib/types';
import { hash } from '@/lib/types';
import { useVault } from '@/lib/vault/open';
import { bus } from '@/game/bus';
import styles from './Bookshelf.module.css';

type Folder = { name: string; folders: Map<string, Folder>; notes: NoteRef[] };

type Item =
  | { kind: 'folder'; name: string; folder: Folder; count: number }
  | { kind: 'note'; name: string; note: NoteRef };

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

function bookStyle(item: Item): React.CSSProperties {
  const key = item.kind === 'note' ? item.note.id : 'folder:' + item.name;
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
    ['--h' as string]: `${168 + ((h >> 4) % 6) * 8}px`,
    ['--c' as string]: COLORS[(h >> 8) % COLORS.length],
  };
}

function widthOf(item: Item): number {
  return parseInt(String(bookStyle(item)['--w' as keyof React.CSSProperties]), 10) + 6;
}

function packRows(items: Item[]): Item[][] {
  const rows: Item[][] = [];
  let row: Item[] = [];
  let used = 0;
  for (const item of items) {
    const w = widthOf(item) + GAP;
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
  const { vault } = useVault();
  const [houseId, setHouseId] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const noteOpen = useRef(false);

  useEffect(() => {
    const onOpen = ({ houseId }: { houseId: string }) => {
      setHouseId(houseId);
      setPath([]);
    };
    const onClose = () => setHouseId(null);
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

  let folder: Folder = tree;
  for (const seg of path) {
    const next = folder.folders.get(seg);
    if (!next) break;
    folder = next;
  }
  const rows = packRows(itemsOf(folder));

  const close = () => bus.emit('close-shelf', undefined);

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <button className={styles.btn} disabled={path.length === 0} onClick={() => setPath((p) => p.slice(0, -1))}>
            &lt; Back
          </button>
          <div className={styles.crumbs}>
            {path.length === 0 ? (
              <span className={styles.crumbCurrent}>{tree.name}</span>
            ) : (
              <button className={styles.crumb} onClick={() => setPath([])}>{tree.name}</button>
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
              {row.map((item) => (
                <button
                  key={item.kind === 'note' ? item.note.id : 'folder:' + item.name}
                  className={`${styles.book} ${item.kind === 'folder' ? styles.folder : ''}`}
                  style={bookStyle(item)}
                  title={item.kind === 'note' ? item.note.preview || item.name : `${item.name} (${item.count})`}
                  onClick={() => {
                    if (item.kind === 'folder') setPath((p) => [...p, item.name]);
                    else bus.emit('open-note', { note: item.note });
                  }}
                >
                  <span className={styles.band} />
                  <span className={styles.title}>{item.name}</span>
                  <span className={styles.bandBottom} />
                  {item.kind === 'folder' && <span className={styles.count}>{item.count}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className={styles.hint}>Click a folder to open it. Click a book to read. Esc goes back.</div>
      </div>
    </div>
  );
}
