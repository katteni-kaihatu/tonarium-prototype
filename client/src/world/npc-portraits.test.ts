import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { NPC_PUBLIC } from '../../../shared/npc.ts';
import { npcIllustrationUrl } from '../../../shared/npc-portrait-illustrations.ts';
import { npcWardrobe } from '../../../shared/npc-wardrobe.ts';
import { NpcPortrait } from './NpcPortrait.tsx';

const manifest = JSON.parse(fs.readFileSync(new URL('../../../docs/npc-illustration-prompts.json', import.meta.url), 'utf8'));

test('every NPC renders its own upper-body illustration without an unrelated fallback face', () => {
  for (const npc of NPC_PUBLIC) {
    const html = renderToStaticMarkup(createElement(NpcPortrait, { npcId: npc.id }));
    assert.ok(html.includes(`src="${npcIllustrationUrl(npc.id)}"`), npc.id);
    assert.match(html, /class="npc-portrait npc-portrait-illustrated"/);
    assert.doesNotMatch(html, /<svg\b|npc-portraits\//);
  }
});

test('unknown and prototype-like NPC identities show a neutral initial instead of another portrait', () => {
  for (const npcId of ['missing-npc', '../rin', 'constructor', 'toString']) {
    const html = renderToStaticMarkup(createElement(NpcPortrait, { npcId }));
    assert.match(html, /npc-portrait-unavailable/);
    assert.doesNotMatch(html, /<img\b|<svg\b/);
    assert.ok(html.includes('?'));
  }
});

test('released illustration records retain the matching character identity and home wardrobe', () => {
  assert.deepEqual(manifest.portraits.map((record: { id: string }) => record.id).sort(), NPC_PUBLIC.map(npc => npc.id).sort());
  for (const npc of NPC_PUBLIC) {
    const record = manifest.portraits.find((record: { id: string }) => record.id === npc.id);
    for (const key of ['age', 'gender', 'race', 'homeLocation'] as const) assert.equal(record[key], npc[key], `${npc.id}: ${key}`);
    const wardrobe = npcWardrobe(npc);
    assert.equal(record.wardrobe?.culture ?? record.culture, wardrobe.culture, npc.id);
    assert.equal(record.wardrobe?.climate ?? record.climate, wardrobe.climate, npc.id);
    if (record.file) assert.equal(record.file, npcIllustrationUrl(npc.id));
    else assert.ok(record.result.output.endsWith(`${npc.id}.webp`), npc.id);
    assert.ok(record.prompt.length > 0, npc.id);
  }
});

test('home wardrobe distinguishes cold, hot and humid climates and defaults safely for unknown homes', () => {
  assert.equal(npcWardrobe({ homeLocation: 'mooncity' }).climate, 'cold');
  assert.equal(npcWardrobe({ homeLocation: 'saffron-port' }).climate, 'hot');
  assert.equal(npcWardrobe({ homeLocation: 'mossbrook' }).climate, 'humid');
  assert.equal(npcWardrobe({ homeLocation: 'missing' }).culture, 'western');
});
