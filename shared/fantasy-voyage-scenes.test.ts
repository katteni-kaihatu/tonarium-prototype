import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';
import { applyFantasyAction, advanceFantasyWorld, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_MAIN_QUESTS } from './fantasy-second-content.ts';
import { FANTASY_MAIN_TRIALS, fantasyMainStage } from './fantasy-main-trials.ts';
import { FANTASY_FINAL_ISLE_ID, fantasyIsleAccess } from './fantasy-isle-access.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_VOYAGE_CHAPTERS, FANTASY_VOYAGE_SCENES, fantasyVoyageChapterDetail, fantasyVoyageEarnedScenes, fantasyVoyageScene, fantasyVoyageSceneLogText, validFantasyVoyageSceneCatalog } from './fantasy-voyage-scenes.ts';
import { reconcileFoodLots } from './fantasy-life.ts';
import { FantasyStore } from '../server/fantasy-store.ts';

const high = () => .999;
const mains = [...FANTASY_MAIN_QUESTS].sort((a, b) => a.chapter! - b.chapter!);
const qid = (chapter: number) => mains[chapter - 1].id;
const visit = (p: FantasyProfile, location: string) => { p.character!.location = location; if (!p.character!.visited.includes(location)) p.character!.visited.push(location); };
function player(chapter = 1): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Scene traveler', gender: 'female', source: 'human' }, () => .5).profile;
  p.character!.completed = mains.slice(0, chapter - 1).map(quest => quest.id); p.character!.inventory.lantern = 1;
  visit(p, mains[chapter - 1].giver); return p;
}
function act(p: FantasyProfile, action: FantasyAction, rng = high): FantasyProfile {
  const original = structuredClone(p), result = applyFantasyAction(p, action, rng);
  assert.equal(result.error, undefined); assert.equal(result.changed, true); assert.deepEqual(p, original); return result.profile;
}
const accept = (chapter = 1) => act(player(chapter), { type: 'accept', quest: qid(chapter) });
function success(p: FantasyProfile, quest: string, approach: 'observe' | 'analyze' | 'restore' = 'observe') {
  visit(p, fantasyMainStage(p.character!, quest)!.location); p.character!.buff = { effect: 'check', power: 40 };
  return act(p, { type: 'investigate', quest, approach });
}
function temporary(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-scenes-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('fantasy-scenes-')); fs.rmSync(dir, { recursive: true, force: true }); });
  return path.join(dir, 'fantasy.json');
}

test('all forty-eight localized scenes form the exact existing eighteen-chapter investigation chain', () => {
  assert.equal(FANTASY_VOYAGE_SCENES.length, 48); assert.equal(FANTASY_VOYAGE_CHAPTERS.length, 18); assert.equal(validFantasyVoyageSceneCatalog(), true);
  let previous: string | undefined;
  for (const trial of FANTASY_MAIN_TRIALS) for (const stage of trial.stages) {
    const scene = FANTASY_VOYAGE_SCENES.find(scene => scene.questId === trial.questId && scene.stage === stage.id)!;
    assert.ok(scene); assert.equal(scene.location, stage.location); assert.deepEqual(scene.requires, previous ? [previous] : []); previous = scene.id;
    for (const locale of ['ko', 'en', 'ja'] as const) {
      for (const value of [scene.setup, scene.success, scene.failure, scene.clue.name, scene.clue.fact, scene.next, ...Object.values(scene.approaches)]) {
        assert.ok(value[locale].trim().length > 1);
        assert.doesNotMatch(value[locale], /\b(?:NPC|GM|server|player)\b|플레이어|サーバー|プレイヤー/);
      }
      assert.equal(new Set(Object.values(scene.approaches).map(value => value[locale])).size, 3);
    }
  }
  for (const change of [
    (scenes: typeof FANTASY_VOYAGE_SCENES) => { scenes[0].requires = [scenes.at(-1)!.id]; },
    (scenes: typeof FANTASY_VOYAGE_SCENES) => { scenes[2].requires = [scenes[0].id]; },
    (scenes: typeof FANTASY_VOYAGE_SCENES) => { scenes[1] = scenes[0]; },
    (scenes: typeof FANTASY_VOYAGE_SCENES) => { scenes[2].approaches.analyze.ja = ''; },
  ]) { const scenes = structuredClone(FANTASY_VOYAGE_SCENES); change(scenes); assert.equal(validFantasyVoyageSceneCatalog(scenes), false); }
});

