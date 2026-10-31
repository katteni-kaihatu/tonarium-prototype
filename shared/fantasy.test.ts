import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DEPARTURE } from './fantasy-frontier-data.ts';
import {fantasyWorldSituationalBonus} from './fantasy-situational.ts';
import {fantasyBodyStatModifiers} from './fantasy-body-diversity.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, fantasyEventEligible, fantasyQuestEligible, fantasySkills, fantasyStats, fantasyTransports, newFantasyProfile, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';
import { FANTASY_BODY_TRAITS, FANTASY_CONTEXT_NAMES, FANTASY_RACE_BODY_TRAITS, fantasyBodyTraits, fantasyContextBonus } from './fantasy-physiology.ts';
import { FANTASY_EVENTS, FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RACES, FANTASY_RACE_FAMILIES, FANTASY_RECIPES, FANTASY_ROUTES } from './fantasy-data.ts';
import type { FantasyAction, FantasyCheckContext, FantasyProfile } from './fantasy.ts';
import { canBuyItem, FANTASY_MAPS, fantasyBuildings, fantasyCraftFacility } from './fantasy-town.ts';
import { fantasyHostileEncounter } from './fantasy-encounters.ts';
import { fantasyMainTrial } from './fantasy-main-trials.ts';
import { FANTASY_FINAL_ISLE_ID } from './fantasy-isle-access.ts';
import { FANTASY_MAP_MERCHANT_EVENT } from './fantasy-map-merchant.ts';
import { fantasyTravelBurden } from './fantasy-travel-burden.ts';
import { fantasyEnvironmentPenalty } from './fantasy-environment.ts';

const high = () => 0.999;
const low = () => 0;
function required<T>(value: T | undefined): T { assert.notEqual(value, undefined); return value!; }
const sameHours = (actual: number, expected: number, label = '') => assert.ok(Math.abs(actual - expected) < 1e-10, `${label}: ${actual} !== ${expected}`);
function action(profile: FantasyProfile, command: FantasyAction, rng = high) {
  const original = structuredClone(profile);
  const result = applyFantasyAction(profile, command, rng);
  assert.deepEqual(profile, original);
  assert.equal(result.error, undefined, `${JSON.stringify(command)}: ${result.error ?? '操作に成功すること'}`);
  assert.notEqual(result.profile, profile);
  assert.equal(result.changed, true);
  assert.equal(result.profile.revision, profile.revision + 1);
  return result.profile;
}
function game(job = 'adventurer') {
  const profile = action(newFantasyProfile(), { type: 'create', name: '旅人', gender: 'female', source: 'human', job });
  profile.character!.birthBonuses = {};
  profile.character!.job = job;
  profile.character!.jobXp[job] = 0;
  profile.character!.hp = fantasyStats(profile.character!).hp;
  profile.character!.mp = fantasyStats(profile.character!).mp;
  profile.character!.inventory['rain-cape'] = 1;
  profile.character!.outfit = 'rain-cape';
  profile.character!.job = job;
  profile.character!.jobXp[job] = 0;
  profile.character!.charted = FANTASY_LOCATIONS.map(location => location.id);
  return profile;
}
function rejected(profile: FantasyProfile, command: FantasyAction) {
  const snapshot = structuredClone(profile);
  const result = applyFantasyAction(profile, command, high);
  assert.ok(result.error);
  assert.equal(result.changed, false);
  assert.equal(result.profile, profile);
  assert.deepEqual(profile, snapshot);
}

test('新規プロフィールは人間を選べる5回の抽選から始まる', () => {
  const p = newFantasyProfile();
  assert.equal(p.character, null);
  assert.deepEqual(p.draft, { remaining: 5, candidate: null, kept: null });
  assert.equal(game().character!.race, 'human');
});

test('抽選は入力を変更せずリビジョンと回数を一度だけ更新する', () => {
  const p = newFantasyProfile();
  const before = structuredClone(p);
  const next = action(p, { type: 'draw' }, low);
  assert.deepEqual(p, before);
  assert.equal(next.draft.remaining, 4);
  assert.ok(FANTASY_RACES.some(r => r.id === next.draft.candidate));
  rejected(next, { type: 'draw' });
});

test('キープは1枠を置換し、見送りは既存のキープを保存する', () => {
  let p = action(newFantasyProfile(), { type: 'draw' }, low);
  const first = p.draft.candidate;
  p = action(p, { type: 'keep' });
  assert.equal(p.draft.kept, first);
  p = action(p, { type: 'draw' }, high);
  p = action(p, { type: 'skip' });
  assert.equal(p.draft.kept, first);
  p = action(p, { type: 'draw' }, high);
  const last = p.draft.candidate;
  p = action(p, { type: 'keep' });
  assert.equal(p.draft.kept, last);
  assert.equal(p.draft.candidate, null);
});

test('5回すべて見送っても人間で作成でき、再読込相当の復元で回数が戻らない', () => {
  let p = newFantasyProfile();
  for (let i = 0; i < 5; i++) {
    p = action(p, { type: 'draw' });
    p = JSON.parse(JSON.stringify(p)) as FantasyProfile;
    p = action(p, { type: 'skip' });
  }
  assert.equal(p.draft.remaining, 0);
  rejected(p, { type: 'draw' });
  assert.equal(action(p, { type: 'create', name: '人間', gender: 'male', source: 'human', job: 'cook' }).character!.race, 'human');
});

test('5番目の候補から直接作成し、固定性別を適用できる', () => {
  const fixed = required(FANTASY_RACES.find(r => r.gender));
  let p = newFantasyProfile();
  p.draft = { remaining: 0, candidate: fixed.id, kept: 'human' };
  p = action(p, { type: 'create', name: '候補', gender: fixed.gender === 'male' ? 'female' : 'male', source: 'candidate', job: 'mage' });
  assert.equal(p.character!.race, fixed.id);
  assert.equal(p.character!.gender, fixed.gender);
  rejected(p, { type: 'draw' });
  rejected(p, { type: 'create', name: '再作成', gender: 'male', source: 'human', job: 'mage' });
});

test('キープから作成でき、存在しない候補やキープでは作成できない', () => {
  const p = newFantasyProfile();
  rejected(p, { type: 'keep' });
  rejected(p, { type: 'skip' });
  rejected(p, { type: 'create', name: '候補なし', gender: 'male', source: 'candidate', job: 'cook' });
  rejected(p, { type: 'create', name: '保存なし', gender: 'male', source: 'kept', job: 'cook' });
  p.draft.kept = 'elf';
  assert.equal(action(p, { type: 'create', name: '森の人', gender: 'female', source: 'kept', job: 'hunter' }).character!.race, 'elf');
});

test('名前・性別・職業・操作種別の不正入力を拒否する', () => {
  for (const name of ['', '   ', 'a'.repeat(25), '改行\n名']) {
    rejected(newFantasyProfile(), { type: 'create', name, gender: 'male', source: 'human', job: 'cook' });
  }
  rejected(newFantasyProfile(), { type: 'create', name: '名前', gender: 'male', source: 'human', job: '__proto__' });
  rejected(newFantasyProfile(), { type: 'create', name: '名前', gender: 'unknown', source: 'human', job: 'cook' } as unknown as FantasyAction);
  rejected(game(), { type: 'explode' } as unknown as FantasyAction);
});

test('syncは状態もリビジョンも変えない', () => {
  const p = game();
  const result = applyFantasyAction(p, { type: 'sync' });
  assert.equal(result.profile, p);
  assert.equal(result.changed, false);
});

test('全種族の能力・最大HP/MP・4つのスキルが計算できる', () => {
  for (const race of FANTASY_RACES) {
    const p = newFantasyProfile();
    p.draft.kept = race.id;
    const c = action(p, { type: 'create', name: race.name, gender: 'female', source: 'kept', job: 'adventurer' }).character!;
    const born = fantasyStats(c); assert.equal(c.hp, born.hp); assert.equal(c.mp, born.mp);
    c.job = 'adventurer'; c.jobXp.adventurer = 0; c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
    const stats = fantasyStats(c);
    assert.equal(c.hp, stats.hp);
    assert.equal(c.mp, stats.mp);
    assert.equal(stats.strength, 10 + (race.modifiers.strength ?? 0) + (fantasyBodyStatModifiers(c).strength??0) + (c.birthBonuses?.strength ?? 0));
    assert.equal(fantasySkills(c).length, 4);
    assert.ok(stats.hp > 0 && stats.mp > 0);
  }
});

