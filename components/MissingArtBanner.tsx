'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';

// Kenmi's art isn't in the repo (its licence forbids redistribution), so a checkout without a
// full `scripts/install-assets.sh` run is missing sprites, which Phaser draws as black boxes.
// BootScene reports what failed to load; this says which folders and how to fix it.
export default function MissingArtBanner() {
  const [files, setFiles] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onMissing = ({ files }: { files: string[] }) => setFiles(files);
    bus.on('assets-missing', onMissing);
    // The game may have finished loading before this mounted.
    const already = (window as any).__game?.registry?.get('missingAssets') as string[] | undefined;
    if (already?.length) setFiles(already);
    return () => bus.off('assets-missing', onMissing);
  }, []);

  if (dismissed || files.length === 0) return null;

  const folders = new Map<string, number>();
  for (const f of files) {
    const dir = f.replace(/^\/?assets\//, '').split('/').slice(0, -1).join('/') || '.';
    folders.set(dir, (folders.get(dir) ?? 0) + 1);
  }

  return (
    <div className="fixed left-1/2 top-4 z-[45] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-yellow-400 bg-neutral-900/95 px-4 py-3 text-sm text-white">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-yellow-400">
          {files.length} art {files.length === 1 ? 'file' : 'files'} failed to load, so those sprites show as black boxes.
        </p>
        <button className="text-neutral-400 hover:text-white" aria-label="Dismiss" onClick={() => setDismissed(true)}>
          ✕
        </button>
      </div>
      <p className="mt-1 text-neutral-300">
        Missing from public/assets:{' '}
        {[...folders].map(([dir, n]) => `${dir} (${n})`).join(', ')}
      </p>
      <p className="mt-1 text-neutral-300">
        Re-run <code className="text-white">scripts/install-assets.sh public/assets</code> with your Kenmi packs (from Git
        Bash on Windows), then reload. See the README.
      </p>
    </div>
  );
}
