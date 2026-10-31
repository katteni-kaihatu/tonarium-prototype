import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';
import { applyFantasyAction, advanceFantasyWorld, fantasyActionHours, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_EVENTS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_ESCORT_AMBUSH_ENCOUNTER, FANTASY_HOSTILE_ENCOUNTERS, fantasyCovertWork, fantasyEncounterChoiceStat, fantasyEncounterFor, fantasyEncounterLogText, fantasyFailedEventPursuit, fantasyHostileEncounter } from './fantasy-encounters.ts';
import { fantasyTerrainAllowed } from './fantasy-terrain.ts';
import { FantasyStore } from '../server/fantasy-store.ts';

function player(location = 'greenwood', job = 'unassigned'): FantasyProfile {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Encounter tester', gender: 'female', source: 'human' }, () => .5).profile;
  Object.assign(profile.character!, { location, job, hour: 8, lifeStartedAt: 8, birthBonuses: {}, hp: 100, mp: 50, inventory: { lantern: 1 }, foodLots: [], jobXp: { [job]: 0 }, hunger: 0, fatigue: 0 });
  profile.character!.visited = [...new Set(['hearth', location])];
  profile.log = [];
  return profile;
}
const pending = (id = 'encounter-woodland-wolf', location = 'greenwood') => { const profile = player(location); profile.event = id; return profile; };
const eventAction = (profile: FantasyProfile, choice: string, rng = () => .999) => applyFantasyAction(profile, { type: 'event', choice }, rng);

test('seven explicit encounters are registered once, localized and offer speech only to people', () => {
  assert.equal(FANTASY_HOSTILE_ENCOUNTERS.length, 7);
  for (const event of FANTASY_HOSTILE_ENCOUNTERS) {
    assert.equal(FANTASY_EVENTS.filter(value => value.id === event.id).length, 1);
    assert.equal(event.choices.some(choice => choice.id === 'talk'), event.opponent === 'person');
    assert.deepEqual(event.choices.slice(0, 2).map(choice => choice.id), ['fight', 'escape']);
    for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(event.names![locale] && event.descriptions![locale]);
      for (const choice of event.choices) {
        assert.ok(choice.labels![locale] && choice.successes![locale] && choice.failures![locale]);
        for (const won of ['成功', '失敗']) assert.ok(fantasyEncounterLogText(`遭遇［${event.id}］${choice.id}：${won}。`, locale));
      }
      assert.ok(fantasyEncounterLogText(`${event.name}：${event.description}`, locale) === undefined);
    }
  }
  assert.equal(fantasyEncounterFor('forest', 'escape-failed').id, 'encounter-woodland-wolf');
  assert.equal(fantasyEncounterFor('cave', 'escape-failed').id, 'encounter-goblin');
  assert.equal(fantasyEncounterFor('ruin', 'escape-failed').id, 'encounter-ruin-skeleton');
  assert.equal(fantasyEncounterFor('island', 'escape-failed').id, 'encounter-reef-beast');
  assert.equal(fantasyEncounterFor('city', 'stealth-failed', true).id, 'encounter-watch');
  for (const kind of ['city', 'forest', 'cave', 'coast'] as const) assert.equal(fantasyEncounterFor(kind, 'escort-ambush').id, FANTASY_ESCORT_AMBUSH_ENCOUNTER);
  for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyEncounterLogText('遭遇の発端［escort-ambush］。', locale));
});

test('failed exploration escape opens a pending encounter instead of resolving an invisible fight', () => {
  const profile = player(), original = structuredClone(profile);
  const result = applyFantasyAction(profile, { type: 'explore' }, () => 0);
  assert.equal(result.error, undefined);
  assert.equal(result.profile.event, 'encounter-woodland-wolf');
  assert.ok(result.profile.log.some(log => log.text.includes('危険からの回避') && log.text.endsWith('失敗')));
  assert.equal(result.profile.log.some(log => log.text.includes('魔物との小競り合い')), false);
  assert.equal(result.profile.character!.hp, 100);
  assert.deepEqual(profile, original);
  assert.equal(fantasyHostileEncounter(applyFantasyAction(profile, { type: 'explore' }, () => .999).profile.event), undefined);
});

