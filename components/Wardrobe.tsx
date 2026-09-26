'use client';

import { useEffect, useState } from 'react';
import styles from './Wardrobe.module.css';
import CharacterCreator from './CharacterCreator';
import { bus } from '@/game/bus';

// Opened by walking up to a wardrobe (InteriorScene). CharacterCreator saves every change
// as it's made; closing tells the scene to redress the player.
export default function Wardrobe() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    bus.on('open-wardrobe', onOpen);
    return () => bus.off('open-wardrobe', onOpen);
  }, []);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    bus.emit('close-wardrobe', undefined);
  };

  return (
    <div className={styles.screen}>
      <CharacterCreator onDone={close} />
      <p className={styles.hint}>Up/Down picks a row, Left/Right changes it, Enter when done</p>
    </div>
  );
}
