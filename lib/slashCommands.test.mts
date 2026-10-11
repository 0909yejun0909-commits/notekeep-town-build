import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, continueList, matchCommands, slashAt, SLASH_COMMANDS } from './slashCommands.ts';

const cmd = (id: string) => SLASH_COMMANDS.find((c) => c.id === id)!;

test('the menu opens on a slash at a line start or after a space, not inside a word or path', () => {
  assert.deepEqual(slashAt('/bul', 4), { start: 0, query: 'bul' });
  assert.deepEqual(slashAt('hello /', 7), { start: 6, query: '' });
  assert.equal(slashAt('a/b', 3), null);
  assert.equal(slashAt('https://x', 9), null);
  assert.equal(slashAt('no slash', 8), null);
});

test('commands match by name or alias, best matches first', () => {
  assert.equal(matchCommands('bullet')[0].id, 'bullet');
  assert.equal(matchCommands('todo')[0].id, 'todo');
  assert.equal(matchCommands('h2')[0].id, 'h2');
  assert.ok(matchCommands('list').some((c) => c.id === 'number'));
  assert.equal(matchCommands('zzz').length, 0);
});

test('a block command turns the line into that block, replacing any marker it had', () => {
  assert.deepEqual(applyCommand('/bullet', 0, 7, cmd('bullet')), { text: '- ', caret: 2 });
  assert.deepEqual(applyCommand('Shopping /h1', 9, 12, cmd('h1')), { text: '# Shopping ', caret: 11 });
  assert.deepEqual(applyCommand('- milk /todo', 7, 12, cmd('todo')), { text: '- [ ] milk ', caret: 11 });
  assert.deepEqual(applyCommand('a\n# b /text', 6, 11, cmd('text')), { text: 'a\nb ', caret: 4 });
});

test('insert commands drop their block in, on a fresh line after text', () => {
  assert.deepEqual(applyCommand('/divider', 0, 8, cmd('divider')), { text: '---\n', caret: 4 });
  assert.deepEqual(applyCommand('x /code', 2, 7, cmd('code')), { text: 'x \n```\n\n```\n', caret: 7 });
  assert.deepEqual(applyCommand('On /date', 3, 8, cmd('date'), new Date('2026-10-11T12:00:00Z')), { text: 'On 2026-10-11', caret: 13 });
});

test('Enter continues a list, and ends it on an empty item', () => {
  assert.deepEqual(continueList('- milk', 6), { text: '- milk\n- ', caret: 9 });
  assert.deepEqual(continueList('1. one', 6), { text: '1. one\n2. ', caret: 10 });
  assert.deepEqual(continueList('- [x] done', 10), { text: '- [x] done\n- [ ] ', caret: 17 });
  assert.deepEqual(continueList('a\n- ', 4), { text: 'a\n', caret: 2 });
  assert.equal(continueList('plain', 5), null);
  assert.equal(continueList('- milk', 3), null);
});