test('covert scouting is universal, warns about risk, and failure can confront people or monsters', () => {
  for (const job of ['unassigned', 'cook', 'warrior', 'thief']) {
    const profile = player('hearth', job);
    assert.equal(fantasyTerrainAllowed(profile.character!, 'stealth-scout'), true);
    const result = applyFantasyAction(profile, { type: 'terrain', activity: 'stealth-scout' }, () => 0);
    assert.equal(result.error, undefined);
    assert.equal(result.profile.event, job === 'thief' ? 'encounter-watch' : 'encounter-bandits');
  }
  assert.equal(applyFantasyAction(player('oldwatch'), { type: 'terrain', activity: 'stealth-scout' }, () => 0).profile.event, 'encounter-ruin-skeleton');
  const successful = applyFantasyAction(player(), { type: 'terrain', activity: 'stealth-scout' }, () => .999);
  assert.equal(successful.profile.event, null);
  assert.deepEqual(successful.profile.character!.inventory, { lantern: 1 });
  assert.equal(fantasyCovertWork('carpenter'), false);
  assert.equal(fantasyCovertWork('crimeboss'), false);
  assert.equal(fantasyFailedEventPursuit('merchant-bandits', 'escape'), true);
  assert.equal(fantasyFailedEventPursuit('blacksmith-repair', 'precise'), false);
  assert.equal(fantasyFailedEventPursuit('spy-record', 'careful'), false);
  const ordinary = applyFantasyAction(player('ironridge', 'blacksmith'), { type: 'terrain', activity: 'ore-sorting' }, () => 0);
  assert.equal(ordinary.profile.event, null);
  let rolls = 0;
  const unseen = applyFantasyAction(player('hearth'), { type: 'terrain', activity: 'stealth-scout' }, () => rolls++ === 0 ? 0 : .99);
  assert.equal(unseen.profile.event, null, 'a failed covert check does not always cause an encounter');
  const craftWork = applyFantasyAction(player('hearth', 'cook'), { type: 'work' }, () => 0);
  assert.equal(fantasyHostileEncounter(craftWork.profile.event), undefined, 'ordinary failed work cannot draw from the encounter catalog');
});

test('explicit failed escape and covert crime work can cause pursuit without replacing it with a random event', () => {
  const merchant = player('hearth', 'merchant'); merchant.event = 'merchant-bandits';
  assert.equal(eventAction(merchant, 'escape', () => 0).profile.event, 'encounter-bandits');
  const worker = player('hearth', 'thief');
  assert.equal(applyFantasyAction(worker, { type: 'work' }, () => 0).profile.event, 'encounter-watch');
  let chosen: FantasyProfile | undefined;
  for (let seed = 1; seed < 40; seed++) {
    const reserved = startFantasyActivity(worker, { type: 'work' }, 8, () => seed / 40).profile;
    const done = advanceFantasyWorld(reserved, 12).profile;
    if (done.event !== 'encounter-watch') continue;
    let frequent = reserved;
    for (let hour = 8.25; hour <= 12; hour += .25) frequent = advanceFantasyWorld(frequent, hour).profile;
    assert.deepEqual(frequent, done);
    assert.equal(done.activity, undefined);
    chosen = done; break;
  }
  assert.ok(chosen, 'a failed final covert-work step can start a pursuit');
});

test('pending threats block unrelated activities but retain emergency item and skill use', () => {
  const profile = pending(); profile.character!.inventory.potion = 2; profile.character!.hp = 40;
  const blocked: FantasyAction[] = [{ type: 'work' }, { type: 'explore' }, { type: 'rest' }, { type: 'lodge', room: 'common' },
    { type: 'eat', meal: 'simple' }, { type: 'terrain', activity: 'stealth-scout' }, { type: 'travel', destination: 'hearth', transport: 'foot' }];
  for (const action of blocked) { const result = applyFantasyAction(profile, action); assert.ok(result.error, action.type); assert.deepEqual(result.profile, profile); }
  const recovered = applyFantasyAction(profile, { type: 'use', item: 'potion' }).profile;
  assert.equal(recovered.event, profile.event); assert.ok(recovered.character!.hp > 40);
  const prepared = applyFantasyAction(profile, { type: 'skill', skill: 'human-ingenuity' });
  assert.equal(prepared.error, undefined); assert.equal(prepared.profile.event, profile.event);
  assert.ok(eventAction(profile, 'talk').error); assert.ok(eventAction(profile, 'forged-choice').error);
});

