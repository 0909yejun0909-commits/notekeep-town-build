import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CHAT, cleanName, parseAppMessage } from './protocol.ts';

const parse = (m: object) => parseAppMessage(JSON.stringify(m));

test('chat is trimmed and capped; empty chat is dropped', () => {
  assert.deepEqual(parse({ t: 'chat', text: '  hi  ' }), { t: 'chat', text: 'hi' });
  const long = parse({ t: 'chat', text: '<b>' + 'x'.repeat(10_000) });
  assert.equal(long?.t === 'chat' && long.text.length, MAX_CHAT);
  assert.equal(parse({ t: 'chat', text: '   ' }), null);
  assert.equal(parse({ t: 'chat', text: 42 }), null);
});

test('names collapse whitespace, cap at 24 and never come out empty', () => {
  assert.equal(cleanName('  Ada \n Lovelace '), 'Ada Lovelace');
  assert.equal(cleanName('x'.repeat(40)).length, 24);
  assert.equal(cleanName('   '), 'Guest');
});

test('presence needs integer tiles, a real facing and a known scene', () => {
  const ok = { t: 'presence', name: ' Bo ', scene: 'house:Work/Ideas', gx: 3, gy: 4, facing: 'left' };
  assert.deepEqual(parse(ok), { ...ok, name: 'Bo' });
  assert.deepEqual(parse({ ...ok, scene: null }), { ...ok, name: 'Bo', scene: null });
  assert.equal(parse({ ...ok, gx: 1.5 }), null);
  assert.equal(parse({ ...ok, facing: 'north' }), null);
  assert.equal(parse({ ...ok, scene: 'moon' }), null);
});

test('note requests need a path and a known kind', () => {
  assert.deepEqual(parse({ t: 'note-req', reqId: '1', path: 'a.md', kind: 'text' }), {
    t: 'note-req', reqId: '1', path: 'a.md', kind: 'text',
  });
  assert.equal(parse({ t: 'note-req', reqId: '1', path: 'a.md', kind: 'exec' }), null);
});

test('note responses keep only well-typed fields', () => {
  assert.deepEqual(parse({ t: 'note-res', reqId: '1', ok: false, error: 'nope' }), {
    t: 'note-res', reqId: '1', ok: false, error: 'nope',
  });
  assert.deepEqual(parse({ t: 'note-res', reqId: '1', ok: true, text: 'body', b64: 5 }), {
    t: 'note-res', reqId: '1', ok: true, text: 'body', b64: undefined, mime: undefined,
  });
});

test('world messages need regions and default to sharing notes', () => {
  const w = { t: 'world', world: { name: 'V', regions: [] }, layouts: {} };
  assert.deepEqual(parse(w), { ...w, share: 'notes' });
  assert.equal(parse({ ...w, share: 'town' })?.t, 'world');
  assert.equal(parse({ t: 'world', world: {}, layouts: {} }), null);
});

test('garbage and unknown types are ignored', () => {
  assert.equal(parseAppMessage('not json'), null);
  assert.equal(parseAppMessage('null'), null);
  assert.equal(parse({ t: 'shutdown' }), null);
  assert.deepEqual(parse({ t: 'hello', extra: 1 }), { t: 'hello' });
});