test('only the accepted current setup and approaches are public and future outcomes never escape the helper', () => {
  const fresh = player(); assert.equal(fantasyVoyageScene(fresh.character!, qid(1)), undefined); assert.equal(fantasyVoyageChapterDetail(fresh.character!, qid(1)), undefined);
  let p = accept(); const c = p.character!;
  assert.equal(fantasyVoyageScene(c,qid(1)),undefined,'a distant accepted location cannot expose field observations');
  assert.ok(fantasyVoyageChapterDetail(c,qid(1)));visit(p,mains[0].destination);
  const scene = fantasyVoyageScene(c, qid(1))!;
  assert.equal(scene.id, 'voyage-01-field'); assert.equal(scene.location, mains[0].destination);
  for (const secret of ['success', 'failure', 'clue', 'next']) assert.equal(Object.hasOwn(scene, secret), false);
  assert.equal(fantasyVoyageChapterDetail(c, qid(2)), undefined); assert.equal(fantasyVoyageScene(c, qid(2)), undefined); assert.deepEqual(fantasyVoyageEarnedScenes(c, 'en'), []);
  scene.setup.en = 'mutated'; scene.approaches.observe.en = 'mutated'; scene.requires.push('forged');
  assert.notEqual(fantasyVoyageScene(c, qid(1))!.setup.en, 'mutated'); assert.deepEqual(fantasyVoyageScene(c, qid(1))!.requires, []);
  const detail = fantasyVoyageChapterDetail(c, qid(1))!; detail.motivation.en = 'mutated'; assert.notEqual(fantasyVoyageChapterDetail(c, qid(1))!.motivation.en, 'mutated');
  assert.ok(p.log.some(log => log.text === `航海場面［${qid(1)}:opening］。`));
  for(const locale of ['ko','en','ja'] as const)assert.ok(!fantasyVoyageSceneLogText(`航海場面［${qid(1)}:opening］。`,locale,c)!.includes(FANTASY_VOYAGE_SCENES[0].setup[locale]),'acceptance cannot describe an unvisited field scene');
  p = success(p, qid(1)); assert.equal(fantasyVoyageScene(p.character!, qid(1)),undefined);visit(p,mains[0].giver);
  assert.equal(fantasyVoyageScene(p.character!, qid(1))!.id, 'voyage-01-compare');
});

test('scheduled scene outcomes appear only after the real check and survive halfway reload without duplicate facts or rewards', t => {
  let p = accept(); visit(p, mains[0].destination); p.character!.buff = { effect: 'check', power: 40 };
  const started = startFantasyActivity(p, { type: 'investigate', quest: qid(1), approach: 'analyze' }, p.character!.hour, () => .8).profile;
  const outcome = `航海場面［${qid(1)}:field:analyze:success］。`;
  assert.ok(!started.log.some(log => log.text === outcome)); assert.deepEqual(fantasyVoyageEarnedScenes(started.character!, 'ko'), []);
  const halfway = advanceFantasyWorld(started, started.activity!.startedAt + .25).profile;
  assert.ok(!halfway.log.some(log => log.text === outcome)); assert.deepEqual(fantasyVoyageEarnedScenes(halfway.character!, 'en'), []);
  const file = temporary(t); fs.writeFileSync(file, JSON.stringify({ traveler: halfway }));
  const store = new FantasyStore(file, { onError: error => { throw error; } }); assert.equal(store.loadError, undefined);
  const done = advanceFantasyWorld(store.profile('traveler'), started.activity!.endsAt).profile;
  assert.equal(done.log.filter(log => log.text === outcome).length, 1);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const known = fantasyVoyageEarnedScenes(done.character!, locale); assert.equal(known.length, 1); assert.equal(known[0].approach, 'analyze'); assert.equal(known[0].hour, started.activity!.endsAt);
    const narrative = fantasyVoyageSceneLogText(outcome, locale, done.character!)!; assert.ok(narrative.includes(known[0].fact)); assert.ok(narrative.includes(known[0].story));
    assert.equal(fantasyVoyageSceneLogText(`航海場面［${qid(1)}:field:restore:success］。`,locale,done.character!),'');
  }
  const synchronized = advanceFantasyWorld(done, done.character!.hour); assert.equal(synchronized.changed, false); assert.deepEqual(synchronized.profile, done);
  assert.equal(fantasyVoyageSceneLogText(outcome, 'en'), ''); assert.equal(fantasyVoyageSceneLogText(outcome, 'en', p.character!), '');
});

