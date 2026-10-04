// Every folder above these files, for vaults (like the demo) that only list files.
export function foldersOf(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    const segs = p.split('/');
    for (let i = 1; i < segs.length; i++) out.add(segs.slice(0, i).join('/'));
  }
  return [...out].sort();
}
