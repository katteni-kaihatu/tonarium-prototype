import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FantasyCharacter, FantasyProfile, FantasyStats } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_RACES } from './fantasy-data.ts';
import { fantasyBodyTraits, fantasyContextBonus } from './fantasy-physiology.ts';
import { applyFantasyTerrain, FANTASY_TERRAIN_ACTIVITIES, fantasyTerrainActivities, fantasyTerrainAllowed, fantasyTerrainHours, fantasyTerrainText, type FantasyTerrainActivity, type FantasyTerrainContext } from './fantasy-terrain.ts';

const stats: FantasyStats = { hp: 100, mp: 40, strength: 10, agility: 10, intelligence: 10, luck: 10, vitality: 10, dexterity: 10, charisma: 10 };
function player(overrides: Partial<FantasyCharacter> = {}): FantasyProfile {
  return { version: 1, revision: 7, draft: { remaining: 5, candidate: null, kept: null }, event: null, log: [], character: {
    name: 'Terrain Tester', race: 'human', gender: 'female', job: 'unassigned', level: 1, xp: 0, gold: 35, hp: 100, mp: 40,
    location: 'hearth', hour: 12, fatigue: 0, hunger: 0, foodLots: [], charted: [], inventory: { lantern: 1 }, quests: [], completed: [], visited: ['hearth'], jobXp: {}, buff: null, ...overrides,
  } };
}
function witness(activity: FantasyTerrainActivity): FantasyProfile {
  const race = FANTASY_RACES.find(race => (!activity.races || activity.races.includes(race.id)) && (!activity.families || activity.families.includes(race.family)) && (!activity.traits || fantasyBodyTraits({ race: race.id }).some(trait => activity.traits!.includes(trait.id))))!;
  const location = FANTASY_LOCATIONS.find(place => (!activity.locations || activity.locations.includes(place.id)) && (!activity.kinds || activity.kinds.includes(place.kind)))!;
  assert.ok(race, `${activity.id}: race witness`); assert.ok(location, `${activity.id}: location witness`);
  return player({ race: race.id, job: activity.jobs?.[0] ?? 'unassigned', location: location.id, hour: activity.seasons?.includes('winter') ? 45 * 24 + 12 : 12 });
}
function context(success = true) {
  const checks: { stat: string; dc: number; sides?: number }[] = [], items: { id: string; count: number }[] = [], damage: number[] = [];
  const ctx: FantasyTerrainContext = {
    stats, check: (_profile, stat, dc, _label, _rng, sides) => { checks.push({ stat, dc, sides }); return success; },
    addItem: (profile, id, count) => { items.push({ id, count }); profile.character!.inventory[id] = (profile.character!.inventory[id] ?? 0) + count; },
    hurt: (profile, amount) => { damage.push(amount); profile.character!.hp = Math.max(0, profile.character!.hp - amount); },
  };
  return { ctx, checks, items, damage };
}

test('29 distinct terrain activities have complete localizations, valid references and bounded rewards', () => {
  assert.equal(FANTASY_TERRAIN_ACTIVITIES.length, 29);
  assert.equal(new Set(FANTASY_TERRAIN_ACTIVITIES.map(activity => activity.id)).size, 29);
  for (const activity of FANTASY_TERRAIN_ACTIVITIES) {
    for (const field of [activity.names, activity.descriptions, activity.successes, activity.failures]) for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(field[locale].trim());
    for (const id of activity.jobs ?? []) assert.ok(FANTASY_JOBS.some(job => job.id === id), id);
    for (const id of activity.races ?? []) assert.ok(FANTASY_RACES.some(race => race.id === id), id);
    for (const id of activity.locations ?? []) assert.ok(FANTASY_LOCATIONS.some(place => place.id === id), id);
    if (activity.reward) { assert.ok(FANTASY_ITEMS.some(item => item.id === activity.reward!.item)); assert.ok(activity.reward.count >= 1 && activity.reward.count <= 3); assert.ok(!['healing-idol', 'echo-pendant', 'ancient-aegis'].includes(activity.reward.item)); }
    assert.ok([8, 12, 20].includes(activity.sides)); assert.ok([1, 2].includes(activity.hours)); assert.ok(activity.reputation >= 0 && activity.reputation <= 2);
    assert.ok(fantasyTerrainAllowed(witness(activity).character!, activity), activity.id);
  }
});

test('ancestry, family, body and profession requirements gate the actual choices', () => {
  assert.equal(fantasyTerrainAllowed(player({ location: 'ironridge' }).character!, 'mineral-seam'), false);
  assert.equal(fantasyTerrainAllowed(player({ race: 'dwarf', location: 'ironridge' }).character!, 'mineral-seam'), true);
  assert.equal(fantasyTerrainAllowed(player({ race: 'goatkin', location: 'ironridge' }).character!, 'ledge-footing'), true);
  assert.equal(fantasyTerrainAllowed(player({ location: 'deepcave' }).character!, 'crevice-survey'), false);
  assert.equal(fantasyTerrainAllowed(player({ race: 'halfling', location: 'deepcave' }).character!, 'crevice-survey'), true);
  assert.equal(fantasyTerrainAllowed(player({ job: 'bard', location: 'greenwood' }).character!, 'street-performance'), false);
  assert.equal(fantasyTerrainAllowed(player({ job: 'bard', location: 'hearth' }).character!, 'street-performance'), true);
  assert.equal(fantasyTerrainAllowed(player({ job: 'cook', location: 'hearth' }).character!, 'field-ingredients'), false);
  assert.equal(fantasyTerrainAllowed(player({ job: 'cook', location: 'sunmeadow' }).character!, 'field-ingredients'), true);
  assert.equal(fantasyTerrainAllowed(player({ hp: 0, job: 'bard' }).character!, 'street-performance'), false);
});

