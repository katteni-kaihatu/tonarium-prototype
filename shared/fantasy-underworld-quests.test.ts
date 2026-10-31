import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_UNDERWORLD_QUESTS } from './fantasy-underworld-quests.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { NPC_PUBLIC } from './npc.ts';
import { fantasyQuestInstitution } from './fantasy-institutions.ts';
import { FANTASY_TEMPLE_QUESTS } from './fantasy-temple-quests.ts';

test('finite authored underworld contracts reach the highest trust tier using real contacts and materials', () => {
  assert.ok(FANTASY_UNDERWORLD_QUESTS.length >= 14);
  assert.equal(new Set(FANTASY_UNDERWORLD_QUESTS.map(q => q.id)).size, FANTASY_UNDERWORLD_QUESTS.length);
  assert.ok(new Set(FANTASY_UNDERWORLD_QUESTS.map(q => q.issuer)).size >= 8);
  for (const q of FANTASY_UNDERWORLD_QUESTS) {
    assert.equal(fantasyQuestInstitution(q), 'underworld');
    assert.ok(NPC_PUBLIC.some(npc => npc.id === q.issuer && npc.homeLocation === q.giver));
    assert.ok(FANTASY_ITEMS.some(item => item.id === q.item));
    assert.ok(FANTASY_LOCATIONS.some(place => place.id === q.destination));
    for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(q.names?.[locale]); assert.ok(q.descriptions?.[locale]); assert.ok(q.dialogue?.[locale]); }
  }
});

test('temple work comes from real clergy and retains priest-only authored conditions', () => {
  assert.ok(FANTASY_TEMPLE_QUESTS.length >= 8);
  for (const q of FANTASY_TEMPLE_QUESTS) {
    assert.equal(fantasyQuestInstitution(q), 'temple'); assert.deepEqual(q.jobs, ['priest']);
    assert.ok(NPC_PUBLIC.some(npc => npc.id === q.issuer && npc.homeLocation === q.giver && npc.building === 'temple'));
    assert.ok(FANTASY_ITEMS.some(item => item.id === q.item));
    for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(q.names?.[locale]); assert.ok(q.dialogue?.[locale]); }
  }
});

test('finite service income exceeds the catalog cost of promised materials', () => {
  for (const q of [...FANTASY_UNDERWORLD_QUESTS, ...FANTASY_TEMPLE_QUESTS]) {
    const material = FANTASY_ITEMS.find(item => item.id === q.item)!;
    assert.ok(q.gold > material.price * q.count, `${q.id} must pay for materials and service`);
  }
});
