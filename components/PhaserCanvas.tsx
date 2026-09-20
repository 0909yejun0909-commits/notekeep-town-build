'use client';

import { useEffect, useRef } from 'react';

export default function PhaserCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: import('phaser').Game | undefined;
    let cancelled = false;

    (async () => {
      const Phaser = (await import('phaser')).default;
      const { createGameConfig } = await import('@/game/config');
      if (cancelled || !containerRef.current) return;

      game = new Phaser.Game(createGameConfig(containerRef.current));
      (window as any).__game = game;
    })();

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 flex items-center justify-center" />;
}
