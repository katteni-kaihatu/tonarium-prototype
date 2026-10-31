import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_DUNGEONS, FANTASY_DUNGEON_QUESTS } from './fantasy-dungeon-catalog.ts';
import { applyFantasyDungeonAction, fantasyDungeonCombatPlan, fantasyDungeonQuestReady, fantasyDungeonView, learnFantasyDungeonMap, markFantasyDungeonVictory, shareFantasyDungeonFinding, validFantasyDungeon, fantasyDungeonContextBonus, isFantasyDungeonAction, fantasyDungeonSiteFor, fantasyDungeonCanCamp, fantasyDungeonLogText, fantasyDungeonErrorText } from './fantasy-dungeon.ts';
import { fantasyTaskObjective, fantasyTaskProgress, fantasyTaskReady } from './fantasy-task-progress.ts';
import { fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { validFantasyItemState } from './fantasy-effects.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import type { FantasyDungeonAction } from './fantasy-dungeon.ts';
function person(site = 'oldwatch') { const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Explorer', gender: 'female' }, () => .5).profile; p.character!.location = site; p.character!.visited.push(site); p.character!.inventory.lantern = 1; return p; }
const act = (p: ReturnType<typeof person>, action: FantasyDungeonAction, roll = .999) => { const r = applyFantasyDungeonAction(p, action, () => roll); assert.equal(r.error, undefined); assert.ok(r.changed); assert.ok(validFantasyDungeon(r.profile.character!)); return r.profile; };
test('settled dungeon maps stay distinct and every multilingual template has connected rooms and real enemies', () => {
  const settled = FANTASY_DUNGEONS.filter(site => !site.id.startsWith('frontier-'));
  assert.equal(settled.filter(site => site.kind === 'ruin').length, 3); assert.equal(settled.filter(site => site.kind === 'cave').length, 3);
  const shapes = new Set<string>();
  for (const site of FANTASY_DUNGEONS) {
    const seen = new Set([site.entry]), queue = [site.entry]; while (queue.length) { const current = queue.shift(); for (const id of site.rooms.find(room => room.id === current)!.exits) if (!seen.has(id)) { seen.add(id); queue.push(id); } }
    assert.equal(seen.size, site.rooms.length); for (const room of site.rooms) { for (const exit of room.exits) assert.ok(site.rooms.find(other => other.id === exit)?.exits.includes(room.id)); if (room.enemy) assert.ok(fantasyCombatEnemy(room.enemy.template)); for (const lang of ['ko', 'en', 'ja'] as const) assert.ok(room.names[lang]); }
    if (settled.includes(site)) shapes.add(JSON.stringify(site.rooms.map(room => [room.x, room.y, room.exits.length])));
  }
  assert.equal(shapes.size, 6); assert.equal(FANTASY_DUNGEON_QUESTS.length, 12);
});
test('unknown hazards stay out of public room state and detecting does not disarm a personal trap', () => {
  let p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' }); p = act(p, { type: 'dungeonMove', room: 'archive' });
  assert.equal(fantasyDungeonView(p.character!, 'en')!.trap, undefined); assert.ok(!JSON.stringify(p.character!.dungeon).includes('damage'));
  p = act(p, { type: 'dungeonInspect' }); assert.ok(p.character!.dungeon!.sites.oldwatch.detected.includes('archive')); assert.ok(!p.character!.dungeon!.sites.oldwatch.disarmed.includes('archive'));
  const hp = p.character!.hp; p = act(p, { type: 'dungeonDisarm' }, 0); assert.ok(p.character!.hp < hp); assert.ok(p.character!.dungeon!.sites.oldwatch.sprung.includes('archive')); assert.ok(!p.character!.dungeon!.sites.oldwatch.disarmed.includes('archive'));
});
test('exit requires the entrance and first-time room rewards cannot be replayed after exit or reload', () => {
  let p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' }); p = act(p, { type: 'dungeonMove', room: 'archive' });
  assert.ok(applyFantasyDungeonAction(p, { type: 'dungeonExit' }).error); p = act(p, { type: 'dungeonInspect' }); p = act(p, { type: 'dungeonDisarm' });
  const first = applyFantasyDungeonAction(p, { type: 'dungeonInteract' }); assert.equal(first.discovery, 'magic-veil'); const gold = first.profile.character!.gold;
  p = act(first.profile, { type: 'dungeonMove', room: 'entrance' }); p = act(p, { type: 'dungeonExit' }); p = JSON.parse(JSON.stringify(p));
  p = act(p, { type: 'dungeonEnter', site: 'oldwatch' }); p = act(p, { type: 'dungeonMove', room: 'archive' }); assert.ok(applyFantasyDungeonAction(p, { type: 'dungeonInteract' }).error); assert.equal(p.character!.gold, gold);
});
test('a guard blocks new passages and discoveries until actual victory, while a retreat remains possible', () => {
  let p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' }); p = act(p, { type: 'dungeonMove', room: 'barracks' });
  assert.ok(applyFantasyDungeonAction(p, { type: 'dungeonMove', room: 'armory' }).error); assert.ok(fantasyDungeonCombatPlan(p.character!, 'oldwatch:barracks')); assert.equal(fantasyDungeonCombatPlan(p.character!, 'oldwatch:watchcrypt'), undefined);
  const retreat = applyFantasyDungeonAction(p, { type: 'dungeonMove', room: 'entrance' }); assert.equal(retreat.error, undefined);
  assert.ok(markFantasyDungeonVictory(p.character!, 'oldwatch:barracks')); assert.equal(markFantasyDungeonVictory(p.character!, 'oldwatch:barracks'), false); assert.equal(fantasyDungeonCombatPlan(p.character!, 'oldwatch:barracks'), undefined);
  p = act(p, { type: 'dungeonMove', room: 'armory' }); assert.equal(p.character!.dungeon!.active!.room, 'armory');
});
test('shared findings never transfer trap damage, disarm status, inventory or room rewards', () => {
  let a = act(person(), { type: 'dungeonEnter', site: 'oldwatch' }), b = act(person(), { type: 'dungeonEnter', site: 'oldwatch' }); a = act(a, { type: 'dungeonMove', room: 'archive' }); b = act(b, { type: 'dungeonMove', room: 'archive' });
  a = act(a, { type: 'dungeonInspect' }); a = act(a, { type: 'dungeonDisarm' }); b = act(b, { type: 'dungeonInspect' }, 0);
  const before = structuredClone(b.character!); assert.ok(shareFantasyDungeonFinding(b.character!, 'oldwatch', 'archive')); assert.ok(b.character!.dungeon!.sites.oldwatch.findings.includes('archive'));
  assert.equal(b.character!.hp, before.hp); assert.deepEqual(b.character!.inventory, before.inventory); assert.deepEqual(b.character!.dungeon!.sites.oldwatch.disarmed, []); assert.deepEqual(b.character!.dungeon!.sites.oldwatch.claimed, []);
});
test('lower cave knowledge is gated, forged progress is rejected and dungeon quests require real room findings', () => {
  const p = person('deepcave'); assert.ok(applyFantasyDungeonAction(p, { type: 'dungeonEnter', site: 'deepcave-depths' }).error); p.character!.inventory['map-dungeon-deepcave-depths'] = 1;
  const entered = act(p, { type: 'dungeonEnter', site: 'deepcave-depths' }), q = FANTASY_DUNGEON_QUESTS.find(q => q.id === 'dungeon-survey-deepcave-depths')!; entered.character!.quests.push(q.id); assert.equal(fantasyDungeonQuestReady(entered.character!, q), false);
  const forged = structuredClone(entered.character!); forged.dungeon!.sites['deepcave-depths'].claimed.push('warden'); assert.equal(validFantasyDungeon(forged), false);
});
test('a consumed lower-cave map remains learned after reload and inspection cannot reroll within one global day', () => {
  let p = person('deepcave'); assert.ok(learnFantasyDungeonMap(p.character!, 'deepcave-depths')); assert.equal(learnFantasyDungeonMap(p.character!, 'invented-site'), false);
  p = act(JSON.parse(JSON.stringify(p)), { type: 'dungeonEnter', site: 'deepcave-depths' }); p = act(p, { type: 'dungeonInspect' }, 0);
  const before = JSON.stringify(p); assert.ok(applyFantasyDungeonAction(p, { type: 'dungeonInspect' }, () => .999).error); assert.equal(JSON.stringify(p), before);
  p.character!.hour = 24; p = act(p, { type: 'dungeonInspect' }); assert.ok(p.character!.dungeon!.sites['deepcave-depths'].findings.includes('descent'));
  assert.equal(isFantasyDungeonAction({ type: 'dungeonMove', room: 'warden', giveGold: 999 }), false);
});
test('ranger, thief and perceptive ancestry improve checks but a natural one still fails even at high level', () => {
  let p = person(); p.character!.job = 'ranger'; p.character!.jobXp.ranger = 0; p.character!.race = 'elf'; p.character!.level = 99;
  assert.ok(fantasyDungeonContextBonus(p.character!) >= 4); p = act(p, { type: 'dungeonEnter', site: 'oldwatch' }); p = act(p, { type: 'dungeonInspect' }, 0);
  assert.deepEqual(p.character!.dungeon!.sites.oldwatch.findings, []);
});
test('regular contract readiness routes dungeon objectives to real findings rather than carried items', () => {
  const p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' }), q = FANTASY_DUNGEON_QUESTS.find(q => q.id === 'dungeon-survey-oldwatch')!;
  p.character!.quests.push(q.id); p.character!.inventory.relic = 999;
  assert.equal(fantasyTaskObjective(q)?.type, 'dungeon'); assert.equal(fantasyTaskReady(p.character!, q), false); assert.equal(fantasyTaskProgress(p.character!, q), 0);
  for (const room of ['entrance', 'archive', 'barracks']) { p.character!.dungeon!.sites.oldwatch.revealed.push(...(p.character!.dungeon!.sites.oldwatch.revealed.includes(room) ? [] : [room])); p.character!.dungeon!.active!.room = room; shareFantasyDungeonFinding(p.character!, 'oldwatch', room); }
  assert.equal(fantasyTaskProgress(p.character!, q), 3); assert.equal(fantasyTaskReady(p.character!, q), true);
});
test('a prepared check uses the world extra die and upper faces, consuming and crediting its actual effect once', () => {
  let p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' }); p = act(p, { type: 'dungeonMove', room: 'archive' });
  p.character!.job = 'mage'; p.character!.jobXp.mage = 0; p.character!.buff = { effect: 'check', stat: 'intelligence', power: 4, skill: 'mage-insight', mp: 9, diceFaces: 'upper' };
  let draws = 0; const result = applyFantasyDungeonAction(p, { type: 'dungeonInspect' }, () => ++draws === 1 ? 0 : .999);
  assert.equal(result.error, undefined); assert.equal(draws, 2); assert.ok(result.profile.character!.dungeon!.sites.oldwatch.detected.includes('archive'));
  assert.equal(result.profile.character!.buff, null); assert.ok((result.profile.character!.skillXp?.['mage-insight'] ?? 0) > 0); assert.ok((result.profile.character!.mana?.useXp ?? 0) > 0);
  assert.ok(result.profile.log.some(log => log.text.includes('2d20=')));
});
test('a prepared guard absorbs only its owner’s trap damage and is consumed and trained on real protection', () => {
  let p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' }); p = act(p, { type: 'dungeonMove', room: 'archive' });
  p.character!.job = 'shieldbearer'; p.character!.jobXp.shieldbearer = 0;
  p.character!.buff = { effect: 'guard', power: 11, skill: 'approved-skill-shieldbearer-set', mp: 9 };
  p = act(p, { type: 'dungeonInspect' }); const hp = p.character!.hp; p = act(p, { type: 'dungeonDisarm' }, 0);
  assert.equal(p.character!.hp, hp); assert.equal(p.character!.buff, null); assert.ok((p.character!.skillXp?.['approved-skill-shieldbearer-set'] ?? 0) > 0); assert.ok((p.character!.mana?.useXp ?? 0) > 0);
});
test('a lethal personal trap closes the dungeon without granting the room discovery or loot', () => {
  let p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' }); p = act(p, { type: 'dungeonMove', room: 'archive' }); p.character!.hp = 1;
  const gold = p.character!.gold, result = applyFantasyDungeonAction(p, { type: 'dungeonInteract' }, () => 0);
  assert.equal(result.error, undefined); assert.ok(result.profile.death); assert.equal(result.discovery, undefined); assert.equal(result.profile.character!.gold, gold); assert.equal(result.profile.character!.dungeon!.active, undefined);
  assert.deepEqual(result.profile.character!.dungeon!.sites.oldwatch.claimed, []);
});

 test('new expeditions persist their server seed and accept old save records without changing them', () => {
  const p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' });
  const progress = p.character!.dungeon!.sites.oldwatch;
  assert.ok(Number.isSafeInteger(progress.layoutSeed));
  const before = JSON.stringify(fantasyDungeonSiteFor(p.character!, 'oldwatch'));
  assert.equal(JSON.stringify(fantasyDungeonSiteFor(JSON.parse(JSON.stringify(p.character!)), 'oldwatch')), before);
  const legacy = structuredClone(p.character!); delete legacy.dungeon!.sites.oldwatch.layoutSeed;
  assert.ok(validFantasyDungeon(legacy));
  assert.equal(fantasyDungeonSiteFor(legacy, 'oldwatch')!.rooms.length, 5);
  for (const bad of [0, -1, .5, 4294967296, NaN]) { const forged = structuredClone(p.character!); forged.dungeon!.sites.oldwatch.layoutSeed = bad; assert.equal(validFantasyDungeon(forged), false); }
  assert.equal(isFantasyDungeonAction({ type: 'dungeonEnter', site: 'oldwatch', layoutSeed: 10 }), false);
});

test('special room choices award valid timed boons, curses or healing once per room after reload', () => {
  for (const choice of ['touch', 'offer', 'leave'] as const) {
    const p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' }); const c = p.character!;
    const room = fantasyDungeonSiteFor(c, 'oldwatch')!.rooms.find(room => room.special)!;
    c.dungeon!.sites.oldwatch.revealed.push(room.id); c.dungeon!.active!.room = room.id; c.hp = 1; c.inventory.herb = 1;
    const result = applyFantasyDungeonAction(p, { type: 'dungeonChoose', choice }, () => .999);
    assert.equal(result.error, undefined); assert.ok(result.changed); assert.ok(validFantasyDungeon(result.profile.character!)); assert.ok(validFantasyItemState(result.profile.character!, FANTASY_ITEMS));
    assert.ok(result.profile.character!.dungeon!.sites.oldwatch.claimed.includes(room.id));
    assert.ok(applyFantasyDungeonAction(JSON.parse(JSON.stringify(result.profile)), { type: 'dungeonChoose', choice }).error);
    if (choice === 'offer') assert.equal(result.profile.character!.inventory.herb, 0);
  }
  assert.equal(isFantasyDungeonAction({ type: 'dungeonChoose', choice: 'cheat' }), false);
});

test('dungeon camping requires inspected secured rooms and keeps unknown hazards hidden', () => {
  let p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' });
  assert.equal(fantasyDungeonCanCamp(p.character!), false); p = act(p, { type: 'dungeonInspect' }); assert.equal(fantasyDungeonCanCamp(p.character!), true);
  p = act(p, { type: 'dungeonMove', room: 'archive' }); assert.equal(fantasyDungeonCanCamp(p.character!), false);
  p = act(p, { type: 'dungeonInspect' }); assert.equal(fantasyDungeonCanCamp(p.character!), false);
  p = act(p, { type: 'dungeonDisarm' }); assert.equal(fantasyDungeonCanCamp(p.character!), true);
  p = act(p, { type: 'dungeonMove', room: 'entrance' }); p = act(p, { type: 'dungeonMove', room: 'barracks' }); p = act(p, { type: 'dungeonInspect' });
  assert.equal(fantasyDungeonCanCamp(p.character!), false); markFantasyDungeonVictory(p.character!, 'oldwatch:barracks'); assert.equal(fantasyDungeonCanCamp(p.character!), true);
  const view = fantasyDungeonView(p.character!, 'en')!;
  assert.equal(view.canCamp, true);
  assert.equal(view.rooms.length, 3);
  assert.ok(view.rooms.every(room => ['entrance', 'archive', 'barracks'].includes(room.id)));
  assert.equal(view.special, undefined);
  assert.ok(view.exits.filter(exit => !view.rooms.some(room => room.id === exit.id)).every(exit => exit.name === 'Unexplored passage'));
});


test('choice risks and offerings apply healing, validated blessings and curses with finite duration', () => {
  for (const [kind, choice, roll, outcome] of [['spring', 'touch', .999, 'heal'], ['shrine', 'touch', .999, 'skill-resolve'], ['obelisk', 'offer', 0, 'skill-clarity'], ['spring', 'touch', 0, 'weakness'], ['shrine', 'leave', 0, 'leave']] as const) {
    const p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' }), c = p.character!;
    const room = fantasyDungeonSiteFor(c, 'oldwatch')!.rooms.find(room => room.special === kind)!;
    c.dungeon!.sites.oldwatch.revealed.push(room.id); c.dungeon!.active!.room = room.id; c.hp = 1; c.inventory.herb = 1;
    const r = applyFantasyDungeonAction(p, { type: 'dungeonChoose', choice }, () => roll); assert.equal(r.error, undefined);
    const after = r.profile.character!;
    if (outcome === 'heal') assert.ok(after.hp > 1);
    else if (outcome === 'leave') { assert.equal(after.hp, 1); assert.deepEqual(after.effects ?? [], []); }
    else { const effect = after.effects!.find(effect => effect.id === outcome); assert.ok(effect); assert.ok(effect.expiresAt > after.hour && effect.expiresAt <= after.hour + 8); }
    assert.ok(validFantasyItemState(after, FANTASY_ITEMS));
  }
});

test('seeded progress rejects malformed structures and generated-room flag forgery without throwing', () => {
  const p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' });
  for (const progress of [null, {}, { ...p.character!.dungeon!.sites.oldwatch, unknown: 1 }, { ...p.character!.dungeon!.sites.oldwatch, layoutSeed: undefined }, { ...p.character!.dungeon!.sites.oldwatch, revealed: ['invented'] }]) {
    const c = structuredClone(p.character!); c.dungeon!.sites.oldwatch = progress as never;
    assert.equal(validFantasyDungeon(c), false);
  }
  const c = structuredClone(p.character!); c.dungeon!.sites.oldwatch.revealed.push('chamber-1'); c.dungeon!.sites.oldwatch.cleared.push('chamber-1'); assert.equal(validFantasyDungeon(c), false);
});


test('generated chamber movement and choice outcomes have localized logs and errors', () => {
  let p = act(person(), { type: 'dungeonEnter', site: 'oldwatch' });
  const c = p.character!, site = fantasyDungeonSiteFor(c, 'oldwatch')!, parent = site.rooms.find(room => room.exits.some(id => id.startsWith('chamber-')))!;
  c.dungeon!.active!.room = parent.id; if (!c.dungeon!.sites.oldwatch.revealed.includes(parent.id)) c.dungeon!.sites.oldwatch.revealed.push(parent.id);
  if (parent.enemy) c.dungeon!.sites.oldwatch.cleared.push(parent.id);
  const target = parent.exits.find(id => id.startsWith('chamber-'))!;
  p = act(p, { type: 'dungeonMove', room: target });
  const movement = p.log.at(-1)!.text;
  for (const locale of ['ko', 'en', 'ja'] as const) { const message = fantasyDungeonLogText(movement, locale); assert.ok(message); if (locale !== 'ja') assert.doesNotMatch(message, /[ぁ-んァ-ヶ]/); }
  const special = site.rooms.find(room => room.special)!; p.character!.dungeon!.active!.room = special.id; if (!p.character!.dungeon!.sites.oldwatch.revealed.includes(special.id)) p.character!.dungeon!.sites.oldwatch.revealed.push(special.id); p.character!.inventory.herb = 0;
  const error = applyFantasyDungeonAction(p, { type: 'dungeonChoose', choice: 'offer' }).error!;
  for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyDungeonErrorText(error, locale));
});
