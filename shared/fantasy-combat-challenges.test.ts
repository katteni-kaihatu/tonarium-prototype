import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_MAIN_QUESTS } from './fantasy-second-content.ts';
import { FANTASY_STORY_COMBATS, fantasyStoryCombatRequirement } from './fantasy-combat-stories.ts';
import { fantasyMainInvestigationError, fantasyMainStage } from './fantasy-main-trials.ts';
import { FANTASY_APEX_PROVOCATIONS, fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { fantasyCombatHuntOptions, fantasyCombatStartError, fantasyCombatStartPlan, validFantasyCombatProgress } from './fantasy-combat-challenges.ts';
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
    assert.equal(plan.source, combat.key); assert.equal(plan.victoryKey, combat.key); assert.equal(plan.enemies[0].template, combat.enemy);
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

test('apex challenges require the actual site, a recent personal warning and explicit provocation', () => {
  for (const action of FANTASY_APEX_PROVOCATIONS) {
    const p = player(), c = p.character!; c.location = action.location; c.visited.push(action.location);
    assert.ok(fantasyCombatStartError(p, 'apex', action.id, true));
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

test('a criminal profession alone never begins combat and lawful opponents require an explicit challenge', () => {
  const p = player(); p.character!.job = 'thief'; p.character!.jobXp.thief = 0; p.character!.location = 'hearth';
  assert.equal(p.combatId, undefined); assert.equal(p.event, null);
  assert.ok(fantasyCombatStartError(p, 'challenge', 'human-watch-patrol', false));
  assert.equal(fantasyCombatStartError(p, 'challenge', 'human-watch-patrol', true), undefined);
  const active = structuredClone(p); active.combatId = 'combat-local';
  assert.ok(applyFantasyAction(active, { type: 'work' }).error);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const reply = fantasyGmReply(active, 'What am I doing?', locale); assert.equal(reply.suggestions.length, 0); assert.ok(reply.text);
  }
});

test('hostile encounters preserve their actual opponents rather than replacing a waterside crab with a goblin', () => {
  const p = player();
  for (const [event, enemy] of [['encounter-woodland-wolf','monster-forest-wolf'],['encounter-goblin','monster-goblin-raider'],['encounter-ruin-skeleton','monster-skeleton-guard'],['encounter-reef-beast','monster-reef-crab'],['encounter-watch','human-watch-patrol'],['encounter-bandits','human-road-bandit']]) {
    p.event = event;
    assert.equal(fantasyCombatStartPlan(p, 'encounter', event)!.enemies[0].template, enemy);
  }
});
