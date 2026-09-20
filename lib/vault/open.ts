'use client';

import { createContext, createElement, useContext, useState, type ReactNode } from 'react';
import type { VaultHandle, WorldModel } from '@/lib/types';
import { makeLinkResolver, parseVault } from '@/lib/vault/parse';
import { DEMO_FILES, DEMO_VAULT_NAME } from '@/lib/vault/demo';

const HEAD_BYTES = 2048;

function publishWorld(world: WorldModel) {
  const attempt = () => {
    const game = (window as any).__game;
    if (!game?.registry) return false;
    game.registry.set('world', world);
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
    dir = await picker.call(window, { mode: 'read' });
  } catch {
    return null;
  }

  const files = new Map<string, FileSystemFileHandle>();
  await walk(dir, '', files);
  const paths = [...files.keys()];
  const resolve = makeLinkResolver(paths);

  // Accepts a vault path or an Obsidian link target ("Note", "Note#Heading|alias", "img.png").
  const getFile = async (link: string) => {
    const path = resolve(link);
    const handle = path ? files.get(path) : undefined;
    if (!handle) throw new Error(`No such file in vault: ${link}`);
    return handle.getFile();
  };

  const world = await parseVault(dir.name, paths, async (p) =>
    (await getFile(p)).slice(0, HEAD_BYTES).text(),
  );
  publishWorld(world);

  return {
    world,
    readNote: async (id) => (await getFile(id)).text(),
    readBinary: (path) => getFile(path),
  };
}

export async function openDemoVault(): Promise<VaultHandle | null> {
  const paths = Object.keys(DEMO_FILES);
  const resolve = makeLinkResolver(paths);
  const getText = (link: string) => {
    const path = resolve(link);
    const text = path ? DEMO_FILES[path] : undefined;
    if (text === undefined) throw new Error(`No such file in vault: ${link}`);
    return text;
  };

  const world = await parseVault(DEMO_VAULT_NAME, paths, async (p) => getText(p).slice(0, HEAD_BYTES));
  publishWorld(world);

  return {
    world,
    readNote: async (id) => getText(id),
    readBinary: async (path) => new Blob([getText(path)], { type: 'text/markdown' }),
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
