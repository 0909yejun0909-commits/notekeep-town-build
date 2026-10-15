// Every folder above these files, for vaults (like the demo) that only list files.
export function foldersOf(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    const segs = p.split('/');
    for (let i = 1; i < segs.length; i++) out.add(segs.slice(0, i).join('/'));
  }
  return [...out].sort();
}

const BAD_NAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

function cleanName(raw: string): string {
  return raw.replace(BAD_NAME_CHARS, '').trim();
}

// Vault path for a new note in `folder` ('' is the vault root). Throws a message fit to show.
export function newNotePath(folder: string, title: string, paths: string[]): string {
  const clean = cleanName(title);
  if (!clean || clean.startsWith('.')) throw new Error('Give the note a name.');
  if (clean.length > 120) throw new Error('That name is too long.');
  const path = folder ? `${folder}/${clean}.md` : `${clean}.md`;
  const lower = path.toLowerCase();
  if (paths.some((p) => p.toLowerCase() === lower)) throw new Error(`"${clean}" is already on this shelf.`);
  return path;
}

// Vault path for note `id` retitled `title`, in the same folder. The note's own path is never
// taken (a change of case only). Throws a message fit to show.
export function renamedNotePath(id: string, title: string, paths: string[]): string {
  const folder = id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '';
  const ext = /\.[^./]+$/.exec(id)?.[0] ?? '.md';
  const clean = cleanName(title);
  if (!clean || clean.startsWith('.')) throw new Error('Give the note a name.');
  if (clean.length > 120) throw new Error('That name is too long.');
  const path = folder ? `${folder}/${clean}${ext}` : `${clean}${ext}`;
  const lower = path.toLowerCase();
  if (paths.some((p) => p !== id && p.toLowerCase() === lower)) throw new Error(`There's already a note called "${clean}" here.`);
  return path;
}

// Folder path for a new room in `houseId`. Any existing folder or file of that name is taken:
// reusing an attachments folder would make a "room" the parser never shows.
export function newRoomPath(houseId: string, name: string, paths: string[], folders: string[]): string {
  if (!houseId.includes('/')) throw new Error('Rooms can only be added to a house with its own folder.');
  const clean = cleanName(name);
  if (!clean || clean.startsWith('.')) throw new Error('Give the room a name.');
  if (clean.length > 60) throw new Error('That name is too long.');
  const path = `${houseId}/${clean}`;
  const lower = path.toLowerCase();
  const taken =
    folders.some((f) => f.toLowerCase() === lower) ||
    paths.some((p) => {
      const pl = p.toLowerCase();
      return pl === lower || pl.startsWith(`${lower}/`);
    });
  if (taken) throw new Error(`"${clean}" is already a folder in this house.`);
  return path;
}

// Folder path for a new house in region folder `regionId`. Like a room, any folder or file of
// that name is taken.
export function newHousePath(regionId: string, name: string, paths: string[], folders: string[]): string {
  const clean = cleanName(name);
  if (!clean || clean.startsWith('.')) throw new Error('Give the house a name.');
  if (clean.length > 60) throw new Error('That name is too long.');
  const path = `${regionId}/${clean}`;
  const lower = path.toLowerCase();
  const taken =
    folders.some((f) => f.toLowerCase() === lower) ||
    paths.some((p) => {
      const pl = p.toLowerCase();
      return pl === lower || pl.startsWith(`${lower}/`);
    });
  if (taken) throw new Error(`There's already a house called "${clean}".`);
  return path;
}

// Where `path` ends up when the folder `from` becomes `to`: moved if it's inside, else as is.
export function movedPath(path: string, from: string, to: string): string {
  return path === from || path.startsWith(`${from}/`) ? to + path.slice(from.length) : path;
}