test('winterflowers require the correct ancestry, snow pass and actual winter season', () => {
  const c = player({ race: 'frostfairy', location: 'frostpass' }).character!;
  assert.equal(fantasyTerrainAllowed(c, 'winterflower-picking'), false);
  c.hour = 45 * 24 + 12; assert.equal(fantasyTerrainAllowed(c, 'winterflower-picking'), true);
  c.race = 'human'; assert.equal(fantasyTerrainAllowed(c, 'winterflower-picking'), false);
  c.race = 'snow-elf'; c.location = 'greenwood'; assert.equal(fantasyTerrainAllowed(c, 'winterflower-picking'), false);
});

test('every successful activity delegates its die, food/item grant and body bonus without advancing the clock or granting duplicate practice', () => {
  for (const activity of FANTASY_TERRAIN_ACTIVITIES) {
    const profile = witness(activity), c = profile.character!, before = { hour: c.hour, revision: profile.revision, mp: c.mp };
    const { ctx, checks, items, damage } = context();
    const result = applyFantasyTerrain(profile, { type: 'terrain', activity: activity.id }, () => .8, ctx)!;
    assert.equal(result.profile, profile); assert.equal(result.changed, true); assert.equal(result.error, undefined, activity.id);
    assert.equal(c.hour, before.hour); assert.equal(profile.revision, before.revision); assert.equal(c.mp, before.mp - activity.mp);
    assert.deepEqual(checks, [{ stat: activity.stat, dc: activity.dc - (activity.bodyContext ? fantasyContextBonus(c, activity.bodyContext) : 0), sides: activity.sides }]);
    assert.deepEqual(items, activity.reward ? [{ id: activity.reward.item, count: activity.reward.count }] : []); assert.deepEqual(damage, []);
    assert.deepEqual(c.jobXp, {}); assert.equal(c.practice, undefined);
    if (activity.reputation) assert.ok((c.reputation?.regions[c.location] ?? 0) > 0);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyTerrainText(profile.log.at(-1)!.text, locale));
  }
});

test('failed checks spend the stated MP, grant no items or reputation, and delegate bounded injury', () => {
  const profile = player({ race: 'elf', location: 'greenwood' }), { ctx, items, damage } = context(false);
  const result = applyFantasyTerrain(profile, { type: 'terrain', activity: 'woodland-sense' }, () => 0, ctx)!;
  assert.equal(result.error, undefined); assert.equal(result.changed, true); assert.equal(profile.character!.mp, 36);
  assert.deepEqual(items, []); assert.deepEqual(damage, [2]); assert.equal(profile.character!.reputation, undefined); assert.equal(profile.log.at(-1)?.kind, 'failure');
  assert.ok(fantasyTerrainText(profile.log.at(-1)!.text, 'en')?.includes('withdrew'));
});

test('unknown, ineligible, dark and insufficient-MP actions fail before any mutation or roll', () => {
  const scenarios = [
    { profile: player(), id: '__proto__' },
    { profile: player(), id: 'woodland-sense' },
    { profile: player({ race: 'elf', location: 'greenwood', mp: 3 }), id: 'woodland-sense' },
    { profile: player({ race: 'elf', location: 'greenwood', hour: 23, inventory: {} }), id: 'woodland-sense' },
  ];
  for (const { profile, id } of scenarios) {
    const before = JSON.stringify(profile), { ctx, checks, items, damage } = context();
    const result = applyFantasyTerrain(profile, { type: 'terrain', activity: id }, () => .9, ctx)!;
    assert.ok(result.error); assert.equal(result.changed, false); assert.equal(JSON.stringify(profile), before);
    assert.deepEqual(checks, []); assert.deepEqual(items, []); assert.deepEqual(damage, []);
  }
});

test('hours are explicit metadata, filtered lists respect access, and unrelated actions are untouched', () => {
  assert.equal(fantasyTerrainHours({ type: 'terrain', activity: 'trail-reading' }), 1);
  assert.equal(fantasyTerrainHours({ type: 'terrain', activity: 'council-mediation' }), 2);
  assert.equal(fantasyTerrainHours({ type: 'terrain', activity: 'unknown' }), 0);
  assert.equal(fantasyTerrainHours({ type: 'explore' }), 0);
  const profile = player({ job: 'bard' });
  assert.ok(fantasyTerrainActivities(profile.character!).some(activity => activity.id === 'street-performance'));
  assert.ok(fantasyTerrainActivities(profile.character!).every(activity => fantasyTerrainAllowed(profile.character!, activity)));
  assert.equal(applyFantasyTerrain(profile, { type: 'sync' }, () => 0, context().ctx), undefined);
  assert.equal(fantasyTerrainText('future unknown message', 'en'), undefined);
});
