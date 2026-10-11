import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversation, helpFor, type NpcPage } from './npcHelp.ts';
import { DEMO_VAULT_NAME } from './vault/demo.ts';

test('only the tutorial town has NPCs that help', () => {
  assert.equal(helpFor('farmer_bob', 'Your town'), null);
  assert.ok(helpFor('farmer_bob', DEMO_VAULT_NAME));
});

test('the summary runs page by page, and the quiz counts right answers', () => {
  const help = helpFor('bartender_katy', DEMO_VAULT_NAME)!;
  let page: NpcPage | null = null;
  let ended = false;
  const say = (p: NpcPage) => (page = p);
  say(conversation(help, say, () => (ended = true)));
  const pick = (label: string) => page!.options!.find((o) => o.label === label)!.pick();

  pick('Sum up my notes');
  const lines = [page!.line];
  while (page!.next) {
    page!.next();
    lines.push(page!.line);
  }
  assert.deepEqual(lines.slice(0, -1), help.summary);
  assert.equal(page!.line, 'Anything else?');

  pick('Quiz me');
  help.quiz.forEach((q, i) => {
    assert.equal(page!.line, q.question);
    page!.options![i === 0 ? (q.answer + 1) % q.choices.length : q.answer].pick();
    assert.match(page!.line, i === 0 ? /^Not quite/ : /^Right!/);
    page!.next!();
  });
  assert.match(page!.line, new RegExp(`^You got ${help.quiz.length - 1} of ${help.quiz.length}`));
  page!.next!();
  pick('Bye');
  assert.equal(ended, true);
});
