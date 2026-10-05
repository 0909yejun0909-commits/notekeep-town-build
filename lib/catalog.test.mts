import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CATALOG, CATALOG_BY_ID, CATALOG_GROUPS, FURNITURE_ACTIONS, furnitureSheetUrl, FURNITURE_SHEETS, WALKABLE } from './catalog.ts';
import { FOOTPRINT, FURNITURE } from './types.ts';

test('ids are unique', () => {
  assert.equal(Object.keys(CATALOG_BY_ID).length, CATALOG.length);
});

test('every rect is whole tiles and matches the footprint', () => {
  for (const e of CATALOG) {
    const [, , w, h] = e.rect;
    assert.deepEqual([w / 16, h / 16], e.footprint, e.id);
    assert.ok(Number.isInteger(w / 16) && Number.isInteger(h / 16), e.id);
  }
});

test('every variant of a category shares one footprint, so swapping in place always fits', () => {
  const seen = new Map<string, string>();
  for (const e of CATALOG) {
    const fp = e.footprint.join('x');
    assert.equal(seen.get(e.category) ?? fp, fp, `${e.id} (${e.category})`);
    seen.set(e.category, fp);
  }
});

test('the default layout can still place every note-holder kind by its bare id', () => {
  for (const kind of FURNITURE) {
    if (kind === 'shelf') continue;
    assert.ok(CATALOG_BY_ID[kind], kind);
    assert.deepEqual(CATALOG_BY_ID[kind].footprint, FOOTPRINT[kind], kind);
  }
});

test('only square pieces can take a quarter turn', () => {
  for (const e of CATALOG) {
    if (e.rotations.includes(90)) assert.equal(e.footprint[0], e.footprint[1], e.id);
  }
});

test('every category sits in exactly one editor tab', () => {
  const tabs = new Map<string, string>();
  for (const g of CATALOG_GROUPS) {
    for (const c of g.categories) {
      assert.ok(!tabs.has(c), `${c} is in both ${tabs.get(c)} and ${g.id}`);
      tabs.set(c, g.id);
    }
  }
  for (const e of CATALOG) assert.ok(tabs.has(e.category), `${e.id} (${e.category}) has no tab`);
});

test('every furniture action belongs to a category the catalog actually sells', () => {
  for (const category of Object.keys(FURNITURE_ACTIONS)) {
    assert.ok(CATALOG.some((e) => e.category === category), category);
  }
});

// Sitting and lying put the player on the piece and redraw part of it on top, which only
// lines up with an upright sprite you can't walk through.
test('pieces with an action are solid and never quarter-turned', () => {
  for (const e of CATALOG) {
    if (!FURNITURE_ACTIONS[e.category]) continue;
    assert.ok(!WALKABLE.has(e.category), e.id);
    assert.ok(!e.rotations.includes(90) && !e.rotations.includes(270), e.id);
  }
});

test('chairs seat you, beds lie you down, wardrobes dress you', () => {
  assert.equal(FURNITURE_ACTIONS.chair, 'sit');
  assert.equal(FURNITURE_ACTIONS.sofa, 'sit');
  assert.equal(FURNITURE_ACTIONS.bed, 'lie');
  assert.equal(FURNITURE_ACTIONS.single_bed, 'lie');
  assert.equal(FURNITURE_ACTIONS.wardrobe, 'wardrobe');
  assert.equal(FURNITURE_ACTIONS.desk, undefined);
});

// The art is licensed and gitignored, so this only runs where install-assets.sh has been run.
test('every rect lies inside its sheet', { skip: !existsSync('public/assets/furniture/tables.png') }, () => {
  const size = new Map<string, [number, number]>();
  for (const sheet of FURNITURE_SHEETS) {
    const png = readFileSync(`public${furnitureSheetUrl(sheet)}`);
    size.set(furnitureSheetUrl(sheet), [png.readUInt32BE(16), png.readUInt32BE(20)]);
  }
  for (const e of CATALOG) {
    const [sw, sh] = size.get(e.sheetUrl)!;
    const [x, y, w, h] = e.rect;
    assert.ok(x >= 0 && y >= 0 && x + w <= sw && y + h <= sh, `${e.id} ${e.rect} outside ${sw}x${sh}`);
  }
});
