import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BLOCKLIST, ENGINES, blockedBy, normalizeDomain, parseTarget } from './blocklist.ts';

const check = (input: string, list = DEFAULT_BLOCKLIST) => blockedBy(parseTarget(input)!, list);

test('normalizeDomain strips scheme, www, path and port', () => {
  assert.equal(normalizeDomain('https://www.YouTube.com/watch?v=1'), 'youtube.com');
  assert.equal(normalizeDomain('m.reddit.com:443/r/x'), 'm.reddit.com');
  assert.equal(normalizeDomain('not a domain'), null);
  assert.equal(normalizeDomain('localhost'), null);
});

test('parseTarget tells URLs from searches', () => {
  assert.deepEqual(parseTarget('wikipedia.org'), { kind: 'url', url: 'https://wikipedia.org', host: 'wikipedia.org' });
  assert.deepEqual(parseTarget('https://en.wikipedia.org/wiki/Cell'), { kind: 'url', url: 'https://en.wikipedia.org/wiki/Cell', host: 'en.wikipedia.org' });
  assert.deepEqual(parseTarget('cell biology'), { kind: 'search', query: 'cell biology' });
  assert.equal(parseTarget('   '), null);
  assert.deepEqual(parseTarget('javascript:alert(1)'), { kind: 'search', query: 'javascript:alert(1)' });
});

test('blocked domains and their subdomains', () => {
  assert.equal(check('youtube.com'), 'youtube.com');
  assert.equal(check('https://m.youtube.com/watch?v=1'), 'youtube.com');
  assert.equal(check('twitter.com'), 'x.com');
  assert.equal(check('youtu.be/abc'), 'youtube.com');
  assert.equal(check('notyoutube.com'), null);
});

test('searches naming a blocked site', () => {
  assert.equal(check('youtube cats'), 'youtube.com');
  assert.equal(check('Reddit: best study tips'), 'reddit.com');
  assert.equal(check('twitter elon'), 'x.com');
  assert.equal(check('instagram.com login'), 'instagram.com');
});

test('innocent searches are not blocked', () => {
  assert.equal(check('redditch weather'), null);
  assert.equal(check('x ray diffraction'), null);
  assert.equal(check('xylophone'), null);
  assert.equal(check('facebookish'), null);
});

test('a custom list replaces the defaults', () => {
  assert.equal(check('youtube cats', ['wikipedia.org']), null);
  assert.equal(check('wikipedia cells', ['wikipedia.org']), 'wikipedia.org');
  assert.equal(check('https://en.wikipedia.org', ['wikipedia.org']), 'wikipedia.org');
});

test('search engines build https URLs with the query encoded', () => {
  assert.equal(ENGINES.google.search('a&b c'), 'https://www.google.com/search?q=a%26b%20c');
  assert.ok(ENGINES.wikipedia.search('cell').startsWith('https://en.wikipedia.org/'));
  assert.ok(ENGINES.scholar.search('cell').startsWith('https://scholar.google.com/'));
});

test('dotted study terms are searches, not websites', () => {
  for (const q of ['node.js', 'chart.js', 'index.html', 'main.py']) assert.deepEqual(parseTarget(q), { kind: 'search', query: q });
  assert.equal(parseTarget('x.ai')?.kind, 'url');
  assert.equal(parseTarget('www.example.xyz')?.kind, 'url');
  assert.equal(parseTarget('khanacademy.org/math')?.kind, 'url');
});
