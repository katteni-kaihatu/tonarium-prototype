import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';
import { FANTASY_MAIN_QUESTS } from './fantasy-second-content.ts';
import { applyFantasyAction, fantasyActionHours, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { fantasyMainReady, fantasyMainStage, fantasyMainTrial } from './fantasy-main-trials.ts';
import { FANTASY_FINAL_ISLE_ID, fantasyIsleAccess } from './fantasy-isle-access.ts';
import { FANTASY_VOYAGE_FINAL_QUEST, fantasyVoyageEnding, validFantasyVoyageEnding } from './fantasy-voyage-ending.ts';
import { reconcileFoodLots } from './fantasy-life.ts';
import { recordFantasyDeath } from './fantasy-mortality.ts';
import { FantasyStore, isFantasyAction } from '../server/fantasy-store.ts';

const high = () => .999;
const mains = [...FANTASY_MAIN_QUESTS].sort((a, b) => a.chapter! - b.chapter!);
const visit = (p: FantasyProfile, location: string) => { p.character!.location = location; if (!p.character!.visited.includes(location)) p.character!.visited.push(location); };
function player(chapter = 18): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Voyager', gender: 'female', source: 'human' }, () => .5).profile;
  const c = p.character!, quest = mains[chapter - 1];
  c.birthBonuses = {}; c.completed = mains.slice(0, chapter - 1).map(quest => quest.id); c.inventory.lantern = 1;
  c.inventory[quest.item] = quest.count; reconcileFoodLots(c); visit(p, quest.giver);
  return p;
}
function act(p: FantasyProfile, action: FantasyAction): FantasyProfile {
  const original = structuredClone(p), result = applyFantasyAction(p, action, high);
  assert.equal(result.error, undefined); assert.equal(result.changed, true); assert.deepEqual(p, original);
  return result.profile;
}
function investigate(p: FantasyProfile, quest: string): FantasyProfile {
  while (!fantasyMainReady(p.character!, quest)) {
    visit(p, fantasyMainStage(p.character!, quest)!.location);
    p.character!.buff = { effect: 'check', power: 40 };
    p = act(p, { type: 'investigate', quest, approach: 'analyze' });
  }
  return p;
}
function legacy(): FantasyProfile {
  const p = player(); p.character!.completed.push(FANTASY_VOYAGE_FINAL_QUEST); visit(p, 'rockshade'); return p;
}
function temporary(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-voyage-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('fantasy-voyage-')); fs.rmSync(dir, { recursive: true, force: true }); });
  return path.join(dir, 'fantasy.json');
}

test('the last chapter starts with its real port issuer and all three proofs and its report occur on the island', () => {
  const quest = mains.at(-1)!;
  assert.equal(quest.id, FANTASY_VOYAGE_FINAL_QUEST); assert.equal(quest.giver, 'saffron-port'); assert.equal(quest.issuer, 'saffron-port-safi');
  assert.equal(quest.destination, FANTASY_FINAL_ISLE_ID); assert.equal(quest.reportAt, FANTASY_FINAL_ISLE_ID);
  assert.deepEqual(fantasyMainTrial(quest.id)!.stages.map(stage => [stage.id, stage.location]), [['field', FANTASY_FINAL_ISLE_ID], ['verify', FANTASY_FINAL_ISLE_ID], ['compare', FANTASY_FINAL_ISLE_ID]]);
});

test('normal completion requires real island presence and ordered proof, rewards once and records a localized closed ending', () => {
  const quest = mains.at(-1)!; let p = act(player(), { type: 'accept', quest: quest.id });
  assert.equal(fantasyVoyageEnding(p.character!, 'en'), undefined);
  assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, high).changed, false);
  visit(p, FANTASY_FINAL_ISLE_ID);
  assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, high).changed, false);
  p = investigate(p, quest.id);
  assert.equal(applyFantasyAction(p, { type: 'finishVoyage' }, high).changed, false, 'the legacy journal action cannot bypass normal completion or its supplies');
  visit(p, quest.giver);
  const before = structuredClone(p);
  assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, high).changed, false); assert.deepEqual(p, before);
  visit(p, FANTASY_FINAL_ISLE_ID);
  const gold = p.character!.gold, count = p.character!.inventory[quest.item]; p = act(p, { type: 'complete', quest: quest.id });
  assert.equal(p.character!.location, FANTASY_FINAL_ISLE_ID); assert.deepEqual(p.character!.voyageEnding, { hour: p.character!.hour });
  assert.equal(p.character!.inventory[quest.item], count - quest.count); assert.ok(p.character!.gold >= gold + quest.gold); assert.ok(validFantasyVoyageEnding(p.character!));
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const ending = fantasyVoyageEnding(p.character!, locale)!; assert.ok(ending.title); assert.ok(ending.paragraphs.length >= 2);
    ending.paragraphs.length = 0; assert.ok(fantasyVoyageEnding(p.character!, locale)!.paragraphs.length >= 2);
  }
  const earned = structuredClone(p); assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, high).changed, false);
  assert.equal(applyFantasyAction(p, { type: 'finishVoyage' }, high).changed, false); assert.deepEqual(p, earned);
});

