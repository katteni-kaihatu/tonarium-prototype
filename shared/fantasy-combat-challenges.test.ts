import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_MAIN_QUESTS } from './fantasy-second-content.ts';
import { FANTASY_STORY_COMBATS, fantasyStoryCombatRequirement } from './fantasy-combat-stories.ts';
import { fantasyMainInvestigationError, fantasyMainStage } from './fantasy-main-trials.ts';
import { FANTASY_APEX_PROVOCATIONS, fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { fantasyCombatHuntOptions, fantasyCombatStartError, fantasyCombatStartPlan, validFantasyCombatProgress } from './fantasy-combat-challenges.ts';
import { FANTASY_ESCORT_AMBUSH_ENCOUNTER, fantasyHostileEncounter } from './fantasy-encounters.ts';
import { fantasyMonsterSiteForProvocation } from './fantasy-monster-sites.ts';
import { fantasyHuntTargets } from './fantasy-gathering.ts';
import { fantasyGmReply } from './fantasy-gm.ts';

function player(chapter = 1) {
  let p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Combat traveler', source: 'human', gender: 'female' }, () => .5).profile;
  const c = p.character!, quest = FANTASY_MAIN_QUESTS.find(quest => quest.chapter === chapter)!;
  c.completed = FANTASY_MAIN_QUESTS.filter(quest => quest.chapter! < chapter).map(quest => quest.id); c.level = 20; c.hour = 12;
  c.location = quest.giver; c.inventory.lantern = 1; c.combatStoryVersion = 1;
  const accepted = applyFantasyAction(p, { type: 'accept', quest: quest.id }); assert.equal(accepted.error, undefined); p = accepted.profile;
  p.character!.location = quest.destination; p.character!.visited = [...new Set([...p.character!.visited, quest.destination])]; return p;
}

test('eight intermittent main-story battles start early and never contain an apex opponent', () => {
  assert.equal(FANTASY_STORY_COMBATS.length, 8); assert.equal(FANTASY_STORY_COMBATS[0].quest, 'main-night-01');
  for (const combat of FANTASY_STORY_COMBATS) {
    let p = player(Number(combat.quest.slice(-2)));
    while (fantasyMainStage(p.character!, combat.quest)!.id !== combat.stage) {
      const stage = fantasyMainStage(p.character!, combat.quest)!, prior = fantasyStoryCombatRequirement(p.character!, combat.quest, stage.id);
      if (prior) (p.character!.combatVictories ??= {})[prior.key] = p.character!.hour;
      p.character!.location = stage.location; p.character!.buff = { effect: 'check', power: 40 };
      const result = applyFantasyAction(p, { type: 'investigate', quest: combat.quest, approach: 'analyze' }, () => .999);
      assert.equal(result.error, undefined); p = result.profile;
    }
    p.character!.location = fantasyMainStage(p.character!, combat.quest)!.location;
    const error = fantasyMainInvestigationError(p.character!, { type: 'investigate', quest: combat.quest, approach: 'observe' }); assert.ok(error);
    const plan = fantasyCombatStartPlan(p, 'story', combat.quest)!;
    assert.equal(plan.source, combat.key); assert.equal(plan.victoryKey, combat.key);
    const narrative = fantasyCombatEnemy(combat.enemy)!, actual = fantasyCombatEnemy(plan.enemies[0].template)!;
    if (narrative.tier <= 6) assert.equal(actual.id, narrative.id);
    else { assert.ok(actual.tier <= 6); assert.equal(actual.kind, narrative.kind); }
    assert.equal(fantasyCombatEnemy(combat.enemy)!.provocationOnly, false);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(combat.setup[locale]);
    (p.character!.combatVictories ??= {})[combat.key] = p.character!.hour;
    assert.equal(fantasyMainInvestigationError(p.character!, { type: 'investigate', quest: combat.quest, approach: 'observe' }), undefined);
    assert.equal(fantasyCombatStartPlan(p, 'story', combat.quest), undefined);
  }
});

test('legacy investigation rules remain valid while enabled characters must finish their own battle', () => {
  const p = player(), q = FANTASY_STORY_COMBATS[0];
  assert.ok(fantasyMainInvestigationError(p.character!, { type: 'investigate', quest: q.quest, approach: 'analyze' }));
  const other = structuredClone(p); other.character!.combatVictories = { [q.key]: other.character!.hour };
  assert.ok(fantasyMainInvestigationError(p.character!, { type: 'investigate', quest: q.quest, approach: 'analyze' }));
  delete p.character!.combatStoryVersion;
  assert.equal(fantasyMainInvestigationError(p.character!, { type: 'investigate', quest: q.quest, approach: 'analyze' }), undefined);
});

test('rank-seven and apex challenges require an earned site map, the actual site, a recent personal warning and explicit provocation', () => {
  for (const action of FANTASY_APEX_PROVOCATIONS) {
    let p = player(); p.character!.location = action.location; p.character!.visited.push(action.location);
    assert.ok(fantasyCombatStartError(p, 'apex', action.id, true));
    const site = fantasyMonsterSiteForProvocation(action.id)!; assert.ok(site);
    p.character!.inventory[site.item] = 1;
    const mapped = applyFantasyAction(p, { type: 'use', item: site.item }, () => .5);
    assert.equal(mapped.error, undefined, action.id); p = mapped.profile;
    const c = p.character!; assert.ok(c.monsterSites!.includes(site.id));
    assert.ok(fantasyCombatStartError(p, 'apex', action.id, true), 'a chart alone does not supply a recent personal warning');
    c.apexWarnings = { [action.id]: { location: c.location, hour: c.hour } };
    assert.ok(fantasyCombatStartError(p, 'apex', action.id, false));
    assert.equal(fantasyCombatStartError(p, 'apex', action.id, true), undefined);
    assert.equal(fantasyCombatStartPlan(p, 'apex', action.id)!.enemies[0].template, action.enemy);
    c.hour += 1.01; assert.ok(fantasyCombatStartError(p, 'apex', action.id, true));
    c.apexWarnings[action.id].hour = c.hour; c.combatVictories = { [`apex:${action.id}`]: c.hour };
    assert.ok(fantasyCombatStartError(p, 'apex', action.id, true));
    c.hour += 24; c.apexWarnings[action.id].hour = c.hour;
    assert.equal(fantasyCombatStartError(p, 'apex', action.id, true), undefined);
    assert.equal(validFantasyCombatProgress(c), true);
    c.location = 'hearth'; assert.ok(fantasyCombatStartError(p, 'apex', action.id, true));
  }
});

test('ordinary hunting never reveals or spawns tier-eight enemies across the whole map', () => {
  const p = player();
  for (const place of FANTASY_LOCATIONS) {
    p.character!.location = place.id;
    for (const enemy of fantasyCombatHuntOptions(p.character!)) assert.equal(enemy.provocationOnly, false);
    for (const enemy of fantasyHuntTargets(p.character!)) assert.ok(enemy.tier < 8);
    for (const action of FANTASY_APEX_PROVOCATIONS) assert.equal(fantasyCombatStartPlan(p, 'hunt', action.enemy), undefined);
  }
});

test('a criminal profession alone never begins combat and lawful opponents require the current hostile encounter', () => {
  const p = player(); p.character!.job = 'thief'; p.character!.jobXp.thief = 0; p.character!.location = 'hearth';
  assert.equal(p.combatId, undefined); assert.equal(p.event, null);
  assert.ok(fantasyCombatStartError(p, 'challenge', 'human-watch-patrol', false));
  assert.ok(fantasyCombatStartError(p, 'challenge', 'human-watch-patrol', true));
  const encountered = structuredClone(p); encountered.event = 'encounter-watch';
  assert.equal(fantasyCombatStartError(encountered, 'encounter', 'encounter-watch'), undefined);
  assert.equal(fantasyCombatEnemy(fantasyCombatStartPlan(encountered, 'encounter', 'encounter-watch')!.enemies[0].template)!.humanCause, 'crime-enforcement');
  const active = structuredClone(p); active.combatId = 'combat-local';
  assert.ok(applyFantasyAction(active, { type: 'work' }).error);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const reply = fantasyGmReply(active, 'What am I doing?', locale); assert.equal(reply.suggestions.length, 0); assert.ok(reply.text);
  }
});

