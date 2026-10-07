import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteFreq, parsePattern, stepSeconds, stepsPerBar } from './music.ts';
import { TRACKS } from './tracks.ts';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);

test('noteFreq tunes A4 to 440 and handles sharps, flats and octaves', () => {
  close(noteFreq('A4'), 440);
  close(noteFreq('A3'), 220);
  close(noteFreq('C4'), 261.63);
  close(noteFreq('C#5'), 554.37);
  close(noteFreq('Bb3'), 233.08);
  assert.throws(() => noteFreq('H4'));
});

test('parsePattern lays tokens out in steps, with rests, holds, chords and hits', () => {
  const p = parsePattern('E5*2 . | C4+E4 x*3');
  assert.equal(p.length, 7);
  assert.equal(p.events.length, 3);
  assert.deepEqual(p.events.map((e) => [e.step, e.len]), [[0, 2], [3, 1], [4, 3]]);
  assert.equal(p.events[1].freqs.length, 2);
  assert.deepEqual(p.events[2].freqs, []);
  assert.throws(() => parsePattern('E5*0'));
});

test('step timing follows tempo and subdivision', () => {
  close(stepSeconds({ bpm: 120, div: 2 }), 0.25);
  assert.equal(stepsPerBar({ div: 2, beats: 3 }), 6);
});

test('every part of every track parses and fills whole bars', () => {
  for (const [place, track] of Object.entries(TRACKS)) {
    const bar = stepsPerBar(track);
    const lengths = track.parts.map((part) => parsePattern(part.pattern).length);
    lengths.forEach((len, i) => assert.equal(len % bar, 0, `${place} part ${i} is ${len / bar} bars`));
    const loop = Math.max(...lengths);
    lengths.forEach((len, i) => assert.equal(loop % len, 0, `${place} part ${i} doesn't divide the ${loop / bar}-bar loop`));
    const seconds = loop * stepSeconds(track);
    assert.ok(seconds >= 40 && seconds <= 95, `${place} loops every ${seconds.toFixed(0)}s`);
  }
});
