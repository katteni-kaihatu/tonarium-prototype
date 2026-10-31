import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFantasyWorld, applyFantasyAction, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_AMBUSH_CHANCE, FANTASY_AMBUSH_SLOT_HOURS, FANTASY_ESCORT_AMBUSH_CHANCE, fantasyAmbushChance, fantasyAmbushHit } from './fantasy-ambush.ts';
import { fantasyEncounterLogText, fantasyHostileEncounter, FANTASY_ESCORT_AMBUSH_ENCOUNTER } from './fantasy-encounters.ts';
import type { FantasyActivity } from './fantasy.ts';

function player() {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Ambush test', gender: 'female', source: 'human' }, () => .5).profile;
  profile.character!.gold = 80;
  return profile;
}

const plan = (seed: number, transport = 'foot'): FantasyActivity => ({
  action: { type: 'travel', destination: 'greenwood', transport }, startedAt: 8, endsAt: 12, seed,
});

test('the ambush slot is ten real seconds and the escort is checked more often', () => {
  assert.equal(FANTASY_AMBUSH_SLOT_HOURS * 12, 1);
  assert.equal(FANTASY_AMBUSH_CHANCE, .03);
  assert.ok(FANTASY_ESCORT_AMBUSH_CHANCE > FANTASY_AMBUSH_CHANCE);
  assert.equal(fantasyAmbushChance({ type: 'travel', destination: 'x', transport: 'escort' }), FANTASY_ESCORT_AMBUSH_CHANCE);
  assert.equal(fantasyAmbushChance({ type: 'travel', destination: 'x', transport: 'foot' }), FANTASY_AMBUSH_CHANCE);
  assert.equal(fantasyAmbushChance({ type: 'work' }), FANTASY_AMBUSH_CHANCE);
});

test('the first ambush lands on a slot boundary and its rolls are reproducible', () => {
  let seed = 0;
  for (; seed < 2000; seed++) if (fantasyAmbushHit(plan(seed), 12)) break;
  assert.ok(seed < 2000);
  const hit = fantasyAmbushHit(plan(seed), 12)!;
  assert.ok(hit.hour > 8 && hit.hour < 12);
  assert.ok(Math.abs((hit.hour - 8) / FANTASY_AMBUSH_SLOT_HOURS - Math.round((hit.hour - 8) / FANTASY_AMBUSH_SLOT_HOURS)) < 1e-9);
  assert.deepEqual(fantasyAmbushHit(plan(seed), 12), hit);
  assert.equal(fantasyAmbushHit(plan(seed), hit.hour - 1e-6), undefined);
  assert.equal(fantasyAmbushHit({ ...plan(seed), action: { type: 'work' } }, 12), undefined);
});

test('an ambush stops the journey at the origin and opens a hostile encounter', () => {
  let seed = 0;
  for (; seed < 2000; seed++) if (fantasyAmbushHit(plan(seed), 12)?.slot === 0) break;
  assert.ok(seed < 2000);
  const rngValue = (seed + .5) / 4294967296;
  const started = startFantasyActivity(player(), { type: 'travel', destination: 'greenwood', transport: 'foot' }, 8, () => rngValue);
  assert.equal(started.error, undefined);
  const activity = started.profile.activity!;
  assert.equal(activity.seed, seed);
  const hit = fantasyAmbushHit(activity, activity.endsAt)!;
  const done = advanceFantasyWorld(started.profile, activity.endsAt, { ambush: true }).profile;
  assert.equal(done.activity, undefined);
  assert.ok(done.event && fantasyHostileEncounter(done.event), 'a hostile encounter should be pending');
  assert.equal(done.character!.location, 'hearth');
  assert.equal(done.character!.hour, hit.hour);
  assert.ok(done.log.some(entry => entry.text === '移動中に襲撃を受け、足を止めた。'));
  assert.ok(done.log.some(entry => entry.text === '遭遇の発端［travel-ambush］。'));
});

test('an escort ambush is handed to the wagon battle instead of a plain road encounter', () => {
  let seed = 0;
  for (; seed < 2000; seed++) if (fantasyAmbushHit(plan(seed, 'escort'), 12)?.slot === 0) break;
  assert.ok(seed < 2000);
  const profile = player(), c = profile.character!;
  c.hour = 8;
  c.escort = { id: 'escort-hearth-greenwood-32', from: 'hearth', destination: 'greenwood', hours: 4, reward: 5, acceptedAt: 8, defense: 'cleared' };
  const activity: FantasyActivity = plan(seed, 'escort');
  const done = advanceFantasyWorld({ ...profile, activity }, activity.endsAt, { ambush: true }).profile;
  assert.equal(done.activity, undefined);
  assert.equal(done.event, FANTASY_ESCORT_AMBUSH_ENCOUNTER);
  assert.equal(fantasyHostileEncounter(done.event)?.opponent, 'person');
  assert.ok(done.log.some(entry => entry.text === '護送中の隊列が襲撃を受け、足を止めた。'));
  assert.ok(done.log.some(entry => entry.text === '遭遇の発端［escort-ambush］。'));
  for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyEncounterLogText('遭遇の発端［escort-ambush］。', locale));
});

test('without the ambush option a journey still arrives as before', () => {
  let seed = 0;
  for (; seed < 2000; seed++) if (fantasyAmbushHit(plan(seed), 12)?.slot === 0) break;
  const rngValue = (seed + .5) / 4294967296;
  const started = startFantasyActivity(player(), { type: 'travel', destination: 'greenwood', transport: 'foot' }, 8, () => rngValue);
  const arrived = advanceFantasyWorld(started.profile, started.profile.activity!.endsAt).profile;
  assert.equal(arrived.character!.location, 'greenwood');
  assert.equal(arrived.event, null);
  assert.equal(arrived.activity, undefined);
});
