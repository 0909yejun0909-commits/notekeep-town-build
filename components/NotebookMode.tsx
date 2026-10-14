'use client';

import { useEffect } from 'react';
import { applyFont, useViewMode } from '@/lib/displayPrefs';
import { useVault } from '@/lib/vault/open';
import { useTutorialStep } from '@/lib/tutorial';
import { useWallet } from '@/lib/walletStore';
import { setQuiet } from '@/game/audio/engine';
import { bus } from '@/game/bus';
import Notebook from './notebook/Notebook';

// The town switched off: while the notebook view is up, the game is paused (no movement, no
// sound, no keys) and the town is redrawn on the way back if the notes changed under it. Not in
// the tutorial or as a study-session guest, whose towns aren't theirs to write in.
export default function NotebookMode() {
  const mode = useViewMode();
  const { vault } = useVault();
  const step = useTutorialStep();
  const wallet = useWallet();
  const on = mode === 'notebook' && !!vault && step === null && wallet.active;

  useEffect(() => applyFont(), []);

  useEffect(() => {
    if (!on) return;
    const game = (window as any).__game;
    const world = game?.registry.get('world');
    game?.pause();
    if (game?.input?.keyboard) {
      game.input.keyboard.enabled = false;
      game.input.keyboard.resetKeys?.();
    }
    setQuiet(true);
    return () => {
      setQuiet(false);
      if (game?.input?.keyboard) game.input.keyboard.enabled = true;
      game?.resume();
      if (game?.registry.get('world') !== world) bus.emit('world-updated', { exteriorChanged: true });
    };
  }, [on]);

  return on ? <Notebook /> : null;
}