test('職業専用能力は該当職業でだけ現れ、転職で熟練を失わない', () => {
  let p = game('cook');
  p.character!.jobXp.cook = 30;
  assert.equal(fantasyStats(p.character!).dexterity, 12);
  assert.equal(fantasyStats(p.character!).charisma, undefined);
  p = action(p, { type: 'job', job: 'leader' });
  assert.ok(fantasyStats(p.character!).charisma);
  assert.equal(fantasyStats(p.character!).dexterity, 12);
  assert.equal(p.character!.lifeJob,'cook');
  p = action(p, { type: 'job', job: 'farmer' });
  assert.equal(p.character!.job,'leader');
  assert.equal(fantasyStats(p.character!).dexterity, undefined);
  p = action(p, { type: 'job', job: 'cook' });
  assert.equal(p.character!.jobXp.cook, 30);
  assert.equal(fantasyStats(p.character!).dexterity, 12);
});

test('徒歩は陸路だけを通り、複数区間の経路と所要時間を返す', () => {
  const c = game().character!;
  const route = required(FANTASY_LOCATIONS.map(l => fantasyTransports(c, l.id).find(t => t.id === 'foot')).find(t => t && t.available && t.path.length >= 3));
  let hours = 0;
  for (let i = 1; i < route.path.length; i++) {
    const edge = required(FANTASY_ROUTES.find(r => r.mode === 'land' && ((r.from === route.path[i - 1] && r.to === route.path[i]) || (r.to === route.path[i - 1] && r.from === route.path[i]))));
    hours += edge.hours;
  }
  sameHours(route.hours, Math.max(1, Math.ceil(hours)) * fantasyTravelBurden(c).multiplier);
  assert.equal(route.cost, 0);
});

test('海を徒歩で渡れず、港間には無料の手伝い船がある', () => {
  const edge = required(FANTASY_ROUTES.find(r => r.mode === 'sea'));
  const c = game().character!;
  c.location = edge.from;
  c.gold = 0;
  const transports = fantasyTransports(c, edge.to);
  const foot = required(transports.find(t => t.id === 'foot'));
  assert.equal(foot.available, false);
  const ship = required(transports.find(t => t.id === 'working-ship'));
  assert.equal(ship.available, true, ship.reason ?? '無料の手伝い船を利用できること');
  assert.equal(ship.cost, 0);
  assert.ok(ship.hours > 0);
});

test('移動はサーバー側の費用と時間を使い、資金不足なら変更しない', () => {
  const p = game();
  const destination = required(FANTASY_LOCATIONS.find(l => fantasyTransports(p.character!, l.id).some(t => t.id === 'carriage' && t.available)));
  const transport = required(fantasyTransports(p.character!, destination.id).find(t => t.id === 'carriage'));
  const before = p.character!;
  const next = action(p, { type: 'travel', destination: destination.id, transport: 'carriage' });
  assert.equal(next.character!.gold, before.gold - transport.cost);
  assert.equal(next.character!.hour, before.hour + transport.hours);
  p.character!.gold = 0;
  rejected(p, { type: 'travel', destination: destination.id, transport: 'carriage' });
  rejected(p, { type: 'travel', destination: '__proto__', transport: 'foot' });
});

test('飛空艇はレベルと資金、転移門は両地点のサービスを検証する', () => {
  const c = game().character!;
  const destination = required(FANTASY_LOCATIONS.find(l => l.id !== c.location));
  let transports = fantasyTransports(c, destination.id);
  assert.equal(required(transports.find(t => t.id === 'airship')).available, false);
  c.level = 3;
  c.gold = 10000;
  transports = fantasyTransports(c, destination.id);
  assert.equal(required(transports.find(t => t.id === 'airship')).available, true);
  const gates = FANTASY_LOCATIONS.filter(l => l.services.includes('gate'));
  assert.ok(gates.length >= 2);
  c.location = gates[0].id;
  const gate = required(fantasyTransports(c, gates[1].id).find(t => t.id === 'gate'));
  assert.equal(gate.available, true);
  assert.equal(gate.hours, .25);
});

test('所持金もHPも乏しい地点で仕事と無料休息が可能', () => {
  let p = game();
  p.character!.location = required(FANTASY_LOCATIONS.find(l => l.kind === 'island')).id;
  p.character!.gold = 0;
  p.character!.hp = 1;
  p.character!.mp = 0;
  p = action(p, { type: 'work' });
  assert.ok(p.character!.gold >= 5);
  p = action(p, { type: 'rest' });
  assert.equal(p.character!.hp, 1 + Math.ceil(fantasyStats(p.character!).hp * 0.2));
  assert.equal(p.character!.mp, Math.ceil(fantasyStats(p.character!).mp * 0.15));
});

test('仕事の失敗でも最低賃金と経験があり、D8と換算DCの内訳を記録する', () => {
  const p = action(game(), { type: 'work' }, () => 0.49);
  assert.ok(p.character!.gold >= 40);
  assert.ok(p.character!.xp > 0);
  assert.match(p.log.map(l => l.text).join('\n'), /d8=\d+、補正.*DC5/);
});

test('経験値によるレベル上昇で最大HP/MPと判定補正が伸びる', () => {
  const p = game();
  p.character!.xp = 29;
  const previous = fantasyStats(p.character!);
  const next = action(p, { type: 'work' });
  assert.equal(next.character!.level, 2);
  assert.ok(fantasyStats(next.character!).hp > previous.hp);
  assert.ok(fantasyStats(next.character!).mp > previous.mp);
});

test('探索で資源と依頼品を確保でき、必要量まで再探索できる', () => {
  const quest = required(FANTASY_QUESTS.find(q => q.id === 'quest-herbalist'));
  let p = game();
  p.character!.location = quest.destination;
  p.character!.quests = [quest.id];
  p.character!.inventory[quest.item] = 0;
  for (let i = 0; i < quest.count; i++) p = action(p, { type: 'explore' });
  assert.ok(p.character!.inventory[quest.item] >= quest.count);
});

test('町の近くで倒れた場合は救助され、依頼と品物を失わない', () => {
  const p = action(game(), { type: 'accept', quest: 'quest-herbalist' });
  p.character!.location = 'greenwood';
  p.character!.hp = 1;
  p.character!.inventory.relic = 1;
  const threat = action(p, { type: 'explore' }, low);
  assert.equal(threat.event, 'encounter-woodland-wolf');
  assert.equal(threat.character!.hp, 1);
  const next = action(threat, { type: 'event', choice: 'fight' }, low);
  assert.equal(next.character!.location, 'hearth');
  assert.ok(next.character!.hp > 0);
  assert.ok(next.character!.inventory.relic >= 1);
  assert.deepEqual(next.character!.quests, p.character!.quests);
  assert.equal(next.event, null);
  assert.equal(next.death, undefined);
  assert.ok(next.character!.gold >= 0);
});

test('依頼の重複受注・未受注・資源不足・二重報酬を拒否する', () => {
  const quest = required(FANTASY_QUESTS.find(q => q.id === 'quest-herbalist'));
  let p = game();
  p.character!.location = quest.giver;
  p = action(p, { type: 'accept', quest: quest.id });
  rejected(p, { type: 'accept', quest: quest.id });
  p.character!.inventory[quest.item] = 0;
  rejected(p, { type: 'complete', quest: quest.id });
  p.character!.inventory[quest.item] = quest.count;
  p.character!.visited.push(quest.destination);
  const gold = p.character!.gold;
  p = action(p, { type: 'complete', quest: quest.id });
  assert.ok(p.character!.gold >= gold + quest.gold);
  assert.equal(p.character!.inventory[quest.item], 0);
  rejected(p, { type: 'complete', quest: quest.id });
  rejected(p, { type: 'accept', quest: quest.id });
});

test('依頼は訪問と依頼人への帰還を必要とする', () => {
  const quest = required(FANTASY_QUESTS.find(q => q.giver !== q.destination));
  const p = game();
  p.character!.quests = [quest.id];
  p.character!.inventory[quest.item] = quest.count;
  p.character!.location = quest.giver;
  p.character!.visited = [quest.giver];
  rejected(p, { type: 'complete', quest: quest.id });
  p.character!.visited.push(quest.destination);
  p.character!.location = quest.destination;
  rejected(p, { type: 'complete', quest: quest.id });
});

