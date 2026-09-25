import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../../relay/server.mts';
import { exportRoomKey, generateRoomKey } from './crypto.ts';
import { Room } from './room.ts';
import type { VaultHandle, WorldModel } from '@/lib/types';

// publishWorld hands the town to Phaser through window.__game.registry.
const registry = new Map<string, unknown>();
Object.assign(globalThis, {
  window: globalThis,
  __game: { registry: { set: (k: string, v: unknown) => registry.set(k, v), get: (k: string) => registry.get(k), remove: (k: string) => registry.delete(k) } },
});

const relay = await createRelay({ port: 0 });
const url = `ws://127.0.0.1:${relay.port}`;
process.env.NEXT_PUBLIC_RELAY_URL = url;
const { joinRoom } = await import('./guest.ts');
const { endSession, getSession } = await import('./session.ts');

const hosts: Room[] = [];
afterEach(() => {
  endSession(null);
  hosts.splice(0).forEach((h) => h.close());
});
after(() => relay.close());

const note = (id: string) => ({ id, title: id, furniture: 'desk' as const, gx: 0, gy: 0, preview: '' });
const world: WorldModel = {
  name: 'V',
  regions: [{ id: 'Study', name: 'Study', biome: 'meadow', houses: [{
    id: 'Study/Bio', name: 'Bio', gx: 0, gy: 0, variant: 0, material: 'wood', wallColor: 'base', roofColor: 'red',
    rooms: [{ id: 'r', name: 'Main', notes: [note('Study/Bio/cells.md'), note('Study/Bio/other.md')] }],
  }] }],
};

// A FileSystemDirectoryHandle stand-in for walk(), optionally slow like a big synced vault.
function fakeDir(files: Record<string, string>, delayMs = 0): FileSystemDirectoryHandle {
  const dir = (prefix: string): unknown => ({
    kind: 'directory',
    async *entries() {
      const names = new Set(Object.keys(files).filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length).split('/')[0]));
      for (const name of names) {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        const path = prefix + name;
        yield [name, path in files ? { kind: 'file', getFile: async () => new File([files[path]], name) } : dir(`${path}/`)];
      }
    },
  });
  return dir('') as FileSystemDirectoryHandle;
}

// A host that is already standing in the town when the guest arrives.
async function hostRoom() {
  const key = await generateRoomKey();
  const host = await Room.create(url, key);
  hosts.push(host);
  host.on((e) => {
    if (e.kind === 'peer-joined') host.send(e.peerId, { t: 'presence', name: 'Ada', scene: 'overworld', gx: 2, gy: 3, facing: 'down' });
    if (e.kind !== 'message') return;
    if (e.msg.t === 'hello') host.send(e.from, { t: 'world', world, layouts: {}, share: 'notes' });
    if (e.msg.t === 'note-req') host.send(e.from, { t: 'note-res', reqId: e.msg.reqId, ok: true, text: `from host: ${e.msg.path}` });
  });
  return { host, invite: { roomId: host.roomId, key: await exportRoomKey(key) } };
}

const T = { timeout: 8000 };

test('a guest reading a big local copy still sees the host who was already there', T, async () => {
  const { host, invite } = await hostRoom();
  const slow = fakeDir({ 'Study/Bio/cells.md': 'a', 'Study/Bio/other.md': 'b', 'Study/Chem/x.md': 'c' }, 150);
  await joinRoom(invite, 'Bo', slow, () => {});
  assert.deepEqual(getSession().peers, [{ id: host.selfId, name: 'Ada' }]);
});

test('a local copy is used for a note only when the path matches exactly', T, async () => {
  const { invite } = await hostRoom();
  const local = fakeDir({
    'Elsewhere/cells.md': 'a different cells note',
    'Study/Bio/other.md': 'my synced copy',
    'Pictures/cell.png': 'png bytes',
  });
  let vault: VaultHandle | null = null;
  await joinRoom(invite, 'Bo', local, (v) => (vault = v));
  assert.ok(vault);
  const v = vault as VaultHandle;
  assert.equal(await v.readNote('Study/Bio/cells.md'), 'from host: Study/Bio/cells.md');
  assert.equal(await v.readNote('Study/Bio/other.md'), 'my synced copy');
  assert.equal(await (await v.readBinary('cell.png')).text(), 'png bytes', 'embeds still resolve by name, like Obsidian');
});