test('chapter seventeen charts the island only when the completed investigation is reported', () => {
  const quest = mains[16]; let p = act(player(17), { type: 'accept', quest: quest.id });
  assert.equal(fantasyIsleAccess(p.character!), false); assert.ok(!p.character!.charted.includes(FANTASY_FINAL_ISLE_ID));
  p = investigate(p, quest.id); assert.ok(!p.character!.charted.includes(FANTASY_FINAL_ISLE_ID));
  visit(p, quest.reportAt ?? quest.giver); p = act(p, { type: 'complete', quest: quest.id });
  assert.equal(fantasyIsleAccess(p.character!), true); assert.equal(p.character!.charted.filter(id => id === FANTASY_FINAL_ISLE_ID).length, 1);
  assert.equal(p.character!.voyageEnding, undefined);
});

test('legacy completed chapters reload unchanged and receive no ending or new rewards until an actual island journal entry', t => {
  const p = legacy(), file = temporary(t); fs.writeFileSync(file, JSON.stringify({ traveler: p }));
  const store = new FantasyStore(file, { onError: error => { throw error; } }); assert.equal(store.loadError, undefined);
  const loaded = store.profile('traveler'); assert.deepEqual(loaded.character, p.character); assert.equal(fantasyVoyageEnding(loaded.character!, 'ko'), undefined);
  assert.equal(applyFantasyAction(loaded, { type: 'finishVoyage' }, high).changed, false);
  visit(loaded, FANTASY_FINAL_ISLE_ID); const c = structuredClone(loaded.character!);
  assert.equal(fantasyActionHours(loaded, { type: 'finishVoyage' }), 0);
  const finished = startFantasyActivity(loaded, { type: 'finishVoyage' }, c.hour, high).profile;
  assert.equal(finished.activity, undefined); assert.deepEqual(finished.character, { ...c, voyageEnding: { hour: c.hour } });
  assert.equal(finished.character!.mainTrials, undefined); assert.ok(fantasyVoyageEnding(finished.character!, 'en'));
  fs.writeFileSync(file, JSON.stringify({ traveler: finished }));
  const restarted = new FantasyStore(file, { onError: error => { throw error; } }); assert.equal(restarted.loadError, undefined);
  assert.deepEqual(restarted.profile('traveler').character, finished.character);
});

test('old active final chapters keep partial or full proof and still require the new island report', t => {
  const file = temporary(t);
  for (const count of [0, 1, 3]) {
    const p = player(); visit(p, 'rockshade'); p.character!.quests = [FANTASY_VOYAGE_FINAL_QUEST]; p.character!.hour = 10;
    p.character!.mainTrials = { [FANTASY_VOYAGE_FINAL_QUEST]: { acceptedAt: 8, attempts: count, proofs: ['field', 'verify', 'compare'].slice(0, count).map((stage, index) => ({ stage, approach: 'analyze', hour: 8.5 + index * .5 })) } };
    fs.writeFileSync(file, JSON.stringify({ traveler: p })); const store = new FantasyStore(file, { onError: error => { throw error; } });
    assert.equal(store.loadError, undefined); let restored = store.profile('traveler'); assert.deepEqual(restored.character!.mainTrials, p.character!.mainTrials);
    assert.equal(applyFantasyAction(restored, { type: 'complete', quest: FANTASY_VOYAGE_FINAL_QUEST }, high).changed, false);
    restored = investigate(restored, FANTASY_VOYAGE_FINAL_QUEST); visit(restored, FANTASY_FINAL_ISLE_ID);
    assert.ok(act(restored, { type: 'complete', quest: FANTASY_VOYAGE_FINAL_QUEST }).character!.voyageEnding);
  }
});

