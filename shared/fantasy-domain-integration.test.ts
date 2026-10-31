import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, fantasyActionHours, newFantasyProfile, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';
import { FANTASY_QUESTS, FANTASY_RECIPES } from './fantasy-data.ts';
import { validFantasyFishing } from './fantasy-gathering.ts';
import { validFantasyGear } from './fantasy-equipment.ts';
import type { FantasyContractGrant } from './fantasy-contracts.ts';

const high = () => 0.999;
const player = () => applyFantasyAction(newFantasyProfile(), { type: 'create', name: '統合の旅人', source: 'human', gender: 'female' }, high).profile;

test('a named monster produces its recorded carcass and skinning grants that hide exactly once', () => {
  const p = player(), c = p.character!; c.location = 'greenwood'; c.visited.push('greenwood'); c.job = 'hunter'; c.jobXp.hunter = 0;
  const hunted = applyFantasyAction(p, { type: 'hunt', monster: 'monster-forest-wolf' }, high);
  assert.equal(hunted.error, undefined);
  const next = hunted.profile;
  assert.equal(next.character!.lastHunt!.id, 'monster-forest-wolf'); assert.equal(next.character!.lastHunt!.success, true);
  assert.equal(next.character!.carcass!.hide, 'wolf-hide'); assert.equal(validFantasyFishing(next.character!), true);
  assert.ok(next.log.some(log => /d20=/.test(log.text)));
  const skinned = applyFantasyAction(next, { type: 'skin' }, high);
  assert.equal(skinned.error, undefined); assert.ok(skinned.profile.character!.inventory['wolf-hide'] > 0);
  assert.ok(skinned.profile.log.some(log => /d8=/.test(log.text))); assert.equal(skinned.profile.character!.carcass, undefined);
  assert.equal(applyFantasyAction(skinned.profile, { type: 'skin' }, high).changed, false);
  const forged = structuredClone(skinned.profile.character!); forged.lastHunt!.id = 'monster-elder-dragon';
  assert.equal(validFantasyFishing(forged), false);
});

test('crafting records one quality instance per output and consumes a real gem for every copy', () => {
  const p = player(), c = p.character!, recipe = FANTASY_RECIPES.find(recipe => recipe.id === 'forge-spear')!;
  c.job = 'blacksmith'; c.jobXp.blacksmith = 600; c.location = 'emberhall'; c.visited.push('emberhall');
  c.inventory = { ...c.inventory, ...recipe.inputs, 'starsteel-ingot': 2, ruby: 10 };
  c.buff = { effect: 'reward', power: 2 };
  const result = applyFantasyAction(p, { type: 'craft', recipe: recipe.id, material: 'starsteel-ingot', gem: 'ruby' }, high);
  assert.equal(result.error, undefined);
  const made = result.profile.character!.inventory[recipe.output];
  assert.equal(made, recipe.count + 2); assert.equal(result.profile.character!.gear!.length, made);
  assert.equal(result.profile.character!.inventory.ruby, 10 - made); assert.equal(result.profile.character!.inventory['starsteel-ingot'], 0);
  assert.ok(result.profile.character!.gear!.every(gear => gear.material === 'starsteel-ingot' && gear.gem === 'ruby'));
  assert.equal(validFantasyGear(result.profile.character!), true);
  assert.equal(p.character!.inventory.ruby, 10);
});

test('trusted hunt contracts use authoritative progress, do not consume placeholder items and reward only once', () => {
  const p = player(), c = p.character!, quest = FANTASY_QUESTS.find(quest => quest.id === 'group-goblin-raiders')!;
  c.guildProgress={version:1,grade:1,completedAtGrade:0,creditedQuests:[]};
  const grant: FantasyContractGrant = { offerId: 'offer-test-hunt', issuer: 'rin', boardLocation: c.location, acceptedAt: c.hour, expiresAt: c.hour + 48, progress: 0, gold: quest.gold + 10 };
  const action = { type: 'accept', quest: quest.id, offer: grant.offerId } as const;
  assert.equal(applyFantasyAction(p, action, high).changed, false);
  const accepted = applyFantasyAction(p, action, high, { contract: grant }); assert.equal(accepted.error, undefined);
  assert.equal(applyFantasyAction(accepted.profile, { type: 'complete', quest: quest.id }, high).changed, false);
  accepted.profile.character!.contracts![quest.id].progress = quest.objective!.count;
  const ore = accepted.profile.character!.inventory.ore, gold = accepted.profile.character!.gold;
  const completed = applyFantasyAction(accepted.profile, { type: 'complete', quest: quest.id }, high);
  assert.equal(completed.error, undefined); assert.equal(completed.profile.character!.inventory.ore, ore);
  assert.equal(completed.profile.character!.gold, gold + grant.gold); assert.equal(completed.profile.character!.contracts![quest.id], undefined);
  assert.equal(applyFantasyAction(completed.profile, { type: 'complete', quest: quest.id }, high).changed, false);
  const expired = structuredClone(accepted.profile); expired.character!.hour = grant.expiresAt;
  assert.equal(applyFantasyAction(expired, { type: 'complete', quest: quest.id }, high).changed, false);
  const abandoned = applyFantasyAction(expired, { type: 'abandon', quest: quest.id }, high);
  assert.equal(abandoned.error, undefined); assert.equal(abandoned.profile.character!.contracts![quest.id], undefined);
});

test('terrain activity waits for completion, uses its actual dice and credits practice and effective MP once', () => {
  const p = player(), c = p.character!; c.location = 'reedfen'; c.visited.push('reedfen'); c.job = 'alchemist'; c.jobXp.alchemist = 0;
  const action = { type: 'terrain', activity: 'marsh-reagent' } as const;
  assert.equal(fantasyActionHours(p, action), 1);
  const inventory = { ...c.inventory }, mp = c.mp;
  const pending = startFantasyActivity(p, action, c.hour, high);
  assert.equal(pending.error, undefined); assert.deepEqual(pending.profile.character!.inventory, inventory); assert.equal(pending.profile.character!.mp, mp);
  const done = advanceFantasyWorld(pending.profile, pending.profile.activity!.endsAt);
  assert.equal(done.error, undefined); assert.equal(done.profile.activity, undefined);
  assert.equal(done.profile.character!.mp, mp - 3); assert.equal(done.profile.character!.mana!.useXp, 3);
  assert.equal(done.profile.character!.practice!.gather, 1); assert.ok(done.profile.log.some(log => /d12=/.test(log.text)));
  const reloaded = advanceFantasyWorld(structuredClone(done.profile), done.profile.character!.hour);
  assert.equal(reloaded.changed, false); assert.equal(reloaded.profile.character!.mana!.useXp, 3);
});
