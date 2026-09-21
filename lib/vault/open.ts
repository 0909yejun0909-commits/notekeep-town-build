'use client';

import { createContext, createElement, useContext, useState, type ReactNode } from 'react';
import type { VaultHandle, WorldModel } from '@/lib/types';
import { makeLinkResolver, parseVault } from '@/lib/vault/parse';
import { DEMO_FILES, DEMO_VAULT_NAME } from '@/lib/vault/demo';
import { vaultFingerprint } from '@/lib/interiorStore';

const HEAD_BYTES = 2048;

function publishWorld(world: WorldModel, fingerprint: string) {
  const attempt = () => {
    const game = (window as any).__game;
    if (!game?.registry) return false;
    game.registry.set('world', world);
    game.registry.set('vaultFingerprint', fingerprint);
    return true;
  };
  if (attempt()) return;
  const timer = setInterval(() => { if (attempt()) clearInterval(timer); }, 100);
}

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: Map<string, FileSystemFileHandle>,
) {
  try {
    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (name.startsWith('.')) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle, path, out);
      else out.set(path, handle as FileSystemFileHandle);
    }
  } catch {
    // A folder the browser cannot list (cloud placeholder, permission) is skipped, not fatal.
  }
}

export async function openVault(): Promise<VaultHandle | null> {
  const picker = (window as any).showDirectoryPicker as
    | ((opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>)
    | undefined;
  if (!picker) {
    alert('Opening a vault needs the File System Access API. Use Chrome or Edge, or try the demo town.');
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

  const files = new Map<string, FileSystemFileHandle>();
  await walk(dir, '', files);
  const paths = [...files.keys()];
  const resolve = makeLinkResolver(paths);

  // Accepts a vault path or an Obsidian link target ("Note", "Note#Heading|alias", "img.png").
  const getHandle = (link: string) => {
    const path = resolve(link);
    const handle = path ? files.get(path) : undefined;
    if (!handle) throw new Error(`No such file in vault: ${link}`);
    return handle;
  };
  const getFile = (link: string) => getHandle(link).getFile();

  const world = await parseVault(dir.name, paths, async (p) =>
    (await getFile(p)).slice(0, HEAD_BYTES).text(),
  );
  publishWorld(world, vaultFingerprint(dir.name, paths));

  return {
    world,
    readNote: async (id) => (await getFile(id)).text(),
    readBinary: (path) => getFile(path),
    writeNote: async (id, content) => {
      const handle = getHandle(id) as FileSystemFileHandle & {
        queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
        requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
      };
      if (handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        const state = await handle.requestPermission?.({ mode: 'readwrite' });
        if (state !== 'granted') throw new Error('Write permission denied');
      }
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    },
  };
}

export async function openDemoVault(): Promise<VaultHandle | null> {
  // Own copy so edits made in the book stick for this session without touching the module constant.
  const files: Record<string, string> = { ...DEMO_FILES };
  const paths = Object.keys(files);
  const resolve = makeLinkResolver(paths);
  const getPath = (link: string) => {
    const path = resolve(link);
    if (!path || files[path] === undefined) throw new Error(`No such file in vault: ${link}`);
    return path;
  };
  const getText = (link: string) => files[getPath(link)];

  const world = await parseVault(DEMO_VAULT_NAME, paths, async (p) => getText(p).slice(0, HEAD_BYTES));
  publishWorld(world, vaultFingerprint(DEMO_VAULT_NAME, paths));

  return {
    world,
    readNote: async (id) => getText(id),
    readBinary: async (path) => new Blob([getText(path)], { type: 'text/markdown' }),
    writeNote: async (id, content) => {
      files[getPath(id)] = content;
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
