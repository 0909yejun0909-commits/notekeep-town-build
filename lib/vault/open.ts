'use client';

import { createContext, createElement, useContext, useState, type ReactNode } from 'react';
import type { InteriorLayout, NoteRef, Room, VaultHandle, WorldModel } from '@/lib/types';
import { HOUSE_MARKER, isNotePath, makeLinkResolver, parseVault, ROOT_ID } from '@/lib/vault/parse';
import { foldersOf, newHousePath, newNotePath, newRoomPath } from '@/lib/vault/paths';
import { DEMO_FILES, DEMO_VAULT_NAME } from '@/lib/vault/demo';
import { vaultFingerprint } from '@/lib/interiorStore';
import { loadAppearance } from '@/lib/appearance';
import { notesAdded, startWallet, stopWallet } from '@/lib/walletStore';
import { HEAD_BYTES, STARTER_GRANT, TOWN_GRANT } from '@/lib/wallet';
import { startAchievements, stopAchievements } from '@/lib/achievementStore';
import type { TownEdits } from '@/lib/townEdits';


export function publishWorld(
  world: WorldModel,
  fingerprint: string | null,
  guest?: { layouts: Record<string, InteriorLayout>; town?: TownEdits },
) {
  const attempt = () => {
    const game = (window as any).__game;
    if (!game?.registry) return false;
    if (guest) {
      stopWallet();
      stopAchievements();
      // No fingerprint: a guest's own saved customizations must never repaint the host's town.
      game.registry.set('role', 'guest');
      game.registry.set('sessionLayouts', guest.layouts);
      game.registry.set('sessionTown', guest.town ?? null);
      game.registry.remove('vaultFingerprint');
    } else {
      game.registry.remove('role');
      game.registry.remove('sessionLayouts');
      game.registry.remove('sessionTown');
      game.registry.set('vaultFingerprint', fingerprint);
    }
    // Read fresh (not cached at module load) so a change made in the picker seconds before
    // clicking "Open your vault" / "Tutorial" is never missed.
    game.registry.set('appearance', loadAppearance());
    // Last: TitleScene starts the overworld the moment this lands.
    game.registry.set('world', world);
    return true;
  };
  if (attempt()) return;
  const timer = setInterval(() => { if (attempt()) clearInterval(timer); }, 100);
}

// For a world re-parsed mid-session (a note was added). Scenes read it the next time they
// start; exterior overrides are re-applied by OverworldScene.create() as usual.
export function replaceWorld(world: WorldModel) {
  (window as any).__game?.registry.set('world', world);
}

function findNote(world: WorldModel, id: string): NoteRef {
  for (const region of world.regions) {
    for (const house of region.houses) {
      for (const room of house.rooms) {
        const note = room.notes.find((n) => n.id === id);
        if (note) return note;
      }
    }
  }
  throw new Error('The new note did not make it into the town.');
}

function findRoom(world: WorldModel, id: string): Room {
  for (const region of world.regions) {
    for (const house of region.houses) {
      const room = house.rooms.find((r) => r.id === id);
      if (room) return room;
    }
  }
  throw new Error('The new room did not make it into the town.');
}

type PermissionHandle = FileSystemHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};

async function ensureWritable(handle: FileSystemHandle) {
  const h = handle as PermissionHandle;
  if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    const state = await h.requestPermission?.({ mode: 'readwrite' });
    if (state !== 'granted') throw new Error('Write permission denied');
  }
}

export async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: Map<string, FileSystemFileHandle>,
  folders?: string[],
  unreadable?: string[],
  hidden?: string[],
  houses?: string[],
) {
  try {
    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (name.startsWith('.')) {
        if (name === HOUSE_MARKER && prefix) houses?.push(prefix);
        else hidden?.push(name);
        continue;
      }
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        folders?.push(path);
        await walk(handle as FileSystemDirectoryHandle, path, out, folders, unreadable, hidden, houses);
      } else out.set(path, handle as FileSystemFileHandle);
    }
  } catch {
    // A folder the browser cannot list (cloud placeholder, permission) is skipped, not fatal.
    unreadable?.push(prefix || dir.name);
  }
}

// Thrown when the picked folder gives the town nothing to build from; the title menu shows
// the message instead of opening an empty, black town.
export class VaultError extends Error {}

function noNotesMessage(name: string, files: number, unreadable: number, hidden: number): string {
  if (unreadable > 0) {
    return `Couldn't open ${unreadable === 1 ? 'a folder' : `${unreadable} folders`} in "${name}", and found no notes. ` +
      'If it syncs with OneDrive, iCloud or Google Drive, make the files available offline, then try again.';
  }
  if (files === 0 && hidden > 0) {
    return `"${name}" only has hidden files and folders (names starting with a dot), which the town ` +
      'leaves out. Pick the folder that holds your Obsidian notes.';
  }
  if (files > 0) {
    return `No notes in "${name}". The town is built from .md files, and this folder has ${files} other ` +
      `${files === 1 ? 'file' : 'files'}. Pick the folder that holds your Obsidian notes.`;
  }
  return `"${name}" is empty. Pick the folder that holds your Obsidian notes (.md files).`;
}