test('制作は職業・設備・全材料を検証し、不足時に消費しない', () => {
  const recipe = FANTASY_RECIPES[0];
  const p = game(recipe.job);
  p.character!.inventory = {};
  rejected(p, { type: 'craft', recipe: recipe.id });
  p.character!.inventory = { ...recipe.inputs };
  p.character!.location = required(FANTASY_LOCATIONS.find(l => !l.services.includes('workshop'))).id;
  rejected(p, { type: 'craft', recipe: recipe.id });
  p.character!.location = 'hearth';
  p.character!.job = recipe.job === 'adventurer' ? 'cook' : 'adventurer';
  rejected(p, { type: 'craft', recipe: recipe.id });
});

test('通常制作の失敗は材料を保存し、調理の失敗は材料を消費し、成功は成果物を一度だけ渡す', () => {
  const recipe = required(FANTASY_RECIPES.find(recipe => recipe.job === 'blacksmith'));
  let p = game(recipe.job);
  p.character!.location = required(FANTASY_LOCATIONS.find(place => fantasyBuildings({ location: place.id }).some(building => building.id === fantasyCraftFacility(recipe.job)))).id;
  p.character!.inventory = { ...recipe.inputs };
  p = action(p, { type: 'craft', recipe: recipe.id }, low);
  assert.deepEqual(p.character!.inventory, recipe.inputs);
  p.event = null;
  p = action(p, { type: 'craft', recipe: recipe.id });
  for (const id of Object.keys(recipe.inputs)) assert.equal(p.character!.inventory[id], recipe.output === id ? p.character!.inventory[id] : 0);
  assert.ok(p.character!.inventory[recipe.output] >= recipe.count);
  const cooking = required(FANTASY_RECIPES.find(recipe => recipe.id === 'cook-meal')), cook = game('cook');
  cook.character!.inventory = { ...cooking.inputs };
  const failedCook = action(cook, { type: 'craft', recipe: cooking.id }, low);
  for (const item of Object.keys(cooking.inputs)) assert.equal(failedCook.character!.inventory[item], 0);
  assert.equal(failedCook.character!.inventory[cooking.output] ?? 0, 0);
  assert.equal(failedCook.character!.hour, cook.character!.hour + 3); assert.equal(failedCook.character!.jobXp.cook, 2);
});

test('市場取引は資金・所持品・市場を検証し、売買で無限利益を作らない', () => {
  const item = required(FANTASY_ITEMS.find(item=>item.id==='herb'));
  let p = game('merchant');
  const initial = p.character!.gold;
  p = action(p, { type: 'buy', item: item.id });
  p = action(p, { type: 'sell', item: item.id });
  assert.ok(p.character!.gold <= initial);
  p.character!.gold = 0;
  rejected(p, { type: 'buy', item: item.id });
  rejected(p, { type: 'sell', item: '__proto__' });
  p.character!.inventory[item.id] = 0;
  rejected(p, { type: 'sell', item: item.id });
});

test('消耗品と回復スキルは最大値を超えず、不正な使用では消費しない', () => {
  let p = game();
  rejected(p, { type: 'use', item: 'ore' });
  rejected(p, { type: 'use', item: 'meal' });
  p.character!.hp -= 1;
  p.character!.mp -= 1;
  p = action(p, { type: 'use', item: 'meal' });
  assert.equal(p.character!.hp, fantasyStats(p.character!).hp);
  assert.equal(p.character!.mp, fantasyStats(p.character!).mp);
  const job = required(FANTASY_JOBS.find(j => j.skills.some(s => s.kind === 'active' && s.effect === 'heal')));
  p = game(job.id);
  const skill = required(fantasySkills(p.character!).find(s => s.kind === 'active' && s.effect === 'heal'));
  p.character!.hp = 1;
  p = action(p, { type: 'skill', skill: skill.id });
  assert.equal(p.character!.hp, 1 + skill.power);
  assert.equal(p.character!.mp, fantasyStats(p.character!).mp - skill.mp);
});

test('アクティブスキルはMP・所有権・重複強化を検証する', () => {
  const p = game();
  const skill = required(fantasySkills(p.character!).find(s => s.kind === 'active' && s.effect !== 'heal'));
  p.character!.mp = 0;
  rejected(p, { type: 'skill', skill: skill.id });
  rejected(p, { type: 'skill', skill: 'foreign-skill' });
  p.character!.mp = fantasyStats(p.character!).mp;
  const next = action(p, { type: 'skill', skill: skill.id });
  assert.equal(next.character!.buff?.effect, skill.effect);
  rejected(next, { type: 'skill', skill: skill.id });
});

test('判定強化・報酬強化・移動強化は実際に作用して一度だけ消費される', () => {
  let p = game();
  p.character!.buff = { effect: 'check', power: 10, stat: jobOfForTest(p.character!.job).stat };
  p = action(p, { type: 'work' }, () => 0.49);
  assert.equal(p.character!.buff, null);
  assert.match(p.log.map(l => l.text).join('\n'), /2d8=.*補正\+4/);
  p.event = null;
  p.character!.buff = { effect: 'reward', power: 7 };
  const before = p.character!.gold;
  p = action(p, { type: 'work' });
  assert.ok(p.character!.gold - before >= 21);
  assert.equal(p.character!.buff, null);
  p.event = null;
  const dest = required(FANTASY_LOCATIONS.find(l => fantasyTransports(p.character!, l.id).some(t => t.id === 'foot' && t.available && t.hours > 2)));
  const oldTime = required(fantasyTransports(p.character!, dest.id).find(t => t.id === 'foot')).hours;
  p.character!.buff = { effect: 'travel', power: 2 };
  const multiplier = fantasyTravelBurden(p.character!).multiplier;
  sameHours(required(fantasyTransports(p.character!, dest.id).find(t => t.id === 'foot')).hours, Math.max(1, Math.ceil(oldTime / multiplier - 2 - 1e-10)) * multiplier);
  p = action(p, { type: 'travel', destination: dest.id, transport: 'foot' });
  assert.equal(p.character!.buff, null);
});

function jobOfForTest(id: string) { return required(FANTASY_JOBS.find(j => j.id === id)); }

test('条件に合う職業・種族イベントを等確率で選び、選択まで主要行動を止める', () => {
  for (const job of FANTASY_JOBS) {
    const base = game(job.id);
    const events = FANTASY_EVENTS.filter(e => e.id !== FANTASY_MAP_MERCHANT_EVENT && !fantasyHostileEncounter(e.id) && fantasyEventEligible(base.character!, e));
    assert.equal(FANTASY_EVENTS.filter(event => event.job === job.id).length, job.id === 'unassigned' ? 0 : 3);
    assert.ok(events.length >= 1);
    const seen = new Set<string>();
    for (let i = 0; i < events.length; i++) {
      const values = [0.99, 0, (i + 0.5) / events.length];
      const p = action(game(job.id), { type: 'work' }, () => values.shift() ?? 0.99);
      assert.ok(p.event);
      seen.add(p.event!);
      rejected(p, { type: 'work' });
      rejected(p, { type: 'explore' });
      rejected(p, { type: 'job', job: 'cook' });
    }
    assert.equal(seen.size, events.length);
  }
});

test('イベントは成功報酬・失敗救済を適用し、二重解決できない', () => {
  const event = FANTASY_EVENTS[0];
  const choice = event.choices[0];
  const p = game(event.job);
  p.event = event.id;
  p.character!.buff = { effect: 'check', power: 30 };
  const next = action(p, { type: 'event', choice: choice.id });
  assert.equal(next.event, null);
  assert.ok(next.character!.gold >= p.character!.gold + choice.gold);
  rejected(next, { type: 'event', choice: choice.id });
  p.character!.buff = null;
  p.character!.gold = 0;
  const failed = action(p, { type: 'event', choice: choice.id }, low);
  assert.equal(failed.character!.gold, 0);
  assert.equal(failed.event, null);
  assert.ok(failed.character!.xp > 0);
});

test('全地域に到達でき、全依頼と製法の参照が存在する', () => {
  const reached = new Set(['hearth']);
  for (let i = 0; i < FANTASY_LOCATIONS.length; i++) {
    for (const route of FANTASY_ROUTES) {
      if (reached.has(route.from)) reached.add(route.to);
      if (reached.has(route.to)) reached.add(route.from);
    }
  }
  assert.equal(reached.size, FANTASY_LOCATIONS.length);
  for (const quest of FANTASY_QUESTS) {
    assert.ok(FANTASY_LOCATIONS.some(l => l.id === quest.giver));
    assert.ok(FANTASY_LOCATIONS.some(l => l.id === quest.destination));
    assert.ok(FANTASY_ITEMS.some(i => i.id === quest.item) || FANTASY_MAPS.some(map => map.item === quest.item));
  }
  for (const recipe of FANTASY_RECIPES) {
    assert.ok(FANTASY_JOBS.some(j => j.id === recipe.job));
    for (const id of [...Object.keys(recipe.inputs), recipe.output]) assert.ok(FANTASY_ITEMS.some(i => i.id === id) || FANTASY_MAPS.some(map => map.item === id));
  }
});