test('an escort ambush plans the wagon battle while other encounters keep their own opponents', () => {
  const p = player(1), c = p.character!;
  c.location = 'hearth'; c.hour = 12; c.level = 5;
  const contract = { id: 'escort-hearth-sunmeadow-48', from: 'hearth', destination: 'sunmeadow', hours: 4, reward: 6, acceptedAt: 12, defense: 'pending' as const };
  c.escort = contract;
  const departing = fantasyCombatStartPlan(p, 'escort', contract.id)!;
  assert.equal(departing.source, `escort:${contract.id}`);
  const attacker = fantasyCombatEnemy(departing.enemies[0].template)!;
  assert.equal(attacker.kind, 'human'); assert.notEqual(attacker.humanCause, 'crime-enforcement'); assert.ok(attacker.tier <= 6); assert.equal(attacker.provocationOnly, false);
  assert.equal(fantasyCombatStartPlan(p, 'encounter', FANTASY_ESCORT_AMBUSH_ENCOUNTER), undefined, 'no ambush is pending yet');
  p.event = 'encounter-woodland-wolf';
  assert.equal(fantasyCombatStartPlan(p, 'escort', contract.id), undefined, 'another encounter never opens the wagon battle');
  p.event = FANTASY_ESCORT_AMBUSH_ENCOUNTER;
  assert.equal(fantasyCombatStartPlan(p, 'encounter', FANTASY_ESCORT_AMBUSH_ENCOUNTER)!.source, `escort:${contract.id}`);
  assert.equal(fantasyCombatStartError(p, 'encounter', FANTASY_ESCORT_AMBUSH_ENCOUNTER), undefined);
  assert.equal(fantasyCombatStartPlan(p, 'escort', 'escort-forged'), undefined);
  c.location = 'sunmeadow';
  assert.equal(fantasyCombatStartPlan(p, 'encounter', FANTASY_ESCORT_AMBUSH_ENCOUNTER), undefined);
});