test('failure preserves the scene and exposes no clue or future stage while a later real success is recorded separately', () => {
  let p = accept(); visit(p, mains[0].destination);
  const future = `航海場面［${qid(1)}:compare:observe:failure］。`, failed = `航海場面［${qid(1)}:field:observe:failure］。`;
  assert.equal(fantasyVoyageSceneLogText(failed, 'en', p.character!), '');
  p = act(p, { type: 'investigate', quest: qid(1), approach: 'observe' }, () => 0);
  assert.deepEqual(fantasyVoyageEarnedScenes(p.character!, 'en'), []); assert.equal(fantasyVoyageScene(p.character!, qid(1))!.id, 'voyage-01-field');
  const source = FANTASY_VOYAGE_SCENES[0];
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const text = fantasyVoyageSceneLogText(failed, locale, p.character!)!;
    assert.ok(text.includes(source.failure[locale])); assert.ok(!text.includes(source.clue.fact[locale])); assert.ok(!text.includes(source.success[locale]));
    assert.equal(fantasyVoyageSceneLogText(future, locale, p.character!), '');
  }
  p = success(p, qid(1)); assert.equal(fantasyVoyageEarnedScenes(p.character!, 'en').length, 1);
  assert.ok(p.log.some(log => log.text === failed)); assert.ok(p.log.some(log => log.text === `航海場面［${qid(1)}:field:observe:success］。`));
});

test('scene causality requires earlier proof and the previous chapter report rather than merely raw supplies or an accepted ID', () => {
  let p = accept(); p.character!.quests.push(qid(2));
  assert.equal(fantasyVoyageScene(p.character!, qid(2)), undefined); p.character!.quests.pop();
  p = success(p, qid(1)); p = success(p, qid(1)); visit(p, mains[1].giver);
  assert.equal(applyFantasyAction(p, { type: 'accept', quest: qid(2) }, high).changed, false);
  assert.equal(fantasyVoyageScene(p.character!, qid(2)), undefined);
  visit(p, mains[0].giver); p.character!.inventory[mains[0].item] = mains[0].count; reconcileFoodLots(p.character!); p = act(p, { type: 'complete', quest: qid(1) });
  visit(p, mains[1].giver); p = act(p, { type: 'accept', quest: qid(2) });visit(p,mains[1].destination); assert.deepEqual(fantasyVoyageScene(p.character!, qid(2))!.requires, ['voyage-01-compare']);
});

test('abandoning preserves only earned clues and existing scene history without granting another success or revealing the next chapter', () => {
  let p = success(accept(), qid(1)); const known = fantasyVoyageEarnedScenes(p.character!, 'en'), xp = p.character!.xp;
  p = act(p, { type: 'abandon', quest: qid(1) });
  assert.equal(fantasyVoyageScene(p.character!, qid(1)), undefined); assert.equal(fantasyVoyageChapterDetail(p.character!, qid(1)), undefined);
  assert.deepEqual(fantasyVoyageEarnedScenes(p.character!, 'en'), known); assert.equal(p.character!.xp, xp);
  assert.ok(fantasyVoyageSceneLogText(`航海場面［${qid(1)}:opening］。`, 'en', p.character!));
  visit(p, mains[0].giver); p = act(p, { type: 'accept', quest: qid(1) }); assert.equal(p.character!.xp, xp); assert.equal(fantasyVoyageScene(p.character!, qid(1))!.stage, 'compare');
  assert.equal(fantasyVoyageSceneLogText(`航海場面［${qid(2)}:opening］。`, 'en', p.character!), '');
});