export async function openVault(): Promise<VaultHandle | null> {
  const picker = (window as any).showDirectoryPicker as
    | ((opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>)
    | undefined;
  if (!picker) {
    alert('Opening a vault needs the File System Access API. Use Chrome or Edge, or try the tutorial.');
    return null;
  }

  let dir: FileSystemDirectoryHandle;
  try {
    // readwrite so notes can be edited in the book; fall back to read-only if the browser refuses.
    dir = await picker.call(window, { mode: 'readwrite' });
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return null;
    try {
      dir = await picker.call(window, { mode: 'read' });
    } catch {
      return null;
    }
  }
  return openFolder(dir, { name: dir.name, key: dir.name, grant: STARTER_GRANT });
}

// "Your town": a vault kept in the browser's own private storage, so anyone can start writing
// without picking a folder. It starts as one house with a welcome note in it.
export const TOWN_NAME = 'Your town';
const TOWN_KEY = 'notekeep:your-town';
const TOWN_REGION = 'My Town';
const WELCOME = `# Welcome home

This is your first house. Every note you write here is a book on its shelf, and it's saved in this browser.

- Type / in a note for headings, lists, to-dos and more
- A new note of 30 words earns 10 coins, and every 100 words more earns 10 again
- Press Build in town to add houses, bring in a folder of notes, decorate and buy land
`;

export async function openTown(): Promise<VaultHandle | null> {
  const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  if (!storage?.getDirectory) {
    throw new VaultError("This browser can't keep a town. Try Chrome, Edge or Firefox, or open a folder of notes.");
  }
  // Ask the browser not to clear it when space runs low; it may say no, which is fine.
  void storage.persist?.();
  const root = await storage.getDirectory();
  const dir = escapedDir(await root.getDirectoryHandle('your-town', { create: true }), TOWN_NAME);
  let empty = true;
  for await (const _ of (dir as any).entries()) {
    empty = false;
    break;
  }
  if (empty) {
    const home = await (await dir.getDirectoryHandle(TOWN_REGION, { create: true })).getDirectoryHandle('Home', { create: true });
    await home.getFileHandle(HOUSE_MARKER, { create: true });
    await writeFile(await home.getFileHandle('Welcome.md', { create: true }), WELCOME);
  }
  return openFolder(dir, { name: TOWN_NAME, key: TOWN_KEY, grant: TOWN_GRANT });
}

async function writeFile(handle: FileSystemFileHandle, data: string | Blob) {
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

// Browser storage can refuse names outside plain ASCII, so names are stored escaped
// (encodeURIComponent) and shown as typed. Only what this file's vault code uses is wrapped.
function escapedDir(dir: FileSystemDirectoryHandle, name: string): FileSystemDirectoryHandle {
  const unescape = (n: string) => {
    try {
      return decodeURIComponent(n);
    } catch {
      return n;
    }
  };
  const wrapped = {
    kind: 'directory',
    name,
    async *entries() {
      for await (const [n, h] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
        const shown = unescape(n);
        yield [shown, h.kind === 'directory' ? escapedDir(h as FileSystemDirectoryHandle, shown) : escapedFile(h as FileSystemFileHandle, shown)];
      }
    },
    getDirectoryHandle: async (n: string, o?: FileSystemGetDirectoryOptions) =>
      escapedDir(await dir.getDirectoryHandle(encodeURIComponent(n), o), n),
    getFileHandle: async (n: string, o?: FileSystemGetFileOptions) =>
      escapedFile(await dir.getFileHandle(encodeURIComponent(n), o), n),
    removeEntry: (n: string, o?: FileSystemRemoveOptions) => dir.removeEntry(encodeURIComponent(n), o),
  };
  return wrapped as unknown as FileSystemDirectoryHandle;
}

function escapedFile(file: FileSystemFileHandle, name: string): FileSystemFileHandle {
  const wrapped = {
    kind: 'file',
    name,
    getFile: async () => {
      const f = await file.getFile();
      return new File([f], name, { type: f.type, lastModified: f.lastModified });
    },
    createWritable: (o?: FileSystemCreateWritableOptions) => file.createWritable(o),
  };
  return wrapped as unknown as FileSystemFileHandle;
}

// Files picked to bring into town as a house, by their path inside the picked folder.
export type ImportFile = { path: string; file: File };
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// The region a new house goes in: the one asked for if it's a folder, else the first region
// that is one, else a new "Houses" region (a vault whose notes are all loose in its root).
function houseRegion(world: WorldModel, regionId: string): string {
  if (regionId && regionId !== ROOT_ID && !regionId.includes('/')) return regionId;
  return world.regions.find((r) => r.id !== ROOT_ID)?.id ?? 'Houses';
}

// What the town's saved looks (room layouts, house exteriors, village edits) are kept under.
// The fingerprint is made from the house list, so it's pinned the first time a vault opens:
// a house added later, in town or in Obsidian, must not make the town forget them.
function stableFingerprint(key: string, houseIds: string[]): string {
  const pin = `fingerprint:${key}`;
  try {
    const saved = localStorage.getItem(pin);
    if (saved) return saved;
    const fp = vaultFingerprint(key, houseIds);
    localStorage.setItem(pin, fp);
    return fp;
  } catch {
    return vaultFingerprint(key, houseIds);
  }
}

async function openFolder(
  dir: FileSystemDirectoryHandle,
  { name, key, grant }: { name: string; key: string; grant: number },
): Promise<VaultHandle> {
  const files = new Map<string, FileSystemFileHandle>();
  const folders: string[] = [];
  const unreadable: string[] = [];
  const hidden: string[] = [];
  const houses: string[] = [];
  await walk(dir, '', files, folders, unreadable, hidden, houses);
  const paths = [...files.keys()];
  if (!paths.some(isNotePath) && houses.length === 0) {
    throw new VaultError(noNotesMessage(name, paths.length, unreadable.length, hidden.length));
  }
  let resolve = makeLinkResolver(paths);

  // Accepts a vault path or an Obsidian link target ("Note", "Note#Heading|alias", "img.png").
  const getHandle = (link: string) => {
    const path = resolve(link);
    const handle = path ? files.get(path) : undefined;
    if (!handle) throw new Error(`No such file in vault: ${link}`);
    return handle;
  };
  const getFile = (link: string) => getHandle(link).getFile();
  const dirAt = async (path: string, create = false) => {
    let target = dir;
    for (const seg of path.split('/').filter(Boolean)) target = await target.getDirectoryHandle(seg, { create });
    return target;
  };
  const addFolder = (path: string) => {
    const segs = path.split('/');
    for (let i = 1; i <= segs.length; i++) {
      const f = segs.slice(0, i).join('/');
      if (!folders.includes(f)) folders.push(f);
    }
  };

  // Kept so a note added later re-parses the town without re-reading every file.
  const heads = new Map<string, string>();
  let current = await parseVault(name, paths, async (p) => {
    const head = await (await getFile(p)).slice(0, HEAD_BYTES).text();
    heads.set(p, head);
    return head;
  }, folders, houses);
  const reparse = async () => (current = await parseVault(name, paths, async (p) => heads.get(p) ?? '', folders, houses));
  const houseIds = current.regions.flatMap((r) => r.houses.map((h) => h.id));
  startAchievements(key, true);
  startWallet(key, true, heads, grant);
  publishWorld(current, stableFingerprint(key, houseIds));

  const createHouse = async (regionId: string, houseName: string) => {
    const path = newHousePath(houseRegion(current, regionId), houseName, paths, folders);
    await ensureWritable(dir);
    const house = await dirAt(path, true);
    await house.getFileHandle(HOUSE_MARKER, { create: true });
    addFolder(path);
    houses.push(path);
    return path;
  };

  return {
    world: current,
    readNote: async (id) => (await getFile(id)).text(),
    readBinary: (path) => getFile(path),
    writeNote: async (id, content) => {
      const handle = getHandle(id);
      await ensureWritable(handle);
      await writeFile(handle, content);
      const path = resolve(id);
      if (path) heads.set(path, content.slice(0, HEAD_BYTES));
    },
    createNote: async (folder, title) => {
      const path = newNotePath(folder, title, paths);
      await ensureWritable(dir);
      const target = await dirAt(folder);
      const handle = await target.getFileHandle(path.slice(path.lastIndexOf('/') + 1), { create: true });
      files.set(path, handle);
      paths.push(path);
      resolve = makeLinkResolver(paths);
      heads.set(path, '');
      const next = await reparse();
      return { world: next, note: findNote(next, path) };
    },
    createRoom: async (houseId, roomName) => {
      const path = newRoomPath(houseId, roomName, paths, folders);
      await ensureWritable(dir);
      await dirAt(path, true);
      folders.push(path);
      const next = await reparse();
      return { world: next, room: findRoom(next, path) };
    },
    createHouse: async (regionId, houseName) => {
      const houseId = await createHouse(regionId, houseName);
      return { world: await reparse(), houseId };
    },
    importHouse: async (regionId, houseName, picked) => {
      const houseId = await createHouse(regionId, houseName);
      const added = new Map<string, string>();
      for (const { path: rel, file } of picked) {
        const segs = rel.split('/').filter(Boolean);
        if (segs.length === 0 || segs.some((seg) => seg.startsWith('.')) || file.size > MAX_IMPORT_BYTES) continue;
        const folder = [houseId, ...segs.slice(0, -1)].join('/');
        const path = `${folder}/${segs[segs.length - 1]}`;
        if (files.has(path)) continue;
        const handle = await (await dirAt(folder, true)).getFileHandle(segs[segs.length - 1], { create: true });
        await writeFile(handle, file);
        files.set(path, handle);
        paths.push(path);
        addFolder(folder);
        if (isNotePath(path)) {
          const head = await file.slice(0, HEAD_BYTES).text();
          heads.set(path, head);
          added.set(path, head);
        }
      }
      resolve = makeLinkResolver(paths);
      // Bringing notes in isn't writing them: they count as already paid for.
      notesAdded(added);
      return { world: await reparse(), houseId };
    },
  };
}

export async function openDemoVault(): Promise<VaultHandle | null> {
  // Own copy so edits made in the book stick for this session without touching the module constant.
  const files: Record<string, string> = { ...DEMO_FILES };
  const paths = Object.keys(files);
  const folders = foldersOf(paths);
  let resolve = makeLinkResolver(paths);
  const getPath = (link: string) => {
    const path = resolve(link);
    if (!path || files[path] === undefined) throw new Error(`No such file in vault: ${link}`);
    return path;
  };
  const getText = (link: string) => files[getPath(link)];

  const head = async (p: string) => getText(p).slice(0, HEAD_BYTES);
  const houses: string[] = [];
  let current = await parseVault(DEMO_VAULT_NAME, paths, head, folders, houses);
  const world = current;
  const reparse = async () => (current = await parseVault(DEMO_VAULT_NAME, paths, head, folders, houses));
  const addFolder = (path: string) => {
    const segs = path.split('/');
    for (let i = 1; i <= segs.length; i++) {
      const f = segs.slice(0, i).join('/');
      if (!folders.includes(f)) folders.push(f);
    }
  };
  const createHouse = (regionId: string, houseName: string) => {
    const path = newHousePath(houseRegion(current, regionId), houseName, paths, folders);
    addFolder(path);
    houses.push(path);
    return path;
  };
  const houseIds = world.regions.flatMap((r) => r.houses.map((h) => h.id));
  startAchievements(DEMO_VAULT_NAME, false);
  startWallet(DEMO_VAULT_NAME, false, new Map(paths.filter(isNotePath).map((p) => [p, files[p]])));
  publishWorld(world, vaultFingerprint(DEMO_VAULT_NAME, houseIds));

  return {
    world,
    readNote: async (id) => getText(id),
    readBinary: async (path) => new Blob([getText(path)], { type: 'text/markdown' }),
    writeNote: async (id, content) => {
      files[getPath(id)] = content;
    },
    createNote: async (folder, title) => {
      const path = newNotePath(folder, title, paths);
      files[path] = '';
      paths.push(path);
      resolve = makeLinkResolver(paths);
      const next = await reparse();
      return { world: next, note: findNote(next, path) };
    },
    createRoom: async (houseId, name) => {
      const path = newRoomPath(houseId, name, paths, folders);
      folders.push(path);
      const next = await reparse();
      return { world: next, room: findRoom(next, path) };
    },
    createHouse: async (regionId, houseName) => {
      const houseId = createHouse(regionId, houseName);
      return { world: await reparse(), houseId };
    },
    // The tutorial's town lives in memory: it keeps the notes, and leaves pictures out.
    importHouse: async (regionId, houseName, picked) => {
      const houseId = createHouse(regionId, houseName);
      const added = new Map<string, string>();
      for (const { path: rel, file } of picked) {
        const segs = rel.split('/').filter(Boolean);
        const path = [houseId, ...segs].join('/');
        if (!isNotePath(path) || files[path] !== undefined || segs.some((seg) => seg.startsWith('.'))) continue;
        files[path] = await file.text();
        paths.push(path);
        addFolder(path.slice(0, path.lastIndexOf('/')));
        added.set(path, files[path]);
      }
      resolve = makeLinkResolver(paths);
      notesAdded(added);
      return { world: await reparse(), houseId };
    },
  };
}

type VaultContextValue = {
  vault: VaultHandle | null;
  setVault: (v: VaultHandle | null) => void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [vault, setVault] = useState<VaultHandle | null>(null);
  return createElement(VaultContext.Provider, { value: { vault, setVault } }, children);
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
}
