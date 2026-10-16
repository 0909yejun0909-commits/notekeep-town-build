// Opened with ?test in the address (a shortcut for testing), the app starts from nothing every
// time: the town kept in this browser, its notes, coins, bought land and saved looks are wiped
// as the page loads, so nothing from one run is there the next. Only the text style is kept. A
// folder of notes from the computer is never touched: what's wiped is the browser's own copy.

export const TEST_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test');

const KEEP = ['notekeep-town:font'];

async function wipe() {
  try {
    const kept = KEEP.map((k) => [k, localStorage.getItem(k)] as const);
    localStorage.clear();
    for (const [k, v] of kept) if (v !== null) localStorage.setItem(k, v);
    sessionStorage.clear();
  } catch {
    // Storage unavailable: there's nothing kept to wipe.
  }
  try {
    const root = await navigator.storage.getDirectory();
    for await (const name of (root as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }).keys()) {
      await root.removeEntry(name, { recursive: true });
    }
  } catch {
    // No private storage in this browser: no town was kept in it either.
  }
}

// Done before the page reads anything (app/page.tsx imports this first); a town opening waits
// for the files to be gone (lib/vault/open.ts).
export const testReset: Promise<void> = TEST_MODE ? wipe() : Promise.resolve();
