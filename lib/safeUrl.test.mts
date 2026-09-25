import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl } from './safeUrl.ts';

test('keeps the blob: and wikilink: URLs the reader creates itself', () => {
  assert.equal(safeUrl('blob:http://localhost:3000/4f1c'), 'blob:http://localhost:3000/4f1c');
  assert.equal(safeUrl('wikilink:My%20Note'), 'wikilink:My%20Note');
});

test('keeps ordinary links and inline images', () => {
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeUrl('mailto:a@b.co'), 'mailto:a@b.co');
  assert.equal(safeUrl('relative/path.png'), 'relative/path.png');
  assert.equal(safeUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
});

test('drops script and document URLs', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('JavaScript:alert(1)'), '');
  assert.equal(safeUrl('vbscript:msgbox(1)'), '');
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '');
});
