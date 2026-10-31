import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { fantasyBlackMarketDialogue } from './fantasy-black-market-dialogue.ts';
const resident = NPC_PUBLIC.find(npc => npc.building === 'residence')!;
function profile() { const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '噂を聞く人' }, () => .99).profile; const c = p.character!; c.location = resident.homeLocation; c.reputation = { lands: {}, regions: {}, towns: { [c.location]: 20 } }; return p; }
test('explicit local requests yield an authoritative learn command in all three languages', () => {
  const p = profile();
  for (const [locale, query] of [['ko', '암시장이 어디 있는지 알려줘'], ['en', 'Can you tell me where the black market is?'], ['ja', '闇市の場所を教えてください']] as const) {
    const response = fantasyBlackMarketDialogue(p, resident.id, query, locale); assert.equal(response.handled, true); assert.deepEqual(response.command, { type: 'blackMarketLearn', npc: resident.id }); assert.ok(response.text);
    assert.doesNotMatch(response.text!, /15|threshold|조건|閾値/);
  }
  assert.equal(p.character!.blackMarketClues, undefined);
});
test('a trusted resident can reveal the clue through an explicit request for local rumors without requiring its secret name', () => {
  const p = profile();
  for (const [locale, query] of [['ko', '이 마을에 소문이 있나요?'], ['en', 'Any local rumors?'], ['ja', 'この町の噂を教えてください']] as const) assert.equal(fantasyBlackMarketDialogue(p, resident.id, query, locale).command?.type, 'blackMarketLearn');
});
test('greetings, unrelated speech, definitions and other locations never grant a clue', () => {
  const p = profile();
  for (const query of ['Hello', 'How is the weather?', 'What is a black market?', 'I am not interested in the black market']) assert.equal(fantasyBlackMarketDialogue(p, resident.id, query, 'en').handled, false);
  p.character!.location = 'starspire'; assert.equal(fantasyBlackMarketDialogue(p, resident.id, 'Where is the black market?', 'en').handled, false);
});
test('insufficient town trust and previously learned clues produce honest prose without another mutation command', () => {
  const p = profile(); p.character!.reputation!.towns[p.character!.location] = 0;
  const denied = fantasyBlackMarketDialogue(p, resident.id, 'Where is the black market?', 'en'); assert.equal(denied.handled, true); assert.equal(denied.command, undefined); assert.ok(denied.text);
  p.character!.reputation!.towns[p.character!.location] = 20; p.character!.blackMarketClues = [p.character!.location];
  const known = fantasyBlackMarketDialogue(p, resident.id, 'Where is the black market?', 'en'); assert.equal(known.handled, true); assert.equal(known.command, undefined); assert.match(known.text!, /sign/);
});