test('陸海の連絡旅行は陸路を徒歩で計算し、船賃を海路だけに課す', () => {
  const c = game().character!;
  c.location = 'greenwood';
  c.gold = 1000;
  for (const [id, factor] of [['ship', 0.7], ['working-ship', 2.5]] as const) {
    const transport = required(fantasyTransports(c, 'glass-isle').find(t => t.id === id));
    assert.ok(transport.available, transport.reason ?? '連絡旅行が可能');
    let hours = 0;
    let seaHours = 0;
    let lands = 0;
    for (let i = 1; i < transport.path.length; i++) {
      const from = transport.path[i - 1];
      const to = transport.path[i];
      const edge = required(FANTASY_ROUTES.find(r => r.mode !== 'gate' && ((r.from === from && r.to === to) || (r.to === from && r.from === to))));
      if (edge.mode === 'sea') { seaHours += edge.hours; hours += edge.hours * factor; }
      else { lands++; hours += edge.hours; }
    }
    assert.ok(lands > 0 && seaHours > 0);
    const base = id === 'ship' ? Math.ceil(hours * 4) / 4 : Math.ceil(hours);
    const walkingWeight = hours - seaHours * factor;
    sameHours(transport.hours, base + base * walkingWeight / hours * fantasyTravelBurden(c).penalty);
    assert.equal(transport.cost, id === 'ship' ? Math.ceil(seaHours * 2) : 0);
  }
});

test('全地域から無資金で出発地まで帰還できる', () => {
  for (const location of FANTASY_LOCATIONS) {
    if (location.id === 'hearth') continue;
    let p = game();
    p.character!.location = location.id;
    if(location.id===FANTASY_FINAL_ISLE_ID)p.character!.completed=FANTASY_QUESTS.filter(quest=>quest.chapter!==undefined&&quest.chapter<=17).map(quest=>quest.id);
    // 未開拓地では正規の港を経由し、遠征相当の体力で帰路を確認する。
    if(location.land==='frontier'){p.character!.level=30;p.character!.hp=fantasyStats(p.character!).hp;}
    p.character!.gold = 0;const started=p.character!.hour;
    for(const destination of location.land==='frontier'?[FANTASY_FRONTIER_BASE,FANTASY_FRONTIER_DEPARTURE,'hearth']:['hearth']){
      if(p.character!.location===destination)continue;
      const transport = required(fantasyTransports(p.character!, destination).find(t => t.available && t.cost === 0));
      p=action(p,{type:'travel',destination,transport:transport.id});assert.equal(p.character!.location,destination,location.id);
    }
    assert.equal(p.character!.location, 'hearth', location.id);
    assert.equal(p.character!.gold, 0, location.id);
    assert.ok(p.character!.hour > started);
  }
});

test('全納品依頼を適切な種族と職業で受注・移動・調達・帰還・納品できる', () => {
  for (const quest of FANTASY_QUESTS.filter(quest => !quest.objective && !fantasyMainTrial(quest.id))) {
    let p = game();
    const race = quest.races?.[0] ?? FANTASY_RACES.find(race => quest.families?.includes(race.family))?.id ?? 'human';
    p.character!.race = race;
    if (quest.jobs?.length) { p.character!.job = quest.jobs[0]; p.character!.jobXp[quest.jobs[0]] = 0; }
    const prerequisites = new Set<string>();
    const includePrerequisites = (id: string) => { for (const prior of FANTASY_QUESTS.find(value => value.id === id)?.requiresCompleted ?? []) { if (!prerequisites.has(prior)) { prerequisites.add(prior); includePrerequisites(prior); } } };
    includePrerequisites(quest.id); p.character!.completed = [...prerequisites];
    p.character!.hp = fantasyStats(p.character!).hp;
    p.character!.mp = fantasyStats(p.character!).mp;
    p.character!.location = quest.giver;
    p.character!.visited = [quest.giver];
    const ration = quest.item === 'dried-fish' ? 'jerky' : 'dried-fish';
    p.character!.inventory = { [ration]: 30, 'hp-potion-4': 20, 'fatigue-potion-4': 20, lantern: 1, 'rain-cape': 1,'arcane-bag-3':1 };p.character!.bag='arcane-bag-3';
    const prepareTravel = () => {
      while (p.character!.hunger > 40) p = action(p, { type: 'use', item: ration });
      if (p.character!.fatigue > 40) p = action(p, { type: 'use', item: 'fatigue-potion-4' });
      if (p.character!.hp < fantasyStats(p.character!).hp) p = action(p, { type: 'use', item: 'hp-potion-4' });
    };
    p = action(p, { type: 'accept', quest: quest.id });
    const destination = required(FANTASY_LOCATIONS.find(l => l.id === quest.destination));
    if (!destination.resources.includes(quest.item)) {
      const item = required(FANTASY_ITEMS.find(i => i.id === quest.item) ?? FANTASY_MAPS.find(map => map.item === quest.item));
      const shop = FANTASY_LOCATIONS.filter(location => canBuyItem({ location: location.id }, quest.item)).sort((a, b) => {
        const hours = (id: string) => id === p.character!.location ? 0 : Math.min(...fantasyTransports(p.character!, id).filter(transport => transport.available && !transport.cost).map(transport => transport.hours));
        return hours(a.id) - hours(b.id);
      })[0];
      const source = shop ?? required(FANTASY_LOCATIONS.find(location => location.resources.includes(quest.item)));
      if (p.character!.location !== source.id) {
        prepareTravel();
        const toSource = required(fantasyTransports(p.character!, source.id).find(t => t.available && !t.cost));
        p = action(p, { type: 'travel', destination: source.id, transport: toSource.id });
      }
      if (shop) {
        while (p.character!.gold < item.price * quest.count) { prepareTravel(); p = action(p, { type: 'work' }); }
        const hour = p.character!.hour, localHour = hour % 24;
        if (localHour < 6 || localHour >= 18) {
          rejected(p, { type: 'buy', item: quest.item });
          p = advanceFantasyWorld(p, Math.floor(hour / 24) * 24 + (localHour < 6 ? 6 : 30)).profile;
        }
        for (let i = 0; i < quest.count; i++) p = action(p, { type: 'buy', item: quest.item });
      } else {
        while ((p.character!.inventory[quest.item] ?? 0) < quest.count) p = action(p, { type: 'explore' });
      }
    }
    prepareTravel();
    if (p.character!.location !== quest.destination) {
      const outbound = required(fantasyTransports(p.character!, quest.destination).find(t => t.available && !t.cost));
      p = action(p, { type: 'travel', destination: quest.destination, transport: outbound.id });
    }
    for (let i = 0; (p.character!.inventory[quest.item] ?? 0) < quest.count && i < quest.count; i++) p = action(p, { type: 'explore' });
    assert.ok((p.character!.inventory[quest.item] ?? 0) >= quest.count, quest.id);
    prepareTravel();
    if (p.character!.location !== quest.giver) {
      const inbound = required(fantasyTransports(p.character!, quest.giver).find(t => t.available && !t.cost));
      p = action(p, { type: 'travel', destination: quest.giver, transport: inbound.id });
    }
    p = action(p, { type: 'complete', quest: quest.id });
    assert.ok(p.character!.completed.includes(quest.id));
  }
});

test('加工品を納める依頼でも探索で剣や延べ棒を自動生成しない', () => {
  for (const item of ['blade', 'ingot']) {
    const quest = required(FANTASY_QUESTS.find(q => q.item === item));
    const p = game();
    p.character!.location = quest.destination;
    p.character!.quests = [quest.id];
    p.character!.inventory[item] = 0;
    const next = action(p, { type: 'explore' });
    assert.equal(next.character!.inventory[item], 0);
  }
});

