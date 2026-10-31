import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ARTISANS, fantasyArtisansAt } from './fantasy-artisan-catalog.ts';
import { FANTASY_LIFE_JOBS } from './fantasy-careers.ts';
import { FANTASY_LOCATIONS, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_SETTLEMENTS, canAcquireJob, fantasyBuildings, fantasyCanCraft, fantasyCraftFacility } from './fantasy-town.ts';
import { fantasyFacilityActionError, fantasyFacilityOpen } from './fantasy-facility-hours.ts';
import { NPC_PUBLIC } from './npc.ts';
import { NPC_SERVER } from '../server/npc-catalog.ts';
import { NPC_ARTISAN_PRIVATE } from '../server/npc-artisan-profiles.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';

test('all sixteen production careers have distinct localized resident artisans at their grouped facility', () => {
  assert.ok(FANTASY_ARTISANS.length >= 16);
  assert.equal(new Set(FANTASY_ARTISANS.map(artisan => artisan.id)).size, FANTASY_ARTISANS.length);
  assert.deepEqual(new Set(FANTASY_ARTISANS.map(artisan => artisan.job)), new Set(FANTASY_LIFE_JOBS));
  for (const artisan of FANTASY_ARTISANS) {
    assert.ok(FANTASY_LOCATIONS.some(place => place.id === artisan.location));
    assert.equal(artisan.building, fantasyCraftFacility(artisan.job));
    assert.ok(Number.isSafeInteger(artisan.xp) && artisan.xp > 0);
    const building = fantasyBuildings({ location: artisan.location }).find(building => building.id === artisan.building)!;
    assert.ok(building?.npcIds.includes(artisan.id), artisan.id);
    const npc = NPC_PUBLIC.find(npc => npc.id === artisan.id)!;
    assert.deepEqual(npc.name, artisan.names);
    assert.equal(npc.race, artisan.race ?? 'human');
    assert.deepEqual(npc.trainableJobs, [artisan.job]);
    assert.equal(npc.travelOnly, undefined);
    assert.ok(canAcquireJob({ location: artisan.location, job: 'warrior' }, artisan.job, 'npc', artisan.id));
    assert.ok(!canAcquireJob({ location: 'greenwood', job: 'warrior' }, artisan.job, 'npc', artisan.id));
    for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(artisan.names[locale] && building.name[locale] && npc.role[locale] && npc.personality[locale] && npc.speech[locale] && npc.knownTopics[locale].length);
      const secret = NPC_ARTISAN_PRIVATE[artisan.id][locale];
      assert.ok(secret);
      assert.ok(!JSON.stringify(NPC_PUBLIC).includes(secret));
    }
    assert.ok(NPC_SERVER[artisan.id].privateSecrets[0].includes(NPC_ARTISAN_PRIVATE[artisan.id].en));
    if (artisan.job === 'shipwright') assert.equal(FANTASY_SETTLEMENTS[artisan.location].kind, 'port');
  }
  for (const locale of ['ko', 'en', 'ja'] as const) assert.equal(new Set(FANTASY_ARTISANS.map(artisan => NPC_PUBLIC.find(npc => npc.id === artisan.id)!.personality[locale])).size, FANTASY_ARTISANS.length);
});

test('grouped facilities preserve regional variety and night service boundaries', () => {
  const expected: Record<string, string[]> = {
    restaurant: ['cook', 'baker'], guild: ['blacksmith', 'carpenter', 'scribe'],
    merchantGuild: ['tailor', 'weaver', 'leatherworker', 'gemcutter', 'potter'],
    market: ['herbalist', 'farmer', 'fisher', 'merchant'], shipyard: ['shipwright'], tower: ['alchemist'],
  };
  for (const [building, jobs] of Object.entries(expected)) for (const job of jobs) assert.equal(fantasyCraftFacility(job), building);
  assert.ok(FANTASY_SETTLEMENTS['loom-village'].buildingIds.includes('merchantGuild'));
  assert.ok(!FANTASY_SETTLEMENTS.sunmeadow.buildingIds.includes('merchantGuild'));
  for (const hour of [0, 5.99, 18, 23]) {
    assert.equal(fantasyFacilityOpen('merchantGuild', hour), false);
    assert.equal(fantasyFacilityOpen('guild', hour), true);
    assert.equal(fantasyFacilityOpen('inn', hour), true);
  }
  for (const artisan of FANTASY_ARTISANS) assert.equal(fantasyFacilityOpen(artisan.building, 12), true);
});

test('local artisan results are independent snapshots and unknown places have none', () => {
  const artisan = FANTASY_ARTISANS[0], found = fantasyArtisansAt({ location: artisan.location });
  assert.ok(found.some(entry => entry.id === artisan.id));
  assert.ok(found.every(entry => entry.location === artisan.location));
  found[0].names.en = 'Changed'; found[0].xp = 0;
  assert.notEqual(fantasyArtisansAt({ location: artisan.location })[0].names.en, 'Changed');
  assert.ok(artisan.xp > 0);
  assert.deepEqual(fantasyArtisansAt({ location: 'greenwood' }), []);
});

test('crafting uses the active life career beside combat and supports legacy production characters', () => {
  for (const artisan of FANTASY_ARTISANS) {
    const recipe = FANTASY_RECIPES.find(recipe => recipe.job === artisan.job && !recipe.requiresBook && !recipe.requiresLocations && !recipe.output.startsWith('map-'));
    if (!recipe) continue; // Merchant earns through trade rather than a generic recipe.
    const c = { job: 'warrior', lifeJob: artisan.job, location: artisan.location, visited: [artisan.location], charted: [] };
    assert.equal(fantasyCanCraft(c, recipe), true, recipe.id);
    assert.equal(fantasyCanCraft({ ...c, job: artisan.job, lifeJob: undefined }, recipe), true, recipe.id);
    assert.equal(fantasyCanCraft({ ...c, lifeJob: 'merchant' }, recipe), false, recipe.id);
    assert.equal(fantasyCanCraft({ ...c, location: 'greenwood' }, recipe), false, recipe.id);
    assert.equal(fantasyCanCraft({ ...c, location: 'greenwood' }, recipe, true), true, recipe.id);
    assert.equal(canAcquireJob(c, artisan.job, 'gm'), false);
  }
  const c = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Two careers', gender: 'female', source: 'human' }, () => .5).profile.character!;
  c.job = 'warrior'; c.lifeJob = 'tailor'; c.location = 'suncourt'; c.hour = 22;
  const tailorRecipe = FANTASY_RECIPES.find(recipe => recipe.job === 'tailor')!;
  assert.ok(fantasyFacilityActionError(c, { type: 'craft', recipe: tailorRecipe.id }));
  c.lifeJob = 'blacksmith'; c.location = 'emberhall';
  const smithRecipe = FANTASY_RECIPES.find(recipe => recipe.job === 'blacksmith')!;
  assert.equal(fantasyFacilityActionError(c, { type: 'craft', recipe: smithRecipe.id }), undefined);
});