test('legacy completed chapters are marked as inferred recollections without invented timestamps or approaches and legacy eighteen stays hidden until its real ending', () => {
  let p = player(18); p.character!.completed.push(qid(18));
  for (const visited of [false, true]) {
    if (visited) visit(p, FANTASY_FINAL_ISLE_ID);
    const known = fantasyVoyageEarnedScenes(p.character!, 'en'); assert.equal(known.length, 45);
    assert.ok(known.every(scene => scene.inferred && scene.hour === undefined && scene.approach === undefined && scene.chapter < 18));
    assert.equal(fantasyVoyageSceneLogText(`航海場面［${qid(18)}:closing］。`, 'en', p.character!), '');
    assert.deepEqual(fantasyVoyageEarnedScenes(p.character!, 'en', qid(18)), []);
  }
  p = act(p, { type: 'finishVoyage' }); assert.equal(fantasyVoyageEarnedScenes(p.character!, 'en').length, 48);
  assert.ok(fantasyVoyageEarnedScenes(p.character!, 'en', qid(18)).every(scene => scene.inferred && scene.hour === undefined && scene.approach === undefined));
  assert.ok(fantasyVoyageSceneLogText(`航海場面［${qid(18)}:closing］。`, 'en', p.character!));
});

test('actual final island clues require arrival and successful checks while the ending handoff requires the real quest completion', () => {
  let p = accept(18); assert.equal(fantasyVoyageScene(p.character!, qid(18)),undefined); assert.deepEqual(fantasyVoyageEarnedScenes(p.character!, 'en', qid(18)), []);
  visit(p, FANTASY_FINAL_ISLE_ID); while (fantasyMainStage(p.character!, qid(18))) p = success(p, qid(18));
  const known = fantasyVoyageEarnedScenes(p.character!, 'en', qid(18)); assert.equal(known.length, 3); assert.ok(known.every(scene => !scene.inferred && scene.hour !== undefined));
  assert.equal(p.character!.voyageEnding, undefined); assert.equal(fantasyVoyageSceneLogText(`航海場面［${qid(18)}:closing］。`, 'en', p.character!), '');
  const beforeArrival = structuredClone(p); beforeArrival.character!.visited = beforeArrival.character!.visited.filter(id => id !== FANTASY_FINAL_ISLE_ID);
  assert.deepEqual(fantasyVoyageEarnedScenes(beforeArrival.character!, 'en', qid(18)), []);
  assert.equal(fantasyVoyageSceneLogText(`航海場面［${qid(18)}:compare:observe:success］。`, 'en', beforeArrival.character!), '');
  p.character!.inventory[mains[17].item] = mains[17].count; reconcileFoodLots(p.character!); p = act(p, { type: 'complete', quest: qid(18) });
  assert.ok(p.character!.voyageEnding); assert.ok(fantasyVoyageSceneLogText(`航海場面［${qid(18)}:closing］。`, 'en', p.character!));
  assert.equal(fantasyVoyageSceneLogText('not a scene', 'en', p.character!), undefined);
});

test('the final island name remains concealed through the chapter seventeen comparison and is revealed only after its report', () => {
  let p = accept(17); p = success(p,qid(17)); p = success(p,qid(17));visit(p,mains[16].giver);
  const names=Object.values(FANTASY_LOCATIONS.find(place=>place.id===FANTASY_FINAL_ISLE_ID)!.names!);
  const pending=JSON.stringify([fantasyVoyageScene(p.character!,qid(17)),fantasyVoyageChapterDetail(p.character!,qid(17))]);
  for(const name of names)assert.ok(!pending.includes(name));
  p=success(p,qid(17));assert.equal(fantasyIsleAccess(p.character!),false);
  for(const locale of ['ko','en','ja'] as const){
    const known=JSON.stringify(fantasyVoyageEarnedScenes(p.character!,locale,qid(17))),log=fantasyVoyageSceneLogText(`航海場面［${qid(17)}:compare:observe:success］。`,locale,p.character!)!;
    for(const name of names){assert.ok(!known.includes(name));assert.ok(!log.includes(name));}
    assert.ok(known.includes({ko:'안개 너머의 섬',en:'the isle beyond the mist',ja:'霧の向こうの島'}[locale]));
  }
  p.character!.inventory[mains[16].item]=mains[16].count;reconcileFoodLots(p.character!);p=act(p,{type:'complete',quest:qid(17)});
  assert.equal(fantasyIsleAccess(p.character!),true);
  for(const locale of ['ko','en','ja'] as const)assert.ok(JSON.stringify(fantasyVoyageEarnedScenes(p.character!,locale,qid(17))).includes(FANTASY_LOCATIONS.find(place=>place.id===FANTASY_FINAL_ISLE_ID)!.names![locale]));
});
