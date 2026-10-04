import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldersOf, newNotePath, newRoomPath } from './paths.ts';

test('foldersOf lists every folder above the files, once each', () => {
  assert.deepEqual(foldersOf(['a/b/c.md', 'a/b/d.png', 'a/e.md', 'root.md']), ['a', 'a/b']);
});

test('newRoomPath cleans the name and puts it inside the house folder', () => {
  assert.equal(newRoomPath('R/H', '  Kit/chen?  ', [], []), 'R/H/Kitchen');
});

test('newRoomPath refuses houses without their own folder', () => {
  assert.throws(() => newRoomPath('R', 'Kitchen', [], []), /own folder/);
  assert.throws(() => newRoomPath('.', 'Kitchen', [], []), /own folder/);
});

test('newRoomPath refuses empty, hidden and overlong names', () => {
  assert.throws(() => newRoomPath('R/H', '  ', [], []), /name/);
  assert.throws(() => newRoomPath('R/H', '.secret', [], []), /name/);
  assert.throws(() => newRoomPath('R/H', 'x'.repeat(61), [], []), /too long/);
  assert.equal(newRoomPath('R/H', 'x'.repeat(60), [], []), `R/H/${'x'.repeat(60)}`);
});

test('newRoomPath refuses any existing folder or file of that name, ignoring case', () => {
  assert.throws(() => newRoomPath('R/H', 'Kitchen', [], ['R/H/kitchen']), /already/);
  assert.throws(() => newRoomPath('R/H', 'attachments', ['R/H/Attachments/pic.png'], []), /already/);
  assert.throws(() => newRoomPath('R/H', 'notes', ['R/H/notes'], []), /already/);
  assert.equal(newRoomPath('R/H', 'Kitchen', ['R/H/Kitchenette/a.md'], ['R/H/Kitchenette']), 'R/H/Kitchen');
});

test('newNotePath still names notes and refuses duplicates', () => {
  assert.equal(newNotePath('', 'A', []), 'A.md');
  assert.equal(newNotePath('R/H', ' Soup ', []), 'R/H/Soup.md');
  assert.throws(() => newNotePath('R/H', 'soup', ['R/H/Soup.md']), /already on this shelf/);
});
