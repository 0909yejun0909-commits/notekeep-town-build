'use client';

import { createContext, createElement, useContext, useState, type ReactNode } from 'react';
import type { VaultHandle } from '@/lib/types';

export async function openVault(): Promise<VaultHandle | null> {
  // TODO
  return null;
}

export async function openDemoVault(): Promise<VaultHandle | null> {
  // TODO
  return null;
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