test('generic hostile encounters choose deterministic suitable opponents from the current encounter tier without free challenge targets', () => {
  const p = player();
  const templates = new Set<string>();
  for (const tier of [1, 3, 6] as const) for (const event of ['encounter-woodland-wolf','encounter-goblin','encounter-ruin-skeleton','encounter-reef-beast','encounter-watch','encounter-bandits']) {
    p.character!.encounterTier = tier;
    p.event = event;
    const before = structuredClone(p), plan = fantasyCombatStartPlan(p, 'encounter', event)!, enemy = fantasyCombatEnemy(plan.enemies[0].template)!;
    assert.equal(plan.source, `encounter:${event}`); assert.equal(plan.enemies.length, 1);
    assert.equal(enemy.kind, fantasyHostileEncounter(event)!.opponent === 'person' ? 'human' : 'monster');
    assert.ok(enemy.tier <= 6); assert.equal(enemy.provocationOnly, false);
    if (event === 'encounter-watch') assert.equal(enemy.humanCause, 'crime-enforcement');
    else if (enemy.kind === 'human') assert.notEqual(enemy.humanCause, 'crime-enforcement');
    assert.deepEqual(fantasyCombatStartPlan(p, 'encounter', event), plan); assert.deepEqual(p, before);
    assert.equal(fantasyCombatStartPlan(p, 'encounter', 'unrelated-event'), undefined);
    templates.add(enemy.id);
  }
  assert.ok(templates.size >= 3);
  p.event = null; assert.equal(fantasyCombatStartPlan(p, 'encounter', 'encounter-watch'), undefined);
});