test('only recognizable old final mainland investigation reservations are cancelled while new island reservations remain valid', t => {
  const file = temporary(t);
  for (const count of [0, 1, 2]) {
    const p = player(), startedAt = 8 + count * .5; p.character!.quests = [FANTASY_VOYAGE_FINAL_QUEST];
    visit(p, count === 2 ? 'rockshade' : 'sunloom'); p.character!.hour = startedAt + .25;
    p.character!.mainTrials = { [FANTASY_VOYAGE_FINAL_QUEST]: { acceptedAt: 8, attempts: count, proofs: ['field', 'verify'].slice(0, count).map((stage, index) => ({ stage, approach: 'analyze', hour: 8.5 + index * .5 })) } };
    p.activity = { action: { type: 'investigate', quest: FANTASY_VOYAGE_FINAL_QUEST, approach: 'analyze' }, startedAt, endsAt: startedAt + .5, seed: 1 };
    fs.writeFileSync(file, JSON.stringify({ traveler: p })); const store = new FantasyStore(file, { onError: error => { throw error; } });
    assert.equal(store.loadError, undefined); const migrated = store.profile('traveler'); assert.equal(migrated.activity, undefined); assert.deepEqual(migrated.character, p.character);
    assert.equal(migrated.revision, p.revision + 1); assert.ok(migrated.log.at(-1)!.text.startsWith('旧航海調査の予約を解除した。'));
    const restarted = new FantasyStore(file, { onError: error => { throw error; } }); assert.deepEqual(restarted.profile('traveler'), migrated);
    const invalid = structuredClone(p); invalid.activity!.endsAt += .5; const bytes = JSON.stringify({ traveler: invalid }); fs.writeFileSync(file, bytes);
    assert.ok(new FantasyStore(file, { onError: () => {} }).loadError); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
    const island = structuredClone(p); visit(island, FANTASY_FINAL_ISLE_ID); fs.writeFileSync(file, JSON.stringify({ traveler: island }));
    const current = new FantasyStore(file, { onError: error => { throw error; } }); assert.equal(current.loadError, undefined); assert.deepEqual(current.profile('traveler').activity, island.activity);
  }
});

test('forged, future, unvisited and premature ending records are rejected without replacing save data', t => {
  const file = temporary(t), valid = legacy(); visit(valid, FANTASY_FINAL_ISLE_ID); valid.character!.voyageEnding = { hour: valid.character!.hour };
  const corrupt = [
    (p: FantasyProfile) => { p.character!.voyageEnding = { hour: p.character!.hour + 1 }; },
    (p: FantasyProfile) => { p.character!.voyageEnding = { hour: -1 }; },
    (p: FantasyProfile) => { p.character!.voyageEnding = { hour: 8, chapter: 18 } as never; },
    (p: FantasyProfile) => { p.character!.voyageEnding = null as never; },
    (p: FantasyProfile) => { p.character!.completed.pop(); },
    (p: FantasyProfile) => { visit(p, 'rockshade'); p.character!.visited = p.character!.visited.filter(id => id !== FANTASY_FINAL_ISLE_ID); },
    (p: FantasyProfile) => { p.character!.hour = 10; p.character!.mainTrials = { [FANTASY_VOYAGE_FINAL_QUEST]: { acceptedAt: 8, attempts: 3, proofs: ['field', 'verify', 'compare'].map((stage, index) => ({ stage, approach: 'analyze', hour: 8.5 + index * .5 })) } }; },
  ];
  for (const change of corrupt) {
    const p = structuredClone(valid); change(p); assert.equal(validFantasyVoyageEnding(p.character!), false); const bytes = JSON.stringify({ traveler: p }); fs.writeFileSync(file, bytes);
    const store = new FantasyStore(file, { onError: () => {} }); assert.ok(store.loadError); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  }
});

test('journal completion is unavailable during another action, danger or death and the ending leaves ordinary play available', () => {
  const p = legacy(); visit(p, FANTASY_FINAL_ISLE_ID);
  assert.equal(isFantasyAction({ type: 'finishVoyage' }), true); assert.equal(isFantasyAction({ type: 'finishVoyage', reward: 99 }), false);
  assert.equal(applyFantasyAction(p, { type: 'finishVoyage', reward: 99 } as never, high).changed, false);
  const busy = structuredClone(p); busy.activity = { action: { type: 'rest' }, startedAt: 8, endsAt: 16, seed: 1 };
  assert.equal(applyFantasyAction(busy, { type: 'finishVoyage' }, high).changed, false);
  const threatened = structuredClone(p); threatened.event = 'encounter-bandits'; assert.equal(applyFantasyAction(threatened, { type: 'finishVoyage' }, high).changed, false);
  const dead = structuredClone(p); dead.death = { location: FANTASY_FINAL_ISLE_ID, hour: 8, cause: 'fixture' }; dead.character!.hp = 0;
  assert.equal(applyFantasyAction(dead, { type: 'finishVoyage' }, high).changed, false);
  const ended = act(p, { type: 'finishVoyage' }), playing = act(ended, { type: 'explore' });
  assert.equal(playing.death, undefined); assert.deepEqual(playing.character!.voyageEnding, ended.character!.voyageEnding); assert.ok(fantasyVoyageEnding(playing.character!, 'ja'));
});

test('a completed voyage remains in the old life trace while the next life must earn its own ending', () => {
  let p = legacy(); visit(p, FANTASY_FINAL_ISLE_ID); p = act(p, { type: 'finishVoyage' });
  recordFantasyDeath(p, 'A later life event'); p = act(p, { type: 'rebirth' });
  assert.ok(p.pastLives!.at(-1)!.completed.includes(FANTASY_VOYAGE_FINAL_QUEST));
  p = act(p, { type: 'create', name: 'Next voyager', gender: 'male', source: 'human' });
  assert.equal(p.character!.voyageEnding, undefined); assert.equal(fantasyVoyageEnding(p.character!, 'ko'), undefined); assert.deepEqual(p.character!.completed, []);
});