function modifier(profile: FantasyProfile, label: string) {
  const text = required(profile.log.findLast(l => l.text.includes(label) && /d(?:6|8|12|20)[=\[]/.test(l.text))).text;
  return Number(required(text.match(/補正([+-]\d+)/)?.[1]));
}

test('全アクティブスキルのpowerが回復・判定・防護・移動へ実際に作用する', () => {
  const owners = [
    ...FANTASY_RACES.map(race => ({ race: race.id, job: 'adventurer', skill: race.skills[1] })),
    ...FANTASY_JOBS.filter(job => job.skills.length > 1).map(job => ({ race: 'human', job: job.id, skill: job.skills[1] })),
  ];
  for (const owner of owners) {
    const skill = owner.skill;
    if(skill.retired||skill.utility||skill.restore)continue;
    const p = game(owner.job);
    const c = p.character!;
    c.race = owner.race;
    if (skill.effect === 'check' && owner.race !== 'human') {
      c.job = FANTASY_JOBS.find(j => j.stat === skill.stat)?.id ?? c.job;
    }
    c.hp = fantasyStats(c).hp;
    c.mp = fantasyStats(c).mp;
    if (skill.effect === 'heal') c.hp = 1;
    if (skill.effect === 'guard') c.location = 'ashpeak';
    let command: FantasyAction = { type: 'work' };
    let label = `${jobOfForTest(c.job).name}の仕事`;
    if (skill.effect === 'check' && skill.stat === 'luck') {
      c.location = 'greenwood'; command = { type: 'explore' }; label = '発見運';
    }
    if (skill.effect === 'check' && skill.stat === 'vitality') {
      c.location = 'deepcave'; command = { type: 'explore' }; label = '青晶の洞窟の探索';
    }
    if (skill.effect === 'check' && skill.stat !== jobOfForTest(c.job).stat && !['luck', 'vitality'].includes(skill.stat ?? '')) {
      const event = required(FANTASY_EVENTS.find(e => e.job === c.job && e.choices.some(choice => choice.stat === skill.stat)));
      const choice = required(event.choices.find(choice => choice.stat === skill.stat));
      p.event = event.id; command = { type: 'event', choice: choice.id }; label = event.name;
    }
    const boosted = action(p, { type: 'skill', skill: skill.id });
    assert.equal(boosted.character!.mp, c.mp - skill.mp, skill.id);
    if (skill.effect === 'heal') {
      assert.equal(boosted.character!.hp, Math.min(fantasyStats(c).hp, 1 + skill.power), skill.id);
    } else if (skill.effect === 'check') {
      const baseline = action(p, command);
      const result = action(boosted, command);
      const cap = command.type === 'work' ? 4 : Infinity;
      assert.equal(modifier(result, label) - modifier(baseline, label), Math.min(cap, modifier(baseline, label) + skill.power) - modifier(baseline, label), skill.id);
      assert.equal(result.character!.buff, null, skill.id);
    } else if (skill.effect === 'guard') {
      const plainThreat = action(p, { type: 'explore' }, low);
      const guardedThreat = action(boosted, { type: 'explore' }, low);
      assert.equal(plainThreat.event, 'encounter-goblin', skill.id);
      assert.equal(guardedThreat.event, plainThreat.event, skill.id);
      assert.ok(guardedThreat.character!.buff, skill.id);
      const baseline = action(plainThreat, { type: 'event', choice: 'fight' }, low);
      const result = action(guardedThreat, { type: 'event', choice: 'fight' }, low);
      assert.equal(result.character!.hp - baseline.character!.hp, Math.min(skill.power, c.hp - baseline.character!.hp), skill.id);
      assert.equal(result.character!.buff, null, skill.id);
    } else if (skill.effect === 'travel') {
      const baseline = required(fantasyTransports(c, 'deepcave').find(t => t.id === 'foot'));
      const result = required(fantasyTransports(boosted.character!, 'deepcave').find(t => t.id === 'foot'));
      const multiplier = fantasyTravelBurden(c).multiplier;
      sameHours(result.hours, Math.max(1, Math.ceil(baseline.hours / multiplier - skill.power - 1e-10)) * multiplier, skill.id);
    } else if (skill.effect === 'reward') {
      const baseline = action(p, { type: 'work' });
      const result = action(boosted, { type: 'work' });
      assert.equal(result.character!.gold - baseline.character!.gold, skill.power, skill.id);
    }
  }
});

test('全パッシブの判定・防護・報酬・移動効果を適用する', () => {
  const owners = [
    ...FANTASY_RACES.map(race => ({ race: race.id, job: 'adventurer', skill: race.skills[0] })),
    ...FANTASY_JOBS.filter(job => job.skills.length > 0).map(job => ({ race: 'human', job: job.id, skill: job.skills[0] })),
  ];
  for (const owner of owners) {
    const p = game(owner.job);
    const c = p.character!;
    c.race = owner.race;
    if (owner.skill.effect === 'check' && owner.race !== 'human') c.job = FANTASY_JOBS.find(j => j.stat === owner.skill.stat)?.id ?? c.job;
    if (owner.skill.id === 'human-adapt') c.job = 'mage';
    c.hp = fantasyStats(c).hp;
    c.mp = fantasyStats(c).mp;
    const effects = fantasySkills(c).filter(s => s.kind === 'passive');
    if (owner.skill.effect === 'reward') {
      const sum = effects.filter(s => s.effect === 'reward').reduce((n, s) => n + s.power, 0);
      const result = action(p, { type: 'work' });
      assert.equal(result.character!.gold - c.gold, 14 + sum, owner.skill.id);
    } else if (owner.skill.effect === 'guard') {
      c.location = 'ashpeak';
      const sum = effects.filter(s => s.effect === 'guard').reduce((n, s) => n + s.power, 0);
      const threat = action(p, { type: 'explore' }, low);
      assert.equal(threat.event, 'encounter-goblin', owner.skill.id);
      const incoming = 8 + required(FANTASY_LOCATIONS.find(place => place.id === c.location)).danger * 3;
      const expected = Math.max(0, incoming - sum - Math.max(0, Math.floor((fantasyStats(c).vitality - 10) / 2)));
      assert.equal(c.hp - action(threat, { type: 'event', choice: 'fight' }, low).character!.hp, expected, owner.skill.id);
    } else if (owner.skill.effect === 'travel') {
      const sum = effects.filter(s => s.effect === 'travel').reduce((n, s) => n + s.power, 0);
      const foot = required(fantasyTransports(c, 'greenwood').find(t => t.id === 'foot'));
      sameHours(foot.hours, Math.max(1, 2 - sum) * fantasyTravelBurden(c).multiplier, owner.skill.id);
    } else if (owner.skill.effect === 'check') {
      const stat = owner.skill.stat ?? jobOfForTest(c.job).stat;
      const sum = effects.filter(s => s.effect === 'check' && (!s.stat || s.stat === stat)).reduce((n, s) => n + s.power, 0);
      let expected = Math.floor(((fantasyStats(c)[stat] ?? 10) - 10) / 2) + sum;
      if (stat === 'vitality') {
        c.location = 'deepcave';
        if (FANTASY_RACES.find(r => r.id === c.race)?.affinity.includes('cave')) expected += 2;
        expected -= fantasyEnvironmentPenalty(c);
        const result = action(p, { type: 'explore' });
        assert.equal(modifier(result, '青晶の洞窟の探索'), expected, owner.skill.id);
      } else if (stat === 'luck') {
        c.location = 'greenwood';
        expected+=fantasyWorldSituationalBonus(c,'forest','explore',stat);
        const result = action(p, { type: 'explore' });
        assert.equal(modifier(result, '発見運'), expected, owner.skill.id);
      } else if (stat === jobOfForTest(c.job).stat) {
        const result = action(p, { type: 'work' });
        assert.equal(modifier(result, `${jobOfForTest(c.job).name}の仕事`), Math.max(-4, Math.min(4, expected+fantasyWorldSituationalBonus(c,FANTASY_LOCATIONS.find(place=>place.id===c.location)!.kind,'work',stat))), owner.skill.id);
      } else {
        const event = required(FANTASY_EVENTS.find(event => event.job === c.job && event.choices.some(choice => choice.stat === stat)));
        const choice = required(event.choices.find(choice => choice.stat === stat));
        p.event = event.id;
        expected += choice.context ? fantasyContextBonus(c, choice.context) : 0;
        const result = action(p, { type: 'event', choice: choice.id });
        assert.equal(modifier(result, event.name), expected, owner.skill.id);
      }
    }
  }
});

test('カタログのID・参照・経路・重み・数値・イベント対応を一括検証する', () => {
  const catalogs = [FANTASY_RACES, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_ITEMS, FANTASY_RECIPES, FANTASY_QUESTS, FANTASY_EVENTS];
  for (const catalog of catalogs) {
    assert.equal(new Set(catalog.map(v => v.id)).size, catalog.length);
    for (const entry of catalog) assert.match(entry.id, /^[a-z0-9][a-z0-9-]{0,79}$/);
  }
  const skills = [...FANTASY_RACES, ...FANTASY_JOBS].flatMap(v => v.skills);
  assert.equal(new Set(skills.map(s => s.id)).size, skills.length);
  for (const skill of skills) {
    assert.ok(skill.description.trim());
    assert.ok(Number.isSafeInteger(skill.power) && skill.power > 0);
    assert.ok(Number.isSafeInteger(skill.mp) && skill.mp >= 0);
  }
  assert.ok(Math.abs(FANTASY_RACES.reduce((n, r) => n + r.weight, 0) - 100) < 1e-9);
  for (const race of FANTASY_RACES) {
    assert.ok(race.weight > 0 && Number.isFinite(race.weight));
    assert.ok(Object.values(race.modifiers).every(Number.isSafeInteger));
  }
  const routes = new Set<string>();
  for (const route of FANTASY_ROUTES) {
    const from = required(FANTASY_LOCATIONS.find(l => l.id === route.from));
    const to = required(FANTASY_LOCATIONS.find(l => l.id === route.to));
    const key = [from.id, to.id].sort().join('/') + '/' + route.mode;
    assert.ok(!routes.has(key), key); routes.add(key);
    assert.notEqual(from.id, to.id);
    assert.ok(route.mode === 'gate' ? route.hours === .25 : Number.isFinite(route.hours) && route.hours > 0 && Number.isSafeInteger(route.hours * 4));
    if (route.mode === 'sea') assert.ok(from.services.includes('port') && to.services.includes('port'), key);
    if (route.mode === 'gate') assert.ok(from.services.includes('gate') && to.services.includes('gate'), key);
    if (route.mode === 'land') assert.equal(from.land, to.land, key);
  }
  for (const location of FANTASY_LOCATIONS) {
    for (const id of location.resources) assert.ok(FANTASY_ITEMS.some(i => i.id === id));
    assert.ok(Number.isSafeInteger(location.danger) && location.danger >= 0);
  }
  for (const job of FANTASY_JOBS) assert.deepEqual(new Set(job.eventIds), new Set(FANTASY_EVENTS.filter(e => e.job === job.id).map(e => e.id)));
  for (const event of FANTASY_EVENTS) {
    if (event.job) assert.ok(FANTASY_JOBS.some(j => j.id === event.job));
    if (event.races) for (const id of event.races) assert.ok(FANTASY_RACES.some(race => race.id === id));
    if (event.families) for (const id of event.families) assert.ok(FANTASY_RACE_FAMILIES.some(family => family.id === id));
    if (event.locations) for (const id of event.locations) assert.ok(FANTASY_LOCATIONS.some(location => location.id === id));
    assert.equal(new Set(event.choices.map(c => c.id)).size, event.choices.length);
    if (event.id === FANTASY_MAP_MERCHANT_EVENT) assert.equal(event.choices.length, 1);
    for (const choice of event.choices) {
      if (event.id === FANTASY_MAP_MERCHANT_EVENT) {
        assert.equal(choice.id, 'leave');
        assert.equal(choice.dc, 0);
        assert.equal(choice.gold, 0);
        assert.equal(choice.item, undefined);
        assert.equal(choice.context, undefined);
      } else assert.ok(Number.isSafeInteger(choice.dc) && choice.dc > 0);
      assert.ok(Number.isSafeInteger(choice.gold) && choice.gold >= 0);
      if (choice.item) assert.ok(FANTASY_ITEMS.some(i => i.id === choice.item));
      if (choice.context) assert.ok(Object.hasOwn(FANTASY_CONTEXT_NAMES, choice.context));
    }
  }
  for (const quest of FANTASY_QUESTS) {
    if (quest.races) for (const id of quest.races) assert.ok(FANTASY_RACES.some(race => race.id === id));
    if (quest.families) for (const id of quest.families) assert.ok(FANTASY_RACE_FAMILIES.some(family => family.id === id));
    for (const field of [quest.names, quest.descriptions]) if (field) for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(field[locale]);
  }
  for (const item of FANTASY_ITEMS) {
    assert.ok(Number.isSafeInteger(item.price) && item.price >= 0, item.id);
    if (item.price === 0) { assert.ok(['guild-loan', 'rank-skill-book'].includes(item.category ?? ''), item.id); assert.equal(item.craftOnly, true, item.id); }
  }
  for (const recipe of FANTASY_RECIPES) {
    assert.ok(Number.isSafeInteger(recipe.count) && recipe.count > 0);
    for (const count of Object.values(recipe.inputs)) assert.ok(Number.isSafeInteger(count) && count > 0);
  }
});

test('未知IDやprototype名は全操作で拒否し、入力とprototypeを変更しない', () => {
  for (const id of ['missing-id', '__proto__', 'constructor', 'prototype']) {
    const p = game();
    for (const command of [
      { type: 'travel', destination: id, transport: 'foot' }, { type: 'travel', destination: 'greenwood', transport: id },
      { type: 'accept', quest: id }, { type: 'complete', quest: id }, { type: 'craft', recipe: id },
      { type: 'buy', item: id }, { type: 'sell', item: id }, { type: 'use', item: id },
      { type: 'skill', skill: id }, { type: 'event', choice: id }, { type: 'job', job: id },
    ] as FantasyAction[]) rejected(p, command);
    const fresh = newFantasyProfile();
    fresh.draft.kept = id;
    rejected(fresh, { type: 'create', name: '不明種族', gender: 'male', source: 'kept', job: 'adventurer' });
    const corrupt = game();
    corrupt.character!.location = id;
    rejected(corrupt, { type: 'work' });
  }
  assert.equal(Object.getPrototypeOf(game().character!.inventory), Object.prototype);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('未解決イベント中は旅行・取引・依頼・転職・制作を実行できない', () => {
  const p = game('cook');
  p.event = 'cook-contest';
  for (const command of [
    { type: 'travel', destination: 'greenwood', transport: 'foot' },
    { type: 'sell', item: 'herb' }, { type: 'buy', item: 'herb' },
    { type: 'accept', quest: FANTASY_QUESTS[0].id }, { type: 'complete', quest: FANTASY_QUESTS[0].id },
    { type: 'craft', recipe: FANTASY_RECIPES[0].id }, { type: 'job', job: 'merchant' },
  ] as FantasyAction[]) rejected(p, command);
  assert.equal(action(p, { type: 'rest' }).event, 'cook-contest');
});

test('レベル4の基礎能力成長でも現在HP/MPが新しい最大値と整合する', () => {
  for (const race of FANTASY_RACES) {
    const p = game();
    const c = p.character!;
    c.race = race.id;
    c.level = 3;
    c.xp = 89;
    const before = fantasyStats(c);
    c.hp = before.hp - 1;
    c.mp = before.mp - 1;
    const next = action(p, { type: 'work' });
    const after = fantasyStats(next.character!);
    assert.equal(next.character!.level, 4, race.id);
    assert.equal(next.character!.hp, after.hp - 1, race.id);
    assert.equal(next.character!.mp, after.mp - 1, race.id);
    assert.equal(after.strength, before.strength + 1, race.id);
  }
});

test('46下位種族は15系統と三言語の正式名称を持ち、既存39IDを保持する', () => {
  assert.equal(FANTASY_RACES.length, 51);
  assert.equal(FANTASY_RACE_FAMILIES.length, 15);
  assert.equal(new Set(FANTASY_RACE_FAMILIES.map(f => f.id)).size, FANTASY_RACE_FAMILIES.length);
  for (const family of FANTASY_RACE_FAMILIES) {
    assert.ok(FANTASY_RACES.some(r => r.family === family.id), family.id);
    assert.equal(family.name, family.names.ja);
    assert.ok(family.description.trim());
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(family.names[locale].trim());
  }
  for (const race of FANTASY_RACES) {
    assert.ok(FANTASY_RACE_FAMILIES.some(f => f.id === race.family), race.id);
    assert.equal(race.name, race.names.ja);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(race.names[locale].trim(), `${race.id}/${locale}`);
    assert.ok(Number.isFinite(race.weight) && race.weight > 0);
    if (race.id !== 'human') {
      assert.ok(Object.values(race.modifiers).some(v => v > 0), race.id);
      assert.ok(Object.values(race.modifiers).some(v => v < 0), race.id);
    }
    if (!['dryad', 'stoneborn'].includes(race.id)) assert.equal(race.gender, undefined, race.id);
  }
  for (const id of [
    'human', 'elf', 'dwarf', 'orc', 'halfling', 'foxkin', 'tideborn', 'dragonblood', 'starfairy', 'dryad', 'stoneborn', 'moonshadow',
    'wolfkin', 'catkin', 'rabbitkin', 'bearkin', 'birdkin', 'lizardkin', 'high-elf', 'dark-elf', 'snow-elf', 'hill-dwarf', 'deep-dwarf',
    'vampire-night', 'vampire-crimson', 'vampire-moon', 'frost-dragonkin', 'storm-dragonkin', 'fire-spirit', 'water-spirit', 'flower-fairy',
    'clockwork-golem', 'gnome', 'goblin', 'hobgoblin', 'coralborn', 'celestial', 'devilkin', 'revenant',
  ]) {
    assert.ok(FANTASY_RACES.some(r => r.id === id), id);
  }
  assert.equal(FANTASY_RACES.find(r => r.id === 'dryad')!.gender, 'female');
  assert.equal(FANTASY_RACES.find(r => r.id === 'stoneborn')!.gender, 'none');
  assert.equal(FANTASY_RACES.find(r => r.id === 'foxkin')!.family, 'beastfolk');
  assert.equal(FANTASY_RACES.filter(r => r.family === 'vampire').length, 3);
  assert.equal(FANTASY_RACES.filter(r => r.family === 'elf').length, 4);
});

test('小数の抽選率もすべての下位種族を選び、系統合計と全体合計が一致する', () => {
  let offset = 0;
  const total = FANTASY_RACES.reduce((sum, race) => sum + race.weight, 0);
  for (const race of FANTASY_RACES) {
    const ticket = (offset + race.weight / 2) / total;
    const profile = action(newFantasyProfile(), { type: 'draw' }, () => ticket);
    assert.equal(profile.draft.candidate, race.id);
    assert.equal(profile.draft.remaining, 4);
    offset += race.weight;
  }
  const familyTotal = FANTASY_RACE_FAMILIES.reduce((sum, family) => sum + FANTASY_RACES.filter(r => r.family === family.id).reduce((n, r) => n + r.weight, 0), 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
  assert.ok(Math.abs(familyTotal - total) < 1e-9);
  assert.ok(FANTASY_RACES.some(r => r.weight < 1));
});

test('新規キャラクターは旧職業指定を含めても必ず無職から始まる', () => {
  for (const job of [undefined, ...FANTASY_JOBS.map(job => job.id)]) {
    const p = action(newFantasyProfile(), { type: 'create', name: '新しい旅人', gender: 'male', source: 'human', ...(job ? { job } : {}) });
    assert.equal(p.character!.job, 'unassigned');
    assert.deepEqual(p.character!.jobXp, { unassigned: 0 });
    assert.equal(fantasySkills(p.character!).length, 2);
  }
});

test('無職は職業専用事件を持たないが、無料の品賃と種族事件には参加できる', () => {
  const p = action(newFantasyProfile(), { type: 'create', name: '旅人', gender: 'female', source: 'human' });
  let rolls = 0;
  const next = action(p, { type: 'work' }, () => { rolls++; return 0; });
  assert.equal(next.character!.gold, p.character!.gold + 5);
  assert.ok(FANTASY_EVENTS.some(event => event.id === next.event && !event.job && fantasyEventEligible(next.character!, event)));
  assert.equal(rolls, 3);
  const job = required(FANTASY_JOBS.find(job => job.id === 'unassigned'));
  assert.equal(job.category, 'none');
  assert.deepEqual(job.skills, []);
  assert.deepEqual(job.eventIds, []);
});

test('ギルドは通常職だけを許可し、職業取得は1時間を消費する', () => {
  const p = action(newFantasyProfile(), { type: 'create', name: '旅人', gender: 'male', source: 'human' });
  const next = action(p, { type: 'job', job: 'cook', via: 'guild' });
  assert.equal(next.character!.job, 'unassigned');assert.equal(next.character!.lifeJob,'cook');
  assert.equal(next.character!.hour, p.character!.hour + 1);
  assert.equal(next.character!.fatigue, 3);
  for (const job of FANTASY_JOBS.filter(job => job.category === 'crime')) rejected(p, { type: 'job', job: job.id, via: 'guild' });
  rejected(p, { type: 'job', job: 'unassigned', via: 'gm' });
  rejected(p, { type: 'job', job: 'cook', via: 'invalid' } as unknown as FantasyAction);
});

test('NPCの指導は本人の所在地・実在する建物・専門を検証する', () => {
  const p = game('unassigned');
  p.character!.location = 'emberhall';
  const taught = action(p, { type: 'job', job: 'blacksmith', via: 'npc', npcId: 'borin' });
  assert.equal(taught.character!.job, 'unassigned');assert.equal(taught.character!.lifeJob,'blacksmith');
  rejected(p, { type: 'job', job: 'mage', via: 'npc', npcId: 'borin' });
  rejected(p, { type: 'job', job: 'merchant', via: 'npc', npcId: 'rin' });
  rejected(p, { type: 'job', job: 'blacksmith', via: 'npc', npcId: 'missing-npc' });
  rejected(p, { type: 'job', job: 'blacksmith', via: 'npc' });
  rejected(p, { type: 'job', job: 'blacksmith', via: 'guild', npcId: 'borin' });
  p.character!.location = 'hearth';
  assert.equal(action(p, { type: 'job', job: 'merchant', via: 'npc', npcId: 'rin' }).character!.lifeJob, 'merchant');
});

test('GM経路の明示取得は登録犯罪職にも対応し、6職各3事件がある', () => {
  const crimes = FANTASY_JOBS.filter(job => job.category === 'crime');
  assert.equal(crimes.length, 6);
  assert.equal(FANTASY_JOBS.length, 39);
  assert.equal(FANTASY_EVENTS.filter(event => event.job !== undefined).length, 114);
  for (const job of FANTASY_JOBS) for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(job.names[locale]);
  for (const job of crimes) {
    const p = game('unassigned'); p.character!.location = 'greenwood';
    const acquired = action(p, { type: 'job', job: job.id, via: 'gm' });
    assert.equal(acquired.character!.job, job.id);
    assert.equal(job.skills.length, ({ thief: 12, smuggler: 11, assassin: 13, bandit: 12, spy: 11, crimeboss: 11 } as Record<string, number>)[job.id]);
    assert.equal(job.eventIds.length, 3);
    assert.equal(FANTASY_EVENTS.filter(event => event.job === job.id).length, 3);
    assert.ok(action(acquired, { type: 'work' }).character!.gold > p.character!.gold);
  }
});

test('伝説7種族の合計確率は0.36%で、巨神の確率は人間に戻る', () => {
  const ids = ['demigod', 'true-dragon', 'elder-dragon', 'archangel', 'archdemon', 'phoenix', 'voidborn'];
  const races = ids.map(id => required(FANTASY_RACES.find(race => race.id === id)));
  assert.ok(Math.abs(races.reduce((sum, race) => sum + race.weight, 0) - 0.36) < 1e-9);
  for (const race of races) {
    assert.equal(race.rarity, '伝説');
    assert.ok(race.weight >= 0.01 && race.weight <= 0.08);
    assert.ok(Object.values(race.modifiers).filter(value => value < 0).length >= 2);
    assert.ok(Object.values(race.modifiers).some(value => value >= 6));
  }
  assert.equal(FANTASY_RACES.find(race => race.id === 'human')!.weight, 17.64);
  assert.ok(!FANTASY_RACES.some(race => race.id === 'titan'));
  assert.ok(!FANTASY_RACE_FAMILIES.some(family => family.id === 'ancient'));
});

test('全46種族の体形特性は三言語・既知の文脈・小さな整数補正を持つ', () => {
  assert.deepEqual(new Set(Object.keys(FANTASY_RACE_BODY_TRAITS)), new Set(FANTASY_RACES.map(race => race.id)));
  assert.equal(new Set(FANTASY_BODY_TRAITS.map(trait => trait.id)).size, FANTASY_BODY_TRAITS.length);
  for (const race of FANTASY_RACES) {
    const traits = fantasyBodyTraits({ race: race.id });
    assert.ok(traits.length > 0, race.id);
    for (const trait of traits) {
      for (const locale of ['ko', 'en', 'ja'] as const) {
        assert.ok(trait.names[locale]); assert.ok(trait.descriptions[locale]);
      }
      for (const [context, amount] of Object.entries(trait.modifiers)) {
        assert.ok(Object.hasOwn(FANTASY_CONTEXT_NAMES, context));
        assert.ok(Number.isInteger(amount) && Math.abs(amount) <= 4);
      }
    }
    for (const context of Object.keys(FANTASY_CONTEXT_NAMES) as FantasyCheckContext[]) assert.ok(Math.abs(fantasyContextBonus({ race: race.id }, context)) <= 5);
  }
  for (const id of ['missing', '__proto__', 'constructor']) {
    assert.deepEqual(fantasyBodyTraits({ race: id }), []);
    assert.equal(fantasyContextBonus({ race: id }, 'trap'), 0);
  }
  assert.equal(fantasyContextBonus({ race: 'human' }, '__proto__' as FantasyCheckContext), 0);
});

test('小さな体と柔軟性は狭い隙間の実際のd20判定に加算され、重量は不利になる', () => {
  for (const raceId of ['human', 'halfling', 'catkin', 'stoneborn']) {
    const p = game('unassigned');
    p.character!.race = raceId; p.character!.location = 'deepcave';
    p.character!.hp = fantasyStats(p.character!).hp; p.character!.mp = fantasyStats(p.character!).mp;
    const expected = Math.floor((fantasyStats(p.character!).agility - 10) / 2)
      + fantasySkills(p.character!).filter(skill => skill.kind === 'passive' && skill.effect === 'check' && (!skill.stat || skill.stat === 'agility')).reduce((sum, skill) => sum + skill.power, 0)
      + fantasyContextBonus(p.character!, 'narrow-space') - fantasyEnvironmentPenalty(p.character!);
    const next = action(p, { type: 'explore' });
    assert.equal(modifier(next, FANTASY_CONTEXT_NAMES['narrow-space'].ja), expected, raceId);
  }
  assert.ok(fantasyContextBonus({ race: 'halfling' }, 'narrow-space') > 0);
  assert.ok(fantasyContextBonus({ race: 'catkin' }, 'narrow-space') > 0);
  assert.ok(fantasyContextBonus({ race: 'stoneborn' }, 'narrow-space') < 0);
});

test('同じ出目でも小柄な種族は隙間を抜け、追加資源を得られる', () => {
  const p = game('unassigned'); p.character!.location = 'deepcave';
  p.character!.inventory['everglow-lantern'] = 1;
  const small = structuredClone(p); small.character!.race = 'halfling';
  const human = action(p, { type: 'explore' }, () => 0.6);
  const halfling = action(small, { type: 'explore' }, () => 0.6);
  assert.match(human.log.find(log => log.text.startsWith(FANTASY_CONTEXT_NAMES['narrow-space'].ja))!.text, /失敗$/);
  assert.match(halfling.log.find(log => log.text.startsWith(FANTASY_CONTEXT_NAMES['narrow-space'].ja))!.text, /成功$/);
  assert.equal(halfling.character!.inventory.crystal, (human.character!.inventory.crystal ?? 0) + 1);
});

test('翼や水生体質には利点と弱点があり、通常の交通条件を飛び越えない', () => {
  assert.ok(fantasyContextBonus({ race: 'birdkin' }, 'high-place') > 0);
  assert.ok(fantasyContextBonus({ race: 'birdkin' }, 'deep-water') < 0);
  assert.ok(fantasyContextBonus({ race: 'tideborn' }, 'deep-water') > 0);
  assert.ok(fantasyContextBonus({ race: 'tideborn' }, 'heat') < 0);
  assert.ok(fantasyContextBonus({ race: 'fire-spirit' }, 'heat') > 0);
  assert.ok(fantasyContextBonus({ race: 'fire-spirit' }, 'cold') < 0);
  for (const race of ['birdkin', 'true-dragon', 'archangel', 'tideborn']) {
    const p = game('unassigned'); p.character!.race = race;
    const transports = fantasyTransports(p.character!, 'glass-isle');
    assert.equal(transports.find(transport => transport.id === 'foot')?.available, false);
    assert.equal(transports.find(transport => transport.id === 'airship')?.available, false);
  }
});

test('全種族に職業に依存しない専用事件があり、他種族の事件は実行できない', () => {
  const racial = FANTASY_EVENTS.filter(event => !event.job && (event.races?.length || event.families?.length));
  assert.ok(racial.length >= FANTASY_RACES.length);
  assert.equal(FANTASY_EVENTS.filter(event => event.job).length, 114);
  for (const race of FANTASY_RACES) {
    const p = game('unassigned');
    p.character!.race = race.id;
    p.character!.hp = fantasyStats(p.character!).hp; p.character!.mp = fantasyStats(p.character!).mp;
    const pair = FANTASY_LOCATIONS.flatMap(place => racial.filter(event => fantasyEventEligible({ ...p.character!, location: place.id }, event)).map(event => ({ place, event })))[0];
    assert.ok(pair, race.id);
    p.character!.location = pair.place.id;
    p.event = pair.event.id;
    const choice = required(pair.event.choices.find(choice => choice.context));
    const next = action(p, { type: 'event', choice: choice.id });
    assert.equal(next.event, null);
    assert.ok(next.log.some(log => log.text.includes('d20=')), race.id);
    const wrong = game('unassigned');
    if (!fantasyEventEligible(wrong.character!, pair.event)) {
      wrong.event = pair.event.id;
      rejected(wrong, { type: 'event', choice: choice.id });
    }
  }
});

test('種族事件の文脈補正はスキルや基礎能力と同時に判定へ適用される', () => {
  const p = game('unassigned'); p.character!.race = 'halfling';
  const event = required(FANTASY_EVENTS.find(event => !event.job && fantasyEventEligible(p.character!, event)));
  const choice = required(event.choices.find(choice => choice.context));
  p.event = event.id;
  p.character!.buff = { effect: 'check', power: 4, stat: choice.stat };
  const expected = Math.floor(((fantasyStats(p.character!)[choice.stat] ?? 10) - 10) / 2)
    + fantasySkills(p.character!).filter(skill => skill.kind === 'passive' && skill.effect === 'check' && (!skill.stat || skill.stat === choice.stat)).reduce((sum, skill) => sum + skill.power, 0)
    + fantasyContextBonus(p.character!, choice.context!) + 4;
  const next = action(p, { type: 'event', choice: choice.id });
  assert.equal(modifier(next, event.name), expected);
  assert.equal(next.character!.buff, null);
});

test('神殿・魔族の依頼は該当種族だけに許可し、他種族の偽造達成を拒否する', () => {
  const quests = FANTASY_QUESTS.filter(quest => quest.races || quest.families);
  assert.ok(quests.length >= 6);
  assert.ok(quests.some(quest => quest.building === 'temple'));
  for (const quest of quests) {
    const race = required(FANTASY_RACES.find(race => fantasyQuestEligible({ race: race.id, job: 'unassigned', location: quest.giver }, quest)));
    const p = game('unassigned'); p.character!.race = race.id; p.character!.location = quest.giver;
    p.character!.hp = fantasyStats(p.character!).hp; p.character!.mp = fantasyStats(p.character!).mp;
    const accepted = action(p, { type: 'accept', quest: quest.id });
    accepted.character!.visited.push(quest.destination);
    accepted.character!.inventory[quest.item] = quest.count;
    const done = action(accepted, { type: 'complete', quest: quest.id });
    assert.ok(done.character!.completed.includes(quest.id));
    rejected(done, { type: 'complete', quest: quest.id });
    const wrong = game('unassigned'); wrong.character!.location = quest.giver;
    if (!fantasyQuestEligible(wrong.character!, quest)) {
      rejected(wrong, { type: 'accept', quest: quest.id });
      wrong.character!.quests = [quest.id]; wrong.character!.inventory[quest.item] = quest.count; wrong.character!.visited.push(quest.destination);
      rejected(wrong, { type: 'complete', quest: quest.id });
    }
  }
});

test('種族事件も共通時計の予約が終わるまで結果や報酬を確定しない', () => {
  const p = game('unassigned');
  const event = required(FANTASY_EVENTS.find(event => !event.job && fantasyEventEligible(p.character!, event)));
  p.event = event.id;
  const reserved = startFantasyActivity(p, { type: 'event', choice: event.choices[0].id }, p.character!.hour, high).profile;
  assert.ok(reserved.activity);
  assert.equal(reserved.character!.gold, p.character!.gold);
  const partial = advanceFantasyWorld(reserved, p.character!.hour + 1).profile;
  assert.equal(partial.event, event.id);
  const done = advanceFantasyWorld(partial, p.character!.hour + 2).profile;
  assert.equal(done.activity, undefined);
  assert.equal(done.event, null);
});