test('failed fight and escape retain the threat, cost health and grant no repeatable gold or completion XP', () => {
  let profile = pending();
  for (const choice of ['fight', 'escape', 'fight']) {
    const before = profile.character!, result = eventAction(profile, choice, () => 0);
    assert.equal(result.error, undefined); assert.equal(result.profile.event, profile.event);
    assert.ok(result.profile.character!.hp < before.hp);
    assert.equal(result.profile.character!.xp, before.xp); assert.equal(result.profile.character!.gold, before.gold);
    assert.deepEqual(result.profile.character!.jobXp, before.jobXp);
    profile = result.profile;
  }
  const won = eventAction(profile, 'fight').profile;
  assert.equal(won.event, null); assert.equal(won.character!.xp, 6); assert.equal(won.character!.gold, profile.character!.gold);
  assert.ok(eventAction(won, 'fight').error); assert.equal(eventAction(won, 'fight').profile.character!.xp, 6);
  const fled = eventAction(pending(), 'escape').profile;
  assert.equal(fled.event, null); assert.equal(fled.character!.xp, 2);
  const human = pending('encounter-bandits', 'hearth'), talked = eventAction(human, 'talk').profile;
  assert.equal(talked.event, null); assert.equal(talked.character!.xp, 2);
  const resisted = eventAction(pending('encounter-watch', 'hearth'), 'fight').profile;
  assert.equal(resisted.character!.notoriety, 5);
});

test('encounter checks use equipped bow agility and preserve hunger, fatigue and death rules', () => {
  const bow = pending(); bow.character!.inventory['oak-bow'] = 1; bow.character!.equipment = { weapon: 'oak-bow' };
  bow.character!.birthBonuses = { agility: 20, strength: -8 };
  assert.equal(fantasyEncounterChoiceStat(bow.event, 'fight', 'agility'), 'agility');
  assert.equal(eventAction(bow, 'fight', () => .5).profile.event, null);
  const fresh = pending('encounter-bandits', 'hearth'), tired = structuredClone(fresh);
  tired.character!.fatigue = 100; tired.character!.hunger = 100;
  assert.equal(eventAction(fresh, 'escape', () => .7).profile.event, null);
  assert.equal(eventAction(tired, 'escape', () => .7).profile.event, 'encounter-bandits');
  const remote = pending('encounter-ruin-skeleton', 'oldwatch'); remote.character!.hp = 1;
  const died = eventAction(remote, 'fight', () => 0).profile;
  assert.ok(died.death); assert.equal(died.event, null); assert.equal(died.character!.hp, 0); assert.equal(died.pastLives!.length, 1);
  const town = pending('encounter-watch', 'hearth'); town.character!.hp = 1;
  const rescued = eventAction(town, 'escape', () => 0).profile;
  assert.equal(rescued.death, undefined); assert.equal(rescued.event, null); assert.ok(rescued.character!.hp > 0);
  assert.equal(rescued.log.some(log => log.text.startsWith('遭遇［') && log.text.includes('失敗')), false, 'a completed rescue must not be followed by a still-blocked encounter message');
});

test('global clock scheduling and saved encounters preserve state without granting validation-time rewards', t => {
  const profile = pending(), snapshot = structuredClone(profile);
  assert.equal(fantasyActionHours(profile, { type: 'event', choice: 'escape' }), .5);
  const started = startFantasyActivity(profile, { type: 'event', choice: 'escape' }, 8, () => .9).profile;
  assert.equal(started.activity!.endsAt, 8.5); assert.equal(started.event, profile.event);
  assert.equal(started.character!.xp, profile.character!.xp); assert.deepEqual(profile, snapshot);
  assert.equal(advanceFantasyWorld(started, 8.49).profile.event, profile.event);
  const finished = advanceFantasyWorld(started, 8.5).profile;
  assert.equal(finished.activity, undefined);
  const unchanged = advanceFantasyWorld(finished, 8.5);
  assert.equal(unchanged.changed, false); assert.deepEqual(unchanged.profile, finished);
  const prefix = path.join(os.tmpdir(), 'tonarium-encounter-'), dir = fs.mkdtempSync(prefix), file = path.join(dir, 'fantasy.json');
  t.after(() => { if (!path.resolve(dir).startsWith(path.resolve(prefix))) throw Error('Unexpected test path'); fs.rmSync(dir, { recursive: true, force: true }); });
  fs.writeFileSync(file, JSON.stringify({ traveler: profile }));
  const store = new FantasyStore(file, { worldHour: () => 8, onError: error => { throw error; } });
  assert.equal(store.profile('traveler').event, profile.event);
  for (const place of FANTASY_LOCATIONS) assert.ok(fantasyEncounterFor(place.kind, 'escape-failed'));
});
