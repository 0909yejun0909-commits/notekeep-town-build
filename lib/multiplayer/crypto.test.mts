import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToBytes,
  bytesToBase64,
  exportRoomKey,
  generateRoomKey,
  importRoomKey,
  openMessage,
  sealMessage,
} from './crypto.ts';

test('a key survives the invite link and decrypts what the original sealed', async () => {
  const key = await generateRoomKey();
  const text = await exportRoomKey(key);
  assert.match(text, /^[A-Za-z0-9_-]{43}$/);
  const copy = await importRoomKey(text);
  assert.equal(await openMessage(copy, await sealMessage(key, 'hello ✏️')), 'hello ✏️');
});

test('sealing the same text twice gives different ciphertext', async () => {
  const key = await generateRoomKey();
  assert.notEqual(await sealMessage(key, 'same'), await sealMessage(key, 'same'));
});

test('the wrong key or a flipped byte is rejected', async () => {
  const key = await generateRoomKey();
  const sealed = await sealMessage(key, 'secret');
  await assert.rejects(openMessage(await generateRoomKey(), sealed));
  const bytes = base64ToBytes(sealed);
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(openMessage(key, bytesToBase64(bytes)));
});

test('importRoomKey rejects malformed keys', async () => {
  for (const bad of ['', 'abc', 'A'.repeat(42), 'A'.repeat(44), '!'.repeat(43)]) {
    await assert.rejects(importRoomKey(bad), `accepted ${JSON.stringify(bad)}`);
  }
});

test('base64 helpers handle large buffers', () => {
  const big = new Uint8Array(300_000).map((_, i) => i % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(big)), big);
});
